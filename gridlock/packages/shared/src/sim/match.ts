import {
  catalog,
  clampGameSpeed,
  GAME_SPEED_DEFAULT,
  garrisonDiesWithHostOf,
  hasCrit,
  isAircraftType,
  isInfantryType,
  isTransportType,
  leavesWreck,
  NEUTRAL_OWNER,
  START_SCRAP,
  TICK_DT,
} from "../catalog.js";
import { getMap, isMapSection } from "../maps.js";
import { commanders } from "../lobby.js";
import { EASY_ATTACK_FIRST_TICKS, tickAi } from "./ai.js";
import type { ImpactView, RoomState } from "../protocol.js";
import { buildingCenter, destroyEntity, initGrids, makeEntity, tileCenter } from "./geo.js";
import { aircraftDown, beginAircraftCrash, isAirborne, tickAir } from "./air.js";
import { ejectParatroopers, loseRiders, syncPlaneRiders, tickChutes, tickCrates, tickMines, tickPlaneBoarding } from "./airdrop.js";
import { tickDrones } from "./drone.js";
import { tickJets } from "./jet.js";
import { tickCapture } from "./capture.js";
import { detachGarrisoned, killGarrison, spillGarrison, tickGarrison, tickGarrisonCare } from "./garrison.js";
import { seedRng } from "./rng.js";
import { tickBuild } from "./build.js";
import { raiseWallCrest, restampForts, tickField } from "./field.js";
import { syncTorpedoes, tickCombat, tickPatrol, tickProjectiles } from "./combat.js";
import { tickSubmarines } from "./naval.js";
import { tickSmoke } from "./smoke.js";
import { maybeCookOff, tickFires } from "./flame.js";
import { tickBipod, tickStance } from "./stance.js";
import { tickCollision } from "./collision.js";
import { tickDeploy } from "./deploy.js";
import { tickSmelters } from "./smelter.js";
import { tickConstructs } from "./construct.js";
import { tickHeal } from "./heal.js";
import { tickSupply } from "./supply.js";
import { syncTowedGuns, tickArtillery } from "./artillery.js";
import { tickMovement, repathIfBlocked } from "./orders.js";
import { tickWalkerCharge } from "./walker-charge.js";
import { tickOrderQueue } from "./commands.js";
import { tickTrain } from "./train.js";
import { tickSpotlights } from "./night.js";
import type { Entity, MatchState, SimPlayer } from "./types.js";
import { leaveCorpse } from "./remains.js";
import { toWreck } from "./wreck.js";

