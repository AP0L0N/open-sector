import { isRadarStation, RADAR_RANGE_TILES } from "../catalog.js";
import type { RadarContactView } from "../protocol.js";
import { isAirborne } from "./air.js";
import { allies } from "./geo.js";
import { entityOnMask } from "./vision.js";
import type { Entity, MatchState } from "./types.js";

/** A Radar Station (or Xenomorph Neural Nexus) this side reads: allied, standing, not a wreck. */
function radarStands(state: MatchState, playerId: string, e: Entity): boolean {
  return isRadarStation(e.type) && e.kind === "building" && e.hp > 0 && !e.wreck && allies(state, playerId, e.ownerId);
}

/** Radar Stations whose sweep this side reads. */
export function radarStations(state: MatchState, playerId: string): Entity[] {
  const out: Entity[] = [];
  for (const e of state.entities.values()) if (radarStands(state, playerId, e)) out.push(e);
  return out;
}

/** True while a Radar Station stands on this side. The command bar's radar panel paints only then. */
export function radarOnline(state: MatchState, playerId: string): boolean {
  for (const e of state.entities.values()) if (radarStands(state, playerId, e)) return true;
  return false;
}

/** Something the sweep returns: a plane or a drone in the air. A parked plane is a ground target. */
function radarTarget(e: Entity): boolean {
  return e.hp > 0 && !e.wreck && !!e.air && isAirborne(e);
}

/**
 * Enemy aircraft the radar hears but nobody on this side sees: in the air,
 * inside RADAR_RANGE_TILES of a standing allied station, and off the fog
 * mask `vis`. Anything on the mask is already in the snapshot as an entity.
 */
export function radarContacts(state: MatchState, playerId: string, vis: Uint8Array): RadarContactView[] {
  const stations = radarStations(state, playerId);
  if (stations.length === 0) return [];
  const reach = RADAR_RANGE_TILES * state.tileSize;
  const out: RadarContactView[] = [];
  for (const e of state.entities.values()) {
    if (!radarTarget(e) || allies(state, playerId, e.ownerId)) continue;
    if (entityOnMask(e, vis, state.width, state.height, state.tileSize)) continue;
    if (!stations.some((s) => Math.hypot(e.x - s.x, e.y - s.y) <= reach)) continue;
    out.push({ id: e.id, x: e.x, y: e.y });
  }
  return out;
}
