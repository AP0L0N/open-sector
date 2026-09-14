import {
  AUTO_DEPLOY_SECONDS,
  catalog,
  clampGameSpeed,
  GAME_SPEED_DEFAULT,
  leavesWreck,
  NEUTRAL_OWNER,
  secondsToTicks,
  START_SCRAP,
  TICK_DT,
} from "../catalog.js";
import { getMap } from "../maps.js";
import { commanders } from "../lobby.js";
import { EASY_ATTACK_FIRST_TICKS, tickAi } from "./ai.js";
import type { ImpactView, RoomState } from "../protocol.js";
import { buildingCenter, destroyEntity, initGrids, makeEntity, tileCenter } from "./geo.js";
import { tickCapture } from "./capture.js";
import { detachGarrisoned, spillGarrison, tickGarrison } from "./garrison.js";
import { seedRng } from "./rng.js";
import { tickBuild } from "./build.js";
import { tickCombat, tickProjectiles } from "./combat.js";
import { tickSmoke } from "./smoke.js";
import { tickStance } from "./stance.js";
import { tickCollision } from "./collision.js";
import { tickAutoDeploy, tickDeploy } from "./deploy.js";
import { tickHarvest } from "./harvest.js";
import { tickMovement, repathIfBlocked } from "./orders.js";
import { tickTrain } from "./train.js";
import type { MatchState, SimPlayer } from "./types.js";
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
    autoDeployTicks: secondsToTicks(AUTO_DEPLOY_SECONDS),
    nextId: 1,
    tileSize: map.tileSize,
    width: map.width,
    height: map.height,
    blocked: grids.blocked,
    terrain: grids.terrain,
    heights: grids.heights,
    scrapYield: grids.scrapYield,
    occupy: grids.occupy,
    players,
    entities: new Map(),
    projectiles: [],
    smokeClouds: [],
    impacts: [],
    rngState: seedRng(room.id),
    ended: false,
    initialHumans: commanders(room).length,
    pendingComms: [],
    visionTick: -1,
    visionByPlayer: new Map(),
    clearedTrees: [],
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
      structure: null,
      placingType: null,
      hqId: rig.id,
      ai: slot.ai,
      aiNextAttackTick: slot.ai ? EASY_ATTACK_FIRST_TICKS : 0,
    });
  }

  for (const f of map.features ?? []) {
    const def = catalog(f.type);
    const c = buildingCenter(f.x, f.y, def.tileW, def.tileH, map.tileSize);
    makeEntity(state, f.type, NEUTRAL_OWNER, c.x, c.y, { tileX: f.x, tileY: f.y });
  }

  return state;
}

export function step(state: MatchState, dt = TICK_DT): void {
  if (state.ended) return;
  state.tick += 1;
  state.impacts = [];
  tickSmoke(state, dt);
  tickStance(state);
  tickDeploy(state, dt);
  tickGarrison(state);
  tickMovement(state, dt);
  tickCollision(state);
  tickHarvest(state, dt);
  tickBuild(state, dt);
  tickTrain(state, dt);
  tickCombat(state, dt);
  tickProjectiles(state, dt);
  tickCapture(state, dt);
  reapDead(state);
  reapLostHqs(state);
  checkWin(state);
}

/** One wall-clock tick: `gameSpeed` sim steps (max 5×). */
export function stepMatch(state: MatchState, dt = TICK_DT): void {
  tickAutoDeploy(state);
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
  for (const e of state.entities.values()) {
    if (e.hp > 0) continue;
    if (!e.wreck && leavesWreck(e.type) && e.type !== "core" && e.type !== "rig") {
      toWreck(state, e);
      madeWreck = true;
      continue;
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
