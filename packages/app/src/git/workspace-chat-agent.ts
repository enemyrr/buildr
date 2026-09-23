import {
  collectAllTabs,
  findPaneById,
  useWorkspaceLayoutStore,
  type WorkspaceLayout,
} from "@/stores/workspace-layout-store";
import { buildWorkspaceTabPersistenceKey } from "@/workspace-tabs/model";

/** The chat git requests go to: the focused pane's agent, else the newest agent tab. */
export function selectWorkspaceChatAgentId(layout: WorkspaceLayout | undefined): string | null {
  if (!layout) return null;
  const tabs = collectAllTabs(layout.root);
  const focusedTabId = findPaneById(layout.root, layout.focusedPaneId)?.focusedTabId ?? null;
  const focused = tabs.find((tab) => tab.tabId === focusedTabId);
  if (focused?.target.kind === "agent") return focused.target.agentId;
  let newest: { agentId: string; createdAt: number } | null = null;
  for (const tab of tabs) {
    if (tab.target.kind !== "agent") continue;
    if (!newest || tab.createdAt > newest.createdAt) {
      newest = { agentId: tab.target.agentId, createdAt: tab.createdAt };
    }
  }
  return newest?.agentId ?? null;
}

export function useWorkspaceChatAgentId(
  serverId: string,
  workspaceId: string | null,
): string | null {
  const workspaceKey = workspaceId
    ? buildWorkspaceTabPersistenceKey({ serverId, workspaceId })
    : null;
  return useWorkspaceLayoutStore((state) =>
    workspaceKey ? selectWorkspaceChatAgentId(state.layoutByWorkspace[workspaceKey]) : null,
  );
}
