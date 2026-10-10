import {
  BEHEMOTH_AUTO_LUNGE_MAX_TILES,
  BEHEMOTH_AUTO_LUNGE_MIN_TILES,
  BEHEMOTH_AUTO_LUNGE_SHORT_TILES,
  BEHEMOTH_LUNGE_APEX,
  BEHEMOTH_LUNGE_RANGE_TILES,
  BEHEMOTH_LUNGE_RECHARGE_SECONDS,
  BEHEMOTH_LUNGE_SECONDS,
  BEHEMOTH_RING_HALF_DEG,
  BEHEMOTH_RING_RANGE_TILES,
  BEHEMOTH_RING_SWEEPS,
  BEHEMOTH_RING_SWEEP_SECONDS,
  canLunge,
  secondsToTicks,
} from "../catalog.js";
import { allies, clearOrder, inBounds, tileCenter, walkable, worldToTile } from "./geo.js";
import { fireSweep } from "./laser.js";
import { setPath } from "./path.js";
import { nextRand } from "./rng.js";
import type { Entity, MatchState } from "./types.js";

/**
 * The Behemoth's lunge. On the order its legs throw it up and forward, out to
 * BEHEMOTH_LUNGE_RANGE_TILES, on an arc that peaks at BEHEMOTH_LUNGE_APEX. In the air it neither
 * steers nor fires. Where it lands it lets go BEHEMOTH_RING_SWEEPS short green laser sweeps at
 * random bearings, one after another: each burns the enemy soldiers it passes and sets the ground
 * along its tip on fire. Then the legs need BEHEMOTH_LUNGE_RECHARGE_SECONDS before the next.
 * With the legs charged it also lunges by itself at the enemy unit it is fighting (autoLunge).
 * Runs before movement, beside the jets.
 */

/** Lunge charge, 0–1. 1 is ready. */
export function lungeCharge(state: MatchState, e: Entity): number {
  if (e.lungeReady == null) return 1;
  const need = secondsToTicks(BEHEMOTH_LUNGE_RECHARGE_SECONDS);
  return Math.max(0, Math.min(1, 1 - (e.lungeReady - state.tick) / need));
}

/** Height off the ground, world px, while it is in the air. Zero on its legs. */
export function lungeAlt(state: MatchState, e: Pick<Entity, "lunge">): number {
  const l = e.lunge;
  if (!l) return 0;
  const f = Math.max(0, Math.min(1, (state.tick - l.t0) / Math.max(1, l.t1 - l.t0)));
  return 4 * BEHEMOTH_LUNGE_APEX * f * (1 - f);
}

/** Why it cannot lunge now, or null. */
export function lungeDenied(state: MatchState, e: Entity): string | null {
  if (!canLunge(e.type)) return "Only the Behemoth can lunge.";
  if (e.lunge) return "Already in the air.";
  if (e.lungeReady != null && e.lungeReady > state.tick) return "The legs are still recharging.";
  if (e.garrisonedIn != null || e.state === "deploy" || e.state === "undeploy") return "It cannot lunge from here.";
  return null;
}

/** The nearest tile it can stand on at or around (x, y), searching a little way out. */
function landing(state: MatchState, e: Entity, x: number, y: number): { x: number; y: number } | null {
  const ts = state.tileSize;
  const tx = worldToTile(x, ts);
  const ty = worldToTile(y, ts);
  for (let r = 0; r <= 3; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const cx = tx + dx;
        const cy = ty + dy;
        if (!inBounds(state, cx, cy) || !walkable(state, cx, cy, e.type)) continue;
        return r === 0 ? { x, y } : { x: tileCenter(cx, ts), y: tileCenter(cy, ts) };
      }
    }
  }
  return null;
}

/**
 * Throw it toward (x, y): short of it when the point is past its reach. A player's lunge drops
 * what it was doing; `keepOrder` (its own jump into a fight) keeps the order and the target.
 */
