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

/** True if the workspace entered an attention bucket after it was snoozed. */
export function hasRaisedHandWhileSnoozed(state: WorkspaceSnoozeState): boolean {
  if (!state.snooze || !state.statusEnteredAt || !RAISED_HAND_STATUSES.has(state.status)) {
    return false;
  }
  return state.statusEnteredAt.getTime() > Date.parse(state.snooze.snoozedAt);
}

/** True while the wake time is in the future and the workspace has not raised its hand. */
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

/**
 * True if the workspace carries a snooze that no longer hides it. The daemon keeps the record
 * until a client clears it; without the clear, an agent that raised its hand would hide the
 * workspace again once you read it.
 */
export function hasExpiredSnooze(state: WorkspaceSnoozeState, nowMs: number): boolean {
  return state.snooze !== null && !isWorkspaceSnoozed(state, nowMs);
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

export type CustomSnoozeParseResult =
  | { kind: "valid"; until: Date }
  | { kind: "invalid"; reason: "format" | "past" };

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^(\d{1,2}):(\d{2})$/;

/** Parses a local `YYYY-MM-DD` date and `HH:MM` time into a future wake time. */
export function parseCustomSnooze(input: {
  date: string;
  time: string;
  now: Date;
}): CustomSnoozeParseResult {
  const dateMatch = DATE_PATTERN.exec(input.date.trim());
  const timeMatch = TIME_PATTERN.exec(input.time.trim());
  if (!dateMatch || !timeMatch) {
    return { kind: "invalid", reason: "format" };
  }
  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]) - 1;
  const day = Number(dateMatch[3]);
  const hours = Number(timeMatch[1]);
  const minutes = Number(timeMatch[2]);
  const until = new Date(year, month, day, hours, minutes, 0, 0);
  const roundTrips =
    until.getFullYear() === year &&
    until.getMonth() === month &&
    until.getDate() === day &&
    until.getHours() === hours &&
    until.getMinutes() === minutes;
  if (!roundTrips) {
    return { kind: "invalid", reason: "format" };
  }
  if (until.getTime() <= input.now.getTime()) {
    return { kind: "invalid", reason: "past" };
  }
  return { kind: "valid", until };
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** Formats a date as the local `YYYY-MM-DD` and `HH:MM` strings the custom form edits. */
export function formatCustomSnoozeFields(date: Date): { date: string; time: string } {
  return {
    date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  };
}
