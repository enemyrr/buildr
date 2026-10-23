import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { buildWorkspaceAttachmentScopeKey } from "@/attachments/workspace-attachments-store";
import { useToast } from "@/contexts/toast-context";
import { useCheckoutGitActionsStore } from "@/git/actions-store";
import {
  NoPullRequestPane,
  PullRequestPane,
  PullRequestPaneError,
  PullRequestPaneSkeleton,
} from "@/git/pull-request-panel";
import type { UsePrPaneDataResult } from "@/git/pull-request-panel/use-data";

import { resolvePullRequestContentState } from "./state";
export {
  useWorkspacePullRequestDiscovery,
  useHasPullRequest,
  usePullRequestAutoAdd,
} from "./discovery";
export { usePullRequestData } from "./data";

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
