import { describe, expect, it } from "vitest";
import type { ProviderSnapshotEntry } from "@getpaseo/protocol/agent-types";
import { resolveDefaultLoadout } from "./default-loadout";

const high = [
  { id: "medium", label: "Medium" },
  { id: "high", label: "High" },
];

function claude(overrides: Partial<ProviderSnapshotEntry> = {}): ProviderSnapshotEntry {
  return {
    provider: "claude",
    status: "ready",
    enabled: true,
    models: [
      { provider: "claude", id: "claude-opus-5-5", label: "Opus 5.5", thinkingOptions: high },
      { provider: "claude", id: "claude-fable-5-1", label: "Fable 5.1", thinkingOptions: high },
    ],
    ...overrides,
  };
}

function codex(overrides: Partial<ProviderSnapshotEntry> = {}): ProviderSnapshotEntry {
  return {
    provider: "codex",
    status: "ready",
    enabled: true,
    models: [
      { provider: "codex", id: "gpt-6-astra", label: "GPT-6 Astra", thinkingOptions: high },
      { provider: "codex", id: "gpt-6-sol", label: "GPT-6 Sol" },
    ],
    ...overrides,
  };
}

describe("resolveDefaultLoadout", () => {
  it("returns the defaults in slot order with High thinking where offered", () => {
    expect(resolveDefaultLoadout([codex(), claude()])).toEqual([
      { provider: "claude", model: "claude-opus-5-5", name: "Opus 5.5", thinkingOptionId: "high" },
      {
        provider: "claude",
        model: "claude-fable-5-1",
        name: "Fable 5.1",
        thinkingOptionId: "high",
      },
      { provider: "codex", model: "gpt-6-astra", name: "GPT-6 Astra", thinkingOptionId: "high" },
      { provider: "codex", model: "gpt-6-sol", name: "GPT-6 Sol" },
    ]);
  });

  it("waits while a needed provider is loading", () => {
    expect(resolveDefaultLoadout([claude(), codex({ status: "loading" })])).toBeNull();
    expect(resolveDefaultLoadout(undefined)).toBeNull();
  });

  it("skips providers the host can't run", () => {
    const loadout = resolveDefaultLoadout([claude(), codex({ enabled: false })]);
    expect(loadout?.map((entry) => entry.model)).toEqual(["claude-opus-5-5", "claude-fable-5-1"]);
    expect(resolveDefaultLoadout([claude({ status: "unavailable" })])).toEqual([]);
  });
});
