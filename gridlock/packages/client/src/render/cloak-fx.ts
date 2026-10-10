/**
 * Cloaking, as its own side sees it. Going under: the body flares pale blue round its outline, a
 * scan band climbs it from the feet up, sparks wink out over it, a ripple runs out over the ground,
 * and the body fades to a faint, slowly breathing shimmer. Coming out runs it the other way, quicker.
 * Drawing only: enemies never get a cloaked unit in their snapshot.
 */

export const CLOAK_IN_MS = 900;
export const CLOAK_OUT_MS = 550;

/** A cloak going on (`in`) or coming off (`out`), `u` 0–1 through it. */
export interface CloakFx {
  kind: "in" | "out";
  u: number;
}

/** How far a cloaked body fades, and how much the shimmer breathes. */
const CLOAKED_OPACITY = 0.36;
const BREATHE = 0.06;

function hash(id: number, i: number): number {
  let h = (Math.imul(id + 3, 2246822519) + Math.imul(i + 11, 3266489917)) | 0;
  h = Math.imul(h ^ (h >>> 15), 668265263);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

const smooth = (u: number): number => u * u * (3 - 2 * u);

/** How cloaked the body is, 0 (solid) to 1 (faint), through `fx` or steady. */
export function cloakDepth(fx: CloakFx | null): number {
  if (!fx) return 1;
  return fx.kind === "in" ? smooth(fx.u) : 1 - smooth(fx.u);
}

/** The canvas filter for the body: faint and pale, flaring along its outline while the cloak goes on or off. */
export function cloakFilter(fx: CloakFx | null, now: number): string {
  const depth = cloakDepth(fx);
  const breathe = fx ? 0 : Math.sin(now / 260) * BREATHE;
  const opacity = 1 - (1 - CLOAKED_OPACITY) * depth + breathe;
  const flare = fx ? Math.sin(Math.min(1, fx.u * 1.6) * Math.PI) : 0;
  const bright = 1 + 0.35 * depth + 0.8 * flare;
  const sat = 1 - 0.5 * depth;
  const base = `opacity(${opacity.toFixed(3)}) saturate(${sat.toFixed(2)}) brightness(${bright.toFixed(2)})`;
  if (flare < 0.02) return base;
  return `${base} drop-shadow(0 0 ${(2 + 5 * flare).toFixed(1)}px rgba(130, 225, 255, ${(0.9 * flare).toFixed(2)}))`;
}

/**
 * Over the body while the cloak goes on or off: the ripple on the ground round (x, y), the scan
 * band, and the sparks. `size` is the body's drawn size.
 */
export function drawCloakFx(ctx: CanvasRenderingContext2D, id: number, x: number, y: number, size: number, fx: CloakFx): void {
  const u = fx.u;
  const rising = fx.kind === "in";
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  // Two rings run out over the ground, one just behind the other.
  for (const lag of [0, 0.22]) {
    const k = Math.max(0, Math.min(1, (u - lag) / (1 - lag)));
    if (k <= 0 || k >= 1) continue;
    const r = size * (0.2 + 0.6 * smooth(k));
    ctx.strokeStyle = `rgba(120, 220, 255, ${(0.6 * (1 - k)).toFixed(3)})`;
    ctx.lineWidth = Math.max(1, size * 0.03 * (1 - k));
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.5, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  // The scan band climbs the body going on, sinks down it coming off.
  const height = size * 0.44;
  const at = rising ? smooth(u) : 1 - smooth(u);
  const by = y - height * at;
  const bandA = Math.sin(u * Math.PI) * 0.7;
  if (bandA > 0.02) {
    const half = size * 0.3;
    const thick = size * 0.06;
    const g = ctx.createRadialGradient(x, by, 0, x, by, half);
    g.addColorStop(0, `rgba(200, 245, 255, ${bandA.toFixed(3)})`);
    g.addColorStop(0.5, `rgba(110, 210, 255, ${(bandA * 0.55).toFixed(3)})`);
    g.addColorStop(1, "rgba(110, 210, 255, 0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, by, half, thick, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // Sparks wink on over the body and drift up as it goes.
  const sparks = 14;
  for (let i = 0; i < sparks; i++) {
    const delay = hash(id, i) * 0.55;
    const k = (u - delay) / 0.4;
    if (k <= 0 || k >= 1) continue;
    const a = hash(id, i + 50) * Math.PI * 2;
    const rr = Math.sqrt(hash(id, i + 100)) * size * 0.24;
    const sx = x + Math.cos(a) * rr;
    const sy = y - size * 0.2 + Math.sin(a) * rr * 0.6 - k * size * 0.1;
    const alpha = Math.sin(k * Math.PI);
    const len = Math.max(1.5, size * (0.03 + hash(id, i + 150) * 0.04)) * alpha;
    ctx.strokeStyle = `rgba(215, 248, 255, ${alpha.toFixed(3)})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(sx - len, sy);
    ctx.lineTo(sx + len, sy);
    ctx.moveTo(sx, sy - len);
    ctx.lineTo(sx, sy + len);
    ctx.stroke();
  }
  ctx.restore();
}
