import {
  WEAVER_MEND_CYBORG,
  WEAVER_MEND_HEAVY,
  WEAVER_PULSE_SECONDS,
  WEAVER_REACH_TILES,
  WEAVER_SHIELD,
  WEAVER_SHIELD_GAP_SECONDS,
  WEAVER_SHIELD_REACH_TILES,
  factionOf,
  isCyborg,
  secondsToTicks,
  staysAloft,
} from "../catalog.js";
import { isAirborne } from "./air.js";
import { weaponRangeWorld } from "./elevation.js";
import { allies } from "./geo.js";
import { drawPlasma, plasmaShots } from "./hive-ammo.js";
import type { Entity, MatchState } from "./types.js";

/**
 * The Weaver's mend. Every WEAVER_PULSE_SECONDS a working Weaver sends HP into each hive unit of
 * its side within WEAVER_REACH_TILES: WEAVER_MEND_CYBORG to a cyborg, WEAVER_MEND_HEAVY to any
 * other Xenomorph body. A unit in reach of two Weavers on the same tick mends once; a Weaver never
 * mends itself. Torn cyborg legs come back through syncCyborgLegs once the HP is there.
 */

export function isWeaver(type: string): boolean {
  return type === "weaver";
}

/** Can this Weaver mend now: alive, on its feet or crawling, linked, powered, and out in the open. */
function mending(e: Entity): boolean {
  return isWeaver(e.type) && e.hp > 0 && !e.wreck && !e.shutdown && !e.dormant && e.garrisonedIn == null;
}

/** May `w` mend `o`: a live Xenomorph unit of its side, not inside, not itself, hurt; in the air only a Xenomorph flier, which has no nest to mend on. */
export function weaverMends(state: MatchState, w: Entity, o: Entity): boolean {
  if (o === w || o.kind !== "unit" || o.hp <= 0 || o.wreck || o.hp >= o.hpMax) return false;
  if (factionOf(o.type) !== "xeno" || o.garrisonedIn != null || (isAirborne(o) && !staysAloft(o.type))) return false;
  if (!allies(state, w.ownerId, o.ownerId)) return false;
  const reach = WEAVER_REACH_TILES * state.tileSize;
  return Math.hypot(o.x - w.x, o.y - w.y) <= reach + o.radius;
}

export function mendAmount(type: Entity["type"]): number {
  return isCyborg(type) ? WEAVER_MEND_CYBORG : WEAVER_MEND_HEAVY;
}

export function tickWeavers(state: MatchState): void {
  let pulsing: Entity[] | null = null;
  for (const e of state.entities.values()) {
    if (!mending(e)) continue;
    if (e.mendNext == null) e.mendNext = state.tick + secondsToTicks(WEAVER_PULSE_SECONDS);
    if (state.tick < e.mendNext) continue;
    e.mendNext = state.tick + secondsToTicks(WEAVER_PULSE_SECONDS);
    (pulsing ??= []).push(e);
  }
  if (!pulsing) return;
  const mended = new Set<number>();
  for (const o of state.entities.values()) {
    if (o.kind !== "unit" || o.hp <= 0 || o.hp >= o.hpMax || factionOf(o.type) !== "xeno") continue;
    for (const w of pulsing) {
      if (mended.has(o.id) || !weaverMends(state, w, o)) continue;
      o.hp = Math.min(o.hpMax, o.hp + mendAmount(o.type));
      mended.add(o.id);
    }
  }
}

/**
 * The Weaver's shields. A working Weaver with a quarter of its cell charged throws a WEAVER_SHIELD in
 * front of a unit of its side under fire within WEAVER_SHIELD_REACH_TILES, itself included: the wall
 * stands about the friend, facing the nearest enemy shooting at it. "Under fire" means an enemy has it
 * as its target and in reach. The friend most hurt goes first, then the nearest. A friend behind its own
 * wall or another Weaver's gets none, so two Weavers never double up on one unit.
 */
export function tickWeaverShields(state: MatchState): void {
  let ready: Entity[] | null = null;
  for (const e of state.entities.values()) {
    if (!mending(e) || isAirborne(e) || plasmaShots(e) < 1) continue;
    if (e.shieldReady != null && state.tick < e.shieldReady) continue;
    (ready ??= []).push(e);
  }
  if (!ready) return;
  const fire = underFire(state);
  if (fire.size === 0) return;
  const walls = (state.energyShields ??= []);
  const guarded = new Set<number>();
  for (const s of walls) if (s.hp > 0) guarded.add(s.forId ?? s.fromId);
  const reach = WEAVER_SHIELD_REACH_TILES * state.tileSize;
  for (const w of ready) {
    let best: Entity | null = null;
    let bestHurt = Infinity;
    let bestD = Infinity;
    for (const id of fire.keys()) {
      if (guarded.has(id)) continue;
      const o = state.entities.get(id)!;
      if (!allies(state, w.ownerId, o.ownerId)) continue;
      const d = Math.hypot(o.x - w.x, o.y - w.y);
      if (d > reach + o.radius) continue;
      const hurt = o.hp / Math.max(1, o.hpMax);
      if (hurt > bestHurt || (hurt === bestHurt && d >= bestD)) continue;
      best = o;
      bestHurt = hurt;
      bestD = d;
    }
    if (!best) continue;
    const from = fire.get(best.id)!;
    walls.push({
      id: state.nextId++,
      ownerId: w.ownerId,
      fromId: w.id,
      forId: best.id,
      x: best.x,
      y: best.y,
      angle: Math.atan2(from.y - best.y, from.x - best.x),
      half: (WEAVER_SHIELD.halfDeg * Math.PI) / 180,
      r: WEAVER_SHIELD.arcPx,
      hp: WEAVER_SHIELD.hp,
      hpMax: WEAVER_SHIELD.hp,
      life: WEAVER_SHIELD.seconds,
    });
    drawPlasma(w);
    w.shieldReady = state.tick + secondsToTicks(WEAVER_SHIELD_GAP_SECONDS);
    guarded.add(best.id);
  }
}

/** Ground units under fire, each with the nearest enemy that has it targeted and in reach. */
function underFire(state: MatchState): Map<number, Entity> {
  const out = new Map<number, Entity>();
  const dist = new Map<number, number>();
  for (const a of state.entities.values()) {
    if (a.attackTarget == null || a.hp <= 0 || a.wreck || a.shutdown || a.dormant || isAirborne(a)) continue;
    const o = state.entities.get(a.attackTarget);
    if (!o || o.kind !== "unit" || o.hp <= 0 || o.wreck || o.garrisonedIn != null || isAirborne(o)) continue;
    if (allies(state, a.ownerId, o.ownerId)) continue;
    const range = weaponRangeWorld(state, a);
    if (range <= 0) continue;
    const d = Math.hypot(o.x - a.x, o.y - a.y);
    if (d > range + o.radius || d >= (dist.get(o.id) ?? Infinity)) continue;
    out.set(o.id, a);
    dist.set(o.id, d);
  }
  return out;
}
