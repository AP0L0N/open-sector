/**
 * Titan rocket smoke. Client-only.
 * A rocket motor leaves a thick line of puffs that hangs, spreads, and drifts
 * after the rocket is gone. Each launch also throws a backblast cloud behind
 * the Titan and kicks up dust around its feet.
 */

/** How long a trail puff hangs, ms. */
export const ROCKET_TRAIL_MS = 3200;
/** How long a backblast puff hangs, ms. */
export const ROCKET_BLAST_MS = 2600;
/** World pixels between trail puffs. Dense enough to read as one ribbon. */
export const ROCKET_TRAIL_SPACING = 3;
/** Most puffs kept at once. The oldest go first. */
export const ROCKET_PUFF_CAP = 2400;

export interface RocketPuff {
  /** World position and absolute elevation at birth. */
  x: number;
  y: number;
  z: number;
  /** Drift in world pixels over the whole life. */
  dx: number;
  dy: number;
  /** Elevation climbed over the whole life. */
  rise: number;
  at: number;
  life: number;
  /** Screen radius at birth and at the end. */
  r0: number;
  r1: number;
  /** Peak opacity. */
  alpha: number;
  /** 0 = pale exhaust, 1 = dark dust. */
  shade: number;
  seed: number;
}

function rng(seed: number): () => number {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Puffs along the segment the rocket flew since the last frame. */
export function trailPuffs(
  from: { x: number; y: number; z: number },
  to: { x: number; y: number; z: number },
  now: number,
  seed: number,
  spacing = ROCKET_TRAIL_SPACING,
): RocketPuff[] {
  const len = Math.hypot(to.x - from.x, to.y - from.y);
  const n = Math.floor(len / Math.max(0.5, spacing));
  const rnd = rng(seed);
  const out: RocketPuff[] = [];
  for (let i = 1; i <= n; i++) {
    const u = i / n;
    out.push({
      x: from.x + (to.x - from.x) * u + (rnd() - 0.5) * 1.5,
      y: from.y + (to.y - from.y) * u + (rnd() - 0.5) * 1.5,
      z: from.z + (to.z - from.z) * u,
      dx: (rnd() - 0.5) * 10,
      dy: (rnd() - 0.5) * 10,
      rise: 3 + rnd() * 5,
      at: now,
      life: ROCKET_TRAIL_MS * (0.75 + rnd() * 0.45),
      r0: 1.8 + rnd() * 1.2,
      r1: 9 + rnd() * 6,
      alpha: 0.5 + rnd() * 0.2,
      shade: rnd() * 0.25,
      seed: (seed + i * 31) >>> 0,
    });
  }
  return out;
}

/**
 * Launch backblast: a cone of exhaust thrown behind the pods (against `dir`,
 * the rocket's heading), and a ring of dust kicked off the ground.
 */
export function backblastPuffs(opts: {
  x: number;
  y: number;
  /** Pod elevation. */
  z: number;
  /** Ground elevation under the Titan. */
  ground: number;
  dirX: number;
  dirY: number;
  now: number;
  seed: number;
}): RocketPuff[] {
  const l = Math.hypot(opts.dirX, opts.dirY) || 1;
  const bx = -opts.dirX / l;
  const by = -opts.dirY / l;
  const rnd = rng(opts.seed);
  const out: RocketPuff[] = [];
  for (let i = 0; i < 14; i++) {
    const yaw = (rnd() - 0.5) * 1.1;
    const cx = bx * Math.cos(yaw) - by * Math.sin(yaw);
    const cy = bx * Math.sin(yaw) + by * Math.cos(yaw);
    const reach = 14 + rnd() * 30;
    out.push({
      x: opts.x + cx * (4 + rnd() * 6),
      y: opts.y + cy * (4 + rnd() * 6),
      z: opts.z - rnd() * 4,
      dx: cx * reach,
      dy: cy * reach,
      rise: 4 + rnd() * 8,
      at: opts.now + i * 10,
      life: ROCKET_BLAST_MS * (0.7 + rnd() * 0.5),
      r0: 3.5 + rnd() * 2.5,
      r1: 15 + rnd() * 10,
      alpha: 0.55 + rnd() * 0.2,
      shade: 0.05 + rnd() * 0.2,
      seed: (opts.seed + i * 17) >>> 0,
    });
  }
  for (let i = 0; i < 10; i++) {
    const a = rnd() * Math.PI * 2;
    const reach = 10 + rnd() * 16;
    out.push({
      x: opts.x + Math.cos(a) * 5 + bx * 6,
      y: opts.y + Math.sin(a) * 5 + by * 6,
      z: opts.ground,
      dx: Math.cos(a) * reach + bx * 8,
      dy: Math.sin(a) * reach + by * 8,
      rise: 2 + rnd() * 4,
      at: opts.now + 20 + i * 8,
      life: ROCKET_BLAST_MS * (0.8 + rnd() * 0.5),
      r0: 4 + rnd() * 2,
      r1: 13 + rnd() * 8,
      alpha: 0.4 + rnd() * 0.15,
      shade: 0.6 + rnd() * 0.3,
      seed: (opts.seed + 300 + i * 23) >>> 0,
    });
  }
  return out;
}

/** Where a puff is now, how big, and how opaque. Null before birth and after it fades. */
export function rocketPuffPose(
  p: RocketPuff,
  now: number,
): { x: number; y: number; z: number; r: number; alpha: number } | null {
  const age = now - p.at;
  if (age < 0 || age >= p.life) return null;
  const t = age / p.life;
  const ease = 1 - (1 - t) * (1 - t);
  // Thick at once, then thinning as it spreads.
  const fade = t < 0.08 ? t / 0.08 : (1 - t) ** 1.4;
  return {
    x: p.x + p.dx * ease,
    y: p.y + p.dy * ease,
    z: p.z + p.rise * t,
    r: p.r0 + (p.r1 - p.r0) * ease,
    alpha: p.alpha * fade,
  };
}

/** Air burst beside a plane: a knot of dark smoke that hangs where the rocket went off. */
export function airBurstPuffs(x: number, y: number, z: number, now: number, seed: number): RocketPuff[] {
  const rnd = rng(seed ^ 0xa1b);
  const out: RocketPuff[] = [];
  for (let i = 0; i < 9; i++) {
    const a = rnd() * Math.PI * 2;
    const reach = 4 + rnd() * 10;
    out.push({
      x: x + Math.cos(a) * 2,
      y: y + Math.sin(a) * 2,
      z: z + (rnd() - 0.5) * 3,
      dx: Math.cos(a) * reach,
      dy: Math.sin(a) * reach,
      rise: 2 + rnd() * 5,
      at: now + i * 12,
      life: ROCKET_TRAIL_MS * (0.7 + rnd() * 0.4),
      r0: 3 + rnd() * 2,
      r1: 11 + rnd() * 6,
      alpha: 0.65 + rnd() * 0.2,
      shade: 0.75 + rnd() * 0.2,
      seed: (seed + i * 13) >>> 0,
    });
  }
  return out;
}

/** How long a flak burst's cloud lasts, ms. It blooms and is gone inside a second. */
export const FLAK_CLOUD_MS = 780;

/**
 * A Flak 37 shell's burst: a black cloud at the fuse height, a fifth smaller than the
 * wide one, gone almost at once. No bright core — that flash is the rocket's (`drawAirBurst`).
 * `shade` above 1 runs from dark brown toward black (`drawRocketPuff`).
 */
export function flakCloudPuffs(x: number, y: number, z: number, now: number, seed: number): RocketPuff[] {
  const rnd = rng(seed ^ 0xf1a);
  const out: RocketPuff[] = [];
  for (let i = 0; i < 22; i++) {
    const a = rnd() * Math.PI * 2;
    // 0.8 of the wide cloud (reach 32–80, radius 22–124).
    const reach = 26 + rnd() * 38;
    out.push({
      x: x + Math.cos(a) * (3 + rnd() * 11),
      y: y + Math.sin(a) * (3 + rnd() * 11),
      z: z + (rnd() - 0.5) * 2.4,
      dx: Math.cos(a) * reach,
      dy: Math.sin(a) * reach,
      rise: 3 + rnd() * 6,
      at: now + i * 8,
      life: FLAK_CLOUD_MS * (0.72 + rnd() * 0.28),
      r0: 18 + rnd() * 11,
      r1: 62 + rnd() * 37,
      alpha: 0.86 + rnd() * 0.12,
      shade: 1.96 + rnd() * 0.04,
      seed: (seed + i * 17) >>> 0,
    });
  }
  return out;
}

let puffSprites: HTMLCanvasElement[] | null = null;

/** Soft round puff, pale and dark, drawn once and stamped. */
function sprites(): HTMLCanvasElement[] {
  if (puffSprites) return puffSprites;
  puffSprites = [
    [214, 208, 196],
    [150, 140, 124],
    [34, 32, 30],
  ].map(([r, g, b]) => {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g2 = c.getContext("2d")!;
    const grad = g2.createRadialGradient(32, 32, 2, 32, 32, 32);
    grad.addColorStop(0, `rgba(${r},${g},${b},1)`);
    grad.addColorStop(0.55, `rgba(${r},${g},${b},0.55)`);
    grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
    g2.fillStyle = grad;
    g2.fillRect(0, 0, 64, 64);
    return c;
  });
  return puffSprites;
}

/** One puff at a screen point. Slightly flattened, the way smoke reads in 2:1 iso. */
export function drawRocketPuff(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  alpha: number,
  shade: number,
): void {
  if (alpha <= 0.01 || r <= 0.3) return;
  const [pale, dark, black] = sprites();
  if (shade > 1) {
    // Flak smoke: dark brown running to black.
    const k = Math.min(1, shade - 1);
    ctx.globalAlpha = alpha * (1 - k);
    ctx.drawImage(dark!, x - r, y - r * 0.8, r * 2, r * 1.6);
    ctx.globalAlpha = alpha * k;
    ctx.drawImage(black!, x - r, y - r * 0.8, r * 2, r * 1.6);
    return;
  }
  ctx.globalAlpha = alpha * (1 - shade);
  ctx.drawImage(pale!, x - r, y - r * 0.8, r * 2, r * 1.6);
  if (shade > 0.02) {
    ctx.globalAlpha = alpha * shade;
    ctx.drawImage(dark!, x - r, y - r * 0.8, r * 2, r * 1.6);
  }
}
