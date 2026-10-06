import {
  ARTILLERY_CREW,
  ASW_TORPEDOES,
  hasSonar,
  WATER_MINES,
  ARTILLERY_CREW_HP,
  LINE_BUILD_RADIUS,
  AIR_FUEL_SECONDS,
  DRONE_BATTERY_SECONDS,
  FORCE_FIELD_HP,
  hasForceField,
  JET_FUEL_SECONDS,
  airLoadoutOf,
  anchorsBuildRange,
  beltOf,
  catalog,
  haulerSmokeChargesOf,
  maulerCartHpOf,
  infantryGunFor,
  primaryInfantryGun,
  isArmoredType,
  isBridge,
  isFieldStructure,
  isInfantryType,
  isNavalType,
  isSupplyCarrier,
  isTorpedoBody,
  isTransportType,
  wadesOf,
  rocketAmmoOf,
  rocketsOf,
  isMotorVehicle,
  MAX_BOAT_RADIUS,
  MAX_UNIT_RADIUS,
  rollReloadMul,
  scoutHpMaxOf,
  SUPPLY_CARGO,
  SCRAP_TILE_YIELD,
  DIAMOND_SCRAP_TILE_YIELD,
  UNIT_SPACE_PAD,
  type EntityType,
} from "../catalog.js";
import { buildingRect, buildingTilesOf, isTurnedBuilding, rectContains, segmentRectT } from "../building-rect.js";
import {
  TILE_BLOCKED,
  TILE_DIAMOND_SCRAP,
  TILE_EMPTY,
  TILE_FENCE,
  TILE_ROCK,
  TILE_SCRAP,
  TILE_TREE,
  TILE_WATER,
  type MapDef,
} from "../maps.js";
import { nextRand } from "./rng.js";
import { newShipState } from "./battleship.js";
import type { AirState, AswDeck, DroneLink, Entity, JetState, MatchState } from "./types.js";

/** Fresh flight state: fuelled, armed, parked on `pad` of Airfield `homeId`. */
export function newAirState(homeId: number | null, pad: number, type: EntityType = "stuka"): AirState {
  const load = airLoadoutOf(type);
  return {
    phase: "parked",
    alt: 0,
    speed: 0,
    fuel: AIR_FUEL_SECONDS,
    bombs: load.bombs,
    rounds: load.rounds,
    homeId,
    pad,
    rearm: 0,
    roll: 0,
    extend: false,
    taxi: false,
    touched: false,
    // A transport comes off the line with a mine canister in the bay.
    ...(isTransportType(type) ? { payload: "mines" as const } : {}),
  };
}

/** Jump Jet's pack: full, on the ground. */
export function newJetState(): JetState {
  return { alt: 0, up: false, fuel: JET_FUEL_SECONDS, refuel: 0 };
}

/** A Jump Jet off the ground or lifting off. He flies over men, walls, and water. */
export function jetAloft(e: { jet?: JetState }): boolean {
  return !!e.jet && (e.jet.up || e.jet.alt > 0);
}

/** Drone Op's link: one charged drone in hand, Surveillance by default. */
export function newDroneLink(): DroneLink {
  return { droneId: null, mode: "surveil", charge: DRONE_BATTERY_SECONDS, rebuild: 0 };
}

/** A Destroyer's deck as it leaves the slip: the helicopter loaded, the mine rail full. */
export function newAswDeck(): AswDeck {
  return { heliId: null, torpedoes: ASW_TORPEDOES, rearm: 0, replace: 0, mines: WATER_MINES, mineGap: 0, mineRearm: 0 };
}

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

