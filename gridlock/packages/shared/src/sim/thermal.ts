import {
  APS_MOVE_MEMORY_SECONDS,
  COMMANDER_APS_RANGE_TILES,
  COMMANDER_SCAN_RANGE_TILES,
  THERMAL_HALF_DEG,
  THERMAL_RANGE_TILES,
  isArmoredType,
  isCyborg,
  isInfantryType,
  secondsToTicks,
} from "../catalog.js";
import type { ThermalContactView } from "../protocol.js";
import { isAirborne } from "./air.js";
import { allies } from "./geo.js";
import { diving } from "./naval.js";
import { canSeeEntity, entityOnMask } from "./vision.js";
import type { Entity, MatchState } from "./types.js";

const THERMAL_HALF = (THERMAL_HALF_DEG * Math.PI) / 180;
const APS_MOVE_MEMORY_TICKS = secondsToTicks(APS_MOVE_MEMORY_SECONDS);

<<<<<<< HEAD
/** A Cyborg whose sensors read: alive, out in the open, and not shut down. */
export function sensorLive(e: Entity): boolean {
  return e.kind === "unit" && isCyborg(e.type) && e.hp > 0 && !e.wreck && !e.shutdown && e.garrisonedIn == null;
=======
/** A Cyborg whose sensors read: on this side, alive, out in the open, and not shut down. */
function sensorLive(state: MatchState, playerId: string, e: Entity): boolean {
  return (
    e.kind === "unit" &&
    isCyborg(e.type) &&
    e.hp > 0 &&
    !e.wreck &&
    !e.shutdown &&
    !e.dormant &&
    e.garrisonedIn == null &&
    allies(state, playerId, e.ownerId)
  );
>>>>>>> worktree-worktree-sim-unit-2
}

/** An armored hull on the ground or the water: what the APS radar can read. */
function apsHull(e: Entity): boolean {
  return e.kind === "unit" && isArmoredType(e.type) && !e.air && !e.drone;
}

/** True while this hull has moved within the last APS_MOVE_MEMORY_SECONDS. */
export function apsMoving(state: MatchState, e: Entity): boolean {
  return e.apsMovedTick != null && state.tick - e.apsMovedTick <= APS_MOVE_MEMORY_TICKS;
}

/** After movement and collision: stamp every armored hull that changed place this tick. */
export function tickThermal(state: MatchState): void {
  for (const e of state.entities.values()) {
    if (!apsHull(e) || e.hp <= 0 || e.wreck) continue;
    const at = e.apsAt;
    if (!at) {
      e.apsAt = { x: e.x, y: e.y };
      continue;
    }
    if (Math.abs(e.x - at.x) > 0.01 || Math.abs(e.y - at.y) > 0.01) {
      e.apsMovedTick = state.tick;
      at.x = e.x;
      at.y = e.y;
    }
  }
}

/** What a contact reads as: a soldier's heat, a moving armored hull on the APS radar, or nothing. */
function contactKind(state: MatchState, e: Entity): "heat" | "armor" | null {
  if (e.kind !== "unit" || e.hp <= 0 || e.wreck || e.garrisonedIn != null || e.drone || isAirborne(e)) return null;
  if (isInfantryType(e.type)) return "heat";
  if (isArmoredType(e.type) && !diving(e) && apsMoving(state, e)) return "armor";
  return null;
}

/** True when this sensor picks the contact up: a Cyborg's forward cone, or all round a Commander. */
export function senses(state: MatchState, sensor: Entity, o: Entity, kind: "heat" | "armor"): boolean {
  const dx = o.x - sensor.x;
  const dy = o.y - sensor.y;
  const d = Math.hypot(dx, dy);
  if (sensor.type === "cyborgcommander") {
    const reach = kind === "armor" ? COMMANDER_APS_RANGE_TILES : COMMANDER_SCAN_RANGE_TILES;
    return d <= reach * state.tileSize;
  }
  if (kind !== "heat" || d > THERMAL_RANGE_TILES * state.tileSize) return false;
  if (d === 0) return true;
  const off = Math.atan2(dy, dx) - sensor.facing;
  return Math.abs(Math.atan2(Math.sin(off), Math.cos(off))) <= THERMAL_HALF;
}

/** The first live sensor on `playerId`'s side that reads `o`, or null. Fog does not matter here. */
export function sensedBy(state: MatchState, playerId: string, o: Entity, sensors?: readonly Entity[]): Entity | null {
  const kind = contactKind(state, o);
  if (!kind || allies(state, playerId, o.ownerId)) return null;
  for (const s of sensors ?? state.entities.values()) {
    if (sensorLive(s) && allies(state, playerId, s.ownerId) && senses(state, s, o, kind)) return s;
  }
  return null;
}

/** Each side's live sensors, gathered once per tick (and again if units came or went). */
const sensorCache = new WeakMap<MatchState, { key: string; bySide: Map<string, Entity[]> }>();

function sideSensors(state: MatchState, playerId: string): Entity[] {
  const key = `${state.tick}:${state.entities.size}`;
  let c = sensorCache.get(state);
  if (!c || c.key !== key) {
    c = { key, bySide: new Map() };
    sensorCache.set(state, c);
  }
  let list = c.bySide.get(playerId);
  if (!list) {
    list = [];
    for (const e of state.entities.values()) if (sensorLive(e) && allies(state, playerId, e.ownerId)) list.push(e);
    c.bySide.set(playerId, list);
  }
  return list;
}

/**
 * True when `e` may take `o` as a target: his side sees it, or he is set to
 * engage contacts and his side's thermal or APS reads it.
 */
export function canEngage(state: MatchState, e: Entity, o: Entity): boolean {
  if (canSeeEntity(state, e.ownerId, o)) return true;
  if (!e.engageContacts) return false;
  const sensors = sideSensors(state, e.ownerId);
  return sensors.length > 0 && sensedBy(state, e.ownerId, o, sensors) != null;
}

/**
 * Enemies this side's Cyborgs pick up that nobody on it sees: soldiers in a
 * Cyborg's thermal cone or round a Commander, and moving armored hulls on a
 * Commander's APS radar. `by` is the sensor that read it. Anything on the fog
 * mask `vis` is already in the snapshot as an entity.
 */
export function thermalContacts(state: MatchState, playerId: string, vis: Uint8Array): ThermalContactView[] {
  const sensors: Entity[] = [];
  for (const e of state.entities.values()) if (sensorLive(e) && allies(state, playerId, e.ownerId)) sensors.push(e);
  if (sensors.length === 0) return [];
  const out: ThermalContactView[] = [];
  for (const o of state.entities.values()) {
    if (o.kind !== "unit") continue;
    const by = sensedBy(state, playerId, o, sensors);
    if (!by) continue;
    if (entityOnMask(o, vis, state.width, state.height, state.tileSize)) continue;
    const c: ThermalContactView = { id: o.id, x: Math.round(o.x), y: Math.round(o.y), by: by.id };
    if (!isInfantryType(o.type)) c.armored = true;
    out.push(c);
  }
  return out;
}
