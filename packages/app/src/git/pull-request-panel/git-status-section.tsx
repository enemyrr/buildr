import { useCallback, useState, type ReactNode } from "react";
import { Text, View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import { Circle, CircleCheck } from "lucide-react-native";
import { Button } from "@/components/ui/button";
import { getForgePresentation } from "@/git/forge";
import { usePrFlow, type PrFlow } from "@/git/use-pr-flow";
import { useWorkingDiffSummary } from "@/git/use-working-diff-summary";
import { Section, foregroundMutedColorMapping, successColorMapping } from "./section-kit";

const ThemedCircle = withUnistyles(Circle);
const ThemedCircleCheck = withUnistyles(CircleCheck);

const PENDING_ICON = <ThemedCircle size={14} uniProps={foregroundMutedColorMapping} />;
const DONE_ICON = <ThemedCircleCheck size={14} uniProps={successColorMapping} />;

/**
 * The Checks view's checklist toward a mergeable PR: is there a PR, is everything committed and
 * pushed. Each open item carries the action that closes it.
 */
export function GitStatusSection({
  serverId,
  workspaceId,
  cwd,
}: {
  serverId: string;
  workspaceId?: string;
  cwd: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(true);
  const toggle = useCallback(() => setOpen((value) => !value), []);
  const flow = usePrFlow({ serverId, cwd, workspaceId });
  const uncommitted = useWorkingDiffSummary({ serverId, workspaceId, cwd, mode: "uncommitted" });
  const pr = flow.prStatus;
  const prRef = pr?.number ? `${getForgePresentation(flow.forge).numberPrefix}${pr.number}` : null;

  if (!flow.isGit) return null;
  const localWorkLabel = getLocalWorkLabel(t, {
    isDirty: flow.isDirty,
    hasUnpushedCommits: flow.hasUnpushedCommits,
    uncommittedCount: uncommitted?.fileCount ?? 0,
  });
  return (
    <Section
      title={t("workspace.git.prFlow.checks.gitStatus")}
      open={open}
      onToggle={toggle}
      summary={null}
    >
      {pr?.url && prRef ? (
        <ChecklistRow done label={t(prStateKey(pr), { ref: prRef })} />
      ) : (
        <ChecklistRow done={false} label={t("workspace.git.prFlow.checks.noPr")}>
          <Button
            variant="ghost"
            size="xs"
            onPress={flow.createPr}
            disabled={flow.busy || !flow.canCreatePr}
            loading={flow.pending}
            testID="git-status-create-pr"
          >
            {t("workspace.git.prFlow.createPr")}
          </Button>
        </ChecklistRow>
      )}
      {localWorkLabel ? (
        <ChecklistRow done={false} label={localWorkLabel}>
          <CommitAndPushButton flow={flow} />
        </ChecklistRow>
      ) : (
        <ChecklistRow done label={t("workspace.git.prFlow.checks.clean")} />
      )}
    </Section>
  );
}

function getLocalWorkLabel(
  t: (key: string, options?: Record<string, unknown>) => string,
  work: { isDirty: boolean; hasUnpushedCommits: boolean; uncommittedCount: number },
): string | null {
  if (work.isDirty && work.uncommittedCount > 0) {
    return t("workspace.git.prFlow.checks.uncommitted", { count: work.uncommittedCount });
  }
  if (work.isDirty) return t("workspace.git.prFlow.checks.uncommittedUnknown");
  if (work.hasUnpushedCommits) return t("workspace.git.prFlow.checks.unpushed");
  return null;
}

function CommitAndPushButton({ flow }: { flow: PrFlow }) {
  const { t } = useTranslation();
  return (
    <Button
      variant="ghost"
      size="xs"
      onPress={flow.commitAndPush}
      disabled={flow.busy || !flow.canCommitAndPush}
      testID="git-status-commit-and-push"
    >
      {t("workspace.git.prFlow.commitAndPush")}
    </Button>
  );
}

function prStateKey(pr: { state: string; isMerged: boolean; isDraft?: boolean }) {
  if (pr.isMerged || pr.state.toLowerCase() === "merged") {
    return "workspace.git.prFlow.checks.prMerged";
  }
  if (pr.state.toLowerCase() !== "open") return "workspace.git.prFlow.checks.prClosed";
  return pr.isDraft ? "workspace.git.prFlow.checks.prDraft" : "workspace.git.prFlow.checks.prOpen";
}

function ChecklistRow({
  done,
  label,
  children,
}: {
  done: boolean;
  label: string;
  children?: ReactNode;
}) {
  return (
    <View style={styles.row}>
      {done ? DONE_ICON : PENDING_ICON}
      <Text style={done ? styles.label : styles.labelPending} numberOfLines={1}>
        {label}
      </Text>
      {children ? <View style={styles.action}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    minHeight: 28,
    paddingLeft: theme.spacing[3],
    paddingRight: theme.spacing[2],
  },
  label: {
    flex: 1,
    minWidth: 0,
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundMuted,
  },
  labelPending: {
    flex: 1,
    minWidth: 0,
    fontSize: theme.fontSize.sm,
    color: theme.colors.foreground,
  },
  action: {
    flexShrink: 0,
  },
}));
