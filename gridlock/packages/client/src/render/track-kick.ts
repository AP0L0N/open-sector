/**
 * Subtle dirt tossed off tank tracks. Client-only; no sim traffic.
 *
 * Forward: clods spawn at the rear treads and fly opposite travel.
 * Reverse: same effect at the bow so it reads in front of the hull.
 */

export const TRACK_KICK_MS = 320;
/** World pixels of hull travel between spawns. */
export const TRACK_KICK_SPACING = 6.5;
const ALONG_FRAC = 0.95;
const ACROSS_FRAC = 0.58;
const TOSS_MIN = 4.5;
const TOSS_MAX = 9.5;

export interface TrackKickPuff {
  x: number;
  y: number;
  vx: number;
  vy: number;
  at: number;
  seed: number;
  reverse: boolean;
  /** Sprite drawSize / 48 so clods track the hull on screen. */
  scale: number;
}

export function tankTracksKick(opts: {
  kind: string;
  turnInPlace?: boolean;
  wreck?: boolean;
  swimming?: boolean;
  immobilized?: boolean;
  garrisonedIn?: number;
}): boolean {
  return (
    opts.kind === "unit" &&
    !!opts.turnInPlace &&
    !opts.wreck &&
    !opts.swimming &&
    !opts.immobilized &&
    opts.garrisonedIn == null
  );
}

export function trackKickTravel(
  dx: number,
  dy: number,
  facing: number,
  minDist = 0.45,
): { dist: number; reverse: boolean; tossX: number; tossY: number } | null {
  const dist = Math.hypot(dx, dy);
  if (dist < minDist) return null;
  const fx = Math.cos(facing);
  const fy = Math.sin(facing);
  const reverse = dx * fx + dy * fy < 0;
  return { dist, reverse, tossX: -dx / dist, tossY: -dy / dist };
}

/** Left and right tread contacts at the trailing end of the hull. */
export function trackKickOrigins(
  x: number,
  y: number,
  facing: number,
  reverse: boolean,
  radius: number,
): [{ x: number; y: number }, { x: number; y: number }] {
  const fx = Math.cos(facing);
  const fy = Math.sin(facing);
  const rx = -fy;
  const ry = fx;
  const along = (reverse ? 1 : -1) * radius * ALONG_FRAC;
  const across = radius * ACROSS_FRAC;
  const cx = x + fx * along;
  const cy = y + fy * along;
  return [
    { x: cx - rx * across, y: cy - ry * across },
    { x: cx + rx * across, y: cy + ry * across },
  ];
}

function rng(seed: number): () => number {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function spawnTrackKickPuffs(
  origin: { x: number; y: number },
  tossX: number,
  tossY: number,
  now: number,
  seed: number,
  reverse: boolean,
  scale = 1,
): TrackKickPuff[] {
  const rnd = rng(seed);
  const n = 3;
  const out: TrackKickPuff[] = [];
  for (let i = 0; i < n; i++) {
    const speed = TOSS_MIN + rnd() * (TOSS_MAX - TOSS_MIN);
    const yaw = (rnd() - 0.5) * 0.5;
    const cs = Math.cos(yaw);
    const sn = Math.sin(yaw);
    const tx = tossX * cs - tossY * sn;
    const ty = tossX * sn + tossY * cs;
    out.push({
      x: origin.x + (rnd() - 0.5) * 1.6,
      y: origin.y + (rnd() - 0.5) * 1.6,
      vx: tx * speed,
      vy: ty * speed,
      at: now,
      seed: (seed + i * 19) >>> 0,
      reverse,
      scale: Math.max(0.7, scale),
    });
  }
  return out;
}

export function trackKickPose(
  puff: TrackKickPuff,
  now: number,
): { x: number; y: number; t: number; lift: number } | null {
  const age = now - puff.at;
  if (age < 0 || age >= TRACK_KICK_MS) return null;
  const t = age / TRACK_KICK_MS;
  const ease = 1 - (1 - t) * (1 - t);
  return {
    x: puff.x + puff.vx * ease,
    y: puff.y + puff.vy * ease,
    t,
    lift: (14 * puff.scale) * t * (1 - t),
  };
}

const DIRT = ["#7a5c40", "#6b5340", "#8a6e50", "#5a4634"] as const;

/** Tiny isometric clod plus a soft dust wisp. `t` is 0..1 through the puff life. */
export function drawTrackKick(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  t: number,
  seed: number,
  scale = 1,
): void {
  if (t <= 0 || t >= 1) return;
  const s = Math.max(0.7, scale);
  const rnd = rng(seed ^ 0x51ed);
  const fade = (1 - t) * (1 - t);
  ctx.save();
  ctx.globalAlpha = fade * (0.2 + rnd() * 0.12);
  ctx.fillStyle = rnd() > 0.45 ? "#6b5340" : "#5c4a36";
  const dw = (4.2 + rnd() * 2.4) * s * (1 - t * 0.2);
  ctx.beginPath();
  ctx.ellipse(x, y, dw, dw * 0.46, (rnd() - 0.5) * 0.45, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = fade * (0.48 + rnd() * 0.22);
  ctx.fillStyle = DIRT[(seed >>> 0) % DIRT.length]!;
  const rw = (2.1 + rnd() * 1.7) * s * (1 - t * 0.25);
  ctx.beginPath();
  ctx.ellipse(x + (rnd() - 0.5) * 1.8 * s, y, rw, rw * 0.5, (rnd() - 0.5) * 0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
