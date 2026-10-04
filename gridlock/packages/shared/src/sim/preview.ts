import { BUILD_RADIUS, SMELTER_SCRAP_COVER, catalog, isEngineerBuilding, isYardField, type BuildingType, type FieldStructureType, type YardFieldType } from "../catalog.js";
import { TILE_BLOCKED, TILE_FENCE, TILE_ROCK, TILE_TREE, TILE_WATER, getMap } from "../maps.js";
import type { MatchSnapshot } from "../protocol.js";
import { fieldTilesOn, overlapsFieldIn, overlapsSitedLine, sitedLineTiles } from "./field.js";
import { buildingSite, buildingTilesOf, turnedBox } from "../building-rect.js";
import { footprintGap, tileNearOwnBuildings } from "./geo.js";

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
    if (kind === TILE_BLOCKED || kind === TILE_WATER || kind === TILE_FENCE || kind === TILE_ROCK) return false;
    if (kind === TILE_TREE && !cleared.has(i)) return false;
    if (snap.scrap.some((s) => s.x === t.x && s.y === t.y && s.yield > 0)) return false;
    if (built.has(i)) return false;
  }
  return !overlapsFieldIn(snap.entities, type, x, y, facing);
}

/** Snapshot twin of a Defences-tab sandbag or wall piece: clear ground, and next to your own buildings. */
export function previewYardField(snap: MatchSnapshot, type: YardFieldType, x: number, y: number, facing: number): boolean {
  if (!isYardField(type) || !previewField(snap, type, x, y, facing)) return false;
  const map = getMap(snap.mapId);
  if (!map) return false;
  const tiles = fieldTilesOn(map, type, x, y, facing, 0);
  return tiles.some((t) => tileNearOwnBuildings(snap.entities, snap.youPlayerId, t.x, t.y));
}

/**
 * Snapshot twin of the sim's site check: open ground under the footprint, and for a
 * Smelter enough scrap under it; for everything else no scrap at all. `facing` turns a
 * rotatable building; (tx, ty) is then the top-left of its turned box.
 */
export function previewSite(snap: MatchSnapshot, type: BuildingType, tx: number, ty: number, facing = 0): boolean {
  const map = getMap(snap.mapId);
  if (!map) return false;
  const def = catalog(type);
  const tiles = buildingTilesOf(buildingSite(type, tx, ty, facing, map.tileSize), map.tileSize);
  const built = buildingCells(snap, map.width, map.tileSize, false);
  const cleared = new Set((snap.clearedTrees ?? []).map((c) => c.y * map.width + c.x));
  const scrapCells = new Set<number>();
  for (const s of snap.scrap) if (s.yield > 0) scrapCells.add(s.y * map.width + s.x);
  // Your sited wall or sandbag line counts as standing while the yard builds it.
  const sited = sitedLineTiles(map, snap.you.lineQueue);
  let scrapUnder = 0;
  for (const t of tiles) {
    if (t.x < 0 || t.y < 0 || t.x >= map.width || t.y >= map.height) return false;
    const i = t.y * map.width + t.x;
    if (sited.has(i)) return false;
    const kind = map.tiles[i] ?? TILE_BLOCKED;
    if (kind === TILE_BLOCKED || kind === TILE_ROCK) return false;
    if (kind === TILE_TREE && !cleared.has(i)) return false;
    if (scrapCells.has(i)) {
      if (type !== "smelter") return false;
      scrapUnder++;
    }
    if (built.has(i)) return false;
  }
  if (type === "smelter" && scrapUnder < Math.ceil(def.tileW * def.tileH * SMELTER_SCRAP_COVER)) return false;
  return true;
}

/** Where an engineer may raise a base building: the site rule alone, any distance from the yard. */
export function previewConstruct(snap: MatchSnapshot, type: BuildingType, tx: number, ty: number, facing = 0): boolean {
  return isEngineerBuilding(type) && previewSite(snap, type, tx, ty, facing);
}

/** A yard-built structure: the site rule, and within build range of your own buildings. */
export function previewPlace(snap: MatchSnapshot, type: BuildingType, tx: number, ty: number, facing = 0): boolean {
  if (!previewSite(snap, type, tx, ty, facing)) return false;
  const box = turnedBox(type, facing);
  const you = snap.youPlayerId;
  for (const e of snap.entities) {
    if (e.kind !== "building" || e.ownerId !== you) continue;
    if (footprintGap(tx, ty, box.w, box.h, e.tileX, e.tileY, e.tileW, e.tileH) <= BUILD_RADIUS) return true;
  }
  return false;
}
