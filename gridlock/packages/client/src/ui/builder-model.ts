import {
  BUILD_RADIUS,
  BUILDING_FACINGS,
  BUILDING_TURN_STEP,
  CUSTOM_MAP_MAX_CLUTTER,
  CUSTOM_MAP_MAX_LAMPS,
  CUSTOM_MAP_MAX_UNITS,
  copyMapUnit,
  featureSeat,
  garrisonCandidate,
  mapUnitHostAt,
  mapUnitProblem,
  FIELD_TURN_MAX,
  GROUND_GRASS,
  GROUND_KINDS,
  HEIGHT_BASE,
  HEIGHT_MAX,
  MOUNTAIN_MIN_HEIGHT,
  SPAWN_EDGE_MARGIN,
  SPAWN_MIN_GAP,
  SPAWN_PAD_R,
  TILE_EMPTY,
  TILE_ROAD,
  TILE_SIZE,
  TILE_SUBDIV,
  TILE_WATER,
  bridgeBrickLength,
  catalog,
  decodeRuns,
  encodeRuns,
  featureBox,
  featureContains,
  featureOnPad,
  featuresOverlap,
  fieldCornerStart,
  fieldPath,
  fieldSpan,
  fieldTurn,
  bridgeBrickProblem,
  bridgePath,
  isMapBridge,
  isMapLine,
  isMountainCliff,
  isMapSection,
  TILE_BLOCKED,
  TILE_FENCE,
  TILE_MOUNTAIN,
  TILE_ROCK,
  TILE_TREE,
  isScrapTile,
  lampBlocked,
  scatterClutter,
  MAP_DEFENCE_TYPES,
  normalizeTerrain,
  peakHeight,
  PLAYTEST_MAP_PREFIX,
  rollHeights,
  turnQuarter,
  validateCustomMap,
  type CustomMapSpec,
  type MapDef,
  type MapFeature,
  type MapFeatureType,
  type ClutterType,
  type LampType,
  type MapClutter,
  type MapLamp,
  type MapUnit,
  type TrainType,
  type MapSectionType,
  type MapBridgeType,
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
  /** Ground cover (`GROUND_*`) per fine tile. Dress the brush lays over open ground; the sim never reads it. */
  ground: number[];
  spawns: { id: number; x: number; y: number }[];
  features: MapFeature[];
  lamps: MapLamp[];
  /** Breakable clutter: crates, drums, a cart. */
  clutter: MapClutter[];
  /** Neutral units standing on the field at the start. */
  units: MapUnit[];
  /** Complete fog of war: ground nobody has seen yet plays black. */
  shroud: boolean;
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
    ground: new Array<number>(n).fill(GROUND_GRASS),
    spawns: [],
    features: [],
    lamps: [],
    clutter: [],
    units: [],
    shroud: false,
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
    ground: (spec.ground ? decodeRuns(spec.ground, n) : null) ?? new Array<number>(n).fill(GROUND_GRASS),
    spawns: spec.spawns.map((s) => ({ ...s })),
    features: spec.features.map((f) => ({ ...f })),
    lamps: (spec.lamps ?? []).map((l) => ({ ...l })),
    clutter: (spec.clutter ?? []).map((c) => ({ ...c })),
    units: (spec.units ?? []).map(copyMapUnit),
    shroud: spec.shroud === true,
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
    ...(s.ground.some((g) => g !== GROUND_GRASS) ? { ground: encodeRuns(s.ground) } : {}),
    spawns: s.spawns.map((sp) => ({ ...sp })).sort((a, b) => a.id - b.id),
    features: s.features.map((f) => ({ ...f })),
    ...(s.lamps.length > 0 ? { lamps: liveLamps(s) } : {}),
    ...(s.clutter.length > 0 ? { clutter: liveClutter(s) } : {}),
    ...(s.units.length > 0 ? { units: liveUnits(s) } : {}),
    ...(s.shroud ? { shroud: true as const } : {}),
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
    ground: s.ground.slice(),
    spawns: s.spawns.map((sp) => ({ ...sp })),
    features: s.features.map((f) => ({ ...f })),
    lamps: liveLamps(s),
    clutter: liveClutter(s),
    units: liveUnits(s),
    ...(s.shroud ? { shroud: true } : {}),
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

/** Clutter still standing: a building set down over it, or water painted under it, hides it and the save leaves it out. */
export function liveClutter(s: Sheet): MapClutter[] {
  return s.clutter.filter((c) => !lampBlocked(s.features, c.x, c.y) && s.tiles[c.y * s.width + c.x] !== TILE_WATER).map((c) => ({ ...c }));
}

/** Index of the piece of clutter within `reach` fine tiles of the cursor, nearest first, or -1. */
export function clutterIndexAt(s: Sheet, tx: number, ty: number, reach = 1): number {
  let best = -1;
  let bestD = reach + 0.01;
  s.clutter.forEach((c, i) => {
    const d = Math.max(Math.abs(c.x - tx), Math.abs(c.y - ty));
    if (d < bestD) {
      best = i;
      bestD = d;
    }
  });
  return best;
}

/** Why clutter cannot stand on this fine tile, or null. */
export function clutterProblem(s: Sheet, x: number, y: number): string | null {
  if (x < 0 || y < 0 || x >= s.width || y >= s.height) return "Off the map.";
  if (s.tiles[y * s.width + x] === TILE_WATER) return "Clutter stands on dry ground.";
  if (lampBlocked(s.features, x, y)) return "Inside a building lot.";
  if (s.clutter.some((c) => c.x === x && c.y === y)) return "Something already stands here.";
  if (s.clutter.length >= CUSTOM_MAP_MAX_CLUTTER) return `At most ${CUSTOM_MAP_MAX_CLUTTER} pieces of clutter.`;
  return null;
}

/** Stand a piece of `type` on the tile. Null when placed, else the reason. */
export function placeClutter(s: Sheet, type: ClutterType, x: number, y: number): string | null {
  const problem = clutterProblem(s, x, y);
  if (problem) return problem;
  s.clutter.push({ type, x, y });
  return null;
}

/** Strew clutter by the houses, along the roads, and here and there in the open. Returns how many went down. */
export function scatterSheetClutter(s: Sheet, seed: string): number {
  const room = CUSTOM_MAP_MAX_CLUTTER - s.clutter.length;
  if (room <= 0) return 0;
  const add = scatterClutter(s.tiles, s.width, s.height, s.features, s.spawns, seed, 1, s.clutter).slice(0, room);
  s.clutter.push(...add);
  return add.length;
}

/**
 * Units still standing where they may: water painted under a tank, a house set
 * down on a squad, or a start pad moved over one hides it, and the save leaves it out.
 */
export function liveUnits(s: Sheet): MapUnit[] {
  const kept: MapUnit[] = [];
  for (const u of s.units) {
    if (!mapUnitProblem({ ...s, units: kept }, u.type, u.x, u.y, -1, u.inside)) kept.push(copyMapUnit(u));
  }
  return kept;
}

/** Index of the unit nearest the cursor within `reach` fine tiles, or -1. */
export function unitIndexAt(s: Sheet, tx: number, ty: number, reach = 1.5): number {
  let best = -1;
  let bestD = reach + 0.01;
  s.units.forEach((u, i) => {
    const d = Math.hypot(u.x - tx, u.y - ty);
    if (d < bestD) {
      best = i;
      bestD = d;
    }
  });
  return best;
}

/** Why a unit cannot stand on this fine tile, or null. `ignore` is the unit being moved. */
export function unitProblem(s: Sheet, type: TrainType, x: number, y: number, ignore = -1, inside = false): string | null {
  if (ignore < 0 && s.units.length >= CUSTOM_MAP_MAX_UNITS) return `At most ${CUSTOM_MAP_MAX_UNITS} units.`;
  if (!inside && isMountainCliff(s.tiles, s.heights, s.width, s.height, x, y)) return "That rock is impassable.";
  return mapUnitProblem(s, type, x, y, ignore, inside);
}

/** The building a unit dropped on (x, y) would garrison, or -1: infantry over a house, bunker, or tower that takes it. */
export function garrisonHostAt(s: Sheet, type: TrainType, x: number, y: number): number {
  const host = mapUnitHostAt(s.features, x, y);
  const f = s.features[host];
  return f && garrisonCandidate(f.type, type) ? host : -1;
}

/** Put a neutral soldier inside `features[host]`, on its centre tile. Null when it went in, else the reason. */
export function garrisonUnit(s: Sheet, type: TrainType, host: number, facing: number): string | null {
  const f = s.features[host];
  if (!f) return "Nothing to garrison.";
  const seat = featureSeat(f);
  const problem = unitProblem(s, type, seat.x, seat.y, -1, true);
  if (problem) return problem;
  s.units.push({ type, x: seat.x, y: seat.y, facing: wrapDegrees(facing), inside: true });
  return null;
}

/** Indices of the map units garrisoned in `features[host]`. */
export function unitsInside(s: Sheet, host: number): number[] {
  const f = s.features[host];
  if (!f) return [];
  const out: number[] = [];
  s.units.forEach((u, i) => {
    if (u.inside && featureContains(f, u.x + 0.5, u.y + 0.5)) out.push(i);
  });
  return out;
}

/** After a building moved or turned from `before` to `after`, carry its garrison to the new centre. */
export function reseatGarrison(s: Sheet, before: MapFeature, after: MapFeature): void {
  const seat = featureSeat(after);
  for (const u of s.units) {
    if (u.inside && featureContains(before, u.x + 0.5, u.y + 0.5)) {
      u.x = seat.x;
      u.y = seat.y;
    }
  }
}

/** Drop the garrison of a building that is going away. Returns how many left with it. */
export function dropGarrison(s: Sheet, f: MapFeature): number {
  const before = s.units.length;
  s.units = s.units.filter((u) => !(u.inside && featureContains(f, u.x + 0.5, u.y + 0.5)));
  return before - s.units.length;
}

/**
 * Walk the garrison of `features[host]` out onto free ground round the lot, the
 * way an Unload order spills it in a match. Returns how many found a spot; the
 * rest stay inside.
 */
export function unloadGarrison(s: Sheet, host: number): number {
  const f = s.features[host];
  if (!f) return 0;
  const b = featureBox(f);
  const cx = (b.x0 + b.x1) / 2;
  const cy = (b.y0 + b.y1) / 2;
  let out = 0;
  for (const i of unitsInside(s, host)) {
    const u = s.units[i]!;
    let best: { x: number; y: number } | null = null;
    let bestD = Infinity;
    for (let ring = 1; ring <= 6 && !best; ring++) {
      for (let y = b.y0 - ring; y < b.y1 + ring; y++) {
        for (let x = b.x0 - ring; x < b.x1 + ring; x++) {
          if (x > b.x0 - ring && x < b.x1 + ring - 1 && y > b.y0 - ring && y < b.y1 + ring - 1) continue;
          if (unitProblem(s, u.type, x, y, i)) continue;
          const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
          if (d < bestD) {
            bestD = d;
            best = { x, y };
          }
        }
      }
    }
    if (!best) continue;
    u.x = best.x;
    u.y = best.y;
    delete u.inside;
    out++;
  }
  return out;
}

/** Stand a neutral unit on the tile facing `facing` degrees. Null when placed, else the reason. */
export function placeUnit(s: Sheet, type: TrainType, x: number, y: number, facing: number): string | null {
  const problem = unitProblem(s, type, x, y);
  if (problem) return problem;
  s.units.push({ type, x, y, facing: wrapDegrees(facing) });
  return null;
}

/** Move a placed unit `dx`, `dy` fine tiles from where it stood at `from`. Its route moves with it. Null when it moved. */
export function moveUnit(s: Sheet, index: number, from: MapUnit, dx: number, dy: number): string | null {
  if (!s.units[index]) return "Nothing selected.";
  const x = from.x + dx;
  const y = from.y + dy;
  const problem = unitProblem(s, from.type, x, y, index);
  if (problem) return problem;
  const next = copyMapUnit(from);
  next.x = x;
  next.y = y;
  if (next.patrol) {
    next.patrol = next.patrol.map((p) => ({
      x: Math.max(0, Math.min(s.width - 1, p.x + dx)),
      y: Math.max(0, Math.min(s.height - 1, p.y + dy)),
    }));
  }
  s.units[index] = next;
  return null;
}

/** Whole degrees 0..359. */
export function wrapDegrees(deg: number): number {
  return ((Math.round(deg) % 360) + 360) % 360;
}

/** Degrees from fine tile (x0, y0) toward (x1, y1): 0 east, 90 south. */
export function degreesToward(x0: number, y0: number, x1: number, y1: number): number {
  return wrapDegrees((Math.atan2(y1 - y0, x1 - x0) * 180) / Math.PI);
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
    .filter((f) => !isMapBridge(f.type))
    .map((f) => featureBox(f))
    .filter((b) => b.x1 > cx - ri && b.x0 <= cx + ri && b.y1 > cy - ri && b.y0 <= cy + ri);
  const pads = PAD_CLEARS(tile) ? s.spawns.filter((sp) => Math.hypot(sp.x - cx, sp.y - cy) <= SPAWN_PAD_R + ri + 1) : [];
  let changed = 0;
  for (const i of diskCells(s, cx, cy, r)) {
    const x = i % s.width;
    const y = (i / s.width) | 0;
    // Grass over grass still clears painted cover; anything else over itself is a no-op.
    if (s.tiles[i] === tile && (tile !== TILE_EMPTY || s.ground[i] === GROUND_GRASS)) continue;
    if (lots.some((b) => x >= b.x0 && x < b.x1 && y >= b.y0 && y < b.y1)) continue;
    if (pads.some((sp) => Math.hypot(sp.x - x, sp.y - y) <= SPAWN_PAD_R)) continue;
    s.tiles[i] = tile;
    if (tile === TILE_WATER) s.heights[i] = 0;
    // Grass means meadow: it takes the painted cover with it.
    if (tile === TILE_EMPTY) s.ground[i] = GROUND_GRASS;
    touch(dirty, x, y);
    changed++;
  }
  return changed;
}

/**
 * Lay ground cover in a disk over open ground. Water, rock, trees, roads, and
 * scrap keep their own surface, so the brush skips them. Returns changed cells.
 */
export function paintCover(s: Sheet, cx: number, cy: number, r: number, cover: number, dirty?: Dirty): number {
  if (!GROUND_KINDS.includes(cover)) return 0;
  let changed = 0;
  for (const i of diskCells(s, cx, cy, r)) {
    if (s.ground[i] === cover) continue;
    const t = s.tiles[i];
    if (t !== TILE_EMPTY && t !== TILE_MOUNTAIN) continue;
    s.ground[i] = cover;
    touch(dirty, i % s.width, (i / s.width) | 0);
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
        if (held.has(ni) || s.tiles[ni] === TILE_WATER || s.tiles[ni] === TILE_MOUNTAIN) continue;
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
    if (s.tiles[i] === TILE_WATER || s.tiles[i] === TILE_MOUNTAIN) continue;
    const next = Math.max(0, Math.min(HEIGHT_MAX, s.heights[i]! + delta));
    if (next === s.heights[i]) continue;
    s.heights[i] = next;
    seeds.push(i);
  }
  ripple(s, seeds, dirty);
  return seeds.length;
}

/** Set a disk to elevation `z`, ramping the ground around it. Mountain caps stay as they are. */
export function levelDisk(s: Sheet, cx: number, cy: number, r: number, z: number, dirty?: Dirty): number {
  const level = Math.max(0, Math.min(HEIGHT_MAX, Math.round(z)));
  const seeds: number[] = [];
  for (const i of diskCells(s, cx, cy, r)) {
    if (s.tiles[i] === TILE_WATER || s.tiles[i] === TILE_MOUNTAIN || s.heights[i] === level) continue;
    s.heights[i] = level;
    seeds.push(i);
  }
  ripple(s, seeds, dirty);
  return seeds.length;
}

/**
 * Stamp a flat mountain cap at `z` (never below MOUNTAIN_MIN_HEIGHT). The disk
 * stays walkable. Rock around it is derived from the neighbouring ground, and
 * opens where that ground is already this height. No ramp is pulled up the cliff.
 */
export function paintMountain(s: Sheet, cx: number, cy: number, r: number, z: number, dirty?: Dirty): number {
  const level = Math.max(MOUNTAIN_MIN_HEIGHT, Math.min(HEIGHT_MAX, Math.round(z)));
  const ri = Math.ceil(r);
  const lots = s.features
    .filter((f) => !isMapBridge(f.type))
    .map((f) => featureBox(f))
    .filter((b) => b.x1 > cx - ri && b.x0 <= cx + ri && b.y1 > cy - ri && b.y0 <= cy + ri);
  const pads = s.spawns.filter((sp) => Math.hypot(sp.x - cx, sp.y - cy) <= SPAWN_PAD_R + ri + 1);
  let changed = 0;
  for (const i of diskCells(s, cx, cy, r)) {
    const x = i % s.width;
    const y = (i / s.width) | 0;
    if (lots.some((b) => x >= b.x0 && x < b.x1 && y >= b.y0 && y < b.y1)) continue;
    if (pads.some((sp) => Math.hypot(sp.x - x, sp.y - y) <= SPAWN_PAD_R)) continue;
    const same = s.tiles[i] === TILE_MOUNTAIN && s.heights[i] === level;
    s.tiles[i] = TILE_MOUNTAIN;
    s.heights[i] = level;
    touch(dirty, x, y);
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (inBounds(s, nx, ny)) touch(dirty, nx, ny);
    }
    if (!same) changed++;
  }
  return changed;
}

