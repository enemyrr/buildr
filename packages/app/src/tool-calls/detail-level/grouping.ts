import type { ToolCallDetail } from "@getpaseo/protocol/agent-types";
import type { StreamItem, ToolCallItem } from "@/types/stream";
import { continuesTurn } from "@/agent-stream/turn-membership";

export interface ToolCallDescriptor {
  detail: ToolCallDetail;
  name: string;
  status: "executing" | "running" | "completed" | "failed" | "canceled";
  error: unknown;
  metadata?: Record<string, unknown>;
}

/**
 * The activity of one turn folded into a single row: tool calls, thoughts, todo updates, and
 * the assistant text between them. The turn's final assistant text is never a member; it stays
 * in the stream so the answer is always visible.
 */
export interface ToolCallRun {
  id: string;
  items: readonly StreamItem[];
  calls: readonly ToolCallItem[];
  latest: ToolCallItem;
  isSealed: boolean;
}

interface OpenSegment {
  items: readonly StreamItem[];
  run: ToolCallRun | null;
  /** Assistant text after the run was emitted into the tail, so the run cannot grow in place. */
  hasTrailing: boolean;
}

export interface GroupedHistory<TGroup> {
  tail: StreamItem[];
  groupsByHostId: Map<string, TGroup>;
  /** The segment still open at the end of the tail, which the live head may extend. */
  open: OpenSegment | null;
  /** Unsealed variant of `open`, cached so live-head ticks keep group identity. */
  liveVariant?: { groupsByHostId: Map<string, TGroup>; updates: Map<string, TGroup> };
}

export interface GroupedToolCalls<TGroup> {
  tail: StreamItem[];
  head: StreamItem[];
  groupsByHostId: ToolCallGroupLookup<TGroup>;
  historyGroupUpdatesByHostId: ToolCallGroupLookup<TGroup>;
}

export interface ToolCallGroupLookup<TGroup> {
  readonly size: number;
  get(id: string): TGroup | undefined;
  has(id: string): boolean;
}

const EMPTY_GROUPS = new Map<string, never>();

export function describeToolCall(item: ToolCallItem): ToolCallDescriptor {
  if (item.payload.source === "agent") {
    const { data } = item.payload;
    return {
      detail: data.detail,
      name: data.name,
      status: data.status,
      error: data.error,
      metadata: data.metadata,
    };
  }

  const { data } = item.payload;
  return {
    detail: {
      type: "unknown",
      input: data.arguments ?? null,
      output: data.result ?? null,
    },
    name: data.toolName,
    status: data.status,
    error: data.error,
  };
}

export function isGroupableToolCall(item: StreamItem): item is ToolCallItem {
  if (item.kind !== "tool_call") {
    return false;
  }
  const descriptor = describeToolCall(item);
  return descriptor.detail.type !== "plan" && descriptor.name.trim().toLowerCase() !== "speak";
}

function isRunMember(item: StreamItem): boolean {
  return (
    isGroupableToolCall(item) ||
    item.kind === "thought" ||
    item.kind === "todo_list" ||
    item.kind === "assistant_message"
  );
}

function isRunning(call: ToolCallItem): boolean {
  const status = describeToolCall(call).status;
  return status === "running" || status === "executing";
}

/** Everything up to the last non-text member; the text after it is the turn's answer so far. */
function splitTrailingText(segment: readonly StreamItem[]): number {
  let end = segment.length;
  while (end > 0 && segment[end - 1]?.kind === "assistant_message") {
    end -= 1;
  }
  return end;
}

function createRun(items: readonly StreamItem[], isSealed: boolean): ToolCallRun | null {
  const calls = items.filter(isGroupableToolCall);
  const first = calls[0];
  const latest = calls.at(-1);
  if (!first || !latest) {
    return null;
  }
  return { id: first.id, items, calls, latest, isSealed };
}

function createHost(run: ToolCallRun): ToolCallItem {
  if (run.items.length === 1) {
    return run.latest;
  }
  return { ...run.latest, id: run.id };
}

interface Segmented<TGroup> {
  output: StreamItem[];
  groups: Map<string, TGroup>;
  open: OpenSegment | null;
}

/**
 * Folds each turn's contiguous activity into one host row. `isLastSealed` decides whether the
 * segment still open at the end of `items` is built sealed.
 */
function segmentItems<TGroup>(input: {
  items: readonly StreamItem[];
  buildGroup: (run: ToolCallRun) => TGroup;
  isLastSealed: (run: ToolCallRun) => boolean;
}): Segmented<TGroup> {
  const output: StreamItem[] = [];
  const groups = new Map<string, TGroup>();
  let segment: StreamItem[] = [];

  const flush = (isLast: boolean): OpenSegment | null => {
    if (segment.length === 0) {
      return null;
    }
    const items = segment;
    segment = [];
    const end = splitTrailingText(items);
    const draft = createRun(items.slice(0, end), true);
    if (!draft) {
      output.push(...items);
      return { items, run: null, hasTrailing: true };
    }
    const run = isLast && !input.isLastSealed(draft) ? { ...draft, isSealed: false } : draft;
    output.push(createHost(run), ...items.slice(end));
    groups.set(run.id, input.buildGroup(run));
    return { items, run, hasTrailing: end < items.length };
  };

  for (const item of input.items) {
    const previous = segment.at(-1) ?? null;
    if (isRunMember(item)) {
      if (previous && !continuesTurn(previous, item)) {
        flush(false);
      }
      segment.push(item);
      continue;
    }
    flush(false);
    output.push(item);
  }
  const open = flush(true);
  return { output, groups, open };
}

