import { describe, expect, it } from "vitest";
import { createUserMessage, type StreamItem } from "@/types/stream";
import {
  buildPromptHistory,
  stepPromptHistory,
  type PromptHistoryEntry,
  type PromptHistoryPosition,
} from "./prompt-history";

function userMessage(id: string, text: string): StreamItem {
  return createUserMessage({ id, text, timestamp: new Date(0) });
}

const ENTRIES: PromptHistoryEntry[] = [
  { id: "a", prompt: "first" },
  { id: "b", prompt: "second\nline two" },
  { id: "c", prompt: "third" },
];

function caret(offset: number) {
  return { start: offset, end: offset };
}

describe("buildPromptHistory", () => {
  it("keeps user prompts oldest first and collapses consecutive duplicates", () => {
    const items: StreamItem[] = [
      userMessage("1", " fix the bug "),
      { kind: "assistant_message", id: "r", text: "fix the bug", timestamp: new Date(0) },
      userMessage("2", "fix the bug"),
      userMessage("3", "   "),
      userMessage("4", "ship it"),
    ];
    expect(buildPromptHistory(items)).toEqual([
      { id: "2", prompt: "fix the bug" },
      { id: "4", prompt: "ship it" },
    ]);
  });
});

describe("stepPromptHistory", () => {
  it("recalls the newest prompt from an empty composer", () => {
    expect(
      stepPromptHistory({
        direction: "backward",
        entries: ENTRIES,
        position: null,
        text: "",
        selection: caret(0),
      }),
    ).toEqual({ position: { entryId: "c", recalled: "third", draft: "" }, text: "third" });
  });

  it("falls through when the composer has text and nothing is recalled", () => {
    expect(
      stepPromptHistory({
        direction: "backward",
        entries: ENTRIES,
        position: null,
        text: "draft",
        selection: caret(0),
      }),
    ).toBeNull();
  });

  it("falls through when there is no history", () => {
    expect(
      stepPromptHistory({
        direction: "backward",
        entries: [],
        position: null,
        text: "",
        selection: caret(0),
      }),
    ).toBeNull();
  });

  it("walks back only while the caret is on the first line of the recall", () => {
    const position: PromptHistoryPosition = {
      entryId: "b",
      recalled: "second\nline two",
      draft: "",
    };
    const onSecondLine = stepPromptHistory({
      direction: "backward",
      entries: ENTRIES,
      position,
      text: position.recalled,
      selection: caret(10),
    });
    const onFirstLine = stepPromptHistory({
      direction: "backward",
      entries: ENTRIES,
      position,
      text: position.recalled,
      selection: caret(3),
    });
    expect(onSecondLine).toBeNull();
    expect(onFirstLine).toEqual({
      position: { entryId: "a", recalled: "first", draft: "" },
      text: "first",
    });
  });

  it("stops at the oldest entry", () => {
    expect(
      stepPromptHistory({
        direction: "backward",
        entries: ENTRIES,
        position: { entryId: "a", recalled: "first", draft: "" },
        text: "first",
        selection: caret(5),
      }),
    ).toBeNull();
  });

  it("walks forward only while the caret is on the last line of the recall", () => {
    const position: PromptHistoryPosition = {
      entryId: "b",
      recalled: "second\nline two",
      draft: "",
    };
    expect(
      stepPromptHistory({
        direction: "forward",
        entries: ENTRIES,
        position,
        text: position.recalled,
        selection: caret(2),
      }),
    ).toBeNull();
    expect(
      stepPromptHistory({
        direction: "forward",
        entries: ENTRIES,
        position,
        text: position.recalled,
        selection: caret(position.recalled.length),
      }),
    ).toEqual({ position: { entryId: "c", recalled: "third", draft: "" }, text: "third" });
  });

  it("restores the draft after the newest entry and ends browsing", () => {
    expect(
      stepPromptHistory({
        direction: "forward",
        entries: ENTRIES,
        position: { entryId: "c", recalled: "third", draft: "" },
        text: "third",
        selection: caret(5),
      }),
    ).toEqual({ position: null, text: "" });
  });

  it("ends browsing once the recalled text is edited", () => {
    expect(
      stepPromptHistory({
        direction: "forward",
        entries: ENTRIES,
        position: { entryId: "c", recalled: "third", draft: "" },
        text: "third!",
        selection: caret(6),
      }),
    ).toBeNull();
  });

  it("keeps its place when an optimistic entry is replaced under a new id", () => {
    expect(
      stepPromptHistory({
        direction: "backward",
        entries: ENTRIES,
        position: { entryId: "optimistic", recalled: "third", draft: "" },
        text: "third",
        selection: caret(0),
      }),
    ).toEqual({
      position: { entryId: "b", recalled: "second\nline two", draft: "" },
      text: "second\nline two",
    });
  });

  it("ignores forward steps when nothing is recalled", () => {
    expect(
      stepPromptHistory({
        direction: "forward",
        entries: ENTRIES,
        position: null,
        text: "",
        selection: caret(0),
      }),
    ).toBeNull();
  });
});
