import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createTestLogger } from "../../test-utils/test-logger.js";
import type { AgentManagerEvent, AgentSubscriber, ManagedAgent } from "../agent/agent-manager.js";
import type { StoredAgentRecord } from "../agent/agent-storage.js";
import type { PersistedProjectRecord, PersistedWorkspaceRecord } from "../workspace-registry.js";
import { ActivityStatsService, toLocalDayKey } from "./activity-stats.js";

interface FakeAgent {
  id: string;
  provider: string;
  internal?: boolean;
  model: string;
}

function createFakeAgentManager(agents: FakeAgent[]) {
  const subscribers = new Set<AgentSubscriber>();
  return {
    subscribe(callback: AgentSubscriber) {
      subscribers.add(callback);
      return () => subscribers.delete(callback);
    },
    getAgent(id: string): ManagedAgent | null {
      const agent = agents.find((candidate) => candidate.id === id);
      if (!agent) return null;
      return {
        provider: agent.provider,
        internal: agent.internal,
        config: { provider: agent.provider, cwd: "/tmp" },
        runtimeInfo: { provider: agent.provider, model: agent.model },
      } as unknown as ManagedAgent;
    },
    emit(event: AgentManagerEvent) {
      for (const subscriber of subscribers) subscriber(event);
    },
  };
}

function prompt(agentId: string): AgentManagerEvent {
  return {
    type: "agent_stream",
    agentId,
    event: { type: "timeline", provider: "claude", item: { type: "user_message", text: "hi" } },
  };
}

function turn(agentId: string, inputTokens: number, outputTokens: number): AgentManagerEvent {
  return {
    type: "agent_stream",
    agentId,
    event: { type: "turn_completed", provider: "claude", usage: { inputTokens, outputTokens } },
  };
}

function agentRecord(input: {
  id: string;
  createdAt: string;
  workspaceId?: string;
  internal?: boolean;
}): StoredAgentRecord {
  return {
    provider: "claude",
    cwd: "/tmp",
    updatedAt: input.createdAt,
    labels: {},
    lastStatus: "closed",
    ...input,
  } as StoredAgentRecord;
}

describe("ActivityStatsService", () => {
  let tempDir: string;
  let now: Date;
  let agents: StoredAgentRecord[];
  let workspaces: PersistedWorkspaceRecord[];
  let projects: PersistedProjectRecord[];

  function createService() {
    return new ActivityStatsService({
      filePath: join(tempDir, "stats", "activity.json"),
      logger: createTestLogger(),
      now: () => now,
      sources: {
        listAgents: async () => agents,
        listWorkspaces: async () => workspaces,
        listProjects: async () => projects,
      },
    });
  }

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "activity-stats-test-"));
    now = new Date(2026, 8, 28, 22, 15);
    agents = [];
    workspaces = [];
    projects = [];
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  test("counts prompts, turns, and tokens for user agents and keeps them across restarts", async () => {
    const manager = createFakeAgentManager([
      { id: "a1", provider: "claude", model: "opus" },
      { id: "internal", provider: "claude", model: "haiku", internal: true },
    ]);
    const service = createService();
    await service.start(manager);

    manager.emit(prompt("a1"));
    manager.emit(prompt("a1"));
    manager.emit(turn("a1", 100, 20));
    manager.emit(prompt("internal"));
    manager.emit(turn("internal", 5, 5));
    await service.stop();

    const restarted = createService();
    await restarted.start(createFakeAgentManager([]));
    const stats = await restarted.snapshot();

    const today = stats.days.find((day) => day.date === toLocalDayKey(now));
    expect(today).toMatchObject({ prompts: 2, turns: 1, tokens: 120 });
    expect(stats.promptsByHour[22]).toBe(2);
    expect(stats.models).toEqual([
      { provider: "claude", model: "opus", agents: 0, prompts: 2, turns: 1 },
    ]);
  });

  test("accrues time in the app only between close, visible, recently active heartbeats", async () => {
    const service = createService();
    await service.start(createFakeAgentManager([]));
    const tick = (ms: number) => {
      now = new Date(now.getTime() + ms);
    };

    service.recordPresence({ appVisible: true, lastActivityAt: now });
    tick(15_000);
    service.recordPresence({ appVisible: true, lastActivityAt: now });
    // Hidden: nothing accrues and the next visible heartbeat starts a new span.
    tick(15_000);
    service.recordPresence({ appVisible: false, lastActivityAt: now });
    tick(15_000);
    service.recordPresence({ appVisible: true, lastActivityAt: now });
    // A long gap (sleep, disconnect) is not counted.
    tick(10 * 60_000);
    service.recordPresence({ appVisible: true, lastActivityAt: now });
    // Visible but idle for over five minutes is not counted.
    tick(15_000);
    service.recordPresence({
      appVisible: true,
      lastActivityAt: new Date(now.getTime() - 6 * 60_000),
    });

    const stats = await service.snapshot();
    expect(stats.days.find((day) => day.date === toLocalDayKey(now))?.activeMs).toBe(15_000);
  });

  test("derives history from agent records that predate tracking", async () => {
    agents = [
      agentRecord({ id: "old", createdAt: "2026-03-02T09:00:00.000Z", workspaceId: "w1" }),
      agentRecord({ id: "new", createdAt: "2026-09-27T09:00:00.000Z", workspaceId: "w1" }),
      agentRecord({ id: "hidden", createdAt: "2025-01-01T09:00:00.000Z", internal: true }),
    ];
    workspaces = [{ workspaceId: "w1", projectId: "p1" } as PersistedWorkspaceRecord];
    projects = [
      { projectId: "p1", displayName: "buildr", customName: null } as PersistedProjectRecord,
    ];
    const service = createService();
    await service.start(createFakeAgentManager([]));

    const stats = await service.snapshot();

    expect(stats.firstActivityAt).toBe("2026-03-02T09:00:00.000Z");
    expect(stats.trackingSince).toBe(now.toISOString());
    expect(stats.days.map((day) => day.agentsCreated)).toEqual([1, 1]);
    expect(stats.projects).toEqual([{ projectId: "p1", name: "buildr", agents: 2 }]);
  });
});
