import { useCallback, useMemo, useState } from "react";
import { Pressable, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { Gauge } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { getProviderIcon } from "@/components/provider-icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useFetchQuery } from "@/data/query";
import { useLocalDaemonServerId } from "@/hooks/use-is-local-daemon";
import { ProviderUsageWindowBar } from "@/provider-usage/window-bar";
import { clampPct, formatPct } from "@/provider-usage/format";
import { deriveTone } from "@/provider-usage/tone";
import { useProviderUsage } from "@/provider-usage/use-provider-usage";
import type { ProviderUsage } from "@/provider-usage/types";
import { useHostRuntimeClient, useHostRuntimeIsConnected, useHosts } from "@/runtime/host-runtime";
import { useSessionStore, type Agent } from "@/stores/session-store";
import { ICON_SIZE, type Theme } from "@/styles/theme";
import {
  buildResourceRows,
  formatCpu,
  formatMemory,
  sumResources,
  type ResourceRow,
} from "./resources/resource-tree";

const RESOURCES_POLL_MS = 2_000;
const COLLAPSED_ROW_COUNT = 8;
const CONTEXT_AGENT_LIMIT = 6;
const INDENT_PER_DEPTH = 12;

const ThemedGauge = withUnistyles(Gauge);
const foregroundColorMapping = (theme: Theme) => ({ color: theme.colors.foreground });
const foregroundMutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

function useResourcesServerId(): string | null {
  const localServerId = useLocalDaemonServerId();
  const hosts = useHosts();
  return localServerId ?? hosts[0]?.serverId ?? null;
}

function useDaemonResources(serverId: string | null, enabled: boolean) {
  const client = useHostRuntimeClient(serverId ?? "");
  const isConnected = useHostRuntimeIsConnected(serverId ?? "");
  const supported = useSessionStore(
    (state) => state.sessions[serverId ?? ""]?.serverInfo?.features?.daemonResources === true,
  );
  const query = useFetchQuery({
    queryKey: ["daemonResources", serverId ?? ""],
    dataShape: "value",
    staleTimeMs: RESOURCES_POLL_MS,
    queryFn: () => {
      if (!client) throw new Error("Host unavailable");
      return client.getDaemonResources();
    },
    enabled: enabled && supported && isConnected && client !== null,
    refetchInterval: RESOURCES_POLL_MS,
    refetchOnWindowFocus: false,
  });
  return { supported, data: query.data ?? null };
}

function hasContext(agent: Agent): boolean {
  return (
    agent.status !== "closed" &&
    !agent.archivedAt &&
    agent.parentAgentId === null &&
    typeof agent.lastUsage?.contextWindowMaxTokens === "number" &&
    typeof agent.lastUsage.contextWindowUsedTokens === "number" &&
    agent.lastUsage.contextWindowMaxTokens > 0
  );
}

function useContextAgents(serverId: string | null): Agent[] {
  const agents = useSessionStore((state) => state.sessions[serverId ?? ""]?.agents ?? null);
  return useMemo(() => {
    if (!agents) return [];
    return [...agents.values()]
      .filter(hasContext)
      .sort((a, b) => b.lastActivityAt.getTime() - a.lastActivityAt.getTime())
      .slice(0, CONTEXT_AGENT_LIMIT);
  }, [agents]);
}

function SectionLabel({ children }: { children: string }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

function ProcessRow({ row }: { row: ResourceRow }) {
  const nameStyle = useMemo<StyleProp<ViewStyle>>(
    () => [styles.processNameCell, { paddingLeft: row.depth * INDENT_PER_DEPTH }],
    [row.depth],
  );
  return (
    <View style={styles.processRow}>
      <View style={nameStyle}>
        <Text
          style={row.depth === 0 ? styles.processNameRoot : styles.processName}
          numberOfLines={1}
        >
          {row.name}
        </Text>
      </View>
      <Text style={styles.processCpu}>{formatCpu(row.cpuPercent)}</Text>
      <Text style={styles.processMemory}>{formatMemory(row.memoryBytes)}</Text>
    </View>
  );
}

function ResourcesSection({ serverId, open }: { serverId: string | null; open: boolean }) {
  const { t } = useTranslation();
  const { supported, data } = useDaemonResources(serverId, open);
  const [showAll, setShowAll] = useState(false);
  const rows = useMemo(() => (data ? buildResourceRows(data.processes, data.rootPid) : []), [data]);
  const totals = useMemo(() => (data ? sumResources(data.processes) : null), [data]);
  const toggleShowAll = useCallback(() => setShowAll((value) => !value), []);

  if (!supported) {
    return <Text style={styles.muted}>{t("sidebar.resources.updateHost")}</Text>;
  }

  const visibleRows = showAll ? rows : rows.slice(0, COLLAPSED_ROW_COUNT);
  return (
    <View>
      <View style={styles.totalsRow}>
        <Text style={styles.totalsLabel}>{t("sidebar.resources.cpu")}</Text>
        <Text style={styles.totalsValue}>{totals ? formatCpu(totals.cpuPercent) : "—"}</Text>
        <Text style={styles.totalsLabel}>{t("sidebar.resources.memory")}</Text>
        <Text style={styles.totalsValue}>{totals ? formatMemory(totals.memoryBytes) : "—"}</Text>
      </View>
      <View style={styles.processHeader}>
        <Text style={styles.processHeaderName}>{t("sidebar.resources.name")}</Text>
        <Text style={styles.processHeaderCell}>{t("sidebar.resources.cpu")}</Text>
        <Text style={styles.processHeaderCell}>{t("sidebar.resources.memoryShort")}</Text>
      </View>
      {visibleRows.map((row) => (
        <ProcessRow key={row.pid} row={row} />
      ))}
      {rows.length > COLLAPSED_ROW_COUNT ? (
        <Pressable
          style={styles.showAll}
          onPress={toggleShowAll}
          testID="sidebar-resources-show-all"
        >
          {({ hovered }) => (
            <Text style={hovered ? styles.showAllTextHovered : styles.showAllText}>
              {showAll
                ? t("sidebar.resources.showLess")
                : t("sidebar.resources.showAll", { count: rows.length })}
            </Text>
          )}
        </Pressable>
      ) : null}
    </View>
  );
}

function ContextRow({ agent }: { agent: Agent }) {
  const { t } = useTranslation();
  const used = agent.lastUsage?.contextWindowUsedTokens ?? 0;
  const max = agent.lastUsage?.contextWindowMaxTokens ?? 1;
  const pct = clampPct((used / max) * 100);
  const tone = deriveTone(pct);
  const fillStyle = useMemo<StyleProp<ViewStyle>>(
    () => [
      styles.meterFill,
      tone === "danger" && styles.meterFillDanger,
      tone === "warning" && styles.meterFillWarning,
      { width: `${pct}%` },
    ],
    [pct, tone],
  );
  return (
    <View style={styles.contextRow}>
      <Text style={styles.contextTitle} numberOfLines={1}>
        {agent.title ?? t("sidebar.resources.untitledAgent")}
      </Text>
      <View style={styles.meterTrack}>
        <View style={fillStyle} />
      </View>
      <Text style={styles.contextValue}>{formatPct(pct)}</Text>
    </View>
  );
}

function ContextSection({ serverId }: { serverId: string | null }) {
  const { t } = useTranslation();
  const agents = useContextAgents(serverId);
  if (agents.length === 0) {
    return <Text style={styles.muted}>{t("sidebar.resources.noContext")}</Text>;
  }
  return (
    <View style={styles.contextList}>
      {agents.map((agent) => (
        <ContextRow key={agent.id} agent={agent} />
      ))}
    </View>
  );
}

function LimitsProvider({ usage }: { usage: ProviderUsage }) {
  const Icon = getProviderIcon(usage.providerId);
  return (
    <View style={styles.limitsProvider}>
      <View style={styles.limitsHeader}>
        <ThemedProviderIcon Icon={Icon} />
        <Text style={styles.limitsName} numberOfLines={1}>
          {usage.displayName}
        </Text>
        {usage.planLabel ? <Text style={styles.limitsPlan}>{usage.planLabel}</Text> : null}
      </View>
      {usage.windows.map((window) => (
        <ProviderUsageWindowBar key={window.id} window={window} />
      ))}
    </View>
  );
}

function ProviderIcon({
  Icon,
  color = "",
}: {
  Icon: ReturnType<typeof getProviderIcon>;
  color?: string;
}) {
  return <Icon size={ICON_SIZE.sm} color={color} />;
}

const ThemedProviderIcon = withUnistyles(ProviderIcon, foregroundMutedColorMapping);

function LimitsSection({ serverId, open }: { serverId: string | null; open: boolean }) {
  const { view } = useProviderUsage(serverId, { enabled: open });
  if (view.kind === "loading") return <Text style={styles.muted}>…</Text>;
  if (view.kind === "error") return <Text style={styles.muted}>{view.message}</Text>;
  const providers = view.payload.providers.filter(
    (usage) => usage.status === "available" && usage.windows.length > 0,
  );
  return (
    <View style={styles.limitsList}>
      {providers.map((usage) => (
        <LimitsProvider key={usage.providerId} usage={usage} />
      ))}
    </View>
  );
}

export function SidebarResourcesMenu() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const serverId = useResourcesServerId();

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <Tooltip delayDuration={300} enabledOnDesktop={!open}>
        <TooltipTrigger asChild>
          <View>
            <DropdownMenuTrigger
              style={styles.trigger}
              testID="sidebar-resources"
              accessibilityRole="button"
              accessibilityLabel={t("sidebar.resources.trigger")}
            >
              {({ hovered }) => (
                <ThemedGauge
                  size={ICON_SIZE.md}
                  uniProps={hovered ? foregroundColorMapping : foregroundMutedColorMapping}
                />
              )}
            </DropdownMenuTrigger>
          </View>
        </TooltipTrigger>
        <TooltipContent side="top" align="center" offset={8}>
          <Text style={styles.tooltipText}>{t("sidebar.resources.trigger")}</Text>
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        side="top"
        align="start"
        offset={8}
        width={340}
        maxHeight={560}
        scrollable
        testID="sidebar-resources-menu"
      >
        <View style={styles.section}>
          <SectionLabel>{t("sidebar.resources.title")}</SectionLabel>
          <ResourcesSection serverId={serverId} open={open} />
        </View>
        <View style={styles.divider} />
        <View style={styles.section}>
          <SectionLabel>{t("sidebar.resources.context")}</SectionLabel>
          <ContextSection serverId={serverId} />
        </View>
        <View style={styles.divider} />
        <View style={styles.section}>
          <SectionLabel>{t("sidebar.resources.limits")}</SectionLabel>
          <LimitsSection serverId={serverId} open={open} />
        </View>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const styles = StyleSheet.create((theme) => ({
  trigger: {
    width: 28,
    height: 28,
    borderRadius: theme.borderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  tooltipText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
  section: {
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    gap: theme.spacing[1],
  },
  sectionLabel: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    fontWeight: "500",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  divider: {
    height: 1,
    backgroundColor: theme.colors.borderAccent,
  },
  muted: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  totalsRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: theme.spacing[1],
    paddingBottom: theme.spacing[1],
  },
  totalsLabel: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
  },
  totalsValue: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    fontWeight: "500",
    fontVariant: ["tabular-nums"],
    marginRight: theme.spacing[2],
  },
  processHeader: {
    flexDirection: "row",
    paddingVertical: theme.spacing[1],
  },
  processHeaderName: {
    flex: 1,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  processHeaderCell: {
    width: 72,
    textAlign: "right",
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  processRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 22,
  },
  processNameCell: {
    flex: 1,
    minWidth: 0,
  },
  processName: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    opacity: 0.85,
  },
  processNameRoot: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: "500",
  },
  processCpu: {
    width: 72,
    textAlign: "right",
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontVariant: ["tabular-nums"],
  },
  processMemory: {
    width: 72,
    textAlign: "right",
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    fontVariant: ["tabular-nums"],
  },
  showAll: {
    alignItems: "center",
    paddingTop: theme.spacing[1],
  },
  showAllText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  showAllTextHovered: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
  contextList: {
    gap: theme.spacing[1],
  },
  contextRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    minHeight: 22,
  },
  contextTitle: {
    flex: 1,
    minWidth: 0,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
  meterTrack: {
    width: 64,
    height: 4,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.surface3,
    overflow: "hidden",
  },
  meterFill: {
    height: "100%",
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.foregroundMuted,
  },
  meterFillWarning: {
    backgroundColor: theme.colors.palette.amber[500],
  },
  meterFillDanger: {
    backgroundColor: theme.colors.palette.red[500],
  },
  contextValue: {
    width: 40,
    textAlign: "right",
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    fontVariant: ["tabular-nums"],
  },
  limitsList: {
    gap: theme.spacing[3],
  },
  limitsProvider: {
    gap: theme.spacing[1],
  },
  limitsHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  limitsName: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: "500",
    flexShrink: 1,
  },
  limitsPlan: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
}));
