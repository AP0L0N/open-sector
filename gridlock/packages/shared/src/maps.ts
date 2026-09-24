import {
  HEIGHT_BASE,
  HEIGHT_MAX,
  HEIGHT_STEP_MAX,
  TILE_SIZE,
  TILE_SUBDIV,
  catalog,
  type CivilianType,
} from "./catalog.js";

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
  /** Discrete elevation per tile. Same length as `tiles`. 0 = valley floor. */
  heights: number[];
  /** Max of `heights`. Cached so render/pick do not scan the map. */
  maxHeight: number;
  /** Civilian houses. Tile origin is the fine-grid top-left. */
  features: MapFeature[];
}

export interface MapFeature {
  type: CivilianType;
  x: number;
  y: number;
  /** Cardinal face. 0 = east, then south, west, north. */
  facing: number;
}

export const TILE_EMPTY = 0;
export const TILE_BLOCKED = 1;
export const TILE_SCRAP = 2;
export const TILE_WATER = 3;
export const TILE_TREE = 4;
/** Walkable dirt lane. Same movement as open ground. */
export const TILE_ROAD = 5;
/** Wooden fence. Blocks walking. A shot still passes over it. */
export const TILE_FENCE = 6;

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

function splatDelta(
  heights: number[],
  width: number,
  height: number,
  cx: number,
  cy: number,
  radX: number,
  radY: number,
  delta: number,
): void {
  if (delta === 0) return;
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
      const mag = Math.round(delta * (1 - d));
      if (mag === 0) continue;
      const i = idx(width, x, y);
      const cur = heights[i] ?? HEIGHT_BASE;
      heights[i] = Math.min(HEIGHT_MAX, Math.max(0, cur + mag));
    }
  }
}

function hashNoise(x: number, y: number, seed: number): number {
  let h = seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h >>> 0) / 4294967296;
}

function smoothNoise(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const n00 = hashNoise(x0, y0, seed);
  const n10 = hashNoise(x0 + 1, y0, seed);
  const n01 = hashNoise(x0, y0 + 1, seed);
  const n11 = hashNoise(x0 + 1, y0 + 1, seed);
  const nx0 = n00 + (n10 - n00) * sx;
  const nx1 = n01 + (n11 - n01) * sx;
  return nx0 + (nx1 - nx0) * sy;
}

function rollingDelta(x: number, y: number, seed: number): number {
  const n0 = smoothNoise(x / 14, y / 14, seed);
  const n1 = smoothNoise(x / 7, y / 7, seed ^ 0x9e3779b9);
  const n2 = smoothNoise(x / 3.5, y / 3.5, seed ^ 0x85ebca6b);
  const n = (n0 * 4 + n1 * 2 + n2) / 7;
  return Math.round((n - 0.5) * 6);
}

function paintRolling(heights: number[], width: number, height: number, seed: string): void {
  const s = hash32(seed);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = idx(width, x, y);
      const cur = heights[i] ?? HEIGHT_BASE;
      heights[i] = Math.min(HEIGHT_MAX, Math.max(0, cur + rollingDelta(x, y, s)));
    }
  }
}

function relaxSlopes(
  heights: number[],
  width: number,
  height: number,
  locked?: Uint8Array,
): void {
  const step = HEIGHT_STEP_MAX;
  let changed = true;
  while (changed) {
    changed = false;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = idx(width, x, y);
        if (locked?.[i]) continue;
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
  if (!locked) return;
  const q: number[] = [];
  for (let i = 0; i < locked.length; i++) {
    if (locked[i]) q.push(i);
  }
  for (let qi = 0; qi < q.length; qi++) {
    const i = q[qi]!;
    const x = i % width;
    const y = (i / width) | 0;
    const h = heights[i] ?? 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const ni = idx(width, nx, ny);
        if (locked[ni]) continue;
        const need = h - step;
        if (need <= 0) continue;
        const n = heights[ni] ?? 0;
        if (n >= need) continue;
        heights[ni] = need;
        q.push(ni);
      }
    }
  }
}

function flattenPad(
  heights: number[],
  width: number,
  height: number,
  cx: number,
  cy: number,
  r: number,
  z = HEIGHT_BASE,
): void {
  for (let y = cy - r; y <= cy + r; y++) {
    for (let x = cx - r; x <= cx + r; x++) {
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      if (Math.hypot(x - cx, y - cy) <= r) heights[idx(width, x, y)] = z;
    }
  }
}