export function startLunge(state: MatchState, e: Entity, x: number, y: number, keepOrder = false): string | null {
  const why = lungeDenied(state, e);
  if (why) return why;
  const reach = BEHEMOTH_LUNGE_RANGE_TILES * state.tileSize;
  let dx = x - e.x;
  let dy = y - e.y;
  const d = Math.hypot(dx, dy);
  if (d < state.tileSize) return "Too close to lunge.";
  if (d > reach) {
    dx *= reach / d;
    dy *= reach / d;
  }
  const spot = landing(state, e, e.x + dx, e.y + dy);
  if (!spot) return "Nowhere to land there.";
  if (!keepOrder) {
    clearOrder(e);
    e.orderQueue = undefined;
    e.holdPosition = false;
  }
  e.facing = Math.atan2(spot.y - e.y, spot.x - e.x);
  e.lunge = { x0: e.x, y0: e.y, x1: spot.x, y1: spot.y, t0: state.tick, t1: state.tick + secondsToTicks(BEHEMOTH_LUNGE_SECONDS) };
  e.lungeReady = state.tick + secondsToTicks(BEHEMOTH_LUNGE_SECONDS + BEHEMOTH_LUNGE_RECHARGE_SECONDS);
  return null;
}

export function tickLunges(state: MatchState): void {
  for (const e of state.entities.values()) {
    if (e.hp <= 0 || e.wreck) {
      e.lunge = undefined;
      e.lungeRing = undefined;
      continue;
    }
    const l = e.lunge;
    if (l) {
      const f = Math.min(1, (state.tick - l.t0) / Math.max(1, l.t1 - l.t0));
      e.x = l.x0 + (l.x1 - l.x0) * f;
      e.y = l.y0 + (l.y1 - l.y0) * f;
      e.tileX = worldToTile(e.x, state.tileSize);
      e.tileY = worldToTile(e.y, state.tileSize);
      e.waypoints = [];
      if (state.tick >= l.t1) {
        e.lunge = undefined;
        e.lungeRing = BEHEMOTH_RING_SWEEPS;
        // An attack-move it jumped out of goes on from where it came down.
        const o = e.order;
        if (o?.kind === "attackmove" && o.x != null && o.y != null) setPath(state, e, o.x, o.y);
      }
      continue;
    }
    autoLunge(state, e);
    // Down: one sweep after another, each on its own random bearing, until the ring is spent.
    if ((e.lungeRing ?? 0) > 0 && !e.laser) {
      const bearing = nextRand(state) * Math.PI * 2;
      fireSweep(state, e, bearing, (BEHEMOTH_RING_HALF_DEG * Math.PI) / 180, BEHEMOTH_RING_RANGE_TILES * state.tileSize, BEHEMOTH_RING_SWEEP_SECONDS, true);
      e.lungeRing = (e.lungeRing ?? 0) - 1;
      if (e.lungeRing <= 0) e.lungeRing = undefined;
    }
  }
}

/** Orders it may jump out of by itself: none, an attack, or an attack-move. Never a plain move. */
function mayAutoLunge(e: Entity): boolean {
  const o = e.order;
  return !o || o.kind === "attack" || o.kind === "attackmove";
}

/**
 * Its own jump into a fight: legs charged, fighting an enemy unit on the ground between
 * BEHEMOTH_AUTO_LUNGE_MIN_TILES and BEHEMOTH_AUTO_LUNGE_MAX_TILES off, it lunges at it and comes
 * down BEHEMOTH_AUTO_LUNGE_SHORT_TILES short, so the landing sweeps catch it. Not on hold position.
 */
export function autoLunge(state: MatchState, e: Entity): boolean {
  if (!canLunge(e.type) || e.lunge || e.lungeRing || e.holdPosition || !mayAutoLunge(e)) return false;
  if (e.attackTarget == null || lungeDenied(state, e)) return false;
  const t = state.entities.get(e.attackTarget);
  if (!t || t.kind !== "unit" || t.hp <= 0 || t.wreck || t.air || t.garrisonedIn != null) return false;
  if (t.ownerId && allies(state, e.ownerId, t.ownerId)) return false;
  const ts = state.tileSize;
  const d = Math.hypot(t.x - e.x, t.y - e.y);
  if (d < BEHEMOTH_AUTO_LUNGE_MIN_TILES * ts || d > BEHEMOTH_AUTO_LUNGE_MAX_TILES * ts) return false;
  const go = (d - BEHEMOTH_AUTO_LUNGE_SHORT_TILES * ts) / d;
  return startLunge(state, e, e.x + (t.x - e.x) * go, e.y + (t.y - e.y) * go, true) == null;
}
