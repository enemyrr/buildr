import type { GitAction, GitActions } from "@/git/policy";

export type PrStripTone = "success" | "danger" | "warning" | "merged" | "muted";

/** Translation keys under `workspace.git.prFlow.state`. */
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
  | "reviewRequired";

/** Translation keys under `workspace.git.prFlow`. */
export type PrStripActionLabel = "continue" | "archive" | "merge" | "resolve" | "fix" | "autoMerge";

export type PrStripAction =
  | {
      kind: "git";
      action: GitAction;
      label: PrStripActionLabel;
      emphasis: "filled" | "outline";
      /** Sibling actions offered in a chooser beside the button, such as the merge methods. */
      options?: GitAction[];
    }
  | {
      kind: "continue" | "fix-checks" | "resolve-conflicts";
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
  if (status.isDraft) {
    return { label: "draft", tone: "muted", actions: [] };
  }
  if (status.mergeable === "CONFLICTING") {
    return {
      label: "conflicts",
      tone: "warning",
      actions: [{ kind: "resolve-conflicts", label: "resolve", emphasis: "filled" }],
    };
  }
  if (status.checksStatus === "failure") {
    return {
      label: "checksFailed",
      tone: "danger",
      actions: [{ kind: "fix-checks", label: "fix", emphasis: "filled" }],
    };
  }
  const merge = findAction(gitActions, "merge-pr-");
  const autoMerge = findAction(gitActions, "enable-pr-auto-merge-");
  if (status.autoMergeEnabled) {
    return { label: "autoMergeEnabled", tone: "success", actions: [] };
  }
  if (status.checksStatus === "pending") {
    return {
      label: "checksRunning",
      tone: "warning",
      actions:
        autoMerge && !autoMerge.unavailableMessage
          ? [{ kind: "git", action: autoMerge, label: "autoMerge", emphasis: "outline" }]
          : [],
    };
  }
  const review = status.reviewDecision?.toLowerCase();
  if (review === "changes_requested") {
    return { label: "changesRequested", tone: "danger", actions: [] };
  }
  if (merge && !merge.unavailableMessage) {
    const options = matchingActions(gitActions, "merge-pr-").filter(
      (action) => !action.unavailableMessage,
    );
    return {
      label: "readyToMerge",
      tone: "success",
      actions: [
        {
          kind: "git",
          action: merge,
          label: "merge",
          emphasis: "filled",
          ...(options.length > 1 ? { options } : {}),
        },
      ],
    };
  }
  if (review === "review_required") {
    return { label: "reviewRequired", tone: "warning", actions: [] };
  }
  return { label: "open", tone: "success", actions: [] };
}
