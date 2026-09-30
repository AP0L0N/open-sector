/**
 * Apocalypse roof CIWS: where its barrels end on screen, for the muzzle flash.
 * The mount turns on the turret's own axis (tools/sprites/render_apocalypse.py),
 * so the pivot sits straight above the contact point at every hull yaw.
 */
import type { GatlingMuzzle } from "./gatling-flash.js";

/** Barrel height above the ground point, as a share of the drawn cell (composed sheet, render_apocalypse.py). */
export const ROOF_CIWS_LIFT = 0.383;
/** Pivot to muzzle, as a share of the drawn cell, when the barrels lie across the screen. */
export const ROOF_CIWS_REACH = 0.167;

/**
 * Screen muzzle for a roof mount at world `facing`. `contactY` is the sprite's
 * ground point after its sink. Depth halves on screen, like the map.
 */
export function roofCiwsMuzzle(contactX: number, contactY: number, size: number, facing: number): GatlingMuzzle {
  const c = Math.cos(facing);
  const s = Math.sin(facing);
  const ix = (c - s) / Math.SQRT2;
  const iy = (c + s) / (2 * Math.SQRT2);
  const len = Math.hypot(ix, iy) || 1;
  return {
    x: contactX + ix * ROOF_CIWS_REACH * size,
    y: contactY - ROOF_CIWS_LIFT * size + iy * ROOF_CIWS_REACH * size,
    dirX: ix / len,
    dirY: iy / len,
  };
}
