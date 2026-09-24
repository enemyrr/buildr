import type { WorkspaceStructureProject } from "@/projects/workspace-structure";
import type { ActiveWorkspaceSelection } from "@/stores/last-workspace-selection";
import type { WorkspaceDescriptor } from "@/stores/session-store";
import { normalizeWorkspaceOpaqueId } from "@/utils/workspace-identity";

export interface ArchiveNeighborCandidate {
  serverId: string;
  workspaceId: string;
  /** Already being archived; never a redirect target. */
  archiving: boolean;
}

export type WorkspaceArchiveRedirectTarget =
  | { kind: "workspace"; serverId: string; workspaceId: string }
  | { kind: "home" };

interface ArchiveNeighborSession {
  workspaces: Map<string, WorkspaceDescriptor>;
}

/**
 * Picks where to go after archiving the viewed workspace: the next workspace below it in its
 * project, else the one above it, else home. Jumping into another project would switch context
 * the user did not ask for. `projects` lists each project's workspaces in sidebar order.
 */
export function resolveWorkspaceArchiveRedirectTarget(input: {
  archived: ActiveWorkspaceSelection;
  projects: ReadonlyArray<readonly ArchiveNeighborCandidate[]>;
}): WorkspaceArchiveRedirectTarget {
  const archivedWorkspaceId = normalizeWorkspaceOpaqueId(input.archived.workspaceId);
  const isArchived = (candidate: ArchiveNeighborCandidate) =>
    candidate.serverId === input.archived.serverId && candidate.workspaceId === archivedWorkspaceId;
  const isTarget = (candidate: ArchiveNeighborCandidate) =>
    !candidate.archiving && !isArchived(candidate);

  for (const workspaces of input.projects) {
    const index = workspaces.findIndex(isArchived);
    if (index === -1) continue;
    const neighbor =
      workspaces.slice(index + 1).find(isTarget) ?? workspaces.slice(0, index).findLast(isTarget);
    if (neighbor) return toWorkspaceTarget(neighbor);
    break;
  }
  return { kind: "home" };
}

/** Turns sidebar-ordered projects into neighbor candidates. */
export function collectArchiveNeighborCandidates(input: {
  projects: readonly WorkspaceStructureProject[];
  sessions: Record<string, ArchiveNeighborSession | undefined>;
}): ArchiveNeighborCandidate[][] {
  const candidateByKey = new Map<string, ArchiveNeighborCandidate>();
  for (const [serverId, session] of Object.entries(input.sessions)) {
    if (!session) continue;
    for (const workspace of session.workspaces.values()) {
      candidateByKey.set(`${serverId}:${workspace.id}`, {
        serverId,
        workspaceId: workspace.id,
        archiving: workspace.archivingAt !== null,
      });
    }
  }

  return input.projects.map((project) =>
    project.workspaceKeys.flatMap((key) => {
      const candidate = candidateByKey.get(key);
      return candidate ? [candidate] : [];
    }),
  );
}

function toWorkspaceTarget(candidate: ArchiveNeighborCandidate): WorkspaceArchiveRedirectTarget {
  return { kind: "workspace", serverId: candidate.serverId, workspaceId: candidate.workspaceId };
}
