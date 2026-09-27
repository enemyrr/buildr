import { useCallback, useMemo } from "react";
import { i18n } from "@/i18n/i18next";
import { useHostFeature } from "@/runtime/host-features";
import { getHostRuntimeStore } from "@/runtime/host-runtime";
import type { WorkspaceDescriptor } from "@/stores/session-store";
import { markWorkspaceUnread } from "@/workspace/mark-unread";
import { registerWorkspaceUndo } from "@/workspace/undo/store";

export interface WorkspaceReadStateController {
  hasClearableAttention: boolean;
  canMarkUnread: boolean;
  clearAttention: () => Promise<void>;
  markUnread: () => Promise<void>;
}

async function clearWorkspaceAttention(serverId: string, workspaceId: string): Promise<void> {
  const client = getHostRuntimeStore().getClient(serverId);
  if (!client) {
    throw new Error(i18n.t("workspace.terminal.hostDisconnected"));
  }
  await client.clearWorkspaceAttention(workspaceId);
}

// Callers pass the status they already render, so rows don't each subscribe to the session store.
export function useWorkspaceReadState({
  serverId,
  workspaceId,
  status,
}: {
  serverId: string;
  workspaceId: string;
  status: WorkspaceDescriptor["status"];
}): WorkspaceReadStateController {
  const supportsMarkUnread = useHostFeature(serverId, "workspaceMarkUnread");
  const hasClearableAttention = status === "attention" || status === "failed";
  const canMarkUnread = supportsMarkUnread && status === "done";
  const workspaceKey = `${serverId}:${workspaceId}`;

  const clearAttention = useCallback(async () => {
    if (!hasClearableAttention) {
      return;
    }
    await clearWorkspaceAttention(serverId, workspaceId);
    // Mark unread restores finished attention only, so reading a failed workspace has no undo.
    if (supportsMarkUnread && status === "attention") {
      registerWorkspaceUndo({
        kind: "read",
        workspaceKey,
        message: i18n.t("sidebar.undo.markedRead"),
        undo: () => markWorkspaceUnread(serverId, workspaceId),
      });
    }
  }, [hasClearableAttention, serverId, status, supportsMarkUnread, workspaceId, workspaceKey]);

  const markUnread = useCallback(async () => {
    if (!canMarkUnread) {
      return;
    }
    await markWorkspaceUnread(serverId, workspaceId);
    registerWorkspaceUndo({
      kind: "read",
      workspaceKey,
      message: i18n.t("sidebar.undo.markedUnread"),
      undo: () => clearWorkspaceAttention(serverId, workspaceId),
    });
  }, [canMarkUnread, serverId, workspaceId, workspaceKey]);

  return useMemo(
    () => ({ hasClearableAttention, canMarkUnread, clearAttention, markUnread }),
    [canMarkUnread, clearAttention, hasClearableAttention, markUnread],
  );
}
