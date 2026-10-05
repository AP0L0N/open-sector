import {
  bayLoadOf,
  catalog,
  DECK_MG,
  fires,
  garrisonCapOf,
  infantryGunFor,
  isInfantryType,
  LST_HALF_LENGTH,
  LST_MG_AT,
  LST_RAMP_TILES,
  tankDeckOf,
} from "../catalog.js";
import { inBounds, isWater, tileCenter, walkable, worldToTile } from "./geo.js";
import type { EntityType } from "../catalog.js";
import type { Entity, MatchState } from "./types.js";

/**
 * The Transport LST: a tank deck that takes infantry and vehicles by load, a bow
 * ramp that has to touch land to load or unload, and two deck MG tubs manned by
 * the first two soldiers aboard who can shoot.
 */

/** Everyone still aboard, in the order they came up the ramp. */
function aboard(state: MatchState, ship: Entity): Entity[] {
  const out: Entity[] = [];
  for (const id of ship.garrison) {
    const u = state.entities.get(id);
    if (u && u.hp > 0 && u.garrisonedIn === ship.id) out.push(u);
  }
  return out;
}

export function isTankDeck(e: Entity): boolean {
  return e.kind === "unit" && tankDeckOf(e.type);
}

/** Room taken on the deck. */
export function deckLoad(state: MatchState, ship: Entity): number {
  let n = 0;
  for (const u of aboard(state, ship)) n += bayLoadOf(ship.type, u.type);
  return n;
}

export function deckRoom(state: MatchState, ship: Entity): number {
  return Math.max(0, garrisonCapOf(ship.type) - deckLoad(state, ship));
}

/** Foot of the bow ramp: at the stem of the hull as drawn. */
export function rampPoint(ship: Pick<Entity, "x" | "y" | "facing">): { x: number; y: number } {
  const d = LST_HALF_LENGTH;
  return { x: ship.x + Math.cos(ship.facing) * d, y: ship.y + Math.sin(ship.facing) * d };
}

/** Reach from the ramp foot in world units. */
export function rampReach(state: MatchState): number {
  return LST_RAMP_TILES * state.tileSize;
}

/**
 * Dry tiles this type can stand on within the ramp's reach, nearest the ramp first.
 * Empty: the bow is not on the shore.
 */
export function rampLandings(state: MatchState, ship: Entity, type: EntityType): { x: number; y: number }[] {
  const ts = state.tileSize;
  const foot = rampPoint(ship);
  const reach = rampReach(state);
  const r = Math.ceil(reach / ts);
  const fx = worldToTile(foot.x, ts);
  const fy = worldToTile(foot.y, ts);
  const out: { x: number; y: number; d: number }[] = [];
  for (let y = fy - r; y <= fy + r; y++) {
    for (let x = fx - r; x <= fx + r; x++) {
      if (!inBounds(state, x, y) || isWater(state, x, y) || !walkable(state, x, y, type)) continue;
      const d = Math.hypot(tileCenter(x, ts) - foot.x, tileCenter(y, ts) - foot.y);
      if (d <= reach) out.push({ x, y, d });
    }
  }
  out.sort((a, b) => a.d - b.d || a.y - b.y || a.x - b.x);
  return out.map(({ x, y }) => ({ x, y }));
}

/** The ramp is down on dry ground. */
export function rampAshore(state: MatchState, ship: Entity): boolean {
  return rampLandings(state, ship, "rifleman").length > 0;
}

/** Close enough to the ramp foot to walk up it. */
export function atRamp(state: MatchState, unit: Entity, ship: Entity): boolean {
  const foot = rampPoint(ship);
  return Math.hypot(unit.x - foot.x, unit.y - foot.y) <= rampReach(state) + unit.radius;
}

/**
 * Where this unit steps off. Each body already landed this tick pushes the next one
 * along the beach, and a hull keeps clear of the hulls before it.
 */
