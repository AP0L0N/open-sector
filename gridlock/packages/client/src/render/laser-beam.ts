/**
 * The Cyborg Commander's cutting laser and his force field, as the map draws them.
 * The sim says where the beam runs (EntityView.laser); this only paints it.
 */
import type { EntityView } from "@gridlock/shared";

type LaserView = NonNullable<EntityView["laser"]>;

/** How long a beam keeps glowing after the sim has finished the cut, ms. */
export const BEAM_FADE_MS = 140;
/** A shimmer runs over the field this long after it soaks a hit, ms. */
export const FIELD_HIT_MS = 320;

/**
 * Share of the sweep cut by now. The snapshot gave `view.u` when it arrived at
 * `seenAtMs`; the beam keeps running at its own pace until the next one.
 */
export function beamShare(view: Pick<LaserView, "u" | "dur" | "line">, seenAtMs: number, nowMs: number): number {
  if (view.line) return 1;
  const run = (nowMs - seenAtMs) / Math.max(1, view.dur * 1000);
  return Math.min(1, Math.max(0, view.u + Math.max(0, run)));
}

/** World angle of the beam at share `u` of the sweep. */
export function beamAngle(view: Pick<LaserView, "a0" | "a1">, u: number): number {
  return view.a0 + (view.a1 - view.a0) * u;
}

/** Beam length, world px, at share `u` (the sim's samples, read the same way). */
export function beamLength(lens: readonly number[], u: number): number {
  if (lens.length === 0) return 0;
  if (lens.length === 1) return lens[0]!;
  const f = Math.min(1, Math.max(0, u)) * (lens.length - 1);
  const i = Math.min(lens.length - 2, Math.floor(f));
  return lens[i]! + (lens[i + 1]! - lens[i]!) * (f - i);
}

/** Beam end on the ground, world px, from the shooter at (x, y). */
export function beamEnd(view: LaserView, x: number, y: number, u: number): { x: number; y: number } {
  const a = beamAngle(view, u);
  const len = beamLength(view.lens, u);
  return { x: x + Math.cos(a) * len, y: y + Math.sin(a) * len };
}

