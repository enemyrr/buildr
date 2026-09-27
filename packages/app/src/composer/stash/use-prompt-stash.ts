import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { UserComposerAttachment } from "@/attachments/types";
import { trimInlineText } from "@/composer/inline-attachments/tokens";
import type { PromptStashEntry } from "./model";
import { stashPrompt, takeStashEntry, usePromptStashStore } from "./store";

export interface StashDraft {
  text: string;
  attachments: UserComposerAttachment[];
}

interface PromptStashArgs {
  getDraft: () => StashDraft;
  replaceDraft: (draft: StashDraft) => void;
  /** True while uploads or a submit are in flight, when the draft is not settled. */
  isBusy: boolean;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
}

export interface PromptStash {
  entries: readonly PromptStashEntry[];
  isMenuOpen: boolean;
  setIsMenuOpen: (open: boolean) => void;
  canStash: boolean;
  stashDraft: () => boolean;
  restore: (id: string) => boolean;
  /** Stashes a draft with content; with an empty draft, restores or opens the menu. */
  runShortcut: () => boolean;
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
  const { getDraft, replaceDraft, isBusy, onSuccess, onError } = args;
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
    replaceDraft({ text: "", attachments: [] });
    onSuccess(t("composer.stash.stashed"));
    return true;
  }, [getDraft, isBusy, onSuccess, replaceDraft, stash, t]);

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
      replaceDraft({ text: entry.text, attachments: entry.attachments });
      return true;
    },
    [getDraft, isBusy, onError, replaceDraft, stash, t],
  );

  const runShortcut = useCallback((): boolean => {
    if (hasContent(getDraft())) return stashDraft();
    const [only, ...rest] = usePromptStashStore.getState().entries;
    if (!only) return false;
    if (rest.length === 0) return restore(only.id);
    setIsMenuOpen(true);
    return true;
  }, [getDraft, restore, stashDraft]);

  return useMemo(
    () => ({
      entries,
      isMenuOpen,
      setIsMenuOpen,
      canStash: !isBusy,
      stashDraft,
      restore,
      runShortcut,
    }),
    [entries, isBusy, isMenuOpen, restore, runShortcut, stashDraft],
  );
}
