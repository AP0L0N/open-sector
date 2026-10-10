/**
 * Hive energy walls: a curved curtain of green light standing where a
 * Behemoth, Drone, or Lancer raised it, or a Weaver threw it in front of a friend. It dims as it loses points and flares
 * when a round strikes it. Drawing only; the sim decides what it stops.
 */
import { ISO_ELEVATION, type EnergyShieldView } from "@gridlock/shared";

/** World points along the curve, end to end. */
export const SHIELD_PANELS = 10;
/** The curtain stands this tall for each world px of radius, in screen px. */
const HEIGHT_PER_R = 0.85;

/** Elevation units the curtain rises, from its radius. */
export function shieldHeightElev(r: number): number {
  return (r * HEIGHT_PER_R) / ISO_ELEVATION;
}

/** Ground points along the wall's curve, SHIELD_PANELS + 1 of them. */
export function shieldCurve(s: Pick<EnergyShieldView, "x" | "y" | "angle" | "half" | "r">): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i <= SHIELD_PANELS; i++) {
    const a = s.angle - s.half + (2 * s.half * i) / SHIELD_PANELS;
    out.push({ x: s.x + Math.cos(a) * s.r, y: s.y + Math.sin(a) * s.r });
  }
  return out;
}

/** 0–1: how bright the curtain draws. Never quite out while it stands; a struck wall flares. */
export function shieldGlow(s: Pick<EnergyShieldView, "hp" | "hpMax" | "hit">, now: number, id: number): number {
  const left = s.hpMax > 0 ? Math.max(0, Math.min(1, s.hp / s.hpMax)) : 0;
  const shimmer = 0.92 + 0.08 * Math.sin(now * 0.006 + id);
  // A failing wall flickers.
  const flicker = left < 0.25 ? 0.65 + 0.35 * Math.abs(Math.sin(now * 0.03 + id * 1.7)) : 1;
  const base = (0.35 + 0.65 * left) * shimmer * flicker;
  return Math.min(1, s.hit ? base + 0.45 : base);
}

/** How long the nanite thread from a Weaver to the wall it just threw shows, ms. */
export const WEAVE_THREAD_MS = 450;

/**
 * The thread a Weaver casts to a wall it throws: a wavering green strand from its spindle to the
 * curtain's middle, fading over WEAVE_THREAD_MS. `age` is ms since the wall first showed.
 */
export function drawWeaveThread(
  ctx: CanvasRenderingContext2D,
  from: { x: number; y: number },
  to: { x: number; y: number },
  age: number,
  id: number,
): void {
  const k = 1 - age / WEAVE_THREAD_MS;
  if (k <= 0) return;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";
  for (const [width, alpha] of [
    [3, 0.25],
    [1.2, 0.85],
  ] as const) {
    ctx.lineWidth = width;
    ctx.strokeStyle = `rgba(150, 255, 205, ${alpha * k})`;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    for (let i = 1; i <= 8; i++) {
      const u = i / 8;
      const wave = Math.sin(u * Math.PI) * Math.sin(u * 9 + age * 0.03 + id) * 2.5;
      ctx.lineTo(from.x + dx * u + nx * wave, from.y + dy * u + ny * wave);
    }
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * One panel of the curtain, between two ground points (screen) and the same
 * points lifted by `lift` screen px.
 */
export function drawShieldPanel(
  ctx: CanvasRenderingContext2D,
  a: { x: number; y: number },
  b: { x: number; y: number },
  lift: number,
  glow: number,
): void {
  if (glow <= 0) return;
  const g = ctx.createLinearGradient(0, Math.min(a.y, b.y) - lift, 0, Math.max(a.y, b.y));
  g.addColorStop(0, `rgba(160, 255, 210, ${0.55 * glow})`);
  g.addColorStop(0.35, `rgba(90, 240, 165, ${0.22 * glow})`);
  g.addColorStop(1, `rgba(70, 230, 154, ${0.42 * glow})`);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.lineTo(b.x, b.y - lift);
  ctx.lineTo(a.x, a.y - lift);
  ctx.closePath();
  ctx.fill();
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = `rgba(200, 255, 228, ${0.75 * glow})`;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y - lift);
  ctx.lineTo(b.x, b.y - lift);
  ctx.stroke();
  ctx.strokeStyle = `rgba(130, 255, 196, ${0.5 * glow})`;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.restore();
}
