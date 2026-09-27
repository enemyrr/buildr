import { memo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";
import { FileDiff } from "lucide-react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useOptionalPaneContext } from "@/panels/pane-context";
import { useSupportsAgentCheckpoints } from "@/checkpoints/use-turn-checkpoints";
import { ICON_SIZE, type Theme } from "@/styles/theme";

const ThemedFileDiff = withUnistyles(FileDiff);
const mutedIconColor = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const hoveredIconColor = (theme: Theme) => ({ color: theme.colors.foreground });

interface TurnChangesButtonProps {
  serverId?: string;
  agentId?: string;
  messageId?: string;
}

/** Opens the checkpoint diff for the turn that this user message started. */
export const TurnChangesButton = memo(function TurnChangesButton({
  serverId,
  agentId,
  messageId,
}: TurnChangesButtonProps) {
  const { t } = useTranslation();
  const supported = useSupportsAgentCheckpoints(serverId ?? "");
  const openPreferredTarget = useOptionalPaneContext()?.openPreferredTarget;
  const handlePress = useCallback(() => {
    if (!agentId || !messageId) return;
    openPreferredTarget?.({ kind: "turn_diff", agentId, messageId }, "diffs");
  }, [agentId, messageId, openPreferredTarget]);

  const canOpen = supported && Boolean(agentId && messageId && openPreferredTarget);
  if (!canOpen) return null;

  return (
    <Tooltip delayDuration={250} enabledOnDesktop enabledOnMobile={false}>
      <TooltipTrigger asChild>
        <View style={styles.slot} collapsable={false}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("rewind.turnChanges")}
            onPress={handlePress}
            style={styles.trigger}
            testID="turn-changes-button"
          >
            {({ hovered }) => (
              <ThemedFileDiff
                size={ICON_SIZE.sm}
                uniProps={hovered ? hoveredIconColor : mutedIconColor}
              />
            )}
          </Pressable>
        </View>
      </TooltipTrigger>
      <TooltipContent side="top" align="center" offset={8}>
        <Text style={styles.tooltipText}>{t("rewind.turnChanges")}</Text>
      </TooltipContent>
    </Tooltip>
  );
});

const styles = StyleSheet.create((theme) => ({
  slot: {
    alignSelf: "center",
  },
  trigger: {
    padding: theme.spacing[1],
    alignItems: "center",
    justifyContent: "center",
  },
  tooltipText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
}));