function markPad(
  locked: Uint8Array,
  width: number,
  height: number,
  cx: number,
  cy: number,
  r: number,
): void {
  for (let y = cy - r; y <= cy + r; y++) {
    for (let x = cx - r; x <= cx + r; x++) {
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      if (Math.hypot(x - cx, y - cy) <= r) locked[idx(width, x, y)] = 1;
    }
  }
}

function upsampleTiles(src: number[], sw: number, sh: number, sub: number): number[] {
  const width = sw * sub;
  const height = sh * sub;
  const out = new Array<number>(width * height);
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const v = src[y * sw + x] ?? 0;
      for (let dy = 0; dy < sub; dy++) {
        for (let dx = 0; dx < sub; dx++) {
          out[(y * sub + dy) * width + (x * sub + dx)] = v;
        }
      }
    }
  }
  return out;
}

function scaleSpawn(s: SpawnDef, sub: number): SpawnDef {
  const mid = Math.floor(sub / 2);
  return { ...s, x: s.x * sub + mid, y: s.y * sub + mid };
}

function inPad(pads: readonly { x: number; y: number; r: number }[], x: number, y: number): boolean {
  for (const p of pads) {
    if (Math.hypot(x - p.x, y - p.y) <= p.r) return true;
  }
  return false;
}

const WATER_ORTHO: readonly [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

function inHouseBox(
  houses: readonly { x0: number; y0: number; x1: number; y1: number }[],
  x: number,
  y: number,
): boolean {
  for (const h of houses) {
    if (x >= h.x0 && x <= h.x1 && y >= h.y0 && y <= h.y1) return true;
  }
  return false;
}

function houseBoxes(features: readonly MapFeature[], sub: number): { x0: number; y0: number; x1: number; y1: number }[] {
  return features.map((f) => {
    const def = catalog(f.type);
    const tw = Math.round(def.tileW / TILE_SUBDIV) * sub;
    const th = Math.round(def.tileH / TILE_SUBDIV) * sub;
    return { x0: f.x * sub, y0: f.y * sub, x1: f.x * sub + tw - 1, y1: f.y * sub + th - 1 };
  });
}

function canPaintWater(
  tiles: number[],
  width: number,
  height: number,
  x: number,
  y: number,
  pads: readonly { x: number; y: number; r: number }[],
  houses: readonly { x0: number; y0: number; x1: number; y1: number }[],
): boolean {
  if (x < 1 || y < 1 || x >= width - 1 || y >= height - 1) return false;
  if (inPad(pads, x, y)) return false;
  if (inHouseBox(houses, x, y)) return false;
  const t = tiles[idx(width, x, y)] ?? 1;
  return t === TILE_EMPTY || t === TILE_WATER;
}

/** Seeded metaball lake. Overlapping lobes + shoreline warp so ponds are not rectangles. */
function paintOrganicPond(
  tiles: number[],
  width: number,
  height: number,
  cx: number,
  cy: number,
  radius: number,
  rng: { n: number },
  pads: readonly { x: number; y: number; r: number }[],
  houses: readonly { x0: number; y0: number; x1: number; y1: number }[],
): number {
  const rad = Math.max(6, radius);
  const balls: { x: number; y: number; r: number }[] = [
    { x: cx, y: cy, r: rad * (0.88 + nextRand(rng) * 0.18) },
  ];
  const extra = 1 + Math.floor(nextRand(rng) * 2);
  for (let i = 0; i < extra; i++) {
    const ang = nextRand(rng) * Math.PI * 2;
    const dist = rad * (0.28 + nextRand(rng) * 0.5);
    balls.push({
      x: cx + Math.cos(ang) * dist,
      y: cy + Math.sin(ang) * dist,
      r: rad * (0.3 + nextRand(rng) * 0.38),
    });
  }
  const bites: { x: number; y: number; r: number }[] = [];
  const biteCount = 1 + Math.floor(nextRand(rng) * 2);
  for (let i = 0; i < biteCount; i++) {
    const ang = nextRand(rng) * Math.PI * 2;
    bites.push({
      x: cx + Math.cos(ang) * rad * (0.72 + nextRand(rng) * 0.28),
      y: cy + Math.sin(ang) * rad * (0.72 + nextRand(rng) * 0.28),
      r: rad * (0.28 + nextRand(rng) * 0.22),
    });
  }
  const warp = 0.9 + nextRand(rng) * 1.2;
  const p1 = nextRand(rng) * Math.PI * 2;
  const p2 = nextRand(rng) * Math.PI * 2;
  const p3 = nextRand(rng) * Math.PI * 2;
  const thresh = 1.02 + nextRand(rng) * 0.14;
  let minX = cx;
  let maxX = cx;
  let minY = cy;
  let maxY = cy;
  for (const b of balls) {
    minX = Math.min(minX, b.x - b.r);
    maxX = Math.max(maxX, b.x + b.r);
    minY = Math.min(minY, b.y - b.r);
    maxY = Math.max(maxY, b.y + b.r);
  }
  const pad = warp + 3;
  const x0 = Math.max(1, Math.floor(minX - pad));
  const x1 = Math.min(width - 2, Math.ceil(maxX + pad));
  const y0 = Math.max(1, Math.floor(minY - pad));
  const y1 = Math.min(height - 2, Math.ceil(maxY + pad));
  let painted = 0;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (!canPaintWater(tiles, width, height, x, y, pads, houses)) continue;
      const wx = x + 0.5 + warp * Math.sin((y + 0.5) * 0.21 + p1) + 0.55 * Math.sin((y + x) * 0.13 + p3);
      const wy = y + 0.5 + warp * Math.sin((x + 0.5) * 0.19 + p2);
      let field = 0;
      for (const b of balls) {
        const dx = wx - b.x;
        const dy = wy - b.y;
        field += (b.r * b.r) / (dx * dx + dy * dy + 0.7);
      }
      for (const b of bites) {
        const dx = wx - b.x;
        const dy = wy - b.y;
        field -= 0.9 * (b.r * b.r) / (dx * dx + dy * dy + 0.7);
      }
      const ang = Math.atan2(wy - cy, wx - cx);
      field *= 1 + 0.14 * Math.sin(2 * ang + p1) + 0.09 * Math.sin(3 * ang + p2) + 0.05 * Math.sin(5 * ang + p3);
      if (field < thresh) continue;
      const i = idx(width, x, y);
      if (tiles[i] !== TILE_WATER) {
        tiles[i] = TILE_WATER;
        painted += 1;
      }
    }
  }
  return painted;
}

