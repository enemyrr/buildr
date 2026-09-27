import { describe, expect, it } from "vitest";
import type { UserComposerAttachment } from "@/attachments/types";
import {
  MAX_STASH_ENTRIES,
  MAX_STASH_STORAGE_CHARS,
  addStashEntry,
  collectStashImageIds,
  parseStashEntries,
  previewStashEntry,
  removeStashEntry,
  serializeStashEntries,
  type PromptStashEntry,
} from "./model";

const IMAGE: UserComposerAttachment = {
  kind: "image",
  metadata: {
    id: "img-1",
    mimeType: "image/png",
    storageType: "web-indexeddb",
    storageKey: "img-1",
    createdAt: 0,
  },
};

function entry(id: string, text = `prompt ${id}`): PromptStashEntry {
  return { id, createdAt: 0, text, attachments: [] };
}

function storedEntries(result: ReturnType<typeof addStashEntry>): PromptStashEntry[] {
  if (result.status !== "stored") throw new Error(`Expected stored, got ${result.status}`);
  return result.entries;
}

describe("addStashEntry", () => {
  it("adds the newest entry first", () => {
    const entries = storedEntries(addStashEntry([entry("a")], entry("b")));
    expect(entries.map((item) => item.id)).toEqual(["b", "a"]);
  });

  it("keeps at most 20 entries by dropping the oldest", () => {
    const full = Array.from({ length: MAX_STASH_ENTRIES }, (_, index) => entry(`e${index}`));
    const entries = storedEntries(addStashEntry(full, entry("new")));
    expect(entries).toHaveLength(MAX_STASH_ENTRIES);
    expect(entries[0].id).toBe("new");
    expect(entries.map((item) => item.id)).not.toContain(`e${MAX_STASH_ENTRIES - 1}`);
  });

  it("drops the oldest entries to stay within the size budget", () => {
    const large = "x".repeat(MAX_STASH_STORAGE_CHARS / 3);
    const existing = [entry("b", large), entry("a", large)];
    const entries = storedEntries(addStashEntry(existing, entry("c", large)));
    expect(entries.map((item) => item.id)).toEqual(["c", "b"]);
    expect(serializeStashEntries(entries).length).toBeLessThanOrEqual(MAX_STASH_STORAGE_CHARS);
  });

  it("refuses an entry larger than the whole budget", () => {
    expect(addStashEntry([], entry("huge", "x".repeat(MAX_STASH_STORAGE_CHARS)))).toEqual({
      status: "too-large",
    });
  });
});

describe("parseStashEntries", () => {
  it("round-trips serialized entries", () => {
    const entries = [{ ...entry("a"), attachments: [IMAGE] }];
    expect(parseStashEntries(serializeStashEntries(entries))).toEqual(entries);
  });

  it("returns an empty stash for missing, malformed, or invalid data", () => {
    expect(parseStashEntries(null)).toEqual([]);
    expect(parseStashEntries("{not json")).toEqual([]);
    expect(parseStashEntries(JSON.stringify([{ id: 1 }]))).toEqual([]);
    expect(
      parseStashEntries(JSON.stringify([{ ...entry("a"), attachments: [{ kind: "unknown" }] }])),
    ).toEqual([]);
  });
});

describe("stash helpers", () => {
  it("removes an entry by id", () => {
    expect(removeStashEntry([entry("a"), entry("b")], "a")).toEqual([entry("b")]);
  });

  it("collects image ids so the attachment store keeps them", () => {
    expect(collectStashImageIds([{ ...entry("a"), attachments: [IMAGE] }, entry("b")])).toEqual([
      "img-1",
    ]);
  });

  it("previews the first non-empty line", () => {
    expect(previewStashEntry(entry("a", "\n  fix the login bug  \nmore"))).toBe(
      "fix the login bug",
    );
    expect(previewStashEntry(entry("a", "y".repeat(80)))).toBe(`${"y".repeat(59)}…`);
    expect(previewStashEntry(entry("a", "  "))).toBeNull();
  });
});
