/**
 * Battle Ship layout on screen. The four layers (hull, superstructure, turret,
 * CIWS) come from tools/sprites/render_battleship.py on one camera and scale,
 * each with the model origin at the same cell point. A mount's sheet is drawn
 * with its pivot at the screen point its model position projects to on the
 * hull face being shown, so it stays on its barbette or pedestal at every yaw.
 */

import {
  BATTLESHIP_CIWS_AT,
  BATTLESHIP_HALF_LENGTH,
  BATTLESHIP_TURRET_AT,
  facingToIso,
  isoScale,
  shipMountPoint,
} from "@gridlock/shared";
import { engineRowFromScreen } from "./turntable.js";

/** The render script's numbers (render_battleship.py). Model units are 10 m. */
export const BATTLESHIP_MODEL = {
  halfLength: 13.6,
  scaleFrac: 0.0325,
  cyFrac: 0.56,
  /** Pivot heights, model units. Turret B superfires over A. */
  turretZ: [1.02, 1.6] as const,
  ciwsZ: [2.58, 1.02] as const,
  /** Barrel tip ahead of the turret pivot, barrel spacing, and bore height over the pivot. */
  muzzleReach: 3.0,
  barrelGap: 0.28,
  boreZ: 0.3,
  /** CIWS barrels ahead of the mount pivot, and their height (the mount is drawn 1.3 up). */
  ciwsMuzzleReach: 1.2,
  ciwsBoreZ: 0.5,
  /** Middle of the superstructure, for drawing order against the turrets and the stern mount. */
  superAt: -1.2,
};

const SIN_CAM = Math.sin(Math.PI / 6);
const COS_CAM = Math.cos(Math.PI / 6);

/** World px per model unit: the sim's half-length over the model's. */
export const BATTLESHIP_WORLD_PER_UNIT = BATTLESHIP_HALF_LENGTH / BATTLESHIP_MODEL.halfLength;

/** On-map size of a cell, screen px, so the art is as long as the sim's hull. */
export function battleshipDrawSize(tileSize: number): number {
  // A world px laid along the screen's x axis is √2·hw screen px on the 2:1 map.
  const screenPerUnit = BATTLESHIP_WORLD_PER_UNIT * Math.SQRT2 * isoScale(tileSize).hw;
  return screenPerUnit / BATTLESHIP_MODEL.scaleFrac;
}

/** Screen px per model unit at this draw size. */
export function screenPerUnit(drawSize: number): number {
  return BATTLESHIP_MODEL.scaleFrac * drawSize;
}

/** Sheet row of a world facing on the map. */
export function shipRow(facing: number, tileSize: number): number {
  const d = facingToIso(facing, tileSize);
  return engineRowFromScreen(d.x, d.y);
}

/** The render script's model yaw for sheet row `row` (0 = bow screen-south, clockwise). */
export function rowYaw(row: number): number {
  const phi = Math.PI / 2 + (row * Math.PI) / 8;
  return Math.atan2(-Math.sin(phi) / SIN_CAM, Math.cos(phi));
}

/** Screen offset of model point (x along the keel, z up) on hull row `row`. `far` grows away from the viewer. */
export function modelOffset(row: number, x: number, z: number, drawSize: number): { dx: number; dy: number; far: number } {
  const yaw = rowYaw(row);
  const k = screenPerUnit(drawSize);
  const gx = x * Math.cos(yaw);
  const gy = x * Math.sin(yaw);
  return { dx: gx * k, dy: -(gy * SIN_CAM + z * COS_CAM) * k, far: gy };
}

export interface ShipLayer {
  layer: "super" | "turret" | "ciws";
  /** Sheet row to draw. */
  row: number;
  /** Pivot offset from the ship's screen point, screen px. */
  dx: number;
  dy: number;
}

/**
 * The layers over the hull, back to front. The superstructure, the turrets, and
 * the stern mount go farthest first, but turret A always before B, whose barrels
 * pass over A's roof. The middle mount stands on the island and goes last.
 */
