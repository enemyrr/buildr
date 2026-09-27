import { afterEach, beforeEach, expect, test } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { createTestLogger } from "../../test-utils/test-logger.js";
import { AgentStorage, type StoredAgentRecord } from "./agent-storage.js";
import { markInterruptedTurns, resolveContinuationPrompt } from "./interrupted-turns.js";
import type { AgentTimelineItem } from "./agent-sdk-types.js";

const logger = createTestLogger();
const NOW = new Date("2026-09-27T12:00:00.000Z");

let workdir: string;
let storage: AgentStorage;

beforeEach(() => {
  workdir = mkdtempSync(join(tmpdir(), "interrupted-turns-"));
  storage = new AgentStorage(join(workdir, "agents"), logger);
});

afterEach(async () => {
  await storage.flush();
  rmSync(workdir, { recursive: true, force: true });
});

function buildRecord(id: string, overrides: Partial<StoredAgentRecord>): StoredAgentRecord {
  return {
    id,
    provider: "codex",
    cwd: workdir,
    createdAt: "2026-09-27T10:00:00.000Z",
    updatedAt: "2026-09-27T11:00:00.000Z",
    labels: {},
    lastStatus: "idle",
    ...overrides,
  };
}

test("marks a turn left running by a crash as interrupted and flags error attention", async () => {
  await storage.upsert(
    buildRecord("crashed", {
      lastStatus: "running",
      unfinishedTurn: {
        state: "running",
        runId: "run-1",
        startedAt: "2026-09-27T11:30:00.000Z",
        prompt: "Refactor the parser",
      },
    }),
  );

  await expect(
    markInterruptedTurns({ agentStorage: storage, now: NOW, flagAttention: true }),
  ).resolves.toEqual(["crashed"]);

  expect(await storage.get("crashed")).toMatchObject({
    lastStatus: "closed",
    requiresAttention: true,
    attentionReason: "error",
    attentionTimestamp: NOW.toISOString(),
    unfinishedTurn: {
      state: "interrupted",
      startedAt: "2026-09-27T11:30:00.000Z",
      interruptedAt: NOW.toISOString(),
      prompt: "Refactor the parser",
    },
  });
});

test("marks a legacy record with a stale running status as interrupted without a prompt", async () => {
  await storage.upsert(buildRecord("legacy", { lastStatus: "running" }));

  await markInterruptedTurns({ agentStorage: storage, now: NOW, flagAttention: false });

  const record = await storage.get("legacy");
  expect(record?.unfinishedTurn).toEqual({
    state: "interrupted",
    startedAt: "2026-09-27T11:00:00.000Z",
    interruptedAt: NOW.toISOString(),
    prompt: null,
  });
  expect(record?.requiresAttention).toBeUndefined();
});

test("leaves finished, archived, and already interrupted agents unchanged", async () => {
  const interrupted = buildRecord("interrupted", {
    lastStatus: "closed",
    unfinishedTurn: {
      state: "interrupted",
      startedAt: "2026-09-27T09:00:00.000Z",
      interruptedAt: "2026-09-27T09:05:00.000Z",
      prompt: null,
    },
  });
  const archived = buildRecord("archived", {
    lastStatus: "running",
    archivedAt: "2026-09-27T11:10:00.000Z",
  });
  const idle = buildRecord("idle", { lastStatus: "closed" });
  await storage.upsert(interrupted);
  await storage.upsert(archived);
  await storage.upsert(idle);

  await expect(
    markInterruptedTurns({ agentStorage: storage, now: NOW, flagAttention: true }),
  ).resolves.toEqual([]);

  expect(await storage.get("interrupted")).toEqual(interrupted);
  expect(await storage.get("archived")).toEqual(archived);
  expect(await storage.get("idle")).toEqual(idle);
});

const EARLIER_TURN: AgentTimelineItem[] = [
  { type: "user_message", text: "Add a test" },
  { type: "assistant_message", text: "Added." },
];

test("resubmits the prompt when provider history ends before it", () => {
  expect(resolveContinuationPrompt("Refactor the parser", EARLIER_TURN)).toBe(
    "Refactor the parser",
  );
  expect(resolveContinuationPrompt("Refactor the parser", [])).toBe("Refactor the parser");
});

test("sends a generic continue when provider history already holds the prompt", () => {
  const recorded: AgentTimelineItem[] = [
    ...EARLIER_TURN,
    { type: "user_message", text: "Refactor the parser\n" },
    { type: "assistant_message", text: "Starting with" },
    { type: "notification", level: "warning", message: "A daemon restart interrupted this turn." },
  ];

  expect(resolveContinuationPrompt("Refactor the parser", recorded)).toBe(
    "Continue where you left off.",
  );
  expect(
    resolveContinuationPrompt(
      [
        { type: "text", text: "Refactor the parser" },
        { type: "image", data: "aGk=", mimeType: "image/png" },
      ],
      recorded,
    ),
  ).toBe("Continue where you left off.");
});

test("sends a generic continue when the prompt wasn't stored", () => {
  expect(resolveContinuationPrompt(null, EARLIER_TURN)).toBe("Continue where you left off.");
});