function waterNeighbors(tiles: number[], width: number, height: number, x: number, y: number): number {
  let n = 0;
  for (const [dx, dy] of WATER_ORTHO) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
    if (tiles[idx(width, nx, ny)] === TILE_WATER) n += 1;
  }
  return n;
}

/** Nibble and grow the shoreline so coasts are not a smooth metaball. */
function nibbleWaterShore(
  tiles: number[],
  width: number,
  height: number,
  rng: { n: number },
  pads: readonly { x: number; y: number; r: number }[],
  houses: readonly { x0: number; y0: number; x1: number; y1: number }[],
): void {
  const expand: { x: number; y: number; n: number }[] = [];
  const recede: { x: number; y: number; n: number }[] = [];
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const t = tiles[idx(width, x, y)];
      const n = waterNeighbors(tiles, width, height, x, y);
      if (t === TILE_EMPTY && n > 0 && canPaintWater(tiles, width, height, x, y, pads, houses)) {
        expand.push({ x, y, n });
      } else if (t === TILE_WATER && n < 4) {
        recede.push({ x, y, n });
      }
    }
  }
  for (const c of expand) {
    const p = c.n >= 3 ? 0.48 : c.n === 2 ? 0.2 : 0.06;
    if (nextRand(rng) < p) tiles[idx(width, c.x, c.y)] = TILE_WATER;
  }
  for (const c of recede) {
    if (tiles[idx(width, c.x, c.y)] !== TILE_WATER) continue;
    const n = waterNeighbors(tiles, width, height, c.x, c.y);
    if (n < 2) continue;
    const p = n === 2 ? 0.26 : 0.08;
    if (nextRand(rng) < p) tiles[idx(width, c.x, c.y)] = TILE_EMPTY;
  }
}

