import {
  catalog,
  GARRISON_STRUCTURAL_CALIBER,
  garrisonCapOf,
  garrisonFloorsOf,
  garrisonHpMulOf,
  garrisonWindowsOf,
  isCivilianType,
  isGarrisonable,
  isInfantryType,
  NEUTRAL_OWNER,
} from "../catalog.js";
import { sightTilesForEntity } from "./elevation.js";
import { nextRand } from "./rng.js";
import { adjacentToBuilding, allies, inBounds, nearestWalkable, tileCenter, worldToTile } from "./geo.js";
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

export function garrisonIsHostile(state: MatchState, ownerId: string, house: Entity): boolean {
  const occ = livingGarrison(state, house);
  if (occ.length === 0) return false;
  return !allies(state, ownerId, occ[0]!.ownerId);
}

/** True occupancy that enemies can read. Hidden garrisons look empty. */
export function garrisonLooksOccupied(state: MatchState, viewerId: string, house: Entity): boolean {
  const occ = livingGarrison(state, house);
  if (occ.length === 0) return false;
  if (house.garrisonHide && !allies(state, viewerId, occ[0]!.ownerId)) return false;
  return true;
}

export function garrisonIsHiding(state: MatchState, unit: Entity): boolean {
  if (unit.garrisonedIn == null) return false;
  return !!state.entities.get(unit.garrisonedIn)?.garrisonHide;
}

/** Sight radius for a unit inside a house. Undefined if the unit is not garrisoned. */
export function occupantSightTiles(state: MatchState, unit: Entity): number | undefined {
  if (unit.garrisonedIn == null) return undefined;
  if (!state.entities.get(unit.garrisonedIn)) return undefined;
  return sightTilesForEntity(state, unit);
}

export function setGarrisonHide(state: MatchState, house: Entity, hide: boolean): void {
  house.garrisonHide = hide;
  state.visionTick = -1;
  if (!hide) return;
  for (const u of livingGarrison(state, house)) {
    u.attackTarget = null;
    if (u.order?.kind === "attack" || u.order?.kind === "attackmove" || u.order?.kind === "forceattack") {
      u.order = null;
    }
    u.state = "garrison";
  }
}

/** Empty civilian houses are always neutral. Anyone may enter. */
function vacateIfEmpty(state: MatchState, house: Entity): void {
  if (livingGarrison(state, house).length > 0) return;
  let dirty = false;
  if (house.garrisonHide) {
    house.garrisonHide = false;
    dirty = true;
  }
  if (isCivilianType(house.type)) {
    if (house.ownerId !== NEUTRAL_OWNER) {
      house.ownerId = NEUTRAL_OWNER;
      dirty = true;
    }
    house.captureOwnerId = "";
    house.captureProgress = 0;
  }
  if (dirty) state.visionTick = -1;
}

function scaleGarrisonHp(unit: Entity, house: Entity): void {
  const mul = garrisonHpMulOf(house.type);
  const base = catalog(unit.type).hp;
  const ratio = unit.hpMax > 0 ? unit.hp / unit.hpMax : 1;
  unit.hpMax = Math.max(1, Math.round(base * mul));
  unit.hp = Math.max(0, Math.round(unit.hpMax * ratio));
}

function unscaleGarrisonHp(unit: Entity): void {
  const base = catalog(unit.type).hp;
  if (unit.hpMax === base) return;
  const ratio = unit.hpMax > 0 ? unit.hp / unit.hpMax : 0;
  unit.hpMax = base;
  unit.hp = unit.hp <= 0 ? 0 : Math.max(1, Math.min(base, Math.round(base * ratio)));
}

/** Occupant HP for the building snapshot. Sorted by id so bars do not shuffle. */
export function garrisonBars(state: MatchState, house: Entity): { hp: number; hpMax: number }[] {
  return livingGarrison(state, house)
    .slice()
    .sort((a, b) => a.id - b.id)
    .map((u) => ({ hp: u.hp, hpMax: u.hpMax }));
}

/** Drop a dead occupant from the house without spilling the rest. */
export function detachGarrisoned(state: MatchState, unit: Entity): void {
  if (unit.garrisonedIn == null) return;
  const house = state.entities.get(unit.garrisonedIn);
  if (house) {
    house.garrison = house.garrison.filter((id) => id !== unit.id);
    vacateIfEmpty(state, house);
  }
  unscaleGarrisonHp(unit);
  unit.garrisonedIn = null;
}

/**
 * Incoming fire through the walls. A random occupant eats most of the hit;
 * others may catch splinters. Heavy calibers wound more of the stack.
 */
export function woundGarrison(state: MatchState, house: Entity, incoming: number, caliber = 0): void {
  const units = livingGarrison(state, house);
  if (units.length === 0 || incoming <= 0) return;
  const heavy = caliber >= GARRISON_STRUCTURAL_CALIBER;
  const primary = units[Math.floor(nextRand(state) * units.length)]!;
  woundOccupant(primary, incoming * (heavy ? 0.5 + nextRand(state) * 0.7 : 0.4 + nextRand(state) * 0.7));
  for (const u of units) {
    if (u.id === primary.id || u.hp <= 0) continue;
    if (nextRand(state) > (heavy ? 0.5 : 0.18)) continue;
    woundOccupant(u, incoming * (0.12 + nextRand(state) * (heavy ? 0.45 : 0.25)));
  }
}