/** Quarter turns in BUILDING_TURN_STEPs. */
export const QUARTER_TURN = BUILDING_FACINGS / 4;

/** A defence's turn wrapped into 0..BUILDING_FACINGS - 1. */
export function wrapTurn(turn: number): number {
  const n = BUILDING_FACINGS;
  return ((Math.round(turn) % n) + n) % n;
}

/** True for the features that turn in 15° steps: bunkers, towers, sandbags, walls, bridge bricks. */
export function turnsFine(type: MapFeatureType): boolean {
  return (MAP_DEFENCE_TYPES as readonly string[]).includes(type) || isMapBridge(type);
}

/**
 * A feature of `type` centred on the cursor tile. A house, bunker, or tower
 * snaps to the cell grid; a sandbag or wall section sits on the tile itself.
 * A defence takes `turn` (15° steps from east); a house only `facing`.
 */
export function houseAt(type: MapFeatureType, tx: number, ty: number, facing: number, turn?: number): MapFeature {
  const f: MapFeature = { type, x: tx, y: ty, facing: facing & 3 };
  if (!isMapLine(type)) {
    const def = catalog(type);
    const snap = (v: number, span: number): number => Math.round((v - span / 2) / TILE_SUBDIV) * TILE_SUBDIV;
    f.x = snap(tx, def.tileW);
    f.y = snap(ty, def.tileH);
  }
  if (turnsFine(type)) {
    f.turn = wrapTurn(turn ?? (facing & 3) * QUARTER_TURN);
    f.facing = turnQuarter(f.turn);
  }
  return f;
}

