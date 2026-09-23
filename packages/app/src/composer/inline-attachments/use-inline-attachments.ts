import { useMemo } from "react";
import type {
  InlineAttachmentsBinding,
  UseInlineAttachmentsInput,
} from "./use-inline-attachments.types";

const isInline = () => false;

// Native text inputs can't paint chips, so attachments stay in the tray.
export function useInlineAttachments({
  onChangeText,
  onSelectionChange,
}: UseInlineAttachmentsInput): InlineAttachmentsBinding {
  return useMemo(
    () => ({
      handleChangeText: onChangeText,
      handleSelectionChange: onSelectionChange,
      chips: undefined,
      isInline,
    }),
    [onChangeText, onSelectionChange],
  );
}
