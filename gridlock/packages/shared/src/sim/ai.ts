/**
 * Easy CPU: raise a mixed army from every factory and attack-move it at the enemy now and then.
 * Between waves it defends the base, keeps its support units busy, and fits shells to targets.
 */

import {
  BUILD_RADIUS,
  DRONE_LAUNCH_MIN_SECONDS,
  GARRISON_STRUCTURAL_CALIBER,
  STUKA_BOMBS,
  SUPPLY_CARGO,
  TECH_REQUIRES,
  TICK_HZ,
  catalog,
  fires,
  isAircraftType,
  isArmoredType,
  isDroneType,
  isBuildingType,
  isDefenceStructure,
  isFieldStructure,
  isInfantryType,
  type BuildingType,
  type TrainType,
} from "../catalog.js";
import { applyCommand } from "./commands.js";
import { canRepairTarget, canScrapWreck } from "./field.js";
import { allies, footprintGap, hasCore, hqOf, inBuildRadius, tilesBlockedOrScrap, walkable } from "./geo.js";
import { smelterDock } from "./harvest.js";
import { powerOf } from "./power.js";
import { needsSupply } from "./supply.js";
import { canSeeEntity } from "./vision.js";
import type { Entity, MatchState, SimPlayer, StructureJob } from "./types.js";

export const EASY_ATTACK_FIRST_TICKS = 70 * TICK_HZ;
export const EASY_ATTACK_EVERY_TICKS = 55 * TICK_HZ;
export const EASY_ATTACK_RETRY_TICKS = 8 * TICK_HZ;
/** Support, shell, and defense upkeep runs this often, not every think. */
export const EASY_MICRO_EVERY_TICKS = 2 * TICK_HZ;
/** A building with no legal spot in the base waits this long before the CPU tries it again. */
export const EASY_NO_ROOM_RETRY_TICKS = 60 * TICK_HZ;
export const EASY_MIN_FIGHTERS = 4;
export const EASY_WANT_HAULERS = 2;
/** Enemies this far from the HQ, in tiles, pull the home guard. */
export const EASY_DEFEND_TILES = BUILD_RADIUS + 6 * 4;
/** Footprint gap the CPU keeps between its buildings, in tiles. 1 = touching; 5 leaves a Mauler lane. */
const EASY_BUILD_LANE_TILES = 5;
/** A Mauler stuck this long mid-trip is jammed. */
export const EASY_HAULER_JAM_TICKS = 10 * TICK_HZ;
/** How far a jammed Mauler backs off, in tiles. */
const EASY_HAULER_BACKOFF_TILES = 4 * 4;
/** A wave this close to a seen enemy building, in tiles, turns on it. */
const EASY_SIEGE_TILES = 16 * 4;
/** Engineers and trucks look for work this far from themselves, in tiles. */
const EASY_WORK_TILES = 20 * 4;
const TRAIN_QUEUE_SOFT = 2;
const FIRST_WAVE_TROOPERS = 4;

/**
 * Army the CPU keeps, listed under the factory that trains it. Each think, each factory
 * offers its row furthest below its share, neediest first, so the ranks fill evenly.
 * Order breaks ties.
 */
export const EASY_ARMY: Readonly<Record<"muster" | "armory" | "airfield", readonly { unit: TrainType; want: number }[]>> = {
  muster: [
    { unit: "rifleman", want: 8 },
    { unit: "gunner", want: 2 },
    { unit: "atinfantry", want: 2 },
    { unit: "rocketer", want: 2 },
    { unit: "pyro", want: 1 },
    { unit: "medic", want: 2 },
    { unit: "sniper", want: 1 },
    { unit: "mortarman", want: 1 },
    { unit: "engineer", want: 1 },
    { unit: "droneop", want: 1 },
  ],
  armory: [
    { unit: "ss3", want: 3 },
    { unit: "warden", want: 2 },
    { unit: "apocalypse", want: 1 },
    { unit: "jagdtiger", want: 1 },
    { unit: "walker", want: 1 },
    { unit: "supply", want: 1 },
    { unit: "cyborg", want: 1 },
    { unit: "titan", want: 1 },
    { unit: "nebelwerfer", want: 1 },
  ],
  airfield: [{ unit: "stuka", want: 2 }],
};

/**
 * Smelter second so the free Mauler funds Muster, Armory, troops, and tanks. Research next:
 * it unlocks the Tiger, Apocalypse, Jagdtiger, Cyborg, Titan, Nebelwerfer, and Drone Op. Then air, then defenses.
 */
