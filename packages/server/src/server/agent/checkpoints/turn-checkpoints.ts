import type { Logger } from "pino";
import { runWithGitCommandPriority } from "../../../utils/run-git-command.js";
import {
  backupCheckpointRef,
  captureCheckpoint,
  checkpointRef,
  deleteCheckpoints,
  diffCheckpoints,
  listCheckpoints,
  publishCheckpoint,
  resolveCheckpointRepo,
  restoreCheckpoint,
  snapshotWorktree,
  type CheckpointDiff,
  type CheckpointRepo,
  type WorktreeSnapshot,
} from "./store.js";

// The provider can write files as soon as its turn starts, so the pre-turn
// tree should exist first. A warm snapshot takes a few tens of milliseconds;
// past this bound the turn starts anyway and the snapshot races it.
const DEFAULT_START_SNAPSHOT_WAIT_MS = 150;

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
  repo: CheckpointRepo | null;
  repoCwd: string | null;
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
 * a checkpoint never fails a turn.
 */
export class TurnCheckpoints {
  private readonly logger: Logger;
  private readonly startSnapshotWaitMs: number;
  private readonly agents = new Map<string, AgentCheckpointState>();

  constructor(options: { logger: Logger; startSnapshotWaitMs?: number }) {
    this.logger = options.logger.child({ component: "turn-checkpoints" });
    this.startSnapshotWaitMs = options.startSnapshotWaitMs ?? DEFAULT_START_SNAPSHOT_WAIT_MS;
  }

  /**
   * Starts the pre-turn capture and resolves once its tree is written, or
   * after `startSnapshotWaitMs`, whichever comes first. Committing the tree
   * and publishing the ref always finish in the background.
   */
  async beginTurn(input: AgentLocation & { messageId: string | null }): Promise<void> {
    const startedAt = Date.now();
    let markTreeWritten: () => void = () => undefined;
    const treeWritten = new Promise<void>((resolve) => {
      markTreeWritten = resolve;
    });
    const capture = this.enqueue(input.agentId, async (state) => {
      state.openTurnIndex = null;
      const repo = await this.resolveRepo(state, input.cwd);
      if (!repo) return;
      state.nextTurnIndex ??= await this.readNextTurnIndex(repo.root, input.agentId);
      const turnIndex = state.nextTurnIndex;
      state.nextTurnIndex += 1;
      const snapshot = await runWithGitCommandPriority("high", () => snapshotWorktree(repo));
      markTreeWritten();
      this.logSnapshot(input.agentId, snapshot, Date.now() - startedAt);
      await publishCheckpoint({
        root: repo.root,
        ref: checkpointRef(input.agentId, turnIndex, "start"),
        tree: snapshot.tree,
        metadata: { messageId: input.messageId },
      });
      state.openTurnIndex = turnIndex;
      state.openMessageId = input.messageId;
    });
    let timer: NodeJS.Timeout | undefined;
    const waitLimit = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, this.startSnapshotWaitMs);
    });
    await Promise.race([treeWritten, capture, waitLimit]);
    clearTimeout(timer);
  }

  /** Captures the post-turn snapshot for the turn that `beginTurn` opened. */
  endTurn(input: AgentLocation): void {
    void this.enqueue(input.agentId, async (state) => {
      const turnIndex = state.openTurnIndex;
      if (turnIndex === null) return;
      state.openTurnIndex = null;
      const repo = await this.resolveRepo(state, input.cwd);
      if (!repo) return;
      const snapshot = await captureCheckpoint({
        repo,
        ref: checkpointRef(input.agentId, turnIndex, "end"),
        metadata: { messageId: state.openMessageId },
      });
      this.logSkippedFiles(input.agentId, snapshot);
    });
  }

  /** Lists the agent's turns after any queued capture settles. */
  async list(input: AgentLocation): Promise<TurnCheckpoint[]> {
    await this.agents.get(input.agentId)?.queue;
    return listTurns((await this.requireRepo(input)).root, input.agentId);
  }

  async getTurnDiff(
    input: AgentLocation & { turnIndex: number; ignoreWhitespace: boolean },
  ): Promise<CheckpointDiff> {
    await this.agents.get(input.agentId)?.queue;
    const { root } = await this.requireRepo(input);
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
    await this.agents.get(input.agentId)?.queue;
    const repo = await this.requireRepo(input);
    await this.requireTurn(repo.root, input);
    await this.enqueue(
      input.agentId,
      () =>
        restoreCheckpoint({
          repo,
          ref: checkpointRef(input.agentId, input.turnIndex, "start"),
          backupRef: backupCheckpointRef(input.agentId),
        }),
      { rethrow: true },
    );
  }

  /** Deletes the agent's checkpoint refs. */
  async discard(input: AgentLocation): Promise<void> {
    await this.enqueue(input.agentId, async () => {
      const repo = await resolveCheckpointRepo(input.cwd);
      if (repo) await deleteCheckpoints({ root: repo.root, agentId: input.agentId });
    });
    this.agents.delete(input.agentId);
  }

  private async resolveRepo(
    state: AgentCheckpointState,
    cwd: string,
  ): Promise<CheckpointRepo | null> {
    // A Git root is cached per agent; a non-Git directory is rechecked each
    // turn so `git init` mid-session starts producing checkpoints.
    if (state.repo && state.repoCwd === cwd) return state.repo;
    state.repo = await resolveCheckpointRepo(cwd);
    state.repoCwd = cwd;
    return state.repo;
  }

  private logSnapshot(agentId: string, snapshot: WorktreeSnapshot, elapsedMs: number): void {
    if (elapsedMs > this.startSnapshotWaitMs) {
      this.logger.warn(
        { agentId, elapsedMs, waitMs: this.startSnapshotWaitMs },
        "turn_checkpoints.start_snapshot_late",
      );
    }
    this.logSkippedFiles(agentId, snapshot);
  }

  private logSkippedFiles(agentId: string, snapshot: WorktreeSnapshot): void {
    if (snapshot.skippedLargeFiles.length === 0) return;
    this.logger.info(
      {
        agentId,
        paths: snapshot.skippedLargeFiles.slice(0, 20),
        count: snapshot.skippedLargeFiles.length,
      },
      "turn_checkpoints.skipped_large_untracked_files",
    );
  }

  private async readNextTurnIndex(root: string, agentId: string): Promise<number> {
    const stored = await listCheckpoints({ root, agentId });
    return stored.reduce((max, checkpoint) => Math.max(max, checkpoint.turnIndex), 0) + 1;
  }

  private async requireRepo(input: AgentLocation): Promise<CheckpointRepo> {
    const repo = await resolveCheckpointRepo(input.cwd);
    if (!repo) throw new CheckpointUnavailableError(input.agentId, "not_git");
    return repo;
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
        repo: null,
        repoCwd: null,
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
