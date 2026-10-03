/**
 * Field-gun blast smoke. Client-only.
 * The muzzle blast slams the ground and the brake throws gas back past the
 * shield: a thick cloud boils up behind and beside the gun, hangs, and drifts.
 */

export const FIELD_GUN_SMOKE_MS = 3600;

export interface FieldGunSmokePuff {
  x: number;
  y: number;
  vx: number;
  vy: number;
  at: number;
  seed: number;
  life: number;
  /** Starting radius, world px. */
  size: number;
}

function rng(seed: number): () => number {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Puffs behind and beside a gun at (x, y) firing along `facing`. `radius` is the gun's footprint. */
export function spawnFieldGunSmoke(opts: {
  x: number;
  y: number;
  facing: number;
  radius: number;
  now: number;
  seed: number;
}): FieldGunSmokePuff[] {
  const rnd = rng(opts.seed);
  const fx = Math.cos(opts.facing);
  const fy = Math.sin(opts.facing);
  const sx = -fy;
  const sy = fx;
  const r = Math.max(4, opts.radius);
  const out: FieldGunSmokePuff[] = [];
  for (let i = 0; i < 14; i++) {
    // Most of it rolls out rearward; the rest spills off both flanks.
    const back = r * (0.2 + rnd() * 2.4);
    const side = r * (rnd() - 0.5) * (1.6 + back / r);
    const x = opts.x - fx * back + sx * side;
    const y = opts.y - fy * back + sy * side;
    const spread = 0.35 + rnd() * 0.5;
    const push = r * (1 + rnd() * 1.6);
    const dx = -fx * spread + sx * (side / r) * 0.6;
    const dy = -fy * spread + sy * (side / r) * 0.6;
    const l = Math.hypot(dx, dy) || 1;
    out.push({
      x,
      y,
      vx: (dx / l) * push,
      vy: (dy / l) * push,
      at: opts.now + i * 22 + rnd() * 40,
      seed: (opts.seed + i * 31) >>> 0,
      life: FIELD_GUN_SMOKE_MS * (0.7 + rnd() * 0.45),
      size: r * (0.55 + rnd() * 0.45),
    });
  }
  return out;
}

export function fieldGunSmokePose(
  puff: FieldGunSmokePuff,
  now: number,
): { x: number; y: number; t: number; lift: number; radius: number } | null {
  const age = now - puff.at;
  if (age < 0 || age >= puff.life) return null;
  const t = age / puff.life;
  // Shoved out hard, then it hangs and climbs.
  const shove = 1 - (1 - t) * (1 - t) * (1 - t);
  return {
    x: puff.x + puff.vx * shove,
    y: puff.y + puff.vy * shove,
    t,
    lift: 4 + 22 * t * (1 - 0.35 * t),
    radius: puff.size * (0.6 + 1.9 * Math.sqrt(t)),
  };
}

const BODY = ["#8e877a", "#7c766b", "#9b9486", "#6f6a61"] as const;

/** One thick puff. `scale` maps world radius to screen px. */
export function drawFieldGunSmoke(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  t: number,
  radius: number,
  seed: number,
  scale: number,
): void {
  if (t <= 0 || t >= 1) return;
  const rnd = rng(seed ^ 0x2f6b);
  // Dense at once, a long tail as it thins.
  const fade = Math.min(1, t * 9) * (1 - t) * (1 - t * 0.4);
  const rx = radius * scale;
  const ry = rx * (0.62 + rnd() * 0.12);
  ctx.save();
  ctx.globalAlpha = fade * (0.62 + rnd() * 0.18);
  ctx.fillStyle = BODY[(seed >>> 0) % BODY.length]!;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, (rnd() - 0.5) * 0.5, 0, Math.PI * 2);
  ctx.fill();
  // A lit crown on top and a darker belly keep it from reading as a flat disc.
  ctx.globalAlpha = fade * 0.32;
  ctx.fillStyle = "#c9c2b2";
  ctx.beginPath();
  ctx.ellipse(x - rx * 0.12, y - ry * 0.3, rx * 0.62, ry * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = fade * 0.24;
  ctx.fillStyle = "#4f4a43";
  ctx.beginPath();
  ctx.ellipse(x + rx * 0.08, y + ry * 0.32, rx * 0.7, ry * 0.42, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
