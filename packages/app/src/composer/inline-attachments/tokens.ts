// A textarea can't hold elements, so an inline attachment lives in the text as
// a token: two figure spaces (room for the chip icon), the label, and two
// narrow no-break spaces (the chip's right padding). The text overlay paints
// the same characters as a chip, so wrapping and caret positions match the
// textarea exactly. Every character in a token is non-breaking, so a chip never
// splits across lines.
const TOKEN_START = "\u2007\u2007";
const TOKEN_END = "\u202f\u202f";
const TOKEN_PATTERN = /\u2007\u2007([^\u2007\u202f\n]+)\u202f\u202f/g;
const MAX_LABEL_LENGTH = 32;

export interface InlineToken {
  start: number;
  end: number;
  label: string;
}

export interface TextSelection {
  start: number;
  end: number;
}

/** Formats a label for use inside a token. */
export function formatInlineLabel(raw: string): string {
  const label =
    raw
      .replace(/[\u2007\u202f]/g, "")
      .replace(/\s+/g, " ")
      .trim() || "Attachment";
  const truncated =
    label.length > MAX_LABEL_LENGTH ? `${label.slice(0, MAX_LABEL_LENGTH - 1)}…` : label;
  return truncated.replace(/ /g, "\u00a0");
}

export function createInlineToken(label: string): string {
  return `${TOKEN_START}${label}${TOKEN_END}`;
}

/** Returns the readable form of a token label. */
export function readInlineLabel(label: string): string {
  return label.replace(/\u00a0/g, " ");
}

/** Replaces every token with its readable label. */
export function stripInlineTokens(text: string): string {
  if (!text.includes(TOKEN_START)) return text;
  return text.replace(TOKEN_PATTERN, (_, label: string) => readInlineLabel(label));
}

/**
 * Trims the text like `String.prototype.trim`, but keeps token padding: figure
 * and narrow no-break spaces count as whitespace, so a plain trim breaks a
 * token at either end of the text.
 */
export function trimInlineText(text: string): string {
  return text.replace(/^[^\S\u2007\u202f]+|[^\S\u2007\u202f]+$/g, "");
}

export function parseInlineTokens(text: string): InlineToken[] {
  if (!text.includes(TOKEN_START)) return [];
  const tokens: InlineToken[] = [];
  for (const match of text.matchAll(TOKEN_PATTERN)) {
    tokens.push({ start: match.index, end: match.index + match[0].length, label: match[1] ?? "" });
  }
  return tokens;
}

/**
 * Pairs each token with an item by label, in order: the second token labeled
 * `image.png` pairs with the second item labeled `image.png`. Returns one entry
 * per token, or null when no item is left for that label.
 */
export function pairInlineTokens<T>(
  tokens: readonly InlineToken[],
  items: readonly T[],
  getLabel: (item: T) => string,
): (T | null)[] {
  const queues = new Map<string, T[]>();
  for (const item of items) {
    const label = getLabel(item);
    const queue = queues.get(label);
    if (queue) queue.push(item);
    else queues.set(label, [item]);
  }
  return tokens.map((token) => queues.get(token.label)?.shift() ?? null);
}

export interface InlineTokenEdit {
  text: string;
  /** Caret position after the edit, or null when the edit needed no rewrite. */
  cursor: number | null;
  /** Indexes into the previous text's tokens that the edit deleted. */
  removed: number[];
}

/**
 * Keeps tokens whole across an edit. An edit that touches part of a token
 * deletes the whole token, so one Backspace after a chip removes the chip.
 * Pasted tokens have no attachment behind them, so they become plain labels.
 */
