import { create } from "zustand";
import { isWeb } from "@/constants/platform";
import { retainAttachmentForGarbageCollection } from "@/attachments/gc-retention";
import {
  addStashEntry,
  collectStashImageIds,
  parseStashEntries,
  removeStashEntry,
  serializeStashEntries,
  type PromptStashEntry,
} from "./model";

const STORAGE_KEY = "paseo-prompt-stash";

export type StashPromptResult = "stored" | "too-large" | "storage-failed";

interface PromptStashState {
  entries: PromptStashEntry[];
}

// localStorage throws a DOMException when it is blocked (SecurityError) or full
// (QuotaExceededError). The stash is a convenience, so both degrade to "no stash".
function readStorage(): string | null {
  if (!isWeb) return null;
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch (error) {
    if (error instanceof DOMException) return null;
    throw error;
  }
}

function writeStorage(entries: readonly PromptStashEntry[]): boolean {
  if (!isWeb) return false;
  try {
    if (entries.length === 0) {
      window.localStorage.removeItem(STORAGE_KEY);
    } else {
      window.localStorage.setItem(STORAGE_KEY, serializeStashEntries(entries));
    }
    return true;
  } catch (error) {
    if (error instanceof DOMException) return false;
    throw error;
  }
}

// Stashed images live only in the attachment store, so the stash holds a
// retention on each one to keep attachment garbage collection away from it.
const imageRetentions = new Map<string, () => void>();

function syncImageRetention(entries: readonly PromptStashEntry[]): void {
  const ids = new Set(collectStashImageIds(entries));
  for (const [id, release] of imageRetentions) {
    if (ids.has(id)) continue;
    release();
    imageRetentions.delete(id);
  }
  for (const id of ids) {
    if (imageRetentions.has(id)) continue;
    imageRetentions.set(id, retainAttachmentForGarbageCollection(id));
  }
}

function initialEntries(): PromptStashEntry[] {
  const entries = parseStashEntries(readStorage());
  syncImageRetention(entries);
  return entries;
}

export const usePromptStashStore = create<PromptStashState>(() => ({
  entries: initialEntries(),
}));

function commit(entries: PromptStashEntry[]): boolean {
  if (!writeStorage(entries)) return false;
  syncImageRetention(entries);
  usePromptStashStore.setState({ entries });
  return true;
}

export function stashPrompt(entry: PromptStashEntry): StashPromptResult {
  const result = addStashEntry(usePromptStashStore.getState().entries, entry);
  if (result.status === "too-large") return "too-large";
  return commit(result.entries) ? "stored" : "storage-failed";
}

/** Removes and returns an entry, or null when it is gone or storage fails. */
export function takeStashEntry(id: string): PromptStashEntry | null {
  const { entries } = usePromptStashStore.getState();
  const entry = entries.find((candidate) => candidate.id === id);
  if (!entry) return null;
  return commit(removeStashEntry(entries, id)) ? entry : null;
}
