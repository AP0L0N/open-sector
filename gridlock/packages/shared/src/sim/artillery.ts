import {
  ARTILLERY_CREW,
  ARTILLERY_CREW_BLAST_SHARE,
  ARTILLERY_CREW_HIT_FRONT,
  ARTILLERY_CREW_HIT_REAR,
  ARTILLERY_CREW_HIT_SIDE,
  ARTILLERY_CREW_HP,
  ARTILLERY_HITCH_SLACK,
  ARTILLERY_SETUP_SECONDS,
  ARTILLERY_TOW_GAP,
  isCyborg,
  isInfantryType,
} from "../catalog.js";
import type { ArmorFace } from "./ballistics.js";
import { allies, clearOrder, destroyEntity, worldToTile } from "./geo.js";
import { setPath } from "./path.js";
import { leaveCorpse } from "./remains.js";
import { nextRand } from "./rng.js";
import { supplyHasDriver } from "./supply.js";
import type { Entity, MatchState } from "./types.js";

const CREW_SLACK = 12;

export function gunCrewOf(e: Entity): number {
  return e.type === "artillery" ? (e.gunCrew?.length ?? 0) : 0;
}

/** Share of the hauling pace. Two men pull at full pace, one at half, nobody not at all. A towed gun rides the truck. */
export function artilleryHaulMul(e: Entity): number {
  if (e.type !== "artillery") return 1;
  if (e.towedBy != null) return 0;
  return gunCrewOf(e) / ARTILLERY_CREW;
}

/** Reload stretch: a lone crewman takes twice as long. */
export function artilleryReloadMul(e: Entity): number {
  const n = gunCrewOf(e);
  return n > 0 ? ARTILLERY_CREW / n : 1;
}

/** Halted, unhitched, crewed, and the trail is set. */
export function artilleryReady(e: Entity): boolean {
  return (
    e.type === "artillery" &&
    gunCrewOf(e) > 0 &&
    e.towedBy == null &&
    e.waypoints.length === 0 &&
    e.bipod >= ARTILLERY_SETUP_SECONDS
  );
}

/** The gun can lay on a target: crewed, unhitched, and not on the move. */
export function artilleryCanLay(e: Entity): boolean {
  return gunCrewOf(e) > 0 && e.towedBy == null && e.waypoints.length === 0;
}

function crewHitChance(face: ArmorFace | "none"): number {
  if (face === "front") return ARTILLERY_CREW_HIT_FRONT;
  if (face === "rear") return ARTILLERY_CREW_HIT_REAR;
  return ARTILLERY_CREW_HIT_SIDE;
}

function crewDied(state: MatchState, gun: Entity): void {
  const x = gun.x - Math.cos(gun.facing) * gun.radius;
  const y = gun.y - Math.sin(gun.facing) * gun.radius;
  leaveCorpse(state, { ...gun, type: "rifleman", x, y, garrisonedIn: null, fireDeath: undefined });
  state.impacts.push({ id: state.nextId++, ownerId: gun.ownerId, kind: "kill", x, y, vx: 0, vy: 0 });
  if (gunCrewOf(gun) > 0) return;
  gun.bipod = 0;
  clearOrder(gun);
  gun.state = "idle";
}

function woundCrewman(state: MatchState, gun: Entity, i: number, damage: number): void {
  const crew = gun.gunCrew;
  if (!crew || crew[i] == null || damage <= 0) return;
  crew[i] = Math.max(0, crew[i]! - damage);
  if (crew[i]! > 0) return;
  crew.splice(i, 1);
  crewDied(state, gun);
}

/**
 * A small-arms round on the gun. It never harms the steel. It may find one of
 * the crew, less often through the shield. True when a crewman was hit.
 */
export function bulletOnGun(state: MatchState, gun: Entity, face: ArmorFace | "none", damage: number): boolean {
  const n = gunCrewOf(gun);
  if (n === 0 || gun.hp <= 0) return false;
  if (nextRand(state) >= crewHitChance(face)) return false;
  const i = Math.min(n - 1, Math.floor(nextRand(state) * n));
  woundCrewman(state, gun, i, Math.max(1, Math.round(damage)));
  return true;
}

/** A shell or blast on the gun also wounds each crewman. */
export function blastOnGun(state: MatchState, gun: Entity, dealt: number): void {
  const crew = gun.gunCrew;
  if (!crew || dealt <= 0) return;
  const dmg = Math.max(1, Math.round(dealt * ARTILLERY_CREW_BLAST_SHARE));
  for (let i = crew.length - 1; i >= 0; i--) woundCrewman(state, gun, i, dmg);
}

