import { useEffect } from "react";
import { router, usePathname, type Href } from "expo-router";
import { create } from "zustand";
import {
  canStepNavigationHistory,
  EMPTY_NAVIGATION_HISTORY,
  isNavigationHistoryPathname,
  recordNavigationHistoryEntry,
  stepNavigationHistory,
  type NavigationHistoryEntry,
  type NavigationHistoryState,
} from "@/navigation/navigation-history";
import { navigateToWorkspace } from "@/stores/navigation-active-workspace-store";
import {
  collectAllTabs,
  findPaneById,
  useWorkspaceLayoutStore,
} from "@/stores/workspace-layout-store";
import { parseHostWorkspaceRouteFromPathname } from "@/utils/host-routes";
import { buildWorkspaceTabPersistenceKey } from "@/workspace-tabs/model";

// Paseo flattens workspace hops with POP_TO, so router history cannot answer Back/Forward.
const useNavigationHistoryStore = create<NavigationHistoryState>(() => EMPTY_NAVIGATION_HISTORY);

function workspaceKeyForPathname(pathname: string): string | null {
  const workspace = parseHostWorkspaceRouteFromPathname(pathname);
  return workspace ? buildWorkspaceTabPersistenceKey(workspace) : null;
}

function useFocusedMainTabId(workspaceKey: string | null): string | null {
  return useWorkspaceLayoutStore((state) => {
    const layout = workspaceKey ? state.layoutByWorkspace[workspaceKey] : undefined;
    if (!workspaceKey || !layout) {
      return null;
    }
    if (layout.focusedPaneId === state.explorerSidebarPaneIdByWorkspace[workspaceKey]) {
      return null;
    }
    return findPaneById(layout.root, layout.focusedPaneId)?.focusedTabId ?? null;
  });
}

export function useNavigationHistoryRecorder(): void {
  const pathname = usePathname();
  const tabId = useFocusedMainTabId(workspaceKeyForPathname(pathname));

  useEffect(() => {
    if (!isNavigationHistoryPathname(pathname)) {
      return;
    }
    useNavigationHistoryStore.setState((state) =>
      recordNavigationHistoryEntry(state, { pathname, tabId }),
    );
  }, [pathname, tabId]);
}

function navigateToEntry(entry: NavigationHistoryEntry): void {
  const workspace = parseHostWorkspaceRouteFromPathname(entry.pathname);
  if (!workspace) {
    router.navigate(entry.pathname as Href);
    return;
  }
  const workspaceKey = buildWorkspaceTabPersistenceKey(workspace);
  const layout = workspaceKey
    ? useWorkspaceLayoutStore.getState().layoutByWorkspace[workspaceKey]
    : undefined;
  const tab = layout ? collectAllTabs(layout.root).find((t) => t.tabId === entry.tabId) : undefined;
  navigateToWorkspace({ ...workspace, target: tab?.target });
}

export function stepNavigation(delta: 1 | -1): void {
  const result = stepNavigationHistory(useNavigationHistoryStore.getState(), delta);
  if (!result) {
    return;
  }
  useNavigationHistoryStore.setState(result.state);
  navigateToEntry(result.entry);
}

export function useCanStepNavigation(delta: 1 | -1): boolean {
  return useNavigationHistoryStore((state) => canStepNavigationHistory(state, delta));
}
