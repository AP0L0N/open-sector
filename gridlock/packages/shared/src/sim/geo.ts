import { catalog, isInfantryType, isMotorVehicle, SCRAP_TILE_YIELD, type EntityType } from "../catalog.js";
import { TILE_BLOCKED, TILE_EMPTY, TILE_SCRAP, TILE_TREE, TILE_WATER, type MapDef } from "../maps.js";
import type { Entity, MatchState } from "./types.js";

export function tileIndex(state: MatchState, x: number, y: number): number {
  return y * state.width + x;
}

export function inBounds(state: MatchState, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < state.width && y < state.height;
}

export function worldToTile(v: number, tileSize: number): number {
  return Math.floor(v / tileSize);
}

export function tileCenter(t: number, tileSize: number): number {
  return t * tileSize + tileSize / 2;
}

export function chebyshev(ax: number, ay: number, bx: number, by: number): number {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

export function isWall(state: MatchState, x: number, y: number): boolean {
  if (!inBounds(state, x, y)) return true;
  return state.terrain[tileIndex(state, x, y)] === TILE_BLOCKED;
}

export function isWater(state: MatchState, x: number, y: number): boolean {
  if (!inBounds(state, x, y)) return false;
  return state.terrain[tileIndex(state, x, y)] === TILE_WATER;
}

export function isTree(state: MatchState, x: number, y: number): boolean {
  if (!inBounds(state, x, y)) return false;
  return state.terrain[tileIndex(state, x, y)] === TILE_TREE;
}

/** Isolated tree: no 8-neighbor trees. Vehicles may crush these. */
export function isSingleTree(state: MatchState, x: number, y: number): boolean {
  if (!isTree(state, x, y)) return false;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      if (isTree(state, x + dx, y + dy)) return false;
    }
  }
  return true;
}

export function crushTreeAt(state: MatchState, x: number, y: number): boolean {
  if (!isSingleTree(state, x, y)) return false;
  const i = tileIndex(state, x, y);
  state.terrain[i] = TILE_EMPTY;
  state.clearedTrees.push({ x, y });
  state.visionTick = -1;
  return true;
}

export function hardCoverAt(
  terrain: ArrayLike<number>,
  occupy: ArrayLike<number>,
  width: number,
  height: number,
  x: number,
  y: number,
  ignoreOccupyId = 0,
): boolean {
  if (x < 0 || y < 0 || x >= width || y >= height) return true;
  const i = y * width + x;
  if (terrain[i] === TILE_BLOCKED) return true;
  const occ = occupy[i] ?? 0;
  return occ !== 0 && occ !== ignoreOccupyId;
}

export function scrapAt(state: MatchState, x: number, y: number): number {
  if (!inBounds(state, x, y)) return 0;
  return state.scrapYield[tileIndex(state, x, y)] ?? 0;
}

export function occupant(state: MatchState, x: number, y: number): number {
  if (!inBounds(state, x, y)) return 0;
  return state.occupy[tileIndex(state, x, y)] ?? 0;
}

export function walkable(state: MatchState, x: number, y: number, type?: EntityType): boolean {
  if (!inBounds(state, x, y)) return false;
  if ((state.occupy[tileIndex(state, x, y)] ?? 0) !== 0) return false;
  if (isWater(state, x, y)) return !!type && isInfantryType(type);
  if (state.blocked[tileIndex(state, x, y)] === 1) return false;
  if (isTree(state, x, y)) {
    if (!type) return false;
    if (isInfantryType(type)) return true;
    if (isMotorVehicle(type) && isSingleTree(state, x, y)) return true;
    return false;
  }
  return true;
}

/** Infantry currently standing in a water tile. Vehicles never count. */
export function unitInWater(
  state: MatchState,
  e: { type: EntityType; x: number; y: number; garrisonedIn?: number | null },
): boolean {
  if (!isInfantryType(e.type) || e.garrisonedIn) return false;
  return isWater(state, worldToTile(e.x, state.tileSize), worldToTile(e.y, state.tileSize));
}

export function footprint(
  tx: number,
  ty: number,
  w: number,
  h: number,
): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let y = ty; y < ty + h; y++) {
    for (let x = tx; x < tx + w; x++) {
      out.push({ x, y });
    }
  }
  return out;
}

export function buildingCenter(
  tx: number,
  ty: number,
  w: number,
  h: number,
  tileSize: number,
): { x: number; y: number } {
  return {
    x: (tx + w / 2) * tileSize,
    y: (ty + h / 2) * tileSize,
  };
}

