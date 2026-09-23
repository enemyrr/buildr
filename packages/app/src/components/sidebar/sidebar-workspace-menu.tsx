import {
  useCallback,
  useMemo,
  type ComponentProps,
  type PropsWithChildren,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import {
  Pressable,
  Text,
  View,
  type GestureResponderEvent,
  type PressableStateCallbackType,
} from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import * as Clipboard from "expo-clipboard";
import {
  Archive,
  Circle,
  CircleCheck,
  Copy,
  Link,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Tag,
} from "lucide-react-native";
import { useIsCompactFormFactor } from "@/constants/layout";
import { isNative, isWeb } from "@/constants/platform";
import { getForgePresentation, normalizeForge } from "@/git/forge";
import type { SidebarWorkspaceEntry } from "@/hooks/use-sidebar-workspaces-list";
import { useAppSettings } from "@/hooks/use-settings";
import { useToast } from "@/contexts/toast-context";
import type { PrHint } from "@/git/pr-hint";
import type { Theme } from "@/styles/theme";
import type { ShortcutKey } from "@/utils/format-shortcut";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  type MenuPageDefinition,
} from "@/components/ui/dropdown-menu";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Shortcut } from "@/components/ui/shortcut";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { OpenInFileManagerMenuItem } from "@/workspace/open-in-file-manager/menu-item";
import { resolveSidebarWorkspaceAccessibilityLabel } from "@/components/sidebar/sidebar-workspace-title";
import {
  workspaceServiceLabelKey,
  type WorkspaceServiceSummary,
} from "@/components/sidebar/workspace-meta-row";
import {
  useWorkspaceLabelMenuPages,
  WORKSPACE_LABEL_PAGE_ID,
  type WorkspaceLabelTarget,
} from "@/workspace-labels/picker";
import {
  WORKSPACE_STATUS_PAGE_ID,
  WorkspaceBoardStatusIcon,
  useResolvedWorkspaceBoardStatus,
  useWorkspaceStatusMenuPage,
  workspaceBoardStatusLabelKey,
  type WorkspaceStatusTarget,
} from "@/components/sidebar/workspace-status-menu";

const foregroundColorMapping = (theme: Theme) => ({ color: theme.colors.foreground });
const foregroundMutedColorMapping = (theme: Theme) => ({
  color: theme.colors.foregroundMuted,
});

const ThemedMoreHorizontal = withUnistyles(MoreHorizontal);
const ThemedLink = withUnistyles(Link);
const ThemedCopy = withUnistyles(Copy);
const ThemedArchive = withUnistyles(Archive);
const ThemedCircle = withUnistyles(Circle);
const ThemedPencil = withUnistyles(Pencil);
const ThemedCircleCheck = withUnistyles(CircleCheck);
const ThemedPin = withUnistyles(Pin);
const ThemedPinOff = withUnistyles(PinOff);
const ThemedTag = withUnistyles(Tag);
const ThemedLoadingSpinner = withUnistyles(LoadingSpinner);

const copyLeadingIcon = <ThemedCopy size={14} uniProps={foregroundMutedColorMapping} />;
const linkLeadingIcon = <ThemedLink size={14} uniProps={foregroundMutedColorMapping} />;
const renameLeadingIcon = <ThemedPencil size={14} uniProps={foregroundMutedColorMapping} />;
const markAsReadLeadingIcon = (
  <ThemedCircleCheck size={14} uniProps={foregroundMutedColorMapping} />
);
const markAsUnreadLeadingIcon = <ThemedCircle size={14} uniProps={foregroundMutedColorMapping} />;
const archiveLeadingIcon = <ThemedArchive size={14} uniProps={foregroundMutedColorMapping} />;
const pinLeadingIcon = <ThemedPin size={14} uniProps={foregroundMutedColorMapping} />;
const unpinLeadingIcon = <ThemedPinOff size={14} uniProps={foregroundMutedColorMapping} />;

function renderTriggerIcon({ hovered }: { hovered?: boolean }) {
  return (
    <ThemedMoreHorizontal
      size={14}
      uniProps={hovered ? foregroundColorMapping : foregroundMutedColorMapping}
    />
  );
}

