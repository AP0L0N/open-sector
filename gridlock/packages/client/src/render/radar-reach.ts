/**
 * The reach a selected CIWS, RAM, Flak 37 or Pak 43 ring shows. Client-only; it
 * mirrors the sim's weaponRangeWorld for a pad: catalog reach plus the height bonus
 * on the highest tile under the pad, Max range on top (CIWS and RAM only), and for
 * the CIWS its longer reach on a plane in the air. Day or night, the reach is the same.
 */

import { CIWS_AIR_REACH_MUL, RADAR_LONG_RANGE_MUL, radarLaidOf, rangeTilesOf, type EntityType } from "@gridlock/shared";

/** The long-reach emplaced guns that show their ring like the radar mounts. */
const RING_GUNS: ReadonlySet<EntityType> = new Set<EntityType>(["flak", "pak43"]);

/** A selected building of this type shows its dashed reach ring. */
export function showsReachRing(type: EntityType): boolean {
  return radarLaidOf(type) || RING_GUNS.has(type);
}

export interface RadarReach {
  /** Tiles to anything on the ground. */
  ground: number;
  /** Tiles to a plane in the air. Equal to `ground` except on the CIWS. */
  air: number;
}

/** Highest tile under a footprint, the height the sim gives a building. */
export function footprintPeak(
  heights: ArrayLike<number>,
  width: number,
  height: number,
  tileX: number,
  tileY: number,
  tileW: number,
  tileH: number,
): number {
  let h = 0;
  for (let y = tileY; y < tileY + tileH; y++) {
    for (let x = tileX; x < tileX + tileW; x++) {
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      const t = heights[y * width + x] ?? 0;
      if (t > h) h = t;
    }
  }
  return h;
}

export function radarReachTiles(type: EntityType, peak: number, longRange: boolean): RadarReach {
  const ground = rangeTilesOf(type, peak) * (longRange && radarLaidOf(type) ? RADAR_LONG_RANGE_MUL : 1);
  return { ground, air: ground * (type === "ciws" ? CIWS_AIR_REACH_MUL : 1) };
}
