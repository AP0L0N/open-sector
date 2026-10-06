import { TILE_SUBDIV, type IsoPt } from "@gridlock/shared";

/** World-plane unit vector toward the sun: screen upper-left in 2:1 iso. */
const SUN_X = -0.949;
const SUN_Y = -0.316;
/** Brightness per elevation unit of slope facing (or turned from) the sun. */
const HILLSHADE_PER_UNIT = 0.32;
const HILLSHADE_MAX = 0.45;

/**
 * Directional light from the four vertex heights. Slopes rising away from the
 * sun catch it; slopes falling away go dark. Flat ground returns 1.
 */
export function hillshadeFactor(nH: number, eH: number, sH: number, wH: number): number {
  return hillshadeGradient((eH + sH - nH - wH) / 2, (sH + wH - nH - eH) / 2);
}

/** Same light from a height gradient in elevation units per tile along world x and y. */
export function hillshadeGradient(gx: number, gy: number): number {
  const lit = -(gx * SUN_X + gy * SUN_Y) * HILLSHADE_PER_UNIT;
  return 1 + Math.max(-HILLSHADE_MAX, Math.min(HILLSHADE_MAX, lit));
}

/** Contour every authoring terrace so a player can count steps up a hill. */
export const CONTOUR_STEP = TILE_SUBDIV;

/**
 * Screen segments where a terrace level crosses this tile (marching squares
 * on the vertex heights). Points come in pairs.
 */
export function contourSegments(
  pts: readonly [IsoPt, IsoPt, IsoPt, IsoPt],
  hs: readonly [number, number, number, number],
  step = CONTOUR_STEP,
): IsoPt[] {
  const lo = Math.min(...hs);
  const hi = Math.max(...hs);
  const out: IsoPt[] = [];
  for (let level = Math.floor(lo / step + 1) * step; level <= hi; level += step) {
    const cross: IsoPt[] = [];
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      const a = hs[i]!;
      const b = hs[j]!;
      if ((a < level) === (b < level)) continue;
      const t = (level - a) / (b - a);
      cross.push({ x: pts[i]!.x + (pts[j]!.x - pts[i]!.x) * t, y: pts[i]!.y + (pts[j]!.y - pts[i]!.y) * t });
    }
    for (let k = 0; k + 1 < cross.length; k += 2) out.push(cross[k]!, cross[k + 1]!);
  }
  return out;
}
