import { CIVILIAN_TYPES, HEIGHT_MAX, TILE_SIZE, TILE_SUBDIV } from "./catalog.js";
import {
  MAP_DEFENCE_TYPES,
  PLAYTEST_MAP_PREFIX,
  SPAWN_PAD_R,
  TILE_DIAMOND_SCRAP,
  TILE_EMPTY,
  TILE_FENCE,
  TILE_ROAD,
  TILE_ROCK,
  TILE_SCRAP,
  TILE_TREE,
  TILE_WATER,
  featureBox,
  getMap,
  isBuiltinMap,
  isLampType,
  isMapSection,
  isPlaytestMapId,
  normalizeTerrain,
  peakHeight,
  registerMap,
  type MapDef,
  type MapFeature,
  type MapFeatureType,
  type MapLamp,
} from "./maps.js";

/**
 * A Map Builder map as it is stored and sent. Grids are fine tiles, row-major,
 * run-length coded as `[value, count, value, count, ...]`.
 */
export interface CustomMapSpec {
  id: string;
  name: string;
  author: string;
  width: number;
  height: number;
  /** Commanders the map seats. It has exactly this many starts, numbered 1..maxPlayers. */
  maxPlayers: number;
  tiles: number[];
  heights: number[];
  spawns: { id: number; x: number; y: number }[];
  features: MapFeature[];
  /** Street lamps. Left out by maps saved before lamps existed. */
  lamps?: MapLamp[];
  updatedAt: number;
}

/** Square sheets the builder offers, in authoring cells (TILE_SUBDIV fine tiles each). */
export const CUSTOM_MAP_SIZES: readonly { label: string; cells: number }[] = [
  { label: "Small", cells: 48 },
  { label: "Medium", cells: 64 },
  { label: "Large", cells: 96 },
  { label: "Huge", cells: 128 },
  // Five Scrap Yards of ground (64² cells each). Bigger sheets outgrow the one-image terrain bake and the per-tick vision pass.
  { label: "Vast", cells: 144 },
];

/** Ground a builder brush may paint. Blocked tiles stay a generator detail. */
export const CUSTOM_MAP_TILES: readonly number[] = [
  TILE_EMPTY,
  TILE_ROAD,
  TILE_SCRAP,
  TILE_DIAMOND_SCRAP,
  TILE_WATER,
  TILE_TREE,
  TILE_FENCE,
  TILE_ROCK,
];

export const CUSTOM_MAP_MIN_PLAYERS = 2;
export const CUSTOM_MAP_MAX_PLAYERS = 8;
export const CUSTOM_MAP_MAX_FEATURES = 400;
export const CUSTOM_MAP_NAME_MAX = 32;
export const CUSTOM_MAP_MAX_LAMPS = 300;
/** Starts closer than this would share a pad. */
export const SPAWN_MIN_GAP = 2 * SPAWN_PAD_R + 2 * TILE_SUBDIV;
/** How close to the map edge a start may sit, in fine tiles. */
export const SPAWN_EDGE_MARGIN = 2 * TILE_SUBDIV;
const CUSTOM_ID = /^c-[a-z0-9]{4,24}$/;

export function encodeRuns(values: ArrayLike<number>): number[] {
  const out: number[] = [];
  let i = 0;
  while (i < values.length) {
    const v = values[i]!;
    let n = 1;
    while (i + n < values.length && values[i + n] === v) n++;
    out.push(v, n);
    i += n;
  }
  return out;
}

/** Null when the runs are malformed or do not cover exactly `length` cells. */
export function decodeRuns(runs: unknown, length: number): number[] | null {
  if (!Array.isArray(runs) || runs.length % 2 !== 0 || runs.length > length * 2) return null;
  const out = new Array<number>(length);
  let at = 0;
  for (let i = 0; i < runs.length; i += 2) {
    const v = runs[i];
    const n = runs[i + 1];
    if (!Number.isInteger(v) || !Number.isInteger(n) || n < 1 || at + n > length) return null;
    out.fill(v, at, at + n);
    at += n;
  }
  return at === length ? out : null;
}

