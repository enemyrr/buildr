import { copyFile, lstat, mkdtemp, readdir, rm, rmdir, stat, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { z } from "zod";
import { parseAndHighlightDiff, type ParsedDiffFile } from "../../utils/diff-highlighter.js";
import { runGitCommand } from "../../../utils/run-git-command.js";

// Checkpoints are commits under a hidden ref namespace. Each capture stages the
// worktree into a throwaway index (GIT_INDEX_FILE), so no operation here writes
// HEAD or the user's index, and only restore writes the working tree.
// See docs/turn-checkpoints.md.

const REF_ROOT = "refs/buildr/checkpoints";
const SUBJECT_PREFIX = "buildr-checkpoint ";
const DIFF_MAX_OUTPUT_BYTES = 8 * 1024 * 1024;
// Larger untracked files are usually build output or downloaded data; hashing
// them on every turn bloats the object store.
export const UNTRACKED_FILE_MAX_BYTES = 5 * 1024 * 1024;

const READ_ONLY_ENV = { GIT_OPTIONAL_LOCKS: "0", LC_ALL: "C" } as const;
const CHECKPOINT_IDENTITY_ENV = {
  GIT_AUTHOR_NAME: "Buildr",
  GIT_AUTHOR_EMAIL: "checkpoints@buildr.invalid",
  GIT_COMMITTER_NAME: "Buildr",
  GIT_COMMITTER_EMAIL: "checkpoints@buildr.invalid",
} as const;
// A private index must not consult the user's fsmonitor or trigger gc. Refs and
// objects are fsynced so an unclean shutdown can't leave empty ref files behind.
const CAPTURE_CONFIG = [
  "-c",
  "core.fsmonitor=false",
  "-c",
  "gc.auto=0",
  "-c",
  "core.fsync=objects,reference",
  "-c",
  "core.fsyncMethod=fsync",
];

export type CheckpointPhase = "start" | "end";

const CheckpointMetadataSchema = z.object({
  messageId: z.string().nullable(),
});

export type CheckpointMetadata = z.infer<typeof CheckpointMetadataSchema>;

export interface StoredCheckpoint {
  turnIndex: number;
  phase: CheckpointPhase;
  ref: string;
  capturedAt: string;
  metadata: CheckpointMetadata;
}

export interface CheckpointDiff {
  files: ParsedDiffFile[];
  diffTooLarge: boolean;
}

export function agentCheckpointRefPrefix(agentId: string): string {
  return `${REF_ROOT}/${agentId}/`;
}

export function checkpointRef(agentId: string, turnIndex: number, phase: CheckpointPhase): string {
  return `${agentCheckpointRefPrefix(agentId)}${turnIndex}/${phase}`;
}

export function backupCheckpointRef(agentId: string): string {
  return `${agentCheckpointRefPrefix(agentId)}backup`;
}

export interface CheckpointRepo {
  root: string;
  indexPath: string;
}

export interface WorktreeSnapshot {
  tree: string;
  // Untracked files left out because they exceed UNTRACKED_FILE_MAX_BYTES.
  skippedLargeFiles: string[];
}

/** Resolves the worktree that contains `cwd`, or null when `cwd` isn't in a Git worktree. */
export async function resolveCheckpointRepo(cwd: string): Promise<CheckpointRepo | null> {
  const result = await runGitCommand(
    ["rev-parse", "--path-format=absolute", "--show-toplevel", "--git-path", "index"],
    { cwd, envOverlay: READ_ONLY_ENV, acceptExitCodes: [0, 128] },
  ).catch(() => null);
  if (!result || result.exitCode !== 0) return null;
  const [root, indexPath] = result.stdout.trim().split("\n");
  return root && indexPath ? { root, indexPath } : null;
}

async function withPrivateIndex<T>(operation: (indexPath: string) => Promise<T>): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), "buildr-checkpoint-"));
  try {
    return await operation(join(directory, "index"));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function seedPrivateIndex(repo: CheckpointRepo, indexPath: string): Promise<void> {
  // Copying the user's index keeps its stat cache, so `git add` rehashes only
  // changed files. A repository without an index starts from an empty one.
  const userIndex = await stat(repo.indexPath).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (!userIndex) return;
  await copyFile(repo.indexPath, indexPath);
  // Git treats an entry as possibly stale when the file changed in the same
  // instant the index was written. The copy must keep the original timestamp,
  // or a same-size edit made in that instant looks unchanged.
  await utimes(indexPath, userIndex.atime, userIndex.mtime);
}

async function findLargeUntrackedFiles(root: string): Promise<string[]> {
  const { stdout } = await runGitCommand(["ls-files", "--others", "--exclude-standard", "-z"], {
    cwd: root,
    envOverlay: READ_ONLY_ENV,
  });
  const paths = stdout.split("\0").filter((path) => path.length > 0);
  const sizes = await Promise.all(
    paths.map((path) =>
      lstat(join(root, path)).then(
        (entry) => (entry.isFile() ? entry.size : 0),
        () => 0,
      ),
    ),
  );
  return paths.filter((_path, index) => sizes[index] > UNTRACKED_FILE_MAX_BYTES);
}

/**
 * Writes a tree object for the whole worktree at `repo.root`, including
 * untracked files that .gitignore doesn't exclude. Untracked files above
 * UNTRACKED_FILE_MAX_BYTES are left out.
 */
export async function snapshotWorktree(repo: CheckpointRepo): Promise<WorktreeSnapshot> {
  return withPrivateIndex(async (indexPath) => {
    const [, skippedLargeFiles] = await Promise.all([
      seedPrivateIndex(repo, indexPath),
      findLargeUntrackedFiles(repo.root),
    ]);
    const env = { GIT_INDEX_FILE: indexPath };
    const pathspecs = [".", ...skippedLargeFiles.map((path) => `:(exclude,literal)${path}`)];
    await runGitCommand(
      [...CAPTURE_CONFIG, "add", "-A", "--pathspec-from-file=-", "--pathspec-file-nul"],
      { cwd: repo.root, envOverlay: env, input: `${pathspecs.join("\0")}\0` },
    );
    const { stdout } = await runGitCommand([...CAPTURE_CONFIG, "write-tree"], {
      cwd: repo.root,
      envOverlay: env,
    });
    return { tree: stdout.trim(), skippedLargeFiles };
  });
}

/** Commits a snapshot tree and points `ref` at the commit. */
export async function publishCheckpoint(input: {
  root: string;
  ref: string;
  tree: string;
  metadata: CheckpointMetadata;
}): Promise<void> {
  const subject = `${SUBJECT_PREFIX}${JSON.stringify(input.metadata)}`;
  const { stdout } = await runGitCommand(
    [...CAPTURE_CONFIG, "commit-tree", input.tree, "-m", subject],
    { cwd: input.root, envOverlay: CHECKPOINT_IDENTITY_ENV },
  );
  await runGitCommand([...CAPTURE_CONFIG, "update-ref", input.ref, stdout.trim()], {
    cwd: input.root,
  });
}

/** Snapshots the worktree and publishes it at `ref` in one step. */
export async function captureCheckpoint(input: {
  repo: CheckpointRepo;
  ref: string;
  metadata: CheckpointMetadata;
}): Promise<WorktreeSnapshot> {
  const snapshot = await snapshotWorktree(input.repo);
  await publishCheckpoint({
    root: input.repo.root,
    ref: input.ref,
    tree: snapshot.tree,
    metadata: input.metadata,
  });
  return snapshot;
}

function parseStoredCheckpoint(agentId: string, line: string): StoredCheckpoint | null {
  const [ref, capturedAt, subject] = line.split("\0");
  if (!ref || !capturedAt || !subject?.startsWith(SUBJECT_PREFIX)) return null;
  const match = /^(\d+)\/(start|end)$/.exec(ref.slice(agentCheckpointRefPrefix(agentId).length));
  if (!match) return null;
  let metadataJson: unknown;
  try {
    metadataJson = JSON.parse(subject.slice(SUBJECT_PREFIX.length));
  } catch {
    return null;
  }
  const metadata = CheckpointMetadataSchema.safeParse(metadataJson);
  if (!metadata.success) return null;
  return {
    turnIndex: Number.parseInt(match[1], 10),
    phase: match[2] === "start" ? "start" : "end",
    ref,
    capturedAt,
    metadata: metadata.data,
  };
}

/** Lists the agent's turn checkpoints ordered by turn index, start before end. */
export async function listCheckpoints(input: {
  root: string;
  agentId: string;
}): Promise<StoredCheckpoint[]> {
  const { stdout } = await runGitCommand(
    [
      "for-each-ref",
      "--format=%(refname)%00%(creatordate:iso-strict)%00%(contents:subject)",
      agentCheckpointRefPrefix(input.agentId),
    ],
    { cwd: input.root, envOverlay: READ_ONLY_ENV },
  );
  const checkpoints = stdout
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => parseStoredCheckpoint(input.agentId, line))
    .filter((checkpoint): checkpoint is StoredCheckpoint => checkpoint !== null);
  return checkpoints.sort((left, right) => {
    if (left.turnIndex !== right.turnIndex) return left.turnIndex - right.turnIndex;
    return left.phase === "start" ? -1 : 1;
  });
}

