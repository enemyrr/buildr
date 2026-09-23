import { memo, useLayoutEffect, useMemo, useState } from "react";
import { View } from "react-native";
import Animated, {
  makeMutable,
  type SharedValue,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
} from "react-native-reanimated";
import { scheduleOnUI } from "react-native-worklets";
import { useRetainedPanelActive } from "@/components/retained-panel";
import {
  PIXEL_LOADER_CELL_COUNT,
  type PixelLoaderProps,
  type PixelLoaderSchedule,
  getPixelLoaderCellOpacity,
  getPixelLoaderGeometry,
  getPixelLoaderRestOpacity,
  getPixelLoaderRoundness,
  getPixelLoaderSchedule,
} from "@/components/pixel-loader/pattern";

const CELLS = Array.from({ length: PIXEL_LOADER_CELL_COUNT }, (_, i) => i);
const sharedNow = makeMutable(Date.now());
const activeLoaderCount = makeMutable(0);
const clockRunning = makeMutable(false);
let nextListenerId = 1;

function advanceSharedNow(): void {
  "worklet";
  if (activeLoaderCount.value === 0) {
    clockRunning.value = false;
    return;
  }
  sharedNow.value = Date.now();
  requestAnimationFrame(advanceSharedNow);
}

function registerListener(
  now: SharedValue<number>,
  registered: SharedValue<boolean>,
  listenerId: number,
): void {
  "worklet";
  if (registered.value) {
    return;
  }
  registered.value = true;
  now.value = Date.now();
  sharedNow.addListener(listenerId, (value) => {
    now.value = value;
  });
  activeLoaderCount.value += 1;
  if (!clockRunning.value) {
    clockRunning.value = true;
    requestAnimationFrame(advanceSharedNow);
  }
}

function unregisterListener(registered: SharedValue<boolean>, listenerId: number): void {
  "worklet";
  if (!registered.value) {
    return;
  }
  registered.value = false;
  sharedNow.removeListener(listenerId);
  activeLoaderCount.value -= 1;
}

// One UI-thread clock for every loader. The local value lets a retained, hidden loader detach
// without unmounting its cells or keeping their style worklets subscribed.
function usePixelLoaderClock(active: boolean): SharedValue<number> {
  const now = useSharedValue(Date.now());
  const registered = useSharedValue(false);
  const [listenerId] = useState(() => nextListenerId++);

  useLayoutEffect(() => {
    if (!active) {
      return;
    }
    scheduleOnUI(registerListener, now, registered, listenerId);
    return () => {
      scheduleOnUI(unregisterListener, registered, listenerId);
    };
  }, [active, listenerId, now, registered]);

  return now;
}

export const PixelLoader = memo(function PixelLoader({
  size = 15,
  color,
  variant = "shuffle",
  seed = "",
}: PixelLoaderProps) {
  const panelActive = useRetainedPanelActive();
  const reduceMotion = useReducedMotion();
  const now = usePixelLoaderClock(panelActive && !reduceMotion);
  const schedule = useMemo(() => getPixelLoaderSchedule(variant, seed), [variant, seed]);
  const containerStyle = useMemo(() => ({ width: size, height: size }), [size]);

  return (
    <View
      style={containerStyle}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {CELLS.map((cell) => (
        <PixelCell
          key={cell}
          cell={cell}
          size={size}
          color={color}
          schedule={schedule}
          now={now}
          still={reduceMotion}
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
  now,
  still,
}: {
  cell: number;
  size: number;
  color: string;
  schedule: PixelLoaderSchedule;
  now: SharedValue<number>;
  still: boolean;
}) {
  const { gap, cellSize, squareRadius, roundRadius } = getPixelLoaderGeometry(size);
  const restOpacity = getPixelLoaderRestOpacity(schedule, cell);
  const restRadius = schedule.segments[0].round ? roundRadius : squareRadius;

  const animatedStyle = useAnimatedStyle(() => {
    if (still) {
      return { opacity: restOpacity, borderRadius: restRadius };
    }
    const roundness = getPixelLoaderRoundness(schedule, now.value);
    return {
      opacity: getPixelLoaderCellOpacity(schedule, cell, now.value),
      borderRadius: squareRadius + (roundRadius - squareRadius) * roundness,
    };
  });

  const cellStyle = useMemo(
    () => [
      {
        position: "absolute" as const,
        left: (cell % 3) * (cellSize + gap),
        top: Math.floor(cell / 3) * (cellSize + gap),
        width: cellSize,
        height: cellSize,
        backgroundColor: color,
      },
      animatedStyle,
    ],
    [animatedStyle, cell, cellSize, color, gap],
  );

  return <Animated.View style={cellStyle} />;
}
