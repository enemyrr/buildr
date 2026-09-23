import type { ComposerTextOverlayProps } from "./text-overlay.types";

// Native text inputs can't paint links or chips, so only web draws the overlay.
export function ComposerTextOverlay(_props: ComposerTextOverlayProps) {
  return null;
}
