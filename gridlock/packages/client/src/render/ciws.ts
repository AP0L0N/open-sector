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

/**
 * One row of a traversing gun sheet over its pad, at world `facing`. The sheet shares the
 * unturned pad's canvas and anchor (`pad`), and may hold one column per man at the gun.
 */
export function drawGunRow(
  ctx: CanvasRenderingContext2D,
  sheet: HTMLImageElement,
  pad: { padWidth: number; padSouthX: number; padSouthY: number },
  southX: number,
  southY: number,
  footprintW: number,
  facing: number,
  tileSize: number,
  col = 0,
  cols = 1,
  alpha = 1,
): void {
  if (!sheet.complete || sheet.naturalWidth <= 0) return;
  const row = ciwsTurretCell(sheet.naturalWidth, sheet.naturalHeight, ciwsTurretRow(facing, tileSize));
  const cw = row.sw / Math.max(1, cols);
  const c = Math.max(0, Math.min(cols - 1, col));
  const scale = footprintW / pad.padWidth;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.drawImage(sheet, cw * c, row.sy, cw, row.sh, southX - pad.padSouthX * scale, southY - pad.padSouthY * scale, cw * scale, row.sh * scale);
  ctx.restore();
}
