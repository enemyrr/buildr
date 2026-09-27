import type { Logger } from "pino";
import {
  backupCheckpointRef,
  captureCheckpoint,
  checkpointRef,
  deleteCheckpoints,
  diffCheckpoints,
  listCheckpoints,
  resolveCheckpointRoot,
  restoreCheckpoint,
  type CheckpointDiff,
} from "./store.js";

const DEFAULT_START_CAPTURE_WAIT_MS = 2_000;

export interface TurnCheckpoint {
  turnIndex: number;
  messageId: string | null;
  startedAt: string;
  completedAt: string | null;
}

export class CheckpointUnavailableError extends Error {
  constructor(
    public readonly agentId: string,
    public readonly reason: "not_git" | "turn_missing" | "turn_incomplete",
  ) {
    super(
      {
        not_git: "The agent's directory isn't a Git repository.",
        turn_missing: "No checkpoint exists for that turn.",
        turn_incomplete: "That turn is still running.",
      }[reason],
    );
    this.name = "CheckpointUnavailableError";
  }
}

interface AgentCheckpointState {
  nextTurnIndex: number | null;
  openTurnIndex: number | null;
  openMessageId: string | null;
  // Serializes every Git operation for one agent so an end capture never
  // races the start capture of the same turn.
  queue: Promise<void>;
}

interface AgentLocation {
  agentId: string;
  cwd: string;
}

async function listTurns(root: string, agentId: string): Promise<TurnCheckpoint[]> {
  const stored = await listCheckpoints({ root, agentId });
  const turns = new Map<number, TurnCheckpoint>();
  for (const checkpoint of stored) {
    if (checkpoint.phase === "start") {
      turns.set(checkpoint.turnIndex, {
        turnIndex: checkpoint.turnIndex,
        messageId: checkpoint.metadata.messageId,
        startedAt: checkpoint.capturedAt,
        completedAt: null,
      });
      continue;
    }
    const turn = turns.get(checkpoint.turnIndex);
    if (turn) turn.completedAt = checkpoint.capturedAt;
  }
  return Array.from(turns.values());
}

/**
 * Captures a Git checkpoint at every foreground turn boundary and answers
 * per-turn diff and restore queries. Capture failures are logged and skipped:
 * a checkpoint never blocks or fails a turn.
 */
export class TurnCheckpoints {
  private readonly logger: Logger;
  private readonly startCaptureWaitMs: number;
  private readonly agents = new Map<string, AgentCheckpointState>();

  constructor(options: { logger: Logger; startCaptureWaitMs?: number }) {
    this.logger = options.logger.child({ component: "turn-checkpoints" });
    this.startCaptureWaitMs = options.startCaptureWaitMs ?? DEFAULT_START_CAPTURE_WAIT_MS;
  }

  /**
   * Captures the pre-turn snapshot. Waits at most `startCaptureWaitMs` so a
   * slow repository delays the provider by a bounded amount.
   */
  async beginTurn(input: AgentLocation & { messageId: string | null }): Promise<void> {
    const capture = this.enqueue(input.agentId, async (state) => {
      state.openTurnIndex = null;
      const root = await resolveCheckpointRoot(input.cwd);
      if (!root) return;
      state.nextTurnIndex ??= await this.readNextTurnIndex(root, input.agentId);
      const turnIndex = state.nextTurnIndex;
      state.nextTurnIndex += 1;
      await captureCheckpoint({
        root,
        ref: checkpointRef(input.agentId, turnIndex, "start"),
        metadata: { messageId: input.messageId },
      });
      state.openTurnIndex = turnIndex;
      state.openMessageId = input.messageId;
    });
    let timer: NodeJS.Timeout | undefined;
    const waitLimit = new Promise<void>((resolve) => {
      timer = setTimeout(() => {
        this.logger.warn(
          { agentId: input.agentId, waitMs: this.startCaptureWaitMs },
          "turn_checkpoints.start_capture_slow",
        );
        resolve();
      }, this.startCaptureWaitMs);
    });
    await Promise.race([capture, waitLimit]);
    clearTimeout(timer);
  }

