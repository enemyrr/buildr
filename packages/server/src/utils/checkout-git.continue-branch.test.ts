import { execFileSync } from "child_process";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, describe, expect, it } from "vitest";
import { continueOnNewBranch, nextContinuationBranchName } from "./checkout-git.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function makeTempDir(): string {
  const dir = realpathSync.native(mkdtempSync(join(tmpdir(), "checkout-continue-test-")));
  tempDirs.push(dir);
  return dir;
}

function git(args: string[], cwd: string): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: "pipe" }).trim();
}

function commitFile(repoDir: string, name: string, message: string): string {
  writeFileSync(join(repoDir, name), `${message}\n`);
  git(["add", "."], repoDir);
  git(["-c", "commit.gpgsign=false", "commit", "-m", message], repoDir);
  return git(["rev-parse", "HEAD"], repoDir);
}

function configureIdentity(repoDir: string): void {
  git(["config", "user.email", "test@test.com"], repoDir);
  git(["config", "user.name", "Test User"], repoDir);
}

/** A clone of a bare `origin` whose `main` gains a commit after the clone was taken. */
function setupRepoWithAdvancedOrigin(): { repoDir: string; remoteHead: string } {
  const root = makeTempDir();
  const remoteDir = join(root, "remote.git");
  const seedDir = join(root, "seed");
  const repoDir = join(root, "repo");
  git(["init", "--bare", "-b", "main", remoteDir], root);
  git(["init", "-b", "main", seedDir], root);
  configureIdentity(seedDir);
  commitFile(seedDir, "a.txt", "initial");
  git(["remote", "add", "origin", remoteDir], seedDir);
  git(["push", "-u", "origin", "main"], seedDir);

  git(["clone", remoteDir, repoDir], root);
  configureIdentity(repoDir);
  git(["checkout", "-b", "andreas/feature"], repoDir);
  commitFile(repoDir, "feature.txt", "feature work");

  const remoteHead = commitFile(seedDir, "b.txt", "merged upstream");
  git(["push", "origin", "main"], seedDir);
  return { repoDir, remoteHead };
}

describe("nextContinuationBranchName", () => {
  it("appends -2, then increments a short numeric suffix", () => {
    expect(nextContinuationBranchName("andreas/feature")).toBe("andreas/feature-2");
    expect(nextContinuationBranchName("andreas/feature-2")).toBe("andreas/feature-3");
    expect(nextContinuationBranchName("release-2024")).toBe("release-2024-2");
  });
});

describe("continueOnNewBranch", () => {
  it("checks out a new untracked branch from the freshly fetched origin base", async () => {
    const { repoDir, remoteHead } = setupRepoWithAdvancedOrigin();

    const result = await continueOnNewBranch(repoDir);

    expect(result).toEqual({
      previousBranch: "andreas/feature",
      branch: "andreas/feature-2",
      startPoint: "refs/remotes/origin/main",
    });
    expect(git(["rev-parse", "--abbrev-ref", "HEAD"], repoDir)).toBe("andreas/feature-2");
    expect(git(["rev-parse", "HEAD"], repoDir)).toBe(remoteHead);
    expect(() =>
      execFileSync("git", ["rev-parse", "--abbrev-ref", "@{upstream}"], {
        cwd: repoDir,
        stdio: "pipe",
      }),
    ).toThrow();
    expect(git(["rev-parse", "andreas/feature"], repoDir)).not.toBe(remoteHead);
  });

  it("skips branch names that already exist", async () => {
    const { repoDir } = setupRepoWithAdvancedOrigin();
    git(["branch", "andreas/feature-2"], repoDir);

    const result = await continueOnNewBranch(repoDir);

    expect(result.branch).toBe("andreas/feature-3");
  });

  it("refuses a dirty working tree and stays on the current branch", async () => {
    const { repoDir } = setupRepoWithAdvancedOrigin();
    writeFileSync(join(repoDir, "feature.txt"), "uncommitted\n");

    await expect(continueOnNewBranch(repoDir)).rejects.toThrow(
      "Working directory has uncommitted changes. Commit or stash them before continuing on a new branch.",
    );
    expect(git(["rev-parse", "--abbrev-ref", "HEAD"], repoDir)).toBe("andreas/feature");
  });
});
