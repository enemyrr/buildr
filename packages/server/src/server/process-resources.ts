import path from "node:path";
import type { DaemonResourceProcess } from "@getpaseo/protocol/messages";
import { execCommand } from "../utils/spawn.js";

const PS_TIMEOUT_MS = 3_000;

// Samples CPU and memory for `rootPid` and every process below it. `ps` has no
// Windows equivalent that reports CPU%, so Windows reports the daemon alone.
export async function sampleProcessTree(rootPid: number): Promise<DaemonResourceProcess[]> {
  if (process.platform === "win32") {
    return [
      {
        pid: rootPid,
        parentPid: null,
        name: "daemon",
        cpuPercent: 0,
        memoryBytes: process.memoryUsage().rss,
      },
    ];
  }
  const { stdout } = await execCommand("ps", ["-A", "-o", "pid=,ppid=,pcpu=,rss=,comm="], {
    envMode: "internal",
    timeout: PS_TIMEOUT_MS,
    maxBuffer: 8 * 1024 * 1024,
  });
  return selectProcessTree(parsePsOutput(String(stdout)), rootPid);
}

export function parsePsOutput(stdout: string): DaemonResourceProcess[] {
  const processes: DaemonResourceProcess[] = [];
  for (const line of stdout.split("\n")) {
    const match = /^\s*(\d+)\s+(\d+)\s+([\d.]+)\s+(\d+)\s+(.+?)\s*$/.exec(line);
    if (!match) continue;
    processes.push({
      pid: Number(match[1]),
      parentPid: Number(match[2]),
      cpuPercent: Number(match[3]),
      memoryBytes: Number(match[4]) * 1024,
      name: path.basename(match[5]),
    });
  }
  return processes;
}

export function selectProcessTree(
  processes: DaemonResourceProcess[],
  rootPid: number,
): DaemonResourceProcess[] {
  const childrenByParent = new Map<number, DaemonResourceProcess[]>();
  let root: DaemonResourceProcess | undefined;
  for (const entry of processes) {
    if (entry.pid === rootPid) root = entry;
    if (entry.parentPid === null) continue;
    const siblings = childrenByParent.get(entry.parentPid) ?? [];
    siblings.push(entry);
    childrenByParent.set(entry.parentPid, siblings);
  }
  if (!root) return [];
  const tree: DaemonResourceProcess[] = [{ ...root, parentPid: null }];
  const queue = [rootPid];
  for (let pid = queue.shift(); pid !== undefined; pid = queue.shift()) {
    for (const child of childrenByParent.get(pid) ?? []) {
      tree.push(child);
      queue.push(child.pid);
    }
  }
  return tree;
}
