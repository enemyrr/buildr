import { describe, expect, it } from "vitest";
import type { ToolCallDetail } from "./agent-types.js";
import { computeToolCallLineStats } from "./tool-call-line-stats.js";

describe("computeToolCallLineStats", () => {
  it("counts a unified diff without its file headers", () => {
    const unifiedDiff = "--- a/x\n+++ b/x\n@@ -1,2 +1,2 @@\n-old\n+new\n+more\n same";

    expect(computeToolCallLineStats({ type: "edit", filePath: "x", unifiedDiff })).toEqual({
      additions: 2,
      deletions: 1,
    });
  });

  it("counts only the lines an edit changed", () => {
    const detail: ToolCallDetail = {
      type: "edit",
      filePath: "x",
      oldString: "a\nb\nc",
      newString: "a\nB\nc\nd",
    };

    expect(computeToolCallLineStats(detail)).toEqual({ additions: 2, deletions: 1 });
  });

  it("counts every written line as an addition", () => {
    expect(
      computeToolCallLineStats({ type: "write", filePath: "x", content: "1\n2\n3\n" }),
    ).toEqual({
      additions: 3,
      deletions: 0,
    });
  });
});