/** Cheap repeatable noise for flicker and sparks. */
function hash(n: number): number {
  const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * A solid red cutting beam from the lens to where it bites the ground: a wide
 * red glow, a red body, and a white-hot core, a flare at the lens, and a
 * spitting burn where the tip cuts. `alpha` fades it out at the end.
 */
export function drawLaserBeam(
  ctx: CanvasRenderingContext2D,
  from: { x: number; y: number },
  to: { x: number; y: number },
  nowMs: number,
  seed: number,
  alpha = 1,
): void {
  if (alpha <= 0) return;
  const flick = 0.85 + 0.15 * Math.sin(nowMs * 0.09 + seed);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";
  const stroke = (width: number, color: string): void => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  };
  stroke(9 * flick, `rgba(255, 10, 0, ${0.22 * alpha})`);
  stroke(5 * flick, `rgba(255, 20, 10, ${0.4 * alpha})`);
  // The body is solid red, painted over the ground rather than added to it, so grass does not turn it orange.
  ctx.globalCompositeOperation = "source-over";
  stroke(3, `rgba(225, 0, 0, ${alpha})`);
  stroke(1.1, `rgba(255, 120, 110, ${alpha})`);
  ctx.globalCompositeOperation = "lighter";

  // The lens flares.
  const lens = ctx.createRadialGradient(from.x, from.y, 0, from.x, from.y, 6);
  lens.addColorStop(0, `rgba(255, 240, 230, ${0.95 * alpha})`);
  lens.addColorStop(0.4, `rgba(255, 60, 40, ${0.6 * alpha})`);
  lens.addColorStop(1, "rgba(255, 0, 0, 0)");
  ctx.fillStyle = lens;
  ctx.beginPath();
  ctx.arc(from.x, from.y, 6, 0, Math.PI * 2);
  ctx.fill();

  // The bite: white-hot where it cuts, a red bloom, and sparks thrown back off the cut.
  const r = 9 * flick;
  const bite = ctx.createRadialGradient(to.x, to.y, 0, to.x, to.y, r);
  bite.addColorStop(0, `rgba(255, 245, 220, ${alpha})`);
  bite.addColorStop(0.35, `rgba(255, 120, 40, ${0.75 * alpha})`);
  bite.addColorStop(1, "rgba(255, 20, 0, 0)");
  ctx.fillStyle = bite;
  ctx.beginPath();
  ctx.ellipse(to.x, to.y, r, r * 0.6, 0, 0, Math.PI * 2);
  ctx.fill();
  const frame = Math.floor(nowMs / 45);
  ctx.lineWidth = 1;
  for (let i = 0; i < 6; i++) {
    const k = seed * 31 + frame * 7 + i;
    const a = -Math.PI / 2 + (hash(k) - 0.5) * 2.4;
    const len = 3 + hash(k + 3) * 8;
    ctx.strokeStyle = `rgba(255, ${170 + Math.round(hash(k + 5) * 70)}, 90, ${0.9 * alpha})`;
    ctx.beginPath();
    ctx.moveTo(to.x, to.y);
    ctx.lineTo(to.x + Math.cos(a) * len, to.y + Math.sin(a) * len * 0.8);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * The force field: a pale blue bubble around him, brighter the fuller it is,
 * with a hex shimmer and a hard bright rim for a moment after it soaks a hit.
 * (x, y) is his contact point on screen; `height` is how tall the bubble stands.
 */
export function drawForceField(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  share: number,
  hitAgeMs: number | null,
  nowMs: number,
  seed: number,
): void {
  if (share <= 0) return;
  const hit = hitAgeMs != null && hitAgeMs >= 0 && hitAgeMs < FIELD_HIT_MS ? 1 - hitAgeMs / FIELD_HIT_MS : 0;
  const pulse = 0.5 + 0.5 * Math.sin(nowMs * 0.004 + seed);
  const cx = x;
  const cy = y - height * 0.45;
  const rx = width * 0.5;
  const ry = height * 0.58;
  const body = 0.3 + 0.7 * share;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const fill = ctx.createRadialGradient(cx, cy - ry * 0.2, ry * 0.15, cx, cy, Math.max(rx, ry));
  fill.addColorStop(0, "rgba(120, 190, 255, 0)");
  fill.addColorStop(0.75, `rgba(110, 180, 255, ${(0.05 + 0.04 * pulse) * body + 0.15 * hit})`);
  fill.addColorStop(1, `rgba(150, 215, 255, ${(0.14 + 0.06 * pulse) * body + 0.35 * hit})`);
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 1 + hit * 1.2;
  ctx.strokeStyle = `rgba(170, 225, 255, ${0.22 * body + 0.06 * pulse + 0.6 * hit})`;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.stroke();
  if (hit > 0) {
    // Hex cells light up across the face of the bubble and fade.
    ctx.strokeStyle = `rgba(200, 240, 255, ${0.55 * hit})`;
    ctx.lineWidth = 0.8;
    const cell = Math.max(3, width * 0.16);
    for (let row = -2; row <= 2; row++) {
      for (let col = -2; col <= 2; col++) {
        const hx = cx + col * cell * 1.5;
        const hy = cy + row * cell * 1.7 + (col % 2 === 0 ? 0 : cell * 0.85);
        const nx = (hx - cx) / rx;
        const ny = (hy - cy) / ry;
        if (nx * nx + ny * ny > 0.8) continue;
        if (hash(seed + row * 13 + col * 7 + Math.floor(nowMs / 60)) < 0.45) continue;
        ctx.beginPath();
        for (let k = 0; k <= 6; k++) {
          const a = (k / 6) * Math.PI * 2;
          const px = hx + Math.cos(a) * cell * 0.9;
          const py = hy + Math.sin(a) * cell * 0.9;
          if (k === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}
