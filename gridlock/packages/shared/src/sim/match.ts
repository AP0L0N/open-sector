import { START_SCRAP, TICK_DT } from "../catalog.js";
import { getMap } from "../maps.js";
import { humans } from "../lobby.js";
import type { RoomState } from "../protocol.js";
import { initGrids, makeEntity, tileCenter } from "./geo.js";
import { tickBuild } from "./build.js";
import { tickCombat, tickProjectiles } from "./combat.js";
import { tickDeploy } from "./deploy.js";
import { tickHarvest } from "./harvest.js";
import { tickMovement } from "./orders.js";
import { tickTrain } from "./train.js";
import type { MatchState, SimPlayer } from "./types.js";
import { destroyEntity } from "./geo.js";

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
    nextId: 1,
    tileSize: map.tileSize,
    width: map.width,
    height: map.height,
    blocked: grids.blocked,
    scrapYield: grids.scrapYield,
    occupy: grids.occupy,
    players,
    entities: new Map(),
    projectiles: [],
    ended: false,
    initialHumans: humans(room).length,
    pendingComms: [],
  };

  for (const slot of humans(room)) {
    const pid = slot.playerId!;
    const pos = spawns.get(pid);
    if (!pos) continue;
    const x = tileCenter(pos.x, map.tileSize);
    const y = tileCenter(pos.y, map.tileSize);
    const rig = makeEntity(state, "rig", pid, x, y);
    const towardX = map.width / 2 - pos.x;
    const towardY = map.height / 2 - pos.y;
    rig.facing = Math.atan2(towardY, towardX);
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
    });
  }

  return state;
}

export function step(state: MatchState, dt = TICK_DT): void {
  if (state.ended) return;
  state.tick += 1;
  tickDeploy(state, dt);
  tickMovement(state, dt);
  tickHarvest(state, dt);
  tickBuild(state, dt);
  tickTrain(state, dt);
  tickCombat(state, dt);
  tickProjectiles(state, dt);
  reapDead(state);
  checkWin(state);
}

function reapDead(state: MatchState): void {
  const dead: number[] = [];
  for (const e of state.entities.values()) {
    if (e.hp <= 0) dead.push(e.id);
  }
  const hqOwners = new Set<string>();
  for (const id of dead) {
    const e = state.entities.get(id);
    if (!e) continue;
    if (e.type === "core" || e.type === "rig") hqOwners.add(e.ownerId);
    destroyEntity(state, e);
  }
  for (const pid of hqOwners) eliminate(state, pid);
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
