import {
  BUILD_RADIUS,
  CUSTOM_MAP_MAX_LAMPS,
  HEIGHT_BASE,
  HEIGHT_MAX,
  SPAWN_EDGE_MARGIN,
  SPAWN_MIN_GAP,
  SPAWN_PAD_R,
  TILE_EMPTY,
  TILE_ROAD,
  TILE_SIZE,
  TILE_SUBDIV,
  TILE_WATER,
  catalog,
  decodeRuns,
  encodeRuns,
  featureBox,
  featureOnPad,
  featuresOverlap,
  isMapSection,
  isScrapTile,
  lampBlocked,
  MAP_DEFENCE_TYPES,
  normalizeTerrain,
  peakHeight,
  PLAYTEST_MAP_PREFIX,
  rollHeights,
  validateCustomMap,
  type CustomMapSpec,
  type MapDef,
  type MapFeature,
  type MapFeatureType,
  type LampType,
  type MapLamp,
} from "@gridlock/shared";

/** The map being edited. Grids are plain fine-tile arrays, already playable after `settle`. */
export interface Sheet {
  id: string;
  name: string;
  author: string;
  width: number;
  height: number;
  maxPlayers: number;
  tiles: number[];
  heights: number[];
  spawns: { id: number; x: number; y: number }[];
  features: MapFeature[];
  lamps: MapLamp[];
}

/** Ground a start pad clears. Roads may run through it. */
const PAD_CLEARS = (t: number): boolean => t !== TILE_EMPTY && t !== TILE_ROAD;

export function newSheet(opts: {
  id: string;
  name: string;
  author: string;
  cells: number;
  maxPlayers: number;
  hills: boolean;
  seed: string;
}): Sheet {
  const side = opts.cells * TILE_SUBDIV;
  const n = side * side;
  const sheet: Sheet = {
    id: opts.id,
    name: opts.name,
    author: opts.author,
    width: side,
    height: side,
    maxPlayers: opts.maxPlayers,
    tiles: new Array<number>(n).fill(TILE_EMPTY),
    heights: opts.hills ? rollHeights(side, side, opts.seed, []) : new Array<number>(n).fill(HEIGHT_BASE),
    spawns: [],
    features: [],
    lamps: [],
  };
  settle(sheet);
  return sheet;
}

export function sheetFromSpec(spec: CustomMapSpec): Sheet {
  const n = spec.width * spec.height;
  const sheet: Sheet = {
    id: spec.id,
    name: spec.name,
    author: spec.author,
    width: spec.width,
    height: spec.height,
    maxPlayers: spec.maxPlayers,
    tiles: decodeRuns(spec.tiles, n) ?? new Array<number>(n).fill(TILE_EMPTY),
    heights: decodeRuns(spec.heights, n) ?? new Array<number>(n).fill(HEIGHT_BASE),
    spawns: spec.spawns.map((s) => ({ ...s })),
    features: spec.features.map((f) => ({ ...f })),
    lamps: (spec.lamps ?? []).map((l) => ({ ...l })),
  };
  settle(sheet);
  return sheet;
}

export function sheetToSpec(s: Sheet): CustomMapSpec {
  return {
    id: s.id,
    name: s.name,
    author: s.author,
    width: s.width,
    height: s.height,
    maxPlayers: s.maxPlayers,
    tiles: encodeRuns(s.tiles),
    heights: encodeRuns(s.heights),
    spawns: s.spawns.map((sp) => ({ ...sp })).sort((a, b) => a.id - b.id),
    features: s.features.map((f) => ({ ...f })),
    ...(s.lamps.length > 0 ? { lamps: liveLamps(s) } : {}),
    updatedAt: 0,
  };
}

/** Render-ready map of the sheet as it stands. Not registered: previews only. */
export function sheetToMap(s: Sheet, id = "__builder__"): MapDef {
  return {
    id,
    name: s.name,
    width: s.width,
    height: s.height,
    tileSize: TILE_SIZE,
    tiles: s.tiles.slice(),
    heights: s.heights.slice(),
    maxHeight: peakHeight(s.heights),
    spawns: s.spawns.map((sp) => ({ ...sp })),
    features: s.features.map((f) => ({ ...f })),
    lamps: liveLamps(s),
  };
}

/** Lamps still standing: a building set down over a post hides it, and the save leaves it out. */
export function liveLamps(s: Sheet): MapLamp[] {
  return s.lamps.filter((l) => !lampBlocked(s.features, l.x, l.y)).map((l) => ({ ...l }));
}

/** Index of the lamp within `reach` fine tiles of the cursor, nearest first, or -1. */
export function lampIndexAt(s: Sheet, tx: number, ty: number, reach = 1): number {
  let best = -1;
  let bestD = reach + 0.01;
  s.lamps.forEach((l, i) => {
    const d = Math.max(Math.abs(l.x - tx), Math.abs(l.y - ty));
    if (d < bestD) {
      best = i;
      bestD = d;
    }
  });
  return best;
}

