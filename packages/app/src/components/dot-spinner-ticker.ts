export const DOT_SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
export const DOT_SPINNER_FRAME_MS = 80;

// One interval drives every mounted spinner so a tick is one batched commit, not one per spinner.
const listeners = new Set<() => void>();
let frame = 0;
let timer: ReturnType<typeof setInterval> | null = null;

function tick() {
  frame = (frame + 1) % DOT_SPINNER_FRAMES.length;
  for (const listener of listeners) listener();
}

export function subscribeDotSpinnerTicker(listener: () => void): () => void {
  listeners.add(listener);
  timer ??= setInterval(tick, DOT_SPINNER_FRAME_MS);
  return () => {
    listeners.delete(listener);
    if (listeners.size > 0 || timer === null) return;
    clearInterval(timer);
    timer = null;
  };
}

export function getDotSpinnerFrame(): number {
  return frame;
}
