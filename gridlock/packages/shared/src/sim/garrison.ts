import {
  garrisonCapOf,
  isGarrisonable,
  isInfantryType,
  NEUTRAL_OWNER,
} from "../catalog.js";
import { nextRand } from "./rng.js";
import { allies, chebyshev, footprint, inBounds, nearestWalkable, tileCenter, worldToTile } from "./geo.js";
import { setPath } from "./path.js";
import type { Entity, MatchState } from "./types.js";

export function livingGarrison(state: MatchState, house: Entity): Entity[] {
  const out: Entity[] = [];
  for (const id of house.garrison) {
    const u = state.entities.get(id);
    if (u && u.hp > 0 && u.garrisonedIn === house.id) out.push(u);
  }
  return out;
}

export function garrisonOwner(state: MatchState, house: Entity): string {
  return livingGarrison(state, house)[0]?.ownerId ?? NEUTRAL_OWNER;
}

export function garrisonSpace(state: MatchState, house: Entity): number {
  return Math.max(0, garrisonCapOf(house.type) - livingGarrison(state, house).length);
}

export function canGarrison(state: MatchState, unit: Entity, house: Entity): string | null {
  if (!isInfantryType(unit.type) || unit.kind !== "unit" || unit.wreck) return "Only infantry can garrison.";
  if (!isGarrisonable(house.type) || house.kind !== "building" || house.hp <= 0) return "Cannot enter that.";
  const occ = garrisonOwner(state, house);
  if (occ && occ !== NEUTRAL_OWNER && !allies(state, unit.ownerId, occ)) return "Held by the enemy.";
  if (garrisonSpace(state, house) <= 0) return "Building is full.";
  return null;
}

function adjacentToHouse(state: MatchState, unit: Entity, house: Entity): boolean {
  const tx = worldToTile(unit.x, state.tileSize);
  const ty = worldToTile(unit.y, state.tileSize);
  for (const t of footprint(house.tileX, house.tileY, house.tileW, house.tileH)) {
    if (chebyshev(tx, ty, t.x, t.y) <= 1) return true;
  }
  return false;
}

export function approachTile(state: MatchState, house: Entity): { x: number; y: number } | null {
  const ring: { x: number; y: number }[] = [];
  for (let y = house.tileY - 1; y <= house.tileY + house.tileH; y++) {
    for (let x = house.tileX - 1; x <= house.tileX + house.tileW; x++) {
      const onEdge =
        x === house.tileX - 1 ||
        y === house.tileY - 1 ||
        x === house.tileX + house.tileW ||
        y === house.tileY + house.tileH;
      if (!onEdge) continue;
      if (!inBounds(state, x, y)) continue;
      ring.push({ x, y });
    }
  }
  for (const t of ring) {
    const snap = nearestWalkable(state, t.x, t.y, "trooper");
    if (snap) return snap;
  }
  return nearestWalkable(state, house.tileX, house.tileY, "trooper");
}

export function enterGarrison(state: MatchState, unit: Entity, house: Entity): boolean {
  if (canGarrison(state, unit, house)) return false;
  unit.garrisonedIn = house.id;
  if (!house.garrison.includes(unit.id)) house.garrison.push(unit.id);
  unit.x = house.x;
  unit.y = house.y;
  unit.tileX = house.tileX;
  unit.tileY = house.tileY;
  unit.waypoints = [];
  unit.order = null;
  unit.attackTarget = null;
  unit.harvestTile = null;
  unit.state = "garrison";
  return true;
}

export function exitGarrison(
  state: MatchState,
  unit: Entity,
  dest?: { x: number; y: number },
): void {
  const house = unit.garrisonedIn != null ? state.entities.get(unit.garrisonedIn) : undefined;
  unit.garrisonedIn = null;
  unit.state = "idle";
  if (house) house.garrison = house.garrison.filter((id) => id !== unit.id);
  const near = house
    ? approachTile(state, house)
    : nearestWalkable(state, worldToTile(unit.x, state.tileSize), worldToTile(unit.y, state.tileSize), unit.type);
  if (near) {
    unit.x = tileCenter(near.x, state.tileSize);
    unit.y = tileCenter(near.y, state.tileSize);
    unit.tileX = near.x;
    unit.tileY = near.y;
  }
  if (dest) {
    unit.order = { kind: "move", x: dest.x, y: dest.y };
    unit.state = "move";
    setPath(state, unit, dest.x, dest.y);
  }
}

/** House destroyed: occupants take 0–100% of max HP, then spill onto the street. */
export function spillGarrison(state: MatchState, house: Entity): void {
  const units = livingGarrison(state, house);
  house.garrison = [];
  for (const u of units) {
    u.garrisonedIn = null;
    const frac = nextRand(state);
    u.hp = Math.max(0, u.hp - Math.round(u.hpMax * frac));
    u.order = null;
    u.waypoints = [];
    u.attackTarget = null;
    u.state = u.hp > 0 ? "idle" : "dead";
    const snap = approachTile(state, house);
    if (snap) {
      u.x = tileCenter(snap.x, state.tileSize);
      u.y = tileCenter(snap.y, state.tileSize);
      u.tileX = snap.x;
      u.tileY = snap.y;
    }
  }
}

export function tickGarrison(state: MatchState): void {
  for (const e of state.entities.values()) {
    if (e.kind !== "unit" || e.hp <= 0 || e.garrisonedIn) continue;
    if (e.order?.kind !== "garrison" || e.order.targetId == null) continue;
    const house = state.entities.get(e.order.targetId);
    if (!house || house.hp <= 0 || !isGarrisonable(house.type)) {
      e.order = null;
      e.state = "idle";
      continue;
    }
    if (canGarrison(state, e, house)) {
      e.order = null;
      e.waypoints = [];
      e.state = "idle";
      continue;
    }
    if (adjacentToHouse(state, e, house)) enterGarrison(state, e, house);
  }
}


