import type { GitAction, GitActions } from "@/git/policy";

export type PrStripTone = "success" | "danger" | "warning" | "merged" | "muted";

export type PrStripAction =
  | { kind: "git"; action: GitAction; label: string; emphasis: "filled" | "outline" }
  | {
      kind: "continue" | "fix-checks" | "resolve-conflicts";
      label: string;
      emphasis: "filled" | "outline";
    };

export interface PrStripState {
  label: string;
  tone: PrStripTone;
  actions: PrStripAction[];
}

export interface PrStripStatusInput {
  state: string;
  isMerged: boolean;
  isDraft?: boolean;
  mergeable?: string;
  checksStatus?: string;
  reviewDecision?: string | null;
  autoMergeEnabled: boolean;
}

function findAction(gitActions: GitActions, prefix: string): GitAction | null {
  const all = [gitActions.primary, ...gitActions.secondary, ...gitActions.menu];
  const matches = all.filter(
    (action): action is GitAction => action !== null && action.id.startsWith(prefix),
  );
  if (gitActions.primary && matches.includes(gitActions.primary)) return gitActions.primary;
  return matches.find((action) => !action.unavailableMessage) ?? null;
}

function archiveAction(gitActions: GitActions, emphasis: "filled" | "outline"): PrStripAction[] {
  const archive = findAction(gitActions, "archive-workspace");
  return archive ? [{ kind: "git", action: archive, label: "Archive", emphasis }] : [];
}

/** Maps a change request's status to the Explorer strip's label, tone, and actions. */
export function derivePrStripState(
  status: PrStripStatusInput,
  gitActions: GitActions,
): PrStripState {
  if (status.isMerged || status.state.toLowerCase() === "merged") {
    return {
      label: "Merged",
      tone: "merged",
      actions: [
        { kind: "continue", label: "Continue", emphasis: "outline" },
        ...archiveAction(gitActions, "filled"),
      ],
    };
  }
  if (status.state.toLowerCase() !== "open") {
    return { label: "Closed", tone: "danger", actions: archiveAction(gitActions, "outline") };
  }
  if (status.isDraft) {
    return { label: "Draft", tone: "muted", actions: [] };
  }
  if (status.mergeable === "CONFLICTING") {
    return {
      label: "Merge conflicts",
      tone: "danger",
      actions: [{ kind: "resolve-conflicts", label: "Resolve", emphasis: "filled" }],
    };
  }
  if (status.checksStatus === "failure") {
    return {
      label: "Checks failed",
      tone: "danger",
      actions: [{ kind: "fix-checks", label: "Fix", emphasis: "filled" }],
    };
  }
  const merge = findAction(gitActions, "merge-pr-");
  const autoMerge = findAction(gitActions, "enable-pr-auto-merge-");
  if (status.autoMergeEnabled) {
    return { label: "Auto-merge enabled", tone: "success", actions: [] };
  }
  if (status.checksStatus === "pending") {
    return {
      label: "Checks running",
      tone: "warning",
      actions:
        autoMerge && !autoMerge.unavailableMessage
          ? [{ kind: "git", action: autoMerge, label: "Auto-merge", emphasis: "outline" }]
          : [],
    };
  }
  const review = status.reviewDecision?.toLowerCase();
  if (review === "changes_requested") {
    return { label: "Changes requested", tone: "danger", actions: [] };
  }
  if (merge && !merge.unavailableMessage) {
    return {
      label: "Ready to merge",
      tone: "success",
      actions: [{ kind: "git", action: merge, label: "Merge", emphasis: "filled" }],
    };
  }
  if (review === "review_required") {
    return { label: "Review required", tone: "warning", actions: [] };
  }
  return { label: "Open", tone: "success", actions: [] };
}
