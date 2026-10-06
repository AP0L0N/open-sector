import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { HEIGHT_BASE, HEIGHT_STEP_MAX, TILE_SUBDIV, garrisonCapOf } from "./catalog.js";
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
import { createMatch, step } from "./sim/match.js";
import { enterGarrison } from "./sim/garrison.js";
import { makeEntity, tileCenter } from "./sim/geo.js";
import { spotlightManned } from "./sim/night.js";
import { NEUTRAL_OWNER } from "./catalog.js";
import { featureBox, featureRectsOverlap, isPlaytestMapId } from "./maps.js";
import { isTurnedBuilding, turnedBox } from "./building-rect.js";
import { newPlaytestMapId } from "./custom-maps.js";

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

  it("takes a Vast sheet: five Scrap Yards of ground, and nothing bigger", () => {
    const yard = getMap("yard-64")!;
    const side = 144 * TILE_SUBDIV;
    assert.equal(side * side, 5 * yard.width * yard.height + 64 * 64);
    const n = side * side;
    const vast = {
      width: side,
      height: side,
      tiles: encodeRuns(new Array(n).fill(TILE_EMPTY)),
      heights: encodeRuns(new Array(n).fill(HEIGHT_BASE)),
      spawns: [
        { id: 1, x: 30, y: 30 },
        { id: 2, x: side - 30, y: side - 30 },
      ],
    };
    assert.equal(validateCustomMap(sheet(vast)).ok, true);
    const big = 160 * TILE_SUBDIV;
    const r = validateCustomMap(sheet({ ...vast, width: big, height: big }));
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.message, /Unsupported map size/);
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

describe("map defences and play tests", () => {
  const defences = [
    { type: "tower" as const, x: 64, y: 64, facing: 1 },
    { type: "bunker" as const, x: 96, y: 64, facing: 0 },
    { type: "sandbags" as const, x: 61, y: 121, facing: 0 },
    { type: "wall" as const, x: 101, y: 121, facing: 1 },
  ];

  it("validates defences: lots on the cell grid, sections on any tile", () => {
    const r = validateCustomMap(sheet({ features: defences }));
    assert.equal(r.ok, true, r.ok ? "" : r.message);
    const offGrid = validateCustomMap(sheet({ features: [{ type: "bunker", x: 97, y: 64, facing: 0 }] }));
    assert.equal(offGrid.ok, false);
    const crossed = validateCustomMap(
      sheet({
        features: [
          { type: "wall", x: 100, y: 100, facing: 0 },
          { type: "wall", x: 100, y: 100, facing: 1 },
        ],
      }),
    );
    assert.equal(crossed.ok, false, "two sections crossing on one tile overlap");
    assert.equal(validateCustomMap(sheet({ features: [{ type: "dynamo" as never, x: 64, y: 64, facing: 0 }] })).ok, false);
  });

  it("takes defences turned in 15° steps, and sections between tiles", () => {
    const turned = [
      { type: "bunker" as const, x: 96, y: 64, facing: 0, turn: 3 },
      { type: "wall" as const, x: 100.125, y: 120.5, facing: 0, turn: 9 },
    ];
    const r = validateCustomMap(sheet({ features: turned }));
    assert.equal(r.ok, true, r.ok ? "" : r.message);
    if (r.ok) {
      assert.equal(r.spec.features[0]!.facing, 1, "facing keeps the nearest quarter");
      assert.equal(r.spec.features[1]!.x, 100.125);
    }
    const bad = (f: object): boolean => validateCustomMap(sheet({ features: [f as never] })).ok;
    assert.equal(bad({ type: "cottage", x: 96, y: 64, facing: 0, turn: 3 }), false, "a house turns by quarters only");
    assert.equal(bad({ type: "bunker", x: 96, y: 64, facing: 0, turn: 24 }), false);
    assert.equal(bad({ type: "bunker", x: 96, y: 64, facing: 0, turn: 1.5 }), false);
    assert.equal(bad({ type: "wall", x: 100.5, y: 120, facing: 0 }), false, "an unturned section stays on a tile");
  });

  it("lets slanted sections meet end to end but not cross", () => {
    // Two 45° sections, one length apart along their run.
    const run = 3 / Math.SQRT2;
    const a = { type: "wall" as const, x: 50, y: 50, facing: 0, turn: 3 };
    const b = { ...a, x: 50 + run, y: 50 - run };
    assert.equal(featureRectsOverlap(a, b), false);
    assert.equal(featureRectsOverlap(a, { ...a, turn: 9 }), true, "crossed on one spot");
    assert.equal(featureRectsOverlap(a, { type: "bunker", x: 48, y: 48, facing: 0 }), true);
  });

  it("stands a turned map bunker and a slanted wall the way a player would place them", () => {
    const id = newPlaytestMapId();
    const loaded = loadCustomMap(
      sheet({
        id,
        maxPlayers: 4,
        spawns: [{ id: 1, x: 30, y: 30 }],
        features: [
          { type: "bunker", x: 96, y: 64, facing: 0, turn: 3 },
          { type: "wall", x: 100.5, y: 120.5, facing: 0, turn: 9 },
        ],
      }),
      { playtest: true },
    );
    if (!loaded.ok) throw new Error(loaded.message);
    try {
      const made = createRoom({ id: "TEST", hostId: "A", hostName: "A", mapId: id, maxSlots: 8, mode: "skirmish" });
      if (!made.ok) throw new Error(made.message);
      const started = startMatch(made.value, "A");
      if (!started.ok) throw new Error(started.message);
      const state = createMatch(made.value, started.value);
      const of = (type: string) => [...state.entities.values()].find((e) => e.type === type)!;
      const bunker = of("bunker");
      const wall = of("wall");
      const step15 = Math.PI / 12;
      assert.ok(Math.abs(bunker.facing - 3 * step15) < 1e-9);
      assert.equal(isTurnedBuilding(bunker), true);
      const box = turnedBox("bunker", bunker.facing);
      assert.deepEqual([bunker.tileW, bunker.tileH], [box.w, box.h], "the turned box, like a placed one");
      // The bunker turns about the middle of its 2×2-cell lot.
      assert.ok(Math.hypot(bunker.x - 100 * state.tileSize, bunker.y - 68 * state.tileSize) <= state.tileSize);
      assert.ok(Math.abs(wall.facing - 9 * step15) < 1e-9);
      assert.equal(wall.x, 101 * state.tileSize);
      assert.equal(wall.y, 121 * state.tileSize);
    } finally {
      unregisterMap(id);
    }
  });

  it("gives a section a three-tile run across the way it faces", () => {
    assert.deepEqual(featureBox({ type: "sandbags", x: 10, y: 10, facing: 0 }), { x0: 10, y0: 9, x1: 11, y1: 12 });
    assert.deepEqual(featureBox({ type: "wall", x: 10, y: 10, facing: 3 }), { x0: 9, y0: 10, x1: 12, y1: 11 });
  });

  it("plays a test map with one start but never saves one", () => {
    const one = { maxPlayers: 4, spawns: [{ id: 1, x: 30, y: 30 }] };
    const id = newPlaytestMapId();
    assert.equal(isPlaytestMapId(id), true);
    assert.equal(validateCustomMap(sheet({ ...one, id }), { playtest: true }).ok, true);
    assert.equal(validateCustomMap(sheet({ ...one, id: "c-testmap01" }), { playtest: true }).ok, false, "a play test needs a play-test id");
    assert.equal(validateCustomMap(sheet({ ...one, id })).ok, false, "a saved map needs every start and a normal id");
    assert.equal(validateCustomMap(sheet({ id, spawns: [] }), { playtest: true }).ok, false, "a play test still needs a start");
  });

  it("keeps a play test off the map lists", () => {
    const id = newPlaytestMapId();
    const loaded = loadCustomMap(sheet({ id, maxPlayers: 4, spawns: [{ id: 1, x: 30, y: 30 }] }), { playtest: true });
    assert.equal(loaded.ok, true);
    try {
      assert.ok(getMap(id));
      assert.equal(listMaps().some((m) => m.id === id), false);
    } finally {
      unregisterMap(id);
    }
  });

  it("stands map defences neutral, and the side that takes one holds it", () => {
    const id = newPlaytestMapId();
    const loaded = loadCustomMap(
      sheet({ id, maxPlayers: 4, spawns: [{ id: 1, x: 30, y: 30 }], features: defences }),
      { playtest: true },
    );
    if (!loaded.ok) throw new Error(loaded.message);
    try {
      const made = createRoom({ id: "TEST", hostId: "A", hostName: "A", mapId: id, maxSlots: 8, mode: "skirmish" });
      if (!made.ok) throw new Error(made.message);
      const started = startMatch(made.value, "A");
      if (!started.ok) throw new Error(started.message);
      const state = createMatch(made.value, started.value);
      const of = (type: string) => [...state.entities.values()].find((e) => e.type === type)!;
      const tower = of("tower");
      const bunker = of("bunker");
      const bags = of("sandbags");
      const wall = of("wall");
      for (const e of [tower, bunker, bags, wall]) assert.equal(e.ownerId, NEUTRAL_OWNER, `${e.type} starts neutral`);
      assert.equal(state.fortBlock.some((v) => v > 0), true, "map sections block like built ones");
      assert.equal(spotlightManned(tower), false, "an untaken tower stands dark");

      const ts = state.tileSize;
      const climber = makeEntity(state, "rifleman", "A", tower.x, tower.y + 40);
      assert.equal(enterGarrison(state, climber, tower), true);
      assert.equal(tower.ownerId, "A");
      assert.equal(spotlightManned(tower), true, "the lamp lights once someone holds the tower");

      // Behind the bags on their east face, inside the cover band.
      makeEntity(state, "rifleman", "A", tileCenter(61, ts) + 10, tileCenter(121, ts));
      step(state);
      assert.equal(bags.ownerId, "A");
      assert.equal(wall.ownerId, NEUTRAL_OWNER, "nobody is at the wall");
      assert.equal(bunker.ownerId, NEUTRAL_OWNER);
    } finally {
      unregisterMap(id);
    }
  });
});

describe("custom map units", () => {
  it("keeps neutral units, routes, and garrisons through validate and build", () => {
    const units = [
      { type: "rifleman" as const, x: 96, y: 60, facing: 90 },
      { type: "ss3" as const, x: 110, y: 80, facing: 180, patrol: [{ x: 130, y: 80 }, { x: 130, y: 100 }], loop: true },
      { type: "gunner" as const, x: 81, y: 101, facing: 0, inside: true },
    ];
    const r = validateCustomMap(sheet({ units, features: [{ type: "bunker", x: 80, y: 100, facing: 0 }] }));
    assert.ok(r.ok);
    assert.deepEqual(r.spec.units, units);
    assert.deepEqual(buildCustomMap(r.spec).units, units);
  });

  it("leaves the field out when a map has no units", () => {
    const r = validateCustomMap(sheet());
    assert.ok(r.ok);
    assert.equal("units" in r.spec, false);
  });

  it("refuses an aircraft or an unknown type, and drops a unit the ground no longer holds", () => {
    assert.equal(validateCustomMap(sheet({ units: [{ type: "stuka", x: 96, y: 60, facing: 0 }] })).ok, false);
    assert.equal(validateCustomMap(sheet({ units: [{ type: "ghost" as never, x: 96, y: 60, facing: 0 }] })).ok, false);
    // A boat on dry land, a man on a start pad, and a man inside a house that is not there.
    const r = validateCustomMap(
      sheet({
        units: [
          { type: "gunboat", x: 96, y: 60, facing: 0 },
          { type: "rifleman", x: 31, y: 30, facing: 0 },
          { type: "rifleman", x: 96, y: 96, facing: 0, inside: true },
        ],
      }),
    );
    assert.ok(r.ok);
    assert.equal(r.spec.units, undefined);
  });

  it("keeps a tower's spotlight heading and sweep, and a Battle Ship's searchlight", () => {
    const n = SIDE * SIDE;
    const tiles = new Array<number>(n).fill(TILE_EMPTY);
    for (let y = 40; y < 80; y++) for (let x = 40; x < 80; x++) tiles[y * SIDE + x] = TILE_WATER;
    const r = validateCustomMap(
      sheet({
        tiles: encodeRuns(tiles),
        features: [
          { type: "tower", x: 96, y: 64, facing: 0, spot: 450, patrol: [{ x: 110, y: 64 }, { x: 96, y: 80 }], loop: true },
          { type: "bunker", x: 96, y: 96, facing: 0, spot: 90, patrol: [{ x: 110, y: 96 }] } as never,
        ],
        units: [
          { type: "battleship", x: 60, y: 60, facing: 0, spot: -90 },
          { type: "rifleman", x: 120, y: 120, facing: 0, spot: 90 },
        ],
      }),
    );
    assert.ok(r.ok, r.ok ? "" : r.message);
    const [tower, bunker] = r.spec.features;
    assert.equal(tower!.spot, 90, "wrapped to whole degrees");
    assert.deepEqual(tower!.patrol, [{ x: 110, y: 64 }, { x: 96, y: 80 }]);
    assert.equal(tower!.loop, true);
    assert.equal(bunker!.spot, undefined, "only a Watch Tower carries a lamp");
    assert.equal(bunker!.patrol, undefined);
    const [ship, man] = r.spec.units!;
    assert.equal(ship!.spot, 270);
    assert.equal(man!.spot, undefined);
    assert.equal(buildCustomMap(r.spec).units?.[0]?.spot, 270, "the playable map keeps it");
  });

  it("puts no more men in a building than it holds", () => {
    const cap = garrisonCapOf("bunker");
    const units = Array.from({ length: cap + 2 }, () => ({ type: "rifleman" as const, x: 81, y: 101, facing: 0, inside: true }));
    const r = validateCustomMap(sheet({ units, features: [{ type: "bunker", x: 80, y: 100, facing: 0 }] }));
    assert.ok(r.ok);
    assert.equal(r.spec.units?.length, cap);
  });
});

describe("custom map lamps", () => {
  it("keeps street lamps through validate, build, and copy", () => {
    const lamps = [
      { type: "gaslamp" as const, x: 60, y: 60 },
      { type: "floodlight" as const, x: 70, y: 64 },
    ];
    const r = validateCustomMap(sheet({ lamps }));
    assert.ok(r.ok);
    assert.deepEqual(r.spec.lamps, lamps);
    const map = buildCustomMap(r.spec);
    assert.deepEqual(map.lamps, lamps);
  });

  it("leaves the field out when a map has no lamps, so old saves read the same", () => {
    const r = validateCustomMap(sheet());
    assert.ok(r.ok);
    assert.equal("lamps" in r.spec, false);
    assert.equal(buildCustomMap(r.spec).lamps, undefined);
  });

  it("refuses an unknown lamp or one off the map", () => {
    assert.equal(validateCustomMap(sheet({ lamps: [{ type: "torch" as never, x: 60, y: 60 }] })).ok, false);
    assert.equal(validateCustomMap(sheet({ lamps: [{ type: "gaslamp", x: SIDE, y: 60 }] })).ok, false);
  });

  it("drops a lamp inside a lot and a second post on the same tile", () => {
    const r = validateCustomMap(
      sheet({
        features: [{ type: "warehouse", x: 80, y: 80, facing: 0 }],
        lamps: [
          { type: "streetlamp", x: 82, y: 82 },
          { type: "streetlamp", x: 60, y: 60 },
          { type: "gaslamp", x: 60, y: 60 },
        ],
      }),
    );
    assert.ok(r.ok);
    assert.deepEqual(r.spec.lamps, [{ type: "streetlamp", x: 60, y: 60 }]);
  });

  it("stands the industrial buildings on the field", () => {
    const features = [
      { type: "factory" as const, x: 60, y: 60, facing: 0 },
      { type: "foundry" as const, x: 100, y: 60, facing: 1 },
      { type: "warehouse" as const, x: 60, y: 100, facing: 2 },
      { type: "granary" as const, x: 100, y: 100, facing: 3 },
    ];
    const r = validateCustomMap(sheet({ features }));
    assert.ok(r.ok, r.ok ? "" : r.message);
    const box = featureBox(features[0]!);
    assert.equal(box.x1 - box.x0, 5 * TILE_SUBDIV, "a factory takes five cells");
  });
});
