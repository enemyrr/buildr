import AsyncStorage from "@react-native-async-storage/async-storage";
import { z } from "zod";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { WORKSPACE_BOARD_STATUSES, type WorkspaceBoardStatus } from "@/dashboard/board-status";
import { createValidatedPersistStorage } from "@/storage/validated-persist-storage";

export type { WorkspaceBoardStatus } from "@/dashboard/board-status";

interface WorkspaceStatusStoreState {
  /** Manual board-status overrides keyed by `serverId:workspaceId`. */
  overrides: Record<string, WorkspaceBoardStatus>;
}

const WorkspaceStatusPersistedStateSchema = z.strictObject({
  overrides: z.record(z.string(), z.enum(WORKSPACE_BOARD_STATUSES)),
});

export const useWorkspaceStatusStore = create<WorkspaceStatusStoreState>()(
  persist(() => ({ overrides: {} }), {
    name: "workspace-board-status",
    version: 1,
    storage: createValidatedPersistStorage(AsyncStorage, WorkspaceStatusPersistedStateSchema),
  }),
);

/** The workspace's board status: the manual override when set, otherwise `derived`. */
export function useWorkspaceBoardStatus(
  workspaceKey: string,
  derived: WorkspaceBoardStatus,
): WorkspaceBoardStatus {
  return useWorkspaceStatusStore((state) => state.overrides[workspaceKey] ?? derived);
}

/** Pass `null` to clear the override and fall back to the PR-derived status. */
export function setWorkspaceBoardStatus(
  workspaceKey: string,
  status: WorkspaceBoardStatus | null,
): void {
  useWorkspaceStatusStore.setState((state) => {
    const overrides = { ...state.overrides };
    if (status === null) {
      delete overrides[workspaceKey];
    } else {
      overrides[workspaceKey] = status;
    }
    return { overrides };
  });
}
