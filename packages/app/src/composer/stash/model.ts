import { z } from "zod";
import type { UserComposerAttachment } from "@/attachments/types";

// Attachments are stashed as references: image bytes stay in the attachment
// store and uploaded files on the daemon, so an entry is small JSON.
export const MAX_STASH_ENTRIES = 20;
/** Serialized size budget for the whole stash, well under the localStorage quota. */
export const MAX_STASH_STORAGE_CHARS = 512 * 1024;

export interface PromptStashEntry {
  id: string;
  createdAt: number;
  text: string;
  attachments: UserComposerAttachment[];
}

export type AddStashEntryResult =
  | { status: "stored"; entries: PromptStashEntry[] }
  | { status: "too-large" };

const STASHABLE_ATTACHMENT_KINDS: ReadonlySet<string> = new Set<UserComposerAttachment["kind"]>([
  "image",
  "file",
  "workspace_file",
  "plugin_resource",
  "forge_issue",
  "forge_change_request",
  "github_issue",
  "github_pr",
]);

function isStashableAttachment(value: unknown): value is UserComposerAttachment {
  if (typeof value !== "object" || value === null || !("kind" in value)) return false;
  return typeof value.kind === "string" && STASHABLE_ATTACHMENT_KINDS.has(value.kind);
}

const stashEntrySchema = z.object({
  id: z.string(),
  createdAt: z.number(),
  text: z.string(),
  attachments: z.array(z.custom<UserComposerAttachment>(isStashableAttachment)),
});

const stashSchema = z.array(stashEntrySchema).max(MAX_STASH_ENTRIES);

/** Parses persisted stash JSON. Anything unreadable yields an empty stash. */
export function parseStashEntries(raw: string | null): PromptStashEntry[] {
  if (raw === null) return [];
  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch (error) {
    if (error instanceof SyntaxError) return [];
    throw error;
  }
  const result = stashSchema.safeParse(decoded);
  return result.success ? result.data : [];
}

export function serializeStashEntries(entries: readonly PromptStashEntry[]): string {
  return JSON.stringify(entries);
}

/**
 * Adds an entry newest first. The oldest entries fall off past the entry limit
 * or the size budget; an entry that alone exceeds the budget is refused.
 */
export function addStashEntry(
  entries: readonly PromptStashEntry[],
  entry: PromptStashEntry,
): AddStashEntryResult {
  if (serializeStashEntries([entry]).length > MAX_STASH_STORAGE_CHARS) {
    return { status: "too-large" };
  }
  const next = [entry, ...entries].slice(0, MAX_STASH_ENTRIES);
  while (serializeStashEntries(next).length > MAX_STASH_STORAGE_CHARS) {
    next.pop();
  }
  return { status: "stored", entries: next };
}

export function removeStashEntry(
  entries: readonly PromptStashEntry[],
  id: string,
): PromptStashEntry[] {
  return entries.filter((entry) => entry.id !== id);
}

export function collectStashImageIds(entries: readonly PromptStashEntry[]): string[] {
  const ids: string[] = [];
  for (const entry of entries) {
    for (const attachment of entry.attachments) {
      if (attachment.kind === "image") ids.push(attachment.metadata.id);
    }
  }
  return ids;
}

const PREVIEW_LENGTH = 60;

/** Returns the entry's first non-empty line, truncated for a menu row. */
export function previewStashEntry(entry: PromptStashEntry): string | null {
  const firstLine = entry.text
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  if (!firstLine) return null;
  if (firstLine.length <= PREVIEW_LENGTH) return firstLine;
  return `${firstLine.slice(0, PREVIEW_LENGTH - 1)}…`;
}