export function canCrewGun(state: MatchState, unit: Entity, gun: Entity): string | null {
  if (!isInfantryType(unit.type) || isCyborg(unit.type) || unit.hp <= 0 || unit.wreck) return "Only infantry can crew a gun.";
  if (gun.type !== "artillery" || gun.hp <= 0 || gun.wreck) return "Cannot crew that.";
  if (unit.garrisonedIn != null) return "Already inside.";
  const n = gunCrewOf(gun);
  if (n >= ARTILLERY_CREW) return "The gun is fully crewed.";
  if (n > 0 && !allies(state, unit.ownerId, gun.ownerId)) return "The gun is crewed.";
  return null;
}

/** Where a soldier stands to take a place at the gun: beside the trail. */
function crewSpot(gun: Entity, from: Entity): { x: number; y: number } {
  const back = gun.facing + Math.PI;
  const dist = gun.radius + from.radius + 4;
  return { x: gun.x + Math.cos(back) * dist, y: gun.y + Math.sin(back) * dist };
}

/** The soldier takes his place at the gun. He keeps his share of health. An empty gun goes to his side. */
export function joinGun(state: MatchState, unit: Entity, gun: Entity): void {
  const share = unit.hpMax > 0 ? unit.hp / unit.hpMax : 1;
  const hp = Math.max(1, Math.round(ARTILLERY_CREW_HP * share));
  if (gunCrewOf(gun) === 0 && gun.ownerId !== unit.ownerId) {
    gun.ownerId = unit.ownerId;
    clearOrder(gun);
    gun.state = "idle";
  }
  gun.gunCrew = [...(gun.gunCrew ?? []), hp];
  destroyEntity(state, unit);
}

export function orderCrew(state: MatchState, playerId: string, units: Entity[], gunId: number): string | null {
  const gun = state.entities.get(gunId);
  if (!gun || gun.type !== "artillery" || gun.hp <= 0 || gun.wreck) return "No such gun.";
  const feet = units.filter((e) => e.ownerId === playerId && isInfantryType(e.type) && e.garrisonedIn == null);
  if (feet.length === 0) return "Select infantry.";
  const open = ARTILLERY_CREW - gunCrewOf(gun);
  let n = 0;
  let why = "Cannot crew the gun.";
  for (const e of feet) {
    const err = canCrewGun(state, e, gun);
    if (err) {
      why = err;
      continue;
    }
    if (n >= open) break;
    clearOrder(e);
    e.order = { kind: "board", targetId: gun.id };
    e.state = "move";
    const spot = crewSpot(gun, e);
    setPath(state, e, spot.x, spot.y);
    n++;
  }
  if (n === 0) return why;
  return null;
}

function tickCrewWalk(state: MatchState, unit: Entity, gun: Entity): void {
  if (canCrewGun(state, unit, gun)) {
    clearOrder(unit);
    return;
  }
  if (Math.hypot(unit.x - gun.x, unit.y - gun.y) <= unit.radius + gun.radius + CREW_SLACK) {
    joinGun(state, unit, gun);
    return;
  }
  unit.state = "move";
  if (unit.waypoints.length === 0 || state.tick % 8 === 0) {
    const spot = crewSpot(gun, unit);
    setPath(state, unit, spot.x, spot.y);
  }
}

/** Point on the truck's tail where the trail hooks on. */
function hitchPoint(truck: Entity): { x: number; y: number } {
  return { x: truck.x - Math.cos(truck.facing) * truck.radius, y: truck.y - Math.sin(truck.facing) * truck.radius };
}

/** Where the truck backs up to: just past the trail. */
function trailPoint(gun: Entity, truck: Entity): { x: number; y: number } {
  const back = gun.facing + Math.PI;
  const dist = gun.radius + ARTILLERY_TOW_GAP + truck.radius;
  return { x: gun.x + Math.cos(back) * dist, y: gun.y + Math.sin(back) * dist };
}

function canTow(state: MatchState, truck: Entity, gun: Entity): boolean {
  if (truck.type !== "supply" || truck.hp <= 0 || truck.wreck || !supplyHasDriver(state, truck)) return false;
  if (gun.type !== "artillery" || gun.hp <= 0 || gun.wreck) return false;
  if (gun.towedBy != null && gun.towedBy !== truck.id) return false;
  return gun.ownerId === truck.ownerId;
}

export function unhitch(state: MatchState, truck: Entity): void {
  const gun = truck.towing != null ? state.entities.get(truck.towing) : undefined;
  truck.towing = undefined;
  if (gun && gun.towedBy === truck.id) {
    gun.towedBy = undefined;
    gun.bipod = 0;
  }
}

function hitch(state: MatchState, truck: Entity, gun: Entity): void {
  if (truck.towing != null) unhitch(state, truck);
  // Swing the tail onto the trail so the gun rides behind, not through the cab.
  truck.facing = Math.atan2(truck.y - gun.y, truck.x - gun.x);
  truck.turretFacing = truck.facing;
  truck.towing = gun.id;
  gun.towedBy = truck.id;
  gun.bipod = 0;
  clearOrder(gun);
  gun.state = "idle";
  clearOrder(truck);
  truck.state = "idle";
}

