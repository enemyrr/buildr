import { describe, expect, it } from "vitest";
import type { GitAction, GitActionId, GitActions } from "@/git/policy";
import { derivePrStripState, type PrStripStatusInput } from "@/git/pr-status-strip-state";

function action(id: GitActionId, overrides: Partial<GitAction> = {}): GitAction {
  return {
    id,
    label: id,
    pendingLabel: id,
    successLabel: id,
    disabled: false,
    status: "idle",
    startsGroup: false,
    handler: () => {},
    ...overrides,
  };
}

function actions(primary: GitAction | null, secondary: GitAction[] = []): GitActions {
  return { primary, secondary, menu: [] };
}

const open: PrStripStatusInput = {
  state: "OPEN",
  isMerged: false,
  mergeable: "MERGEABLE",
  checksStatus: "success",
  autoMergeEnabled: false,
};

function summarize(status: PrStripStatusInput, gitActions: GitActions = actions(null)) {
  const state = derivePrStripState(status, gitActions);
  return { label: state.label, tone: state.tone, actions: state.actions.map((a) => a.label) };
}

describe("derivePrStripState", () => {
  it("offers Continue and Archive once merged", () => {
    const archive = action("archive-workspace");
    expect(summarize({ ...open, state: "MERGED", isMerged: true }, actions(archive))).toEqual({
      label: "Merged",
      tone: "merged",
      actions: ["Continue", "Archive"],
    });
  });

  it("offers Merge when a direct merge is available", () => {
    const merge = action("merge-pr-squash");
    expect(summarize(open, actions(merge))).toEqual({
      label: "Ready to merge",
      tone: "success",
      actions: ["Merge"],
    });
  });

  it("ignores a merge action the policy marks unavailable", () => {
    const merge = action("merge-pr-squash", { unavailableMessage: "No" });
    expect(summarize(open, actions(null, [merge])).label).toBe("Open");
  });

  it("puts conflicts ahead of failing checks", () => {
    expect(summarize({ ...open, mergeable: "CONFLICTING", checksStatus: "failure" })).toEqual({
      label: "Merge conflicts",
      tone: "danger",
      actions: ["Resolve"],
    });
  });

  it("offers Fix for failing checks", () => {
    expect(summarize({ ...open, checksStatus: "failure" }).actions).toEqual(["Fix"]);
  });

  it("shows running checks with auto-merge when allowed", () => {
    const autoMerge = action("enable-pr-auto-merge-squash");
    expect(summarize({ ...open, checksStatus: "pending" }, actions(autoMerge))).toEqual({
      label: "Checks running",
      tone: "warning",
      actions: ["Auto-merge"],
    });
  });

  it("marks drafts and closed PRs", () => {
    expect(summarize({ ...open, isDraft: true }).label).toBe("Draft");
    expect(summarize({ ...open, state: "CLOSED" }).label).toBe("Closed");
  });
});
