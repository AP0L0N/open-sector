import { HEIGHT_MAX, HEIGHT_STEP_MAX } from "./catalog.js";

export interface SpawnDef {
  id: number;
  x: number;
  y: number;
  suggestedTeam?: number;
}

export interface MapDef {
  id: string;
  name: string;
  width: number;
  height: number;
  tileSize: number;
  spawns: SpawnDef[];
  /** 0 = empty, 1 = blocked */
  tiles: number[];
  /** Discrete elevation per tile. Same length as `tiles`. 0 = floor. */
  heights: number[];
}

export const TILE_EMPTY = 0;
export const TILE_BLOCKED = 1;
export const TILE_SCRAP = 2;

function idx(width: number, x: number, y: number): number {
  return y * width + x;
}

function fillRect(
  tiles: number[],
  width: number,
  height: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  value: number,
): void {
  const xa = Math.max(0, Math.min(x0, x1));
  const xb = Math.min(width - 1, Math.max(x0, x1));
  const ya = Math.max(0, Math.min(y0, y1));
  const yb = Math.min(height - 1, Math.max(y0, y1));
  for (let y = ya; y <= yb; y++) {
    for (let x = xa; x <= xb; x++) {
      tiles[idx(width, x, y)] = value;
    }
  }
}

const BLOB: readonly [number, number][] = [
  [0, 0],
  [1, 0],
  [0, 1],
  [1, 1],
  [-1, 0],
  [0, -1],
  [2, 1],
  [1, 2],
];

function paintScrapBlob(tiles: number[], width: number, height: number, cx: number, cy: number): void {
  for (const [dx, dy] of BLOB) {
    const x = cx + dx;
    const y = cy + dy;
    if (x < 0 || y < 0 || x >= width || y >= height) continue;
    const i = idx(width, x, y);
    if (tiles[i] === TILE_EMPTY) tiles[i] = TILE_SCRAP;
  }
}

function punchRect(
  tiles: number[],
  width: number,
  height: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): void {
  fillRect(tiles, width, height, x0, y0, x1, y1, TILE_EMPTY);
}

function hash32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function nextRand(state: { n: number }): number {
  state.n = (Math.imul(state.n, 1664525) + 1013904223) >>> 0;
  return state.n / 4294967296;
}

function splatHill(
  heights: number[],
  width: number,
  height: number,
  cx: number,
  cy: number,
  radX: number,
  radY: number,
  peak: number,
): void {
  const rx = Math.max(1.5, radX);
  const ry = Math.max(1.5, radY);
  const x0 = Math.max(0, Math.floor(cx - rx - 1));
  const x1 = Math.min(width - 1, Math.ceil(cx + rx + 1));
  const y0 = Math.max(0, Math.floor(cy - ry - 1));
  const y1 = Math.min(height - 1, Math.ceil(cy + ry + 1));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d >= 1) continue;
      const fall = (1 - d) * (1 - d * 0.2);
      const h = Math.round(peak * fall);
      if (h <= 0) continue;
      const i = idx(width, x, y);
      const cur = heights[i] ?? 0;
      if (h > cur) heights[i] = Math.min(HEIGHT_MAX, h);
    }
  }
}

function relaxSlopes(heights: number[], width: number, height: number): void {
  const step = HEIGHT_STEP_MAX;
  let changed = true;
  while (changed) {
    changed = false;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = idx(width, x, y);
        let h = heights[i] ?? 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            const n = heights[idx(width, nx, ny)] ?? 0;
            if (h > n + step) {
              h = n + step;
              heights[i] = h;
              changed = true;
            }
          }
        }
      }
    }
  }
}

function flattenPad(heights: number[], width: number, height: number, cx: number, cy: number, r: number): void {
  for (let y = cy - r; y <= cy + r; y++) {
    for (let x = cx - r; x <= cx + r; x++) {
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      if (Math.hypot(x - cx, y - cy) <= r) heights[idx(width, x, y)] = 0;
    }
  }
}

/** Seeded rolling hills. Spawns stay on the floor; slopes never cliff. */
export function scatterHeights(
  width: number,
  height: number,
  seed: string,
  pads: readonly { x: number; y: number; r: number }[],
): number[] {
  const heights = new Array(width * height).fill(0);
  const rng = { n: hash32(seed) };
  const quadrants: readonly [number, number][] = [
    [width * 0.3, height * 0.28],
    [width * 0.7, height * 0.3],
    [width * 0.32, height * 0.7],
    [width * 0.68, height * 0.72],
    [width * 0.5, height * 0.48],
  ];
  for (const [qx, qy] of quadrants) {
    const cx = qx + (nextRand(rng) - 0.5) * 10;
    const cy = qy + (nextRand(rng) - 0.5) * 10;
    const peak = 2 + Math.floor(nextRand(rng) * (HEIGHT_MAX - 1));
    const rad = 8 + nextRand(rng) * 7;
    const stretch = 0.7 + nextRand(rng) * 0.7;
    splatHill(heights, width, height, cx, cy, rad * stretch, rad / stretch, peak);
  }
  const extra = 6 + Math.floor(nextRand(rng) * 5);
  for (let i = 0; i < extra; i++) {
    const cx = 6 + nextRand(rng) * (width - 12);
    const cy = 6 + nextRand(rng) * (height - 12);
    const peak = 1 + Math.floor(nextRand(rng) * HEIGHT_MAX);
    const rad = 4.5 + nextRand(rng) * 9;
    const stretch = 0.65 + nextRand(rng) * 0.9;
    splatHill(heights, width, height, cx, cy, rad * stretch, rad / stretch, peak);
  }
  for (const p of pads) flattenPad(heights, width, height, p.x, p.y, p.r);
  relaxSlopes(heights, width, height);
  return heights;
}

