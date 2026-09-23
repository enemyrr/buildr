import type { ToolCallDetail } from "@getpaseo/protocol/agent-types";
import type { StreamItem, ToolCallItem } from "@/types/stream";
import type { StreamStrategy } from "./strategy";
import { continuesResponse } from "./turn-membership";

export interface TurnFileChange {
  filePath: string;
  fileName: string;
  additions: number;
  deletions: number;
}

interface LineDiffStat {
  additions: number;
  deletions: number;
}

function splitLines(text: string | undefined): string[] {
  if (!text) return [];
  const lines = text.split("\n");
  if (lines.at(-1) === "") lines.pop();
  return lines;
}

function countUnifiedDiff(diff: string): LineDiffStat {
  let additions = 0;
  let deletions = 0;
  for (const line of diff.split("\n")) {
    if (line.startsWith("+") && !line.startsWith("+++")) additions += 1;
    else if (line.startsWith("-") && !line.startsWith("---")) deletions += 1;
  }
  return { additions, deletions };
}

/** Lines only on one side, matched as a multiset. Close to `git diff --stat` for edit hunks. */
function countReplacement(before: string[], after: string[]): LineDiffStat {
  const remaining = new Map<string, number>();
  for (const line of before) {
    remaining.set(line, (remaining.get(line) ?? 0) + 1);
  }
  let additions = 0;
  for (const line of after) {
    const count = remaining.get(line) ?? 0;
    if (count > 0) remaining.set(line, count - 1);
    else additions += 1;
  }
  let deletions = 0;
  for (const count of remaining.values()) deletions += count;
  return { additions, deletions };
}

export function computeLineDiffStat(detail: ToolCallDetail): LineDiffStat | null {
  if (detail.type === "write") {
    return { additions: splitLines(detail.content).length, deletions: 0 };
  }
  if (detail.type !== "edit") {
    return null;
  }
  if (detail.unifiedDiff) {
    return countUnifiedDiff(detail.unifiedDiff);
  }
  return countReplacement(splitLines(detail.oldString), splitLines(detail.newString));
}

function fileNameOf(filePath: string): string {
  return filePath.split(/[\\/]/).findLast((part) => part.length > 0) ?? filePath;
}

/** Files written by successful edit/write calls, in first-touched order. */
export function collectTurnFileChanges(calls: readonly ToolCallItem[]): TurnFileChange[] {
  const byPath = new Map<string, TurnFileChange>();
  for (const call of calls) {
    if (call.payload.source !== "agent") continue;
    const { detail, status } = call.payload.data;
    if (status === "failed" || status === "canceled") continue;
    if (detail.type !== "edit" && detail.type !== "write") continue;
    const stat = computeLineDiffStat(detail);
    if (!stat) continue;
    const existing = byPath.get(detail.filePath);
    if (existing) {
      existing.additions += stat.additions;
      existing.deletions += stat.deletions;
      continue;
    }
    byPath.set(detail.filePath, {
      filePath: detail.filePath,
      fileName: fileNameOf(detail.filePath),
      ...stat,
    });
  }
  return [...byPath.values()];
}

/**
 * Tool calls of the response around `startIndex`, in chronological order. Group hosts stand in
 * for their members, so `expand` returns the calls a row represents.
 */
export function collectResponseToolCalls(input: {
  strategy: Pick<StreamStrategy, "getNeighborIndex">;
  items: StreamItem[];
  startIndex: number;
  expand: (item: ToolCallItem) => readonly ToolCallItem[];
}): ToolCallItem[] {
  const above: StreamItem[] = [];
  let later: StreamItem | null = null;
  for (
    let index = input.startIndex;
    index >= 0 && index < input.items.length;
    index = input.strategy.getNeighborIndex(index, "above")
  ) {
    const item = input.items[index];
    if (!item || (later && !continuesResponse(item, later))) break;
    above.push(item);
    later = item;
  }
  const below: StreamItem[] = [];
  let earlier = input.items[input.startIndex] ?? null;
  for (
    let index = input.strategy.getNeighborIndex(input.startIndex, "below");
    index >= 0 && index < input.items.length;
    index = input.strategy.getNeighborIndex(index, "below")
  ) {
    const item = input.items[index];
    if (!item || !continuesResponse(earlier, item)) break;
    below.push(item);
    earlier = item;
  }
  const calls: ToolCallItem[] = [];
  for (const item of [...above.toReversed(), ...below]) {
    if (item.kind === "tool_call") calls.push(...input.expand(item));
  }
  return calls;
}
