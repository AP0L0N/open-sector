import { canContinuousTrain, clampGameSpeed, isFaction, migrateFaction, type Faction, type TrainType } from "../catalog.js";
import { getMap, TILE_EMPTY } from "../maps.js";
import { MAX_SLOTS, MIN_SLOTS, SLOT_COUNT, isAiDifficulty, type AiDifficulty, type SlotStatus } from "../protocol.js";
import { restampForts } from "./field.js";
import { restampBridges } from "./bridge.js";
import { initGrids, occupyEntity } from "./geo.js";
import { freshClutterHp } from "./clutter.js";
import type {
  Entity,
  GroundFire,
  MatchState,
  Mine,
  Projectile,
  SimPlayer,
  SmokeCloud,
  EnergyShield,
  SupplyCrate,
} from "./types.js";
import type { CorpseView, RoomState, ShellHoleView } from "../protocol.js";

/** Bump when a stored match can no longer be read back into the sim. */
export const SAVE_VERSION = 1;

const MAX_ENTITIES = 8_000;
const MAX_PROJECTILES = 4_000;
const MAX_CLOUDS = 2_000;
const MAX_FIRES = 2_000;
const MAX_MINES = 2_000;
const MAX_CRATES = 500;
const MAX_BODIES = 4_000;
const MAX_HOLES = 2_000;
const MAX_TREES = 200_000;
const MAX_SCRAP = 400_000;
const MAX_COMMS = 50;

export interface SaveSeat {
  index: number;
  status: SlotStatus;
  playerId?: string;
  name?: string;
  colorId: number;
  team: number;
  spawnId: number;
  ai?: AiDifficulty;
  faction?: Faction;
}

/**
 * A skirmish, small enough to keep in the browser. Terrain comes back from
 * the map. Harvested scrap and felled trees are the only ground edits.
 */
export interface SaveGame {
  v: typeof SAVE_VERSION;
  savedAt: number;
  mapId: string;
  maxSlots: number;
  /** Session id of the human commander at save time. Load remaps it. */
  humanId: string;
  tick: number;
  gameSpeed: number;
  nextId: number;
  rngState: number;
  ended: boolean;
  initialHumans: number;
  winner?: { playerId: string; team: number };
  players: SimPlayer[];
  entities: Entity[];
  projectiles: Projectile[];
  smokeClouds: SmokeCloud[];
  /** Missing in saves from before the hive energy walls. */
  energyShields?: EnergyShield[];
  fires: GroundFire[];
  mines: Mine[];
  crates: SupplyCrate[];
  clearedTrees: { x: number; y: number; burn?: true }[];
  bodies: CorpseView[];
  holes: ShellHoleView[];
  pendingComms: string[];
  /** Tile index and remaining scrap, only where the map's starting yield differs. */
  scrap: [number, number][];
  /** Tile index and height, where a blast sank the ground. Older saves leave it out. */
  dug?: [number, number][];
  /** Rounds left in each piece of map clutter. Left out by saves made before clutter. */
  clutterHp?: number[];
  /** Tile index and blast points soaked toward the next dig. Older saves leave it out. */
  blast?: [number, number][];
  seats: SaveSeat[];
}

export type SaveResult<T> = { ok: true; value: T } | { ok: false; message: string };

const fail = (message: string): SaveResult<never> => ({ ok: false, message });

export interface RestoredMatch {
  state: MatchState;
  save: SaveGame;
}

