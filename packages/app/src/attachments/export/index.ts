import * as Sharing from "expo-sharing";
import type { RefCallback } from "react";
import type { View } from "react-native";
import { releaseAttachmentPreviewUrl, resolveAttachmentPreviewUrl } from "@/attachments/service";
import type { AttachmentMetadata } from "@/attachments/types";
import { resolveAttachmentFileName } from "./file-name";

export async function saveAttachment(attachment: AttachmentMetadata): Promise<void> {
  const url = await resolveAttachmentPreviewUrl(attachment);
  try {
    await Sharing.shareAsync(url, {
      mimeType: attachment.mimeType,
      dialogTitle: resolveAttachmentFileName(attachment),
    });
  } finally {
    await releaseAttachmentPreviewUrl({ attachment, url });
  }
}

export function useAttachmentDragSource(_input: {
  attachment: AttachmentMetadata;
  previewUrl: string | null;
}): RefCallback<View> | undefined {
  return undefined;
}
