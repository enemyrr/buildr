import { useCallback, useEffect, useState, type RefCallback } from "react";
import type { View } from "react-native";
import type { AttachmentMetadata } from "@/attachments/types";
import { getDesktopHost } from "@/desktop/host";
import { resolveAttachmentFileName } from "./file-name";

export async function saveAttachment(attachment: AttachmentMetadata): Promise<void> {
  await getDesktopHost()?.attachments?.saveAs?.({
    path: attachment.storageKey,
    fileName: resolveAttachmentFileName(attachment),
  });
}

// Electron drags the stored file itself, so drop targets such as Finder and
// Explorer receive a real copy of it.
export function useAttachmentDragSource({
  attachment,
}: {
  attachment: AttachmentMetadata;
  previewUrl: string | null;
}): RefCallback<View> {
  const [element, setElement] = useState<HTMLElement | null>(null);
  const ref = useCallback((node: View | null) => {
    setElement(node as unknown as HTMLElement | null);
  }, []);

  useEffect(() => {
    const startDrag = getDesktopHost()?.attachments?.startDrag;
    if (!element || !startDrag || attachment.storageType !== "desktop-file") return;
    const path = attachment.storageKey;
    element.draggable = true;
    function handleDragStart(event: DragEvent) {
      event.preventDefault();
      startDrag?.(path);
    }
    element.addEventListener("dragstart", handleDragStart);
    return () => {
      element.draggable = false;
      element.removeEventListener("dragstart", handleDragStart);
    };
  }, [attachment.storageKey, attachment.storageType, element]);

  return ref;
}
