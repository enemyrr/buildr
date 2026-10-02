import Svg, { Circle } from "react-native-svg";
import { withUnistyles } from "react-native-unistyles";
import type { Theme } from "@/styles/theme";
import { clampPct } from "./format";
import type { UsageTone } from "./types";

const STROKE_WIDTH = 2;

function UsageRingBase({
  percent,
  size,
  trackColor = "",
  progressColor = "",
}: {
  percent: number;
  size: number;
  trackColor?: string;
  progressColor?: string;
}) {
  const center = size / 2;
  const radius = (size - STROKE_WIDTH) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (clampPct(percent) / 100) * circumference;
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke={trackColor}
        strokeWidth={STROKE_WIDTH}
      />
      <Circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke={progressColor}
        strokeWidth={STROKE_WIDTH}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={dashOffset}
        // SVG strokes start at three o'clock; the ring reads clockwise from twelve.
        transform={`rotate(-90 ${center} ${center})`}
      />
    </Svg>
  );
}

const ThemedUsageRing = withUnistyles(UsageRingBase);

// Healthy rings stay muted, so color only shows up when a window nears its limit.
function ringColors(progress: (theme: Theme) => string) {
  return (theme: Theme) => ({ trackColor: theme.colors.surface3, progressColor: progress(theme) });
}

const RING_COLORS = {
  default: ringColors((theme) => theme.colors.foregroundMuted),
  ok: ringColors((theme) => theme.colors.foregroundMuted),
  warning: ringColors((theme) => theme.colors.statusWarning),
  danger: ringColors((theme) => theme.colors.statusDanger),
} satisfies Record<UsageTone, unknown>;

/** A window's share as a small ring, colored by its tone. */
export function UsageRing({
  percent,
  tone,
  size = 12,
}: {
  percent: number;
  tone: UsageTone;
  size?: number;
}) {
  return <ThemedUsageRing percent={percent} size={size} uniProps={RING_COLORS[tone]} />;
}
