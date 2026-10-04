import { buildingRect, isTurnedBuilding, rectNearest } from "../building-rect.js";
import {
  DRIVER_KILL_CHANCE,
  MINE_DISABLE_SECONDS,
  MINE_SCRAP,
  MINE_TRIGGER_TILES,
  GARRISON_STRUCTURAL_CALIBER,
  SHELL_TYPES,
  SUPPLY_CARGO,
  SUPPLY_PER_SEC,
  SUPPLY_REARM_PER_SEC,
  SUPPLY_SEEK_TILES,
  SUPPLY_REGEN_PER_SEC,
  SUPPLY_ROUNDS_PER_POINT,
  SUPPLY_SHELL_COST,
  TRUCK_RIDER_HP_MUL,
  TRUCK_RIDER_SHARE_FRONT,
  TRUCK_RIDER_SHARE_REAR,
  TRUCK_RIDER_SHARE_SIDE,
  TRUCK_SEATS,
  catalog,
  hasCrit,
  infantryGunFor,
  isAircraftType,
  isInfantryType,
  isTransportType,
  supplyDrumOf,
  supplyShortOf,
  rocketAmmoOf,
  heavyAmmoOf,
  PENETRATOR_ARM_SECONDS,
  PENETRATOR_SUPPLY_COST,
  weaponFitsTruck,
  type ShellType,
} from "../catalog.js";
import { gunCrewOf } from "./artillery.js";
import type { ArmorFace } from "./ballistics.js";
import { takeDamage } from "./crits.js";
import { detachGarrisoned, livingGarrison } from "./garrison.js";
import { allies, buildingBounds, clearOrder, nearestWalkable, tileCenter, worldToTile } from "./geo.js";
import { setPath } from "./path.js";
import { nextRand } from "./rng.js";
import { earnScrap } from "./smelter.js";
import type { Entity, MatchState } from "./types.js";

const BOARD_SLACK = 12;
const SUPPLY_REACH = 18;

export function supplyHasDriver(state: MatchState, truck: Entity): boolean {
  if (truck.type !== "supply" || truck.hp <= 0 || truck.wreck) return false;
  if (truck.crew) return true;
  return livingGarrison(state, truck).length > 0;
}

