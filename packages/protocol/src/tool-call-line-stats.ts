import type { ToolCallDetail, ToolCallLineStats } from "./agent-types.js";

function splitLines(text: string | undefined): string[] {
  if (!text) return [];
  const lines = text.split("\n");
  if (lines.at(-1) === "") lines.pop();
  return lines;
}

function countUnifiedDiff(diff: string): ToolCallLineStats {
  let additions = 0;
  let deletions = 0;
  for (const line of diff.split("\n")) {
    if (line.startsWith("+") && !line.startsWith("+++")) additions += 1;
    else if (line.startsWith("-") && !line.startsWith("---")) deletions += 1;
  }
  return { additions, deletions };
}

/** Lines only on one side, matched as a multiset. Close to `git diff --stat` for edit hunks. */
function countReplacement(before: string[], after: string[]): ToolCallLineStats {
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

export function computeToolCallLineStats(detail: ToolCallDetail): ToolCallLineStats | null {
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
