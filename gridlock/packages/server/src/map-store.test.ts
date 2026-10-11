import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import {
  HEIGHT_BASE,
  TILE_EMPTY,
  TILE_SUBDIV,
  encodeRuns,
  getMap,
  unregisterMap,
  type CustomMapSpec,
  type ServerMessage,
} from "@gridlock/shared";
import { MapStore } from "./map-store.js";
import { Hub } from "./room.js";

const SIDE = 48 * TILE_SUBDIV;
const KEY_A = "a".repeat(32);
const KEY_B = "b".repeat(32);

function sheet(id: string, name = "Hill Fight"): CustomMapSpec {
  const n = SIDE * SIDE;
  return {
    id,
    name,
    author: "",
    width: SIDE,
    height: SIDE,
    maxPlayers: 2,
    tiles: encodeRuns(new Array(n).fill(TILE_EMPTY)),
    heights: encodeRuns(new Array(n).fill(HEIGHT_BASE)),
    spawns: [
      { id: 1, x: 30, y: 30 },
      { id: 2, x: SIDE - 30, y: SIDE - 30 },
    ],
    features: [],
    updatedAt: 0,
  };
}

function client(hub: Hub, id: string) {
  const inbox: ServerMessage[] = [];
  hub.connect(id, (m) => inbox.push(m));
  return {
    inbox,
    of: <T extends ServerMessage["type"]>(type: T) =>
      inbox.filter((m): m is Extract<ServerMessage, { type: T }> => m.type === type),
  };
}

describe("map store", () => {
  it("writes a map to disk and loads it back into the map table", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gridlock-maps-"));
    try {
      const store = new MapStore(dir);
      const saved = store.save(sheet("c-disk00001"), KEY_A, "Alpha", 1234);
      assert.equal(saved.ok, true);
      const onDisk = JSON.parse(fs.readFileSync(path.join(dir, "c-disk00001.json"), "utf8"));
      assert.equal(onDisk.spec.author, "Alpha");
      assert.equal(onDisk.spec.updatedAt, 1234);
      assert.ok(!JSON.stringify(onDisk).includes(KEY_A));
      unregisterMap("c-disk00001");
      assert.equal(getMap("c-disk00001"), undefined);
      const again = new MapStore(dir);
      assert.equal(again.load(), 1);
      assert.equal(getMap("c-disk00001")?.name, "Hill Fight");
      assert.equal(again.remove("c-disk00001", KEY_A).ok, true);
      assert.equal(fs.existsSync(path.join(dir, "c-disk00001.json")), false);
      assert.equal(getMap("c-disk00001"), undefined);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
      unregisterMap("c-disk00001");
    }
  });

  it("lets only the author's key overwrite or delete", () => {
    const store = new MapStore(null);
    try {
      assert.equal(store.save(sheet("c-owned0001"), KEY_A, "Alpha").ok, true);
      const steal = store.save(sheet("c-owned0001", "Mine now"), KEY_B, "Bravo");
      assert.equal(steal.ok, false);
      if (!steal.ok) assert.equal(steal.code, "map_owner");
      assert.equal(store.remove("c-owned0001", KEY_B).ok, false);
      assert.equal(store.save(sheet("c-owned0001", "Renamed"), KEY_A, "Alpha").ok, true);
      assert.equal(getMap("c-owned0001")?.name, "Renamed");
    } finally {
      unregisterMap("c-owned0001");
    }
  });

  it("refuses a built-in map id", () => {
    const store = new MapStore(null);
    const r = store.save({ ...sheet("c-x"), id: "yard-64" }, KEY_A, "Alpha");
    assert.equal(r.ok, false);
    assert.equal(getMap("yard-64")?.name, "Scrap Yard");
  });
});