export function rampExitTile(
  state: MatchState,
  ship: Entity,
  unit: Entity,
  taken: readonly { x: number; y: number; r: number }[] = [],
): { x: number; y: number } | null {
  const spots = rampLandings(state, ship, unit.type);
  if (spots.length === 0) return null;
  const ts = state.tileSize;
  for (const s of spots) {
    const cx = tileCenter(s.x, ts);
    const cy = tileCenter(s.y, ts);
    if (taken.every((t) => Math.hypot(t.x - cx, t.y - cy) >= t.r + unit.radius * 0.8)) return s;
  }
  return spots[taken.length % spots.length]!;
}

/** The soldiers on the tubs: the first two aboard who can shoot, in boarding order. */
export function deckGunners(state: MatchState, ship: Entity): Entity[] {
  if (!isTankDeck(ship)) return [];
  return aboard(state, ship)
    .filter((u) => isInfantryType(u.type) && fires(u.type))
    .slice(0, LST_MG_AT.length);
}

/** World point of a tub, LST_MG_AT[i] half-lengths forward of amidships. */
export function tubPoint(ship: Pick<Entity, "x" | "y" | "facing">, i: number): { x: number; y: number } {
  const d = (LST_MG_AT[i] ?? 0) * LST_HALF_LENGTH;
  return { x: ship.x + Math.cos(ship.facing) * d, y: ship.y + Math.sin(ship.facing) * d };
}

function mount(u: Entity, tub: number): void {
  if (u.mountedGun === tub) return;
  if (u.mountedGun == null) u.ownClip = u.clip;
  u.mountedGun = tub;
  u.clip = DECK_MG.clip;
  u.reload = 0;
}

function dismount(u: Entity): void {
  if (u.mountedGun == null) return;
  u.mountedGun = undefined;
  const own = infantryGunFor(u);
  u.clip = Math.min(own?.clip ?? 0, u.ownClip ?? own?.clip ?? 0);
  u.ownClip = undefined;
  u.reload = 0;
}

/** Put the first two shooters aboard each LST on the tubs, and take everyone else off them. */
export function syncLstCrew(state: MatchState): void {
  const manned = new Set<number>();
  for (const ship of state.entities.values()) {
    if (!isTankDeck(ship) || ship.hp <= 0 || ship.wreck || ship.garrison.length === 0) continue;
    deckGunners(state, ship).forEach((u, i) => {
      mount(u, i);
      manned.add(u.id);
    });
  }
  for (const e of state.entities.values()) {
    if (e.mountedGun != null && !manned.has(e.id)) dismount(e);
  }
}

/** Share of the half-length ahead of amidships that must still float: only the stem rides up the beach. */
export const LST_KEEL_FLOAT = 0.9;

/**
 * An LST driving at the shore runs its bow up the sand and stops there, the hull still
 * afloat behind it, instead of nosing on until its middle sits on the last wet tile.
 * Runs before movement: a hull lined up on its waypoint whose forefoot would leave the
 * water is grounded, and its course ends where it is.
 */
export function groundLstBows(state: MatchState): void {
  const ts = state.tileSize;
  for (const e of state.entities.values()) {
    if (!isTankDeck(e) || e.hp <= 0 || e.wreck || e.garrisonedIn != null) continue;
    const wp = e.waypoints[0];
    if (!wp) continue;
    const fx = Math.cos(e.facing);
    const fy = Math.sin(e.facing);
    const dx = wp.x - e.x;
    const dy = wp.y - e.y;
    const dist = Math.hypot(dx, dy);
    // Still swinging onto the course: it does not make way yet.
    if (dist <= 0 || (dx * fx + dy * fy) / dist < 0.9) continue;
    const ahead = LST_HALF_LENGTH * LST_KEEL_FLOAT + ts * 0.5;
    const tx = worldToTile(e.x + fx * ahead, ts);
    const ty = worldToTile(e.y + fy * ahead, ts);
    if (!inBounds(state, tx, ty) || isWater(state, tx, ty)) continue;
    e.waypoints = [];
    if (e.order?.kind === "move" || e.order?.kind === "attackmove") e.order = null;
    if (e.state === "move") e.state = "idle";
  }
}

/** The LST's name for messages. */
export function lstName(ship: Entity): string {
  return catalog(ship.type).name;
}
