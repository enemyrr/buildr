import { useCallback, useMemo, type ReactNode } from "react";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import {
  Archive,
  ArrowUpRight,
  ChevronDown,
  Copy,
  FastForward,
  GitCommitHorizontal,
  GitMerge,
  Wrench,
} from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";
import { Pressable, Text, View, type PressableStateCallbackType } from "react-native";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/contexts/toast-context";
import { GIT_ACTION_ICONS } from "@/git/action-icons";
import { useCheckoutGitActionsStore } from "@/git/actions-store";
import { getForgePresentation } from "@/git/forge";
import { deriveMergeCapability } from "@/git/merge-capability";
import {
  buildCommitAndPushRequest,
  buildContinueRequest,
  buildFixChecksRequest,
  buildResolveConflictsRequest,
} from "@/git/pr-instructions";
import {
  derivePrStripState,
  type PrStripAction,
  type PrStripLabel,
  type PrStripTone,
} from "@/git/pr-status-strip-state";
import { useGitActionRunner, useGitActions, type GitAction } from "@/git/use-actions";
import { useInstructionRequests } from "@/git/use-instruction-requests";
import { useCheckoutPrStatusQuery } from "@/git/use-pr-status-query";
import { useCheckoutStatusQuery } from "@/git/use-status-query";
import { useWorkingDiffSummary } from "@/git/use-working-diff-summary";
import { HEADER_INNER_HEIGHT } from "@/constants/layout";
import { useHostFeature } from "@/runtime/host-features";
import type { Theme } from "@/styles/theme";
import { copyToClipboard } from "@/utils/copy-to-clipboard";
import { openExternalUrl } from "@/utils/open-external-url";

interface PrStatusStripProps {
  serverId: string;
  cwd: string;
  /** `bar` spans the Explorer above its tabs; `inline` sits among the header actions. */
  variant?: "bar" | "inline";
  /** Opens the in-app pull request view. Without it, the number opens the browser too. */
  onOpenPullRequest?: () => void;
}

/**
 * The change request's lifecycle on a wash of its state's color: the `#N` `↗` link, the state,
 * and the next step. An open PR always offers Merge, disabled with its reason until ready, beside
 * Commit and push while local work is unpushed. Continue or Archive once merged or closed.
 */
