import { useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useFetchQuery } from "@/data/query";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";

type ReadProjectConfigResult = Awaited<ReturnType<DaemonClient["readProjectConfig"]>>;

function baseBranchFromConfig(result: ReadProjectConfigResult | null | undefined): string | null {
  return (result?.ok ? result.config?.worktree?.baseBranch : null) ?? null;
}

// Reads the project base branch from paseo.json. Shares the project settings cache key so
// saving settings updates the new-workspace default.
export function useProjectBaseBranch(input: {
  serverId: string;
  sourceDirectory: string | null;
  enabled: boolean;
  getClient: () => DaemonClient;
}): { projectBaseBranch: string | null; fetchProjectBaseBranch: () => Promise<string | null> } {
  const { serverId, sourceDirectory, enabled, getClient } = input;
  const queryClient = useQueryClient();
  const queryOptions = useMemo(
    () => ({
      queryKey: ["project-config", serverId, sourceDirectory ?? ""] as const,
      queryFn: () => {
        if (!sourceDirectory) {
          throw new Error("Choose a project");
        }
        return getClient().readProjectConfig(sourceDirectory);
      },
      retry: false,
      staleTime: 15_000,
    }),
    [getClient, serverId, sourceDirectory],
  );
  const query = useFetchQuery({
    queryKey: queryOptions.queryKey,
    queryFn: queryOptions.queryFn,
    retry: false,
    dataShape: "value",
    staleTimeMs: queryOptions.staleTime,
    enabled: enabled && sourceDirectory !== null,
  });
  // A failed read falls back to the checked-out branch instead of blocking creation.
  const fetchProjectBaseBranch = useCallback(
    () =>
      queryClient
        .fetchQuery(queryOptions)
        .then(baseBranchFromConfig)
        .catch(() => null),
    [queryClient, queryOptions],
  );
  return { projectBaseBranch: baseBranchFromConfig(query.data), fetchProjectBaseBranch };
}