const BUILD_ORDER: readonly BuildingType[] = [
  "dynamo",
  "smelter",
  "muster",
  "armory",
  "research",
  "airfield",
  "ciws",
  "bunker",
  "tower",
  "ram",
];
/** Started as soon as scrap covers them. The rest wait for the first rifle wave and the second Mauler. */
const CORE_BUILDINGS: readonly BuildingType[] = ["dynamo", "smelter", "muster"];
/** Troops train only once these stand, so scrap is held for them while they go up. */
const FACTORIES: readonly BuildingType[] = [...CORE_BUILDINGS, "armory"];
/** Fixed guns wait for a field army: static defense does not win a match. */
const DEFENSES: readonly BuildingType[] = ["ciws", "bunker", "tower", "ram"];

/** Unarmed units that walk out with a wave beside a fighter. */
const ESCORTS: ReadonlySet<string> = new Set(["medic", "supply", "droneop"]);
/** Unarmed units that idle at home. Parked against a building they shut a Mauler lane. */
const YARD_IDLERS: ReadonlySet<string> = new Set([...ESCORTS, "engineer"]);
/** Soldiers the CPU leaves at home in its Bunker and Watch Tower, in order of preference. */
const BUNKER_CREW: readonly string[] = ["gunner", "rifleman", "atinfantry", "rocketer"];
/** Defenses the CPU mans with BUNKER_CREW. */
const CREWED: readonly BuildingType[] = ["bunker", "tower"];

export function tickAi(state: MatchState): void {
  if (state.ended) return;
  for (const p of state.players.values()) {
    if (!p.ai || !p.alive) continue;
    thinkEasy(state, p);
  }
}

function thinkEasy(state: MatchState, p: SimPlayer): void {
  const hq = hqOf(state, p.playerId);
  if (!hq) return;
  if (!hasCore(state, p.playerId)) {
    if (hq.type === "rig" && hq.state !== "deploy") {
      applyCommand(state, p.playerId, { type: "cmd.deploy", id: hq.id });
    }
    return;
  }

  const placedBase = placeReadyBuilding(state, p, p.structure);
  const placedDefence = placeReadyBuilding(state, p, p.defence);
  if (!placedBase && !placedDefence) {
    const next = nextBuilding(state, p);
    const laneBusy = next != null && (isDefenceStructure(next) ? p.defence : p.structure);
    if (next && !laneBusy && canStartBuilding(state, p, next)) {
      if (findBuildTile(state, p.playerId, next)) {
        applyCommand(state, p.playerId, { type: "cmd.build", building: next });
      } else {
        noRoom(state, p, next);
      }
    }
  }

  harvestIdle(state, p);
  trainEasy(state, p);
  maybeAttack(state, p);
  if (state.tick >= (p.aiNextMicroTick ?? 0)) {
    p.aiNextMicroTick = state.tick + EASY_MICRO_EVERY_TICKS;
    defendBase(state, p, hq);
    microUnits(state, p, hq);
    unjamHaulers(state, p);
    crewBunkers(state, p);
  }
}

/** Place a finished building, or refund it when the base has no room. Returns whether this job was ready. */
function placeReadyBuilding(state: MatchState, p: SimPlayer, job: StructureJob | null): boolean {
  if (!job?.ready || !isBuildingType(job.type)) return false;
  const type = job.type;
  const spot = findBuildTile(state, p.playerId, type);
  if (spot) {
    applyCommand(state, p.playerId, { type: "cmd.place", building: type, tx: spot.tx, ty: spot.ty });
  } else {
    // Trees, scrap, and the map edge can leave no room. Take the refund rather than block the lane.
    applyCommand(state, p.playerId, { type: "cmd.cancel", what: "structure", building: type });
    noRoom(state, p, type);
  }
  return true;
}

function nextBuilding(state: MatchState, p: SimPlayer): BuildingType | null {
  const pow = powerOf(state, p.playerId);
  const roomy = (t: BuildingType): boolean => (p.aiNoRoomUntil?.[t] ?? 0) <= state.tick;
  for (const t of BUILD_ORDER) {
    if (countType(state, p.playerId, t) > 0 || !roomy(t)) continue;
    const draw = Math.max(0, -catalog(t).power);
    if (t !== "dynamo" && pow.used + draw > pow.provided) return roomy("dynamo") ? "dynamo" : null;
    return t;
  }
  if (pow.used >= pow.provided && roomy("dynamo")) return "dynamo";
  return null;
}

function noRoom(state: MatchState, p: SimPlayer, type: BuildingType): void {
  p.aiNoRoomUntil = { ...p.aiNoRoomUntil, [type]: state.tick + EASY_NO_ROOM_RETRY_TICKS };
}

