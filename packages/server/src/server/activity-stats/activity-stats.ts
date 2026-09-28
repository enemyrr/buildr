import { readFile } from "node:fs/promises";
import type { Logger } from "pino";
import { z } from "zod";
import type { ActivityStats, ActivityStatsDay } from "@getpaseo/protocol/messages";
import type { AgentManager } from "../agent/agent-manager.js";
import type { AgentUsage } from "../agent/agent-sdk-types.js";
import type { StoredAgentRecord } from "../agent/agent-storage.js";
import { writeJsonFileAtomic } from "../atomic-file.js";
import {
  resolveProjectDisplayName,
  type PersistedProjectRecord,
  type PersistedWorkspaceRecord,
} from "../workspace-registry.js";

const FLUSH_DELAY_MS = 30_000;
// A heartbeat gap longer than this means the app was asleep or disconnected.
const MAX_PRESENCE_GAP_MS = 60_000;
// Visible but untouched for this long no longer counts as time in the app.
const IDLE_AFTER_MS = 5 * 60_000;

const StoredDaySchema = z.object({
  prompts: z.number().default(0),
  turns: z.number().default(0),
  tokens: z.number().default(0),
  activeMs: z.number().default(0),
});

const StoredModelSchema = z.object({
  provider: z.string(),
  model: z.string().nullable(),
  prompts: z.number().default(0),
  turns: z.number().default(0),
});

const StoredActivityStatsSchema = z.object({
  version: z.literal(1),
  trackingSince: z.string(),
  days: z.record(z.string(), StoredDaySchema).default({}),
  promptsByHour: z.array(z.number()).default([]),
  models: z.record(z.string(), StoredModelSchema).default({}),
});

type StoredActivityStats = z.infer<typeof StoredActivityStatsSchema>;
type StoredDay = z.infer<typeof StoredDaySchema>;

export interface ActivityStatsSources {
  listAgents(): Promise<StoredAgentRecord[]>;
  listWorkspaces(): Promise<PersistedWorkspaceRecord[]>;
  listProjects(): Promise<PersistedProjectRecord[]>;
}

type AgentLookup = Pick<AgentManager, "getAgent">;

export function toLocalDayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function modelKey(provider: string, model: string | null): string {
  return `${provider}\u0000${model ?? ""}`;
}

function emptyStats(now: Date): StoredActivityStats {
  return { version: 1, trackingSince: now.toISOString(), days: {}, promptsByHour: [], models: {} };
}

/**
 * Daily activity counters for the analytics page. Prompts, turns, tokens, and time in the app are
 * tracked live from the moment the store first exists; agent counts and first use come from agent
 * records so they cover history from before tracking started.
 */
export class ActivityStatsService {
  private state: StoredActivityStats | null = null;
  private flushTimer: NodeJS.Timeout | null = null;
  private lastPresenceAtMs: number | null = null;
  private unsubscribe: (() => void) | null = null;

  constructor(
    private readonly options: {
      filePath: string;
      logger: Logger;
      sources: ActivityStatsSources;
      now?: () => Date;
    },
  ) {}

  private now(): Date {
    return this.options.now?.() ?? new Date();
  }

  async start(agentManager: Pick<AgentManager, "subscribe" | "getAgent">): Promise<void> {
    this.state = await this.load();
    await this.flush();
    this.unsubscribe = agentManager.subscribe(
      (event) => {
        if (event.type !== "agent_stream") return;
        const { agentId, event: stream } = event;
        if (stream.type === "timeline" && stream.item.type === "user_message") {
          this.recordPrompt(agentManager, agentId);
        } else if (stream.type === "turn_completed") {
          this.recordTurn(agentManager, agentId, stream.usage);
        }
      },
      { replayState: false },
    );
  }

  async stop(): Promise<void> {
    this.unsubscribe?.();
    this.unsubscribe = null;
    await this.flush();
  }