/** Non-trucks always drive. An open supply truck does not, nor a field gun with no crew or on a tow. */
export function supplyCanDrive(state: MatchState, e: Entity): boolean {
  if (e.type === "artillery") return gunCrewOf(e) > 0 && e.towedBy == null;
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

/** True when this unit, or the hull it is inside, is sitting in a transport's bay. */
export function stowedInTransport(state: MatchState, e: Entity): boolean {
  let id = e.garrisonedIn;
  const seen = new Set<number>();
  while (id != null && !seen.has(id)) {
    seen.add(id);
    const host = state.entities.get(id);
    if (!host) return false;
    if (isTransportType(host.type)) return true;
    id = host.garrisonedIn;
  }
  return false;
}

/** False only for a truck rider who must keep their weapon slung, or anyone in a transport bay. */
export function supplyRiderFights(state: MatchState, e: Entity): boolean {
  if (e.garrisonedIn == null) return true;
  // Jumpers in a transport's bay keep their weapons slung until they are out of the door.
  if (stowedInTransport(state, e)) return false;
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
  return supplyShortOf(e.type, e.ammo, e.mgAmmo, e.clip, e.rockets, e.heavy);
}

/** Point of a building's footprint nearest to (x, y). */
function footprintNearest(state: MatchState, b: Entity, x: number, y: number): { x: number; y: number } {
  if (isTurnedBuilding(b)) return rectNearest(buildingRect(b, state.tileSize), x, y);
  const box = buildingBounds(b, state.tileSize);
  return { x: Math.min(box.x1, Math.max(box.x0, x)), y: Math.min(box.y1, Math.max(box.y0, y)) };
}

/** Side by side. A building (Armory, CIWS) is reached at its footprint edge, not its center. */
function nearTruck(state: MatchState, a: Entity, b: Entity, slack: number): boolean {
  if (Math.hypot(a.x - b.x, a.y - b.y) <= a.radius + b.radius + slack) return true;
  if (b.kind !== "building") return false;
  const edge = footprintNearest(state, b, a.x, a.y);
  return Math.hypot(a.x - edge.x, a.y - edge.y) <= a.radius + slack;
}

function approachPoint(state: MatchState, truck: Entity, from: Entity): { x: number; y: number } {
  if (truck.kind === "building") {
    const edge = footprintNearest(state, truck, from.x, from.y);
    const ex = from.x - edge.x;
    const ey = from.y - edge.y;
    const ed = Math.hypot(ex, ey);
    if (ed > 1e-6) {
      const out = from.radius + 6;
      return { x: edge.x + (ex / ed) * out, y: edge.y + (ey / ed) * out };
    }
  }
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
    takeDamage(rider, dmg, state.tick);
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

/** The Rocketer's one high-penetration missile. Costs more than a shell. */
function giveHeavy(truck: { supply: number }, e: Entity): boolean {
  const max = heavyAmmoOf(e.type);
  if (max <= 0 || (e.heavy ?? 0) >= max || truck.supply < PENETRATOR_SUPPLY_COST) return false;
  e.heavy = (e.heavy ?? 0) + 1;
  truck.supply -= PENETRATOR_SUPPLY_COST;
  // It arrives in the pack. On the tube, he still has to fit it before it fires.
  if (infantryGunFor(e)?.id === "penetrator" && e.reload <= 0) e.reload = PENETRATOR_ARM_SECONDS;
  return true;
}

/** One rocket back into the Titan's rack. Costs the same as a shell. */
function giveRocket(e: Entity): boolean {
  const max = rocketAmmoOf(e.type);
  if ((e.rockets ?? 0) >= max) return false;
  e.rockets = (e.rockets ?? 0) + 1;
  return true;
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
  const drum = supplyDrumOf(e.type);
  if (drum > 0 && e.clip < drum) {
    e.clip = Math.min(drum, e.clip + n);
    return true;
  }
  const cap = def.mgAmmo ?? 0;
  if (cap > 0 && e.mgAmmo < cap) {
    e.mgAmmo = Math.min(cap, e.mgAmmo + n);
    return true;
  }
  return false;
}

/** One hand-out from a store of supply points (a truck's bed, a dropped crate): a shell or rocket, else a belt's worth of rounds. */
export function transferOnce(truck: { supply: number }, target: Entity): boolean {
  if (truck.supply <= 0) return false;
  if (giveHeavy(truck, target)) return true;
  if (truck.supply >= SUPPLY_SHELL_COST && (giveShell(target) || giveRocket(target))) {
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
  if (!nearTruck(state, truck, target, SUPPLY_REACH)) {
    truck.state = "move";
    if (truck.waypoints.length === 0 || state.tick % 8 === 0) {
      const spot = approachPoint(state, target, truck);
      setPath(state, truck, spot.x, spot.y);
    }
    return;
  }
  truck.waypoints = [];
  truck.state = "idle";
  if (!hasCrit(truck, "engine")) {
    truck.facing = Math.atan2(target.y - truck.y, target.x - truck.x);
    truck.turretFacing = truck.facing;
  }
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

/** World px past the fuze the truck stands, so the hull stays off the bomblet. */
const DISABLE_PAD = 10;

function mineFuze(ts: number, radius: number): number {
  return MINE_TRIGGER_TILES * ts + radius;
}

function disableReach(ts: number, radius: number): number {
  return mineFuze(ts, radius) + DISABLE_PAD + 8;
}

/** A point just outside the fuze, on the side the truck is already on. */
function disableStand(truck: Entity, mine: { x: number; y: number }, ts: number): { x: number; y: number } {
  const stand = mineFuze(ts, truck.radius) + DISABLE_PAD;
  const dx = truck.x - mine.x;
  const dy = truck.y - mine.y;
  const d = Math.hypot(dx, dy) || 1;
  return { x: mine.x + (dx / d) * stand, y: mine.y + (dy / d) * stand };
}

function tickDisable(state: MatchState, truck: Entity, dt: number): void {
  const id = truck.order?.kind === "disable" ? truck.order.targetId : undefined;
  const mine = id != null ? state.mines.find((m) => m.id === id) : undefined;
  if (!mine || !supplyHasDriver(state, truck)) {
    truck.work = 0;
    stall(truck);
    return;
  }
  const d = Math.hypot(truck.x - mine.x, truck.y - mine.y);
  if (d > disableReach(state.tileSize, truck.radius)) {
    truck.state = "move";
    truck.work = 0;
    if (truck.waypoints.length === 0 || state.tick % 8 === 0) {
      const spot = disableStand(truck, mine, state.tileSize);
      setPath(state, truck, spot.x, spot.y);
    }
    return;
  }
  truck.waypoints = [];
  truck.state = "idle";
  if (!hasCrit(truck, "engine")) {
    truck.facing = Math.atan2(mine.y - truck.y, mine.x - truck.x);
    truck.turretFacing = truck.facing;
  }
  truck.work += dt;
  if (truck.work < MINE_DISABLE_SECONDS) return;
  const i = state.mines.findIndex((m) => m.id === mine.id);
  if (i >= 0) {
    state.mines.splice(i, 1);
    const player = state.players.get(truck.ownerId);
    if (player) earnScrap(state, player, MINE_SCRAP);
  }
  truck.work = 0;
  stall(truck);
}

/** Idle, or on a top-up it picked for itself. A player order wins. */
function mayAutoSupply(truck: Entity): boolean {
  if (truck.garrisonedIn != null) return false;
  const o = truck.order;
  return !o || (o.auto === true && o.kind === "supply");
}

/** Allied ground unit short of ammo, close enough to drive over. Held trucks only serve what is alongside. */
function canTopUp(state: MatchState, truck: Entity, other: Entity): boolean {
  if (other.id === truck.id || other.kind !== "unit" || isAircraftType(other.type)) return false;
  if (!needsSupply(other) || !allies(state, truck.ownerId, other.ownerId)) return false;
  if (truck.holdPosition) return nearTruck(state, truck, other, SUPPLY_REACH);
  const seek = SUPPLY_SEEK_TILES * state.tileSize;
  return Math.hypot(other.x - truck.x, other.y - truck.y) <= seek;
}

function chooseTopUp(state: MatchState, truck: Entity): Entity | null {
  const currentId = truck.order?.kind === "supply" ? truck.order.targetId : undefined;
  const current = currentId != null ? state.entities.get(currentId) : undefined;
  if (current && canTopUp(state, truck, current)) return current;
  let best: Entity | null = null;
  let bestD = Infinity;
  for (const other of state.entities.values()) {
    if (!canTopUp(state, truck, other)) continue;
    const d = Math.hypot(other.x - truck.x, other.y - truck.y);
    if (!best || d < bestD - 0.5 || (Math.abs(d - bestD) <= 0.5 && other.id < best.id)) {
      best = other;
      bestD = d;
    }
  }
  return best;
}

/** Like the medic: an idle crewed truck with cargo drives to the nearest ally short of ammo. */
function autoSupply(state: MatchState): void {
  for (const truck of state.entities.values()) {
    if (truck.type !== "supply" || truck.hp <= 0 || truck.wreck) continue;
    if (!mayAutoSupply(truck)) continue;
    const target = truck.supply > 0 && supplyHasDriver(state, truck) ? chooseTopUp(state, truck) : null;
    if (!target) {
      if (truck.order) stall(truck);
      continue;
    }
    if (truck.order?.targetId === target.id) continue;
    clearOrder(truck);
    truck.order = { kind: "supply", targetId: target.id, auto: true };
    truck.state = "move";
    const spot = approachPoint(state, target, truck);
    setPath(state, truck, spot.x, spot.y);
  }
}

function tickBoard(state: MatchState, unit: Entity): void {
  if (unit.order?.kind !== "board" || unit.order.targetId == null) return;
  const truck = state.entities.get(unit.order.targetId);
  if (!truck) {
    clearOrder(unit);
    return;
  }
  // Boarding a transport on its hardstand is tickPlaneBoarding's; crewing a field gun is tickArtillery's.
  if (isTransportType(truck.type) || truck.type === "artillery") return;
  if (canBoardTruck(state, unit, truck)) {
    clearOrder(unit);
    return;
  }
  if (nearTruck(state, unit, truck, BOARD_SLACK)) {
    enterTruck(state, unit, truck);
    return;
  }
  unit.state = "move";
  if (unit.waypoints.length === 0 || state.tick % 8 === 0) {
    const spot = approachPoint(state, truck, unit);
    setPath(state, unit, spot.x, spot.y);
  }
}

export function tickSupply(state: MatchState, dt: number): void {
  for (const e of state.entities.values()) {
    if (e.type !== "supply" || e.hp <= 0 || e.wreck) continue;
    if (e.supply < SUPPLY_CARGO) e.supply = Math.min(SUPPLY_CARGO, e.supply + SUPPLY_REGEN_PER_SEC * dt);
    if (!supplyHasDriver(state, e)) stall(e);
  }
  for (const e of state.entities.values()) {
    if (e.kind !== "unit" || e.hp <= 0 || e.garrisonedIn) continue;
    if (e.order?.kind === "board") tickBoard(state, e);
  }
  autoSupply(state);
  for (const e of state.entities.values()) {
    if (e.type !== "supply" || e.hp <= 0 || e.wreck) continue;
    if (e.order?.kind === "supply") tickResupply(state, e, dt);
    else if (e.order?.kind === "disable") tickDisable(state, e, dt);
  }
}

export function orderDisable(state: MatchState, playerId: string, trucks: Entity[], mineId: number): string | null {
  const mine = state.mines.find((m) => m.id === mineId);
  if (!mine) return "No mine there.";
  const crew = trucks.filter((e) => e.type === "supply" && e.ownerId === playerId && e.hp > 0 && !e.wreck);
  if (crew.length === 0) return "Select a supply truck.";
  let sent = 0;
  for (const truck of crew) {
    if (!supplyHasDriver(state, truck)) continue;
    clearOrder(truck);
    truck.order = { kind: "disable", targetId: mineId };
    truck.work = 0;
    truck.state = "move";
    const spot = disableStand(truck, mine, state.tileSize);
    setPath(state, truck, spot.x, spot.y);
    sent++;
  }
  if (sent === 0) return "No driver.";
  return null;
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
    const spot = approachPoint(state, target, truck);
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
    const spot = approachPoint(state, truck, e);
    setPath(state, e, spot.x, spot.y);
    n++;
  }
  if (n === 0) return why;
  return null;
}
