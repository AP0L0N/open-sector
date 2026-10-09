import {
  MAX_ROOMS,
  MAX_SLOTS,
  MIN_HUMANS_TO_START,
  MIN_SLOTS,
  SLOT_COUNT,
  isAiDifficulty,
  type AiDifficulty,
  type ErrorCode,
  type RoomMode,
  type RoomState,
  type Slot,
  type SlotStatus,
} from "./protocol.js";
import { COLORS } from "./colors.js";
import { getMap } from "./maps.js";
import { AI_PROFILES } from "./sim/ai-profile.js";

export type LobbyResult<T = void> =
  | { ok: true; value: T }
  | { ok: false; code: ErrorCode; message: string };

const fail = (code: ErrorCode, message: string): LobbyResult<never> => ({
  ok: false,
  code,
  message,
});

const ok = <T>(value: T): LobbyResult<T> => ({ ok: true, value });
const okVoid = (): LobbyResult<void> => ({ ok: true, value: undefined });

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateRoomCode(existing: Set<string>, rng: () => number = Math.random): string {
  for (let attempt = 0; attempt < 64; attempt++) {
    let code = "";
    for (let i = 0; i < 4; i++) {
      code += CODE_CHARS[Math.floor(rng() * CODE_CHARS.length)];
    }
    if (!existing.has(code)) return code;
  }
  throw new Error("room code space exhausted");
}

export function defaultName(playerId: string): string {
  const tail = playerId.replace(/-/g, "").slice(-3).toUpperCase();
  return `Commander-${tail || "000"}`;
}

export function emptySlot(index: number, status: SlotStatus = "open"): Slot {
  return {
    index,
    status,
    colorId: index,
    team: 0,
    spawnId: 0,
    ready: false,
  };
}

export function resetSlot(slot: Slot, status: SlotStatus): void {
  const index = slot.index;
  delete slot.playerId;
  delete slot.name;
  delete slot.ai;
  Object.assign(slot, emptySlot(index, status));
}

export function aiPlayerId(slotIndex: number): string {
  return `ai:${slotIndex}`;
}

export function isAiPlayerId(id: string): boolean {
  return id.startsWith("ai:");
}

export function aiLabel(difficulty: AiDifficulty = "defensive"): string {
  return `${AI_PROFILES[difficulty].label} CPU`;
}

export function createRoom(opts: {
  id: string;
  hostId: string;
  hostName: string;
  mapId: string;
  maxSlots: number;
  mode?: RoomMode;
  now?: number;
}): LobbyResult<RoomState> {
  const mode: RoomMode = opts.mode === "skirmish" ? "skirmish" : "network";
  const map = getMap(opts.mapId);
  if (!map) return fail("no_map", "Unknown map.");
  const maxSlots = Math.min(clampMaxSlots(opts.maxSlots), Math.max(MIN_SLOTS, map.spawns.length));
  const slots = Array.from({ length: SLOT_COUNT }, (_, i) =>
    emptySlot(i, i === 0 ? "human" : i < maxSlots ? "open" : "closed"),
  );
  const host = slots[0]!;
  host.status = "human";
  host.playerId = opts.hostId;
  host.name = opts.hostName;
  host.colorId = 0;
  host.team = 0;
  host.spawnId = 0;
  host.ready = false;
  return ok({
    id: opts.id,
    hostId: opts.hostId,
    mapId: opts.mapId,
    phase: "lobby",
    mode,
    maxSlots,
    slots,
    createdAt: opts.now ?? Date.now(),
  });
}

export function clampMaxSlots(n: number): number {
  if (!Number.isFinite(n)) return MAX_SLOTS;
  return Math.max(MIN_SLOTS, Math.min(MAX_SLOTS, Math.floor(n)));
}

export function humans(room: RoomState): Slot[] {
  return room.slots.filter((s) => s.status === "human" && s.playerId);
}

/** Humans and CPU seats that take a spawn. */
export function commanders(room: RoomState): Slot[] {
  return room.slots.filter((s) => (s.status === "human" || s.status === "ai") && s.playerId);
}

