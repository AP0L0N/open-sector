/**
 * Hive Ark layout on screen. The hull and cannon layers come from
 * tools/sprites/render_hive_ark.py on one camera and scale, each with the model origin at the
 * same cell point (the Battle Ship's scheme, render/battleship.ts). Each cannon is drawn with
 * its pivot where its barbette projects on the hull face shown; a docked Wasp sits on its pod.
 * The energy dome is the shared dome (render/energy-shield.ts), drawn over any unit that casts one.
 */

import { ARK_CANNON_AT, ARK_HULL_RADIUS, ARK_POD_AT, isoScale } from "@gridlock/shared";
import { rowYaw, shipRow } from "./battleship.js";

/** The cannon's barrel and its raise off the deck (render_hive_ark.py, after CANNON_SIZE). */
const BARREL_LEN = 2.25 * 1.55;
const TRUNNION_Z = 0.62 * 1.55;
const CANNON_ELEV = (50 * Math.PI) / 180;

/** The render script's numbers (render_hive_ark.py). Model units are 10 m. */
export const HIVEARK_MODEL = {
  hullR: 4.9,
  scaleFrac: (0.0325 * 384) / 256,
  cyFrac: 0.56,
  cell: 256,
  /** Pivot heights, model units: the barbette tops, and the pad tops. */
  cannonZ: 1.72,
  podZ: 1.62,
  /** Barrel tip ahead of the cannon pivot, and its height over it: the barrel stands raised for the high arc. */
  muzzleReach: BARREL_LEN * Math.cos(CANNON_ELEV),
  boreZ: TRUNNION_Z + BARREL_LEN * Math.sin(CANNON_ELEV),
};

const COS_CAM = Math.cos(Math.PI / 6);

/** World px per model unit: the sim's hull radius over the model's. */
export const HIVEARK_WORLD_PER_UNIT = ARK_HULL_RADIUS / HIVEARK_MODEL.hullR;

/** On-map size of a cell, screen px, so the art is as wide as the sim's hull. */
export function hiveArkDrawSize(tileSize: number): number {
  const screenPerUnit = HIVEARK_WORLD_PER_UNIT * Math.SQRT2 * isoScale(tileSize).hw;
  return screenPerUnit / HIVEARK_MODEL.scaleFrac;
}

function screenPerUnit(drawSize: number): number {
  return HIVEARK_MODEL.scaleFrac * drawSize;
}

/** Screen offset of the deck point `r` model units out from the middle, `turn` off the bow (toward port), at height z. */
function keelPoint(row: number, r: number, turn: number, z: number, drawSize: number): { dx: number; dy: number; far: number } {
  const yaw = rowYaw(row) + turn;
  const k = screenPerUnit(drawSize);
  const gx = r * Math.cos(yaw);
  const gy = r * Math.sin(yaw);
  return { dx: gx * k, dy: -(gy * Math.sin(Math.PI / 6) + z * COS_CAM) * k, far: gy };
}

export interface ArkLayer {
  layer: "cannon" | "pod";
  /** Cannon or pod index. */
  index: number;
  /** Sheet row to draw (a cannon's own bearing; a pod's Wasp sits along the hull). */
  row: number;
  /** Pivot offset from the ship's screen point, screen px. */
  dx: number;
  dy: number;
  /** A cannon's barrel tip, offset from the ship's screen point, screen px. */
  mx?: number;
  my?: number;
}

/** The cannons and the docked Wasps over the hull, farthest first. */
export function hiveArkLayers(hullFacing: number, cannonFacings: readonly number[], docked: readonly boolean[], drawSize: number, tileSize: number): ArkLayer[] {
  const hullRow = shipRow(hullFacing, tileSize);
  const R = HIVEARK_MODEL.hullR;
  const items: (ArkLayer & { far: number })[] = [];
  ARK_CANNON_AT.forEach((at, i) => {
    const o = keelPoint(hullRow, at * R, 0, HIVEARK_MODEL.cannonZ, drawSize);
    const row = shipRow(cannonFacings[i] ?? hullFacing, tileSize);
    const tip = keelPoint(row, HIVEARK_MODEL.muzzleReach, 0, HIVEARK_MODEL.boreZ, drawSize);
    items.push({ layer: "cannon", index: i, row, dx: o.dx, dy: o.dy, mx: o.dx + tip.dx, my: o.dy + tip.dy, far: o.far });
  });
  docked.forEach((on, i) => {
    if (!on) return;
    // Pod 0 is to port (the model's +y), pod 1 to starboard.
    const o = keelPoint(hullRow, ARK_POD_AT * R, i === 0 ? Math.PI / 2 : -Math.PI / 2, HIVEARK_MODEL.podZ, drawSize);
    items.push({ layer: "pod", index: i, row: hullRow, dx: o.dx, dy: o.dy, far: o.far });
  });
  items.sort((a, b) => b.far - a.far);
  return items.map(({ far: _far, ...l }) => l);
}