/** Drop disconnected puddles left by shoreline nibble. */
function pruneWaterSpecks(tiles: number[], width: number, height: number, minSize = 18): void {
  const seen = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const start = idx(width, x, y);
      if (seen[start] || tiles[start] !== TILE_WATER) continue;
      const cells: { x: number; y: number }[] = [{ x, y }];
      seen[start] = 1;
      for (let i = 0; i < cells.length; i++) {
        const c = cells[i]!;
        for (const [dx, dy] of WATER_ORTHO) {
          const nx = c.x + dx;
          const ny = c.y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const ni = idx(width, nx, ny);
          if (seen[ni] || tiles[ni] !== TILE_WATER) continue;
          seen[ni] = 1;
          cells.push({ x: nx, y: ny });
        }
      }
      if (cells.length >= minSize) continue;
      for (const c of cells) tiles[idx(width, c.x, c.y)] = TILE_EMPTY;
    }
  }
}

/** Fill tiny land pockets fully enclosed by water. */
function fillWaterPockets(tiles: number[], width: number, height: number): void {
  const seen = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const start = idx(width, x, y);
      if (seen[start] || tiles[start] !== TILE_EMPTY) continue;
      const cells: { x: number; y: number }[] = [{ x, y }];
      seen[start] = 1;
      let enclosed = true;
      for (let i = 0; i < cells.length; i++) {
        const c = cells[i]!;
        for (const [dx, dy] of WATER_ORTHO) {
          const nx = c.x + dx;
          const ny = c.y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
            enclosed = false;
            continue;
          }
          const ni = idx(width, nx, ny);
          const t = tiles[ni];
          if (t === TILE_EMPTY) {
            if (!seen[ni]) {
              seen[ni] = 1;
              cells.push({ x: nx, y: ny });
            }
          } else if (t !== TILE_WATER) {
            enclosed = false;
          }
        }
      }
      if (!enclosed || cells.length > 22) continue;
      for (const c of cells) tiles[idx(width, c.x, c.y)] = TILE_WATER;
    }
  }
}

function paintYardPonds(
  tiles: number[],
  width: number,
  height: number,
  seed: string,
  spawnPads: readonly { x: number; y: number; r: number }[],
  features: readonly MapFeature[],
): void {
  const rng = { n: hash32(seed) };
  const sub = TILE_SUBDIV;
  const houses = houseBoxes(features, sub);
  for (let i = 0; i < tiles.length; i++) {
    if (tiles[i] === TILE_WATER) tiles[i] = TILE_EMPTY;
  }
  const ponds: readonly { cx: number; cy: number }[] = [
    { cx: 24, cy: 9.5 },
    { cx: 41, cy: 42.5 },
  ];
  for (const p of ponds) {
    const radius = (2.55 + nextRand(rng) * 0.7) * sub;
    const jx = (nextRand(rng) - 0.5) * 0.6 * sub;
    const jy = (nextRand(rng) - 0.5) * 0.6 * sub;
    paintOrganicPond(
      tiles,
      width,
      height,
      p.cx * sub + sub / 2 + jx,
      p.cy * sub + sub / 2 + jy,
      radius,
      rng,
      spawnPads,
      houses,
    );
  }
  nibbleWaterShore(tiles, width, height, rng, spawnPads, houses);
  fillWaterPockets(tiles, width, height);
  pruneWaterSpecks(tiles, width, height);
}

function rectFree(
  tiles: number[],
  width: number,
  height: number,
  x0: number,
  y0: number,
  tw: number,
  th: number,
): boolean {
  for (let y = y0; y < y0 + th; y++) {
    for (let x = x0; x < x0 + tw; x++) {
      if (x < 0 || y < 0 || x >= width || y >= height) return false;
      if ((tiles[idx(width, x, y)] ?? 1) !== TILE_EMPTY) return false;
    }
  }
  return true;
}

const TREE_DIRS: readonly [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [-1, 1],
  [1, -1],
  [-1, -1],
];

function canPlantTree(
  tiles: number[],
  width: number,
  height: number,
  x: number,
  y: number,
  pads: readonly { x: number; y: number; r: number }[],
): boolean {
  if (x < 1 || y < 1 || x >= width - 1 || y >= height - 1) return false;
  if (inPad(pads, x, y)) return false;
  return (tiles[idx(width, x, y)] ?? 1) === TILE_EMPTY;
}