/** Why a lamp cannot stand on this fine tile, or null. */
export function lampProblem(s: Sheet, x: number, y: number): string | null {
  if (x < 0 || y < 0 || x >= s.width || y >= s.height) return "Off the map.";
  if (s.tiles[y * s.width + x] === TILE_WATER) return "Lamps stand on dry ground.";
  if (lampBlocked(s.features, x, y)) return "Inside a building lot.";
  if (s.lamps.some((l) => Math.max(Math.abs(l.x - x), Math.abs(l.y - y)) < 2)) return "Too close to another lamp.";
  if (s.lamps.length >= CUSTOM_MAP_MAX_LAMPS) return `At most ${CUSTOM_MAP_MAX_LAMPS} lamps.`;
  return null;
}

/** Stand a lamp of `type` on the tile. Null when placed, else the reason. */
export function placeLamp(s: Sheet, type: LampType, x: number, y: number): string | null {
  const problem = lampProblem(s, x, y);
  if (problem) return problem;
  s.lamps.push({ type, x, y });
  return null;
}

/** Same pass a saved map gets: pads, house lots, water floor, one-step slopes. */
export function settle(s: Sheet): void {
  normalizeTerrain(s.tiles, s.heights, s.width, s.height, s.spawns, s.features);
}

function inBounds(s: Sheet, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < s.width && y < s.height;
}

/** Fine tiles a brush touched, x0/y0 inclusive, x1/y1 exclusive. Empty while x1 <= x0. */
export interface Dirty {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export function emptyDirty(): Dirty {
  return { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
}

function touch(d: Dirty | undefined, x: number, y: number): void {
  if (!d) return;
  if (x < d.x0) d.x0 = x;
  if (y < d.y0) d.y0 = y;
  if (x + 1 > d.x1) d.x1 = x + 1;
  if (y + 1 > d.y1) d.y1 = y + 1;
}

/** Cells of a disk that lie on the sheet. The centre may sit off the edge: the part on the map still counts. */
function diskCells(s: Sheet, cx: number, cy: number, r: number): number[] {
  const out: number[] = [];
  const ri = Math.ceil(r);
  for (let y = Math.max(0, cy - ri); y <= Math.min(s.height - 1, cy + ri); y++) {
    for (let x = Math.max(0, cx - ri); x <= Math.min(s.width - 1, cx + ri); x++) {
      if (Math.hypot(x - cx, y - cy) > r + 0.25) continue;
      out.push(y * s.width + x);
    }
  }
  return out;
}

/** True when a brush of radius `r` at (cx, cy) reaches any tile of the sheet. */
export function diskTouches(s: Sheet, cx: number, cy: number, r: number): boolean {
  const nx = Math.max(0, Math.min(s.width - 1, cx));
  const ny = Math.max(0, Math.min(s.height - 1, cy));
  return Math.hypot(nx - cx, ny - cy) <= r + 0.25;
}

/** Paint ground in a disk. Houses keep their lots; start pads only take roads. Returns changed cells. */
export function paintDisk(s: Sheet, cx: number, cy: number, r: number, tile: number, dirty?: Dirty): number {
  const ri = Math.ceil(r);
  // Only lots and pads near the brush can refuse a tile.
  const lots = s.features
    .map((f) => featureBox(f))
    .filter((b) => b.x1 > cx - ri && b.x0 <= cx + ri && b.y1 > cy - ri && b.y0 <= cy + ri);
  const pads = PAD_CLEARS(tile) ? s.spawns.filter((sp) => Math.hypot(sp.x - cx, sp.y - cy) <= SPAWN_PAD_R + ri + 1) : [];
  let changed = 0;
  for (const i of diskCells(s, cx, cy, r)) {
    const x = i % s.width;
    const y = (i / s.width) | 0;
    if (s.tiles[i] === tile) continue;
    if (lots.some((b) => x >= b.x0 && x < b.x1 && y >= b.y0 && y < b.y1)) continue;
    if (pads.some((sp) => Math.hypot(sp.x - x, sp.y - y) <= SPAWN_PAD_R)) continue;
    s.tiles[i] = tile;
    if (tile === TILE_WATER) s.heights[i] = 0;
    touch(dirty, x, y);
    changed++;
  }
  return changed;
}

/**
 * Hold the brushed cells and walk outward so every neighbour sits within one
 * step: a raise pulls the ground around it up into a ramp, a cut drags it down.
 * Water stays on the floor.
 */
function ripple(s: Sheet, seeds: readonly number[], dirty?: Dirty): void {
  // A set, not a whole-sheet mask: a dab runs on every pointer move, and big sheets are millions of tiles.
  const held = new Set(seeds);
  const q = seeds.slice();
  for (let qi = 0; qi < q.length; qi++) {
    const i = q[qi]!;
    const x = i % s.width;
    const y = (i / s.width) | 0;
    touch(dirty, x, y);
    const h = s.heights[i]!;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (!inBounds(s, nx, ny)) continue;
        const ni = ny * s.width + nx;
        if (held.has(ni) || s.tiles[ni] === TILE_WATER) continue;
        const nh = s.heights[ni]!;
        if (nh > h + 1) s.heights[ni] = h + 1;
        else if (nh < h - 1) s.heights[ni] = h - 1;
        else continue;
        q.push(ni);
      }
    }
  }
}

