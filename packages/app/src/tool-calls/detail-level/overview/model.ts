import type { AssistantMessageItem, ThoughtItem, TodoListItem, ToolCallItem } from "@/types/stream";
import { resolveToolCallIconName, type ToolCallIcon } from "@/utils/tool-call-icon-name";
import { describeToolCall, type ToolCallRun } from "../grouping";

/** One row inside an expanded turn group. Consecutive calls to the same tool share a row. */
export type TurnActivityEntry =
  | { kind: "tools"; id: string; name: string; calls: readonly ToolCallItem[] }
  | { kind: "thought"; id: string; item: ThoughtItem }
  | { kind: "message"; id: string; item: AssistantMessageItem }
  | { kind: "todo"; id: string; item: TodoListItem };

export interface OverviewToolCallGroup {
  mode: "overview";
  run: ToolCallRun;
  entries: readonly TurnActivityEntry[];
  toolCallCount: number;
  messageCount: number;
  errorCount: number;
  /** Distinct tool icons in first-use order. */
  iconNames: readonly ToolCallIcon[];
  isLoading: boolean;
}

const MAX_HEADER_ICONS = 6;

function normalizeToolName(name: string): string {
  return name.trim().toLowerCase();
}

export function buildTurnActivityEntries(
  items: ToolCallRun["items"],
): readonly TurnActivityEntry[] {
  const entries: TurnActivityEntry[] = [];
  let openCalls: ToolCallItem[] | null = null;
  let openName: string | null = null;
  for (const item of items) {
    if (item.kind === "tool_call") {
      const descriptor = describeToolCall(item);
      const name = normalizeToolName(descriptor.name);
      // A described shell call is its own row; merging would hide what each one was for.
      const isDescribed =
        descriptor.detail.type === "shell" && Boolean(descriptor.detail.description);
      if (!isDescribed && openCalls && openName === name) {
        openCalls.push(item);
        continue;
      }
      openCalls = isDescribed ? null : [item];
      openName = isDescribed ? null : name;
      entries.push({ kind: "tools", id: item.id, name, calls: openCalls ?? [item] });
      continue;
    }
    openCalls = null;
    openName = null;
    if (item.kind === "thought") {
      entries.push({ kind: "thought", id: item.id, item });
    } else if (item.kind === "assistant_message") {
      entries.push({ kind: "message", id: item.id, item });
    } else if (item.kind === "todo_list") {
      entries.push({ kind: "todo", id: item.id, item });
    }
  }
  return entries;
}

export function buildOverviewGroup(run: ToolCallRun): OverviewToolCallGroup {
  const iconNames: ToolCallIcon[] = [];
  const messageIds = new Set<string>();
  let isLoading = !run.isSealed;
  let errorCount = 0;

  for (const call of run.calls) {
    const descriptor = describeToolCall(call);
    isLoading ||= descriptor.status === "running" || descriptor.status === "executing";
    if (descriptor.status === "failed") {
      errorCount += 1;
    }
    const icon = resolveToolCallIconName(descriptor.name, descriptor.detail);
    if (iconNames.length < MAX_HEADER_ICONS && !iconNames.includes(icon)) {
      iconNames.push(icon);
    }
  }
  for (const item of run.items) {
    if (item.kind === "assistant_message") {
      messageIds.add(item.blockGroupId ?? item.id);
    }
  }

  return {
    mode: "overview",
    run,
    entries: buildTurnActivityEntries(run.items),
    toolCallCount: run.calls.length,
    messageCount: messageIds.size,
    errorCount,
    iconNames,
    isLoading,
  };
}
