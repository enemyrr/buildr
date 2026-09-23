import { describe, expect, it } from "vitest";
import { findTextLinkAt, hasTextLinks, splitTextLinks } from "./text-links";

function links(text: string): string[] {
  return splitTextLinks(text)
    .filter((segment) => segment.kind === "link")
    .map((segment) => segment.text);
}

describe("splitTextLinks", () => {
  it("returns one text segment when there are no links", () => {
    expect(splitTextLinks("fix client.ts please")).toEqual([
      { kind: "text", text: "fix client.ts please", start: 0, end: 20 },
    ]);
    expect(splitTextLinks("")).toEqual([{ kind: "text", text: "", start: 0, end: 0 }]);
  });

  it("splits text around links and keeps offsets", () => {
    const text = "see https://example.com/a?b=1 now";
    expect(splitTextLinks(text)).toEqual([
      { kind: "text", text: "see ", start: 0, end: 4 },
      { kind: "link", text: "https://example.com/a?b=1", start: 4, end: 29 },
      { kind: "text", text: " now", start: 29, end: 33 },
    ]);
  });

  it("drops trailing prose punctuation", () => {
    expect(links("Open https://example.com.")).toEqual(["https://example.com"]);
    expect(links("(see https://example.com/x)")).toEqual(["https://example.com/x"]);
    expect(links("https://en.wikipedia.org/wiki/Foo_(bar), ok")).toEqual([
      "https://en.wikipedia.org/wiki/Foo_(bar)",
    ]);
  });

  it("ignores non-http schemes and bare domains", () => {
    expect(links("file:///tmp/a example.com javascript:alert(1)")).toEqual([]);
  });
});

describe("findTextLinkAt", () => {
  it("finds the link under an offset", () => {
    const text = "a https://example.com b";
    expect(findTextLinkAt(text, 5)).toBe("https://example.com");
    expect(findTextLinkAt(text, 21)).toBe("https://example.com");
    expect(findTextLinkAt(text, 0)).toBeNull();
    expect(hasTextLinks(text)).toBe(true);
  });
});
