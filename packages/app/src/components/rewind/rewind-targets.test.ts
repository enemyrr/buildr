import { describe, expect, it } from "vitest";
import { createUserMessage, type StreamItem } from "@/types/stream";
import { buildRewindTargets } from "./rewind-targets";

function userMessage(id: string, text: string, messageId?: string): StreamItem {
  return createUserMessage({ id, text, messageId, timestamp: new Date(0) });
}

describe("buildRewindTargets", () => {
  it("lists acknowledged prompts newest first", () => {
    const items = [
      userMessage("a", "first", "m1"),
      userMessage("b", "pending"),
      userMessage("c", "   ", "m3"),
      userMessage("d", " second ", "m4"),
    ];
    expect(buildRewindTargets(items)).toEqual([
      { messageId: "m4", prompt: "second" },
      { messageId: "m1", prompt: "first" },
    ]);
  });
});