/** Open water. Water under an intact bridge deck is dry ground (`bridgeDeck`). */
export function isWater(state: MatchState, x: number, y: number): boolean {
  if (!inBounds(state, x, y)) return false;
  const i = tileIndex(state, x, y);
  return state.terrain[i] === TILE_WATER && state.bridgeDeck?.[i] !== 1;
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

/**
 * Fell every tree whose tile center lies in the disk. Used when a crater
 * opens: a trunk standing in the scar comes down, grove or not.
 */
export function fellTreesInDisk(state: MatchState, x: number, y: number, radius: number): number {
  const ts = state.tileSize;
  const reach = Math.max(0, radius);
  const x0 = worldToTile(x - reach, ts);
  const y0 = worldToTile(y - reach, ts);
  const x1 = worldToTile(x + reach, ts);
  const y1 = worldToTile(y + reach, ts);
  let n = 0;
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const cx = tileCenter(tx, ts);
      const cy = tileCenter(ty, ts);
      if (Math.hypot(cx - x, cy - y) > reach) continue;
      if (fellTreeAt(state, tx, ty)) n++;
    }
  }
  return n;
}

/** Remove any tree tile (lone or grove). Shells use this; vehicles still crush loners only. */
export function fellTreeAt(state: MatchState, x: number, y: number): boolean {
  if (!isTree(state, x, y)) return false;
  const i = tileIndex(state, x, y);
  state.terrain[i] = TILE_EMPTY;
  state.clearedTrees.push({ x, y });
  state.visionTick = -1;
  return true;
}

/**
 * A flamethrower force-attack sets this trunk alight. Same clear as a shell,
 * marked so the client burns the tree instead of tossing leaves.
 */
export function burnTreeAt(state: MatchState, x: number, y: number): boolean {
  if (!isTree(state, x, y)) return false;
  const i = tileIndex(state, x, y);
  state.terrain[i] = TILE_EMPTY;
  state.clearedTrees.push({ x, y, burn: true });
  state.visionTick = -1;
  return true;
}

export function crushTreeAt(state: MatchState, x: number, y: number): boolean {
  if (!isSingleTree(state, x, y)) return false;
  return fellTreeAt(state, x, y);
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
  const i = tileIndex(state, x, y);
  if ((state.occupy[i] ?? 0) !== 0) return false;
  if ((state.wreckBlock[i] ?? 0) !== 0) return false;
  const fort = state.fortBlock[i] ?? 0;
  if (fort === 1) return false;
  if (fort === 2 && !(type && isInfantryType(type))) return false;
  // 3 is an unlocked gate: everyone plans through it; the boom stops the wrong side in collision.
  // A boat floats on open water and never comes ashore.
  if (type && isNavalType(type)) return isWater(state, x, y);
  if (isWater(state, x, y)) return !!type && (isInfantryType(type) || wadesOf(type));
  if (state.blocked[i] === 1) return false;
  if (isTree(state, x, y)) {
    if (!type) return false;
    if (isInfantryType(type)) return true;
    if (isMotorVehicle(type) && isSingleTree(state, x, y)) return true;
    return false;
  }
  return true;
}

/** Infantry or a wading walker standing in a water tile. Other vehicles never count. */
export function unitInWater(
  state: MatchState,
  e: { type: EntityType; x: number; y: number; garrisonedIn?: number | null; jet?: JetState },
): boolean {
  if ((!isInfantryType(e.type) && !wadesOf(e.type)) || e.garrisonedIn) return false;
  // A Jump Jet over a river is flying, not swimming.
  if (e.jet && e.jet.alt > 0) return false;
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
    if (t === TILE_BLOCKED || t === TILE_WATER || t === TILE_FENCE || t === TILE_ROCK) blocked[i] = 1;
    if (t === TILE_SCRAP) scrapYield[i] = SCRAP_TILE_YIELD;
    else if (t === TILE_DIAMOND_SCRAP) scrapYield[i] = DIAMOND_SCRAP_TILE_YIELD;
    heights[i] = map.heights[i] ?? 0;
  }
  return { blocked, terrain, scrapYield, occupy, heights };
}

/** Live or wrecked armored hulls. LOS only — does not block walking. */
export type HullSource = {
  id: number;
  kind: string;
  type: EntityType;
  x: number;
  y: number;
};

