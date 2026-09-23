import { useMemo } from "react";
import type { AttachmentMetadata } from "@/attachments/types";
import { useOptionalPaneContext } from "@/panels/pane-context";

/** Opens an image attachment as a workspace tab, or returns null outside a workspace pane. */
export function useOpenImageTab(): ((attachment: AttachmentMetadata) => void) | null {
  const openPreferredTarget = useOptionalPaneContext()?.openPreferredTarget;
  return useMemo(
    () =>
      openPreferredTarget
        ? (attachment: AttachmentMetadata) =>
            openPreferredTarget({ kind: "image", attachment }, "chatFiles")
        : null,
    [openPreferredTarget],
  );
}
