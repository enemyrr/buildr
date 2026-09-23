import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View, type PressableStateCallbackType } from "react-native";
import { useIsFocused } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { ChevronDown } from "lucide-react-native";
import { MenuHeader } from "@/components/headers/menu-header";
import { ProjectIconView } from "@/components/project-icon-view";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { BOARD_STATUS_LABEL_KEYS, BoardStatusGlyph } from "@/dashboard/board-status-glyph";
import {
  groupWorkspacesByBoardStatus,
  WORKSPACE_BOARD_STATUSES,
  type WorkspaceBoardStatus,
} from "@/dashboard/board-status";
import { DashboardCard } from "@/dashboard/dashboard-card";
import { useSidebarWorkspaceEntries } from "@/hooks/use-sidebar-workspace-entries";
import {
  useSidebarWorkspacesList,
  type SidebarProjectEntry,
  type SidebarWorkspaceEntry,
} from "@/hooks/use-sidebar-workspaces-list";
import { createProjectIconTarget, type ProjectIconTarget } from "@/projects/icon-target";
import { useProjectIcons } from "@/projects/icons";
import { useWorkspaceStatusStore } from "@/stores/workspace-status-store";
import { ICON_SIZE, type Theme } from "@/styles/theme";
import { projectIconPlaceholderLabelFromDisplayName } from "@/utils/project-display-name";

const ALL_HOSTS: readonly string[] = [];
const ALL_PROJECTS = "__all__";
/** Project tabs shown inline; the rest go behind "More". */
const INLINE_PROJECT_TAB_COUNT = 4;
const COLUMN_WIDTH = 288;

const ThemedChevronDown = withUnistyles(ChevronDown);
const mutedMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

export function DashboardScreen() {
  const isFocused = useIsFocused();
  if (!isFocused) {
    return <View style={styles.container} />;
  }
  return <DashboardScreenContent />;
}

function byRecency(left: SidebarWorkspaceEntry, right: SidebarWorkspaceEntry): number {
  return (right.statusEnteredAt?.getTime() ?? 0) - (left.statusEnteredAt?.getTime() ?? 0);
}

