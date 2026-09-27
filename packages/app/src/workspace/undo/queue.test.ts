import { describe, expect, it } from "vitest";
import {
  latestUndoEntry,
  nextUndoExpiryMs,
  pruneExpiredUndoEntries,
  pushUndoEntry,
  removeUndoEntry,
  type UndoActionKind,
  type UndoEntry,
} from "./queue";

async function noop(): Promise<void> {}

function entry(id: number, kind: UndoActionKind, workspaceKey: string, expiresAtMs = 5000) {
  const value: UndoEntry = { id, kind, workspaceKey, message: "", expiresAtMs, undo: noop };
  return value;
}

describe("pushUndoEntry", () => {
  it("supersedes an older entry of the same kind for the same workspace", () => {
    const entries = pushUndoEntry([entry(1, "pin", "srv:a")], entry(2, "pin", "srv:a"));
    expect(entries.map((item) => item.id)).toEqual([2]);
  });

  it("keeps entries of other kinds or other workspaces", () => {
    let entries = pushUndoEntry([], entry(1, "pin", "srv:a"));
    entries = pushUndoEntry(entries, entry(2, "snooze", "srv:a"));
    entries = pushUndoEntry(entries, entry(3, "pin", "srv:b"));
    expect(entries.map((item) => item.id)).toEqual([1, 2, 3]);
  });
});

describe("latestUndoEntry", () => {
  it("returns the newest live entry and skips expired ones", () => {
    const entries = [entry(1, "pin", "srv:a", 9000), entry(2, "archive", "srv:b", 1000)];
    expect(latestUndoEntry(entries, 500)?.id).toBe(2);
    expect(latestUndoEntry(entries, 1000)?.id).toBe(1);
    expect(latestUndoEntry(entries, 9000)).toBeNull();
  });
});

describe("pruneExpiredUndoEntries", () => {
  it("drops expired entries and keeps identity when nothing expired", () => {
    const entries = [entry(1, "pin", "srv:a", 1000), entry(2, "read", "srv:a", 3000)];
    expect(pruneExpiredUndoEntries(entries, 500)).toBe(entries);
    expect(pruneExpiredUndoEntries(entries, 1000).map((item) => item.id)).toEqual([2]);
  });
});

describe("removeUndoEntry and nextUndoExpiryMs", () => {
  it("removes one entry and reports the earliest expiry", () => {
    const entries = [entry(1, "pin", "srv:a", 4000), entry(2, "read", "srv:a", 2000)];
    expect(nextUndoExpiryMs(entries)).toBe(2000);
    expect(removeUndoEntry(entries, 2).map((item) => item.id)).toEqual([1]);
    expect(nextUndoExpiryMs([])).toBeNull();
  });
});
