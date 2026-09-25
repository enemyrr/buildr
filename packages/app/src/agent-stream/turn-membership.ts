import type { StreamItem } from "@/types/stream";

/** A command the user ran with `!` from the composer. */
export function isUserShellCall(item: StreamItem): boolean {
  return (
    item.kind === "tool_call" &&
    item.payload.source === "agent" &&
    item.payload.data.metadata?.userShell === true
  );
}

// Shell calls carry no turn ID, so they open a turn the way a user message does.
function startsUserTurn(item: StreamItem): boolean {
  return item.kind === "user_message" || isUserShellCall(item);
}

/**
 * Canonical turn IDs take precedence. Timelines without them retain the legacy
 * user-message boundary rule so old daemons and persisted rows need no rewrite.
 */
export function continuesTurn(previous: StreamItem | null, next: StreamItem | null): boolean {
  if (!previous || !next) return false;
  if (previous.turnId !== undefined && next.turnId !== undefined) {
    return previous.turnId === next.turnId;
  }
  return !startsUserTurn(next);
}

/**
 * A visible response can span multiple canonical turns when their prompts are
 * system-injected and therefore absent from the Paseo timeline.
 */
export function continuesResponse(previous: StreamItem | null, next: StreamItem | null): boolean {
  if (!previous || !next) return false;
  return continuesTurn(previous, next) || !startsUserTurn(next);
}

export function isTurnBoundary(previous: StreamItem | null, next: StreamItem | null): boolean {
  return previous !== null && next !== null && !continuesTurn(previous, next);
}

export function isResponseBoundary(previous: StreamItem | null, next: StreamItem | null): boolean {
  return previous !== null && next !== null && !continuesResponse(previous, next);
}

/** Whether `item` begins a new chronological turn after `previous`. */
export function startsNewTurn(item: StreamItem, previous: StreamItem | null): boolean {
  return previous === null || isTurnBoundary(previous, item);
}

export function belongsToTurn(item: StreamItem, turnId: string | null): boolean {
  return turnId !== null && item.turnId === turnId;
}
