import { useCallback, useMemo } from "react";
import { useShallow } from "zustand/shallow";
import { useStoreWithEqualityFn } from "zustand/traditional";
import { useSessionStore } from "@/stores/session-store";
import { useProvidersSnapshot } from "@/hooks/use-providers-snapshot";
import { mergeProviderPreferences, useFormPreferences } from "@/hooks/use-form-preferences";
import { resolveProviderDefinition } from "@/utils/provider-definitions";
import { useToast } from "@/contexts/toast-context";
import { toErrorMessage } from "@/utils/error-messages";
import { showProviderNoticeToast } from "@/utils/provider-notice-toast";
import type { AgentMode } from "@getpaseo/protocol/agent-types";
import type { AgentProviderDefinition } from "@getpaseo/protocol/provider-manifest";

export interface AgentModeControlValue {
  provider: string;
  providerDefinitions: AgentProviderDefinition[];
  modeOptions: AgentMode[];
  selectedModeId: string | null | undefined;
  onSelectMode: (modeId: string) => void;
  disabled?: boolean;
}

const EMPTY_MODES: AgentMode[] = [];

function compareAvailableModes(a: AgentMode[], b: AgentMode[]): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}

export function useLiveAgentModeControl(
  serverId: string,
  agentId: string,
): AgentModeControlValue | null {
  const slice = useSessionStore(
    useShallow((state) => {
      const agent = state.sessions[serverId]?.agents?.get(agentId);
      if (!agent) return null;
      return {
        provider: agent.provider,
        cwd: agent.cwd,
        currentModeId: agent.currentModeId,
      };
    }),
  );
  const availableModes = useStoreWithEqualityFn(
    useSessionStore,
    (state) => state.sessions[serverId]?.agents?.get(agentId)?.availableModes ?? EMPTY_MODES,
    compareAvailableModes,
  );
  const client = useSessionStore((state) => state.sessions[serverId]?.client ?? null);
  const { updatePreferences } = useFormPreferences();
  const toast = useToast();
  const { entries: snapshotEntries } = useProvidersSnapshot(serverId, { cwd: slice?.cwd });

  const providerDefinitions = useMemo<AgentProviderDefinition[]>(() => {
    if (!slice?.provider) return [];
    const definition = resolveProviderDefinition(slice.provider, snapshotEntries);
    return definition ? [definition] : [];
  }, [slice?.provider, snapshotEntries]);

  const handleSelectMode = useCallback(
    (modeId: string) => {
      if (!client || !slice?.provider) return;
      void updatePreferences((current) =>
        mergeProviderPreferences({
          preferences: current,
          provider: slice.provider,
          updates: { mode: modeId || undefined },
        }),
      ).catch((error) => {
        console.warn("[AgentModeControl] persist mode preference failed", error);
      });
      void client
        .setAgentMode(agentId, modeId)
        .then((notice) => showProviderNoticeToast(toast, notice))
        .catch((error) => {
          console.warn("[AgentModeControl] setAgentMode failed", error);
          toast.error(toErrorMessage(error));
        });
    },
    [agentId, client, slice?.provider, toast, updatePreferences],
  );

  return useMemo(() => {
    if (!slice || availableModes.length === 0) return null;
    return {
      provider: slice.provider,
      providerDefinitions,
      modeOptions: availableModes,
      selectedModeId: slice.currentModeId,
      onSelectMode: handleSelectMode,
      disabled: !client,
    };
  }, [availableModes, client, handleSelectMode, providerDefinitions, slice]);
}