/** World point of a fine tile's centre. A line is drawn between these, as the match lays one. */
export function tileWorld(tx: number, ty: number): { x: number; y: number } {
  return { x: (tx + 0.5) * TILE_SIZE, y: (ty + 0.5) * TILE_SIZE };
}

/**
 * The corners of a line with every leg turned to the nearest 15°. Each leg is
 * measured from where the last one really ends, the way `fieldPath` lays it,
 * so every section of the line stands on a whole turn step.
 */
export function snapLegs(type: MapSectionType, points: readonly { x: number; y: number }[]): { x: number; y: number }[] {
  const span = fieldSpan(type);
  const first = points[0];
  if (!span || !first) return [];
  const out = [{ ...first }];
  let sx = first.x;
  let sy = first.y;
  let ux: number | null = null;
  let uy = 0;
  for (let i = 1; i < points.length; i++) {
    const p = points[i]!;
    const dist = Math.hypot(p.x - sx, p.y - sy);
    if (dist < span.length * 0.5) {
      out.push({ ...p });
      continue;
    }
    const a = Math.round(Math.atan2(p.y - sy, p.x - sx) / BUILDING_TURN_STEP) * BUILDING_TURN_STEP;
    const vx = Math.cos(a);
    const vy = Math.sin(a);
    const target = { x: sx + vx * dist, y: sy + vy * dist };
    out.push(target);
    // Follow fieldPath to where this leg ends.
    let x0 = sx;
    let y0 = sy;
    let run = dist;
    if (ux != null) {
      if (fieldTurn(ux, uy, vx, vy) > FIELD_TURN_MAX) continue;
      const start = fieldCornerStart(span.thick, sx, sy, ux, uy, vx, vy);
      x0 = start.x;
      y0 = start.y;
      run = (target.x - x0) * vx + (target.y - y0) * vy;
      if (run < span.length * 0.5) continue;
    }
    const n = Math.max(1, Math.round(run / span.length));
    sx = x0 + vx * span.length * n;
    sy = y0 + vy * span.length * n;
    ux = vx;
    uy = vy;
  }
  return out;
}

