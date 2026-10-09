import { getMap, matchClock, type SaveGame } from "@gridlock/shared";

const KEY = "gridlock.saves";
export const SAVE_SLOT_MAX = 12;

export interface SaveStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface SaveSlot {
  id: string;
  name: string;
  savedAt: number;
  mapId: string;
  tick: number;
  save: SaveGame;
}

export function newSaveId(): string {
  return `s${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}

/** Name offered in the save field: the map, then the match clock. */
export function suggestSaveName(mapId: string, tick: number): string {
  const map = getMap(mapId)?.name ?? "Skirmish";
  return `${map} ${matchClock(tick, getMap(mapId)?.night).text}`.slice(0, 32);
}

export function cleanSaveName(raw: string, fallback: string): string {
  const cleaned = raw.replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, 32);
  return cleaned || fallback;
}

export function readSaveSlots(storage: SaveStore): SaveSlot[] {
  let raw: string | null;
  try {
    raw = storage.getItem(KEY);
  } catch {
    return [];
  }
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isSlot);
  } catch {
    return [];
  }
}

export function writeSaveSlots(slots: SaveSlot[], storage: SaveStore): { ok: true } | { ok: false; message: string } {
  try {
    storage.setItem(KEY, JSON.stringify(slots));
    return { ok: true };
  } catch {
    return { ok: false, message: "This browser could not store that save." };
  }
}

/** Insert or replace `slot`. A new id past the cap is refused so an older fight can be overwritten. */
export function putSaveSlot(
  slots: SaveSlot[],
  slot: SaveSlot,
  max = SAVE_SLOT_MAX,
): { ok: true; slots: SaveSlot[] } | { ok: false; message: string } {
  const next = slots.filter((s) => s.id !== slot.id);
  if (next.length >= max) return { ok: false, message: "The save list is full. Overwrite one." };
  next.unshift(slot);
  return { ok: true, slots: next };
}

export function dropSaveSlot(slots: SaveSlot[], id: string): SaveSlot[] {
  return slots.filter((s) => s.id !== id);
}

function isSlot(v: unknown): v is SaveSlot {
  if (!v || typeof v !== "object") return false;
  const s = v as SaveSlot;
  return typeof s.id === "string" && s.id.length > 0
    && typeof s.name === "string"
    && typeof s.savedAt === "number"
    && typeof s.mapId === "string"
    && typeof s.tick === "number"
    && !!s.save && typeof s.save === "object";
}
