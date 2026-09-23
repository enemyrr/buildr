import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestLogger } from "../../test-utils/test-logger.js";
import { externalSessionKey, loadExternalSessionIndex } from "./external-session-sources.js";

interface SqliteDatabase {
  exec(sql: string): void;
  close(): void;
}

async function createConductorDb(path: string): Promise<void> {
  const sqliteSpecifier: string = "node:sqlite";
  const sqlite = (await import(sqliteSpecifier)) as {
    DatabaseSync: new (path: string) => SqliteDatabase;
  };
  const db = new sqlite.DatabaseSync(path);
  db.exec(`
    CREATE TABLE sessions (id TEXT, claude_session_id TEXT, agent_type TEXT, title TEXT, workspace_id TEXT);
    CREATE TABLE workspaces (local_id TEXT, id TEXT, branch TEXT);
    INSERT INTO workspaces VALUES ('w1', NULL, 'fix-login');
    INSERT INTO sessions VALUES ('s1', 'claude-1', 'claude', 'Login fix', 'w1');
    INSERT INTO sessions VALUES ('s2', 'codex-1', 'codex', 'Untitled', 'w1');
    INSERT INTO sessions VALUES ('s3', NULL, 'claude', 'Draft', 'w1');
  `);
  db.close();
}

describe("loadExternalSessionIndex", () => {
  let homeDir: string;

  beforeEach(() => {
    homeDir = mkdtempSync(join(tmpdir(), "external-sessions-"));
  });

  afterEach(() => {
    rmSync(homeDir, { recursive: true, force: true });
  });

  it("indexes Conductor sessions with their title and branch", async () => {
    const appDir = join(homeDir, "Library", "Application Support", "com.conductor.app");
    mkdirSync(appDir, { recursive: true });
    await createConductorDb(join(appDir, "conductor.db"));

    const index = await loadExternalSessionIndex({
      paseoHome: join(homeDir, ".paseo"),
      logger: createTestLogger(),
      homeDir,
    });

    expect(index.get(externalSessionKey("claude", "claude-1"))).toEqual({
      label: "Conductor",
      title: "Login fix",
      branch: "fix-login",
    });
    expect(index.get(externalSessionKey("codex", "codex-1"))?.title).toBeNull();
    expect(index.size).toBe(2);
  });

  it("indexes agents from the other Paseo home and skips the current one", async () => {
    const writeAgent = (home: string, id: string, sessionId: string) => {
      const dir = join(homeDir, home, "agents", "project");
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, `${id}.json`),
        JSON.stringify({
          provider: "codex",
          title: `Agent ${id}`,
          persistence: { sessionId, nativeHandle: `native-${sessionId}` },
        }),
      );
    };
    writeAgent(".paseo", "a", "thread-a");
    writeAgent(".paseo-fork", "b", "thread-b");

    const index = await loadExternalSessionIndex({
      paseoHome: join(homeDir, ".paseo-fork"),
      logger: createTestLogger(),
      homeDir,
    });

    expect(index.get(externalSessionKey("codex", "native-thread-a"))).toEqual({
      label: "Paseo",
      title: "Agent a",
      branch: null,
    });
    expect(index.has(externalSessionKey("codex", "thread-b"))).toBe(false);
  });
});
