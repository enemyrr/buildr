import { useCallback, useMemo } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  View,
  type PressableStateCallbackType,
} from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { Archive, ArrowUpRight, FastForward, GitMerge, Wrench } from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";
import { GIT_ACTION_ICONS } from "@/git/action-icons";
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
import { isWeb } from "@/constants/platform";
import type { Theme } from "@/styles/theme";
import { openExternalUrl } from "@/utils/open-external-url";

interface PrStatusStripProps {
  serverId: string;
  cwd: string;
  agentId: string | null;
}

/** The change request's state and next step, pinned above the Explorer tabs. */
export function PrStatusStrip({ serverId, cwd, agentId }: PrStatusStripProps) {
  const { status: prStatus } = useCheckoutPrStatusQuery({ serverId, cwd });
  const { status } = useCheckoutStatusQuery({ serverId, cwd });
  const { gitActions } = useGitActions({ serverId, cwd, icons: GIT_ACTION_ICONS });
  const requests = useInstructionRequests({ serverId, cwd, agentId });
  const runGitAction = useGitActionRunner();

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
      if (action.kind === "continue") {
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
    [runGitAction, requests, baseRef, prUrl],
  );
  const openPr = useCallback(() => {
    if (prUrl) void openExternalUrl(prUrl);
  }, [prUrl]);

  if (!prStatus || !state) return null;
  const tone = TONE_STYLES[state.tone];
  return (
    <View style={[styles.strip, tone.strip]} testID="workspace-pr-status-strip">
      <Pressable
        onPress={openPr}
        style={chipStyle(tone)}
        accessibilityRole="link"
        accessibilityLabel={`Open pull request ${prStatus.number ?? ""}`.trim()}
        testID="workspace-pr-status-number"
      >
        <Text style={[styles.chipText, tone.text]}>
          {prStatus.number ? `#${prStatus.number}` : "PR"}
        </Text>
        <ToneIcon icon={ArrowUpRight} tone={state.tone} size={12} />
      </Pressable>
      <Text style={[styles.label, tone.text]} numberOfLines={1} testID="workspace-pr-status-label">
        {state.label}
      </Text>
      <View style={styles.actions}>
        {state.actions.map((action) => (
          <StripButton
            key={action.label}
            action={action}
            tone={state.tone}
            pending={action.kind === "git" ? action.action.status === "pending" : requests.pending}
            disabled={action.kind === "git" ? action.action.disabled : requests.busy}
            onPress={runAction}
          />
        ))}
      </View>
    </View>
  );
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
  const handlePress = useCallback(() => onPress(action), [onPress, action]);
  const sheet = TONE_STYLES[tone];
  const filled = action.emphasis === "filled";
  const style = useCallback(
    ({ hovered, pressed }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.button,
      filled ? sheet.filled : sheet.outline,
      (Boolean(hovered) || pressed) && (filled ? sheet.filledHover : sheet.outlineHover),
      disabled && styles.disabled,
    ],
    [filled, sheet, disabled],
  );
  const icon = actionIcon(action);
  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled || pending}
      style={style}
      testID={`workspace-pr-status-${action.label.toLowerCase()}`}
    >
      {pending ? (
        <ToneSpinner tone={filled ? "onTone" : tone} />
      ) : (
        <ToneIcon icon={icon} tone={filled ? "onTone" : tone} size={13} />
      )}
      <Text style={[styles.buttonText, filled ? sheet.filledText : sheet.text]}>
        {action.label}
      </Text>
    </Pressable>
  );
}

function chipStyle(tone: ToneSheet) {
  return ({ hovered, pressed }: PressableStateCallbackType & { hovered?: boolean }) => [
    styles.chip,
    tone.chip,
    (Boolean(hovered) || pressed) && tone.outlineHover,
  ];
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

const TONE_ICONS: Record<IconTone, ReturnType<typeof themedIcon>> = {
  success: themedIcon("success"),
  danger: themedIcon("danger"),
  warning: themedIcon("warning"),
  merged: themedIcon("merged"),
  muted: themedIcon("muted"),
  onTone: themedIcon("onTone"),
};

function themedIcon(tone: IconTone) {
  return withUnistyles(
    ({ icon: Icon, size, color }: { icon: LucideIcon; size: number; color?: string }) => (
      <Icon size={size} color={color} strokeWidth={2} />
    ),
    (theme) => ({ color: toneColor(theme, tone) }),
  );
}

const TONE_SPINNERS = {
  success: themedSpinner("success"),
  danger: themedSpinner("danger"),
  warning: themedSpinner("warning"),
  merged: themedSpinner("merged"),
  muted: themedSpinner("muted"),
  onTone: themedSpinner("onTone"),
};

function themedSpinner(tone: IconTone) {
  return withUnistyles(ActivityIndicator, (theme) => ({ color: toneColor(theme, tone) }));
}

function ToneSpinner({ tone }: { tone: IconTone }) {
  const Themed = TONE_SPINNERS[tone];
  return <Themed size="small" style={styles.spinner} />;
}

function ToneIcon({ icon, tone, size }: { icon: LucideIcon; tone: IconTone; size: number }) {
  const Themed = TONE_ICONS[tone];
  return <Themed icon={icon} size={size} />;
}

// Web theme colors are CSS variables, so only native can take a hex alpha suffix.
function withAlpha(color: string, alpha: number): string {
  if (isWeb) return `color-mix(in srgb, ${color} ${alpha * 100}%, transparent)`;
  return `${color}${Math.round(alpha * 255)
    .toString(16)
    .padStart(2, "0")}`;
}

function createToneSheet(tone: PrStripTone) {
  return StyleSheet.create((theme) => {
    const color = toneColor(theme, tone);
    return {
      strip: { backgroundColor: withAlpha(color, 0.12) },
      text: { color },
      chip: { borderColor: withAlpha(color, 0.35) },
      filled: { backgroundColor: color, borderColor: color },
      filledHover: { backgroundColor: withAlpha(color, 0.85) },
      filledText: { color: theme.colors.surface0 },
      outline: { borderColor: withAlpha(color, 0.35) },
      outlineHover: { backgroundColor: withAlpha(color, 0.2) },
    };
  });
}

const TONE_STYLES = {
  success: createToneSheet("success"),
  danger: createToneSheet("danger"),
  warning: createToneSheet("warning"),
  merged: createToneSheet("merged"),
  muted: createToneSheet("muted"),
};

type ToneSheet = (typeof TONE_STYLES)[PrStripTone];

const styles = StyleSheet.create((theme) => ({
  strip: {
    height: HEADER_INNER_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[2],
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[0.5],
    height: 22,
    paddingHorizontal: theme.spacing[1.5],
    borderWidth: theme.borderWidth[1],
    borderRadius: theme.borderRadius.md,
  },
  chipText: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    fontVariant: ["tabular-nums"],
  },
  label: {
    flex: 1,
    minWidth: 0,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.medium,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1.5],
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    height: 24,
    paddingHorizontal: theme.spacing[2],
    borderWidth: theme.borderWidth[1],
    borderRadius: theme.borderRadius.md,
  },
  buttonText: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  spinner: {
    transform: [{ scale: 0.6 }],
    width: 13,
    height: 13,
  },
  disabled: {
    opacity: theme.opacity[50],
  },
}));
