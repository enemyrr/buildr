import { describe, expect, it } from "vitest";
import { buildResourceRows, formatMemory, sumResources } from "./resource-tree";

const MB = 1024 * 1024;

const PROCESSES = [
  { pid: 1, parentPid: null, name: "node", cpuPercent: 4.9, memoryBytes: 60 * MB },
  { pid: 2, parentPid: 1, name: "codex", cpuPercent: 0, memoryBytes: 20 * MB },
  { pid: 3, parentPid: 1, name: "claude", cpuPercent: 0.8, memoryBytes: 235 * MB },
  { pid: 4, parentPid: 3, name: "uv", cpuPercent: 0, memoryBytes: 15 * MB },
];

describe("resource tree", () => {
  it("orders depth first with the heaviest sibling first", () => {
    const rows = buildResourceRows(PROCESSES, 1);

    expect(rows.map((row) => [row.name, row.depth])).toEqual([
      ["node", 0],
      ["claude", 1],
      ["uv", 2],
      ["codex", 1],
    ]);
  });

  it("returns nothing when the root is missing", () => {
    expect(buildResourceRows(PROCESSES, 99)).toEqual([]);
  });

  it("sums the whole tree", () => {
    const totals = sumResources(PROCESSES);

    expect(totals.cpuPercent).toBeCloseTo(5.7);
    expect(totals.memoryBytes).toBe(330 * MB);
  });

  it("switches to gigabytes at 1 GB", () => {
    expect(formatMemory(177.9 * MB)).toBe("177.9 MB");
    expect(formatMemory(2.14 * 1024 * MB)).toBe("2.14 GB");
  });
});
