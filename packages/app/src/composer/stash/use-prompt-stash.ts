import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { UserComposerAttachment } from "@/attachments/types";
import { trimInlineText } from "@/composer/inline-attachments/tokens";
import { confirmDialog } from "@/utils/confirm-dialog";
import type { PromptStashEntry } from "./model";
import { stashPrompt, takeStashEntry, usePromptStashStore } from "./store";

export interface StashDraft {
  text: string;
  attachments: UserComposerAttachment[];
}

interface PromptStashArgs {
  getDraft: () => StashDraft;
  clearDraft: () => void;
  restoreDraft: (draft: StashDraft) => void;
  /** True while uploads or a submit are in flight, when the draft is not settled. */
  isBusy: boolean;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
}

export interface PromptStash {
  entries: readonly PromptStashEntry[];
  isMenuOpen: boolean;
  setIsMenuOpen: (open: boolean) => void;
  canStash: boolean;
  stashDraft: () => boolean;
  restore: (id: string) => boolean;
  remove: (id: string) => void;
  /**
   * Stashes a draft with content; with an empty draft, restores the only stash or
   * opens the menu. With nothing to do it shows a notice, so the chord never falls
   * through to the browser's Save page.
   */
  runShortcut: () => void;
}

function hasContent(draft: StashDraft): boolean {
  return trimInlineText(draft.text).length > 0 || draft.attachments.length > 0;
}

function createEntry(draft: StashDraft): PromptStashEntry {
  return {
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    text: draft.text,
    attachments: draft.attachments,
  };
}

export function usePromptStash(args: PromptStashArgs): PromptStash {
  const { getDraft, clearDraft, restoreDraft, isBusy, onNotice, onError } = args;
  const { t } = useTranslation();
  const entries = usePromptStashStore((state) => state.entries);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const stash = useCallback(
    (draft: StashDraft): boolean => {
      const result = stashPrompt(createEntry(draft));
      if (result === "too-large") onError(t("composer.stash.errors.tooLarge"));
      if (result === "storage-failed") onError(t("composer.stash.errors.storageFailed"));
      return result === "stored";
    },
    [onError, t],
  );

  const stashDraft = useCallback((): boolean => {
    const draft = getDraft();
    if (isBusy || !hasContent(draft) || !stash(draft)) return false;
    clearDraft();
    onNotice(t("composer.stash.stashed"));
    return true;
  }, [clearDraft, getDraft, isBusy, onNotice, stash, t]);

  // A draft with content is stashed first, so restoring swaps instead of discarding.
  const restore = useCallback(
    (id: string): boolean => {
      if (isBusy) return false;
      const draft = getDraft();
      if (hasContent(draft) && !stash(draft)) return false;
      const entry = takeStashEntry(id);
      if (!entry) {
        onError(t("composer.stash.errors.restoreFailed"));
        return false;
      }
      restoreDraft({ text: entry.text, attachments: entry.attachments });
      return true;
    },
    [getDraft, isBusy, onError, restoreDraft, stash, t],
  );

  const remove = useCallback(
    (id: string) => {
      void confirmDialog({
        title: t("composer.stash.delete.confirmTitle"),
        message: t("composer.stash.delete.confirmMessage"),
        confirmLabel: t("composer.stash.delete.confirm"),
        cancelLabel: t("common.actions.cancel"),
        destructive: true,
      }).then((confirmed) => {
        if (confirmed && !takeStashEntry(id)) onError(t("composer.stash.errors.deleteFailed"));
        return undefined;
      });
    },
    [onError, t],
  );

  const runShortcut = useCallback(() => {
    if (isBusy) return;
    if (hasContent(getDraft())) {
      stashDraft();
      return;
    }
    const [only, ...rest] = usePromptStashStore.getState().entries;
    if (!only) {
      onNotice(t("composer.stash.nothingToStash"));
      return;
    }
    if (rest.length === 0) {
      restore(only.id);
      return;
    }
    setIsMenuOpen(true);
  }, [getDraft, isBusy, onNotice, restore, stashDraft, t]);

  return useMemo(
    () => ({
      entries,
      isMenuOpen,
      setIsMenuOpen,
      canStash: !isBusy,
      stashDraft,
      restore,
      remove,
      runShortcut,
    }),
    [entries, isBusy, isMenuOpen, remove, restore, runShortcut, stashDraft],
  );
}
