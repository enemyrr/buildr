import { memo, useCallback, useMemo } from "react";
import { Pressable, Text, View, type PressableStateCallbackType } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { Archive, ArrowUpRight, Ellipsis, GitPullRequestArrow } from "lucide-react-native";
import { DiffStat } from "@/components/diff-stat";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BOARD_STATUS_LABEL_KEYS, BoardStatusGlyph } from "@/dashboard/board-status-glyph";
import { WORKSPACE_BOARD_STATUSES, type WorkspaceBoardStatus } from "@/dashboard/board-status";
import { usePrFlow } from "@/git/use-pr-flow";
import type { SidebarWorkspaceEntry } from "@/hooks/use-sidebar-workspaces-list";
import { useCompactTimeAgo } from "@/hooks/use-compact-time-ago";
import { navigateToWorkspace } from "@/stores/navigation-active-workspace-store";
import { setWorkspaceBoardStatus } from "@/stores/workspace-status-store";
import { ICON_SIZE, type Theme } from "@/styles/theme";
import { openExternalUrl } from "@/utils/open-external-url";
import { useWorkspaceArchive } from "@/workspace/use-workspace-archive";

const ThemedEllipsis = withUnistyles(Ellipsis);
const ThemedArrowUpRight = withUnistyles(ArrowUpRight);
const mutedMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const foregroundMapping = (theme: Theme) => ({ color: theme.colors.foreground });

function noop(): void {}

export const DashboardCard = memo(function DashboardCard({
  workspace,
  status,
  isOverridden,
}: {
  workspace: SidebarWorkspaceEntry;
  status: WorkspaceBoardStatus;
  isOverridden: boolean;
}) {
  const handlePress = useCallback(() => {
    navigateToWorkspace({ serverId: workspace.serverId, workspaceId: workspace.workspaceId });
  }, [workspace.serverId, workspace.workspaceId]);

  const branch = workspace.currentBranch ?? workspace.workspaceDirectoryLabel;

  return (
    <View style={styles.card} testID={`dashboard-card-${workspace.workspaceKey}`}>
      <Pressable
        onPress={handlePress}
        style={styles.main}
        accessibilityRole="button"
        accessibilityLabel={workspace.name}
      >
        <View style={styles.metaRow}>
          <BoardStatusGlyph status={status} size={ICON_SIZE.xs} />
          <Text style={styles.branch} numberOfLines={1}>
            {branch}
          </Text>
          {workspace.diffStat ? (
            <DiffStat
              additions={workspace.diffStat.additions}
              deletions={workspace.diffStat.deletions}
            />
          ) : null}
          <View style={styles.menuSlot} />
        </View>
        <Text style={styles.title} numberOfLines={2}>
          {workspace.name}
        </Text>
      </Pressable>
      <View style={styles.menuAnchor}>
        <DashboardCardStatusMenu
          workspaceKey={workspace.workspaceKey}
          status={status}
          isOverridden={isOverridden}
        />
      </View>
      <View style={styles.footer}>
        <DashboardCardAction workspace={workspace} />
        <DashboardCardTime enteredAt={workspace.statusEnteredAt} />
      </View>
    </View>
  );
});

function DashboardCardAction({ workspace }: { workspace: SidebarWorkspaceEntry }) {
  const pr = workspace.prHint;
  if (pr?.state === "merged" || pr?.state === "closed") {
    return <DashboardCardArchive workspace={workspace} />;
  }
  if (pr) {
    return <PullRequestLink number={pr.number} url={pr.url} />;
  }
  if (!workspace.currentBranch) return <View />;
  return (
    <DashboardCardCreatePr
      serverId={workspace.serverId}
      workspaceId={workspace.workspaceId}
      cwd={workspace.workspaceDirectory}
    />
  );
}

/** Same flow as the header button, posted into the workspace's newest chat. */
function DashboardCardCreatePr({
  serverId,
  workspaceId,
  cwd,
}: {
  serverId: string;
  workspaceId: string;
  cwd: string;
}) {
  const { t } = useTranslation();
  const flow = usePrFlow({ serverId, cwd, workspaceId });

  return (
    <Button
      size="xs"
      variant="secondary"
      leftIcon={GitPullRequestArrow}
      loading={flow.pending}
      disabled={flow.busy || !flow.canCreatePr}
      onPress={flow.createPr}
      testID="dashboard-card-create-pr"
    >
      {t("workspace.git.prFlow.createPr")}
    </Button>
  );
}

const ThemedMergedArchiveIcon = withUnistyles(Archive, (theme) => ({
  color: theme.colors.statusMerged,
}));
const ThemedClosedArchiveIcon = withUnistyles(Archive, (theme) => ({
  color: theme.colors.statusDanger,
}));
const MERGED_ARCHIVE_ICON = <ThemedMergedArchiveIcon size={14} />;
const CLOSED_ARCHIVE_ICON = <ThemedClosedArchiveIcon size={14} />;

