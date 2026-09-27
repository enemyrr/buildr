import { describe, expect, it } from "vitest";
import type { ToolCallDetail } from "@getpaseo/protocol/agent-types";
import type { AgentTimelineItem } from "./agent-sdk-types.js";
import { compactToolCallItem } from "./tool-call-detail-compaction.js";

const LARGE = "line\n".repeat(1000);

function toolCall(detail: ToolCallDetail, metadata?: Record<string, unknown>): AgentTimelineItem {
  return {
    type: "tool_call",
    callId: "call-1",
    name: detail.type,
    status: "completed",
    error: null,
    detail,
    ...(metadata ? { metadata } : {}),
  };
}

describe("compactToolCallItem", () => {
  it("omits a large read body and keeps the file path", () => {
    const compacted = compactToolCallItem(
      toolCall({ type: "read", filePath: "/a.ts", content: LARGE }),
    );

    expect(compacted).toMatchObject({
      detail: { type: "read", filePath: "/a.ts" },
      detailOmitted: true,
    });
    expect(compacted.type === "tool_call" && "content" in compacted.detail).toBe(false);
  });

  it("sends line stats for an omitted write", () => {
    const compacted = compactToolCallItem(
      toolCall({ type: "write", filePath: "/a.ts", content: LARGE }),
    );

    expect(compacted).toMatchObject({
      detail: { type: "write", filePath: "/a.ts" },
      detailOmitted: true,
      lineStats: { additions: 1000, deletions: 0 },
    });
  });

  it("keeps small details inline", () => {
    const item = toolCall({ type: "edit", filePath: "/a.ts", oldString: "a", newString: "b" });

    expect(compactToolCallItem(item)).toBe(item);
  });

  it("keeps a user shell command's output", () => {
    const item = toolCall({ type: "shell", command: "ls", output: LARGE }, { userShell: true });

    expect(compactToolCallItem(item)).toBe(item);
  });

  it("keeps an unknown call's input and drops its output", () => {
    const compacted = compactToolCallItem(
      toolCall({ type: "unknown", input: { query: "x" }, output: { rows: LARGE } }),
    );

    expect(compacted).toMatchObject({
      detail: { type: "unknown", input: { query: "x" }, output: null },
      detailOmitted: true,
    });
  });
});
