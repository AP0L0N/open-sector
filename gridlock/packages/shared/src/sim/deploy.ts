import {
  bracesOf,
  catalog,
  deploySecondsOf,
  HAULER_SMOKE_CHARGES,
  hpMaxOf,
  specialOf,
  specialCooldownOf,
} from "../catalog.js";
import {
  buildingCenter,
  clearOrder,
  hqOf,
  occupyEntity,
  tilesBlockedOrScrap,
  unitInWater,
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
  if (bracesOf(e.type)) return beginBrace(state, e);
  return "That cannot deploy.";
}

/** Titan: plant the outriggers, or pull them up. The unit keeps its id and type. */
function beginBrace(state: MatchState, e: Entity): string | null {
  if (e.kind !== "unit" || e.hp <= 0 || e.wreck) return "That cannot deploy.";
  if (e.specialCooldown > 0) return "Special recharging.";
  if (e.state === "deploy" || e.state === "undeploy") return "Already transforming.";
  if (!e.braced && unitInWater(state, e)) return "Cannot brace in water.";
  clearOrder(e);
  e.state = e.braced ? "undeploy" : "deploy";
  e.deployTime = 0;
  armSpecialCooldown(e);
  return null;
}

/** Swap max HP for the new posture. Current HP keeps its share of max, so a pack/brace loop never heals. */
function setBraced(e: Entity, braced: boolean): void {
  const frac = e.hpMax > 0 ? e.hp / e.hpMax : 1;
  e.braced = braced;
  e.hpMax = hpMaxOf(e.type, braced);
  e.hp = Math.max(1, Math.min(e.hpMax, Math.round(e.hpMax * frac)));
  e.state = "idle";
  e.deployTime = 0;
  e.waypoints = [];
}

export function tickDeploy(state: MatchState, dt: number): void {
  for (const e of state.entities.values()) {
    if (e.specialCooldown > 0) e.specialCooldown = Math.max(0, e.specialCooldown - dt);
    if (e.type === "hauler" && e.hp > 0 && !e.wreck && e.smokeCharges <= 0 && e.specialCooldown <= 0) {
      e.smokeCharges = HAULER_SMOKE_CHARGES;
    }
  }
  for (const e of [...state.entities.values()]) {
    if (e.hp <= 0) continue;
    if (e.state !== "deploy" && e.state !== "undeploy") continue;
    e.deployTime += dt;
    if (e.deployTime < deploySecondsOf(e.type)) continue;
    if (e.state === "deploy" && e.type === "rig") finishDeploy(state, e);
    else if (e.state === "undeploy" && e.type === "core") finishUndeploy(state, e);
    else if (bracesOf(e.type)) setBraced(e, e.state === "deploy");
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
    clip: 0,
    reload: 0,
    reloadMul: 1,
    harvestTime: 0,
    cargo: e.cargo,
    cartHp: e.cartHp,
    harvestTile: null,
    autoHarvest: false,
    returnToBase: false,
    deployTime: 0,
    specialCooldown: e.specialCooldown,
    smokeCharges: 0,
    queue: [],
    attackTarget: null,
    wreck: false,
    ammo: {},
    shell: null,
    weapon: null,
    bipod: 0,
    mgAmmo: 0,
    mgHeat: 0,
    mgOverheat: 0,
    mgCooldown: 0,
    garrisonedIn: null,
    garrison: [],
    garrisonHide: false,
    scoutHp: e.scoutHp,
    scoutHpMax: e.scoutHpMax,
    scoutOut: false,
    captureOwnerId: "",
    captureProgress: 0,
    crits: [],
    stance: "stand",
    stanceOrder: "stand",
    holdPosition: false,
    guardFacing: null,
    ruined: false,
    coverBonus: 0,
    wallCover: 0,
    work: 0,
    crew: false,
    supply: 0,
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
  if (bracesOf(e.type)) return beginDeploy(state, e);
  const hq = hqOf(state, playerId);
  if (!hq || hq.id !== e.id) return "Select the Rig or Core.";
  return beginDeploy(state, e);
}


