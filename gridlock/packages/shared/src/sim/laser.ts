import {
  COMMANDER_HP_REGEN_PER_SEC,
  FORCE_FIELD_DELAY,
  FORCE_FIELD_DIVERT_MUL,
  FORCE_FIELD_DOWN_DELAY,
  FORCE_FIELD_REGEN_PER_SEC,
  forceFieldMax,
  LASER,
  LASER_BEAM_HALF_WIDTH,
  LASER_FIRE_RADIUS,
  LASER_FIRE_SECONDS,
  LASER_FIRE_SPACING,
  LASER_LINE_DAMAGE,
  LASER_LINE_SECONDS,
  LASER_SWEEP_CYBORG_DAMAGE,
  LASER_SWEEP_HALF_DEG,
  LASER_SWEEP_SECONDS,
  hasForceField,
  isCyborg,
  isFieldStructure,
  isInfantryType,
  leavesWreck,
  secondsToTicks,
} from "../catalog.js";
import { isAirborne } from "./air.js";
import { takeDamage } from "./crits.js";
import { coverStrike, wallSweep } from "./field.js";
import { igniteAt } from "./flame.js";
import { garrisonIsHostile, livingGarrison, woundGarrison } from "./garrison.js";
import { burnTreeAt, occupant, tileCenter, worldToTile } from "./geo.js";
import type { Entity, LaserBeam, MatchState } from "./types.js";

/** Points along a sweep where the beam's length is measured. */
export const LASER_SAMPLES = 9;

/**
 * The force field comes back after a while out of the fire. A field that still
 * holds starts after FORCE_FIELD_DELAY; one knocked flat waits FORCE_FIELD_DOWN_DELAY.
 * With the laser's power diverted, it holds and recharges FORCE_FIELD_DIVERT_MUL times over.
 * His plating mends itself at COMMANDER_HP_REGEN_PER_SEC, under fire or not.
 */
export function tickForceFields(state: MatchState, dt: number): void {
  for (const e of state.entities.values()) {
    if (!hasForceField(e.type) || e.hp <= 0) continue;
    // Whole points, one every so often, so the readout never shows a fraction.
    if (e.hp < e.hpMax && state.tick % secondsToTicks(1 / COMMANDER_HP_REGEN_PER_SEC) === 0) {
      e.hp = Math.min(e.hpMax, e.hp + 1);
    }
    const max = forceFieldMax(e);
    const field = e.field ?? 0;
    if (field >= max) {
      e.field = max;
      continue;
    }
    const quiet = field > 0 ? FORCE_FIELD_DELAY : FORCE_FIELD_DOWN_DELAY;
    if (e.fieldHitTick != null && state.tick - e.fieldHitTick < secondsToTicks(quiet)) continue;
    const rate = FORCE_FIELD_REGEN_PER_SEC * (e.fieldDivert ? FORCE_FIELD_DIVERT_MUL : 1);
    e.field = Math.min(max, field + rate * dt);
  }
}

/**
 * How far the beam reaches along `angle` before a building or a concrete line
 * stops it, out to `max`. The building he is holed up in does not count.
 */
export function beamLength(state: MatchState, e: Entity, angle: number, max: number): number {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  let reach = max;
  const wall = wallSweep(state, e.x, e.y, e.x + dx * max, e.y + dy * max);
  if (wall) reach = Math.min(reach, wall.t * max);
  const step = state.tileSize * 0.25;
  for (let d = e.radius; d < reach; d += step) {
    const id = occupant(state, worldToTile(e.x + dx * d, state.tileSize), worldToTile(e.y + dy * d, state.tileSize));
    if (!id || id === e.garrisonedIn) continue;
    const o = state.entities.get(id);
    if (!o || o.kind !== "building" || o.hp <= 0 || isFieldStructure(o.type)) continue;
    return d;
  }
  return reach;
}

/**
 * Fire the laser. A soldier (or the ground) gets the sweep: full reach, from one
 * side of the aim to the other, alternating each shot. Anything else gets one
 * straight beam that lands now.
 */
