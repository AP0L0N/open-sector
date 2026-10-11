import { SMELTER_SCRAP_COVER, anchorsBuildRange, bridgeBrickLength, buildRadiusOf, catalog, isBridge, isEngineerBuilding, isFieldStructure, isSmelterType, isYardField, onWaterBuilding, scrapIsGround, type BridgeType, type BuildingType, type FieldStructureType, type YardFieldType } from "../catalog.js";
import { TILE_BLOCKED, TILE_FENCE, TILE_WATER, getMap, isGroveTile, isMountainCliff } from "../maps.js";
import type { MatchSnapshot } from "../protocol.js";
import { planBridgeLine, type BridgeBrick, type BridgeGround, type BridgeSpan } from "../bridge-plan.js";
import { fieldTilesOn, overlapsFieldIn, overlapsSitedLine, sitedLineTiles } from "./field.js";
import { buildingSite, buildingTilesOf, turnedBox } from "../building-rect.js";
import { footprintGap, sameTeam, tileNearAlliedBuildings } from "./geo.js";
import { smelterCrowded } from "./smelter.js";

/** Tiles under the snapshot's standing buildings, turned ones on their real ground. */
function buildingCells(snap: MatchSnapshot, width: number, tileSize: number, liveOnly: boolean): Set<number> {
  const out = new Set<number>();
  for (const e of snap.entities) {
    if (e.kind !== "building" || (liveOnly && e.hp <= 0)) continue;
    for (const t of buildingTilesOf(e, tileSize)) out.add(t.y * width + t.x);
  }
  return out;
}

/** Snapshot-side twin of `fieldSiteClear`: ground, scrap, buildings, and other field structures. */
export function previewField(
  snap: MatchSnapshot,
  type: FieldStructureType,
  x: number,
  y: number,
  facing: number,
): boolean {
  const map = getMap(snap.mapId);
  if (!map) return false;
  const tiles = fieldTilesOn(map, type, x, y, facing, 0);
  if (tiles.length === 0) return false;
  if (overlapsSitedLine(snap.you.lineQueue, type, x, y, facing)) return false;
  const cleared = new Set((snap.clearedTrees ?? []).map((c) => c.y * map.width + c.x));
  const built = buildingCells(snap, map.width, map.tileSize, true);
  for (const t of tiles) {
    const i = t.y * map.width + t.x;
    const kind = map.tiles[i] ?? TILE_BLOCKED;
    if (kind === TILE_BLOCKED || kind === TILE_WATER || kind === TILE_FENCE) return false;
    if (isMountainCliff(map.tiles, map.heights, map.width, map.height, t.x, t.y)) return false;
    if (isGroveTile(kind) && !cleared.has(i)) return false;
    if (snap.scrap?.some((s) => s.x === t.x && s.y === t.y && s.yield > 0)) return false;
    if (built.has(i)) return false;
  }
  return !overlapsFieldIn(snap.entities, type, x, y, facing);
}

/** Whether an owner is you or on your team, read from the snapshot roster the way the sim reads its own. */
function alliedToYou(snap: MatchSnapshot): (ownerId: string) => boolean {
  const you = snap.players.find((p) => p.playerId === snap.youPlayerId);
  return (ownerId) => ownerId === snap.youPlayerId || sameTeam(you, snap.players.find((p) => p.playerId === ownerId));
}

/** Snapshot twin of a Defences-tab sandbag or wall piece: clear ground, and next to your base or an ally's. */
export function previewYardField(snap: MatchSnapshot, type: YardFieldType, x: number, y: number, facing: number): boolean {
  if (!isYardField(type) || !previewField(snap, type, x, y, facing)) return false;
  const map = getMap(snap.mapId);
  if (!map) return false;
  const tiles = fieldTilesOn(map, type, x, y, facing, 0);
  const isAlly = alliedToYou(snap);
  return tiles.some((t) => tileNearAlliedBuildings(snap.entities, isAlly, t.x, t.y));
}

/**
 * Snapshot twin of the sim's site check: open ground under the footprint, and for a
 * Smelter enough scrap under it; for everything else no scrap at all, unless the Xenite
 * builds on it (scrap is bare ground to it). A Marine Base
 * wants open water under every tile; nothing else stands on water or a fence.
 * `facing` turns a rotatable building; (tx, ty) is then the top-left of its turned box.
 */
