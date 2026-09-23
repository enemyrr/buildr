export interface TextSegment {
  kind: "text" | "link";
  text: string;
  start: number;
  end: number;
}

// Only explicit http(s) URLs. Fuzzy matching would link file names such as
// `client.ts`, because `.ts` is a top-level domain.
const URL_PATTERN = /\bhttps?:\/\/[^\s<>"'`]+/g;
const TRAILING_PUNCTUATION = /[.,;:!?'"*_~]+$/;
const OPENING_BRACKET: Record<string, string> = { ")": "(", "]": "[", "}": "{" };

function trimUrl(url: string): string {
  let trimmed = url.replace(TRAILING_PUNCTUATION, "");
  // Keep balanced parentheses, as in Wikipedia URLs, but drop a closing one
  // that belongs to surrounding prose.
  for (;;) {
    const close = trimmed.at(-1) ?? "";
    const open = OPENING_BRACKET[close];
    if (!open) break;
    const opens = trimmed.split(open).length - 1;
    const closes = trimmed.split(close).length - 1;
    if (closes <= opens) break;
    trimmed = trimmed.slice(0, -1).replace(TRAILING_PUNCTUATION, "");
  }
  return trimmed;
}

/** Splits text into plain and link segments. Returns a single text segment when there are no links. */
export function splitTextLinks(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let cursor = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    const url = trimUrl(match[0]);
    if (!url.includes("://") || url.endsWith("://")) continue;
    const start = match.index;
    const end = start + url.length;
    if (start > cursor) {
      segments.push({ kind: "text", text: text.slice(cursor, start), start: cursor, end: start });
    }
    segments.push({ kind: "link", text: url, start, end });
    cursor = end;
  }
  if (cursor < text.length || segments.length === 0) {
    segments.push({ kind: "text", text: text.slice(cursor), start: cursor, end: text.length });
  }
  return segments;
}

export function hasTextLinks(text: string): boolean {
  return splitTextLinks(text).some((segment) => segment.kind === "link");
}

/** Returns the URL whose range contains the offset, or null. */
export function findTextLinkAt(text: string, offset: number): string | null {
  const link = splitTextLinks(text).find(
    (segment) => segment.kind === "link" && offset >= segment.start && offset <= segment.end,
  );
  return link?.text ?? null;
}