export function newCustomMapId(rng: () => number = Math.random): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "c-";
  for (let i = 0; i < 10; i++) id += chars[Math.floor(rng() * chars.length)];
  return id;
}

export function isCustomMapId(id: string): boolean {
  return CUSTOM_ID.test(id);
}

function cleanText(raw: unknown, max: number): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, max);
}

/** Everything a builder map may stand on the field: houses, then the neutral defences. */
export const MAP_FEATURE_TYPES: readonly MapFeatureType[] = [...CIVILIAN_TYPES, ...MAP_DEFENCE_TYPES];

export function newPlaytestMapId(rng: () => number = Math.random): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = PLAYTEST_MAP_PREFIX;
  for (let i = 0; i < 8; i++) id += chars[Math.floor(rng() * chars.length)];
  return id;
}

/** True when the feature's footprint touches a start's pad. */
export function featureOnPad(f: MapFeature, spawns: readonly { x: number; y: number }[]): boolean {
  const b = featureBox(f);
  return spawns.some((s) => {
    const nx = Math.max(b.x0, Math.min(s.x, b.x1 - 1));
    const ny = Math.max(b.y0, Math.min(s.y, b.y1 - 1));
    return Math.hypot(nx - s.x, ny - s.y) <= SPAWN_PAD_R;
  });
}

/** True when a lamp post on this fine tile would stand inside a building lot. Sections do not count. */
export function lampBlocked(features: readonly MapFeature[], x: number, y: number): boolean {
  return features.some((f) => {
    if (isMapSection(f.type)) return false;
    const b = featureBox(f);
    return x >= b.x0 && x < b.x1 && y >= b.y0 && y < b.y1;
  });
}

export function featuresOverlap(a: MapFeature, b: MapFeature): boolean {
  const p = featureBox(a);
  const q = featureBox(b);
  return p.x0 < q.x1 && q.x0 < p.x1 && p.y0 < q.y1 && q.y0 < p.y1;
}

export type CustomMapCheck = { ok: true; spec: CustomMapSpec } | { ok: false; message: string };

/**
 * Validate a map from the wire or disk and return a clean copy. The message
 * is what the builder shows when a save is refused.
 */