async function readFileAtRef(root: string, ref: string, path: string): Promise<string | null> {
  const result = await runGitCommand(["show", `${ref}:${path}`], {
    cwd: root,
    envOverlay: READ_ONLY_ENV,
    acceptExitCodes: [0, 128],
  });
  return result.exitCode === 0 ? result.stdout : null;
}

/** Computes the highlighted diff from `fromRef` to `toRef`. */
export async function diffCheckpoints(input: {
  root: string;
  fromRef: string;
  toRef: string;
  ignoreWhitespace: boolean;
}): Promise<CheckpointDiff> {
  const args = [
    "diff",
    "--no-color",
    "--no-ext-diff",
    "--no-textconv",
    // The shared diff parser doesn't read rename headers.
    "--no-renames",
    "--src-prefix=a/",
    "--dst-prefix=b/",
    ...(input.ignoreWhitespace ? ["--ignore-all-space"] : []),
    `${input.fromRef}^{commit}`,
    `${input.toRef}^{commit}`,
  ];
  const result = await runGitCommand(args, {
    cwd: input.root,
    envOverlay: READ_ONLY_ENV,
    maxOutputBytes: DIFF_MAX_OUTPUT_BYTES,
  });
  if (result.truncated) {
    return { files: [], diffTooLarge: true };
  }
  const files = await parseAndHighlightDiff(result.stdout, input.root, {
    getOldFileContent: (file) => readFileAtRef(input.root, input.fromRef, file.path),
    getNewFileContent: (file) => readFileAtRef(input.root, input.toRef, file.path),
  });
  return { files, diffTooLarge: false };
}

