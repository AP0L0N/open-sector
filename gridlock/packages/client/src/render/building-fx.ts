import type { EntityType, EntityView } from "@gridlock/shared";
import type { BuildingSpriteDef } from "./sprites.js";

/** Buildings that train units. Overlay only while a job is running. */
const PRODUCERS = new Set<EntityType>(["muster", "smelter", "armory"]);
/** No train line: keep a quiet always-on blink. */
const IDLE_ALWAYS = new Set<EntityType>(["core", "dynamo"]);

export type BuildingAnimView = Pick<
  EntityView,
  "id" | "type" | "hp" | "wreck" | "trainProgress" | "trainQueue"
>;

export function buildingProducesUnits(type: EntityType): boolean {
  return PRODUCERS.has(type);
}

/** True when this building should play its overlay this frame. */
export function buildingAnimActive(e: BuildingAnimView): boolean {
  if (e.wreck || e.hp <= 0) return false;
  if (PRODUCERS.has(e.type)) {
    if (e.trainProgress == null) return false;
    if (e.trainQueue?.[0]?.paused) return false;
    return true;
  }
  return IDLE_ALWAYS.has(e.type);
}

type LightMode = "pulse" | "blink";

interface LightSpot {
  x: number;
  y: number;
  r: number;
  color: string;
  period: number;
  phase: number;
  mode: LightMode;
}

interface SmokeSpot {
  x: number;
  y: number;
}

interface SparkSpot {
  x: number;
  y: number;
}

interface BuildingAnimDef {
  lights: LightSpot[];
  smoke?: SmokeSpot[];
  sparks?: SparkSpot[];
}

const DEFS: Partial<Record<EntityType, BuildingAnimDef>> = {
  dynamo: {
    lights: [
      { x: 105, y: 131, r: 11, color: "#ffc44a", period: 2200, phase: 0.05, mode: "pulse" },
      { x: 186, y: 84, r: 7, color: "#ffe08a", period: 1900, phase: 0.28, mode: "pulse" },
      { x: 226, y: 108, r: 8, color: "#ffe08a", period: 1800, phase: 0.4, mode: "pulse" },
      { x: 280, y: 154, r: 10, color: "#ffc44a", period: 2400, phase: 0.62, mode: "pulse" },
      { x: 186, y: 176, r: 8, color: "#ffb84a", period: 2000, phase: 0.22, mode: "pulse" },
      { x: 248, y: 174, r: 8, color: "#ffb84a", period: 2100, phase: 0.78, mode: "pulse" },
    ],
  },
  core: {
    lights: [
      { x: 184, y: 106, r: 8, color: "#ffb84a", period: 2600, phase: 0.1, mode: "pulse" },
      { x: 250, y: 104, r: 8, color: "#ffb84a", period: 2600, phase: 0.18, mode: "pulse" },
      { x: 201, y: 309, r: 10, color: "#ffc44a", period: 2200, phase: 0.45, mode: "pulse" },
      { x: 261, y: 229, r: 8, color: "#ffb84a", period: 2400, phase: 0.7, mode: "pulse" },
      { x: 71, y: 236, r: 6, color: "#ffe08a", period: 3200, phase: 0.0, mode: "blink" },
      { x: 241, y: 240, r: 5, color: "#ffe08a", period: 3400, phase: 0.55, mode: "blink" },
    ],
  },
  smelter: {
    lights: [
      { x: 156, y: 188, r: 9, color: "#ff9a32", period: 720, phase: 0.05, mode: "pulse" },
      { x: 249, y: 185, r: 9, color: "#ff9a32", period: 720, phase: 0.12, mode: "pulse" },
      { x: 160, y: 232, r: 9, color: "#ff8a22", period: 640, phase: 0.4, mode: "pulse" },
      { x: 248, y: 231, r: 9, color: "#ff8a22", period: 640, phase: 0.48, mode: "pulse" },
      { x: 161, y: 274, r: 8, color: "#ff7a18", period: 580, phase: 0.22, mode: "pulse" },
      { x: 265, y: 290, r: 16, color: "#ff6a14", period: 520, phase: 0.0, mode: "pulse" },
    ],
    smoke: [
      { x: 216, y: 38 },
      { x: 270, y: 70 },
    ],
  },
  muster: {
    lights: [
      { x: 122, y: 192, r: 12, color: "#ffc44a", period: 900, phase: 0.1, mode: "pulse" },
      { x: 196, y: 10, r: 5, color: "#ffe08a", period: 1400, phase: 0.0, mode: "blink" },
    ],
  },
  armory: {
    lights: [
      { x: 148, y: 175, r: 14, color: "#ffc44a", period: 800, phase: 0.15, mode: "pulse" },
      { x: 187, y: 30, r: 5, color: "#ffe08a", period: 1100, phase: 0.0, mode: "blink" },
    ],
    sparks: [{ x: 150, y: 110 }],
  },
};