export function initGrids(map: MapDef): {
  blocked: Uint8Array;
  terrain: Uint8Array;
  scrapYield: Uint16Array;
  occupy: Int32Array;
  heights: Uint8Array;
} {
  const n = map.width * map.height;
  const blocked = new Uint8Array(n);
  const terrain = new Uint8Array(n);
  const scrapYield = new Uint16Array(n);
  const occupy = new Int32Array(n);
  const heights = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const t = map.tiles[i] ?? 0;
    terrain[i] = t;
    if (t === TILE_BLOCKED || t === TILE_WATER) blocked[i] = 1;
    if (t === TILE_SCRAP) scrapYield[i] = SCRAP_TILE_YIELD;
    heights[i] = map.heights[i] ?? 0;
  }
  return { blocked, terrain, scrapYield, occupy, heights };
}

export function occupyEntity(state: MatchState, e: Entity): void {
  if (e.kind !== "building" && !e.wreck) return;
  for (const t of footprint(e.tileX, e.tileY, e.tileW, e.tileH)) {
    if (!inBounds(state, t.x, t.y)) continue;
    const i = tileIndex(state, t.x, t.y);
    const cur = state.occupy[i] ?? 0;
    if (cur !== 0 && cur !== e.id) continue;
    state.occupy[i] = e.id;
  }
}

export function vacateEntity(state: MatchState, e: Entity): void {
  if (e.kind !== "building" && !e.wreck) return;
  for (const t of footprint(e.tileX, e.tileY, e.tileW, e.tileH)) {
    if (!inBounds(state, t.x, t.y)) continue;
    const i = tileIndex(state, t.x, t.y);
    if (state.occupy[i] === e.id) state.occupy[i] = 0;
  }
}

export function destroyEntity(state: MatchState, e: Entity): void {
  vacateEntity(state, e);
  state.entities.delete(e.id);
}

export function tilesBlockedOrScrap(state: MatchState, tx: number, ty: number, w: number, h: number): boolean {
  for (const t of footprint(tx, ty, w, h)) {
    if (!inBounds(state, t.x, t.y)) return true;
    if (state.blocked[tileIndex(state, t.x, t.y)] === 1) return true;
    if (isTree(state, t.x, t.y)) return true;
    if (scrapAt(state, t.x, t.y) > 0) return true;
    if (occupant(state, t.x, t.y) !== 0) return true;
  }
  return false;
}

export function inBuildRadius(state: MatchState, ownerId: string, tx: number, ty: number, w: number, h: number, radius: number): boolean {
  const neu = footprint(tx, ty, w, h);
  for (const e of state.entities.values()) {
    if (e.kind !== "building" || e.ownerId !== ownerId || e.hp <= 0) continue;
    for (const b of footprint(e.tileX, e.tileY, e.tileW, e.tileH)) {
      for (const n of neu) {
        if (chebyshev(n.x, n.y, b.x, b.y) <= radius) return true;
      }
    }
  }
  return false;
}

export function buildingBounds(
  e: Pick<Entity, "tileX" | "tileY" | "tileW" | "tileH">,
  tileSize: number,
): { x0: number; y0: number; x1: number; y1: number } {
  const x0 = e.tileX * tileSize;
  const y0 = e.tileY * tileSize;
  return { x0, y0, x1: x0 + e.tileW * tileSize, y1: y0 + e.tileH * tileSize };
}

export function buildingContains(e: Entity, tileSize: number, wx: number, wy: number): boolean {
  const b = buildingBounds(e, tileSize);
  return wx >= b.x0 && wx < b.x1 && wy >= b.y0 && wy < b.y1;
}

/** Chebyshev ≤ 1 to any footprint tile, including standing on the pad. */
export function adjacentToBuilding(state: MatchState, unit: Entity, building: Entity): boolean {
  const tx = worldToTile(unit.x, state.tileSize);
  const ty = worldToTile(unit.y, state.tileSize);
  for (const t of footprint(building.tileX, building.tileY, building.tileW, building.tileH)) {
    if (chebyshev(tx, ty, t.x, t.y) <= 1) return true;
  }
  return false;
}

export function unitContains(e: Entity, wx: number, wy: number, pad = 4): boolean {
  const r = e.radius + pad;
  const dx = wx - e.x;
  const dy = wy - e.y;
  return dx * dx + dy * dy <= r * r;
}

export function allies(state: MatchState, aOwner: string, bOwner: string): boolean {
  if (aOwner === bOwner) return true;
  const a = state.players.get(aOwner);
  const b = state.players.get(bOwner);
  if (!a || !b) return false;
  if (a.team === 0 || b.team === 0) return false;
  return a.team === b.team;
}