function canStartBuilding(state: MatchState, p: SimPlayer, next: BuildingType): boolean {
  const cost = catalog(next).cost;
  if (p.scrap < cost) return false;
  if (CORE_BUILDINGS.includes(next)) return true;
  if (DEFENSES.includes(next) && fighterCount(state, p.playerId) < EASY_MIN_FIGHTERS * 2) return false;
  const troopers = countType(state, p.playerId, "rifleman");
  let hold = Math.max(0, FIRST_WAVE_TROOPERS - troopers) * catalog("rifleman").cost;
  if (savingForMauler(state, p)) hold += catalog("hauler").cost;
  return p.scrap >= cost + hold;
}

/** The first rifle wave stands and a Smelter waits on its second Mauler: income comes first. */
function savingForMauler(state: MatchState, p: SimPlayer): boolean {
  return (
    countType(state, p.playerId, "hauler") < EASY_WANT_HAULERS &&
    countType(state, p.playerId, "rifleman") >= FIRST_WAVE_TROOPERS &&
    ownsLive(state, p.playerId, "smelter")
  );
}

function fighterCount(state: MatchState, playerId: string): number {
  let n = 0;
  for (const e of state.entities.values()) if (freeFighter(e, playerId)) n++;
  return n;
}

function trainEasy(state: MatchState, p: SimPlayer): void {
  const reserve = trainReserve(state, p);
  const tryTrain = (unit: TrainType, want: number): boolean => {
    if (countType(state, p.playerId, unit) >= want) return false;
    if (queuedAt(state, p.playerId, unit) >= TRAIN_QUEUE_SOFT) return false;
    if (p.scrap < catalog(unit).cost + reserve) return false;
    return applyCommand(state, p.playerId, { type: "cmd.train", unit }).ok;
  };
  if (tryTrain("hauler", EASY_WANT_HAULERS)) return;
  if (tryTrain("rifleman", FIRST_WAVE_TROOPERS)) return;
  if (savingForMauler(state, p)) return;
  // One job per factory, neediest rank first. Stop at the first pick scrap cannot cover and save
  // for it, so a trickle of income does not all go to cheap riflemen ahead of a Titan or a Stuka.
  const picks: { unit: TrainType; want: number; share: number }[] = [];
  for (const factory of ["armory", "muster", "airfield"] as const) {
    if (!ownsLive(state, p.playerId, factory)) continue;
    if (queuedOn(state, p.playerId, factory) >= TRAIN_QUEUE_SOFT) continue;
    const pick = neediest(state, p.playerId, EASY_ARMY[factory]);
    if (pick) picks.push(pick);
  }
  picks.sort((a, b) => a.share - b.share);
  for (const pick of picks) {
    if (p.scrap < catalog(pick.unit).cost + reserve) return;
    tryTrain(pick.unit, pick.want);
  }
}

/** Entry with the lowest have/want share, or null when every rank is full. */
function neediest(
  state: MatchState,
  playerId: string,
  army: readonly { unit: TrainType; want: number }[],
): { unit: TrainType; want: number; share: number } | null {
  let best: { unit: TrainType; want: number; share: number } | null = null;
  for (const row of army) {
    // A locked rank is not needy yet: saving for it would stall the whole factory.
    const tech = TECH_REQUIRES[row.unit];
    if (tech && !ownsLive(state, playerId, tech)) continue;
    const share = countType(state, playerId, row.unit) / row.want;
    if (share >= 1 || share >= (best?.share ?? Infinity)) continue;
    best = { ...row, share };
  }
  return best;
}

/** Hold scrap for the next factory. Do not starve the first troop wave to save for Armory. */
function trainReserve(state: MatchState, p: SimPlayer): number {
  // A factory under way is paid for first. Extras (Research, air, defenses) share scrap with the army.
  const paying = [p.structure, p.defence].find(
    (j) => j && !j.ready && isBuildingType(j.type) && FACTORIES.includes(j.type),
  );
  if (paying && isBuildingType(paying.type)) {
    return Math.max(0, catalog(paying.type).cost - paying.paid);
  }
  if (countType(state, p.playerId, "dynamo") === 0) return catalog("dynamo").cost;
  if (countType(state, p.playerId, "muster") === 0) return catalog("muster").cost;
  if (countType(state, p.playerId, "rifleman") < FIRST_WAVE_TROOPERS) return 0;
  if (countType(state, p.playerId, "armory") === 0) return catalog("armory").cost;
  if (fighterCount(state, p.playerId) < EASY_MIN_FIGHTERS * 2) return 0;
  // Either lane already drawing scrap is the build being saved for. Do not reserve it twice.
  if (p.structure || p.defence) return 0;
  const next = nextBuilding(state, p);
  return next ? catalog(next).cost : 0;
}

