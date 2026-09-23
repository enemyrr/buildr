import { useCallback } from "react";
import { ScrollView } from "react-native";
import { GitCommitHorizontal } from "lucide-react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import invariant from "tiny-invariant";
import { CommitsList } from "@/git/commits-section/commits-section";
import { usePaneContext } from "@/panels/pane-context";
import { definePanel, type PanelPresentation } from "@/panels/panel-registry";
import { useWorkspaceDirectory } from "@/stores/session-store-hooks";
import { FOCUSED_PANE_PLACEMENT, useWorkspaceLayoutStore } from "@/stores/workspace-layout-store";
import { buildWorkspaceTabPersistenceKey } from "@/workspace-tabs/model";

const ThemedGitCommit = withUnistyles(GitCommitHorizontal);
const commitsPanelPresentation = {
  label: (t) => t("workspace.git.prFlow.tabs.commits"),
  subtitle: (t) => t("workspace.git.prFlow.tabs.commits"),
  tooltip: (t) => t("workspace.git.prFlow.tabs.commits"),
  icon: ThemedGitCommit,
} satisfies PanelPresentation;

function CommitsPanel() {
  const { serverId, workspaceId, target } = usePaneContext();
  invariant(target.kind === "commits", "CommitsPanel requires commits target");
  const cwd = useWorkspaceDirectory(serverId, workspaceId);
  const openTab = useWorkspaceLayoutStore((state) => state.openTab);
  const openCommit = useCallback(
    (sha: string) => {
      const workspaceKey = buildWorkspaceTabPersistenceKey({ serverId, workspaceId });
      if (!workspaceKey) return;
      openTab({
        workspaceKey,
        target: { kind: "commit_diff", sha },
        intent: "reveal",
        placement: FOCUSED_PANE_PLACEMENT,
      });
    },
    [openTab, serverId, workspaceId],
  );
  if (!cwd) return null;
  return (
    <ScrollView style={styles.container}>
      <CommitsList serverId={serverId} cwd={cwd} onCommitPress={openCommit} />
    </ScrollView>
  );
}

export const commitsPanelRegistration = definePanel("commits", {
  component: CommitsPanel,
  presentation: commitsPanelPresentation,
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
