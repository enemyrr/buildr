import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useOptionalPaneContext } from "@/panels/pane-context";
import { useRestoreTurnFiles, useSupportsAgentCheckpoints } from "./use-turn-checkpoints";

export interface TurnCheckpointActions {
  restoreFilesBeforeMessage: (messageId: string) => Promise<void>;
  openTurnChanges: (messageId: string) => void;
}

const TurnCheckpointActionsContext = createContext<TurnCheckpointActions | null>(null);

interface TurnCheckpointActionsProviderProps {
  serverId: string;
  agentId: string;
  children: ReactNode;
}

/**
 * Hoists the checkpoint actions for one agent pane, so timeline rows read a
 * stable context value instead of each owning a mutation and a store
 * subscription. The value is null when the host lacks turn checkpoints.
 */
export function TurnCheckpointActionsProvider({
  serverId,
  agentId,
  children,
}: TurnCheckpointActionsProviderProps) {
  const supported = useSupportsAgentCheckpoints(serverId);
  const { confirmAndRestore } = useRestoreTurnFiles({ serverId, agentId });
  const openPreferredTarget = useOptionalPaneContext()?.openPreferredTarget;
  const value = useMemo<TurnCheckpointActions | null>(() => {
    if (!supported || !openPreferredTarget) return null;
    return {
      restoreFilesBeforeMessage: confirmAndRestore,
      openTurnChanges: (messageId) =>
        openPreferredTarget({ kind: "turn_diff", agentId, messageId }, "diffs"),
    };
  }, [agentId, confirmAndRestore, openPreferredTarget, supported]);
  return (
    <TurnCheckpointActionsContext.Provider value={value}>
      {children}
    </TurnCheckpointActionsContext.Provider>
  );
}

export interface MessageTurnCheckpointActions {
  restoreFiles: () => Promise<void>;
  openChanges: () => void;
}

/** Binds the pane's checkpoint actions to one user message, or null when unavailable. */
export function useMessageTurnCheckpointActions(
  messageId: string | undefined,
): MessageTurnCheckpointActions | null {
  const actions = useContext(TurnCheckpointActionsContext);
  return useMemo(() => {
    if (!actions || !messageId) return null;
    return {
      restoreFiles: () => actions.restoreFilesBeforeMessage(messageId),
      openChanges: () => actions.openTurnChanges(messageId),
    };
  }, [actions, messageId]);
}