function harvestIdle(state: MatchState, p: SimPlayer): void {
  const ids: number[] = [];
  for (const e of state.entities.values()) {
    if (e.ownerId !== p.playerId || e.type !== "hauler" || e.hp <= 0 || e.wreck || e.cartHp <= 0) continue;
    if (e.returnToBase || e.holdPosition || e.order?.kind === "withdraw") continue;
    if (e.autoHarvest || e.order || e.state === "harvest" || e.state === "unload") continue;
    // A full cart takes the harvest order to the Smelter first. Backed off from a jam, one waits here.
    ids.push(e.id);
  }
  if (ids.length === 0) return;
  applyCommand(state, p.playerId, { type: "cmd.harvest", ids });
}

/**
 * Fill each Bunker and Watch Tower with soldiers who are idle at home, machine guns first.
 * They stay behind the slits as the base guard. Waves never take a garrisoned soldier.
 */
function crewBunkers(state: MatchState, p: SimPlayer): void {
  for (const b of state.entities.values()) {
    if (b.ownerId !== p.playerId || !(CREWED as readonly string[]).includes(b.type) || b.hp <= 0) continue;
    const room = (catalog(b.type).garrisonCap ?? 0) - b.garrison.length;
    if (room <= 0) continue;
    const idle: Entity[] = [];
    for (const e of state.entities.values()) {
      if (e.ownerId !== p.playerId || e.hp <= 0 || e.garrisonedIn || !BUNKER_CREW.includes(e.type)) continue;
      if (e.order && !e.order.auto) continue;
      idle.push(e);
    }
    idle.sort(
      (a, c) =>
        BUNKER_CREW.indexOf(a.type) - BUNKER_CREW.indexOf(c.type) ||
        Math.hypot(a.x - b.x, a.y - b.y) - Math.hypot(c.x - b.x, c.y - b.y),
    );
    const ids = idle.slice(0, room).map((e) => e.id);
    if (ids.length > 0) applyCommand(state, p.playerId, { type: "cmd.garrison", ids, buildingId: b.id });
  }
}

/**
 * Two Maulers can lock nose to nose at a Smelter dock or in a lane, and neither gives way.
 * One that has not moved for a while mid-trip backs off a few tiles, away from whatever it is
 * pressed against. Arrived and idle, it picks the haul up again by itself.
 */
function unjamHaulers(state: MatchState, p: SimPlayer): void {
  const seen: NonNullable<SimPlayer["aiHaulerStill"]> = {};
  for (const e of state.entities.values()) {
    if (e.ownerId !== p.playerId || e.type !== "hauler" || e.hp <= 0 || e.wreck) continue;
    const busy = e.state === "harvest" || e.state === "unload" || e.state === "move";
    if (!busy || e.waypoints.length === 0 || e.holdPosition || e.returnToBase) continue;
    const last = p.aiHaulerStill?.[e.id];
    const still = last && Math.hypot(e.x - last.x, e.y - last.y) < 2;
    const since = still ? last.since : state.tick;
    seen[e.id] = { x: still ? last.x : e.x, y: still ? last.y : e.y, since };
    if (state.tick - since < EASY_HAULER_JAM_TICKS) continue;
    const away = backOff(state, e);
    applyCommand(state, p.playerId, { type: "cmd.move", ids: [e.id], x: away.x, y: away.y });
    delete seen[e.id];
  }
  p.aiHaulerStill = seen;
}

/** A point a few tiles off, away from the nearest thing the hull is jammed against. */
function backOff(state: MatchState, e: Entity): { x: number; y: number } {
  let nx = 0;
  let ny = 0;
  let bestD = Infinity;
  for (const o of state.entities.values()) {
    if (o.id === e.id || o.hp <= 0 || o.garrisonedIn || o.air) continue;
    const d = Math.hypot(o.x - e.x, o.y - e.y);
    if (d >= bestD || d > 64) continue;
    bestD = d;
    nx = o.x;
    ny = o.y;
  }
  let dx = e.x - nx;
  let dy = e.y - ny;
  if (bestD === Infinity || Math.hypot(dx, dy) < 1) {
    const a = (e.id * 2.39996) % (Math.PI * 2);
    dx = Math.cos(a);
    dy = Math.sin(a);
  }
  const len = Math.hypot(dx, dy);
  const step = EASY_HAULER_BACKOFF_TILES * state.tileSize;
  return { x: e.x + (dx / len) * step, y: e.y + (dy / len) * step };
}

