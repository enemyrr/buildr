import {
  collectAllPanes,
  collectAllTabs,
  createWorkspaceLayoutWithExplorerSidebar,
  DEFAULT_PANE_ID,
  findPaneContainingTab,
  resolveExplorerSidebarPaneId,
  useWorkspaceLayoutStore,
} from "@/stores/workspace-layout-store";
import type { OpenInSidePanePreferences, PullRequestOpenLocation } from "@/hooks/use-settings";
import type { ExplorerCheckoutContext } from "@/stores/explorer-checkout-context";
import {
  openExplorerSidebarView,
  usesCompactExplorerSidebar,
  type ExplorerSidebarView,
} from "@/workspace-tabs/explorer-sidebar";
import { openPreferredWorkspaceTarget } from "@/workspace-tabs/open-beside";

interface WorkspaceViewInput {
  isCompact: boolean;
  workspaceKey: string | null;
  checkout: ExplorerCheckoutContext | null;
  supportsPaneSplits?: boolean;
}

interface OpenWorkspaceChangesInput extends WorkspaceViewInput {
  preferences: OpenInSidePanePreferences;
}

interface OpenWorkspacePullRequestInput extends WorkspaceViewInput {
  destination: PullRequestOpenLocation;
}

function openExplorerView(input: WorkspaceViewInput, view: ExplorerSidebarView): void {
  openExplorerSidebarView({ ...input, view });
}

/** Opens the workspace Changes view according to the current layout and diff preference. */
export function openWorkspaceChanges(input: OpenWorkspaceChangesInput): string | null {
  if (usesCompactExplorerSidebar(input)) {
    openExplorerView(input, "changes");
    return null;
  }
  return openPreferredWorkspaceTarget({
    isCompact: input.isCompact,
    workspaceKey: input.workspaceKey,
    target: { kind: "working_diff" },
    source: "diffs",
    preferences: input.preferences,
  });
}

/** Opens the workspace pull request at its semantic destination. */
export function openWorkspacePullRequest(input: OpenWorkspacePullRequestInput): string | null {
  if (usesCompactExplorerSidebar(input) || input.destination === "explorer") {
    openExplorerView(input, "pr");
    return null;
  }
  if (!input.workspaceKey) return null;
  const workspaceKey = input.workspaceKey;
  const store = useWorkspaceLayoutStore.getState();
  const layout = store.layoutByWorkspace[workspaceKey];
  // Explorer always carries a Checks tab, so main and side get their own instance.
  if (layout) {
    const explorerPaneId = resolveExplorerSidebarPaneId(
      layout,
      store.explorerSidebarPaneIdByWorkspace[workspaceKey],
    );
    const existing = collectAllTabs(layout.root).find(
      (tab) =>
        tab.target.kind === "pull_request" &&
        findPaneContainingTab(layout.root, tab.tabId)?.id !== explorerPaneId,
    );
    if (existing) {
      store.focusTab(workspaceKey, existing.tabId);
      return existing.tabId;
    }
  }
  const sidePaneId = input.destination === "side" ? store.ensureSidePane(workspaceKey) : null;
  return store.openTab({
    workspaceKey,
    target: { kind: "pull_request" },
    intent: "new",
    placement: sidePaneId ? { mode: "prefer", paneId: sidePaneId } : undefined,
  });
}

/** Adds a detected desktop PR once without revealing or selecting its destination. */
export function autoOpenWorkspacePullRequest(input: {
  workspaceKey: string | null;
  destination: PullRequestOpenLocation;
}): string | null {
  if (!input.workspaceKey) return null;
  const workspaceKey = input.workspaceKey;
  const store = useWorkspaceLayoutStore.getState();
  return store.autoOpenPullRequestTab(workspaceKey, () => {
    const layout =
      store.layoutByWorkspace[workspaceKey] ?? createWorkspaceLayoutWithExplorerSidebar();
    // A background open finds an existing PR tab wherever the user left it.
    if (collectAllTabs(layout.root).some((tab) => tab.target.kind === "pull_request")) {
      return {};
    }
    const explorerPaneId = resolveExplorerSidebarPaneId(
      layout,
      store.explorerSidebarPaneIdByWorkspace[workspaceKey],
    );
    let paneId = explorerPaneId;
    if (input.destination === "side") {
      paneId = store.ensureSidePane(workspaceKey, { focus: false });
    } else if (input.destination === "main") {
      const panes = collectAllPanes(layout.root);
      const mainPane =
        panes.find((pane) => pane.id === DEFAULT_PANE_ID) ??
        panes.find((pane) => pane.id !== explorerPaneId && !pane.hidden);
      paneId = mainPane?.id ?? null;
    }
    const changes =
      input.destination === "explorer"
        ? collectAllTabs(layout.root).find(
            (tab) =>
              tab.target.kind === "changes_tree" &&
              findPaneContainingTab(layout.root, tab.tabId)?.id === paneId,
          )
        : undefined;
    return {
      placement: paneId ? { mode: "prefer", paneId } : undefined,
      insertionPosition: changes ? { afterTabId: changes.tabId } : undefined,
    };
  });
}
