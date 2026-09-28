import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { getHostRuntimeStore } from "@/runtime/host-runtime";
import { useToast } from "@/contexts/toast-context";
import {
  confirmRiskyWorktreeArchive,
  DEFAULT_WORKTREE_ARCHIVE_WARNING_LABELS,
  type WorktreeArchiveWarningLabels,
} from "@/git/worktree-archive-warning";
import type { WorkspaceDescriptor } from "@/stores/session-store";
import { useWorkspaceLayoutStore } from "@/stores/workspace-layout-store";
import { buildWorkspaceTabPersistenceKey } from "@/workspace-tabs/model";
import { archiveWorkspaceOptimistically } from "@/workspace/workspace-archive";
import { i18n } from "@/i18n/i18next";
import { hostSupportsFeature } from "@/runtime/host-features";
import {
  getLastWorkspaceSelection,
  navigateToWorkspace,
} from "@/stores/navigation-active-workspace-store";
import { useSessionStore } from "@/stores/session-store";
import { registerWorkspaceUndo } from "@/workspace/undo/store";

/** The workspace's live agents, which archiving the workspace archives with it. */
function listLiveAgentIds(input: { serverId: string; workspaceId: string }): string[] {
  const agents = useSessionStore.getState().sessions[input.serverId]?.agents;
  return [...(agents?.values() ?? [])]
    .filter((agent) => agent.workspaceId === input.workspaceId && !agent.archivedAt)
    .map((agent) => agent.id);
}

function offerArchiveUndo(input: {
  serverId: string;
  workspaceId: string;
  workspaceKey: string;
  wasViewing: boolean;
  agentIds: string[];
}): void {
  const serverInfo = useSessionStore.getState().sessions[input.serverId]?.serverInfo;
  if (!hostSupportsFeature(serverInfo, "workspaceRecovery")) {
    return;
  }
  registerWorkspaceUndo({
    kind: "archive",
    workspaceKey: input.workspaceKey,
    message: i18n.t("sidebar.undo.archived"),
    undo: async () => {
      const client = getHostRuntimeStore().getClient(input.serverId);
      if (!client) {
        throw new Error(i18n.t("sidebar.workspace.toasts.hostDisconnected"));
      }
      // Restore recovers the workspace only, so unarchive the chats the archive took with it.
      await client.restoreWorkspace(input.workspaceId);
      await Promise.allSettled(input.agentIds.map((agentId) => client.refreshAgent(agentId)));
      if (input.wasViewing) {
        navigateToWorkspace({ serverId: input.serverId, workspaceId: input.workspaceId });
      }
    },
  });
}

function purgeArchivedWorkspaceState(input: { serverId: string; workspaceId: string }): void {
  const workspaceKey = buildWorkspaceTabPersistenceKey(input);
  if (workspaceKey) {
    useWorkspaceLayoutStore.getState().purgeWorkspace(workspaceKey);
  }
}

export interface ArchiveWorkspaceInput {
  serverId: string;
  workspaceId: string;
  workspaceKind: WorkspaceDescriptor["workspaceKind"];
  name: string;
  isDirty?: boolean | null;
  aheadOfOrigin?: number | null;
  diffStat?: { additions: number; deletions: number } | null;
  warningLabels?: WorktreeArchiveWarningLabels;
  onArchiveStarted: () => void;
  onSetHiding?: (hiding: boolean) => void;
}

export interface WorkspaceArchiveController {
  archive: () => void;
}

export function useWorkspaceArchive(input: ArchiveWorkspaceInput): WorkspaceArchiveController {
  const {
    serverId,
    workspaceId,
    workspaceKind,
    name,
    isDirty,
    aheadOfOrigin,
    diffStat,
    warningLabels = DEFAULT_WORKTREE_ARCHIVE_WARNING_LABELS,
    onArchiveStarted,
    onSetHiding,
  } = input;
  const { t } = useTranslation();
  const toast = useToast();

  const archiveWorkspaceRecord = useCallback(async () => {
    const client = getHostRuntimeStore().getClient(serverId);
    if (!client) {
      toast.error(t("sidebar.workspace.toasts.hostDisconnected"));
      return;
    }
    onSetHiding?.(true);
    const lastSelection = getLastWorkspaceSelection();
    const wasViewing =
      lastSelection?.serverId === serverId && lastSelection.workspaceId === workspaceId;
    const agentIds = listLiveAgentIds({ serverId, workspaceId });
    try {
      onArchiveStarted();
      await archiveWorkspaceOptimistically({
        client,
        workspace: {
          serverId,
          workspaceId,
        },
      });
      purgeArchivedWorkspaceState({ serverId, workspaceId });
      const workspaceKey = buildWorkspaceTabPersistenceKey({ serverId, workspaceId });
      if (workspaceKey) {
        offerArchiveUndo({ serverId, workspaceId, workspaceKey, wasViewing, agentIds });
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("sidebar.workspace.toasts.archiveFailed"),
      );
    } finally {
      onSetHiding?.(false);
    }
  }, [onArchiveStarted, onSetHiding, serverId, t, toast, workspaceId]);

  const archive = useCallback(() => {
    void (async () => {
      if (workspaceKind === "worktree") {
        const confirmed = await confirmRiskyWorktreeArchive(
          {
            workspaceName: name,
            isDirty,
            aheadOfOrigin,
            diffStat,
          },
          warningLabels,
        );
        if (!confirmed) {
          return;
        }
      }
      await archiveWorkspaceRecord();
    })();
  }, [
    aheadOfOrigin,
    archiveWorkspaceRecord,
    diffStat,
    isDirty,
    name,
    warningLabels,
    workspaceKind,
  ]);

  return {
    archive,
  };
}
