import { useCallback, useEffect, useMemo, useRef } from "react";
import type { ComposerAttachment, UserComposerAttachment } from "@/attachments/types";
import { isWorkspaceAttachment } from "@/attachments/workspace-attachment-utils";
import type { InlineChip } from "@/composer/input/text-overlay.types";
import { buildInlineAttachments } from "./attachments";
import {
  applyInlineTokenEdit,
  pairInlineTokens,
  parseInlineTokens,
  reconcileInlineTokens,
  snapSelectionToTokens,
  type TextSelection,
} from "./tokens";
import type {
  InlineAttachmentsBinding,
  UseInlineAttachmentsInput,
} from "./use-inline-attachments.types";

function isOpenable(attachment: ComposerAttachment): boolean {
  return attachment.kind !== "file" && attachment.kind !== "workspace_file";
}

// Chips reuse the tray pills' test IDs, so tests find an attachment either way.
function chipTestID(attachment: UserComposerAttachment): string {
  switch (attachment.kind) {
    case "image":
      return "composer-image-attachment-pill";
    case "file":
      return "composer-file-attachment-pill";
    case "workspace_file":
      return "composer-workspace-file-attachment-pill";
    case "plugin_resource":
      return "composer-plugin-resource-attachment-pill";
    default:
      return "composer-github-attachment-pill";
  }
}

/**
 * Shows the composer's attachments as chips inside the text. Text and
 * attachments stay in agreement both ways: a new attachment gets a token at the
 * caret, and deleting a token removes its attachment.
 */
export function useInlineAttachments(input: UseInlineAttachmentsInput): InlineAttachmentsBinding {
  const { enabled, attachments, onChangeText, onSelectionChange, onOpenAttachment } = input;
  const inputRef = useRef(input);
  inputRef.current = input;
  const selectionRef = useRef<TextSelection>({ start: 0, end: 0 });

  const inlineAttachments = useMemo(() => buildInlineAttachments(attachments), [attachments]);
  const inlineAttachmentsRef = useRef(inlineAttachments);
  inlineAttachmentsRef.current = inlineAttachments;

  // Reconcile only after attachments commit. Text changes are synchronous, so
  // reconciling on them would see cleared text next to not-yet-cleared
  // attachments and put the tokens back.
  useEffect(() => {
    if (!enabled) return;
    const current = inputRef.current;
    const text = current.textSource.getSnapshot();
    const result = reconcileInlineTokens({
      text,
      items: inlineAttachments,
      insertAt: current.getSelection().end,
    });
    if (result.text !== text) {
      current.replaceText(
        result.text,
        result.cursor === null ? undefined : { start: result.cursor, end: result.cursor },
      );
    }
    const order = [
      ...result.order,
      ...attachments.filter((attachment) => !result.order.includes(attachment)),
    ];
    if (order.some((attachment, index) => attachment !== attachments[index])) {
      current.setAttachments(order);
    }
  }, [attachments, enabled, inlineAttachments]);

  const handleChangeText = useCallback(
    (next: string) => {
      const current = inputRef.current;
      // The composer's own writes (clearing on submit, restoring a draft) keep
      // their attachments; only edits in the input remove them.
      if (!current.enabled || current.isWritingText()) {
        onChangeText(next);
        return;
      }
      const previous = current.textSource.getSnapshot();
      const edit = applyInlineTokenEdit(previous, next);
      if (edit.removed.length > 0) {
        const paired = pairInlineTokens(
          parseInlineTokens(previous),
          inlineAttachmentsRef.current,
          (entry) => entry.label,
        );
        const indexes = edit.removed
          .map((index) => paired[index])
          .flatMap((entry) => (entry ? [current.attachments.indexOf(entry.item)] : []))
          .filter((index) => index >= 0)
          .sort((a, b) => b - a);
        for (const index of indexes) current.onRemoveAttachment(index);
      }
      if (edit.cursor === null) onChangeText(next);
      else current.replaceText(edit.text, { start: edit.cursor, end: edit.cursor });
    },
    [onChangeText],
  );

  const handleSelectionChange = useCallback(
    (selection: TextSelection) => {
      const current = inputRef.current;
      const previous = selectionRef.current;
      const snapped = current.enabled
        ? snapSelectionToTokens(current.getText(), selection, previous)
        : null;
      const next = snapped ?? selection;
      selectionRef.current = next;
      if (snapped) current.setSelection(snapped);
      onSelectionChange(next);
    },
    [onSelectionChange],
  );

  const removeChip = useCallback((attachment: UserComposerAttachment) => {
    const current = inputRef.current;
    const text = current.textSource.getSnapshot();
    const tokens = parseInlineTokens(text);
    const paired = pairInlineTokens(tokens, inlineAttachmentsRef.current, (entry) => entry.label);
    const token = tokens[paired.findIndex((entry) => entry?.item === attachment)];
    const index = current.attachments.indexOf(attachment);
    if (index >= 0) current.onRemoveAttachment(index);
    if (!token) return;
    const end = text[token.end] === " " ? token.end + 1 : token.end;
    current.replaceText(text.slice(0, token.start) + text.slice(end), {
      start: token.start,
      end: token.start,
    });
  }, []);

  const chips = useMemo<InlineChip[] | undefined>(
    () =>
      enabled
        ? inlineAttachments.map(({ item, label, kind }) => ({
            label,
            kind,
            testID: chipTestID(item),
            onOpen: isOpenable(item) ? () => onOpenAttachment(item) : undefined,
            onRemove: () => removeChip(item),
          }))
        : undefined,
    [enabled, inlineAttachments, onOpenAttachment, removeChip],
  );

  const isInline = useCallback(
    (attachment: ComposerAttachment) => enabled && !isWorkspaceAttachment(attachment),
    [enabled],
  );

  return useMemo(
    () => ({ handleChangeText, handleSelectionChange, chips, isInline }),
    [chips, handleChangeText, handleSelectionChange, isInline],
  );
}
