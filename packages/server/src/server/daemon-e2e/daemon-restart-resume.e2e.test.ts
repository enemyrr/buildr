import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { createDaemonTestContext, type DaemonTestContext } from "../test-utils/index.js";
import type { AgentSnapshotPayload, PersistenceHandle } from "@getpaseo/protocol/messages";
import type { DaemonClient } from "../test-utils/daemon-client.js";
import { INTERRUPTED_TURN_NOTICE } from "../agent/agent-manager.js";

const HELD_PROMPT = "Please hold the turn open";

const RECORDED_PROMPT = "Please hold the turn open and record this prompt";

function isRunning(snapshot: AgentSnapshotPayload): boolean {
  return snapshot.status === "running";
}

function hasNoInterruption(snapshot: AgentSnapshotPayload): boolean {
  return snapshot.interruptedTurn === undefined;
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

function indexOfNotice(items: Awaited<ReturnType<typeof readTimelineItems>>): number {
  return items.findIndex(
    (item) => item.type === "notification" && item.message === INTERRUPTED_TURN_NOTICE,
  );
}

function lastIndexOfHeldPrompt(items: Awaited<ReturnType<typeof readTimelineItems>>): number {
  return items.findLastIndex((item) => item.type === "user_message" && item.text === HELD_PROMPT);
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
        attentionReason: "error",
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
      expect(indexOfNotice(items)).toBeGreaterThan(-1);
      expect(lastIndexOfHeldPrompt(items)).toBeGreaterThan(indexOfNotice(items));
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
      expect(indexOfNotice(items)).toBeGreaterThan(-1);
      expect(lastIndexOfHeldPrompt(items)).toBeGreaterThan(indexOfNotice(items));
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