export function usedColors(room: RoomState, exceptPlayerId?: string): Set<number> {
  const set = new Set<number>();
  for (const s of commanders(room)) {
    if (exceptPlayerId && s.playerId === exceptPlayerId) continue;
    set.add(s.colorId);
  }
  return set;
}

export function usedSpawns(room: RoomState, exceptPlayerId?: string): Set<number> {
  const set = new Set<number>();
  for (const s of commanders(room)) {
    if (exceptPlayerId && s.playerId === exceptPlayerId) continue;
    if (s.spawnId > 0) set.add(s.spawnId);
  }
  return set;
}

function firstOpenSlot(room: RoomState): Slot | undefined {
  return room.slots.find((s) => s.status === "open");
}

function firstFreeColor(room: RoomState, exceptPlayerId?: string): number {
  const taken = usedColors(room, exceptPlayerId);
  for (const c of COLORS) {
    if (!taken.has(c.id)) return c.id;
  }
  return 0;
}

export function findPlayerSlot(room: RoomState, playerId: string): Slot | undefined {
  return room.slots.find((s) => s.playerId === playerId);
}

export function joinRoom(room: RoomState, playerId: string, name: string): LobbyResult<void> {
  if (room.phase !== "lobby") return fail("started", "Match already started.");
  if (room.mode === "skirmish") return fail("closed", "Skirmish is single-player.");
  if (findPlayerSlot(room, playerId)) return okVoid();
  const slot = firstOpenSlot(room);
  if (!slot) return fail("full", "Room is full.");
  if (commanders(room).length >= seatsOf(room)) return fail("full", "Every start on this map is taken.");
  slot.status = "human";
  slot.playerId = playerId;
  slot.name = name;
  slot.colorId = firstFreeColor(room, playerId);
  slot.team = 0;
  slot.spawnId = 0;
  slot.ready = false;
  return okVoid();
}

export function leaveRoom(room: RoomState, playerId: string): { emptied: boolean; hostLeft: boolean } {
  const slot = findPlayerSlot(room, playerId);
  if (slot) resetSlot(slot, "open");
  const hostLeft = room.hostId === playerId;
  const emptied = humans(room).length === 0 || hostLeft;
  return { emptied, hostLeft };
}

export function updateSelf(
  room: RoomState,
  playerId: string,
  patch: { colorId?: number; team?: number; spawnId?: number; ready?: boolean },
): LobbyResult<void> {
  if (room.phase !== "lobby") return fail("started", "Match already started.");
  const slot = findPlayerSlot(room, playerId);
  if (!slot) return fail("not_member", "You are not in this room.");

  if (patch.colorId !== undefined) {
    if (!COLORS.some((c) => c.id === patch.colorId)) return fail("bad_payload", "Invalid color.");
    if (usedColors(room, playerId).has(patch.colorId)) {
      return fail("color_taken", "That color is taken.");
    }
    slot.colorId = patch.colorId;
  }
  if (patch.team !== undefined) {
    if (patch.team < 0 || patch.team > 4) return fail("bad_payload", "Team must be 0 (FFA) or 1–4.");
    slot.team = patch.team;
  }
  if (patch.spawnId !== undefined) {
    if (patch.spawnId < 0 || patch.spawnId > SLOT_COUNT) {
      return fail("bad_payload", "Invalid spawn.");
    }
    const map = getMap(room.mapId);
    if (map && patch.spawnId > 0 && !map.spawns.some((s) => s.id === patch.spawnId)) {
      return fail("bad_payload", "Spawn does not exist on this map.");
    }
    if (patch.spawnId > 0 && usedSpawns(room, playerId).has(patch.spawnId)) {
      return fail("spawn_taken", "That start position is taken.");
    }
    slot.spawnId = patch.spawnId;
  }
  if (patch.ready !== undefined) {
    slot.ready = patch.ready;
  }
  return okVoid();
}

