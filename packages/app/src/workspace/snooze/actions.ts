import type { WorkspaceSnooze } from "@getpaseo/protocol/messages";
import { i18n } from "@/i18n/i18next";
import { getHostRuntimeStore } from "@/runtime/host-runtime";
import { registerWorkspaceUndo } from "@/workspace/undo/store";

export interface SnoozeTarget {
  serverId: string;
  workspaceId: string;
  workspaceKey: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Formats a wake time relative to `now`: "14:00", "Thu 09:00", or "Oct 5, 09:00". */
export function formatSnoozeWake(until: Date, now: Date): string {
  const time = until.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const dayDelta = Math.floor((until.getTime() - startOfToday.getTime()) / DAY_MS);
  if (dayDelta === 0) {
    return time;
  }
  if (dayDelta < 7) {
    return `${until.toLocaleDateString(undefined, { weekday: "short" })} ${time}`;
  }
  return `${until.toLocaleDateString(undefined, { month: "short", day: "numeric" })}, ${time}`;
}

async function sendWorkspaceSnooze(
  target: SnoozeTarget,
  until: string | null,
): Promise<WorkspaceSnooze | null> {
  const client = getHostRuntimeStore().getClient(target.serverId);
  if (!client) {
    throw new Error(i18n.t("sidebar.workspace.toasts.hostDisconnected"));
  }
  return client.setWorkspaceSnooze(target.workspaceId, until);
}

/**
 * Snoozes the workspace until `until`, or wakes it when `until` is null, and offers an undo that
 * restores `previous`.
 */
export async function setWorkspaceSnoozeWithUndo(input: {
  target: SnoozeTarget;
  until: Date | null;
  previous: WorkspaceSnooze | null;
}): Promise<void> {
  const { target, until, previous } = input;
  await sendWorkspaceSnooze(target, until ? until.toISOString() : null);
  const message = until
    ? i18n.t("sidebar.undo.snoozed", { time: formatSnoozeWake(until, new Date()) })
    : i18n.t("sidebar.undo.woke");
  registerWorkspaceUndo({
    kind: "snooze",
    workspaceKey: target.workspaceKey,
    message,
    undo: async () => {
      await sendWorkspaceSnooze(target, previous ? previous.until : null);
    },
  });
}
