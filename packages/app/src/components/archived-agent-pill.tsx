import { Text, View } from "react-native";
import { Archive } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import type { Theme } from "@/styles/theme";

const ThemedArchive = withUnistyles(Archive);
const mutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

/** Sits above the composer of an archived agent; the next sent message unarchives it. */
export function ArchivedAgentPill() {
  const { t } = useTranslation();
  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.pill} testID="agent-archived-pill">
          <ThemedArchive size={12} uniProps={mutedColorMapping} />
          <Text style={styles.text}>{t("agentPanel.archived.hint")}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme: Theme) => ({
  container: {
    width: "100%",
    alignItems: "center",
    paddingHorizontal: theme.spacing[4],
    paddingTop: theme.spacing[2],
  },
  content: {
    width: "100%",
    maxWidth: theme.contentMaxWidth,
    alignItems: "center",
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    backgroundColor: theme.colors.surface1,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.full,
    paddingVertical: theme.spacing[1],
    paddingHorizontal: theme.spacing[3],
  },
  text: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
}));