function woundOccupant(unit: Entity, raw: number): void {
  const dmg = Math.max(1, Math.round(raw));
  unit.hp = Math.max(0, unit.hp - dmg);
  if (unit.hp > 0) return;
  unit.state = "dead";
  unit.order = null;
  unit.waypoints = [];
  unit.attackTarget = null;
}

export function garrisonSpace(state: MatchState, house: Entity): number {
  return Math.max(0, garrisonCapOf(house.type) - livingGarrison(state, house).length);
}

export function canGarrison(state: MatchState, unit: Entity, house: Entity): string | null {
  if (!isInfantryType(unit.type) || unit.kind !== "unit" || unit.wreck) return "Only infantry can garrison.";
  if (!isGarrisonable(house.type) || house.kind !== "building" || house.hp <= 0) return "Cannot enter that.";
  const occ = garrisonOwner(state, house);
  if (occ && occ !== NEUTRAL_OWNER && !allies(state, unit.ownerId, occ)) return "Held by the enemy.";
  if (
    !isCivilianType(house.type) &&
    house.ownerId &&
    house.ownerId !== NEUTRAL_OWNER &&
    !allies(state, unit.ownerId, house.ownerId)
  ) {
    return "Held by the enemy.";
  }
  if (garrisonSpace(state, house) <= 0) return "Building is full.";
  return null;
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
    const snap = nearestWalkable(state, t.x, t.y, "rifleman");
    if (snap) return snap;
  }
  return nearestWalkable(state, house.tileX, house.tileY, "rifleman");
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
  if (isCivilianType(house.type)) {
    house.ownerId = NEUTRAL_OWNER;
    house.captureOwnerId = "";
    house.captureProgress = 0;
  }
  scaleGarrisonHp(unit, house);
  return true;
}

export function exitGarrison(
  state: MatchState,
  unit: Entity,
  dest?: { x: number; y: number },
): void {
  const house = unit.garrisonedIn != null ? state.entities.get(unit.garrisonedIn) : undefined;
  unscaleGarrisonHp(unit);
  unit.garrisonedIn = null;
  unit.state = "idle";
  if (house) {
    house.garrison = house.garrison.filter((id) => id !== unit.id);
    vacateIfEmpty(state, house);
  }
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
export function spillGarrison(state: MatchState, house: Entity, opts?: { damage?: boolean }): void {
  const units = livingGarrison(state, house);
  house.garrison = [];
  house.garrisonHide = false;
  const hurt = opts?.damage !== false;
  for (const u of units) {
    unscaleGarrisonHp(u);
    u.garrisonedIn = null;
    if (hurt) {
      const frac = nextRand(state);
      u.hp = Math.max(0, u.hp - Math.round(u.hpMax * frac));
    }
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
  vacateIfEmpty(state, house);
}

export type GarrisonFace = "e" | "s";

export interface GarrisonMuzzle {
  x: number;
  y: number;
  face: GarrisonFace;
}

/** Visible-wall windows. Iso shows the south (left) and east (right) faces. */
export function garrisonWindows(house: Entity, tileSize: number): GarrisonMuzzle[] {
  const x0 = house.tileX * tileSize;
  const y0 = house.tileY * tileSize;
  const bw = house.tileW * tileSize;
  const bh = house.tileH * tileSize;
  const n = garrisonWindowsOf(house.type);
  const pts: GarrisonMuzzle[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i + 1) / (n + 1);
    pts.push({ x: x0 + t * bw, y: y0 + bh, face: "s" });
    pts.push({ x: x0 + bw, y: y0 + t * bh, face: "e" });
  }
  return pts;
}

/** Pick a window on the wall facing the shot. */
export function pickGarrisonMuzzle(house: Entity, tileSize: number, ang: number, salt = 0): GarrisonMuzzle {
  const dx = Math.cos(ang);
  const dy = Math.sin(ang);
  const pts = garrisonWindows(house, tileSize);
  const cx = house.x;
  const cy = house.y;
  let best = pts[0] ?? { x: house.x, y: house.y, face: "e" as const };
  let bestScore = -Infinity;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    const fx = p.x - cx;
    const fy = p.y - cy;
    const fl = Math.hypot(fx, fy) || 1;
    const align = (fx / fl) * dx + (fy / fl) * dy;
    const jitter = ((Math.imul(salt + i * 19, 1103515245) >>> 0) % 100) / 400;
    const score = align + jitter;
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return best;
}

/** Screen-pixel lift from the pad to a glowing window, by story. */
export function garrisonWindowLift(type: Entity["type"], salt: number): number {
  const floors = Math.max(1, garrisonFloorsOf(type));
  const floor = ((salt % floors) + floors) % floors;
  const base = floors >= 3 ? 24 : floors === 2 ? 22 : 20;
  return base + floor * 26;
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
    if (adjacentToBuilding(state, e, house)) enterGarrison(state, e, house);
  }
}


