import { describe, expect, it } from "vitest";
import { isCtrlChord, resolveInputHint, type InputHintState } from "./input-hint";

const IDLE: InputHintState = {
  escapeArm: null,
  notice: null,
  externalEditor: null,
  isShellDraft: false,
  isMemoryDraft: false,
  isAgentRunning: false,
};

describe("resolveInputHint", () => {
  it("shows nothing when idle", () => {
    expect(resolveInputHint(IDLE)).toBeNull();
  });

  it("ranks a pending Esc over everything else", () => {
    expect(
      resolveInputHint({
        ...IDLE,
        escapeArm: "rewind",
        notice: "Pasted 40 lines",
        isShellDraft: true,
        isAgentRunning: true,
      }),
    ).toEqual({ kind: "escape", arm: "rewind" });
  });

  it("ranks notices over draft modes, and draft modes over the interrupt hint", () => {
    expect(resolveInputHint({ ...IDLE, notice: "Saved", isShellDraft: true })).toEqual({
      kind: "notice",
      text: "Saved",
    });
    expect(resolveInputHint({ ...IDLE, isMemoryDraft: true, isAgentRunning: true })).toEqual({
      kind: "memory",
    });
    expect(resolveInputHint({ ...IDLE, isAgentRunning: true })).toEqual({ kind: "interrupt" });
  });

  it("shows the external editor while it owns the draft", () => {
    expect(resolveInputHint({ ...IDLE, externalEditor: "Zed", isShellDraft: true })).toEqual({
      kind: "external-editor",
      editor: "Zed",
    });
  });
});

describe("isCtrlChord", () => {
  const modifiers = { ctrlKey: true, metaKey: false, altKey: false, shiftKey: false };

  it("matches Ctrl plus the letter, either case", () => {
    expect(isCtrlChord({ key: "r", modifiers }, "r")).toBe(true);
    expect(isCtrlChord({ key: "R", modifiers }, "r")).toBe(true);
  });

  it("ignores other modifiers and letters", () => {
    expect(isCtrlChord({ key: "r", modifiers: { ...modifiers, metaKey: true } }, "r")).toBe(false);
    expect(isCtrlChord({ key: "r", modifiers: { ...modifiers, shiftKey: true } }, "r")).toBe(false);
    expect(isCtrlChord({ key: "r", modifiers: { ...modifiers, ctrlKey: false } }, "r")).toBe(false);
    expect(isCtrlChord({ key: "g", modifiers }, "r")).toBe(false);
  });
});
