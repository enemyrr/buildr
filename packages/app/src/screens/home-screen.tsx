import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View, type PressableStateCallbackType } from "react-native";
import { useIsFocused } from "@react-navigation/native";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { StyleSheet } from "react-native-unistyles";
import { Plus } from "lucide-react-native";
import { DiffStat } from "@/components/diff-stat";
import { MenuHeader } from "@/components/headers/menu-header";
import { ProjectIconView } from "@/components/project-icon-view";
import {
  SessionsFilterDropdown,
  type SessionsFilterOption,
} from "@/components/sessions-filter-dropdown";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { SearchField } from "@/components/ui/search-field";
import { groupByDay, type HomeDayGroup } from "@/home/day-groups";
import { useCompactTimeAgo } from "@/hooks/use-compact-time-ago";
import { useSidebarWorkspaceEntries } from "@/hooks/use-sidebar-workspace-entries";
import {
  useSidebarWorkspacesList,
  type SidebarProjectEntry,
  type SidebarWorkspaceEntry,
} from "@/hooks/use-sidebar-workspaces-list";
import { createProjectIconTarget, type ProjectIconTarget } from "@/projects/icon-target";
import { useProjectIcons } from "@/projects/icons";
import { useHosts } from "@/runtime/host-runtime";
import { navigateToWorkspace } from "@/stores/navigation-active-workspace-store";
import { ICON_SIZE } from "@/styles/theme";
import { buildNewWorkspaceRoute } from "@/utils/host-routes";
import { projectIconPlaceholderLabelFromDisplayName } from "@/utils/project-display-name";

const ALL_HOSTS: readonly string[] = [];
const ALL_PROJECTS = "__all__";

export function HomeScreen() {
  const isFocused = useIsFocused();
  if (!isFocused) {
    return <View style={styles.container} />;
  }
  return <HomeScreenContent />;
}

function matchesSearch(workspace: SidebarWorkspaceEntry, query: string): boolean {
  return [workspace.name, workspace.projectName, workspace.currentBranch ?? ""].some((value) =>
    value.toLowerCase().includes(query),
  );
}

function dayGroupLabel(group: HomeDayGroup<unknown>, t: TFunction): string {
  if (group.key === "today") return t("agentList.dateSections.today");
  if (group.key === "yesterday") return t("agentList.dateSections.yesterday");
  if (group.daysAgo !== null) return t("home.daysAgo", { count: group.daysAgo });
  return t("agentList.dateSections.older");
}

