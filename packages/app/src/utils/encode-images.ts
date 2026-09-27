import type { AttachmentMetadata } from "@/attachments/types";
import { encodeAttachmentsForSend } from "@/attachments/service";
import { downscaleImageForSend } from "@/attachments/downscale-for-send";

type ImageInput = AttachmentMetadata;

export async function encodeImages(
  images?: ImageInput[],
): Promise<Array<{ data: string; mimeType: string }> | undefined> {
  const encoded = await encodeAttachmentsForSend(images);
  if (!encoded) return undefined;
  return await Promise.all(encoded.map(downscaleImageForSend));
}
