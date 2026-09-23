import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type { Logger } from "pino";
import { z } from "zod";

// Other tools that drive the same provider CLIs (Conductor, another Paseo home)
// keep their own titles and branches for native sessions. This index lets the
// import sheet show that metadata, keyed by provider session handle.

export interface ExternalSessionSource {
  label: string;
  title: string | null;
  branch: string | null;
}

export type ExternalSessionIndex = Map<string, ExternalSessionSource>;

export function externalSessionKey(provider: string, providerHandleId: string): string {
  return `${provider}\0${providerHandleId}`;
}

const PASEO_HOMES = [
  { dir: ".paseo", label: "Paseo" },
  { dir: ".paseo-fork", label: "Buildr" },
];

const CONDUCTOR_DB_PATH = join(
  "Library",
  "Application Support",
  "com.conductor.app",
  "conductor.db",
);

const CONDUCTOR_PROVIDERS: Record<string, string> = { claude: "claude", codex: "codex" };

export async function loadExternalSessionIndex(input: {
  paseoHome: string;
  logger: Logger;
  homeDir?: string;
}): Promise<ExternalSessionIndex> {
  const homeDir = input.homeDir ?? homedir();
  const index: ExternalSessionIndex = new Map();
  for (const home of PASEO_HOMES) {
    const root = join(homeDir, home.dir);
    if (resolve(root) === resolve(input.paseoHome)) continue;
    await addPaseoSessions(index, root, home.label, input.logger);
  }
  await addConductorSessions(index, join(homeDir, CONDUCTOR_DB_PATH), input.logger);
  return index;
}

const StoredPaseoAgentSchema = z.object({
  provider: z.string(),
  title: z.string().nullable().optional(),
  internal: z.boolean().optional(),
  persistence: z
    .object({ sessionId: z.string(), nativeHandle: z.string().nullable().optional() })
    .nullable()
    .optional(),
});

async function addPaseoSessions(
  index: ExternalSessionIndex,
  root: string,
  label: string,
  logger: Logger,
): Promise<void> {
  const agentsDir = join(root, "agents");
  if (!existsSync(agentsDir)) return;
  try {
    const projects = await readdir(agentsDir, { withFileTypes: true });
    for (const project of projects) {
      if (!project.isDirectory()) continue;
      const projectDir = join(agentsDir, project.name);
      for (const file of await readdir(projectDir)) {
        if (!file.endsWith(".json")) continue;
        const parsed = StoredPaseoAgentSchema.safeParse(await readJson(join(projectDir, file)));
        if (!parsed.success || parsed.data.internal || !parsed.data.persistence) continue;
        const { provider, title, persistence } = parsed.data;
        const source = { label, title: title ?? null, branch: null };
        index.set(externalSessionKey(provider, persistence.sessionId), source);
        if (persistence.nativeHandle) {
          index.set(externalSessionKey(provider, persistence.nativeHandle), source);
        }
      }
    }
  } catch (err) {
    logger.debug({ err, root }, "Failed to read Paseo sessions for import");
  }
}

async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return null;
  }
}

// @types/node@20 predates the node:sqlite typings; declare the slice we use.
interface SqliteDatabase {
  prepare(sql: string): { all(): Record<string, unknown>[] };
  close(): void;
}
interface NodeSqliteModule {
  DatabaseSync: new (path: string, options?: { readOnly?: boolean }) => SqliteDatabase;
}

const ConductorSessionRowSchema = z.object({
  session_id: z.string(),
  agent_type: z.string().nullable(),
  title: z.string().nullable(),
  branch: z.string().nullable(),
});

async function addConductorSessions(
  index: ExternalSessionIndex,
  dbPath: string,
  logger: Logger,
): Promise<void> {
  if (!existsSync(dbPath)) return;
  // Held in a variable so TypeScript skips module resolution for node:sqlite.
  const sqliteSpecifier: string = "node:sqlite";
  let db: SqliteDatabase | undefined;
  try {
    const sqlite = (await import(sqliteSpecifier)) as unknown as NodeSqliteModule;
    db = new sqlite.DatabaseSync(dbPath, { readOnly: true });
    const rows = db
      .prepare(
        `SELECT s.claude_session_id AS session_id, s.agent_type, s.title, w.branch
         FROM sessions s
         LEFT JOIN workspaces w ON w.local_id = s.workspace_id OR w.id = s.workspace_id
         WHERE s.claude_session_id IS NOT NULL`,
      )
      .all();
    for (const row of rows) {
      const parsed = ConductorSessionRowSchema.safeParse(row);
      if (!parsed.success) continue;
      const provider = CONDUCTOR_PROVIDERS[parsed.data.agent_type ?? "claude"];
      if (!provider) continue;
      const title = parsed.data.title === "Untitled" ? null : parsed.data.title;
      index.set(externalSessionKey(provider, parsed.data.session_id), {
        label: "Conductor",
        title,
        branch: parsed.data.branch,
      });
    }
  } catch (err) {
    logger.debug({ err, dbPath }, "Failed to read Conductor sessions for import");
  } finally {
    db?.close();
  }
}
