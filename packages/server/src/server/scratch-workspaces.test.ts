import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { prepareScratchDirectory } from "./scratch-workspaces.js";

let root: string;

beforeEach(async () => {
  root = path.join(await mkdtemp(path.join(tmpdir(), "scratch-")), "scratch");
});

afterEach(async () => {
  await rm(path.dirname(root), { recursive: true, force: true });
});

test("gives each thread its own directory", async () => {
  const directories = await Promise.all(
    Array.from({ length: 5 }, () => prepareScratchDirectory(root, "thread")),
  );

  expect(new Set(directories).size).toBe(5);
  expect((await readdir(root)).sort()).toEqual(directories.map((dir) => path.basename(dir)).sort());
});

test("reuses one home directory", async () => {
  const first = await prepareScratchDirectory(root, "home");
  const second = await prepareScratchDirectory(root, "home");

  expect(first).toBe(path.join(root, "home"));
  expect(second).toBe(first);
});