/** World point and screen lift of cannon `i`'s muzzle: where the flash goes. */
export function hiveArkMuzzle(
  ark: { x: number; y: number; facing: number },
  i: number,
  cannonFacing: number,
  drawSize: number,
): { x: number; y: number; lift: number } {
  const d = (ARK_CANNON_AT[i] ?? 0) * ARK_HULL_RADIUS;
  const reach = HIVEARK_MODEL.muzzleReach * HIVEARK_WORLD_PER_UNIT;
  return {
    x: ark.x + Math.cos(ark.facing) * d + Math.cos(cannonFacing) * reach,
    y: ark.y + Math.sin(ark.facing) * d + Math.sin(cannonFacing) * reach,
    lift: (HIVEARK_MODEL.cannonZ + HIVEARK_MODEL.boreZ) * COS_CAM * screenPerUnit(drawSize),
  };
}

/**
 * A Hive Ark cannon glowing up for its next ball, at its barrel tip (screen px). `k` is the
 * charge 0–1: the glow swells and brightens, motes stream in to the muzzle, and the pulse
 * quickens as it nears full. `scale` is screen px per world px.
 */
export function drawArkCharge(ctx: CanvasRenderingContext2D, x: number, y: number, k: number, now: number, seed: number, scale: number): void {
  if (k <= 0) return;
  const pulse = 0.5 + 0.5 * Math.sin(now * (0.008 + 0.03 * k) + seed);
  const r = (3 + 9 * k + 1.5 * k * pulse) * scale;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.2);
  g.addColorStop(0, `rgba(240, 255, 245, ${0.35 + 0.6 * k})`);
  g.addColorStop(0.25, `rgba(150, 255, 200, ${0.3 + 0.5 * k})`);
  g.addColorStop(0.6, `rgba(60, 230, 140, ${0.15 + 0.3 * k})`);
  g.addColorStop(1, "rgba(30, 200, 110, 0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r * 2.2, 0, Math.PI * 2);
  ctx.fill();
  // Motes drawn in from all round, faster and thicker as the charge fills.
  const motes = 6;
  const reach = (14 + 10 * k) * scale;
  ctx.fillStyle = `rgba(190, 255, 220, ${0.4 + 0.5 * k})`;
  for (let i = 0; i < motes; i++) {
    const t = ((now * (0.0012 + 0.002 * k) + i / motes + seed * 0.37) % 1 + 1) % 1;
    const a = seed + i * ((Math.PI * 2) / motes) + t * 1.4;
    const d = reach * (1 - t);
    ctx.beginPath();
    ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.7, (0.8 + 1.2 * k) * scale * (0.5 + t), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * A Hive Ark plasma ball in flight: a white-hot core in a big green glow, with a fading tail
 * along the last stretch of its arc (screen points, oldest first; the last is the ball).
 */
export function drawArkPlasmaBall(ctx: CanvasRenderingContext2D, pts: readonly { x: number; y: number }[], now: number, seed: number): void {
  const head = pts[pts.length - 1];
  if (!head) return;
  const r = 7 + Math.sin(now * 0.02 + seed) * 0.8;
  ctx.save();
  ctx.lineCap = "round";
  const tail = pts.slice(-6);
  for (let i = 1; i < tail.length; i++) {
    const a = tail[i - 1]!;
    const b = tail[i]!;
    const k = i / (tail.length - 1);
    ctx.strokeStyle = `rgba(110, 255, 185, ${0.08 + 0.45 * k})`;
    ctx.lineWidth = r * (0.5 + 1.1 * k);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  const g = ctx.createRadialGradient(head.x, head.y, 0, head.x, head.y, r * 2.6);
  g.addColorStop(0, "rgba(250, 255, 250, 1)");
  g.addColorStop(0.3, "rgba(170, 255, 210, 0.95)");
  g.addColorStop(0.65, "rgba(70, 235, 150, 0.55)");
  g.addColorStop(1, "rgba(40, 200, 120, 0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(head.x, head.y, r * 2.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
