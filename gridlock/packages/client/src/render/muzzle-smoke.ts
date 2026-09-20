/**
 * Directional propellant smoke from a tank muzzle. Client-only.
 * A short jet along the barrel, then a hanging cloud that drifts with the shot.
 */

export const MUZZLE_JET_MS = 420;
export const MUZZLE_CLOUD_MS = 1180;

export interface MuzzleSmokePuff {
  x: number;
  y: number;
  vx: number;
  vy: number;
  at: number;
  seed: number;
  life: number;
  kind: "jet" | "cloud";
  scale: number;
}

function rng(seed: number): () => number {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function dirOf(x: number, y: number): { x: number; y: number } {
  const l = Math.hypot(x, y);
  if (l < 1e-6) return { x: 1, y: 0 };
  return { x: x / l, y: y / l };
}

export function spawnMuzzleSmoke(opts: {
  x: number;
  y: number;
  dirX: number;
  dirY: number;
  now: number;
  seed: number;
  scale?: number;
}): MuzzleSmokePuff[] {
  const along = dirOf(opts.dirX, opts.dirY);
  const rx = -along.y;
  const ry = along.x;
  const rnd = rng(opts.seed);
  const scale = Math.max(0.7, opts.scale ?? 1);
  const out: MuzzleSmokePuff[] = [];

  for (let i = 0; i < 5; i++) {
    const yaw = (rnd() - 0.5) * 0.28;
    const cs = Math.cos(yaw);
    const sn = Math.sin(yaw);
    const dx = along.x * cs - along.y * sn;
    const dy = along.x * sn + along.y * cs;
    const speed = 16 + rnd() * 18;
    const along0 = 1.2 + i * 2.4 + rnd() * 1.6;
    out.push({
      x: opts.x + along.x * along0 + rx * (rnd() - 0.5) * 1.8,
      y: opts.y + along.y * along0 + ry * (rnd() - 0.5) * 1.8,
      vx: dx * speed,
      vy: dy * speed,
      at: opts.now + i * 12,
      seed: (opts.seed + i * 17) >>> 0,
      life: MUZZLE_JET_MS * (0.78 + rnd() * 0.28),
      kind: "jet",
      scale,
    });
  }

  for (let i = 0; i < 6; i++) {
    const yaw = (rnd() - 0.5) * 0.72;
    const cs = Math.cos(yaw);
    const sn = Math.sin(yaw);
    const dx = along.x * cs - along.y * sn;
    const dy = along.x * sn + along.y * cs;
    const speed = 4.5 + rnd() * 8.5;
    const along0 = 2 + rnd() * 7;
    const side = (rnd() - 0.5) * 5.5;
    out.push({
      x: opts.x + along.x * along0 + rx * side,
      y: opts.y + along.y * along0 + ry * side,
      vx: dx * speed,
      vy: dy * speed,
      at: opts.now + 30 + i * 28,
      seed: (opts.seed + 200 + i * 23) >>> 0,
      life: MUZZLE_CLOUD_MS * (0.72 + rnd() * 0.4),
      kind: "cloud",
      scale,
    });
  }
  return out;
}

export function muzzleSmokePose(
  puff: MuzzleSmokePuff,
  now: number,
): { x: number; y: number; t: number; lift: number } | null {
  const age = now - puff.at;
  if (age < 0 || age >= puff.life) return null;
  const t = age / puff.life;
  const ease = 1 - (1 - t) * (1 - t);
  const drag = puff.kind === "jet" ? ease : t * (1.15 - 0.35 * t);
  const base = puff.kind === "jet" ? 11 : 8;
  const rise = puff.kind === "jet" ? 7 : 16;
  return {
    x: puff.x + puff.vx * drag,
    y: puff.y + puff.vy * drag,
    t,
    lift: (base + rise * t) * puff.scale,
  };
}

const JET = ["#ece6d4", "#d8d2c2", "#c4bcae", "#9e988c"] as const;
const CLOUD = ["#c8c2b4", "#b4ae9e", "#9a9488", "#8a8478"] as const;

/** Elongated along `dir` (screen). Jet is a tight cone; cloud hangs and fattens. */
export function drawMuzzleSmoke(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  t: number,
  kind: "jet" | "cloud",
  seed: number,
  scale: number,
  dirX: number,
  dirY: number,
): void {
  if (t <= 0 || t >= 1) return;
  const along = dirOf(dirX, dirY);
  const ang = Math.atan2(along.y, along.x);
  const s = Math.max(0.7, scale);
  const rnd = rng(seed ^ 0x51ed);
  const fade = kind === "jet" ? (1 - t) * (1 - t) : (1 - t) * (1 - t * 0.45);
  ctx.save();
  if (kind === "jet") {
    const len = (10 + rnd() * 6) * s * (1.05 - t * 0.35);
    const w = (2.2 + rnd() * 1.6) * s * (0.7 + t * 0.9);
    ctx.globalAlpha = fade * (0.42 + rnd() * 0.22);
    ctx.fillStyle = JET[(seed >>> 0) % JET.length]!;
    ctx.beginPath();
    ctx.ellipse(x + along.x * len * 0.18, y + along.y * len * 0.18, len, w, ang, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = fade * 0.28;
    ctx.fillStyle = "#f4f0e4";
    ctx.beginPath();
    ctx.ellipse(x, y, len * 0.42, w * 0.55, ang, 0, Math.PI * 2);
    ctx.fill();
  } else {
    const grow = 0.55 + t * 1.15;
    const rx = (5.5 + rnd() * 3.2) * s * grow;
    const ry = rx * (0.48 + rnd() * 0.12);
    ctx.globalAlpha = fade * (0.34 + rnd() * 0.18);
    ctx.fillStyle = CLOUD[(seed >>> 0) % CLOUD.length]!;
    ctx.beginPath();
    ctx.ellipse(
      x + (rnd() - 0.5) * 2.4 * s,
      y,
      rx,
      ry,
      ang * 0.35 + (rnd() - 0.5) * 0.4,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    ctx.globalAlpha = fade * 0.16;
    ctx.fillStyle = "#ddd6c6";
    ctx.beginPath();
    ctx.ellipse(x + along.x * 2 * s, y + along.y * 2 * s, rx * 0.7, ry * 0.7, ang * 0.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
