import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  utimesSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  backupCheckpointRef,
  captureCheckpoint,
  checkpointRef,
  deleteCheckpoints,
  diffCheckpoints,
  listCheckpoints,
  resolveCheckpointRoot,
  restoreCheckpoint,
} from "./store.js";

const AGENT_ID = "3f0c7f5e-2f4b-4d2a-9d8e-1a2b3c4d5e6f";
const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function makeTempDir(): string {
  const dir = realpathSync.native(mkdtempSync(join(tmpdir(), "checkpoint-store-test-")));
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
  writeFileSync(join(repo, ".gitignore"), "ignored.log\n");
  writeFileSync(join(repo, "tracked.txt"), "one\n");
  git(["add", "."], repo);
  git(["-c", "commit.gpgsign=false", "commit", "-m", "initial"], repo);
  return repo;
}

interface RepoState {
  head: string;
  index: string;
  status: string;
}

function readRepoState(repo: string): RepoState {
  return {
    head: git(["rev-parse", "HEAD"], repo),
    index: git(["ls-files", "--stage"], repo),
    status: git(["status", "--porcelain=v1", "--untracked-files=all"], repo),
  };
}

describe("checkpoint store", () => {
  it("resolves the worktree root and rejects non-repositories", async () => {
    const repo = initRepo();
    mkdirSync(join(repo, "nested"));
    await expect(resolveCheckpointRoot(join(repo, "nested"))).resolves.toBe(repo);
    await expect(resolveCheckpointRoot(makeTempDir())).resolves.toBeNull();
  });

  it("captures untracked files without touching HEAD, the index, or the worktree", async () => {
    const repo = initRepo();
    writeFileSync(join(repo, "tracked.txt"), "one\nstaged\n");
    git(["add", "tracked.txt"], repo);
    writeFileSync(join(repo, "tracked.txt"), "one\nstaged\nunstaged\n");
    writeFileSync(join(repo, "untracked.txt"), "new\n");
    writeFileSync(join(repo, "ignored.log"), "noise\n");
    const before = readRepoState(repo);

    const ref = checkpointRef(AGENT_ID, 1, "start");
    await captureCheckpoint({ root: repo, ref, metadata: { messageId: "msg-1" } });

    expect(readRepoState(repo)).toEqual(before);
    expect(git(["show", `${ref}:tracked.txt`], repo)).toBe("one\nstaged\nunstaged\n");
    expect(git(["show", `${ref}:untracked.txt`], repo)).toBe("new\n");
    expect(git(["ls-tree", "--name-only", ref], repo)).not.toContain("ignored.log");
  });

  it("captures a same-size edit made right after the index was written", async () => {
    const repo = initRepo();
    const file = join(repo, "tracked.txt");
    // Pin the file, its index entry, and the index itself to one whole second,
    // the state Git leaves when an edit lands in the second the index was written.
    git(["config", "core.trustctime", "false"], repo);
    const instant = Math.floor(Date.now() / 1000) - 10;
    utimesSync(file, instant, instant);
    git(["update-index", "--refresh"], repo);
    writeFileSync(file, "two\n");
    utimesSync(file, instant, instant);
    utimesSync(join(repo, ".git", "index"), instant, instant);

    const ref = checkpointRef(AGENT_ID, 1, "start");
    await captureCheckpoint({ root: repo, ref, metadata: { messageId: null } });

    expect(git(["show", `${ref}:tracked.txt`], repo)).toBe("two\n");
  });

  it("lists checkpoints in turn order with their metadata", async () => {
    const repo = initRepo();
    await captureCheckpoint({
      root: repo,
      ref: checkpointRef(AGENT_ID, 2, "start"),
      metadata: { messageId: "msg-2" },
    });
    await captureCheckpoint({
      root: repo,
      ref: checkpointRef(AGENT_ID, 1, "end"),
      metadata: { messageId: "msg-1" },
    });
    await captureCheckpoint({
      root: repo,
      ref: checkpointRef(AGENT_ID, 1, "start"),
      metadata: { messageId: "msg-1" },
    });

    const checkpoints = await listCheckpoints({ root: repo, agentId: AGENT_ID });

    expect(checkpoints.map((c) => [c.turnIndex, c.phase, c.metadata.messageId])).toEqual([
      [1, "start", "msg-1"],
      [1, "end", "msg-1"],
      [2, "start", "msg-2"],
    ]);
  });

  it("diffs one turn, including created and deleted files", async () => {
    const repo = initRepo();
    const start = checkpointRef(AGENT_ID, 1, "start");
    const end = checkpointRef(AGENT_ID, 1, "end");
    await captureCheckpoint({ root: repo, ref: start, metadata: { messageId: null } });
    writeFileSync(join(repo, "tracked.txt"), "one\ntwo\n");
    writeFileSync(join(repo, "created.txt"), "hello\n");
    rmSync(join(repo, ".gitignore"));
    await captureCheckpoint({ root: repo, ref: end, metadata: { messageId: null } });

    const diff = await diffCheckpoints({
      root: repo,
      fromRef: start,
      toRef: end,
      ignoreWhitespace: false,
    });

    const summary = diff.files
      .map((file) => ({
        path: file.path,
        isNew: file.isNew,
        isDeleted: file.isDeleted,
        additions: file.additions,
        deletions: file.deletions,
      }))
      .sort((left, right) => left.path.localeCompare(right.path));
    expect(diff.diffTooLarge).toBe(false);
    expect(summary).toEqual([
      { path: ".gitignore", isNew: false, isDeleted: true, additions: 0, deletions: 1 },
      { path: "created.txt", isNew: true, isDeleted: false, additions: 1, deletions: 0 },
      { path: "tracked.txt", isNew: false, isDeleted: false, additions: 1, deletions: 0 },
    ]);
  });

  it("restores worktree files to a checkpoint without touching HEAD or the index", async () => {
    const repo = initRepo();
    mkdirSync(join(repo, "keep"));
    writeFileSync(join(repo, "keep", "note.txt"), "keep\n");
    const target = checkpointRef(AGENT_ID, 1, "start");
    await captureCheckpoint({ root: repo, ref: target, metadata: { messageId: null } });
    const headBefore = git(["rev-parse", "HEAD"], repo);
    const indexBefore = git(["ls-files", "--stage"], repo);

    writeFileSync(join(repo, "tracked.txt"), "changed\n");
    rmSync(join(repo, "keep"), { recursive: true });
    mkdirSync(join(repo, "added", "deep"), { recursive: true });
    writeFileSync(join(repo, "added", "deep", "file.txt"), "agent output\n");
    writeFileSync(join(repo, "ignored.log"), "noise\n");

    await restoreCheckpoint({ root: repo, ref: target, backupRef: backupCheckpointRef(AGENT_ID) });

    expect(readFileSync(join(repo, "tracked.txt"), "utf8")).toBe("one\n");
    expect(readFileSync(join(repo, "keep", "note.txt"), "utf8")).toBe("keep\n");
    expect(existsSync(join(repo, "added"))).toBe(false);
    expect(readFileSync(join(repo, "ignored.log"), "utf8")).toBe("noise\n");
    expect(git(["rev-parse", "HEAD"], repo)).toBe(headBefore);
    expect(git(["ls-files", "--stage"], repo)).toBe(indexBefore);
    expect(git(["show", `${backupCheckpointRef(AGENT_ID)}:tracked.txt`], repo)).toBe("changed\n");
  });

  it("deletes every ref the agent owns and leaves other agents alone", async () => {
    const repo = initRepo();
    const otherAgentId = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
    await captureCheckpoint({
      root: repo,
      ref: checkpointRef(AGENT_ID, 1, "start"),
      metadata: { messageId: null },
    });
    await captureCheckpoint({
      root: repo,
      ref: backupCheckpointRef(AGENT_ID),
      metadata: { messageId: null },
    });
    await captureCheckpoint({
      root: repo,
      ref: checkpointRef(otherAgentId, 1, "start"),
      metadata: { messageId: null },
    });

    await deleteCheckpoints({ root: repo, agentId: AGENT_ID });

    expect(git(["for-each-ref", "--format=%(refname)", "refs/buildr/"], repo).trim()).toBe(
      checkpointRef(otherAgentId, 1, "start"),
    );
  });
});
