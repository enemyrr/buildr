import { useCallback, useMemo, type ReactElement } from "react";
import { Text, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { History, RotateCcw } from "lucide-react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import { getProviderIcon } from "@/components/provider-icons";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { ToolbarButton } from "@/components/ui/pane-content-toolbar";
import { useToast } from "@/contexts/toast-context";
import type { AggregatedAgent } from "@/hooks/use-aggregated-agents";
import { useAgentHistory } from "@/hooks/use-agent-history";
import { useHostFeature } from "@/runtime/host-features";
import { useSessionStore } from "@/stores/session-store";
import type { Theme } from "@/styles/theme";
import { toErrorMessage } from "@/utils/error-messages";
import { navigateToAgent } from "@/utils/navigate-to-agent";
import { formatTimeAgo } from "@/utils/time";

const PARENT_AGENT_LABEL = "paseo.parent-agent-id";
const CLOSED_CHATS_MENU_WIDTH = 320;

function AgentProviderIcon({
  provider,
  serverId,
  color = "",
}: {
  provider: string;
  serverId: string;
  color?: string;
}): ReactElement {
  const Icon = getProviderIcon(provider, serverId);
  return <Icon size={14} color={color} />;
}

const ThemedAgentProviderIcon = withUnistyles(AgentProviderIcon);
const ThemedHistory = withUnistyles(History);
const ThemedRotateCcw = withUnistyles(RotateCcw);
const extraMutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundExtraMuted });
const mutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

/**
 * Copies an agent's chat as the same plain-text transcript a fork attaches. Returns undefined when
 * the host cannot build one, so the tab menu drops the entry instead of offering a dead action.
 */
export function useCopyAgentTranscript(
  serverId: string,
): ((agentId: string) => Promise<void>) | undefined {
  const { t } = useTranslation();
  const toast = useToast();
  const client = useSessionStore((state) => state.sessions[serverId]?.client ?? null);
  const supported = useHostFeature(serverId, "agentForkContext");
  const copy = useCallback(
    async (agentId: string) => {
      if (!client) return;
      try {
        const payload = await client.buildAgentForkContext(agentId);
        const text = payload.attachment?.text;
        if (!text) {
          toast.error(t("workspace.tabs.toasts.transcriptUnavailable"));
          return;
        }
        await Clipboard.setStringAsync(text);
        toast.copied(t("workspace.tabs.toasts.transcriptCopiedLabel"));
      } catch {
        toast.error(t("workspace.tabs.toasts.copyFailed"));
      }
    },
    [client, t, toast],
  );
  return supported && client ? copy : undefined;
}

/**
 * Closing a root chat tab archives the agent (docs/agent-lifecycle.md), so a workspace's closed
 * chats are its archived root agents. The list loads only while the menu is open.
 */
export function WorkspaceClosedChatsButton({
  serverId,
  workspaceId,
}: {
  serverId: string;
  workspaceId: string;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <DropdownMenu>
      <ToolbarButton
        kind="menu"
        label={t("workspace.tabs.closedChats.title")}
        testID="workspace-closed-chats-button"
      >
        <ThemedHistory size={14} uniProps={extraMutedColorMapping} />
      </ToolbarButton>
      <DropdownMenuContent
        side="bottom"
        align="end"
        offset={4}
        width={CLOSED_CHATS_MENU_WIDTH}
        testID="workspace-closed-chats-menu"
      >
        <ClosedChatsList serverId={serverId} workspaceId={workspaceId} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ClosedChatsList({
  serverId,
  workspaceId,
}: {
  serverId: string;
  workspaceId: string;
}): ReactElement {
  const { t } = useTranslation();
  const history = useAgentHistory({ serverId });
  const closedChats = useMemo(
    () =>
      history.agents.filter(
        (agent) =>
          agent.workspaceId === workspaceId &&
          agent.archivedAt !== null &&
          !agent.labels[PARENT_AGENT_LABEL],
      ),
    [history.agents, workspaceId],
  );

  if (history.isInitialLoad) {
    return <DropdownMenuItem disabled>{t("common.states.loading")}</DropdownMenuItem>;
  }
  if (closedChats.length === 0) {
    return <DropdownMenuItem disabled>{t("workspace.tabs.closedChats.empty")}</DropdownMenuItem>;
  }
  return (
    <>
      {closedChats.map((agent) => (
        <ClosedChatItem key={agent.id} agent={agent} />
      ))}
    </>
  );
}

function ClosedChatItem({ agent }: { agent: AggregatedAgent }): ReactElement {
  const { t } = useTranslation();
  const toast = useToast();
  const client = useSessionStore((state) => state.sessions[agent.serverId]?.client ?? null);
  const leading = useMemo(
    () => (
      <View style={styles.leading}>
        <ThemedAgentProviderIcon
          provider={agent.provider}
          serverId={agent.serverId}
          uniProps={mutedColorMapping}
        />
      </View>
    ),
    [agent.provider, agent.serverId],
  );
  const trailing = useMemo(
    () => (
      <View style={styles.trailing}>
        <Text style={styles.time}>{formatTimeAgo(agent.lastActivityAt)}</Text>
        <ThemedRotateCcw size={12} uniProps={mutedColorMapping} />
      </View>
    ),
    [agent.lastActivityAt],
  );
  const handleRestore = useCallback(() => {
    navigateToAgent({
      serverId: agent.serverId,
      agentId: agent.id,
      workspaceId: agent.workspaceId,
      pin: true,
    });
    // Unarchive is the same call the archived-agent callout makes.
    client?.refreshAgent(agent.id).catch((error: unknown) => {
      toast.error(toErrorMessage(error) || t("workspace.tabs.closedChats.restoreFailed"));
    });
  }, [agent.id, agent.serverId, agent.workspaceId, client, t, toast]);

  return (
    <DropdownMenuItem
      leading={leading}
      trailing={trailing}
      onSelect={handleRestore}
      testID={`workspace-closed-chat-${agent.id}`}
    >
      {agent.title || t("agentList.fallbackTitle")}
    </DropdownMenuItem>
  );
}

const styles = StyleSheet.create((theme) => ({
  leading: {
    width: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  trailing: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  time: {
    color: theme.colors.foregroundExtraMuted,
    fontSize: theme.fontSize.sm,
  },
}));