function maybeAttack(state: MatchState, p: SimPlayer): void {
  if (state.tick < p.aiNextAttackTick) return;
  const fighters = waveIds(state, p.playerId);
  if (fighters.length < EASY_MIN_FIGHTERS) {
    p.aiNextAttackTick = state.tick + EASY_ATTACK_RETRY_TICKS;
    return;
  }
  const target = enemyHq(state, p.playerId);
  if (!target) {
    p.aiNextAttackTick = state.tick + EASY_ATTACK_RETRY_TICKS;
    return;
  }
  applyCommand(state, p.playerId, {
    type: "cmd.attackmove",
    ids: fighters,
    x: target.x,
    y: target.y,
  });
  escortWave(state, p, fighters);
  sortie(state, p, target.x, target.y);
  p.aiNextAttackTick = state.tick + EASY_ATTACK_EVERY_TICKS;
}

/** Ground units that can fire and are free for a wave. Planes fly sorties; drones follow their op. */
function waveIds(state: MatchState, playerId: string): number[] {
  const ids: number[] = [];
  for (const e of state.entities.values()) {
    if (!freeFighter(e, playerId)) continue;
    if (e.order?.kind === "attackmove" || e.order?.kind === "attack" || e.order?.kind === "forceattack") {
      continue;
    }
    ids.push(e.id);
  }
  return ids;
}

function freeFighter(e: Entity, playerId: string): boolean {
  if (e.ownerId !== playerId || e.hp <= 0 || e.wreck || e.garrisonedIn) return false;
  if (e.kind !== "unit" || !fires(e.type)) return false;
  if (isAircraftType(e.type) || isDroneType(e.type) || e.braced) return false;
  return e.state !== "deploy" && e.state !== "undeploy";
}

/** Medics, trucks, and the drone op each walk out beside a fighter of the wave. */
function escortWave(state: MatchState, p: SimPlayer, fighters: number[]): void {
  if (fighters.length === 0) return;
  let i = 0;
  for (const e of state.entities.values()) {
    if (e.ownerId !== p.playerId || e.hp <= 0 || e.wreck || e.garrisonedIn || !ESCORTS.has(e.type)) continue;
    if (e.order && !e.order.auto) continue;
    const pick = escortPick(state, e, fighters, i++);
    if (pick == null) continue;
    applyCommand(state, p.playerId, { type: "cmd.guard", ids: [e.id], targetId: pick });
  }
}

/** Medics stay with soldiers, trucks with hulls. Anyone else takes the next fighter in turn. */
function escortPick(state: MatchState, e: Entity, fighters: number[], turn: number): number | null {
  const wantInfantry = e.type === "medic" ? true : e.type === "supply" ? false : null;
  const pool = fighters.filter((id) => {
    const f = state.entities.get(id);
    if (!f) return false;
    return wantInfantry == null || isInfantryType(f.type) === wantInfantry;
  });
  const from = pool.length > 0 ? pool : fighters;
  return from[turn % from.length] ?? null;
}

/** Every armed plane on its pad takes off and attack-moves at the point. */
function sortie(state: MatchState, p: SimPlayer, x: number, y: number): void {
  const ids: number[] = [];
  for (const e of state.entities.values()) {
    if (e.ownerId !== p.playerId || e.hp <= 0 || !isAircraftType(e.type) || !e.air) continue;
    if (e.air.phase !== "parked" || e.air.bombs < STUKA_BOMBS) continue;
    ids.push(e.id);
  }
  if (ids.length === 0) return;
  applyCommand(state, p.playerId, { type: "cmd.attackmove", ids, x, y });
}

/** Seen enemies inside the base pull every free fighter near home, and the planes. */
function defendBase(state: MatchState, p: SimPlayer, hq: Entity): void {
  const reach = EASY_DEFEND_TILES * state.tileSize;
  let intruder: Entity | undefined;
  let bestD = Infinity;
  for (const e of state.entities.values()) {
    if (e.kind !== "unit" || e.hp <= 0 || e.wreck || !e.ownerId || e.air) continue;
    if (allies(state, p.playerId, e.ownerId)) continue;
    const d = Math.hypot(e.x - hq.x, e.y - hq.y);
    if (d > reach || d >= bestD) continue;
    if (!canSeeEntity(state, p.playerId, e)) continue;
    intruder = e;
    bestD = d;
  }
  if (!intruder) return;
  const ids: number[] = [];
  for (const e of state.entities.values()) {
    if (!freeFighter(e, p.playerId)) continue;
    if (e.order && !e.order.auto) continue;
    if (Math.hypot(e.x - hq.x, e.y - hq.y) > reach * 1.5) continue;
    ids.push(e.id);
  }
  if (ids.length > 0) {
    applyCommand(state, p.playerId, { type: "cmd.attackmove", ids, x: intruder.x, y: intruder.y });
  }
  sortie(state, p, intruder.x, intruder.y);
}

