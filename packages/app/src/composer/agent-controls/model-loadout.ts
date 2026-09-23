import type {
  AgentFeature,
  AgentFeatureToggle,
  AgentModelDefinition,
  ProviderSnapshotEntry,
} from "@getpaseo/protocol/agent-types";
import type { AgentProfile } from "@/agent-profiles";
import { formatThinkingOptionLabel } from "@/agent-controls/labels";
import { FAST_MODE_FEATURE_ID } from "@/agent-controls/policy";

/** One loadout slot as the picker draws it. */
export interface LoadoutRow {
  id: string;
  provider: string;
  label: string;
  /** `null` when the model has no thinking options. */
  effortLabel: string | null;
  /** False when this composer cannot run the slot's provider, e.g. a live agent of another. */
  applicable: boolean;
  active: boolean;
}

export interface LoadoutSelection {
  provider: string;
  modelId: string;
  thinkingOptionId: string | null;
}

function findModel(
  entries: readonly ProviderSnapshotEntry[],
  provider: string,
  modelId: string,
): AgentModelDefinition | null {
  const entry = entries.find((candidate) => candidate.provider === provider);
  return entry?.models?.find((model) => model.id === modelId) ?? null;
}

function resolveEffortLabel(model: AgentModelDefinition | null, thinkingOptionId: string | null) {
  const options = model?.thinkingOptions ?? [];
  const id =
    thinkingOptionId ??
    model?.defaultThinkingOptionId ??
    options.find((option) => option.isDefault)?.id ??
    null;
  if (!id) return null;
  const option = options.find((candidate) => candidate.id === id);
  return formatThinkingOptionLabel(option ?? { id });
}

/**
 * The slot the composer is on: the first slot naming the current model with the current effort,
 * else the first naming the current model at all.
 */
export function resolveActiveLoadoutSlotId(
  slots: readonly AgentProfile[],
  current: LoadoutSelection,
): string | null {
  const sameModel = slots.filter(
    (slot) => slot.provider === current.provider && slot.model?.trim() === current.modelId,
  );
  const exact = sameModel.find(
    (slot) => (slot.thinkingOptionId ?? null) === current.thinkingOptionId,
  );
  return (exact ?? sameModel[0])?.id ?? null;
}

export function buildLoadoutRows(input: {
  slots: readonly AgentProfile[];
  entries: readonly ProviderSnapshotEntry[] | undefined;
  applicableIds: ReadonlySet<string>;
  current: LoadoutSelection;
}): LoadoutRow[] {
  const entries = input.entries ?? [];
  const activeId = resolveActiveLoadoutSlotId(input.slots, input.current);
  return input.slots.map((slot) => {
    const modelId = slot.model?.trim() ?? "";
    const model = findModel(entries, slot.provider, modelId);
    return {
      id: slot.id,
      provider: slot.provider,
      label: slot.name.trim() || model?.label || modelId || slot.provider,
      effortLabel: resolveEffortLabel(model, slot.thinkingOptionId ?? null),
      applicable: input.applicableIds.has(slot.id),
      active: slot.id === activeId,
    };
  });
}

/** The next thinking option after `selectedId`, wrapping; `null` when there is nothing to cycle. */
export function resolveNextThinkingOptionId(
  options: readonly { id: string }[],
  selectedId: string | null | undefined,
): string | null {
  if (options.length < 2) return null;
  const index = options.findIndex((option) => option.id === selectedId);
  return options[(Math.max(index, 0) + 1) % options.length]?.id ?? null;
}

/** The provider's fast toggle, when it exposes one. */
export function findFastFeature(
  features: readonly AgentFeature[] | undefined,
): AgentFeatureToggle | null {
  const feature = features?.find((candidate) => candidate.id === FAST_MODE_FEATURE_ID);
  return feature?.type === "toggle" ? feature : null;
}

/** The single move that turns `before` into `after`, as `useModelLoadout().move` takes it. */
export function resolveLoadoutMove(
  before: readonly string[],
  after: readonly string[],
): { id: string; toIndex: number } | null {
  const first = after.findIndex((id, index) => id !== before[index]);
  if (first < 0) return null;
  let last = after.length - 1;
  while (last > first && after[last] === before[last]) last -= 1;
  // Dragged up: it lands at `first`. Dragged down: the item that left `first` lands at `last`.
  return after[first] === before[last]
    ? { id: after[first], toIndex: first }
    : { id: before[first], toIndex: last };
}
