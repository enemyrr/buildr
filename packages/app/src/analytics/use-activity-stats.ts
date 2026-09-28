import { useTranslation } from "react-i18next";
import type { ActivityStats } from "@getpaseo/protocol/messages";
import { useFetchQuery } from "@/data/query";
import { useHostFeature } from "@/runtime/host-features";
import { useHostRuntimeClient, useHostRuntimeIsConnected } from "@/runtime/host-runtime";

export type ActivityStatsView =
  | { kind: "unavailable" }
  | { kind: "upgrade-required" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; stats: ActivityStats };

export function useActivityStats(serverId: string | null): ActivityStatsView {
  const { t } = useTranslation();
  const client = useHostRuntimeClient(serverId ?? "");
  const isConnected = useHostRuntimeIsConnected(serverId ?? "");
  const supported = useHostFeature(serverId, "activityStats");
  const canFetch = Boolean(serverId && client && isConnected && supported);

  const query = useFetchQuery({
    queryKey: ["activityStats", serverId ?? ""],
    queryFn: async () => {
      if (!client) throw new Error(t("analytics.hostUnavailable"));
      const { stats } = await client.getActivityStats();
      return stats;
    },
    enabled: canFetch,
    dataShape: "value",
    staleTimeMs: 60_000,
  });

  if (!serverId || !client || !isConnected) return { kind: "unavailable" };
  if (!supported) return { kind: "upgrade-required" };
  if (query.data) return { kind: "ready", stats: query.data };
  if (query.isError) {
    return {
      kind: "error",
      message: query.error instanceof Error ? query.error.message : String(query.error),
    };
  }
  return { kind: "loading" };
}
