import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { HEIGHT_BASE, HEIGHT_STEP_MAX, TILE_SUBDIV } from "./catalog.js";
import {
  buildCustomMap,
  decodeRuns,
  encodeRuns,
  loadCustomMap,
  specFromMap,
  validateCustomMap,
  type CustomMapSpec,
} from "./custom-maps.js";
import { createRoom, hostSlot, joinRoom, setMap, startMatch, startPreconditions, updateSelf } from "./lobby.js";
import {
  SPAWN_PAD_R,
  TILE_EMPTY,
  TILE_ROCK,
  TILE_TREE,
  TILE_WATER,
  getMap,
  heightAt,
  isBuiltinMap,
  listMaps,
  registerMap,
  tileAt,
  unregisterMap,
} from "./maps.js";
import { createMatch } from "./sim/match.js";

const SIDE = 48 * TILE_SUBDIV;

function sheet(over: Partial<CustomMapSpec> = {}): CustomMapSpec {
  const n = SIDE * SIDE;
  return {
    id: "c-testmap01",
    name: "Test Ground",
    author: "Tester",
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
    updatedAt: 1,
    ...over,
  };
}

function maxStep(map: { width: number; height: number; heights: number[] }): number {
  let worst = 0;
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const h = map.heights[y * map.width + x]!;
      if (x + 1 < map.width) worst = Math.max(worst, Math.abs(h - map.heights[y * map.width + x + 1]!));
      if (y + 1 < map.height) worst = Math.max(worst, Math.abs(h - map.heights[(y + 1) * map.width + x]!));
    }
  }
  return worst;
}

describe("custom map runs", () => {
  it("round-trips a grid through run-length coding", () => {
    const grid = [0, 0, 0, 3, 3, 5, 0, 0];
    const runs = encodeRuns(grid);
    assert.deepEqual(runs, [0, 3, 3, 2, 5, 1, 0, 2]);
    assert.deepEqual(decodeRuns(runs, grid.length), grid);
  });

  it("rejects runs that miss or overrun the grid", () => {
    assert.equal(decodeRuns([0, 3], 4), null);
    assert.equal(decodeRuns([0, 5], 4), null);
    assert.equal(decodeRuns([0, 0, 1, 4], 4), null);
    assert.equal(decodeRuns("nope", 4), null);
  });
});

describe("custom map validation", () => {
  it("accepts a clean sheet", () => {
    const r = validateCustomMap(sheet());
    assert.equal(r.ok, true);
  });

  it("asks for every start position", () => {
    const r = validateCustomMap(sheet({ maxPlayers: 3 }));
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.message, /Place all 3 start positions/);
  });

  it("refuses starts that would share a pad", () => {
    const r = validateCustomMap(sheet({ spawns: [{ id: 1, x: 30, y: 30 }, { id: 2, x: 40, y: 30 }] }));
    assert.equal(r.ok, false);
  });

  it("refuses a house on a start, overlapping houses, and an off-grid house", () => {
    const onPad = validateCustomMap(sheet({ features: [{ type: "cottage", x: 28, y: 28, facing: 0 }] }));
    assert.equal(onPad.ok, false);
    const overlap = validateCustomMap(
      sheet({
        features: [
          { type: "house", x: 96, y: 96, facing: 0 },
          { type: "cottage", x: 100, y: 100, facing: 1 },
        ],
      }),
    );
    assert.equal(overlap.ok, false);
    const offGrid = validateCustomMap(sheet({ features: [{ type: "cottage", x: 97, y: 96, facing: 0 }] }));
    assert.equal(offGrid.ok, false);
  });

  it("refuses a built-in id and unknown ground", () => {
    assert.equal(validateCustomMap(sheet({ id: "yard-64" })).ok, false);
    const n = SIDE * SIDE;
    assert.equal(validateCustomMap(sheet({ tiles: encodeRuns(new Array(n).fill(99)) })).ok, false);
  });

  it("copies Scrap Yard into a sheet that saves", () => {
    const spec = specFromMap("yard-64", { id: "c-yardcopy1", name: "Yard copy", author: "T" });
    assert.ok(spec);
    const r = validateCustomMap(spec);
    assert.equal(r.ok, true, r.ok ? "" : r.message);
    if (r.ok) assert.equal(r.spec.maxPlayers, 8);
  });
});

