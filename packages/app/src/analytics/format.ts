import { parseDayKey } from "./analytics-model";

// A known Monday, used to name weekdays and hours in the active locale.
const REFERENCE_MONDAY = new Date(2024, 0, 1);

export function formatCount(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    notation: value >= 10_000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatDays(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, { style: "unit", unit: "day", unitDisplay: "long" }).format(
    value,
  );
}

export function formatDuration(ms: number, locale: string): string {
  const totalMinutes = Math.floor(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const unit = (value: number, name: "hour" | "minute") =>
    new Intl.NumberFormat(locale, { style: "unit", unit: name, unitDisplay: "narrow" }).format(
      value,
    );
  return hours > 0 ? `${unit(hours, "hour")} ${unit(minutes, "minute")}` : unit(minutes, "minute");
}

export function formatDayKey(key: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(parseDayKey(key));
}

export function formatDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(iso));
}

export function formatDaysAgo(iso: string, now: Date, locale: string): string {
  const days = Math.round((now.getTime() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000));
  return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(-days, "day");
}

/** `index` 0 is Monday. */
export function formatWeekday(
  index: number,
  locale: string,
  width: "long" | "short" = "long",
): string {
  const date = new Date(REFERENCE_MONDAY);
  date.setDate(date.getDate() + index);
  return new Intl.DateTimeFormat(locale, { weekday: width }).format(date);
}

export function formatHour(hour: number, locale: string): string {
  const date = new Date(REFERENCE_MONDAY);
  date.setHours(hour);
  return new Intl.DateTimeFormat(locale, { hour: "numeric" }).format(date);
}

export function formatMonth(key: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { month: "short" }).format(parseDayKey(key));
}
