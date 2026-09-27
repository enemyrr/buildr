import type { ToolCallDetail } from "@getpaseo/protocol/agent-types";
import { useFetchQuery } from "@/data/query";
import { useHostRuntimeClient, useHostRuntimeIsConnected } from "@/runtime/host-runtime";

/** Where to load a tool call's detail from when the timeline sent it with `detailOmitted`. */
export interface ToolCallDetailSource {
  serverId: string;
  agentId: string;
  callId: string;
  isRunning: boolean;
}

const RUNNING_REFETCH_INTERVAL_MS = 1000;

export function useToolCallDetail(
  source: ToolCallDetailSource | undefined,
  enabled: boolean,
): { detail: ToolCallDetail | undefined; isLoading: boolean } {
  const serverId = source?.serverId ?? "";
  const client = useHostRuntimeClient(serverId);
  const isConnected = useHostRuntimeIsConnected(serverId);
  const isRunning = source?.isRunning === true;
  const query = useFetchQuery({
    queryKey: ["agentToolCallDetail", serverId, source?.agentId, source?.callId, isRunning],
    queryFn: () => {
      if (!client || !source) throw new Error("Host disconnected");
      return client.getAgentToolCallDetail({ agentId: source.agentId, callId: source.callId });
    },
    enabled: enabled && source !== undefined && client !== null && isConnected,
    dataShape: "value",
    // A finished call never changes, so its detail is fetched once.
    immutableWhen: () => !isRunning,
    refetchInterval: isRunning ? RUNNING_REFETCH_INTERVAL_MS : false,
    refetchOnWindowFocus: false,
  });
  return { detail: query.data, isLoading: query.isLoading };
}