export function applyInlineTokenEdit(previous: string, next: string): InlineTokenEdit {
  if (!previous.includes(TOKEN_START) && !next.includes(TOKEN_START)) {
    return { text: next, cursor: null, removed: [] };
  }
  const tokens = parseInlineTokens(previous);

  const max = Math.min(previous.length, next.length);
  let prefix = 0;
  while (prefix < max && previous[prefix] === next[prefix]) prefix++;
  let suffix = 0;
  while (
    suffix < max - prefix &&
    previous[previous.length - 1 - suffix] === next[next.length - 1 - suffix]
  ) {
    suffix++;
  }
  let start = prefix;
  let end = previous.length - suffix;
  const inserted = next.slice(prefix, next.length - suffix);
  const plainInserted = stripInlineTokens(inserted);

  let rewrite = plainInserted !== inserted;
  for (const token of tokens) {
    const overlaps = token.start < end && token.end > start;
    const insertsInside = start === end && token.start < start && start < token.end;
    const partial = overlaps && (token.start < start || token.end > end);
    if (insertsInside || partial) {
      start = Math.min(start, token.start);
      end = Math.max(end, token.end);
      rewrite = true;
    }
  }

  const removed: number[] = [];
  tokens.forEach((token, index) => {
    if (token.start >= start && token.end <= end) removed.push(index);
  });
  if (!rewrite) return { text: next, cursor: null, removed };
  return {
    text: previous.slice(0, start) + plainInserted + previous.slice(end),
    cursor: start + plainInserted.length,
    removed,
  };
}

/**
 * Moves a selection edge that lands inside a token to the token's edge. A caret
 * moving right jumps to the token's end; moving left, to its start.
 */
export function snapSelectionToTokens(
  text: string,
  selection: TextSelection,
  previous: TextSelection,
): TextSelection | null {
  const tokens = parseInlineTokens(text);
  if (tokens.length === 0) return null;
  const inside = (offset: number) =>
    tokens.find((token) => token.start < offset && offset < token.end);

  if (selection.start === selection.end) {
    const token = inside(selection.start);
    if (!token) return null;
    let offset: number;
    if (previous.end <= token.start) offset = token.end;
    else if (previous.start >= token.end) offset = token.start;
    else
      offset =
        selection.start - token.start < token.end - selection.start ? token.start : token.end;
    return { start: offset, end: offset };
  }

  const startToken = inside(selection.start);
  const endToken = inside(selection.end);
  if (!startToken && !endToken) return null;
  return { start: startToken?.start ?? selection.start, end: endToken?.end ?? selection.end };
}

/** Inserts a token at an offset, padded with spaces so it reads as its own word. */
export function insertInlineToken(
  text: string,
  token: string,
  at: number,
): { text: string; cursor: number } {
  const offset = Math.max(0, Math.min(at, text.length));
  const before = text.slice(0, offset);
  const after = text.slice(offset);
  // Token characters count as \s, so only ordinary whitespace separates words here.
  const lead = before.length === 0 || /[ \t\n]$/.test(before) ? "" : " ";
  const trail = /^[ \t\n]/.test(after) ? "" : " ";
  const insertion = `${lead}${token}${trail}`;
  return { text: `${before}${insertion}${after}`, cursor: before.length + insertion.length };
}

export interface InlineAttachmentItem<T> {
  item: T;
  /** Label formatted with `formatInlineLabel`. */
  label: string;
  /** Plain-text reference that replaces the token in the sent message. */
  reference: string;
  /** Web URL of the attachment; a pasted copy of it becomes the token. */
  url?: string;
}

export interface ReconcileInlineTokensInput<T> {
  text: string;
  items: readonly InlineAttachmentItem<T>[];
  insertAt: number;
  /** URLs of attachments shown outside the text; pasted copies are removed. */
  consumedUrls?: readonly string[];
}

export interface ReconcileInlineTokensResult<T> {
  text: string;
  /** Caret position after inserted tokens, or null when nothing was inserted. */
  cursor: number | null;
  /** Items ordered by where their token appears in the text. */
  order: T[];
}

/**
 * Brings text and attachments into agreement: a token whose attachment is gone
 * is deleted, and an attachment without a token gets one. The
 * token replaces the attachment's reference when the text already has it (a
 * restored message), and otherwise lands at `insertAt`.
 */