/** Raise (+1) or cut (-1) the ground in a disk by one step. */
export function liftDisk(s: Sheet, cx: number, cy: number, r: number, delta: 1 | -1, dirty?: Dirty): number {
  const seeds: number[] = [];
  for (const i of diskCells(s, cx, cy, r)) {
    if (s.tiles[i] === TILE_WATER) continue;
    const next = Math.max(0, Math.min(HEIGHT_MAX, s.heights[i]! + delta));
    if (next === s.heights[i]) continue;
    s.heights[i] = next;
    seeds.push(i);
  }
  ripple(s, seeds, dirty);
  return seeds.length;
}

/** Set a disk to elevation `z`, ramping the ground around it. */
export function levelDisk(s: Sheet, cx: number, cy: number, r: number, z: number, dirty?: Dirty): number {
  const level = Math.max(0, Math.min(HEIGHT_MAX, Math.round(z)));
  const seeds: number[] = [];
  for (const i of diskCells(s, cx, cy, r)) {
    if (s.tiles[i] === TILE_WATER || s.heights[i] === level) continue;
    s.heights[i] = level;
    seeds.push(i);
  }
  ripple(s, seeds, dirty);
  return seeds.length;
}

/**
 * A feature of `type` centred on the cursor tile. A house, bunker, or tower
 * snaps to the cell grid; a sandbag or wall section sits on the tile itself.
 */
export function houseAt(type: MapFeatureType, tx: number, ty: number, facing: number): MapFeature {
  if (isMapSection(type)) return { type, x: tx, y: ty, facing: facing & 3 };
  const def = catalog(type);
  const snap = (v: number, span: number): number => Math.round((v - span / 2) / TILE_SUBDIV) * TILE_SUBDIV;
  return { type, x: snap(tx, def.tileW), y: snap(ty, def.tileH), facing: facing & 3 };
}

/** Why `f` cannot stand where it is. `ignore` is the index of a feature being moved, which does not block itself. */
export function houseProblem(s: Sheet, f: MapFeature, ignore = -1): string | null {
  const b = featureBox(f);
  if (b.x0 < 0 || b.y0 < 0 || b.x1 > s.width || b.y1 > s.height) return "Off the map.";
  if (s.features.some((o, i) => i !== ignore && featuresOverlap(o, f))) return "Overlaps another building.";
  if (featureOnPad(f, s.spawns)) return "Too close to a start position.";
  return null;
}

/**
 * Set a placed feature down `dx`, `dy` fine tiles from where it stood at
 * `from`. A lot keeps to the cell grid. Null when it moved, else the reason.
 */
export function moveFeature(s: Sheet, index: number, from: MapFeature, dx: number, dy: number): string | null {
  if (!s.features[index]) return "Nothing selected.";
  const step = isMapSection(from.type) ? 1 : TILE_SUBDIV;
  const next = { ...from, x: from.x + Math.round(dx / step) * step, y: from.y + Math.round(dy / step) * step };
  const problem = houseProblem(s, next, index);
  if (problem) return problem;
  s.features[index] = next;
  return null;
}

/** Turn a placed feature a quarter in place. Null when the turned shape fits. */
export function turnFeature(s: Sheet, index: number): string | null {
  const f = s.features[index];
  if (!f) return "Nothing selected.";
  const next = { ...f, facing: (f.facing + 1) & 3 };
  const problem = houseProblem(s, next, index);
  if (problem) return problem;
  s.features[index] = next;
  return null;
}

/** Defence count: the bunkers, towers, sandbags, and walls on the sheet. Everything else is a house. */
export function defenceCount(s: Sheet): number {
  return s.features.filter((f) => (MAP_DEFENCE_TYPES as readonly string[]).includes(f.type)).length;
}

export function featureIndexAt(s: Sheet, tx: number, ty: number): number {
  return s.features.findIndex((f) => {
    const b = featureBox(f);
    return tx >= b.x0 && tx < b.x1 && ty >= b.y0 && ty < b.y1;
  });
}

