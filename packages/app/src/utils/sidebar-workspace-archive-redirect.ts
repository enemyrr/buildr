import { router } from "expo-router";
import { navigateToWorkspace } from "@/stores/navigation-active-workspace-store";
import { useSessionStore } from "@/stores/session-store";
import {
  composeWorkspaceStructure,
  selectWorkspaceStructureProjects,
} from "@/stores/session-store-hooks/selectors";
import { useSidebarOrderStore } from "@/stores/sidebar-order-store";
import { buildHomeRoute } from "@/utils/host-routes";
import { collectArchiveNeighborCandidates } from "@/utils/workspace-archive-navigation";
import {
  redirectIfArchivingActiveWorkspace as redirectIfArchivingActiveWorkspacePure,
  type RedirectIfArchivingActiveWorkspaceInput,
} from "@/utils/workspace-archive-redirect";

function readSidebarWorkspaces() {
  const sessionState = useSessionStore.getState();
  const orderState = useSidebarOrderStore.getState();
  const { projects } = composeWorkspaceStructure({
    projects: selectWorkspaceStructureProjects(sessionState, Object.keys(sessionState.sessions)),
    projectOrder: orderState.projectOrder ?? [],
    workspaceOrderByScope: orderState.workspaceOrderByProject ?? {},
  });
  return collectArchiveNeighborCandidates({ projects, sessions: sessionState.sessions });
}

export function redirectIfArchivingActiveWorkspace(
  input: RedirectIfArchivingActiveWorkspaceInput,
): boolean {
  return redirectIfArchivingActiveWorkspacePure(input, {
    readSidebarWorkspaces,
    navigateToWorkspace: (selection) => {
      navigateToWorkspace(selection);
    },
    navigateToHome: () => router.replace(buildHomeRoute()),
  });
}
