import { memo, useCallback, useLayoutEffect, useMemo, useRef } from "react";
import { View } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import {
  PIXEL_LOADER_CELL_COUNT,
  type PixelLoaderSchedule,
  getPixelLoaderCellOpacity,
  getPixelLoaderGeometry,
  getPixelLoaderRestOpacity,
  getPixelLoaderRoundness,
  getPixelLoaderSchedule,
  type PixelLoaderProps,
} from "@/components/pixel-loader/pattern";

const CELLS = Array.from({ length: PIXEL_LOADER_CELL_COUNT }, (_, i) => i);
const SAMPLE_MS = 40;
const keyframeCache = new Map<string, Keyframe[][]>();

// The browser runs every loader off one absolute document-timeline epoch, so a sidebar full of
// them costs compositor time only. The schedule is pure, so sampling it once into keyframes draws
// the same frames the native worklet computes.
function getCellKeyframes(key: string, schedule: PixelLoaderSchedule, size: number): Keyframe[][] {
  const cached = keyframeCache.get(key);
  if (cached) {
    return cached;
  }
  const { squareRadius, roundRadius } = getPixelLoaderGeometry(size);
  const steps = Math.max(2, Math.ceil(schedule.periodMs / SAMPLE_MS));
  const frames = CELLS.map((cell) =>
    Array.from({ length: steps + 1 }, (_, step) => {
      const t = (step / steps) * schedule.periodMs;
      return {
        offset: step / steps,
        opacity: getPixelLoaderCellOpacity(schedule, cell, t),
        borderRadius: `${squareRadius + (roundRadius - squareRadius) * getPixelLoaderRoundness(schedule, t)}px`,
      };
    }),
  );
  keyframeCache.set(key, frames);
  return frames;
}

export const PixelLoader = memo(function PixelLoader({
  size = 15,
  color,
  variant = "shuffle",
  seed = "",
}: PixelLoaderProps) {
  const reduceMotion = useReducedMotion();
  const key = `${variant}:${seed}:${size}`;
  const schedule = useMemo(() => getPixelLoaderSchedule(variant, seed), [variant, seed]);
  const cellElements = useRef<(HTMLElement | null)[]>([]);
  const containerStyle = useMemo(() => ({ width: size, height: size }), [size]);

  useLayoutEffect(() => {
    if (reduceMotion) {
      return;
    }
    const frames = getCellKeyframes(key, schedule, size);
    const animations = cellElements.current.flatMap((element, cell) => {
      if (!element) {
        return [];
      }
      const animation = element.animate(frames[cell], {
        duration: schedule.periodMs,
        iterations: Number.POSITIVE_INFINITY,
      });
      animation.startTime = 0;
      return [animation];
    });
    return () => {
      for (const animation of animations) {
        animation.cancel();
      }
    };
  }, [key, reduceMotion, schedule, size]);

  return (
    <View style={containerStyle} aria-hidden>
      {CELLS.map((cell) => (
        <PixelCell
          key={cell}
          cell={cell}
          size={size}
          color={color}
          schedule={schedule}
          elements={cellElements}
        />
      ))}
    </View>
  );
});

function PixelCell({
  cell,
  size,
  color,
  schedule,
  elements,
}: {
  cell: number;
  size: number;
  color: string;
  schedule: PixelLoaderSchedule;
  elements: React.RefObject<(HTMLElement | null)[]>;
}) {
  const { gap, cellSize, squareRadius, roundRadius } = getPixelLoaderGeometry(size);
  const setElement = useCallback(
    (instance: View | null) => {
      elements.current[cell] = instance instanceof HTMLElement ? instance : null;
    },
    [cell, elements],
  );
  const cellStyle = useMemo(
    () => ({
      position: "absolute" as const,
      left: (cell % 3) * (cellSize + gap),
      top: Math.floor(cell / 3) * (cellSize + gap),
      width: cellSize,
      height: cellSize,
      backgroundColor: color,
      opacity: getPixelLoaderRestOpacity(schedule, cell),
      borderRadius: schedule.segments[0].round ? roundRadius : squareRadius,
    }),
    [cell, cellSize, color, gap, roundRadius, schedule, squareRadius],
  );

  return <View ref={setElement} style={cellStyle} />;
}
