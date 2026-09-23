import { describe, expect, it } from "vitest";
import type { ToolCallDetail } from "@getpaseo/protocol/agent-types";
import type { StreamItem, ToolCallItem } from "@/types/stream";
import {
  collectResponseToolCalls,
  collectTurnFileChanges,
  computeLineDiffStat,
} from "./turn-file-changes";

const TIMESTAMP = new Date("2026-01-01T00:00:00.000Z");

function call(
  id: string,
  detail: ToolCallDetail,
  status: "completed" | "failed" = "completed",
): ToolCallItem {
  return {
    kind: "tool_call",
    id,
    timestamp: TIMESTAMP,
    payload: {
      source: "agent",
      data: { provider: "claude", callId: id, name: detail.type, status, error: null, detail },
    },
  };
}

const forward = {
  getNeighborIndex: (index: number, relation: "above" | "below") =>
    relation === "above" ? index - 1 : index + 1,
};

describe("computeLineDiffStat", () => {
  it("counts a unified diff without its file headers", () => {
    const unifiedDiff = "--- a/x\n+++ b/x\n@@ -1,2 +1,2 @@\n-old\n+new\n+more\n same";

    expect(computeLineDiffStat({ type: "edit", filePath: "x", unifiedDiff })).toEqual({
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

    expect(computeLineDiffStat(detail)).toEqual({ additions: 2, deletions: 1 });
  });

  it("counts every written line as an addition", () => {
    expect(computeLineDiffStat({ type: "write", filePath: "x", content: "1\n2\n3\n" })).toEqual({
      additions: 3,
      deletions: 0,
    });
  });
});

describe("collectTurnFileChanges", () => {
  it("sums changes per file and skips failed calls and reads", () => {
    const changes = collectTurnFileChanges([
      call("1", { type: "write", filePath: "/repo/src/a.ts", content: "x\ny" }),
      call("2", { type: "read", filePath: "/repo/src/b.ts" }),
      call("3", { type: "edit", filePath: "/repo/src/a.ts", oldString: "x", newString: "z" }),
      call("4", { type: "edit", filePath: "/repo/c.ts", oldString: "", newString: "q" }, "failed"),
    ]);

    expect(changes).toEqual([
      { filePath: "/repo/src/a.ts", fileName: "a.ts", additions: 3, deletions: 1 },
    ]);
  });
});

describe("collectResponseToolCalls", () => {
  it("expands group hosts and stops at the response boundary", () => {
    const earlier = call("0", { type: "write", filePath: "/old.ts" });
    const user: StreamItem = { kind: "user_message", id: "u", text: "u", timestamp: TIMESTAMP };
    const host = call("1", { type: "shell", command: "x" });
    const member = call("2", { type: "write", filePath: "/new.ts" });
    const answer: StreamItem = {
      kind: "assistant_message",
      id: "a",
      text: "done",
      timestamp: TIMESTAMP,
    };
    const items = [earlier, user, host, answer];

    const calls = collectResponseToolCalls({
      strategy: forward,
      items,
      startIndex: 3,
      expand: (item) => (item.id === "1" ? [host, member] : [item]),
    });

    expect(calls).toEqual([host, member]);
  });
});