/** 64×64 yard with a central compound and 8 edge/corner spawns. */
export function makeYard64(): MapDef {
  const width = 64;
  const height = 64;
  const tiles = new Array(width * height).fill(TILE_EMPTY);

  fillRect(tiles, width, height, 26, 26, 37, 37, TILE_BLOCKED);
  fillRect(tiles, width, height, 28, 28, 35, 35, TILE_EMPTY);
  fillRect(tiles, width, height, 31, 26, 32, 28, TILE_EMPTY);
  fillRect(tiles, width, height, 18, 18, 20, 22, TILE_BLOCKED);
  fillRect(tiles, width, height, 43, 18, 45, 22, TILE_BLOCKED);
  fillRect(tiles, width, height, 18, 41, 20, 45, TILE_BLOCKED);
  fillRect(tiles, width, height, 43, 41, 45, 45, TILE_BLOCKED);
  fillRect(tiles, width, height, 8, 30, 14, 33, TILE_BLOCKED);
  fillRect(tiles, width, height, 49, 30, 55, 33, TILE_BLOCKED);

  paintScrapBlob(tiles, width, height, 13, 12);
  paintScrapBlob(tiles, width, height, 50, 12);
  paintScrapBlob(tiles, width, height, 13, 51);
  paintScrapBlob(tiles, width, height, 50, 51);
  paintScrapBlob(tiles, width, height, 31, 12);
  paintScrapBlob(tiles, width, height, 31, 51);
  paintScrapBlob(tiles, width, height, 13, 31);
  paintScrapBlob(tiles, width, height, 50, 31);
  paintScrapBlob(tiles, width, height, 22, 31);
  paintScrapBlob(tiles, width, height, 41, 31);

  const spawns: SpawnDef[] = [
    { id: 1, x: 3, y: 3, suggestedTeam: 1 },
    { id: 2, x: 60, y: 3, suggestedTeam: 2 },
    { id: 3, x: 3, y: 60, suggestedTeam: 3 },
    { id: 4, x: 60, y: 60, suggestedTeam: 4 },
    { id: 5, x: 31, y: 3 },
    { id: 6, x: 31, y: 60 },
    { id: 7, x: 3, y: 31 },
    { id: 8, x: 60, y: 31 },
  ];
  const heights = scatterHeights(
    width,
    height,
    "yard-64-elev",
    spawns.map((s) => ({ x: s.x, y: s.y, r: 4 })),
  );

  return {
    id: "yard-64",
    name: "Scrap Yard",
    width,
    height,
    tileSize: 32,
    tiles,
    heights,
    spawns,
  };
}

/** 48×48 canal with a blocked water strip and bridges; 4 corners + 4 mid-edges. */
export function makeCanal48(): MapDef {
  const width = 48;
  const height = 48;
  const tiles = new Array(width * height).fill(TILE_EMPTY);

  fillRect(tiles, width, height, 0, 21, 47, 26, TILE_BLOCKED);
  punchRect(tiles, width, height, 10, 21, 13, 26);
  punchRect(tiles, width, height, 22, 21, 25, 26);
  punchRect(tiles, width, height, 34, 21, 37, 26);
  fillRect(tiles, width, height, 6, 6, 9, 9, TILE_BLOCKED);
  fillRect(tiles, width, height, 38, 6, 41, 9, TILE_BLOCKED);
  fillRect(tiles, width, height, 6, 38, 9, 41, TILE_BLOCKED);
  fillRect(tiles, width, height, 38, 38, 41, 41, TILE_BLOCKED);

  paintScrapBlob(tiles, width, height, 14, 12);
  paintScrapBlob(tiles, width, height, 34, 12);
  paintScrapBlob(tiles, width, height, 14, 35);
  paintScrapBlob(tiles, width, height, 34, 35);
  paintScrapBlob(tiles, width, height, 23, 12);
  paintScrapBlob(tiles, width, height, 23, 35);
  paintScrapBlob(tiles, width, height, 14, 16);
  paintScrapBlob(tiles, width, height, 34, 32);
  paintScrapBlob(tiles, width, height, 16, 16);
  paintScrapBlob(tiles, width, height, 31, 32);

  return {
    id: "canal-48",
    name: "Iron Canal",
    width,
    height,
    tileSize: 32,
    tiles,
    heights: new Array(width * height).fill(0),
    spawns: [
      { id: 1, x: 3, y: 3, suggestedTeam: 1 },
      { id: 2, x: 44, y: 3, suggestedTeam: 2 },
      { id: 3, x: 3, y: 44, suggestedTeam: 3 },
      { id: 4, x: 44, y: 44, suggestedTeam: 4 },
      { id: 5, x: 23, y: 3 },
      { id: 6, x: 23, y: 44 },
      { id: 7, x: 3, y: 16 },
      { id: 8, x: 44, y: 32 },
    ],
  };
}

export const MAPS: Record<string, MapDef> = {
  "yard-64": makeYard64(),
  "canal-48": makeCanal48(),
};

export const DEFAULT_MAP_ID = "yard-64";

export function getMap(id: string): MapDef | undefined {
  return MAPS[id];
}

export function listMaps(): MapDef[] {
  return Object.values(MAPS);
}

export function tileAt(map: MapDef, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return TILE_BLOCKED;
  return map.tiles[y * map.width + x] ?? TILE_BLOCKED;
}

export function heightAt(map: MapDef, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return 0;
  return map.heights[y * map.width + x] ?? 0;
}

export function maxHeightOf(map: MapDef): number {
  let m = 0;
  for (const h of map.heights) {
    if (h > m) m = h;
  }
  return m;
}