export function validateCustomMap(raw: unknown, opts: { playtest?: boolean } = {}): CustomMapCheck {
  const bad = (message: string): CustomMapCheck => ({ ok: false, message });
  if (!raw || typeof raw !== "object") return bad("No map.");
  const m = raw as Record<string, unknown>;
  const id = typeof m.id === "string" ? m.id : "";
  if (!isCustomMapId(id) || isPlaytestMapId(id) !== Boolean(opts.playtest)) return bad("Bad map id.");
  if (isBuiltinMap(id)) return bad("Built-in maps cannot be changed.");
  const name = cleanText(m.name, CUSTOM_MAP_NAME_MAX);
  if (!name) return bad("Give the map a name.");
  const author = cleanText(m.author, 24) || "Unknown";
  const width = m.width;
  const height = m.height;
  const sizeOk = (n: unknown): n is number => CUSTOM_MAP_SIZES.some((s) => s.cells * TILE_SUBDIV === n);
  if (!sizeOk(width) || !sizeOk(height) || width !== height) return bad("Unsupported map size.");
  const maxPlayers = m.maxPlayers;
  if (
    typeof maxPlayers !== "number" ||
    !Number.isInteger(maxPlayers) ||
    maxPlayers < CUSTOM_MAP_MIN_PLAYERS ||
    maxPlayers > CUSTOM_MAP_MAX_PLAYERS
  ) {
    return bad(`Max players must be ${CUSTOM_MAP_MIN_PLAYERS}–${CUSTOM_MAP_MAX_PLAYERS}.`);
  }
  const n = width * height;
  const tiles = decodeRuns(m.tiles, n);
  if (!tiles || tiles.some((t) => !CUSTOM_MAP_TILES.includes(t))) return bad("Bad ground data.");
  const heights = decodeRuns(m.heights, n);
  if (!heights || heights.some((h) => h < 0 || h > HEIGHT_MAX)) return bad("Bad elevation data.");

  if (!Array.isArray(m.spawns)) return bad("Bad start positions.");
  const spawns: CustomMapSpec["spawns"] = [];
  for (const s of m.spawns as unknown[]) {
    const o = (s ?? {}) as Record<string, unknown>;
    const sx = o.x;
    const sy = o.y;
    const sid = o.id;
    if (!Number.isInteger(sid) || !Number.isInteger(sx) || !Number.isInteger(sy)) return bad("Bad start positions.");
    spawns.push({ id: sid as number, x: sx as number, y: sy as number });
  }
  // A play test needs one start to drop the tester on; a saved map seats every player.
  if (opts.playtest ? spawns.length < 1 || spawns.length > maxPlayers : spawns.length !== maxPlayers) {
    return bad(opts.playtest ? "Place a start position to play test." : `Place all ${maxPlayers} start positions (${spawns.length} placed).`);
  }
  spawns.sort((a, b) => a.id - b.id);
  for (let i = 0; i < spawns.length; i++) {
    const s = spawns[i]!;
    const numbered = opts.playtest ? s.id >= 1 && s.id <= maxPlayers && (i === 0 || s.id > spawns[i - 1]!.id) : s.id === i + 1;
    if (!numbered) return bad("Start positions must be numbered 1 to max players.");
    const lo = SPAWN_EDGE_MARGIN;
    if (s.x < lo || s.y < lo || s.x >= width - lo || s.y >= height - lo) {
      return bad(`Start ${s.id} is too close to the edge.`);
    }
    for (let j = 0; j < i; j++) {
      const o = spawns[j]!;
      if (Math.hypot(o.x - s.x, o.y - s.y) < SPAWN_MIN_GAP) return bad(`Starts ${o.id} and ${s.id} are too close.`);
    }
  }

  if (!Array.isArray(m.features) || m.features.length > CUSTOM_MAP_MAX_FEATURES) {
    return bad(`At most ${CUSTOM_MAP_MAX_FEATURES} buildings and defences.`);
  }
  const features: MapFeature[] = [];
  for (const f of m.features as unknown[]) {
    const o = (f ?? {}) as Record<string, unknown>;
    const type = o.type;
    if (typeof type !== "string" || !(MAP_FEATURE_TYPES as readonly string[]).includes(type)) return bad("Unknown building.");
    const fx = o.x;
    const fy = o.y;
    const facing = o.facing ?? 0;
    if (!Number.isInteger(fx) || !Number.isInteger(fy) || !Number.isInteger(facing)) return bad("Bad building.");
    const feat: MapFeature = { type: type as MapFeatureType, x: fx as number, y: fy as number, facing: (facing as number) & 3 };
    const b = featureBox(feat);
    // Sandbags and walls sit on any fine tile; lots keep to the cell grid.
    if (!isMapSection(feat.type) && (feat.x % TILE_SUBDIV !== 0 || feat.y % TILE_SUBDIV !== 0)) {
      return bad("Buildings sit on the cell grid.");
    }
    if (b.x0 < 0 || b.y0 < 0 || b.x1 > width || b.y1 > height) return bad("A building is off the map.");
    if (features.some((o2) => featuresOverlap(o2, feat))) return bad("Two buildings overlap.");
    if (featureOnPad(feat, spawns)) return bad("A building stands on a start position.");
    features.push(feat);
  }

  const rawLamps = m.lamps ?? [];
  if (!Array.isArray(rawLamps) || rawLamps.length > CUSTOM_MAP_MAX_LAMPS) return bad(`At most ${CUSTOM_MAP_MAX_LAMPS} lamps.`);
  const lamps: MapLamp[] = [];
  const lampAt = new Set<number>();
  for (const l of rawLamps as unknown[]) {
    const o = (l ?? {}) as Record<string, unknown>;
    const lx = o.x;
    const ly = o.y;
    if (!isLampType(o.type) || !Number.isInteger(lx) || !Number.isInteger(ly)) return bad("Bad lamp.");
    const x = lx as number;
    const y = ly as number;
    if (x < 0 || y < 0 || x >= width || y >= height) return bad("A lamp is off the map.");
    // Two posts on one tile, or a post inside a lot, is dropped rather than refused.
    if (lampAt.has(y * width + x) || lampBlocked(features, x, y)) continue;
    lampAt.add(y * width + x);
    lamps.push({ type: o.type, x, y });
  }

  const updatedAt = typeof m.updatedAt === "number" && Number.isFinite(m.updatedAt) ? m.updatedAt : 0;
  return {
    ok: true,
    spec: {
      id,
      name,
      author,
      width,
      height,
      maxPlayers,
      tiles: encodeRuns(tiles),
      heights: encodeRuns(heights),
      spawns,
      features,
      ...(lamps.length > 0 ? { lamps } : {}),
      updatedAt,
    },
  };
}