export function playerTeam(state: MatchState, playerId: string): number {
  return state.players.get(playerId)?.team ?? 0;
}

export function nearestWalkable(
  state: MatchState,
  gx: number,
  gy: number,
  type?: EntityType,
): { x: number; y: number } | null {
  if (walkable(state, gx, gy, type)) return { x: gx, y: gy };
  const max = Math.max(state.width, state.height);
  for (let r = 1; r < max; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = gx + dx;
        const y = gy + dy;
        if (walkable(state, x, y, type)) return { x, y };
      }
    }
  }
  return null;
}

export function rallyPoint(state: MatchState, building: Entity): { x: number; y: number } {
  const cx = state.width / 2;
  const cy = state.height / 2;
  const bx = building.tileX + building.tileW / 2;
  const by = building.tileY + building.tileH / 2;
  const dx = Math.sign(cx - bx) || 1;
  const dy = Math.sign(cy - by) || 1;
  const tx = Math.round(bx + dx * (building.tileW / 2 + 1));
  const ty = Math.round(by + dy * (building.tileH / 2 + 1));
  const snap = nearestWalkable(state, tx, ty) ?? { x: tx, y: ty };
  return {
    x: tileCenter(snap.x, state.tileSize),
    y: tileCenter(snap.y, state.tileSize),
  };
}

export function makeEntity(
  state: MatchState,
  type: EntityType,
  ownerId: string,
  x: number,
  y: number,
  opts?: { tileX?: number; tileY?: number },
): Entity {
  const def = catalog(type);
  const tileX = opts?.tileX ?? worldToTile(x, state.tileSize);
  const tileY = opts?.tileY ?? worldToTile(y, state.tileSize);
  const id = state.nextId++;
  const e: Entity = {
    id,
    kind: def.kind,
    type,
    ownerId,
    x,
    y,
    facing: 0,
    turretFacing: 0,
    hp: def.hp,
    hpMax: def.hp,
    state: "idle",
    tileX,
    tileY,
    tileW: def.tileW,
    tileH: def.tileH,
    radius: def.radius,
    order: null,
    waypoints: [],
    cooldown: 0,
    harvestTime: 0,
    cargo: 0,
    harvestTile: null,
    autoHarvest: type === "hauler",
    deployTime: 0,
    specialCooldown: 0,
    queue: [],
    attackTarget: null,
    wreck: false,
    ammo: def.ammo ? { ...def.ammo } : {},
    shell: def.defaultShell ?? null,
    mgAmmo: def.mgAmmo ?? 0,
    mgHeat: 0,
    mgOverheat: 0,
    mgCooldown: 0,
    garrisonedIn: null,
    garrison: [],
    garrisonHide: false,
    captureOwnerId: "",
    captureProgress: 0,
    crits: [],
    stance: "stand",
    stanceOrder: "stand",
    holdPosition: false,
    guardFacing: null,
  };
  state.entities.set(id, e);
  occupyEntity(state, e);
  return e;
}

export function clearOrder(e: Entity): void {
  e.order = null;
  e.waypoints = [];
  e.attackTarget = null;
  e.harvestTile = null;
  e.guardFacing = null;
  if (e.wreck) {
    e.state = "wreck";
    return;
  }
  if (e.garrisonedIn) {
    e.state = "garrison";
    return;
  }
  if (
    e.state === "move" ||
    e.state === "attack" ||
    e.state === "harvest" ||
    e.state === "unload"
  ) {
    e.state = "idle";
  }
}

export function ownedUnits(state: MatchState, playerId: string): number {
  let n = 0;
  for (const e of state.entities.values()) {
    if (e.kind === "unit" && e.ownerId === playerId && e.hp > 0 && !e.wreck) n++;
  }
  return n;
}

export function hasCore(state: MatchState, playerId: string): boolean {
  for (const e of state.entities.values()) {
    if (e.ownerId === playerId && e.type === "core" && e.hp > 0) return true;
  }
  return false;
}

export function hqOf(state: MatchState, playerId: string): Entity | undefined {
  const p = state.players.get(playerId);
  if (!p) return undefined;
  const e = state.entities.get(p.hqId);
  if (e && e.hp > 0 && (e.type === "rig" || e.type === "core")) return e;
  for (const ent of state.entities.values()) {
    if (ent.ownerId === playerId && (ent.type === "rig" || ent.type === "core") && ent.hp > 0) return ent;
  }
  return undefined;
}
