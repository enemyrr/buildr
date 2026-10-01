import { randomInt } from "node:crypto";
import { mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import { selectWorkspaceCityName } from "./worktree-city-name.js";

export type ScratchDirectoryKind = "thread" | "home";

const SCRATCH_HOME_DIRECTORY = "home";

export function getScratchRoot(paseoHome: string): string {
  return join(paseoHome, "scratch");
}

/** Creates the directory backing a scratch workspace and returns its path. */
export async function prepareScratchDirectory(
  root: string,
  kind: ScratchDirectoryKind,
): Promise<string> {
  await mkdir(root, { recursive: true });
  if (kind === "home") {
    const home = join(root, SCRATCH_HOME_DIRECTORY);
    await mkdir(home, { recursive: true });
    return home;
  }
  const occupied = new Set([SCRATCH_HOME_DIRECTORY, ...(await readdir(root))]);
  for (;;) {
    const name = selectWorkspaceCityName(occupied, randomInt(1_000));
    const directory = join(root, name);
    try {
      await mkdir(directory);
      return directory;
    } catch (error) {
      // A concurrent create took the name first.
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      occupied.add(name);
    }
  }
}
