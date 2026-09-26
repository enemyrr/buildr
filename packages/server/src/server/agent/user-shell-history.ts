import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { writeJsonFileAtomic } from "../atomic-file.js";
import type { AgentStreamEvent, AgentTimelineItem } from "./agent-sdk-types.js";

// Oldest entries drop first, so one agent's file stays bounded.
const MAX_ENTRIES_PER_AGENT = 200;

export interface UserShellHistoryEntry {
  timestamp: string;
  item: AgentTimelineItem;
}

type TimelineEvent = Extract<AgentStreamEvent, { type: "timeline" }>;

const UserShellHistoryFileSchema = z.object({
  entries: z.array(
    z.object({
      timestamp: z.string(),
      item: z.object({ type: z.literal("tool_call") }).passthrough(),
    }),
  ),
});

// Provider history doesn't include `!` commands the user ran from the composer, and the
// daemon's timeline lives in memory. This keeps finished commands on disk so a timeline
// rebuilt from provider history can put them back.
export class UserShellHistoryStore {
  private readonly writes = new Map<string, Promise<void>>();

  constructor(private readonly directory: string) {}

  async list(agentId: string): Promise<UserShellHistoryEntry[]> {
    await this.writes.get(agentId);
    return this.read(agentId);
  }

  append(agentId: string, entry: UserShellHistoryEntry): Promise<void> {
    return this.enqueue(agentId, async () => {
      const entries = [...(await this.read(agentId)), entry];
      await this.write(agentId, entries.slice(-MAX_ENTRIES_PER_AGENT));
    });
  }

  // Drops entries newer than `timestamp`; rewind uses it to forget commands it undid.
  pruneAfter(agentId: string, timestamp: string): Promise<void> {
    return this.enqueue(agentId, async () => {
      const entries = await this.read(agentId);
      const cutoff = Date.parse(timestamp);
      const kept = entries.filter((entry) => Date.parse(entry.timestamp) <= cutoff);
      if (kept.length !== entries.length) await this.write(agentId, kept);
    });
  }

  delete(agentId: string): Promise<void> {
    return this.enqueue(agentId, () => fs.rm(this.filePath(agentId), { force: true }));
  }

  private enqueue(agentId: string, task: () => Promise<void>): Promise<void> {
    const next = (this.writes.get(agentId) ?? Promise.resolve()).then(task, task);
    this.writes.set(
      agentId,
      next.catch(() => undefined),
    );
    return next;
  }

  private filePath(agentId: string): string {
    return path.join(this.directory, `${agentId}.json`);
  }

  private async read(agentId: string): Promise<UserShellHistoryEntry[]> {
    let raw: string;
    try {
      raw = await fs.readFile(this.filePath(agentId), "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    const parsed = UserShellHistoryFileSchema.parse(JSON.parse(raw));
    // The schema only checks the envelope; entries are written from AgentTimelineItem.
    return parsed.entries as UserShellHistoryEntry[];
  }

  private async write(agentId: string, entries: UserShellHistoryEntry[]): Promise<void> {
    await writeJsonFileAtomic(this.filePath(agentId), { entries });
  }
}

// Places each entry before the first history event that is newer than it. Events without
// a timestamp stay with the event before them, and entries newer than everything go last.
export function mergeUserShellHistory(
  history: TimelineEvent[],
  entries: UserShellHistoryEntry[],
  provider: TimelineEvent["provider"],
): TimelineEvent[] {
  if (entries.length === 0) return history;
  const pending = entries
    .map((entry) => ({ entry, time: Date.parse(entry.timestamp) }))
    .sort((a, b) => a.time - b.time);
  const toEvent = ({ entry }: (typeof pending)[number]): TimelineEvent => ({
    type: "timeline",
    provider,
    item: entry.item,
    timestamp: entry.timestamp,
  });
  const merged: TimelineEvent[] = [];
  let next = 0;
  for (const event of history) {
    const time = event.timestamp ? Date.parse(event.timestamp) : Number.NaN;
    while (next < pending.length && pending[next].time < time) {
      merged.push(toEvent(pending[next]));
      next += 1;
    }
    merged.push(event);
  }
  return [...merged, ...pending.slice(next).map(toEvent)];
}
