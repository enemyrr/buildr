import { View, Pressable } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { RefreshCcw, Square, X } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import type { Theme } from "@/styles/theme";
import type { DictationStatus } from "@/hooks/use-dictation";
import { VolumeMeter } from "./volume-meter";

interface DictationInlineControlsProps {
  visible: boolean;
  volume: number;
  isProcessing: boolean;
  status: DictationStatus;
  iconSize: number;
  onCancel: () => void;
  onStop: () => void;
  onRetry: () => void;
  onDiscard: () => void;
}

/** Compact dictation controls that sit in the composer toolbar in place of the mic button. */
export function DictationInlineControls({
  visible,
  volume,
  isProcessing,
  status,
  iconSize,
  onCancel,
  onStop,
  onRetry,
  onDiscard,
}: DictationInlineControlsProps) {
  const { t } = useTranslation();
  const isFailed = status === "failed";

  if (!visible) return null;
  if (isFailed) {
    return (
      <View style={styles.container}>
        <Pressable
          onPress={onDiscard}
          accessibilityRole="button"
          accessibilityLabel={t("message.dictation.cancel")}
          style={iconButtonStyle}
        >
          <ThemedX size={iconSize} uniProps={mutedMapping} />
        </Pressable>
        <Pressable
          onPress={onRetry}
          accessibilityRole="button"
          accessibilityLabel={t("message.dictation.retry")}
          style={iconButtonStyle}
        >
          <ThemedRefreshCcw size={iconSize} uniProps={destructiveMapping} />
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Pressable
        onPress={onCancel}
        disabled={isProcessing}
        accessibilityRole="button"
        accessibilityLabel={t("message.dictation.cancel")}
        style={iconButtonStyle}
      >
        <ThemedX size={iconSize} uniProps={mutedMapping} />
      </Pressable>
      <VolumeMeter volume={isProcessing ? 0 : volume} orientation="horizontal" variant="compact" />
      {isProcessing ? (
        <View style={styles.stopButton}>
          <ThemedLoadingSpinner size="small" uniProps={foregroundMapping} />
        </View>
      ) : (
        <Pressable
          onPress={onStop}
          accessibilityRole="button"
          accessibilityLabel={t("message.dictation.insert")}
          style={stopButtonStyle}
        >
          <ThemedSquare size={iconSize - 6} uniProps={stopIconMapping} />
        </Pressable>
      )}
    </View>
  );
}

function iconButtonStyle({ hovered }: { hovered?: boolean }) {
  return [styles.iconButton, hovered && styles.iconButtonHovered];
}

function stopButtonStyle({ hovered }: { hovered?: boolean }) {
  return [styles.stopButton, hovered && styles.stopButtonHovered];
}

const styles = StyleSheet.create((theme: Theme) => ({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
  },
  iconButton: {
    width: 28,
    height: 28,
    borderRadius: theme.borderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  iconButtonHovered: {
    backgroundColor: theme.colors.surface2,
  },
  stopButton: {
    width: 28,
    height: 28,
    borderRadius: theme.borderRadius.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.destructive,
  },
  stopButtonHovered: {
    opacity: 0.85,
  },
}));

const ThemedX = withUnistyles(X);
const ThemedSquare = withUnistyles(Square);
const ThemedRefreshCcw = withUnistyles(RefreshCcw);
const ThemedLoadingSpinner = withUnistyles(LoadingSpinner);

const mutedMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const foregroundMapping = (theme: Theme) => ({ color: theme.colors.foreground });
const destructiveMapping = (theme: Theme) => ({ color: theme.colors.destructive });
const stopIconMapping = (theme: Theme) => ({
  color: theme.colors.destructiveForeground,
  fill: theme.colors.destructiveForeground,
});
