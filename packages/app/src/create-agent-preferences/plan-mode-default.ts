import type { AgentProviderDefinition } from "@getpaseo/protocol/provider-manifest";
import type { FormPreferences, ProviderPreferences } from "./preferences";

// Claude and OpenCode expose plan as a mode; Codex exposes it as a feature toggle.
export const PLAN_MODE_ID = "plan";
export const PLAN_MODE_FEATURE_ID = "plan_mode";

export function withPlanModeFeature(
  featureValues: Record<string, unknown>,
): Record<string, unknown> {
  return { ...featureValues, [PLAN_MODE_FEATURE_ID]: true };
}

/**
 * Overlays remembered new-chat preferences so every provider with a plan mode
 * starts in it. The overlay is never persisted.
 */
export function applyPlanModeDefault(
  preferences: FormPreferences,
  providerDefinitions: ReadonlyMap<string, AgentProviderDefinition>,
): FormPreferences {
  const providerPreferences: Record<string, ProviderPreferences> = {
    ...preferences.providerPreferences,
  };
  for (const [provider, definition] of providerDefinitions) {
    const current = providerPreferences[provider] ?? {};
    const hasPlanMode = definition.modes.some((mode) => mode.id === PLAN_MODE_ID);
    providerPreferences[provider] = {
      ...current,
      ...(hasPlanMode ? { mode: PLAN_MODE_ID } : {}),
      featureValues: withPlanModeFeature(current.featureValues ?? {}),
    };
  }
  return { ...preferences, providerPreferences };
}
