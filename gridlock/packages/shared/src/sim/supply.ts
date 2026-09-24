import {
  DRIVER_KILL_CHANCE,
  GARRISON_STRUCTURAL_CALIBER,
  SHELL_TYPES,
  SUPPLY_CARGO,
  SUPPLY_PER_SEC,
  SUPPLY_REARM_PER_SEC,
  SUPPLY_ROUNDS_PER_POINT,
  SUPPLY_SHELL_COST,
  TRUCK_RIDER_HP_MUL,
  TRUCK_RIDER_SHARE_FRONT,
  TRUCK_RIDER_SHARE_REAR,
  TRUCK_RIDER_SHARE_SIDE,
  TRUCK_SEATS,
  catalog,
  infantryGunFor,
  isInfantryType,
  supplyShortOf,
  weaponFitsTruck,
  type ShellType,
} from "../catalog.js";
import type { ArmorFace } from "./ballistics.js";
import { detachGarrisoned, livingGarrison } from "./garrison.js";
import { allies, clearOrder, nearestWalkable, tileCenter, worldToTile } from "./geo.js";
import { setPath } from "./path.js";
import { nextRand } from "./rng.js";
import type { Entity, MatchState } from "./types.js";

const BOARD_SLACK = 12;
const SUPPLY_REACH = 18;

export function supplyHasDriver(state: MatchState, truck: Entity): boolean {
  if (truck.type !== "supply" || truck.hp <= 0 || truck.wreck) return false;
  if (truck.crew) return true;
  return livingGarrison(state, truck).length > 0;
}

/** Non-trucks always drive. An open supply truck does not. */
export function supplyCanDrive(state: MatchState, e: Entity): boolean {
  if (e.type !== "supply") return true;
  return supplyHasDriver(state, e);
}

/** Player infantry aboard, in the order they climbed in. */
export function supplyRiders(state: MatchState, truck: Entity): Entity[] {
  if (truck.type !== "supply") return [];
  return livingGarrison(state, truck);
}

export function supplyBodies(state: MatchState, truck: Entity): number {
  return (truck.crew ? 1 : 0) + supplyRiders(state, truck).length;
}

/**
 * The soldier who may fire from the bed — the one who is not driving.
 * The factory driver counts as the first body, so a lone passenger shoots.
 * Two player infantry: the second one shoots. A lone replacement driver does not.
 */
export function supplyShooter(state: MatchState, truck: Entity): Entity | null {
  const riders = supplyRiders(state, truck);
  if (truck.crew) return riders[0] ?? null;
  return riders.length >= 2 ? (riders[1] ?? null) : null;
}

/** False only for a truck rider who must keep their weapon slung. */
export function supplyRiderFights(state: MatchState, e: Entity): boolean {
  if (e.garrisonedIn == null) return true;
  const host = state.entities.get(e.garrisonedIn);
  if (!host || host.type !== "supply") return true;
  const shooter = supplyShooter(state, host);
  if (!shooter || shooter.id !== e.id) return false;
  return weaponFitsTruck(infantryGunFor(e));
}

export function canBoardTruck(state: MatchState, unit: Entity, truck: Entity): string | null {
  if (!isInfantryType(unit.type) || unit.kind !== "unit" || unit.hp <= 0 || unit.wreck) {
    return "Only infantry can board.";
  }
  if (truck.type !== "supply" || truck.hp <= 0 || truck.wreck) return "Cannot board that.";
  if (unit.garrisonedIn === truck.id) return "Already aboard.";
  if (unit.garrisonedIn != null) return "Already inside.";
  if (supplyBodies(state, truck) >= TRUCK_SEATS) return "The truck is full.";
  if (!supplyHasDriver(state, truck)) return null;
  if (!allies(state, unit.ownerId, truck.ownerId)) return "The truck is crewed.";
  return null;
}

export function needsSupply(e: Entity): boolean {
  if (e.hp <= 0 || e.wreck || e.garrisonedIn != null) return false;
  return supplyShortOf(e.type, e.ammo, e.mgAmmo, e.clip);
}

function nearTruck(a: Entity, b: Entity, slack: number): boolean {
  return Math.hypot(a.x - b.x, a.y - b.y) <= a.radius + b.radius + slack;
}

