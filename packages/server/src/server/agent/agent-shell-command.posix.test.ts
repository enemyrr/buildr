import { realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, test } from "vitest";

import { createTerminalManager, type TerminalManager } from "../../terminal/terminal-manager.js";
import type { AgentTimelineItem } from "./agent-sdk-types.js";
import {
  agentShellTerminalScope,
  mergeOutputTail,
  runAgentShellCommand,
  stopAgentShellCommand,
} from "./agent-shell-command.js";

let manager: TerminalManager | null = null;

afterEach(() => {
  manager?.killAll();
  manager = null;
});

async function run(input: {
  command: string;
  onLive?: (item: AgentTimelineItem, terminalManager: TerminalManager) => void;
}) {
  const terminalManager = createTerminalManager();
  manager = terminalManager;
  const live: AgentTimelineItem[] = [];
  const appended: AgentTimelineItem[] = [];
  await runAgentShellCommand({
    agentId: "agent-1",
    command: input.command,
    cwd: realpathSync(tmpdir()),
    terminalManager,
    captureIntervalMs: 50,
    emitLiveTimelineItem: async (item) => {
      live.push(item);
      input.onLive?.(item, terminalManager);
    },
    appendTimelineItem: async (item) => {
      appended.push(item);
    },
  });
  return { live, appended, terminalManager };
}

function shellOutput(item: AgentTimelineItem | undefined): string {
  return item?.type === "tool_call" && item.detail.type === "shell"
    ? (item.detail.output ?? "")
    : "";
}

describe.skipIf(process.platform === "win32")("runAgentShellCommand", () => {
  test("runs in a hidden terminal and records the full output", async () => {
    const { live, appended, terminalManager } = await run({ command: "seq 1 40" });

    expect(live[0]).toMatchObject({
      type: "tool_call",
      status: "running",
      metadata: { userShell: true, terminalId: expect.any(String) },
    });
    expect(appended[0]).toMatchObject({
      status: "completed",
      detail: { type: "shell", command: "seq 1 40", exitCode: 0 },
      metadata: { userShell: true },
    });
    expect(shellOutput(appended[0]).split("\n")).toEqual(
      Array.from({ length: 40 }, (_, index) => String(index + 1)),
    );
    expect(
      await terminalManager.getTerminals(realpathSync(tmpdir()), {
        workspaceId: agentShellTerminalScope("agent-1"),
      }),
    ).toHaveLength(0);
  });

  test("records a non-zero exit as failed", async () => {
    const { appended } = await run({ command: "echo nope; exit 3" });

    expect(appended[0]).toMatchObject({
      status: "failed",
      detail: { type: "shell", exitCode: 3 },
      error: { message: "Exited with code 3" },
    });
    expect(shellOutput(appended[0])).toBe("nope");
  });

  test("passes terminal input to the command", async () => {
    let sent = false;
    const { appended } = await run({
      command: 'read -r name; echo "hi $name"',
      onLive: (item, terminalManager) => {
        const terminalId = item.type === "tool_call" ? item.metadata?.terminalId : undefined;
        if (typeof terminalId === "string" && !sent) {
          sent = true;
          // After the runner's start signal, like a person typing at the prompt.
          setTimeout(
            () => terminalManager.getTerminal(terminalId)?.send({ type: "input", data: "kai\r" }),
            100,
          );
        }
      },
    });

    expect(shellOutput(appended[0])).toContain("hi kai");
  });

  test("stops a running command on request", async () => {
    const { appended } = await run({
      command: "sleep 30",
      onLive: (item) => {
        if (item.type === "tool_call") stopAgentShellCommand(item.callId);
      },
    });

    expect(appended[0]).toMatchObject({ status: "canceled", error: null });
    expect(stopAgentShellCommand("no-such-call")).toBe(false);
  });
});

describe("mergeOutputTail", () => {
  test("appends only the lines the capture missed", () => {
    expect(mergeOutputTail(["a", "b", "c"], ["b", "c", "d"])).toEqual(["a", "b", "c", "d"]);
    expect(mergeOutputTail([], ["x"])).toEqual(["x"]);
    expect(mergeOutputTail(["a"], ["a"])).toEqual(["a"]);
  });
});
