import { randomInt } from "node:crypto";
import { readdir } from "node:fs/promises";
import { getPaseoWorktreesRoot } from "../utils/worktree.js";
import { runGitCommand } from "../utils/run-git-command.js";

export const WORKSPACE_CITIES = [
  "amsterdam",
  "athens",
  "auckland",
  "barcelona",
  "berlin",
  "bogota",
  "boston",
  "bristol",
  "brussels",
  "budapest",
  "cairo",
  "cape-town",
  "chicago",
  "copenhagen",
  "dublin",
  "edinburgh",
  "florence",
  "geneva",
  "gothenburg",
  "helsinki",
  "istanbul",
  "jakarta",
  "kyoto",
  "lisbon",
  "london",
  "lyon",
  "madrid",
  "melbourne",
  "mexico-city",
  "milan",
  "montreal",
  "nairobi",
  "naples",
  "osaka",
  "oslo",
  "ottawa",
  "paris",
  "porto",
  "prague",
  "reykjavik",
  "riga",
  "rome",
  "san-francisco",
  "santiago",
  "seattle",
  "seoul",
  "singapore",
  "stockholm",
  "sydney",
  "taipei",
  "tallinn",
  "tokyo",
  "toronto",
  "valencia",
  "vancouver",
  "venice",
  "vienna",
  "warsaw",
  "zurich",
] as const;

const reservations = new Set<string>();

export function selectWorkspaceCityName(occupied: ReadonlySet<string>, start: number): string {
  for (let version = 1; ; version++) {
    for (let index = 0; index < WORKSPACE_CITIES.length; index++) {
      const city = WORKSPACE_CITIES[(start + index) % WORKSPACE_CITIES.length]!;
      const candidate = version === 1 ? city : `${city}-v${version}`;
      if (!occupied.has(candidate)) return candidate;
    }
  }
}

export async function reserveWorkspaceCityName(input: {
  cwd: string;
  paseoHome?: string;
  worktreesRoot?: string;
}): Promise<{ name: string; release: () => void }> {
  const root = await getPaseoWorktreesRoot(input.cwd, input.paseoHome, input.worktreesRoot);
  const [directories, branches] = await Promise.all([
    readdir(root).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return [];
      throw error;
    }),
    runGitCommand(["for-each-ref", "--format=%(refname:short)", "refs/heads"], { cwd: input.cwd }),
  ]);
  const occupied = new Set([...directories, ...branches.stdout.trim().split("\n")]);
  for (const reservation of reservations) {
    if (reservation.startsWith(`${root}/`)) occupied.add(reservation.slice(root.length + 1));
  }
  const name = selectWorkspaceCityName(occupied, randomInt(WORKSPACE_CITIES.length));
  const key = `${root}/${name}`;
  reservations.add(key);
  return {
    name,
    release: () => {
      reservations.delete(key);
    },
  };
}
