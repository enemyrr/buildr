// Providers reject or silently shrink oversized images, and a large base64
// payload slows every send. Images past either limit are resized and re-encoded
// before they leave the client.
export const MAX_IMAGE_EDGE_PX = 2000;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const LOSSY_QUALITY = 0.85;

export type DownscaleMimeType = "image/png" | "image/jpeg" | "image/webp";

export interface ImageDownscaleSource {
  width: number;
  height: number;
  byteLength: number;
  mimeType: string;
}

export interface ImageDownscalePlan {
  width: number;
  height: number;
  mimeType: DownscaleMimeType;
  /** Encoder quality for lossy formats; null for PNG. */
  quality: number | null;
}

function isDownscaleMimeType(mimeType: string): mimeType is DownscaleMimeType {
  return mimeType === "image/png" || mimeType === "image/jpeg" || mimeType === "image/webp";
}

/**
 * Returns how to re-encode an image, or null to send it unchanged. GIFs and other
 * formats pass through, because a canvas drops animation frames. A PNG keeps its
 * format when resizing brings it down; a PNG that is too heavy at its own size
 * becomes JPEG, since re-encoding it as PNG would not shrink it.
 */
export function planImageDownscale(source: ImageDownscaleSource): ImageDownscalePlan | null {
  if (!isDownscaleMimeType(source.mimeType)) return null;
  const longestEdge = Math.max(source.width, source.height);
  const isTooLarge = longestEdge > MAX_IMAGE_EDGE_PX;
  const isTooHeavy = source.byteLength > MAX_IMAGE_BYTES;
  if (!isTooLarge && !isTooHeavy) return null;

  const scale = isTooLarge ? MAX_IMAGE_EDGE_PX / longestEdge : 1;
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));
  if (source.mimeType === "image/png" && isTooLarge) {
    return { width, height, mimeType: "image/png", quality: null };
  }
  const mimeType = source.mimeType === "image/webp" ? "image/webp" : "image/jpeg";
  return { width, height, mimeType, quality: LOSSY_QUALITY };
}

/** Plans a JPEG fallback for an encoded result that is still over the byte limit. */
export function planHeavyResultFallback(
  plan: ImageDownscalePlan,
  resultByteLength: number,
): ImageDownscalePlan | null {
  if (resultByteLength <= MAX_IMAGE_BYTES || plan.mimeType !== "image/png") return null;
  return { ...plan, mimeType: "image/jpeg", quality: LOSSY_QUALITY };
}

export function base64ByteLength(base64: string): number {
  const padding = /=*$/.exec(base64)?.[0].length ?? 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}