export function stampArmoredHull(
  hull: Int32Array,
  width: number,
  height: number,
  tileSize: number,
  e: HullSource,
): void {
  if (e.kind !== "unit" || !isArmoredType(e.type)) return;
  const r = catalog(e.type).radius;
  if (r <= 0) return;
  const r2 = r * r;
  const x0 = Math.max(0, worldToTile(e.x - r, tileSize));
  const x1 = Math.min(width - 1, worldToTile(e.x + r, tileSize));
  const y0 = Math.max(0, worldToTile(e.y - r, tileSize));
  const y1 = Math.min(height - 1, worldToTile(e.y + r, tileSize));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = e.x - tileCenter(x, tileSize);
      const dy = e.y - tileCenter(y, tileSize);
      if (dx * dx + dy * dy > r2) continue;
      const i = y * width + x;
      if ((hull[i] ?? 0) === 0) hull[i] = e.id;
    }
  }
}

export function fillHullCover(
  entities: Iterable<HullSource>,
  tileSize: number,
  width: number,
  height: number,
  out: Int32Array,
): void {
  out.fill(0);
  for (const e of entities) stampArmoredHull(out, width, height, tileSize, e);
}

/** A sunken hulk keeps the largest boat clear as well as anything that swims or wades. */
function wreckPathRadius(e: Pick<Entity, "radius" | "type">): number {
  const reach = isNavalType(e.type) ? Math.max(MAX_UNIT_RADIUS, MAX_BOAT_RADIUS) : MAX_UNIT_RADIUS;
  return e.radius + reach + UNIT_SPACE_PAD;
}

function restampWreckBlock(state: MatchState): void {
  const n = state.width * state.height;
  if (state.wreckBlock.length !== n) state.wreckBlock = new Uint8Array(n);
  else state.wreckBlock.fill(0);
  const ts = state.tileSize;
  for (const e of state.entities.values()) {
    if (!e.wreck || e.hp <= 0) continue;
    const r = wreckPathRadius(e);
    const r2 = r * r;
    const x0 = Math.max(0, worldToTile(e.x - r, ts));
    const x1 = Math.min(state.width - 1, worldToTile(e.x + r, ts));
    const y0 = Math.max(0, worldToTile(e.y - r, ts));
    const y1 = Math.min(state.height - 1, worldToTile(e.y + r, ts));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = e.x - tileCenter(x, ts);
        const dy = e.y - tileCenter(y, ts);
        if (dx * dx + dy * dy >= r2) continue;
        state.wreckBlock[tileIndex(state, x, y)] = 1;
      }
    }
  }
}

export function occupyEntity(state: MatchState, e: Entity): void {
  if (isFieldStructure(e.type) || isBridge(e.type)) return;
  if (e.kind !== "building" && !e.wreck) return;
  for (const t of buildingTilesOf(e, state.tileSize)) {
    if (!inBounds(state, t.x, t.y)) continue;
    const i = tileIndex(state, t.x, t.y);
    const cur = state.occupy[i] ?? 0;
    if (cur !== 0 && cur !== e.id) continue;
    state.occupy[i] = e.id;
  }
  if (e.wreck) restampWreckBlock(state);
}

export function vacateEntity(state: MatchState, e: Entity): void {
  if (isFieldStructure(e.type) || isBridge(e.type)) return;
  if (e.kind !== "building" && !e.wreck) return;
  for (const t of buildingTilesOf(e, state.tileSize)) {
    if (!inBounds(state, t.x, t.y)) continue;
    const i = tileIndex(state, t.x, t.y);
    if (state.occupy[i] === e.id) state.occupy[i] = 0;
  }
  if (e.wreck) restampWreckBlock(state);
}

export function destroyEntity(state: MatchState, e: Entity): void {
  vacateEntity(state, e);
  state.entities.delete(e.id);
}

export function tilesBlockedOrScrap(state: MatchState, tx: number, ty: number, w: number, h: number): boolean {
  if (tilesBlocked(state, tx, ty, w, h)) return true;
  for (const t of footprint(tx, ty, w, h)) {
    if (scrapAt(state, t.x, t.y) > 0) return true;
  }
  return false;
}

/** Ground, trees, buildings, and wrecks under a footprint. Scrap does not count: the Smelter stands on it. */
export function tilesBlocked(state: MatchState, tx: number, ty: number, w: number, h: number): boolean {
  return tileListBlocked(state, footprint(tx, ty, w, h));
}