export function fireLaser(
  state: MatchState,
  e: Entity,
  aimX: number,
  aimY: number,
  range: number,
  target: Entity | undefined,
): void {
  const bearing = Math.atan2(aimY - e.y, aimX - e.x);
  if (target && !isInfantryType(target.type)) {
    const dist = Math.hypot(target.x - e.x, target.y - e.y);
    e.laser = {
      a0: bearing,
      a1: bearing,
      startTick: state.tick,
      endTick: state.tick + secondsToTicks(LASER_LINE_SECONDS),
      lens: [dist],
      line: true,
      swept: 1,
      hit: [target.id],
    };
    burnTreesAlong(state, e, bearing, dist);
    burnSoldiersAlong(state, e, bearing, dist, target.id);
    strikeLine(state, e, target, bearing);
    return;
  }
  const half = (LASER_SWEEP_HALF_DEG * Math.PI) / 180;
  const side = e.laserFlip ? -1 : 1;
  e.laserFlip = !e.laserFlip;
  const a0 = bearing - half * side;
  const a1 = bearing + half * side;
  const lens: number[] = [];
  for (let i = 0; i < LASER_SAMPLES; i++) {
    lens.push(Math.round(beamLength(state, e, a0 + ((a1 - a0) * i) / (LASER_SAMPLES - 1), range)));
  }
  e.laser = {
    a0,
    a1,
    startTick: state.tick,
    endTick: state.tick + secondsToTicks(LASER_SWEEP_SECONDS),
    lens,
    swept: 0,
    hit: [],
  };
}

/** Beam length at share `u` of the sweep. */
export function laserLenAt(lens: readonly number[], u: number): number {
  if (lens.length === 1) return lens[0]!;
  const f = Math.min(1, Math.max(0, u)) * (lens.length - 1);
  const i = Math.min(lens.length - 2, Math.floor(f));
  return lens[i]! + (lens[i + 1]! - lens[i]!) * (f - i);
}

/** Share of the sweep cut by the end of this tick. */
export function laserProgress(beam: Pick<LaserBeam, "startTick" | "endTick">, tick: number): number {
  const total = Math.max(1, beam.endTick - beam.startTick);
  return Math.min(1, Math.max(0, (tick - beam.startTick + 1) / total));
}

/** Beams in the air: a sweep cuts its next slice, and a beam that has run its time goes out. */
export function tickLasers(state: MatchState): void {
  for (const e of state.entities.values()) {
    const beam = e.laser;
    if (!beam) continue;
    if (e.hp <= 0 || state.tick >= beam.endTick) {
      e.laser = undefined;
      continue;
    }
    if (beam.line) continue;
    const u = laserProgress(beam, state.tick);
    if (u <= beam.swept && beam.swept > 0) continue;
    cutSweep(state, e, beam, beam.swept, u);
    beam.swept = u;
  }
}

function wrapAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

/** The slice of the sweep from share u0 to u1: burn who the beam passes, and light the cut at its tip. */
function cutSweep(state: MatchState, e: Entity, beam: LaserBeam, u0: number, u1: number): void {
  const span = beam.a1 - beam.a0;
  const absSpan = Math.max(1e-6, Math.abs(span));
  for (const o of state.entities.values()) {
    if (o.id === e.id || o.kind !== "unit" || o.hp <= 0 || o.wreck || o.garrisonedIn != null) continue;
    if (!isInfantryType(o.type) || o.drone || isAirborne(o)) continue;
    // The beam does not know whose men it passes: friend or foe, they burn.
    if (beam.hit.includes(o.id)) continue;
    const dx = o.x - e.x;
    const dy = o.y - e.y;
    const d = Math.hypot(dx, dy);
    if (d < 1) continue;
    const u = wrapAngle(Math.atan2(dy, dx) - beam.a0) / span;
    const pad = Math.asin(Math.min(1, (o.radius + LASER_BEAM_HALF_WIDTH) / d)) / absSpan;
    if (u + pad < u0 || u - pad > u1) continue;
    if (d - o.radius > laserLenAt(beam.lens, u)) continue;
    beam.hit.push(o.id);
    burnSoldier(state, e, o, dx / d, dy / d);
  }
  const reach = Math.max(...beam.lens);
  // Every tree the beam swings across this slice goes up. Rays close enough at the far end that none slips between.
  const rays = Math.max(1, Math.ceil((absSpan * (u1 - u0) * reach) / (state.tileSize * 0.5)));
  for (let k = 0; k <= rays; k++) {
    const u = u0 + ((u1 - u0) * k) / rays;
    burnTreesAlong(state, e, beam.a0 + span * u, laserLenAt(beam.lens, u));
  }
  const n = Math.max(2, Math.ceil((absSpan * reach) / LASER_FIRE_SPACING) + 1);
  for (let k = 0; k < n; k++) {
    const uk = k / (n - 1);
    if (!(uk > u0 || (u0 === 0 && uk === 0)) || uk > u1) continue;
    const a = beam.a0 + span * uk;
    const len = laserLenAt(beam.lens, uk);
    igniteAt(state, e.x + Math.cos(a) * len, e.y + Math.sin(a) * len, e.ownerId, {
      radius: LASER_FIRE_RADIUS,
      life: LASER_FIRE_SECONDS,
    });
  }
}