export interface SidebarWorkspaceMenuProps {
  workspaceKey: string;
  /** Drives the `Set status` fallback and `Copy link`. */
  prHint?: PrHint | null;
  serverId?: string;
  workspaceId?: string;
  workspaceLabels?: readonly string[];
  onCopyPath?: () => void;
  onCopyBranchName?: () => void;
  onRename?: () => void;
  onMarkAsRead?: () => void;
  onMarkAsUnread?: () => void;
  onArchive: () => void;
  archiveLabel?: string;
  archiveStatus?: "idle" | "pending" | "success";
  archivePendingLabel?: string;
  archiveShortcutKeys?: ShortcutKey[][] | null;
  isPinned?: boolean;
  onTogglePin?: () => void;
  openInFileManagerPath?: string | null;
  /**
   * Lifted so the row that reveals the kebab can keep it mounted while its menu is up. See
   * `useOpenKebabMenuVisibility`.
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

interface SidebarWorkspaceMenuItemsProps extends Omit<
  SidebarWorkspaceMenuProps,
  "onArchive" | "open" | "onOpenChange"
> {
  onArchive?: () => void;
}

type MenuSurface = "context" | "dropdown";

function WorkspaceMenuItem({
  surface,
  children,
  ...props
}: PropsWithChildren<
  Omit<ComponentProps<typeof DropdownMenuItem>, "children"> & { surface: MenuSurface }
>) {
  if (surface === "context") {
    return <ContextMenuItem {...props}>{children}</ContextMenuItem>;
  }
  return <DropdownMenuItem {...props}>{children}</DropdownMenuItem>;
}

function SidebarWorkspaceMenuItems({
  surface,
  workspaceKey,
  prHint = null,
  serverId,
  workspaceId,
  onCopyPath,
  onCopyBranchName,
  onRename,
  onMarkAsRead,
  onMarkAsUnread,
  onArchive,
  archiveLabel,
  archiveStatus,
  archivePendingLabel,
  archiveShortcutKeys,
  isPinned,
  onTogglePin,
  openInFileManagerPath,
}: SidebarWorkspaceMenuItemsProps & { surface: MenuSurface }): ReactNode {
  const { t } = useTranslation();
  const toast = useToast();
  const archiveTrailing = useMemo(
    () => (archiveShortcutKeys ? <Shortcut chord={archiveShortcutKeys} /> : null),
    [archiveShortcutKeys],
  );
  const labelLeading = useMemo(
    () => <ThemedTag size={14} uniProps={foregroundMutedColorMapping} />,
    [],
  );
  const statusTarget = useMemo<WorkspaceStatusTarget>(
    () => ({ workspaceKey, prHint }),
    [prHint, workspaceKey],
  );
  const prUrl = prHint?.url ?? null;
  const handleCopyLink = useCallback(() => {
    if (!prUrl) return;
    void Clipboard.setStringAsync(prUrl);
    toast.copied(t("sidebar.workspace.toasts.linkCopied"));
  }, [prUrl, t, toast]);

  return (
    <>
      {onMarkAsRead ? (
        <WorkspaceMenuItem
          surface={surface}
          testID={`sidebar-workspace-menu-mark-as-read-${workspaceKey}`}
          leading={markAsReadLeadingIcon}
          onSelect={onMarkAsRead}
        >
          Mark as read
        </WorkspaceMenuItem>
      ) : null}
      {onMarkAsUnread ? (
        <WorkspaceMenuItem
          surface={surface}
          testID={`sidebar-workspace-menu-mark-as-unread-${workspaceKey}`}
          leading={markAsUnreadLeadingIcon}
          onSelect={onMarkAsUnread}
        >
          Mark as unread
        </WorkspaceMenuItem>
      ) : null}
      {onTogglePin ? (
        <WorkspaceMenuItem
          surface={surface}
          testID={`sidebar-workspace-menu-pin-${workspaceKey}`}
          leading={isPinned ? unpinLeadingIcon : pinLeadingIcon}
          onSelect={onTogglePin}
        >
          {isPinned ? t("sidebar.workspace.actions.unpin") : t("sidebar.workspace.actions.pin")}
        </WorkspaceMenuItem>
      ) : null}
      <WorkspaceStatusSubTrigger target={statusTarget} />
      {serverId && workspaceId ? (
        <DropdownMenuSubTrigger
          id={WORKSPACE_LABEL_PAGE_ID}
          leading={labelLeading}
          testID={`sidebar-workspace-menu-labels-${workspaceKey}`}
        >
          {t("workspaceLabels.title")}
        </DropdownMenuSubTrigger>
      ) : null}
      {onRename ? (
        <WorkspaceMenuItem
          surface={surface}
          testID={`sidebar-workspace-menu-rename-${workspaceKey}`}
          leading={renameLeadingIcon}
          onSelect={onRename}
        >
          {t("sidebar.workspace.actions.rename")}
        </WorkspaceMenuItem>
      ) : null}
      {prUrl ? (
        <WorkspaceMenuItem
          surface={surface}
          testID={`sidebar-workspace-menu-copy-link-${workspaceKey}`}
          leading={linkLeadingIcon}
          onSelect={handleCopyLink}
        >
          {t("sidebar.workspace.actions.copyLink")}
        </WorkspaceMenuItem>
      ) : null}
      {onCopyPath ? (
        <WorkspaceMenuItem
          surface={surface}
          testID={`sidebar-workspace-menu-copy-path-${workspaceKey}`}
          leading={copyLeadingIcon}
          onSelect={onCopyPath}
        >
          {t("sidebar.workspace.actions.copyPath")}
        </WorkspaceMenuItem>
      ) : null}
      {onCopyBranchName ? (
        <WorkspaceMenuItem
          surface={surface}
          testID={`sidebar-workspace-menu-copy-branch-name-${workspaceKey}`}
          leading={copyLeadingIcon}
          onSelect={onCopyBranchName}
        >
          {t("sidebar.workspace.actions.copyBranchName")}
        </WorkspaceMenuItem>
      ) : null}
      <OpenInFileManagerMenuItem
        surface={surface}
        path={openInFileManagerPath}
        testID={`sidebar-workspace-menu-open-folder-${workspaceKey}`}
      />
      {onArchive ? (
        <>
          <DropdownMenuSeparator />
          <WorkspaceMenuItem
            surface={surface}
            testID={`sidebar-workspace-menu-archive-${workspaceKey}`}
            leading={archiveLeadingIcon}
            trailing={archiveTrailing}
            status={archiveStatus}
            pendingLabel={archivePendingLabel}
            onSelect={onArchive}
          >
            {archiveLabel ?? t("sidebar.workspace.actions.archive")}
          </WorkspaceMenuItem>
        </>
      ) : null}
    </>
  );
}

function WorkspaceStatusSubTrigger({ target }: { target: WorkspaceStatusTarget }) {
  const { t } = useTranslation();
  const status = useResolvedWorkspaceBoardStatus(target);
  const leading = useMemo(() => <WorkspaceBoardStatusIcon status={status} />, [status]);
  return (
    <DropdownMenuSubTrigger
      id={WORKSPACE_STATUS_PAGE_ID}
      leading={leading}
      value={t(workspaceBoardStatusLabelKey(status))}
      testID={`sidebar-workspace-menu-status-${target.workspaceKey}`}
    >
      {t("sidebar.workspace.actions.setStatus")}
    </DropdownMenuSubTrigger>
  );
}

/** Label and status pages, merged so both menus declare the same set. */
function useWorkspaceMenuPages(
  labelTarget: WorkspaceLabelTarget | null,
  statusTarget: WorkspaceStatusTarget,
): readonly MenuPageDefinition[] {
  const labelPages = useWorkspaceLabelMenuPages(labelTarget);
  const statusPage = useWorkspaceStatusMenuPage(statusTarget);
  return useMemo(
    () => (statusPage ? [...labelPages, statusPage] : labelPages),
    [labelPages, statusPage],
  );
}

/**
 * The row's trailing action. Pointer layouts get a one-tap archive button and reach the rest of
 * the actions through the row's context menu; touch has no right-click, so it keeps the kebab.
 */
export function SidebarWorkspaceMenu(props: SidebarWorkspaceMenuProps) {
  const isCompact = useIsCompactFormFactor();
  if (isNative || isCompact) return <SidebarWorkspaceKebabMenu {...props} />;
  return <SidebarWorkspaceArchiveButton {...props} />;
}

function SidebarWorkspaceArchiveButton({
  workspaceKey,
  onArchive,
  archiveLabel,
  archiveStatus,
  archiveShortcutKeys,
}: SidebarWorkspaceMenuProps) {
  const { t } = useTranslation();
  const label = archiveLabel ?? t("sidebar.workspace.actions.archive");
  const isPending = archiveStatus === "pending";
  const handlePress = useCallback(
    (event: GestureResponderEvent) => {
      event.stopPropagation();
      onArchive();
    },
    [onArchive],
  );

  return (
    <Tooltip delayDuration={0} enabledOnDesktop enabledOnMobile={false}>
      <TooltipTrigger asChild>
        <Pressable
          hitSlop={8}
          style={archiveTriggerStyle}
          onPress={handlePress}
          disabled={isPending}
          accessibilityLabel={label}
          testID={`sidebar-workspace-archive-${workspaceKey}`}
        >
          {({ hovered }: PressableStateCallbackType & { hovered?: boolean }) =>
            isPending ? (
              <ThemedLoadingSpinner size={14} uniProps={foregroundMutedColorMapping} />
            ) : (
              <ThemedArchive
                size={14}
                uniProps={hovered ? foregroundColorMapping : foregroundMutedColorMapping}
              />
            )
          }
        </Pressable>
      </TooltipTrigger>
      <TooltipContent side="bottom" align="center" offset={8}>
        <View style={styles.tooltipRow}>
          <Text style={styles.tooltipText}>{label}</Text>
          {archiveShortcutKeys ? <Shortcut chord={archiveShortcutKeys} /> : null}
        </View>
      </TooltipContent>
    </Tooltip>
  );
}

function SidebarWorkspaceKebabMenu({
  workspaceKey,
  prHint = null,
  serverId,
  workspaceId,
  workspaceLabels,
  onCopyPath,
  onCopyBranchName,
  onRename,
  onMarkAsRead,
  onMarkAsUnread,
  onArchive,
  archiveLabel,
  archiveStatus,
  archivePendingLabel,
  archiveShortcutKeys,
  isPinned,
  onTogglePin,
  openInFileManagerPath,
  open,
  onOpenChange,
}: SidebarWorkspaceMenuProps) {
  const { t } = useTranslation();
  const workspaceTarget = useMemo<WorkspaceLabelTarget | null>(
    () =>
      serverId && workspaceId ? { serverId, workspaceId, labels: workspaceLabels ?? [] } : null,
    [serverId, workspaceId, workspaceLabels],
  );
  const statusTarget = useMemo<WorkspaceStatusTarget>(
    () => ({ workspaceKey, prHint }),
    [prHint, workspaceKey],
  );
  const pages = useWorkspaceMenuPages(workspaceTarget, statusTarget);
  return (
    <DropdownMenu compactMode="sheet" open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger
        hitSlop={8}
        style={triggerStyle}
        accessibilityRole={isWeb ? undefined : "button"}
        accessibilityLabel={t("sidebar.workspace.actions.menu")}
        testID={`sidebar-workspace-kebab-${workspaceKey}`}
      >
        {renderTriggerIcon}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        width={260}
        pages={pages}
        sheetTitle={t("sidebar.workspace.actions.menu")}
      >
        <SidebarWorkspaceMenuItems
          surface="dropdown"
          workspaceKey={workspaceKey}
          prHint={prHint}
          serverId={serverId}
          workspaceId={workspaceId}
          workspaceLabels={workspaceLabels}
          onCopyPath={onCopyPath}
          onCopyBranchName={onCopyBranchName}
          onRename={onRename}
          onMarkAsRead={onMarkAsRead}
          onMarkAsUnread={onMarkAsUnread}
          onArchive={onArchive}
          archiveLabel={archiveLabel}
          archiveStatus={archiveStatus}
          archivePendingLabel={archivePendingLabel}
          archiveShortcutKeys={archiveShortcutKeys}
          isPinned={isPinned}
          onTogglePin={onTogglePin}
          openInFileManagerPath={openInFileManagerPath}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type ContextTriggerProps = Omit<
  ComponentProps<typeof ContextMenuTrigger>,
  "children" | "enabledOnMobile" | "highlightStyle"
>;

export function SidebarWorkspaceContextMenu({
  children,
  contextMenuOpen,
  onContextMenuOpenChange,
  workspace,
  leadingProjectName,
  hostBadgeLabel,
  serviceSummary,
  workspaceKey,
  onCopyPath,
  onCopyBranchName,
  onRename,
  onMarkAsRead,
  onMarkAsUnread,
  onArchive,
  archiveLabel,
  archiveStatus,
  archivePendingLabel,
  archiveShortcutKeys,
  isPinned,
  onTogglePin,
  openInFileManagerPath,
  accessibilityLabel,
  highlightStyle,
  ...triggerProps
}: PropsWithChildren<
  SidebarWorkspaceMenuItemsProps &
    ContextTriggerProps & {
      contextMenuOpen: boolean;
      onContextMenuOpenChange: (open: boolean) => void;
      workspace: SidebarWorkspaceEntry;
      leadingProjectName?: string | null;
      hostBadgeLabel?: string | null;
      serviceSummary?: WorkspaceServiceSummary | null;
      highlightStyle: ComponentProps<typeof ContextMenuTrigger>["highlightStyle"];
    }
>) {
  const {
    settings: { workspaceTitleSource },
  } = useAppSettings();
  const { t } = useTranslation();
  const pullRequestLabel = workspace.prHint
    ? t("workspace.git.pr.accessibility.pullRequest", {
        number: workspace.prHint.number,
        context: getForgePresentation(normalizeForge(workspace.prHint.forge)).changeRequestContext,
      })
    : null;
  const rowAccessibilityLabel = resolveSidebarWorkspaceAccessibilityLabel({
    workspace,
    workspaceTitleSource,
    leadingProjectName,
    hostBadgeLabel,
    pullRequestLabel,
    serviceLabel: serviceSummary
      ? t(workspaceServiceLabelKey(serviceSummary), { name: serviceSummary.name })
      : null,
  });
  const workspaceTarget = useMemo<WorkspaceLabelTarget>(
    () => ({
      serverId: workspace.serverId,
      workspaceId: workspace.workspaceId,
      labels: workspace.labels ?? [],
    }),
    [workspace],
  );
  const statusTarget = useMemo<WorkspaceStatusTarget>(
    () => ({ workspaceKey, prHint: workspace.prHint }),
    [workspace.prHint, workspaceKey],
  );
  const pages = useWorkspaceMenuPages(workspaceTarget, statusTarget);

  return (
    <ContextMenu open={contextMenuOpen} onOpenChange={onContextMenuOpenChange}>
      <ContextMenuTrigger
        {...triggerProps}
        enabledOnMobile={false}
        accessibilityLabel={accessibilityLabel ?? rowAccessibilityLabel}
        highlightStyle={highlightStyle}
      >
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent
        align="start"
        width={260}
        testID={`sidebar-workspace-context-menu-${workspaceKey}`}
        pages={pages}
      >
        <SidebarWorkspaceMenuItems
          surface="context"
          workspaceKey={workspaceKey}
          prHint={workspace.prHint}
          serverId={workspaceTarget.serverId}
          workspaceId={workspaceTarget.workspaceId}
          workspaceLabels={workspaceTarget.labels}
          onCopyPath={onCopyPath}
          onCopyBranchName={onCopyBranchName}
          onRename={onRename}
          onMarkAsRead={onMarkAsRead}
          onMarkAsUnread={onMarkAsUnread}
          onArchive={onArchive}
          archiveLabel={archiveLabel}
          archiveStatus={archiveStatus}
          archivePendingLabel={archivePendingLabel}
          archiveShortcutKeys={archiveShortcutKeys}
          isPinned={isPinned}
          onTogglePin={onTogglePin}
          openInFileManagerPath={openInFileManagerPath}
        />
      </ContextMenuContent>
    </ContextMenu>
  );
}

function triggerStyle({ hovered = false }: PressableStateCallbackType & { hovered?: boolean }) {
  return [styles.trigger, hovered && styles.triggerHovered];
}

function archiveTriggerStyle({
  hovered = false,
}: PressableStateCallbackType & { hovered?: boolean }) {
  return [styles.archiveTrigger, hovered && styles.triggerHovered];
}

const styles = StyleSheet.create((theme) => ({
  trigger: {
    padding: 2,
    borderRadius: 4,
    marginLeft: 2,
    // Keep the padded hit box, but pull the painted dots through the unused view-box space onto
    // the trailing-content rail.
    marginRight: -4,
  },
  // The archive glyph fills its view box, so only the padding needs pulling onto the rail.
  archiveTrigger: {
    padding: 2,
    borderRadius: 4,
    marginLeft: 2,
    marginRight: -3,
  },
  triggerHovered: {
    backgroundColor: theme.colors.surface2,
  },
  tooltipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  tooltipText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
  },
}));
