import { describe, expect, it } from "vitest";
import { diffTextSplice } from "./undoable-edit";

function apply(previous: string, next: string): string {
  const splice = diffTextSplice(previous, next);
  if (!splice) return previous;
  return previous.slice(0, splice.start) + splice.replacement + previous.slice(splice.end);
}

describe("diffTextSplice", () => {
  it("returns null for equal text", () => {
    expect(diffTextSplice("same", "same")).toBeNull();
  });

  it("isolates a list continuation to the inserted marker", () => {
    expect(diffTextSplice("- a", "- a\n- ")).toEqual({ start: 3, end: 3, replacement: "\n- " });
  });

  it("isolates an insertion in the middle of the text", () => {
    expect(diffTextSplice("- one two", "- one\n- two")).toEqual({
      start: 5,
      end: 5,
      replacement: "\n-",
    });
  });

  it("isolates a deletion", () => {
    expect(diffTextSplice("- a\n- ", "- a\n")).toEqual({ start: 4, end: 6, replacement: "" });
  });

  it("replaces everything when nothing is shared", () => {
    expect(diffTextSplice("", "recalled")).toEqual({ start: 0, end: 0, replacement: "recalled" });
    expect(diffTextSplice("first", "second")).toEqual({
      start: 0,
      end: 5,
      replacement: "second",
    });
  });

  it.each([
    ["aaa", "aa"],
    ["aa", "aaa"],
    ["  - b", "- b"],
    ["abcabc", "abc"],
    ["x", ""],
  ])("reproduces %j -> %j", (previous, next) => {
    expect(apply(previous, next)).toBe(next);
  });
});
