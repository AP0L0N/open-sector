import {
  ALLY_LINE_MARGIN,
  ALLY_LINE_PATIENCE_SECONDS,
  ALLY_LINE_RETRY_SECONDS,
  ALLY_SIDESTEP_MAX_SECONDS,
  ALLY_SIDESTEP_STEPS,
  PROJECTILE_RADIUS,
  TICK_DT,
  catalog,
  coverHeightOf,
  infantryGunFor,
  launcherOnlyOf,
} from "../catalog.js";
import { isAirborne, isCrashing } from "./air.js";
import { aimHeight, canAimWeapon, entityHeight, muzzleHeight, shotClearsCover, worldTileHeight } from "./elevation.js";
import {
  allies,
  buildingContains,
  jetAloft,
  segmentBuildingT,
  segmentCircleT,
  unitInWater,
  walkable,
  worldToTile,
} from "./geo.js";
import { garrisonMuzzleToward, livingGarrison } from "./garrison.js";
import { setPath } from "./path.js";
import { stanceHitRadiusMul } from "./stance.js";
import type { Entity, MatchState } from "./types.js";

/**
 * The first friendly unit or building a straight round from (fromX, fromY)
 * to the target would meet short of it. Mirrors what a flying round strikes:
 * walls and sandbags pass it, a round over a friend's head clears him.
 */
export function allyInLine(
  state: MatchState,
  e: Entity,
  fromX: number,
  fromY: number,
  target: Entity,
): Entity | undefined {
  const slit = fromX === e.x && fromY === e.y ? garrisonMuzzleToward(state, e, target.x, target.y) : null;
  const ang = Math.atan2(target.y - fromY, target.x - fromX);
  const muzzleReach = e.radius + 2;
  const x0 = slit ? slit.x : fromX + Math.cos(ang) * muzzleReach;
  const y0 = slit ? slit.y : fromY + Math.sin(ang) * muzzleReach;
  const x1 = target.x;
  const y1 = target.y;
  const z0 = muzzleHeight(state, e) - entityHeight(state, e) + worldTileHeight(state, fromX, fromY);
  const z1 = aimHeight(state, target);
  let best: Entity | undefined;
  let bestT = Infinity;
  for (const o of state.entities.values()) {
    if (o.id === e.id || o.id === target.id || o.id === e.garrisonedIn) continue;
    if (o.hp <= 0 || o.wreck || o.garrisonedIn != null || isCrashing(o) || o.drone || isAirborne(o)) continue;
    if (!o.ownerId || !allies(state, e.ownerId, o.ownerId)) continue;
    if (o.type === "sandbags" || o.type === "teeth" || o.type === "wall" || o.type === "greatwall" || o.type === "gate") continue;
    if (o.type === "trench" && livingGarrison(state, o).length === 0) continue;
    let t: number | null;
    if (o.kind === "building") {
      // The gun stands inside this footprint (a pad, a yard). Nothing to step around.
      if (buildingContains(o, state.tileSize, x0, y0)) continue;
      t = segmentBuildingT(x0, y0, x1, y1, o, state.tileSize);
    } else {
      const reach = o.radius * stanceHitRadiusMul(o, unitInWater(state, o)) + PROJECTILE_RADIUS + ALLY_LINE_MARGIN;
      t = segmentCircleT(x0, y0, x1, y1, o.x, o.y, reach);
    }
    if (t == null || t >= bestT) continue;
    if (shotClearsCover(z0 + (z1 - z0) * t, entityHeight(state, o), coverHeightOf(o.type))) continue;
    best = o;
    bestT = t;
  }
  return best;
}

/**
 * Guns that fire straight at what they aim at. Lobbed bombs and shells, laid
 * launchers, the flamer (it never burns a friend unordered), and a Jump Jet
 * firing down from the air do not need a clear line.
 */
export function needsClearLine(e: Entity, target: Entity): boolean {
  if (e.type === "artillery" || e.type === "mortarman" || launcherOnlyOf(e.type)) return false;
  const gun = infantryGunFor(e)?.id;
  if (gun === "mortar" || gun === "flamer") return false;
  if (jetAloft(e) || isAirborne(target)) return false;
  return true;
}

/** The unit may walk aside for a clear line: not holding, not inside, not on its own errand. */
function maySidestep(e: Entity): boolean {
  if (e.holdPosition || e.garrisonedIn != null || e.guardFacing != null) return false;
  if (catalog(e.type).moveTilesPerSec <= 0) return false;
  const kind = e.order?.kind;
  return kind == null || kind === "attack" || kind === "attackmove" || kind === "guard";
}

/**
 * The nearest spot beside the unit, within its reach of the target, where no
 * friend stands in the line. Tries across the line first, then across and a
 * little forward or back. Null when none is open.
 */