function HomeScreenContent() {
  const { t } = useTranslation();
  const hosts = useHosts();
  const { workspacePlacements, projects, isInitialLoad } = useSidebarWorkspacesList({
    hostFilters: ALL_HOSTS,
  });
  const entries = useSidebarWorkspaceEntries(workspacePlacements);
  const iconByViewKey = useProjectIconsByViewKey(projects);
  const [search, setSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState(ALL_PROJECTS);

  useEffect(() => {
    if (projectFilter === ALL_PROJECTS) return;
    if (!projects.some((project) => project.viewKey === projectFilter)) {
      setProjectFilter(ALL_PROJECTS);
    }
  }, [projectFilter, projects]);

  const projectOptions = useMemo<SessionsFilterOption[]>(
    () => [
      { value: ALL_PROJECTS, label: t("sessions.filters.allProjects") },
      ...projects.map((project) => ({ value: project.viewKey, label: project.projectName })),
    ],
    [projects, t],
  );
  const projectFilterLabel =
    projectOptions.find((option) => option.value === projectFilter)?.label ??
    t("sessions.filters.allProjects");

  const groups = useMemo(() => {
    const query = search.trim().toLowerCase();
    const visible: SidebarWorkspaceEntry[] = [];
    for (const placement of workspacePlacements) {
      if (projectFilter !== ALL_PROJECTS && placement.projectViewKey !== projectFilter) continue;
      const entry = entries.get(placement.workspaceKey);
      if (!entry || entry.archivingAt) continue;
      if (query && !matchesSearch(entry, query)) continue;
      visible.push(entry);
    }
    return groupByDay(visible, (entry) => entry.statusEnteredAt, new Date());
  }, [entries, projectFilter, search, workspacePlacements]);

  const handleCreateWorkspace = useCallback(() => {
    router.push(buildNewWorkspaceRoute());
  }, []);
  const handleClearSearch = useCallback(() => setSearch(""), []);

  const title = hosts.length === 1 ? (hosts[0]?.label ?? t("home.title")) : t("home.title");
  const isFiltering = search.trim().length > 0 || projectFilter !== ALL_PROJECTS;

  return (
    <View style={styles.container} testID="home-screen">
      <MenuHeader title={title} />
      <View style={styles.toolbar}>
        <View style={styles.column}>
          <View style={styles.toolbarRow}>
            <View style={styles.search}>
              <SearchField
                value={search}
                onChangeText={setSearch}
                placeholder={t("home.searchPlaceholder")}
                clearAccessibilityLabel={t("sessions.actions.clearSearch")}
                testID="home-search-input"
              />
            </View>
            <SessionsFilterDropdown
              label={projectFilterLabel}
              options={projectOptions}
              value={projectFilter}
              onChange={setProjectFilter}
              testID="home-project-filter"
            />
            <Button
              size="xs"
              variant="secondary"
              leftIcon={Plus}
              onPress={handleCreateWorkspace}
              testID="home-create-workspace"
            >
              {t("home.createWorkspace")}
            </Button>
          </View>
        </View>
      </View>
      {isInitialLoad ? (
        <View style={styles.centered}>
          <LoadingSpinner size="large" color={styles.spinner.color} />
        </View>
      ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          <View style={styles.column}>
            {groups.length === 0 ? (
              <View style={styles.empty} testID="home-empty">
                <Text style={styles.emptyText}>
                  {isFiltering ? t("home.noMatches") : t("home.empty")}
                </Text>
                {search ? (
                  <Button variant="ghost" onPress={handleClearSearch}>
                    {t("sessions.actions.clearSearch")}
                  </Button>
                ) : null}
              </View>
            ) : (
              groups.map((group) => (
                <View key={group.key} style={styles.group}>
                  <View style={styles.groupHeader}>
                    <Text style={styles.groupTitle}>{dayGroupLabel(group, t)}</Text>
                    <Text style={styles.groupCount}>{group.items.length}</Text>
                  </View>
                  {group.items.map((workspace) => (
                    <HomeWorkspaceRow
                      key={workspace.workspaceKey}
                      workspace={workspace}
                      iconDataUri={iconByViewKey.get(workspace.projectViewKey) ?? null}
                    />
                  ))}
                </View>
              ))
            )}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

function useProjectIconsByViewKey(projects: readonly SidebarProjectEntry[]) {
  const iconTargets = useMemo(
    () =>
      projects.flatMap((project): ProjectIconTarget[] => {
        const host = project.hosts[0];
        if (!host) return [];
        const target = createProjectIconTarget({
          projectViewKey: project.viewKey,
          placement: host,
        });
        return target ? [target] : [];
      }),
    [projects],
  );
  return useProjectIcons({ projects: iconTargets });
}

const rowStyle = ({
  hovered = false,
  pressed,
}: PressableStateCallbackType & { hovered?: boolean }) => [
  styles.row,
  (hovered || pressed) && styles.rowHovered,
];

const HomeWorkspaceRow = memo(function HomeWorkspaceRow({
  workspace,
  iconDataUri,
}: {
  workspace: SidebarWorkspaceEntry;
  iconDataUri: string | null;
}) {
  const handlePress = useCallback(() => {
    navigateToWorkspace({ serverId: workspace.serverId, workspaceId: workspace.workspaceId });
  }, [workspace.serverId, workspace.workspaceId]);
  const initial = projectIconPlaceholderLabelFromDisplayName(workspace.projectName)
    .charAt(0)
    .toUpperCase();

  return (
    <Pressable
      onPress={handlePress}
      style={rowStyle}
      accessibilityRole="button"
      accessibilityLabel={workspace.name}
      testID={`home-workspace-${workspace.workspaceKey}`}
    >
      <View style={workspace.statusBucket === "running" ? styles.runningRail : styles.rail} />
      <ProjectIconView
        iconDataUri={iconDataUri}
        initial={initial}
        projectViewKey={workspace.projectViewKey}
        size={ICON_SIZE.sm}
        textStyle={styles.projectIconText}
      />
      <Text style={styles.rowName} numberOfLines={1}>
        {workspace.name}
      </Text>
      {workspace.diffStat ? (
        <DiffStat
          additions={workspace.diffStat.additions}
          deletions={workspace.diffStat.deletions}
        />
      ) : null}
      <HomeRowTime enteredAt={workspace.statusEnteredAt} />
    </Pressable>
  );
});

/** Its own component so the minute tick re-renders one `<Text>`, not the row. */
function HomeRowTime({ enteredAt }: { enteredAt: Date | null }) {
  const label = useCompactTimeAgo(enteredAt);
  return <Text style={styles.rowTime}>{label}</Text>;
}

const COLUMN_MAX_WIDTH = 840;

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.surface0,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  spinner: {
    color: theme.colors.foregroundMuted,
  },
  column: {
    width: "100%",
    maxWidth: COLUMN_MAX_WIDTH,
    alignSelf: "center",
  },
  toolbar: {
    borderBottomWidth: theme.borderWidth[1],
    borderBottomColor: theme.colors.border,
    paddingHorizontal: {
      xs: theme.spacing[3],
      md: theme.spacing[6],
    },
    paddingVertical: theme.spacing[2],
  },
  toolbarRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  search: {
    flex: 1,
    minWidth: 0,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: {
      xs: theme.spacing[3],
      md: theme.spacing[6],
    },
    paddingVertical: theme.spacing[4],
  },
  group: {
    marginBottom: theme.spacing[4],
  },
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    height: 28,
    paddingHorizontal: theme.spacing[2],
  },
  groupTitle: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundMuted,
  },
  groupCount: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundExtraMuted,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    height: 36,
    paddingRight: theme.spacing[2],
    borderRadius: theme.borderRadius.md,
  },
  rowHovered: {
    backgroundColor: theme.colors.interactionHighlight,
  },
  rail: {
    width: 2,
    alignSelf: "stretch",
  },
  runningRail: {
    width: 2,
    alignSelf: "stretch",
    backgroundColor: theme.colors.statusSuccess,
  },
  projectIconText: {
    fontSize: 9,
    fontWeight: theme.fontWeight.semibold,
  },
  rowName: {
    flex: 1,
    minWidth: 0,
    fontSize: theme.fontSize.sm,
    color: theme.colors.foreground,
  },
  rowTime: {
    minWidth: 28,
    textAlign: "right",
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundExtraMuted,
  },
  empty: {
    alignItems: "center",
    gap: theme.spacing[4],
    paddingVertical: theme.spacing[12],
  },
  emptyText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
  },
}));
