import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import type {
  AgentCheckpointGetTurnDiffResponseMessage,
  AgentTurnCheckpoint,
} from "@getpaseo/protocol/messages";
import { useToast } from "@/contexts/toast-context";
import { useFetchQuery } from "@/data/query";
import { useHostRuntimeClient, useHostRuntimeIsConnected } from "@/runtime/host-runtime";
import { useSessionStore } from "@/stores/session-store";

function agentCheckpointsQueryKey(serverId: string, agentId: string) {
  return ["agentCheckpoints", serverId, agentId] as const;
}

function agentTurnDiffQueryKey(input: UseTurnDiffInput) {
  return [
    "agentTurnDiff",
    input.serverId,
    input.agentId,
    input.turnIndex,
    input.ignoreWhitespace,
  ] as const;
}

export function useSupportsAgentCheckpoints(serverId: string): boolean {
  return useSessionStore(
    (state) => state.sessions[serverId]?.serverInfo?.features?.agentCheckpoints === true,
  );
}

interface UseTurnCheckpointInput {
  serverId: string;
  agentId: string;
  messageId: string;
  enabled: boolean;
}

export interface TurnCheckpointResult {
  turn: AgentTurnCheckpoint | null;
  restoreFilesBlockedReason: string | null;
  isLoading: boolean;
  error: Error | null;
}

/** Resolves the checkpointed turn that the user message `messageId` started. */
export function useTurnCheckpoint(input: UseTurnCheckpointInput): TurnCheckpointResult {
  const client = useHostRuntimeClient(input.serverId);
  const isConnected = useHostRuntimeIsConnected(input.serverId);
  const query = useFetchQuery({
    queryKey: agentCheckpointsQueryKey(input.serverId, input.agentId),
    queryFn: () => {
      if (!client) throw new Error("Host disconnected");
      return client.listAgentCheckpoints(input.agentId);
    },
    enabled: input.enabled && Boolean(client) && isConnected,
    dataShape: "value",
    staleTimeMs: 0,
    refetchOnWindowFocus: false,
  });
  return useMemo(() => {
    const turn =
      query.data?.checkpoints.find((candidate) => candidate.messageId === input.messageId) ?? null;
    return {
      turn,
      restoreFilesBlockedReason: query.data?.restoreFilesBlockedReason ?? null,
      isLoading: query.isLoading,
      error: query.error,
    };
  }, [input.messageId, query.data, query.error, query.isLoading]);
}

interface UseTurnDiffInput {
  serverId: string;
  agentId: string;
  turnIndex: number | null;
  ignoreWhitespace: boolean;
}

export type TurnDiffQueryResult = UseQueryResult<
  AgentCheckpointGetTurnDiffResponseMessage["payload"],
  Error
>;

export function useTurnDiff(input: UseTurnDiffInput): TurnDiffQueryResult {
  const client = useHostRuntimeClient(input.serverId);
  const isConnected = useHostRuntimeIsConnected(input.serverId);
  const { turnIndex } = input;
  return useFetchQuery({
    queryKey: agentTurnDiffQueryKey(input),
    queryFn: () => {
      if (!client || turnIndex === null) throw new Error("Host disconnected");
      return client.getAgentTurnDiff({
        agentId: input.agentId,
        turnIndex,
        ignoreWhitespace: input.ignoreWhitespace,
      });
    },
    enabled: turnIndex !== null && Boolean(client) && isConnected,
    dataShape: "value",
    // A completed turn's checkpoints never change.
    immutableWhen: () => true,
    refetchOnWindowFocus: false,
  });
}

async function resolveTurnIndex(
  client: DaemonClient,
  agentId: string,
  messageId: string,
): Promise<number> {
  const { checkpoints } = await client.listAgentCheckpoints(agentId);
  const turn = checkpoints.find((candidate) => candidate.messageId === messageId);
  if (!turn) throw new Error("No checkpoint exists for this turn.");
  return turn.turnIndex;
}

/** Restores the agent's worktree to the checkpoint taken before `messageId` ran. */
export function useRestoreTurnFiles(input: { serverId: string; agentId: string }): {
  restoreFiles: (messageId: string) => Promise<void>;
  isPending: boolean;
} {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const client = useHostRuntimeClient(input.serverId);
  const { mutateAsync, isPending } = useMutation({
    mutationFn: async (messageId: string) => {
      if (!client) throw new Error(t("common.errors.daemonClientUnavailable"));
      const turnIndex = await resolveTurnIndex(client, input.agentId, messageId);
      await client.restoreAgentTurnFiles({ agentId: input.agentId, turnIndex });
    },
    onSuccess: () => {
      toast.show(t("panels.diff.restoreSuccess"), { variant: "success" });
      void queryClient.invalidateQueries({
        queryKey: agentCheckpointsQueryKey(input.serverId, input.agentId),
      });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t("rewind.errors.failed"));
    },
  });
  const restoreFiles = useCallback(
    async (messageId: string) => {
      await mutateAsync(messageId);
    },
    [mutateAsync],
  );
  return { restoreFiles, isPending };
}

interface UseMessageCheckpointRestoreInput {
  serverId?: string;
  agentId?: string;
  messageId?: string;
}

interface MessageCheckpointRestore {
  restore: (() => Promise<void>) | undefined;
  isPending: boolean;
}

/**
 * Returns the rewind-menu action that restores files to before `messageId`.
 * `restore` is undefined when the host or the message can't support it.
 */
export function useMessageCheckpointRestore(
  input: UseMessageCheckpointRestoreInput,
): MessageCheckpointRestore {
  const serverId = input.serverId ?? "";
  const supported = useSupportsAgentCheckpoints(serverId);
  const { restoreFiles, isPending } = useRestoreTurnFiles({
    serverId,
    agentId: input.agentId ?? "",
  });
  const { messageId } = input;
  const canRestore = supported && Boolean(input.agentId && messageId);
  const restore = useCallback(async () => {
    if (messageId) await restoreFiles(messageId);
  }, [messageId, restoreFiles]);
  return { restore: canRestore ? restore : undefined, isPending };
}
