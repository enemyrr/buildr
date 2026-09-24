import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import { getOpenAgentTabLabel } from "@getpaseo/protocol/agent-labels";
import { useEffect, useRef, useState } from "react";
import { useSessionStore } from "@/stores/session-store";
import { getOrCreateClientId } from "@/utils/client-id";
import type { WorkspaceTab } from "@/workspace-tabs/model";
import { getAgentTabsNeedingOpenLabel } from "./open-tab-labels";

const NO_PENDING_AGENT_IDS: ReadonlySet<string> = new Set();
const AGENT_ID_SEPARATOR = "\n";

function increment(value: number): number {
  return value + 1;
}

export function useOpenAgentTabLabels(input: {
  client: DaemonClient | null;
  serverId: string;
  tabs: WorkspaceTab[];
  enabled: boolean;
  /** Retained background workspaces skip the work until they are shown again. */
  isRouteFocused: boolean;
}): void {
  const enabled = input.enabled && input.isRouteFocused;
  const [label, setLabel] = useState<string | null>(null);
  // A joined string keeps agent_update commits from re-rendering the workspace unless the set changes.
  const agentIdsNeedingLabel = useSessionStore((state) => {
    if (!enabled || !label) {
      return "";
    }
    const session = state.sessions[input.serverId];
    return getAgentTabsNeedingOpenLabel({
      tabs: input.tabs,
      getAgent: (agentId) => session?.agents?.get(agentId) ?? session?.agentDetails?.get(agentId),
      label,
      pendingAgentIds: NO_PENDING_AGENT_IDS,
    }).join(AGENT_ID_SEPARATOR);
  });
  const pendingAgentIdsRef = useRef(new Set<string>());
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [retryVersion, setRetryVersion] = useState(0);

  useEffect(
    () => () => {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (!enabled || label) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const clientId = await getOrCreateClientId();
        if (!cancelled) {
          setLabel(getOpenAgentTabLabel(clientId));
        }
      } catch (error) {
        console.warn("[OpenAgentTabLabels] Failed to resolve client ID", { error });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, label]);

  useEffect(() => {
    const client = input.client;
    if (!client || !label || !agentIdsNeedingLabel) {
      return;
    }
    const agentIds = agentIdsNeedingLabel
      .split(AGENT_ID_SEPARATOR)
      .filter((agentId) => !pendingAgentIdsRef.current.has(agentId));

    void (async () => {
      for (const agentId of agentIds) {
        pendingAgentIdsRef.current.add(agentId);
        try {
          await client.updateAgent(agentId, { labels: { [label]: "true" } });
        } catch (error) {
          console.warn("[OpenAgentTabLabels] Failed to mark open subagent tab", {
            error,
            agentId,
          });
          retryTimerRef.current ??= setTimeout(() => {
            retryTimerRef.current = null;
            setRetryVersion(increment);
          }, 2_000);
        } finally {
          pendingAgentIdsRef.current.delete(agentId);
        }
      }
    })();
  }, [agentIdsNeedingLabel, input.client, label, retryVersion]);
}
