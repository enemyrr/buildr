import { useCallback, useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { Download } from "lucide-react-native";
import invariant from "tiny-invariant";
import { useTranslation } from "react-i18next";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { resolveAttachmentFileName } from "@/attachments/export/file-name";
import { saveAttachment, useAttachmentDragSource } from "@/attachments/export";
import { retainAttachmentForGarbageCollection } from "@/attachments/gc-retention";
import type { AttachmentMetadata } from "@/attachments/types";
import { useAttachmentPreviewUrl } from "@/attachments/use-attachment-preview-url";
import { createMaterialFileIcon } from "@/components/material-file-icon";
import { mutedIconColorMapping } from "@/components/ui/icon-color";
import {
  PaneContentToolbar,
  paneContentToolbarIconSize,
  ToolbarButton,
} from "@/components/ui/pane-content-toolbar";
import { ZoomableImage } from "@/components/zoomable-viewport/image";
import { useIsCompactFormFactor } from "@/constants/layout";
import { isWeb } from "@/constants/platform";
import { usePaneContext } from "@/panels/pane-context";
import { definePanel } from "@/panels/panel-registry";

const DownloadIcon = withUnistyles(Download, mutedIconColorMapping);
const GRAB_CURSOR_STYLE = { cursor: "grab" } as object;

function useImagePanelDescriptor(target: { kind: "image"; attachment: AttachmentMetadata }) {
  const { t } = useTranslation();
  const fileName = resolveAttachmentFileName(target.attachment);
  const icon = useMemo(() => createMaterialFileIcon(fileName), [fileName]);
  return {
    label: fileName,
    subtitle: t("panels.image.subtitle"),
    tooltip: fileName,
    titleState: "ready" as const,
    icon,
    statusBucket: null,
  };
}

function ImagePanel() {
  const { target } = usePaneContext();
  invariant(target.kind === "image", "ImagePanel requires image target");
  return <AttachmentImagePane attachment={target.attachment} />;
}

function AttachmentImagePane({ attachment }: { attachment: AttachmentMetadata }) {
  const { t } = useTranslation();
  const isCompact = useIsCompactFormFactor();
  const previewUrl = useAttachmentPreviewUrl(attachment);
  const dragSourceRef = useAttachmentDragSource({ attachment, previewUrl });
  const [errored, setErrored] = useState(false);
  const fileName = resolveAttachmentFileName(attachment);
  const handleError = useCallback(() => setErrored(true), []);

  // Image tabs outlive the message or draft that referenced the attachment.
  useEffect(() => retainAttachmentForGarbageCollection(attachment.id), [attachment.id]);
  const handleDownload = useCallback(() => {
    void saveAttachment(attachment).catch((error) => {
      console.error("[attachments] Failed to save attachment", {
        attachmentId: attachment.id,
        error,
      });
    });
  }, [attachment]);

  return (
    <View style={styles.root}>
      <PaneContentToolbar testID="image-panel-bar">
        <View style={styles.row}>
          <View
            ref={dragSourceRef}
            style={[styles.dragSource, isWeb && GRAB_CURSOR_STYLE]}
            accessibilityHint={isWeb ? t("panels.image.dragHint") : undefined}
            testID="image-panel-drag-source"
          >
            <Text style={styles.fileName} numberOfLines={1}>
              {fileName}
            </Text>
            {attachment.byteSize ? (
              <Text style={styles.whisper}>{formatByteSize(attachment.byteSize)}</Text>
            ) : null}
          </View>
          <ToolbarButton
            label={t("panels.image.download")}
            compact={isCompact}
            onPress={handleDownload}
            testID="image-panel-download"
          >
            <DownloadIcon size={paneContentToolbarIconSize(isCompact)} />
          </ToolbarButton>
        </View>
      </PaneContentToolbar>
      <View style={styles.content}>
        {errored ? (
          <Text style={styles.errorText}>{t("message.attachments.imageLoadFailed")}</Text>
        ) : null}
        {!errored && previewUrl ? (
          <ZoomableImage uri={previewUrl} onError={handleError} testID="image-panel-preview" />
        ) : null}
      </View>
    </View>
  );
}

function formatByteSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export const imagePanelRegistration = definePanel("image", {
  component: ImagePanel,
  useDescriptor: useImagePanelDescriptor,
});

const styles = StyleSheet.create((theme) => ({
  root: {
    flex: 1,
    minHeight: 0,
  },
  row: {
    height: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
    paddingLeft: theme.spacing[3],
    paddingRight: theme.spacing[1],
  },
  dragSource: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  fileName: {
    flexShrink: 1,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  whisper: {
    flexShrink: 0,
    color: theme.colors.foregroundExtraMuted,
    fontSize: theme.fontSize.sm,
  },
  content: {
    flex: 1,
    minHeight: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  errorText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
  },
}));
