import {
  COMMANDER_SCAN_RANGE_TILES,
  THERMAL_HALF_DEG,
  THERMAL_RANGE_TILES,
  isArmoredType,
  isCyborg,
  isInfantryType,
} from "../catalog.js";
import type { ThermalContactView } from "../protocol.js";
import { isAirborne } from "./air.js";
import { allies } from "./geo.js";
import { diving } from "./naval.js";
import { entityOnMask } from "./vision.js";
import type { Entity, MatchState } from "./types.js";

const THERMAL_HALF = (THERMAL_HALF_DEG * Math.PI) / 180;

/** A Cyborg whose sensors read: on this side, alive, out in the open, and not shut down. */
function sensorLive(state: MatchState, playerId: string, e: Entity): boolean {
  return (
    e.kind === "unit" &&
    isCyborg(e.type) &&
    e.hp > 0 &&
    !e.wreck &&
    !e.shutdown &&
    e.garrisonedIn == null &&
    allies(state, playerId, e.ownerId)
  );
}

/** What a contact reads as: a soldier's heat, an armored hull on the APS radar, or nothing. */
function contactKind(e: Entity): "heat" | "armor" | null {
  if (e.hp <= 0 || e.wreck || e.garrisonedIn != null || e.drone || isAirborne(e)) return null;
  if (e.kind !== "unit") return null;
  if (isInfantryType(e.type)) return "heat";
  if (isArmoredType(e.type) && !diving(e)) return "armor";
  return null;
}

/** True when this sensor picks the contact up: a Cyborg's forward cone, or all round a Commander. */
export function senses(state: MatchState, sensor: Entity, o: Entity, kind: "heat" | "armor"): boolean {
  const dx = o.x - sensor.x;
  const dy = o.y - sensor.y;
  const d = Math.hypot(dx, dy);
  if (sensor.type === "cyborgcommander") return d <= COMMANDER_SCAN_RANGE_TILES * state.tileSize;
  if (kind !== "heat" || d > THERMAL_RANGE_TILES * state.tileSize) return false;
  if (d === 0) return true;
  const off = Math.atan2(dy, dx) - sensor.facing;
  return Math.abs(Math.atan2(Math.sin(off), Math.cos(off))) <= THERMAL_HALF;
}

/**
 * Enemies this side's Cyborgs pick up that nobody on it sees: soldiers in a
 * Cyborg's thermal cone or round a Commander, and armored hulls on a
 * Commander's APS radar. Anything on the fog mask `vis` is already in the
 * snapshot as an entity.
 */
export function thermalContacts(state: MatchState, playerId: string, vis: Uint8Array): ThermalContactView[] {
  const sensors: Entity[] = [];
  for (const e of state.entities.values()) if (sensorLive(state, playerId, e)) sensors.push(e);
  if (sensors.length === 0) return [];
  const out: ThermalContactView[] = [];
  for (const o of state.entities.values()) {
    const kind = contactKind(o);
    if (!kind || allies(state, playerId, o.ownerId)) continue;
    if (entityOnMask(o, vis, state.width, state.height, state.tileSize)) continue;
    if (!sensors.some((s) => senses(state, s, o, kind))) continue;
    const c: ThermalContactView = { id: o.id, x: Math.round(o.x), y: Math.round(o.y) };
    if (kind === "armor") c.armored = true;
    out.push(c);
  }
  return out;
}
