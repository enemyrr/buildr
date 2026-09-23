import {
  collectAllTabs,
  findPaneById,
  type WorkspaceLayout,
} from "@/stores/workspace-layout-store";
import type { WorkspaceTab, WorkspaceTabTarget } from "@/workspace-tabs/model";

export type WorkspaceChatTab = WorkspaceTab & {
  target: Extract<WorkspaceTabTarget, { kind: "agent" | "draft" }>;
};

function isChatTab(tab: WorkspaceTab | undefined): tab is WorkspaceChatTab {
  return tab?.target.kind === "agent" || tab?.target.kind === "draft";
}

function newestTab(tabs: WorkspaceTab[], kind: "agent" | "draft"): WorkspaceChatTab | null {
  let newest: WorkspaceChatTab | null = null;
  for (const tab of tabs) {
    if (tab.target.kind !== kind || !isChatTab(tab)) continue;
    if (!newest || tab.createdAt > newest.createdAt) newest = tab;
  }
  return newest;
}

/**
 * The chat a git request goes to. With `preferFocused`, the focused pane's chat or draft
 * answers first; otherwise the newest chat, then the newest draft. Null means open a new chat.
 */
export function selectWorkspaceChatTab(
  layout: WorkspaceLayout | undefined,
  { preferFocused }: { preferFocused: boolean },
): WorkspaceChatTab | null {
  if (!layout) return null;
  const tabs = collectAllTabs(layout.root);
  if (preferFocused) {
    const focusedTabId = findPaneById(layout.root, layout.focusedPaneId)?.focusedTabId ?? null;
    const focused = tabs.find((tab) => tab.tabId === focusedTabId);
    if (isChatTab(focused)) return focused;
  }
  return newestTab(tabs, "agent") ?? newestTab(tabs, "draft");
}
