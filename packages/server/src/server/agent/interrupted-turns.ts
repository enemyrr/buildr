import { randomUUID } from "node:crypto";
import type { Logger } from "pino";

import type { AgentManager } from "./agent-manager.js";
import type { AgentStorage, StoredAgentRecord, UnfinishedTurn } from "./agent-storage.js";
import { ensureAgentLoaded } from "./agent-loading.js";
import { sendPromptToAgent, waitForAgentRunStartWithTimeout } from "./agent-prompt.js";

type InterruptedTurn = Extract<UnfinishedTurn, { state: "interrupted" }>;

// Sent in place of an interrupted prompt that was too large to persist.
const CONTINUATION_PROMPT = "Continue where you left off.";

export class InterruptedTurnNotFoundError extends Error {
  constructor(readonly agentId: string) {
    super(`Agent ${agentId} has no interrupted turn to continue`);
    this.name = "InterruptedTurnNotFoundError";
  }
}

export interface InterruptedTurnDeps {
  agentManager: AgentManager;
  agentStorage: AgentStorage;
  logger: Logger;
}

interface MarkInterruptedTurnsInput {
  agentStorage: AgentStorage;
  now: Date;
  /** If true, flags each agent with error attention. If false, leaves attention unchanged. */
  flagAttention: boolean;
}

/**
 * Rewrites every turn that was running when the daemon stopped as interrupted. Runs once at
 * startup, before any runtime loads. Returns the affected agent IDs.
 */
export async function markInterruptedTurns(input: MarkInterruptedTurnsInput): Promise<string[]> {
  const interruptedAt = input.now.toISOString();
  const agentIds: string[] = [];
  for (const record of await input.agentStorage.list()) {
    if (record.archivedAt || record.internal || !wasRunningAtShutdown(record)) continue;
    await input.agentStorage.update(record.id, (current) =>
      markInterrupted(current, { interruptedAt, flagAttention: input.flagAttention }),
    );
    agentIds.push(record.id);
  }
  return agentIds;
}

function wasRunningAtShutdown(record: StoredAgentRecord): boolean {
  // A record written before the marker existed shows a crash only as a stale `running` status.
  return (
    record.unfinishedTurn?.state === "running" ||
    (!record.unfinishedTurn && record.lastStatus === "running")
  );
}

function markInterrupted(
  record: StoredAgentRecord,
  options: { interruptedAt: string; flagAttention: boolean },
): StoredAgentRecord {
  const running = record.unfinishedTurn?.state === "running" ? record.unfinishedTurn : null;
  const hadLiveStatus = record.lastStatus === "running" || record.lastStatus === "initializing";
  const attention = options.flagAttention
    ? {
        requiresAttention: true,
        attentionReason: "error" as const,
        attentionTimestamp: options.interruptedAt,
      }
    : {};
  return {
    ...record,
    // No runtime survives a restart.
    lastStatus: hadLiveStatus ? "closed" : record.lastStatus,
    unfinishedTurn: {
      state: "interrupted",
      startedAt: running?.startedAt ?? record.updatedAt,
      interruptedAt: options.interruptedAt,
      prompt: running?.prompt ?? null,
    },
    ...attention,
  };
}

/**
 * Resumes the agent and submits its interrupted prompt again. Resolves once the provider
 * starts the turn. Throws `InterruptedTurnNotFoundError` when the agent has no interrupted
 * turn, including when another continuation claimed it first.
 */
export async function continueInterruptedTurn(
  deps: InterruptedTurnDeps,
  agentId: string,
): Promise<void> {
  // Loading first lets the timeline record the interruption before the continuation starts.
  await ensureAgentLoaded(agentId, deps);

  const claimRunId = `continuation-${randomUUID()}`;
  const claimed: InterruptedTurn[] = [];
  await deps.agentStorage.update(agentId, (record) => {
    const turn = record.unfinishedTurn;
    if (turn?.state !== "interrupted") return record;
    claimed.push(turn);
    // A `running` claim stays recoverable if the daemon stops before the provider starts.
    return {
      ...record,
      unfinishedTurn: {
        state: "running",
        runId: claimRunId,
        startedAt: turn.startedAt,
        prompt: turn.prompt,
      },
    };
  });
  const turn = claimed[0];
  if (!turn) throw new InterruptedTurnNotFoundError(agentId);

  try {
    await sendPromptToAgent({
      ...deps,
      agentId,
      prompt: turn.prompt ?? CONTINUATION_PROMPT,
      messageId: randomUUID(),
      unarchive: false,
    });
    await waitForAgentRunStartWithTimeout(deps.agentManager, agentId);
  } catch (error) {
    await deps.agentStorage.update(agentId, (record) =>
      record.unfinishedTurn?.state === "running" && record.unfinishedTurn.runId === claimRunId
        ? { ...record, unfinishedTurn: turn }
        : record,
    );
    deps.agentManager.notifyAgentState(agentId);
    throw error;
  }
}

/**
 * Continues each interrupted turn in order. A turn that fails to continue stays interrupted,
 * so the app offers the manual continuation instead.
 */
export async function autoContinueInterruptedTurns(
  deps: InterruptedTurnDeps,
  agentIds: readonly string[],
): Promise<void> {
  for (const agentId of agentIds) {
    try {
      await continueInterruptedTurn(deps, agentId);
      deps.logger.info({ agentId }, "Continued turn interrupted by daemon restart");
    } catch (error) {
      deps.logger.warn({ err: error, agentId }, "Failed to continue interrupted turn");
    }
  }
}
