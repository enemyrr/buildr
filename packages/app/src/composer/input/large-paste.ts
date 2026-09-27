import { useEffect } from "react";
import { isWeb } from "@/constants/platform";
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

    // The paste event carries no modifiers, so the chord is read from the
    // keydown that triggers it. Any later keydown clears it.
    let isPlainPasteRequested = false;
    const handleKeyDown = (event: KeyboardEvent) => {
      isPlainPasteRequested = isPlainPasteChord(event);
    };
    const handlePaste = (event: ClipboardEvent) => {
      const forceInline = isPlainPasteRequested;
      isPlainPasteRequested = false;
      if (forceInline || event.defaultPrevented) return;
      if (collectImageFilesFromClipboardData(event.clipboardData).length > 0) return;
      const text = event.clipboardData?.getData("text/plain") ?? "";
      if (!isLargePaste(text)) return;
      event.preventDefault();
      onPasteLargeText(text);
    };

    textarea.addEventListener("keydown", handleKeyDown, true);
    textarea.addEventListener("paste", handlePaste);
    return () => {
      textarea.removeEventListener("keydown", handleKeyDown, true);
      textarea.removeEventListener("paste", handlePaste);
    };
  }, [enabled, getTextArea, onPasteLargeText]);
}