export function PrStatusStrip({
  serverId,
  cwd,
  variant = "bar",
  onOpenPullRequest,
}: PrStatusStripProps) {
  const { t } = useTranslation();
  const { status: prStatus, forge } = useCheckoutPrStatusQuery({ serverId, cwd });
  const { hasUncommittedChanges, hasUnpushedCommits, uncommittedCount, baseRef } = useLocalWork({
    serverId,
    cwd,
  });
  const { gitActions } = useGitActions({ serverId, cwd, icons: GIT_ACTION_ICONS });
  const requests = useInstructionRequests({ serverId, cwd });
  const runGitAction = useGitActionRunner();
  const toast = useToast();
  const directContinue = useHostFeature(serverId, "checkoutContinueBranch");
  const continueBranch = useCheckoutGitActionsStore((s) => s.continueBranch);
  const continuePending = useCheckoutGitActionsStore(
    (s) => s.getStatus({ serverId, cwd, actionId: "continue-branch" }) === "pending",
  );

  const state = useMemo(() => {
    if (!prStatus?.url) return null;
    const capability = deriveMergeCapability(prStatus.forgeSpecific, prStatus.github);
    return derivePrStripState(
      {
        ...prStatus,
        autoMergeEnabled: capability?.autoMergeEnabled ?? false,
        hasUncommittedChanges,
        hasUnpushedCommits,
      },
      gitActions,
    );
  }, [prStatus, gitActions, hasUncommittedChanges, hasUnpushedCommits]);
  const commit = gitActions.primary?.id === "commit" ? gitActions.primary : null;

  const prUrl = prStatus?.url ?? null;
  const runAction = useCallback(
    (action: PrStripAction) => {
      if (action.kind === "git") return runGitAction(action.action);
      if (action.kind === "continue" && directContinue) {
        void continueBranch({ serverId, cwd }).then(
          (branch) => toast.show(`Continued on ${branch}.`),
          (error: unknown) =>
            toast.error(error instanceof Error ? error.message : "Could not continue."),
        );
      } else if (action.kind === "continue") {
        // COMPAT(checkoutContinueBranch): daemons before v0.9.2 lack checkout.branch.continue.*,
        // so the agent creates the branch. Remove after 2027-03-23.
        void requests.send(buildContinueRequest({ baseRef, prUrl }));
      } else if (action.kind === "commit-and-push") {
        // Without a chat to post into, fall back to the daemon's direct commit.
        if (requests.canSend) void requests.send(buildCommitAndPushRequest());
        else if (commit) runGitAction(commit);
      } else if (action.kind === "fix-checks") {
        void requests.send(buildFixChecksRequest({ prUrl }));
      } else {
        void requests.send(buildResolveConflictsRequest({ baseRef, prUrl }));
      }
    },
    [
      runGitAction,
      requests,
      commit,
      baseRef,
      prUrl,
      directContinue,
      continueBranch,
      serverId,
      cwd,
      toast,
    ],
  );
  const openPr = useCallback(() => {
    if (prUrl) void openExternalUrl(prUrl);
  }, [prUrl]);
  const copyPrUrl = useCallback(() => {
    if (prUrl) void copyToClipboard(prUrl).then(() => toast.copied("Link"));
  }, [prUrl, toast]);

  if (!prStatus || !state) return null;
  const numberLabel = prStatus.number
    ? `${getForgePresentation(forge).numberPrefix}${prStatus.number}`
    : "PR";
  const tone = TONE_SHEETS[state.tone];
  return (
    <View
      style={[variant === "bar" ? styles.bar : styles.inline, tone.tint]}
      testID={variant === "bar" ? "workspace-pr-status-strip" : "workspace-pr-status-inline"}
    >
      <View style={[styles.link, tone.border]}>
        <PrSegment
          tone={state.tone}
          onPress={onOpenPullRequest ?? openPr}
          role={onOpenPullRequest ? "button" : "link"}
          accessibilityLabel={
            onOpenPullRequest
              ? t("panels.pullRequest.label")
              : t("workspace.git.prFlow.openPr", { ref: numberLabel })
          }
          testID="workspace-pr-status-number"
        >
          <Text style={[styles.chipText, tone.text]}>{numberLabel}</Text>
        </PrSegment>
        <PrSegment
          tone={state.tone}
          onPress={openPr}
          role="link"
          accessibilityLabel={t("workspace.git.prFlow.openPr", { ref: numberLabel })}
          divided
          testID="workspace-pr-status-open-external"
        >
          <ToneIcon icon={ArrowUpRight} tone={state.tone} size={12} />
        </PrSegment>
      </View>
      <View style={styles.status}>
        <Text
          style={[styles.label, tone.text]}
          numberOfLines={1}
          testID="workspace-pr-status-label"
        >
          {stripLabelText(t, state.label, uncommittedCount)}
        </Text>
      </View>
      <View style={styles.actions}>
        {state.actions.map((action) => (
          <StripButton
            key={action.label}
            action={action}
            tone={state.tone}
            {...stripActionState(action, {
              requests,
              direct: directContinue ? { pending: continuePending } : null,
            })}
            onPress={runAction}
            onRunOption={runGitAction}
            onCopyLink={copyPrUrl}
          />
        ))}
      </View>
    </View>
  );
}

