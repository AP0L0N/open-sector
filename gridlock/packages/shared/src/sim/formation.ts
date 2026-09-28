import { catalog, isArmoredType, isInfantryType, UNIT_SPACE_PAD, type EntityType } from "../catalog.js";
import { moveSpeedMul } from "./crits.js";
import { allies, walkable, worldToTile } from "./geo.js";
import type { Entity, MatchState, Vec } from "./types.js";

const SEARCH_STEP = 4;

export function unitClearance(radiusA: number, radiusB: number): number {
  return radiusA + radiusB + UNIT_SPACE_PAD;
}

function occupied(ax: number, ay: number, ar: number, bx: number, by: number, br: number): boolean {
  const min = unitClearance(ar, br);
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy < min * min;
}

function inWorld(state: MatchState, x: number, y: number): boolean {
  const ts = state.tileSize;
  return x >= 0 && y >= 0 && x < state.width * ts && y < state.height * ts;
}

function tileWalkable(state: MatchState, x: number, y: number, type?: EntityType): boolean {
  const ts = state.tileSize;
  const tx = worldToTile(x, ts);
  const ty = worldToTile(y, ts);
  return walkable(state, tx, ty, type);
}

function isClear(
  state: MatchState,
  x: number,
  y: number,
  radius: number,
  placed: readonly { x: number; y: number; radius: number }[],
  type?: EntityType,
): boolean {
  if (!inWorld(state, x, y)) return false;
  if (!tileWalkable(state, x, y, type)) return false;
  for (const p of placed) {
    if (occupied(x, y, radius, p.x, p.y, p.radius)) return false;
  }
  return true;
}

function nearestClear(
  state: MatchState,
  x: number,
  y: number,
  radius: number,
  placed: readonly { x: number; y: number; radius: number }[],
  type?: EntityType,
): Vec {
  if (isClear(state, x, y, radius, placed, type)) return { x, y };

  const maxR = Math.max(state.width, state.height) * state.tileSize;
  for (let rad = SEARCH_STEP; rad < maxR; rad += SEARCH_STEP) {
    const n = Math.max(8, Math.round((Math.PI * 2 * rad) / SEARCH_STEP));
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n;
      const px = x + Math.cos(a) * rad;
      const py = y + Math.sin(a) * rad;
      if (isClear(state, px, py, radius, placed, type)) return { x: px, y: py };
    }
  }
  return { x, y };
}

/**
 * Slowest catalog speed in a mixed selection. Undefined for a solo unit or
 * when every walker already shares the same speed.
 */
export function groupMovePace(units: readonly Entity[]): number | undefined {
  if (units.length < 2) return undefined;
  let min = Infinity;
  let max = 0;
  for (const e of units) {
    const tiles = catalog(e.type).moveTilesPerSec;
    if (tiles <= 0 || moveSpeedMul(e) <= 0) continue;
    if (tiles < min) min = tiles;
    if (tiles > max) max = tiles;
  }
  if (!Number.isFinite(min) || min >= max) return undefined;
  return min;
}

type Spot = { x: number; y: number; radius: number; givesWay: boolean };

const CLAIM_REACH_TILES = 32;

/**
 * Ground other units stand on or are heading to near (x, y). A unit with a
 * path claims its last waypoint, not the spot it is leaving.
 */
function claimedSpots(state: MatchState, x: number, y: number, skip: ReadonlySet<number>, owner: string): Spot[] {
  const reach = CLAIM_REACH_TILES * state.tileSize;
  const out: Spot[] = [];
  for (const o of state.entities.values()) {
    if (o.kind !== "unit" || o.hp <= 0 || o.garrisonedIn || skip.has(o.id)) continue;
    const last = o.wreck ? undefined : o.waypoints[o.waypoints.length - 1];
    const p = last ?? o;
    if (Math.abs(p.x - x) > reach || Math.abs(p.y - y) > reach) continue;
    const givesWay = !o.wreck && isInfantryType(o.type) && allies(state, o.ownerId, owner);
    out.push({ x: p.x, y: p.y, radius: o.radius, givesWay });
  }
  return out;
}

function obstaclesFor(u: Entity, claimed: readonly Spot[]): Spot[] {
  return isArmoredType(u.type) ? claimed.filter((s) => !s.givesWay) : claimed.slice();
}

/** Nearest spot to (x, y) where `u` can stand without landing on another unit's ground. */
export function openSpotNear(state: MatchState, u: Entity, x: number, y: number): Vec {
  const claimed = claimedSpots(state, x, y, new Set([u.id]), u.ownerId);
  return nearestClear(state, x, y, u.radius, obstaclesFor(u, claimed), u.type);
}

/** Spot `u` is heading for is already held by a unit that will not give way. */
export function spotTaken(state: MatchState, u: Entity, x: number, y: number): boolean {
  for (const o of state.entities.values()) {
    if (o.id === u.id || o.kind !== "unit" || o.hp <= 0 || o.garrisonedIn) continue;
    if (!o.wreck && isArmoredType(u.type) && isInfantryType(o.type) && allies(state, o.ownerId, u.ownerId)) continue;
    const last = o.wreck ? undefined : o.waypoints[o.waypoints.length - 1];
    if (last) {
      if (o.id < u.id && occupied(x, y, u.radius, last.x, last.y, o.radius)) return true;
      continue;
    }
    if (occupied(x, y, u.radius, o.x, o.y, o.radius)) return true;
  }
  return false;
}

/**
 * Destinations for a group move: keep the group's shape but pull it in tight
 * around the click, then honor each unit's reserved radius so they do not
 * stack on each other or on units already there.
 */
export function groupMoveTargets(state: MatchState, units: Entity[], destX: number, destY: number): Map<number, Vec> {
  const out = new Map<number, Vec>();
  if (units.length === 0) return out;
  if (units.length === 1) {
    const u = units[0]!;
    out.set(u.id, openSpotNear(state, u, destX, destY));
    return out;
  }

  let cx = 0;
  let cy = 0;
  for (const u of units) {
    cx += u.x;
    cy += u.y;
  }
  cx /= units.length;
  cy /= units.length;

  const order = units.slice().sort((a, b) => {
    if (b.radius !== a.radius) return b.radius - a.radius;
    const aa = Math.atan2(a.y - cy, a.x - cx);
    const ba = Math.atan2(b.y - cy, b.x - cx);
    if (aa !== ba) return aa - ba;
    return a.id - b.id;
  });

  let spread = 0;
  let packed = 0;
  for (const u of units) {
    spread = Math.max(spread, Math.hypot(u.x - cx, u.y - cy));
    const w = u.radius * 2 + UNIT_SPACE_PAD;
    packed += w * w;
  }
  const packR = Math.sqrt(packed) * 0.8 + state.tileSize * 2;
  const squeeze = spread > packR ? packR / spread : 1;

  const claimed = claimedSpots(state, destX, destY, new Set(units.map((u) => u.id)), units[0]!.ownerId);
  const placed: Spot[] = [];
  for (const u of order) {
    const prefX = destX + (u.x - cx) * squeeze;
    const prefY = destY + (u.y - cy) * squeeze;
    const spot = nearestClear(state, prefX, prefY, u.radius, [...obstaclesFor(u, claimed), ...placed], u.type);
    placed.push({ x: spot.x, y: spot.y, radius: u.radius, givesWay: isInfantryType(u.type) });
    out.set(u.id, spot);
  }
  return out;
}
