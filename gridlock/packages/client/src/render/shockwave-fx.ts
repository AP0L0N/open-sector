/**
 * A downed Mothership hitting the ground (sim/mothership.ts mothershipShockwave). Drawn in layers,
 * all from ground zero `c` and the blast's full reach on the ground (`rx`, `ry`, a 2:1 iso ellipse):
 *
 *   flash    a blinding white-blue dome and a pillar of light, gone in a quarter second;
 *   arcs     forked energy arcs crackling out from the impact for the first moments;
 *   rings    a thin fast ring, the bright main front racing to the reach, and a slower heat ring;
 *   debris   chunks of hull flung out on arcs, hot at first, cooling as they fall;
 *   dust     billows of dirt and smoke thrown out along the front and rising;
 *   crater   the ground at the middle glowing, then dimming.
 *
 * The burnt crater it leaves (drawShockwaveScorch) lies on the ground under everything for a while.
 * Drawing only; the sim decides who is hurt. Every random choice comes from the blast's id, so a
 * replayed frame looks the same.
 */

/** How long the whole blast shows, ms. */
export const SHOCKWAVE_FX_MS = 3200;
/** How long the burnt crater stays on the ground, ms. */
export const SHOCKWAVE_SCORCH_MS = 40000;
/** How long the main front takes to reach the edge, ms. */
const RING_MS = 950;

type Pt = { x: number; y: number };

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const easeOut = (t: number): number => 1 - (1 - t) * (1 - t) * (1 - t);

/** The main front's reach, as a share of the blast's, `age` ms in. */
export function shockwaveReach(age: number): number {
  return easeOut(clamp01(age / RING_MS));
}

