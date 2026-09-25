import { useMemo } from "react";
import { useChangesPreferences } from "@/hooks/use-changes-preferences";
import { useCheckoutDiffQuery } from "@/git/use-diff-query";
import { useCheckoutStatusQuery } from "@/git/use-status-query";
import {
  useWorkingDiffComparison,
  type WorkingDiffComparison,
} from "@/git/working-diff-comparison";

export interface WorkingDiffSummary {
  fileCount: number;
  additions: number;
  deletions: number;
}

/**
 * File and line counts for the diff the Changes view shows. It builds the same query key as
 * `useWorkingDiff`, so it shares that subscription instead of opening a second one.
 */
export function useWorkingDiffSummary({
  serverId,
  workspaceId,
  cwd,
  mode,
}: {
  serverId: string;
  workspaceId?: string;
  cwd: string;
  /** Pin the comparison instead of following the Changes view's selection. */
  mode?: WorkingDiffComparison;
}): WorkingDiffSummary | null {
  const { preferences } = useChangesPreferences();
  const { status } = useCheckoutStatusQuery({ serverId, cwd });
  const gitStatus = status?.isGit ? status : null;
  const { comparison } = useWorkingDiffComparison({
    serverId,
    workspaceId,
    cwd,
    isDirty: Boolean(gitStatus?.isDirty),
  });
  const diffMode = mode ?? comparison;
  const { files, isLoading } = useCheckoutDiffQuery({
    serverId,
    cwd,
    mode: diffMode,
    baseRef: gitStatus?.baseRef ?? undefined,
    ignoreWhitespace: preferences.hideWhitespace,
    enabled: Boolean(gitStatus) && (diffMode !== "uncommitted" || gitStatus?.isDirty === true),
  });
  return useMemo(() => {
    if (diffMode === "uncommitted" && gitStatus?.isDirty === false) {
      return { fileCount: 0, additions: 0, deletions: 0 };
    }
    if (isLoading) return null;
    return summarizeDiffFiles(files);
  }, [diffMode, files, gitStatus?.isDirty, isLoading]);
}

export function summarizeDiffFiles(
  files: readonly { additions: number; deletions: number }[],
): WorkingDiffSummary {
  let additions = 0;
  let deletions = 0;
  for (const file of files) {
    additions += file.additions;
    deletions += file.deletions;
  }
  return { fileCount: files.length, additions, deletions };
}
