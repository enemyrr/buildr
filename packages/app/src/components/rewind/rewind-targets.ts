import type { SessionState } from "@/stores/session-store";
import type { StreamItem } from "@/types/stream";

export interface RewindTarget {
  messageId: string;
  prompt: string;
}

/** Newest first. Only messages the provider acknowledged carry a `messageId` to rewind to. */
export function buildRewindTargets(items: readonly StreamItem[]): RewindTarget[] {
  const targets: RewindTarget[] = [];
  for (const item of items) {
    if (item.kind !== "user_message" || !item.messageId) continue;
    const prompt = item.text.trim();
    if (prompt.length > 0) targets.push({ messageId: item.messageId, prompt });
  }
  return targets.toReversed();
}

export function selectRewindTargets(
  session: SessionState | undefined,
  agentId: string,
): RewindTarget[] {
  if (!session) return [];
  const tail = session.agentStreamTail.get(agentId) ?? [];
  const head = session.agentStreamHead.get(agentId) ?? [];
  return buildRewindTargets([...tail, ...head]);
}
