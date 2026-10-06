import { LIGHT_HEADROOM, LIGHT_LAYER_SCALE, NIGHT_RGB, stackedLight } from "./night.js";

/**
 * Night laid over a finished frame, for views that are not the battlefield
 * (the Map Builder's In-game view): the blue-black tint, the lamps' pools cut
 * out of it and warmed, and a halo on each bulb or lens. The battlefield's own
 * pass (MapView.drawNight) works the same way.
 */

/** A pool of light on the ground. Coordinates are in the context's current transform; it is half as tall as wide (2:1 iso). */
export interface NightLightPool {
  x: number;
  y: number;
  /** Half-width. */
  rx: number;
  /** Strength 0..1. */
  a: number;
  rgb: string;
  /** How much of the night tint it lifts. */
  cut: number;
  /** How much it warms the ground. */
  warm: number;
}

/** A glowing bulb or lens, round, in the context's current transform. */
export interface NightHalo {
  x: number;
  y: number;
  r: number;
  rgb: string;
  a: number;
}

/** Scratch canvases kept between frames. */
export interface NightLayers {
  shade?: HTMLCanvasElement;
  light?: HTMLCanvasElement;
}

function sized(c: HTMLCanvasElement | undefined, w: number, h: number): HTMLCanvasElement {
  const out = c ?? document.createElement("canvas");
  if (out.width !== w || out.height !== h) {
    out.width = w;
    out.height = h;
  }
  return out;
}

function fillPool(c: CanvasRenderingContext2D, p: NightLightPool, rgb: string, a: number): void {
  if (a <= 0.002) return;
  c.save();
  c.translate(p.x, p.y);
  c.scale(1, 0.5);
  const g = c.createRadialGradient(0, 0, 0, 0, 0, p.rx);
  g.addColorStop(0, `rgba(${rgb}, ${a})`);
  g.addColorStop(0.5, `rgba(${rgb}, ${a * 0.55})`);
  g.addColorStop(1, `rgba(${rgb}, 0)`);
  c.fillStyle = g;
  c.beginPath();
  c.arc(0, 0, p.rx, 0, Math.PI * 2);
  c.fill();
  c.restore();
}

/** Darken the frame to night at `shade`, then let the pools and halos through. */
export function paintNight(
  ctx: CanvasRenderingContext2D,
  layers: NightLayers,
  shade: number,
  pools: readonly NightLightPool[],
  halos: readonly NightHalo[],
): void {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const m = ctx.getTransform();

  const dark = (layers.shade = sized(layers.shade, w, h));
  const n = dark.getContext("2d");
  if (!n) return;
  n.setTransform(1, 0, 0, 1, 0, 0);
  n.globalCompositeOperation = "source-over";
  n.clearRect(0, 0, w, h);
  n.fillStyle = `rgba(${NIGHT_RGB}, ${shade})`;
  n.fillRect(0, 0, w, h);
  if (pools.length) {
    n.setTransform(m);
    n.globalCompositeOperation = "destination-out";
    for (const p of pools) fillPool(n, p, "0,0,0", p.cut * p.a);
  }
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(dark, 0, 0);
  ctx.restore();

  if (pools.length) {
    // Warm light summed on a small layer, each pixel through stackedLight so overlaps brighten but never wash out.
    const S = LIGHT_LAYER_SCALE;
    const lw = Math.max(1, Math.ceil(w / S));
    const lh = Math.max(1, Math.ceil(h / S));
    const glow = (layers.light = sized(layers.light, lw, lh));
    const l = glow.getContext("2d", { willReadFrequently: true });
    if (l) {
      l.setTransform(1, 0, 0, 1, 0, 0);
      l.globalCompositeOperation = "source-over";
      l.clearRect(0, 0, lw, lh);
      l.setTransform(m.a / S, m.b / S, m.c / S, m.d / S, m.e / S, m.f / S);
      l.globalCompositeOperation = "lighter";
      for (const p of pools) fillPool(l, p, p.rgb, (p.warm * p.a) / LIGHT_HEADROOM);
      const img = l.getImageData(0, 0, lw, lh);
      const px = img.data;
      for (let i = 3; i < px.length; i += 4) {
        const a = px[i] ?? 0;
        if (a === 0) continue;
        px[i] = Math.round(stackedLight((a / 255) * LIGHT_HEADROOM) * 255);
      }
      l.putImageData(img, 0, 0);
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = "lighter";
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(glow, 0, 0, lw * S, lh * S);
      ctx.restore();
    }
  }

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const b of halos) {
    if (b.a <= 0.002 || b.r <= 0) continue;
    const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
    g.addColorStop(0, `rgba(255, 250, 230, ${0.85 * b.a})`);
    g.addColorStop(0.3, `rgba(${b.rgb}, ${0.5 * b.a})`);
    g.addColorStop(1, `rgba(${b.rgb}, 0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