function coarseTreeNeighbor(tiles: number[], width: number, height: number, x: number, y: number): boolean {
  for (const [dx, dy] of TREE_DIRS) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
    if (tiles[idx(width, nx, ny)] === TILE_TREE) return true;
  }
  return false;
}

/** Organic connected patch. Stays 8-connected so vehicles cannot slip through. */
function paintGrove(
  tiles: number[],
  width: number,
  height: number,
  cx: number,
  cy: number,
  cells: number,
  rng: { n: number },
  pads: readonly { x: number; y: number; r: number }[],
): number {
  let x = Math.round(cx);
  let y = Math.round(cy);
  let painted = 0;
  const cap = Math.max(3, cells);
  for (let step = 0; step < cap * 8 && painted < cap; step++) {
    if (canPlantTree(tiles, width, height, x, y, pads)) {
      tiles[idx(width, x, y)] = TILE_TREE;
      painted += 1;
    }
    const d = TREE_DIRS[Math.floor(nextRand(rng) * TREE_DIRS.length)]!;
    x += d[0];
    y += d[1];
    if (nextRand(rng) < 0.32) {
      x = Math.round(cx + (x - cx) * 0.35);
      y = Math.round(cy + (y - cy) * 0.35);
    }
  }
  return painted;
}

function paintClump(
  tiles: number[],
  width: number,
  height: number,
  x0: number,
  y0: number,
  extra: number,
  rng: { n: number },
  pads: readonly { x: number; y: number; r: number }[],
): number {
  if (!canPlantTree(tiles, width, height, x0, y0, pads)) return 0;
  tiles[idx(width, x0, y0)] = TILE_TREE;
  const painted: { x: number; y: number }[] = [{ x: x0, y: y0 }];
  for (let n = 0; n < extra; n++) {
    const seed = painted[Math.floor(nextRand(rng) * painted.length)]!;
    const d = TREE_DIRS[Math.floor(nextRand(rng) * 4)]!;
    const x = seed.x + d[0];
    const y = seed.y + d[1];
    if (!canPlantTree(tiles, width, height, x, y, pads)) continue;
    tiles[idx(width, x, y)] = TILE_TREE;
    painted.push({ x, y });
  }
  return painted.length;
}

function scatterTrees(
  tiles: number[],
  width: number,
  height: number,
  rng: { n: number },
  pads: readonly { x: number; y: number; r: number }[],
): void {
  const groves = 16 + Math.floor(nextRand(rng) * 8);
  for (let i = 0; i < groves; i++) {
    for (let attempt = 0; attempt < 28; attempt++) {
      const cx = 5 + nextRand(rng) * (width - 10);
      const cy = 5 + nextRand(rng) * (height - 10);
      if (inPad(pads, cx, cy)) continue;
      const cells = 6 + Math.floor(nextRand(rng) * 16);
      if (paintGrove(tiles, width, height, cx, cy, cells, rng, pads) > 0) break;
    }
  }
  const clumps = 18 + Math.floor(nextRand(rng) * 10);
  for (let i = 0; i < clumps; i++) {
    for (let attempt = 0; attempt < 24; attempt++) {
      const x = 2 + Math.floor(nextRand(rng) * (width - 4));
      const y = 2 + Math.floor(nextRand(rng) * (height - 4));
      const extra = 1 + Math.floor(nextRand(rng) * 4);
      if (paintClump(tiles, width, height, x, y, extra, rng, pads) >= 2) break;
    }
  }
  const singles = 110 + Math.floor(nextRand(rng) * 50);
  for (let i = 0; i < singles; i++) {
    for (let attempt = 0; attempt < 40; attempt++) {
      const x = 2 + Math.floor(nextRand(rng) * (width - 4));
      const y = 2 + Math.floor(nextRand(rng) * (height - 4));
      if (!canPlantTree(tiles, width, height, x, y, pads)) continue;
      if (coarseTreeNeighbor(tiles, width, height, x, y)) continue;
      tiles[idx(width, x, y)] = TILE_TREE;
      break;
    }
  }
}

/**
 * One isolated authoring cell upsamples into a 4×4 cube. Keep a single stem
 * so lone trees read as trees, not hedges.
 */
