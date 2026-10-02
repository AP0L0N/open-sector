/** Walker self-destroy. At a fifth of his health he rushes the nearest enemy and detonates. */

import {
  NEUTRAL_OWNER,
  PTRD_LIGHT_FRONT,
  WALKER_BLAST_HEAVY,
  WALKER_BLAST_SOFT,
  WALKER_BLAST_TILES,
  WALKER_CHARGE_HP,
  WALKER_SELF_DESTRUCT_HP,
  catalog,
  isFieldStructure,
} from "../catalog.js";
import { isAirborne } from "./air.js";
import { takeDamage } from "./crits.js";
import {
  adjacentToBuilding,
  allies,
  buildingBounds,
  buildingCenter,
  clearOrder,
  destroyEntity,
} from "./geo.js";
import { mortarFalloff } from "./mortar.js";
import { setPath } from "./path.js";
import type { Entity, MatchState } from "./types.js";
import { canSeeEntity } from "./vision.js";

/** Vehicles stop at the radius sum. This reaches across that gap. */
const CRASH_PAD = 8;
/** How often a charge repaths onto a moving target. */
const REPATH_EVERY = 5;
/** Cook-off caliber so the client draws the ground burst. */
const BLAST_CALIBER = 75;

export function tickWalkerCharge(state: MatchState): void {
  const walkers = [...state.entities.values()].filter(
    (e) => e.type === "walker" && !e.wreck && e.garrisonedIn == null && e.hp > 0,
  );
  for (const e of walkers) {
    if (!state.entities.has(e.id) || e.hp <= 0 || e.wreck) continue;
    const armed = !e.selfDestructOff && e.hp <= e.hpMax * WALKER_SELF_DESTRUCT_HP;
    if (!armed) {
      endWalkerCharge(e);
      continue;
    }
    swellWalker(e);
    e.charging = true;
    e.holdPosition = false;
    e.orderQueue = undefined;
    e.doorGroup = undefined;
    e.returnToBase = false;
    const target = chargeTarget(state, e);
    if (!target) {
      clearOrder(e);
      e.charging = true;
      continue;
    }
    if (inContact(state, e, target)) {
      detonateWalker(state, e);
      continue;
    }
    const goal =
      target.kind === "building"
        ? buildingCenter(target.tileX, target.tileY, target.tileW, target.tileH, state.tileSize)
        : { x: target.x, y: target.y };
    e.order = { kind: "move", x: goal.x, y: goal.y };
    e.attackTarget = target.kind === "unit" ? target.id : null;
    e.state = "move";
    e.guardFacing = null;
    if (e.waypoints.length === 0 || state.tick % REPATH_EVERY === 0) setPath(state, e, goal.x, goal.y);
  }
}

/** Drop the charge and put his hit points back. Cover stays on the hull. */
export function endWalkerCharge(e: Entity): void {
  if (e.chargeBuff) {
    const cover = e.coverBonus;
    const baseHp = Math.max(0, e.hp - cover);
    const baseMax = Math.max(1, e.hpMax - cover);
    e.hpMax = Math.max(1, Math.round(baseMax / WALKER_CHARGE_HP) + cover);
    e.hp = Math.max(1, Math.round(baseHp / WALKER_CHARGE_HP) + cover);
    if (e.hp > e.hpMax) e.hp = e.hpMax;
    e.chargeBuff = undefined;
  }
  if (e.charging) {
    e.charging = undefined;
    clearOrder(e);
  }
}

/** Five times the hit points, same share of the bar. Once per charge. */
function swellWalker(e: Entity): void {
  if (e.chargeBuff) return;
  const cover = e.coverBonus;
  const baseHp = Math.max(0, e.hp - cover);
  const baseMax = Math.max(1, e.hpMax - cover);
  e.hp = baseHp * WALKER_CHARGE_HP + cover;
  e.hpMax = baseMax * WALKER_CHARGE_HP + cover;
  e.chargeBuff = true;
}

function chargeTarget(state: MatchState, walker: Entity): Entity | undefined {
  let bestUnit: Entity | undefined;
  let bestUnitD = Infinity;
  let bestBuilding: Entity | undefined;
  let bestBuildingD = Infinity;
  for (const o of state.entities.values()) {
    if (!hostile(state, walker, o)) continue;
    if (!canSeeEntity(state, walker.ownerId, o)) continue;
    if (o.kind === "unit") {
      const d = (o.x - walker.x) ** 2 + (o.y - walker.y) ** 2;
      if (d < bestUnitD) {
        bestUnitD = d;
        bestUnit = o;
      }
    } else if (o.kind === "building" && !isFieldStructure(o.type)) {
      const d = distTo(state, walker, o);
      if (d < bestBuildingD) {
        bestBuildingD = d;
        bestBuilding = o;
      }
    }
  }
  return bestUnit ?? bestBuilding;
}

function hostile(state: MatchState, walker: Entity, o: Entity): boolean {
  if (!o.ownerId || o.ownerId === NEUTRAL_OWNER) return false;
  if (o.id === walker.id || o.hp <= 0 || o.wreck || o.garrisonedIn != null) return false;
  if (isAirborne(o)) return false;
  return !allies(state, walker.ownerId, o.ownerId);
}

function inContact(state: MatchState, walker: Entity, target: Entity): boolean {
  if (target.kind === "building") return adjacentToBuilding(state, walker, target);
  return distTo(state, walker, target) <= walker.radius + target.radius + CRASH_PAD;
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

function detonateWalker(state: MatchState, walker: Entity): void {
  const radius = WALKER_BLAST_TILES * state.tileSize;
  for (const o of [...state.entities.values()]) {
    if (o.id === walker.id || o.hp <= 0 || o.wreck) continue;
    if (isAirborne(o) || o.garrisonedIn != null) continue;
    const dist = distTo(state, walker, o);
    if (dist > radius) continue;
    const heavy = o.kind === "unit" && catalog(o.type).armorFront > PTRD_LIGHT_FRONT;
    const raw = (heavy ? WALKER_BLAST_HEAVY : WALKER_BLAST_SOFT) * mortarFalloff(dist, radius);
    takeDamage(o, Math.max(1, Math.round(raw)), state.tick);
  }
  state.impacts.push({
    id: state.nextId++,
    ownerId: walker.ownerId,
    kind: "kill",
    x: walker.x,
    y: walker.y,
    vx: 0,
    vy: 0,
    caliber: BLAST_CALIBER,
    blast: true,
    fromId: walker.id,
  });
  destroyEntity(state, walker);
}
