import { describe, expect, it } from "vitest";
import type { ActivityStats, ActivityStatsDay } from "@getpaseo/protocol/messages";
import { HEATMAP_WEEKS, summarizeActivity } from "./analytics-model";

function day(date: string, values: Partial<Omit<ActivityStatsDay, "date">>): ActivityStatsDay {
  return { date, prompts: 0, agentsCreated: 0, turns: 0, tokens: 0, activeMs: 0, ...values };
}

function stats(overrides: Partial<ActivityStats>): ActivityStats {
  return {
    generatedAt: "2026-09-28T10:00:00.000Z",
    timeZone: "Europe/Stockholm",
    firstActivityAt: null,
    trackingSince: new Date(2026, 8, 25, 12).toISOString(),
    days: [],
    promptsByHour: Array.from({ length: 24 }, () => 0),
    models: [],
    projects: [],
    ...overrides,
  };
}

// Monday 2026-09-28.
const NOW = new Date(2026, 8, 28, 15, 30);

describe("summarizeActivity", () => {
  it("uses agents before tracking started and prompts after", () => {
    const summary = summarizeActivity(
      stats({
        days: [
          day("2026-09-20", { agentsCreated: 3, prompts: 0 }),
          day("2026-09-25", { agentsCreated: 4, prompts: 2 }),
          day("2026-09-26", { agentsCreated: 9, prompts: 1 }),
        ],
      }),
      NOW,
    );
    const cells = new Map(summary.weeks.flat().map((cell) => [cell.date, cell]));

    expect(cells.get("2026-09-20")).toMatchObject({ value: 3, metric: "agents" });
    expect(cells.get("2026-09-25")).toMatchObject({ value: 4, metric: "agents" });
    expect(cells.get("2026-09-26")).toMatchObject({ value: 1, metric: "prompts" });
  });

  it("lays out Monday-first weeks ending with the current week", () => {
    const summary = summarizeActivity(stats({}), NOW);
    const lastWeek = summary.weeks[HEATMAP_WEEKS - 1];

    expect(summary.weeks).toHaveLength(HEATMAP_WEEKS);
    expect(lastWeek[0]).toMatchObject({ date: "2026-09-28", isFuture: false });
    expect(lastWeek[6]).toMatchObject({ date: "2026-10-04", isFuture: true });
  });

  it("counts a streak that ended yesterday and the longest run", () => {
    const summary = summarizeActivity(
      stats({
        days: [
          day("2026-09-10", { agentsCreated: 1 }),
          day("2026-09-11", { agentsCreated: 1 }),
          day("2026-09-12", { agentsCreated: 1 }),
          day("2026-09-26", { prompts: 1 }),
          day("2026-09-27", { activeMs: 60_000 }),
        ],
      }),
      NOW,
    );

    expect(summary.currentStreak).toBe(2);
    expect(summary.longestStreak).toBe(3);
    expect(summary.activeDays).toBe(5);
  });

  it("derives the busiest weekday, peak hour, and chronotype", () => {
    const promptsByHour = Array.from({ length: 24 }, () => 0);
    promptsByHour[23] = 12;
    promptsByHour[9] = 4;
    const summary = summarizeActivity(
      stats({
        days: [day("2026-09-26", { prompts: 2 }), day("2026-09-27", { prompts: 14 })],
        promptsByHour,
      }),
      NOW,
    );

    expect(summary.busiestWeekday).toBe(6);
    expect(summary.busiestDay).toEqual({ date: "2026-09-27", value: 14, metric: "prompts" });
    expect(summary.peakHour).toBe(23);
    expect(summary.chronotype).toBe("nightOwl");
  });
});
