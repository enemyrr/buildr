import { describe, expect, it } from "vitest";
import { formatImageReference, splitMessageReferences } from "./references";

describe("splitMessageReferences", () => {
  it("splits text around each reference", () => {
    const references = [formatImageReference(1), formatImageReference(2), "[#370 Sleek create]"];
    expect(
      splitMessageReferences("[Image #1] [Image #2] see [#370 Sleek create]", references),
    ).toEqual([
      { kind: "reference", text: "[Image #1]", start: 0, index: 0 },
      { kind: "text", text: " ", start: 10 },
      { kind: "reference", text: "[Image #2]", start: 11, index: 1 },
      { kind: "text", text: " see ", start: 21 },
      { kind: "reference", text: "[#370 Sleek create]", start: 26, index: 2 },
    ]);
  });

  it("prefers the longer of two references at the same offset", () => {
    expect(splitMessageReferences("[Image #1] [Image #10]", ["[Image #1]", "[Image #10]"])).toEqual(
      [
        { kind: "reference", text: "[Image #1]", start: 0, index: 0 },
        { kind: "text", text: " ", start: 10 },
        { kind: "reference", text: "[Image #10]", start: 11, index: 1 },
      ],
    );
  });

  it("leaves text without references whole", () => {
    expect(splitMessageReferences("[WIP] hello", ["[Image #1]"])).toEqual([
      { kind: "text", text: "[WIP] hello", start: 0 },
    ]);
  });
});