export function reconcileInlineTokens<T>({
  text,
  items,
  insertAt,
  consumedUrls = [],
}: ReconcileInlineTokensInput<T>): ReconcileInlineTokensResult<T> {
  let nextText = text;
  let caret = insertAt;
  let cursor: number | null = null;
  const replace = (start: number, end: number, value: string) => {
    nextText = nextText.slice(0, start) + value + nextText.slice(end);
    if (caret >= end) caret += value.length - (end - start);
    else if (caret > start) caret = start + value.length;
  };

  const tokens = parseInlineTokens(nextText);
  const paired = pairInlineTokens(tokens, items, (entry) => entry.label);
  for (let index = tokens.length - 1; index >= 0; index--) {
    const token = tokens[index];
    if (!token || paired[index]) continue;
    // Take the space that padded the token too, so no double space is left.
    const end = nextText[token.end] === " " ? token.end + 1 : token.end;
    replace(token.start, end, "");
  }

  const pairedItems = new Set(paired);
  for (const entry of items) {
    if (pairedItems.has(entry)) continue;
    const token = createInlineToken(entry.label);
    const referenceAt = nextText.indexOf(entry.reference);
    if (referenceAt >= 0) {
      replace(referenceAt, referenceAt + entry.reference.length, token);
      continue;
    }
    const urlRange = entry.url ? findUrlRange(nextText, entry.url) : null;
    if (urlRange) {
      replace(urlRange.start, urlRange.end, token);
      cursor = caret;
      continue;
    }
    const insertion = insertInlineToken(nextText, token, caret);
    nextText = insertion.text;
    caret = insertion.cursor;
    cursor = insertion.cursor;
  }

  for (const url of consumedUrls) {
    const range = findUrlRange(nextText, url);
    if (!range) continue;
    // Take one adjacent space too, so no double space is left.
    const end = nextText[range.end] === " " ? range.end + 1 : range.end;
    const start =
      end === range.end && nextText[range.start - 1] === " " ? range.start - 1 : range.start;
    replace(start, end, "");
    cursor = caret;
  }

  const finalTokens = parseInlineTokens(nextText);
  const finalPairs = pairInlineTokens(finalTokens, items, (entry) => entry.label);
  const order = finalPairs.flatMap((entry) => (entry ? [entry.item] : []));
  return { text: nextText, cursor, order };
}

/**
 * Finds a pasted copy of `url`, including a trailing subpath, query, or hash
 * (`.../pull/3/files`), but not a longer id (`.../pull/30`).
 */
function findUrlRange(text: string, url: string): { start: number; end: number } | null {
  const base = url.replace(/\/+$/, "");
  const lowerText = text.toLowerCase();
  const lowerBase = base.toLowerCase();
  for (let start = lowerText.indexOf(lowerBase); start >= 0; ) {
    const next = text[start + base.length];
    if (next === undefined || /[\s/?#]/.test(next)) {
      let end = start + base.length;
      while (end < text.length && !/\s/.test(text[end] ?? "")) end++;
      while (end > start + base.length && /[.,;:!)\]]/.test(text[end - 1] ?? "")) end--;
      return { start, end };
    }
    start = lowerText.indexOf(lowerBase, start + 1);
  }
  return null;
}

/** Replaces each token with its attachment's reference, for the message the agent reads. */
export function serializeInlineTokens<T>(
  text: string,
  items: readonly InlineAttachmentItem<T>[],
): string {
  const tokens = parseInlineTokens(text);
  if (tokens.length === 0) return text;
  const paired = pairInlineTokens(tokens, items, (entry) => entry.label);
  let result = "";
  let cursor = 0;
  tokens.forEach((token, index) => {
    result += text.slice(cursor, token.start);
    result += paired[index]?.reference ?? readInlineLabel(token.label);
    cursor = token.end;
  });
  return result + text.slice(cursor);
}
