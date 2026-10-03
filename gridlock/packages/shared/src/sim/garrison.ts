import {
  catalog,
  fieldSpan,
  GARRISON_STRUCTURAL_CALIBER,
  garrisonAdmits,
  garrisonCapOf,
  garrisonFloorsOf,
  garrisonHpMulOf,
  garrisonWindowsOf,
  garrisonOpenTopOf,
  garrisonWoundMulOf,
  isCivilianType,
  isGarrisonable,
  isInfantryType,
  NEUTRAL_OWNER,
} from "../catalog.js";
import { sightTilesForEntity } from "./elevation.js";
import { takeDamage } from "./crits.js";
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

/**
 * An occupied building: its walls stand in for the soldiers, so light rounds
 * wound them instead of chipping the structure. A hull is not a wall — its
 * armor decides the hit like any other vehicle, and nothing passes inside.
 */
export function wallsShieldGarrison(state: MatchState, e: Entity): boolean {
  return e.kind === "building" && isGarrisonable(e.type) && livingGarrison(state, e).length > 0;
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

/** Eye height for a watcher inside a raised garrison. Undefined when he looks from the street. */
export function occupantEye(state: MatchState, unit: Entity): number | undefined {
  if (unit.garrisonedIn == null) return undefined;
  const house = state.entities.get(unit.garrisonedIn);
  if (!house || house.garrisonHide) return undefined;
  return catalog(house.type).garrisonEye;
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
export function woundGarrison(state: MatchState, house: Entity, incoming: number, caliber = 0, plunging = false): void {
  const units = livingGarrison(state, house);
  if (units.length === 0 || incoming <= 0) return;
  // Fire from overhead drops straight into an open-topped hole; the parapet is no help.
  if (!(plunging && garrisonOpenTopOf(house.type))) incoming *= garrisonWoundMulOf(house.type);
  const heavy = caliber >= GARRISON_STRUCTURAL_CALIBER;
  const primary = units[Math.floor(nextRand(state) * units.length)]!;
  woundOccupant(primary, incoming * (heavy ? 0.5 + nextRand(state) * 0.7 : 0.4 + nextRand(state) * 0.7), state.tick);
  for (const u of units) {
    if (u.id === primary.id || u.hp <= 0) continue;
    if (nextRand(state) > (heavy ? 0.5 : 0.18)) continue;
    woundOccupant(u, incoming * (0.12 + nextRand(state) * (heavy ? 0.45 : 0.25)), state.tick);
  }
}

function woundOccupant(unit: Entity, raw: number, tick: number): void {
  const dmg = Math.max(1, Math.round(raw));
  takeDamage(unit, dmg, tick);
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
  if (!isGarrisonable(house.type) || house.hp <= 0 || house.wreck) return "Cannot enter that.";
  if (!garrisonAdmits(house.type, unit.type)) return `${catalog(unit.type).name} cannot enter the ${catalog(house.type).name}.`;
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
  if (garrisonSpace(state, house) <= 0) return house.kind === "unit" ? `The ${catalog(house.type).name} is full.` : "Building is full.";
  return null;
}

export function approachTile(state: MatchState, house: Entity): { x: number; y: number } | null {
  if (house.kind === "unit") return besideHull(state, house);
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

/**
 * A walkable tile clear of a hull's plate, round the stern and then the sides.
 * Each soldier still aboard shifts the pick one slot, so a squad getting out
 * fans across the back instead of stacking on one tile.
 */
function besideHull(state: MatchState, hull: Entity): { x: number; y: number } | null {
  const ts = state.tileSize;
  // Well clear: a tile or two off the stern is still under the tall casemate on screen.
  const out = hull.radius + 3 * ts;
  const slot = hull.garrison.length;
  for (let i = 0; i < 8; i++) {
    const k = slot + i;
    const turn = Math.ceil(k / 2) * (k % 2 ? 1 : -1) * (Math.PI / 5);
    const ang = hull.facing + Math.PI + turn;
    const tx = worldToTile(hull.x + Math.cos(ang) * out, ts);
    const ty = worldToTile(hull.y + Math.sin(ang) * out, ts);
    if (!inBounds(state, tx, ty)) continue;
    const snap = nearestWalkable(state, tx, ty, "rifleman");
    if (snap && Math.hypot(tileCenter(snap.x, ts) - hull.x, tileCenter(snap.y, ts) - hull.y) > hull.radius) return snap;
  }
  return nearestWalkable(state, worldToTile(hull.x, ts), worldToTile(hull.y, ts), "rifleman");
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
      takeDamage(u, Math.round(u.hpMax * frac), state.tick);
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

export type GarrisonFace = "n" | "e" | "s" | "w";

export interface GarrisonMuzzle {
  x: number;
  y: number;
  face: GarrisonFace;
}

/** Firing openings on every wall. Iso only shows the south (left) and east (right) faces. */
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
    pts.push({ x: x0 + t * bw, y: y0, face: "n" });
    pts.push({ x: x0, y: y0 + t * bh, face: "w" });
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

const FACE_OUT: Record<GarrisonFace, { x: number; y: number }> = {
  n: { x: 0, y: -1 },
  e: { x: 1, y: 0 },
  s: { x: 0, y: 1 },
  w: { x: -1, y: 0 },
};

/**
 * Where a holed-up soldier's round leaves: the opening on the wall that faces
 * the aim point, a hair outside the wall, so the shot never starts inside its
 * own building. Null when the unit is not garrisoned.
 */
export function garrisonMuzzleToward(
  state: MatchState,
  unit: Entity,
  aimX: number,
  aimY: number,
): { x: number; y: number; house: Entity } | null {
  if (unit.garrisonedIn == null) return null;
  const house = state.entities.get(unit.garrisonedIn);
  if (!house) return null;
  const ang = Math.atan2(aimY - house.y, aimX - house.x);
  if (house.kind === "unit") {
    // A hull's slits ring its deck: the round leaves just past the plate on the side that faces the aim.
    const out = house.radius + 4;
    return { x: house.x + Math.cos(ang) * out, y: house.y + Math.sin(ang) * out, house };
  }
  if (house.type === "greatwall") {
    const slit = largeWallSlit(house, aimX, aimY, unit.id);
    return { x: slit.x, y: slit.y, house };
  }
  const w = pickGarrisonMuzzle(house, state.tileSize, ang, unit.id);
  const out = FACE_OUT[w.face];
  return { x: w.x + out.x * 4, y: w.y + out.y * 4, house };
}

/** Screen pixels from the ground to a Large wall slit at zoom 1. */
export const LARGE_WALL_SLIT_LIFT_PX = 30;

/**
 * A firing slit on the face of a Large wall section that looks at the aim, a hair
 * outside the concrete so the round never starts inside its own wall. Each man
 * has his own slit along the section.
 */
export function largeWallSlit(
  wall: { x: number; y: number; facing: number },
  aimX: number,
  aimY: number,
  salt: number,
): { x: number; y: number } {
  const span = fieldSpan("greatwall") ?? { length: 24, thick: 12 };
  const fx = Math.cos(wall.facing);
  const fy = Math.sin(wall.facing);
  const side = (aimX - wall.x) * fx + (aimY - wall.y) * fy >= 0 ? 1 : -1;
  const slot = ((Math.abs(salt) % 2) - 0.5) * 0.5;
  const along = slot * span.length;
  const out = span.thick / 2 + 4;
  return { x: wall.x + fx * side * out - fy * along, y: wall.y + fy * side * out + fx * along };
}

/** Screen-pixel lift from the pad to a glowing window, by story. */
export function garrisonWindowLift(type: Entity["type"], salt: number): number {
  if (type === "greatwall") return LARGE_WALL_SLIT_LIFT_PX;
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
    if (house.kind === "unit") {
      boardHull(state, e, house);
      continue;
    }
    if (adjacentToBuilding(state, e, house)) enterGarrison(state, e, house);
  }
}

/** Side by side with the hull, it climbs in. Otherwise it keeps after it — the hull may be driving. */
function boardHull(state: MatchState, e: Entity, hull: Entity): void {
  const dx = e.x - hull.x;
  const dy = e.y - hull.y;
  const d = Math.hypot(dx, dy);
  if (d <= e.radius + hull.radius + HULL_BOARD_SLACK) {
    enterGarrison(state, e, hull);
    return;
  }
  e.state = "move";
  if (e.waypoints.length > 0 && state.tick % 8 !== 0) return;
  const k = (hull.radius + e.radius + 4) / (d || 1);
  setPath(state, e, hull.x + dx * k, hull.y + dy * k);
}

const HULL_BOARD_SLACK = 10;

/** Soldiers inside a hull ride on it: sight and shots leave from where it is now. */
export function syncHullGarrisons(state: MatchState): void {
  for (const hull of state.entities.values()) {
    if (hull.kind !== "unit" || hull.garrison.length === 0 || !isGarrisonable(hull.type)) continue;
    for (const u of livingGarrison(state, hull)) {
      u.x = hull.x;
      u.y = hull.y;
      u.tileX = hull.tileX;
      u.tileY = hull.tileY;
    }
  }
}

/**
 * The hull is destroyed with them inside. Everyone aboard dies with it and
 * leaves no body in the open. Returns the dead so the reaper can remove them.
 */
export function killGarrison(state: MatchState, hull: Entity): Entity[] {
  const units = livingGarrison(state, hull);
  for (const u of units) {
    u.hp = 0;
    u.state = "dead";
    u.order = null;
    u.waypoints = [];
    u.attackTarget = null;
  }
  hull.garrisonHide = false;
  return units;
}



/**
 * Care inside a building that offers it (the Bunker). A living medic inside
 * slowly heals every occupant; a living engineer inside slowly patches the
 * walls. One of each is enough — more do not stack.
 */
export function tickGarrisonCare(state: MatchState, dt: number): void {
  for (const house of state.entities.values()) {
    if (house.kind !== "building" || house.hp <= 0 || house.garrison.length === 0) continue;
    const def = catalog(house.type);
    const regen = def.garrisonMedicRegen ?? 0;
    const repair = def.garrisonEngineerRepair ?? 0;
    if (regen <= 0 && repair <= 0) continue;
    const units = livingGarrison(state, house);
    if (regen > 0 && units.some((u) => u.type === "medic")) {
      for (const u of units) {
        if (u.hp < u.hpMax) u.hp = Math.min(u.hpMax, u.hp + u.hpMax * regen * dt);
      }
    }
    if (repair > 0 && house.hp < house.hpMax && units.some((u) => u.type === "engineer")) {
      house.hp = Math.min(house.hpMax, house.hp + repair * dt);
    }
  }
}
