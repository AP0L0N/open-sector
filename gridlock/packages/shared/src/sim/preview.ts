import { BUILD_RADIUS, catalog, type BuildingType, type FieldStructureType } from "../catalog.js";
import { TILE_BLOCKED, TILE_FENCE, TILE_TREE, TILE_WATER, getMap } from "../maps.js";
import type { MatchSnapshot } from "../protocol.js";
import { fieldTilesOn, overlapsFieldIn } from "./field.js";
import { footprint, footprintGap } from "./geo.js";

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
  const cleared = new Set((snap.clearedTrees ?? []).map((c) => c.y * map.width + c.x));
  for (const t of tiles) {
    const i = t.y * map.width + t.x;
    const kind = map.tiles[i] ?? TILE_BLOCKED;
    if (kind === TILE_BLOCKED || kind === TILE_WATER || kind === TILE_FENCE) return false;
    if (kind === TILE_TREE && !cleared.has(i)) return false;
    if (snap.scrap.some((s) => s.x === t.x && s.y === t.y && s.yield > 0)) return false;
    for (const e of snap.entities) {
      if (e.kind !== "building" || e.hp <= 0) continue;
      if (t.x >= e.tileX && t.x < e.tileX + e.tileW && t.y >= e.tileY && t.y < e.tileY + e.tileH) return false;
    }
  }
  return !overlapsFieldIn(snap.entities, type, x, y, facing);
}

export function previewPlace(snap: MatchSnapshot, type: BuildingType, tx: number, ty: number): boolean {
  const map = getMap(snap.mapId);
  if (!map) return false;
  const def = catalog(type);
  const tiles = footprint(tx, ty, def.tileW, def.tileH);
  const cleared = new Set((snap.clearedTrees ?? []).map((c) => c.y * map.width + c.x));
  for (const t of tiles) {
    if (t.x < 0 || t.y < 0 || t.x >= map.width || t.y >= map.height) return false;
    const kind = map.tiles[t.y * map.width + t.x] ?? TILE_BLOCKED;
    if (kind === TILE_BLOCKED) return false;
    if (kind === TILE_TREE && !cleared.has(t.y * map.width + t.x)) return false;
    if (snap.scrap.some((s) => s.x === t.x && s.y === t.y && s.yield > 0)) return false;
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
  const you = snap.youPlayerId;
  for (const e of snap.entities) {
    if (e.kind !== "building" || e.ownerId !== you) continue;
    if (footprintGap(tx, ty, def.tileW, def.tileH, e.tileX, e.tileY, e.tileW, e.tileH) <= BUILD_RADIUS) return true;
  }
  return false;
}
