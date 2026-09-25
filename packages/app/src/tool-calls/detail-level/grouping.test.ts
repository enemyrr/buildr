import { describe, expect, it } from "vitest";
import type { ToolCallDetail } from "@getpaseo/protocol/agent-types";
import type { StreamItem, ToolCallItem } from "@/types/stream";
import { groupLiveToolCalls, prepareGroupedHistory } from "./grouping";
import { buildOverviewGroup } from "./overview/model";

type AssistantMessageItem = Extract<StreamItem, { kind: "assistant_message" }>;
type ThoughtItem = Extract<StreamItem, { kind: "thought" }>;

const TIMESTAMP = new Date("2026-01-01T00:00:00.000Z");

function call(
  id: string,
  detail: ToolCallDetail = { type: "shell", command: id },
  options: {
    name?: string;
    status?: "running" | "completed" | "failed";
    turnId?: string;
    metadata?: Record<string, unknown>;
  } = {},
): ToolCallItem {
  return {
    kind: "tool_call",
    id,
    turnId: options.turnId,
    timestamp: TIMESTAMP,
    payload: {
      source: "agent",
      data: {
        provider: "claude",
        callId: id,
        name: options.name ?? detail.type,
        status: options.status ?? "completed",
        error: options.status === "failed" ? "boom" : null,
        detail,
        metadata: options.metadata,
      },
    },
  };
}

function text(id: string, options: { blockGroupId?: string; turnId?: string } = {}) {
  return {
    kind: "assistant_message",
    id,
    text: id,
    timestamp: TIMESTAMP,
    ...options,
  } satisfies AssistantMessageItem;
}

function thought(id: string): ThoughtItem {
  return { kind: "thought", id, text: id, timestamp: TIMESTAMP, status: "ready" };
}

function user(id: string): StreamItem {
  return { kind: "user_message", id, text: id, timestamp: TIMESTAMP };
}

function group(tail: StreamItem[]) {
  return prepareGroupedHistory({ tail, buildGroup: buildOverviewGroup });
}

describe("turn activity grouping", () => {
  it("folds tools, thoughts, and intermediate text into one row and keeps the answer outside", () => {
    const members = [text("plan"), call("1"), thought("t"), text("between"), call("2")];
    const answer = [text("a:0", { blockGroupId: "a" }), text("a:1", { blockGroupId: "a" })];
    const tail = [user("u"), ...members, ...answer];

    const result = group(tail);

    expect(result.tail).toEqual([tail[0], expect.objectContaining({ id: "1" }), ...answer]);
    expect(result.groupsByHostId.get("1")).toMatchObject({
      run: { id: "1", items: members, isSealed: true },
      toolCallCount: 2,
      messageCount: 2,
    });
  });

  it("keeps a user's `!` command out of the previous turn", () => {
    const shell = call("shell", undefined, { metadata: { userShell: true } });
    const tail = [user("u"), call("1"), text("answer"), shell];

    const result = group(tail);

    expect(result.tail).toEqual([tail[0], tail[1], tail[2], shell]);
    expect(result.groupsByHostId.get("1")).toMatchObject({ run: { items: [tail[1]] } });
  });

  it("leaves turns without tool calls ungrouped", () => {
    const tail = [user("u"), thought("t"), text("answer")];

    const result = group(tail);

    expect(result.tail).toBe(tail);
    expect(result.groupsByHostId.size).toBe(0);
  });

  it("starts a new group at a turn boundary", () => {
    const tail = [
      call("1", undefined, { turnId: "a" }),
      text("first", { turnId: "a" }),
      call("2", undefined, { turnId: "b" }),
      text("second", { turnId: "b" }),
    ];

    const result = group(tail);

    expect(result.tail.map((item) => item.id)).toEqual(["1", "first", "2", "second"]);
    expect([...result.groupsByHostId.keys()]).toEqual(["1", "2"]);
  });

  it("merges consecutive calls to the same tool into one entry", () => {
    const tail = [
      call("1"),
      call("2"),
      call("3", { type: "read", filePath: "/a.ts" }),
      call("4", { type: "shell", command: "x" }, { status: "failed" }),
    ];

    const built = group(tail).groupsByHostId.get("1");

    expect(built?.entries.map((entry) => [entry.kind, entry.id])).toEqual([
      ["tools", "1"],
      ["tools", "3"],
      ["tools", "4"],
    ]);
    expect(built?.entries[0]).toMatchObject({ calls: [tail[0], tail[1]] });
    expect(built).toMatchObject({ errorCount: 1, iconNames: ["square_terminal", "eye"] });
  });

  it("pulls live-head thoughts into the open run and keeps streaming text after it", () => {
    const tail = [user("u"), call("1")];
    const history = group(tail);
    const liveThought = thought("live");
    const streaming = text("streaming");

    const result = groupLiveToolCalls({
      history,
      head: [liveThought, streaming],
      isTurnActive: true,
      buildGroup: buildOverviewGroup,
    });

    expect(result.head).toEqual([streaming]);
    expect(result.groupsByHostId.get("1")?.run).toMatchObject({
      items: [tail[1], liveThought],
      isSealed: false,
    });
    expect(result.historyGroupUpdatesByHostId.has("1")).toBe(true);
  });

  it("seals the open run once the turn is over", () => {
    const history = group([user("u"), call("1"), text("answer")]);

    const result = groupLiveToolCalls({
      history,
      head: [],
      isTurnActive: false,
      buildGroup: buildOverviewGroup,
    });

    expect(result.groupsByHostId).toBe(history.groupsByHostId);
    expect(result.groupsByHostId.get("1")?.run.isSealed).toBe(true);
    expect(result.historyGroupUpdatesByHostId.size).toBe(0);
  });
});