export function createMatch(
  room: RoomState,
  spawns: Map<string, { spawnId: number; x: number; y: number }>,
): MatchState {
  const map = getMap(room.mapId);
  if (!map) throw new Error("map missing");
  const grids = initGrids(map);
  const players = new Map<string, SimPlayer>();
  const state: MatchState = {
    roomId: room.id,
    mapId: room.mapId,
    tick: 0,
    gameSpeed: GAME_SPEED_DEFAULT,
    nextId: 1,
    tileSize: map.tileSize,
    width: map.width,
    height: map.height,
    blocked: grids.blocked,
    terrain: grids.terrain,
    heights: grids.heights,
    scrapYield: grids.scrapYield,
    occupy: grids.occupy,
    wreckBlock: new Uint8Array(map.width * map.height),
    fortBlock: new Uint8Array(map.width * map.height),
    fortOwner: new Map(),
    players,
    entities: new Map(),
    projectiles: [],
    smokeClouds: [],
    fires: [],
    mines: [],
    crates: [],
    impacts: [],
    rngState: seedRng(room.id),
    ended: false,
    initialHumans: commanders(room).length,
    pendingComms: [],
    visionTick: -1,
    visionByPlayer: new Map(),
    visionKeyByPlayer: new Map(),
    smokeMask: new Uint8Array(map.width * map.height),
    smokeMaskTick: -1,
    hullMask: new Int32Array(map.width * map.height),
    seeTick: -1,
    seeByPlayer: new Map(),
    clearedTrees: [],
    bodies: [],
    holes: [],
  };

  for (const slot of commanders(room)) {
    const pid = slot.playerId!;
    const pos = spawns.get(pid);
    if (!pos) continue;
    const x = tileCenter(pos.x, map.tileSize);
    const y = tileCenter(pos.y, map.tileSize);
    const rig = makeEntity(state, "rig", pid, x, y);
    const towardX = map.width / 2 - pos.x;
    const towardY = map.height / 2 - pos.y;
    rig.facing = Math.atan2(towardY, towardX);
    rig.turretFacing = rig.facing;
    players.set(pid, {
      playerId: pid,
      name: slot.name ?? "Commander",
      colorId: slot.colorId,
      team: slot.team,
      alive: true,
      scrap: START_SCRAP,
      scrapCarry: 0,
      structure: null,
      defence: null,
      line: null,
      placingType: null,
      hqId: rig.id,
      ai: slot.ai,
      aiNextAttackTick: slot.ai ? EASY_ATTACK_FIRST_TICKS : 0,
    });
  }

  // Houses and map defences stand neutral. A defence changes hands when someone takes it.
  const sections: Entity[] = [];
  for (const f of map.features ?? []) {
    const facing = ((f.facing ?? 0) * Math.PI) / 2;
    if (isMapSection(f.type)) {
      const s = makeEntity(state, f.type, NEUTRAL_OWNER, tileCenter(f.x, map.tileSize), tileCenter(f.y, map.tileSize), { facing });
      s.turretFacing = facing;
      sections.push(s);
      continue;
    }
    const def = catalog(f.type);
    const c = buildingCenter(f.x, f.y, def.tileW, def.tileH, map.tileSize);
    makeEntity(state, f.type, NEUTRAL_OWNER, c.x, c.y, {
      tileX: f.x,
      tileY: f.y,
      facing,
    });
  }
  if (sections.length > 0) {
    raiseWallCrest(state, sections);
    restampForts(state);
  }

  return state;
}

export function step(state: MatchState, dt = TICK_DT): void {
  if (state.ended) return;
  state.tick += 1;
  state.impacts = [];
  restampForts(state);
  tickSmoke(state, dt);
  tickSpotlights(state, dt);
  tickStance(state);
  tickBipod(state);
  tickDeploy(state, dt);
  tickGarrison(state);
  tickHeal(state, dt);
  tickGarrisonCare(state, dt);
  tickSupply(state, dt);
  tickArtillery(state, dt);
  tickPlaneBoarding(state);
  tickOrderQueue(state);
  tickPatrol(state);
  tickMovement(state, dt);
  // After movement, before collision, so a charging walker detonates on
  // infantry he is overlapping instead of crushing them and walking on.
  tickWalkerCharge(state);
  tickAir(state, dt);
  syncPlaneRiders(state);
  tickChutes(state, dt);
  tickDrones(state, dt);
  tickSubmarines(state, dt);
  tickJets(state, dt);
  tickCollision(state, dt);
  syncTowedGuns(state);
  tickMines(state, dt);
  tickCrates(state, dt);
  tickField(state, dt);
  tickConstructs(state, dt);
  tickSmelters(state, dt);
  tickBuild(state, dt);
  tickTrain(state, dt);
  tickCombat(state, dt);
  tickProjectiles(state, dt);
  syncTorpedoes(state);
  tickFires(state, dt);
  tickCapture(state, dt);
  reapDead(state);
  reapLostHqs(state);
  checkWin(state);
}

/** One wall-clock tick: `gameSpeed` sim steps (max 5×). A paused skirmish stays put. */
export function stepMatch(state: MatchState, dt = TICK_DT): void {
  if (state.paused) return;
  const n = clampGameSpeed(state.gameSpeed);
  const impacts: ImpactView[] = [];
  for (let i = 0; i < n; i++) {
    step(state, dt);
    impacts.push(...state.impacts);
    if (state.ended) break;
  }
  state.impacts = impacts;
  tickAi(state);
}