function approachPoint(truck: Entity, from: Entity): { x: number; y: number } {
  const dx = from.x - truck.x;
  const dy = from.y - truck.y;
  const d = Math.hypot(dx, dy) || 1;
  const dist = truck.radius + from.radius + 6;
  return { x: truck.x + (dx / d) * dist, y: truck.y + (dy / d) * dist };
}

function dropPoint(state: MatchState, truck: Entity, salt: number): { x: number; y: number } {
  const ang = truck.facing + Math.PI + salt * 0.4;
  const dist = truck.radius + 18;
  const x = truck.x + Math.cos(ang) * dist;
  const y = truck.y + Math.sin(ang) * dist;
  const snap = nearestWalkable(state, worldToTile(x, state.tileSize), worldToTile(y, state.tileSize), "rifleman");
  if (!snap) return { x, y };
  return { x: tileCenter(snap.x, state.tileSize), y: tileCenter(snap.y, state.tileSize) };
}

function scaleRiderHp(unit: Entity): void {
  const base = catalog(unit.type).hp;
  const ratio = unit.hpMax > 0 ? unit.hp / unit.hpMax : 1;
  unit.hpMax = Math.max(1, Math.round(base * TRUCK_RIDER_HP_MUL));
  unit.hp = Math.max(1, Math.round(unit.hpMax * ratio));
}

function placeOut(state: MatchState, truck: Entity, unit: Entity, salt: number): void {
  const p = dropPoint(state, truck, salt);
  unit.x = p.x;
  unit.y = p.y;
  unit.tileX = worldToTile(p.x, state.tileSize);
  unit.tileY = worldToTile(p.y, state.tileSize);
}

function dropAlive(state: MatchState, truck: Entity, unit: Entity, salt: number): void {
  detachGarrisoned(state, unit);
  placeOut(state, truck, unit, salt);
  clearOrder(unit);
  unit.state = "idle";
}

function dropDead(state: MatchState, truck: Entity, unit: Entity, salt: number): void {
  detachGarrisoned(state, unit);
  placeOut(state, truck, unit, salt);
  clearOrder(unit);
  unit.hp = 0;
  unit.state = "dead";
}

function stall(truck: Entity): void {
  clearOrder(truck);
  truck.state = truck.wreck ? "wreck" : "idle";
}

/** Park every rider on the truck so sight and shots leave from the cab. */
export function syncSupplyRiders(state: MatchState): void {
  for (const truck of state.entities.values()) {
    if (truck.type !== "supply" || truck.hp <= 0) continue;
    for (const rider of supplyRiders(state, truck)) {
      rider.x = truck.x;
      rider.y = truck.y;
      rider.tileX = truck.tileX;
      rider.tileY = truck.tileY;
    }
  }
}

function enterTruck(state: MatchState, unit: Entity, truck: Entity): void {
  const open = !supplyHasDriver(state, truck);
  unit.garrisonedIn = truck.id;
  if (!truck.garrison.includes(unit.id)) truck.garrison.push(unit.id);
  unit.x = truck.x;
  unit.y = truck.y;
  unit.tileX = truck.tileX;
  unit.tileY = truck.tileY;
  unit.waypoints = [];
  unit.order = null;
  unit.attackTarget = null;
  unit.state = "garrison";
  scaleRiderHp(unit);
  if (open) {
    truck.ownerId = unit.ownerId;
    truck.crew = false;
    stall(truck);
  }
}

/** Replacement driver getting out abandons the truck. The factory driver cannot. */
export function dismountSupply(state: MatchState, truck: Entity): string | null {
  if (truck.type !== "supply" || truck.hp <= 0 || truck.wreck) return "Cannot exit that.";
  const riders = supplyRiders(state, truck);
  if (truck.crew) {
    if (riders.length === 0) return "The driver cannot dismount.";
    riders.forEach((r, i) => dropAlive(state, truck, r, i));
    return null;
  }
  if (riders.length === 0) return "Nobody aboard.";
  riders.forEach((r, i) => dropAlive(state, truck, r, i));
  stall(truck);
  return null;
}

function killDriver(state: MatchState, truck: Entity): void {
  const riders = supplyRiders(state, truck);
  if (truck.crew) {
    truck.crew = false;
    riders.forEach((r, i) => dropAlive(state, truck, r, i));
    stall(truck);
    return;
  }
  const driver = riders[0];
  if (driver) dropDead(state, truck, driver, 0);
  riders.slice(1).forEach((r, i) => dropAlive(state, truck, r, i + 1));
  stall(truck);
}

