import type { EncodedImage } from "./downscale-for-send.types";
import {
  base64ByteLength,
  planHeavyResultFallback,
  planImageDownscale,
  type ImageDownscalePlan,
} from "./image-downscale";

function base64ToBlob(image: EncodedImage): Blob {
  const binary = atob(image.data);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: image.mimeType });
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

async function encodeBitmap(bitmap: ImageBitmap, plan: ImageDownscalePlan): Promise<Blob> {
  const canvas = new OffscreenCanvas(plan.width, plan.height);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D context is unavailable.");
  // JPEG has no alpha; paint transparent areas white instead of black.
  if (plan.mimeType === "image/jpeg") {
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, plan.width, plan.height);
  }
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, 0, 0, plan.width, plan.height);
  return await canvas.convertToBlob({
    type: plan.mimeType,
    quality: plan.quality ?? undefined,
  });
}

/**
 * Resizes and re-encodes an image over the send limits. An image the browser
 * can't decode is sent unchanged, so the provider reports the real problem.
 */
export async function downscaleImageForSend(image: EncodedImage): Promise<EncodedImage> {
  const source = base64ToBlob(image);
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(source);
  } catch (error) {
    if (error instanceof DOMException) return image;
    throw error;
  }
  try {
    const plan = planImageDownscale({
      width: bitmap.width,
      height: bitmap.height,
      byteLength: base64ByteLength(image.data),
      mimeType: image.mimeType,
    });
    if (!plan) return image;
    let result = await encodeBitmap(bitmap, plan);
    const fallback = planHeavyResultFallback(plan, result.size);
    if (fallback) result = await encodeBitmap(bitmap, fallback);
    return { data: await blobToBase64(result), mimeType: result.type };
  } finally {
    bitmap.close();
  }
}