/**
 * The sections a line through these world points lays, as map features. `turn` faces a
 * lone section and picks which flank of a longer line is its front, like the wheel in a match.
 */
export function sectionLine(type: MapSectionType, points: readonly { x: number; y: number }[], turn: number): MapFeature[] {
  const at = (v: number): number => Math.round((v / TILE_SIZE - 0.5) * TILE_SIZE) / TILE_SIZE;
  return fieldPath(type, snapLegs(type, points), wrapTurn(turn) * BUILDING_TURN_STEP).map((p) => {
    const t = wrapTurn(p.facing / BUILDING_TURN_STEP);
    return { type, x: at(p.x), y: at(p.y), facing: turnQuarter(t), turn: t };
  });
}

/**
 * The bridge bricks a line through these world points lays, as map features: end to end
 * like a wall's sections, every leg turned to the nearest 15°. A lone point is one brick
 * along `turn`. A brick's turn runs along its deck.
 */
export function bridgeLine(type: MapBridgeType, points: readonly { x: number; y: number }[], turn: number, deck: number): MapFeature[] {
  const at = (v: number): number => Math.round((v / TILE_SIZE - 0.5) * TILE_SIZE) / TILE_SIZE;
  return bridgePath(type, points, wrapTurn(turn) * BUILDING_TURN_STEP, BUILDING_TURN_STEP).map((b) => {
    const t = wrapTurn(b.facing / BUILDING_TURN_STEP);
    return { type, x: at(b.x), y: at(b.y), facing: turnQuarter(t), turn: t, deck };
  });
}

