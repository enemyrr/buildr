import { useCallback, useMemo, useState, type ReactElement } from "react";
import { Pressable, Text, View, type PressableStateCallbackType } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { Import as ImportIcon } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import type { WorkspaceComposerAttachment } from "@/attachments/types";
import {
  buildDraftWorkspaceAttachmentScopeKey,
  useWorkspaceAttachments,
  useWorkspaceAttachmentsStore,
} from "@/attachments/workspace-attachments-store";
import { getProviderIcon } from "@/components/provider-icons";
import { MAX_CONTENT_WIDTH } from "@/constants/layout";
import { useToast } from "@/contexts/toast-context";
import { useHostFeature } from "@/runtime/host-features";
import { useWorkspaceFields } from "@/stores/session-store-hooks";
import { useSessionStore, type Agent } from "@/stores/session-store";
import { toErrorMessage } from "@/utils/error-messages";

const VISIBLE_CHIP_COUNT = 3;

function chatHistoryAttachmentId(agentId: string): string {
  return `chat_history:${agentId}`;
}

function isChatHistoryAttachment(attachment: WorkspaceComposerAttachment, id: string): boolean {
  return attachment.kind === "chat_history" && attachment.id === id;
}

function directoryLabel(directory: string | null): string | null {
  const name = directory?.split("/").findLast(Boolean);
  return name ? `/${name}` : null;
}

/**
 * The top of an empty chat tab: where the chat runs, and the workspace's other chats as chips that
 * attach their transcript to this draft. Attaching reuses the fork's chat-history attachment.
 */