/** Playable map from a valid spec. Same result on every machine that builds it. */
export function buildCustomMap(spec: CustomMapSpec): MapDef {
  const n = spec.width * spec.height;
  const tiles = decodeRuns(spec.tiles, n) ?? new Array<number>(n).fill(TILE_EMPTY);
  const heights = decodeRuns(spec.heights, n) ?? new Array<number>(n).fill(0);
  const features = spec.features.map((f) => ({ ...f }));
  normalizeTerrain(tiles, heights, spec.width, spec.height, spec.spawns, features);
  return {
    id: spec.id,
    name: spec.name,
    width: spec.width,
    height: spec.height,
    tileSize: TILE_SIZE,
    tiles,
    heights,
    maxHeight: peakHeight(heights),
    spawns: spec.spawns.map((s) => ({ id: s.id, x: s.x, y: s.y })),
    features,
    ...(spec.lamps?.length ? { lamps: spec.lamps.map((l) => ({ ...l })) } : {}),
    custom: { author: spec.author, updatedAt: spec.updatedAt },
  };
}

/** Validate, build, and register. Returns the refusal message when the spec is bad. */
export function loadCustomMap(
  raw: unknown,
  opts: { playtest?: boolean } = {},
): { ok: true; map: MapDef; spec: CustomMapSpec } | { ok: false; message: string } {
  const checked = validateCustomMap(raw, opts);
  if (!checked.ok) return checked;
  const map = buildCustomMap(checked.spec);
  if (!registerMap(map)) return { ok: false, message: "Built-in maps cannot be changed." };
  return { ok: true, map, spec: checked.spec };
}

/** A builder sheet copied from any loaded map, built-in or custom. */
export function specFromMap(id: string, copy: { id: string; name: string; author: string }): CustomMapSpec | null {
  const map = getMap(id);
  if (!map) return null;
  const spawns = map.spawns
    .slice(0, CUSTOM_MAP_MAX_PLAYERS)
    .map((s, i) => ({ id: i + 1, x: s.x, y: s.y }));
  return {
    id: copy.id,
    name: copy.name,
    author: copy.author,
    width: map.width,
    height: map.height,
    maxPlayers: Math.max(CUSTOM_MAP_MIN_PLAYERS, spawns.length),
    tiles: encodeRuns(map.tiles.map((t) => (CUSTOM_MAP_TILES.includes(t) ? t : TILE_ROCK))),
    heights: encodeRuns(map.heights),
    spawns,
    features: map.features.map((f) => ({ ...f })),
    ...(map.lamps?.length ? { lamps: map.lamps.map((l) => ({ ...l })) } : {}),
    updatedAt: 0,
  };
}
