import type { ToolCallDetail } from "@getpaseo/protocol/agent-types";
import { computeToolCallLineStats } from "@getpaseo/protocol/tool-call-line-stats";
import type { AgentTimelineItem } from "./agent-sdk-types.js";

// Smaller details stay inline so expanding them needs no round trip.
const INLINE_DETAIL_MAX_CHARS = 2048;

interface CompactedDetail {
  detail: ToolCallDetail;
  omittedChars: number;
}

// Bodies the collapsed row never shows. `undefined` drops the field; other values replace
// fields the schema requires.
const OMITTED_FIELDS: Partial<Record<ToolCallDetail["type"], Record<string, unknown>>> = {
  shell: { output: undefined },
  read: { content: undefined },
  write: { content: undefined },
  edit: { oldString: undefined, newString: undefined, unifiedDiff: undefined },
  search: { content: undefined, filePaths: undefined },
  fetch: { result: undefined },
  sub_agent: { log: "" },
  unknown: { output: null },
};

function valueChars(value: unknown): number {
  if (value === null || value === undefined) return 0;
  return typeof value === "string" ? value.length : (JSON.stringify(value)?.length ?? 0);
}

/** Returns null when the detail has no body to drop. */
function compactDetail(detail: ToolCallDetail): CompactedDetail | null {
  const replacements = OMITTED_FIELDS[detail.type];
  if (!replacements) return null;
  const compacted: Record<string, unknown> = { ...detail };
  let omittedChars = 0;
  for (const [field, replacement] of Object.entries(replacements)) {
    omittedChars += valueChars(compacted[field]);
    if (replacement === undefined) delete compacted[field];
    else compacted[field] = replacement;
  }
  return omittedChars > 0 ? { detail: compacted as ToolCallDetail, omittedChars } : null;
}

/**
 * Replaces large tool call bodies with `detailOmitted` for clients that load them on demand.
 * User shell commands keep their output because they render expanded.
 */
export function compactToolCallItem(item: AgentTimelineItem): AgentTimelineItem {
  if (item.type !== "tool_call" || item.metadata?.userShell === true) return item;
  const compacted = compactDetail(item.detail);
  if (!compacted || compacted.omittedChars <= INLINE_DETAIL_MAX_CHARS) return item;
  const lineStats = computeToolCallLineStats(item.detail);
  return {
    ...item,
    detail: compacted.detail,
    detailOmitted: true,
    ...(lineStats ? { lineStats } : {}),
  };
}