/** Deck level a bridge line started at world point `p` keeps: the ground's height there. */
export function deckAt(s: Sheet, p: { x: number; y: number }): number {
  const x = Math.max(0, Math.min(s.width - 1, Math.floor(p.x / TILE_SIZE)));
  const y = Math.max(0, Math.min(s.height - 1, Math.floor(p.y / TILE_SIZE)));
  return s.heights[y * s.width + x] ?? 0;
}

/** A placed brick's deck level. One saved before levels were kept rests on its higher end. */
export function brickDeck(s: Sheet, f: MapFeature): number {
  if (f.deck != null) return f.deck;
  const a = ((f.turn ?? f.facing * QUARTER_TURN) * BUILDING_TURN_STEP);
  const half = (isMapBridge(f.type) ? bridgeBrickLength(f.type) : 0) / 2;
  const cx = (f.x + 0.5) * TILE_SIZE;
  const cy = (f.y + 0.5) * TILE_SIZE;
  return Math.max(
    deckAt(s, { x: cx - Math.cos(a) * half, y: cy - Math.sin(a) * half }),
    deckAt(s, { x: cx + Math.cos(a) * half, y: cy + Math.sin(a) * half }),
  );
}

/** Ground a bridge brick may not stand on: rock, woods, fences, and blocked ground. Water and open land take one. */
function bridgeFooting(s: Sheet, f: MapFeature): string | null {
  if (!isMapBridge(f.type)) return null;
  const a = (f.turn ?? f.facing * QUARTER_TURN) * BUILDING_TURN_STEP;
  const span = { x: (f.x + 0.5) * TILE_SIZE, y: (f.y + 0.5) * TILE_SIZE, facing: a, length: bridgeBrickLength(f.type) };
  const ground = {
    width: s.width,
    height: s.height,
    tileSize: TILE_SIZE,
    water: (x: number, y: number) => s.tiles[y * s.width + x] === TILE_WATER,
    footing: (x: number, y: number) => {
      const t = s.tiles[y * s.width + x];
      return (
        t !== TILE_ROCK &&
        t !== TILE_TREE &&
        t !== TILE_FENCE &&
        t !== TILE_BLOCKED &&
        !isMountainCliff(s.tiles, s.heights, s.width, s.height, x, y)
      );
    },
  };
  return bridgeBrickProblem(ground, f.type, span);
}

