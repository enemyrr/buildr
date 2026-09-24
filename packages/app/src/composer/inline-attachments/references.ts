// A sent message names each inline attachment with a plain-text reference the
// agent reads. The chat timeline finds the same references to draw them as chips.

/** Images carry no name the agent can see, so `[Image #2]` is the second image sent. */
export function formatImageReference(position: number): string {
  return `[Image #${position}]`;
}

export function formatAttachmentReference(label: string): string {
  return `[${label}]`;
}

export type MessageReferenceSegment =
  | { kind: "text"; text: string; start: number }
  | { kind: "reference"; text: string; start: number; index: number };

/**
 * Splits a message around each occurrence of the given references. `index`
 * points into `references`. A longer reference wins over one it starts with.
 */
export function splitMessageReferences(
  text: string,
  references: readonly string[],
): MessageReferenceSegment[] {
  const candidates = references
    .filter((reference) => reference.length > 0 && text.includes(reference))
    .sort((a, b) => b.length - a.length);
  if (candidates.length === 0) return [{ kind: "text", text, start: 0 }];

  // Alternation tries the longest reference first at each offset.
  const pattern = new RegExp(candidates.map(escapeRegExp).join("|"), "g");
  const segments: MessageReferenceSegment[] = [];
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > cursor) {
      segments.push({ kind: "text", text: text.slice(cursor, match.index), start: cursor });
    }
    const reference = match[0];
    const index = references.indexOf(reference);
    segments.push({ kind: "reference", text: reference, start: match.index, index });
    cursor = match.index + reference.length;
  }
  if (cursor < text.length) {
    segments.push({ kind: "text", text: text.slice(cursor), start: cursor });
  }
  return segments;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
