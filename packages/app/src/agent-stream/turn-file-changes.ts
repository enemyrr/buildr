import { computeToolCallLineStats } from "@getpaseo/protocol/tool-call-line-stats";
import type { StreamItem, ToolCallItem } from "@/types/stream";
import type { StreamStrategy } from "./strategy";
import { continuesResponse } from "./turn-membership";

export interface TurnFileChange {
  filePath: string;
  fileName: string;
  additions: number;
  deletions: number;
}

function fileNameOf(filePath: string): string {
  return filePath.split(/[\\/]/).findLast((part) => part.length > 0) ?? filePath;
}

/** Files written by successful edit/write calls, in first-touched order. */
export function collectTurnFileChanges(calls: readonly ToolCallItem[]): TurnFileChange[] {
  const byPath = new Map<string, TurnFileChange>();
  for (const call of calls) {
    if (call.payload.source !== "agent") continue;
    const { detail, status, lineStats } = call.payload.data;
    if (status === "failed" || status === "canceled") continue;
    if (detail.type !== "edit" && detail.type !== "write") continue;
    const stat = lineStats ?? computeToolCallLineStats(detail);
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
