import { describe, expect, it } from "vitest";
import { createInlineToken } from "@/composer/inline-attachments/tokens";
import type { ComposerKeyModifiers } from "./input";
import { continueList, indentListItem, resolveListKeyEdit } from "./list-continuation";

const NO_MODIFIERS: ComposerKeyModifiers = {
  shiftKey: false,
  altKey: false,
  metaKey: false,
  ctrlKey: false,
};
const SHIFT: ComposerKeyModifiers = { ...NO_MODIFIERS, shiftKey: true };

// `|` marks the caret.
function at(textWithCaret: string) {
  const caret = textWithCaret.indexOf("|");
  return {
    text: textWithCaret.replace("|", ""),
    selection: { start: caret, end: caret },
  };
}

describe("continueList", () => {
  it.each([
    ["- item|", "- item\n- |"],
    ["* item|", "* item\n* |"],
    ["+ item|", "+ item\n+ |"],
    ["1. first|", "1. first\n2. |"],
    ["9) ninth|", "9) ninth\n10) |"],
    ["- [ ] todo|", "- [ ] todo\n- [ ] |"],
    ["- [x] done|", "- [x] done\n- [ ] |"],
    ["  - nested|", "  - nested\n  - |"],
    ["intro\n- a|\nafter", "intro\n- a\n- |\nafter"],
  ])("continues %j", (before, after) => {
    expect(continueList(at(before))).toEqual(at(after));
  });

  it("splits the item at the caret", () => {
    expect(continueList(at("- one| two"))).toEqual(at("- one\n- | two"));
  });

  it("exits the list on an empty item", () => {
    expect(continueList(at("- a\n- |"))).toEqual(at("- a\n|"));
    expect(continueList(at("1. a\n2. |"))).toEqual(at("1. a\n|"));
    expect(continueList(at("- [ ] |"))).toEqual(at("|"));
  });

  it.each([["plain text|"], ["-dash|"], ["---|"], ["1.5 apples|"], ["-| item"]])(
    "leaves %j to a plain newline",
    (before) => {
      expect(continueList(at(before))).toBeNull();
    },
  );

  it("leaves ranged selections alone", () => {
    expect(continueList({ text: "- item", selection: { start: 2, end: 6 } })).toBeNull();
  });

  it("does not split an inline attachment token", () => {
    const token = createInlineToken("file.ts");
    const text = `- see ${token}`;
    const insideToken = "- see ".length + 3;
    expect(continueList({ text, selection: { start: insideToken, end: insideToken } })).toBeNull();
  });
});

describe("indentListItem", () => {
  it("indents the item under the caret by two spaces", () => {
    expect(indentListItem(at("- a\n- b|"), "indent")).toEqual(at("- a\n  - b|"));
  });

  it("outdents by two spaces or one tab", () => {
    expect(indentListItem(at("    - b|"), "outdent")).toEqual(at("  - b|"));
    expect(indentListItem(at("\t- b|"), "outdent")).toEqual(at("- b|"));
  });

  it("returns null when there is nothing to outdent", () => {
    expect(indentListItem(at("- b|"), "outdent")).toBeNull();
  });

  it("returns null off a list item", () => {
    expect(indentListItem(at("text|"), "indent")).toBeNull();
  });
});

describe("resolveListKeyEdit", () => {
  it("continues on Shift+Enter when Enter sends", () => {
    const input = at("- a|");
    expect(
      resolveListKeyEdit({ key: "Enter", modifiers: SHIFT, submitOnEnter: true, input }),
    ).toEqual(at("- a\n- |"));
    expect(
      resolveListKeyEdit({ key: "Enter", modifiers: NO_MODIFIERS, submitOnEnter: true, input }),
    ).toBeNull();
  });

  it("continues on Enter when Enter inserts a newline", () => {
    expect(
      resolveListKeyEdit({
        key: "Enter",
        modifiers: NO_MODIFIERS,
        submitOnEnter: false,
        input: at("- a|"),
      }),
    ).toEqual(at("- a\n- |"));
  });

  it("ignores Enter with Cmd, Ctrl, or Alt", () => {
    expect(
      resolveListKeyEdit({
        key: "Enter",
        modifiers: { ...SHIFT, metaKey: true },
        submitOnEnter: true,
        input: at("- a|"),
      }),
    ).toBeNull();
  });

  it("indents on plain Tab only", () => {
    const input = at("- a|");
    expect(
      resolveListKeyEdit({ key: "Tab", modifiers: NO_MODIFIERS, submitOnEnter: true, input }),
    ).toEqual(at("  - a|"));
    expect(
      resolveListKeyEdit({ key: "Tab", modifiers: SHIFT, submitOnEnter: true, input }),
    ).toBeNull();
  });
});