/**
 * tilesBlocked over any set of tiles, such as a turned building's ground.
 * With `treesBlock` false a standing tree does not count: the building fells it when it goes up.
 */
export function tileListBlocked(state: MatchState, tiles: readonly { x: number; y: number }[], treesBlock = true): boolean {
  for (const t of tiles) {
    if (!inBounds(state, t.x, t.y)) return true;
    if (state.blocked[tileIndex(state, t.x, t.y)] === 1) return true;
    if (treesBlock && isTree(state, t.x, t.y)) return true;
    if (occupant(state, t.x, t.y) !== 0) return true;
  }
  return false;
}

/** Scrap tiles under a footprint. */
export function scrapTilesUnder(state: MatchState, tx: number, ty: number, w: number, h: number): number {
  let n = 0;
  for (const t of footprint(tx, ty, w, h)) if (scrapAt(state, t.x, t.y) > 0) n++;
  return n;
}

/** A footprint within `radius` of one of the owner's base buildings. Defences and lines are not anchors. */
export function inBuildRadius(state: MatchState, ownerId: string, tx: number, ty: number, w: number, h: number, radius: number): boolean {
  for (const e of state.entities.values()) {
    if (e.kind !== "building" || e.ownerId !== ownerId || e.hp <= 0) continue;
    if (!anchorsBuildRange(e.type)) continue;
    if (footprintGap(tx, ty, w, h, e.tileX, e.tileY, e.tileW, e.tileH) <= radius) return true;
  }
  return false;
}

/**
 * A 1×1 tile within LINE_BUILD_RADIUS of the owner's own base buildings: where a Defences-tab line may go.
 * Field structures and guns are not anchors, so a wall or a tower in the field cannot extend the yard.
 */
export function tileNearOwnBuildings(
  buildings: Iterable<{
    kind: string;
    ownerId: string;
    hp: number;
    type: EntityType;
    tileX: number;
    tileY: number;
    tileW: number;
    tileH: number;
  }>,
  ownerId: string,
  tx: number,
  ty: number,
): boolean {
  for (const e of buildings) {
    if (e.kind !== "building" || e.ownerId !== ownerId || e.hp <= 0) continue;
    if (!anchorsBuildRange(e.type)) continue;
    if (footprintGap(tx, ty, 1, 1, e.tileX, e.tileY, e.tileW, e.tileH) <= LINE_BUILD_RADIUS) return true;
  }
  return false;
}

/** Least Chebyshev distance between any tile of footprint A and any tile of footprint B. */
export function footprintGap(
  ax: number, ay: number, aw: number, ah: number,
  bx: number, by: number, bw: number, bh: number,
): number {
  const dx = Math.max(0, bx - (ax + aw - 1), ax - (bx + bw - 1));
  const dy = Math.max(0, by - (ay + ah - 1), ay - (by + bh - 1));
  return Math.max(dx, dy);
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
  if (isTurnedBuilding(e)) return rectContains(buildingRect(e, tileSize), wx, wy);
  const b = buildingBounds(e, tileSize);
  return wx >= b.x0 && wx < b.x1 && wy >= b.y0 && wy < b.y1;
}

/** Where along the segment (0..1) it first meets the building's ground, turned or not; null when it misses. */
export function segmentBuildingT(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  e: Entity,
  tileSize: number,
): number | null {
  if (isTurnedBuilding(e)) return segmentRectT(buildingRect(e, tileSize), x0, y0, x1, y1);
  return segmentAabbT(x0, y0, x1, y1, buildingBounds(e, tileSize));
}

