import Svg, { Path } from "react-native-svg";
import { useUnistyles } from "react-native-unistyles";

interface PaseoLogoProps {
  size?: number;
  color?: string;
}

// The Buildr pixel "B". Keep in sync with GLYPH in scripts/generate-buildr-icon.ts.
const GLYPH = [
  "######.",
  "##...##",
  "##...##",
  "##...##",
  "######.",
  "##...##",
  "##...##",
  "##...##",
  "######.",
];
const CELL = 60;
export const PASEO_LOGO_VIEWBOX = 700;
const VIEWBOX = PASEO_LOGO_VIEWBOX;
const ORIGIN_X = (VIEWBOX - CELL * GLYPH[0].length) / 2;
const ORIGIN_Y = (VIEWBOX - CELL * GLYPH.length) / 2;

// One rectangle per horizontal run of filled cells.
export const PASEO_LOGO_PATH = GLYPH.flatMap((line, row) =>
  [...line.matchAll(/#+/g)].map((run) => {
    const x = ORIGIN_X + (run.index ?? 0) * CELL;
    const y = ORIGIN_Y + row * CELL;
    return `M${x} ${y}h${run[0].length * CELL}v${CELL}h${-run[0].length * CELL}z`;
  }),
).join("");

export function PaseoLogo({ size = 64, color }: PaseoLogoProps) {
  const { theme } = useUnistyles();
  const fill = color ?? theme.colors.foreground;

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`} fill="none">
      <Path d={PASEO_LOGO_PATH} fill={fill} />
    </Svg>
  );
}
