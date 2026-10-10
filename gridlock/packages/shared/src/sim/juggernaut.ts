import {
  JUGGERNAUT_FIST_BLAST_TILES,
  JUGGERNAUT_FIST_BUILDING,
  JUGGERNAUT_FIST_HULL,
  JUGGERNAUT_FIST_PACE_MUL,
  JUGGERNAUT_FIST_SECONDS,
  JUGGERNAUT_FIST_SOLDIER,
  JUGGERNAUT_HAMMER_BLAST_TILES,
  JUGGERNAUT_HAMMER_BUILDING,
  JUGGERNAUT_HAMMER_HULL,
  JUGGERNAUT_HAMMER_SECONDS,
  JUGGERNAUT_HAMMER_SOLDIER,
  JUGGERNAUT_RAGE_HP,
  JUGGERNAUT_RAM_BUILDING,
  JUGGERNAUT_RAM_HULL,
  JUGGERNAUT_RAM_MIN_TILES,
  JUGGERNAUT_RAM_RANGE_TILES,
  JUGGERNAUT_RAM_RECHARGE_SECONDS,
  JUGGERNAUT_RAM_SHOVE_TILES,
  JUGGERNAUT_RAM_SPEED_TILES,
  JUGGERNAUT_RAM_TRAMPLE_HULL,
  JUGGERNAUT_RAM_TRAMPLE_SOLDIER,
  JUGGERNAUT_SPRINT_MUL,
  JUGGERNAUT_THROW_BLAST_TILES,
  JUGGERNAUT_THROW_BUILDING,
  JUGGERNAUT_THROW_HULL,
  JUGGERNAUT_THROW_RANGE_TILES,
  JUGGERNAUT_THROW_SOLDIER,
  JUGGERNAUT_THROW_SPEED_TILES,
  TICK_DT,
  catalog,
  factionDamage,
  isArmoredType,
  isBridge,
  isInfantryType,
  isJuggernaut,
  isNavalType,
  isRubble,
  secondsToTicks,
} from "../catalog.js";
import type { ImpactKind } from "../protocol.js";
import { isAirborne } from "./air.js";
import { takeDamage } from "./crits.js";
import { wallsShieldGarrison, woundGarrison } from "./garrison.js";
import { allies, buildingBounds, inBounds, isWater, ownerless, playerTeam, walkable, worldToTile } from "./geo.js";
import { mortarFalloff } from "./mortar.js";
import { diving } from "./naval.js";
import { nextRand } from "./rng.js";
import { gapTo, hiddenFromAuto, inStrikeReach } from "./simunit.js";
import type { Entity, MatchState, Projectile } from "./types.js";
import { canSeeEntity } from "./vision.js";

/**
 * The Juggernaut: a giant with a two-handed hammer.
 *
 * Sprint: while it closes on what it is going for (a named attack, an auto pick, an attack-move
 * target) and that stands past its reach, it runs at JUGGERNAUT_SPRINT_MUL times its walk.
 *
 * Blows land at once, like the Sim Unit's cut, but in an area round the point struck: every
 * enemy soldier, hull, and building inside takes the blow, falling off toward the rim. Plate
 * does not turn it. Its own side is spared.
 *
 * Rage: at JUGGERNAUT_RAGE_HP of its pool it throws the hammer, once, at the strongest enemy it
 * sees inside JUGGERNAUT_THROW_RANGE_TILES. The hammer flies on an arc and lands in a bigger
 * blast. From then on it fights with its fists: lighter, tighter blows on a much shorter clock,
 * and it moves JUGGERNAUT_FIST_PACE_MUL faster. Nothing in reach to throw at: it keeps swinging.
 *
 * Ram: every JUGGERNAUT_RAM_RECHARGE_SECONDS it charges by itself. The mark is an enemy armored
 * hull JUGGERNAUT_RAM_MIN_TILES to JUGGERNAUT_RAM_RANGE_TILES off with clear ground to it, or the
 * enemy building it is ordered to attack; never a soldier. Under a named attack it charges only that target.
 * It runs at JUGGERNAUT_RAM_SPEED_TILES, steering on the mark, neither walking nor swinging, and
 * runs down every enemy it passes (once a charge). On contact it slams: a heavy blow through any
 * plate that throws the hull back, or massive damage to a building. A wall or the water's edge in
 * its way stops it short.
 *
 * tickJuggernauts runs after tickSimUnits, before movement. The blows are in fireAtCurrent
 * (combat.ts) through juggernautBlow; the thrown hammer lands in tickProjectiles.
 */

