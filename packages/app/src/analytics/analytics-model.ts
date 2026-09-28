import type {
  ActivityStats,
  ActivityStatsDay,
  ActivityStatsModel,
} from "@getpaseo/protocol/messages";

export const HEATMAP_WEEKS = 53;
const DAY_MS = 24 * 60 * 60 * 1000;

export type HeatmapLevel = 0 | 1 | 2 | 3 | 4;
export type HeatmapMetric = "prompts" | "agents";

export interface HeatmapCell {
  date: string;
  value: number;
  metric: HeatmapMetric;
  level: HeatmapLevel;
  isFuture: boolean;
}

export type Chronotype = "earlyBird" | "daytime" | "evening" | "nightOwl";

export interface AnalyticsSummary {
  /** Columns are weeks, oldest first; each column runs Monday to Sunday. */
  weeks: HeatmapCell[][];
  activeDays: number;
  activeDaysInRange: number;
  currentStreak: number;
  longestStreak: number;
  firstActivityAt: string | null;
  totals: { prompts: number; agents: number; turns: number; tokens: number; activeMs: number };
  activeMsToday: number;
  activeMsThisWeek: number;
  busiestDay: { date: string; value: number; metric: HeatmapMetric } | null;
  /** 0 is Monday. */
  busiestWeekday: number | null;
  peakHour: number | null;
  chronotype: Chronotype | null;
  favoriteModel: ActivityStatsModel | null;
  topProjects: ActivityStats["projects"];
}

export function toDayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function parseDayKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function mondayIndex(date: Date): number {
  return (date.getDay() + 6) % 7;
}

/**
 * Prompts are only counted since tracking started, so earlier days fall back to agents created.
 * The first tracked day takes whichever is larger because it holds both.
 */
function dayActivity(
  day: ActivityStatsDay,
  trackingDay: string,
): { value: number; metric: HeatmapMetric } {
  if (day.date > trackingDay) return { value: day.prompts, metric: "prompts" };
  if (day.date < trackingDay) return { value: day.agentsCreated, metric: "agents" };
  return day.prompts >= day.agentsCreated
    ? { value: day.prompts, metric: "prompts" }
    : { value: day.agentsCreated, metric: "agents" };
}

function isActive(day: ActivityStatsDay, trackingDay: string): boolean {
  return dayActivity(day, trackingDay).value > 0 || day.activeMs > 0;
}

function levelThresholds(values: number[]): number[] {
  const sorted = values.filter((value) => value > 0).sort((left, right) => left - right);
  if (sorted.length === 0) return [];
  const at = (fraction: number) => sorted[Math.floor((sorted.length - 1) * fraction)];
  return [at(0.25), at(0.5), at(0.75)];
}

function toLevel(value: number, thresholds: number[]): HeatmapLevel {
  if (value <= 0) return 0;
  if (value <= thresholds[0]) return 1;
  if (value <= thresholds[1]) return 2;
  if (value <= thresholds[2]) return 3;
  return 4;
}

function toChronotype(hour: number): Chronotype {
  if (hour >= 5 && hour < 10) return "earlyBird";
  if (hour >= 10 && hour < 17) return "daytime";
  if (hour >= 17 && hour < 22) return "evening";
  return "nightOwl";
}

function streaks(activeKeys: Set<string>, today: Date): { current: number; longest: number } {
  const sorted = [...activeKeys].sort();
  let longest = 0;
  let run = 0;
  let previous: Date | null = null;
  for (const key of sorted) {
    const date = parseDayKey(key);
    run =
      previous && Math.round((date.getTime() - previous.getTime()) / DAY_MS) === 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = date;
  }
  // A streak survives until the end of today, so it may end yesterday.
  let cursor = activeKeys.has(toDayKey(today)) ? today : addDays(today, -1);
  let current = 0;
  while (activeKeys.has(toDayKey(cursor))) {
    current += 1;
    cursor = addDays(cursor, -1);
  }
  return { current, longest };
}

export function summarizeActivity(stats: ActivityStats, now: Date): AnalyticsSummary {
  const trackingDay = toDayKey(new Date(stats.trackingSince));
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayKey = toDayKey(today);
  const byDate = new Map(stats.days.map((day) => [day.date, day]));

  const activeKeys = new Set(
    stats.days.filter((day) => isActive(day, trackingDay)).map((day) => day.date),
  );

  const start = addDays(today, -(mondayIndex(today) + (HEATMAP_WEEKS - 1) * 7));
  const cells: HeatmapCell[] = [];
  for (let offset = 0; offset < HEATMAP_WEEKS * 7; offset += 1) {
    const date = toDayKey(addDays(start, offset));
    const day = byDate.get(date);
    const activity: { value: number; metric: HeatmapMetric } = day
      ? dayActivity(day, trackingDay)
      : { value: 0, metric: date < trackingDay ? "agents" : "prompts" };
    cells.push({ date, ...activity, level: 0, isFuture: date > todayKey });
  }
  const thresholds = levelThresholds(cells.map((cell) => cell.value));
  for (const cell of cells) cell.level = toLevel(cell.value, thresholds);
  const weeks = Array.from({ length: HEATMAP_WEEKS }, (_, week) =>
    cells.slice(week * 7, week * 7 + 7),
  );

  const totals = { prompts: 0, agents: 0, turns: 0, tokens: 0, activeMs: 0 };
  const weekdayTotals = Array.from({ length: 7 }, () => 0);
  let busiestDay: AnalyticsSummary["busiestDay"] = null;
  const weekStartKey = toDayKey(addDays(today, -mondayIndex(today)));
  let activeMsThisWeek = 0;
  for (const day of stats.days) {
    totals.prompts += day.prompts;
    totals.agents += day.agentsCreated;
    totals.turns += day.turns;
    totals.tokens += day.tokens;
    totals.activeMs += day.activeMs;
    if (day.date >= weekStartKey && day.date <= todayKey) activeMsThisWeek += day.activeMs;
    const activity = dayActivity(day, trackingDay);
    weekdayTotals[mondayIndex(parseDayKey(day.date))] += activity.value;
    if (activity.value > 0 && (!busiestDay || activity.value > busiestDay.value)) {
      busiestDay = { date: day.date, ...activity };
    }
  }

  const maxWeekday = Math.max(...weekdayTotals);
  const maxHour = Math.max(0, ...stats.promptsByHour);
  const peakHour = maxHour > 0 ? stats.promptsByHour.indexOf(maxHour) : null;
  const { current, longest } = streaks(activeKeys, today);
  const rangeStartKey = toDayKey(start);

  return {
    weeks,
    activeDays: activeKeys.size,
    activeDaysInRange: [...activeKeys].filter((key) => key >= rangeStartKey).length,
    currentStreak: current,
    longestStreak: longest,
    firstActivityAt: stats.firstActivityAt,
    totals,
    activeMsToday: byDate.get(todayKey)?.activeMs ?? 0,
    activeMsThisWeek,
    busiestDay,
    busiestWeekday: maxWeekday > 0 ? weekdayTotals.indexOf(maxWeekday) : null,
    peakHour,
    chronotype: peakHour === null ? null : toChronotype(peakHour),
    favoriteModel: stats.models[0] ?? null,
    topProjects: stats.projects.slice(0, 5),
  };
}
