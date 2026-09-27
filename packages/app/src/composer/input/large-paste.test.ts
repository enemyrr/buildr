import { describe, expect, it } from "vitest";
import {
  LARGE_PASTE_THRESHOLD_BYTES,
  PLAIN_PASTE_WINDOW_MS,
  createPlainPasteIntent,
  createPastedTextFile,
  formatPastedTextFileName,
  insertAtSelection,
  isLargePaste,
  isPlainPasteChord,
} from "./large-paste";

const NO_MODIFIERS = { shiftKey: false, altKey: false, metaKey: false, ctrlKey: false };

describe("isLargePaste", () => {
  it("diverts text at the 32 KiB threshold", () => {
    expect(isLargePaste("a".repeat(LARGE_PASTE_THRESHOLD_BYTES - 1))).toBe(false);
    expect(isLargePaste("a".repeat(LARGE_PASTE_THRESHOLD_BYTES))).toBe(true);
  });

  it("measures UTF-8 bytes, not characters", () => {
    // "é" is 2 bytes in UTF-8.
    expect(isLargePaste("é".repeat(LARGE_PASTE_THRESHOLD_BYTES / 2))).toBe(true);
    expect(isLargePaste("é".repeat(LARGE_PASTE_THRESHOLD_BYTES / 2 - 1))).toBe(false);
  });
});

describe("isPlainPasteChord", () => {
  it("matches Cmd+Shift+V and Ctrl+Shift+V", () => {
    expect(isPlainPasteChord({ ...NO_MODIFIERS, key: "V", shiftKey: true, metaKey: true })).toBe(
      true,
    );
    expect(isPlainPasteChord({ ...NO_MODIFIERS, key: "v", shiftKey: true, ctrlKey: true })).toBe(
      true,
    );
  });

  it("does not match a plain paste or Alt chords", () => {
    expect(isPlainPasteChord({ ...NO_MODIFIERS, key: "v", metaKey: true })).toBe(false);
    expect(
      isPlainPasteChord({ key: "v", shiftKey: true, metaKey: true, altKey: true, ctrlKey: false }),
    ).toBe(false);
  });
});

describe("pasted text file", () => {
  it("names the file after the paste time", () => {
    expect(formatPastedTextFileName(new Date(2026, 8, 7, 4, 5, 6))).toBe(
      "pasted-text-20260907-040506.txt",
    );
  });

  it("holds the pasted text as UTF-8 plain text", async () => {
    const file = createPastedTextFile("héllo", new Date(2026, 0, 1));
    expect(file.mimeType).toBe("text/plain");
    expect(new TextDecoder().decode(await file.readBytes())).toBe("héllo");
  });
});

describe("insertAtSelection", () => {
  it("replaces the selection and puts the caret after the insertion", () => {
    expect(insertAtSelection({ text: "abcdef", selection: { start: 2, end: 4 } }, "XY")).toEqual({
      text: "abXYef",
      selection: { start: 4, end: 4 },
    });
  });
});

describe("createPlainPasteIntent", () => {
  function fakeClock() {
    let time = 0;
    return { now: () => time, advance: (ms: number) => (time += ms) };
  }

  it("keeps only the next paste inline", () => {
    const intent = createPlainPasteIntent(fakeClock().now);
    intent.request();
    expect(intent.consume()).toBe(true);
    expect(intent.consume()).toBe(false);
  });

  it("is off without a request", () => {
    expect(createPlainPasteIntent(fakeClock().now).consume()).toBe(false);
  });

  it("expires when no paste follows the request", () => {
    const clock = fakeClock();
    const intent = createPlainPasteIntent(clock.now);
    intent.request();
    clock.advance(PLAIN_PASTE_WINDOW_MS + 1);
    expect(intent.consume()).toBe(false);
  });

  it("treats a keydown and a menu request for the same paste as one", () => {
    const clock = fakeClock();
    const intent = createPlainPasteIntent(clock.now);
    intent.request();
    clock.advance(5);
    intent.request();
    expect(intent.consume()).toBe(true);
    expect(intent.consume()).toBe(false);
  });
});
