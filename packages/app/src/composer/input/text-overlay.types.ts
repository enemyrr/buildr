export type InlineChipKind = "image" | "file" | "change_request" | "issue" | "resource";

/** An attachment drawn as a chip over its token in the text. */
export interface InlineChip {
  /** Token label, formatted with `formatInlineLabel`. */
  label: string;
  kind: InlineChipKind;
  testID?: string;
  onOpen?: () => void;
  onRemove?: () => void;
}

export interface ComposerTextOverlayProps {
  getTextArea: () => HTMLTextAreaElement | null;
  value: string;
  /** Chips in attachment order; tokens pair with them by label. */
  chips?: readonly InlineChip[];
}
