// Generates the Buildr icon set: a pixel "B" of beveled, block-textured cells
// on a warm near-black rounded square. Every size is rendered natively with an
// integer block size, so block edges stay crisp instead of being resampled.
//
// Run: node scripts/generate-buildr-icon.ts
// Needs macOS `iconutil` for the .icns and ImageMagick `magick` for the .ico.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { crc32, deflateSync } from "node:zlib";

const ROOT = path.resolve(import.meta.dirname, "..");
const DESKTOP_ASSETS = path.join(ROOT, "packages/desktop/assets");
const APP_IMAGES = path.join(ROOT, "packages/app/assets/images");
const APP_PUBLIC = path.join(ROOT, "packages/app/public");

// 7x9 glyph. Also mirrored in packages/app/src/components/icons/paseo-logo.tsx.
const GLYPH = [
  "######.",
  "##...##",
  "##...##",
  "##...##",
  "######.",
  "##...##",
  "##...##",
  "##...##",
  "######.",
];
const GLYPH_COLS = GLYPH[0].length;
const GLYPH_ROWS = GLYPH.length;

type Rgb = [number, number, number];
const PEACH: Rgb = [224, 160, 128];
const BG_TOP: Rgb = [41, 37, 34];
const BG_BOTTOM: Rgb = [22, 20, 19];
const WHITE: Rgb = [255, 255, 255];

// "macos": 824/1024 content with margins and a soft shadow (Big Sur grid).
// "tile": rounded square that fills the canvas. "square": opaque full bleed.
// "glyph": transparent canvas, glyph only.
type Layout = "macos" | "tile" | "square" | "glyph";

interface RenderOptions {
  layout: Layout;
  // Glyph height as a fraction of the content box.
  glyphHeight: number;
  flat?: Rgb;
  dot?: Rgb;
}

class Canvas {
  readonly size: number;
  readonly data: Float64Array;
  constructor(size: number) {
    this.size = size;
    this.data = new Float64Array(size * size * 4);
  }
  // Source-over composite of a straight-alpha color.
  blend(x: number, y: number, [r, g, b]: Rgb, a: number): void {
    if (a <= 0) return;
    const i = (y * this.size + x) * 4;
    const d = this.data;
    const outA = a + d[i + 3] * (1 - a);
    if (outA <= 0) return;
    d[i] = (r * a + d[i] * d[i + 3] * (1 - a)) / outA;
    d[i + 1] = (g * a + d[i + 1] * d[i + 3] * (1 - a)) / outA;
    d[i + 2] = (b * a + d[i + 2] * d[i + 3] * (1 - a)) / outA;
    d[i + 3] = outA;
  }
  toPng(): Buffer {
    const { size, data } = this;
    const raw = Buffer.alloc(size * (size * 4 + 1));
    for (let y = 0; y < size; y++) {
      const row = y * (size * 4 + 1);
      raw[row] = 0;
      for (let x = 0; x < size * 4; x++) {
        const v = x % 4 === 3 ? data[y * size * 4 + x] * 255 : data[y * size * 4 + x];
        raw[row + 1 + x] = Math.max(0, Math.min(255, Math.round(v)));
      }
    }
    const header = Buffer.alloc(13);
    header.writeUInt32BE(size, 0);
    header.writeUInt32BE(size, 4);
    header.set([8, 6, 0, 0, 0], 8);
    return Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      pngChunk("IHDR", header),
      pngChunk("IDAT", deflateSync(raw, { level: 9 })),
      pngChunk("IEND", Buffer.alloc(0)),
    ]);
  }
}

function pngChunk(type: string, body: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(body.length);
  const typeAndBody = Buffer.concat([Buffer.from(type, "ascii"), body]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndBody));
  return Buffer.concat([length, typeAndBody, crc]);
}

