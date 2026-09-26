import { useCallback, useMemo } from "react";
import { Pressable, Text, View } from "react-native";
import { ArrowLeftRight } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import Animated, { FadeIn } from "react-native-reanimated";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { getProviderIcon } from "@/components/provider-icons";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { clampPct, formatPct, resolveUsedPct } from "@/provider-usage/format";
import { setUsageGlanceProvider, useUsageGlanceStore } from "@/provider-usage/glance-store";
import { deriveTone } from "@/provider-usage/tone";
import type { ProviderUsage, ProviderUsageTone } from "@/provider-usage/types";
import {
  PROVIDER_USAGE_STALE_TIME_MS,
  useProviderUsage,
} from "@/provider-usage/use-provider-usage";
import { ProviderUsageWindowBar } from "@/provider-usage/window-bar";
import { ICON_SIZE, type Theme } from "@/styles/theme";

const BAR_WIDTH = 72;
const SWAP_FADE_MS = 160;
// Session first, then weekly. Providers without these fall back to their first two windows.
const GLANCE_WINDOW_ORDER = ["five_hour", "session", "weekly"];

interface GlanceWindow {
  id: string;
  pct: number;
  tone: ProviderUsageTone;
}

export interface UsageGlance {
  usage: ProviderUsage;
  windows: GlanceWindow[];
}

function toGlance(usage: ProviderUsage): UsageGlance | null {
  const resolved = usage.windows.flatMap((window) => {
    const pct = resolveUsedPct(window);
    if (pct == null) return [];
    return [{ id: window.id, pct: clampPct(pct), tone: window.tone ?? deriveTone(pct) }];
  });
  const preferred = resolved
    .filter((window) => GLANCE_WINDOW_ORDER.includes(window.id))
    .sort((a, b) => GLANCE_WINDOW_ORDER.indexOf(a.id) - GLANCE_WINDOW_ORDER.indexOf(b.id));
  const windows = (preferred.length > 0 ? preferred : resolved).slice(0, 2);
  return windows.length > 0 ? { usage, windows } : null;
}

export function useUsageGlance(serverId: string | null) {
  const { view } = useProviderUsage(serverId, {
    refetchIntervalMs: PROVIDER_USAGE_STALE_TIME_MS,
  });
  const providers = view.kind === "ready" ? view.payload.providers : null;
  const glances = useMemo(() => {
    if (!providers) return [];
    return providers
      .filter((usage) => usage.status === "available")
      .flatMap((usage) => {
        const glance = toGlance(usage);
        return glance ? [glance] : [];
      });
  }, [providers]);
  const selectedId = useUsageGlanceStore((state) => state.providerId);
  const index = Math.max(
    0,
    glances.findIndex((glance) => glance.usage.providerId === selectedId),
  );
  const active = glances[index] ?? null;
  const next = glances.length > 1 ? glances[(index + 1) % glances.length] : null;
  return { active, next };
}

function ProviderIcon({
  Icon,
  size,
  color = "",
}: {
  Icon: ReturnType<typeof getProviderIcon>;
  size: number;
  color?: string;
}) {
  return <Icon size={size} color={color} />;
}

export const foregroundColorMapping = (theme: Theme) => ({ color: theme.colors.foreground });
export const foregroundMutedColorMapping = (theme: Theme) => ({
  color: theme.colors.foregroundMuted,
});

export const ThemedProviderIcon = withUnistyles(ProviderIcon, foregroundMutedColorMapping);
const ThemedSwitchIcon = withUnistyles(ArrowLeftRight, foregroundColorMapping);

function fillToneStyle(tone: ProviderUsageTone) {
  switch (tone) {
    case "ok":
      return styles.fillOk;
    case "warning":
      return styles.fillWarning;
    case "danger":
      return styles.fillDanger;
    default:
      return styles.fillDefault;
  }
}

export function UsageGlanceSwitch({
  active,
  next,
}: {
  active: UsageGlance;
  next: UsageGlance | null;
}) {
  const { t } = useTranslation();
  const providerId = active.usage.providerId;
  const handlePress = useCallback(() => {
    if (next) setUsageGlanceProvider(next.usage.providerId);
  }, [next]);
  const label = next
    ? t("sidebar.resources.switchProvider", { name: next.usage.displayName })
    : active.usage.displayName;

  return (
    <Tooltip delayDuration={300}>
      <TooltipTrigger asChild>
        <Pressable
          style={styles.switch}
          disabled={!next}
          onPress={handlePress}
          testID="sidebar-usage-switch"
          accessibilityRole="button"
          accessibilityLabel={label}
        >
          {({ hovered }) =>
            hovered && next ? (
              <Animated.View key="switch" entering={FadeIn.duration(SWAP_FADE_MS)}>
                <ThemedSwitchIcon size={ICON_SIZE.sm} />
              </Animated.View>
            ) : (
              <Animated.View key={providerId} entering={FadeIn.duration(SWAP_FADE_MS)}>
                <ThemedProviderIcon Icon={getProviderIcon(providerId)} size={ICON_SIZE.sm} />
              </Animated.View>
            )
          }
        </Pressable>
      </TooltipTrigger>
      <TooltipContent side="top" align="center" offset={8}>
        <Text style={styles.tooltipText}>{label}</Text>
      </TooltipContent>
    </Tooltip>
  );
}

export function UsageGlanceBars({ glance, active }: { glance: UsageGlance; active: boolean }) {
  return (
    <Animated.View
      key={glance.usage.providerId}
      entering={FadeIn.duration(SWAP_FADE_MS)}
      style={styles.bars}
    >
      {glance.windows.map((window) => (
        <View key={window.id} style={styles.barRow}>
          <View style={styles.track}>
            <View style={[styles.fill, fillToneStyle(window.tone), { width: `${window.pct}%` }]} />
          </View>
          <Text style={active ? styles.barValueActive : styles.barValue}>
            {formatPct(window.pct)}
          </Text>
        </View>
      ))}
    </Animated.View>
  );
}

export function ProviderUsageSummary({ usage }: { usage: ProviderUsage }) {
  return (
    <View style={styles.summary}>
      <View style={styles.summaryHeader}>
        <ThemedProviderIcon Icon={getProviderIcon(usage.providerId)} size={ICON_SIZE.sm} />
        <Text style={styles.summaryName} numberOfLines={1}>
          {usage.displayName}
        </Text>
        {usage.planLabel ? <Text style={styles.summaryPlan}>{usage.planLabel}</Text> : null}
      </View>
      {usage.windows.map((window) => (
        <ProviderUsageWindowBar key={window.id} window={window} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  switch: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  bars: {
    justifyContent: "center",
    gap: 3,
  },
  barRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  track: {
    width: BAR_WIDTH,
    height: 4,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.surface3,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: theme.borderRadius.full,
  },
  fillDefault: {
    backgroundColor: theme.colors.foregroundMuted,
  },
  fillOk: {
    backgroundColor: theme.colors.statusSuccess,
  },
  fillWarning: {
    backgroundColor: theme.colors.statusWarning,
  },
  fillDanger: {
    backgroundColor: theme.colors.statusDanger,
  },
  barValue: {
    minWidth: 28,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    lineHeight: theme.fontSize.sm,
    fontVariant: ["tabular-nums"],
  },
  barValueActive: {
    minWidth: 28,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    lineHeight: theme.fontSize.sm,
    fontVariant: ["tabular-nums"],
  },
  tooltipText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
  summary: {
    gap: theme.spacing[1],
  },
  summaryHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  summaryName: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    flexShrink: 1,
  },
  summaryPlan: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
}));
