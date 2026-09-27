import type { SessionState } from "@/stores/session-store";
import type { StreamItem } from "@/types/stream";
import type { ComposerKeyModifiers } from "./input/input";

// Terminal-style prompt recall. Entries derive from the agent's timeline on every
// keypress, so there is no history store to persist or sync.

export interface PromptHistoryEntry {
  id: string;
  prompt: string;
}

/**
 * An active recall. `recalled` is the text put in the composer; once the composer
 * no longer matches it, the user has edited or sent and browsing is over. `draft`
 * is what the composer held before browsing started.
 */
export interface PromptHistoryPosition {
  entryId: string;
  recalled: string;
  draft: string;
}

export interface PromptHistoryStep {
  position: PromptHistoryPosition | null;
  text: string;
}

export type PromptHistoryDirection = "backward" | "forward";

export interface PromptHistoryStepInput {
  direction: PromptHistoryDirection;
  entries: readonly PromptHistoryEntry[];
  position: PromptHistoryPosition | null;
  text: string;
  selection: { start: number; end: number };
}

/** Oldest first. Consecutive identical prompts collapse into the newest one. */
export function buildPromptHistory(items: readonly StreamItem[]): PromptHistoryEntry[] {
  const entries: PromptHistoryEntry[] = [];
  for (const item of items) {
    if (item.kind !== "user_message") continue;
    const prompt = item.text.trim();
    if (prompt.length === 0) continue;
    const previous = entries[entries.length - 1];
    if (previous && previous.prompt === prompt) {
      entries[entries.length - 1] = { id: item.id, prompt };
      continue;
    }
    entries.push({ id: item.id, prompt });
  }
  return entries;
}

/** Reads the agent's sent prompts from the timeline, including in-flight items. */
export function selectPromptHistory(
  session: SessionState | undefined,
  agentId: string,
): PromptHistoryEntry[] {
  if (!session) return [];
  const tail = session.agentStreamTail.get(agentId) ?? [];
  const head = session.agentStreamHead.get(agentId) ?? [];
  return buildPromptHistory([...tail, ...head]);
}

/** Maps a plain ArrowUp or ArrowDown to a history direction. */
export function resolvePromptHistoryDirection(
  key: string,
  modifiers: ComposerKeyModifiers,
): PromptHistoryDirection | null {
  const hasModifier =
    modifiers.shiftKey || modifiers.altKey || modifiers.metaKey || modifiers.ctrlKey;
  if (hasModifier) return null;
  if (key === "ArrowUp") return "backward";
  if (key === "ArrowDown") return "forward";
  return null;
}

// An optimistic message can be replaced by its server ack under a new id, so fall
// back to the newest entry with the recalled text.
function findActiveIndex(
  entries: readonly PromptHistoryEntry[],
  position: PromptHistoryPosition,
): number {
  const byId = entries.findIndex((entry) => entry.id === position.entryId);
  if (byId >= 0) return byId;
  return entries.findLastIndex((entry) => entry.prompt === position.recalled);
}

function isCaretOnFirstLine(text: string, selection: { start: number; end: number }): boolean {
  return selection.start === selection.end && !text.slice(0, selection.start).includes("\n");
}

function isCaretOnLastLine(text: string, selection: { start: number; end: number }): boolean {
  return selection.start === selection.end && !text.slice(selection.end).includes("\n");
}

function recall(entry: PromptHistoryEntry, draft: string): PromptHistoryStep {
  return { position: { entryId: entry.id, recalled: entry.prompt, draft }, text: entry.prompt };
}

/**
 * Returns null when the key falls through to normal caret movement. Backward
 * starts only from an empty composer and stops at the oldest entry. While
 * browsing, backward needs the caret on the first line and forward needs it on
 * the last line, so arrows still move through a multi-line recall. Forward past
 * the newest entry restores the draft and ends browsing.
 */
export function stepPromptHistory(input: PromptHistoryStepInput): PromptHistoryStep | null {
  const { entries, position, text, selection } = input;
  const activeIndex =
    position !== null && position.recalled === text ? findActiveIndex(entries, position) : -1;

  if (position === null || activeIndex < 0) {
    const newest = entries[entries.length - 1];
    if (input.direction === "forward" || text.length > 0 || !newest) return null;
    return recall(newest, text);
  }

  if (input.direction === "backward") {
    if (!isCaretOnFirstLine(text, selection)) return null;
    const older = entries[activeIndex - 1];
    if (!older) return null;
    return recall(older, position.draft);
  }

  if (!isCaretOnLastLine(text, selection)) return null;
  const newer = entries[activeIndex + 1];
  if (!newer) return { position: null, text: position.draft };
  return recall(newer, position.draft);
}
