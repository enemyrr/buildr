import { ScrollView, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import { GitStatusSection } from "./git-status-section";

/** The Checks view before a PR exists: placeholders for its title and body, then the checklist. */
export function NoPullRequestPane({
  serverId,
  workspaceId,
  cwd,
}: {
  serverId: string;
  workspaceId?: string;
  cwd: string;
}) {
  const { t } = useTranslation();
  return (
    <ScrollView style={styles.root} testID="pull-request-empty-state">
      <View style={styles.header}>
        <Text style={styles.title}>{t("workspace.git.prFlow.checks.titlePlaceholder")}</Text>
        <Text style={styles.description}>
          {t("workspace.git.prFlow.checks.descriptionPlaceholder")}
        </Text>
      </View>
      <View style={styles.divider} />
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
  header: {
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[4],
  },
  title: {
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.foregroundExtraMuted,
  },
  description: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundExtraMuted,
  },
  divider: {
    height: theme.borderWidth[1],
    backgroundColor: theme.colors.border,
  },
}));
