import { describe, expect, it } from "vitest";
import { estimateTerminalSize } from "./terminal-font";

describe("estimateTerminalSize", () => {
  it("fits fewer columns than a 0.6em monospace grid", () => {
    const size = estimateTerminalSize({ width: 320, height: 200, fontSize: 13 });
    expect(size?.cols).toBeLessThanOrEqual(Math.floor(320 / (13 * 0.6)));
    expect(size?.cols).toBeGreaterThan(0);
    expect(size?.rows).toBeGreaterThan(0);
  });

  it("returns null for a pane too small to hold a cell", () => {
    expect(estimateTerminalSize({ width: 10, height: 200, fontSize: 13 })).toBeNull();
    expect(estimateTerminalSize({ width: 320, height: 0, fontSize: 13 })).toBeNull();
  });
});