function thinIsolatedTrees(
  fine: number[],
  fineW: number,
  fineH: number,
  coarse: number[],
  cw: number,
  ch: number,
  sub: number,
): void {
  for (let cy = 0; cy < ch; cy++) {
    for (let cx = 0; cx < cw; cx++) {
      if (coarse[idx(cw, cx, cy)] !== TILE_TREE) continue;
      if (coarseTreeNeighbor(coarse, cw, ch, cx, cy)) continue;
      const h = hash32(`${cx}:${cy}:tree`);
      const lx = h % sub;
      const ly = (h >>> 8) % sub;
      for (let dy = 0; dy < sub; dy++) {
        for (let dx = 0; dx < sub; dx++) {
          const x = cx * sub + dx;
          const y = cy * sub + dy;
          if (x < 0 || y < 0 || x >= fineW || y >= fineH) continue;
          fine[y * fineW + x] = dx === lx && dy === ly ? TILE_TREE : TILE_EMPTY;
        }
      }
    }
  }
}

function flattenTerrain(
  heights: number[],
  tiles: number[],
  width: number,
  height: number,
  kind: number,
  locked?: Uint8Array,
): void {
  for (let i = 0; i < tiles.length; i++) {
    if (tiles[i] === kind) heights[i] = 0;
  }
  relaxSlopes(heights, width, height, locked);
}

/** Trees, ponds, and civilian houses. Authoring-grid coords; caller upsamples tiles. */
function scatterCover(
  tiles: number[],
  width: number,
  height: number,
  seed: string,
  pads: readonly { x: number; y: number; r: number }[],
): MapFeature[] {
  const rng = { n: hash32(seed) };
  scatterTrees(tiles, width, height, rng, pads);
  const kinds: CivilianType[] = [
    "shack",
    "shack",
    "cottage",
    "cottage",
    "cottage",
    "house",
    "house",
    "inn",
    "barn",
    "barn",
    "chapel",
    "manor",
    "shack",
    "inn",
    "cottage",
    "chapel",
  ];
  const features: MapFeature[] = [];
  for (const type of kinds) {
    const def = catalog(type);
    const tw = Math.round(def.tileW / TILE_SUBDIV);
    const th = Math.round(def.tileH / TILE_SUBDIV);
    for (let attempt = 0; attempt < 80; attempt++) {
      const x = 2 + Math.floor(nextRand(rng) * (width - tw - 4));
      const y = 2 + Math.floor(nextRand(rng) * (height - th - 4));
      if (inPad(pads, x + tw / 2, y + th / 2)) continue;
      if (!rectFree(tiles, width, height, x, y, tw, th)) continue;
      features.push({ type, x, y, facing: hash32(`${type}:${x}:${y}:face`) % 4 });
      fillRect(tiles, width, height, x, y, x + tw - 1, y + th - 1, TILE_EMPTY);
      for (let yy = y; yy < y + th; yy++) {
        for (let xx = x; xx < x + tw; xx++) {
          tiles[idx(width, xx, yy)] = TILE_BLOCKED;
        }
      }
      break;
    }
  }
  for (const f of features) {
    const def = catalog(f.type);
    const tw = Math.round(def.tileW / TILE_SUBDIV);
    const th = Math.round(def.tileH / TILE_SUBDIV);
    fillRect(tiles, width, height, f.x, f.y, f.x + tw - 1, f.y + th - 1, TILE_EMPTY);
  }
  return features;
}

function scaleFeatures(features: MapFeature[], sub: number): MapFeature[] {
  return features.map((f) => ({ type: f.type, x: f.x * sub, y: f.y * sub, facing: f.facing }));
}

