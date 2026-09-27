import { create } from "zustand";
import {
  latestUndoEntry,
  nextUndoExpiryMs,
  pruneExpiredUndoEntries,
  pushUndoEntry,
  removeUndoEntry,
  UNDO_WINDOW_MS,
  type UndoActionKind,
  type UndoEntry,
} from "./queue";

interface WorkspaceUndoState {
  entries: readonly UndoEntry[];
}

export const useWorkspaceUndoStore = create<WorkspaceUndoState>(() => ({ entries: [] }));

let nextEntryId = 1;
let expiryTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleExpiry(): void {
  if (expiryTimer) {
    clearTimeout(expiryTimer);
    expiryTimer = null;
  }
  const next = nextUndoExpiryMs(useWorkspaceUndoStore.getState().entries);
  if (next === null) {
    return;
  }
  expiryTimer = setTimeout(
    () => {
      expiryTimer = null;
      const { entries } = useWorkspaceUndoStore.getState();
      useWorkspaceUndoStore.setState({ entries: pruneExpiredUndoEntries(entries, Date.now()) });
      scheduleExpiry();
    },
    Math.max(0, next - Date.now()),
  );
}

export interface RegisterWorkspaceUndoInput {
  kind: UndoActionKind;
  workspaceKey: string;
  message: string;
  undo: () => Promise<void>;
}

/** Offers an undo for an action that already succeeded. */
export function registerWorkspaceUndo(input: RegisterWorkspaceUndoInput): void {
  const entry: UndoEntry = {
    ...input,
    id: nextEntryId,
    expiresAtMs: Date.now() + UNDO_WINDOW_MS,
  };
  nextEntryId += 1;
  const { entries } = useWorkspaceUndoStore.getState();
  useWorkspaceUndoStore.setState({ entries: pushUndoEntry(entries, entry) });
  scheduleExpiry();
}

/**
 * Removes the entry before running it, so a second press or keystroke can't undo twice. Returns
 * false when the entry already expired or was superseded.
 */
export async function runWorkspaceUndo(id: number): Promise<boolean> {
  const { entries } = useWorkspaceUndoStore.getState();
  const entry = entries.find((candidate) => candidate.id === id);
  if (!entry || entry.expiresAtMs <= Date.now()) {
    return false;
  }
  useWorkspaceUndoStore.setState({ entries: removeUndoEntry(entries, id) });
  scheduleExpiry();
  await entry.undo();
  return true;
}

export function getLatestWorkspaceUndo(): UndoEntry | null {
  return latestUndoEntry(useWorkspaceUndoStore.getState().entries, Date.now());
}
