/**
 * Hive Ark layout on screen. The hull and cannon layers come from
 * tools/sprites/render_hive_ark.py on one camera and scale, each with the model origin at the
 * same cell point (the Battle Ship's scheme, render/battleship.ts). Each cannon is drawn with
 * its pivot where its barbette projects on the hull face shown; a docked Wasp sits on its pod.
 * The energy dome is drawn here too, as a lit glass bubble over the hull.
 */

import { ARK_CANNON_AT, ARK_HULL_RADIUS, ARK_POD_AT, facingToIso, isoScale } from "@gridlock/shared";
import { rowYaw, shipRow } from "./battleship.js";

/** The render script's numbers (render_hive_ark.py). Model units are 10 m. */
export const HIVEARK_MODEL = {
  hullR: 4.9,
  scaleFrac: (0.0325 * 384) / 256,
  cyFrac: 0.56,
  cell: 256,
  /** Pivot heights, model units: the barbette tops, and the pad tops. */
  cannonZ: 1.72,
  podZ: 1.62,
  /** Barrel tip ahead of the cannon pivot, and bore height over it. */
  muzzleReach: 2.25 * 1.55,
  boreZ: 0.62 * 1.55,
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
}

/** The cannons and the docked Wasps over the hull, farthest first. */
export function hiveArkLayers(hullFacing: number, cannonFacings: readonly number[], docked: readonly boolean[], drawSize: number, tileSize: number): ArkLayer[] {
  const hullRow = shipRow(hullFacing, tileSize);
  const R = HIVEARK_MODEL.hullR;
  const items: (ArkLayer & { far: number })[] = [];
  ARK_CANNON_AT.forEach((at, i) => {
    const o = keelPoint(hullRow, at * R, 0, HIVEARK_MODEL.cannonZ, drawSize);
    items.push({ layer: "cannon", index: i, row: shipRow(cannonFacings[i] ?? hullFacing, tileSize), dx: o.dx, dy: o.dy, far: o.far });
  });
  docked.forEach((on, i) => {
    if (!on) return;
    // Pod 0 is to port (the model's +y), pod 1 to starboard.
    const o = keelPoint(hullRow, ARK_POD_AT * R, i === 0 ? Math.PI / 2 : -Math.PI / 2, HIVEARK_MODEL.podZ, drawSize);
    items.push({ layer: "pod", index: i, row: hullRow, dx: o.dx, dy: o.dy, far: o.far });
  });
  items.sort((a, b) => b.far - a.far);
  return items.map(({ layer, index, row, dx, dy }) => ({ layer, index, row, dx, dy }));
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

/** Screen direction of a world facing, unit length. */
export function isoDir(facing: number, tileSize: number): { x: number; y: number } {
  const d = facingToIso(facing, tileSize);
  const len = Math.hypot(d.x, d.y) || 1;
  return { x: d.x / len, y: d.y / len };
}

/**
 * The energy dome: a glass bubble over the hull, rim on the water. (cx, cy) is the Ark's screen
 * point, rx the dome's screen half-width (the 2:1 ground ellipse is rx by rx/2), `share` its
 * points left, `hit` a round just struck it. The far half is drawn behind the hull by the caller
 * passing `back`, the near half over it.
 */
export function drawArkDome(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  share: number,
  hit: boolean,
  now: number,
  back: boolean,
): void {
  const ry = rx / 2;
  const h = rx * 0.62;
  const pulse = 0.5 + 0.5 * Math.sin(now * 0.004);
  const a = (0.1 + 0.08 * share + (hit ? 0.25 : 0)) * (0.85 + 0.15 * pulse);
  ctx.save();
  ctx.lineJoin = "round";
  if (back) {
    // The far rim on the water and the back of the bubble.
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, Math.PI, Math.PI * 2);
    ctx.strokeStyle = `rgba(110, 255, 190, ${0.25 + 0.2 * share})`;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
    return;
  }
  // The bubble: from the rim up to the crown, a soft green fill brighter at the edge.
  ctx.beginPath();
  ctx.moveTo(cx - rx, cy);
  ctx.bezierCurveTo(cx - rx, cy - h * 1.33, cx + rx, cy - h * 1.33, cx + rx, cy);
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI);
  ctx.closePath();
  const g = ctx.createRadialGradient(cx, cy - h * 0.55, rx * 0.15, cx, cy - h * 0.4, rx * 1.05);
  g.addColorStop(0, `rgba(120, 255, 200, ${a * 0.35})`);
  g.addColorStop(0.75, `rgba(90, 240, 170, ${a})`);
  g.addColorStop(1, `rgba(160, 255, 215, ${a * 1.8})`);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = hit ? "rgba(220, 255, 235, 0.85)" : `rgba(130, 255, 200, ${0.35 + 0.3 * share})`;
  ctx.lineWidth = hit ? 2 : 1.25;
  ctx.stroke();
  // Hex lattice glints: a few arcs across the crown.
  ctx.globalAlpha = 0.25 + 0.2 * share;
  ctx.strokeStyle = "rgba(170, 255, 220, 0.8)";
  ctx.lineWidth = 0.75;
  for (const k of [0.35, 0.7]) {
    ctx.beginPath();
    ctx.ellipse(cx, cy - h * k, rx * Math.sqrt(1 - k * k), ry * Math.sqrt(1 - k * k), 0, 0, Math.PI);
    ctx.stroke();
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