/** Seeded rolling hills and valleys. Spawns stay on the base; slopes never cliff. */
export function scatterHeights(
  width: number,
  height: number,
  seed: string,
  pads: readonly { x: number; y: number; r: number }[],
  locked?: Uint8Array,
): number[] {
  const heights = new Array(width * height).fill(HEIGHT_BASE);
  const rng = { n: hash32(seed) };
  paintRolling(heights, width, height, `${seed}:roll`);
  const riseMax = HEIGHT_MAX - HEIGHT_BASE;
  const hillSpots: readonly [number, number][] = [
    [width * 0.3, height * 0.28],
    [width * 0.7, height * 0.3],
    [width * 0.32, height * 0.7],
    [width * 0.68, height * 0.72],
    [width * 0.5, height * 0.48],
  ];
  const valleySpots: readonly [number, number][] = [
    [width * 0.5, height * 0.2],
    [width * 0.2, height * 0.5],
    [width * 0.8, height * 0.52],
    [width * 0.48, height * 0.8],
    [width * 0.4, height * 0.42],
  ];
  for (const [qx, qy] of hillSpots) {
    const cx = qx + (nextRand(rng) - 0.5) * 8 * TILE_SUBDIV;
    const cy = qy + (nextRand(rng) - 0.5) * 8 * TILE_SUBDIV;
    const rise = Math.max(4, Math.round(riseMax * (0.55 + nextRand(rng) * 0.45)));
    const rad = rise * (1.25 + nextRand(rng) * 0.7);
    const stretch = 0.75 + nextRand(rng) * 0.55;
    splatDelta(heights, width, height, cx, cy, rad * stretch, rad / stretch, rise);
  }
  for (const [qx, qy] of valleySpots) {
    const cx = qx + (nextRand(rng) - 0.5) * 8 * TILE_SUBDIV;
    const cy = qy + (nextRand(rng) - 0.5) * 8 * TILE_SUBDIV;
    const depth = Math.max(3, Math.round(HEIGHT_BASE * (0.55 + nextRand(rng) * 0.45)));
    const rad = depth * (1.35 + nextRand(rng) * 0.8);
    const stretch = 0.7 + nextRand(rng) * 0.6;
    splatDelta(heights, width, height, cx, cy, rad * stretch, rad / stretch, -depth);
  }
  const extra = 8 + Math.floor(nextRand(rng) * 6);
  for (let i = 0; i < extra; i++) {
    const cx = 6 * TILE_SUBDIV + nextRand(rng) * (width - 12 * TILE_SUBDIV);
    const cy = 6 * TILE_SUBDIV + nextRand(rng) * (height - 12 * TILE_SUBDIV);
    const valley = nextRand(rng) < 0.4;
    const mag = valley
      ? -(2 + Math.floor(nextRand(rng) * (HEIGHT_BASE - 1)))
      : 2 + Math.floor(nextRand(rng) * riseMax);
    const rad = Math.abs(mag) * (1.2 + nextRand(rng) * 0.9);
    const stretch = 0.7 + nextRand(rng) * 0.7;
    splatDelta(heights, width, height, cx, cy, rad * stretch, rad / stretch, mag);
  }
  const lock = locked ?? new Uint8Array(width * height);
  for (const p of pads) {
    flattenPad(heights, width, height, p.x, p.y, p.r, HEIGHT_BASE);
    markPad(lock, width, height, p.x, p.y, p.r);
  }
  relaxSlopes(heights, width, height, lock);
  return heights;
}

function paintLane(
  tiles: number[],
  width: number,
  height: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  radius: number,
  houses: readonly { x0: number; y0: number; x1: number; y1: number }[],
): void {
  const steps = Math.max(1, Math.abs(x1 - x0), Math.abs(y1 - y0));
  const r2 = radius * radius + 0.25;
  for (let i = 0; i <= steps; i++) {
    const x = Math.round(x0 + ((x1 - x0) * i) / steps);
    const y = Math.round(y0 + ((y1 - y0) * i) / steps);
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy > r2) continue;
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 1 || yy < 1 || xx >= width - 1 || yy >= height - 1) continue;
        if (inHouseBox(houses, xx, yy)) continue;
        const k = idx(width, xx, yy);
        const t = tiles[k];
        if (t === TILE_WATER || t === TILE_SCRAP || t === TILE_BLOCKED || t === TILE_FENCE) continue;
        tiles[k] = TILE_ROAD;
      }
    }
  }
}

function paintFenceLine(
  tiles: number[],
  width: number,
  height: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  spawns: readonly { x: number; y: number }[],
  houses: readonly { x0: number; y0: number; x1: number; y1: number }[],
): void {
  const steps = Math.max(1, Math.abs(x1 - x0), Math.abs(y1 - y0));
  const clear = 22 * 22;
  for (let i = 0; i <= steps; i++) {
    const x = Math.round(x0 + ((x1 - x0) * i) / steps);
    const y = Math.round(y0 + ((y1 - y0) * i) / steps);
    if (x < 1 || y < 1 || x >= width - 1 || y >= height - 1) continue;
    if (inHouseBox(houses, x, y)) continue;
    let close = false;
    for (const s of spawns) {
      if ((x - s.x) * (x - s.x) + (y - s.y) * (y - s.y) <= clear) {
        close = true;
        break;
      }
    }
    if (close) continue;
    const k = idx(width, x, y);
    if (tiles[k] !== TILE_EMPTY) continue;
    tiles[k] = TILE_FENCE;
  }
}

