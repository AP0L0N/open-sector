import { catalog, DEPLOY_SECONDS } from "../catalog.js";
import {
  buildingCenter,
  clearOrder,
  hqOf,
  occupyEntity,
  tilesBlockedOrScrap,
  vacateEntity,
} from "./geo.js";
import { repathIfBlocked } from "./orders.js";
import type { Entity, MatchState } from "./types.js";

export function canDeployAt(state: MatchState, tileX: number, tileY: number): boolean {
  const def = catalog("core");
  const tx = tileX - Math.floor(def.tileW / 2);
  const ty = tileY - Math.floor(def.tileH / 2);
  if (tilesBlockedOrScrap(state, tx, ty, def.tileW, def.tileH)) return false;
  return true;
}

export function beginDeploy(state: MatchState, e: Entity): string | null {
  if (e.type === "rig") {
    if (e.waypoints.length > 0 || e.order?.kind === "move") return "Stop the Rig first.";
    if (e.state === "deploy" || e.state === "undeploy") return "Already transforming.";
    const tx = e.tileX - 1;
    const ty = e.tileY - 1;
    if (tilesBlockedOrScrap(state, tx, ty, 3, 3)) return "Need a clear 3×3 to deploy.";
    e.state = "deploy";
    e.deployTime = 0;
    clearOrder(e);
    e.state = "deploy";
    return null;
  }
  if (e.type === "core") {
    if (e.state === "deploy" || e.state === "undeploy") return "Already transforming.";
    e.state = "undeploy";
    e.deployTime = 0;
    return null;
  }
  return "That cannot deploy.";
}

export function tickDeploy(state: MatchState, dt: number): void {
  for (const e of [...state.entities.values()]) {
    if (e.hp <= 0) continue;
    if (e.state !== "deploy" && e.state !== "undeploy") continue;
    e.deployTime += dt;
    if (e.deployTime < DEPLOY_SECONDS) continue;
    if (e.state === "deploy" && e.type === "rig") finishDeploy(state, e);
    else if (e.state === "undeploy" && e.type === "core") finishUndeploy(state, e);
  }
}

function finishDeploy(state: MatchState, rig: Entity): void {
  const player = state.players.get(rig.ownerId);
  const tx = rig.tileX - 1;
  const ty = rig.tileY - 1;
  if (tilesBlockedOrScrap(state, tx, ty, 3, 3)) {
    rig.state = "idle";
    rig.deployTime = 0;
    return;
  }
  const frac = rig.hp / rig.hpMax;
  state.entities.delete(rig.id);
  const coreDef = catalog("core");
  const c = buildingCenter(tx, ty, 3, 3, state.tileSize);
  const core: Entity = {
    ...structuredCloneBase(rig),
    id: rig.id,
    kind: "building",
    type: "core",
    x: c.x,
    y: c.y,
    facing: 0,
    hp: Math.max(1, Math.round(coreDef.hp * frac)),
    hpMax: coreDef.hp,
    state: "idle",
    tileX: tx,
    tileY: ty,
    tileW: 3,
    tileH: 3,
    radius: 0,
    order: null,
    waypoints: [],
    deployTime: 0,
    queue: [],
    attackTarget: null,
    autoHarvest: false,
  };
  state.entities.set(core.id, core);
  occupyEntity(state, core);
  ejectUnits(state, core);
  if (player) player.hqId = core.id;
  for (const u of state.entities.values()) {
    if (u.kind === "unit") repathIfBlocked(state, u);
  }
}

function finishUndeploy(state: MatchState, core: Entity): void {
  const player = state.players.get(core.ownerId);
  const frac = core.hp / core.hpMax;
  vacateEntity(state, core);
  const rigDef = catalog("rig");
  const cx = core.tileX + 1;
  const cy = core.tileY + 1;
  const ts = state.tileSize;
  const rig: Entity = {
    ...structuredCloneBase(core),
    id: core.id,
    kind: "unit",
    type: "rig",
    x: cx * ts + ts / 2,
    y: cy * ts + ts / 2,
    hp: Math.max(1, Math.round(rigDef.hp * frac)),
    hpMax: rigDef.hp,
    state: "idle",
    tileX: cx,
    tileY: cy,
    tileW: 1,
    tileH: 1,
    radius: rigDef.radius,
    order: null,
    waypoints: [],
    deployTime: 0,
    queue: [],
    attackTarget: null,
    autoHarvest: false,
  };
  state.entities.set(rig.id, rig);
  if (player) player.hqId = rig.id;
}

function structuredCloneBase(e: Entity): Entity {
  return {
    id: e.id,
    kind: e.kind,
    type: e.type,
    ownerId: e.ownerId,
    x: e.x,
    y: e.y,
    facing: e.facing,
    hp: e.hp,
    hpMax: e.hpMax,
    state: e.state,
    tileX: e.tileX,
    tileY: e.tileY,
    tileW: e.tileW,
    tileH: e.tileH,
    radius: e.radius,
    order: null,
    waypoints: [],
    cooldown: 0,
    harvestTime: 0,
    cargo: e.cargo,
    harvestTile: null,
    autoHarvest: false,
    deployTime: 0,
    queue: [],
    attackTarget: null,
  };
}

export function ejectUnits(state: MatchState, building: Entity): void {
  const ts = state.tileSize;
  const x0 = building.tileX * ts;
  const y0 = building.tileY * ts;
  const x1 = (building.tileX + building.tileW) * ts;
  const y1 = (building.tileY + building.tileH) * ts;
  for (const u of state.entities.values()) {
    if (u.kind !== "unit" || u.hp <= 0) continue;
    if (u.x >= x0 && u.x < x1 && u.y >= y0 && u.y < y1) {
      u.x = x1 + u.radius + 4;
      u.y = (y0 + y1) / 2;
      const maxX = state.width * ts - 4;
      const maxY = state.height * ts - 4;
      u.x = Math.min(maxX, Math.max(4, u.x));
      u.y = Math.min(maxY, Math.max(4, u.y));
    }
  }
}

export function deployId(state: MatchState, playerId: string, id: number): string | null {
  const e = state.entities.get(id);
  if (!e || e.ownerId !== playerId) return "Not yours.";
  const hq = hqOf(state, playerId);
  if (!hq || hq.id !== e.id) return "Select the Rig or Core.";
  return beginDeploy(state, e);
}


