import { AgentStorage } from "../agent/agent-storage.js";
import { createTestLogger } from "../../test-utils/test-logger.js";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { createDaemonTestContext, type DaemonTestContext } from "../test-utils/index.js";
import type { AgentSnapshotPayload, PersistenceHandle } from "@getpaseo/protocol/messages";

const HELD_PROMPT = "Please hold the turn open";

const RECORDED_PROMPT = "Please hold the turn open and record this prompt";

function isRunning(snapshot: AgentSnapshotPayload): boolean {
  return snapshot.status === "running";
}

function hasNoInterruption(snapshot: AgentSnapshotPayload): boolean {
  return snapshot.interruptedTurn === undefined;
}

function isNotification(item: { type: string }): boolean {
  return item.type === "notification";
}

function tmpCwd(): string {
  return mkdtempSync(path.join(tmpdir(), "daemon-restart-resume-"));
}

async function readTimelineItems(client: DaemonClient, agentId: string) {
  const timeline = await client.fetchAgentTimeline(agentId, { direction: "tail", limit: 200 });
  return timeline.entries.map((entry) => entry.item);
}

function userMessageText(item: Awaited<ReturnType<typeof readTimelineItems>>[number]): string[] {
  return item.type === "user_message" ? [item.text] : [];
}

describe("daemon restart resume", () => {
  let ctx: DaemonTestContext;

  beforeEach(async () => {
    ctx = await createDaemonTestContext();
  });

  afterEach(async () => {
    await ctx.cleanup();
  }, 60_000);

  test("Codex agent survives daemon restart with persistence handle", async () => {
    const cwd = tmpCwd();
    const marker = `DAEMON_RESTART_MARKER_${Date.now()}`;
    try {
      const agent = await ctx.client.createAgent({
        provider: "codex",
        cwd,
        title: "Daemon Restart Test Agent",
        modeId: "full-access",
      });

      await ctx.client.sendMessage(
        agent.id,
        `Remember this marker string for a test: "${marker}".`,
      );

      const afterRemember = await ctx.client.waitForFinish(agent.id, 5_000);
      expect(afterRemember.status).toBe("idle");
      expect(afterRemember.final?.persistence).toBeTruthy();
      expect(afterRemember.final!.persistence!.metadata).toMatchObject({ marker });

      const handle = afterRemember.final!.persistence as PersistenceHandle;

      await ctx.cleanup();
      ctx = await createDaemonTestContext();

      const resumed = await ctx.client.resumeAgent(handle);
      await ctx.client.sendMessage(
        resumed.id,
        "What was the marker string I asked you to remember earlier?",
      );

      const afterRecall = await ctx.client.waitForFinish(resumed.id, 5_000);
      expect(afterRecall.status).toBe("idle");
      expect(afterRecall.final?.persistence).toBeTruthy();
      expect(afterRecall.final!.persistence!.metadata).toMatchObject({ marker });

      await ctx.client.deleteAgent(resumed.id);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  describe("turn in flight during a restart", () => {
    let paseoHomeRoot: string;
    let cwd: string;

    beforeEach(async () => {
      await ctx.cleanup();
      paseoHomeRoot = mkdtempSync(path.join(tmpdir(), "daemon-restart-home-"));
      cwd = tmpCwd();
      ctx = await createDaemonTestContext({ paseoHomeRoot, cleanup: false });
    });

    afterEach(() => {
      rmSync(cwd, { recursive: true, force: true });
      rmSync(paseoHomeRoot, { recursive: true, force: true });
    });

    async function startHeldTurnAndRestart(
      options: { prompt?: string; daemon?: Parameters<typeof createDaemonTestContext>[0] } = {},
    ): Promise<string> {
      const agent = await ctx.client.createAgent({
        provider: "codex",
        cwd,
        title: "Interrupted Turn Agent",
        modeId: "full-access",
      });
      await ctx.client.sendMessage(agent.id, options.prompt ?? HELD_PROMPT);
      await ctx.client.waitForAgentUpsert(agent.id, isRunning);
      await ctx.cleanup();
      ctx = await createDaemonTestContext({ ...options.daemon, paseoHomeRoot, cleanup: false });
      return agent.id;
    }

    test("sends a generic continue when provider history already holds the prompt", async () => {
      const agentId = await startHeldTurnAndRestart({ prompt: RECORDED_PROMPT });

      await ctx.client.continueInterruptedTurn(agentId);

      const userMessages = (await readTimelineItems(ctx.client, agentId)).flatMap(userMessageText);
      expect(userMessages).toEqual([RECORDED_PROMPT, "Continue where you left off."]);
    }, 60_000);

    test("dismisses the interruption without loading the agent", async () => {
      const agentId = await startHeldTurnAndRestart();

      await ctx.client.dismissInterruptedTurn(agentId);

      const dismissed = await ctx.client.waitForAgentUpsert(agentId, hasNoInterruption, 10_000);
      expect(dismissed.status).toBe("closed");
      await expect(ctx.client.dismissInterruptedTurn(agentId)).rejects.toThrow(
        `Agent ${agentId} has no interrupted turn`,
      );
    }, 60_000);

    test("marks the turn interrupted and continues it on request", async () => {
      const agentId = await startHeldTurnAndRestart();

      const stored = await ctx.client.fetchAgent(agentId);
      expect(stored?.agent).toMatchObject({
        status: "closed",
        requiresAttention: true,
        attentionReason: "finished",
        interruptedTurn: {
          startedAt: expect.any(String),
          interruptedAt: expect.any(String),
        },
      });

      await ctx.client.continueInterruptedTurn(agentId);

      const continued = await ctx.client.fetchAgent(agentId);
      expect(continued?.agent.status).toBe("running");
      expect(continued?.agent.interruptedTurn).toBeUndefined();
      const items = await readTimelineItems(ctx.client, agentId);
      expect(items.flatMap(userMessageText).at(-1)).toBe(HELD_PROMPT);
      expect(items.some(isNotification)).toBe(false);
      await expect(ctx.client.continueInterruptedTurn(agentId)).rejects.toThrow(
        `Agent ${agentId} has no interrupted turn`,
      );
    }, 60_000);

    test("keeps the turn interrupted across another restart until it continues", async () => {
      const agentId = await startHeldTurnAndRestart();
      await ctx.cleanup();
      ctx = await createDaemonTestContext({ paseoHomeRoot, cleanup: false });

      const stored = await ctx.client.fetchAgent(agentId);
      expect(stored?.agent.interruptedTurn).toMatchObject({ interruptedAt: expect.any(String) });
    }, 60_000);

    test("continues the turn at startup when auto-continue is on", async () => {
      const agentId = await startHeldTurnAndRestart({
        daemon: { autoContinueInterruptedTurns: true },
      });

      const continued = await ctx.client.waitForAgentUpsert(agentId, isRunning, 20_000);
      expect(continued.interruptedTurn).toBeUndefined();
      expect(continued.requiresAttention).toBe(false);
      const items = await readTimelineItems(ctx.client, agentId);
      expect(items.flatMap(userMessageText).at(-1)).toBe(HELD_PROMPT);
      expect(items.some(isNotification)).toBe(false);
    }, 60_000);

    test("clears the marker when the turn finishes normally", async () => {
      const agent = await ctx.client.createAgent({
        provider: "codex",
        cwd,
        title: "Finished Turn Agent",
        modeId: "full-access",
      });
      await ctx.client.sendMessage(agent.id, "Say hello");
      await ctx.client.waitForFinish(agent.id, 10_000);
      await ctx.cleanup();
      ctx = await createDaemonTestContext({ paseoHomeRoot, cleanup: false });

      const stored = await ctx.client.fetchAgent(agent.id);
      expect(stored?.agent.status).toBe("closed");
      expect(stored?.agent.interruptedTurn).toBeUndefined();
      expect(stored?.agent.attentionReason).not.toBe("error");
    }, 60_000);
  });
});

// These run in separate OS processes so SIGKILL cannot invoke daemon shutdown hooks.
import { fork, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { DaemonClient } from "../test-utils/daemon-client.js";

async function restartFixture(root: string) {
  const child = fork(
    fileURLToPath(new URL("../test-utils/finish-subscription-daemon.ts", import.meta.url)),
    [root],
    {
      execArgv: ["--conditions=source", "--import", "tsx"],
      stdio: ["ignore", "pipe", "pipe", "ipc"],
    },
  );
  let output = "";
  child.stdout?.on("data", (data) => {
    output += data;
  });
  child.stderr?.on("data", (data) => {
    output += data;
  });
  const ready = await Promise.race([
    once(child, "message").then(
      ([message]) => message as { port: number; paseoHome: string; cwd: string },
    ),
    once(child, "exit").then(([code]) => {
      throw new Error(`Fixture exited ${code}: ${output}`);
    }),
  ]);
  return { child, ...ready };
}
async function stopFixture(child: ChildProcess, abrupt: boolean) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, "exit");
  if (abrupt) child.kill("SIGKILL");
  else child.send("stop");
  await exited;
}
async function readPrompts(root: string): Promise<string[]> {
  try {
    return (await readFile(path.join(root, "parent-prompts.jsonl"), "utf8"))
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as string);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

test.each([false, true])(
  "durable finish subscriptions recover a running child after restart (abrupt=%s)",
  async (abrupt) => {
    const root = await mkdtemp(path.join(tmpdir(), "durable-finish-process-"));
    const processes: ChildProcess[] = [];
    let client: DaemonClient | undefined;
    let mcp: Client | undefined;
    try {
      const first = await restartFixture(root);
      processes.push(first.child);
      client = new DaemonClient({ url: `ws://127.0.0.1:${first.port}/ws`, appVersion: "0.13.0" });
      await client.connect();
      await client.fetchAgents({ subscribe: {} });
      const parent = await client.createAgent({
        provider: "claude",
        cwd: first.cwd,
        title: "Durable parent",
        modeId: "full-access",
      });
      mcp = new Client({ name: "durable-parent", version: "1" });
      await mcp.connect(
        new StreamableHTTPClientTransport(
          new URL(`http://127.0.0.1:${first.port}/mcp/agents?callerAgentId=${parent.id}`),
        ),
      );
      const result = await mcp.callTool({
        name: "create_agent",
        arguments: {
          provider: "claude/claude-test",
          title: "Held child",
          initialPrompt: "HOLD_CHILD",
        },
      });
      expect(result.isError).not.toBe(true);
      const childId = (result.structuredContent as { agentId: string }).agentId;
      expect((await client.fetchAgent(childId))?.agent.status).toBe("running");
      // Kill only after the running snapshot commits, so this exercises bootstrap repair
      // rather than recovery of the earlier idle snapshot while its write is pending.
      await expect
        .poll(
          async () =>
            (
              await new AgentStorage(path.join(first.paseoHome, "agents"), createTestLogger()).get(
                childId,
              )
            )?.lastStatus,
        )
        .toBe("running");
      expect(
        JSON.parse(await readFile(path.join(first.paseoHome, "finish-subscriptions.json"), "utf8")),
      ).toHaveLength(1);
      await mcp.close();
      mcp = undefined;
      await client.close();
      client = undefined;
      await stopFixture(first.child, abrupt);
      const second = await restartFixture(root);
      processes.push(second.child);
      await expect.poll(() => readPrompts(root), { timeout: 15000 }).toHaveLength(1);
      const prompts = await readPrompts(root);
      expect(prompts[0]).toContain(`Agent ${childId}`);
      expect(prompts[0]).toContain("was closed");
      await expect
        .poll(
          async () =>
            JSON.parse(
              await readFile(path.join(second.paseoHome, "finish-subscriptions.json"), "utf8"),
            ),
          { timeout: 5000 },
        )
        .toEqual([]);
      client = new DaemonClient({ url: `ws://127.0.0.1:${second.port}/ws`, appVersion: "0.13.0" });
      await client.connect();
      await client.fetchAgents({ subscribe: {} });
      expect((await client.fetchAgent(childId))?.agent.status).toBe("closed");
      await client.close();
      client = undefined;
      await stopFixture(second.child, false);
      const third = await restartFixture(root);
      processes.push(third.child);
      expect(await readPrompts(root)).toHaveLength(1);
      expect(
        JSON.parse(await readFile(path.join(third.paseoHome, "finish-subscriptions.json"), "utf8")),
      ).toEqual([]);
    } catch (error) {
      console.error(
        await readFile(path.join(root, "fixture.log"), "utf8").catch(() => "No fixture log"),
      );
      throw error;
    } finally {
      await mcp?.close();
      await client?.close();
      for (const child of processes.toReversed()) await stopFixture(child, true);
      await rm(root, { recursive: true, force: true });
    }
  },
  60000,
);