function reapDead(state: MatchState): void {
  const dead: number[] = [];
  let madeWreck = false;
  // A wrecked engine destroys an aircraft at once. It does not limp on.
  for (const e of state.entities.values()) {
    if (e.hp <= 0 || e.wreck || e.air?.phase === "crash" || e.drone) continue;
    if (isAircraftType(e.type) && hasCrit(e, "engine")) e.hp = 0;
  }
  for (const e of state.entities.values()) {
    if (e.hp > 0) continue;
    if (e.air?.phase === "crash") {
      e.hp = 1;
      continue;
    }
    // The stick bails out before the airframe starts down or becomes a wreck.
    if (!e.wreck && isTransportType(e.type)) ejectParatroopers(state, e);
    if (!e.wreck && e.air && isAircraftType(e.type) && !e.drone && isAirborne(e)) {
      beginAircraftCrash(e);
      continue;
    }
    if (!e.wreck && e.garrison.length && garrisonDiesWithHostOf(e.type)) {
      for (const u of killGarrison(state, e)) dead.push(u.id);
    }
    if (!e.wreck && leavesWreck(e.type) && e.type !== "core" && e.type !== "rig") {
      toWreck(state, e);
      madeWreck = true;
      continue;
    }
    if (e.type === "pyro") maybeCookOff(state, e);
    if (isInfantryType(e.type)) leaveCorpse(state, e);
    if (e.air) {
      loseRiders(state, e);
      aircraftDown(state, e);
    }
    dead.push(e.id);
  }
  if (madeWreck) {
    for (const o of state.entities.values()) {
      if (o.kind === "unit" && !o.wreck && o.hp > 0) repathIfBlocked(state, o);
    }
  }
  const hqOwners = new Set<string>();
  for (const id of dead) {
    const e = state.entities.get(id);
    if (!e) continue;
    if (e.type === "core" || e.type === "rig") hqOwners.add(e.ownerId);
    if (e.garrisonedIn != null) detachGarrisoned(state, e);
    if (e.garrison.length) spillGarrison(state, e);
    destroyEntity(state, e);
  }
  for (const pid of hqOwners) eliminate(state, pid);
}

function reapLostHqs(state: MatchState): void {
  for (const p of [...state.players.values()]) {
    if (!p.alive) continue;
    const hq = state.entities.get(p.hqId);
    if (hq && hq.hp > 0 && hq.ownerId !== p.playerId && (hq.type === "core" || hq.type === "rig")) {
      eliminate(state, p.playerId);
    }
  }
}

function eliminate(state: MatchState, playerId: string): void {
  const p = state.players.get(playerId);
  if (!p || !p.alive) return;
  p.alive = false;
  p.structure = null;
  p.defence = null;
  p.line = null;
  p.placingType = null;
  state.pendingComms.push(`${p.name} Core down.`);
  for (const e of [...state.entities.values()]) {
    if (e.ownerId === playerId) destroyEntity(state, e);
  }
  state.projectiles = state.projectiles.filter((pr) => pr.ownerId !== playerId);
}

function checkWin(state: MatchState): void {
  if (state.ended || state.initialHumans < 2) return;
  const alive = [...state.players.values()].filter((p) => p.alive);
  if (alive.length === 0) {
    state.ended = true;
    return;
  }
  const ffa = alive.every((p) => p.team === 0) || [...state.players.values()].every((p) => p.team === 0);
  if (ffa) {
    if (alive.length === 1) {
      const w = alive[0]!;
      state.winner = { playerId: w.playerId, team: w.team };
      state.ended = true;
    }
    return;
  }
  const teams = new Set(alive.map((p) => p.team));
  if (teams.size === 1) {
    const w = alive[0]!;
    state.winner = { playerId: w.playerId, team: w.team };
    state.ended = true;
  }
}