/** Set down every section of a line that fits. Returns how many went down and how many were refused. */
export function laySections(s: Sheet, pieces: readonly MapFeature[]): { laid: number; refused: number } {
  let laid = 0;
  for (const f of pieces) {
    if (houseProblem(s, f)) continue;
    s.features.push(f);
    laid++;
  }
  return { laid, refused: pieces.length - laid };
}

/** A road's width in fine tiles: the default and the range the Decorations slider allows. */
export const ROAD_WIDTH = 6;
export const ROAD_WIDTH_MIN = 2;
export const ROAD_WIDTH_MAX = 16;
/** Fine tiles of road a lone start lays: the stub the wheel turns before the first leg is drawn. */
export const ROAD_STUB = 16;

/**
 * The centreline of a drawn road, in world points. A lone point is a stub
 * centred on it along `turn` (15° steps from east); otherwise every leg turns
 * to the nearest 15° and runs its drawn length from where the last one ended,
 * as a wall line's legs do. A leg shorter than a fine tile is skipped.
 */
export function roadLegs(points: readonly { x: number; y: number }[], turn: number): { x: number; y: number }[] {
  const first = points[0];
  if (!first) return [];
  if (points.length === 1) {
    const a = wrapTurn(turn) * BUILDING_TURN_STEP;
    const half = (ROAD_STUB * TILE_SIZE) / 2;
    return [
      { x: first.x - Math.cos(a) * half, y: first.y - Math.sin(a) * half },
      { x: first.x + Math.cos(a) * half, y: first.y + Math.sin(a) * half },
    ];
  }
  const out = [{ ...first }];
  for (let i = 1; i < points.length; i++) {
    const from = out[out.length - 1]!;
    const p = points[i]!;
    const dist = Math.hypot(p.x - from.x, p.y - from.y);
    if (dist < TILE_SIZE) continue;
    const a = Math.round(Math.atan2(p.y - from.y, p.x - from.x) / BUILDING_TURN_STEP) * BUILDING_TURN_STEP;
    out.push({ x: from.x + Math.cos(a) * dist, y: from.y + Math.sin(a) * dist });
  }
  return out.length > 1 ? out : [];
}

