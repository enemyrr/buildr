import { useEffect, useMemo } from "react";
import { useShallow } from "zustand/shallow";
import type { WorkspaceSnooze } from "@getpaseo/protocol/messages";
import { useSessionStore, type WorkspaceDescriptor } from "@/stores/session-store";
import { clearWorkspaceSnooze, type SnoozeTarget } from "./actions";
import { hasExpiredSnooze } from "./model";
import { useSnoozeClock } from "./use-snooze-clock";

interface SnoozedWorkspace extends SnoozeTarget {
  workspace: WorkspaceDescriptor & { snooze: WorkspaceSnooze };
}

// Keyed by workspace and snooze start, so each snooze is cleared at most once.
const clearedSnoozes = new Set<string>();

function selectSnoozedWorkspaces(
  serverIds: readonly string[],
  workspaceMaps: readonly ReadonlyMap<string, WorkspaceDescriptor>[],
): SnoozedWorkspace[] {
  const snoozed: SnoozedWorkspace[] = [];
  serverIds.forEach((serverId, index) => {
    for (const workspace of workspaceMaps[index]?.values() ?? []) {
      const snooze = workspace.snooze;
      if (snooze) {
        snoozed.push({
          serverId,
          workspaceId: workspace.id,
          workspaceKey: `${serverId}:${workspace.id}`,
          workspace: { ...workspace, snooze },
        });
      }
    }
  });
  return snoozed;
}

/**
 * Clears snoozes that stopped hiding their workspace, whether the wake time passed or the agent
 * raised its hand. Without the clear, reading a workspace that woke early would move it back into
 * Snoozed until the original wake time.
 */
export function SnoozeWakeHost() {
  const serverIds = useSessionStore(useShallow((state) => Object.keys(state.sessions)));
  const workspaceMaps = useSessionStore(
    useShallow((state) => Object.values(state.sessions).map((session) => session.workspaces)),
  );
  const snoozedWorkspaces = useMemo(
    () => selectSnoozedWorkspaces(serverIds, workspaceMaps),
    [serverIds, workspaceMaps],
  );
  const snoozes = useMemo(
    () => snoozedWorkspaces.map((entry) => entry.workspace.snooze),
    [snoozedWorkspaces],
  );
  const nowMs = useSnoozeClock(snoozes);

  useEffect(() => {
    for (const entry of snoozedWorkspaces) {
      const { snooze, status, statusEnteredAt } = entry.workspace;
      if (!hasExpiredSnooze({ snooze, status, statusEnteredAt }, nowMs)) {
        continue;
      }
      const clearKey = `${entry.workspaceKey}|${snooze.snoozedAt}`;
      if (clearedSnoozes.has(clearKey)) {
        continue;
      }
      clearedSnoozes.add(clearKey);
      // A failed clear retries on the next store change instead of looping.
      void clearWorkspaceSnooze(entry).catch(() => {
        clearedSnoozes.delete(clearKey);
      });
    }
  }, [nowMs, snoozedWorkspaces]);

  return null;
}
