import { useEffect } from "react";
import {
  cancelAnimation,
  createAnimatedComponent,
  Easing,
  useAnimatedProps,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import { scheduleOnRN } from "react-native-worklets";

// Apple-style "hello" handwriting. Stroke lengths are precomputed so the dash
// offset can draw each path from start to end.
const H1_PATH =
  "M8.69214 166.553C36.2393 151.239 61.3409 131.548 89.8191 98.0295C109.203 75.1488 119.625 49.0228 120.122 31.0026C120.37 17.6036 113.836 7.43883 101.759 7.43883C88.3598 7.43883 79.9231 17.6036 74.7122 40.9363C69.005 66.5793 64.7866 96.0036 54.1166 190.356";
const ELLO_PATH =
  "M55.1624 181.135C60.6251 133.114 81.4118 98.0479 107.963 98.0479C123.844 98.0479 133.937 110.703 131.071 128.817C129.457 139.487 127.587 150.405 125.408 163.06C122.869 178.941 130.128 191.348 152.122 191.348C184.197 191.348 219.189 173.523 237.097 145.915C243.198 136.509 245.68 128.073 245.928 119.884C246.176 104.996 237.739 93.8296 222.851 93.8296C203.992 93.8296 189.6 115.17 189.6 142.465C189.6 171.745 205.481 192.341 239.208 192.341C285.066 192.341 335.86 137.292 359.199 75.8585C365.788 58.513 368.26 42.4065 368.26 31.1512C368.26 17.8057 364.042 7.55823 352.131 7.55823C340.469 7.55823 332.777 16.6141 325.829 30.9129C317.688 47.4967 311.667 71.4162 309.203 98.4549C303 166.301 316.896 191.348 349.936 191.348C390 191.348 434.542 135.534 457.286 75.6686C463.803 58.513 466.275 42.4065 466.275 31.1512C466.275 17.8057 462.057 7.55823 450.146 7.55823C438.484 7.55823 430.792 16.6141 423.844 30.9129C415.703 47.4967 409.682 71.4162 407.218 98.4549C401.015 166.301 414.911 191.348 444.416 191.348C473.874 191.348 489.877 165.67 499.471 138.402C508.955 111.447 520.618 94.8221 544.935 94.8221C565.035 94.8221 580.916 109.71 580.916 137.75C580.916 168.768 560.792 192.093 535.362 192.341C512.984 192.589 498.285 174.475 499.774 147.179C501.511 116.907 519.873 94.8221 543.943 94.8221C557.839 94.8221 569.51 100.999 578.682 107.725C603.549 125.866 622.709 114.656 630.047 96.7186";
const H1_LENGTH = 414;
const ELLO_LENGTH = 2019;

const VIEWBOX_WIDTH = 638;
const VIEWBOX_HEIGHT = 200;

const EASE_IN_OUT = Easing.bezier(0.42, 0, 0.58, 1);

const AnimatedPath = createAnimatedComponent(Path);

interface HelloLetteringProps {
  height: number;
  color: string;
  /** Renders the lettering fully drawn, without animating. */
  drawn?: boolean;
  onComplete?: () => void;
}

export function HelloLettering({ height, color, drawn = false, onComplete }: HelloLetteringProps) {
  const h1Progress = useSharedValue(drawn ? 1 : 0);
  const elloProgress = useSharedValue(drawn ? 1 : 0);

  useEffect(() => {
    if (drawn) {
      return;
    }
    h1Progress.value = withTiming(1, { duration: 800, easing: EASE_IN_OUT });
    elloProgress.value = withDelay(
      700,
      withTiming(1, { duration: 2800, easing: EASE_IN_OUT }, (finished) => {
        if (finished && onComplete) {
          scheduleOnRN(onComplete);
        }
      }),
    );
    return () => {
      cancelAnimation(h1Progress);
      cancelAnimation(elloProgress);
    };
  }, [drawn, h1Progress, elloProgress, onComplete]);

  const h1Props = useAnimatedProps(() => ({
    strokeDashoffset: H1_LENGTH * (1 - h1Progress.value),
    strokeOpacity: Math.min(1, h1Progress.value * 2),
  }));

  const elloProps = useAnimatedProps(() => ({
    strokeDashoffset: ELLO_LENGTH * (1 - elloProgress.value),
    strokeOpacity: Math.min(1, elloProgress.value * 4),
  }));

  return (
    <Svg
      width={(height * VIEWBOX_WIDTH) / VIEWBOX_HEIGHT}
      height={height}
      viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
      fill="none"
      accessibilityLabel="hello"
    >
      <AnimatedPath
        d={H1_PATH}
        stroke={color}
        strokeWidth={14.8883}
        strokeLinecap="round"
        strokeDasharray={H1_LENGTH}
        animatedProps={h1Props}
      />
      <AnimatedPath
        d={ELLO_PATH}
        stroke={color}
        strokeWidth={14.8883}
        strokeLinecap="round"
        strokeDasharray={ELLO_LENGTH}
        animatedProps={elloProps}
      />
    </Svg>
  );
}
