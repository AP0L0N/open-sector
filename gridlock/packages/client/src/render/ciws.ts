/**
 * CIWS gun on its pad. The base is an ordinary building sprite; the gun is a
 * 16-row sheet on the same canvas and anchor (tools/sprites/render_ciws.py,
 * ciws.json). Row 0 is screen south, then clockwise, like a unit turret.
 */
import { engineRowFromProjectedFacing } from "./turntable.js";

export const CIWS_ROWS = 16;
/** World px from the plinth centre to the muzzle clamp, and the barrels' height. */
export const CIWS_MUZZLE_REACH = 16.3;
export const CIWS_MUZZLE_Z = 9.2;
/** Screen px above the ground a rocket burst by a CIWS is drawn. Rockets fly low and flat. */
export const CIWS_INTERCEPT_LIFT = 18;
/** Source px per world px on the CIWS sheets (render_ciws.py ZOOM). */
export const CIWS_SOURCE_ZOOM = 3;

/** Sheet row the gun draws at this world facing. */
export function ciwsTurretRow(turretFacing: number, tileSize: number): number {
  return engineRowFromProjectedFacing(turretFacing, tileSize) % CIWS_ROWS;
}

/** Source rect of one row. Every row is the base image's size. */
export function ciwsTurretCell(
  sheetW: number,
  sheetH: number,
  row: number,
): { sx: number; sy: number; sw: number; sh: number } {
  const sh = sheetH / CIWS_ROWS;
  const r = ((row % CIWS_ROWS) + CIWS_ROWS) % CIWS_ROWS;
  return { sx: 0, sy: r * sh, sw: sheetW, sh };
}

/** Screen px the barrels sit above the ground point, at this sprite scale (screen px per source px). */
export function ciwsMuzzleLift(scale: number): number {
  return CIWS_MUZZLE_Z * CIWS_SOURCE_ZOOM * scale;
}
