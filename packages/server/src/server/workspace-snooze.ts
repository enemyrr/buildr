import type pino from "pino";
import type { WorkspaceDescriptorPayload, WorkspaceStateBucket } from "./messages.js";
import type { WorkspaceRegistry } from "./workspace-registry.js";

// Buckets that only a fresh event can produce, so entering one after the snooze started means
// the workspace needs you before its wake time.
const RAISED_HAND_BUCKETS: ReadonlySet<WorkspaceStateBucket> = new Set([
  "needs_input",
  "attention",
  "failed",
]);

// setTimeout overflows past 2^31 - 1 ms. A far wake time rechecks at this cap instead.
const MAX_TIMER_DELAY_MS = 2_147_483_647;

type SnoozeRegistry = Pick<WorkspaceRegistry, "list" | "update">;

/** True if the workspace entered an attention bucket after it was snoozed. */
export function hasRaisedHandWhileSnoozed(
  descriptor: Pick<WorkspaceDescriptorPayload, "snooze" | "status" | "statusEnteredAt">,
): boolean {
  const { snooze, status, statusEnteredAt } = descriptor;
  if (!snooze || !statusEnteredAt || !RAISED_HAND_BUCKETS.has(status)) return false;
  return Date.parse(statusEnteredAt) > Date.parse(snooze.snoozedAt);
}

/**
 * Clears the workspace's snooze if it is still the one that started at `snoozedAt`, so a
 * snooze set again in the meantime survives. The registry mutation broadcasts the change.
 */
export async function wakeWorkspace(
  registry: SnoozeRegistry,
  input: { workspaceId: string; snoozedAt: string },
): Promise<void> {
  await registry.update(input.workspaceId, (record) =>
    record.snooze?.snoozedAt === input.snoozedAt ? { ...record, snooze: null } : record,
  );
}

/**
 * Wakes snoozed workspaces when their wake time passes. Keeps one timer, armed for the
 * earliest wake time and re-armed on every workspace mutation.
 */
export class WorkspaceSnoozeTimer {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private unsubscribe: (() => void) | null = null;

  constructor(
    private readonly deps: {
      workspaceRegistry: SnoozeRegistry & Pick<WorkspaceRegistry, "subscribeToMutations">;
      logger: pino.Logger;
    },
  ) {}

  async start(): Promise<void> {
    this.unsubscribe =
      this.deps.workspaceRegistry.subscribeToMutations?.(() => this.rearm()) ?? null;
    await this.wakeDue();
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.clearTimer();
  }

  private rearm(): Promise<void> {
    return this.arm().catch((error: unknown) =>
      this.deps.logger.warn({ err: error }, "workspace_snooze.arm_failed"),
    );
  }

  private async wakeDue(): Promise<void> {
    const nowMs = Date.now();
    const due = (await this.deps.workspaceRegistry.list()).flatMap((record) =>
      record.snooze && !record.archivedAt && Date.parse(record.snooze.until) <= nowMs
        ? [{ workspaceId: record.workspaceId, snoozedAt: record.snooze.snoozedAt }]
        : [],
    );
    // Each wake mutates the registry, which re-arms the timer.
    await Promise.all(due.map((input) => wakeWorkspace(this.deps.workspaceRegistry, input)));
    if (due.length === 0) await this.arm();
  }

  private async arm(): Promise<void> {
    if (!this.unsubscribe) return;
    const records = await this.deps.workspaceRegistry.list();
    let nextWakeAtMs: number | null = null;
    for (const record of records) {
      if (!record.snooze || record.archivedAt) continue;
      const untilMs = Date.parse(record.snooze.until);
      if (Number.isNaN(untilMs)) continue;
      if (nextWakeAtMs === null || untilMs < nextWakeAtMs) nextWakeAtMs = untilMs;
    }
    this.clearTimer();
    if (nextWakeAtMs === null) return;
    const delay = Math.min(MAX_TIMER_DELAY_MS, Math.max(0, nextWakeAtMs - Date.now()));
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.wakeDue().catch((error: unknown) =>
        this.deps.logger.warn({ err: error }, "workspace_snooze.wake_failed"),
      );
    }, delay);
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