export function hostSlot(
  room: RoomState,
  hostId: string,
  slotIndex: number,
  action: {
    status?: SlotStatus;
    kick?: boolean;
    colorId?: number;
    team?: number;
    spawnId?: number;
    /** CPU type to seat, or to switch the CPU already in the slot to. */
    ai?: AiDifficulty;
  },
): LobbyResult<void> {
  if (room.hostId !== hostId) return fail("not_host", "Only the host can do that.");
  if (room.phase !== "lobby") return fail("started", "Match already started.");
  const slot = room.slots[slotIndex];
  if (!slot) return fail("bad_slot", "No such slot.");
  if (action.ai !== undefined && !isAiDifficulty(action.ai)) return fail("bad_payload", "No such CPU type.");

  if (action.kick || action.status === "closed" || action.status === "open" || action.status === "ai") {
    if (slot.playerId === hostId) return fail("bad_slot", "Host cannot kick or close their own slot.");
  }
  if (room.mode === "skirmish" && action.status === "open") {
    return fail("closed", "Skirmish has no human joiners. Add a CPU instead.");
  }

  if (action.kick && slot.playerId) {
    const vacant: SlotStatus = room.mode === "skirmish" ? "closed" : "open";
    resetSlot(slot, vacant);
  }

  if (action.status === "closed") {
    resetSlot(slot, "closed");
  } else if (action.status === "open") {
    if (slot.status === "human") return fail("bad_slot", "Kick the player first.");
    resetSlot(slot, "open");
  } else if (action.status === "ai") {
    if (slot.status === "human") return fail("bad_slot", "Kick the player first.");
    if (slot.status !== "ai" && commanders(room).length >= seatsOf(room)) {
      return fail("too_many", `This map seats ${seatsOf(room)}.`);
    }
    if (slot.status === "ai") setAiType(slot, action.ai ?? slot.ai ?? "defensive");
    else fillAiSlot(room, slot, action.ai ?? "defensive");
  } else if (action.ai !== undefined && slot.status === "ai") {
    setAiType(slot, action.ai);
  }

  if (slot.status === "ai") {
    const patched = patchAiSeat(room, slot, action);
    if (!patched.ok) return patched;
  }

  syncMaxSlots(room);
  return okVoid();
}

function fillAiSlot(room: RoomState, slot: Slot, difficulty: AiDifficulty): void {
  slot.status = "ai";
  slot.playerId = aiPlayerId(slot.index);
  setAiType(slot, difficulty);
  slot.ready = true;
  slot.team = 0;
  slot.spawnId = 0;
  slot.colorId = firstFreeColor(room, slot.playerId);
}

function setAiType(slot: Slot, difficulty: AiDifficulty): void {
  slot.ai = difficulty;
  slot.name = aiLabel(difficulty);
}

function patchAiSeat(
  room: RoomState,
  slot: Slot,
  patch: { colorId?: number; team?: number; spawnId?: number },
): LobbyResult<void> {
  if (patch.colorId !== undefined) {
    if (!COLORS.some((c) => c.id === patch.colorId)) return fail("bad_payload", "Invalid color.");
    if (usedColors(room, slot.playerId).has(patch.colorId)) {
      return fail("color_taken", "That color is taken.");
    }
    slot.colorId = patch.colorId;
  }
  if (patch.team !== undefined) {
    if (patch.team < 0 || patch.team > 4) return fail("bad_payload", "Team must be 0 (FFA) or 1–4.");
    slot.team = patch.team;
  }
  if (patch.spawnId !== undefined) {
    if (patch.spawnId < 0 || patch.spawnId > SLOT_COUNT) {
      return fail("bad_payload", "Invalid spawn.");
    }
    const map = getMap(room.mapId);
    if (map && patch.spawnId > 0 && !map.spawns.some((s) => s.id === patch.spawnId)) {
      return fail("bad_payload", "Spawn does not exist on this map.");
    }
    if (patch.spawnId > 0 && usedSpawns(room, slot.playerId).has(patch.spawnId)) {
      return fail("spawn_taken", "That start position is taken.");
    }
    slot.spawnId = patch.spawnId;
  }
  return okVoid();
}

/** Commanders the room's map has starts for. */
function seatsOf(room: RoomState): number {
  return getMap(room.mapId)?.spawns.length ?? SLOT_COUNT;
}

function syncMaxSlots(room: RoomState): void {
  const filled = commanders(room).length + room.slots.filter((s) => s.status === "open").length;
  room.maxSlots = Math.max(MIN_SLOTS, Math.min(MAX_SLOTS, filled));
}