/** A small seeded generator: the same blast always throws the same debris. */
function rng(seed: number): () => number {
  let s = (Math.floor(seed) * 2654435761) >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

function ring(ctx: CanvasRenderingContext2D, c: Pt, rx: number, ry: number, width: number, style: string): void {
  ctx.lineWidth = width;
  ctx.strokeStyle = style;
  ctx.beginPath();
  ctx.ellipse(c.x, c.y, Math.max(1, rx), Math.max(0.5, ry), 0, 0, Math.PI * 2);
  ctx.stroke();
}

/** A soft radial blob, squashed to the ground's 2:1 when `flat`. */
function blob(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, inner: string, outer: string, flat = false): void {
  if (r <= 0.5) return;
  ctx.save();
  ctx.translate(x, y);
  if (flat) ctx.scale(1, 0.5);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** The blast at `age` ms. `seed` is its id. */
export function drawShockwave(ctx: CanvasRenderingContext2D, c: Pt, rx: number, ry: number, age: number, seed = 0): void {
  if (age < 0 || age > SHOCKWAVE_FX_MS || rx <= 0) return;
  const r = rng(seed);
  const life = clamp01(age / SHOCKWAVE_FX_MS);
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // Dust and smoke first, so the light lies over it.
  ctx.globalCompositeOperation = "source-over";
  const puffs = 22;
  for (let i = 0; i < puffs; i++) {
    const a = (i / puffs) * Math.PI * 2 + r() * 0.3;
    const start = 120 + r() * 300;
    const u = clamp01((age - start) / (SHOCKWAVE_FX_MS - start));
    if (u <= 0) continue;
    const out = (0.35 + 0.6 * r()) * easeOut(Math.min(1, u * 1.6));
    const rise = (18 + 40 * r()) * u * (rx / 120);
    const size = rx * (0.08 + 0.1 * r()) * (0.6 + u);
    const x = c.x + Math.cos(a) * rx * out;
    const y = c.y + Math.sin(a) * ry * out - rise;
    const alpha = 0.5 * (1 - u) * Math.min(1, u * 6);
    blob(ctx, x, y, size, `rgba(92, 80, 66, ${alpha})`, "rgba(92, 80, 66, 0)");
  }

  // The crater glowing at the middle.
  ctx.globalCompositeOperation = "lighter";
  const heat = 1 - clamp01(age / (SHOCKWAVE_FX_MS * 0.9));
  blob(ctx, c.x, c.y, rx * 0.32, `rgba(255, 200, 140, ${0.55 * heat})`, "rgba(120, 190, 255, 0)", true);

  // The flash: a white-blue dome and a pillar of light.
  const flash = 1 - clamp01(age / 260);
  if (flash > 0) {
    blob(ctx, c.x, c.y, rx * 0.7, `rgba(245, 252, 255, ${0.95 * flash})`, "rgba(140, 205, 255, 0)", true);
    blob(ctx, c.x, c.y - rx * 0.12, rx * 0.35, `rgba(255, 255, 255, ${0.9 * flash})`, "rgba(170, 220, 255, 0)");
    const pillar = ctx.createLinearGradient(c.x, c.y, c.x, c.y - rx * 1.4);
    pillar.addColorStop(0, `rgba(220, 245, 255, ${0.8 * flash})`);
    pillar.addColorStop(1, "rgba(160, 215, 255, 0)");
    ctx.fillStyle = pillar;
    const w = rx * 0.12;
    ctx.fillRect(c.x - w / 2, c.y - rx * 1.4, w, rx * 1.4);
  }

  // Forked energy arcs crackling out over the first moments, re-forking every few frames.
  const arcLife = 1 - clamp01(age / 750);
  if (arcLife > 0) {
    const frame = Math.floor(age / 45);
    const ar = rng(seed * 31 + frame);
    const arcs = 7;
    for (let i = 0; i < arcs; i++) {
      const a = (i / arcs) * Math.PI * 2 + ar() * 0.6;
      const reach = (0.25 + 0.35 * ar()) * (0.4 + 0.6 * shockwaveReach(age));
      let x = c.x;
      let y = c.y;
      ctx.beginPath();
      ctx.moveTo(x, y);
      const steps = 6;
      for (let k = 1; k <= steps; k++) {
        const t = k / steps;
        const jitter = (ar() - 0.5) * 0.5;
        x = c.x + Math.cos(a + jitter) * rx * reach * t;
        y = c.y + Math.sin(a + jitter) * ry * reach * t;
        ctx.lineTo(x, y);
      }
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = `rgba(200, 235, 255, ${0.85 * arcLife})`;
      ctx.stroke();
      ctx.lineWidth = 5;
      ctx.strokeStyle = `rgba(110, 180, 255, ${0.22 * arcLife})`;
      ctx.stroke();
    }
  }

  // The rings: thin and fast, the bright main front, and a slow heat ring behind.
  const fast = easeOut(clamp01(age / 600));
  const fastFade = 1 - clamp01(age / 700);
  if (fastFade > 0) ring(ctx, c, rx * 1.08 * fast, ry * 1.08 * fast, Math.max(1.5, rx * 0.015), `rgba(235, 248, 255, ${0.7 * fastFade})`);
  const k = shockwaveReach(age);
  const front = 1 - clamp01((age - RING_MS * 0.6) / (SHOCKWAVE_FX_MS * 0.55));
  if (front > 0) {
    ring(ctx, c, rx * k, ry * k, Math.max(3, rx * 0.05), `rgba(215, 240, 255, ${0.95 * front})`);
    ring(ctx, c, rx * k, ry * k, Math.max(6, rx * 0.12), `rgba(120, 190, 255, ${0.35 * front})`);
  }
  const slow = easeOut(clamp01(age / (RING_MS * 1.8))) * 0.85;
  const slowFade = 1 - clamp01(age / (SHOCKWAVE_FX_MS * 0.8));
  if (slowFade > 0) ring(ctx, c, rx * slow, ry * slow, Math.max(8, rx * 0.16), `rgba(255, 190, 130, ${0.16 * slowFade})`);

  // Debris on arcs: hot chunks cooling as they fly, then falling dark.
  const chunks = 34;
  for (let i = 0; i < chunks; i++) {
    const a = r() * Math.PI * 2;
    const dist = (0.25 + 0.75 * r()) * (rx * 0.9);
    const up = (0.5 + r()) * rx * 0.55;
    const span = 900 + r() * 1300;
    const u = clamp01(age / span);
    if (u >= 1) continue;
    const x = c.x + Math.cos(a) * dist * u;
    const y = c.y + Math.sin(a) * dist * 0.5 * u - up * 4 * u * (1 - u);
    const hot = 1 - u;
    const size = 1.2 + r() * 2.2;
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = `rgba(30, 32, 30, ${0.9 * (1 - life * 0.5)})`;
    ctx.fillRect(x - size / 2, y - size / 2, size, size);
    if (hot > 0.2) {
      ctx.globalCompositeOperation = "lighter";
      blob(ctx, x, y, size * 2.2, `rgba(255, 210, 150, ${0.7 * hot})`, "rgba(255, 140, 60, 0)");
    }
  }
  ctx.restore();
}

/**
 * The burnt crater a Mothership leaves: a dark round scar the size of its core, with cracks running
 * out that glow faintly at first, all fading over SHOCKWAVE_SCORCH_MS. On the ground under everything.
 */
export function drawShockwaveScorch(ctx: CanvasRenderingContext2D, c: Pt, rx: number, ry: number, age: number, seed = 0): void {
  if (age < 0 || age > SHOCKWAVE_SCORCH_MS || rx <= 0) return;
  const fade = 1 - clamp01((age - SHOCKWAVE_SCORCH_MS * 0.6) / (SHOCKWAVE_SCORCH_MS * 0.4));
  const show = clamp01(age / 400);
  const a = fade * show;
  if (a <= 0) return;
  const r = rng(seed * 7 + 3);
  ctx.save();
  // The scorched ground: dark in the middle, thinning out to about a third of the reach.
  ctx.translate(c.x, c.y);
  ctx.scale(1, ry / rx);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx * 0.38);
  g.addColorStop(0, `rgba(18, 16, 14, ${0.7 * a})`);
  g.addColorStop(0.55, `rgba(30, 26, 22, ${0.45 * a})`);
  g.addColorStop(1, "rgba(40, 34, 28, 0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, rx * 0.38, 0, Math.PI * 2);
  ctx.fill();
  // Cracks running out, glowing while the ground is still hot.
  const glowing = 1 - clamp01(age / 9000);
  const cracks = 9;
  for (let i = 0; i < cracks; i++) {
    let ang = (i / cracks) * Math.PI * 2 + r() * 0.5;
    const len = rx * (0.22 + 0.25 * r());
    let x = 0;
    let y = 0;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let k = 0; k < 5; k++) {
      ang += (r() - 0.5) * 0.6;
      x += Math.cos(ang) * (len / 5);
      y += Math.sin(ang) * (len / 5);
      ctx.lineTo(x, y);
    }
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = `rgba(14, 12, 10, ${0.8 * a})`;
    ctx.stroke();
    if (glowing > 0) {
      ctx.lineWidth = 1;
      ctx.strokeStyle = `rgba(255, 150, 70, ${0.55 * glowing * a})`;
      ctx.stroke();
    }
  }
  ctx.restore();
}