export function battleshipLayers(
  hullFacing: number,
  turretFacings: readonly number[],
  ciwsFacings: readonly number[],
  drawSize: number,
  tileSize: number,
): ShipLayer[] {
  const hullRow = shipRow(hullFacing, tileSize);
  const L = BATTLESHIP_MODEL.halfLength;
  const sup = modelOffset(hullRow, BATTLESHIP_MODEL.superAt, 0, drawSize);
  const items: (ShipLayer & { far: number })[] = [{ layer: "super", row: hullRow, dx: 0, dy: 0, far: sup.far }];
  const turrets = BATTLESHIP_TURRET_AT.map((at, i) => {
    const o = modelOffset(hullRow, at * L, BATTLESHIP_MODEL.turretZ[i] ?? 0, drawSize);
    return { layer: "turret" as const, row: shipRow(turretFacings[i] ?? hullFacing, tileSize), dx: o.dx, dy: o.dy, far: o.far };
  });
  items.push(...turrets);
  const aftAt = BATTLESHIP_CIWS_AT[1] ?? -0.8;
  const aft = modelOffset(hullRow, aftAt * L, BATTLESHIP_MODEL.ciwsZ[1], drawSize);
  items.push({ layer: "ciws", row: shipRow(ciwsFacings[1] ?? hullFacing + Math.PI, tileSize), dx: aft.dx, dy: aft.dy, far: aft.far });
  items.sort((a, b) => b.far - a.far);
  // A before B, in whichever two slots the turrets landed.
  const slots = items.flatMap((it, i) => (it.layer === "turret" ? [i] : []));
  slots.forEach((slot, n) => {
    items[slot] = turrets[n]!;
  });
  const midAt = BATTLESHIP_CIWS_AT[0] ?? 0;
  const mid = modelOffset(hullRow, midAt * L, BATTLESHIP_MODEL.ciwsZ[0], drawSize);
  items.push({ layer: "ciws", row: shipRow(ciwsFacings[0] ?? hullFacing, tileSize), dx: mid.dx, dy: mid.dy, far: mid.far });
  return items.map(({ layer, row, dx, dy }) => ({ layer, row, dx, dy }));
}

/** World point and screen lift of barrel `k` of turret `i`: where the flash and smoke go. */
export function shipBarrelMuzzle(
  ship: { x: number; y: number; facing: number },
  i: number,
  k: number,
  turretFacing: number,
  drawSize: number,
): { x: number; y: number; lift: number } {
  const at = shipMountPoint(ship, BATTLESHIP_TURRET_AT[i] ?? 0);
  const u = BATTLESHIP_WORLD_PER_UNIT;
  const fx = Math.cos(turretFacing);
  const fy = Math.sin(turretFacing);
  const reach = BATTLESHIP_MODEL.muzzleReach * u;
  const side = (k - 1) * BATTLESHIP_MODEL.barrelGap * u;
  const z = (BATTLESHIP_MODEL.turretZ[i] ?? 0) + BATTLESHIP_MODEL.boreZ;
  return {
    x: at.x + fx * reach - fy * side,
    y: at.y + fy * reach + fx * side,
    lift: z * COS_CAM * screenPerUnit(drawSize),
  };
}

/** World point and screen lift of CIWS mount `i`'s barrels. */
export function shipCiwsMuzzle(
  ship: { x: number; y: number; facing: number },
  i: number,
  facing: number,
  drawSize: number,
): { x: number; y: number; lift: number } {
  const at = shipMountPoint(ship, BATTLESHIP_CIWS_AT[i] ?? 0);
  const reach = BATTLESHIP_MODEL.ciwsMuzzleReach * BATTLESHIP_WORLD_PER_UNIT;
  const z = (BATTLESHIP_MODEL.ciwsZ[i] ?? 0) + BATTLESHIP_MODEL.ciwsBoreZ;
  return {
    x: at.x + Math.cos(facing) * reach,
    y: at.y + Math.sin(facing) * reach,
    lift: z * COS_CAM * screenPerUnit(drawSize),
  };
}
