import { memo, useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useIsFocused } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { ChevronDown } from "lucide-react-native";
import { MenuHeader } from "@/components/headers/menu-header";
import { SettingsSection } from "@/components/settings/headings/settings-section";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import {
  summarizeActivity,
  type AnalyticsSummary,
  type HeatmapCell,
  type HeatmapLevel,
} from "@/analytics/analytics-model";
import {
  formatCount,
  formatDate,
  formatDayKey,
  formatDays,
  formatDaysAgo,
  formatDuration,
  formatHour,
  formatMonth,
  formatWeekday,
} from "@/analytics/format";
import { useActivityStats } from "@/analytics/use-activity-stats";
import { useHosts } from "@/runtime/host-runtime";
import { ICON_SIZE, type Theme } from "@/styles/theme";
import type { ActivityStats } from "@getpaseo/protocol/messages";

const CELL_SIZE = 11;
const CELL_GAP = 3;
const COLUMN_WIDTH = CELL_SIZE + CELL_GAP;
const HOUR_BAR_HEIGHT = 48;
const LEVEL_OPACITY: Record<HeatmapLevel, number> = { 0: 1, 1: 0.3, 2: 0.5, 3: 0.75, 4: 1 };
const HEATMAP_LEVELS: readonly HeatmapLevel[] = [0, 1, 2, 3, 4];
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

const ThemedChevronDown = withUnistyles(ChevronDown);
const mutedMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

export function AnalyticsScreen() {
  const isFocused = useIsFocused();
  if (!isFocused) {
    return <View style={styles.container} />;
  }
  return <AnalyticsScreenContent />;
}

function AnalyticsScreenContent() {
  const { t } = useTranslation();
  const hosts = useHosts();
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null);
  const host = hosts.find((candidate) => candidate.serverId === selectedServerId) ?? hosts[0];
  const view = useActivityStats(host?.serverId ?? null);

  const hostPicker = useMemo(
    () =>
      hosts.length > 1 && host ? (
        <HostPicker
          hosts={hosts}
          selectedServerId={host.serverId}
          label={host.label}
          onSelect={setSelectedServerId}
        />
      ) : undefined,
    [host, hosts],
  );

  let body;
  if (view.kind === "ready") {
    body = <AnalyticsBody stats={view.stats} />;
  } else if (view.kind === "loading") {
    body = (
      <View style={styles.centered}>
        <LoadingSpinner size="large" color={styles.spinner.color} />
      </View>
    );
  } else {
    const message =
      view.kind === "error"
        ? t("analytics.loadFailed", { message: view.message })
        : t(
            view.kind === "upgrade-required"
              ? "analytics.upgradeRequired"
              : "analytics.hostUnavailable",
          );
    body = (
      <View style={styles.centered}>
        <Text style={styles.message}>{message}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container} testID="analytics-screen">
      <MenuHeader title={t("analytics.title")} rightContent={hostPicker} />
      {body}
    </View>
  );
}

