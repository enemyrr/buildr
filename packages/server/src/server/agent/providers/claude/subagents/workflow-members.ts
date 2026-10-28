import fs from "node:fs";
import path from "node:path";

import type { AgentTimelineItem } from "../../../agent-sdk-types.js";
import type { ProviderSubagentStatus } from "../../../provider-subagents/store.js";
import type { SubagentObservation } from "./observation.js";
import { buildClaudeSubagentSubtitle } from "./presentation.js";
import type { ClaudeReplayEntry } from "./replay-source.js";

/**
 * Members are the `agent()` calls a workflow script makes. Claude Code never streams their frames;
 * it reports them in `workflow_progress` snapshots and writes each one's transcript to
 * `<transcriptDir>/agent-<agentId>.jsonl`. The run summary persists the last snapshot, so live
 * and replay read members from the same shape.
 *
 * Verified in a persisted run summary (Claude Code 2.1.246):
 *
 *   workflow_agent  index, label, agentId, state, phaseTitle, model, tokens, attempt,
 *                   promptPreview, resultPreview
 */
export interface ClaudeWorkflowMember {
  index: number;
  agentId: string;
  label: string;
  status: ProviderSubagentStatus;
  subtitle?: string;
  startedAt?: string;
}

const AGENT_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

/** `queued` has no descriptor state of its own and is not terminal, so it reads as running. */
function mapMemberState(state: unknown): ProviderSubagentStatus {
  switch (state) {
    case "done":
      return "completed";
    case "error":
      return "failed";
    default:
      return "running";
  }
}

/** Members without an agentId are still queued and have no transcript to show yet. */
export function parseClaudeWorkflowMembers(progress: unknown): ClaudeWorkflowMember[] {
  if (!Array.isArray(progress)) return [];
  const members: ClaudeWorkflowMember[] = [];
  for (const value of progress) {
    const entry = toRecord(value);
    if (entry?.type !== "workflow_agent") continue;
    const agentId = readString(entry.agentId);
    const label = readString(entry.label);
    if (typeof entry.index !== "number" || !agentId || !AGENT_ID_PATTERN.test(agentId) || !label) {
      continue;
    }
    const subtitle = buildClaudeSubagentSubtitle({
      title: readString(entry.phaseTitle),
      model: readString(entry.model),
      ...(typeof entry.tokens === "number" ? { usage: { totalTokens: entry.tokens } } : {}),
    });
    const startedAt = readEpoch(entry.startedAt);
    members.push({
      index: entry.index,
      agentId,
      label,
      status: mapMemberState(entry.state),
      ...(subtitle ? { subtitle } : {}),
      ...(startedAt ? { startedAt } : {}),
    });
  }
  return members;
}

export function claudeWorkflowMemberId(workflowId: string, agentId: string): string {
  return `${workflowId}:${agentId}`;
}

export function claudeWorkflowMemberTranscript(transcriptDir: string, agentId: string): string {
  return path.join(transcriptDir, `agent-${agentId}.jsonl`);
}

export function declareClaudeWorkflowMember(input: {
  workflowId: string;
  member: ClaudeWorkflowMember;
  timestamp?: string;
}): SubagentObservation {
  return {
    kind: "declared",
    id: claudeWorkflowMemberId(input.workflowId, input.member.agentId),
    title: input.member.label,
    parentSubagentId: input.workflowId,
    ...(input.timestamp ? { timestamp: input.timestamp } : {}),
  };
}

const HARNESS_FRAME_PREFIX = "[Workflow harness";
const HARNESS_FRAME_END = "follows:\n";

/**
 * Claude Code frames a member's task as script output and indents every line of it. The pane
 * shows the task the script computed, so the frame and its indent come off.
 */
export function unframeClaudeWorkflowTask(text: string): string {
  if (!text.startsWith(HARNESS_FRAME_PREFIX)) return text;
  const end = text.indexOf(HARNESS_FRAME_END);
  if (end === -1) return text;
  return text
    .slice(end + HARNESS_FRAME_END.length)
    .split("\n")
    .map((line) => (line.startsWith("  ") ? line.slice(2) : line))
    .join("\n")
    .trim();
}

/**
 * A member transcript opens with its task. Later plain user rows are harness bookkeeping, so only
 * tool results survive among them.
 */
export function isShownClaudeWorkflowMemberEntry(
  entry: ClaudeReplayEntry,
  isFirst: boolean,
): boolean {
  if (isFirst || entry.type !== "user") return true;
  const content = entry.message?.content;
  return Array.isArray(content) && content.some((block) => toRecord(block)?.type === "tool_result");
}

export function convertClaudeWorkflowMemberEntry(
  entry: ClaudeReplayEntry,
  convertEntry: (entry: ClaudeReplayEntry) => AgentTimelineItem[],
): AgentTimelineItem[] {
  const items = convertEntry(entry);
  for (const item of items) {
    if (item.type === "user_message") item.text = unframeClaudeWorkflowTask(item.text);
  }
  return items;
}

export interface ClaudeTranscriptChunk {
  entries: ClaudeReplayEntry[];
  offset: number;
}

/**
 * Reads the complete lines appended since `offset`. A partial last line stays unread until its
 * newline lands, and a file shorter than the offset was rewritten, so it is read from the start.
 */
export function readClaudeTranscriptFrom(file: string, offset: number): ClaudeTranscriptChunk {
  let descriptor: number | undefined;
  try {
    descriptor = fs.openSync(file, "r");
    const size = fs.fstatSync(descriptor).size;
    const start = size < offset ? 0 : offset;
    if (size === start) return { entries: [], offset: start };
    const buffer = Buffer.alloc(size - start);
    let read = 0;
    while (read < buffer.length) {
      const count = fs.readSync(descriptor, buffer, read, buffer.length - read, start + read);
      if (count === 0) break;
      read += count;
    }
    const end = buffer.subarray(0, read).lastIndexOf(10);
    if (end === -1) return { entries: [], offset: start };
    const entries = buffer
      .subarray(0, end)
      .toString("utf8")
      .split("\n")
      .flatMap((line) => {
        const entry = parseEntry(line);
        return entry ? [entry] : [];
      });
    return { entries, offset: start + end + 1 };
  } catch {
    return { entries: [], offset };
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

function parseEntry(line: string): ClaudeReplayEntry | null {
  if (!line.trim()) return null;
  try {
    return toRecord(JSON.parse(line)) as ClaudeReplayEntry | null;
  } catch {
    return null;
  }
}

function readEpoch(value: unknown): string | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function toRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