// Deterministic per-cell noise in [-1, 1].
function hash(a: number, b: number, seed: number): number {
  let h = Math.imul(a, 374761393) ^ Math.imul(b, 668265263) ^ Math.imul(seed, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (((h ^ (h >>> 16)) >>> 0) / 0xffffffff) * 2 - 1;
}

function shade([r, g, b]: Rgb, factor: number): Rgb {
  return [r * factor, g * factor, b * factor];
}

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function roundedRectSdf(x: number, y: number, x0: number, y0: number, side: number, r: number) {
  const half = side / 2;
  const qx = Math.abs(x - (x0 + half)) - (half - r);
  const qy = Math.abs(y - (y0 + half)) - (half - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

function render(size: number, options: RenderOptions): Canvas {
  const canvas = new Canvas(size);
  const { layout } = options;
  const inset = layout === "macos" ? Math.round(size * (100 / 1024)) : 0;
  const side = size - inset * 2;
  const radius = layout === "square" || layout === "glyph" ? 0 : side * 0.2237;

  const block = Math.max(1, Math.round((side * options.glyphHeight) / GLYPH_ROWS));
  const glyphX = Math.floor((size - block * GLYPH_COLS) / 2);
  // Optical centering: nudge up by half the drop shadow.
  const dropShadow = block >= 4 && !options.flat ? Math.max(1, Math.round(block * 0.16)) : 0;
  const glyphY = Math.floor((size - block * GLYPH_ROWS - dropShadow) / 2);
  const inGlyph = (x: number, y: number): boolean => {
    const col = Math.floor((x - glyphX) / block);
    const row = Math.floor((y - glyphY) / block);
    return GLYPH[row]?.[col] === "#" && x >= glyphX && y >= glyphY;
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      const sdf = roundedRectSdf(px, py, inset, inset, side, radius);

      if (layout === "macos") {
        const shadowSdf = roundedRectSdf(px, py - size * 0.012, inset, inset, side, radius);
        const t = Math.min(1, Math.max(0, shadowSdf / (size * 0.028)));
        canvas.blend(x, y, [0, 0, 0], 0.32 * (1 - t) ** 2);
      }

      // Glyph pixels are opaque and drawn last, so they cover their own shadow.
      const inShadow = dropShadow > 0 && inGlyph(x - dropShadow, y - dropShadow);
      if (layout !== "glyph") {
        const coverage = Math.min(1, Math.max(0, 0.5 - sdf));
        // Faint block grid in the background, aligned with the glyph.
        const cell =
          block >= 4
            ? hash(Math.floor((x - glyphX) / block), Math.floor((y - glyphY) / block), 7)
            : 0;
        let color = shade(mix(BG_TOP, BG_BOTTOM, (py - inset) / side), 1 + cell * 0.035);
        // Thin top rim highlight.
        const rim = Math.max(0, 1 - -sdf / Math.max(1, size * 0.004));
        const topWeight = Math.max(0, 1 - (py - inset) / (side * 0.5));
        color = mix(color, WHITE, rim * topWeight * 0.1);
        canvas.blend(x, y, inShadow ? shade(color, 0.55) : color, coverage);
      } else if (inShadow) {
        canvas.blend(x, y, [0, 0, 0], 0.35);
      }

      if (inGlyph(x, y)) {
        canvas.blend(x, y, options.flat ?? blockColor(x - glyphX, y - glyphY, block), 1);
      }
    }
  }

  if (options.dot) drawDot(canvas, options.dot);
  return canvas;
}

// Minecraft-style block: per-block tint, a 8x8 texel noise texture, and a
// one-texel bevel lit from the top left.
function blockColor(gx: number, gy: number, block: number): Rgb {
  const col = Math.floor(gx / block);
  const row = Math.floor(gy / block);
  const u = gx - col * block;
  const v = gy - row * block;
  if (block < 4) return PEACH;

  const texel = Math.max(1, Math.round(block / 8));
  let color = shade(PEACH, 1 + hash(col, row, 1) * 0.05);
  color = shade(
    color,
    1 + hash(col * 8 + Math.floor(u / texel), row * 8 + Math.floor(v / texel), 3) * 0.045,
  );

  const bevel = texel;
  const top = v;
  const left = u;
  const bottom = block - 1 - v;
  const right = block - 1 - u;
  const nearest = Math.min(top, left, bottom, right);
  if (nearest >= bevel) return color;
  if (nearest === top && top <= right) return mix(color, WHITE, 0.3);
  if (nearest === left && left <= bottom) return mix(color, WHITE, 0.16);
  if (nearest === bottom) return shade(color, 0.62);
  return shade(color, 0.76);
}

function drawDot(canvas: Canvas, color: Rgb): void {
  const { size } = canvas;
  const cx = size * (570 / 700);
  const cy = size * (570 / 700);
  const r = size * (130 / 700);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const coverage = Math.min(1, Math.max(0, r + 0.5 - Math.hypot(x + 0.5 - cx, y + 0.5 - cy)));
      canvas.blend(x, y, color, coverage);
    }
  }
}

function write(file: string, canvas: Canvas): void {
  writeFileSync(file, canvas.toPng());
  console.log(`wrote ${path.relative(ROOT, file)}`);
}

