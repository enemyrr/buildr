import { describe, expect, it } from "vitest";
import {
  applyInlineTokenEdit,
  createInlineToken,
  formatInlineLabel,
  insertInlineToken,
  parseInlineTokens,
  reconcileInlineTokens,
  serializeInlineTokens,
  snapSelectionToTokens,
  type InlineAttachmentItem,
} from "./tokens";

const IMAGE = formatInlineLabel("image.png");
const PR = formatInlineLabel("#936 Dev");
const imageToken = createInlineToken(IMAGE);
const prToken = createInlineToken(PR);

function item(id: string, label: string, reference: string): InlineAttachmentItem<string> {
  return { item: id, label, reference };
}

describe("formatInlineLabel", () => {
  it("keeps spaces from breaking and truncates long labels", () => {
    expect(PR).toBe("#936\u00a0Dev");
    expect(formatInlineLabel("a".repeat(60))).toHaveLength(32);
  });
});

describe("parseInlineTokens", () => {
  it("finds tokens with their ranges and labels", () => {
    const text = `see ${imageToken} and ${prToken}`;
    expect(parseInlineTokens(text)).toEqual([
      { start: 4, end: 4 + imageToken.length, label: IMAGE },
      { start: text.length - prToken.length, end: text.length, label: PR },
    ]);
  });
});

describe("applyInlineTokenEdit", () => {
  const previous = `a ${imageToken} b`;
  const tokenEnd = 2 + imageToken.length;

  it("deletes the whole token when Backspace removes its last character", () => {
    const next = previous.slice(0, tokenEnd - 1) + previous.slice(tokenEnd);
    expect(applyInlineTokenEdit(previous, next)).toEqual({
      text: "a  b",
      cursor: 2,
      removed: [0],
    });
  });

  it("moves text typed inside a token out of it and drops the token", () => {
    const next = `${previous.slice(0, 4)}x${previous.slice(4)}`;
    expect(applyInlineTokenEdit(previous, next)).toEqual({
      text: "a x b",
      cursor: 3,
      removed: [0],
    });
  });

  it("leaves edits outside tokens alone", () => {
    expect(applyInlineTokenEdit(previous, `${previous}c`)).toEqual({
      text: `${previous}c`,
      cursor: null,
      removed: [],
    });
  });

  it("turns pasted tokens into plain labels", () => {
    expect(applyInlineTokenEdit("ab", `a${prToken}b`)).toEqual({
      text: "a#936 Devb",
      cursor: 9,
      removed: [],
    });
  });

  it("reports tokens deleted as part of a larger selection", () => {
    expect(applyInlineTokenEdit(previous, "")).toEqual({ text: "", cursor: null, removed: [0] });
  });
});

describe("snapSelectionToTokens", () => {
  const text = `a ${imageToken} b`;
  const end = 2 + imageToken.length;

  it("jumps over the token in the direction of travel", () => {
    expect(snapSelectionToTokens(text, { start: 3, end: 3 }, { start: 2, end: 2 })).toEqual({
      start: end,
      end,
    });
    expect(
      snapSelectionToTokens(text, { start: end - 1, end: end - 1 }, { start: end, end }),
    ).toEqual({ start: 2, end: 2 });
  });

  it("widens a range selection to cover whole tokens", () => {
    expect(snapSelectionToTokens(text, { start: 0, end: 4 }, { start: 0, end: 0 })).toEqual({
      start: 0,
      end,
    });
  });

  it("ignores carets outside tokens", () => {
    expect(snapSelectionToTokens(text, { start: 1, end: 1 }, { start: 0, end: 0 })).toBeNull();
  });
});

describe("insertInlineToken", () => {
  it("pads the token with spaces", () => {
    expect(insertInlineToken("ab", imageToken, 1)).toEqual({
      text: `a ${imageToken} b`,
      cursor: 3 + imageToken.length,
    });
    expect(insertInlineToken("", imageToken, 0)).toEqual({
      text: `${imageToken} `,
      cursor: imageToken.length + 1,
    });
  });
});

describe("reconcileInlineTokens", () => {
  it("inserts a token for a new attachment at the caret", () => {
    const result = reconcileInlineTokens({
      text: "hello",
      items: [item("a", IMAGE, "[Image #1]")],
      insertAt: 5,
    });
    expect(result.text).toBe(`hello ${imageToken} `);
    expect(result.cursor).toBe(result.text.length);
    expect(result.order).toEqual(["a"]);
  });

  it("turns a restored reference back into a token", () => {
    const result = reconcileInlineTokens({
      text: "look at [Image #1] here",
      items: [item("a", IMAGE, "[Image #1]")],
      insertAt: 0,
    });
    expect(result.text).toBe(`look at ${imageToken} here`);
    expect(result.cursor).toBeNull();
  });

  it("deletes a token whose attachment is gone", () => {
    const result = reconcileInlineTokens({ text: `x ${prToken} y`, items: [], insertAt: 0 });
    expect(result.text).toBe("x y");
  });

  it("orders attachments by where their tokens appear", () => {
    const result = reconcileInlineTokens({
      text: `${prToken} tail`,
      items: [item("pr", PR, "[#936 Dev]"), item("img", IMAGE, "[Image #1]")],
      insertAt: 0,
    });
    expect(result.text).toBe(`${imageToken} ${prToken} tail`);
    expect(result.order).toEqual(["img", "pr"]);
  });
});

describe("serializeInlineTokens", () => {
  it("replaces tokens with references", () => {
    const text = `${imageToken} vs ${createInlineToken(IMAGE)} and ${prToken}`;
    const items = [
      item("a", IMAGE, "[Image #1]"),
      item("b", IMAGE, "[Image #2]"),
      item("pr", PR, "[#936 Dev]"),
    ];
    expect(serializeInlineTokens(text, items)).toBe("[Image #1] vs [Image #2] and [#936 Dev]");
  });
});
