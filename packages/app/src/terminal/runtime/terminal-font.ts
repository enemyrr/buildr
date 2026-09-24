const DEFAULT_TERMINAL_FONT_SIZE = 13;

export const DEFAULT_TERMINAL_FONT_FAMILY = [
  // Prefer common developer fonts, with Nerd Font variants for prompt/TUI glyphs.
  "JetBrains Mono",
  "JetBrainsMono Nerd Font",
  "JetBrainsMono NF",
  "MesloLGM Nerd Font",
  "MesloLGM NF",
  "Hack Nerd Font",
  "FiraCode Nerd Font",
  // PUA-only fallback (many Nerd glyphs live here on some systems).
  "Symbols Nerd Font",
  // System fallbacks.
  "SF Mono",
  "Menlo",
  "Monaco",
  "Consolas",
  "'Liberation Mono'",
  "monospace",
].join(", ");

export function resolveTerminalFontFamily(fontFamily: string | undefined): string {
  const trimmed = fontFamily?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : DEFAULT_TERMINAL_FONT_FAMILY;
}

export function resolveTerminalFontSize(fontSize: number | undefined): number {
  return typeof fontSize === "number" && Number.isFinite(fontSize) && fontSize > 0
    ? fontSize
    : DEFAULT_TERMINAL_FONT_SIZE;
}

// Wider and taller than common monospace cells (~0.6em x ~1.2em), so the estimate stays within the
// real grid. A shell started wider than its pane wraps its first prompt and leaves zsh's `%` mark.
const ESTIMATED_CELL_WIDTH_EM = 0.65;
const ESTIMATED_CELL_HEIGHT_EM = 1.3;
// Scrollbar plus pane padding.
const ESTIMATED_CHROME_PX = 16;

/** Estimates a pane's grid before a terminal mounts in it, erring small. */
export function estimateTerminalSize(input: {
  width: number;
  height: number;
  fontSize?: number;
}): { rows: number; cols: number } | null {
  const fontSize = resolveTerminalFontSize(input.fontSize);
  const cols = Math.floor(
    (input.width - ESTIMATED_CHROME_PX) / (fontSize * ESTIMATED_CELL_WIDTH_EM),
  );
  const rows = Math.floor(input.height / (fontSize * ESTIMATED_CELL_HEIGHT_EM));
  return cols > 0 && rows > 0 ? { rows, cols } : null;
}