function HostPicker({
  hosts,
  selectedServerId,
  label,
  onSelect,
}: {
  hosts: ReturnType<typeof useHosts>;
  selectedServerId: string;
  label: string;
  onSelect: (serverId: string) => void;
}) {
  const style = useCallback(
    ({ hovered, open }: { hovered: boolean; open: boolean }) => [
      styles.hostTrigger,
      (hovered || open) && styles.hostTriggerActive,
    ],
    [],
  );
  return (
    <DropdownMenu>
      <DropdownMenuTrigger style={style} accessibilityRole="button" testID="analytics-host">
        <Text style={styles.hostLabel} numberOfLines={1}>
          {label}
        </Text>
        <ThemedChevronDown size={ICON_SIZE.xs} uniProps={mutedMapping} />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="bottom" align="end" offset={4} width={220}>
        {hosts.map((host) => (
          <HostPickerItem
            key={host.serverId}
            serverId={host.serverId}
            label={host.label}
            isSelected={host.serverId === selectedServerId}
            onSelect={onSelect}
          />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function HostPickerItem({
  serverId,
  label,
  isSelected,
  onSelect,
}: {
  serverId: string;
  label: string;
  isSelected: boolean;
  onSelect: (serverId: string) => void;
}) {
  const handleSelect = useCallback(() => onSelect(serverId), [onSelect, serverId]);
  return (
    <DropdownMenuItem onSelect={handleSelect} selected={isSelected}>
      {label}
    </DropdownMenuItem>
  );
}

function AnalyticsBody({ stats }: { stats: ActivityStats }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const now = useMemo(() => new Date(stats.generatedAt), [stats.generatedAt]);
  const summary = useMemo(() => summarizeActivity(stats, now), [stats, now]);
  const trackingSince = formatDate(stats.trackingSince, locale);
  const activeDaysLabel = useMemo(
    () => (
      <Text style={styles.sectionMeta}>
        {t("analytics.activeDaysInRange", { value: summary.activeDaysInRange })}
      </Text>
    ),
    [summary.activeDaysInRange, t],
  );

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
      <View style={styles.page}>
        <SettingsSection
          title={t("analytics.activity")}
          info={t("analytics.activityInfo", { date: trackingSince })}
          trailing={activeDaysLabel}
        >
          <Heatmap weeks={summary.weeks} locale={locale} />
        </SettingsSection>

        <SettingsSection
          title={t("analytics.overview")}
          info={t("analytics.overviewInfo", { date: trackingSince })}
        >
          <OverviewTiles summary={summary} now={now} locale={locale} />
        </SettingsSection>

        <SettingsSection title={t("analytics.highlights")}>
          <Highlights summary={summary} locale={locale} />
        </SettingsSection>

        <SettingsSection title={t("analytics.hours")}>
          <HourBars
            promptsByHour={stats.promptsByHour}
            peakHour={summary.peakHour}
            locale={locale}
          />
        </SettingsSection>

        {summary.topProjects.length > 0 ? (
          <SettingsSection title={t("analytics.topProjects")}>
            <TopProjects projects={summary.topProjects} locale={locale} />
          </SettingsSection>
        ) : null}
      </View>
    </ScrollView>
  );
}

function Heatmap({ weeks, locale }: { weeks: HeatmapCell[][]; locale: string }) {
  const { t } = useTranslation();
  const [hovered, setHovered] = useState<HeatmapCell | null>(null);

  const monthLabels = useMemo(() => {
    const labels: { index: number; label: string }[] = [];
    let previousMonth = "";
    weeks.forEach((week, index) => {
      const month = week[0].date.slice(0, 7);
      if (month === previousMonth) return;
      labels.push({ index, label: formatMonth(week[0].date, locale) });
      previousMonth = month;
    });
    // A partial first month would crowd the label next to it.
    return labels.filter(
      (label, i) => i === labels.length - 1 || labels[i + 1].index - label.index >= 3,
    );
  }, [weeks, locale]);

  const detail = hovered
    ? t(hovered.metric === "prompts" ? "analytics.cellPrompts" : "analytics.cellAgents", {
        date: formatDayKey(hovered.date, locale),
        value: hovered.value,
      })
    : null;

  return (
    <View style={styles.heatmapWrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>
          <View style={styles.monthRow}>
            {monthLabels.map(({ index, label }) => (
              <Text
                key={index}
                style={[styles.axisLabel, styles.monthLabel, { left: index * COLUMN_WIDTH }]}
              >
                {label}
              </Text>
            ))}
          </View>
          <View style={styles.heatmapGrid}>
            <View style={styles.weekdayColumn}>
              {[0, 2, 4].map((weekday) => (
                <Text
                  key={weekday}
                  style={[styles.axisLabel, styles.weekdayLabel, { top: weekday * COLUMN_WIDTH }]}
                >
                  {formatWeekday(weekday, locale, "short")}
                </Text>
              ))}
            </View>
            {weeks.map((week) => (
              <View key={week[0].date} style={styles.weekColumn}>
                {week.map((cell) => (
                  <HeatmapSquare key={cell.date} cell={cell} onHover={setHovered} />
                ))}
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
      <View style={styles.heatmapFooter}>
        <Text style={styles.sectionMeta} numberOfLines={1}>
          {detail ?? " "}
        </Text>
        <View style={styles.legend}>
          <Text style={styles.axisLabel}>{t("analytics.less")}</Text>
          {HEATMAP_LEVELS.map((level) => (
            <View key={level} style={[styles.cell, levelStyle(level)]} />
          ))}
          <Text style={styles.axisLabel}>{t("analytics.more")}</Text>
        </View>
      </View>
    </View>
  );
}

function levelStyle(level: HeatmapLevel) {
  return level === 0 ? styles.cellEmpty : [styles.cellFilled, { opacity: LEVEL_OPACITY[level] }];
}

const HeatmapSquare = memo(function HeatmapSquare({
  cell,
  onHover,
}: {
  cell: HeatmapCell;
  onHover: (cell: HeatmapCell | null) => void;
}) {
  const handleHoverIn = useCallback(() => onHover(cell), [cell, onHover]);
  const handleHoverOut = useCallback(() => onHover(null), [onHover]);
  if (cell.isFuture) return <View style={styles.cell} />;
  return (
    <Pressable
      onHoverIn={handleHoverIn}
      onHoverOut={handleHoverOut}
      style={[styles.cell, levelStyle(cell.level)]}
      accessibilityLabel={`${cell.date}: ${cell.value}`}
    />
  );
});

function OverviewTiles({
  summary,
  now,
  locale,
}: {
  summary: AnalyticsSummary;
  now: Date;
  locale: string;
}) {
  const { t } = useTranslation();
  const firstUsed = summary.firstActivityAt;
  const tiles: { key: string; label: string; value: string; hint?: string }[] = [
    {
      key: "firstUsed",
      label: t("analytics.tiles.firstUsed"),
      value: firstUsed ? formatDate(firstUsed, locale) : "—",
      hint: firstUsed ? formatDaysAgo(firstUsed, now, locale) : undefined,
    },
    {
      key: "activeDays",
      label: t("analytics.tiles.activeDays"),
      value: formatCount(summary.activeDays, locale),
    },
    {
      key: "currentStreak",
      label: t("analytics.tiles.currentStreak"),
      value: formatDays(summary.currentStreak, locale),
    },
    {
      key: "longestStreak",
      label: t("analytics.tiles.longestStreak"),
      value: formatDays(summary.longestStreak, locale),
    },
    {
      key: "timeInApp",
      label: t("analytics.tiles.timeInApp"),
      value: formatDuration(summary.totals.activeMs, locale),
      hint: t("analytics.tiles.timeInAppHint", {
        today: formatDuration(summary.activeMsToday, locale),
        week: formatDuration(summary.activeMsThisWeek, locale),
      }),
    },
    {
      key: "prompts",
      label: t("analytics.tiles.prompts"),
      value: formatCount(summary.totals.prompts, locale),
    },
    {
      key: "agents",
      label: t("analytics.tiles.agents"),
      value: formatCount(summary.totals.agents, locale),
    },
    {
      key: "tokens",
      label: t("analytics.tiles.tokens"),
      value: formatCount(summary.totals.tokens, locale),
    },
  ];
  return (
    <View style={styles.tiles}>
      {tiles.map((tile) => (
        <View key={tile.key} style={styles.tile} testID={`analytics-tile-${tile.key}`}>
          <Text style={styles.tileLabel} numberOfLines={1}>
            {tile.label}
          </Text>
          <Text style={styles.tileValue} numberOfLines={1}>
            {tile.value}
          </Text>
          {tile.hint ? (
            <Text style={styles.tileHint} numberOfLines={1}>
              {tile.hint}
            </Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}

function Highlights({ summary, locale }: { summary: AnalyticsSummary; locale: string }) {
  const { t } = useTranslation();
  const model = summary.favoriteModel;
  const rows: { key: string; label: string; value: string }[] = [
    {
      key: "chronotype",
      label: t("analytics.chronotypeLabel"),
      value: summary.chronotype ? t(`analytics.chronotype.${summary.chronotype}`) : "—",
    },
    {
      key: "busiestWeekday",
      label: t("analytics.busiestWeekday"),
      value: summary.busiestWeekday === null ? "—" : formatWeekday(summary.busiestWeekday, locale),
    },
    {
      key: "busiestDay",
      label: t("analytics.busiestDay"),
      value: summary.busiestDay
        ? t(
            summary.busiestDay.metric === "prompts"
              ? "analytics.cellPrompts"
              : "analytics.cellAgents",
            {
              date: formatDayKey(summary.busiestDay.date, locale),
              value: summary.busiestDay.value,
            },
          )
        : "—",
    },
    {
      key: "favoriteModel",
      label: t("analytics.favoriteModel"),
      value: formatModel(model),
    },
  ];
  return (
    <View>
      {rows.map((row, index) => (
        <View key={row.key} style={[styles.row, index > 0 && styles.rowBorder]}>
          <Text style={styles.rowLabel}>{row.label}</Text>
          <Text style={styles.rowValue} numberOfLines={1}>
            {row.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

function formatModel(model: AnalyticsSummary["favoriteModel"]): string {
  if (!model) return "—";
  return model.model ? `${model.model} · ${model.provider}` : model.provider;
}

function HourBars({
  promptsByHour,
  peakHour,
  locale,
}: {
  promptsByHour: number[];
  peakHour: number | null;
  locale: string;
}) {
  const max = Math.max(1, ...promptsByHour);
  return (
    <View>
      <View style={styles.hourBars}>
        {HOURS.map((hour) => (
          <View key={hour} style={styles.hourSlot}>
            <View
              style={[
                styles.hourBar,
                hour === peakHour ? styles.hourBarPeak : null,
                { height: Math.max(2, ((promptsByHour[hour] ?? 0) / max) * HOUR_BAR_HEIGHT) },
              ]}
            />
          </View>
        ))}
      </View>
      <View style={styles.hourAxis}>
        {[0, 6, 12, 18].map((hour) => (
          <Text key={hour} style={styles.axisLabel}>
            {formatHour(hour, locale)}
          </Text>
        ))}
        <View />
      </View>
    </View>
  );
}

function TopProjects({
  projects,
  locale,
}: {
  projects: ActivityStats["projects"];
  locale: string;
}) {
  const max = Math.max(1, ...projects.map((project) => project.agents));
  return (
    <View>
      {projects.map((project, index) => (
        <View key={project.projectId} style={[styles.row, index > 0 && styles.rowBorder]}>
          <Text style={[styles.rowLabel, styles.projectName]} numberOfLines={1}>
            {project.name}
          </Text>
          <View style={styles.projectBarTrack}>
            <View style={[styles.projectBar, { width: `${(project.agents / max) * 100}%` }]} />
          </View>
          <Text style={styles.projectCount}>{formatCount(project.agents, locale)}</Text>
        </View>
      ))}
    </View>
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
    padding: theme.spacing[6],
  },
  spinner: {
    color: theme.colors.foregroundMuted,
  },
  message: {
    fontSize: theme.fontSize.base,
    color: theme.colors.foregroundMuted,
    textAlign: "center",
  },
  hostTrigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1.5],
    height: 28,
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.borderRadius.md,
  },
  hostTriggerActive: {
    backgroundColor: theme.colors.interactionHighlight,
  },
  hostLabel: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundMuted,
    maxWidth: 180,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: theme.spacing[6],
    paddingVertical: theme.spacing[8],
  },
  page: {
    width: "100%",
    maxWidth: 820,
    alignSelf: "center",
  },
  sectionMeta: {
    flexShrink: 1,
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundMuted,
  },
  heatmapWrap: {
    gap: theme.spacing[2],
  },
  monthRow: {
    height: 16,
    marginLeft: 32,
  },
  monthLabel: {
    position: "absolute",
    top: 0,
  },
  heatmapGrid: {
    flexDirection: "row",
  },
  weekdayColumn: {
    width: 32,
  },
  weekdayLabel: {
    position: "absolute",
    left: 0,
    lineHeight: CELL_SIZE,
  },
  weekColumn: {
    gap: CELL_GAP,
    marginRight: CELL_GAP,
  },
  axisLabel: {
    fontSize: 10,
    color: theme.colors.foregroundMuted,
  },
  cell: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    borderRadius: theme.borderRadius.sm,
  },
  cellEmpty: {
    backgroundColor: theme.colors.surface2,
  },
  cellFilled: {
    backgroundColor: theme.colors.accent,
  },
  heatmapFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[3],
  },
  legend: {
    flexDirection: "row",
    alignItems: "center",
    gap: CELL_GAP,
  },
  tiles: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[3],
  },
  tile: {
    flexGrow: 1,
    flexBasis: 180,
    gap: theme.spacing[1],
    padding: theme.spacing[4],
    borderRadius: theme.borderRadius.lg,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
  },
  tileLabel: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundMuted,
  },
  tileValue: {
    fontSize: theme.fontSize.xl,
    fontWeight: theme.fontWeight.normal,
    color: theme.colors.foreground,
    fontVariant: ["tabular-nums"],
  },
  tileHint: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundMuted,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[3],
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[1],
  },
  rowBorder: {
    borderTopWidth: theme.borderWidth[1],
    borderTopColor: theme.colors.border,
  },
  rowLabel: {
    fontSize: theme.fontSize.base,
    color: theme.colors.foreground,
  },
  rowValue: {
    flexShrink: 1,
    fontSize: theme.fontSize.base,
    color: theme.colors.foregroundMuted,
    textAlign: "right",
  },
  hourBars: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: theme.spacing[1],
    height: HOUR_BAR_HEIGHT,
  },
  hourSlot: {
    flex: 1,
    justifyContent: "flex-end",
  },
  hourBar: {
    borderRadius: theme.borderRadius.sm,
    backgroundColor: theme.colors.surface3,
  },
  hourBarPeak: {
    backgroundColor: theme.colors.accent,
  },
  hourAxis: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: theme.spacing[1],
  },
  projectName: {
    width: 180,
  },
  projectBarTrack: {
    flex: 1,
    height: 6,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.surface2,
    overflow: "hidden",
  },
  projectBar: {
    height: "100%",
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.accent,
  },
  projectCount: {
    minWidth: 32,
    fontSize: theme.fontSize.base,
    color: theme.colors.foregroundMuted,
    textAlign: "right",
    fontVariant: ["tabular-nums"],
  },
}));
