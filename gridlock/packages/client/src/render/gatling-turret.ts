/**
 * Feuerwirbel twin gatlings: where the two barrels end on screen, for the muzzle
 * flash and the tracers. The turret turns on the model origin
 * (tools/sprites/render_feuerwirbel.py), so the pivot sits at one point of the
 * cell at every hull yaw. Fractions are measured on the composed sheet.
 */
import type { GatlingMuzzle } from "./gatling-flash.js";

/** Barrel height above the ground point, as a share of the drawn cell. */
export const TWIN_GATLING_LIFT = 0.402;
/** Pivot to muzzle, as a share of the drawn cell, when the barrels lie across the screen. */
export const TWIN_GATLING_REACH = 0.416;
/** Each barrel cluster off the centre line, as a share of the drawn cell, across the barrels. */
export const TWIN_GATLING_SIDE = 0.048;

/** The bow flame projector's tip: height above the ground point and reach off the pivot, shares of the drawn cell. */
export const BOW_NOZZLE_LIFT = 0.328;
export const BOW_NOZZLE_REACH = 0.45;

/** World direction to screen, depth halved like the map. Length 1 across the screen. */
function isoDir(angle: number): { x: number; y: number } {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: (c - s) / Math.SQRT2, y: (c + s) / (2 * Math.SQRT2) };
}

/** Both muzzles for a turret laid on world `facing`. `contactY` is the sprite's ground point after its sink. */
export function twinGatlingMuzzles(contactX: number, contactY: number, size: number, facing: number): GatlingMuzzle[] {
  const f = isoDir(facing);
  const r = isoDir(facing + Math.PI / 2);
  const len = Math.hypot(f.x, f.y) || 1;
  const baseX = contactX + f.x * TWIN_GATLING_REACH * size;
  const baseY = contactY - TWIN_GATLING_LIFT * size + f.y * TWIN_GATLING_REACH * size;
  return [1, -1].map((side) => ({
    x: baseX + r.x * TWIN_GATLING_SIDE * size * side,
    y: baseY + r.y * TWIN_GATLING_SIDE * size * side,
    dirX: f.x / len,
    dirY: f.y / len,
  }));
}

/** Screen point of the bow projector tip for a hull on world `facing`. */
export function bowNozzle(contactX: number, contactY: number, size: number, facing: number): { x: number; y: number } {
  const f = isoDir(facing);
  return { x: contactX + f.x * BOW_NOZZLE_REACH * size, y: contactY - BOW_NOZZLE_LIFT * size + f.y * BOW_NOZZLE_REACH * size };
}