function DashboardCardArchive({ workspace }: { workspace: SidebarWorkspaceEntry }) {
  const { t } = useTranslation();
  const { archive } = useWorkspaceArchive({
    serverId: workspace.serverId,
    workspaceId: workspace.workspaceId,
    workspaceKind: workspace.workspaceKind,
    name: workspace.name,
    isDirty: workspace.archiveHasUncommittedChanges,
    aheadOfOrigin: workspace.archiveUnpushedCommitCount,
    diffStat: workspace.diffStat,
    onArchiveStarted: noop,
  });
  const pr = workspace.prHint;
  // Archive wears the PR's end state: purple once merged, red once closed.
  const merged = pr?.state === "merged";

  return (
    <View style={styles.footerActions}>
      <Button
        size="xs"
        variant="ghost"
        leftIcon={merged ? MERGED_ARCHIVE_ICON : CLOSED_ARCHIVE_ICON}
        style={merged ? styles.archiveMerged : styles.archiveClosed}
        textStyle={merged ? styles.archiveMergedText : styles.archiveClosedText}
        onPress={archive}
        testID="dashboard-card-archive"
      >
        {t("dashboard.actions.archive")}
      </Button>
      {pr ? <PullRequestLink number={pr.number} url={pr.url} /> : null}
    </View>
  );
}

function PullRequestLink({ number, url }: { number: number; url: string }) {
  const handlePress = useCallback(() => {
    void openExternalUrl(url);
  }, [url]);
  const style = useCallback(
    ({ hovered = false }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.prLink,
      hovered && styles.prLinkHovered,
    ],
    [],
  );
  return (
    <Pressable onPress={handlePress} style={style} accessibilityRole="link">
      <Text style={styles.prLinkText}>#{number}</Text>
      <ThemedArrowUpRight size={ICON_SIZE.xs} uniProps={mutedMapping} />
    </Pressable>
  );
}

/** Its own component so the minute tick re-renders one `<Text>`, not the card. */
function DashboardCardTime({ enteredAt }: { enteredAt: Date | null }) {
  const label = useCompactTimeAgo(enteredAt);
  return <Text style={styles.time}>{label}</Text>;
}

function DashboardCardStatusMenu({
  workspaceKey,
  status,
  isOverridden,
}: {
  workspaceKey: string;
  status: WorkspaceBoardStatus;
  isOverridden: boolean;
}) {
  const { t } = useTranslation();
  const handleReset = useCallback(
    () => setWorkspaceBoardStatus(workspaceKey, null),
    [workspaceKey],
  );
  const triggerStyle = useCallback(
    ({ hovered, open }: { hovered: boolean; open: boolean }) => [
      styles.menuTrigger,
      (hovered || open) && styles.menuTriggerHovered,
    ],
    [],
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        style={triggerStyle}
        accessibilityRole="button"
        accessibilityLabel={t("dashboard.actions.setStatus")}
        testID="dashboard-card-menu"
      >
        {({ hovered, open }) => (
          <ThemedEllipsis
            size={ICON_SIZE.sm}
            uniProps={hovered || open ? foregroundMapping : mutedMapping}
          />
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent side="bottom" align="end" offset={4} width={200}>
        {WORKSPACE_BOARD_STATUSES.map((option) => (
          <DashboardStatusMenuItem
            key={option}
            workspaceKey={workspaceKey}
            status={option}
            selected={option === status}
          />
        ))}
        {isOverridden ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={handleReset}>
              {t("dashboard.actions.resetStatus")}
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function DashboardStatusMenuItem({
  workspaceKey,
  status,
  selected,
}: {
  workspaceKey: string;
  status: WorkspaceBoardStatus;
  selected: boolean;
}) {
  const { t } = useTranslation();
  const handleSelect = useCallback(
    () => setWorkspaceBoardStatus(workspaceKey, status),
    [status, workspaceKey],
  );
  const leading = useMemo(() => <BoardStatusGlyph status={status} size={ICON_SIZE.sm} />, [status]);
  return (
    <DropdownMenuItem onSelect={handleSelect} selected={selected} leading={leading}>
      {t(BOARD_STATUS_LABEL_KEYS[status])}
    </DropdownMenuItem>
  );
}

const MENU_SIZE = 24;

const styles = StyleSheet.create((theme) => ({
  archiveMerged: {
    backgroundColor: theme.colors.statusMergedSubtle,
  },
  archiveMergedText: {
    color: theme.colors.statusMerged,
  },
  archiveClosed: {
    backgroundColor: theme.colors.statusDangerSubtle,
  },
  archiveClosedText: {
    color: theme.colors.statusDanger,
  },
  card: {
    position: "relative",
    backgroundColor: theme.colors.surface1,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
  },
  main: {
    paddingTop: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    gap: theme.spacing[1],
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1.5],
    minHeight: MENU_SIZE,
  },
  branch: {
    flex: 1,
    minWidth: 0,
    fontFamily: theme.fontFamily.mono,
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundMuted,
  },
  // Keeps the diff stat clear of the absolutely positioned menu trigger.
  menuSlot: {
    width: MENU_SIZE,
  },
  menuAnchor: {
    position: "absolute",
    top: theme.spacing[2],
    right: theme.spacing[2],
  },
  menuTrigger: {
    width: MENU_SIZE,
    height: MENU_SIZE,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.borderRadius.md,
  },
  menuTriggerHovered: {
    backgroundColor: theme.colors.interactionHighlight,
  },
  title: {
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.foreground,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    paddingTop: theme.spacing[2],
    paddingBottom: theme.spacing[2],
  },
  footerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  prLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: theme.spacing[1],
    borderRadius: theme.borderRadius.base,
  },
  prLinkHovered: {
    backgroundColor: theme.colors.interactionHighlight,
  },
  prLinkText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundMuted,
  },
  time: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundExtraMuted,
  },
}));