type Blow = "swing" | "fist" | "throw";

const BLOWS: Record<Blow, { radius: number; soldier: number; hull: number; building: number }> = {
  swing: {
    radius: JUGGERNAUT_HAMMER_BLAST_TILES,
    soldier: JUGGERNAUT_HAMMER_SOLDIER,
    hull: JUGGERNAUT_HAMMER_HULL,
    building: JUGGERNAUT_HAMMER_BUILDING,
  },
  fist: {
    radius: JUGGERNAUT_FIST_BLAST_TILES,
    soldier: JUGGERNAUT_FIST_SOLDIER,
    hull: JUGGERNAUT_FIST_HULL,
    building: JUGGERNAUT_FIST_BUILDING,
  },
  throw: {
    radius: JUGGERNAUT_THROW_BLAST_TILES,
    soldier: JUGGERNAUT_THROW_SOLDIER,
    hull: JUGGERNAUT_THROW_HULL,
    building: JUGGERNAUT_THROW_BUILDING,
  },
};

/** Caliber the client reads as a heavy blow: a big burst, no bullet spark. */
const HAMMER_CALIBER = 120;
/** A little lift before the throw lands, so a soldier is not struck while the hammer still sits in the hand. */
const THROW_MIN_SECONDS = 0.45;

/** Its pace times its walk: sprint, and the fists. */
export function juggernautPaceMul(e: Entity): number {
  return (e.sprint ? JUGGERNAUT_SPRINT_MUL : 1) * (e.fists ? JUGGERNAUT_FIST_PACE_MUL : 1);
}

/** Seconds between blows now: the hammer, or the fists. */
export function juggernautBlowSeconds(e: Entity): number {
  return e.fists ? JUGGERNAUT_FIST_SECONDS : JUGGERNAUT_HAMMER_SECONDS;
}

/** From the point to an entity's body, or to the nearest edge of a building's footprint. */
function gapFrom(state: MatchState, x: number, y: number, o: Entity): number {
  if (o.kind === "building") {
    const b = buildingBounds(o, state.tileSize);
    const nx = Math.min(Math.max(x, b.x0), b.x1);
    const ny = Math.min(Math.max(y, b.y0), b.y1);
    return Math.hypot(x - nx, y - ny);
  }
  return Math.max(0, Math.hypot(o.x - x, o.y - y) - catalog(o.type).radius);
}

/**
 * One blow lands at (x, y): every enemy soldier, hull, and building inside the blow's radius
 * takes it, full at the centre and falling off toward the rim. A held house loses walls and
 * the men behind them. `harmAllies` (a force-attack) brings friends in too; never itself.
 */
export function hammerBlast(
  state: MatchState,
  by: { id: number; ownerId: string },
  x: number,
  y: number,
  blow: Blow,
  harmAllies = false,
): void {
  const spec = BLOWS[blow];
  const radius = spec.radius * state.tileSize;
  let kind: ImpactKind = "miss";
  for (const o of [...state.entities.values()]) {
    if (o.id === by.id || o.hp <= 0 || o.wreck || o.garrisonedIn != null) continue;
    // A submarine running below is under the blow.
    if (isAirborne(o) || isBridge(o.type) || isRubble(o) || diving(o)) continue;
    if (!harmAllies && allies(state, by.ownerId, o.ownerId)) continue;
    const gap = gapFrom(state, x, y, o);
    if (gap > radius) continue;
    const fall = mortarFalloff(gap, radius);
    const rand = 0.9 + 0.2 * nextRand(state);
    if (o.kind === "building") {
      if (wallsShieldGarrison(state, o)) woundGarrison(state, o, factionDamage("juggernaut", spec.soldier * fall), HAMMER_CALIBER);
      takeDamage(o, factionDamage("juggernaut", Math.max(1, Math.round(spec.building * fall * rand))), state.tick);
    } else {
      const soldier = isInfantryType(o.type);
      takeDamage(o, factionDamage("juggernaut", Math.max(1, Math.round((soldier ? spec.soldier : spec.hull) * fall * rand))), state.tick);
    }
    kind = o.hp <= 0 ? "kill" : kind === "kill" ? "kill" : "hit";
  }
  state.impacts.push({
    id: state.nextId++,
    ownerId: by.ownerId,
    kind,
    fromId: by.id,
    x,
    y,
    vx: 0,
    vy: 0,
    caliber: HAMMER_CALIBER,
    blast: blow !== "fist" ? true : undefined,
    hammer: blow,
  });
}

