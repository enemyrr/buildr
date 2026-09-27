import { useEffect } from "react";
import { getIsElectron, isWeb } from "@/constants/platform";
import { listenToDesktopEvent } from "@/desktop/electron/events";
import type { SelectedFile } from "@/attachments/selected-file";
import { collectImageFilesFromClipboardData } from "@/utils/image-attachments-from-files";
import type { ComposerInputSnapshot } from "./input";

// A paste this large goes to the agent as a text file, so it doesn't fill the
// composer or the model context. Cmd+Shift+V (Ctrl+Shift+V) keeps it inline.
export const LARGE_PASTE_THRESHOLD_BYTES = 32 * 1024;

const encoder = new TextEncoder();

export function isLargePaste(text: string): boolean {
  // UTF-8 is at most 3 bytes per UTF-16 code unit, so short text skips encoding.
  if (text.length * 3 < LARGE_PASTE_THRESHOLD_BYTES) return false;
  return encoder.encode(text).byteLength >= LARGE_PASTE_THRESHOLD_BYTES;
}

export interface PasteChordInput {
  key: string;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
}

export function isPlainPasteChord(event: PasteChordInput): boolean {
  const isV = event.key === "v" || event.key === "V";
  return isV && event.shiftKey && !event.altKey && (event.metaKey || event.ctrlKey);
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function formatPastedTextFileName(now: Date): string {
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `pasted-text-${date}-${time}.txt`;
}

export function createPastedTextFile(text: string, now: Date): SelectedFile {
  return {
    fileName: formatPastedTextFileName(now),
    mimeType: "text/plain",
    readBytes: async () => encoder.encode(text),
  };
}

/** Inserts text over the selection and puts the caret after it. */
export function insertAtSelection(
  input: ComposerInputSnapshot,
  inserted: string,
): ComposerInputSnapshot {
  const { text, selection } = input;
  const caret = selection.start + inserted.length;
  return {
    text: text.slice(0, selection.start) + inserted + text.slice(selection.end),
    selection: { start: caret, end: caret },
  };
}

/** How long a plain-paste request waits for its paste event. */
export const PLAIN_PASTE_WINDOW_MS = 1000;

export interface PlainPasteIntent {
  request: () => void;
  /** True once if a request is pending and fresh; clears the request either way. */
  consume: () => boolean;
}

/**
 * A one-shot "keep the next paste inline" flag. The paste event carries no
 * modifiers, so the request comes from the chord's keydown or, in the desktop
 * app, from the menu item, which can take the chord before the page sees it.
 */
export function createPlainPasteIntent(now: () => number): PlainPasteIntent {
  let requestedAt: number | null = null;
  return {
    request: () => {
      requestedAt = now();
    },
    consume: () => {
      const isFresh = requestedAt !== null && now() - requestedAt <= PLAIN_PASTE_WINDOW_MS;
      requestedAt = null;
      return isFresh;
    },
  };
}

/** Sent by the desktop Edit menu right before it runs Paste and Match Style. */
const PLAIN_PASTE_DESKTOP_EVENT = "plain-paste-requested";

function listenForDesktopPlainPaste(onRequest: () => void): () => void {
  if (!getIsElectron()) return () => {};
  let isDisposed = false;
  let unlisten: (() => void) | null = null;
  void listenToDesktopEvent(PLAIN_PASTE_DESKTOP_EVENT, onRequest).then((dispose) => {
    if (isDisposed) dispose();
    else unlisten = dispose;
    return undefined;
  });
  return () => {
    isDisposed = true;
    unlisten?.();
  };
}

interface LargeTextPasteArgs {
  getTextArea: () => HTMLTextAreaElement | null;
  enabled: boolean;
  onPasteLargeText: ((text: string) => void) | undefined;
}

/** Diverts large plain-text pastes on web to `onPasteLargeText`. */
export function useLargeTextPaste({ getTextArea, enabled, onPasteLargeText }: LargeTextPasteArgs) {
  useEffect(() => {
    if (!isWeb || !enabled || !onPasteLargeText) return;
    const textarea = getTextArea();
    if (!textarea) return;

    const plainPaste = createPlainPasteIntent(Date.now);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isPlainPasteChord(event)) plainPaste.request();
    };
    const handlePaste = (event: ClipboardEvent) => {
      const forceInline = plainPaste.consume();
      if (forceInline || event.defaultPrevented) return;
      if (collectImageFilesFromClipboardData(event.clipboardData).length > 0) return;
      const text = event.clipboardData?.getData("text/plain") ?? "";
      if (!isLargePaste(text)) return;
      event.preventDefault();
      onPasteLargeText(text);
    };

    textarea.addEventListener("keydown", handleKeyDown, true);
    textarea.addEventListener("paste", handlePaste);
    const stopDesktopListener = listenForDesktopPlainPaste(plainPaste.request);
    return () => {
      textarea.removeEventListener("keydown", handleKeyDown, true);
      textarea.removeEventListener("paste", handlePaste);
      stopDesktopListener();
    };
  }, [enabled, getTextArea, onPasteLargeText]);
}
