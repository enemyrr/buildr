import { memo, useEffect, useMemo, useState } from "react";
import { Text, type TextStyle } from "react-native";
import { useReducedMotion } from "react-native-reanimated";

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const FRAME_MS = 80;

interface DotSpinnerProps {
  /** Glyph box in points; the glyph renders at this font size. */
  size?: number;
  color: string;
}

function nextFrame(current: number): number {
  return (current + 1) % FRAMES.length;
}

/** A quiet braille-dot activity indicator, sized to sit inline with text. */
export const DotSpinner = memo(function DotSpinner({ size = 12, color }: DotSpinnerProps) {
  const reduceMotion = useReducedMotion();
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (reduceMotion) return;
    const advance = () => setFrame(nextFrame);
    const id = setInterval(advance, FRAME_MS);
    return () => clearInterval(id);
  }, [reduceMotion]);

  const style = useMemo<TextStyle>(
    () => ({ width: size, fontSize: size, lineHeight: size, textAlign: "center", color }),
    [size, color],
  );

  return (
    <Text style={style} accessibilityElementsHidden importantForAccessibility="no">
      {FRAMES[reduceMotion ? 0 : frame]}
    </Text>
  );
});
