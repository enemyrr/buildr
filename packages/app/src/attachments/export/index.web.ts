import { useCallback, useEffect, useState, type RefCallback } from "react";
import type { View } from "react-native";
import { releaseAttachmentPreviewUrl, resolveAttachmentPreviewUrl } from "@/attachments/service";
import type { AttachmentMetadata } from "@/attachments/types";
import { resolveAttachmentFileName } from "./file-name";

export async function saveAttachment(attachment: AttachmentMetadata): Promise<void> {
  const url = await resolveAttachmentPreviewUrl(attachment);
  const link = document.createElement("a");
  link.href = url;
  link.download = resolveAttachmentFileName(attachment);
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  // The browser reads the blob asynchronously after the click.
  setTimeout(() => void releaseAttachmentPreviewUrl({ attachment, url }), 60_000);
}

// Chromium turns a DownloadURL drag into a file on drop targets such as the
// desktop. Other browsers fall back to the plain URL.
export function useAttachmentDragSource({
  attachment,
  previewUrl,
}: {
  attachment: AttachmentMetadata;
  previewUrl: string | null;
}): RefCallback<View> {
  const [element, setElement] = useState<HTMLElement | null>(null);
  const ref = useCallback((node: View | null) => {
    setElement(node as unknown as HTMLElement | null);
  }, []);

  useEffect(() => {
    if (!element || !previewUrl) return;
    const url = previewUrl;
    const fileName = resolveAttachmentFileName(attachment);
    element.draggable = true;
    function handleDragStart(event: DragEvent) {
      if (!event.dataTransfer) return;
      event.dataTransfer.effectAllowed = "copy";
      event.dataTransfer.setData("DownloadURL", `${attachment.mimeType}:${fileName}:${url}`);
      event.dataTransfer.setData("text/uri-list", url);
    }
    element.addEventListener("dragstart", handleDragStart);
    return () => {
      element.draggable = false;
      element.removeEventListener("dragstart", handleDragStart);
    };
  }, [attachment, element, previewUrl]);

  return ref;
}
