import { memo, useMemo, type CSSProperties } from "react";
import { DOT_SPINNER_FRAMES, DOT_SPINNER_FRAME_MS } from "@/components/dot-spinner-ticker";
import type { DotSpinnerProps } from "@/components/dot-spinner";

// Web steps a vertical glyph strip with CSS, so spinners never re-render. Hidden retained panels
// are display:none, which pauses the animation for free.
const STYLE_ELEMENT_ID = "paseo-dot-spinner-styles";
const STRIP_CLASS = "paseo-dot-spinner-strip";
const STYLE_CSS = `
  @keyframes paseo-dot-spinner {
    to { transform: translateY(-100%); }
  }
  .${STRIP_CLASS} {
    display: flex;
    flex-direction: column;
    animation: paseo-dot-spinner ${DOT_SPINNER_FRAMES.length * DOT_SPINNER_FRAME_MS}ms steps(${DOT_SPINNER_FRAMES.length}) infinite;
  }
  @media (prefers-reduced-motion: reduce) {
    .${STRIP_CLASS} { animation: none; }
  }
`;

function ensureStyles() {
  if (typeof document === "undefined" || document.getElementById(STYLE_ELEMENT_ID)) return;
  const element = document.createElement("style");
  element.id = STYLE_ELEMENT_ID;
  element.textContent = STYLE_CSS;
  document.head.appendChild(element);
}

/** A quiet braille-dot activity indicator, sized to sit inline with text. */
export const DotSpinner = memo(function DotSpinner({ size = 12, color }: DotSpinnerProps) {
  ensureStyles();

  const boxStyle = useMemo<CSSProperties>(
    () => ({
      display: "block",
      flexShrink: 0,
      width: size,
      height: size,
      overflow: "hidden",
      fontSize: size,
      lineHeight: `${size}px`,
      textAlign: "center",
      color,
    }),
    [size, color],
  );
  const glyphStyle = useMemo<CSSProperties>(() => ({ display: "block", height: size }), [size]);

  return (
    <span aria-hidden style={boxStyle}>
      <span className={STRIP_CLASS}>
        {DOT_SPINNER_FRAMES.map((glyph) => (
          <span key={glyph} style={glyphStyle}>
            {glyph}
          </span>
        ))}
      </span>
    </span>
  );
});
