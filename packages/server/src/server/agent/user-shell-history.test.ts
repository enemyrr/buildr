import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import type { AgentStreamEvent, AgentTimelineItem } from "./agent-sdk-types.js";
import {
  mergeUserShellHistory,
  UserShellHistoryStore,
  type UserShellHistoryEntry,
} from "./user-shell-history.js";

type TimelineEvent = Extract<AgentStreamEvent, { type: "timeline" }>;

function message(text: string, timestamp?: string): TimelineEvent {
  return {
    type: "timeline",
    provider: "claude",
    item: { type: "assistant_message", text },
    ...(timestamp ? { timestamp } : {}),
  };
}

function shell(command: string, timestamp: string): UserShellHistoryEntry {
  const item: AgentTimelineItem = {
    type: "tool_call",
    name: "shell",
    callId: command,
    status: "completed",
    error: null,
    detail: { type: "shell", command, output: "", exitCode: 0 },
    metadata: { userShell: true },
  };
  return { timestamp, item };
}

function label(event: TimelineEvent): string {
  if (event.item.type === "tool_call" && event.item.detail.type === "shell") {
    return `!${event.item.detail.command}`;
  }
  return event.item.type === "assistant_message" ? event.item.text : event.item.type;
}

function labels(events: TimelineEvent[]): string[] {
  return events.map(label);
}

describe("mergeUserShellHistory", () => {
  test("places commands between history events by timestamp", () => {
    const history = [
      message("a", "2026-09-26T10:00:00.000Z"),
      message("b", "2026-09-26T10:05:00.000Z"),
    ];
    const merged = mergeUserShellHistory(
      history,
      [shell("late", "2026-09-26T10:09:00.000Z"), shell("mid", "2026-09-26T10:02:00.000Z")],
      "claude",
    );
    expect(labels(merged)).toEqual(["a", "!mid", "b", "!late"]);
  });

  test("appends commands after history without timestamps", () => {
    const merged = mergeUserShellHistory(
      [message("a"), message("b")],
      [shell("ls", "2026-09-26T10:00:00.000Z")],
      "claude",
    );
    expect(labels(merged)).toEqual(["a", "b", "!ls"]);
  });
});

describe("UserShellHistoryStore", () => {
  let root: string | null = null;

  afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true });
    root = null;
  });

  async function createStore(): Promise<UserShellHistoryStore> {
    root = await mkdtemp(path.join(tmpdir(), "user-shell-history-"));
    return new UserShellHistoryStore(root);
  }

  test("keeps concurrent appends and prunes entries after a cutoff", async () => {
    const store = await createStore();
    await Promise.all([
      store.append("agent", shell("one", "2026-09-26T10:00:00.000Z")),
      store.append("agent", shell("two", "2026-09-26T10:10:00.000Z")),
    ]);
    expect((await store.list("agent")).map((entry) => entry.timestamp)).toEqual([
      "2026-09-26T10:00:00.000Z",
      "2026-09-26T10:10:00.000Z",
    ]);

    await store.pruneAfter("agent", "2026-09-26T10:05:00.000Z");
    expect((await store.list("agent")).map((entry) => entry.timestamp)).toEqual([
      "2026-09-26T10:00:00.000Z",
    ]);

    await store.delete("agent");
    expect(await store.list("agent")).toEqual([]);
  });
});