  /** Captures the post-turn snapshot for the turn that `beginTurn` opened. */
  endTurn(input: AgentLocation): void {
    void this.enqueue(input.agentId, async (state) => {
      const turnIndex = state.openTurnIndex;
      if (turnIndex === null) return;
      state.openTurnIndex = null;
      const root = await resolveCheckpointRoot(input.cwd);
      if (!root) return;
      await captureCheckpoint({
        root,
        ref: checkpointRef(input.agentId, turnIndex, "end"),
        metadata: { messageId: state.openMessageId },
      });
    });
  }

  /** Lists the agent's turns after any queued capture settles. */
  async list(input: AgentLocation): Promise<TurnCheckpoint[]> {
    await this.agents.get(input.agentId)?.queue;
    return listTurns(await this.requireRoot(input), input.agentId);
  }

  async getTurnDiff(
    input: AgentLocation & { turnIndex: number; ignoreWhitespace: boolean },
  ): Promise<CheckpointDiff> {
    await this.agents.get(input.agentId)?.queue;
    const root = await this.requireRoot(input);
    const turn = await this.requireTurn(root, input);
    if (turn.completedAt === null) {
      throw new CheckpointUnavailableError(input.agentId, "turn_incomplete");
    }
    return diffCheckpoints({
      root,
      fromRef: checkpointRef(input.agentId, input.turnIndex, "start"),
      toRef: checkpointRef(input.agentId, input.turnIndex, "end"),
      ignoreWhitespace: input.ignoreWhitespace,
    });
  }

  /** Restores the worktree to the snapshot taken when turn `turnIndex` started. */
  async restoreFilesToTurnStart(input: AgentLocation & { turnIndex: number }): Promise<void> {
    const root = await this.requireRoot(input);
    await this.requireTurn(root, input);
    await this.enqueue(
      input.agentId,
      () =>
        restoreCheckpoint({
          root,
          ref: checkpointRef(input.agentId, input.turnIndex, "start"),
          backupRef: backupCheckpointRef(input.agentId),
        }),
      { rethrow: true },
    );
  }

  /** Deletes the agent's checkpoint refs. */
  async discard(input: AgentLocation): Promise<void> {
    await this.enqueue(input.agentId, async () => {
      const root = await resolveCheckpointRoot(input.cwd);
      if (root) await deleteCheckpoints({ root, agentId: input.agentId });
    });
    this.agents.delete(input.agentId);
  }

  private async readNextTurnIndex(root: string, agentId: string): Promise<number> {
    const stored = await listCheckpoints({ root, agentId });
    return stored.reduce((max, checkpoint) => Math.max(max, checkpoint.turnIndex), 0) + 1;
  }

  private async requireRoot(input: AgentLocation): Promise<string> {
    const root = await resolveCheckpointRoot(input.cwd);
    if (!root) throw new CheckpointUnavailableError(input.agentId, "not_git");
    return root;
  }

  private async requireTurn(
    root: string,
    input: AgentLocation & { turnIndex: number },
  ): Promise<TurnCheckpoint> {
    const turn = (await listTurns(root, input.agentId)).find(
      (candidate) => candidate.turnIndex === input.turnIndex,
    );
    if (!turn) throw new CheckpointUnavailableError(input.agentId, "turn_missing");
    return turn;
  }

  private enqueue(
    agentId: string,
    operation: (state: AgentCheckpointState) => Promise<void>,
    options: { rethrow: boolean } = { rethrow: false },
  ): Promise<void> {
    let state = this.agents.get(agentId);
    if (!state) {
      state = {
        nextTurnIndex: null,
        openTurnIndex: null,
        openMessageId: null,
        queue: Promise.resolve(),
      };
      this.agents.set(agentId, state);
    }
    const agentState = state;
    const result = agentState.queue.then(() => operation(agentState));
    agentState.queue = result.catch((error: unknown) => {
      if (!options.rethrow) {
        this.logger.warn({ err: error, agentId }, "turn_checkpoints.operation_failed");
      }
    });
    return options.rethrow ? result : agentState.queue;
  }
}
