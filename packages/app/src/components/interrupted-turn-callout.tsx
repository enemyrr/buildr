import { useCallback, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import { MAX_CONTENT_WIDTH } from "@/constants/layout";
import { useHostRuntimeClient, useHostRuntimeIsConnected } from "@/runtime/host-runtime";
import { useHostFeature } from "@/runtime/host-features";
import { useSessionStore } from "@/stores/session-store";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { Theme } from "@/styles/theme";
import { toErrorMessage } from "@/utils/error-messages";

interface InterruptedTurnCalloutProps {
  serverId: string;
  agentId: string;
}

type InterruptedTurnAction = "continue" | "dismiss";

type ActionState =
  | { status: "idle" }
  | { status: "pending"; action: InterruptedTurnAction }
  | { status: "failed"; message: string };

const IDLE_STATE: ActionState = { status: "idle" };

function useIsInterrupted(serverId: string, agentId: string): boolean {
  return useSessionStore((state) => {
    const session = state.sessions[serverId];
    const agent = session?.agents.get(agentId) ?? session?.agentDetails.get(agentId);
    return Boolean(agent?.interruptedTurn) && agent?.status !== "running";
  });
}

/** Offers to resubmit a turn that a daemon restart interrupted. */
export function InterruptedTurnCallout({ serverId, agentId }: InterruptedTurnCalloutProps) {
  const supported = useHostFeature(serverId, "interruptedTurnContinue");
  const isInterrupted = useIsInterrupted(serverId, agentId);
  if (!supported || !isInterrupted) return null;
  return <InterruptedTurnAlert serverId={serverId} agentId={agentId} />;
}

function InterruptedTurnAlert({ serverId, agentId }: InterruptedTurnCalloutProps) {
  const { t } = useTranslation();
  const client = useHostRuntimeClient(serverId);
  const isConnected = useHostRuntimeIsConnected(serverId);
  const [actionState, setActionState] = useState<ActionState>(IDLE_STATE);
  const isPending = actionState.status === "pending";
  const isUnavailable = !client || !isConnected || isPending;

  const runAction = useCallback(
    async (action: InterruptedTurnAction) => {
      if (!client || !isConnected || isPending) return;
      setActionState({ status: "pending", action });
      try {
        // The callout unmounts when the agent update clears the interruption.
        if (action === "continue") await client.continueInterruptedTurn(agentId);
        else await client.dismissInterruptedTurn(agentId);
      } catch (error) {
        setActionState({ status: "failed", message: toErrorMessage(error) });
      }
    },
    [client, isConnected, isPending, agentId],
  );
  const handleContinue = useCallback(() => runAction("continue"), [runAction]);
  const handleDismiss = useCallback(() => runAction("dismiss"), [runAction]);

  const pendingAction = actionState.status === "pending" ? actionState.action : null;
  const errorMessage = actionState.status === "failed" ? actionState.message : null;
  const descriptionText = t("agentPanel.interrupted.description");
  const description = useMemo(
    () => <InterruptedTurnDescription text={descriptionText} error={errorMessage} />,
    [descriptionText, errorMessage],
  );

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Alert
          variant="warning"
          title={t("agentPanel.interrupted.callout")}
          description={description}
          testID="agent-interrupted-turn-callout"
        >
          <Button
            variant="outline"
            size="sm"
            onPress={handleContinue}
            disabled={isUnavailable}
            loading={pendingAction === "continue"}
            testID="agent-interrupted-turn-continue"
          >
            {t("agentPanel.interrupted.continue")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onPress={handleDismiss}
            disabled={isUnavailable}
            loading={pendingAction === "dismiss"}
            testID="agent-interrupted-turn-dismiss"
          >
            {t("agentPanel.interrupted.dismiss")}
          </Button>
        </Alert>
      </View>
    </View>
  );
}

function InterruptedTurnDescription({ text, error }: { text: string; error: string | null }) {
  return (
    <>
      <Text style={styles.description}>{text}</Text>
      {error ? (
        <Text style={styles.error} testID="agent-interrupted-turn-error">
          {error}
        </Text>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create((theme: Theme) => ({
  container: {
    width: "100%",
    alignItems: "center",
    paddingHorizontal: theme.spacing[4],
    paddingTop: theme.spacing[2],
  },
  content: {
    width: "100%",
    maxWidth: MAX_CONTENT_WIDTH,
  },
  // Matches the Alert primitive's own description text.
  description: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  error: {
    color: theme.colors.palette.red[300],
    fontSize: theme.fontSize.sm,
  },
}));
