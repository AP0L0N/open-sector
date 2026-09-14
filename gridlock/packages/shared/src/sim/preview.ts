import { BUILD_RADIUS, catalog, type BuildingType } from "../catalog.js";
import { TILE_BLOCKED, TILE_TREE, getMap } from "../maps.js";
import type { MatchSnapshot } from "../protocol.js";
import { chebyshev, footprint } from "./geo.js";

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
    for (const b of footprint(e.tileX, e.tileY, e.tileW, e.tileH)) {
      for (const n of tiles) {
        if (chebyshev(n.x, n.y, b.x, b.y) <= BUILD_RADIUS) return true;
      }
    }
  }
  return false;
}
