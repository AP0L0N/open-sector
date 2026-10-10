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
  JUGGERNAUT_SPRINT_MUL,
  JUGGERNAUT_THROW_BLAST_TILES,
  JUGGERNAUT_THROW_BUILDING,
  JUGGERNAUT_THROW_HULL,
  JUGGERNAUT_THROW_RANGE_TILES,
  JUGGERNAUT_THROW_SOLDIER,
  JUGGERNAUT_THROW_SPEED_TILES,
  catalog,
  factionDamage,
  isBridge,
  isInfantryType,
  isJuggernaut,
  isRubble,
} from "../catalog.js";
import type { ImpactKind } from "../protocol.js";
import { isAirborne } from "./air.js";
import { takeDamage } from "./crits.js";
import { wallsShieldGarrison, woundGarrison } from "./garrison.js";
import { allies, buildingBounds, ownerless, playerTeam } from "./geo.js";
import { mortarFalloff } from "./mortar.js";
import { diving } from "./naval.js";
import { nextRand } from "./rng.js";
import { gapTo, hiddenFromAuto, inStrikeReach } from "./simunit.js";
import { domeShelters } from "./energy-shield.js";
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
  // A blow comes from the arm that swings it; a thrown hammer from where it lands.
  const src = (blow !== "throw" && state.entities.get(by.id)) || { x, y };
  const soaked = new Set<number>();
  for (const o of [...state.entities.values()]) {
    if (o.id === by.id || o.hp <= 0 || o.wreck || o.garrisonedIn != null) continue;
    // A submarine running below is under the blow.
    if (isAirborne(o) || isBridge(o.type) || isRubble(o) || diving(o)) continue;
    if (!harmAllies && allies(state, by.ownerId, o.ownerId)) continue;
    const gap = gapFrom(state, x, y, o);
    if (gap > radius) continue;
    if (domeShelters(state, by.ownerId, src.x, src.y, o, isInfantryType(o.type) ? spec.soldier : spec.hull, soaked)) continue;
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

export function tickJuggernauts(state: MatchState): void {
  for (const e of state.entities.values()) {
    if (e.kind !== "unit" || !isJuggernaut(e.type)) continue;
    if (e.hp <= 0 || e.wreck) {
      e.sprint = undefined;
      continue;
    }
    const t = e.holdPosition || e.garrisonedIn != null ? undefined : chaseTarget(state, e);
    e.sprint = t && !inStrikeReach(state, e, t) ? true : undefined;
    if (e.fists || e.hp > e.hpMax * JUGGERNAUT_RAGE_HP || e.garrisonedIn != null) continue;
    const mark = strongestInReach(state, e);
    if (mark) throwHammer(state, e, mark);
  }
}