/** One world-space rectangle per leg of a road `width` fine tiles across, corners in order round it. */
export function roadQuads(legs: readonly { x: number; y: number }[], width: number): { x: number; y: number }[][] {
  const half = (width * TILE_SIZE) / 2;
  const out: { x: number; y: number }[][] = [];
  for (let i = 1; i < legs.length; i++) {
    const a = legs[i - 1]!;
    const b = legs[i]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len === 0) continue;
    // Each leg runs half a width past both ends, so corners close.
    const ux = (b.x - a.x) / len;
    const uy = (b.y - a.y) / len;
    const nx = -uy * half;
    const ny = ux * half;
    const ax = a.x - ux * half;
    const ay = a.y - uy * half;
    const bx = b.x + ux * half;
    const by = b.y + uy * half;
    out.push([
      { x: ax + nx, y: ay + ny },
      { x: bx + nx, y: by + ny },
      { x: bx - nx, y: by - ny },
      { x: ax - nx, y: ay - ny },
    ]);
  }
  return out;
}

/** Fine-tile indices under a road `width` fine tiles across along `legs`: tile centres within half a width of a leg. */
export function roadCells(s: Sheet, legs: readonly { x: number; y: number }[], width: number): number[] {
  const half = (width * TILE_SIZE) / 2;
  const cells = new Set<number>();
  for (let i = 1; i < legs.length; i++) {
    const a = legs[i - 1]!;
    const b = legs[i]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const x0 = Math.max(0, Math.floor((Math.min(a.x, b.x) - half) / TILE_SIZE));
    const x1 = Math.min(s.width - 1, Math.floor((Math.max(a.x, b.x) + half) / TILE_SIZE));
    const y0 = Math.max(0, Math.floor((Math.min(a.y, b.y) - half) / TILE_SIZE));
    const y1 = Math.min(s.height - 1, Math.floor((Math.max(a.y, b.y) + half) / TILE_SIZE));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const cx = (x + 0.5) * TILE_SIZE;
        const cy = (y + 0.5) * TILE_SIZE;
        const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((cx - a.x) * dx + (cy - a.y) * dy) / len2));
        if (Math.hypot(cx - (a.x + dx * t), cy - (a.y + dy * t)) <= half) cells.add(y * s.width + x);
      }
    }
  }
  return [...cells];
}

