import type { EncodedImage } from "./downscale-for-send.types";

// Native image pickers already cap photo dimensions, so native sends images as is.
export async function downscaleImageForSend(image: EncodedImage): Promise<EncodedImage> {
  return image;
}
