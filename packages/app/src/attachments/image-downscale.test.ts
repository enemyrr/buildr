import { describe, expect, it } from "vitest";
import {
  MAX_IMAGE_BYTES,
  base64ByteLength,
  planHeavyResultFallback,
  planImageDownscale,
} from "./image-downscale";

const SMALL = 100_000;

describe("planImageDownscale", () => {
  it("sends images within both limits unchanged", () => {
    expect(
      planImageDownscale({ width: 2000, height: 1200, byteLength: SMALL, mimeType: "image/png" }),
    ).toBeNull();
  });

  it("resizes an oversized PNG to a 2000px longest edge and keeps PNG", () => {
    expect(
      planImageDownscale({ width: 4000, height: 3000, byteLength: SMALL, mimeType: "image/png" }),
    ).toEqual({ width: 2000, height: 1500, mimeType: "image/png", quality: null });
  });

  it("keeps the aspect ratio of tall images", () => {
    expect(
      planImageDownscale({ width: 1000, height: 5000, byteLength: SMALL, mimeType: "image/jpeg" }),
    ).toEqual({ width: 400, height: 2000, mimeType: "image/jpeg", quality: 0.85 });
  });

  it("re-encodes a heavy PNG within the edge limit as JPEG", () => {
    expect(
      planImageDownscale({
        width: 1800,
        height: 1800,
        byteLength: MAX_IMAGE_BYTES + 1,
        mimeType: "image/png",
      }),
    ).toEqual({ width: 1800, height: 1800, mimeType: "image/jpeg", quality: 0.85 });
  });

  it("keeps WebP as WebP", () => {
    expect(
      planImageDownscale({ width: 3000, height: 1000, byteLength: SMALL, mimeType: "image/webp" }),
    ).toEqual({ width: 2000, height: 667, mimeType: "image/webp", quality: 0.85 });
  });

  it("leaves GIFs alone so animation survives", () => {
    expect(
      planImageDownscale({ width: 4000, height: 4000, byteLength: SMALL, mimeType: "image/gif" }),
    ).toBeNull();
  });
});

describe("planHeavyResultFallback", () => {
  const pngPlan = { width: 2000, height: 2000, mimeType: "image/png" as const, quality: null };

  it("falls back to JPEG when a resized PNG is still too heavy", () => {
    expect(planHeavyResultFallback(pngPlan, MAX_IMAGE_BYTES + 1)).toEqual({
      width: 2000,
      height: 2000,
      mimeType: "image/jpeg",
      quality: 0.85,
    });
  });

  it("keeps a result within the byte limit", () => {
    expect(planHeavyResultFallback(pngPlan, MAX_IMAGE_BYTES)).toBeNull();
  });
});

describe("base64ByteLength", () => {
  it("counts decoded bytes including padding", () => {
    expect(base64ByteLength(btoa("abc"))).toBe(3);
    expect(base64ByteLength(btoa("ab"))).toBe(2);
    expect(base64ByteLength(btoa("a"))).toBe(1);
  });
});
