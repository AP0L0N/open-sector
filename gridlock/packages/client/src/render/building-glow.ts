/**
 * A structure's own light at night: lit windows, furnace mouths, a hive's
 * glowing panels. The art has no separate light map, so the lit pixels are
 * read off the sprite once (bright amber, or bright green to cyan) and kept as
 * a mask. At night the mask is cut out of the dark, so those pixels keep their
 * full daylight colour, and a blurred copy is added over them as a soft bloom.
 */

/**
 * How much of this sprite pixel is light of its own, 0–1. Warm lamp light is
 * a bright amber to yellow; hive light a bright green to cyan; either may go
 * near white at its hottest. Dull yellow paint (hazard stripes) stays out.
 */
export function glowWeight(r: number, g: number, b: number, a: number): number {
  if (a < 200) return 0;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const v = max / 255;
  const s = max === 0 ? 0 : (max - min) / max;
  if (max === min) return 0;
  let hue: number;
  if (max === r) hue = 60 * (((g - b) / (max - min)) % 6);
  else if (max === g) hue = 60 * ((b - r) / (max - min) + 2);
  else hue = 60 * ((r - g) / (max - min) + 4);
  if (hue < 0) hue += 360;
  const warm = hue >= 20 && hue <= 58;
  const cool = hue >= 120 && hue <= 200;
  const ramp = (x: number, from: number, span: number): number => Math.min(1, Math.max(0, (x - from) / span));
  // Lit glass burns near full brightness; yellow paint stops short of it.
  if (warm && r >= 215 && s >= 0.3) return ramp(v, 0.925, 0.04) * ramp(s, 0.3, 0.15);
  if (cool && g >= 170 && s >= 0.25) return ramp(v, 0.68, 0.12) * ramp(s, 0.25, 0.15);
  if (warm && s >= 0.1) return ramp(v, 0.93, 0.04);
  if (cool && s >= 0.1) return ramp(v, 0.9, 0.06);
  return 0;
}

/** The bloom is kept at this fraction of the sprite: scaled back up, it spreads soft round each light. */
const BLOOM_SCALE = 1 / 6;
/** Bloom canvas margin, in bloom pixels, so the halo is not clipped at the sprite's edge. */
const BLOOM_PAD = 3;

export interface BuildingGlow {
  /** The lit pixels in their own colour, alpha their weight. Same size as the sprite. */
  mask: HTMLCanvasElement;
  /** The mask small and padded, to be drawn stretched over the sprite as a halo. */
  bloom: HTMLCanvasElement;
}

const glows = new WeakMap<CanvasImageSource, BuildingGlow | null>();

/** The glow of one sprite image, read once. Null when it has no lit pixels or cannot be read. */
export function buildingGlow(image: HTMLImageElement): BuildingGlow | null {
  const hit = glows.get(image);
  if (hit !== undefined) return hit;
  const w = image.naturalWidth;
  const h = image.naturalHeight;
  if (!w || !h) return null;
  const glow = readGlow(image, w, h);
  glows.set(image, glow);
  return glow;
}

function readGlow(image: HTMLImageElement, w: number, h: number): BuildingGlow | null {
  const mask = document.createElement("canvas");
  mask.width = w;
  mask.height = h;
  const g = mask.getContext("2d", { willReadFrequently: true });
  if (!g) return null;
  g.drawImage(image, 0, 0);
  let px: ImageData;
  try {
    px = g.getImageData(0, 0, w, h);
  } catch {
    return null;
  }
  const d = px.data;
  let lit = 0;
  for (let i = 0; i < d.length; i += 4) {
    const k = glowWeight(d[i]!, d[i + 1]!, d[i + 2]!, d[i + 3]!);
    d[i + 3] = Math.round(k * 255);
    if (k > 0) lit++;
  }
  if (lit === 0) return null;
  g.putImageData(px, 0, 0);
  const bw = Math.max(1, Math.round(w * BLOOM_SCALE)) + BLOOM_PAD * 2;
  const bh = Math.max(1, Math.round(h * BLOOM_SCALE)) + BLOOM_PAD * 2;
  const bloom = document.createElement("canvas");
  bloom.width = bw;
  bloom.height = bh;
  const b = bloom.getContext("2d");
  if (!b) return null;
  b.imageSmoothingEnabled = true;
  b.imageSmoothingQuality = "high";
  b.drawImage(mask, BLOOM_PAD, BLOOM_PAD, bw - BLOOM_PAD * 2, bh - BLOOM_PAD * 2);
  return { mask, bloom };
}

/** Where the bloom lands for a sprite drawn at (x, y, w, h): the same box, grown by the pad. */
export function bloomRect(x: number, y: number, w: number, h: number, glow: BuildingGlow): { x: number; y: number; w: number; h: number } {
  const px = (BLOOM_PAD * w) / (glow.bloom.width - BLOOM_PAD * 2);
  const py = (BLOOM_PAD * h) / (glow.bloom.height - BLOOM_PAD * 2);
  return { x: x - px, y: y - py, w: w + px * 2, h: h + py * 2 };
}
