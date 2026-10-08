import { FEUERWIRBEL_HALF_LENGTH_M, FEUERWIRBEL_MOUNT_AT, catalog, type EntityType } from "../catalog.js";
import type { TwinCiwsMount } from "./types.js";

/** Two mounts laid over the bow, cold, nothing in their sights. */
export function newTwinCiws(facing: number): TwinCiwsMount[] {
  return FEUERWIRBEL_MOUNT_AT.map(() => ({ facing, target: null, cooldown: 0, heat: 0, overheat: 0 }));
}

/**
 * World point of mount `i` on a twin-mount hull: its spot along the keel
 * (FEUERWIRBEL_MOUNT_AT, meters from the centre), scaled so the hull's half
 * length is the sim radius. Rounds leave from here; the client draws the
 * mount's sheet over it.
 */
export function twinCiwsMountPoint(
  e: { x: number; y: number; facing: number; type: EntityType },
  i: number,
): { x: number; y: number } {
  const along = ((FEUERWIRBEL_MOUNT_AT[i] ?? 0) / FEUERWIRBEL_HALF_LENGTH_M) * catalog(e.type).radius;
  return { x: e.x + Math.cos(e.facing) * along, y: e.y + Math.sin(e.facing) * along };
}
