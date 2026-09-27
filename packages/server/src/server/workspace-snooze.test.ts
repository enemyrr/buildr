import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createTestLogger } from "../test-utils/test-logger.js";
import {
  createPersistedWorkspaceRecord,
  FileBackedWorkspaceRegistry,
} from "./workspace-registry.js";
import { WorkspaceSnoozeTimer } from "./workspace-snooze.js";

const NOW = new Date("2026-03-01T12:00:00.000Z");
const SNOOZED_AT = "2026-03-01T11:00:00.000Z";

let workdir: string;
let registry: FileBackedWorkspaceRegistry;
let timer: WorkspaceSnoozeTimer;

async function snoozedWorkspace(workspaceId: string, until: string): Promise<void> {
  await registry.upsert(
    createPersistedWorkspaceRecord({
      workspaceId,
      projectId: "project-1",
      cwd: `/workspace/${workspaceId}`,
      kind: "local_checkout",
      displayName: workspaceId,
      createdAt: SNOOZED_AT,
      updatedAt: SNOOZED_AT,
      snooze: { snoozedAt: SNOOZED_AT, until },
    }),
  );
}

// Resolves when the registry clears the workspace's snooze. The clear runs file I/O that fake
// timers don't advance.
function snoozeCleared(workspaceId: string): Promise<void> {
  return new Promise((resolve) => {
    const unsubscribe = registry.subscribeToMutations((mutation) => {
      if (mutation.workspaceId !== workspaceId || mutation.workspace?.snooze) return;
      unsubscribe();
      resolve();
    });
  });
}

async function snoozeOf(workspaceId: string) {
  return (await registry.get(workspaceId))?.snooze ?? null;
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  vi.setSystemTime(NOW);
  workdir = mkdtempSync(path.join(tmpdir(), "workspace-snooze-"));
  const logger = createTestLogger();
  registry = new FileBackedWorkspaceRegistry(path.join(workdir, "workspaces.json"), logger);
  await registry.initialize();
  timer = new WorkspaceSnoozeTimer({ workspaceRegistry: registry, logger });
});

afterEach(() => {
  timer.stop();
  vi.useRealTimers();
  rmSync(workdir, { recursive: true, force: true });
});

test("clears a snooze whose wake time passed while the daemon was stopped", async () => {
  await snoozedWorkspace("overdue", "2026-03-01T11:30:00.000Z");

  await timer.start();

  expect(await snoozeOf("overdue")).toBeNull();
});

test("clears each snooze when its wake time passes and leaves later ones", async () => {
  await snoozedWorkspace("soon", "2026-03-01T12:30:00.000Z");
  await snoozedWorkspace("later", "2026-03-01T15:00:00.000Z");
  await timer.start();
  const cleared = snoozeCleared("soon");

  await vi.advanceTimersByTimeAsync(30 * 60 * 1000);
  await cleared;

  expect(await snoozeOf("soon")).toBeNull();
  expect(await snoozeOf("later")).toEqual({
    snoozedAt: SNOOZED_AT,
    until: "2026-03-01T15:00:00.000Z",
  });
});

test("arms for a snooze set after the timer started", async () => {
  await timer.start();
  await snoozedWorkspace("new", "2026-03-01T12:10:00.000Z");
  const cleared = snoozeCleared("new");

  await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
  await cleared;

  expect(await snoozeOf("new")).toBeNull();
});
