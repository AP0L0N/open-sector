import { getMap, matchClock, type CustomMapSpec, type SaveGame } from "@gridlock/shared";

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

/** Skirmish and Map Builder play test each keep one autosave, overwritten in place. */
export type AutosaveKind = "skirmish" | "playtest";
export const AUTOSAVE_EVERY_MS = 5 * 60 * 1000;

export interface Autosave {
  savedAt: number;
  mapId: string;
  tick: number;
  save: SaveGame;
  /** Play test only: the sheet as it was tested, so the fight can be rebuilt after the builder moved on. */
  map?: CustomMapSpec;
}

export interface AutosaveStore extends SaveStore {
  removeItem(key: string): void;
}

export function autosaveKey(kind: AutosaveKind): string {
  return `gridlock.autosave.${kind}`;
}

function parseAutosave(raw: string | null): Autosave | null {
  if (!raw) return null;
  try {
    const a = JSON.parse(raw) as Autosave;
    if (!a || typeof a !== "object") return null;
    if (typeof a.savedAt !== "number" || typeof a.mapId !== "string" || typeof a.tick !== "number") return null;
    if (!a.save || typeof a.save !== "object") return null;
    return a;
  } catch {
    return null;
  }
}

/** The last good autosave. A write cut short leaves the backup, which is read instead. */
export function readAutosave(kind: AutosaveKind, storage: AutosaveStore): Autosave | null {
  const key = autosaveKey(kind);
  try {
    return parseAutosave(storage.getItem(key)) ?? parseAutosave(storage.getItem(`${key}.bak`));
  } catch {
    return null;
  }
}

/**
 * Replace the autosave without ever holding no good copy: the old one is kept
 * as a backup, the new one is written and read back, and only then is the
 * backup dropped. Any failure puts the old one back.
 */
export function writeAutosave(
  kind: AutosaveKind,
  entry: Autosave,
  storage: AutosaveStore,
): { ok: true } | { ok: false; message: string } {
  const key = autosaveKey(kind);
  const bak = `${key}.bak`;
  const text = JSON.stringify(entry);
  let old: string | null;
  try {
    old = storage.getItem(key);
    // A good backup left by a failed write outranks a damaged main copy.
    if (!parseAutosave(old)) old = storage.getItem(bak);
    if (parseAutosave(old)) storage.setItem(bak, old!);
    else old = null;
  } catch {
    return { ok: false, message: "Autosave failed: no room to back up the last one." };
  }
  try {
    storage.setItem(key, text);
    if (storage.getItem(key) !== text) throw new Error("readback");
  } catch {
    try {
      if (old !== null) storage.setItem(key, old);
      else storage.removeItem(key);
    } catch {
      // The backup still stands and is read in its place.
    }
    return { ok: false, message: "Autosave failed. The last one is kept." };
  }
  try {
    storage.removeItem(bak);
  } catch {
    // A stale backup is harmless: the main copy is good and read first.
  }
  return { ok: true };
}
