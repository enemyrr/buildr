import { type ReactNode, useCallback, useMemo, useState } from "react";
import { Image, Pressable, Text, View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { X } from "lucide-react-native";
import { isNative } from "@/constants/platform";
import { useIsCompactFormFactor } from "@/constants/layout";
import type { AttachmentMetadata } from "@/attachments/types";
import { useAttachmentPreviewUrl } from "@/attachments/use-attachment-preview-url";
import { ICON_SIZE, SPACING, type Theme } from "@/styles/theme";

// Every chip is this tall, border included, so chips line up inline with text.
const CHIP_HEIGHT = 20;
const CHIP_INNER_HEIGHT = CHIP_HEIGHT - 2;
const CHIP_PADDING_X = SPACING[1.5];

interface AttachmentPillProps {
  onOpen: () => void;
  onRemove: () => void;
  openAccessibilityLabel: string;
  removeAccessibilityLabel: string;
  disabled?: boolean;
  testID?: string;
  children: ReactNode;
}

/**
 * Removable attachment chip for the composer. On hover (web) the remove `×` covers the leading
 * icon slot; on touch layouts it sits inline at the trailing edge.
 */
export function AttachmentPill({
  onOpen,
  onRemove,
  openAccessibilityLabel,
  removeAccessibilityLabel,
  disabled = false,
  testID,
  children,
}: AttachmentPillProps) {
  const isCompact = useIsCompactFormFactor();
  const isTouchLayout = isNative || isCompact;
  const [isHovered, setIsHovered] = useState(false);
  const removeStyle = useMemo(
    () =>
      isTouchLayout
        ? styles.removeInline
        : [styles.removeOverlay, !isHovered && styles.removeHidden],
    [isHovered, isTouchLayout],
  );
  const handlePointerEnter = useCallback(() => setIsHovered(true), []);
  const handlePointerLeave = useCallback(() => setIsHovered(false), []);
  return (
    <View
      style={styles.chip}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
    >
      <Pressable
        testID={testID}
        onPress={onOpen}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={openAccessibilityLabel}
        style={styles.body}
      >
        {children}
      </Pressable>
      <Pressable
        onPress={onRemove}
        disabled={disabled}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel={removeAccessibilityLabel}
        style={removeStyle}
      >
        <ThemedX size={ICON_SIZE.xs} uniProps={iconForegroundMapping} />
      </Pressable>
    </View>
  );
}

interface AttachmentFrameProps {
  onPress?: () => void;
  accessibilityLabel?: string;
  testID?: string;
  children: ReactNode;
}

/** Read-only attachment chip (sent messages, pending uploads). */
export function AttachmentFrame({
  onPress,
  accessibilityLabel,
  testID,
  children,
}: AttachmentFrameProps) {
  if (!onPress) {
    return (
      <View testID={testID} style={styles.chip}>
        {children}
      </View>
    );
  }
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={styles.chip}
    >
      {children}
    </Pressable>
  );
}

interface AttachmentLabelProps {
  icon?: ReactNode;
  title: string;
}

/** Chip body: a small muted icon followed by the attachment name. */
export function AttachmentLabel({ icon, title }: AttachmentLabelProps) {
  return (
    <View style={styles.label}>
      {icon ? <View style={styles.labelIcon}>{icon}</View> : null}
      <Text style={styles.labelText} numberOfLines={1}>
        {title}
      </Text>
    </View>
  );
}

/** Image chip body: a flush thumbnail, followed by the file name when there is one. */
export function AttachmentThumbnail({ metadata }: { metadata: AttachmentMetadata }) {
  const uri = useAttachmentPreviewUrl(metadata);
  const source = useMemo(() => ({ uri: uri ?? "" }), [uri]);
  const fileName = metadata.fileName?.trim();
  return (
    <View style={styles.thumbnailLabel}>
      {uri ? (
        <Image source={source} style={styles.thumbnail} />
      ) : (
        <View style={styles.thumbnailPlaceholder} />
      )}
      {fileName ? (
        <Text style={styles.thumbnailText} numberOfLines={1}>
          {fileName}
        </Text>
      ) : null}
    </View>
  );
}

const ThemedX = withUnistyles(X);
const iconForegroundMapping = (theme: Theme) => ({ color: theme.colors.foreground });

const styles = StyleSheet.create((theme) => ({
  chip: {
    position: "relative",
    flexDirection: "row",
    alignItems: "center",
    height: CHIP_HEIGHT,
    maxWidth: 240,
    borderRadius: theme.borderRadius.base,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.borderAccent,
    overflow: "hidden",
  },
  body: {
    minWidth: 0,
    flexShrink: 1,
  },
  label: {
    height: CHIP_INNER_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    paddingHorizontal: CHIP_PADDING_X,
  },
  labelIcon: {
    width: ICON_SIZE.xs,
    alignItems: "center",
    justifyContent: "center",
  },
  labelText: {
    minWidth: 0,
    flexShrink: 1,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  thumbnailLabel: {
    height: CHIP_INNER_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
  },
  thumbnail: {
    width: CHIP_INNER_HEIGHT,
    height: CHIP_INNER_HEIGHT,
  },
  thumbnailPlaceholder: {
    width: CHIP_INNER_HEIGHT,
    height: CHIP_INNER_HEIGHT,
    backgroundColor: theme.colors.surface2,
  },
  thumbnailText: {
    minWidth: 0,
    flexShrink: 1,
    paddingHorizontal: CHIP_PADDING_X,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  // Covers the leading icon slot, so hover never changes the chip's geometry.
  removeOverlay: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    width: CHIP_PADDING_X + ICON_SIZE.xs + theme.spacing[0.5],
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surface1,
  },
  removeHidden: {
    opacity: 0,
    pointerEvents: "none",
  },
  removeInline: {
    height: CHIP_INNER_HEIGHT,
    paddingRight: CHIP_PADDING_X,
    justifyContent: "center",
  },
}));
