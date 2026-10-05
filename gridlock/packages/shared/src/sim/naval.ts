import {
  hasSonar,
  isTorpedoBody,
  secondsToTicks,
  SONAR_RANGE_TILES,
  SUB_AIR_RECOVER_MUL,
  SUB_DIVE_SECONDS,
  SUB_REVEAL_SECONDS,
  submergesOf,
  torpedoesOf,
} from "../catalog.js";
import { allies, footprint, isWater, jetAloft, makeEntity, worldToTile } from "./geo.js";
import type { DiveState, Entity, MatchState, Projectile } from "./types.js";

/**
 * Make a round a torpedo: it runs at the waterline as its own body, which a gun can shoot
 * before it arrives. `deep`: let go by a boat below, it meets only another boat that is down.
 * The submarine's tube and the He 111's drop both go through here.
 */
export function armTorpedo(state: MatchState, p: Projectile, deep: boolean): void {
  p.torpedo = true;
  p.z = 0;
  p.vz = 0;
  p.deep = deep || undefined;
  p.bodyId = makeEntity(state, "torpedo", p.ownerId, p.x, p.y, { facing: Math.atan2(p.vy, p.vx) }).id;
}

/**
 * Floats or stands in the water: a boat, a swimmer, a wading walker, or a building with
 * water under it (the Marine Base). This is what a torpedo can meet. Anything in the air is not.
 */
export function afloat(state: MatchState, e: Entity): boolean {
  if (e.kind === "building") return footprint(e.tileX, e.tileY, e.tileW, e.tileH).some((t) => isWater(state, t.x, t.y));
  if (e.garrisonedIn != null || e.air || e.drone || jetAloft(e)) return false;
  return isWater(state, worldToTile(e.x, state.tileSize), worldToTile(e.y, state.tileSize));
}

/**
 * A torpedo boat cannot engage anything that is not in the water, nor another torpedo.
 * Submerged, it only finds another submarine that is down too. A hull the player named
 * stays its target: it closes in below and surfaces to strike (surfaceToStrike).
 */
export function torpedoCannotReach(state: MatchState, shooter: Entity, target: Entity): boolean {
  if (!torpedoesOf(shooter.type)) return false;
  if (isTorpedoBody(target.type) || !afloat(state, target)) return true;
  return diving(shooter) && !diving(target) && !namedStrike(shooter, target);
}

/** The player ordered this boat to attack or force-attack this target. */
function namedStrike(e: Entity, t: Entity): boolean {
  const o = e.order;
  return (o?.kind === "attack" || o?.kind === "forceattack") && !o.auto && o.targetId === t.id;
}

/** In range of a named hull on the surface, a submarine below comes up to fire. */
export function surfaceToStrike(e: Entity, t: Entity): void {
  if (diving(e) && !diving(t) && namedStrike(e, t)) setDive(e, false);
}

/** A submarine running below, seen by the enemy or not. */
export function diving(e: Entity): boolean {
  return submergesOf(e.type) && e.hp > 0 && !e.wreck && !!e.dive?.down;
}

/** A submarine running below that has not fired lately: out of the enemy's sight from afar. */
export function submerged(state: MatchState, e: Entity): boolean {
  if (!diving(e)) return false;
  if (e.surfacedTick == null) return true;
  return state.tick - e.surfacedTick > secondsToTicks(SUB_REVEAL_SECONDS);
}

/** The submarine just fired: everyone who has eyes on its water sees it for a while. */
export function surface(state: MatchState, e: Entity): void {
  if (submergesOf(e.type)) e.surfacedTick = state.tick;
}

function diveOf(e: Entity): DiveState {
  return (e.dive ??= { down: false, air: SUB_DIVE_SECONDS });
}

/** Take the boat down or bring it up. A boat that ran out of air stays up until the air is back. */
export function setDive(e: Entity, down: boolean): string | null {
  if (!submergesOf(e.type)) return null;
  const d = diveOf(e);
  if (down && d.winded) return "Out of air: it stays surfaced until its air is back.";
  d.down = down;
  return null;
}

/** Below, a submarine spends its air and surfaces when it runs out. Up, it takes air back in. */
export function tickSubmarines(state: MatchState, dt: number): void {
  for (const e of state.entities.values()) {
    const d = e.dive;
    if (!d || e.hp <= 0 || e.wreck || !submergesOf(e.type)) continue;
    if (d.down) {
      d.air = Math.max(0, d.air - dt);
      if (d.air <= 0) {
        d.down = false;
        d.winded = true;
      }
      continue;
    }
    if (d.air >= SUB_DIVE_SECONDS) continue;
    d.air = Math.min(SUB_DIVE_SECONDS, d.air + dt * SUB_AIR_RECOVER_MUL);
    if (d.air >= SUB_DIVE_SECONDS) d.winded = undefined;
  }
}

/** A Destroyer still afloat and fighting: its sonar listens and its deck works. */
export function shipLive(e: Entity | undefined): e is Entity {
  return !!e && hasSonar(e.type) && !!e.asw && e.hp > 0 && !e.wreck;
}

/** A submarine this ship's sonar hears: an enemy boat, down or up, inside SONAR_RANGE_TILES. */
export function sonarHears(state: MatchState, ship: Entity, sub: Entity): boolean {
  if (!shipLive(ship) || !submergesOf(sub.type) || sub.hp <= 0 || sub.wreck) return false;
  if (!sub.ownerId || allies(state, ship.ownerId, sub.ownerId)) return false;
  return Math.hypot(sub.x - ship.x, sub.y - ship.y) <= SONAR_RANGE_TILES * state.tileSize;
}

/**
 * A submerged boat stays out of `playerId`'s sight unless a Destroyer on that side hears
 * it. Nothing else finds it below: not a lookout close by, not a radar.
 */
export function hiddenSubmarine(state: MatchState, playerId: string, e: Entity): boolean {
  if (!submerged(state, e) || allies(state, playerId, e.ownerId)) return false;
  for (const o of state.entities.values()) {
    if (allies(state, playerId, o.ownerId) && sonarHears(state, o, e)) return false;
  }
  return true;
}

/** A submerged enemy boat `playerId`'s sonar hears: in sight wherever it is, fog or not. */
export function sonarSpotted(state: MatchState, playerId: string, e: Entity): boolean {
  return submerged(state, e) && !allies(state, playerId, e.ownerId) && !hiddenSubmarine(state, playerId, e);
}
