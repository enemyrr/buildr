export type UndoActionKind = "archive" | "pin" | "snooze" | "read";

export interface UndoEntry {
  id: number;
  kind: UndoActionKind;
  workspaceKey: string;
  message: string;
  expiresAtMs: number;
  undo: () => Promise<void>;
}

export const UNDO_WINDOW_MS = 5000;

/**
 * Adds an entry, newest last. An entry of the same kind for the same workspace supersedes the
 * older one: its undo would restore a state the newer action already replaced.
 */
export function pushUndoEntry(entries: readonly UndoEntry[], entry: UndoEntry): UndoEntry[] {
  return [
    ...entries.filter(
      (existing) => existing.kind !== entry.kind || existing.workspaceKey !== entry.workspaceKey,
    ),
    entry,
  ];
}

export function pruneExpiredUndoEntries(
  entries: readonly UndoEntry[],
  nowMs: number,
): readonly UndoEntry[] {
  const live = entries.filter((entry) => entry.expiresAtMs > nowMs);
  return live.length === entries.length ? entries : live;
}

/** Returns the most recent entry that can still be undone. */
export function latestUndoEntry(entries: readonly UndoEntry[], nowMs: number): UndoEntry | null {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry && entry.expiresAtMs > nowMs) {
      return entry;
    }
  }
  return null;
}

export function removeUndoEntry(entries: readonly UndoEntry[], id: number): UndoEntry[] {
  return entries.filter((entry) => entry.id !== id);
}

export function nextUndoExpiryMs(entries: readonly UndoEntry[]): number | null {
  let next: number | null = null;
  for (const entry of entries) {
    if (next === null || entry.expiresAtMs < next) {
      next = entry.expiresAtMs;
    }
  }
  return next;
}