  private async load(): Promise<StoredActivityStats> {
    try {
      const parsed = StoredActivityStatsSchema.safeParse(
        JSON.parse(await readFile(this.options.filePath, "utf-8")),
      );
      if (parsed.success) return parsed.data;
      this.options.logger.warn({ err: parsed.error }, "Resetting invalid activity stats file");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        this.options.logger.warn({ err: error }, "Failed to read activity stats");
      }
    }
    return emptyStats(this.now());
  }

  private mutate(update: (state: StoredActivityStats, day: StoredDay, at: Date) => void): void {
    const state = this.state;
    if (!state) return;
    const at = this.now();
    const key = toLocalDayKey(at);
    const day = state.days[key] ?? { prompts: 0, turns: 0, tokens: 0, activeMs: 0 };
    state.days[key] = day;
    update(state, day, at);
    this.scheduleFlush();
  }

  private modelFor(agents: AgentLookup, agentId: string) {
    const agent = agents.getAgent(agentId);
    if (!agent || agent.internal) return null;
    const model = agent.runtimeInfo?.model ?? agent.config.model ?? null;
    return { provider: agent.provider, model };
  }

  private recordPrompt(agents: AgentLookup, agentId: string): void {
    const target = this.modelFor(agents, agentId);
    if (!target) return;
    this.mutate((state, day, at) => {
      day.prompts += 1;
      const hour = at.getHours();
      while (state.promptsByHour.length < 24) state.promptsByHour.push(0);
      state.promptsByHour[hour] += 1;
      const key = modelKey(target.provider, target.model);
      const entry = state.models[key] ?? { ...target, prompts: 0, turns: 0 };
      entry.prompts += 1;
      state.models[key] = entry;
    });
  }

  private recordTurn(agents: AgentLookup, agentId: string, usage: AgentUsage | undefined): void {
    const target = this.modelFor(agents, agentId);
    if (!target) return;
    this.mutate((state, day) => {
      day.turns += 1;
      day.tokens += (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0);
      const key = modelKey(target.provider, target.model);
      const entry = state.models[key] ?? { ...target, prompts: 0, turns: 0 };
      entry.turns += 1;
      state.models[key] = entry;
    });
  }

  /**
   * Called on every client heartbeat. Time accrues between consecutive heartbeats from any client
   * while the app is visible and recently used, so two open windows never count twice.
   */
  recordPresence(input: { appVisible: boolean; lastActivityAt: Date }): void {
    const nowMs = this.now().getTime();
    const active = input.appVisible && nowMs - input.lastActivityAt.getTime() <= IDLE_AFTER_MS;
    const previous = this.lastPresenceAtMs;
    this.lastPresenceAtMs = active ? nowMs : null;
    if (!active || previous === null) return;
    const gap = nowMs - previous;
    if (gap <= 0 || gap > MAX_PRESENCE_GAP_MS) return;
    this.mutate((_state, day) => {
      day.activeMs += gap;
    });
  }

  private scheduleFlush(): void {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flush();
    }, FLUSH_DELAY_MS);
    this.flushTimer.unref?.();
  }

  async flush(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (!this.state) return;
    try {
      await writeJsonFileAtomic(this.options.filePath, this.state);
    } catch (error) {
      this.options.logger.error({ err: error }, "Failed to persist activity stats");
    }
  }

  async snapshot(): Promise<ActivityStats> {
    const now = this.now();
    const state = this.state ?? emptyStats(now);
    const [agents, workspaces, projects] = await Promise.all([
      this.options.sources.listAgents(),
      this.options.sources.listWorkspaces(),
      this.options.sources.listProjects(),
    ]);
    return buildActivityStats({ state, agents, workspaces, projects, now });
  }
}

export function buildActivityStats(input: {
  state: StoredActivityStats;
  agents: StoredAgentRecord[];
  workspaces: PersistedWorkspaceRecord[];
  projects: PersistedProjectRecord[];
  now: Date;
}): ActivityStats {
  const { state, now } = input;
  const agents = input.agents.filter((agent) => !agent.internal);
  const days = new Map<string, ActivityStatsDay>();
  const dayFor = (date: string): ActivityStatsDay => {
    const existing = days.get(date);
    if (existing) return existing;
    const created = { date, prompts: 0, agentsCreated: 0, turns: 0, tokens: 0, activeMs: 0 };
    days.set(date, created);
    return created;
  };
  for (const [date, stored] of Object.entries(state.days)) {
    Object.assign(dayFor(date), stored);
  }

  const models = new Map<string, ActivityStats["models"][number]>();
  for (const stored of Object.values(state.models)) {
    models.set(modelKey(stored.provider, stored.model), { ...stored, agents: 0 });
  }

  const projectIdByWorkspace = new Map(input.workspaces.map((w) => [w.workspaceId, w.projectId]));
  const agentsByProject = new Map<string, number>();
  let firstActivityAt = state.trackingSince;

  for (const agent of agents) {
    const createdAt = new Date(agent.createdAt);
    if (Number.isNaN(createdAt.getTime())) continue;
    dayFor(toLocalDayKey(createdAt)).agentsCreated += 1;
    if (agent.createdAt < firstActivityAt) firstActivityAt = agent.createdAt;

    const model = agent.runtimeInfo?.model ?? agent.config?.model ?? null;
    const key = modelKey(agent.provider, model);
    const entry = models.get(key) ?? {
      provider: agent.provider,
      model,
      agents: 0,
      prompts: 0,
      turns: 0,
    };
    entry.agents += 1;
    models.set(key, entry);

    const projectId = agent.workspaceId ? projectIdByWorkspace.get(agent.workspaceId) : undefined;
    if (projectId) agentsByProject.set(projectId, (agentsByProject.get(projectId) ?? 0) + 1);
  }

  const projectById = new Map(input.projects.map((project) => [project.projectId, project]));
  const projects = [...agentsByProject]
    .flatMap(([projectId, count]) => {
      const project = projectById.get(projectId);
      if (!project) return [];
      return [{ projectId, name: resolveProjectDisplayName(project), agents: count }];
    })
    .sort((left, right) => right.agents - left.agents);

  const promptsByHour = Array.from({ length: 24 }, (_, hour) => state.promptsByHour[hour] ?? 0);

  return {
    generatedAt: now.toISOString(),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    firstActivityAt,
    trackingSince: state.trackingSince,
    days: [...days.values()].sort((left, right) => left.date.localeCompare(right.date)),
    promptsByHour,
    models: [...models.values()].sort(
      (left, right) => right.prompts + right.agents - (left.prompts + left.agents),
    ),
    projects,
  };
}
