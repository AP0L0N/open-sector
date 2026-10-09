import {
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
import { clearOrder, inBounds, tileCenter, walkable, worldToTile } from "./geo.js";
import { fireSweep } from "./laser.js";
import { nextRand } from "./rng.js";
import type { Entity, MatchState } from "./types.js";

/**
 * The Behemoth's lunge. On the order its legs throw it up and forward, out to
 * BEHEMOTH_LUNGE_RANGE_TILES, on an arc that peaks at BEHEMOTH_LUNGE_APEX. In the air it neither
 * steers nor fires. Where it lands it lets go BEHEMOTH_RING_SWEEPS short green laser sweeps at
 * random bearings, one after another: each burns the enemy soldiers it passes and sets the ground
 * along its tip on fire. Then the legs need BEHEMOTH_LUNGE_RECHARGE_SECONDS before the next.
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

/** Throw it toward (x, y): short of it when the point is past its reach. */
export function startLunge(state: MatchState, e: Entity, x: number, y: number): string | null {
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
  clearOrder(e);
  e.orderQueue = undefined;
  e.holdPosition = false;
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
      }
      continue;
    }
    // Down: one sweep after another, each on its own random bearing, until the ring is spent.
    if ((e.lungeRing ?? 0) > 0 && !e.laser) {
      const bearing = nextRand(state) * Math.PI * 2;
      fireSweep(state, e, bearing, (BEHEMOTH_RING_HALF_DEG * Math.PI) / 180, BEHEMOTH_RING_RANGE_TILES * state.tileSize, BEHEMOTH_RING_SWEEP_SECONDS, true);
      e.lungeRing = (e.lungeRing ?? 0) - 1;
      if (e.lungeRing <= 0) e.lungeRing = undefined;
    }
  }
}
