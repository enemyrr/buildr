// A 3x3 pixel grid for long-running work. Every cell's opacity is a pure function of time, so the
// native UI-thread clock and the sampled web keyframes draw the same frames.

export const PIXEL_LOADER_CELL_COUNT = 9;

export type PixelLoaderVariant = "drive" | "dots" | "orbit" | "shuffle";

export interface PixelLoaderProps {
  size?: number;
  color: string;
  variant?: PixelLoaderVariant;
  // Picks the shuffle sequence; pass a stable id so each agent keeps its own rhythm.
  seed?: string;
}

interface PixelPattern {
  // Per-cell phase offset in ms; -1 keeps the cell parked at the idle opacity.
  delays: readonly number[];
  durationMs: number;
}

export interface PixelLoaderSegment extends PixelPattern {
  round: boolean;
  startMs: number;
  lengthMs: number;
}

export interface PixelLoaderSchedule {
  segments: readonly PixelLoaderSegment[];
  periodMs: number;
  offsetMs: number;
}

const BASE_OPACITY = 0.15;
const IDLE_OPACITY = 0.07;
const PEAK_AT = 0.3;
const BLEND_MS = 280;
const SHUFFLE_SEGMENT_COUNT = 6;

const cellIndices = Array.from({ length: PIXEL_LOADER_CELL_COUNT }, (_, i) => i);
const ORBIT_ORDER = [0, 1, 2, 5, 8, 7, 6, 3];

// The chevron's cycle is shorter than its sweep, so two fronts are always in flight.
const PATTERNS = {
  drive: {
    delays: cellIndices.map((i) => ((i % 3) + Math.abs(Math.floor(i / 3) - 1)) * 90),
    durationMs: 650,
  },
  orbit: {
    delays: cellIndices.map((i) => {
      const k = ORBIT_ORDER.indexOf(i);
      return k === -1 ? -1 : k * 110;
    }),
    durationMs: 950,
  },
  rain: {
    delays: cellIndices.map((i) => Math.floor(i / 3) * 120 + [0, 240, 120][i % 3]),
    durationMs: 800,
  },
  twinkle: {
    delays: [0, 420, 180, 600, 300, 60, 480, 240, 540],
    durationMs: 700,
  },
} satisfies Record<string, PixelPattern>;

type PatternName = keyof typeof PATTERNS;
const SHUFFLE_PATTERNS: readonly PatternName[] = ["drive", "orbit", "rain", "twinkle"];

export function getPixelLoaderSchedule(
  variant: PixelLoaderVariant,
  seed = "",
): PixelLoaderSchedule {
  if (variant !== "shuffle") {
    const pattern = variant === "dots" ? PATTERNS.drive : PATTERNS[variant];
    return {
      segments: [
        { ...pattern, round: variant === "dots", startMs: 0, lengthMs: pattern.durationMs },
      ],
      periodMs: pattern.durationMs,
      offsetMs: 0,
    };
  }

  // Seeded so each agent keeps its own sequence across remounts while neighbours drift apart.
  const random = createRandom(seed);
  const segments: PixelLoaderSegment[] = [];
  let startMs = 0;
  let previous: PatternName | null = null;
  for (let i = 0; i < SHUFFLE_SEGMENT_COUNT; i += 1) {
    const first = segments[0]?.delays;
    const options = SHUFFLE_PATTERNS.filter(
      (name) =>
        name !== previous && (i < SHUFFLE_SEGMENT_COUNT - 1 || PATTERNS[name].delays !== first),
    );
    const name = options[Math.floor(random() * options.length)];
    const pattern = PATTERNS[name];
    const lengthMs = pattern.durationMs * (3 + Math.floor(random() * 2));
    segments.push({ ...pattern, round: random() < 0.35, startMs, lengthMs });
    startMs += lengthMs;
    previous = name;
  }
  return { segments, periodMs: startMs, offsetMs: Math.floor(random() * startMs) };
}

export function getPixelLoaderRestOpacity(schedule: PixelLoaderSchedule, cell: number): number {
  return schedule.segments[0].delays[cell] < 0 ? IDLE_OPACITY : BASE_OPACITY;
}

// Worklet declarations compile to consts that capture helpers eagerly, so define callees first.
function getLoopTime(schedule: PixelLoaderSchedule, nowMs: number): number {
  "worklet";
  const { periodMs } = schedule;
  return (((nowMs + schedule.offsetMs) % periodMs) + periodMs) % periodMs;
}

function findSegmentIndex(schedule: PixelLoaderSchedule, nowMs: number): number {
  "worklet";
  const t = getLoopTime(schedule, nowMs);
  const { segments } = schedule;
  let index = 0;
  while (index < segments.length - 1 && t >= segments[index].startMs + segments[index].lengthMs) {
    index += 1;
  }
  return index;
}

function smoothstep(x: number): number {
  "worklet";
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
}

function getBlendWeight(segment: PixelLoaderSegment, localMs: number, count: number): number {
  "worklet";
  const blendStart = segment.lengthMs - BLEND_MS;
  if (count === 1 || localMs <= blendStart) {
    return 0;
  }
  return smoothstep((localMs - blendStart) / BLEND_MS);
}

function pulse(timeMs: number, delayMs: number, durationMs: number): number {
  "worklet";
  if (delayMs < 0) {
    return IDLE_OPACITY;
  }
  const phase = ((((timeMs - delayMs) % durationMs) + durationMs) % durationMs) / durationMs;
  const rise = phase < PEAK_AT ? phase / PEAK_AT : 1 - (phase - PEAK_AT) / (1 - PEAK_AT);
  return BASE_OPACITY + (1 - BASE_OPACITY) * smoothstep(rise);
}

export function getPixelLoaderCellOpacity(
  schedule: PixelLoaderSchedule,
  cell: number,
  nowMs: number,
): number {
  "worklet";
  const { segments } = schedule;
  const index = findSegmentIndex(schedule, nowMs);
  const segment = segments[index];
  const localMs = getLoopTime(schedule, nowMs) - segment.startMs;
  const current = pulse(localMs, segment.delays[cell], segment.durationMs);
  const weight = getBlendWeight(segment, localMs, segments.length);
  if (weight === 0) {
    return current;
  }
  const next = segments[(index + 1) % segments.length];
  const incoming = pulse(localMs - segment.lengthMs, next.delays[cell], next.durationMs);
  return current + (incoming - current) * weight;
}

// 0 is the square cell, 1 the circle; shapes morph during the same blend as the motion.
export function getPixelLoaderRoundness(schedule: PixelLoaderSchedule, nowMs: number): number {
  "worklet";
  const { segments } = schedule;
  const index = findSegmentIndex(schedule, nowMs);
  const segment = segments[index];
  const localMs = getLoopTime(schedule, nowMs) - segment.startMs;
  const current = segment.round ? 1 : 0;
  const next = segments[(index + 1) % segments.length].round ? 1 : 0;
  return current + (next - current) * getBlendWeight(segment, localMs, segments.length);
}

// mulberry32 over an FNV-1a hash of the seed.
function createRandom(seed: string): () => number {
  let state = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    state = Math.imul(state ^ seed.charCodeAt(i), 16777619);
  }
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function getPixelLoaderGeometry(size: number) {
  const gap = size / 10;
  const cellSize = (size - gap * 2) / 3;
  return {
    gap,
    cellSize,
    squareRadius: cellSize * 0.25,
    roundRadius: cellSize / 2,
  };
}
