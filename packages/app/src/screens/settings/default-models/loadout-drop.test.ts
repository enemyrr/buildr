import { describe, expect, it } from "vitest";
import { resolveLoadoutDrop, type LoadoutSlotRef } from "./loadout-drop";

const slots: LoadoutSlotRef[] = [
  { id: "a", provider: "claude", model: "opus" },
  { id: "b", provider: "codex", model: "gpt-5" },
  { id: "c", provider: "claude", model: "sonnet" },
];
const haiku = { provider: "claude", model: "haiku", name: "Haiku" };

describe("resolveLoadoutDrop", () => {
  it("moves a slot to the target index", () => {
    expect(
      resolveLoadoutDrop({
        source: { kind: "slot", profileId: "c" },
        targetIndex: 0,
        slots,
        size: 5,
      }),
    ).toEqual({ kind: "move", profileId: "c", toIndex: 0 });
  });

  it("clamps a slot dropped on an empty slot to the last filled index", () => {
    expect(
      resolveLoadoutDrop({
        source: { kind: "slot", profileId: "a" },
        targetIndex: 4,
        slots,
        size: 5,
      }),
    ).toEqual({ kind: "move", profileId: "a", toIndex: 2 });
  });

  it("ignores a slot dropped on itself", () => {
    expect(
      resolveLoadoutDrop({
        source: { kind: "slot", profileId: "c" },
        targetIndex: 3,
        slots,
        size: 5,
      }),
    ).toBeNull();
  });

  it("moves a model already in the loadout instead of duplicating it", () => {
    expect(
      resolveLoadoutDrop({
        source: { kind: "model", entry: { provider: "codex", model: "gpt-5", name: "GPT-5" } },
        targetIndex: 0,
        slots,
        size: 5,
      }),
    ).toEqual({ kind: "move", profileId: "b", toIndex: 0 });
  });

  it("replaces the filled slot a new model lands on", () => {
    expect(
      resolveLoadoutDrop({
        source: { kind: "model", entry: haiku },
        targetIndex: 1,
        slots,
        size: 5,
      }),
    ).toEqual({ kind: "replace", profileId: "b", entry: haiku });
  });

  it("appends a new model dropped on an empty slot", () => {
    expect(
      resolveLoadoutDrop({
        source: { kind: "model", entry: haiku },
        targetIndex: 4,
        slots,
        size: 5,
      }),
    ).toEqual({ kind: "add", entry: haiku });
  });
});