function riderShare(face: ArmorFace | "none"): number {
  if (face === "front") return TRUCK_RIDER_SHARE_FRONT;
  if (face === "rear") return TRUCK_RIDER_SHARE_REAR;
  return TRUCK_RIDER_SHARE_SIDE;
}

/**
 * A bullet on the front plate can kill the driver even when the plate holds.
 * Any real hit also wounds the soldiers inside, less from the side and rear.
 */
export function noteSupplyHit(
  state: MatchState,
  truck: Entity,
  face: ArmorFace | "none",
  bullet: boolean,
  dealt: number,
): void {
  if (truck.type !== "supply" || truck.hp <= 0 || truck.wreck || face === "none") return;
  if (bullet && face === "front" && nextRand(state) < DRIVER_KILL_CHANCE) {
    killDriver(state, truck);
    return;
  }
  if (dealt <= 0) return;
  const share = riderShare(face);
  const riders = supplyRiders(state, truck);
  const driverId = truck.crew ? null : riders[0]?.id;
  for (const rider of riders) {
    const dmg = Math.max(1, Math.round(dealt * share));
    rider.hp = Math.max(0, rider.hp - dmg);
    if (rider.hp > 0) continue;
    if (rider.id === driverId) {
      const rest = riders.filter((r) => r.id !== rider.id);
      dropDead(state, truck, rider, 0);
      rest.forEach((r, i) => dropAlive(state, truck, r, i + 1));
      stall(truck);
      return;
    }
    dropDead(state, truck, rider, 1);
  }
}

export function isSupplyBullet(caliber: number, shell: string | null, flight?: string): boolean {
  return shell == null && flight !== "mortar" && caliber < GARRISON_STRUCTURAL_CALIBER;
}

function giveShell(e: Entity): boolean {
  const def = catalog(e.type);
  if (!def.ammo) return false;
  const order: ShellType[] = [];
  if (e.shell) order.push(e.shell);
  for (const shell of SHELL_TYPES) if (!order.includes(shell)) order.push(shell);
  for (const shell of order) {
    const max = def.ammo[shell] ?? 0;
    const have = e.ammo[shell] ?? 0;
    if (have >= max) continue;
    e.ammo[shell] = have + 1;
    return true;
  }
  return false;
}

function giveRounds(e: Entity, n: number): boolean {
  const def = catalog(e.type);
  const beltClip = def.belt ?? 0;
  const beltReloads = (def.beltReload ?? 0) > 0;
  if (beltClip > 0 && !beltReloads && e.clip < beltClip) {
    e.clip = Math.min(beltClip, e.clip + n);
    e.reload = 0;
    return true;
  }
  const cap = def.mgAmmo ?? 0;
  if (cap > 0 && e.mgAmmo < cap) {
    e.mgAmmo = Math.min(cap, e.mgAmmo + n);
    return true;
  }
  return false;
}

function transferOnce(truck: Entity, target: Entity): boolean {
  if (truck.supply <= 0) return false;
  if (truck.supply >= SUPPLY_SHELL_COST && giveShell(target)) {
    truck.supply -= SUPPLY_SHELL_COST;
    return true;
  }
  if (giveRounds(target, SUPPLY_ROUNDS_PER_POINT)) {
    truck.supply = Math.max(0, truck.supply - 1);
    return true;
  }
  return false;
}

