import type pino from "pino";
import type {
  RestoreFilesBlockedReason,
  SessionInboundMessage,
  SessionOutboundMessage,
} from "../../messages.js";
import type { AgentManager, ManagedAgent } from "../../agent/agent-manager.js";
import type { TurnCheckpoints } from "../../agent/checkpoints/turn-checkpoints.js";
import type { WorkspaceRegistry } from "../../workspace-registry.js";

type CheckpointRequest<Type extends SessionInboundMessage["type"]> = Extract<
  SessionInboundMessage,
  { type: Type }
>;

export class CheckpointRestoreRefusedError extends Error {
  constructor(
    public readonly agentId: string,
    reason: string,
  ) {
    super(reason);
    this.name = "CheckpointRestoreRefusedError";
  }
}

export interface CheckpointSessionOptions {
  emit(msg: SessionOutboundMessage): void;
  agentManager: Pick<
    AgentManager,
    "getAgent" | "listAgents" | "hasInFlightRun" | "getTurnCheckpoints"
  >;
  workspaceRegistry: Pick<WorkspaceRegistry, "get">;
  logger: pino.Logger;
}

const RESTORE_BLOCKED_MESSAGES: Record<RestoreFilesBlockedReason, string> = {
  not_worktree: "File restore requires the agent to run in its own worktree.",
  shared_worktree: "Another agent is working in this worktree. Close it before restoring files.",
};

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function sharesWorkspace(agent: ManagedAgent, other: ManagedAgent): boolean {
  if (agent.workspaceId !== undefined && other.workspaceId === agent.workspaceId) return true;
  return (
    other.cwd === agent.cwd ||
    other.cwd.startsWith(`${agent.cwd}/`) ||
    agent.cwd.startsWith(`${other.cwd}/`)
  );
}

/** Serves per-turn checkpoint list, diff, and file-restore requests. */
export class CheckpointSession {
  private readonly options: CheckpointSessionOptions;

  constructor(options: CheckpointSessionOptions) {
    this.options = options;
  }

  dispatch(msg: SessionInboundMessage): Promise<void> | undefined {
    switch (msg.type) {
      case "agent.checkpoint.list.request":
        return this.handleList(msg);
      case "agent.checkpoint.get_turn_diff.request":
        return this.handleGetTurnDiff(msg);
      case "agent.checkpoint.restore_files.request":
        return this.handleRestoreFiles(msg);
      default:
        return undefined;
    }
  }

  /** Deletes the agent's checkpoint refs after the agent itself is deleted. */
  async discardAgent(input: { agentId: string; cwd: string }): Promise<void> {
    await this.checkpoints().discard(input);
  }

  private checkpoints(): TurnCheckpoints {
    return this.options.agentManager.getTurnCheckpoints();
  }

  private requireAgent(agentId: string): ManagedAgent {
    const agent = this.options.agentManager.getAgent(agentId);
    if (!agent) throw new Error(`Agent ${agentId} is not loaded`);
    return agent;
  }

  /**
   * Returns why file restore is unsafe for the agent, or null when it is safe.
   * Restore rewrites the whole worktree, so it requires a worktree that no
   * other live agent works in.
   */
  private async findRestoreBlocker(agent: ManagedAgent): Promise<RestoreFilesBlockedReason | null> {
    const workspace = agent.workspaceId
      ? await this.options.workspaceRegistry.get(agent.workspaceId)
      : null;
    if (!workspace || workspace.kind !== "worktree") {
      return "not_worktree";
    }
    const sharing = this.options.agentManager
      .listAgents()
      .some(
        (other) =>
          other.id !== agent.id && other.lifecycle !== "closed" && sharesWorkspace(agent, other),
      );
    if (sharing) {
      return "shared_worktree";
    }
    return null;
  }

  private async handleList(msg: CheckpointRequest<"agent.checkpoint.list.request">) {
    try {
      const agent = this.requireAgent(msg.agentId);
      const checkpoints = await this.checkpoints().list({
        agentId: agent.id,
        cwd: agent.cwd,
      });
      const restoreFilesBlockedReason = await this.findRestoreBlocker(agent);
      this.options.emit({
        type: "agent.checkpoint.list.response",
        payload: {
          requestId: msg.requestId,
          agentId: msg.agentId,
          checkpoints,
          ...(restoreFilesBlockedReason ? { restoreFilesBlockedReason } : {}),
          error: null,
        },
      });
    } catch (error) {
      this.options.emit({
        type: "agent.checkpoint.list.response",
        payload: {
          requestId: msg.requestId,
          agentId: msg.agentId,
          checkpoints: [],
          error: errorMessage(error, "Failed to list checkpoints"),
        },
      });
    }
  }

  private async handleGetTurnDiff(
    msg: CheckpointRequest<"agent.checkpoint.get_turn_diff.request">,
  ) {
    try {
      const agent = this.requireAgent(msg.agentId);
      const diff = await this.checkpoints().getTurnDiff({
        agentId: agent.id,
        cwd: agent.cwd,
        turnIndex: msg.turnIndex,
        ignoreWhitespace: msg.ignoreWhitespace === true,
      });
      this.options.emit({
        type: "agent.checkpoint.get_turn_diff.response",
        payload: {
          requestId: msg.requestId,
          agentId: msg.agentId,
          turnIndex: msg.turnIndex,
          files: diff.files,
          diffTooLarge: diff.diffTooLarge,
          error: null,
        },
      });
    } catch (error) {
      this.options.emit({
        type: "agent.checkpoint.get_turn_diff.response",
        payload: {
          requestId: msg.requestId,
          agentId: msg.agentId,
          turnIndex: msg.turnIndex,
          files: [],
          diffTooLarge: false,
          error: errorMessage(error, "Failed to load the turn diff"),
        },
      });
    }
  }

  private async handleRestoreFiles(
    msg: CheckpointRequest<"agent.checkpoint.restore_files.request">,
  ) {
    try {
      const agent = this.requireAgent(msg.agentId);
      if (this.options.agentManager.hasInFlightRun(agent.id)) {
        throw new CheckpointRestoreRefusedError(agent.id, "Stop the agent before restoring files.");
      }
      const blocker = await this.findRestoreBlocker(agent);
      if (blocker) {
        throw new CheckpointRestoreRefusedError(agent.id, RESTORE_BLOCKED_MESSAGES[blocker]);
      }
      await this.checkpoints().restoreFilesToTurnStart({
        agentId: agent.id,
        cwd: agent.cwd,
        turnIndex: msg.turnIndex,
      });
      this.options.logger.info(
        { agentId: agent.id, turnIndex: msg.turnIndex },
        "agent.checkpoint.restore_files.complete",
      );
      this.options.emit({
        type: "agent.checkpoint.restore_files.response",
        payload: {
          requestId: msg.requestId,
          agentId: msg.agentId,
          turnIndex: msg.turnIndex,
          ok: true,
          error: null,
        },
      });
    } catch (error) {
      this.options.logger.warn(
        { err: error, agentId: msg.agentId, turnIndex: msg.turnIndex },
        "agent.checkpoint.restore_files.failed",
      );
      this.options.emit({
        type: "agent.checkpoint.restore_files.response",
        payload: {
          requestId: msg.requestId,
          agentId: msg.agentId,
          turnIndex: msg.turnIndex,
          ok: false,
          error: errorMessage(error, "Failed to restore files"),
        },
      });
    }
  }
}