function DashboardScreenContent() {
  const { t } = useTranslation();
  const { workspacePlacements, projects, isInitialLoad } = useSidebarWorkspacesList({
    hostFilters: ALL_HOSTS,
  });
  const entries = useSidebarWorkspaceEntries(workspacePlacements);
  const overrides = useWorkspaceStatusStore((state) => state.overrides);
  const [projectFilter, setProjectFilter] = useState(ALL_PROJECTS);

  useEffect(() => {
    if (projectFilter === ALL_PROJECTS) return;
    if (!projects.some((project) => project.viewKey === projectFilter)) {
      setProjectFilter(ALL_PROJECTS);
    }
  }, [projectFilter, projects]);

  const columns = useMemo(() => {
    const visible: SidebarWorkspaceEntry[] = [];
    for (const placement of workspacePlacements) {
      if (projectFilter !== ALL_PROJECTS && placement.projectViewKey !== projectFilter) continue;
      const entry = entries.get(placement.workspaceKey);
      if (!entry || entry.archivingAt) continue;
      visible.push(entry);
    }
    visible.sort(byRecency);
    return groupWorkspacesByBoardStatus(visible, overrides);
  }, [entries, overrides, projectFilter, workspacePlacements]);

  return (
    <View style={styles.container} testID="dashboard-screen">
      <MenuHeader title={t("dashboard.title")} />
      <DashboardProjectTabs
        projects={projects}
        selected={projectFilter}
        onSelect={setProjectFilter}
      />
      {isInitialLoad ? (
        <View style={styles.centered}>
          <LoadingSpinner size="large" color={styles.spinner.color} />
        </View>
      ) : (
        <ScrollView
          horizontal
          style={styles.board}
          contentContainerStyle={styles.boardContent}
          showsHorizontalScrollIndicator={false}
        >
          {WORKSPACE_BOARD_STATUSES.map((status) => (
            <DashboardColumn
              key={status}
              status={status}
              workspaces={columns[status]}
              overrides={overrides}
            />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const DashboardColumn = memo(function DashboardColumn({
  status,
  workspaces,
  overrides,
}: {
  status: WorkspaceBoardStatus;
  workspaces: SidebarWorkspaceEntry[];
  overrides: Readonly<Record<string, WorkspaceBoardStatus>>;
}) {
  const { t } = useTranslation();
  return (
    <View style={styles.column} testID={`dashboard-column-${status}`}>
      <View style={styles.columnHeader}>
        <BoardStatusGlyph status={status} size={ICON_SIZE.sm} />
        <Text style={styles.columnTitle}>{t(BOARD_STATUS_LABEL_KEYS[status])}</Text>
        <Text style={styles.columnCount}>{workspaces.length}</Text>
      </View>
      <ScrollView style={styles.columnScroll} contentContainerStyle={styles.columnContent}>
        {workspaces.length === 0 ? (
          <Text style={styles.columnEmpty}>{t("dashboard.emptyColumn")}</Text>
        ) : (
          workspaces.map((workspace) => (
            <DashboardCard
              key={workspace.workspaceKey}
              workspace={workspace}
              status={status}
              isOverridden={overrides[workspace.workspaceKey] !== undefined}
            />
          ))
        )}
      </ScrollView>
    </View>
  );
});

function DashboardProjectTabs({
  projects,
  selected,
  onSelect,
}: {
  projects: SidebarProjectEntry[];
  selected: string;
  onSelect: (viewKey: string) => void;
}) {
  const { t } = useTranslation();
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
  const iconByViewKey = useProjectIcons({ projects: iconTargets });
  const inline = projects.slice(0, INLINE_PROJECT_TAB_COUNT);
  const overflow = projects.slice(INLINE_PROJECT_TAB_COUNT);
  const selectedOverflow = overflow.find((project) => project.viewKey === selected) ?? null;

  return (
    <View style={styles.tabs}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabsContent}
      >
        <DashboardTab
          label={t("dashboard.allProjects")}
          value={ALL_PROJECTS}
          isSelected={selected === ALL_PROJECTS}
          onSelect={onSelect}
        />
        {inline.map((project) => (
          <DashboardTab
            key={project.viewKey}
            label={project.projectName}
            value={project.viewKey}
            isSelected={selected === project.viewKey}
            onSelect={onSelect}
            project={project}
            iconDataUri={iconByViewKey.get(project.viewKey) ?? null}
          />
        ))}
        {overflow.length > 0 ? (
          <DashboardOverflowTab
            label={selectedOverflow?.projectName ?? t("dashboard.more")}
            isSelected={selectedOverflow !== null}
            projects={overflow}
            selected={selected}
            onSelect={onSelect}
          />
        ) : null}
      </ScrollView>
    </View>
  );
}

function DashboardProjectIcon({
  project,
  iconDataUri,
}: {
  project: SidebarProjectEntry;
  iconDataUri: string | null;
}) {
  const initial = projectIconPlaceholderLabelFromDisplayName(project.projectName)
    .charAt(0)
    .toUpperCase();
  return (
    <ProjectIconView
      iconDataUri={iconDataUri}
      initial={initial}
      projectViewKey={project.viewKey}
      size={ICON_SIZE.sm}
      textStyle={styles.projectIconText}
    />
  );
}

function DashboardTab({
  label,
  value,
  isSelected,
  onSelect,
  project,
  iconDataUri = null,
}: {
  label: string;
  value: string;
  isSelected: boolean;
  onSelect: (value: string) => void;
  project?: SidebarProjectEntry;
  iconDataUri?: string | null;
}) {
  const handlePress = useCallback(() => onSelect(value), [onSelect, value]);
  const accessibilityState = useMemo(() => ({ selected: isSelected }), [isSelected]);
  const style = useCallback(
    ({ hovered = false }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.tab,
      (hovered || isSelected) && styles.tabActive,
    ],
    [isSelected],
  );
  return (
    <Pressable
      onPress={handlePress}
      style={style}
      accessibilityRole="tab"
      accessibilityState={accessibilityState}
    >
      {project ? <DashboardProjectIcon project={project} iconDataUri={iconDataUri} /> : null}
      <Text style={isSelected ? styles.tabTextActive : styles.tabText} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function DashboardOverflowTab({
  label,
  isSelected,
  projects,
  selected,
  onSelect,
}: {
  label: string;
  isSelected: boolean;
  projects: SidebarProjectEntry[];
  selected: string;
  onSelect: (value: string) => void;
}) {
  const style = useCallback(
    ({ hovered, open }: { hovered: boolean; open: boolean }) => [
      styles.tab,
      (hovered || open || isSelected) && styles.tabActive,
    ],
    [isSelected],
  );
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        style={style}
        accessibilityRole="button"
        testID="dashboard-more-projects"
      >
        <Text style={isSelected ? styles.tabTextActive : styles.tabText} numberOfLines={1}>
          {label}
        </Text>
        <ThemedChevronDown size={ICON_SIZE.xs} uniProps={mutedMapping} />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="bottom" align="start" offset={4} width={220}>
        {projects.map((project) => (
          <DashboardOverflowItem
            key={project.viewKey}
            project={project}
            isSelected={project.viewKey === selected}
            onSelect={onSelect}
          />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function DashboardOverflowItem({
  project,
  isSelected,
  onSelect,
}: {
  project: SidebarProjectEntry;
  isSelected: boolean;
  onSelect: (value: string) => void;
}) {
  const handleSelect = useCallback(() => onSelect(project.viewKey), [onSelect, project.viewKey]);
  return (
    <DropdownMenuItem onSelect={handleSelect} selected={isSelected}>
      {project.projectName}
    </DropdownMenuItem>
  );
}

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
  tabs: {
    borderBottomWidth: theme.borderWidth[1],
    borderBottomColor: theme.colors.border,
  },
  tabsContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[2],
  },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1.5],
    height: 28,
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.borderRadius.md,
  },
  tabActive: {
    backgroundColor: theme.colors.interactionHighlight,
  },
  tabText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundMuted,
    maxWidth: 180,
  },
  tabTextActive: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foreground,
    maxWidth: 180,
  },
  projectIconText: {
    fontSize: 9,
    fontWeight: theme.fontWeight.semibold,
  },
  board: {
    flex: 1,
  },
  boardContent: {
    flexDirection: "row",
    gap: theme.spacing[3],
    padding: theme.spacing[4],
  },
  column: {
    width: COLUMN_WIDTH,
    minHeight: 0,
  },
  columnHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    height: 28,
    paddingHorizontal: theme.spacing[1],
    marginBottom: theme.spacing[2],
  },
  columnTitle: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.foreground,
  },
  columnCount: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundExtraMuted,
  },
  columnScroll: {
    flex: 1,
  },
  columnContent: {
    gap: theme.spacing[2],
    paddingBottom: theme.spacing[4],
  },
  columnEmpty: {
    paddingHorizontal: theme.spacing[1],
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundExtraMuted,
  },
}));
