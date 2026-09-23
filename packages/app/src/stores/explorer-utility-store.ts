import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { persist, type StateStorage } from "zustand/middleware";
import { z } from "zod";
import { createValidatedPersistStorage } from "@/storage/validated-persist-storage";

export type ExplorerUtilityTab = "setup" | "run" | "terminal";

interface ExplorerUtilityState {
  collapsed: boolean;
  tab: ExplorerUtilityTab;
  /** The Terminal panel's shell per workspace. It has no workspace tab, so tab sync skips it. */
  terminalIdByWorkspace: Record<string, string>;
  /** The script whose output the Run panel shows, per workspace. */
  runScriptByWorkspace: Record<string, string>;
  setCollapsed: (collapsed: boolean) => void;
  selectTab: (tab: ExplorerUtilityTab) => void;
  setTerminalId: (workspaceKey: string, terminalId: string) => void;
  setRunScript: (workspaceKey: string, scriptName: string) => void;
}

const ExplorerUtilitySchema = z.strictObject({
  collapsed: z.boolean(),
  tab: z.enum(["setup", "run", "terminal"]),
  terminalIdByWorkspace: z.record(z.string(), z.string()),
  runScriptByWorkspace: z.record(z.string(), z.string()),
});

type PersistedExplorerUtility = z.infer<typeof ExplorerUtilitySchema>;

const DEFAULTS: PersistedExplorerUtility = {
  collapsed: false,
  tab: "run",
  terminalIdByWorkspace: {},
  runScriptByWorkspace: {},
};

export function createExplorerUtilityStore(storage: StateStorage) {
  return create<ExplorerUtilityState>()(
    persist<ExplorerUtilityState, [], [], PersistedExplorerUtility>(
      (set) => ({
        ...DEFAULTS,
        setCollapsed: (collapsed) => set({ collapsed }),
        selectTab: (tab) => set({ tab, collapsed: false }),
        setTerminalId: (workspaceKey, terminalId) =>
          set((state) => ({
            terminalIdByWorkspace: { ...state.terminalIdByWorkspace, [workspaceKey]: terminalId },
          })),
        setRunScript: (workspaceKey, scriptName) =>
          set((state) => ({
            runScriptByWorkspace: { ...state.runScriptByWorkspace, [workspaceKey]: scriptName },
          })),
      }),
      {
        name: "explorer-utility",
        version: 1,
        storage: createValidatedPersistStorage(storage, ExplorerUtilitySchema),
        partialize: (state) => ({
          collapsed: state.collapsed,
          tab: state.tab,
          terminalIdByWorkspace: state.terminalIdByWorkspace,
          runScriptByWorkspace: state.runScriptByWorkspace,
        }),
        merge: (persistedState, currentState) => {
          const result = ExplorerUtilitySchema.safeParse(persistedState);
          return { ...currentState, ...(result.success ? result.data : DEFAULTS) };
        },
      },
    ),
  );
}

export const useExplorerUtilityStore = createExplorerUtilityStore(AsyncStorage);
