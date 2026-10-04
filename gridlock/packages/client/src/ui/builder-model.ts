import {
  BUILD_RADIUS,
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
  };
}

/** Same pass a saved map gets: pads, house lots, water floor, one-step slopes. */
export function settle(s: Sheet): void {
  normalizeTerrain(s.tiles, s.heights, s.width, s.height, s.spawns, s.features);
}

function inBounds(s: Sheet, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < s.width && y < s.height;
}

function diskCells(s: Sheet, cx: number, cy: number, r: number): number[] {
  const out: number[] = [];
  const ri = Math.ceil(r);
  for (let y = cy - ri; y <= cy + ri; y++) {
    for (let x = cx - ri; x <= cx + ri; x++) {
      if (!inBounds(s, x, y) || Math.hypot(x - cx, y - cy) > r + 0.25) continue;
      out.push(y * s.width + x);
    }
  }
  return out;
}

function underHouse(s: Sheet, x: number, y: number): boolean {
  return s.features.some((f) => {
    const b = featureBox(f);
    return x >= b.x0 && x < b.x1 && y >= b.y0 && y < b.y1;
  });
}

function onPad(s: Sheet, x: number, y: number): boolean {
  return s.spawns.some((sp) => Math.hypot(sp.x - x, sp.y - y) <= SPAWN_PAD_R);
}

/** Paint ground in a disk. Houses keep their lots; start pads only take roads. Returns changed cells. */
export function paintDisk(s: Sheet, cx: number, cy: number, r: number, tile: number): number {
  let changed = 0;
  for (const i of diskCells(s, cx, cy, r)) {
    const x = i % s.width;
    const y = (i / s.width) | 0;
    if (s.tiles[i] === tile || underHouse(s, x, y)) continue;
    if (PAD_CLEARS(tile) && onPad(s, x, y)) continue;
    s.tiles[i] = tile;
    if (tile === TILE_WATER) s.heights[i] = 0;
    changed++;
  }
  return changed;
}

/**
 * Hold the brushed cells and walk outward so every neighbour sits within one
 * step: a raise pulls the ground around it up into a ramp, a cut drags it down.
 * Water stays on the floor.
 */
function ripple(s: Sheet, seeds: readonly number[]): void {
  const held = new Uint8Array(s.width * s.height);
  for (const i of seeds) held[i] = 1;
  const q = seeds.slice();
  for (let qi = 0; qi < q.length; qi++) {
    const i = q[qi]!;
    const x = i % s.width;
    const y = (i / s.width) | 0;
    const h = s.heights[i]!;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (!inBounds(s, nx, ny)) continue;
        const ni = ny * s.width + nx;
        if (held[ni] || s.tiles[ni] === TILE_WATER) continue;
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
export function liftDisk(s: Sheet, cx: number, cy: number, r: number, delta: 1 | -1): number {
  const seeds: number[] = [];
  for (const i of diskCells(s, cx, cy, r)) {
    if (s.tiles[i] === TILE_WATER) continue;
    const next = Math.max(0, Math.min(HEIGHT_MAX, s.heights[i]! + delta));
    if (next === s.heights[i]) continue;
    s.heights[i] = next;
    seeds.push(i);
  }
  ripple(s, seeds);
  return seeds.length;
}

/** Set a disk to elevation `z`, ramping the ground around it. */
export function levelDisk(s: Sheet, cx: number, cy: number, r: number, z: number): number {
  const level = Math.max(0, Math.min(HEIGHT_MAX, Math.round(z)));
  const seeds: number[] = [];
  for (const i of diskCells(s, cx, cy, r)) {
    if (s.tiles[i] === TILE_WATER || s.heights[i] === level) continue;
    s.heights[i] = level;
    seeds.push(i);
  }
  ripple(s, seeds);
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
  maxPlayers: number;
}

export function markSheet(s: Sheet): SheetMark {
  return {
    tiles: Uint8Array.from(s.tiles),
    heights: Uint8Array.from(s.heights),
    spawns: s.spawns.map((sp) => ({ ...sp })),
    features: s.features.map((f) => ({ ...f })),
    maxPlayers: s.maxPlayers,
  };
}

export function restoreSheet(s: Sheet, m: SheetMark): void {
  s.tiles = Array.from(m.tiles);
  s.heights = Array.from(m.heights);
  s.spawns = m.spawns.map((sp) => ({ ...sp }));
  s.features = m.features.map((f) => ({ ...f }));
  s.maxPlayers = m.maxPlayers;
}
