import {
  AUTO_DEPLOY_SECONDS,
  catalog,
  clampGameSpeed,
  GAME_SPEED_DEFAULT,
  isInfantryType,
  leavesWreck,
  NEUTRAL_OWNER,
  secondsToTicks,
  START_SCRAP,
  START_UNITS,
  TICK_DT,
  type EntityType,
} from "../catalog.js";
import { getMap } from "../maps.js";
import { commanders } from "../lobby.js";
import { EASY_ATTACK_FIRST_TICKS, tickAi } from "./ai.js";
import type { ImpactView, RoomState } from "../protocol.js";
import { buildingCenter, destroyEntity, initGrids, makeEntity, tileCenter, walkable } from "./geo.js";
import { tickCapture } from "./capture.js";
import { detachGarrisoned, spillGarrison, tickGarrison } from "./garrison.js";
import { seedRng } from "./rng.js";
import { tickBuild } from "./build.js";
import { restampForts, tickField } from "./field.js";
import { tickCombat, tickProjectiles } from "./combat.js";
import { tickSmoke } from "./smoke.js";
import { tickBipod, tickStance } from "./stance.js";
import { tickCollision } from "./collision.js";
import { tickAutoDeploy, tickDeploy } from "./deploy.js";
import { tickHarvest, tickMaulerCart } from "./harvest.js";
import { tickHeal } from "./heal.js";
import { tickMovement, repathIfBlocked } from "./orders.js";
import { tickTrain } from "./train.js";
import type { Entity, MatchState, SimPlayer } from "./types.js";
import { leaveCorpse } from "./remains.js";
import { toWreck } from "./wreck.js";

function spawnStartingUnits(state: MatchState, ownerId: string, rig: Entity): void {
  const core = catalog("core");
  const halfW = Math.floor(core.tileW / 2);
  const halfH = Math.floor(core.tileH / 2);
  const coreTx = rig.tileX - halfW;
  const coreTy = rig.tileY - halfH;
  const dx = Math.sign(state.width / 2 - rig.tileX) || 1;
  const dy = Math.sign(state.height / 2 - rig.tileY) || 1;
  const used = new Set<string>([`${rig.tileX},${rig.tileY}`]);
  const inFutureCore = (x: number, y: number) =>
    x >= coreTx && x < coreTx + core.tileW && y >= coreTy && y < coreTy + core.tileH;

  const takeTile = (prefX: number, prefY: number, type: EntityType) => {
    const max = Math.max(state.width, state.height);
    for (let r = 0; r < max; r++) {
      for (let oy = -r; oy <= r; oy++) {
        for (let ox = -r; ox <= r; ox++) {
          if (Math.max(Math.abs(ox), Math.abs(oy)) !== r) continue;
          const x = prefX + ox;
          const y = prefY + oy;
          const key = `${x},${y}`;
          if (used.has(key) || inFutureCore(x, y)) continue;
          if (Math.abs(x - rig.tileX) <= halfW && Math.abs(y - rig.tileY) <= halfH) continue;
          if (!walkable(state, x, y, type)) continue;
          used.add(key);
          return { x, y };
        }
      }
    }
    return { x: prefX, y: prefY };
  };

  const ring = halfW + 2;
  const anchorX = rig.tileX + dx * ring;
  const anchorY = rig.tileY + dy * ring;
  for (const type of START_UNITS) {
    const tile = takeTile(anchorX, anchorY, type);
    const u = makeEntity(
      state,
      type,
      ownerId,
      tileCenter(tile.x, state.tileSize),
      tileCenter(tile.y, state.tileSize),
      { facing: rig.facing },
    );
    u.turretFacing = rig.facing;
  }
}

export function createMatch(
  room: RoomState,
  spawns: Map<string, { spawnId: number; x: number; y: number }>,
  opts?: { startingUnits?: boolean },
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
    wreckBlock: new Uint8Array(map.width * map.height),
    fortBlock: new Uint8Array(map.width * map.height),
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
    if (opts?.startingUnits !== false) spawnStartingUnits(state, pid, rig);
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
    makeEntity(state, f.type, NEUTRAL_OWNER, c.x, c.y, {
      tileX: f.x,
      tileY: f.y,
      facing: ((f.facing ?? 0) * Math.PI) / 2,
    });
  }

  return state;
}

export function step(state: MatchState, dt = TICK_DT): void {
  if (state.ended) return;
  state.tick += 1;
  state.impacts = [];
  restampForts(state);
  tickSmoke(state, dt);
  tickStance(state);
  tickBipod(state);
  tickDeploy(state, dt);
  tickGarrison(state);
  tickHeal(state, dt);
  tickMaulerCart(state, dt);
  tickMovement(state, dt);
  tickCollision(state, dt);
  tickField(state, dt);
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
    if (isInfantryType(e.type)) leaveCorpse(state, e);
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
