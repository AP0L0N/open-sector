import {
  FORCE_SHIELD_DOME,
  FORCE_SHIELD_MARGIN_TILES,
  MOTHERSHIP_DOME_DEPTH,
  NEURAL_PULSAR_DOME,
  NEUTRAL_OWNER,
  SHIELD_WALL_UNITS,
  energyDomeOf,
  energyShieldOf,
  energyWallOf,
  isAircraftType,
  isNeuralPulsar,
  secondsToTicks,
  type EnergyDomeDef,
  type EntityType,
  type EnergyWallDef,
} from "../catalog.js";
import { airAlt, entityHeight, weaponRangeWorld } from "./elevation.js";
import { allies, worldToTile } from "./geo.js";
import { energyRound } from "./remains.js";
import type { Entity, EnergyShield, MatchState, Projectile } from "./types.js";

/**
 * Hive energy walls. A Behemoth, Drone, or Lancer fighting a target in reach
 * raises a curved wall across its front. Drones and Lancers only know how once their side
 * holds a standing Assembly with the Shield Wall researched (sim/research.ts). The wall stays where it went up. Enemy
 * rounds and beams that meet it stop there and take points off it; enemy ground
 * units cannot walk through it. Its own side walks and shoots through.
 * A Weaver throws smaller ones in front of friends under fire (sim/weaver.ts).
 *
 * A Siphon holds a dome instead: the full circle, up only while the Siphon stands
 * still. Walking, it lowers the dome and keeps its energy for when it stops. The
 * dome stops what comes in from outside, rounds dropping from above and blasts and blows too, and its points
 * are the Siphon's energy. Drained, it is gone until the energy fills back up.
 *
 * A Mothership's dome stands round it up in the air (`aloft`): a bubble about the hull, not a
 * circle on the ground. Ground lines and ground units never meet it (shieldSweep, domeOver skip
 * it); rounds that climb into it do (aloftSweep), and an air burst outside it does not reach a
 * flier inside (aloftShelters).
 *
 * An Energy Wall building holds a far wider curtain the same way a wall stands, but for as long
 * as the core is online, across the way the core was placed. Hits drain it, it mends slowly, and
 * drained it is down until the core recharges.
 *
 * A Xenite defence with its Force Shield researched (sim/research.ts) holds a small dome the same
 * way, sized to its footprint, for as long as it stands online. It keeps its own charge
 * (forceShieldHp, forceShieldReady), apart from an Energy Wall's curtain.
 *
 * A Neural Nexus raised to the Neural Pulsar holds one too, over the whole base round it
 * (NEURAL_PULSAR_DOME), on the same store.
 *
 * Pulses and lasers (another hive's bolts, a Cyborg's beam) glance off: a bolt fired flat
 * turns back off the face, live, and a beam stops there. Either still costs the shield, but
 * the first one it takes never breaks it.
 */

/** Where a line first meets an enemy wall: `t` along it, 0–1. */
export interface ShieldHit {
  s: EnergyShield;
  t: number;
  x: number;
  y: number;
}

