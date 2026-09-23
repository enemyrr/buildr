import type { ModelLoadoutEntry } from "@/agent-profiles";

export interface LoadoutSlotRef {
  id: string;
  provider: string;
  model?: string;
}

export type LoadoutDragSource =
  | { kind: "slot"; profileId: string }
  | { kind: "model"; entry: ModelLoadoutEntry };

export type LoadoutDropAction =
  | { kind: "move"; profileId: string; toIndex: number }
  | { kind: "add"; entry: ModelLoadoutEntry }
  | { kind: "replace"; profileId: string; entry: ModelLoadoutEntry };

export function slotDragId(profileId: string): string {
  return `slot:${profileId}`;
}

export function modelDragId(provider: string, modelId: string): string {
  return `model:${provider}:${modelId}`;
}

export function findLoadoutSlot(
  slots: readonly LoadoutSlotRef[],
  provider: string,
  model: string,
): LoadoutSlotRef | null {
  return slots.find((slot) => slot.provider === provider && (slot.model ?? "") === model) ?? null;
}

/**
 * What dropping `source` on slot `targetIndex` does. A model already in the
 * loadout moves rather than duplicating; a new model fills an empty slot or
 * replaces the one it lands on. Empty slots sit after the filled ones, so a
 * drop past the end lands on the last filled slot or appends.
 */
export function resolveLoadoutDrop(input: {
  source: LoadoutDragSource;
  targetIndex: number;
  slots: readonly LoadoutSlotRef[];
  size: number;
}): LoadoutDropAction | null {
  const { source, targetIndex, slots, size } = input;
  const lastFilled = slots.length - 1;

  if (source.kind === "slot") {
    const from = slots.findIndex((slot) => slot.id === source.profileId);
    const toIndex = Math.min(targetIndex, lastFilled);
    if (from < 0 || from === toIndex) return null;
    return { kind: "move", profileId: source.profileId, toIndex };
  }

  const existing = findLoadoutSlot(slots, source.entry.provider, source.entry.model);
  if (existing) {
    return resolveLoadoutDrop({
      source: { kind: "slot", profileId: existing.id },
      targetIndex,
      slots,
      size,
    });
  }
  if (targetIndex < slots.length) {
    return { kind: "replace", profileId: slots[targetIndex].id, entry: source.entry };
  }
  if (slots.length < size) return { kind: "add", entry: source.entry };
  return null;
}