/**
 * A blow from fireAtCurrent, laid and off cooldown. On a target it lands on the near side of
 * it: its middle for a body, the closest point of a wall. On a bare point (a force-attack on
 * the ground) it lands where the arm reaches toward it.
 */
export function juggernautBlow(state: MatchState, e: Entity, target: Entity | undefined, aimX: number, aimY: number): void {
  const ts = state.tileSize;
  let x = aimX;
  let y = aimY;
  if (target?.kind === "building") {
    const b = buildingBounds(target, ts);
    x = Math.min(Math.max(e.x, b.x0), b.x1);
    y = Math.min(Math.max(e.y, b.y0), b.y1);
  } else if (!target) {
    const d = Math.hypot(aimX - e.x, aimY - e.y) || 1;
    const reach = Math.min(d, catalog(e.type).radius + catalog(e.type).rangeTiles * ts);
    x = e.x + ((aimX - e.x) / d) * reach;
    y = e.y + ((aimY - e.y) / d) * reach;
  }
  hammerBlast(state, e, x, y, e.fists ? "fist" : "swing", e.order?.kind === "forceattack");
  e.cooldown = juggernautBlowSeconds(e);
}

/** What it is going for, while it is still going: the chased target of an order, or the one an attack-move holds. */
function chaseTarget(state: MatchState, e: Entity): Entity | undefined {
  const o = e.order;
  let id: number | null | undefined;
  if ((o?.kind === "attack" || o?.kind === "forceattack") && o.travel == null) id = o.targetId ?? e.attackTarget;
  else if (o?.kind === "attackmove") id = e.attackTarget;
  if (id == null) return undefined;
  const t = state.entities.get(id);
  if (!t || t.hp <= 0 || t.garrisonedIn != null || isAirborne(t)) return undefined;
  return t;
}

/** Worth the hammer: the costliest enemy unit it sees in reach, the hardest-hit pool breaking a tie. A building only when no unit is there. */
function strongestInReach(state: MatchState, e: Entity): Entity | undefined {
  const reach = JUGGERNAUT_THROW_RANGE_TILES * state.tileSize;
  let best: Entity | undefined;
  let bestScore = -Infinity;
  for (const o of state.entities.values()) {
    if (o.id === e.id || o.hp <= 0 || o.wreck || o.garrisonedIn != null || hiddenFromAuto(o)) continue;
    if (ownerless(o) || isAirborne(o) || isBridge(o.type) || isRubble(o) || diving(o)) continue;
    if (allies(state, e.ownerId, o.ownerId)) continue;
    if (gapTo(state, e, o) > reach) continue;
    // Units first: a building only scores under every unit.
    const score = (o.kind === "unit" ? 1e6 : 0) + catalog(o.type).cost * 10 + o.hp / 1000;
    if (score <= bestScore) continue;
    if (!canSeeEntity(state, e.ownerId, o)) continue;
    best = o;
    bestScore = score;
  }
  return best;
}

/** The hammer leaves its hands on an arc at `t`; it lands where `t` stands now. */
function throwHammer(state: MatchState, e: Entity, t: Entity): void {
  const ts = state.tileSize;
  let lx = t.x;
  let ly = t.y;
  if (t.kind === "building") {
    const b = buildingBounds(t, ts);
    lx = Math.min(Math.max(e.x, b.x0), b.x1);
    ly = Math.min(Math.max(e.y, b.y0), b.y1);
  }
  const dist = Math.hypot(lx - e.x, ly - e.y);
  const flight = Math.max(THROW_MIN_SECONDS, dist / (JUGGERNAUT_THROW_SPEED_TILES * ts));
  e.facing = Math.atan2(ly - e.y, lx - e.x);
  const p: Projectile = {
    id: state.nextId++,
    ownerId: e.ownerId,
    team: playerTeam(state, e.ownerId),
    x: e.x,
    y: e.y,
    vx: (lx - e.x) / flight,
    vy: (ly - e.y) / flight,
    damage: JUGGERNAUT_THROW_HULL,
    penetration: 0,
    caliber: HAMMER_CALIBER,
    life: flight,
    ignoreId: e.id,
    fromId: e.id,
    bounced: false,
    shell: null,
    flight: "mortar",
    landX: lx,
    landY: ly,
    apex: 10 + (dist / ts) * 0.9,
    flightTime: flight,
    hammer: true,
    z: 0,
  };
  state.projectiles.push(p);
  e.fists = true;
  // The empty hands come up before the first punch.
  e.cooldown = Math.max(e.cooldown, JUGGERNAUT_FIST_SECONDS);
}

