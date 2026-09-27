import { parseInlineTokens } from "@/composer/inline-attachments/tokens";
import type { ComposerInputSnapshot, ComposerKeyModifiers } from "./input";

// Markdown list editing for the composer: the newline key continues a list item,
// the newline key on an empty item exits the list, and Tab / Shift+Tab indent and
// outdent an item. The text stays plain Markdown.

const INDENT = "  ";

type ListMarker =
  | { kind: "ordered"; indent: string; number: string; delimiter: "." | ")" }
  | { kind: "task"; indent: string; bullet: string }
  | { kind: "bullet"; indent: string; bullet: string };

interface ParsedListLine {
  marker: ListMarker;
  /** Offset within the line where the item's content starts. */
  contentStart: number;
}

interface LineRange {
  start: number;
  end: number;
  text: string;
}

const ORDERED_PATTERN = /^(\d{1,9})([.)])[ \t]+/;
const TASK_PATTERN = /^([-*+]) \[[ xX]\][ \t]+/;
const BULLET_PATTERN = /^([-*+])[ \t]+/;

function parseListLine(line: string): ParsedListLine | null {
  const indent = /^[ \t]*/.exec(line)?.[0] ?? "";
  const rest = line.slice(indent.length);
  const ordered = ORDERED_PATTERN.exec(rest);
  if (ordered) {
    const delimiter = ordered[2] === ")" ? ")" : ".";
    return {
      marker: { kind: "ordered", indent, number: ordered[1], delimiter },
      contentStart: indent.length + ordered[0].length,
    };
  }
  const task = TASK_PATTERN.exec(rest);
  if (task) {
    return {
      marker: { kind: "task", indent, bullet: task[1] },
      contentStart: indent.length + task[0].length,
    };
  }
  const bullet = BULLET_PATTERN.exec(rest);
  if (bullet) {
    return {
      marker: { kind: "bullet", indent, bullet: bullet[1] },
      contentStart: indent.length + bullet[0].length,
    };
  }
  return null;
}

function nextMarker(marker: ListMarker): string {
  if (marker.kind === "ordered") {
    const next = String(Number.parseInt(marker.number, 10) + 1);
    return `${marker.indent}${next}${marker.delimiter} `;
  }
  if (marker.kind === "task") {
    return `${marker.indent}${marker.bullet} [ ] `;
  }
  return `${marker.indent}${marker.bullet} `;
}

function lineAt(text: string, offset: number): LineRange {
  const start = text.lastIndexOf("\n", offset - 1) + 1;
  const newline = text.indexOf("\n", offset);
  const end = newline === -1 ? text.length : newline;
  return { start, end, text: text.slice(start, end) };
}

// Inline attachment tokens render as chips; splitting one would break the chip.
function isInsideInlineToken(text: string, offset: number): boolean {
  return parseInlineTokens(text).some((token) => offset > token.start && offset < token.end);
}

function caretOf(input: ComposerInputSnapshot): number | null {
  const { start, end } = input.selection;
  return start === end ? start : null;
}

function collapsed(offset: number): ComposerInputSnapshot["selection"] {
  return { start: offset, end: offset };
}

/**
 * Returns the edit for the newline key on a list item, or null to insert a
 * plain newline. An item with content continues the list; an empty item
 * drops its marker and exits the list.
 */
export function continueList(input: ComposerInputSnapshot): ComposerInputSnapshot | null {
  const { text } = input;
  const caret = caretOf(input);
  if (caret === null) return null;
  const line = lineAt(text, caret);
  const parsed = parseListLine(line.text);
  if (!parsed) return null;
  const contentStart = line.start + parsed.contentStart;
  if (caret < contentStart || isInsideInlineToken(text, caret)) return null;

  if (text.slice(contentStart, line.end).trim() === "") {
    const exited = text.slice(0, line.start) + text.slice(line.end);
    return { text: exited, selection: collapsed(line.start) };
  }

  const insertion = `\n${nextMarker(parsed.marker)}`;
  const continued = text.slice(0, caret) + insertion + text.slice(caret);
  return { text: continued, selection: collapsed(caret + insertion.length) };
}

export type ListIndentDirection = "indent" | "outdent";

/**
 * Returns the edit that indents or outdents the list item under the caret, or
 * null when the caret is not on a list item or the item has no indent to remove.
 */
export function indentListItem(
  input: ComposerInputSnapshot,
  direction: ListIndentDirection,
): ComposerInputSnapshot | null {
  const { text } = input;
  const caret = caretOf(input);
  if (caret === null) return null;
  const line = lineAt(text, caret);
  const parsed = parseListLine(line.text);
  if (!parsed) return null;

  if (direction === "indent") {
    const indented = text.slice(0, line.start) + INDENT + text.slice(line.start);
    return { text: indented, selection: collapsed(caret + INDENT.length) };
  }

  const indent = parsed.marker.indent;
  const removed = indent.startsWith("\t") ? 1 : Math.min(indent.length, INDENT.length);
  if (removed === 0) return null;
  const outdented = text.slice(0, line.start) + text.slice(line.start + removed);
  return { text: outdented, selection: collapsed(Math.max(line.start, caret - removed)) };
}

export interface ListKeyInput {
  key: string;
  modifiers: ComposerKeyModifiers;
  /** True when plain Enter sends, so Shift+Enter is the newline key. */
  submitOnEnter: boolean;
  input: ComposerInputSnapshot;
}

function isNewlineKey(key: string, modifiers: ComposerKeyModifiers, submitOnEnter: boolean) {
  if (key !== "Enter" || modifiers.metaKey || modifiers.ctrlKey || modifiers.altKey) return false;
  return submitOnEnter ? modifiers.shiftKey : true;
}

function isPlainTab(key: string, modifiers: ComposerKeyModifiers) {
  const hasModifier =
    modifiers.shiftKey || modifiers.metaKey || modifiers.ctrlKey || modifiers.altKey;
  return key === "Tab" && !hasModifier;
}

/**
 * Maps a key press to a list edit. Shift+Tab is absent: it is bound to the
 * agent mode cycle, and the composer outdents through that action instead.
 */
export function resolveListKeyEdit(event: ListKeyInput): ComposerInputSnapshot | null {
  if (isNewlineKey(event.key, event.modifiers, event.submitOnEnter)) {
    return continueList(event.input);
  }
  if (isPlainTab(event.key, event.modifiers)) {
    return indentListItem(event.input, "indent");
  }
  return null;
}