/** Plain snapshot of a running skirmish. Grids the sim can rebuild are left out. */
export function exportSave(state: MatchState, room: RoomState, now = Date.now()): SaveGame {
  const map = getMap(state.mapId);
  const fresh = map ? initGrids(map) : null;
  const scrap: [number, number][] = [];
  if (fresh) {
    for (let i = 0; i < state.scrapYield.length; i++) {
      const nowYield = state.scrapYield[i] ?? 0;
      if (nowYield !== (fresh.scrapYield[i] ?? 0)) scrap.push([i, nowYield]);
    }
  }
  const human = room.slots.find((s) => s.status === "human" && s.playerId === room.hostId)
    ?? room.slots.find((s) => s.status === "human" && s.playerId);
  const save: SaveGame = {
    v: SAVE_VERSION,
    savedAt: now,
    mapId: state.mapId,
    maxSlots: room.maxSlots,
    humanId: human?.playerId ?? room.hostId,
    tick: state.tick,
    gameSpeed: state.gameSpeed,
    nextId: state.nextId,
    rngState: state.rngState,
    ended: state.ended,
    initialHumans: state.initialHumans,
    winner: state.winner ? { playerId: state.winner.playerId, team: state.winner.team } : undefined,
    players: [...state.players.values()],
    entities: [...state.entities.values()],
    projectiles: state.projectiles,
    smokeClouds: state.smokeClouds,
    energyShields: state.energyShields,
    fires: state.fires,
    mines: state.mines,
    crates: state.crates,
    clearedTrees: state.clearedTrees,
    bodies: state.bodies,
    holes: state.holes,
    pendingComms: state.pendingComms,
    scrap,
    dug: [...state.dug],
    clutterHp: state.clutterHp.slice(),
    blast: [...state.blast],
    seats: room.slots.map((s) => ({
      index: s.index,
      status: s.status,
      playerId: s.playerId,
      name: s.name,
      colorId: s.colorId,
      team: s.team,
      spawnId: s.spawnId,
      ai: s.ai,
      faction: s.faction,
    })),
  };
  return JSON.parse(JSON.stringify(save)) as SaveGame;
}

/**
 * Build a match the sim can tick. `humanPlayerId` replaces the saved
 * commander so a later session still owns the units. The fight comes back
 * running: a save taken from the pause menu does not load paused.
 */