/** The thrown hammer is down: tickProjectiles calls this in place of a shell burst. */
export function landHammer(state: MatchState, p: Projectile): void {
  hammerBlast(state, { id: p.fromId, ownerId: p.ownerId }, p.x, p.y, "throw");
}

/** Ram charge, 0–1. 1 is ready. */
export function ramCharge(state: MatchState, e: Entity): number {
  if (e.ramReady == null) return 1;
  const need = secondsToTicks(JUGGERNAUT_RAM_RECHARGE_SECONDS);
  return Math.max(0, Math.min(1, 1 - (e.ramReady - state.tick) / need));
}

/** The point it charges at: the body's middle, or the near edge of a wall. */
function ramPoint(state: MatchState, e: Entity, t: Entity): { x: number; y: number } {
  if (t.kind !== "building") return { x: t.x, y: t.y };
  const b = buildingBounds(t, state.tileSize);
  return { x: Math.min(Math.max(e.x, b.x0), b.x1), y: Math.min(Math.max(e.y, b.y0), b.y1) };
}

/** Ground the giant can charge across: a tile it may stand on, dry. */
function chargeable(state: MatchState, e: Entity, x: number, y: number): boolean {
  const ts = state.tileSize;
  const tx = worldToTile(x, ts);
  const ty = worldToTile(y, ts);
  return inBounds(state, tx, ty) && walkable(state, tx, ty, e.type) && !isWater(state, tx, ty);
}

/** Clear ground from where it stands to its contact with `t`, sampled every half tile. */
function clearRun(state: MatchState, e: Entity, t: Entity): boolean {
  const ts = state.tileSize;
  const p = ramPoint(state, e, t);
  const d = Math.hypot(p.x - e.x, p.y - e.y) || 1;
  const run = d - catalog(e.type).radius - (t.kind === "building" ? 0 : catalog(t.type).radius);
  const n = Math.ceil(Math.max(0, run) / (ts * 0.5));
  for (let i = 1; i <= n; i++) {
    const k = Math.min(run, i * ts * 0.5) / d;
    if (!chargeable(state, e, e.x + (p.x - e.x) * k, e.y + (p.y - e.y) * k)) return false;
  }
  return true;
}

/** Something it may charge: an enemy armored hull on the ground, or (`building`) an enemy building. Never a soldier. */
function rammable(state: MatchState, e: Entity, o: Entity, building: boolean): boolean {
  if (o.id === e.id || o.hp <= 0 || o.wreck || o.garrisonedIn != null || hiddenFromAuto(o)) return false;
  if (ownerless(o) || isAirborne(o) || isBridge(o.type) || isRubble(o) || diving(o)) return false;
  if (allies(state, e.ownerId, o.ownerId)) return false;
  if (o.kind === "building") {
    if (!building) return false;
  } else if (o.kind !== "unit" || isInfantryType(o.type) || !isArmoredType(o.type) || isNavalType(o.type)) {
    return false;
  }
  const gap = gapTo(state, e, o);
  if (gap < JUGGERNAUT_RAM_MIN_TILES * state.tileSize || gap > JUGGERNAUT_RAM_RANGE_TILES * state.tileSize) return false;
  return canSeeEntity(state, e.ownerId, o) && clearRun(state, e, o);
}

/**
 * What it charges now, if anything. A named attack: only that target, a hull or a building.
 * Otherwise the hull it is set on, else the nearest enemy hull in the band. Nothing on a plain
 * move, on hold, or from the water.
 */
