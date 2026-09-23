import { useMemo } from "react";
import { Text, View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { getProviderIcon } from "@/components/provider-icons";
import { clampPct, formatPct, resolveUsedPct } from "@/provider-usage/format";
import { deriveTone } from "@/provider-usage/tone";
import type { ProviderUsage, ProviderUsageTone } from "@/provider-usage/types";
import {
  PROVIDER_USAGE_STALE_TIME_MS,
  useProviderUsage,
} from "@/provider-usage/use-provider-usage";
import type { Theme } from "@/styles/theme";

const BAR_LIMIT = 3;
const BAR_WIDTH = 44;
const BAR_ICON_SIZE = 10;

export interface UsageGlance {
  providerId: string;
  displayName: string;
  windowLabel: string;
  pct: number;
  tone: ProviderUsageTone;
}

// The bar shows the provider's most constrained window, since that is the one that blocks work.
function toGlance(usage: ProviderUsage): UsageGlance | null {
  let top: { label: string; pct: number; tone: ProviderUsageTone } | null = null;
  for (const window of usage.windows) {
    const pct = resolveUsedPct(window);
    if (pct == null || (top && pct <= top.pct)) continue;
    top = { label: window.label, pct, tone: window.tone ?? deriveTone(pct) };
  }
  if (!top) return null;
  return {
    providerId: usage.providerId,
    displayName: usage.displayName,
    windowLabel: top.label,
    pct: clampPct(top.pct),
    tone: top.tone,
  };
}

export function useUsageGlances(serverId: string | null): UsageGlance[] {
  const { view } = useProviderUsage(serverId, {
    refetchIntervalMs: PROVIDER_USAGE_STALE_TIME_MS,
  });
  const providers = view.kind === "ready" ? view.payload.providers : null;
  return useMemo(() => {
    if (!providers) return [];
    return providers
      .filter((usage) => usage.status === "available")
      .flatMap((usage) => {
        const glance = toGlance(usage);
        return glance ? [glance] : [];
      })
      .slice(0, BAR_LIMIT);
  }, [providers]);
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

export function UsageBars({ glances, active }: { glances: UsageGlance[]; active: boolean }) {
  return (
    <View style={styles.bars}>
      {glances.map((glance) => (
        <View key={glance.providerId} style={styles.barRow}>
          <ThemedProviderIcon
            Icon={getProviderIcon(glance.providerId)}
            size={BAR_ICON_SIZE}
            uniProps={active ? foregroundColorMapping : foregroundMutedColorMapping}
          />
          <View style={styles.track}>
            <View style={[styles.fill, fillToneStyle(glance.tone), { width: `${glance.pct}%` }]} />
          </View>
        </View>
      ))}
    </View>
  );
}

export function UsageGlanceTooltip({ glances }: { glances: UsageGlance[] }) {
  return (
    <View style={styles.tooltip}>
      {glances.map((glance) => (
        <View key={glance.providerId} style={styles.tooltipRow}>
          <Text style={styles.tooltipName}>{glance.displayName}</Text>
          <Text style={styles.tooltipValue}>
            {formatPct(glance.pct)}
            <Text style={styles.tooltipWindow}>{` · ${glance.windowLabel}`}</Text>
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  bars: {
    justifyContent: "center",
    gap: 3,
  },
  barRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1.5],
  },
  track: {
    width: BAR_WIDTH,
    height: 3,
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
  tooltip: {
    gap: theme.spacing[1],
    minWidth: 160,
  },
  tooltipRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: theme.spacing[3],
  },
  tooltipName: {
    color: theme.colors.popoverForeground,
    fontSize: theme.fontSize.sm,
  },
  tooltipValue: {
    color: theme.colors.popoverForeground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    fontVariant: ["tabular-nums"],
  },
  tooltipWindow: {
    color: theme.colors.foregroundMuted,
    fontWeight: theme.fontWeight.normal,
  },
}));
