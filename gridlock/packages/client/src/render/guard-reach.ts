import {
  HEIGHT_BASE,
  TILE_SUBDIV,
  hasTerrainLos,
  heightAt,
  observerEyeOf,
  rangeTilesOf,
  worldToTile,
  type EntityType,
  type MapDef,
} from "@gridlock/shared";

export interface GuardUnit {
  type: EntityType;
  /** Live gun reach in tiles when it differs from the catalog (handgun). */
  gunRangeTiles?: number;
}

export interface GuardReach {
  /** Ground height used for the preview. HEIGHT_BASE when the tile is unexplored. */
  elev: number;
  /** False when the pointer is over fog the player has never seen. */
  known: boolean;
  /** Reach of the longest gun in the selection, standing at the pointer. World px. */
  rangeWorld: number;
  /** Extra reach from standing at `elev` instead of the plain, in authoring cells. */
  bonusCells: number;
  /** Reach along each sampled cone ray after explored ridges clip it. World px. */
  rays: number[];
}

let masked: Uint8Array | null = null;

/**
 * Explored ground keeps its height; unseen ground reads as level with the
 * origin so the preview never leaks a ridge hiding in the fog.
 */
function maskedHeights(map: MapDef, explored: ArrayLike<number> | null, flat: number): Uint8Array {
  const n = map.width * map.height;
  if (!masked || masked.length !== n) masked = new Uint8Array(n);
  for (let i = 0; i < n; i++) masked[i] = explored && explored[i] ? (map.heights[i] ?? 0) : flat;
  return masked;
}

/**
 * Guard preview for a stand at (ox, oy): gun reach from the pointer's own
 * height, and each cone ray cut where explored terrain hides the ground.
 */
export function guardReach(
  map: MapDef,
  explored: ArrayLike<number> | null,
  units: readonly GuardUnit[],
  ox: number,
  oy: number,
  facing: number,
  halfCone: number,
  raySteps: number,
): GuardReach {
  const ts = map.tileSize;
  const tx = worldToTile(ox, ts);
  const ty = worldToTile(oy, ts);
  const inside = tx >= 0 && ty >= 0 && tx < map.width && ty < map.height;
  const known = inside && !!explored && !!explored[ty * map.width + tx];
  const elev = known ? heightAt(map, tx, ty) : HEIGHT_BASE;
  let rangeTiles = 0;
  let flatTiles = 0;
  let eye = 0;
  for (const u of units) {
    const r = rangeTilesOf(u.type, elev, u.gunRangeTiles);
    if (r <= 0) continue;
    if (r > rangeTiles) rangeTiles = r;
    flatTiles = Math.max(flatTiles, rangeTilesOf(u.type, HEIGHT_BASE, u.gunRangeTiles));
    eye = Math.max(eye, observerEyeOf(u.type));
  }
  const rangeWorld = rangeTiles * ts;
  const bonusCells = (rangeTiles - flatTiles) / TILE_SUBDIV;
  const rays: number[] = [];
  if (rangeWorld <= 0) return { elev, known, rangeWorld, bonusCells, rays };
  const heights = known ? maskedHeights(map, explored, elev) : null;
  const step = ts / 2;
  for (let i = 0; i <= raySteps; i++) {
    const a = facing - halfCone + (2 * halfCone * i) / Math.max(1, raySteps);
    const cx = Math.cos(a);
    const cy = Math.sin(a);
    let reach = rangeWorld;
    if (heights) {
      for (let d = step; d <= rangeWorld; d += step) {
        const x1 = worldToTile(ox + cx * d, ts);
        const y1 = worldToTile(oy + cy * d, ts);
        if (x1 < 0 || y1 < 0 || x1 >= map.width || y1 >= map.height) {
          reach = d - step;
          break;
        }
        if (!hasTerrainLos(heights, map.width, map.height, tx, ty, x1, y1, eye)) {
          reach = Math.max(0, d - step);
          break;
        }
      }
    }
    rays.push(reach);
  }
  return { elev, known, rangeWorld, bonusCells, rays };
}

/** Label suffix: reach gained on high ground, or "?" over unseen fog. */
export function guardHeightTag(r: GuardReach): string {
  if (r.rangeWorld <= 0) return "";
  if (!r.known) return " ?";
  if (r.bonusCells <= 0) return "";
  const n = Math.round(r.bonusCells * 10) / 10;
  return ` ▲+${n}`;
}