function microUnits(state: MatchState, p: SimPlayer, hq: Entity): void {
  const sites = enemySites(state, p.playerId);
  const stage = stagingFinder(state, hq);
  for (const e of [...state.entities.values()]) {
    if (e.ownerId !== p.playerId || e.hp <= 0 || e.wreck || e.garrisonedIn || e.kind !== "unit") continue;
    siege(state, p, e, sites);
    switch (e.type) {
      case "warden":
      case "apocalypse":
      case "ss3":
      case "jagdtiger":
        fitShell(state, p, e);
        break;
      case "walker":
        if ((e.gatlingGuns ?? 1) === 1) applyCommand(state, p.playerId, { type: "cmd.guns", ids: [e.id], guns: 2 });
        break;
      case "nebelwerfer":
        settleLauncher(state, p, e);
        break;
      case "engineer":
        engineerWork(state, p, e, hq);
        break;
      case "supply":
        truckWork(state, p, e, hq, stage);
        break;
      case "droneop":
        flyDrone(state, p, e, hq, stage);
        break;
    }
    if (YARD_IDLERS.has(e.type) && !e.order && nearBuilding(state, e)) moveTo(state, p, e, stage());
  }
}

type Staging = () => { x: number; y: number };

/** Walkable ground near the Core with no building inside a lane's width. Found once per pass, on demand. */
function stagingFinder(state: MatchState, hq: Entity): Staging {
  let spot: { x: number; y: number } | undefined;
  return () => {
    if (spot) return spot;
    const ox = hq.tileX + Math.floor(hq.tileW / 2);
    const oy = hq.tileY + Math.floor(hq.tileH / 2);
    const inwardX = Math.sign(state.width / 2 - ox) || 1;
    const inwardY = Math.sign(state.height / 2 - oy) || 1;
    const maxR = Math.max(state.width, state.height);
    for (let r = EASY_BUILD_LANE_TILES; r < maxR && !spot; r += 2) {
      for (let k = 0; k <= r && !spot; k += 2) {
        for (const [dx, dy] of [
          [r, k],
          [k, r],
        ] as const) {
          const tx = ox + dx * inwardX;
          const ty = oy + dy * inwardY;
          if (!walkable(state, tx, ty, "hauler") || !keepsLanes(state, tx, ty, 1, 1)) continue;
          spot = { x: (tx + 0.5) * state.tileSize, y: (ty + 0.5) * state.tileSize };
          break;
        }
      }
    }
    spot ??= { x: hq.x, y: hq.y };
    return spot;
  };
}

/** Parked against a building: a Mauler cannot shove past, so the lane is shut. */
function nearBuilding(state: MatchState, e: Entity): boolean {
  return !keepsLanes(state, Math.floor(e.x / state.tileSize), Math.floor(e.y / state.tileSize), 1, 1);
}

function moveTo(state: MatchState, p: SimPlayer, e: Entity, at: { x: number; y: number }): void {
  applyCommand(state, p.playerId, { type: "cmd.move", ids: [e.id], x: at.x, y: at.y });
}

/** Enemy buildings the side can see. Auto-fire leaves them alone, so the wave needs telling. */
function enemySites(state: MatchState, playerId: string): Entity[] {
  const out: Entity[] = [];
  for (const e of state.entities.values()) {
    if (e.kind !== "building" || e.hp <= 0 || e.wreck || !e.ownerId || allies(state, playerId, e.ownerId)) continue;
    if (canSeeEntity(state, playerId, e)) out.push(e);
  }
  return out;
}

/**
 * A fighter that reached the enemy yard with nothing to shoot goes for the nearest building:
 * soldiers stand the capture, guns shell it. A halt with no target counts as nothing to shoot.
 */
function siege(state: MatchState, p: SimPlayer, e: Entity, sites: Entity[]): void {
  if (sites.length === 0 || !freeFighter(e, p.playerId)) return;
  if (!isInfantryType(e.type) && catalog(e.type).caliber < GARRISON_STRUCTURAL_CALIBER) return;
  const idle = !e.order || e.order.auto || e.order.kind === "attackmove";
  if (!idle || (e.attackTarget != null && state.entities.get(e.attackTarget)?.hp)) return;
  const reach = EASY_SIEGE_TILES * state.tileSize;
  let best: Entity | undefined;
  let bestD = Infinity;
  for (const b of sites) {
    const d = Math.hypot(b.x - e.x, b.y - e.y);
    if (d > reach || d >= bestD) continue;
    best = b;
    bestD = d;
  }
  if (best) applyCommand(state, p.playerId, { type: "cmd.attack", ids: [e.id], targetId: best.id });
}

