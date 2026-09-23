import { useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { buildWorkspaceAttachmentScopeKey } from "@/attachments/workspace-attachments-store";
import { useToast } from "@/contexts/toast-context";
import { useCheckoutGitActionsStore } from "@/git/actions-store";
import {
  NoPullRequestPane,
  PullRequestPane,
  PullRequestPaneError,
  PullRequestPaneSkeleton,
  usePrPaneData,
} from "@/git/pull-request-panel";
import type { UsePrPaneDataResult } from "@/git/pull-request-panel/use-data";
import { useCheckoutPrStatusQuery } from "@/git/use-pr-status-query";

import { useSettings } from "@/hooks/use-settings";
import { useWorkspaceLayoutStoreHydrated } from "@/stores/workspace-layout-store";
import { autoOpenWorkspacePullRequest } from "@/workspace-tabs/open-supporting-view";

import { getPullRequestIdentity, resolvePullRequestContentState } from "./state";

/**
 * Whether this workspace's branch has a pull request.
 */
export function useHasPullRequest(input: {
  serverId: string;
  cwd: string | null;
  enabled: boolean;
}): boolean {
  const status = useCheckoutPrStatusQuery({
    serverId: input.serverId,
    cwd: input.cwd || "",
    enabled: input.enabled,
  }).status;
  return getPullRequestIdentity(status) !== null;
}

/** Connects desktop PR detection to the persisted layout after hydration. */
export function usePullRequestAutoAdd(input: {
  workspaceKey: string | null;
  hasPullRequest: boolean;
  enabled: boolean;
}): void {
  const hydrated = useWorkspaceLayoutStoreHydrated();
  const destination = useSettings((settings) => settings.pullRequestOpenLocation);
  useEffect(() => {
    if (hydrated && input.enabled && input.hasPullRequest) {
      autoOpenWorkspacePullRequest({ workspaceKey: input.workspaceKey, destination });
    }
  }, [hydrated, input.enabled, input.hasPullRequest, input.workspaceKey, destination]);
}

export function PullRequestContent(input: {
  serverId: string;
  workspaceId?: string | null;
  cwd: string;
  prPane: UsePrPaneDataResult;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const refresh = useCheckoutGitActionsStore((state) => state.refresh);
  const onRetry = useCallback(() => {
    void refresh({ serverId: input.serverId, cwd: input.cwd }).catch((error) => {
      toast.error(error instanceof Error ? error.message : t("workspace.git.diff.failedRefresh"));
    });
  }, [input.cwd, input.serverId, refresh, t, toast]);

  if (input.prPane.data) {
    return (
      <PullRequestPane
        serverId={input.serverId}
        cwd={input.cwd}
        data={input.prPane.data}
        activityLoading={input.prPane.activityLoading}
        workspaceAttachmentScopeKey={buildWorkspaceAttachmentScopeKey({
          serverId: input.serverId,
          workspaceId: input.workspaceId,
          cwd: input.cwd,
        })}
      />
    );
  }
  const contentState = resolvePullRequestContentState(input.prPane);
  if (contentState === "error") {
    return <PullRequestPaneError onRetry={onRetry} />;
  }
  if (contentState === "loading") {
    return <PullRequestPaneSkeleton />;
  }
  return (
    <NoPullRequestPane
      serverId={input.serverId}
      workspaceId={input.workspaceId ?? undefined}
      cwd={input.cwd}
    />
  );
}

export function usePullRequestData(input: {
  serverId: string;
  cwd: string;
  enabled?: boolean;
  timelineEnabled?: boolean;
}) {
  return usePrPaneData(input);
}
