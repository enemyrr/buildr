import { useCallback, useMemo } from "react";
import type { AgentProfile } from "@getpaseo/protocol/messages";
import { generateAgentProfileId } from "./profile-id";
import { useAgentProfiles } from "./use-agent-profiles";

/** Slots shown in the picker and bound to the slot shortcuts. */
export const MODEL_LOADOUT_SIZE = 5;

export interface ModelLoadoutEntry {
  provider: string;
  model: string;
  /** Display name; the picker labels the slot with it. */
  name: string;
  thinkingOptionId?: string;
}

export interface ModelLoadout {
  /** `null` until the daemon config has arrived. The first slot is the default. */
  slots: AgentProfile[] | null;
  isSupported: boolean;
  isFull: boolean;
  add: (entry: ModelLoadoutEntry, index?: number) => Promise<void>;
  remove: (profileId: string) => Promise<void>;
  move: (profileId: string, toIndex: number) => Promise<void>;
  /** Swaps the slot's profile for a fresh one, keeping its position. */
  replace: (profileId: string, entry: ModelLoadoutEntry) => Promise<void>;
  setThinking: (profileId: string, thinkingOptionId: string | undefined) => Promise<void>;
}

/**
 * The loadout is the head of the agent-profile list: order is slot order and
 * the first profile is the default. It reuses profiles so it needs no protocol
 * field, and every write goes through the one whole-list config patch.
 */
export function useModelLoadout(serverId: string | null): ModelLoadout {
  const { profiles, isSupported, saveProfiles } = useAgentProfiles(serverId);
  const slots = useMemo(
    () => (profiles ? profiles.slice(0, MODEL_LOADOUT_SIZE) : null),
    [profiles],
  );
  const isFull = (slots?.length ?? 0) >= MODEL_LOADOUT_SIZE;

  const add = useCallback(
    async (entry: ModelLoadoutEntry, index?: number) => {
      const current = profiles ?? [];
      const profile = buildLoadoutProfile(entry);
      const at = Math.min(index ?? MODEL_LOADOUT_SIZE, current.length, MODEL_LOADOUT_SIZE);
      await saveProfiles([...current.slice(0, at), profile, ...current.slice(at)]);
    },
    [profiles, saveProfiles],
  );

  const remove = useCallback(
    async (profileId: string) => {
      await saveProfiles((profiles ?? []).filter((profile) => profile.id !== profileId));
    },
    [profiles, saveProfiles],
  );

  const move = useCallback(
    async (profileId: string, toIndex: number) => {
      const current = profiles ?? [];
      const from = current.findIndex((profile) => profile.id === profileId);
      if (from < 0 || from === toIndex) return;
      const next = current.filter((profile) => profile.id !== profileId);
      next.splice(Math.max(0, Math.min(toIndex, next.length)), 0, current[from]);
      await saveProfiles(next);
    },
    [profiles, saveProfiles],
  );

  const replace = useCallback(
    async (profileId: string, entry: ModelLoadoutEntry) => {
      await saveProfiles(
        (profiles ?? []).map((profile) =>
          profile.id === profileId ? buildLoadoutProfile(entry) : profile,
        ),
      );
    },
    [profiles, saveProfiles],
  );

  const setThinking = useCallback(
    async (profileId: string, thinkingOptionId: string | undefined) => {
      const current = profiles ?? [];
      const index = current.findIndex((profile) => profile.id === profileId);
      if (index < 0) return;
      const { thinkingOptionId: _previous, ...rest } = current[index];
      const next = [...current];
      next[index] = thinkingOptionId ? Object.assign(rest, { thinkingOptionId }) : rest;
      await saveProfiles(next);
    },
    [profiles, saveProfiles],
  );

  return { slots, isSupported, isFull, add, remove, move, replace, setThinking };
}

function buildLoadoutProfile(entry: ModelLoadoutEntry): AgentProfile {
  return {
    id: generateAgentProfileId(),
    name: entry.name,
    provider: entry.provider,
    model: entry.model,
    ...(entry.thinkingOptionId ? { thinkingOptionId: entry.thinkingOptionId } : {}),
  };
}