/** The workspace's local state beside the PR: uncommitted changes and unpushed commits. */
function useLocalWork({ serverId, cwd }: { serverId: string; cwd: string }) {
  const { status } = useCheckoutStatusQuery({ serverId, cwd });
  const uncommitted = useWorkingDiffSummary({ serverId, cwd, mode: "uncommitted" });
  const gitStatus = status?.isGit ? status : null;
  return {
    hasUncommittedChanges: gitStatus?.isDirty === true,
    hasUnpushedCommits: (gitStatus?.aheadOfOrigin ?? 0) > 0,
    uncommittedCount: uncommitted?.fileCount ?? 0,
    baseRef: gitStatus?.baseRef ?? null,
  };
}

const COPY_LINK_ICON = <ToneIcon icon={Copy} tone="muted" size={16} />;

function stripLabelText(
  t: (key: string, options?: Record<string, unknown>) => string,
  label: PrStripLabel,
  uncommittedCount: number,
): string {
  if (label === "uncommitted") {
    return uncommittedCount > 0
      ? t("workspace.git.prFlow.checks.uncommitted", { count: uncommittedCount })
      : t("workspace.git.prFlow.checks.uncommittedUnknown");
  }
  if (label === "unpushed") return t("workspace.git.prFlow.checks.unpushed");
  return t(`workspace.git.prFlow.state.${label}`);
}

/** One half of the `#N` `↗` link: the number opens the PR in the app, the arrow in the browser. */
function PrSegment({
  tone,
  onPress,
  role,
  accessibilityLabel,
  divided = false,
  testID,
  children,
}: {
  tone: PrStripTone;
  onPress: () => void;
  role: "link" | "button";
  accessibilityLabel: string;
  divided?: boolean;
  testID?: string;
  children: ReactNode;
}) {
  const style = useCallback(
    ({ hovered = false }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.segment,
      divided && [styles.segmentDivided, TONE_SHEETS[tone].border],
      hovered && TONE_SHEETS[tone].tint,
    ],
    [tone, divided],
  );
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={role}
      accessibilityLabel={accessibilityLabel}
      style={style}
      testID={testID}
    >
      {children}
    </Pressable>
  );
}

/** Git actions carry their own state; Continue runs directly when the host supports it. */
function stripActionState(
  action: PrStripAction,
  sources: {
    requests: { pending: boolean; busy: boolean };
    direct: { pending: boolean } | null;
  },
): { pending: boolean; disabled: boolean } {
  if (action.kind === "git") {
    return {
      pending: action.action.status === "pending",
      disabled: action.action.disabled || Boolean(action.blocked),
    };
  }
  if (action.kind === "continue" && sources.direct) {
    return { pending: sources.direct.pending, disabled: sources.direct.pending };
  }
  return { pending: sources.requests.pending, disabled: sources.requests.busy };
}

function actionIcon(action: PrStripAction): LucideIcon {
  if (action.kind === "commit-and-push") return GitCommitHorizontal;
  if (action.kind !== "git") return action.kind === "continue" ? FastForward : Wrench;
  return action.action.id === "archive-workspace" ? Archive : GitMerge;
}

