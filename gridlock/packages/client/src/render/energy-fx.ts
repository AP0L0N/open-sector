/**
 * Xenite energy weapons. Every Xenite gun, launcher, and turret fires light, not
 * metal: a green bolt from the muzzle to where it lands, a green flare at the
 * muzzle and no smoke, a plasma orb in flight in place of a rocket, and a burst
 * of green light, a shock ring, and sparks where it hits. The sim still treats
 * each round as its kind (bullet, shell, rocket); this file only changes the
 * look.
 */
import type { CiwsTracer } from "./ciws-tracer.js";

/** Glow, body, and core of an energy bolt. */
export const ENERGY_GLOW = "rgba(70, 230, 154, 0.32)";
export const ENERGY_BODY = "rgba(130, 255, 196, 0.85)";
export const ENERGY_CORE = "rgba(236, 255, 246, 1)";

/** World px a bolt covers per ms: slower than a tracer, so the shot reads. */
const BOLT_PX_PER_MS = 1.4;
const BOLT_MIN_MS = 60;
const BOLT_MAX_MS = 240;
/** Ms the shots of one snapshot are spread over. */
const BOLT_STREAM_MS = 100;
/** Past this many shots in one snapshot, a gun's stream shows one bolt in every BOLT_STREAM_EVERY. */
const BOLT_STREAM_FROM = 4;
const BOLT_STREAM_EVERY = 3;

export interface EnergyBolt extends CiwsTracer {
  energy: true;
  /** A heavy bolt from a cannon: thicker, brighter. */
  heavy: boolean;
}

/** Bolts from one gun to this snapshot's hits. A stream of many shows only every few. */
export function energyBolts(
  muzzle: { x: number; y: number; z: number },
  impacts: readonly { id: number; x: number; y: number; airZ?: number; caliber?: number }[],
  groundZ: (x: number, y: number) => number,
  now: number,
  tileSize: number,
): EnergyBolt[] {
  const shots = [...impacts].sort((a, b) => a.id - b.id);
  const thin = shots.length >= BOLT_STREAM_FROM;
  const out: EnergyBolt[] = [];
  shots.forEach((i, k) => {
    if (thin && ((i.id % BOLT_STREAM_EVERY) + BOLT_STREAM_EVERY) % BOLT_STREAM_EVERY !== 0) return;
    const z1 = i.airZ ?? groundZ(i.x, i.y);
    const d = Math.hypot(i.x - muzzle.x, i.y - muzzle.y, (z1 - muzzle.z) * tileSize * 0.25);
    out.push({
      id: i.id,
      x0: muzzle.x,
      y0: muzzle.y,
      x1: i.x,
      y1: i.y,
      z0: muzzle.z,
      z1,
      at: now + (k / Math.max(1, shots.length)) * BOLT_STREAM_MS,
      dur: Math.max(BOLT_MIN_MS, Math.min(BOLT_MAX_MS, d / BOLT_PX_PER_MS)),
      wing: 1,
      energy: true,
      heavy: (i.caliber ?? 0) >= 40,
    });
  });
  return out;
}

/** One bolt between two screen points: a soft glow, a bright body, a white core. */
export function drawEnergyBolt(ctx: CanvasRenderingContext2D, tail: { x: number; y: number }, head: { x: number; y: number }, heavy: boolean): void {
  ctx.save();
  ctx.lineCap = "round";
  const layers: [string, number][] = heavy
    ? [
        [ENERGY_GLOW, 10],
        [ENERGY_BODY, 4.5],
        [ENERGY_CORE, 2],
      ]
    : [
        [ENERGY_GLOW, 5],
        [ENERGY_BODY, 2.4],
        [ENERGY_CORE, 1],
      ];
  for (const [color, width] of layers) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(tail.x, tail.y);
    ctx.lineTo(head.x, head.y);
    ctx.stroke();
  }
  ctx.restore();
}

/** Calibers at or under this fly as a small orb: the Mawcaster's Air attacks. */
const SMALL_ORB_CALIBER = 30;

/** A Scourge's plasma bolt against the usual orb: the big one. */
const SCOURGE_BOLT_SCALE = 1.8;
/** The Bombard's one big plasma round. */
const BOMBARD_ROUND_SCALE = 1.6;

/** Size of a plasma orb against the usual one: small for a light anti-air ball, big for a Scourge's bolt. */
export function plasmaOrbScale(caliber: number, shooterType?: string): number {
  if (shooterType === "scourge") return SCOURGE_BOLT_SCALE;
  if (shooterType === "bombard") return BOMBARD_ROUND_SCALE;
  return caliber <= SMALL_ORB_CALIBER ? 0.55 : 1;
}

