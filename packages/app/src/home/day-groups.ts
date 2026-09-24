/** Workspaces older than this many days share one "Older" group. */
const MAX_DAYS_AGO_GROUP = 6;

export type HomeDayGroupKey = "today" | "yesterday" | `days-${number}` | "older";

export interface HomeDayGroup<T> {
  key: HomeDayGroupKey;
  /** Whole calendar days before today; null for "Older". */
  daysAgo: number | null;
  items: T[];
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** Calendar days between the two local dates, so 23:59 yesterday is 1 day ago at 00:01. */
function calendarDaysBetween(date: Date, now: Date): number {
  return Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);
}

function groupKeyFor(daysAgo: number | null): HomeDayGroupKey {
  if (daysAgo === null) return "older";
  if (daysAgo <= 0) return "today";
  if (daysAgo === 1) return "yesterday";
  return `days-${daysAgo}`;
}

/**
 * Buckets items newest first into Today, Yesterday, one group per day up to a week, and Older.
 * Items without a date land in Older.
 */
export function groupByDay<T>(
  items: readonly T[],
  getDate: (item: T) => Date | null,
  now: Date,
): HomeDayGroup<T>[] {
  const dated = items
    .map((item) => ({ item, date: getDate(item) }))
    .sort((left, right) => (right.date?.getTime() ?? 0) - (left.date?.getTime() ?? 0));
  const groups: HomeDayGroup<T>[] = [];
  for (const { item, date } of dated) {
    const days = date ? Math.max(0, calendarDaysBetween(date, now)) : null;
    const daysAgo = days !== null && days <= MAX_DAYS_AGO_GROUP ? days : null;
    const key = groupKeyFor(daysAgo);
    const last = groups[groups.length - 1];
    if (last?.key === key) {
      last.items.push(item);
    } else {
      groups.push({ key, daysAgo, items: [item] });
    }
  }
  return groups;
}
