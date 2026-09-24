import { useCallback, useMemo } from "react";
import { i18n } from "@/i18n/i18next";
import { useHostFeature } from "@/runtime/host-features";
import { getHostRuntimeStore } from "@/runtime/host-runtime";
import type { WorkspaceDescriptor } from "@/stores/session-store";
import { markWorkspaceUnread } from "@/workspace/mark-unread";

export interface WorkspaceReadStateController {
  hasClearableAttention: boolean;
  canMarkUnread: boolean;
  clearAttention: () => Promise<void>;
  markUnread: () => Promise<void>;
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

  const clearAttention = useCallback(async () => {
    if (!hasClearableAttention) {
      return;
    }
    const client = getHostRuntimeStore().getClient(serverId);
    if (!client) {
      throw new Error(i18n.t("workspace.terminal.hostDisconnected"));
    }
    await client.clearWorkspaceAttention(workspaceId);
  }, [hasClearableAttention, serverId, workspaceId]);

  const markUnread = useCallback(async () => {
    if (!canMarkUnread) {
      return;
    }
    await markWorkspaceUnread(serverId, workspaceId);
  }, [canMarkUnread, serverId, workspaceId]);

  return useMemo(
    () => ({ hasClearableAttention, canMarkUnread, clearAttention, markUnread }),
    [canMarkUnread, clearAttention, hasClearableAttention, markUnread],
  );
}