function StripButton({
  action,
  tone,
  pending,
  disabled,
  onPress,
  onRunOption,
  onCopyLink,
}: {
  action: PrStripAction;
  tone: PrStripTone;
  pending: boolean;
  disabled: boolean;
  onPress: (action: PrStripAction) => void;
  onRunOption: (action: GitAction) => void;
  onCopyLink: () => void;
}) {
  const { t } = useTranslation();
  const handlePress = useCallback(() => onPress(action), [onPress, action]);
  const icon = actionIcon(action);
  const filled = action.emphasis === "filled";
  const blocked = action.kind === "git" ? action.blocked : undefined;
  // A blocked action drops the state's color: outlined and muted beside the live next step.
  const buttonTone: PrStripTone = blocked ? "muted" : tone;
  const leftIcon = useMemo(
    () => <ToneIcon icon={icon} tone={filled ? "onTone" : buttonTone} size={13} />,
    [filled, icon, buttonTone],
  );
  const label = t(`workspace.git.prFlow.${action.label}`);
  const testID = `workspace-pr-status-${action.label}`;
  const options = action.kind === "git" ? (action.options ?? []) : [];
  const sheet = TONE_SHEETS[buttonTone];
  const button = (
    <Button
      variant={filled ? "default" : "outline"}
      size="xs"
      leftIcon={leftIcon}
      onPress={handlePress}
      disabled={disabled}
      loading={pending}
      style={[
        styles.stripButton,
        filled ? sheet.fill : sheet.border,
        action.kind === "continue" && styles.dashed,
        options.length > 0 && styles.splitStart,
      ]}
      textStyle={filled ? styles.onToneText : sheet.text}
      testID={testID}
    >
      {label}
    </Button>
  );
  if (options.length > 0) {
    return (
      <View style={styles.split}>
        {button}
        <DropdownMenu>
          <DropdownMenuTrigger
            style={[styles.splitEnd, sheet.fill]}
            disabled={disabled || pending}
            accessibilityLabel={t("workspace.git.prFlow.mergeOptions")}
            testID={`${testID}-options`}
          >
            <ToneIcon icon={ChevronDown} tone="onTone" size={13} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" width={220}>
            {options.map((option) => (
              <MergeOptionItem key={option.id} option={option} onRun={onRunOption} />
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem leading={COPY_LINK_ICON} onSelect={onCopyLink}>
              {t("workspace.git.prFlow.copyLink")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </View>
    );
  }
  if (blocked && action.kind === "git") {
    const reason = blocked.reason
      ? t(`workspace.git.prFlow.blocked.${blocked.reason}`)
      : action.action.unavailableMessage;
    if (!reason) return button;
    // The trigger wraps the disabled button so hover, and a tap on phones, still reach it.
    return (
      <Tooltip delayDuration={150} enabledOnDesktop enabledOnMobile>
        <TooltipTrigger accessibilityHint={reason}>{button}</TooltipTrigger>
        <TooltipContent side="bottom" align="end">
          <Text style={styles.tooltipText}>{reason}</Text>
        </TooltipContent>
      </Tooltip>
    );
  }
  if (action.kind !== "continue") return button;
  return (
    <Tooltip delayDuration={300} enabledOnDesktop enabledOnMobile={false}>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="bottom" align="end">
        <Text style={styles.tooltipText}>{t("workspace.git.prFlow.continueTooltip")}</Text>
      </TooltipContent>
    </Tooltip>
  );
}

function MergeOptionItem({
  option,
  onRun,
}: {
  option: GitAction;
  onRun: (action: GitAction) => void;
}) {
  const handleSelect = useCallback(() => onRun(option), [onRun, option]);
  return (
    <DropdownMenuItem
      leading={option.icon}
      onSelect={handleSelect}
      disabled={option.disabled}
      status={option.status}
      pendingLabel={option.pendingLabel}
      successLabel={option.successLabel}
    >
      {option.label}
    </DropdownMenuItem>
  );
}

type IconTone = PrStripTone | "onTone";

function toneColor(theme: Theme, tone: IconTone): string {
  switch (tone) {
    case "success":
      return theme.colors.statusSuccess;
    case "danger":
      return theme.colors.statusDanger;
    case "warning":
      return theme.colors.statusWarning;
    case "merged":
      return theme.colors.statusMerged;
    case "muted":
      return theme.colors.foregroundMuted;
    case "onTone":
      return theme.colors.surface0;
  }
}

function themedIcon(tone: IconTone) {
  return withUnistyles(
    ({ icon: Icon, size, color }: { icon: LucideIcon; size: number; color?: string }) => (
      <Icon size={size} color={color} strokeWidth={2} />
    ),
    (theme) => ({ color: toneColor(theme, tone) }),
  );
}

const TONE_ICONS: Record<IconTone, ReturnType<typeof themedIcon>> = {
  success: themedIcon("success"),
  danger: themedIcon("danger"),
  warning: themedIcon("warning"),
  merged: themedIcon("merged"),
  muted: themedIcon("muted"),
  onTone: themedIcon("onTone"),
};

function ToneIcon({ icon, tone, size }: { icon: LucideIcon; tone: IconTone; size: number }) {
  const Themed = TONE_ICONS[tone];
  return <Themed icon={icon} size={size} />;
}

function toneWash(theme: Theme, tone: PrStripTone): { tint: string; border: string } {
  switch (tone) {
    case "success":
      return { tint: theme.colors.statusSuccessTint, border: theme.colors.statusSuccessBorder };
    case "danger":
      return { tint: theme.colors.statusDangerTint, border: theme.colors.statusDangerBorder };
    case "warning":
      return { tint: theme.colors.statusWarningTint, border: theme.colors.statusWarningBorder };
    case "merged":
      return { tint: theme.colors.statusMergedTint, border: theme.colors.statusMergedBorder };
    case "muted":
      return { tint: theme.colors.statusNeutralTint, border: theme.colors.statusNeutralBorder };
  }
}

function createToneSheet(tone: PrStripTone) {
  return StyleSheet.create((theme) => {
    const color = toneColor(theme, tone);
    const wash = toneWash(theme, tone);
    return {
      text: { color },
      fill: { backgroundColor: color, borderColor: color },
      border: { borderColor: wash.border },
      // The whole strip takes the state's wash, so the state reads before the label does.
      tint: { backgroundColor: wash.tint },
    };
  });
}

const TONE_SHEETS = {
  success: createToneSheet("success"),
  danger: createToneSheet("danger"),
  warning: createToneSheet("warning"),
  merged: createToneSheet("merged"),
  muted: createToneSheet("muted"),
};

const STRIP_BUTTON_HEIGHT = 22;
// The `#N` link matches the strip's buttons.
const CHIP_SIZE = STRIP_BUTTON_HEIGHT;

const styles = StyleSheet.create((theme) => ({
  bar: {
    height: HEADER_INNER_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    paddingHorizontal: theme.spacing[2],
    borderBottomWidth: theme.borderWidth[1],
    borderBottomColor: theme.colors.border,
  },
  inline: {
    height: HEADER_INNER_HEIGHT - theme.spacing[1] * 2,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    paddingHorizontal: theme.spacing[1.5],
    borderRadius: theme.borderRadius.md,
  },
  link: {
    height: CHIP_SIZE,
    flexDirection: "row",
    alignItems: "stretch",
    borderWidth: theme.borderWidth[1],
    borderRadius: theme.borderRadius.md,
    overflow: "hidden",
  },
  segment: {
    minWidth: CHIP_SIZE - theme.borderWidth[1] * 2,
    paddingHorizontal: theme.spacing[1],
    alignItems: "center",
    justifyContent: "center",
  },
  segmentDivided: {
    borderLeftWidth: theme.borderWidth[1],
  },
  chipText: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    fontVariant: ["tabular-nums"],
  },
  status: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: theme.spacing[2],
  },
  label: {
    flexShrink: 1,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
  },
  stripButton: {
    minHeight: STRIP_BUTTON_HEIGHT,
    height: STRIP_BUTTON_HEIGHT,
    paddingHorizontal: theme.spacing[2],
    gap: theme.spacing[1],
    borderRadius: theme.borderRadius.md,
  },
  dashed: {
    borderStyle: "dashed",
  },
  split: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  splitStart: {
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0,
  },
  splitEnd: {
    height: STRIP_BUTTON_HEIGHT,
    justifyContent: "center",
    paddingHorizontal: theme.spacing[1],
    borderLeftWidth: theme.borderWidth[1],
    borderLeftColor: theme.colors.surface0,
    borderTopRightRadius: theme.borderRadius.md,
    borderBottomRightRadius: theme.borderRadius.md,
  },
  onToneText: {
    color: theme.colors.surface0,
  },
  tooltipText: {
    color: theme.colors.popoverForeground,
    fontSize: theme.fontSize.sm,
  },
}));