export function restoreMatch(
  raw: unknown,
  opts: { roomId: string; humanPlayerId: string },
): SaveResult<RestoredMatch> {
  const parsed = parseSave(raw);
  if (!parsed.ok) return parsed;
  const save = JSON.parse(JSON.stringify(parsed.value)) as SaveGame;
  const map = getMap(save.mapId);
  if (!map) return fail("That save's map is not loaded.");
  const grids = initGrids(map);
  const n = map.width * map.height;
  for (const [index, yieldLeft] of save.scrap) {
    if (!Number.isInteger(index) || index < 0 || index >= n) return fail("That save's scrap is out of range.");
    if (!Number.isInteger(yieldLeft) || yieldLeft < 0 || yieldLeft > 65535) return fail("That save's scrap is unreadable.");
    grids.scrapYield[index] = yieldLeft;
  }
  const cleared: { x: number; y: number; burn?: true }[] = [];
  for (const tree of save.clearedTrees) {
    if (tree.x < 0 || tree.y < 0 || tree.x >= map.width || tree.y >= map.height) continue;
    grids.terrain[tree.y * map.width + tree.x] = TILE_EMPTY;
    cleared.push(tree.burn ? { x: tree.x, y: tree.y, burn: true } : { x: tree.x, y: tree.y });
  }
  const dug = new Map<number, number>();
  for (const [index, h] of save.dug ?? []) {
    if (!Number.isInteger(index) || index < 0 || index >= n) return fail("That save's ground is out of range.");
    if (!Number.isInteger(h) || h < 0 || h > 255) return fail("That save's ground is unreadable.");
    grids.heights[index] = h;
    dug.set(index, h);
  }
  const clutterHp = freshClutterHp(map);
  if (Array.isArray(save.clutterHp) && save.clutterHp.length === clutterHp.length) {
    save.clutterHp.forEach((hp, i) => {
      if (num(hp)) clutterHp[i] = Math.max(0, Math.min(clutterHp[i] ?? 0, hp));
    });
  }
  const blast = new Map<number, number>();
  for (const [index, points] of save.blast ?? []) {
    if (Number.isInteger(index) && index >= 0 && index < n && num(points)) blast.set(index, points);
  }

  const mapOwner = (id: string): string => (id === save.humanId ? opts.humanPlayerId : id);
  const players = new Map<string, SimPlayer>();
  for (const p of save.players) {
    const playerId = mapOwner(p.playerId);
    const player = { ...p, playerId };
    // Saves from before the CPU types carry "easy": that CPU plays on as Defensive.
    if (player.ai != null && !isAiDifficulty(player.ai)) player.ai = "defensive";
    const continuous = cleanContinuous(p.continuous);
    if (continuous) player.continuous = continuous;
    else delete player.continuous;
    players.set(playerId, player);
  }
  if (!players.has(opts.humanPlayerId)) return fail("That save has no commander to take.");

  const entities = new Map<number, Entity>();
  let nextId = save.nextId;
  const bump = (id: number): void => {
    if (id >= nextId) nextId = id + 1;
  };
  for (const e of save.entities) {
    if (entities.has(e.id)) return fail("That save repeats a unit.");
    bump(e.id);
    entities.set(e.id, {
      ...e,
      ownerId: mapOwner(e.ownerId),
      captureOwnerId: e.captureOwnerId ? mapOwner(e.captureOwnerId) : e.captureOwnerId,
    });
  }
  for (const p of save.projectiles) bump(p.id);
  for (const c of save.smokeClouds) bump(c.id);
  for (const w of save.energyShields ?? []) bump(w.id);
  for (const f of save.fires) bump(f.id);
  for (const m of save.mines) bump(m.id);
  for (const c of save.crates) bump(c.id);

  const state: MatchState = {
    roomId: opts.roomId,
    mapId: map.id,
    tick: save.tick,
    gameSpeed: clampGameSpeed(save.gameSpeed),
    nextId,
    tileSize: map.tileSize,
    width: map.width,
    height: map.height,
    blocked: grids.blocked,
    terrain: grids.terrain,
    heights: grids.heights,
    scrapYield: grids.scrapYield,
    occupy: grids.occupy,
    sightOccupy: new Int32Array(n),
    wreckBlock: new Uint8Array(n),
    fortBlock: new Uint8Array(n),
    bridgeDeck: new Uint8Array(n),
    fortOwner: new Map(),
    players,
    entities,
    projectiles: save.projectiles.map((p) => ({ ...p, ownerId: mapOwner(p.ownerId) })),
    smokeClouds: save.smokeClouds.map((c) => ({ ...c })),
    energyShields: (save.energyShields ?? []).map((w) => ({ ...w, ownerId: mapOwner(w.ownerId) })),
    fires: save.fires.map((f) => ({ ...f, ownerId: mapOwner(f.ownerId) })),
    mines: save.mines.map((m) => ({ ...m, ownerId: mapOwner(m.ownerId) })),
    crates: save.crates.map((c) => ({ ...c, ownerId: mapOwner(c.ownerId) })),
    impacts: [],
    launches: [],
    blinks: [],
    rngState: save.rngState >>> 0,
    winner: save.winner ? { playerId: mapOwner(save.winner.playerId), team: save.winner.team } : undefined,
    ended: save.ended,
    initialHumans: save.initialHumans,
    pendingComms: save.pendingComms.slice(),
    visionTick: -1,
    visionByPlayer: new Map(),
    visionKeyByPlayer: new Map(),
    smokeMask: new Uint8Array(n),
    smokeMaskTick: -1,
    hullMask: new Int32Array(n),
    seeTick: -1,
    seeByPlayer: new Map(),
    clearedTrees: cleared,
    clutterHp,
    bodies: save.bodies.map((b) => ({ ...b })),
    holes: save.holes.map((h) => ({ ...h })),
    blast,
    dug,
    digRev: 0,
    scrapRev: 0,
    sceneryRev: 0,
    sceneryKey: 0,
    sceneryKeyTick: -1,
    phaseRev: 0,
    paused: false,
  };
  for (const e of entities.values()) occupyEntity(state, e);
  restampForts(state);
  restampBridges(state);
  return { ok: true, value: { state, save } };
}

/** Point the room at the loaded fight. The human seat takes the current session. */
export function applySaveSeats(room: RoomState, save: SaveGame, humanPlayerId: string, humanName: string): void {
  room.mapId = save.mapId;
  room.mode = "skirmish";
  room.phase = "playing";
  room.hostId = humanPlayerId;
  room.maxSlots = Math.max(MIN_SLOTS, Math.min(MAX_SLOTS, Math.floor(save.maxSlots)));
  for (const slot of room.slots) {
    const src = save.seats.find((s) => s.index === slot.index);
    delete slot.playerId;
    delete slot.name;
    delete slot.ai;
    delete slot.faction;
    if (!src) {
      slot.status = "closed";
      slot.colorId = slot.index;
      slot.team = 0;
      slot.spawnId = 0;
      slot.ready = false;
      continue;
    }
    const human = src.status === "human" && src.playerId === save.humanId;
    slot.status = human ? "human" : src.status === "human" ? "closed" : src.status;
    slot.colorId = src.colorId;
    slot.team = src.team;
    slot.spawnId = src.spawnId;
    if (src.faction) slot.faction = src.faction;
    slot.ready = slot.status === "human" || slot.status === "ai";
    if (human) {
      slot.playerId = humanPlayerId;
      slot.name = humanName.slice(0, 24) || src.name;
    } else if (slot.status === "ai" && src.playerId) {
      slot.status = "ai";
      slot.playerId = src.playerId;
      slot.name = src.name;
      // Saves from before the CPU types carry "easy": that CPU plays on as Defensive.
      slot.ai = isAiDifficulty(src.ai) ? src.ai : "defensive";
      slot.ready = true;
    }
  }
}

