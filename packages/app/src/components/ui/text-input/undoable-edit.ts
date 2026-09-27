export interface TextSplice {
  start: number;
  end: number;
  replacement: string;
}

/**
 * Returns the smallest range of `previous` whose replacement yields `next`, or
 * null when they are equal. Editing only that range keeps one undo step per edit.
 */
export function diffTextSplice(previous: string, next: string): TextSplice | null {
  if (previous === next) return null;
  const maxPrefix = Math.min(previous.length, next.length);
  let prefix = 0;
  while (prefix < maxPrefix && previous[prefix] === next[prefix]) prefix++;
  const maxSuffix = maxPrefix - prefix;
  let suffix = 0;
  while (
    suffix < maxSuffix &&
    previous[previous.length - 1 - suffix] === next[next.length - 1 - suffix]
  ) {
    suffix++;
  }
  return {
    start: prefix,
    end: previous.length - suffix,
    replacement: next.slice(prefix, next.length - suffix),
  };
}

/**
 * Replaces the textarea's text through the browser's editing commands, so the
 * change lands on its native undo stack. Browsers without `insertText` get the
 * value assigned directly, which works but can't be undone.
 */
export function applyUndoableTextEdit(
  element: HTMLTextAreaElement,
  text: string,
  selection: { start: number; end: number },
): void {
  const splice = diffTextSplice(element.value, text);
  if (splice) {
    // Editing commands act on the focused element's selection only.
    if (document.activeElement !== element) element.focus();
    element.setSelectionRange(splice.start, splice.end);
    const isApplied =
      splice.replacement === ""
        ? document.execCommand("delete")
        : document.execCommand("insertText", false, splice.replacement);
    if (!isApplied || element.value !== text) element.value = text;
  }
  element.setSelectionRange(selection.start, selection.end);
}
