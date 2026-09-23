import { useCallback, useMemo } from "react";
import { GIT_ACTION_ICONS } from "@/git/action-icons";
import { buildForgeCompareUrl } from "@/git/forge-url";
import { sendCommitAndPushRequest, sendPrRequest } from "@/git/pr-instructions";
import { useGitActionRunner, useGitActions, type GitAction } from "@/git/use-actions";
import { useInstructionRequests } from "@/git/use-instruction-requests";
import { useCheckoutPrStatusQuery } from "@/git/use-pr-status-query";
import { useCheckoutStatusQuery } from "@/git/use-status-query";
import { openExternalUrl } from "@/utils/open-external-url";

/**
 * Create PR and Commit and push, Conductor style: ask the workspace's chat agent to do the work,
 * and fall back to the daemon's direct git actions when the workspace has no chat.
 */
export function usePrFlow({
  serverId,
  cwd,
  agentId,
}: {
  serverId: string;
  cwd: string;
  agentId: string | null;
}) {
  const { gitActions, isGit } = useGitActions({ serverId, cwd, icons: GIT_ACTION_ICONS });
  const { status } = useCheckoutStatusQuery({ serverId, cwd });
  const { status: prStatus, forge } = useCheckoutPrStatusQuery({ serverId, cwd, enabled: isGit });
  const requests = useInstructionRequests({ serverId, cwd, agentId });
  const run = useGitActionRunner();

  const actions = useMemo(
    () =>
      [gitActions.primary, ...gitActions.secondary, ...gitActions.menu].filter(
        (action): action is GitAction => action !== null,
      ),
    [gitActions],
  );
  const direct = actions.find((action) => action.id === "pr" && !action.unavailableMessage) ?? null;
  const commit = actions.find((action) => action.id === "commit") ?? null;
  const branch = status?.isGit ? status.currentBranch : null;
  const baseRef = status?.isGit ? status.baseRef : null;
  const compareUrl = useMemo(
    () => buildForgeCompareUrl(forge, { remoteUrl: status?.remoteUrl, baseRef, branch }),
    [baseRef, branch, forge, status?.remoteUrl],
  );

  const { send, hasAgent } = requests;
  const requestPr = useCallback(
    (draft: boolean) =>
      send("PR request", (input) => sendPrRequest({ ...input, branch, baseRef, draft })),
    [send, branch, baseRef],
  );
  const createPr = useCallback(() => {
    if (hasAgent) {
      void requestPr(false);
    } else if (direct) {
      run(direct);
    }
  }, [direct, hasAgent, requestPr, run]);
  const createDraftPr = useCallback(() => {
    void requestPr(true);
  }, [requestPr]);
  const createPrDirectly = useCallback(() => {
    if (direct) run(direct);
  }, [direct, run]);
  const openCompare = useCallback(() => {
    if (compareUrl) void openExternalUrl(compareUrl);
  }, [compareUrl]);
  const commitAndPush = useCallback(() => {
    if (hasAgent) {
      void send("Commit request", sendCommitAndPushRequest);
    } else if (commit) {
      run(commit);
    }
  }, [commit, hasAgent, run, send]);

  return {
    gitActions,
    actions,
    isGit,
    prStatus,
    forge,
    baseRef,
    isDirty: status?.isGit ? status.isDirty : false,
    hasAgent,
    pending: requests.pending || direct?.status === "pending",
    busy: requests.busy,
    canCreatePr: hasAgent || direct !== null,
    createPr,
    createDraftPr: hasAgent ? createDraftPr : null,
    createPrDirectly: direct ? createPrDirectly : null,
    openCompare: compareUrl ? openCompare : null,
    canCommitAndPush: hasAgent || (commit !== null && !commit.disabled),
    commitAndPush,
  };
}

export type PrFlow = ReturnType<typeof usePrFlow>;
