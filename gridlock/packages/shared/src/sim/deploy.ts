import { catalog, DEPLOY_SECONDS, specialOf, specialCooldownOf } from "../catalog.js";
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

function armSpecialCooldown(e: Entity): void {
  const action = specialOf(e.type);
  if (!action) return;
  e.specialCooldown = Math.max(e.specialCooldown, specialCooldownOf(action));
}

export function beginDeploy(state: MatchState, e: Entity): string | null {
  if (e.type === "rig") {
    if (e.specialCooldown > 0) return "Special recharging.";
    if (e.waypoints.length > 0 || e.order?.kind === "move") return "Stop the Rig first.";
    if (e.state === "deploy" || e.state === "undeploy") return "Already transforming.";
    const core = catalog("core");
    const tx = e.tileX - Math.floor(core.tileW / 2);
    const ty = e.tileY - Math.floor(core.tileH / 2);
    if (tilesBlockedOrScrap(state, tx, ty, core.tileW, core.tileH)) {
      return `Need a clear ${core.tileW}×${core.tileH} to deploy.`;
    }
    e.state = "deploy";
    e.deployTime = 0;
    clearOrder(e);
    e.state = "deploy";
    armSpecialCooldown(e);
    return null;
  }
  if (e.type === "core") {
    if (e.specialCooldown > 0) return "Special recharging.";
    if (e.state === "deploy" || e.state === "undeploy") return "Already transforming.";
    e.state = "undeploy";
    e.deployTime = 0;
    armSpecialCooldown(e);
    return null;
  }
  return "That cannot deploy.";
}

/** Wall-clock: after `autoDeployTicks`, stop every Rig and finish unpacking. */
export function tickAutoDeploy(state: MatchState): void {
  if (state.autoDeployTicks < 0) return;
  state.autoDeployTicks -= 1;
  if (state.autoDeployTicks > 0) return;
  state.autoDeployTicks = -1;
  for (const e of [...state.entities.values()]) {
    if (e.type !== "rig" || e.hp <= 0 || e.wreck) continue;
    clearOrder(e);
    if (e.state !== "deploy") {
      const err = beginDeploy(state, e);
      if (err) continue;
    }
    e.deployTime = DEPLOY_SECONDS;
  }
}

export function tickDeploy(state: MatchState, dt: number): void {
  for (const e of state.entities.values()) {
    if (e.specialCooldown > 0) e.specialCooldown = Math.max(0, e.specialCooldown - dt);
  }
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
  const coreDef = catalog("core");
  const tx = rig.tileX - Math.floor(coreDef.tileW / 2);
  const ty = rig.tileY - Math.floor(coreDef.tileH / 2);
  if (tilesBlockedOrScrap(state, tx, ty, coreDef.tileW, coreDef.tileH)) {
    rig.state = "idle";
    rig.deployTime = 0;
    return;
  }
  const frac = rig.hp / rig.hpMax;
  state.entities.delete(rig.id);
  const c = buildingCenter(tx, ty, coreDef.tileW, coreDef.tileH, state.tileSize);
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
    tileW: coreDef.tileW,
    tileH: coreDef.tileH,
    radius: 0,
    order: null,
    waypoints: [],
    deployTime: 0,
    queue: [],
    attackTarget: null,
    autoHarvest: false,
  };
  state.entities.set(core.id, core);
  armSpecialCooldown(core);
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
  const cx = core.tileX + Math.floor(core.tileW / 2);
  const cy = core.tileY + Math.floor(core.tileH / 2);
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
  armSpecialCooldown(rig);
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
    turretFacing: e.turretFacing,
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
    specialCooldown: e.specialCooldown,
    queue: [],
    attackTarget: null,
    wreck: false,
    ammo: {},
    shell: null,
    garrisonedIn: null,
    garrison: [],
    crits: [],
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
  if (!e || e.ownerId !== playerId || e.wreck) return "Not yours.";
  const hq = hqOf(state, playerId);
  if (!hq || hq.id !== e.id) return "Select the Rig or Core.";
  return beginDeploy(state, e);
}


