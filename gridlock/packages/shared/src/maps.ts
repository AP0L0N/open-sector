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

  return {
    id: "yard-64",
    name: "Scrap Yard",
    width,
    height,
    tileSize: 32,
    tiles,
    spawns: [
      { id: 1, x: 3, y: 3, suggestedTeam: 1 },
      { id: 2, x: 60, y: 3, suggestedTeam: 2 },
      { id: 3, x: 3, y: 60, suggestedTeam: 3 },
      { id: 4, x: 60, y: 60, suggestedTeam: 4 },
      { id: 5, x: 31, y: 3 },
      { id: 6, x: 31, y: 60 },
      { id: 7, x: 3, y: 31 },
      { id: 8, x: 60, y: 31 },
    ],
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