export function NewChatIntro({
  serverId,
  workspaceId,
  draftId,
  onImportSession,
}: {
  serverId: string;
  workspaceId: string;
  draftId: string;
  /** Opens the import sheet; shown as the last chip, like the transcripts. */
  onImportSession?: () => void;
}): ReactElement | null {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const workspaceDirectory = useWorkspaceFields(
    serverId,
    workspaceId,
    (workspace) => workspace.workspaceDirectory,
  );
  const agents = useSessionStore((state) => state.sessions[serverId]?.agents);
  const canAttach = useHostFeature(serverId, "agentForkContext");
  const chats = useMemo(() => {
    if (!agents) return [];
    return [...agents.values()]
      .filter(
        (agent) => agent.workspaceId === workspaceId && !agent.archivedAt && !agent.parentAgentId,
      )
      .sort((a, b) => b.lastActivityAt.getTime() - a.lastActivityAt.getTime());
  }, [agents, workspaceId]);
  const directory = directoryLabel(workspaceDirectory);
  const visibleChats = expanded ? chats : chats.slice(0, VISIBLE_CHIP_COUNT);
  const hiddenCount = chats.length - visibleChats.length;
  const handleExpand = useCallback(() => setExpanded(true), []);

  const showTranscripts = canAttach && chats.length > 0;
  if (!directory && !showTranscripts && !onImportSession) return null;

  return (
    <View style={styles.container} testID="new-chat-intro">
      {directory ? (
        <Text style={styles.title}>{t("workspace.tabs.newChat.title", { path: directory })}</Text>
      ) : null}
      {showTranscripts || onImportSession ? (
        <View style={styles.chipRow}>
          {showTranscripts ? (
            <Text style={styles.label}>{t("workspace.tabs.newChat.addTranscripts")}</Text>
          ) : null}
          {showTranscripts
            ? visibleChats.map((agent) => (
                <TranscriptChip
                  key={agent.id}
                  agent={agent}
                  serverId={serverId}
                  draftId={draftId}
                />
              ))
            : null}
          {showTranscripts && hiddenCount > 0 ? (
            <Pressable accessibilityRole="button" onPress={handleExpand} style={chipStyle}>
              <Text style={styles.chipLabel}>
                {t("workspace.tabs.newChat.more", { count: hiddenCount })}
              </Text>
            </Pressable>
          ) : null}
          {onImportSession ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("importSession.title")}
              onPress={onImportSession}
              style={chipStyle}
              testID="composer-import-agent-pill"
            >
              <ImportIcon size={12} color={styles.chipIcon.color} />
              <Text style={styles.chipLabel}>{t("importSession.title")}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function chipStyle({ hovered, pressed }: PressableStateCallbackType & { hovered?: boolean }) {
  return [styles.chip, (hovered || pressed) && styles.chipHovered];
}

function attachedChipStyle({
  hovered,
  pressed,
}: PressableStateCallbackType & { hovered?: boolean }) {
  return [styles.chip, styles.chipAttached, (hovered || pressed) && styles.chipHovered];
}

function TranscriptChip({
  agent,
  serverId,
  draftId,
}: {
  agent: Agent;
  serverId: string;
  draftId: string;
}): ReactElement {
  const { t } = useTranslation();
  const toast = useToast();
  const client = useSessionStore((state) => state.sessions[serverId]?.client ?? null);
  const scopeKey = buildDraftWorkspaceAttachmentScopeKey(draftId);
  const attachments = useWorkspaceAttachments(scopeKey);
  const attachmentId = chatHistoryAttachmentId(agent.id);
  const attached = attachments.some((attachment) =>
    isChatHistoryAttachment(attachment, attachmentId),
  );
  const [pending, setPending] = useState(false);
  const ProviderIcon = getProviderIcon(agent.provider, serverId);

  const handlePress = useCallback(async () => {
    const store = useWorkspaceAttachmentsStore.getState();
    if (attached) {
      store.setWorkspaceAttachments({
        scopeKey,
        attachments: attachments.filter(
          (attachment) => !isChatHistoryAttachment(attachment, attachmentId),
        ),
      });
      return;
    }
    if (!client || pending) return;
    setPending(true);
    try {
      const payload = await client.buildAgentForkContext(agent.id);
      if (!payload.attachment) {
        throw new Error(t("workspace.tabs.newChat.attachFailed"));
      }
      const attachment: WorkspaceComposerAttachment = {
        kind: "chat_history",
        id: attachmentId,
        attachment: payload.attachment,
        source: {
          serverId,
          agentId: agent.id,
          boundaryMessageId: payload.boundaryMessageId,
          boundaryCursor: payload.boundaryCursor,
          itemCount: payload.itemCount,
        },
      };
      store.addWorkspaceAttachment({ scopeKey, attachment });
    } catch (error) {
      toast.error(toErrorMessage(error) || t("workspace.tabs.newChat.attachFailed"));
    } finally {
      setPending(false);
    }
  }, [
    agent.id,
    attached,
    attachmentId,
    attachments,
    client,
    pending,
    scopeKey,
    serverId,
    t,
    toast,
  ]);

  const handlePressSync = useCallback(() => {
    void handlePress();
  }, [handlePress]);
  const accessibilityState = useMemo(
    () => ({ selected: attached, busy: pending }),
    [attached, pending],
  );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={accessibilityState}
      disabled={pending}
      onPress={handlePressSync}
      style={attached ? attachedChipStyle : chipStyle}
      testID={`new-chat-transcript-chip-${agent.id}`}
    >
      <ProviderIcon size={12} color={styles.chipIcon.color} />
      <Text numberOfLines={1} style={attached ? styles.chipLabelAttached : styles.chipLabel}>
        {agent.title || t("agentList.fallbackTitle")}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    width: "100%",
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: "center",
    gap: theme.spacing[3],
    paddingTop: theme.spacing[4],
  },
  title: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: theme.spacing[1.5],
  },
  label: {
    color: theme.colors.foregroundExtraMuted,
    fontSize: theme.fontSize.sm,
    marginRight: theme.spacing[0.5],
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    maxWidth: 220,
    height: 24,
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.borderRadius.base,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
  },
  chipHovered: {
    backgroundColor: theme.colors.surface1,
  },
  chipAttached: {
    borderColor: theme.colors.borderAccent,
    backgroundColor: theme.colors.surface2,
  },
  chipIcon: {
    color: theme.colors.foregroundMuted,
  },
  chipLabel: {
    flexShrink: 1,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  chipLabelAttached: {
    flexShrink: 1,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
}));
