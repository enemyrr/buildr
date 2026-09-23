import { describe, expect, it } from "vitest";
import { deriveWorkspaceBoardStatus, groupWorkspacesByBoardStatus } from "./board-status";

describe("deriveWorkspaceBoardStatus", () => {
  it("maps PR state to a board column", () => {
    expect(deriveWorkspaceBoardStatus(null)).toBe("in_progress");
    expect(deriveWorkspaceBoardStatus({ state: "open" })).toBe("in_review");
    expect(deriveWorkspaceBoardStatus({ state: "merged" })).toBe("done");
    expect(deriveWorkspaceBoardStatus({ state: "closed" })).toBe("canceled");
  });
});

describe("groupWorkspacesByBoardStatus", () => {
  const workspaces = [
    { workspaceKey: "s:a", prHint: null },
    { workspaceKey: "s:b", prHint: { state: "open" as const } },
    { workspaceKey: "s:c", prHint: { state: "merged" as const } },
    { workspaceKey: "s:d", prHint: { state: "closed" as const } },
    { workspaceKey: "s:e", prHint: null },
  ];

  it("derives columns from PR state and keeps input order", () => {
    const columns = groupWorkspacesByBoardStatus(workspaces, {});
    expect(columns.backlog).toEqual([]);
    expect(columns.in_progress.map((w) => w.workspaceKey)).toEqual(["s:a", "s:e"]);
    expect(columns.in_review.map((w) => w.workspaceKey)).toEqual(["s:b"]);
    expect(columns.done.map((w) => w.workspaceKey)).toEqual(["s:c"]);
    expect(columns.canceled.map((w) => w.workspaceKey)).toEqual(["s:d"]);
  });

  it("lets a manual override win over the derived status", () => {
    const columns = groupWorkspacesByBoardStatus(workspaces, {
      "s:a": "backlog",
      "s:c": "in_review",
    });
    expect(columns.backlog.map((w) => w.workspaceKey)).toEqual(["s:a"]);
    expect(columns.in_review.map((w) => w.workspaceKey)).toEqual(["s:b", "s:c"]);
    expect(columns.done).toEqual([]);
  });
});
