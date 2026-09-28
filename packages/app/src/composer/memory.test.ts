import { describe, expect, it } from "vitest";
import { appendMemoryLine, resolveMemoryFileCandidates, resolveMemoryNote } from "./memory";

describe("resolveMemoryNote", () => {
  it("reads a single-line # draft as a note", () => {
    expect(resolveMemoryNote({ text: "# use pnpm, not npm", hasAttachments: false })).toBe(
      "use pnpm, not npm",
    );
    expect(resolveMemoryNote({ text: "  #always run lint  ", hasAttachments: false })).toBe(
      "always run lint",
    );
  });

  it("leaves issue references, multi-line drafts, and attachments to the agent", () => {
    expect(resolveMemoryNote({ text: "#123 fix this", hasAttachments: false })).toBeNull();
    expect(resolveMemoryNote({ text: "# Plan\n- step one", hasAttachments: false })).toBeNull();
    expect(resolveMemoryNote({ text: "# note", hasAttachments: true })).toBeNull();
    expect(resolveMemoryNote({ text: "#", hasAttachments: false })).toBeNull();
    expect(resolveMemoryNote({ text: "no hash", hasAttachments: false })).toBeNull();
  });
});

describe("resolveMemoryFileCandidates", () => {
  it("prefers the file the provider reads", () => {
    expect(resolveMemoryFileCandidates("claude")).toEqual(["CLAUDE.md", "AGENTS.md"]);
    expect(resolveMemoryFileCandidates("codex")).toEqual(["AGENTS.md", "CLAUDE.md"]);
    expect(resolveMemoryFileCandidates(null)).toEqual(["AGENTS.md", "CLAUDE.md"]);
  });
});

describe("appendMemoryLine", () => {
  it("appends a bullet on its own line", () => {
    expect(appendMemoryLine("", "a")).toBe("- a\n");
    expect(appendMemoryLine("# Rules\n", "a")).toBe("# Rules\n- a\n");
    expect(appendMemoryLine("# Rules", "a")).toBe("# Rules\n- a\n");
  });
});