function srcToScreen(
  def: BuildingSpriteDef,
  southX: number,
  southY: number,
  footprintW: number,
  sx: number,
  sy: number,
): { x: number; y: number; scale: number } {
  const scale = footprintW / def.padWidth;
  return {
    x: southX + (sx - def.padSouthX) * scale,
    y: southY + (sy - def.padSouthY) * scale,
    scale,
  };
}

function sinePulse(nowMs: number, period: number, phase: number): number {
  return 0.5 + 0.5 * Math.sin((nowMs / period + phase) * Math.PI * 2);
}

function blinkPulse(nowMs: number, period: number, phase: number, duty = 0.28): number {
  const t = ((nowMs / period + phase) % 1 + 1) % 1;
  const fade = Math.max(0.04, duty * 0.18);
  if (t < fade) return t / fade;
  if (t < duty) return 1;
  if (t < duty + fade) return 1 - (t - duty) / fade;
  return 0;
}

function drawGlow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
  alpha: number,
): void {
  if (alpha <= 0.02 || r <= 0.4) return;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = alpha * 0.45;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x, y, r * 2.15, r * 1.45, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = alpha * 0.85;
  ctx.beginPath();
  ctx.ellipse(x, y, r * 0.95, r * 0.7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.fillStyle = "#fff6d0";
  ctx.beginPath();
  ctx.ellipse(x, y, r * 0.32, r * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawChimneySmoke(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  nowMs: number,
  seed: number,
  scale: number,
  intensity: number,
): void {
  const puffs = 5;
  for (let i = 0; i < puffs; i++) {
    const t = ((nowMs * 0.00018 + seed * 0.13 + i / puffs) % 1 + 1) % 1;
    const drift = Math.sin(nowMs * 0.0014 + seed + i * 1.7) * 4.5 * scale;
    const px = x + drift;
    const py = y - t * 26 * scale;
    const grow = 0.45 + t * 1.35;
    const a = intensity * (1 - t) * Math.min(1, t * 3.2) * 0.38;
    if (a <= 0.02) continue;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = i % 2 === 0 ? "#6a645c" : "#7a746c";
    ctx.beginPath();
    ctx.ellipse(px, py, (3.2 + grow * 3.4) * scale, (2.4 + grow * 2.6) * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawWorkSparks(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  nowMs: number,
  seed: number,
  scale: number,
  intensity: number,
): void {
  const cycle = 560;
  const local = (((nowMs + seed * 37) % cycle) + cycle) % cycle / cycle;
  if (local > 0.42) return;
  const t = local / 0.42;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "butt";
  const n = 5;
  for (let i = 0; i < n; i++) {
    const ang = -0.9 + i * 0.42 + Math.sin(seed + i) * 0.2;
    const dist = (6 + (i % 3) * 3.2) * scale * t;
    const px = x + Math.cos(ang) * dist;
    const py = y + Math.sin(ang) * dist * 0.55 + t * 2 * scale;
    const fade = (1 - t) * (1 - t) * intensity;
    ctx.globalAlpha = fade * (0.55 + (i % 2) * 0.35);
    ctx.strokeStyle = t < 0.35 ? "#ffffff" : "#ffc56a";
    ctx.lineWidth = Math.max(0.7, 1.15 * scale);
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px - Math.cos(ang) * 3.2 * scale, py - Math.sin(ang) * 2.2 * scale);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawBuildingAnim(
  ctx: CanvasRenderingContext2D,
  def: BuildingSpriteDef,
  e: BuildingAnimView,
  southX: number,
  southY: number,
  footprintW: number,
  nowMs: number,
): void {
  if (!buildingAnimActive(e) || footprintW <= 0 || def.padWidth <= 0) return;
  const spots = DEFS[e.type];
  if (!spots) return;
  const subtle = !PRODUCERS.has(e.type);
  const gain = subtle ? 0.32 : 0.88;
  const drift = ((e.id * 0.6180339887) % 1 + 1) % 1;

  for (const light of spots.lights) {
    const p = srcToScreen(def, southX, southY, footprintW, light.x, light.y);
    const wave =
      light.mode === "blink"
        ? blinkPulse(nowMs, light.period, light.phase + drift)
        : 0.4 + 0.6 * sinePulse(nowMs, light.period, light.phase + drift);
    const r = Math.max(1.2, light.r * p.scale);
    drawGlow(ctx, p.x, p.y, r, light.color, gain * wave);
  }

  if (spots.smoke) {
    for (let i = 0; i < spots.smoke.length; i++) {
      const s = spots.smoke[i]!;
      const p = srcToScreen(def, southX, southY, footprintW, s.x, s.y);
      drawChimneySmoke(ctx, p.x, p.y, nowMs, e.id * 17 + i * 9, p.scale, gain);
    }
  }

  if (spots.sparks) {
    for (let i = 0; i < spots.sparks.length; i++) {
      const s = spots.sparks[i]!;
      const p = srcToScreen(def, southX, southY, footprintW, s.x, s.y);
      drawWorkSparks(ctx, p.x, p.y, nowMs, e.id * 23 + i * 11, p.scale, gain);
    }
  }
}