export function previewSite(snap: MatchSnapshot, type: BuildingType, tx: number, ty: number, facing = 0): boolean {
  const map = getMap(snap.mapId);
  if (!map) return false;
  const def = catalog(type);
  const tiles = buildingTilesOf(buildingSite(type, tx, ty, facing, map.tileSize), map.tileSize);
  const built = buildingCells(snap, map.width, map.tileSize, false);
  const scrapCells = new Set<number>();
  for (const s of snap.scrap ?? []) if (s.yield > 0) scrapCells.add(s.y * map.width + s.x);
  // Your sited wall or sandbag line counts as standing while the yard builds it.
  const sited = sitedLineTiles(map, snap.you.lineQueue);
  let scrapUnder = 0;
  const afloat = onWaterBuilding(type);
  for (const t of tiles) {
    if (t.x < 0 || t.y < 0 || t.x >= map.width || t.y >= map.height) return false;
    const i = t.y * map.width + t.x;
    if (sited.has(i)) return false;
    const kind = map.tiles[i] ?? TILE_BLOCKED;
    if (afloat !== (kind === TILE_WATER)) return false;
    // A standing tree is no bar: the building fells it.
    if (kind === TILE_BLOCKED || kind === TILE_FENCE) return false;
    if (isMountainCliff(map.tiles, map.heights, map.width, map.height, t.x, t.y)) return false;
    if (scrapCells.has(i)) {
      if (isSmelterType(type)) scrapUnder++;
      else if (!scrapIsGround(type)) return false;
    }
    if (built.has(i)) return false;
  }
  if (isSmelterType(type) && scrapUnder < Math.ceil(def.tileW * def.tileH * SMELTER_SCRAP_COVER)) return false;
  if (isSmelterType(type) && smelterCrowded(snap.entities, tx, ty)) return false;
  return true;
}

/** Where an engineer may raise a base building: the site rule alone, any distance from the yard. */
export function previewConstruct(snap: MatchSnapshot, type: BuildingType, tx: number, ty: number, facing = 0): boolean {
  return isEngineerBuilding(type) && previewSite(snap, type, tx, ty, facing);
}

/** A yard-built structure: the site rule, and within its build range of your base or an ally's. */
export function previewPlace(snap: MatchSnapshot, type: BuildingType, tx: number, ty: number, facing = 0): boolean {
  if (!previewSite(snap, type, tx, ty, facing)) return false;
  const box = turnedBox(type, facing);
  const radius = buildRadiusOf(type);
  const isAlly = alliedToYou(snap);
  for (const e of snap.entities) {
    if (e.kind !== "building" || e.hp <= 0) continue;
    if (!anchorsBuildRange(e.type)) continue;
    if (!isAlly(e.ownerId)) continue;
    if (footprintGap(tx, ty, box.w, box.h, e.tileX, e.tileY, e.tileW, e.tileH) <= radius) return true;
  }
  return false;
}

/**
 * Snapshot twin of the sim's bridge plan: each brick a line would lay, and why the
 * ground refuses it, or null. Water is the map's; footing is open land with no
 * building, standing tree, or blocking field work on it.
 */
export function previewBridge(
  snap: MatchSnapshot,
  type: BridgeType,
  points: readonly { x: number; y: number }[],
  facing = 0,
  lead?: { x: number; y: number } | null,
): { span: BridgeSpan; problem: string | null }[] {
  const map = getMap(snap.mapId);
  if (!map) return [];
  const w = map.width;
  const cleared = new Set((snap.clearedTrees ?? []).map((c) => c.y * w + c.x));
  const built = new Set<number>();
  const bricks: BridgeBrick[] = [];
  for (const e of snap.entities) {
    if (e.kind !== "building" || e.hp <= 0) continue;
    if (isBridge(e.type)) {
      bricks.push({ type: e.type, span: { x: e.x, y: e.y, facing: e.facing, length: e.span ?? bridgeBrickLength(e.type) } });
      continue;
    }
    if (isFieldStructure(e.type)) {
      if (e.type === "trench" || e.ruined) continue;
      for (const t of fieldTilesOn(map, e.type, e.x, e.y, e.facing, 0)) built.add(t.y * w + t.x);
      continue;
    }
    for (const t of buildingTilesOf(e, map.tileSize)) built.add(t.y * w + t.x);
  }
  const ground: BridgeGround = {
    width: map.width,
    height: map.height,
    tileSize: map.tileSize,
    water: (tx, ty) => map.tiles[ty * w + tx] === TILE_WATER,
    footing: (tx, ty) => {
      const i = ty * w + tx;
      const kind = map.tiles[i] ?? TILE_BLOCKED;
      if (kind === TILE_BLOCKED || kind === TILE_FENCE) return false;
      if (isMountainCliff(map.tiles, map.heights, map.width, map.height, tx, ty)) return false;
      if (isGroveTile(kind) && !cleared.has(i)) return false;
      return !built.has(i);
    },
    bricks,
  };
  return planBridgeLine(ground, type, points, facing, lead);
}