interface WorktreeChanges {
  toRemove: string[];
  toWrite: string[];
}

async function listRestoreChanges(
  root: string,
  targetRef: string,
  currentRef: string,
): Promise<WorktreeChanges> {
  const { stdout } = await runGitCommand(
    [
      "diff",
      "--name-status",
      "-z",
      "--no-renames",
      `${targetRef}^{commit}`,
      `${currentRef}^{commit}`,
    ],
    { cwd: root, envOverlay: READ_ONLY_ENV },
  );
  const fields = stdout.split("\0");
  const changes: WorktreeChanges = { toRemove: [], toWrite: [] };
  for (let index = 0; index + 1 < fields.length; index += 2) {
    const status = fields[index];
    const path = fields[index + 1];
    // "A" means the file exists now but not in the target snapshot.
    if (status === "A") changes.toRemove.push(path);
    else changes.toWrite.push(path);
  }
  return changes;
}

async function removeEmptyParents(root: string, path: string): Promise<void> {
  let directory = dirname(join(root, path));
  while (relative(root, directory) !== "" && !relative(root, directory).startsWith("..")) {
    const entries = await readdir(directory).catch(() => null);
    if (!entries || entries.length > 0) return;
    await rmdir(directory);
    directory = dirname(directory);
  }
}

/**
 * Makes the working tree match `ref` without touching HEAD or the user's
 * index. The pre-restore state is captured at `backupRef` first, so a restore
 * can be undone from Git.
 */
export async function restoreCheckpoint(input: {
  repo: CheckpointRepo;
  ref: string;
  backupRef: string;
}): Promise<void> {
  const { root } = input.repo;
  await captureCheckpoint({
    repo: input.repo,
    ref: input.backupRef,
    metadata: { messageId: null },
  });
  const changes = await listRestoreChanges(root, input.ref, input.backupRef);
  for (const path of changes.toRemove) {
    await rm(join(root, path), { force: true });
    await removeEmptyParents(root, path);
  }
  if (changes.toWrite.length === 0) return;
  await withPrivateIndex(async (indexPath) => {
    const env = { GIT_INDEX_FILE: indexPath };
    await runGitCommand(["read-tree", `${input.ref}^{tree}`], { cwd: root, envOverlay: env });
    await runGitCommand(["checkout-index", "-f", "-z", "--stdin"], {
      cwd: root,
      envOverlay: env,
      input: `${changes.toWrite.join("\0")}\0`,
    });
  });
}

/** Deletes every checkpoint ref the agent owns. */
export async function deleteCheckpoints(input: { root: string; agentId: string }): Promise<void> {
  const { stdout } = await runGitCommand(
    ["for-each-ref", "--format=%(refname)", agentCheckpointRefPrefix(input.agentId)],
    { cwd: input.root, envOverlay: READ_ONLY_ENV },
  );
  const refs = stdout.split("\n").filter((ref) => ref.length > 0);
  if (refs.length === 0) return;
  await runGitCommand(["update-ref", "--stdin"], {
    cwd: input.root,
    input: refs.map((ref) => `delete ${ref}\n`).join(""),
  });
}
