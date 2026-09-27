import type { WorkspaceSnooze } from "@getpaseo/protocol/messages";
import type {
  SidebarProjectEntry,
  SidebarWorkspacePlacement,
} from "@/hooks/sidebar-workspaces-view-model";
import type { WorkspaceDescriptor } from "@/stores/session-store";
import { isWorkspaceSnoozed, type WorkspaceSnoozeState } from "./model";

export interface SnoozedSidebarKeys {
  /** Snoozed workspaces, soonest wake first. */
  snoozedWorkspaceKeys: string[];
  untilByKey: Record<string, string>;
}

export type WorkspaceSnoozeFields = Pick<
  WorkspaceDescriptor,
  "snooze" | "status" | "statusEnteredAt"
>;

export interface SnoozeCandidate {
  workspaceKey: string;
  state: WorkspaceSnoozeState & { snooze: WorkspaceSnooze };
}

/** Returns every workspace in `projects` that carries a snooze, whether or not it still hides it. */
export function collectSnoozeCandidates(input: {
  projects: readonly SidebarProjectEntry[];
  workspaceMaps: ReadonlyMap<string, ReadonlyMap<string, WorkspaceSnoozeFields>>;
}): SnoozeCandidate[] {
  const candidates: SnoozeCandidate[] = [];
  for (const project of input.projects) {
    for (const placement of project.workspaces) {
      const workspace = input.workspaceMaps.get(placement.serverId)?.get(placement.workspaceId);
      const snooze = workspace?.snooze;
      if (!workspace || !snooze) {
        continue;
      }
      candidates.push({
        workspaceKey: placement.workspaceKey,
        state: { snooze, status: workspace.status, statusEnteredAt: workspace.statusEnteredAt },
      });
    }
  }
  return candidates;
}

export function buildSnoozedSidebarKeys(
  candidates: readonly SnoozeCandidate[],
  nowMs: number,
): SnoozedSidebarKeys {
  const untilByKey: Record<string, string> = {};
  for (const candidate of candidates) {
    if (isWorkspaceSnoozed(candidate.state, nowMs)) {
      untilByKey[candidate.workspaceKey] = candidate.state.snooze.until;
    }
  }
  const snoozedWorkspaceKeys = Object.keys(untilByKey).sort((left, right) =>
    (untilByKey[left] ?? "").localeCompare(untilByKey[right] ?? ""),
  );
  return { snoozedWorkspaceKeys, untilByKey };
}

export function areSnoozedSidebarKeysEqual(
  left: SnoozedSidebarKeys,
  right: SnoozedSidebarKeys,
): boolean {
  if (left.snoozedWorkspaceKeys.length !== right.snoozedWorkspaceKeys.length) {
    return false;
  }
  return left.snoozedWorkspaceKeys.every(
    (key, index) =>
      key === right.snoozedWorkspaceKeys[index] && left.untilByKey[key] === right.untilByKey[key],
  );
}

export interface SnoozedSidebarSplit {
  /** Snoozed workspaces in wake order, hoisted out of their projects. */
  snoozedWorkspaces: SidebarWorkspacePlacement[];
  /** Every project with its snoozed workspaces removed. Projects themselves always stay. */
  awakeProjects: SidebarProjectEntry[];
}

export function splitSnoozedSidebarWorkspaces(input: {
  projects: SidebarProjectEntry[];
  keys: SnoozedSidebarKeys;
}): SnoozedSidebarSplit {
  if (input.keys.snoozedWorkspaceKeys.length === 0) {
    return { snoozedWorkspaces: [], awakeProjects: input.projects };
  }
  const snoozedByKey = new Map<string, SidebarWorkspacePlacement>();
  const awakeProjects = input.projects.map((project) => {
    const awake = project.workspaces.filter((workspace) => {
      if (input.keys.untilByKey[workspace.workspaceKey] === undefined) {
        return true;
      }
      snoozedByKey.set(workspace.workspaceKey, workspace);
      return false;
    });
    return awake.length === project.workspaces.length ? project : { ...project, workspaces: awake };
  });
  const snoozedWorkspaces = input.keys.snoozedWorkspaceKeys.flatMap((key) => {
    const workspace = snoozedByKey.get(key);
    return workspace ? [workspace] : [];
  });
  return { snoozedWorkspaces, awakeProjects };
}