/**
 * Saves from before the factions were renamed: the Borg Drone is the Xenomorph Drone now, and the
 * faction ids "eu" and "borg" read as "alliance" and "xeno".
 */
function migrateNames(raw: object): object {
  const s = JSON.parse(JSON.stringify(raw).replace(/"borgdrone"/g, '"xenodrone"')) as {
    players?: unknown;
    seats?: unknown;
  };
  for (const list of [s.players, s.seats]) {
    if (!Array.isArray(list)) continue;
    for (const p of list) {
      if (p && typeof p === "object" && "faction" in p) p.faction = migrateFaction(p.faction);
    }
  }
  return s;
}

function parseSave(raw: unknown): SaveResult<SaveGame> {
  if (!raw || typeof raw !== "object") return fail("That save cannot be read.");
  const s = migrateNames(raw) as Partial<SaveGame>;
  if (s.v !== SAVE_VERSION) return fail("That save is from another version.");
  if (typeof s.mapId !== "string" || s.mapId.length < 1 || s.mapId.length > 80) return fail("That save's map is missing.");
  if (typeof s.humanId !== "string" || s.humanId.length < 1 || s.humanId.length > 80) return fail("That save has no commander.");
  if (!num(s.savedAt) || !num(s.tick) || !num(s.gameSpeed) || !num(s.nextId) || !num(s.rngState)) {
    return fail("That save cannot be read.");
  }
  if (typeof s.ended !== "boolean" || !num(s.initialHumans) || !num(s.maxSlots)) return fail("That save cannot be read.");
  if (!Array.isArray(s.players) || s.players.length < 1 || s.players.length > MAX_SLOTS) return fail("That save cannot be read.");
  if (!s.players.some((p) => p && typeof p === "object" && (p as SimPlayer).playerId === s.humanId)) {
    return fail("That save has no commander to take.");
  }
  for (const p of s.players) {
    if (!playerOk(p)) return fail("That save cannot be read.");
  }
  if (!arrayOf(s.entities, MAX_ENTITIES, entityOk)) return fail("That save cannot be read.");
  if (!arrayOf(s.projectiles, MAX_PROJECTILES, (p) => idOwned(p))) return fail("That save cannot be read.");
  if (!arrayOf(s.smokeClouds, MAX_CLOUDS, (c) => idOnly(c))) return fail("That save cannot be read.");
  if (s.energyShields != null && !arrayOf(s.energyShields, MAX_CLOUDS, (w) => idOwned(w))) return fail("That save cannot be read.");
  if (!arrayOf(s.fires, MAX_FIRES, (f) => idOwned(f))) return fail("That save cannot be read.");
  if (!arrayOf(s.mines, MAX_MINES, (m) => idOwned(m))) return fail("That save cannot be read.");
  if (!arrayOf(s.crates, MAX_CRATES, (c) => idOwned(c))) return fail("That save cannot be read.");
  if (!arrayOf(s.bodies, MAX_BODIES, (b) => !!b && typeof b === "object")) return fail("That save cannot be read.");
  if (!arrayOf(s.holes, MAX_HOLES, (h) => !!h && typeof h === "object")) return fail("That save cannot be read.");
  if (!arrayOf(s.clearedTrees, MAX_TREES, treeOk)) return fail("That save cannot be read.");
  if (!Array.isArray(s.pendingComms) || s.pendingComms.length > MAX_COMMS) return fail("That save cannot be read.");
  if (!s.pendingComms.every((c) => typeof c === "string" && c.length <= 200)) return fail("That save cannot be read.");
  if (!Array.isArray(s.scrap) || s.scrap.length > MAX_SCRAP) return fail("That save cannot be read.");
  for (const cell of s.scrap) {
    if (!Array.isArray(cell) || cell.length !== 2 || !num(cell[0]) || !num(cell[1])) return fail("That save cannot be read.");
  }
  for (const list of [s.dug, s.blast]) {
    if (list === undefined) continue;
    if (!Array.isArray(list) || list.length > MAX_SCRAP) return fail("That save cannot be read.");
    for (const cell of list) {
      if (!Array.isArray(cell) || cell.length !== 2 || !num(cell[0]) || !num(cell[1])) return fail("That save cannot be read.");
    }
  }
  if (!Array.isArray(s.seats) || s.seats.length !== SLOT_COUNT) return fail("That save cannot be read.");
  const seen = new Set<number>();
  for (const seat of s.seats) {
    if (!seatOk(seat) || seen.has(seat.index)) return fail("That save cannot be read.");
    seen.add(seat.index);
  }
  if (s.winner != null) {
    if (typeof s.winner !== "object" || typeof s.winner.playerId !== "string" || !num(s.winner.team)) {
      return fail("That save cannot be read.");
    }
  }
  return { ok: true, value: s as SaveGame };
}