export function setMap(room: RoomState, hostId: string, mapId: string): LobbyResult<void> {
  if (room.hostId !== hostId) return fail("not_host", "Only the host can change the map.");
  if (room.phase !== "lobby") return fail("started", "Match already started.");
  const map = getMap(mapId);
  if (!map) return fail("no_map", "Unknown map.");
  room.mapId = mapId;
  for (const s of room.slots) {
    s.spawnId = 0;
    if (s.status === "human") s.ready = false;
  }
  // Close empty seats the new map has no start for. Seated commanders stay.
  let seats = commanders(room).length + room.slots.filter((s) => s.status === "open").length;
  for (let i = room.slots.length - 1; i >= 0 && seats > map.spawns.length; i--) {
    const slot = room.slots[i]!;
    if (slot.status !== "open") continue;
    resetSlot(slot, "closed");
    seats--;
  }
  syncMaxSlots(room);
  return okVoid();
}

export function startPreconditions(room: RoomState): LobbyResult<void> {
  if (room.phase !== "lobby") return fail("started", "Match already started.");
  const map = getMap(room.mapId);
  if (!map) return fail("no_map", "Unknown map.");
  if (commanders(room).length > map.spawns.length) {
    return fail("too_many", `${map.name} has ${map.spawns.length} start positions.`);
  }
  const filled = humans(room);
  if (filled.length < MIN_HUMANS_TO_START) {
    return fail("too_few", "Need at least one commander.");
  }
  if (room.mode !== "skirmish") {
    const waiting = filled.filter((s) => !s.ready);
    if (waiting.length > 0) {
      const names = waiting.map((s) => s.name ?? "Unknown").join(", ");
      return fail("not_ready", `Waiting for ${names}`);
    }
  }
  return okVoid();
}

/**
 * Resolve spawn ids:
 * 1. Keep unique requested spawnIds.
 * 2. Random / missing each draw one of the remaining ids at random.
 */
export function resolveSpawns(
  room: RoomState,
  rng: () => number = Math.random,
): Map<string, { spawnId: number; x: number; y: number }> {
  const map = getMap(room.mapId);
  if (!map) throw new Error("map missing");
  const filled = commanders(room).slice().sort((a, b) => a.index - b.index);
  const remaining = map.spawns.map((s) => s.id).sort((a, b) => a - b);
  const assigned = new Map<number, Slot>();

  for (const slot of filled) {
    if (slot.spawnId > 0 && remaining.includes(slot.spawnId) && !assigned.has(slot.spawnId)) {
      assigned.set(slot.spawnId, slot);
    }
  }

  const stillNeed = filled.filter((s) => {
    if (s.spawnId > 0 && assigned.get(s.spawnId) === s) return false;
    return true;
  });

  const leftover = remaining.filter((id) => !assigned.has(id));

  for (const slot of stillNeed) {
    if (leftover.length === 0) throw new Error("not enough spawns");
    const pick = Math.min(leftover.length - 1, Math.floor(rng() * leftover.length));
    const id = leftover.splice(pick, 1)[0]!;
    assigned.set(id, slot);
    slot.spawnId = id;
  }

  const out = new Map<string, { spawnId: number; x: number; y: number }>();
  for (const [spawnId, slot] of assigned) {
    const def = map.spawns.find((s) => s.id === spawnId)!;
    out.set(slot.playerId!, { spawnId, x: def.x, y: def.y });
  }
  return out;
}

export function startMatch(
  room: RoomState,
  hostId: string,
  rng: () => number = Math.random,
): LobbyResult<Map<string, { spawnId: number; x: number; y: number }>> {
  if (room.hostId !== hostId) return fail("not_host", "Only the host can start.");
  const pre = startPreconditions(room);
  if (!pre.ok) return pre;
  const resolved = resolveSpawns(room, rng);
  room.phase = "playing";
  return ok(resolved);
}

export function canCreateRoom(roomCount: number): LobbyResult<void> {
  if (roomCount >= MAX_ROOMS) return fail("room_cap", "Server is at room capacity.");
  return okVoid();
}

export function waitingReason(room: RoomState): string | null {
  const pre = startPreconditions(room);
  if (pre.ok) return null;
  return pre.message;
}
