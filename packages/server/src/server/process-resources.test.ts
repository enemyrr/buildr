import { describe, expect, it } from "vitest";
import { parsePsOutput, sampleProcessTree, selectProcessTree } from "./process-resources.js";

const PS_OUTPUT = `
    1     0   0.3  12000 /sbin/launchd
  100     1   4.9  68000 /usr/local/bin/node
  200   100   0.8 240000 /Users/me/.local/bin/claude
  300   200   0.0  15000 uv
  400     1  12.0  90000 /Applications/Other.app/Contents/MacOS/Other
  500   300   0.0  78000 /usr/bin/python3 with spaces
`;

describe("process resources", () => {
  it("parses ps rows into bytes and base names", () => {
    const processes = parsePsOutput(PS_OUTPUT);

    expect(processes).toHaveLength(6);
    expect(processes[2]).toEqual({
      pid: 200,
      parentPid: 100,
      cpuPercent: 0.8,
      memoryBytes: 240000 * 1024,
      name: "claude",
    });
  });

  it("keeps only the root and its descendants", () => {
    const tree = selectProcessTree(parsePsOutput(PS_OUTPUT), 100);

    expect(tree.map((entry) => entry.pid)).toEqual([100, 200, 300, 500]);
    expect(tree[0].parentPid).toBeNull();
  });

  it("returns nothing when the root is gone", () => {
    expect(selectProcessTree(parsePsOutput(PS_OUTPUT), 999)).toEqual([]);
  });

  it("samples the current process from the real ps", async () => {
    const tree = await sampleProcessTree(process.pid);

    expect(tree[0]?.pid).toBe(process.pid);
    expect(tree[0]?.memoryBytes).toBeGreaterThan(0);
  });
});
