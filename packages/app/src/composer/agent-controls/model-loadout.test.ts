import { describe, expect, it } from "vitest";
import type { AgentFeature, ProviderSnapshotEntry } from "@getpaseo/protocol/agent-types";
import type { AgentProfile } from "@/agent-profiles";
import {
  buildLoadoutRows,
  findFastFeature,
  resolveActiveLoadoutSlotId,
  resolveLoadoutMove,
  resolveNextThinkingOptionId,
} from "./model-loadout";

const entries: ProviderSnapshotEntry[] = [
  {
    provider: "claude",
    status: "ready",
    enabled: true,
    models: [
      {
        provider: "claude",
        id: "opus",
        label: "Opus",
        thinkingOptions: [
          { id: "low", label: "Low" },
          { id: "medium", label: "Medium", isDefault: true },
        ],
      },
      { provider: "claude", id: "haiku", label: "Haiku" },
    ],
  },
];

const slots: AgentProfile[] = [
  { id: "a", name: "Opus", provider: "claude", model: "opus", thinkingOptionId: "low" },
  { id: "b", name: "", provider: "claude", model: "opus" },
  { id: "c", name: "Haiku", provider: "claude", model: "haiku" },
  { id: "d", name: "GPT", provider: "codex", model: "gpt" },
];

describe("buildLoadoutRows", () => {
  it("labels slots from the catalog and marks the exact match active", () => {
    const rows = buildLoadoutRows({
      slots,
      entries,
      applicableIds: new Set(["a", "b", "c"]),
      current: { provider: "claude", modelId: "opus", thinkingOptionId: null },
    });
    expect(rows.map((row) => [row.label, row.effortLabel, row.applicable, row.active])).toEqual([
      ["Opus", "Low", true, false],
      ["Opus", "Medium", true, true],
      ["Haiku", null, true, false],
      ["GPT", null, false, false],
    ]);
  });
});

describe("resolveActiveLoadoutSlotId", () => {
  it("falls back to the first slot on the same model when no effort matches", () => {
    expect(
      resolveActiveLoadoutSlotId(slots, {
        provider: "claude",
        modelId: "opus",
        thinkingOptionId: "high",
      }),
    ).toBe("a");
  });

  it("returns null when no slot names the current model", () => {
    expect(
      resolveActiveLoadoutSlotId(slots, {
        provider: "claude",
        modelId: "x",
        thinkingOptionId: null,
      }),
    ).toBeNull();
  });
});

describe("resolveNextThinkingOptionId", () => {
  const options = [{ id: "low" }, { id: "medium" }, { id: "high" }];

  it("advances and wraps", () => {
    expect(resolveNextThinkingOptionId(options, "medium")).toBe("high");
    expect(resolveNextThinkingOptionId(options, "high")).toBe("low");
  });

  it("does nothing with fewer than two options", () => {
    expect(resolveNextThinkingOptionId([{ id: "max" }], "max")).toBeNull();
  });
});

describe("findFastFeature", () => {
  it("finds only the fast toggle", () => {
    const features: AgentFeature[] = [
      { type: "toggle", id: "plan_mode", label: "Plan", value: false },
      { type: "toggle", id: "fast_mode", label: "Fast", value: true },
    ];
    expect(findFastFeature(features)?.id).toBe("fast_mode");
    expect(findFastFeature(features.slice(0, 1))).toBeNull();
  });
});

describe("resolveLoadoutMove", () => {
  it("resolves a move up and a move down", () => {
    expect(resolveLoadoutMove(["a", "b", "c", "d"], ["c", "a", "b", "d"])).toEqual({
      id: "c",
      toIndex: 0,
    });
    expect(resolveLoadoutMove(["a", "b", "c", "d"], ["b", "c", "a", "d"])).toEqual({
      id: "a",
      toIndex: 2,
    });
    expect(resolveLoadoutMove(["a", "b"], ["a", "b"])).toBeNull();
  });
});
