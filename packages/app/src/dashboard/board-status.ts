import type { PrHint } from "@/git/pr-hint";

export const WORKSPACE_BOARD_STATUSES = [
  "backlog",
  "in_progress",
  "in_review",
  "done",
  "canceled",
] as const;

export type WorkspaceBoardStatus = (typeof WORKSPACE_BOARD_STATUSES)[number];

/**
 * The board status a workspace's PR implies. Backlog is never derived: nothing about a branch
 * says "not started", so only a manual override puts a workspace there.
 */
export function deriveWorkspaceBoardStatus(
  prHint: Pick<PrHint, "state"> | null,
): WorkspaceBoardStatus {
  if (!prHint) return "in_progress";
  switch (prHint.state) {
    case "open":
      return "in_review";
    case "merged":
      return "done";
    case "closed":
      return "canceled";
  }
}

export interface BoardStatusInput {
  workspaceKey: string;
  prHint: Pick<PrHint, "state"> | null;
}

/**
 * Buckets workspaces into board columns, keeping input order within each column. An override
 * wins over the PR-derived status.
 */
export function groupWorkspacesByBoardStatus<T extends BoardStatusInput>(
  workspaces: readonly T[],
  overrides: Readonly<Record<string, WorkspaceBoardStatus>>,
): Record<WorkspaceBoardStatus, T[]> {
  const columns: Record<WorkspaceBoardStatus, T[]> = {
    backlog: [],
    in_progress: [],
    in_review: [],
    done: [],
    canceled: [],
  };
  for (const workspace of workspaces) {
    const status =
      overrides[workspace.workspaceKey] ?? deriveWorkspaceBoardStatus(workspace.prHint);
    columns[status].push(workspace);
  }
  return columns;
}
