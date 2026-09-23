import type { ComposerAttachment, UserComposerAttachment } from "@/attachments/types";
import type { InlineChip } from "@/composer/input/text-overlay.types";
import type { ComposerTextSource } from "@/composer/text-source";
import type { TextSelection } from "./tokens";

export interface UseInlineAttachmentsInput {
  /** False while the composer is read-only; attachments stay in the tray. */
  enabled: boolean;
  attachments: UserComposerAttachment[];
  setAttachments: (attachments: UserComposerAttachment[]) => void;
  textSource: ComposerTextSource;
  getText: () => string;
  getSelection: () => TextSelection;
  setSelection: (selection: TextSelection) => void;
  /** Writes the text as the composer, bypassing the token edit rules. */
  replaceText: (text: string, selection?: TextSelection) => void;
  /** True while `replaceText` runs. */
  isWritingText: () => boolean;
  onChangeText: (text: string) => void;
  onSelectionChange: (selection: TextSelection) => void;
  onRemoveAttachment: (index: number) => void;
  onOpenAttachment: (attachment: ComposerAttachment) => void;
}

export interface InlineAttachmentsBinding {
  handleChangeText: (text: string) => void;
  handleSelectionChange: (selection: TextSelection) => void;
  chips: readonly InlineChip[] | undefined;
  /** True when the attachment shows as a chip in the text instead of the tray. */
  isInline: (attachment: ComposerAttachment) => boolean;
}
