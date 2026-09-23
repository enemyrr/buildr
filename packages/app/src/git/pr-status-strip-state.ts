import type { GitAction, GitActions } from "@/git/policy";

export type PrStripTone = "success" | "danger" | "warning" | "merged" | "muted";

/**
 * Translation keys under `workspace.git.prFlow.state`, plus `uncommitted` and `unpushed`, which
 * reuse the Checks view's copy under `workspace.git.prFlow.checks`.
 */
export type PrStripLabel =
  | "open"
  | "readyToMerge"
  | "draft"
  | "merged"
  | "closed"
  | "conflicts"
  | "checksFailed"
  | "checksRunning"
  | "autoMergeEnabled"
  | "changesRequested"
  | "reviewRequired"
  | "uncommitted"
  | "unpushed";

/** Translation keys under `workspace.git.prFlow`. */
export type PrStripActionLabel =
  | "continue"
  | "archive"
  | "merge"
  | "resolve"
  | "fix"
  | "autoMerge"
  | "commitAndPush";

/**
 * Why Merge is disabled, when the PR status says more than the policy.
 * Keys under `workspace.git.prFlow.blocked`.
 */
export type PrStripBlockedReason =
  | "checksFailed"
  | "checksRunning"
  | "changesRequested"
  | "reviewRequired";

export type PrStripAction =
  | {
      kind: "git";
      action: GitAction;
      label: PrStripActionLabel;
      emphasis: "filled" | "outline";
      /** Sibling actions offered in a chooser beside the button, such as the merge methods. */
      options?: GitAction[];
      /** Set when the action cannot run yet; the button renders disabled with this reason. */
      blocked?: { reason: PrStripBlockedReason | null };
    }
  | {
      kind: "continue" | "fix-checks" | "resolve-conflicts" | "commit-and-push";
      label: PrStripActionLabel;
      emphasis: "filled" | "outline";
    };

export interface PrStripState {
  label: PrStripLabel;
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
  hasUncommittedChanges?: boolean;
  hasUnpushedCommits?: boolean;
}

function matchingActions(gitActions: GitActions, prefix: string): GitAction[] {
  const all = [gitActions.primary, ...gitActions.secondary, ...gitActions.menu];
  return all.filter(
    (action): action is GitAction => action !== null && action.id.startsWith(prefix),
  );
}

function findAction(gitActions: GitActions, prefix: string): GitAction | null {
  const matches = matchingActions(gitActions, prefix);
  if (gitActions.primary && matches.includes(gitActions.primary)) return gitActions.primary;
  return matches.find((action) => !action.unavailableMessage) ?? null;
}

/** A finished PR offers the same two ways on: a fresh branch in this workspace, or archive it. */
function wrapUpActions(gitActions: GitActions): PrStripAction[] {
  const archive = findAction(gitActions, "archive-workspace");
  return [
    { kind: "continue", label: "continue", emphasis: "outline" },
    ...(archive
      ? [
          {
            kind: "git" as const,
            action: archive,
            label: "archive" as const,
            emphasis: "filled" as const,
          },
        ]
      : []),
  ];
}

/**
 * Merge shows for every open PR: filled when the policy allows it, otherwise outlined and
 * disabled with the reason. The policy's reason covers local state; `reason` names a PR
 * status the policy can't see.
 */
function mergeAction(
  gitActions: GitActions,
  reason: PrStripBlockedReason | null,
): Extract<PrStripAction, { kind: "git" }> | null {
  const all = matchingActions(gitActions, "merge-pr-");
  const ready = all.filter((action) => !action.unavailableMessage);
  const primary =
    gitActions.primary && ready.includes(gitActions.primary) ? gitActions.primary : null;
  const main = primary ?? ready[0] ?? all[0];
  if (!main) return null;
  if (ready.length === 0) {
    return { kind: "git", action: main, label: "merge", emphasis: "outline", blocked: { reason } };
  }
  return {
    kind: "git",
    action: main,
    label: "merge",
    emphasis: "filled",
    ...(ready.length > 1 ? { options: ready } : {}),
  };
}

function withMerge(
  actions: PrStripAction[],
  gitActions: GitActions,
  reason: PrStripBlockedReason | null,
): PrStripAction[] {
  const merge = mergeAction(gitActions, reason);
  return merge ? [...actions, merge] : actions;
}

/** Maps a change request's status to the Explorer strip's label, tone, and actions. */
export function derivePrStripState(
  status: PrStripStatusInput,
  gitActions: GitActions,
): PrStripState {
  if (status.isMerged || status.state.toLowerCase() === "merged") {
    return { label: "merged", tone: "merged", actions: wrapUpActions(gitActions) };
  }
  if (status.state.toLowerCase() !== "open") {
    return { label: "closed", tone: "danger", actions: wrapUpActions(gitActions) };
  }
  return deriveOpenPrStripState(status, gitActions);
}

function localWorkLabel(status: PrStripStatusInput): PrStripLabel | null {
  if (status.hasUncommittedChanges) return "uncommitted";
  if (status.hasUnpushedCommits) return "unpushed";
  return null;
}

function deriveOpenPrStripState(status: PrStripStatusInput, gitActions: GitActions): PrStripState {
  const local = localWorkLabel(status);
  const commitAndPush: PrStripAction[] = local
    ? [{ kind: "commit-and-push", label: "commitAndPush", emphasis: "filled" }]
    : [];
  if (status.isDraft) {
    return { label: "draft", tone: "muted", actions: commitAndPush };
  }
  // Local work comes first: pushing it can change conflicts and checks.
  if (local) {
    return { label: local, tone: "warning", actions: withMerge(commitAndPush, gitActions, null) };
  }
  if (status.mergeable === "CONFLICTING") {
    return {
      label: "conflicts",
      tone: "warning",
      actions: withMerge(
        [{ kind: "resolve-conflicts", label: "resolve", emphasis: "filled" }],
        gitActions,
        null,
      ),
    };
  }
  if (status.checksStatus === "failure") {
    return {
      label: "checksFailed",
      tone: "danger",
      actions: withMerge(
        [{ kind: "fix-checks", label: "fix", emphasis: "filled" }],
        gitActions,
        "checksFailed",
      ),
    };
  }
  if (status.autoMergeEnabled) {
    return { label: "autoMergeEnabled", tone: "success", actions: withMerge([], gitActions, null) };
  }
  if (status.checksStatus === "pending") {
    const autoMerge = findAction(gitActions, "enable-pr-auto-merge-");
    return {
      label: "checksRunning",
      tone: "warning",
      actions: withMerge(
        autoMerge && !autoMerge.unavailableMessage
          ? [{ kind: "git", action: autoMerge, label: "autoMerge", emphasis: "outline" }]
          : [],
        gitActions,
        "checksRunning",
      ),
    };
  }
  const review = status.reviewDecision?.toLowerCase();
  if (review === "changes_requested") {
    return {
      label: "changesRequested",
      tone: "danger",
      actions: withMerge([], gitActions, "changesRequested"),
    };
  }
  const merge = mergeAction(gitActions, review === "review_required" ? "reviewRequired" : null);
  if (merge && !merge.blocked) {
    return { label: "readyToMerge", tone: "success", actions: [merge] };
  }
  if (review === "review_required") {
    return { label: "reviewRequired", tone: "warning", actions: merge ? [merge] : [] };
  }
  return { label: "open", tone: "success", actions: merge ? [merge] : [] };
}