/** Dirt lanes from each start into a cross, then field hedges with road gates. */
function paintYardDress(
  tiles: number[],
  width: number,
  height: number,
  spawns: readonly { x: number; y: number }[],
  features: readonly MapFeature[],
): void {
  const houses = houseBoxes(features, TILE_SUBDIV);
  const midX = Math.floor(width / 2);
  const midY = Math.floor(height / 2);
  const margin = 18;
  paintLane(tiles, width, height, margin, midY, width - 1 - margin, midY, 2, houses);
  paintLane(tiles, width, height, midX, margin, midX, height - 1 - margin, 2, houses);
  for (const s of spawns) {
    paintLane(tiles, width, height, s.x, s.y, midX, midY, 2, houses);
  }
  const line = (x0: number, y0: number, x1: number, y1: number) =>
    paintFenceLine(tiles, width, height, x0, y0, x1, y1, spawns, houses);
  const x0 = Math.floor(width * 0.4);
  const x1 = Math.floor(width * 0.6);
  const y0 = Math.floor(height * 0.4);
  const y1 = Math.floor(height * 0.6);
  line(x0, y0, x1, y0);
  line(x0, y1, x1, y1);
  line(x0, y0, x0, y1);
  line(x1, y0, x1, y1);
  const left = Math.floor(width * 0.18);
  const right = Math.floor(width * 0.82);
  const top = Math.floor(height * 0.18);
  const bot = Math.floor(height * 0.82);
  line(left, top, right, top);
  line(left, bot, right, bot);
  line(left, top, left, bot);
  line(right, top, right, bot);
  line(left, Math.floor(height * 0.32), Math.floor(width * 0.36), Math.floor(height * 0.32));
  line(Math.floor(width * 0.64), Math.floor(height * 0.68), right, Math.floor(height * 0.68));
}

/** 64×64 yard with a central compound and 8 edge/corner spawns. */
export function makeYard64(): MapDef {
  const width = 64;
  const height = 64;
  const tiles = new Array(width * height).fill(TILE_EMPTY);

  fillRect(tiles, width, height, 21, 7, 27, 12, TILE_WATER);
  fillRect(tiles, width, height, 38, 40, 44, 45, TILE_WATER);

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
  const pads = spawns.map((s) => ({ x: s.x, y: s.y, r: 4 }));
  const features = scatterCover(tiles, width, height, "yard-64-cover", pads);
  const sub = TILE_SUBDIV;
  const fineTiles = upsampleTiles(tiles, width, height, sub);
  const fineW = width * sub;
  const fineH = height * sub;
  thinIsolatedTrees(fineTiles, fineW, fineH, tiles, width, height, sub);
  const fineSpawns = spawns.map((s) => scaleSpawn(s, sub));
  const fineSpawnPads = fineSpawns.map((s) => ({ x: s.x, y: s.y, r: 4 * sub }));
  paintYardPonds(fineTiles, fineW, fineH, "yard-64-ponds", fineSpawnPads, features);
  paintYardDress(fineTiles, fineW, fineH, fineSpawns, features);
  const locked = new Uint8Array(fineW * fineH);
  const heights = scatterHeights(fineW, fineH, "yard-64-elev", fineSpawnPads, locked);
  flattenTerrain(heights, fineTiles, fineW, fineH, TILE_WATER, locked);

  return {
    id: "yard-64",
    name: "Scrap Yard",
    width: fineW,
    height: fineH,
    tileSize: TILE_SIZE,
    tiles: fineTiles,
    heights,
    maxHeight: peakHeight(heights),
    spawns: fineSpawns,
    features: scaleFeatures(features, sub),
  };
}

export const MAPS: Record<string, MapDef> = {
  "yard-64": makeYard64(),
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

function peakHeight(heights: readonly number[]): number {
  let m = 0;
  for (const h of heights) {
    if (h > m) m = h;
  }
  return m;
}

export function maxHeightOf(map: MapDef): number {
  return map.maxHeight;
}
