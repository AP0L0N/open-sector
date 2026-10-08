import {
  MAMMOTH_MINE_APEX,
  MAMMOTH_MINE_FLIGHT_SECONDS,
  MAMMOTH_MINE_RANGE_TILES,
  MAMMOTH_MINE_RELOAD_SECONDS,
  MINE_CALIBER,
  minePacksOf,
} from "../catalog.js";
import { clearOrder, playerTeam } from "./geo.js";
import { setPath } from "./path.js";
import type { Entity, MatchState } from "./types.js";

/** Launcher reach in world px, from the hull centre. */
export function mineLaunchReach(state: MatchState): number {
  return MAMMOTH_MINE_RANGE_TILES * state.tileSize;
}

/** A live hull with a mine launcher on its deck. */
export function hasMineLauncher(e: Entity): boolean {
  return e.kind === "unit" && e.hp > 0 && !e.wreck && minePacksOf(e.type) > 0;
}

/** Why this hull cannot take a Deploy mines order, or null. */
export function canLayMineField(e: Entity): string | null {
  if (!hasMineLauncher(e)) return "Select a Mammoth.";
  if (e.garrisonedIn != null) return "Get out first.";
  if ((e.minePacks ?? 0) <= 0) return "No mine packs left: a supply truck refills them.";
  return null;
}

/** Mammoths walk until (x, y) is in launcher reach, then lob one pack there. */
export function orderMineLay(state: MatchState, playerId: string, units: Entity[], x: number, y: number): string | null {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return "Bad mine order.";
  const ts = state.tileSize;
  const tx = Math.max(1, Math.min(state.width * ts - 1, x));
  const ty = Math.max(1, Math.min(state.height * ts - 1, y));
  let why = "Select a Mammoth.";
  let n = 0;
  for (const e of units) {
    if (e.ownerId !== playerId) continue;
    const err = canLayMineField(e);
    if (err) {
      why = err;
      continue;
    }
    clearOrder(e);
    e.order = { kind: "minelay", x: tx, y: ty };
    n++;
  }
  return n > 0 ? null : why;
}

/** Lob one pack from the deck to (x, y). It bursts there into a BV 222's field. */
function launchPack(state: MatchState, e: Entity, x: number, y: number): void {
  const fall = MAMMOTH_MINE_FLIGHT_SECONDS;
  e.minePacks = Math.max(0, (e.minePacks ?? 0) - 1);
  e.mineReload = MAMMOTH_MINE_RELOAD_SECONDS;
  state.projectiles.push({
    id: state.nextId++,
    ownerId: e.ownerId,
    team: playerTeam(state, e.ownerId),
    x: e.x,
    y: e.y,
    vx: (x - e.x) / fall,
    vy: (y - e.y) / fall,
    damage: 0,
    penetration: 0,
    caliber: MINE_CALIBER,
    life: fall,
    ignoreId: e.id,
    fromId: e.id,
    bounced: false,
    shell: null,
    flight: "cluster",
    lobbed: true,
    landX: x,
    landY: y,
    apex: MAMMOTH_MINE_APEX,
    flightTime: fall,
    z: 0,
  });
}

function stop(e: Entity): void {
  clearOrder(e);
  e.state = "idle";
}

/**
 * Sim phase: the launcher feeds its next pack, and a hull on a Deploy mines
 * order walks until the point is in reach, then fires once and stands.
 */
export function tickMineLaunchers(state: MatchState, dt: number): void {
  for (const e of state.entities.values()) {
    if (e.minePacks == null) continue;
    if ((e.mineReload ?? 0) > 0) e.mineReload = Math.max(0, (e.mineReload ?? 0) - dt);
    const o = e.order;
    if (o?.kind !== "minelay" || o.x == null || o.y == null) continue;
    if (canLayMineField(e)) {
      stop(e);
      continue;
    }
    if (Math.hypot(o.x - e.x, o.y - e.y) > mineLaunchReach(state)) {
      e.state = "move";
      if (e.waypoints.length === 0 || state.tick % 8 === 0) {
        // Nowhere to walk and still short: the order ends rather than standing forever.
        if (!setPath(state, e, o.x, o.y) && e.waypoints.length === 0) stop(e);
      }
      continue;
    }
    e.waypoints = [];
    e.state = "idle";
    if ((e.mineReload ?? 0) > 0) continue;
    launchPack(state, e, o.x, o.y);
    stop(e);
  }
}