export function clearShotSpot(state: MatchState, e: Entity, target: Entity, range: number): { x: number; y: number } | null {
  const ang = Math.atan2(target.y - e.y, target.x - e.x);
  const fx = Math.cos(ang);
  const fy = Math.sin(ang);
  const step = Math.max(e.radius * 2, state.tileSize * 2);
  const probe: Entity = { ...e };
  for (let k = 1; k <= ALLY_SIDESTEP_STEPS; k++) {
    for (const along of [0, -1, 1]) {
      for (const side of [1, -1]) {
        const x = e.x - fy * side * k * step + fx * along * step;
        const y = e.y + fx * side * k * step + fy * along * step;
        if (!walkable(state, worldToTile(x, state.tileSize), worldToTile(y, state.tileSize), e.type)) continue;
        if (Math.hypot(target.x - x, target.y - y) > range * 0.95) continue;
        probe.x = x;
        probe.y = y;
        if (!canAimWeapon(state, probe, target.x, target.y, target)) continue;
        if (allyInLine(state, e, x, y, target)) continue;
        return { x, y };
      }
    }
  }
  return null;
}

/**
 * Before a direct-fire gun shoots: is a friend in the way? True holds fire.
 * While the patience clock runs the gun holds, and every retry it first asks
 * `retarget` for another enemy with a clear line, then looks for a spot to
 * step to. When the clock runs out it fires anyway. A player force-attack and
 * a fused ground shot never wait.
 */
export function holdForAlly(
  state: MatchState,
  e: Entity,
  target: Entity | undefined,
  forced: boolean,
  range: number,
  retarget: () => boolean,
): boolean {
  if (forced || !target || !needsClearLine(e, target) || !allyInLine(state, e, e.x, e.y, target)) {
    endSidestep(state, e);
    return false;
  }
  const tick = state.tick;
  let block = e.lineBlock;
  if (!block || block.targetId !== target.id) {
    endSidestep(state, e);
    block = { targetId: target.id, since: tick, seen: tick, look: tick, walked: 0, spot: null };
    e.lineBlock = block;
  }
  block.seen = tick;
  const walkCap = Math.round(ALLY_SIDESTEP_MAX_SECONDS / TICK_DT);
  if (block.spot) {
    // Walking aside does not spend patience, up to a cap. A walk that never arrives is given up.
    block.walked++;
    if (block.walked <= walkCap) block.since++;
    else haltSidestep(state, e);
  }
  if ((tick - block.since) * TICK_DT >= ALLY_LINE_PATIENCE_SECONDS) {
    haltSidestep(state, e);
    return false;
  }
  if (tick < block.look) return true;
  block.look = tick + Math.max(1, Math.round(ALLY_LINE_RETRY_SECONDS / TICK_DT));
  if (retarget()) return true;
  if (!block.spot && block.walked < walkCap && maySidestep(e)) block.spot = clearShotSpot(state, e, target, range);
  return true;
}

/** Forget the fouled line, and halt any walk aside it started. */
export function endSidestep(state: MatchState, e: Entity): void {
  if (!e.lineBlock) return;
  haltSidestep(state, e);
  e.lineBlock = undefined;
}

/**
 * Halt a walk aside. An attack-move picks up its route again, so it carries
 * on once the fight is over; anything else stands where it is.
 */
function haltSidestep(state: MatchState, e: Entity): void {
  const block = e.lineBlock;
  if (!block?.spot) return;
  block.spot = null;
  e.waypoints = [];
  const o = e.order;
  if (o?.kind === "attackmove" && o.x != null && o.y != null) setPath(state, e, o.x, o.y);
}

/**
 * Movement's half: the spot this unit is stepping to for a clear line, with
 * a path laid to it. Null when it has none, or the reason went away.
 */
export function sidestepGoal(state: MatchState, e: Entity): { x: number; y: number } | null {
  const block = e.lineBlock;
  if (!block?.spot) return null;
  const t = state.entities.get(block.targetId);
  const aimed =
    e.attackTarget === block.targetId ||
    ((e.order?.kind === "attack" || e.order?.kind === "forceattack") && e.order.targetId === block.targetId);
  // Combat confirms the fouled line every tick it looks. A stale block is let go.
  if (!t || t.hp <= 0 || !aimed || !maySidestep(e) || state.tick - block.seen > 2) {
    endSidestep(state, e);
    return null;
  }
  const spot = block.spot;
  if (Math.hypot(spot.x - e.x, spot.y - e.y) <= Math.max(e.radius, state.tileSize)) {
    // Arrived. Stand and look again.
    haltSidestep(state, e);
    return null;
  }
  const goal = e.waypoints[e.waypoints.length - 1];
  if (!goal || Math.hypot(goal.x - spot.x, goal.y - spot.y) > state.tileSize) {
    if (!setPath(state, e, spot.x, spot.y)) {
      block.spot = null;
      return null;
    }
  }
  return spot;
}
