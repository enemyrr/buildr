import { useCallback, useMemo } from "react";
import { Text, View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import { Archive, ArrowUpRight, FastForward, GitMerge, Wrench } from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/contexts/toast-context";
import { GIT_ACTION_ICONS } from "@/git/action-icons";
import { useCheckoutGitActionsStore } from "@/git/actions-store";
import { getForgePresentation } from "@/git/forge";
import { deriveMergeCapability } from "@/git/merge-capability";
import {
  sendContinueRequest,
  sendFixChecksRequest,
  sendResolveConflictsRequest,
} from "@/git/pr-instructions";
import {
  derivePrStripState,
  type PrStripAction,
  type PrStripTone,
} from "@/git/pr-status-strip-state";
import { useGitActionRunner, useGitActions } from "@/git/use-actions";
import { useInstructionRequests } from "@/git/use-instruction-requests";
import { useCheckoutPrStatusQuery } from "@/git/use-pr-status-query";
import { useCheckoutStatusQuery } from "@/git/use-status-query";
import { HEADER_INNER_HEIGHT } from "@/constants/layout";
import { useHostFeature } from "@/runtime/host-features";
import type { Theme } from "@/styles/theme";
import { openExternalUrl } from "@/utils/open-external-url";

interface PrStatusStripProps {
  serverId: string;
  cwd: string;
  agentId: string | null;
  /** `bar` spans the Explorer above its tabs; `inline` sits among the header actions. */
  variant?: "bar" | "inline";
}

/**
 * The change request's lifecycle: `#N ↗`, its state in the state's color, and the next step —
 * Merge while open, Continue or Archive once merged or closed.
 */
export function PrStatusStrip({ serverId, cwd, agentId, variant = "bar" }: PrStatusStripProps) {
  const { t } = useTranslation();
  const { status: prStatus, forge } = useCheckoutPrStatusQuery({ serverId, cwd });
  const { status } = useCheckoutStatusQuery({ serverId, cwd });
  const { gitActions } = useGitActions({ serverId, cwd, icons: GIT_ACTION_ICONS });
  const requests = useInstructionRequests({ serverId, cwd, agentId });
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
      { ...prStatus, autoMergeEnabled: capability?.autoMergeEnabled ?? false },
      gitActions,
    );
  }, [prStatus, gitActions]);

  const prUrl = prStatus?.url ?? null;
  const baseRef = status?.baseRef ?? null;
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
        void requests.send("Continue request", (input) =>
          sendContinueRequest({ ...input, baseRef, prUrl }),
        );
      } else if (action.kind === "fix-checks") {
        void requests.send("Fix request", (input) => sendFixChecksRequest({ ...input, prUrl }));
      } else {
        void requests.send("Resolve request", (input) =>
          sendResolveConflictsRequest({ ...input, baseRef, prUrl }),
        );
      }
    },
    [runGitAction, requests, baseRef, prUrl, directContinue, continueBranch, serverId, cwd, toast],
  );
  const openPr = useCallback(() => {
    if (prUrl) void openExternalUrl(prUrl);
  }, [prUrl]);

  if (!prStatus || !state) return null;
  const numberLabel = prStatus.number
    ? `${getForgePresentation(forge).numberPrefix}${prStatus.number}`
    : "PR";
  return (
    <View
      style={[variant === "bar" ? styles.bar : styles.inline, TONE_SHEETS[state.tone].tint]}
      testID={variant === "bar" ? "workspace-pr-status-strip" : "workspace-pr-status-inline"}
    >
      <Button
        variant="ghost"
        size="xs"
        onPress={openPr}
        accessibilityRole="link"
        accessibilityLabel={t("workspace.git.prFlow.openPr", { ref: numberLabel })}
        textStyle={styles.chipText}
        trailing={CHIP_ARROW}
        testID="workspace-pr-status-number"
      >
        {numberLabel}
      </Button>
      <Text
        style={[styles.label, variant === "bar" && styles.labelFill, TONE_SHEETS[state.tone].text]}
        numberOfLines={1}
        testID="workspace-pr-status-label"
      >
        {t(`workspace.git.prFlow.state.${state.label}`)}
      </Text>
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
          />
        ))}
      </View>
    </View>
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
    return { pending: action.action.status === "pending", disabled: action.action.disabled };
  }
  if (action.kind === "continue" && sources.direct) {
    return { pending: sources.direct.pending, disabled: sources.direct.pending };
  }
  return { pending: sources.requests.pending, disabled: sources.requests.busy };
}

function actionIcon(action: PrStripAction): LucideIcon {
  if (action.kind !== "git") return action.kind === "continue" ? FastForward : Wrench;
  return action.action.id === "archive-workspace" ? Archive : GitMerge;
}

function StripButton({
  action,
  tone,
  pending,
  disabled,
  onPress,
}: {
  action: PrStripAction;
  tone: PrStripTone;
  pending: boolean;
  disabled: boolean;
  onPress: (action: PrStripAction) => void;
}) {
  const { t } = useTranslation();
  const handlePress = useCallback(() => onPress(action), [onPress, action]);
  const icon = actionIcon(action);
  const onToneIcon = useMemo(() => <ToneIcon icon={icon} tone="onTone" size={13} />, [icon]);
  const label = t(`workspace.git.prFlow.${action.label}`);
  const testID = `workspace-pr-status-${action.label}`;
  if (action.emphasis === "filled") {
    return (
      <Button
        variant="default"
        size="xs"
        leftIcon={onToneIcon}
        onPress={handlePress}
        disabled={disabled}
        loading={pending}
        style={TONE_SHEETS[tone].fill}
        textStyle={styles.onToneText}
        testID={testID}
      >
        {label}
      </Button>
    );
  }
  const button = (
    <Button
      variant="ghost"
      size="xs"
      leftIcon={icon}
      onPress={handlePress}
      disabled={disabled}
      loading={pending}
      testID={testID}
    >
      {label}
    </Button>
  );
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

const CHIP_ARROW = <ToneIcon icon={ArrowUpRight} tone="muted" size={12} />;

function toneTint(theme: Theme, tone: PrStripTone): string {
  switch (tone) {
    case "success":
      return theme.colors.statusSuccessSubtle;
    case "danger":
      return theme.colors.statusDangerSubtle;
    case "warning":
      return theme.colors.statusWarningSubtle;
    case "merged":
      return theme.colors.statusMergedSubtle;
    case "muted":
      return theme.colors.statusNeutralSubtle;
  }
}

function createToneSheet(tone: PrStripTone) {
  return StyleSheet.create((theme) => {
    const color = toneColor(theme, tone);
    return {
      text: { color },
      fill: { backgroundColor: color, borderColor: color },
      // The whole strip takes the state's wash, so the state reads before the label does.
      tint: { backgroundColor: toneTint(theme, tone) },
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

const styles = StyleSheet.create((theme) => ({
  bar: {
    height: HEADER_INNER_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    paddingHorizontal: theme.spacing[1],
    borderBottomWidth: theme.borderWidth[1],
    borderBottomColor: theme.colors.border,
  },
  inline: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    paddingHorizontal: theme.spacing[1],
    paddingVertical: theme.spacing[0.5],
    borderRadius: theme.borderRadius.md,
  },
  chipText: {
    color: theme.colors.foreground,
    fontVariant: ["tabular-nums"],
  },
  label: {
    minWidth: 0,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  labelFill: {
    flex: 1,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
  },
  onToneText: {
    color: theme.colors.surface0,
  },
  tooltipText: {
    color: theme.colors.popoverForeground,
    fontSize: theme.fontSize.sm,
  },
}));
