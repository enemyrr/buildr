import { describe, expect, it } from "vitest";
import {
  hasExpiredSnooze,
  isWorkspaceSnoozed,
  nextSnoozeWakeAtMs,
  parseCustomSnooze,
  resolveSnoozePresets,
  type WorkspaceSnoozeState,
} from "./model";

// 2026-09-23 is a Wednesday. All dates are local so the tests hold in any time zone.
const WEDNESDAY_10_15 = new Date(2026, 8, 23, 10, 15);

function snoozed(overrides: Partial<WorkspaceSnoozeState> = {}): WorkspaceSnoozeState {
  return {
    snooze: {
      snoozedAt: new Date(2026, 8, 23, 10, 0).toISOString(),
      until: new Date(2026, 8, 24, 9, 0).toISOString(),
    },
    status: "done",
    statusEnteredAt: new Date(2026, 8, 23, 9, 0),
    ...overrides,
  };
}

describe("resolveSnoozePresets", () => {
  it("offers later today, tomorrow at 9:00, and next Monday at 9:00", () => {
    const presets = resolveSnoozePresets(WEDNESDAY_10_15);
    expect(presets.map((preset) => preset.id)).toEqual(["later-today", "tomorrow", "next-monday"]);
    expect(presets[0]?.until).toEqual(new Date(2026, 8, 23, 14, 0));
    expect(presets[1]?.until).toEqual(new Date(2026, 8, 24, 9, 0));
    expect(presets[2]?.until).toEqual(new Date(2026, 8, 28, 9, 0));
  });

  it("drops later today when it would cross midnight", () => {
    const presets = resolveSnoozePresets(new Date(2026, 8, 23, 22, 30));
    expect(presets.map((preset) => preset.id)).toEqual(["tomorrow", "next-monday"]);
  });

  it("moves next Monday a full week out when today is Monday", () => {
    const presets = resolveSnoozePresets(new Date(2026, 8, 28, 8, 0));
    expect(presets.find((preset) => preset.id === "next-monday")?.until).toEqual(
      new Date(2026, 9, 5, 9, 0),
    );
  });
});

describe("isWorkspaceSnoozed", () => {
  const now = WEDNESDAY_10_15.getTime();

  it("hides the workspace until its wake time", () => {
    expect(isWorkspaceSnoozed(snoozed(), now)).toBe(true);
    expect(isWorkspaceSnoozed(snoozed(), new Date(2026, 8, 24, 9, 0).getTime())).toBe(false);
  });

  it("wakes early when the workspace enters an attention bucket after the snooze", () => {
    const state = snoozed({ status: "needs_input", statusEnteredAt: new Date(2026, 8, 23, 10, 5) });
    expect(isWorkspaceSnoozed(state, now)).toBe(false);
    expect(hasExpiredSnooze(state, now)).toBe(true);
  });

  it("stays snoozed when the attention predates the snooze", () => {
    const state = snoozed({ status: "attention", statusEnteredAt: new Date(2026, 8, 23, 9, 30) });
    expect(isWorkspaceSnoozed(state, now)).toBe(true);
  });

  it("stays snoozed while the agent keeps running", () => {
    const state = snoozed({ status: "running", statusEnteredAt: new Date(2026, 8, 23, 10, 5) });
    expect(isWorkspaceSnoozed(state, now)).toBe(true);
  });

  it("reports no expired snooze for a workspace that was never snoozed", () => {
    expect(hasExpiredSnooze(snoozed({ snooze: null }), now)).toBe(false);
  });
});

describe("nextSnoozeWakeAtMs", () => {
  it("returns the earliest future wake time", () => {
    const now = WEDNESDAY_10_15.getTime();
    const past = { snoozedAt: "", until: new Date(2026, 8, 23, 9, 0).toISOString() };
    const soon = { snoozedAt: "", until: new Date(2026, 8, 23, 14, 0).toISOString() };
    const later = { snoozedAt: "", until: new Date(2026, 8, 24, 9, 0).toISOString() };
    expect(nextSnoozeWakeAtMs([later, past, soon], now)).toBe(Date.parse(soon.until));
    expect(nextSnoozeWakeAtMs([past], now)).toBeNull();
  });
});

describe("parseCustomSnooze", () => {
  it("parses a future local date and time", () => {
    expect(parseCustomSnooze({ date: "2026-09-25", time: "8:30", now: WEDNESDAY_10_15 })).toEqual({
      kind: "valid",
      until: new Date(2026, 8, 25, 8, 30),
    });
  });

  it("rejects malformed and impossible values", () => {
    expect(parseCustomSnooze({ date: "25/09/2026", time: "08:30", now: WEDNESDAY_10_15 })).toEqual({
      kind: "invalid",
      reason: "format",
    });
    expect(parseCustomSnooze({ date: "2026-02-30", time: "08:30", now: WEDNESDAY_10_15 })).toEqual({
      kind: "invalid",
      reason: "format",
    });
  });

  it("rejects times in the past", () => {
    expect(parseCustomSnooze({ date: "2026-09-23", time: "10:00", now: WEDNESDAY_10_15 })).toEqual({
      kind: "invalid",
      reason: "past",
    });
  });
});
