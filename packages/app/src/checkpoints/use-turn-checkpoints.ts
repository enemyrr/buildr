import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import {
  RESTORE_FILES_BLOCKED_REASONS,
  type AgentCheckpointGetTurnDiffResponseMessage,
  type AgentTurnCheckpoint,
  type RestoreFilesBlockedReason,
} from "@getpaseo/protocol/messages";
import { useToast } from "@/contexts/toast-context";
import { confirmDialog } from "@/utils/confirm-dialog";
import { useFetchQuery } from "@/data/query";
import { useHostRuntimeClient, useHostRuntimeIsConnected } from "@/runtime/host-runtime";
import { useSessionStore } from "@/stores/session-store";
import { toErrorMessage } from "@/utils/error-messages";

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

interface UseAgentCheckpointsInput {
  serverId: string;
  agentId: string;
  enabled: boolean;
}

function useAgentCheckpoints(input: UseAgentCheckpointsInput) {
  const client = useHostRuntimeClient(input.serverId);
  const isConnected = useHostRuntimeIsConnected(input.serverId);
  return useFetchQuery({
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
}

function isKnownBlockedReason(reason: string): reason is RestoreFilesBlockedReason {
  return (RESTORE_FILES_BLOCKED_REASONS as readonly string[]).includes(reason);
}

/** Maps the daemon's restore-blocked code to display text, or null when restore is allowed. */
function useRestoreFilesBlockedMessage(reason: string | undefined): string | null {
  const { t } = useTranslation();
  if (reason === undefined) return null;
  if (!isKnownBlockedReason(reason)) return t("panels.diff.restoreBlocked.unknown");
  switch (reason) {
    case "not_worktree":
      return t("panels.diff.restoreBlocked.notWorktree");
    case "shared_worktree":
      return t("panels.diff.restoreBlocked.sharedWorktree");
  }
}

/**
 * Returns why the daemon refuses file restore for the agent, as display text,
 * or null when restore is allowed.
 */
export function useRestoreFilesBlockedReason(input: UseAgentCheckpointsInput): string | null {
  const query = useAgentCheckpoints(input);
  return useRestoreFilesBlockedMessage(query.data?.restoreFilesBlockedReason);
}

interface UseTurnCheckpointInput extends UseAgentCheckpointsInput {
  messageId: string;
}

export interface TurnCheckpointResult {
  turn: AgentTurnCheckpoint | null;
  restoreFilesBlockedReason: string | null;
  isLoading: boolean;
  error: Error | null;
}

/** Resolves the checkpointed turn that the user message `messageId` started. */
export function useTurnCheckpoint(input: UseTurnCheckpointInput): TurnCheckpointResult {
  const query = useAgentCheckpoints(input);
  const restoreFilesBlockedReason = useRestoreFilesBlockedMessage(
    query.data?.restoreFilesBlockedReason,
  );
  return useMemo(() => {
    const turn =
      query.data?.checkpoints.find((candidate) => candidate.messageId === input.messageId) ?? null;
    return {
      turn,
      restoreFilesBlockedReason,
      isLoading: query.isLoading,
      error: query.error,
    };
  }, [input.messageId, query.data, query.error, query.isLoading, restoreFilesBlockedReason]);
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

async function resolveTurnIndex(input: {
  client: DaemonClient;
  agentId: string;
  messageId: string;
  missingMessage: string;
}): Promise<number> {
  const { checkpoints } = await input.client.listAgentCheckpoints(input.agentId);
  const turn = checkpoints.find((candidate) => candidate.messageId === input.messageId);
  if (!turn) throw new Error(input.missingMessage);
  return turn.turnIndex;
}

export interface RestoreTurnFiles {
  /** Asks for confirmation, then restores files to before `messageId` ran. */
  confirmAndRestore: (messageId: string) => Promise<void>;
  isPending: boolean;
}

/**
 * Owns one restore mutation for an agent. Mount it once per surface, not per
 * timeline row.
 */
export function useRestoreTurnFiles(input: {
  serverId: string;
  agentId: string;
}): RestoreTurnFiles {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const client = useHostRuntimeClient(input.serverId);
  const { mutateAsync, isPending } = useMutation({
    mutationFn: async (messageId: string) => {
      if (!client) throw new Error(t("common.errors.daemonClientUnavailable"));
      const turnIndex = await resolveTurnIndex({
        client,
        agentId: input.agentId,
        messageId,
        missingMessage: t("panels.diff.turnMissing"),
      });
      await client.restoreAgentTurnFiles({ agentId: input.agentId, turnIndex });
    },
    onSuccess: () => {
      toast.show(t("panels.diff.restoreSuccess"), { variant: "success" });
      void queryClient.invalidateQueries({
        queryKey: agentCheckpointsQueryKey(input.serverId, input.agentId),
      });
    },
    onError: (error) => {
      toast.error(toErrorMessage(error) || t("panels.diff.restoreFailed"));
    },
  });
  const confirmAndRestore = useCallback(
    async (messageId: string) => {
      const confirmed = await confirmDialog({
        title: t("panels.diff.restoreTitle"),
        message: t("panels.diff.restoreMessage"),
        confirmLabel: t("panels.diff.restoreFiles"),
        destructive: true,
      });
      if (!confirmed) return;
      await mutateAsync(messageId);
    },
    [mutateAsync, t],
  );
  return { confirmAndRestore, isPending };
}
