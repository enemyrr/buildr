import { useMemo, useRef } from "react";
import { shallow } from "zustand/shallow";
import { useStoreWithEqualityFn } from "zustand/traditional";
import type { SidebarProjectEntry } from "@/hooks/use-sidebar-workspaces-list";
import { useSessionStore } from "@/stores/session-store";
import {
  areSnoozedSidebarKeysEqual,
  buildSnoozedSidebarKeys,
  collectSnoozeCandidates,
  type SnoozedSidebarKeys,
  type WorkspaceSnoozeFields,
} from "./sidebar";
import { useSnoozeClock } from "./use-snooze-clock";

const EMPTY_KEYS: SnoozedSidebarKeys = { snoozedWorkspaceKeys: [], untilByKey: {} };

/** Mirrors `usePinnedSidebarKeys`: reads the session store directly so project mode stays cheap. */
export function useSnoozedSidebarKeys(projects: SidebarProjectEntry[]): SnoozedSidebarKeys {
  const previousKeysRef = useRef<SnoozedSidebarKeys>(EMPTY_KEYS);
  const serverIds = useMemo(
    () =>
      Array.from(
        new Set(
          projects.flatMap((project) => project.workspaces.map((workspace) => workspace.serverId)),
        ),
      ),
    [projects],
  );
  const workspaceMaps = useStoreWithEqualityFn(
    useSessionStore,
    (state) => serverIds.map((serverId) => state.sessions[serverId]?.workspaces ?? null),
    shallow,
  );
  const candidates = useMemo(() => {
    const workspaceMapByServerId = new Map<string, ReadonlyMap<string, WorkspaceSnoozeFields>>();
    serverIds.forEach((serverId, index) => {
      const workspaceMap = workspaceMaps[index];
      if (workspaceMap) {
        workspaceMapByServerId.set(serverId, workspaceMap);
      }
    });
    return collectSnoozeCandidates({ projects, workspaceMaps: workspaceMapByServerId });
  }, [projects, serverIds, workspaceMaps]);
  const snoozes = useMemo(
    () => candidates.map((candidate) => candidate.state.snooze),
    [candidates],
  );
  const nowMs = useSnoozeClock(snoozes);
  return useMemo(() => {
    const nextKeys = buildSnoozedSidebarKeys(candidates, nowMs);
    if (areSnoozedSidebarKeysEqual(previousKeysRef.current, nextKeys)) {
      return previousKeysRef.current;
    }
    previousKeysRef.current = nextKeys;
    return nextKeys;
  }, [candidates, nowMs]);
}