/** HE for soldiers, soft trucks, and buildings. AP for armor. */
function fitShell(state: MatchState, p: SimPlayer, e: Entity): void {
  const t = e.attackTarget != null ? state.entities.get(e.attackTarget) : undefined;
  if (!t || t.hp <= 0) return;
  const soft = t.kind === "building" || isInfantryType(t.type) || !isArmoredType(t.type);
  const shell = soft ? "he" : "ap";
  if (e.shell === shell || (e.ammo[shell] ?? 0) <= 0) return;
  applyCommand(state, p.playerId, { type: "cmd.ammo", ids: [e.id], shell });
}

/**
 * Attack-move halts the truck in range but keeps its path, and the frame only fires
 * from a standstill. Turn that halt into a plain attack so the salvo goes.
 */
function settleLauncher(state: MatchState, p: SimPlayer, e: Entity): void {
  if (e.order?.kind !== "attackmove" || e.state !== "attack" || e.attackTarget == null) return;
  applyCommand(state, p.playerId, { type: "cmd.attack", ids: [e.id], targetId: e.attackTarget });
}

/** Patch the base and its hulls, then cut wrecks near home into scrap. */
function engineerWork(state: MatchState, p: SimPlayer, e: Entity, hq: Entity): void {
  if (e.order && !e.order.auto) return;
  const reach = EASY_WORK_TILES * state.tileSize;
  let repair: Entity | undefined;
  let wreck: Entity | undefined;
  let repairD = Infinity;
  let wreckD = Infinity;
  for (const o of state.entities.values()) {
    if (o.id === e.id || o.hp <= 0) continue;
    const d = Math.hypot(o.x - e.x, o.y - e.y);
    if (d > reach || Math.hypot(o.x - hq.x, o.y - hq.y) > reach) continue;
    if (o.ownerId === p.playerId && !o.wreck && o.hp < o.hpMax && (o.kind === "building" || isArmoredType(o.type))) {
      if (d < repairD && canRepairTarget(state, p.playerId, o)) {
        repair = o;
        repairD = d;
      }
    } else if (canScrapWreck(o) && d < wreckD) {
      wreck = o;
      wreckD = d;
    }
  }
  const target = repair ?? wreck;
  if (target) applyCommand(state, p.playerId, { type: "cmd.repair", ids: [e.id], targetId: target.id });
}

/** Top up anyone short nearby, refill at the Armory when the bed runs low, else rejoin the army. */
function truckWork(state: MatchState, p: SimPlayer, e: Entity, hq: Entity, stage: Staging): void {
  if (e.order?.kind === "supply" || e.order?.kind === "disable") return;
  if (e.supply < SUPPLY_CARGO / 3) {
    const armory = nearestOwned(state, p.playerId, "armory", e);
    if (armory) applyCommand(state, p.playerId, { type: "cmd.supply", ids: [e.id], targetId: armory.id });
    return;
  }
  const reach = EASY_WORK_TILES * state.tileSize;
  let best: Entity | undefined;
  let bestD = Infinity;
  for (const o of state.entities.values()) {
    if (o.ownerId !== p.playerId || o.id === e.id || !needsSupply(o)) continue;
    const d = Math.hypot(o.x - e.x, o.y - e.y);
    if (d > reach || d >= bestD) continue;
    best = o;
    bestD = d;
  }
  if (best) {
    applyCommand(state, p.playerId, { type: "cmd.supply", ids: [e.id], targetId: best.id });
    return;
  }
  if (!e.order) rejoin(state, p, e, hq, stage);
}

/** Out with the army: fly the drone in strike mode. Idle away from home: rejoin a fighter. */
function flyDrone(state: MatchState, p: SimPlayer, e: Entity, hq: Entity, stage: Staging): void {
  if (!e.order) rejoin(state, p, e, hq, stage);
  const link = e.droneLink;
  if (!link || link.droneId != null || e.order?.kind !== "guard") return;
  if (link.charge < DRONE_LAUNCH_MIN_SECONDS) return;
  if (link.mode !== "strike") applyCommand(state, p.playerId, { type: "cmd.drone", ids: [e.id], action: "mode", mode: "strike" });
  applyCommand(state, p.playerId, { type: "cmd.drone", ids: [e.id], action: "launch" });
}

/** An escort whose fighter fell walks beside the nearest one still out. Near home it waits. */
function rejoin(state: MatchState, p: SimPlayer, e: Entity, hq: Entity, stage: Staging): void {
  const home = BUILD_RADIUS * state.tileSize;
  if (Math.hypot(e.x - hq.x, e.y - hq.y) <= home) return;
  let best: Entity | undefined;
  let bestD = Infinity;
  for (const o of state.entities.values()) {
    if (!freeFighter(o, p.playerId)) continue;
    const d = Math.hypot(o.x - e.x, o.y - e.y);
    if (d < bestD) {
      best = o;
      bestD = d;
    }
  }
  if (best) {
    applyCommand(state, p.playerId, { type: "cmd.guard", ids: [e.id], targetId: best.id });
  } else {
    moveTo(state, p, e, stage());
  }
}

