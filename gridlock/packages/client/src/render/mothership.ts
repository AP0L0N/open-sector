/**
 * Mothership on screen. The hull is one cube sheet from tools/sprites/render_mothership.py on the
 * Hive Ark's camera and scale, lifted to the ship's height (MapView.airLift). Its tractor beams
 * are drawn here: a cone of blue light from the emitter under the cube down to a pool round the
 * unit it holds (drawTractorBeam), and the unit coming apart into light as it is absorbed
 * (drawAbsorbFx). The pool also lifts the night (MapView.nightPools, kind "tractor"); the moment
 * a unit is gone is the Sim Unit's blink flash. Its dome is drawn round it in the air
 * (render/energy-shield.ts), only when struck.
 */

import { MOTHERSHIP_HULL_RADIUS, isoScale } from "@gridlock/shared";
import { rowYaw, shipRow } from "./battleship.js";
import { convexHull } from "./cast-shadow.js";

/** The render script's numbers (render_mothership.py). Model units are 10 m. */
export const MOTHERSHIP_MODEL = {
  hullR: 4.9,
  scaleFrac: (0.0325 * 384) / 256,
  cyFrac: 0.5,
  cell: 256,
  /** Half the cube's edge, model units; the panels stand a little proud of it. */
  half: 3.1,
  relief: 0.3,
  /** The beam leaves from the middle of the bottom face, model units below the cube's middle. */
  emitterZ: -3.1,
};

const COS_CAM = Math.cos(Math.PI / 6);

/** World px per model unit: the sim's hull radius over the model's. */
const WORLD_PER_UNIT = MOTHERSHIP_HULL_RADIUS / MOTHERSHIP_MODEL.hullR;

/** On-map size of a cell, screen px, so the art is as wide as the sim's hull. */
export function mothershipDrawSize(tileSize: number): number {
  const screenPerUnit = WORLD_PER_UNIT * Math.SQRT2 * isoScale(tileSize).hw;
  return screenPerUnit / MOTHERSHIP_MODEL.scaleFrac;
}

/** The cube's energy shield stands this much wider than the cube round it. */
export const CUBE_SHIELD_SCALE = 1.3;

/**
 * The Mothership's energy shield on screen, when something strikes it: a box of light round the
 * cube, not a bubble. `mid` is the ship's drawn middle; the box is the cube's own corners projected
 * on the sheet row drawn for `facing`, CUBE_SHIELD_SCALE wide (times `swell`). Its faces glow faintly
 * and its twelve edges brighter, the three at the far bottom corner dim behind the rest. `glow` 0–1.
 */
