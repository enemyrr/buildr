import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pino from "pino";
import { afterEach, describe, expect, it } from "vitest";
import { CheckpointUnavailableError, TurnCheckpoints } from "./turn-checkpoints.js";

const AGENT_ID = "3f0c7f5e-2f4b-4d2a-9d8e-1a2b3c4d5e6f";
const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function makeTempDir(): string {
  const dir = realpathSync.native(mkdtempSync(join(tmpdir(), "turn-checkpoints-test-")));
  tempDirs.push(dir);
  return dir;
}

function git(args: string[], cwd: string): string {
  return execFileSync("git", args, { cwd }).toString();
}

function initRepo(): string {
  const repo = join(makeTempDir(), "repo");
  mkdirSync(repo, { recursive: true });
  git(["init", "-b", "main"], repo);
  git(["config", "user.email", "test@example.com"], repo);
  git(["config", "user.name", "Test User"], repo);
  writeFileSync(join(repo, "app.ts"), "export const version = 1;\n");
  git(["add", "."], repo);
  git(["-c", "commit.gpgsign=false", "commit", "-m", "initial"], repo);
  return repo;
}

// These tests edit files right after `beginTurn` resolves, so they wait for
// the pre-turn tree however slow the machine is. Production uses the default.
function createCheckpoints(startSnapshotWaitMs = 60_000): TurnCheckpoints {
  return new TurnCheckpoints({ logger: pino({ level: "silent" }), startSnapshotWaitMs });
}

describe("turn checkpoints", () => {
  it("records each turn and diffs it without the user's edits between turns", async () => {
    const repo = initRepo();
    const checkpoints = createCheckpoints();

    await checkpoints.beginTurn({ agentId: AGENT_ID, cwd: repo, messageId: "msg-1" });
    writeFileSync(join(repo, "app.ts"), "export const version = 2;\n");
    checkpoints.endTurn({ agentId: AGENT_ID, cwd: repo });

    writeFileSync(join(repo, "user-notes.md"), "edited between turns\n");

    await checkpoints.beginTurn({ agentId: AGENT_ID, cwd: repo, messageId: "msg-2" });
    writeFileSync(join(repo, "feature.ts"), "export {};\n");
    checkpoints.endTurn({ agentId: AGENT_ID, cwd: repo });

    const turns = await checkpoints.list({ agentId: AGENT_ID, cwd: repo });
    expect(turns.map((turn) => [turn.turnIndex, turn.messageId])).toEqual([
      [1, "msg-1"],
      [2, "msg-2"],
    ]);
    expect(turns.every((turn) => turn.completedAt !== null)).toBe(true);

    const secondTurn = await checkpoints.getTurnDiff({
      agentId: AGENT_ID,
      cwd: repo,
      turnIndex: 2,
      ignoreWhitespace: false,
    });
    expect(secondTurn.files.map((file) => file.path)).toEqual(["feature.ts"]);
  });

  it("finishes a capture in the background when the turn starts without waiting", async () => {
    const repo = initRepo();
    const checkpoints = createCheckpoints(0);

    await checkpoints.beginTurn({ agentId: AGENT_ID, cwd: repo, messageId: "msg-1" });
    checkpoints.endTurn({ agentId: AGENT_ID, cwd: repo });

    const turns = await checkpoints.list({ agentId: AGENT_ID, cwd: repo });
    expect(turns.map((turn) => [turn.turnIndex, turn.completedAt !== null])).toEqual([[1, true]]);
  });

  it("continues turn numbering after the daemon restarts", async () => {
    const repo = initRepo();
    const first = createCheckpoints();
    await first.beginTurn({ agentId: AGENT_ID, cwd: repo, messageId: "msg-1" });
    first.endTurn({ agentId: AGENT_ID, cwd: repo });
    await first.list({ agentId: AGENT_ID, cwd: repo });

    const restarted = createCheckpoints();
    await restarted.beginTurn({ agentId: AGENT_ID, cwd: repo, messageId: "msg-2" });
    restarted.endTurn({ agentId: AGENT_ID, cwd: repo });

    const turns = await restarted.list({ agentId: AGENT_ID, cwd: repo });
    expect(turns.map((turn) => turn.turnIndex)).toEqual([1, 2]);
  });

  it("restores files to the start of a turn and discards refs", async () => {
    const repo = initRepo();
    const checkpoints = createCheckpoints();
    await checkpoints.beginTurn({ agentId: AGENT_ID, cwd: repo, messageId: "msg-1" });
    writeFileSync(join(repo, "app.ts"), "export const version = 2;\n");
    checkpoints.endTurn({ agentId: AGENT_ID, cwd: repo });

    await checkpoints.restoreFilesToTurnStart({ agentId: AGENT_ID, cwd: repo, turnIndex: 1 });
    expect(readFileSync(join(repo, "app.ts"), "utf8")).toBe("export const version = 1;\n");

    await checkpoints.discard({ agentId: AGENT_ID, cwd: repo });
    expect(git(["for-each-ref", "refs/buildr/"], repo)).toBe("");
  });

  it("skips capture outside a Git repository and reports why queries fail", async () => {
    const directory = makeTempDir();
    const checkpoints = createCheckpoints();

    await checkpoints.beginTurn({ agentId: AGENT_ID, cwd: directory, messageId: null });
    checkpoints.endTurn({ agentId: AGENT_ID, cwd: directory });

    await expect(checkpoints.list({ agentId: AGENT_ID, cwd: directory })).rejects.toBeInstanceOf(
      CheckpointUnavailableError,
    );
  });
});
