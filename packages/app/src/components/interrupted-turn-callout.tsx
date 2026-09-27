import { useCallback, useState } from "react";
import { View } from "react-native";
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

type ContinueState =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "failed"; message: string };

const IDLE_STATE: ContinueState = { status: "idle" };

function useIsInterrupted(serverId: string, agentId: string): boolean {
  return useSessionStore((state) => {
    const session = state.sessions[serverId];
    const agent = session?.agents.get(agentId) ?? session?.agentDetails.get(agentId);
    return Boolean(agent?.turnInterruption) && agent?.status !== "running";
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
  const [continueState, setContinueState] = useState<ContinueState>(IDLE_STATE);
  const isPending = continueState.status === "pending";

  const handleContinue = useCallback(async () => {
    if (!client || !isConnected || isPending) return;
    setContinueState({ status: "pending" });
    try {
      // The callout unmounts when the agent update clears the interruption.
      await client.continueInterruptedTurn(agentId);
    } catch (error) {
      setContinueState({ status: "failed", message: toErrorMessage(error) });
    }
  }, [client, isConnected, isPending, agentId]);

  const description = continueState.status === "failed" ? continueState.message : undefined;

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
            disabled={!isConnected || isPending}
            loading={isPending}
            testID="agent-interrupted-turn-continue"
          >
            {t("agentPanel.interrupted.continue")}
          </Button>
        </Alert>
      </View>
    </View>
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
}));