export function drawCubeShield(
  ctx: CanvasRenderingContext2D,
  mid: { x: number; y: number },
  facing: number,
  drawSize: number,
  tileSize: number,
  glow: number,
  swell = 1,
): void {
  if (glow <= 0.002) return;
  const yaw = rowYaw(shipRow(facing, tileSize));
  const k = MOTHERSHIP_MODEL.scaleFrac * drawSize;
  const h = (MOTHERSHIP_MODEL.half + MOTHERSHIP_MODEL.relief) * CUBE_SHIELD_SCALE * swell;
  const corners: { x: number; y: number; far: number; z: number; i: number }[] = [];
  let n = 0;
  for (const x of [-h, h]) {
    for (const y of [-h, h]) {
      for (const z of [-h, h]) {
        const gx = x * Math.cos(yaw) - y * Math.sin(yaw);
        const gy = x * Math.sin(yaw) + y * Math.cos(yaw);
        corners.push({ x: mid.x + gx * k, y: mid.y - (gy * Math.sin(Math.PI / 6) + z * COS_CAM) * k, far: gy, z, i: n++ });
      }
    }
  }
  // The corner hidden behind the box: the farthest one at the bottom.
  const hidden = corners.filter((c) => c.z < 0).reduce((a, b) => (b.far > a.far ? b : a));
  const hull = convexHull(corners);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.lineJoin = "round";
  ctx.beginPath();
  hull.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.closePath();
  const g = ctx.createRadialGradient(mid.x, mid.y, 0, mid.x, mid.y, h * k * 1.6);
  g.addColorStop(0, `rgba(90, 240, 165, ${0.05 * glow})`);
  g.addColorStop(1, `rgba(160, 255, 210, ${0.2 * glow})`);
  ctx.fillStyle = g;
  ctx.fill();
  // Twelve edges: corners one coordinate apart (index bits 4, 2, 1 are x, y, z).
  for (const a of corners) {
    for (const bit of [1, 2, 4]) {
      if (a.i & bit) continue;
      const b = corners[a.i | bit]!;
      const back = a === hidden || b === hidden;
      ctx.lineWidth = back ? 1 : 1.6;
      ctx.strokeStyle = `rgba(200, 255, 228, ${(back ? 0.22 : 0.7) * glow})`;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** The cube's shadow is a square this share of the hull radius from its middle to each side. */
export const MOTHERSHIP_SHADOW_HALF = (MOTHERSHIP_MODEL.half + MOTHERSHIP_MODEL.relief) / MOTHERSHIP_MODEL.hullR;

/** Screen px below the ship's drawn middle where the beam leaves the bottom face. */
export function mothershipEmitterDrop(drawSize: number): number {
  return -MOTHERSHIP_MODEL.emitterZ * COS_CAM * MOTHERSHIP_MODEL.scaleFrac * drawSize;
}

/**
 * The cube's outline on screen, offsets from its drawn middle, on the sheet row drawn for
 * `facing`: the eight corners (panels included) projected the render script's way, hulled.
 * The beam is clipped outside it, so the cube hides where the beam leaves its belly.
 */
export function mothershipOutline(facing: number, drawSize: number, tileSize: number): { x: number; y: number }[] {
  const yaw = rowYaw(shipRow(facing, tileSize));
  const k = MOTHERSHIP_MODEL.scaleFrac * drawSize;
  const h = MOTHERSHIP_MODEL.half + MOTHERSHIP_MODEL.relief;
  const pts: { x: number; y: number }[] = [];
  for (const x of [-h, h]) {
    for (const y of [-h, h]) {
      for (const z of [-h, h]) {
        const gx = x * Math.cos(yaw) - y * Math.sin(yaw);
        const gy = x * Math.sin(yaw) + y * Math.cos(yaw);
        pts.push({ x: gx * k, y: -(gy * Math.sin(Math.PI / 6) + z * COS_CAM) * k });
      }
    }
  }
  return convexHull(pts);
}

/** The pool of light is this much wider than the unit it holds. */
export const TRACTOR_POOL_SCALE = 1.35;
/** The tractor light's blue, as an "r, g, b" string. */
export const TRACTOR_RGB = "140, 205, 255";

/**
 * One tractor beam, screen px: a cone of blue light from under the ship (`top`) down to an ellipse
 * round the unit on the ground (`ground`, half axes `rx`, `ry`). `light` 0–1 is how far the light
 * has shone (it fades in over the first third); `u` 0–1 how far the absorbing has gone: bands of
 * light run up the cone while it draws, quicker toward the end. `hide` is the ship's outline on
 * screen: the beam is cut away inside it.
 */
export function drawTractorBeam(
  ctx: CanvasRenderingContext2D,
  top: { x: number; y: number },
  ground: { x: number; y: number },
  rx: number,
  ry: number,
  light: number,
  u: number,
  now: number,
  seed: number,
  hide?: readonly { x: number; y: number }[],
): void {
  const a = Math.min(1, light * 3) * (0.9 + 0.1 * Math.sin(now * 0.008 + seed));
  if (a <= 0.01 || rx <= 0) return;
  ctx.save();
  // Behind the cube: the beam shows only below its outline, so it seems to come out of its belly.
  if (hide && hide.length >= 3) {
    const big = 1e5;
    ctx.beginPath();
    ctx.rect(-big, -big, big * 2, big * 2);
    ctx.moveTo(hide[0]!.x, hide[0]!.y);
    for (let i = 1; i < hide.length; i++) ctx.lineTo(hide[i]!.x, hide[i]!.y);
    ctx.closePath();
    ctx.clip("evenodd");
  }
  ctx.globalCompositeOperation = "lighter";
  // The cone: from a narrow mouth under the cube to the width of the pool.
  const mouth = Math.max(2, rx * 0.22);
  ctx.beginPath();
  ctx.moveTo(top.x - mouth, top.y);
  ctx.lineTo(top.x + mouth, top.y);
  ctx.lineTo(ground.x + rx, ground.y);
  ctx.ellipse(ground.x, ground.y, rx, ry, 0, 0, Math.PI);
  ctx.lineTo(ground.x - rx, ground.y);
  ctx.closePath();
  const g = ctx.createLinearGradient(top.x, top.y, ground.x, ground.y);
  g.addColorStop(0, `rgba(${TRACTOR_RGB}, ${0.42 * a})`);
  g.addColorStop(0.6, `rgba(${TRACTOR_RGB}, ${0.16 * a})`);
  g.addColorStop(1, `rgba(${TRACTOR_RGB}, ${0.26 * a})`);
  ctx.fillStyle = g;
  ctx.fill();
  // The pool on the ground, brightest in the middle.
  ctx.save();
  ctx.translate(ground.x, ground.y);
  ctx.scale(1, ry / rx);
  const pool = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  pool.addColorStop(0, `rgba(210, 240, 255, ${0.55 * a})`);
  pool.addColorStop(0.6, `rgba(${TRACTOR_RGB}, ${0.3 * a})`);
  pool.addColorStop(1, `rgba(${TRACTOR_RGB}, 0)`);
  ctx.fillStyle = pool;
  ctx.beginPath();
  ctx.arc(0, 0, rx, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = `rgba(190, 230, 255, ${0.5 * a})`;
  ctx.beginPath();
  ctx.ellipse(ground.x, ground.y, rx, ry, 0, 0, Math.PI * 2);
  ctx.stroke();
  // Absorbing: rings of light climb the cone toward the ship.
  if (u > 0) {
    const bands = 4;
    const pace = 0.0007 + 0.0016 * u;
    for (let i = 0; i < bands; i++) {
      const t = (((now * pace + i / bands + seed * 0.13) % 1) + 1) % 1;
      const x = ground.x + (top.x - ground.x) * t;
      const y = ground.y + (top.y - ground.y) * t;
      const w = rx + (mouth - rx) * t;
      ctx.strokeStyle = `rgba(220, 245, 255, ${0.5 * a * (1 - t) * Math.min(1, u * 4)})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(x, y, Math.max(1, w), Math.max(0.5, (w * ry) / rx), 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  // The emitter glows while it holds a beam.
  const glow = ctx.createRadialGradient(top.x, top.y, 0, top.x, top.y, mouth * 2.2);
  glow.addColorStop(0, `rgba(230, 248, 255, ${0.8 * a})`);
  glow.addColorStop(1, `rgba(${TRACTOR_RGB}, 0)`);
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(top.x, top.y, mouth * 2.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * A unit coming apart into light as it is absorbed, over its drawn body (centre `x`, `y`, about
 * `size` screen px tall): motes peel off and stream up, more and brighter as `u` runs to 1, the
 * way a Sim Unit's blink scatters. The sprite under it fades (MapView, absorbFade).
 */
export function drawAbsorbFx(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, u: number, now: number, seed: number): void {
  if (u <= 0) return;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const motes = 6 + Math.round(14 * u);
  const rise = size * (0.9 + 0.8 * u);
  for (let i = 0; i < motes; i++) {
    const h = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
    const r1 = h - Math.floor(h);
    const t = (((now * (0.0009 + 0.0015 * u) + r1 + i / motes) % 1) + 1) % 1;
    const ox = (r1 - 0.5) * size * 0.6 * (1 - t * 0.6);
    const px = x + ox;
    const py = y + size * 0.25 - rise * t;
    const a = (1 - t) * (0.35 + 0.65 * u);
    ctx.fillStyle = `rgba(200, 240, 255, ${a})`;
    ctx.fillRect(px - 1, py - 1, 2, 2 + 3 * u);
  }
  // A white-blue sheen over the body, brightest near the end.
  const sheen = ctx.createRadialGradient(x, y, 0, x, y, size * 0.6);
  sheen.addColorStop(0, `rgba(220, 245, 255, ${0.5 * u})`);
  sheen.addColorStop(1, `rgba(${TRACTOR_RGB}, 0)`);
  ctx.fillStyle = sheen;
  ctx.beginPath();
  ctx.arc(x, y, size * 0.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** How much of a unit's sprite still shows while it is absorbed: it thins away toward the end. */
export function absorbFade(u: number): number {
  return 1 - 0.9 * Math.max(0, Math.min(1, u)) ** 1.5;
}
