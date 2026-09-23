import { describe, expect, test } from "vitest";
import {
  PIXEL_LOADER_CELL_COUNT,
  getPixelLoaderCellOpacity,
  getPixelLoaderRoundness,
  getPixelLoaderSchedule,
} from "./pattern";

describe("pixel loader pattern", () => {
  test("drive leads with the chevron tip and repeats every 650ms", () => {
    const schedule = getPixelLoaderSchedule("drive");
    const at = (t: number) =>
      Array.from({ length: PIXEL_LOADER_CELL_COUNT }, (_, cell) =>
        getPixelLoaderCellOpacity(schedule, cell, t),
      );

    expect(at(195)[3]).toBeCloseTo(1);
    expect(at(195 + 650)).toEqual(at(195));
  });

  test("orbit parks the centre cell", () => {
    const schedule = getPixelLoaderSchedule("orbit");
    expect(getPixelLoaderCellOpacity(schedule, 4, 123)).toBe(0.07);
  });

  test("shuffle is stable per seed and differs across seeds", () => {
    expect(getPixelLoaderSchedule("shuffle", "agent-a")).toEqual(
      getPixelLoaderSchedule("shuffle", "agent-a"),
    );
    expect(getPixelLoaderSchedule("shuffle", "agent-a")).not.toEqual(
      getPixelLoaderSchedule("shuffle", "agent-b"),
    );
  });

  test("shuffle blends segments without jumps", () => {
    const schedule = getPixelLoaderSchedule("shuffle", "agent-a");
    for (let t = 0; t < schedule.periodMs; t += 4) {
      for (let cell = 0; cell < PIXEL_LOADER_CELL_COUNT; cell += 1) {
        const step = Math.abs(
          getPixelLoaderCellOpacity(schedule, cell, t + 4) -
            getPixelLoaderCellOpacity(schedule, cell, t),
        );
        expect(step).toBeLessThan(0.2);
      }
      const roundness = getPixelLoaderRoundness(schedule, t);
      expect(roundness).toBeGreaterThanOrEqual(0);
      expect(roundness).toBeLessThanOrEqual(1);
    }
  });
});
