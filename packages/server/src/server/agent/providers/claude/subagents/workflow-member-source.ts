import type { AgentTimelineItem } from "../../../agent-sdk-types.js";
import type { ProviderSubagentStatus } from "../../../provider-subagents/store.js";
import type { SubagentObservation } from "./observation.js";
import type { ClaudeReplayEntry } from "./replay-source.js";
import {
  claudeWorkflowMemberId,
  claudeWorkflowMemberTranscript,
  convertClaudeWorkflowMemberEntry,
  declareClaudeWorkflowMember,
  isShownClaudeWorkflowMemberEntry,
  parseClaudeWorkflowMembers,
  readClaudeTranscriptFrom,
  type ClaudeTranscriptChunk,
} from "./workflow-members.js";

interface MemberState {
  id: string;
  agentId: string;
  offset: number;
  readFirstEntry: boolean;
  status: ProviderSubagentStatus;
  subtitle?: string;
}

interface RunState {
  transcriptDir?: string;
  members: Map<string, MemberState>;
  agentIdByIndex: Map<number, string>;
}

export interface ClaudeWorkflowMemberSourceInput {
  convertEntry?: (entry: ClaudeReplayEntry) => AgentTimelineItem[];
  readTranscript?: (file: string, offset: number) => ClaudeTranscriptChunk;
}

/**
 * Live workflow members, keyed by the workflow's provider-subagent id.
 *
 * Member frames never reach the SDK stream, so their timelines come from tailing transcripts.
 * Each `task_progress` snapshot is the read trigger: Claude Code emits one per member tool use,
 * which is exactly when a transcript has grown.
 */
export class ClaudeWorkflowMemberSource {
  private readonly runs = new Map<string, RunState>();
  private readonly convertEntry: (entry: ClaudeReplayEntry) => AgentTimelineItem[];
  private readonly readTranscript: (file: string, offset: number) => ClaudeTranscriptChunk;

  constructor(input: ClaudeWorkflowMemberSourceInput = {}) {
    this.convertEntry = input.convertEntry ?? (() => []);
    this.readTranscript = input.readTranscript ?? readClaudeTranscriptFrom;
  }

  /** The background-launch result is the only frame carrying the run's transcript directory. */
  setTranscriptDir(workflowId: string, transcriptDir: string): SubagentObservation[] {
    const run = this.run(workflowId);
    run.transcriptDir = transcriptDir;
    return this.drain(run);
  }

  observeProgress(workflowId: string, progress: unknown): SubagentObservation[] {
    const members = parseClaudeWorkflowMembers(progress);
    if (members.length === 0) return [];
    const run = this.run(workflowId);
    const observations: SubagentObservation[] = [];
    for (const member of members) {
      // A retried member reports a new agent at the same index; the attempt it replaced is over.
      const replaced = run.agentIdByIndex.get(member.index);
      if (replaced && replaced !== member.agentId) {
        observations.push(...this.terminalize(run.members.get(replaced), "failed"));
      }
      run.agentIdByIndex.set(member.index, member.agentId);

      let state = run.members.get(member.agentId);
      if (!state) {
        state = {
          id: claudeWorkflowMemberId(workflowId, member.agentId),
          agentId: member.agentId,
          offset: 0,
          readFirstEntry: false,
          status: "running",
        };
        run.members.set(member.agentId, state);
        observations.push(declareClaudeWorkflowMember({ workflowId, member }));
      }
      if (member.subtitle && member.subtitle !== state.subtitle) {
        state.subtitle = member.subtitle;
        observations.push({ kind: "subtitle", id: state.id, subtitle: member.subtitle });
      }
    }
    observations.push(...this.drain(run));
    // Status follows the drain so a finished member's last reply lands before it reads as done.
    for (const member of members) {
      if (member.status === "running") continue;
      observations.push(...this.terminalize(run.members.get(member.agentId), member.status));
    }
    return observations;
  }

  /** The workflow settled. Read what members wrote last; any still running ended with it. */
  settle(workflowId: string, status: ProviderSubagentStatus): SubagentObservation[] {
    const run = this.runs.get(workflowId);
    if (!run) return [];
    const observations = this.drain(run);
    for (const state of run.members.values()) {
      observations.push(...this.terminalize(state, status));
    }
    return observations;
  }

  reset(): void {
    this.runs.clear();
  }

  private run(workflowId: string): RunState {
    let run = this.runs.get(workflowId);
    if (!run) {
      run = { members: new Map(), agentIdByIndex: new Map() };
      this.runs.set(workflowId, run);
    }
    return run;
  }

  private drain(run: RunState): SubagentObservation[] {
    if (!run.transcriptDir) return [];
    const observations: SubagentObservation[] = [];
    for (const state of run.members.values()) {
      const chunk = this.readTranscript(
        claudeWorkflowMemberTranscript(run.transcriptDir, state.agentId),
        state.offset,
      );
      state.offset = chunk.offset;
      for (const entry of chunk.entries) {
        const isFirst = !state.readFirstEntry;
        state.readFirstEntry = true;
        if (!isShownClaudeWorkflowMemberEntry(entry, isFirst)) continue;
        for (const item of convertClaudeWorkflowMemberEntry(entry, this.convertEntry)) {
          observations.push({ kind: "timeline", id: state.id, item });
        }
      }
    }
    return observations;
  }

  /** Terminal is final: a later snapshot cannot reopen a member that already settled. */
  private terminalize(
    state: MemberState | undefined,
    status: ProviderSubagentStatus,
  ): SubagentObservation[] {
    if (!state || state.status !== "running" || status === "running") return [];
    state.status = status;
    return [{ kind: "status", id: state.id, status }];
  }
}
