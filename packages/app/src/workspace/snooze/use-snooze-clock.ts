import { useEffect, useState } from "react";
import type { WorkspaceSnooze } from "@getpaseo/protocol/messages";
import { nextSnoozeWakeAtMs } from "./model";

// setTimeout overflows past 2^31 - 1 ms. A far wake time rechecks at this cap instead.
const MAX_TIMER_DELAY_MS = 2_147_483_647;

/** Returns a timestamp that advances each time one of `snoozes` reaches its wake time. */
export function useSnoozeClock(snoozes: readonly WorkspaceSnooze[]): number {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const nextWakeAtMs = nextSnoozeWakeAtMs(snoozes, nowMs);
  useEffect(() => {
    if (nextWakeAtMs === null) {
      return;
    }
    const delay = Math.min(MAX_TIMER_DELAY_MS, Math.max(0, nextWakeAtMs - Date.now()));
    // A timer can fire a hair early; never report a time before the wake it waited for.
    const timeout = setTimeout(() => setNowMs(Math.max(Date.now(), nextWakeAtMs)), delay);
    return () => clearTimeout(timeout);
  }, [nextWakeAtMs]);
  return nowMs;
}