export function spawnIndexAt(s: Sheet, tx: number, ty: number, reach = 2 * TILE_SUBDIV): number {
  let best = -1;
  let bestD = reach;
  s.spawns.forEach((sp, i) => {
    const d = Math.hypot(sp.x - tx, sp.y - ty);
    if (d <= bestD) {
      best = i;
      bestD = d;
    }
  });
  return best;
}

export function nextSpawnId(s: Sheet): number | null {
  for (let id = 1; id <= s.maxPlayers; id++) {
    if (!s.spawns.some((sp) => sp.id === id)) return id;
  }
  return null;
}

export function spawnProblem(s: Sheet, x: number, y: number, ignoreId = 0): string | null {
  const m = SPAWN_EDGE_MARGIN;
  if (x < m || y < m || x >= s.width - m || y >= s.height - m) return "Too close to the edge.";
  for (const sp of s.spawns) {
    if (sp.id === ignoreId) continue;
    if (Math.hypot(sp.x - x, sp.y - y) < SPAWN_MIN_GAP) return `Too close to start ${sp.id}.`;
  }
  return null;
}

/** Houses on a start's pad give way to the start. */
export function clearPadHouses(s: Sheet): number {
  const before = s.features.length;
  s.features = s.features.filter((f) => !featureOnPad(f, s.spawns));
  return before - s.features.length;
}

/** Change the seat count. Starts numbered above it are removed; returns how many. */
export function setMaxPlayers(s: Sheet, n: number): number {
  s.maxPlayers = n;
  const before = s.spawns.length;
  s.spawns = s.spawns.filter((sp) => sp.id <= n);
  return before - s.spawns.length;
}

/** What still stops a save, or null when it would go through. */
export function sheetProblem(s: Sheet): string | null {
  const r = validateCustomMap(sheetToSpec(s));
  return r.ok ? null : r.message;
}

/** The sheet as a play-test map under `id`. One start is enough. */
export function playtestSpec(s: Sheet, id: string): CustomMapSpec {
  return { ...sheetToSpec(s), id, name: s.name.trim() || "Play test" };
}

/** What stops a play test, or null when the sheet can be played as it stands. */
export function playtestProblem(s: Sheet): string | null {
  const r = validateCustomMap(playtestSpec(s, `${PLAYTEST_MAP_PREFIX}check`), { playtest: true });
  return r.ok ? null : r.message;
}

export function scrapCells(s: Sheet): number {
  let n = 0;
  for (const t of s.tiles) if (isScrapTile(t)) n++;
  return n;
}

/** Cells from a start within which a scrap field is in the yard's build range once the Rig unpacks. */
const HOME_SCRAP_CELLS = BUILD_RADIUS / TILE_SUBDIV + 2;

/** Start numbers with no scrap cell near enough for the yard to place a Smelter. */
export function startsFarFromScrap(s: Sheet): number[] {
  const out: number[] = [];
  for (const sp of s.spawns) {
    let near = false;
    for (let y = Math.max(0, sp.y - HOME_SCRAP_CELLS); y <= Math.min(s.height - 1, sp.y + HOME_SCRAP_CELLS) && !near; y++) {
      for (let x = Math.max(0, sp.x - HOME_SCRAP_CELLS); x <= Math.min(s.width - 1, sp.x + HOME_SCRAP_CELLS); x++) {
        if (isScrapTile(s.tiles[y * s.width + x]) && Math.hypot(x - sp.x, y - sp.y) <= HOME_SCRAP_CELLS) {
          near = true;
          break;
        }
      }
    }
    if (!near) out.push(sp.id);
  }
  return out.sort((a, b) => a - b);
}

/** Compact copy for undo. */
export interface SheetMark {
  tiles: Uint8Array;
  heights: Uint8Array;
  spawns: Sheet["spawns"];
  features: MapFeature[];
  lamps: MapLamp[];
  maxPlayers: number;
}

export function markSheet(s: Sheet): SheetMark {
  return {
    tiles: Uint8Array.from(s.tiles),
    heights: Uint8Array.from(s.heights),
    spawns: s.spawns.map((sp) => ({ ...sp })),
    features: s.features.map((f) => ({ ...f })),
    lamps: s.lamps.map((l) => ({ ...l })),
    maxPlayers: s.maxPlayers,
  };
}

export function restoreSheet(s: Sheet, m: SheetMark): void {
  s.tiles = Array.from(m.tiles);
  s.heights = Array.from(m.heights);
  s.spawns = m.spawns.map((sp) => ({ ...sp }));
  s.features = m.features.map((f) => ({ ...f }));
  s.lamps = m.lamps.map((l) => ({ ...l }));
  s.maxPlayers = m.maxPlayers;
}
