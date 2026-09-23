import { useCallback } from "react";
import { View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { ChevronDown, Eye, GitPullRequest } from "lucide-react-native";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { GitActionsSplitButton } from "@/git/actions-split-button";
import { GIT_ACTION_ICONS } from "@/git/action-icons";
import { useGitActions, useGitActionRunner, type GitAction } from "@/git/use-actions";
import { useCheckoutStatusQuery } from "@/git/use-status-query";
import { useCheckoutPrStatusQuery } from "@/git/use-pr-status-query";
import { useInstructionRequests } from "@/git/use-instruction-requests";
import { sendPrRequest } from "@/git/pr-instructions";
import { selectPrHintFromStatus } from "@/git/pr-hint";
import { PrBadge } from "@/components/sidebar-workspace-list";
import { sendReviewRequest } from "@/git/review-instructions";

const ThemedChevronDown = withUnistyles(ChevronDown, (theme) => ({
  color: theme.colors.foregroundMuted,
}));

interface WorkspaceActionsProps {
  serverId: string;
  cwd: string;
  agentId: string | null;
  prStripVisible: boolean;
}

const STRIP_ACTION_IDS = /^(pr$|merge-pr-|enable-pr-auto-merge-|archive-workspace$)/;

function GitMenuItem({ action }: { action: GitAction }) {
  const run = useGitActionRunner();
  const onSelect = useCallback(() => run(action), [run, action]);
  return (
    <DropdownMenuItem onSelect={onSelect} disabled={action.disabled}>
      {action.label}
    </DropdownMenuItem>
  );
}

export function WorkspaceActions({
  serverId,
  cwd,
  agentId,
  prStripVisible,
}: WorkspaceActionsProps) {
  const { gitActions, isGit } = useGitActions({ serverId, cwd, icons: GIT_ACTION_ICONS });
  const { status } = useCheckoutStatusQuery({ serverId, cwd });
  const { status: prStatus } = useCheckoutPrStatusQuery({ serverId, cwd });
  const { send: sendRequest, pending, busy } = useInstructionRequests({ serverId, cwd, agentId });
  const branch = status?.currentBranch ?? null;
  const baseRef = status?.baseRef ?? null;
  const prUrl = prStatus?.url ?? null;
  const requestPr = useCallback(
    (draft: boolean) =>
      sendRequest("PR request", (input) => sendPrRequest({ ...input, branch, baseRef, draft })),
    [sendRequest, branch, baseRef],
  );
  const requestReview = useCallback(() => {
    void sendRequest("Review request", (input) => sendReviewRequest({ ...input, baseRef, prUrl }));
  }, [sendRequest, baseRef, prUrl]);
  const createPr = useCallback(() => {
    void requestPr(false);
  }, [requestPr]);
  const createDraftPr = useCallback(() => {
    void requestPr(true);
  }, [requestPr]);
  const actions = [gitActions.primary, ...gitActions.secondary, ...gitActions.menu].filter(
    (action): action is GitAction => action !== null,
  );
  const manual = actions.find((action) => action.id === "pr");
  const run = useGitActionRunner();
  const createManually = useCallback(() => {
    if (manual) run(manual);
  }, [manual, run]);

  if (!isGit) return <GitActionsSplitButton gitActions={gitActions} />;
  if (prStripVisible && prUrl) {
    // The Explorer PR strip owns merge, continue, and archive.
    const primaryInStrip = gitActions.primary && STRIP_ACTION_IDS.test(gitActions.primary.id);
    return (
      <View style={styles.group}>
        {prStatus?.isMerged ? null : (
          <Button
            variant="outline"
            size="xs"
            leftIcon={Eye}
            onPress={requestReview}
            disabled={busy}
            loading={pending}
            testID="workspace-pr-review"
          >
            Review
          </Button>
        )}
        <GitActionsSplitButton gitActions={gitActions} menuOnly={Boolean(primaryInStrip)} />
      </View>
    );
  }
  if (prStatus?.isMerged) {
    // Archive is the policy primary once merged; Continue lives in the Explorer PR strip.
    const hint = selectPrHintFromStatus(prStatus);
    return (
      <View style={styles.group}>
        {hint ? <PrBadge hint={hint} /> : null}
        <GitActionsSplitButton gitActions={gitActions} />
      </View>
    );
  }
  if (prUrl) {
    return (
      <View style={styles.group}>
        <Button
          variant="outline"
          size="xs"
          leftIcon={Eye}
          onPress={requestReview}
          disabled={busy}
          loading={pending}
          testID="workspace-pr-review"
        >
          Review
        </Button>
        <GitActionsSplitButton gitActions={gitActions} />
      </View>
    );
  }
  return (
    <View style={styles.row}>
      <Button
        variant="outline"
        size="xs"
        style={styles.primary}
        leftIcon={GitPullRequest}
        onPress={createPr}
        disabled={busy}
        loading={pending}
        testID="workspace-create-pr"
      >
        Create PR
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger
          style={styles.caret}
          accessibilityLabel="PR options"
          testID="workspace-pr-options"
        >
          <ThemedChevronDown size={14} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" width={240}>
          <DropdownMenuItem onSelect={createDraftPr} disabled={busy}>
            Create draft PR
          </DropdownMenuItem>
          {manual ? (
            <DropdownMenuItem onSelect={createManually} disabled={manual.disabled}>
              Create PR manually
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuSeparator />
          {actions
            .filter((action) => action.id !== "pr")
            .map((action) => (
              <GitMenuItem key={action.id} action={action} />
            ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: { flexDirection: "row", alignItems: "stretch" },
  group: { flexDirection: "row", alignItems: "center", gap: theme.spacing[2] },
  primary: { borderTopRightRadius: 0, borderBottomRightRadius: 0 },
  caret: {
    justifyContent: "center",
    paddingHorizontal: 7,
    borderWidth: 1,
    borderLeftWidth: 0,
    borderColor: theme.colors.borderAccent,
    borderTopRightRadius: theme.borderRadius.md,
    borderBottomRightRadius: theme.borderRadius.md,
  },
}));
