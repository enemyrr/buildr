import { describe, expect, it } from "vitest";
import {
  canStepNavigationHistory,
  EMPTY_NAVIGATION_HISTORY,
  isNavigationHistoryPathname,
  recordNavigationHistoryEntry,
  stepNavigationHistory,
  type NavigationHistoryEntry,
  type NavigationHistoryState,
} from "./navigation-history";

const workspaceA = "/h/srv/workspace/a";
const workspaceB = "/h/srv/workspace/b";

function record(entries: NavigationHistoryEntry[]): NavigationHistoryState {
  return entries.reduce(recordNavigationHistoryEntry, EMPTY_NAVIGATION_HISTORY);
}

function step(state: NavigationHistoryState, delta: 1 | -1) {
  const result = stepNavigationHistory(state, delta);
  if (!result) throw new Error("expected a history step");
  return result;
}

describe("navigation history", () => {
  it("pushes route and tab changes", () => {
    const state = record([
      { pathname: workspaceA, tabId: "t1" },
      { pathname: workspaceA, tabId: "t2" },
      { pathname: workspaceB, tabId: "t3" },
    ]);
    expect(state.entries.map((entry) => entry.tabId)).toEqual(["t1", "t2", "t3"]);
    expect(state.index).toBe(2);
    expect(canStepNavigationHistory(state, -1)).toBe(true);
    expect(canStepNavigationHistory(state, 1)).toBe(false);
  });

  it("fills a pending tab in place and ignores dropped focus", () => {
    const state = record([
      { pathname: workspaceA, tabId: null },
      { pathname: workspaceA, tabId: "t1" },
      { pathname: workspaceA, tabId: null },
    ]);
    expect(state.entries).toEqual([{ pathname: workspaceA, tabId: "t1" }]);
  });

  it("moves the cursor on arrival instead of pushing", () => {
    const initial = record([
      { pathname: workspaceA, tabId: "t1" },
      { pathname: "/settings", tabId: null },
      { pathname: workspaceB, tabId: "t2" },
    ]);
    const back = step(initial, -1);
    expect(back.entry.pathname).toBe("/settings");
    const arrived = recordNavigationHistoryEntry(back.state, back.entry);
    expect(arrived.entries).toHaveLength(3);
    expect(arrived.index).toBe(1);
    expect(arrived.pendingIndex).toBeNull();
    expect(canStepNavigationHistory(arrived, 1)).toBe(true);
  });

  it("drops forward entries on a new navigation", () => {
    const initial = record([
      { pathname: workspaceA, tabId: "t1" },
      { pathname: workspaceB, tabId: "t2" },
    ]);
    const back = step(initial, -1);
    const arrived = recordNavigationHistoryEntry(back.state, back.entry);
    const next = recordNavigationHistoryEntry(arrived, { pathname: "/sessions", tabId: null });
    expect(next.entries.map((entry) => entry.pathname)).toEqual([workspaceA, "/sessions"]);
    expect(canStepNavigationHistory(next, 1)).toBe(false);
  });

  it("records the tab actually focused when the remembered tab is gone", () => {
    const initial = record([
      { pathname: workspaceA, tabId: "closed" },
      { pathname: workspaceB, tabId: "t2" },
    ]);
    const back = step(initial, -1);
    const arrived = recordNavigationHistoryEntry(back.state, { pathname: workspaceA, tabId: "t3" });
    expect(arrived.entries[0]).toEqual({ pathname: workspaceA, tabId: "t3" });
    expect(arrived.index).toBe(0);
  });

  it("skips redirect-only routes", () => {
    expect(isNavigationHistoryPathname("/")).toBe(false);
    expect(isNavigationHistoryPathname("/h/srv")).toBe(false);
    expect(isNavigationHistoryPathname("/h/srv/agent/abc")).toBe(false);
    expect(isNavigationHistoryPathname(workspaceA)).toBe(true);
    expect(isNavigationHistoryPathname("/settings")).toBe(true);
  });
});
