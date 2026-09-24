/**
 * Painter layer for a fallen soldier and the blood under the body.
 * Craters use HOLE_DRAW_LAYER so a scar always paints under trees, fences,
 * and buildings. Other props use 0. Units, track dirt, and muzzle smoke use
 * 1 via `MapView.drawLayer`. Intact sandbags use 2 so the wall paints over
 * the soldiers behind it. Remains sit between props and units, so a hull
 * always paints over a body it rolls across.
 */
export const HOLE_DRAW_LAYER = -1;
export const CORPSE_DRAW_LAYER = 0.5;

/** Same order as `MapView.draw`: layer first, then south-east ground depth. */
export function compareDrawOrder(a: { layer: number; z: number }, b: { layer: number; z: number }): number {
  return a.layer - b.layer || a.z - b.z;
}
