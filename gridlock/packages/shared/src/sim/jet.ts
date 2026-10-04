import {
  JET_ALT,
  JET_CLIMB_PER_SEC,
  JET_FLY_TILES_PER_SEC,
  JET_FUEL_SECONDS,
  JET_LAND_RESERVE,
  JET_REFUEL_DELAY,
  JET_REFUEL_PER_SEC,
  JET_TAKEOFF_MIN_SECONDS,
  hasCrit,
  infantryGunFor,
  radarLaidOf,
  rocketRackOf,
  rocketsOf,
  isBattleship,
} from "../catalog.js";
import { inBounds, isWater, jetAloft, tileCenter, unitInWater, walkable, worldToTile } from "./geo.js";
import { setPath } from "./path.js";
import type { Entity, MatchState } from "./types.js";

export { jetAloft };

/**
 * Who can lay a weapon on a Jump Jet in the air: the anti-air guns (MG42,
 * gatlings, the Walker), the radar-laid CIWS and RAM, and an anti-air rocket
 * rack (the Titan's pods). Rifles, pistols, tank guns, and mortars cannot.
 */
export function reachesJet(shooter: Entity): boolean {
  if (shooter.type === "walker" || radarLaidOf(shooter.type) || isBattleship(shooter.type)) return true;
  if (rocketsOf(shooter.type) && rocketRackOf(shooter.type).antiAir) return true;
  return !!infantryGunFor(shooter)?.antiAir;
}

/** Why this soldier cannot take off now, or null. */
export function takeoffBlocked(state: MatchState, e: Entity): string | null {
  const jet = e.jet;
  if (!jet || e.hp <= 0) return "Select a Jump Jet.";
  if (jet.up) return "Already up.";
  if (e.garrisonedIn != null) return "Leave cover first.";
  if (hasCrit(e, "leg")) return "Cannot take off on a broken leg.";
  if (jet.fuel < JET_TAKEOFF_MIN_SECONDS) return "Jet pack refuelling.";
  if (jet.alt <= 0 && unitInWater(state, e)) return "Cannot take off from the water.";
  return null;
}

/** Light the pack. He rises and keeps any travel order, now in a straight line. */
export function takeOff(state: MatchState, e: Entity): string | null {
  const err = takeoffBlocked(state, e);
  if (err) return err;
  e.jet!.up = true;
  e.stanceOrder = "stand";
  e.stance = "stand";
  return null;
}

/** Come down on the nearest open ground. */
export function landJet(e: Entity): void {
  if (e.jet) e.jet.up = false;
}

/** Dry, open ground a man can stand on. */
function landable(state: MatchState, e: Entity, tx: number, ty: number): boolean {
  return inBounds(state, tx, ty) && !isWater(state, tx, ty) && walkable(state, tx, ty, e.type);
}

/** Nearest tile he can set down on, by rings around his own. */
function landingTile(state: MatchState, e: Entity): { x: number; y: number } | null {
  const gx = worldToTile(e.x, state.tileSize);
  const gy = worldToTile(e.y, state.tileSize);
  if (landable(state, e, gx, gy)) return { x: gx, y: gy };
  const max = Math.max(state.width, state.height);
  for (let r = 1; r < max; r++) {
    let best: { x: number; y: number } | null = null;
    let bestD = Infinity;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (!landable(state, e, gx + dx, gy + dy)) continue;
        const d = dx * dx + dy * dy;
        if (d < bestD) {
          bestD = d;
          best = { x: gx + dx, y: gy + dy };
        }
      }
    }
    if (best) return best;
  }
  return null;
}

/**
 * One tick of flight toward the last waypoint: straight, at air speed, over
 * everything. Called from tickMovement in place of the walk.
 */
export function flyStep(state: MatchState, e: Entity, dt: number): void {
  const goal = e.waypoints[e.waypoints.length - 1];
  if (!goal) return;
  const step = JET_FLY_TILES_PER_SEC * state.tileSize * dt;
  const dx = goal.x - e.x;
  const dy = goal.y - e.y;
  const d = Math.hypot(dx, dy);
  if (d <= step) {
    e.x = goal.x;
    e.y = goal.y;
    e.waypoints = [];
  } else {
    e.x += (dx / d) * step;
    e.y += (dy / d) * step;
    e.waypoints = [goal];
  }
  e.tileX = worldToTile(e.x, state.tileSize);
  e.tileY = worldToTile(e.y, state.tileSize);
}

/**
 * Jet packs: burn fuel in the air and turn for home low on it, climb and
 * sink, find open ground to set down on, and refill on the ground after a pause.
 */
export function tickJets(state: MatchState, dt: number): void {
  for (const e of state.entities.values()) {
    const jet = e.jet;
    if (!jet) continue;
    if (e.hp <= 0 || e.garrisonedIn != null) {
      // Shot out of the air, he falls where he is.
      jet.up = false;
      jet.alt = 0;
      continue;
    }
    if (jet.up || jet.alt > 0) {
      jet.fuel = Math.max(0, jet.fuel - dt);
      jet.refuel = JET_REFUEL_DELAY;
      if (jet.up && (jet.fuel <= JET_LAND_RESERVE || hasCrit(e, "leg"))) jet.up = false;
    }
    if (jet.up) {
      jet.alt = Math.min(JET_ALT, jet.alt + JET_CLIMB_PER_SEC * dt);
      continue;
    }
    if (jet.alt > 0) {
      descend(state, e, dt);
      continue;
    }
    if (jet.refuel > 0) {
      jet.refuel = Math.max(0, jet.refuel - dt);
      continue;
    }
    jet.fuel = Math.min(JET_FUEL_SECONDS, jet.fuel + JET_REFUEL_PER_SEC * dt);
  }
}

/** Over open ground he sinks; over water, a roof, or a wall he first drifts to the nearest open tile. */
function descend(state: MatchState, e: Entity, dt: number): void {
  const jet = e.jet!;
  const tx = worldToTile(e.x, state.tileSize);
  const ty = worldToTile(e.y, state.tileSize);
  if (!landable(state, e, tx, ty)) {
    const spot = landingTile(state, e);
    if (spot) {
      const goal = { x: tileCenter(spot.x, state.tileSize), y: tileCenter(spot.y, state.tileSize) };
      const kept = e.waypoints[e.waypoints.length - 1];
      // Carry him to the spot; the walk resumes from there.
      e.waypoints = [goal];
      if (kept) landingResume.set(e, kept);
      return;
    }
  }
  jet.alt = Math.max(0, jet.alt - JET_CLIMB_PER_SEC * dt);
  if (jet.alt > 0) return;
  // Down. Whatever is left of the trip he walks, round the obstacles.
  const resume = landingResume.get(e) ?? e.waypoints[e.waypoints.length - 1];
  landingResume.delete(e);
  if (resume && Math.hypot(resume.x - e.x, resume.y - e.y) > 1) setPath(state, e, resume.x, resume.y);
  else e.waypoints = [];
}

/** Travel goal a Jump Jet had before drifting to open ground to land. */
const landingResume = new WeakMap<Entity, { x: number; y: number }>();