function enemyHq(state: MatchState, playerId: string): Entity | undefined {
  let best: Entity | undefined;
  let bestD = Infinity;
  const me = hqOf(state, playerId);
  for (const o of state.players.values()) {
    if (!o.alive || o.playerId === playerId) continue;
    if (allies(state, playerId, o.playerId)) continue;
    const hq = hqOf(state, o.playerId);
    if (!hq) continue;
    const d = me ? (hq.x - me.x) ** 2 + (hq.y - me.y) ** 2 : 0;
    if (d < bestD) {
      bestD = d;
      best = hq;
    }
  }
  return best;
}

export function findBuildTile(
  state: MatchState,
  playerId: string,
  type: BuildingType,
): { tx: number; ty: number } | null {
  const def = catalog(type);
  const hq = hqOf(state, playerId);
  if (!hq) return null;
  const ox = hq.tileX + Math.floor(hq.tileW / 2);
  const oy = hq.tileY + Math.floor(hq.tileH / 2);
  const inwardX = Math.sign(state.width / 2 - ox) || 1;
  const inwardY = Math.sign(state.height / 2 - oy) || 1;
  const maxR = BUILD_RADIUS + Math.max(def.tileW, def.tileH);
  const halfW = Math.floor(def.tileW / 2);
  const halfH = Math.floor(def.tileH / 2);
  for (let r = 1; r <= maxR; r++) {
    const ring: { tx: number; ty: number; inward: number }[] = [];
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        ring.push({
          tx: ox + dx - halfW,
          ty: oy + dy - halfH,
          inward: dx * inwardX + dy * inwardY,
        });
      }
    }
    ring.sort((a, b) => b.inward - a.inward);
    for (const spot of ring) {
      if (tilesBlockedOrScrap(state, spot.tx, spot.ty, def.tileW, def.tileH)) continue;
      if (!inBuildRadius(state, playerId, spot.tx, spot.ty, def.tileW, def.tileH, BUILD_RADIUS)) continue;
      if (!keepsLanes(state, spot.tx, spot.ty, def.tileW, def.tileH)) continue;
      if (type === "smelter" && !smelterDock(state, { tileX: spot.tx, tileY: spot.ty, tileW: def.tileW, tileH: def.tileH })) {
        continue;
      }
      return { tx: spot.tx, ty: spot.ty };
    }
  }
  return null;
}

/**
 * Leave a Mauler-wide lane around every standing building. Packed edge to edge,
 * a big footprint like the Airfield walls off the Smelter dock and income stops.
 */
function keepsLanes(state: MatchState, tx: number, ty: number, w: number, h: number): boolean {
  for (const b of state.entities.values()) {
    if (b.kind !== "building" || b.hp <= 0 || isFieldStructure(b.type)) continue;
    if (footprintGap(tx, ty, w, h, b.tileX, b.tileY, b.tileW, b.tileH) < EASY_BUILD_LANE_TILES) return false;
  }
  return true;
}

function nearestOwned(state: MatchState, playerId: string, type: string, from: Entity): Entity | undefined {
  let best: Entity | undefined;
  let bestD = Infinity;
  for (const e of state.entities.values()) {
    if (e.ownerId !== playerId || e.type !== type || e.hp <= 0) continue;
    const d = Math.hypot(e.x - from.x, e.y - from.y);
    if (d < bestD) {
      best = e;
      bestD = d;
    }
  }
  return best;
}

function ownsLive(state: MatchState, playerId: string, type: string): boolean {
  for (const e of state.entities.values()) {
    if (e.ownerId === playerId && e.type === type && e.hp > 0) return true;
  }
  return false;
}

/** Jobs waiting on every factory of one kind. */
function queuedOn(state: MatchState, playerId: string, factory: string): number {
  let n = 0;
  for (const e of state.entities.values()) {
    if (e.ownerId !== playerId || e.hp <= 0 || e.type !== factory) continue;
    n += e.queue.length;
  }
  return n;
}

function countType(state: MatchState, playerId: string, type: string): number {
  let n = 0;
  for (const e of state.entities.values()) {
    if (e.ownerId !== playerId || e.hp <= 0) continue;
    if (e.type === type) n++;
    for (const j of e.queue) {
      if (j.type === type) n++;
    }
  }
  return n;
}

function queuedAt(state: MatchState, playerId: string, type: TrainType): number {
  let n = 0;
  for (const e of state.entities.values()) {
    if (e.ownerId !== playerId || e.hp <= 0) continue;
    for (const j of e.queue) {
      if (j.type === type) n++;
    }
  }
  return n;
}
