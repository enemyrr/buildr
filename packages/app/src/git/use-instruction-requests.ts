import { useCallback, useRef, useState } from "react";
import { useSessionStore, selectAgentTurnPresentation } from "@/stores/session-store";
import { useHostRuntimeClient, useHostRuntimeIsConnected } from "@/runtime/host-runtime";
import { useToast } from "@/contexts/toast-context";
import { createMessageSubmissionWriter } from "@/composer/submission/writer";
import type { InstructionsRequestInput } from "@/git/pr-instructions";
import { useWorkspaceChatAgentId } from "@/git/workspace-chat-agent";
import { useActiveWorkspaceSelection } from "@/stores/navigation-active-workspace-store";

type InstructionsSender = (input: InstructionsRequestInput) => Promise<"queued" | "sent">;

/** Sends git instructions to the given agent, else the active workspace's chat agent. */
export function useInstructionRequests({
  serverId,
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
  const activeWorkspace = useActiveWorkspaceSelection();
  const workspaceAgent = useWorkspaceChatAgentId(
    serverId,
    activeWorkspace?.serverId === serverId ? activeWorkspace.workspaceId : null,
  );
  const targetAgent = agentId ?? workspaceAgent;

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

  return { send, pending, busy: !connected || pending, hasAgent: targetAgent !== null };
}
