import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DOT_SPINNER_FRAME_MS,
  getDotSpinnerFrame,
  subscribeDotSpinnerTicker,
} from "@/components/dot-spinner-ticker";

describe("dot spinner ticker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shares one interval across subscribers and stops at zero", () => {
    const first = vi.fn();
    const second = vi.fn();
    const unsubscribeFirst = subscribeDotSpinnerTicker(first);
    const unsubscribeSecond = subscribeDotSpinnerTicker(second);
    expect(vi.getTimerCount()).toBe(1);

    const start = getDotSpinnerFrame();
    vi.advanceTimersByTime(DOT_SPINNER_FRAME_MS);
    expect(getDotSpinnerFrame()).not.toBe(start);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);

    unsubscribeFirst();
    expect(vi.getTimerCount()).toBe(1);
    unsubscribeSecond();
    expect(vi.getTimerCount()).toBe(0);
  });
});