describe("building a custom map", () => {
  it("clears and levels every start pad", () => {
    const n = SIDE * SIDE;
    const tiles = new Array(n).fill(TILE_TREE);
    const heights = new Array(n).fill(HEIGHT_BASE);
    for (let i = 0; i < n; i++) heights[i] = HEIGHT_BASE + ((i % SIDE) % 3);
    const map = buildCustomMap(sheet({ tiles: encodeRuns(tiles), heights: encodeRuns(heights) }));
    for (const s of map.spawns) {
      const z = heightAt(map, s.x, s.y);
      for (let dy = -SPAWN_PAD_R; dy <= SPAWN_PAD_R; dy++) {
        for (let dx = -SPAWN_PAD_R; dx <= SPAWN_PAD_R; dx++) {
          if (Math.hypot(dx, dy) > SPAWN_PAD_R) continue;
          assert.equal(tileAt(map, s.x + dx, s.y + dy), TILE_EMPTY);
          assert.equal(heightAt(map, s.x + dx, s.y + dy), z);
        }
      }
    }
  });

  it("drops water to the floor and ramps the banks one step at a time", () => {
    const n = SIDE * SIDE;
    const tiles = new Array(n).fill(TILE_EMPTY);
    const heights = new Array(n).fill(20);
    for (let y = 90; y < 100; y++) for (let x = 90; x < 100; x++) tiles[y * SIDE + x] = TILE_WATER;
    const map = buildCustomMap(sheet({ tiles: encodeRuns(tiles), heights: encodeRuns(heights) }));
    assert.equal(heightAt(map, 95, 95), 0);
    assert.ok(maxStep(map) <= HEIGHT_STEP_MAX, `step ${maxStep(map)}`);
    assert.equal(map.maxHeight, 20);
  });

  it("levels a house lot on rolling ground", () => {
    const n = SIDE * SIDE;
    const heights = new Array(n).fill(0);
    for (let y = 0; y < SIDE; y++) for (let x = 0; x < SIDE; x++) heights[y * SIDE + x] = Math.min(30, Math.floor(x / 4));
    const map = buildCustomMap(
      sheet({ heights: encodeRuns(heights), features: [{ type: "house", x: 96, y: 96, facing: 0 }] }),
    );
    const z = heightAt(map, 96, 96);
    for (let y = 96; y < 108; y++) for (let x = 96; x < 108; x++) assert.equal(heightAt(map, x, y), z);
    assert.ok(maxStep(map) <= HEIGHT_STEP_MAX);
  });

  it("is idempotent, so the builder can save what it shows", () => {
    const n = SIDE * SIDE;
    const tiles = new Array(n).fill(TILE_EMPTY);
    for (let i = 0; i < n; i += 7) tiles[i] = TILE_ROCK;
    const heights = new Array(n).fill(0).map((_, i) => (i * 13) % 30);
    const once = buildCustomMap(sheet({ tiles: encodeRuns(tiles), heights: encodeRuns(heights) }));
    const twice = buildCustomMap(sheet({ tiles: encodeRuns(once.tiles), heights: encodeRuns(once.heights) }));
    assert.deepEqual(twice.heights, once.heights);
    assert.deepEqual(twice.tiles, once.tiles);
  });
});

describe("custom map registry", () => {
  it("registers after the built-ins and refuses a built-in id", () => {
    const loaded = loadCustomMap(sheet({ id: "c-registry01", name: "Aardvark" }));
    assert.equal(loaded.ok, true);
    try {
      assert.equal(getMap("c-registry01")?.name, "Aardvark");
      const ids = listMaps().map((m) => m.id);
      assert.equal(ids[0], "yard-64");
      assert.ok(ids.includes("c-registry01"));
      assert.equal(isBuiltinMap("c-registry01"), false);
      assert.equal(registerMap({ ...getMap("yard-64")!, name: "Hijack" }), false);
      assert.equal(getMap("yard-64")?.name, "Scrap Yard");
      assert.equal(getMap("constructor"), undefined);
    } finally {
      unregisterMap("c-registry01");
    }
    assert.equal(getMap("c-registry01"), undefined);
  });

  it("starts a match on a custom map with a Rig on each start", () => {
    const loaded = loadCustomMap(sheet({ id: "c-matchmap01" }));
    assert.equal(loaded.ok, true);
    try {
      const made = createRoom({ id: "CUST", hostId: "A", hostName: "A", mapId: "c-matchmap01", maxSlots: 8, mode: "skirmish" });
      if (!made.ok) throw new Error(made.message);
      const room = made.value;
      assert.equal(hostSlot(room, "A", 1, { status: "ai" }).ok, true);
      const started = startMatch(room, "A");
      if (!started.ok) throw new Error(started.message);
      const state = createMatch(room, started.value);
      const rigs = [...state.entities.values()].filter((e) => e.type === "rig");
      assert.equal(rigs.length, 2);
      assert.equal(state.width, SIDE);
    } finally {
      unregisterMap("c-matchmap01");
    }
  });

  it("seats a lobby to the map's starts", () => {
    const loaded = loadCustomMap(sheet({ id: "c-seats0001" }));
    assert.equal(loaded.ok, true);
    try {
      const made = createRoom({ id: "SEAT", hostId: "A", hostName: "A", mapId: "c-seats0001", maxSlots: 8 });
      if (!made.ok) throw new Error(made.message);
      const room = made.value;
      assert.equal(room.maxSlots, 2);
      assert.equal(joinRoom(room, "B", "B").ok, true);
      assert.equal(joinRoom(room, "C", "C").ok, false);
      assert.equal(setMap(room, "A", "yard-64").ok, true);
      assert.equal(joinRoom(room, "C", "C").ok, false, "closed seats stay closed until the host opens them");
      assert.equal(hostSlot(room, "A", 2, { status: "open" }).ok, true);
      assert.equal(joinRoom(room, "C", "C").ok, true);
      assert.equal(setMap(room, "A", "c-seats0001").ok, true);
      assert.equal(room.slots.filter((s) => s.status === "open").length, 0);
      assert.equal(hostSlot(room, "A", 5, { status: "ai" }).ok, false);
    } finally {
      unregisterMap("c-seats0001");
    }
  });

  it("will not start more commanders than the map has starts", () => {
    const loaded = loadCustomMap(sheet({ id: "c-crowded01" }));
    assert.equal(loaded.ok, true);
    try {
      const made = createRoom({ id: "CROWD", hostId: "A", hostName: "A", mapId: "yard-64", maxSlots: 8, mode: "skirmish" });
      if (!made.ok) throw new Error(made.message);
      const room = made.value;
      updateSelf(room, "A", { ready: true });
      assert.equal(hostSlot(room, "A", 1, { status: "ai" }).ok, true);
      assert.equal(hostSlot(room, "A", 2, { status: "ai" }).ok, true);
      assert.equal(setMap(room, "A", "c-crowded01").ok, true);
      const pre = startPreconditions(room);
      assert.equal(pre.ok, false);
      if (!pre.ok) assert.equal(pre.code, "too_many");
    } finally {
      unregisterMap("c-crowded01");
    }
  });
});