/** Lay road along `legs`. Houses keep their lots and ponds stay water. Returns changed cells. */
export function paintRoad(s: Sheet, legs: readonly { x: number; y: number }[], width: number, dirty?: Dirty): number {
  const lots = s.features.filter((f) => !isMapBridge(f.type)).map((f) => featureBox(f));
  let changed = 0;
  for (const i of roadCells(s, legs, width)) {
    const t = s.tiles[i];
    if (t === TILE_ROAD || t === TILE_WATER) continue;
    const x = i % s.width;
    const y = (i / s.width) | 0;
    if (lots.some((b) => x >= b.x0 && x < b.x1 && y >= b.y0 && y < b.y1)) continue;
    s.tiles[i] = TILE_ROAD;
    touch(dirty, x, y);
    changed++;
  }
  return changed;
}

/** Why `f` cannot stand where it is. `ignore` is the index of a feature being moved, which does not block itself. */
export function houseProblem(s: Sheet, f: MapFeature, ignore = -1): string | null {
  const b = featureBox(f);
  if (b.x0 < 0 || b.y0 < 0 || b.x1 > s.width || b.y1 > s.height) return "Off the map.";
  for (let y = b.y0; y < b.y1; y++) {
    for (let x = b.x0; x < b.x1; x++) {
      if (isMountainCliff(s.tiles, s.heights, s.width, s.height, x, y)) return "Sits on the mountain rock.";
    }
  }
  if (s.features.some((o, i) => i !== ignore && featuresOverlap(o, f))) return "Overlaps another building.";
  if (featureOnPad(f, s.spawns)) return "Too close to a start position.";
  return bridgeFooting(s, f);
}

/**
 * Set a placed feature down `dx`, `dy` fine tiles from where it stood at
 * `from`. A lot keeps to the cell grid. Null when it moved, else the reason.
 */
export function moveFeature(s: Sheet, index: number, from: MapFeature, dx: number, dy: number): string | null {
  if (!s.features[index]) return "Nothing selected.";
  const step = isMapLine(from.type) ? 1 : TILE_SUBDIV;
  const next = { ...from, x: from.x + Math.round(dx / step) * step, y: from.y + Math.round(dy / step) * step };
  const problem = houseProblem(s, next, index);
  if (problem) return problem;
  s.features[index] = next;
  return null;
}

/**
 * Turn a placed feature in place: a house a quarter, a defence `steps` 15° steps
 * (a quarter by default). Null when the turned shape fits.
 */
export function turnFeature(s: Sheet, index: number, steps = QUARTER_TURN): string | null {
  const f = s.features[index];
  if (!f) return "Nothing selected.";
  const next: MapFeature = { ...f, facing: (f.facing + 1) & 3 };
  if (turnsFine(f.type)) {
    next.turn = wrapTurn((f.turn ?? f.facing * QUARTER_TURN) + steps);
    next.facing = turnQuarter(next.turn);
  }
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
  // A thin or slanted section is hit within half a tile of it.
  return s.features.findIndex((f) => featureContains(f, tx + 0.5, ty + 0.5, isMapLine(f.type) ? 0.5 : 0));
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
  ground: Uint8Array;
  spawns: Sheet["spawns"];
  features: MapFeature[];
  lamps: MapLamp[];
  clutter: MapClutter[];
  units: MapUnit[];
  maxPlayers: number;
  shroud: boolean;
}

export function markSheet(s: Sheet): SheetMark {
  return {
    tiles: Uint8Array.from(s.tiles),
    heights: Uint8Array.from(s.heights),
    ground: Uint8Array.from(s.ground),
    spawns: s.spawns.map((sp) => ({ ...sp })),
    features: s.features.map((f) => ({ ...f })),
    lamps: s.lamps.map((l) => ({ ...l })),
    clutter: s.clutter.map((c) => ({ ...c })),
    units: s.units.map(copyMapUnit),
    maxPlayers: s.maxPlayers,
    shroud: s.shroud,
  };
}

export function restoreSheet(s: Sheet, m: SheetMark): void {
  s.tiles = Array.from(m.tiles);
  s.heights = Array.from(m.heights);
  s.ground = Array.from(m.ground);
  s.spawns = m.spawns.map((sp) => ({ ...sp }));
  s.features = m.features.map((f) => ({ ...f }));
  s.lamps = m.lamps.map((l) => ({ ...l }));
  s.clutter = m.clutter.map((c) => ({ ...c }));
  s.units = m.units.map(copyMapUnit);
  s.maxPlayers = m.maxPlayers;
  s.shroud = m.shroud;
}
