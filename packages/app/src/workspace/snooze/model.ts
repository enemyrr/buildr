import type { WorkspaceSnooze } from "@getpaseo/protocol/messages";
import type { WorkspaceDescriptor } from "@/stores/session-store";

export type SnoozePresetId = "later-today" | "tomorrow" | "next-monday";

export interface SnoozePreset {
  id: SnoozePresetId;
  until: Date;
}

const HOUR_MS = 60 * 60 * 1000;
const LATER_TODAY_OFFSET_MS = 3 * HOUR_MS;
const MORNING_HOUR = 9;
const MONDAY = 1;

// Buckets that only a fresh event can produce, so entering one after the snooze started means
// the workspace needs you before its wake time.
const RAISED_HAND_STATUSES: ReadonlySet<WorkspaceDescriptor["status"]> = new Set([
  "needs_input",
  "attention",
  "failed",
]);

function atLocalHour(base: Date, dayOffset: number, hour: number): Date {
  const date = new Date(base);
  date.setDate(date.getDate() + dayOffset);
  date.setHours(hour, 0, 0, 0);
  return date;
}

function isSameLocalDay(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

/**
 * Returns the snooze presets for `now`, in local time. "Later today" is three hours out, rounded
 * up to the hour, and is left out when that crosses midnight because "Tomorrow" covers it.
 */
export function resolveSnoozePresets(now: Date): SnoozePreset[] {
  const presets: SnoozePreset[] = [];
  const laterToday = new Date(
    Math.ceil((now.getTime() + LATER_TODAY_OFFSET_MS) / HOUR_MS) * HOUR_MS,
  );
  if (isSameLocalDay(laterToday, now)) {
    presets.push({ id: "later-today", until: laterToday });
  }
  presets.push({ id: "tomorrow", until: atLocalHour(now, 1, MORNING_HOUR) });
  const daysUntilMonday = (MONDAY - now.getDay() + 7) % 7 || 7;
  presets.push({ id: "next-monday", until: atLocalHour(now, daysUntilMonday, MORNING_HOUR) });
  return presets;
}

export interface WorkspaceSnoozeState {
  snooze: WorkspaceSnooze | null;
  status: WorkspaceDescriptor["status"];
  statusEnteredAt: Date | null;
}

/**
 * False while the workspace already needs you. Waking depends on a new attention event, and a
 * workspace that is already waiting on you has none coming, so a snooze would hide it for the
 * whole snooze. Mark it as read first.
 */
export function canSnoozeWorkspace(status: WorkspaceDescriptor["status"]): boolean {
  return !RAISED_HAND_STATUSES.has(status);
}

/** True if the workspace entered an attention bucket after it was snoozed. */
export function hasRaisedHandWhileSnoozed(state: WorkspaceSnoozeState): boolean {
  if (!state.snooze || !state.statusEnteredAt || !RAISED_HAND_STATUSES.has(state.status)) {
    return false;
  }
  return state.statusEnteredAt.getTime() > Date.parse(state.snooze.snoozedAt);
}

/**
 * True while the wake time is in the future and the workspace has not raised its hand. The
 * daemon clears the snooze in both cases; this hides the workspace correctly until that
 * update arrives.
 */
export function isWorkspaceSnoozed(state: WorkspaceSnoozeState, nowMs: number): boolean {
  if (!state.snooze) {
    return false;
  }
  const untilMs = Date.parse(state.snooze.until);
  if (Number.isNaN(untilMs) || untilMs <= nowMs) {
    return false;
  }
  return !hasRaisedHandWhileSnoozed(state);
}

/** Returns the earliest future wake time, or null when nothing is waiting to wake. */
export function nextSnoozeWakeAtMs(
  snoozes: readonly WorkspaceSnooze[],
  nowMs: number,
): number | null {
  let next: number | null = null;
  for (const snooze of snoozes) {
    const untilMs = Date.parse(snooze.until);
    if (Number.isNaN(untilMs) || untilMs <= nowMs) {
      continue;
    }
    if (next === null || untilMs < next) {
      next = untilMs;
    }
  }
  return next;
}

const DAY_OPTION_COUNT = 14;
const TIME_STEP_MINUTES = 30;

export interface SnoozeDayOption {
  /** Local `YYYY-MM-DD`. */
  key: string;
  /** Days after today: 0 is today, 1 is tomorrow. */
  offset: number;
  date: Date;
}

export interface SnoozeTimeOption {
  /** Local `HH:MM`. */
  key: string;
  hours: number;
  minutes: number;
}

export interface CustomSnoozeSelection {
  dayKey: string;
  timeKey: string;
}

export interface ResolvedCustomSnooze extends CustomSnoozeSelection {
  days: SnoozeDayOption[];
  times: SnoozeTimeOption[];
  until: Date;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function withTime(day: Date, time: SnoozeTimeOption): Date {
  const date = new Date(day);
  date.setHours(time.hours, time.minutes, 0, 0);
  return date;
}

/** Returns the half-hour slots on `day` that are still in the future at `now`. */
export function resolveSnoozeTimeOptions(day: Date, now: Date): SnoozeTimeOption[] {
  const options: SnoozeTimeOption[] = [];
  for (let minuteOfDay = 0; minuteOfDay < 24 * 60; minuteOfDay += TIME_STEP_MINUTES) {
    const option = {
      key: `${pad(Math.floor(minuteOfDay / 60))}:${pad(minuteOfDay % 60)}`,
      hours: Math.floor(minuteOfDay / 60),
      minutes: minuteOfDay % 60,
    };
    if (withTime(day, option).getTime() > now.getTime()) {
      options.push(option);
    }
  }
  return options;
}

/** Returns the next two weeks of days, leaving out today once none of its slots remain. */
export function resolveSnoozeDayOptions(now: Date): SnoozeDayOption[] {
  const days: SnoozeDayOption[] = [];
  for (let offset = 0; offset < DAY_OPTION_COUNT; offset += 1) {
    const date = new Date(now);
    date.setDate(date.getDate() + offset);
    date.setHours(0, 0, 0, 0);
    if (offset === 0 && resolveSnoozeTimeOptions(date, now).length === 0) {
      continue;
    }
    days.push({ key: dayKey(date), offset, date });
  }
  return days;
}

/** The custom picker's starting point: tomorrow at 9:00. */
export function defaultCustomSnoozeSelection(now: Date): CustomSnoozeSelection {
  const tomorrow = atLocalHour(now, 1, MORNING_HOUR);
  return { dayKey: dayKey(tomorrow), timeKey: `${pad(MORNING_HOUR)}:00` };
}

/**
 * Resolves a picker selection against `now`. A day that is no longer offered falls back to
 * tomorrow; a time that passed while the picker was open falls back to the next free slot.
 */
export function resolveCustomSnooze(
  selection: CustomSnoozeSelection,
  now: Date,
): ResolvedCustomSnooze {
  const days = resolveSnoozeDayOptions(now);
  const fallback = defaultCustomSnoozeSelection(now);
  const day =
    days.find((option) => option.key === selection.dayKey) ??
    days.find((option) => option.key === fallback.dayKey) ??
    days[0];
  // Tomorrow is always offered with every slot, so neither fallback is ever reached.
  if (!day) {
    throw new Error("No snooze day is available");
  }
  const times = resolveSnoozeTimeOptions(day.date, now);
  const time = times.find((option) => option.key === selection.timeKey) ?? times[0];
  if (!time) {
    throw new Error("No snooze time is available");
  }
  return { dayKey: day.key, timeKey: time.key, days, times, until: withTime(day.date, time) };
}
