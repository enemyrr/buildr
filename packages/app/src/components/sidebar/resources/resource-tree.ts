import type { DaemonResourceProcess } from "@getpaseo/protocol/messages";

export interface ResourceRow {
  pid: number;
  name: string;
  depth: number;
  cpuPercent: number;
  memoryBytes: number;
}

export interface ResourceTotals {
  cpuPercent: number;
  memoryBytes: number;
}

// Depth-first rows under `rootPid`, siblings ordered by memory so the heavy branches lead.
export function buildResourceRows(
  processes: readonly DaemonResourceProcess[],
  rootPid: number,
): ResourceRow[] {
  const childrenByParent = new Map<number, DaemonResourceProcess[]>();
  let root: DaemonResourceProcess | undefined;
  for (const entry of processes) {
    if (entry.pid === rootPid) {
      root = entry;
      continue;
    }
    if (entry.parentPid === null) continue;
    const siblings = childrenByParent.get(entry.parentPid) ?? [];
    siblings.push(entry);
    childrenByParent.set(entry.parentPid, siblings);
  }
  if (!root) return [];

  const rows: ResourceRow[] = [];
  const stack: Array<{ entry: DaemonResourceProcess; depth: number }> = [{ entry: root, depth: 0 }];
  for (let next = stack.pop(); next; next = stack.pop()) {
    const { entry, depth } = next;
    rows.push({
      pid: entry.pid,
      name: entry.name,
      depth,
      cpuPercent: entry.cpuPercent,
      memoryBytes: entry.memoryBytes,
    });
    const children = [...(childrenByParent.get(entry.pid) ?? [])].sort(
      (a, b) => a.memoryBytes - b.memoryBytes,
    );
    for (const child of children) stack.push({ entry: child, depth: depth + 1 });
  }
  return rows;
}

export function sumResources(processes: readonly DaemonResourceProcess[]): ResourceTotals {
  let cpuPercent = 0;
  let memoryBytes = 0;
  for (const entry of processes) {
    cpuPercent += entry.cpuPercent;
    memoryBytes += entry.memoryBytes;
  }
  return { cpuPercent, memoryBytes };
}

const MB = 1024 * 1024;
const GB = 1024 * MB;

export function formatMemory(bytes: number): string {
  if (bytes >= GB) return `${(bytes / GB).toFixed(2)} GB`;
  return `${(bytes / MB).toFixed(1)} MB`;
}

export function formatCpu(percent: number): string {
  return `${percent.toFixed(1)}%`;
}