/**
 * The beam burns down every tree along it out to `len`, and each one leaves a
 * small fire where it stood. Trees do not stop the beam.
 */
function burnTreesAlong(state: MatchState, e: Entity, angle: number, len: number): void {
  const ts = state.tileSize;
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  for (let d = e.radius; d <= len; d += ts * 0.5) {
    const tx = worldToTile(e.x + dx * d, ts);
    const ty = worldToTile(e.y + dy * d, ts);
    if (!burnTreeAt(state, tx, ty)) continue;
    igniteAt(state, tileCenter(tx, ts), tileCenter(ty, ts), e.ownerId, { radius: LASER_FIRE_RADIUS, life: LASER_FIRE_SECONDS });
  }
}

/** Soldiers standing on a straight beam between him and its target burn, friend or foe. */
function burnSoldiersAlong(state: MatchState, e: Entity, angle: number, len: number, targetId: number): void {
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  for (const o of state.entities.values()) {
    if (o.id === e.id || o.id === targetId || o.kind !== "unit" || o.hp <= 0 || o.wreck || o.garrisonedIn != null) continue;
    if (!isInfantryType(o.type) || o.drone || isAirborne(o)) continue;
    const dx = o.x - e.x;
    const dy = o.y - e.y;
    const along = dx * ux + dy * uy;
    if (along < 0 || along > len) continue;
    if (Math.abs(dx * uy - dy * ux) > o.radius + LASER_BEAM_HALF_WIDTH) continue;
    burnSoldier(state, e, o, ux, uy);
  }
}

/** The sweep passes a soldier: he burns where he stands. A cyborg's plating takes a heavy cut instead. */
function burnSoldier(state: MatchState, e: Entity, o: Entity, ux: number, uy: number): void {
  const before = o.hp;
  takeDamage(o, isCyborg(o.type) ? LASER_SWEEP_CYBORG_DAMAGE : o.hp, state.tick);
  if (before > 0 && o.hp <= 0 && !isCyborg(o.type)) o.fireDeath = true;
  state.impacts.push({
    id: state.nextId++,
    ownerId: e.ownerId,
    kind: o.hp <= 0 ? "kill" : "hit",
    x: o.x,
    y: o.y,
    vx: ux,
    vy: uy,
    fromId: e.id,
    caliber: LASER.caliber,
    laser: true,
  });
}

/** One straight beam onto a hull, a building, or a wreck. It cuts any plate from any face. */
function strikeLine(state: MatchState, e: Entity, target: Entity, bearing: number): void {
  const before = target.hp;
  if (target.kind === "building" && livingGarrison(state, target).length > 0 && garrisonIsHostile(state, e.ownerId, target)) {
    woundGarrison(state, target, LASER_LINE_DAMAGE, LASER.caliber);
  } else {
    coverStrike(target, LASER_LINE_DAMAGE, state.tick, false);
  }
  const lethal = before > 0 && target.hp <= 0;
  state.impacts.push({
    id: state.nextId++,
    ownerId: e.ownerId,
    kind: lethal ? "kill" : "hit",
    x: target.x,
    y: target.y,
    vx: Math.cos(bearing),
    vy: Math.sin(bearing),
    fromId: e.id,
    caliber: LASER.caliber,
    blast: lethal && !target.wreck && (target.kind === "building" || leavesWreck(target.type)) ? true : undefined,
    laser: true,
  });
  if (target.kind === "unit") {
    igniteAt(state, target.x, target.y, e.ownerId, { radius: LASER_FIRE_RADIUS, life: LASER_FIRE_SECONDS });
  }
}
