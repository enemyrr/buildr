import { useCallback, useRef, useState } from "react";
import { useSessionStore, selectAgentTurnPresentation } from "@/stores/session-store";
import { useHostRuntimeClient, useHostRuntimeIsConnected } from "@/runtime/host-runtime";
import { useToast } from "@/contexts/toast-context";
import { createMessageSubmissionWriter } from "@/composer/submission/writer";
import {
  sendInstructionsRequest,
  uploadInstructionsAttachments,
  type InstructionsRequest,
} from "@/git/pr-instructions";
import { selectWorkspaceChatTab } from "@/git/workspace-chat-agent";
import { generateDraftId } from "@/stores/draft-keys";
import {
  navigateToWorkspace,
  useActiveWorkspaceSelection,
} from "@/stores/navigation-active-workspace-store";
import { useWorkspaceDraftSubmissionStore } from "@/stores/workspace-draft-submission-store";
import { useWorkspaceLayoutStore } from "@/stores/workspace-layout-store";
import { buildWorkspaceTabPersistenceKey, type WorkspaceTabTarget } from "@/workspace-tabs/model";

/**
 * Posts git requests as a user message in a workspace chat, Conductor style. In the open
 * workspace it targets the chat you are looking at: an agent tab gets the message, a draft is
 * submitted with it. Elsewhere (the dashboard) it opens the workspace on its newest chat.
 * With no chat, a new one starts with the message.
 */
export function useInstructionRequests({
  serverId,
  cwd,
  workspaceId,
}: {
  serverId: string;
  cwd: string;
  /** Defaults to the active workspace. */
  workspaceId?: string | null;
}) {
  const client = useHostRuntimeClient(serverId);
  const connected = useHostRuntimeIsConnected(serverId);
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const sending = useRef(false);
  const activeWorkspace = useActiveWorkspaceSelection();
  const activeWorkspaceId =
    activeWorkspace?.serverId === serverId ? activeWorkspace.workspaceId : null;
  const targetWorkspaceId = workspaceId ?? activeWorkspaceId;
  const isOpen = targetWorkspaceId !== null && targetWorkspaceId === activeWorkspaceId;

  const send = useCallback(
    async (request: InstructionsRequest) => {
      if (!client || !connected || !targetWorkspaceId || sending.current) return;
      const workspaceKey = buildWorkspaceTabPersistenceKey({
        serverId,
        workspaceId: targetWorkspaceId,
      });
      if (!workspaceKey) return;
      const tab = selectWorkspaceChatTab(
        useWorkspaceLayoutStore.getState().layoutByWorkspace[workspaceKey],
        { preferFocused: isOpen },
      );
      sending.current = true;
      setPending(true);
      try {
        let target: WorkspaceTabTarget;
        if (tab?.target.kind === "agent") {
          const agentId = tab.target.agentId;
          target = tab.target;
          await sendInstructionsRequest(
            {
              isActive: () =>
                selectAgentTurnPresentation(useSessionStore.getState().sessions[serverId], agentId)
                  .isActive,
              queue: {
                read: (id) =>
                  useSessionStore.getState().sessions[serverId]?.queuedMessages.get(id) ?? [],
                write: (updater) => useSessionStore.getState().setQueuedMessages(serverId, updater),
              },
              client,
              agentId,
              submission: createMessageSubmissionWriter(serverId),
            },
            request,
          );
        } else {
          const draftId = tab?.target.draftId ?? generateDraftId();
          const draftCwd = tab?.target.setup?.cwd ?? cwd;
          target = tab?.target ?? { kind: "draft", draftId };
          const attachments = await uploadInstructionsAttachments(client, request);
          // The mounted draft tab consumes this and submits with its own composer selection.
          useWorkspaceDraftSubmissionStore.getState().setPending({
            serverId,
            workspaceId: targetWorkspaceId,
            draftId,
            text: request.text,
            attachments,
            cwd: draftCwd,
            clientMessageId: `${draftId}:initial-message`,
            timestamp: Date.now(),
          });
        }
        if (isOpen) {
          useWorkspaceLayoutStore.getState().openTab({ workspaceKey, target, intent: "reveal" });
        } else {
          navigateToWorkspace({ serverId, workspaceId: targetWorkspaceId, target });
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not send the request.");
      } finally {
        sending.current = false;
        setPending(false);
      }
    },
    [client, connected, cwd, isOpen, serverId, targetWorkspaceId, toast],
  );

  return {
    send,
    pending,
    busy: !connected || pending,
    canSend: targetWorkspaceId !== null,
  };
}