function wrapPi(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/** First point where (x0,y0)→(x1,y1) crosses the arc, as `t` 0–1, or -1. A dome counts only the way in. */
function crossArc(s: EnergyShield, x0: number, y0: number, x1: number, y1: number): number {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const fx = x0 - s.x;
  const fy = y0 - s.y;
  const a = dx * dx + dy * dy;
  if (a < 1e-9) return -1;
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - s.r * s.r;
  if (s.dome && c <= 0) return -1;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return -1;
  const q = Math.sqrt(disc);
  if (s.dome) {
    const t = (-b - q) / (2 * a);
    return t >= 0 && t <= 1 ? t : -1;
  }
  for (const t of [(-b - q) / (2 * a), (-b + q) / (2 * a)]) {
    if (t < 0 || t > 1) continue;
    const ang = Math.atan2(fy + dy * t, fx + dx * t);
    if (Math.abs(wrapPi(ang - s.angle)) <= s.half) return t;
  }
  return -1;
}

/** The first standing wall not on `ownerId`'s side that the line meets. `domesOnly` skips the walls. */
export function shieldSweep(
  state: MatchState,
  ownerId: string,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  domesOnly = false,
): ShieldHit | null {
  const shields = state.energyShields;
  if (!shields || shields.length === 0) return null;
  let best: ShieldHit | null = null;
  for (const s of shields) {
    if (s.hp <= 0 || s.aloft || (domesOnly && !s.dome) || allies(state, s.ownerId, ownerId)) continue;
    const t = crossArc(s, x0, y0, x1, y1);
    if (t < 0 || (best && t >= best.t)) continue;
    best = { s, t, x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t };
  }
  return best;
}

/** The standing dome not on `ownerId`'s side that holds (x, y), or null. */
export function domeOver(state: MatchState, ownerId: string, x: number, y: number): EnergyShield | null {
  const shields = state.energyShields;
  if (!shields || shields.length === 0) return null;
  for (const s of shields) {
    if (!s.dome || s.aloft || s.hp <= 0 || allies(state, s.ownerId, ownerId)) continue;
    const dx = x - s.x;
    const dy = y - s.y;
    if (dx * dx + dy * dy < s.r * s.r) return s;
  }
  return null;
}

/** (x, y, z) is inside this dome in the air. Its height is stretched to the dome's radius, so the bubble is a ball. */
function insideAloft(s: EnergyShield, x: number, y: number, z: number): boolean {
  const up = s.aloft!;
  const dz = ((z - up.z) * s.r) / Math.max(1e-6, up.depth);
  const dx = x - s.x;
  const dy = y - s.y;
  return dx * dx + dy * dy + dz * dz < s.r * s.r;
}

/** The standing dome in the air, not on `ownerId`'s side, that holds (x, y, z), or null. */
export function aloftOver(state: MatchState, ownerId: string, x: number, y: number, z: number): EnergyShield | null {
  const shields = state.energyShields;
  if (!shields || shields.length === 0) return null;
  for (const s of shields) {
    if (!s.aloft || s.hp <= 0 || allies(state, s.ownerId, ownerId)) continue;
    if (insideAloft(s, x, y, z)) return s;
  }
  return null;
}

/**
 * Where a round's line (x0, y0, z0)→(x1, y1, z1) first goes into an enemy dome in the air, or
 * null. Only the way in counts: a round fired from inside flies out.
 */
export function aloftSweep(
  state: MatchState,
  ownerId: string,
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
): ShieldHit | null {
  const shields = state.energyShields;
  if (!shields || shields.length === 0) return null;
  let best: ShieldHit | null = null;
  for (const s of shields) {
    if (!s.aloft || s.hp <= 0 || allies(state, s.ownerId, ownerId)) continue;
    const k = s.r / Math.max(1e-6, s.aloft.depth);
    const fx = x0 - s.x;
    const fy = y0 - s.y;
    const fz = (z0 - s.aloft.z) * k;
    const dx = x1 - x0;
    const dy = y1 - y0;
    const dz = (z1 - z0) * k;
    const a = dx * dx + dy * dy + dz * dz;
    if (a < 1e-9) continue;
    const c = fx * fx + fy * fy + fz * fz - s.r * s.r;
    if (c <= 0) continue;
    const b = 2 * (fx * dx + fy * dy + fz * dz);
    const disc = b * b - 4 * a * c;
    if (disc < 0) continue;
    const t = (-b - Math.sqrt(disc)) / (2 * a);
    if (t < 0 || t > 1 || (best && t >= best.t)) continue;
    best = { s, t, x: x0 + dx * t, y: y0 + dy * t };
  }
  return best;
}

/**
 * An air burst at (fx, fy, fz) reaching a flier at `victim`: an enemy dome in the air that holds
 * the flier but not the burst takes it instead. True when a dome took it. Pass one `soaked` set
 * for a whole burst so each dome pays for it once.
 */
export function aloftShelters(
  state: MatchState,
  ownerId: string,
  fx: number,
  fy: number,
  fz: number,
  victim: { x: number; y: number; z: number },
  damage: number,
  soaked?: Set<number>,
): boolean {
  const s = aloftOver(state, ownerId, victim.x, victim.y, victim.z);
  if (!s || insideAloft(s, fx, fy, fz)) return false;
  if (soaked?.has(s.id)) return true;
  soaked?.add(s.id);
  soakShield(state, s, damage);
  return true;
}

/** A flier's dome stands round it in the air, as high as it flies. Undefined for a dome on the ground. */
function aloftOf(state: MatchState, e: Entity): EnergyShield["aloft"] {
  if (!isAircraftType(e.type)) return undefined;
  const alt = airAlt(e);
  return { z: entityHeight(state, e) + alt, depth: Math.max(1, alt * MOTHERSHIP_DOME_DEPTH) };
}

/**
 * A round from overhead this step: it meets an enemy dome where its line goes in, or,
 * already over one when the step began, where it began. Walls it falls past.
 */
export function overheadSweep(state: MatchState, ownerId: string, x0: number, y0: number, x1: number, y1: number): ShieldHit | null {
  const over = domeOver(state, ownerId, x0, y0);
  if (over) return { s: over, t: 0, x: x0, y: y0 };
  return shieldSweep(state, ownerId, x0, y0, x1, y1, true);
}

/** The wall or dome takes `damage` off its points and flares. */
export function soakShield(state: MatchState, s: EnergyShield, damage: number): void {
  s.hp = Math.max(0, s.hp - Math.max(1, damage));
  s.hitTick = state.tick;
}

/**
 * A pulse or a laser meets the wall or dome: it loses `damage` off its points, but the first
 * such hit never breaks it, however hard. It stands on what it had, at most one point.
 */
export function soakEnergyStrike(state: MatchState, s: EnergyShield, damage: number): void {
  const before = s.hp;
  soakShield(state, s, damage);
  if (s.hp <= 0 && before > 0 && !s.energyStruck) s.hp = Math.min(before, 1);
  s.energyStruck = true;
}

/** A round stops on the wall: the wall loses the round's damage and the round is spent. */
export function absorbRound(state: MatchState, p: Projectile, hit: ShieldHit): void {
  if (energyRound(state, p.ownerId)) soakEnergyStrike(state, hit.s, p.damage);
  else soakShield(state, hit.s, p.damage);
  state.impacts.push({
    id: state.nextId++,
    ownerId: p.ownerId,
    kind: "ricochet",
    fromId: p.fromId,
    x: hit.x,
    y: hit.y,
    vx: p.vx,
    vy: p.vy,
    caliber: p.caliber,
  });
}

/**
 * A pulse bolt fired flat into an enemy wall or dome: the shield pays for it, and the bolt
 * turns back off its face, mirrored about the arc where it struck, still live and with its
 * full sting. It flies far enough to reach back to the one who fired it.
 */
export function reflectRound(state: MatchState, p: Projectile, hit: ShieldHit): void {
  const s = hit.s;
  soakEnergyStrike(state, s, p.damage);
  let nx = hit.x - s.x;
  let ny = hit.y - s.y;
  const nl = Math.hypot(nx, ny) || 1;
  nx /= nl;
  ny /= nl;
  // The face the bolt came at.
  if (p.vx * nx + p.vy * ny > 0) {
    nx = -nx;
    ny = -ny;
  }
  const dot = p.vx * nx + p.vy * ny;
  p.vx -= 2 * dot * nx;
  p.vy -= 2 * dot * ny;
  p.vz = 0;
  const sp = Math.hypot(p.vx, p.vy) || 1;
  p.x = hit.x + (p.vx / sp) * 3;
  p.y = hit.y + (p.vy / sp) * 3;
  // The wall's own unit stands behind it; the shooter is fair game now.
  p.ignoreId = s.fromId;
  const from = state.entities.get(p.fromId);
  const back = from ? Math.hypot(from.x - hit.x, from.y - hit.y) : 0;
  p.life = Math.max(p.life, (back + state.tileSize * 2) / sp);
  s.hitTick = state.tick;
  state.impacts.push({
    id: state.nextId++,
    ownerId: p.ownerId,
    kind: "ricochet",
    fromId: p.fromId,
    x: hit.x,
    y: hit.y,
    vx: p.vx,
    vy: p.vy,
    caliber: p.caliber,
  });
}

/** A shell, bomb, or thrown hammer coming down at (p.x, p.y): an enemy dome over it takes the round instead. True when it did. */
export function catchLanding(state: MatchState, p: Projectile): boolean {
  const s = domeOver(state, p.ownerId, p.x, p.y);
  if (!s) return false;
  absorbRound(state, p, { s, t: 1, x: p.x, y: p.y });
  return true;
}

/**
 * A blast or blow from (fx, fy) reaching `victim`: an enemy dome that holds the victim but
 * not the source takes it instead. True when a dome took it. Pass one `soaked` set for a
 * whole blast so each dome pays for that blast once, however many it shelters.
 */
export function domeShelters(
  state: MatchState,
  ownerId: string,
  fx: number,
  fy: number,
  victim: { x: number; y: number },
  damage: number,
  soaked?: Set<number>,
): boolean {
  const s = domeOver(state, ownerId, victim.x, victim.y);
  if (!s) return false;
  const dx = fx - s.x;
  const dy = fy - s.y;
  if (dx * dx + dy * dy < s.r * s.r) return false;
  if (soaked?.has(s.id)) return true;
  soaked?.add(s.id);
  soakShield(state, s, damage);
  return true;
}

function canRaise(state: MatchState, e: Entity): boolean {
  if (e.kind !== "unit" || e.hp <= 0 || e.shutdown || e.dormant || e.garrisonedIn != null || e.lunge) return false;
  if (e.shieldReady != null && state.tick < e.shieldReady) return false;
  if (e.attackTarget == null) return false;
  const target = state.entities.get(e.attackTarget);
  if (!target || target.hp <= 0 || allies(state, e.ownerId, target.ownerId)) return false;
  const reach = weaponRangeWorld(state, e) + target.radius;
  const dx = target.x - e.x;
  const dy = target.y - e.y;
  return dx * dx + dy * dy <= reach * reach;
}

const DRILLED: ReadonlySet<EntityType> = new Set(SHIELD_WALL_UNITS);

/** Sides holding a standing Assembly with the Shield Wall: their Drones and Lancers raise walls. */
export function shieldWallSides(state: MatchState): Set<string> {
  const sides = new Set<string>();
  for (const e of state.entities.values()) {
    if (e.shieldWall && e.kind === "building" && e.hp > 0 && !e.ruined && !e.wreck) sides.add(e.ownerId);
  }
  return sides;
}

/**
 * A Siphon holds its dome whenever it is alive, running, out in the open, and standing still; a Hive
 * Ark or Mothership carries its own on the move. A shielded defence holds one while it stands online.
 */
function canHoldDome(e: Entity): boolean {
  if (e.kind === "building") return heldForceDome(e) && e.ownerId !== NEUTRAL_OWNER && e.hp > 0 && !e.ruined && !e.wreck && !e.unpowered;
  if (e.kind !== "unit" || e.hp <= 0 || e.wreck || e.shutdown || e.dormant || e.garrisonedIn != null) return false;
  return !(energyDomeOf(e.type)?.still && e.waypoints.length > 0);
}

/** The dome `e` holds: its type's own (a Siphon's, a Hive Ark's), or its Force Shield's, a little past its footprint. */
export function domeOf(e: Pick<Entity, "type" | "level" | "forceShield" | "tileW" | "tileH">): EnergyDomeDef | undefined {
  const own = energyDomeOf(e.type);
  if (own) return own;
  if (isNeuralPulsar(e)) return NEURAL_PULSAR_DOME;
  if (!e.forceShield) return undefined;
  return { ...FORCE_SHIELD_DOME, radiusTiles: Math.max(e.tileW, e.tileH) / 2 + FORCE_SHIELD_MARGIN_TILES };
}

/** A structure holding a dome of its own research: a Force Shield, or the Neural Pulsar's. */
function heldForceDome(e: Pick<Entity, "type" | "level" | "forceShield">): boolean {
  return !!e.forceShield || isNeuralPulsar(e);
}

/** A Force Shield keeps its charge apart from anything else the structure holds (an Energy Wall's curtain). */
function forceDome(e: Entity): boolean {
  return !energyDomeOf(e.type) && heldForceDome(e);
}

/**
 * A dome's turn: it rides on its Siphon and slowly regains energy. Drained, it is gone and the
 * Siphon waits out the recharge; lowered for any other reason, the Siphon keeps what was left.
 * True while it still stands.
 */
function tickDome(state: MatchState, s: EnergyShield, dt: number): boolean {
  const from = state.entities.get(s.fromId);
  const def = from ? domeOf(from) : undefined;
  if (!from || !def) return false;
  const own = forceDome(from);
  if (s.hp <= 0) {
    if (own) {
      from.forceShieldHp = undefined;
      from.forceShieldReady = state.tick + secondsToTicks(def.rechargeSeconds);
    } else {
      from.energy = undefined;
      from.shieldReady = state.tick + secondsToTicks(def.rechargeSeconds);
    }
    return false;
  }
  if (!canHoldDome(from)) {
    if (from.hp > 0) {
      if (own) from.forceShieldHp = s.hp;
      else from.energy = s.hp;
    }
    return false;
  }
  s.x = from.x;
  s.y = from.y;
  const aloft = aloftOf(state, from);
  if (aloft) s.aloft = aloft;
  s.hp = Math.min(s.hpMax, s.hp + def.regenPerSecond * dt);
  return true;
}

function castDome(state: MatchState, e: Entity, def: EnergyDomeDef): void {
  state.energyShields!.push({
    id: state.nextId++,
    ownerId: e.ownerId,
    fromId: e.id,
    x: e.x,
    y: e.y,
    angle: 0,
    half: Math.PI,
    r: def.radiusTiles * state.tileSize,
    hp: Math.min(def.energy, (forceDome(e) ? e.forceShieldHp : e.energy) ?? def.energy),
    hpMax: def.energy,
    life: 0,
    dome: true,
    ...(isAircraftType(e.type) ? { aloft: aloftOf(state, e) } : {}),
  });
  if (forceDome(e)) e.forceShieldHp = undefined;
  else e.energy = undefined;
}

/** An Energy Wall core holds its curtain while it stands, held and online. */
function canHoldCurtain(e: Entity): boolean {
  return e.kind === "building" && e.ownerId !== NEUTRAL_OWNER && e.hp > 0 && !e.ruined && !e.wreck && !e.unpowered;
}

/**
 * An Energy Wall's curtain: it faces the way the core was placed and slowly mends. Drained, it is
 * gone and the core waits out the recharge; lowered because the core went offline, the core
 * keeps what was left. True while it still stands.
 */
function tickCurtain(state: MatchState, s: EnergyShield, dt: number): boolean {
  const from = state.entities.get(s.fromId);
  const def = from ? energyWallOf(from.type) : undefined;
  if (!from || !def) return false;
  if (s.hp <= 0) {
    from.energy = undefined;
    from.shieldReady = state.tick + secondsToTicks(def.rechargeSeconds);
    return false;
  }
  if (!canHoldCurtain(from)) {
    if (from.hp > 0) from.energy = s.hp;
    return false;
  }
  s.hp = Math.min(s.hpMax, s.hp + def.regenPerSecond * dt);
  return true;
}

function raiseCurtain(state: MatchState, e: Entity, def: EnergyWallDef): void {
  state.energyShields!.push({
    id: state.nextId++,
    ownerId: e.ownerId,
    fromId: e.id,
    x: e.x,
    y: e.y,
    angle: e.facing,
    half: (def.halfDeg * Math.PI) / 180,
    r: def.radiusTiles * state.tileSize,
    hp: Math.min(def.hp, e.energy ?? def.hp),
    hpMax: def.hp,
    life: 0,
    post: true,
  });
  e.energy = undefined;
}

/**
 * Walls burn down and break; a fighting Behemoth, Drone, or Lancer without one raises the next. Siphons cast and carry their domes.
 * An Energy Wall raises its curtain whenever it is online and ready.
 */
export function tickEnergyShields(state: MatchState, dt: number): void {
  const shields = (state.energyShields ??= []);
  if (shields.length > 0) {
    const keep: EnergyShield[] = [];
    for (const s of shields) {
      if (s.dome) {
        // A Weaver's dome runs on its cell: sim/weaver.ts keeps it.
        if (s.weave || tickDome(state, s, dt)) keep.push(s);
        continue;
      }
      if (s.post) {
        if (tickCurtain(state, s, dt)) keep.push(s);
        continue;
      }
      s.life -= dt;
      if (s.hp > 0 && s.life > 0) {
        keep.push(s);
        continue;
      }
      const from = state.entities.get(s.fromId);
      const def = from ? energyShieldOf(from.type) : undefined;
      if (from && def) from.shieldReady = state.tick + secondsToTicks(def.rechargeSeconds);
    }
    state.energyShields = keep;
  }
  // A shielded Energy Wall holds its curtain and its dome at once: each is kept apart.
  const standing = new Set<number>();
  const domed = new Set<number>();
  let drilled: Set<string> | undefined;
  for (const s of state.energyShields!) (s.dome ? domed : standing).add(s.fromId);
  for (const e of state.entities.values()) {
    if (heldForceDome(e) && !domed.has(e.id) && canHoldDome(e) && (e.forceShieldReady == null || state.tick >= e.forceShieldReady)) {
      castDome(state, e, domeOf(e)!);
    }
    if (standing.has(e.id)) continue;
    if (domed.has(e.id) && !energyWallOf(e.type)) continue;
    const dome = energyDomeOf(e.type);
    if (dome) {
      if (canHoldDome(e) && (e.shieldReady == null || state.tick >= e.shieldReady)) castDome(state, e, dome);
      continue;
    }
    const curtain = energyWallOf(e.type);
    if (curtain) {
      if (canHoldCurtain(e) && (e.shieldReady == null || state.tick >= e.shieldReady)) raiseCurtain(state, e, curtain);
      continue;
    }
    const def = energyShieldOf(e.type);
    if (!def || !canRaise(state, e)) continue;
    if (DRILLED.has(e.type) && !(drilled ??= shieldWallSides(state)).has(e.ownerId)) continue;
    const target = state.entities.get(e.attackTarget!)!;
    state.energyShields!.push({
      id: state.nextId++,
      ownerId: e.ownerId,
      fromId: e.id,
      x: e.x,
      y: e.y,
      angle: Math.atan2(target.y - e.y, target.x - e.x),
      half: (def.halfDeg * Math.PI) / 180,
      r: def.arcPx,
      hp: def.hp,
      hpMax: def.hp,
      life: def.seconds,
    });
  }
}

/** A Force Shield's (or the Neural Pulsar's) points and its full charge: the dome's while it stands, what it kept while lowered, 0 while it recharges. */
export function forceShieldView(state: MatchState, e: Entity): { hp: number; max: number } | undefined {
  if (!heldForceDome(e) || e.hp <= 0 || e.wreck) return undefined;
  const def = domeOf(e);
  if (!def) return undefined;
  const up = state.energyShields?.find((s) => s.dome && s.fromId === e.id);
  const hp = up ? up.hp : e.forceShieldReady != null && state.tick < e.forceShieldReady ? 0 : (e.forceShieldHp ?? def.energy);
  return { hp: Math.ceil(hp), max: def.energy };
}

/** A Siphon's energy, or an Energy Wall's curtain, 0–1: its points while it stands, else how far the recharge has come. Undefined for other types. */
export function domeCharge(state: MatchState, e: Entity): number | undefined {
  const dome = energyDomeOf(e.type);
  const wall = energyWallOf(e.type);
  const def = dome ? { full: dome.energy, recharge: dome.rechargeSeconds } : wall ? { full: wall.hp, recharge: wall.rechargeSeconds } : null;
  if (!def || e.hp <= 0 || e.wreck) return undefined;
  const up = state.energyShields?.find((s) => (s.dome || s.post) && s.fromId === e.id);
  let share: number;
  if (up) share = up.hp / up.hpMax;
  else if (e.shieldReady != null && state.tick < e.shieldReady) {
    share = 1 - (e.shieldReady - state.tick) / Math.max(1, secondsToTicks(def.recharge));
  } else share = (e.energy ?? def.full) / def.full;
  return Math.round(Math.max(0, Math.min(1, share)) * 100) / 100;
}

/** Ground units that could walk into an enemy wall this tick, and where they stood. Null with no walls up. */
export function shieldWatch(state: MatchState): Map<Entity, { x: number; y: number }> | null {
  if (!state.energyShields || state.energyShields.length === 0) return null;
  const at = new Map<Entity, { x: number; y: number }>();
  for (const e of state.entities.values()) {
    if (e.kind !== "unit" || e.hp <= 0 || e.garrisonedIn != null || e.air || e.jet || e.drone) continue;
    at.set(e, { x: e.x, y: e.y });
  }
  return at;
}

/** A unit whose step took it through an enemy wall, or into an enemy dome, is put back where it stood. */
export function holdShieldLines(state: MatchState, watch: Map<Entity, { x: number; y: number }> | null): void {
  if (!watch) return;
  for (const [e, from] of watch) {
    if (e.hp <= 0 || e.lunge || (from.x === e.x && from.y === e.y)) continue;
    if (!shieldSweep(state, e.ownerId, from.x, from.y, e.x, e.y)) continue;
    e.x = from.x;
    e.y = from.y;
    e.tileX = worldToTile(e.x, state.tileSize);
    e.tileY = worldToTile(e.y, state.tileSize);
  }
}