function tickResupply(state: MatchState, truck: Entity, dt: number): void {
  const id = truck.order?.kind === "supply" ? truck.order.targetId : undefined;
  const target = id != null ? state.entities.get(id) : undefined;
  if (!target || target.hp <= 0 || !supplyHasDriver(state, truck)) {
    stall(truck);
    return;
  }
  const rearm = target.type === "armory" && allies(state, truck.ownerId, target.ownerId);
  const filling = !rearm && allies(state, truck.ownerId, target.ownerId) && needsSupply(target);
  if (!rearm && !filling) {
    stall(truck);
    return;
  }
  if (!nearTruck(truck, target, SUPPLY_REACH)) {
    truck.state = "move";
    if (truck.waypoints.length === 0 || state.tick % 8 === 0) {
      const spot = approachPoint(target, truck);
      setPath(state, truck, spot.x, spot.y);
    }
    return;
  }
  truck.waypoints = [];
  truck.state = "idle";
  truck.facing = Math.atan2(target.y - truck.y, target.x - truck.x);
  truck.turretFacing = truck.facing;
  if (rearm) {
    truck.supply = Math.min(SUPPLY_CARGO, truck.supply + SUPPLY_REARM_PER_SEC * dt);
    if (truck.supply >= SUPPLY_CARGO) stall(truck);
    return;
  }
  truck.work += dt;
  const slice = 1 / Math.max(1, SUPPLY_PER_SEC);
  let stuck = false;
  while (truck.work >= slice && truck.supply > 0 && needsSupply(target)) {
    truck.work -= slice;
    if (!transferOnce(truck, target)) {
      stuck = true;
      break;
    }
  }
  if (stuck || truck.supply <= 0 || !needsSupply(target)) stall(truck);
}

function tickBoard(state: MatchState, unit: Entity): void {
  if (unit.order?.kind !== "board" || unit.order.targetId == null) return;
  const truck = state.entities.get(unit.order.targetId);
  if (!truck) {
    clearOrder(unit);
    return;
  }
  if (canBoardTruck(state, unit, truck)) {
    clearOrder(unit);
    return;
  }
  if (nearTruck(unit, truck, BOARD_SLACK)) {
    enterTruck(state, unit, truck);
    return;
  }
  unit.state = "move";
  if (unit.waypoints.length === 0 || state.tick % 8 === 0) {
    const spot = approachPoint(truck, unit);
    setPath(state, unit, spot.x, spot.y);
  }
}

export function tickSupply(state: MatchState, dt: number): void {
  for (const e of state.entities.values()) {
    if (e.type === "supply" && e.hp > 0 && !e.wreck && !supplyHasDriver(state, e)) stall(e);
  }
  for (const e of state.entities.values()) {
    if (e.kind !== "unit" || e.hp <= 0 || e.garrisonedIn) continue;
    if (e.order?.kind === "board") tickBoard(state, e);
  }
  for (const e of state.entities.values()) {
    if (e.type !== "supply" || e.hp <= 0 || e.wreck) continue;
    if (e.order?.kind === "supply") tickResupply(state, e, dt);
  }
}

export function orderSupply(state: MatchState, playerId: string, trucks: Entity[], targetId: number): string | null {
  const target = state.entities.get(targetId);
  if (!target || target.hp <= 0) return "Nothing to resupply.";
  const crew = trucks.filter((e) => e.type === "supply" && e.ownerId === playerId && e.hp > 0 && !e.wreck);
  if (crew.length === 0) return "Select a supply truck.";
  const rearm = target.type === "armory" && allies(state, playerId, target.ownerId);
  const filling = !rearm && allies(state, playerId, target.ownerId) && needsSupply(target);
  if (!rearm && !filling) return "That unit does not need ammo.";
  let sent = 0;
  for (const truck of crew) {
    if (!supplyHasDriver(state, truck)) continue;
    if (rearm && truck.supply >= SUPPLY_CARGO) continue;
    clearOrder(truck);
    truck.order = { kind: "supply", targetId };
    truck.work = 0;
    truck.state = "move";
    const spot = approachPoint(target, truck);
    setPath(state, truck, spot.x, spot.y);
    sent++;
  }
  if (sent === 0) return rearm ? "The truck is already full." : "No driver.";
  return null;
}

export function orderBoard(state: MatchState, playerId: string, units: Entity[], truckId: number): string | null {
  const truck = state.entities.get(truckId);
  if (!truck || truck.type !== "supply" || truck.hp <= 0 || truck.wreck) return "No such truck.";
  const feet = units.filter((e) => e.ownerId === playerId && isInfantryType(e.type));
  if (feet.length === 0) return "Select infantry.";
  let n = 0;
  let why = "Cannot board.";
  for (const e of feet) {
    const err = canBoardTruck(state, e, truck);
    if (err) {
      why = err;
      continue;
    }
    if (e.garrisonedIn) continue;
    clearOrder(e);
    e.order = { kind: "board", targetId: truck.id };
    e.state = "move";
    const spot = approachPoint(truck, e);
    setPath(state, e, spot.x, spot.y);
    n++;
  }
  if (n === 0) return why;
  return null;
}
