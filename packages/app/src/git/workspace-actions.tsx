import { useCallback, useMemo } from "react";
import { View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import { ChevronDown, Eye, GitPullRequestCreateArrow } from "lucide-react-native";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { GIT_ACTION_ICONS } from "@/git/action-icons";
import { GitActionsSplitButton } from "@/git/actions-split-button";
import { PrStatusStrip } from "@/git/pr-status-strip";
import { buildReviewRequest } from "@/git/review-instructions";
import { useGitActionRunner, type GitAction } from "@/git/use-actions";
import { useInstructionRequests } from "@/git/use-instruction-requests";
import { usePrFlow, type PrFlow } from "@/git/use-pr-flow";

const ThemedChevronDown = withUnistyles(ChevronDown, (theme) => ({
  color: theme.colors.foregroundMuted,
}));

interface WorkspaceActionsProps {
  serverId: string;
  cwd: string;
  /** The Explorer shows the PR strip; otherwise the header carries it inline. */
  prStripVisible: boolean;
}

function GitMenuItem({ action }: { action: GitAction }) {
  const run = useGitActionRunner();
  const onSelect = useCallback(() => run(action), [run, action]);
  return (
    <DropdownMenuItem
      leading={action.icon}
      onSelect={onSelect}
      disabled={action.disabled}
      muted={Boolean(action.unavailableMessage)}
      status={action.status}
      pendingLabel={action.pendingLabel}
      successLabel={action.successLabel}
    >
      {action.label}
    </DropdownMenuItem>
  );
}

/** The header's git area: Create PR before a PR exists, the PR lifecycle strip after. */
export function WorkspaceActions({ serverId, cwd, prStripVisible }: WorkspaceActionsProps) {
  const { t } = useTranslation();
  const flow = usePrFlow({ serverId, cwd });
  const prUrl = flow.prStatus?.url ?? null;
  const hasLocalWork = flow.isDirty || flow.hasUnpushedCommits;
  const { canCommitAndPush, commitAndPush, busy } = flow;
  const commitAndPushItem = useMemo(
    () =>
      hasLocalWork && canCommitAndPush ? (
        <DropdownMenuItem
          leading={GIT_ACTION_ICONS.commit}
          onSelect={commitAndPush}
          disabled={busy}
          testID="workspace-commit-and-push"
        >
          {t("workspace.git.prFlow.commitAndPush")}
        </DropdownMenuItem>
      ) : null,
    [hasLocalWork, canCommitAndPush, commitAndPush, busy, t],
  );

  if (!flow.isGit) return <GitActionsSplitButton gitActions={flow.gitActions} />;
  if (!prUrl) return <CreatePrSplitButton flow={flow} />;
  return (
    <View style={styles.group}>
      {prStripVisible ? null : <PrStatusStrip serverId={serverId} cwd={cwd} variant="inline" />}
      {flow.prStatus?.isMerged || flow.prStatus?.state.toLowerCase() === "closed" ? null : (
        <ReviewButton serverId={serverId} cwd={cwd} baseRef={flow.baseRef} prUrl={prUrl} />
      )}
      <GitActionsSplitButton
        gitActions={flow.gitActions}
        menuOnly
        menuLeading={commitAndPushItem}
      />
    </View>
  );
}

function ReviewButton({
  serverId,
  cwd,
  baseRef,
  prUrl,
}: {
  serverId: string;
  cwd: string;
  baseRef: string | null;
  prUrl: string;
}) {
  const { t } = useTranslation();
  const { send, pending, busy } = useInstructionRequests({ serverId, cwd });
  const requestReview = useCallback(() => {
    void send(buildReviewRequest({ baseRef, prUrl }));
  }, [send, baseRef, prUrl]);
  return (
    <Button
      variant="ghost"
      size="xs"
      leftIcon={Eye}
      onPress={requestReview}
      disabled={busy}
      loading={pending}
      testID="workspace-pr-review"
    >
      {t("workspace.git.prFlow.review")}
    </Button>
  );
}

/** `[Create PR | v]`: the agent opens the PR; the menu has draft, direct, and manual routes. */
function CreatePrSplitButton({ flow }: { flow: PrFlow }) {
  const { t } = useTranslation();
  const otherActions = flow.actions.filter((action) => action.id !== "pr");
  return (
    <View style={styles.row}>
      <Button
        variant="outline"
        size="xs"
        style={styles.primary}
        leftIcon={GitPullRequestCreateArrow}
        onPress={flow.createPr}
        disabled={flow.busy || !flow.canCreatePr}
        loading={flow.pending}
        testID="workspace-create-pr"
      >
        {t("workspace.git.prFlow.createPr")}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger
          style={styles.caret}
          accessibilityLabel={t("workspace.git.prFlow.options")}
          testID="workspace-pr-options"
        >
          <ThemedChevronDown size={14} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" width={240}>
          {flow.createDraftPr ? (
            <DropdownMenuItem onSelect={flow.createDraftPr} disabled={flow.busy}>
              {t("workspace.git.prFlow.createDraftPr")}
            </DropdownMenuItem>
          ) : null}
          {flow.createPrDirectly && flow.canSend ? (
            <DropdownMenuItem onSelect={flow.createPrDirectly}>
              {t("workspace.git.prFlow.createPrDirectly")}
            </DropdownMenuItem>
          ) : null}
          {flow.openCompare ? (
            <DropdownMenuItem onSelect={flow.openCompare}>
              {t("workspace.git.prFlow.createPrManually")}
            </DropdownMenuItem>
          ) : null}
          {otherActions.length > 0 ? <DropdownMenuSeparator /> : null}
          {otherActions.map((action) => (
            <GitMenuItem key={action.id} action={action} />
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: { flexDirection: "row", alignItems: "stretch" },
  group: { flexDirection: "row", alignItems: "center", gap: theme.spacing[1] },
  primary: { borderTopRightRadius: 0, borderBottomRightRadius: 0 },
  caret: {
    justifyContent: "center",
    paddingHorizontal: 7,
    borderWidth: theme.borderWidth[1],
    borderLeftWidth: 0,
    borderColor: theme.colors.borderAccent,
    borderTopRightRadius: theme.borderRadius.md,
    borderBottomRightRadius: theme.borderRadius.md,
  },
}));
