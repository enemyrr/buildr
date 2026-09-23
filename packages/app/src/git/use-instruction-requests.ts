import { useCallback, useEffect, useRef, useState } from "react";
import { useSessionStore, selectAgentTurnPresentation } from "@/stores/session-store";
import { useHostRuntimeClient, useHostRuntimeIsConnected } from "@/runtime/host-runtime";
import { useToast } from "@/contexts/toast-context";
import { createMessageSubmissionWriter } from "@/composer/submission/writer";
import type { InstructionsRequestInput } from "@/git/pr-instructions";

type InstructionsSender = (input: InstructionsRequestInput) => Promise<"queued" | "sent">;

/** Sends git instructions to the workspace's focused agent, or the last one focused. */
export function useInstructionRequests({
  serverId,
  cwd,
  agentId,
}: {
  serverId: string;
  cwd: string;
  agentId: string | null;
}) {
  const client = useHostRuntimeClient(serverId);
  const connected = useHostRuntimeIsConnected(serverId);
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const sending = useRef(false);
  const [lastAgent, setLastAgent] = useState({ serverId, cwd, agentId });
  useEffect(() => {
    if (agentId) setLastAgent({ serverId, cwd, agentId });
  }, [serverId, cwd, agentId]);
  const targetAgent =
    agentId ??
    (lastAgent.serverId === serverId && lastAgent.cwd === cwd ? lastAgent.agentId : null);

  const send = useCallback(
    async (label: string, sender: InstructionsSender) => {
      if (!client || !connected || sending.current) return;
      if (!targetAgent) {
        toast.error("Open a chat in this workspace first.");
        return;
      }
      sending.current = true;
      setPending(true);
      try {
        const outcome = await sender({
          isActive: () =>
            selectAgentTurnPresentation(useSessionStore.getState().sessions[serverId], targetAgent)
              .isActive,
          queue: {
            read: (id) =>
              useSessionStore.getState().sessions[serverId]?.queuedMessages.get(id) ?? [],
            write: (updater) => useSessionStore.getState().setQueuedMessages(serverId, updater),
          },
          client,
          agentId: targetAgent,
          submission: createMessageSubmissionWriter(serverId),
        });
        toast.show(`${label} ${outcome}.`);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : `Could not send the ${label}.`);
      } finally {
        sending.current = false;
        setPending(false);
      }
    },
    [client, connected, targetAgent, serverId, toast],
  );

  return { send, pending, busy: !connected || pending };
}
