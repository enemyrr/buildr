import type { ProviderSnapshotEntry } from "@getpaseo/protocol/agent-types";
import type { ModelLoadoutEntry } from "@/agent-profiles";

interface DefaultLoadoutModel {
  provider: string;
  model: string;
  thinkingOptionId: string;
}

/** The loadout a fresh install starts with, in slot order. */
export const DEFAULT_LOADOUT_MODELS: readonly DefaultLoadoutModel[] = [
  { provider: "claude", model: "claude-opus-5-5", thinkingOptionId: "high" },
  { provider: "claude", model: "claude-fable-5-1", thinkingOptionId: "high" },
  { provider: "codex", model: "gpt-6-astra", thinkingOptionId: "high" },
  { provider: "codex", model: "gpt-6-sol", thinkingOptionId: "high" },
];

/**
 * The default models this host can run, or `null` while a provider they need is still loading.
 * A model the host doesn't list is left out rather than seeded as a dead slot.
 */
export function resolveDefaultLoadout(
  entries: readonly ProviderSnapshotEntry[] | undefined,
): ModelLoadoutEntry[] | null {
  if (!entries) return null;
  const resolved: ModelLoadoutEntry[] = [];
  for (const candidate of DEFAULT_LOADOUT_MODELS) {
    const entry = entries.find((item) => item.provider === candidate.provider);
    if (entry?.status === "loading") return null;
    if (!entry?.enabled || entry.status !== "ready") continue;
    const model = entry.models?.find((item) => item.id === candidate.model);
    if (!model) continue;
    const hasThinking = model.thinkingOptions?.some(
      (option) => option.id === candidate.thinkingOptionId,
    );
    resolved.push({
      provider: candidate.provider,
      model: model.id,
      name: model.label,
      ...(hasThinking ? { thinkingOptionId: candidate.thinkingOptionId } : {}),
    });
  }
  return resolved;
}
