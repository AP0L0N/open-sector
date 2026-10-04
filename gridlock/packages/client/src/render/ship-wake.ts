/**
 * Subtle foam churned up behind a moving hull. Client-only; no sim traffic.
 *
 * Patches are dropped at the stern and stay where they fell, spreading and
 * fading, so the moving ship leaves a short trail. Reverse drops them at the bow.
 */

export const SHIP_WAKE_MS = 1100;
/** World pixels of hull travel between drops, at a hull of reference length. */
export const SHIP_WAKE_SPACING = 7;
/** Hull half-length (world px) the foam is sized for; larger hulls scale up. */
const REF_HALF_LENGTH = 14;
const ALONG_FRAC = 0.82;
const ACROSS_FRAC = 0.3;
/** World px a side patch drifts outward over its life, at reference size: the V opening. */
const SPREAD = 5;

export interface ShipWakePatch {
  x: number;
  y: number;
  /** Outward drift over the patch's life, world px. */
  vx: number;
  vy: number;
  at: number;
  seed: number;
  /** Hull half-length / REF_HALF_LENGTH. */
  scale: number;
  /** The centre churn line, as opposed to a side ripple. */
  centre: boolean;
}

export function shipLeavesWake(opts: {
  naval?: boolean;
  torpedo?: boolean;
  wreck?: boolean;
  submerged?: boolean;
  garrisonedIn?: number;
}): boolean {
  return !!opts.naval && !opts.torpedo && !opts.wreck && !opts.submerged && opts.garrisonedIn == null;
}

/** Hull half-length scale against the reference boat. */
export function shipWakeScale(halfLength: number): number {
  return Math.max(0.7, halfLength / REF_HALF_LENGTH);
}

/** World px of travel between drops. Grows slower than the hull so a big wake stays unbroken. */
export function shipWakeSpacing(scale: number): number {
  return SHIP_WAKE_SPACING * Math.sqrt(Math.max(0.7, scale));
}

/**
 * Port, starboard, and centre drop points at the trailing end of the hull,
 * plus the unit vector pointing outward from the keel for each side.
 */
export function shipWakeOrigins(
  x: number,
  y: number,
  facing: number,
  reverse: boolean,
  halfLength: number,
): { x: number; y: number; ox: number; oy: number; centre: boolean }[] {
  const fx = Math.cos(facing);
  const fy = Math.sin(facing);
  const rx = -fy;
  const ry = fx;
  const along = (reverse ? 1 : -1) * halfLength * ALONG_FRAC;
  const across = halfLength * ACROSS_FRAC;
  const cx = x + fx * along;
  const cy = y + fy * along;
  return [
    { x: cx - rx * across, y: cy - ry * across, ox: -rx, oy: -ry, centre: false },
    { x: cx + rx * across, y: cy + ry * across, ox: rx, oy: ry, centre: false },
    { x: cx, y: cy, ox: 0, oy: 0, centre: true },
  ];
}

function rng(seed: number): () => number {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function spawnShipWake(
  origin: { x: number; y: number; ox: number; oy: number; centre: boolean },
  now: number,
  seed: number,
  scale = 1,
): ShipWakePatch {
  const rnd = rng(seed);
  const s = Math.max(0.7, scale);
  const drift = SPREAD * s * (0.75 + rnd() * 0.5);
  return {
    x: origin.x + (rnd() - 0.5) * 1.2 * s,
    y: origin.y + (rnd() - 0.5) * 1.2 * s,
    vx: origin.ox * drift,
    vy: origin.oy * drift,
    at: now,
    seed: seed >>> 0,
    scale: s,
    centre: origin.centre,
  };
}

export function shipWakePose(
  patch: ShipWakePatch,
  now: number,
): { x: number; y: number; t: number } | null {
  const age = now - patch.at;
  if (age < 0 || age >= SHIP_WAKE_MS) return null;
  const t = age / SHIP_WAKE_MS;
  const ease = 1 - (1 - t) * (1 - t);
  return { x: patch.x + patch.vx * ease, y: patch.y + patch.vy * ease, t };
}

/** A flat isometric foam ring on the water. `t` is 0..1 through the patch life. */
export function drawShipWake(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  t: number,
  seed: number,
  scale = 1,
  centre = false,
): void {
  if (t <= 0 || t >= 1) return;
  const s = Math.max(0.7, scale);
  const rnd = rng(seed ^ 0x3a7e);
  // Quick to appear, slow to go.
  const fade = Math.min(1, t * 8) * (1 - t) * (1 - t);
  const r = (centre ? 2.8 : 2.2) * s * (0.7 + t * 1.4) * (0.9 + rnd() * 0.25);
  ctx.save();
  ctx.globalAlpha = fade * (centre ? 0.16 : 0.13);
  ctx.fillStyle = "#d9ecef";
  ctx.beginPath();
  ctx.ellipse(x, y, r, r * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = fade * (centre ? 0.16 : 0.22);
  ctx.strokeStyle = "#f2fafb";
  ctx.lineWidth = Math.max(0.6, 0.8 * s * (1 - t * 0.5));
  ctx.beginPath();
  ctx.ellipse(x, y, r * 1.15, r * 0.58, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}