/** Chebyshev ≤ 1 to any footprint tile, including standing on the pad. */
export function adjacentToBuilding(state: MatchState, unit: Entity, building: Entity): boolean {
  const tx = worldToTile(unit.x, state.tileSize);
  const ty = worldToTile(unit.y, state.tileSize);
  for (const t of buildingTilesOf(building, state.tileSize)) {
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

/**
 * Belongs to no one and fights for no one: a map's house, defence, or section
 * nobody has taken. A neutral map unit is not ownerless; it is everyone's enemy.
 */
export function ownerless(e: Entity): boolean {
  return !e.ownerId && e.kind !== "unit";
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

/** The door a unit leaves `building` by. With `type`, the nearest tile that unit can stand on: water for a boat. */
export function rallyPoint(state: MatchState, building: Entity, type?: EntityType): { x: number; y: number } {
  const cx = state.width / 2;
  const cy = state.height / 2;
  const bx = building.tileX + building.tileW / 2;
  const by = building.tileY + building.tileH / 2;
  const dx = Math.sign(cx - bx) || 1;
  const dy = Math.sign(cy - by) || 1;
  const tx = Math.round(bx + dx * (building.tileW / 2 + 1));
  const ty = Math.round(by + dy * (building.tileH / 2 + 1));
  const snap = nearestWalkable(state, tx, ty, type && isNavalType(type) ? type : undefined) ?? { x: tx, y: ty };
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
  /** tileW/tileH: a turned building's tile box, in place of the catalog's. */
  opts?: { tileX?: number; tileY?: number; facing?: number; tileW?: number; tileH?: number },
): Entity {
  const def = catalog(type);
  const gun = infantryGunFor({ type, crits: [] });
  const belt = beltOf(type);
  const tileX = opts?.tileX ?? worldToTile(x, state.tileSize);
  const tileY = opts?.tileY ?? worldToTile(y, state.tileSize);
  const id = state.nextId++;
  const facing = opts?.facing ?? 0;
  const e: Entity = {
    id,
    kind: def.kind,
    type,
    ownerId,
    x,
    y,
    facing,
    turretFacing: facing,
    hp: def.hp,
    hpMax: def.hp,
    state: "idle",
    tileX,
    tileY,
    tileW: opts?.tileW ?? def.tileW,
    tileH: opts?.tileH ?? def.tileH,
    radius: def.radius,
    order: null,
    waypoints: [],
    cooldown: 0,
    clip: gun?.clip ?? belt?.clip ?? 0,
    reload: 0,
    reloadMul: gun || belt ? rollReloadMul(() => nextRand(state)) : 1,
    cartHp: maulerCartHpOf(type),
    returnToBase: false,
    deployTime: 0,
    specialCooldown: 0,
    smokeCharges: haulerSmokeChargesOf(type),
    queue: [],
    attackTarget: null,
    wreck: false,
    ammo: def.ammo ? { ...def.ammo } : {},
    shell: def.defaultShell ?? null,
    weapon: primaryInfantryGun(type)?.id ?? null,
    gatlingGuns: type === "walker" ? 1 : undefined,
    rockets: rocketsOf(type) ? rocketAmmoOf(type) : undefined,
    heavy: type === "rocketer" ? 1 : undefined,
    field: hasForceField(type) ? FORCE_FIELD_HP : undefined,
    bipod: 0,
    mgAmmo: def.mgAmmo ?? 0,
    mgHeat: 0,
    mgOverheat: 0,
    mgCooldown: 0,
    garrisonedIn: null,
    garrison: [],
    garrisonHide: false,
    scoutHp: scoutHpMaxOf(type),
    scoutHpMax: scoutHpMaxOf(type),
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
    crew: isSupplyCarrier(type),
    supply: isSupplyCarrier(type) ? SUPPLY_CARGO : 0,
  };
  if (def.aircraft) e.air = newAirState(null, 0, type);
  if (type === "artillery") e.gunCrew = Array.from({ length: ARTILLERY_CREW }, () => ARTILLERY_CREW_HP);
  if (type === "battleship") e.ship = newShipState(facing);
  if (type === "droneop") e.droneLink = newDroneLink();
  if (hasSonar(type)) e.asw = newAswDeck();
  if (type === "jumpjet") e.jet = newJetState();
  state.entities.set(id, e);
  occupyEntity(state, e);
  return e;
}

export function clearOrder(e: Entity): void {
  e.order = null;
  e.waypoints = [];
  e.attackTarget = null;
  e.guardFacing = null;
  e.returnToBase = false;
  e.work = 0;
  e.fieldQueue = undefined;
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
    e.state === "build" ||
    e.state === "repair"
  ) {
    e.state = "idle";
  }
}

export function ownedUnits(state: MatchState, playerId: string): number {
  let n = 0;
  for (const e of state.entities.values()) {
    if (e.kind === "unit" && e.ownerId === playerId && e.hp > 0 && !e.wreck && !isTorpedoBody(e.type)) n++;
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

/** Where a segment first enters a box, 0–1 along it. 0 when it starts inside. Null on a miss. */
export function segmentAabbT(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  box: { x0: number; y0: number; x1: number; y1: number },
): number | null {
  if (x0 >= box.x0 && x0 < box.x1 && y0 >= box.y0 && y0 < box.y1) return 0;
  const dx = x1 - x0;
  const dy = y1 - y0;
  let t0 = 0;
  let t1 = 1;
  const clip = (p: number, q: number): boolean => {
    if (Math.abs(p) < 1e-12) return q >= 0;
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
    return true;
  };
  if (!clip(-dx, x0 - box.x0)) return null;
  if (!clip(dx, box.x1 - x0)) return null;
  if (!clip(-dy, y0 - box.y0)) return null;
  if (!clip(dy, box.y1 - y0)) return null;
  if (t0 > t1 || t0 > 1 || t1 < 0) return null;
  return t0 < 0 ? 0 : t0;
}

/**
 * Where a segment first enters a capsule (every point within `r` of the line a–b),
 * 0–1 along it. 0 when it starts inside. Null on a miss.
 */
export function segmentCapsuleT(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  r: number,
): number | null {
  const len = Math.hypot(bx - ax, by - ay);
  if (len < 1e-6) return segmentCircleT(x0, y0, x1, y1, ax, ay, r);
  // The middle as a box in the capsule's own frame: u along a→b, v across it.
  const ux = (bx - ax) / len;
  const uy = (by - ay) / len;
  const u0 = (x0 - ax) * ux + (y0 - ay) * uy;
  const v0 = -(x0 - ax) * uy + (y0 - ay) * ux;
  const du = (x1 - x0) * ux + (y1 - y0) * uy;
  const dv = -(x1 - x0) * uy + (y1 - y0) * ux;
  let t0 = 0;
  let t1 = 1;
  const clip = (d: number, lo: number, hi: number, at: number): boolean => {
    if (Math.abs(d) < 1e-9) return at >= lo && at <= hi;
    let ta = (lo - at) / d;
    let tb = (hi - at) / d;
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta);
    t1 = Math.min(t1, tb);
    return t0 <= t1;
  };
  let best: number | null = clip(du, 0, len, u0) && clip(dv, -r, r, v0) ? t0 : null;
  for (const [cx, cy] of [
    [ax, ay],
    [bx, by],
  ] as const) {
    const t = segmentCircleT(x0, y0, x1, y1, cx, cy, r);
    if (t != null && (best == null || t < best)) best = t;
  }
  return best;
}

/** Distance from (px, py) to the nearest point of the line a–b. */
export function pointSegmentDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

/** Where a segment first enters a circle, 0–1 along it. 0 when it starts inside. Null on a miss. */
export function segmentCircleT(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  cx: number,
  cy: number,
  r: number,
): number | null {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const fx = x0 - cx;
  const fy = y0 - cy;
  const a = dx * dx + dy * dy;
  const c0 = fx * fx + fy * fy - r * r;
  if (c0 <= 0) return 0;
  if (a < 1e-8) return null;
  const b = 2 * (fx * dx + fy * dy);
  const disc = b * b - 4 * a * c0;
  if (disc < 0) return null;
  const s = Math.sqrt(disc);
  const t1 = (-b - s) / (2 * a);
  const t2 = (-b + s) / (2 * a);
  if (t1 >= 0 && t1 <= 1) return t1;
  if (t2 >= 0 && t2 <= 1) return t2;
  return null;
}
