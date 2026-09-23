import type { ComposerLinkOverlayProps } from "./link-overlay.types";

// Native text inputs don't open links, so only web draws the overlay.
export function ComposerLinkOverlay(_props: ComposerLinkOverlayProps) {
  return null;
}