function ramMark(state: MatchState, e: Entity): Entity | undefined {
  if (e.holdPosition || e.garrisonedIn != null || e.shutdown || e.dormant) return undefined;
  const o = e.order;
  if (o && o.kind !== "attack" && o.kind !== "attackmove" && o.kind !== "patrol" && o.kind !== "guard") return undefined;
  if (!chargeable(state, e, e.x, e.y)) return undefined;
  if (o?.kind === "attack" && !o.auto) {
    const t = o.targetId != null ? state.entities.get(o.targetId) : undefined;
    return t && rammable(state, e, t, true) ? t : undefined;
  }
  // A building only on a named attack: one it picked for itself it hammers.
  const set = e.attackTarget != null ? state.entities.get(e.attackTarget) : undefined;
  if (set && rammable(state, e, set, false)) return set;
  const band = JUGGERNAUT_RAM_RANGE_TILES * state.tileSize + 64;
  let best: Entity | undefined;
  let bestGap = Infinity;
  for (const c of state.entities.values()) {
    if (c.kind !== "unit" || c.id === e.id) continue;
    if (Math.abs(c.x - e.x) > band || Math.abs(c.y - e.y) > band) continue;
    const gap = gapTo(state, e, c);
    if (gap >= bestGap || !rammable(state, e, c, false)) continue;
    best = c;
    bestGap = gap;
  }
  return best;
}

function startRam(state: MatchState, e: Entity, t: Entity): void {
  const p = ramPoint(state, e, t);
  e.facing = Math.atan2(p.y - e.y, p.x - e.x);
  // Long enough to cover the band and some, should the mark run.
  const seconds = (JUGGERNAUT_RAM_RANGE_TILES * 1.5) / JUGGERNAUT_RAM_SPEED_TILES;
  e.ram = { targetId: t.id, until: state.tick + secondsToTicks(seconds), hit: [] };
  e.ramReady = state.tick + secondsToTicks(JUGGERNAUT_RAM_RECHARGE_SECONDS);
  e.sprint = undefined;
  e.waypoints = [];
}

function endRam(e: Entity): void {
  e.ram = undefined;
  e.waypoints = [];
}

function ramImpact(state: MatchState, e: Entity, x: number, y: number, ram: "slam" | "trample" | "stop", kind: ImpactKind): void {
  state.impacts.push({
    id: state.nextId++,
    ownerId: e.ownerId,
    kind,
    fromId: e.id,
    x,
    y,
    vx: Math.cos(e.facing),
    vy: Math.sin(e.facing),
    caliber: HAMMER_CALIBER,
    blast: ram === "slam" ? true : undefined,
    ram,
  });
}

/** Every enemy on the ground its body swept from (x0, y0) to where it stands now: run down, once a charge. */
function trample(state: MatchState, e: Entity, x0: number, y0: number, mark: Entity): void {
  const r = e.ram;
  if (!r) return;
  const me = catalog(e.type).radius;
  const sx = e.x - x0;
  const sy = e.y - y0;
  const len2 = sx * sx + sy * sy || 1;
  for (const o of state.entities.values()) {
    if (o.kind !== "unit" || o.id === e.id || o.id === mark.id || o.hp <= 0 || o.wreck || o.garrisonedIn != null) continue;
    if (Math.abs(o.x - e.x) > 96 || Math.abs(o.y - e.y) > 96) continue;
    if (isAirborne(o) || diving(o) || allies(state, e.ownerId, o.ownerId) || r.hit.includes(o.id)) continue;
    const k = Math.max(0, Math.min(1, ((o.x - x0) * sx + (o.y - y0) * sy) / len2));
    if (Math.hypot(o.x - (x0 + sx * k), o.y - (y0 + sy * k)) > me + catalog(o.type).radius) continue;
    r.hit.push(o.id);
    const base = isInfantryType(o.type) ? JUGGERNAUT_RAM_TRAMPLE_SOLDIER : JUGGERNAUT_RAM_TRAMPLE_HULL;
    takeDamage(o, factionDamage("juggernaut", Math.round(base * (0.9 + 0.2 * nextRand(state)))), state.tick);
    ramImpact(state, e, o.x, o.y, "trample", o.hp <= 0 ? "kill" : "hit");
  }
}