export function prepareGroupedHistory<TGroup>(input: {
  tail: StreamItem[];
  buildGroup: (run: ToolCallRun) => TGroup;
}): GroupedHistory<TGroup> {
  const segmented = segmentItems({
    items: input.tail,
    buildGroup: input.buildGroup,
    isLastSealed: () => true,
  });
  return {
    tail: segmented.groups.size > 0 ? segmented.output : input.tail,
    groupsByHostId: segmented.groups,
    open: segmented.open,
  };
}

/** Head members that extend the tail's open run in place, and where the rest of the head begins. */
function absorbHeadPrefix(
  open: OpenSegment,
  head: readonly StreamItem[],
): { absorbed: StreamItem[]; restStart: number } {
  let previous = open.items.at(-1) ?? null;
  let index = 0;
  for (; index < head.length; index += 1) {
    const item = head[index]!;
    if (!isRunMember(item) || !continuesTurn(previous, item)) {
      break;
    }
    previous = item;
  }
  const end = splitTrailingText(head.slice(0, index));
  return { absorbed: head.slice(0, end), restStart: end };
}

type HistoryRunUpdate<TGroup> =
  | { kind: "none" }
  | { kind: "unsealed" }
  | { kind: "extended"; id: string; group: TGroup };

/** How the live head changes the tail's open run: untouched, reopened, or extended in place. */
function resolveHistoryRunUpdate<TGroup>(input: {
  open: OpenSegment | null;
  absorbed: readonly StreamItem[];
  isLast: boolean;
  isRunLive: (run: ToolCallRun) => boolean;
  buildGroup: (run: ToolCallRun) => TGroup;
}): HistoryRunUpdate<TGroup> {
  const run = input.open?.run;
  if (!run) {
    return { kind: "none" };
  }
  if (input.absorbed.length === 0) {
    return input.isLast && input.isRunLive(run) ? { kind: "unsealed" } : { kind: "none" };
  }
  const extended = createRun([...run.items, ...input.absorbed], true);
  if (!extended) {
    return { kind: "none" };
  }
  const isSealed = !(input.isLast && input.isRunLive(extended));
  return { kind: "extended", id: run.id, group: input.buildGroup({ ...extended, isSealed }) };
}

function getLiveVariant<TGroup>(
  history: GroupedHistory<TGroup>,
  run: ToolCallRun,
  buildGroup: (run: ToolCallRun) => TGroup,
): NonNullable<GroupedHistory<TGroup>["liveVariant"]> {
  if (!history.liveVariant) {
    const group = buildGroup({ ...run, isSealed: false });
    history.liveVariant = {
      groupsByHostId: new Map(history.groupsByHostId).set(run.id, group),
      updates: new Map([[run.id, group]]),
    };
  }
  return history.liveVariant;
}

export function groupLiveToolCalls<TGroup>(input: {
  history: GroupedHistory<TGroup>;
  head: StreamItem[];
  isTurnActive: boolean;
  buildGroup: (run: ToolCallRun) => TGroup;
}): GroupedToolCalls<TGroup> {
  const { history } = input;
  const open = history.open;
  const isRunLive = (run: ToolCallRun) => input.isTurnActive || run.calls.some(isRunning);

  const { absorbed, restStart } =
    open?.run && !open.hasTrailing
      ? absorbHeadPrefix(open, input.head)
      : { absorbed: [], restStart: 0 };
  const headSegmented = segmentItems({
    items: restStart === 0 ? input.head : input.head.slice(restStart),
    buildGroup: input.buildGroup,
    isLastSealed: (run) => !isRunLive(run),
  });
  const head = headSegmented.groups.size > 0 || restStart > 0 ? headSegmented.output : input.head;
  const update = resolveHistoryRunUpdate({
    open,
    absorbed,
    isLast: headSegmented.groups.size === 0,
    isRunLive,
    buildGroup: input.buildGroup,
  });

  if (update.kind === "unsealed" && open?.run) {
    const variant = getLiveVariant(history, open.run, input.buildGroup);
    return {
      tail: history.tail,
      head,
      groupsByHostId: variant.groupsByHostId,
      historyGroupUpdatesByHostId: variant.updates,
    };
  }
  if (update.kind !== "extended" && headSegmented.groups.size === 0) {
    return {
      tail: history.tail,
      head,
      groupsByHostId: history.groupsByHostId,
      historyGroupUpdatesByHostId: EMPTY_GROUPS,
    };
  }

  const groupsByHostId = new Map([...history.groupsByHostId, ...headSegmented.groups]);
  if (update.kind !== "extended") {
    return { tail: history.tail, head, groupsByHostId, historyGroupUpdatesByHostId: EMPTY_GROUPS };
  }
  groupsByHostId.set(update.id, update.group);
  return {
    tail: history.tail,
    head,
    groupsByHostId,
    historyGroupUpdatesByHostId: new Map([[update.id, update.group]]),
  };
}
