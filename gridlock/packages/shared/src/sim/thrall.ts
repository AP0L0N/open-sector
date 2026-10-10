/**
 * The Thrall: the hive's cheap brawler. Fists on soldiers, a detonation on armor, a stagger
 * now and then when a bullet catches its shoulder, and a vault over sandbags and walls
 * (geo.walkable / collision.tileFree let it through fortBlock 1).
 */

import {
  PTRD_LIGHT_FRONT,
  THRALL_BLAST_HEAVY,
  THRALL_BLAST_SOFT,
  THRALL_BLAST_TILES,
  THRALL_BUILDING_MUL,
  THRALL_PUNCH_DAMAGE,
  THRALL_STAGGER_CHANCE,
  THRALL_STAGGER_GUARD_SECONDS,
  THRALL_STAGGER_MAX_CALIBER,
  THRALL_STAGGER_SECONDS,
  catalog,
  isInfantryType,
  secondsToTicks,
} from "../catalog.js";
import type { ImpactKind } from "../protocol.js";
import { isAirborne } from "./air.js";
import { isArmored } from "./ballistics.js";
import { rollCrits, takeDamage } from "./crits.js";
import { buildingBounds, destroyEntity, inBounds, tileIndex, worldToTile } from "./geo.js";
import { mortarFalloff } from "./mortar.js";
import { nextRand } from "./rng.js";
import type { Entity, MatchState } from "./types.js";

/** Shown as the burst on the client, like the Walker's. */
const BLAST_CALIBER = 75;
/** A blow: a small-arms spark on the client. */
const FIST_CALIBER = 8;

/** An armored hull: the Thrall detonates on it instead of punching. */
export function thrallDetonatesOn(target: Entity): boolean {
  return target.kind === "unit" && !target.wreck && isArmored(catalog(target.type));
}

/**
 * One blow at arm's reach. A soldier takes THRALL_PUNCH_DAMAGE; a building THRALL_BUILDING_MUL of
 * it; anything else (a wreck, an unarmored gun) the full blow. No round: the hit lands now.
 */
export function punch(state: MatchState, e: Entity, target: Entity): void {
  const rand = () => nextRand(state);
  const soldier = target.kind === "unit" && !target.wreck && isInfantryType(target.type);
  const mul = target.kind === "building" ? THRALL_BUILDING_MUL : 1;
  const dmg = Math.round(THRALL_PUNCH_DAMAGE * mul * (0.85 + 0.3 * rand()));
  let kind: ImpactKind = "hit";
  if (dmg > 0) {
    takeDamage(target, dmg, state.tick);
    if (target.hp <= 0) kind = "kill";
    else if (soldier) rollCrits(target, "none", "hit", dmg, rand);
  } else {
    kind = "glance";
  }
  state.impacts.push({
    id: state.nextId++,
    ownerId: e.ownerId,
    kind,
    fromId: e.id,
    x: target.x,
    y: target.y,
    vx: target.x - e.x,
    vy: target.y - e.y,
    caliber: FIST_CALIBER,
  });
}

/** A swing at the bare ground on a force-attack. The client still shows the blow. */
export function punchAir(state: MatchState, e: Entity, x: number, y: number): void {
  state.impacts.push({ id: state.nextId++, ownerId: e.ownerId, kind: "miss", fromId: e.id, x, y, vx: x - e.x, vy: y - e.y, caliber: FIST_CALIBER });
}

/**
 * It throws itself on the plate and goes off. THRALL_BLAST_HEAVY at the centre on a hull heavier
 * than light plate, THRALL_BLAST_SOFT on everything else, falling off to the rim. Friend and foe
 * alike. Nothing is left of it.
 */
export function detonateThrall(state: MatchState, e: Entity): void {
  const radius = THRALL_BLAST_TILES * state.tileSize;
  for (const o of [...state.entities.values()]) {
    if (o.id === e.id || o.hp <= 0 || o.wreck) continue;
    if (isAirborne(o) || o.garrisonedIn != null) continue;
    const dist = distTo(state, e, o);
    if (dist > radius) continue;
    const heavy = o.kind === "unit" && catalog(o.type).armorFront > PTRD_LIGHT_FRONT;
    const raw = (heavy ? THRALL_BLAST_HEAVY : THRALL_BLAST_SOFT) * mortarFalloff(dist, radius);
    takeDamage(o, Math.max(1, Math.round(raw)), state.tick);
  }
  state.impacts.push({
    id: state.nextId++,
    ownerId: e.ownerId,
    kind: "kill",
    x: e.x,
    y: e.y,
    vx: 0,
    vy: 0,
    caliber: BLAST_CALIBER,
    blast: true,
    fromId: e.id,
  });
  destroyEntity(state, e);
}

/**
 * A round of `caliber` landed on `e`. On a Thrall, a bullet sometimes (THRALL_STAGGER_CHANCE)
 * catches the shoulder and staggers it, unless it is still staggered or just shook one off.
 */
export function maybeStagger(state: MatchState, e: Entity, caliber: number, rand: () => number): void {
  if (e.type !== "thrall" || e.hp <= 0 || e.wreck) return;
  if (caliber > THRALL_STAGGER_MAX_CALIBER) return;
  if (e.staggered || (e.staggerGuard != null && state.tick < e.staggerGuard)) return;
  if (rand() >= THRALL_STAGGER_CHANCE) return;
  e.staggered = true;
  e.staggerUntil = state.tick + secondsToTicks(THRALL_STAGGER_SECONDS);
}

/** Ends staggers whose time is up. Runs before movement. */
export function tickThralls(state: MatchState): void {
  for (const e of state.entities.values()) {
    if (!e.staggered) continue;
    if (e.hp > 0 && !e.wreck && state.tick < (e.staggerUntil ?? 0)) continue;
    e.staggered = undefined;
    e.staggerUntil = undefined;
    e.staggerGuard = state.tick + secondsToTicks(THRALL_STAGGER_GUARD_SECONDS);
  }
}

/** Standing on sandbags or a wall: the client lifts it over the top. */
export function onFortTop(state: MatchState, e: Entity): boolean {
  const tx = worldToTile(e.x, state.tileSize);
  const ty = worldToTile(e.y, state.tileSize);
  if (!inBounds(state, tx, ty)) return false;
  return (state.fortBlock[tileIndex(state, tx, ty)] ?? 0) === 1;
}

function distTo(state: MatchState, from: Entity, to: Entity): number {
  if (to.kind === "building") {
    const b = buildingBounds(to, state.tileSize);
    const x = Math.min(Math.max(from.x, b.x0), b.x1);
    const y = Math.min(Math.max(from.y, b.y0), b.y1);
    return Math.hypot(from.x - x, from.y - y);
  }
  return Math.hypot(from.x - to.x, from.y - to.y);
}