describe("hub map builder", () => {
  it("sends stored maps on connect and every save to everyone", () => {
    const hub = new Hub(new MapStore(null));
    try {
      const a = client(hub, "A");
      const b = client(hub, "B");
      hub.handle("A", { type: "hello", name: "Alpha" });
      assert.deepEqual(a.of("maps.custom")[0]?.maps, []);
      hub.handle("A", { type: "map.save", map: sheet("c-hubmap001"), key: KEY_A });
      assert.equal(a.of("map.saved")[0]?.id, "c-hubmap001");
      assert.equal(b.of("map.upsert")[0]?.map.author, "Alpha");
      assert.equal(b.of("map.saved").length, 0);
      const c = client(hub, "C");
      assert.equal(c.of("maps.custom")[0]?.maps.length, 1);
      hub.handle("A", { type: "map.delete", id: "c-hubmap001", key: KEY_A });
      assert.equal(b.of("map.removed")[0]?.id, "c-hubmap001");
    } finally {
      unregisterMap("c-hubmap001");
    }
  });

  it("refuses a save while a match runs on the map, and resets lobby starts otherwise", () => {
    const hub = new Hub(new MapStore(null));
    try {
      const a = client(hub, "A");
      const b = client(hub, "B");
      hub.handle("A", { type: "map.save", map: sheet("c-hubmap002"), key: KEY_A });
      hub.handle("B", { type: "room.create", mapId: "c-hubmap002", maxSlots: 2, mode: "skirmish" });
      hub.handle("B", { type: "slot.update", spawnId: 2 });
      assert.equal(hub.rooms.get(hub.sessions.get("B")!.roomId!)!.slots[0]!.spawnId, 2);
      hub.handle("A", { type: "map.save", map: sheet("c-hubmap002", "Second pass"), key: KEY_A });
      const room = hub.rooms.get(hub.sessions.get("B")!.roomId!)!;
      assert.equal(room.slots[0]!.spawnId, 0);
      hub.handle("B", { type: "room.start" });
      assert.equal(b.of("match.start").length, 1);
      hub.handle("A", { type: "map.save", map: sheet("c-hubmap002", "Third pass"), key: KEY_A });
      assert.equal(a.of("room.error").at(-1)?.code, "map_locked");
      assert.equal(getMap("c-hubmap002")?.name, "Second pass");
      hub.handle("A", { type: "map.delete", id: "c-hubmap002", key: KEY_A });
      assert.equal(a.of("room.error").at(-1)?.code, "map_locked");
    } finally {
      hub.shutdown();
      unregisterMap("c-hubmap002");
    }
  });

  it("moves a lobby back to Scrap Yard when its map is deleted", () => {
    const hub = new Hub(new MapStore(null));
    try {
      client(hub, "A");
      const b = client(hub, "B");
      hub.handle("A", { type: "map.save", map: sheet("c-hubmap003"), key: KEY_A });
      hub.handle("B", { type: "room.create", mapId: "c-hubmap003", maxSlots: 2 });
      hub.handle("A", { type: "map.delete", id: "c-hubmap003", key: KEY_A });
      assert.equal(b.of("room.state").at(-1)?.room.mapId, "yard-64");
    } finally {
      unregisterMap("c-hubmap003");
    }
  });

  it("opens a skirmish on the remembered map, CPU and starts", () => {
    const hub = new Hub(new MapStore(null));
    try {
      client(hub, "A");
      const b = client(hub, "B");
      hub.handle("A", { type: "map.save", map: sheet("c-hubmap004"), key: KEY_A });
      hub.handle("B", {
        type: "room.create",
        mapId: "yard-64",
        maxSlots: 8,
        mode: "skirmish",
        setup: {
          mapId: "c-hubmap004",
          host: { faction: "xeno", colorId: 4, team: 1, spawnId: 2 },
          cpus: [
            { index: 3, ai: "aggressive", faction: "bloom", colorId: 0, team: 2, spawnId: 1 },
            { index: 5, ai: "defensive" },
          ],
        },
      });
      const room = b.of("room.state").at(-1)!.room;
      assert.equal(room.mapId, "c-hubmap004");
      assert.deepEqual(
        [room.slots[0]!.faction, room.slots[0]!.colorId, room.slots[0]!.team, room.slots[0]!.spawnId],
        ["xeno", 4, 1, 2],
      );
      const cpu = room.slots[3]!;
      assert.deepEqual([cpu.status, cpu.ai, cpu.faction, cpu.colorId, cpu.team, cpu.spawnId], ["ai", "aggressive", "bloom", 0, 2, 1]);
      // The map seats two: the second CPU has no chair.
      assert.notEqual(room.slots[5]!.status, "ai");
    } finally {
      unregisterMap("c-hubmap004");
    }
  });
});
