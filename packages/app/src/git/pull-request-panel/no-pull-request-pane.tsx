import { ScrollView } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { GitStatusSection } from "./git-status-section";

/** Before a PR exists, show the checkout's next actions without empty PR metadata. */
export function NoPullRequestPane({
  serverId,
  workspaceId,
  cwd,
}: {
  serverId: string;
  workspaceId?: string;
  cwd: string;
}) {
  return (
    <ScrollView style={styles.root} testID="pull-request-empty-state">
      <GitStatusSection serverId={serverId} workspaceId={workspaceId} cwd={cwd} />
    </ScrollView>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: {
    flex: 1,
    minHeight: 0,
    backgroundColor: theme.colors.surfaceSidebar,
  },
}));
