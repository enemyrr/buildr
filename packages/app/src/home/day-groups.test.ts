import { describe, expect, it } from "vitest";
import { groupByDay, type HomeDayGroup } from "./day-groups";

function summarize(groups: HomeDayGroup<{ id: string }>[]) {
  return groups.map((group) => [group.key, group.items.map((item) => item.id)]);
}

const now = new Date(2026, 8, 24, 9, 0);

function at(month: number, day: number, hour = 12): Date {
  return new Date(2026, month, day, hour);
}

describe("groupByDay", () => {
  it("buckets newest first into today, yesterday, days ago, and older", () => {
    const items = [
      { id: "old", date: at(7, 1) },
      { id: "yesterday-late", date: at(8, 23, 23) },
      { id: "today", date: at(8, 24, 8) },
      { id: "two-days", date: at(8, 22) },
      { id: "undated", date: null },
      { id: "yesterday-early", date: at(8, 23, 1) },
    ];

    const groups = groupByDay(items, (item) => item.date, now);

    expect(summarize(groups)).toEqual([
      ["today", ["today"]],
      ["yesterday", ["yesterday-late", "yesterday-early"]],
      ["days-2", ["two-days"]],
      ["older", ["old", "undated"]],
    ]);
    expect(groups[2]?.daysAgo).toBe(2);
    expect(groups[3]?.daysAgo).toBeNull();
  });

  it("uses calendar days, not elapsed hours", () => {
    const groups = groupByDay([{ date: at(8, 23, 23) }], (item) => item.date, at(8, 24, 0));
    expect(groups[0]?.key).toBe("yesterday");
  });

  it("puts a week-old item in older", () => {
    const groups = groupByDay([{ date: at(8, 17) }], (item) => item.date, now);
    expect(groups[0]?.key).toBe("older");
  });
});