/** It struck what it charged: through any plate, and a hull is thrown back along the charge. */
function slam(state: MatchState, e: Entity, t: Entity): void {
  const p = ramPoint(state, e, t);
  const rand = 0.9 + 0.2 * nextRand(state);
  if (t.kind === "building") {
    if (wallsShieldGarrison(state, t)) woundGarrison(state, t, factionDamage("juggernaut", JUGGERNAUT_THROW_SOLDIER), HAMMER_CALIBER);
    takeDamage(t, factionDamage("juggernaut", Math.round(JUGGERNAUT_RAM_BUILDING * rand)), state.tick);
  } else {
    takeDamage(t, factionDamage("juggernaut", Math.round(JUGGERNAUT_RAM_HULL * rand)), state.tick);
    const ts = state.tileSize;
    const shove = JUGGERNAUT_RAM_SHOVE_TILES * ts;
    // As far as there is ground for it to land on.
    for (let k = 1; k > 0 && t.hp > 0; k -= 0.25) {
      const nx = t.x + Math.cos(e.facing) * shove * k;
      const ny = t.y + Math.sin(e.facing) * shove * k;
      const tx = worldToTile(nx, ts);
      const ty = worldToTile(ny, ts);
      if (!inBounds(state, tx, ty) || !walkable(state, tx, ty, t.type)) continue;
      t.x = nx;
      t.y = ny;
      t.tileX = tx;
      t.tileY = ty;
      break;
    }
  }
  ramImpact(state, e, p.x, p.y, "slam", t.hp <= 0 ? "kill" : "hit");
  // It gathers itself before the next blow.
  e.cooldown = Math.max(e.cooldown, 0.5);
}

/** One tick of a charge: steer on the mark, run, run down what is in the way, slam on contact. */
function tickRam(state: MatchState, e: Entity): void {
  const r = e.ram;
  if (!r) return;
  const t = state.entities.get(r.targetId);
  if (!t || t.hp <= 0 || t.wreck || t.garrisonedIn != null || isAirborne(t) || diving(t) || state.tick > r.until || e.garrisonedIn != null) {
    endRam(e);
    return;
  }
  const ts = state.tileSize;
  const me = catalog(e.type).radius;
  const p = ramPoint(state, e, t);
  const d = Math.hypot(p.x - e.x, p.y - e.y) || 1;
  e.facing = Math.atan2(p.y - e.y, p.x - e.x);
  e.waypoints = [];
  const run = Math.min(JUGGERNAUT_RAM_SPEED_TILES * ts * TICK_DT, Math.max(0, gapTo(state, e, t) - me));
  const nx = e.x + ((p.x - e.x) / d) * run;
  const ny = e.y + ((p.y - e.y) / d) * run;
  if (run > 0 && !chargeable(state, e, nx, ny)) {
    ramImpact(state, e, e.x + Math.cos(e.facing) * me, e.y + Math.sin(e.facing) * me, "stop", "miss");
    endRam(e);
    return;
  }
  const x0 = e.x;
  const y0 = e.y;
  e.x = nx;
  e.y = ny;
  e.tileX = worldToTile(nx, ts);
  e.tileY = worldToTile(ny, ts);
  trample(state, e, x0, y0, t);
  if (gapTo(state, e, t) <= me + 0.5) {
    slam(state, e, t);
    endRam(e);
  }
}

export function tickJuggernauts(state: MatchState): void {
  for (const e of state.entities.values()) {
    if (e.kind !== "unit" || !isJuggernaut(e.type)) continue;
    if (e.hp <= 0 || e.wreck) {
      e.sprint = undefined;
      e.ram = undefined;
      continue;
    }
    // Ready, it looks for a mark every few ticks, not every one.
    if (!e.ram && (e.ramReady == null || e.ramReady <= state.tick) && (state.tick + e.id) % 3 === 0) {
      const mark = ramMark(state, e);
      if (mark) startRam(state, e, mark);
    }
    if (e.ram) {
      tickRam(state, e);
      continue;
    }
    const t = e.holdPosition || e.garrisonedIn != null ? undefined : chaseTarget(state, e);
    e.sprint = t && !inStrikeReach(state, e, t) ? true : undefined;
    if (e.fists || e.hp > e.hpMax * JUGGERNAUT_RAGE_HP || e.garrisonedIn != null) continue;
    const mark = strongestInReach(state, e);
    if (mark) throwHammer(state, e, mark);
  }
}
