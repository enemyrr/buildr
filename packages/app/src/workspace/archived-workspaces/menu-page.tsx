import { useCallback, useMemo, type ReactElement } from "react";
import { Text } from "react-native";
import { useTranslation } from "react-i18next";
import { Archive } from "lucide-react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import type { ArchivedWorkspaceSummary } from "@getpaseo/protocol/messages";
import { MenuItem, MenuSubTrigger, type MenuPageDefinition } from "@/components/ui/menu";
import { useFetchQuery } from "@/data/query";
import { useHostRuntimeClient, useHostRuntimeIsConnected } from "@/runtime/host-runtime";
import { useHostFeature } from "@/runtime/host-features";
import { navigateToWorkspace } from "@/stores/navigation-active-workspace-store";
import type { Theme } from "@/styles/theme";
import { formatTimeAgo } from "@/utils/time";

const ARCHIVED_WORKSPACES_PAGE_ID = "archived-workspaces";
const NO_PAGES: readonly MenuPageDefinition[] = [];

export interface ArchivedWorkspacesTarget {
  serverId: string;
  projectId: string;
}

const ThemedArchive = withUnistyles(Archive);
const foregroundMutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const leadingIcon = <ThemedArchive size={14} uniProps={foregroundMutedColorMapping} />;

export function useArchivedWorkspacesMenuPages(
  target: ArchivedWorkspacesTarget | null,
): readonly MenuPageDefinition[] {
  const { t } = useTranslation();
  const supported = useHostFeature(target?.serverId, "archivedWorkspaceList");
  return useMemo(() => {
    if (!target || !supported) return NO_PAGES;
    return [
      {
        id: ARCHIVED_WORKSPACES_PAGE_ID,
        title: t("sidebar.project.archived.title"),
        content: <ArchivedWorkspacesPage serverId={target.serverId} projectId={target.projectId} />,
      },
    ];
  }, [supported, t, target]);
}

export function ArchivedWorkspacesMenuTrigger({
  target,
  testID,
}: {
  target: ArchivedWorkspacesTarget | null;
  testID: string;
}): ReactElement | null {
  const { t } = useTranslation();
  const supported = useHostFeature(target?.serverId, "archivedWorkspaceList");
  if (!target || !supported) return null;
  return (
    <MenuSubTrigger id={ARCHIVED_WORKSPACES_PAGE_ID} leading={leadingIcon} testID={testID}>
      {t("sidebar.project.archived.title")}
    </MenuSubTrigger>
  );
}

/** Loads only while the page is open, since pages mount with their flyout or sheet. */
function ArchivedWorkspacesPage({ serverId, projectId }: ArchivedWorkspacesTarget): ReactElement {
  const { t } = useTranslation();
  const client = useHostRuntimeClient(serverId);
  const isConnected = useHostRuntimeIsConnected(serverId);
  const query = useFetchQuery({
    queryKey: ["archivedWorkspaces", serverId, projectId],
    dataShape: "list",
    staleTimeMs: 0,
    queryFn: () => {
      if (!client) throw new Error("Host unavailable");
      return client.listArchivedWorkspaces(projectId);
    },
    enabled: isConnected && client !== null,
  });

  if (query.isError) {
    return <MenuItem disabled>{t("sidebar.project.archived.loadFailed")}</MenuItem>;
  }
  if (!query.data) {
    return <MenuItem disabled>{t("common.states.loading")}</MenuItem>;
  }
  if (query.data.length === 0) {
    return <MenuItem disabled>{t("sidebar.project.archived.empty")}</MenuItem>;
  }
  return (
    <>
      {query.data.map((workspace) => (
        <ArchivedWorkspaceItem
          key={workspace.workspaceId}
          serverId={serverId}
          workspace={workspace}
        />
      ))}
    </>
  );
}

function ArchivedWorkspaceItem({
  serverId,
  workspace,
}: {
  serverId: string;
  workspace: ArchivedWorkspaceSummary;
}): ReactElement {
  const trailing = useMemo(
    () => <Text style={styles.time}>{formatTimeAgo(new Date(workspace.archivedAt))}</Text>,
    [workspace.archivedAt],
  );
  // The workspace route renders an archived workspace as its Restore view.
  const handleSelect = useCallback(() => {
    navigateToWorkspace({ serverId, workspaceId: workspace.workspaceId });
  }, [serverId, workspace.workspaceId]);
  const description =
    workspace.branch && workspace.branch !== workspace.name ? workspace.branch : undefined;

  return (
    <MenuItem
      description={description}
      trailing={trailing}
      onSelect={handleSelect}
      testID={`archived-workspace-${workspace.workspaceId}`}
    >
      {workspace.name}
    </MenuItem>
  );
}

const styles = StyleSheet.create((theme) => ({
  time: {
    color: theme.colors.foregroundExtraMuted,
    fontSize: theme.fontSize.sm,
  },
}));