/** A plasma orb in flight, with a short fading tail behind it along (dx, dy). `scale` sizes it. */
export function drawPlasmaOrb(ctx: CanvasRenderingContext2D, x: number, y: number, dx: number, dy: number, heavy: boolean, scale = 1): void {
  const r = (heavy ? 6 : 4.5) * scale;
  const len = Math.hypot(dx, dy) || 1;
  const tx = x - (dx / len) * r * 3.2;
  const ty = y - (dy / len) * r * 3.2;
  ctx.save();
  const tail = ctx.createLinearGradient(x, y, tx, ty);
  tail.addColorStop(0, "rgba(130, 255, 196, 0.7)");
  tail.addColorStop(1, "rgba(70, 230, 154, 0)");
  ctx.strokeStyle = tail;
  ctx.lineCap = "round";
  ctx.lineWidth = r * 1.2;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(tx, ty);
  ctx.stroke();
  const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.2);
  g.addColorStop(0, "rgba(240, 255, 248, 1)");
  g.addColorStop(0.35, "rgba(140, 255, 200, 0.9)");
  g.addColorStop(1, "rgba(70, 230, 154, 0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r * 2.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Ms an energy hit lasts: longer and wider for a cannon's bolt. */
export function energyBurstMs(caliber: number | undefined): number {
  return (caliber ?? 0) >= 40 ? 520 : 260;
}

/** Green flash, a shock ring that widens and fades, and a few sparks. `t` runs 0–1 over the burst. */
export function drawEnergyBurst(ctx: CanvasRenderingContext2D, x: number, y: number, t: number, seed: number, caliber: number | undefined): void {
  const big = (caliber ?? 0) >= 40;
  const scale = big ? 1 : 0.45;
  const fade = 1 - t;
  ctx.save();
  // Flash.
  const fr = (10 + 10 * t) * scale * 1.6;
  const g = ctx.createRadialGradient(x, y, 0, x, y, fr);
  g.addColorStop(0, `rgba(240, 255, 248, ${0.95 * fade})`);
  g.addColorStop(0.4, `rgba(120, 255, 190, ${0.7 * fade})`);
  g.addColorStop(1, "rgba(70, 230, 154, 0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, fr, 0, Math.PI * 2);
  ctx.fill();
  // Shock ring, flattened to the ground.
  ctx.strokeStyle = `rgba(150, 255, 205, ${0.75 * fade})`;
  ctx.lineWidth = (big ? 2.4 : 1.4) * fade + 0.4;
  ctx.beginPath();
  ctx.ellipse(x, y, (6 + 26 * t) * scale * 1.4, (3 + 13 * t) * scale * 1.4, 0, 0, Math.PI * 2);
  ctx.stroke();
  // Sparks.
  const n = big ? 9 : 4;
  ctx.strokeStyle = `rgba(210, 255, 230, ${fade})`;
  ctx.lineWidth = 1;
  for (let k = 0; k < n; k++) {
    const r = Math.sin((seed + k * 13.37) * 12.9898) * 43758.5453;
    const u = r - Math.floor(r);
    const a = (k / n) * Math.PI * 2 + u * 0.8;
    const d0 = (4 + 18 * t) * scale * 1.5;
    const d1 = d0 + (4 + 6 * u) * scale * 1.5;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * d0, y + Math.sin(a) * d0 * 0.6 - 10 * t * u * scale);
    ctx.lineTo(x + Math.cos(a) * d1, y + Math.sin(a) * d1 * 0.6 - 10 * t * u * scale);
    ctx.stroke();
  }
  ctx.restore();
}

/** A green flare at the muzzle along (dirX, dirY). `t` runs 0–1 over the flash. */
export function drawEnergyMuzzle(ctx: CanvasRenderingContext2D, x: number, y: number, dirX: number, dirY: number, t: number, caliber: number | undefined): void {
  const big = (caliber ?? 0) >= 40;
  const fade = 1 - t;
  const len = Math.hypot(dirX, dirY) || 1;
  const ux = dirX / len;
  const uy = dirY / len;
  const r = (big ? 9 : 5) * (0.6 + 0.4 * fade);
  ctx.save();
  const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2);
  g.addColorStop(0, `rgba(245, 255, 250, ${fade})`);
  g.addColorStop(0.45, `rgba(130, 255, 196, ${0.8 * fade})`);
  g.addColorStop(1, "rgba(70, 230, 154, 0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r * 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = `rgba(200, 255, 225, ${0.9 * fade})`;
  ctx.lineWidth = big ? 2.2 : 1.4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + ux * r * 3, y + uy * r * 3);
  ctx.stroke();
  ctx.restore();
}
