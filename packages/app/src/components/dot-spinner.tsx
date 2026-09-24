import { memo, useMemo, useSyncExternalStore } from "react";
import { Text, type TextStyle } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import {
  DOT_SPINNER_FRAMES,
  getDotSpinnerFrame,
  subscribeDotSpinnerTicker,
} from "@/components/dot-spinner-ticker";
import { useRetainedPanelActive } from "@/components/retained-panel";

export interface DotSpinnerProps {
  /** Glyph box in points; the glyph renders at this font size. */
  size?: number;
  color: string;
}

function subscribeNever(): () => void {
  return () => {};
}

function getRestFrame(): number {
  return 0;
}

/** A quiet braille-dot activity indicator, sized to sit inline with text. */
export const DotSpinner = memo(function DotSpinner({ size = 12, color }: DotSpinnerProps) {
  const reduceMotion = useReducedMotion();
  const panelActive = useRetainedPanelActive();
  const animating = panelActive && !reduceMotion;
  const frame = useSyncExternalStore(
    animating ? subscribeDotSpinnerTicker : subscribeNever,
    animating ? getDotSpinnerFrame : getRestFrame,
  );

  const style = useMemo<TextStyle>(
    () => ({ width: size, fontSize: size, lineHeight: size, textAlign: "center", color }),
    [size, color],
  );

  return (
    <Text style={style} accessibilityElementsHidden importantForAccessibility="no">
      {DOT_SPINNER_FRAMES[frame]}
    </Text>
  );
});
