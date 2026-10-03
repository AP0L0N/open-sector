import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { loadCustomMap, unregisterMap, type CustomMapSpec, type ErrorCode } from "@gridlock/shared";

/** Stored maps, all authors together. */
export const MAX_CUSTOM_MAPS = 200;

interface StoredMap {
  spec: CustomMapSpec;
  /** sha256 of the author's map key. The key itself never touches disk. */
  owner: string;
}

export type StoreResult<T> = { ok: true; value: T } | { ok: false; code: ErrorCode; message: string };

function keyHash(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

function validKey(key: unknown): key is string {
  return typeof key === "string" && key.length >= 16 && key.length <= 128;
}

/**
 * Map Builder maps. Every map loaded here is registered with the shared map
 * table, so lobbies and matches find it with `getMap` like a built-in one.
 * `dir` null keeps maps in memory only (tests).
 */
export class MapStore {
  private readonly maps = new Map<string, StoredMap>();

  constructor(readonly dir: string | null) {}

  /** Read every stored map. A file that no longer validates is skipped. */
  load(): number {
    if (!this.dir || !fs.existsSync(this.dir)) return 0;
    for (const name of fs.readdirSync(this.dir)) {
      if (!name.endsWith(".json")) continue;
      try {
        const raw = JSON.parse(fs.readFileSync(path.join(this.dir, name), "utf8")) as Partial<StoredMap>;
        const loaded = loadCustomMap(raw.spec);
        if (!loaded.ok || typeof raw.owner !== "string") continue;
        this.maps.set(loaded.spec.id, { spec: loaded.spec, owner: raw.owner });
      } catch {
        /* unreadable file: leave it for a human */
      }
    }
    return this.maps.size;
  }

  list(): CustomMapSpec[] {
    return [...this.maps.values()].map((m) => m.spec);
  }

  has(id: string): boolean {
    return this.maps.has(id);
  }

  save(raw: unknown, key: unknown, author: string, now = Date.now()): StoreResult<CustomMapSpec> {
    if (!validKey(key)) return { ok: false, code: "bad_payload", message: "Missing map key." };
    const id = (raw as { id?: unknown } | null)?.id;
    const prior = typeof id === "string" ? this.maps.get(id) : undefined;
    if (prior && prior.owner !== keyHash(key)) {
      return { ok: false, code: "map_owner", message: "Only the map's author can overwrite it. Save a copy instead." };
    }
    if (!prior && this.maps.size >= MAX_CUSTOM_MAPS) {
      return { ok: false, code: "map_cap", message: "The map store is full." };
    }
    const loaded = loadCustomMap({ ...(raw as object), author, updatedAt: now });
    if (!loaded.ok) return { ok: false, code: "map_invalid", message: loaded.message };
    const stored: StoredMap = { spec: loaded.spec, owner: prior?.owner ?? keyHash(key) };
    this.maps.set(loaded.spec.id, stored);
    this.write(stored);
    return { ok: true, value: loaded.spec };
  }

  remove(id: string, key: unknown): StoreResult<void> {
    const prior = this.maps.get(id);
    if (!prior) return { ok: false, code: "no_map", message: "Unknown map." };
    if (!validKey(key) || prior.owner !== keyHash(key)) {
      return { ok: false, code: "map_owner", message: "Only the map's author can delete it." };
    }
    this.maps.delete(id);
    unregisterMap(id);
    if (this.dir) fs.rmSync(this.file(id), { force: true });
    return { ok: true, value: undefined };
  }

  private file(id: string): string {
    return path.join(this.dir!, `${id}.json`);
  }

  private write(stored: StoredMap): void {
    if (!this.dir) return;
    fs.mkdirSync(this.dir, { recursive: true });
    const target = this.file(stored.spec.id);
    const tmp = `${target}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(stored));
    fs.renameSync(tmp, target);
  }
}
