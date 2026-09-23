import type { ActiveWorkspaceSelection } from "@/stores/navigation-active-workspace-store";
import {
  resolveWorkspaceArchiveRedirectTarget,
  type ArchiveNeighborCandidate,
} from "@/utils/workspace-archive-navigation";

export interface RedirectIfArchivingActiveWorkspaceInput {
  serverId: string;
  workspaceId: string;
  activeWorkspaceSelection: ActiveWorkspaceSelection | null;
}

export interface RedirectIfArchivingActiveWorkspaceDeps {
  /** Each project's workspaces, in sidebar order. */
  readSidebarWorkspaces: () => ReadonlyArray<readonly ArchiveNeighborCandidate[]>;
  navigateToWorkspace: (selection: ActiveWorkspaceSelection) => void;
  navigateToHome: () => void;
}

export function redirectIfArchivingActiveWorkspace(
  input: RedirectIfArchivingActiveWorkspaceInput,
  deps: RedirectIfArchivingActiveWorkspaceDeps,
): boolean {
  if (
    input.activeWorkspaceSelection?.serverId !== input.serverId ||
    input.activeWorkspaceSelection.workspaceId !== input.workspaceId
  ) {
    return false;
  }

  const target = resolveWorkspaceArchiveRedirectTarget({
    archived: { serverId: input.serverId, workspaceId: input.workspaceId },
    projects: deps.readSidebarWorkspaces(),
  });
  if (target.kind === "workspace") {
    deps.navigateToWorkspace({ serverId: target.serverId, workspaceId: target.workspaceId });
  } else {
    deps.navigateToHome();
  }
  return true;
}