/** Supply trucks hitch the gun `targetId`. Without a target they drop whatever they tow. */
export function orderTow(state: MatchState, playerId: string, trucks: Entity[], targetId?: number): string | null {
  const own = trucks.filter((e) => e.type === "supply" && e.ownerId === playerId && e.hp > 0 && !e.wreck);
  if (own.length === 0) return "Select a supply truck.";
  if (targetId == null) {
    const towing = own.filter((e) => e.towing != null);
    if (towing.length === 0) return "Nothing in tow.";
    for (const t of towing) unhitch(state, t);
    return null;
  }
  const gun = state.entities.get(targetId);
  if (!gun || gun.type !== "artillery" || gun.hp <= 0 || gun.wreck) return "Nothing to tow.";
  if (gun.ownerId !== playerId) return "That gun is not yours.";
  const truck =
    own.find((e) => e.towing === gun.id) ??
    own.find((e) => e.towing == null && supplyHasDriver(state, e)) ??
    own.find((e) => supplyHasDriver(state, e));
  if (!truck) return "No driver.";
  if (gun.towedBy != null && gun.towedBy !== truck.id) return "That gun is already in tow.";
  if (truck.towing === gun.id) return null;
  clearOrder(truck);
  truck.order = { kind: "tow", targetId: gun.id };
  truck.state = "move";
  const spot = trailPoint(gun, truck);
  setPath(state, truck, spot.x, spot.y);
  return null;
}

function tickTowOrder(state: MatchState, truck: Entity): void {
  const gun = truck.order?.targetId != null ? state.entities.get(truck.order.targetId) : undefined;
  if (!gun || !canTow(state, truck, gun)) {
    clearOrder(truck);
    truck.state = "idle";
    return;
  }
  if (Math.hypot(truck.x - gun.x, truck.y - gun.y) <= truck.radius + gun.radius + ARTILLERY_HITCH_SLACK) {
    hitch(state, truck, gun);
    return;
  }
  truck.state = "move";
  if (truck.waypoints.length === 0 || state.tick % 8 === 0) {
    const spot = trailPoint(gun, truck);
    setPath(state, truck, spot.x, spot.y);
  }
}

/**
 * Before movement: crew walking to a gun, trucks backing up to hitch one,
 * broken tows, and the time the crew needs to set the trail.
 */
export function tickArtillery(state: MatchState, dt: number): void {
  for (const e of [...state.entities.values()]) {
    if (e.kind !== "unit" || e.hp <= 0 || e.garrisonedIn != null) continue;
    if (e.order?.kind === "board" && e.order.targetId != null) {
      const gun = state.entities.get(e.order.targetId);
      if (gun?.type === "artillery") tickCrewWalk(state, e, gun);
    }
  }
  for (const e of state.entities.values()) {
    if (e.type === "supply") {
      if (e.towing != null) {
        const gun = state.entities.get(e.towing);
        if (!gun || !canTow(state, e, gun)) unhitch(state, e);
      }
      if (e.order?.kind === "tow") tickTowOrder(state, e);
      continue;
    }
    if (e.type !== "artillery" || e.hp <= 0) continue;
    if (e.towedBy != null) {
      const truck = state.entities.get(e.towedBy);
      if (!truck || truck.towing !== e.id || !canTow(state, truck, e)) e.towedBy = undefined;
    }
    if (!artilleryCanLay(e)) e.bipod = 0;
    else e.bipod = Math.min(ARTILLERY_SETUP_SECONDS, e.bipod + dt);
  }
}

/** After movement: each towed gun swings in behind its truck like a trailer, barrel to the rear. */
export function syncTowedGuns(state: MatchState): void {
  for (const truck of state.entities.values()) {
    if (truck.type !== "supply" || truck.towing == null) continue;
    const gun = state.entities.get(truck.towing);
    if (!gun || gun.towedBy !== truck.id) continue;
    const hook = hitchPoint(truck);
    const reach = gun.radius + ARTILLERY_TOW_GAP;
    let dx = gun.x - hook.x;
    let dy = gun.y - hook.y;
    let d = Math.hypot(dx, dy);
    if (d < 1e-3) {
      dx = -Math.cos(truck.facing);
      dy = -Math.sin(truck.facing);
      d = 1;
    }
    gun.x = hook.x + (dx / d) * reach;
    gun.y = hook.y + (dy / d) * reach;
    gun.facing = Math.atan2(dy, dx);
    gun.turretFacing = gun.facing;
    gun.waypoints = [];
    gun.state = truck.state === "move" ? "move" : "idle";
    gun.tileX = worldToTile(gun.x, state.tileSize);
    gun.tileY = worldToTile(gun.y, state.tileSize);
  }
}
