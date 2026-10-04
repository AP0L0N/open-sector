import { BUILD_RADIUS, SMELTER_SCRAP_COVER, catalog, isEngineerBuilding, isYardField, type BuildingType, type FieldStructureType, type YardFieldType } from "../catalog.js";
import { TILE_BLOCKED, TILE_FENCE, TILE_ROCK, TILE_TREE, TILE_WATER, getMap } from "../maps.js";
import type { MatchSnapshot } from "../protocol.js";
import { fieldTilesOn, overlapsFieldIn, overlapsSitedLine, sitedLineTiles } from "./field.js";
import { footprint, footprintGap, tileNearOwnBuildings } from "./geo.js";

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
  for (const t of tiles) {
    const i = t.y * map.width + t.x;
    const kind = map.tiles[i] ?? TILE_BLOCKED;
    if (kind === TILE_BLOCKED || kind === TILE_WATER || kind === TILE_FENCE || kind === TILE_ROCK) return false;
    if (kind === TILE_TREE && !cleared.has(i)) return false;
    if (snap.scrap.some((s) => s.x === t.x && s.y === t.y && s.yield > 0)) return false;
    for (const e of snap.entities) {
      if (e.kind !== "building" || e.hp <= 0) continue;
      if (t.x >= e.tileX && t.x < e.tileX + e.tileW && t.y >= e.tileY && t.y < e.tileY + e.tileH) return false;
    }
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
 * Smelter enough scrap under it; for everything else no scrap at all.
 */
export function previewSite(snap: MatchSnapshot, type: BuildingType, tx: number, ty: number): boolean {
  const map = getMap(snap.mapId);
  if (!map) return false;
  const def = catalog(type);
  const tiles = footprint(tx, ty, def.tileW, def.tileH);
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
    for (const e of snap.entities) {
      if (e.kind !== "building") continue;
      if (
        t.x >= e.tileX &&
        t.x < e.tileX + e.tileW &&
        t.y >= e.tileY &&
        t.y < e.tileY + e.tileH
      ) {
        return false;
      }
    }
  }
  if (type === "smelter" && scrapUnder < Math.ceil(def.tileW * def.tileH * SMELTER_SCRAP_COVER)) return false;
  return true;
}

/** Where an engineer may raise a base building: the site rule alone, any distance from the yard. */
export function previewConstruct(snap: MatchSnapshot, type: BuildingType, tx: number, ty: number): boolean {
  return isEngineerBuilding(type) && previewSite(snap, type, tx, ty);
}

/** A yard-built structure: the site rule, and within build range of your own buildings. */
export function previewPlace(snap: MatchSnapshot, type: BuildingType, tx: number, ty: number): boolean {
  if (!previewSite(snap, type, tx, ty)) return false;
  const def = catalog(type);
  const you = snap.youPlayerId;
  for (const e of snap.entities) {
    if (e.kind !== "building" || e.ownerId !== you) continue;
    if (footprintGap(tx, ty, def.tileW, def.tileH, e.tileX, e.tileY, e.tileW, e.tileH) <= BUILD_RADIUS) return true;
  }
  return false;
}
