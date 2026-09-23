import { create } from "zustand";

/**
 * Which workspace header shows its title as an inline input, keyed `${serverId}:${routeWorkspaceId}`.
 * A store rather than header state because the command center starts the edit from outside the
 * screen that owns the header.
 */
interface WorkspaceHeaderRenameState {
  workspaceKey: string | null;
  start: (workspaceKey: string) => void;
  stop: (workspaceKey?: string) => void;
}

export const useWorkspaceHeaderRenameStore = create<WorkspaceHeaderRenameState>((set) => ({
  workspaceKey: null,
  start: (workspaceKey) => set({ workspaceKey }),
  stop: (workspaceKey) =>
    set((state) =>
      workspaceKey === undefined || state.workspaceKey === workspaceKey
        ? { workspaceKey: null }
        : state,
    ),
}));

export function buildWorkspaceHeaderRenameKey(serverId: string, workspaceId: string): string {
  return `${serverId}:${workspaceId}`;
}