function num(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function arrayOf<T>(v: unknown, max: number, ok: (item: unknown) => item is T): v is T[] {
  return Array.isArray(v) && v.length <= max && v.every(ok);
}

/** Drop a saved latch that names a unit continuous production refuses. Older saves omit it. */
function cleanContinuous(v: unknown): TrainType[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: TrainType[] = [];
  for (const item of v) {
    if (typeof item === "string" && canContinuousTrain(item) && !out.includes(item)) out.push(item);
  }
  return out.length > 0 ? out : undefined;
}

function playerOk(v: unknown): v is SimPlayer {
  if (!v || typeof v !== "object") return false;
  const p = v as SimPlayer;
  return typeof p.playerId === "string" && p.playerId.length > 0 && p.playerId.length <= 80
    && typeof p.name === "string"
    && num(p.colorId) && num(p.team) && typeof p.alive === "boolean"
    && num(p.scrap) && num(p.hqId)
    && (p.faction == null || isFaction(p.faction));
}

function entityOk(v: unknown): v is Entity {
  if (!v || typeof v !== "object") return false;
  const e = v as Entity;
  return num(e.id) && (e.kind === "unit" || e.kind === "building")
    && typeof e.type === "string" && typeof e.ownerId === "string"
    && num(e.x) && num(e.y) && num(e.hp) && num(e.hpMax)
    && Array.isArray(e.waypoints) && Array.isArray(e.garrison) && Array.isArray(e.crits)
    && (e.order === null || (!!e.order && typeof e.order === "object"));
}

function idOnly(v: unknown): v is { id: number } {
  return !!v && typeof v === "object" && num((v as { id: unknown }).id);
}

function idOwned(v: unknown): v is { id: number; ownerId: string } {
  if (!v || typeof v !== "object") return false;
  const o = v as { id?: unknown; ownerId?: unknown };
  return num(o.id) && typeof o.ownerId === "string";
}

function treeOk(v: unknown): v is { x: number; y: number; burn?: true } {
  if (!v || typeof v !== "object") return false;
  const t = v as { x: unknown; y: unknown; burn?: unknown };
  return num(t.x) && num(t.y) && (t.burn === undefined || t.burn === true);
}

function seatOk(v: unknown): v is SaveSeat {
  if (!v || typeof v !== "object") return false;
  const s = v as SaveSeat;
  if (!Number.isInteger(s.index) || s.index < 0 || s.index >= SLOT_COUNT) return false;
  if (s.status !== "open" && s.status !== "human" && s.status !== "closed" && s.status !== "ai") return false;
  if (!Number.isInteger(s.colorId) || s.colorId < 0 || s.colorId > 7) return false;
  if (!Number.isInteger(s.team) || s.team < 0 || s.team > 4) return false;
  if (!Number.isInteger(s.spawnId) || s.spawnId < 0 || s.spawnId > SLOT_COUNT) return false;
  if (s.playerId != null && (typeof s.playerId !== "string" || s.playerId.length > 80)) return false;
  if (s.name != null && typeof s.name !== "string") return false;
  if (s.faction != null && !isFaction(s.faction)) return false;
  // "easy" is the type older saves carry; it loads as Defensive.
  if (s.ai != null && (s.ai as string) !== "easy" && !isAiDifficulty(s.ai)) return false;
  return true;
}