// Pixel-B SVG for sources that want vector art (the favicon .svg files).
function glyphSvg(dot?: Rgb): string {
  const cell = 60;
  const x0 = (700 - cell * GLYPH_COLS) / 2;
  const y0 = (700 - cell * GLYPH_ROWS) / 2;
  const rects = GLYPH.flatMap((line, row) =>
    [...line].flatMap((c, col) =>
      c === "#"
        ? [`<rect x="${x0 + col * cell}" y="${y0 + row * cell}" width="${cell}" height="${cell}"/>`]
        : [],
    ),
  );
  const hex = (rgb: Rgb) => `#${rgb.map((n) => n.toString(16).padStart(2, "0")).join("")}`;
  return [
    `<svg width="48" height="48" viewBox="0 0 700 700" fill="none" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges">`,
    `<rect width="700" height="700" rx="156" fill="#1c1a19"/>`,
    `<g fill="${hex(PEACH)}">${rects.join("")}</g>`,
    ...(dot ? [`<circle cx="570" cy="570" r="130" fill="${hex(dot)}"/>`] : []),
    `</svg>`,
    "",
  ].join("\n");
}

const MACOS: RenderOptions = { layout: "macos", glyphHeight: 0.58 };
const TILE: RenderOptions = { layout: "tile", glyphHeight: 0.56 };

// Desktop: the 1024 master, Linux PNGs, dev dock icon, .icns, and .ico.
write(path.join(DESKTOP_ASSETS, "icon.png"), render(1024, MACOS));
write(path.join(DESKTOP_ASSETS, "icon-dev.png"), render(1024, MACOS));
for (const [name, size] of [
  ["32x32.png", 32],
  ["64x64.png", 64],
  ["128x128.png", 128],
  ["128x128@2x.png", 256],
] as const) {
  write(path.join(DESKTOP_ASSETS, name), render(size, MACOS));
}

const scratch = mkdtempSync(path.join(tmpdir(), "buildr-icon-"));
try {
  const iconset = path.join(scratch, "icon.iconset");
  mkdirSync(iconset);
  for (const base of [16, 32, 128, 256, 512]) {
    writeFileSync(path.join(iconset, `icon_${base}x${base}.png`), render(base, MACOS).toPng());
    writeFileSync(
      path.join(iconset, `icon_${base}x${base}@2x.png`),
      render(base * 2, MACOS).toPng(),
    );
  }
  execFileSync("iconutil", ["-c", "icns", iconset, "-o", path.join(DESKTOP_ASSETS, "icon.icns")]);
  console.log("wrote packages/desktop/assets/icon.icns");

  const icoParts = [16, 24, 32, 48, 64, 256].map((size) => {
    const file = path.join(scratch, `ico-${size}.png`);
    writeFileSync(file, render(size, MACOS).toPng());
    return file;
  });
  execFileSync("magick", [...icoParts, path.join(DESKTOP_ASSETS, "icon.ico")]);
  console.log("wrote packages/desktop/assets/icon.ico");
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

// App: native icon, Android adaptive foreground, notification, splash, web.
write(path.join(APP_IMAGES, "icon.png"), render(1024, { layout: "square", glyphHeight: 0.56 }));
write(
  path.join(APP_IMAGES, "android-icon-foreground.png"),
  render(1024, { layout: "glyph", glyphHeight: 0.42 }),
);
write(
  path.join(APP_IMAGES, "notification-icon.png"),
  render(96, { layout: "glyph", glyphHeight: 0.75, flat: WHITE }),
);
write(path.join(APP_IMAGES, "splash-icon.png"), render(200, TILE));
write(path.join(APP_IMAGES, "favicon.png"), render(48, TILE));

const DOTS: Record<string, Rgb | undefined> = {
  "": undefined,
  "-running": [59, 130, 246],
  "-attention": [34, 197, 94],
};
for (const scheme of ["dark", "light"]) {
  for (const [suffix, dot] of Object.entries(DOTS)) {
    write(path.join(APP_IMAGES, `favicon-${scheme}${suffix}.png`), render(48, { ...TILE, dot }));
    writeFileSync(path.join(APP_IMAGES, `favicon-${scheme}${suffix}.svg`), glyphSvg(dot));
  }
}

write(
  path.join(APP_PUBLIC, "apple-touch-icon.png"),
  render(180, { layout: "square", glyphHeight: 0.56 }),
);
write(path.join(APP_PUBLIC, "pwa-icon-192.png"), render(192, TILE));
write(path.join(APP_PUBLIC, "pwa-icon-512.png"), render(512, TILE));
