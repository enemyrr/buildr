import { useEffect } from "react";
import {
  Easing,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";

const HOLD_MS = 1400;
const REVEAL_SPAN = 0.08;
const REVEAL_OFFSET = 4;

/**
 * Plays 0 → 1 over `durationMs`, holds the last frame, and repeats while `active`.
 * Inactive previews and reduced motion rest on the last frame.
 */
export function useLoopProgress(active: boolean, durationMs: number): SharedValue<number> {
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(1);

  useEffect(() => {
    if (!active || reduceMotion) {
      cancelAnimation(progress);
      progress.value = withTiming(1, { duration: 150 });
      return;
    }
    progress.value = 0;
    progress.value = withRepeat(
      withSequence(
        withTiming(1, { duration: durationMs, easing: Easing.linear }),
        withDelay(HOLD_MS, withTiming(0, { duration: 0 })),
      ),
      -1,
    );
    return () => cancelAnimation(progress);
  }, [active, durationMs, progress, reduceMotion]);

  return progress;
}

/** Fades and lifts an element in as `progress` crosses `start`. */
export function useRevealStyle(progress: SharedValue<number>, start: number) {
  return useAnimatedStyle(() => {
    const t = interpolate(progress.value, [start, start + REVEAL_SPAN], [0, 1], "clamp");
    return { opacity: t, transform: [{ translateY: (1 - t) * REVEAL_OFFSET }] };
  });
}

/** Grows an element's width from 0 to 100% between `start` and `end`. */
export function useGrowStyle(progress: SharedValue<number>, start: number, end: number) {
  return useAnimatedStyle(() => {
    const t = interpolate(progress.value, [start, end], [0, 100], "clamp");
    return { width: `${t}%` };
  });
}
