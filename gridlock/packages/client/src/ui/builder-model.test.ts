import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { copyMapUnit, mapAirfieldAt } from "@gridlock/shared";
import { clearOrders, gridDiff, markDiff, markSheet, ownersWithoutStart, planesOn, setFeatureOwner, setGuard, setMaxPlayers, setUnitOwner, unionDirty } from "./builder-model.js";
import {
  GROUND_GRASS,
  GROUND_SAND,
  GROUND_SWAMP,
  HEIGHT_BASE,
  HEIGHT_STEP_MAX,
  MOUNTAIN_MIN_HEIGHT,
  TILE_EMPTY,
  TILE_MOUNTAIN,
  TILE_ROAD,
  TILE_SIZE,
  TILE_SUBDIV,
  TILE_TREE,
  TILE_WATER,
  isMountainCliff,
  validateCustomMap,
} from "@gridlock/shared";
import {
  defenceCount,
  diskTouches,
  emptyDirty,
  houseAt,
  houseProblem,
  laySections,
  bridgeLine,
  deckAt,
  moveFeature,
  QUARTER_TURN,
  sectionLine,
  paintRoad,
  roadLegs,
  roadQuads,
  ROAD_STUB,
  ROAD_WIDTH,
  tileWorld,
  wrapTurn,
  playtestProblem,
  degreesToward,
  dropGarrison,
  garrisonHostAt,
  garrisonUnit,
  liveUnits,
  moveUnit,
  routesToShow,
  placeUnit,
  reseatGarrison,
  unitsInside,
  unloadGarrison,
  turnFeature,
  lampIndexAt,
  levelDisk,
  liftDisk,
  paintMountain,
  markSheet,
  newSheet,
  nextSpawnId,
  paintCover,
  paintDisk,
  placeLamp,
  clutterIndexAt,
  placeClutter,
  scatterSheetClutter,
  restoreSheet,
  setMaxPlayers,
  settle,
  sheetFromSpec,
  playtestSpec,
  sheetProblem,
  sheetToMap,
  sheetToSpec,
  spawnProblem,
  type Sheet,
} from "./builder-model.js";

function fresh(maxPlayers = 2): Sheet {
  return newSheet({ id: "c-model00001", name: "Model", author: "T", cells: 48, maxPlayers, hills: false, seed: "t" });
}

function steepest(s: Sheet): number {
  let worst = 0;
  for (let y = 0; y < s.height; y++) {
    for (let x = 0; x < s.width; x++) {
      const h = s.heights[y * s.width + x]!;
      for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]] as const) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= s.width || ny >= s.height) continue;
        worst = Math.max(worst, Math.abs(h - s.heights[ny * s.width + nx]!));
      }
    }
  }
  return worst;
}

describe("map builder sheet", () => {
  it("starts flat at the base height with no starts", () => {
    const s = fresh();
    assert.equal(s.width, 48 * TILE_SUBDIV);
    assert.ok(s.heights.every((h) => h === HEIGHT_BASE));
    assert.equal(s.spawns.length, 0);
    assert.match(sheetProblem(s) ?? "", /Place all 2 start positions/);
  });

  it("raises a hill whose sides ramp one step per tile", () => {
    const s = fresh();
    for (let i = 0; i < 12; i++) liftDisk(s, 96, 96, 5, 1);
    assert.equal(s.heights[96 * s.width + 96], HEIGHT_BASE + 12);
    assert.ok(steepest(s) <= HEIGHT_STEP_MAX, `steepest ${steepest(s)}`);
    settle(s);
    assert.equal(s.heights[96 * s.width + 96], HEIGHT_BASE + 12);
  });

  it("stamps a flat mountain and opens the rock where ground meets its height", () => {
    const s = fresh();
    paintMountain(s, 40, 40, 2, 4);
    const at = (x: number, y: number): number => s.heights[y * s.width + x]!;
    assert.equal(at(40, 40), MOUNTAIN_MIN_HEIGHT);
    assert.equal(s.tiles[40 * s.width + 42], TILE_MOUNTAIN);
    assert.equal(at(43, 40), HEIGHT_BASE);
    assert.equal(isMountainCliff(s.tiles, s.heights, s.width, s.height, 43, 40), true);
    assert.equal(isMountainCliff(s.tiles, s.heights, s.width, s.height, 43, 42), true);
    settle(s);
    assert.equal(at(40, 40), MOUNTAIN_MIN_HEIGHT);
    assert.equal(at(43, 40), HEIGHT_BASE);
    levelDisk(s, 43, 40, 0, MOUNTAIN_MIN_HEIGHT);
    assert.equal(isMountainCliff(s.tiles, s.heights, s.width, s.height, 43, 40), false);
    assert.equal(isMountainCliff(s.tiles, s.heights, s.width, s.height, 40, 43), true);
    assert.equal(at(40, 40), MOUNTAIN_MIN_HEIGHT);
    liftDisk(s, 40, 40, 2, 1);
    assert.equal(at(40, 40), MOUNTAIN_MIN_HEIGHT);
    settle(s);
    assert.equal(at(40, 40), MOUNTAIN_MIN_HEIGHT);
    assert.equal(isMountainCliff(s.tiles, s.heights, s.width, s.height, 43, 40), false);
    const check = validateCustomMap(sheetToSpec(s));
    assert.notEqual(check.ok ? "" : check.message, "Bad ground data.");
  });

  it("cuts a valley and levels a plateau", () => {
    const s = fresh();
    for (let i = 0; i < 6; i++) liftDisk(s, 60, 60, 4, -1);
    assert.equal(s.heights[60 * s.width + 60], HEIGHT_BASE - 6);
    levelDisk(s, 130, 130, 6, 20);
    assert.equal(s.heights[130 * s.width + 130], 20);
    assert.ok(steepest(s) <= HEIGHT_STEP_MAX);
  });

  it("drops painted water to the floor once the stroke settles", () => {
    const s = fresh();
    paintDisk(s, 100, 100, 6, TILE_WATER);
    settle(s);
    assert.equal(s.tiles[100 * s.width + 100], TILE_WATER);
    assert.equal(s.heights[100 * s.width + 100], 0);
    assert.ok(steepest(s) <= HEIGHT_STEP_MAX);
  });

  it("keeps trees off a start pad but lets a road through", () => {
    const s = fresh();
    s.spawns.push({ id: 1, x: 40, y: 40 });
    settle(s);
    paintDisk(s, 40, 40, 3, TILE_TREE);
    assert.equal(s.tiles[40 * s.width + 40], TILE_EMPTY);
    paintDisk(s, 40, 40, 3, TILE_ROAD);
    assert.equal(s.tiles[40 * s.width + 40], TILE_ROAD);
  });

  it("paints the edge from a brush whose centre hangs past it", () => {
    const s = fresh();
    const box = emptyDirty();
    assert.ok(diskTouches(s, -3, 50, 4));
    assert.ok(!diskTouches(s, -6, 50, 4));
    paintDisk(s, -3, 50, 4, TILE_TREE, box);
    assert.equal(s.tiles[50 * s.width + 0], TILE_TREE);
    assert.equal(s.tiles[50 * s.width + 1], TILE_TREE);
    assert.deepEqual(box, { x0: 0, y0: 47, x1: 2, y1: 54 });
    const far = s.width + 2;
    liftDisk(s, far, 10, 3, 1);
    assert.equal(s.heights[10 * s.width + s.width - 1], HEIGHT_BASE + 1);
  });

  it("reports the ramp a raise drags outside the brush", () => {
    const s = fresh();
    for (let i = 0; i < 4; i++) liftDisk(s, 96, 96, 2, 1);
    const box = emptyDirty();
    liftDisk(s, 96, 96, 2, 1, box);
    // Four terraces of ramp beyond the radius-2 ring.
    assert.ok(box.x0 <= 96 - 2 - 4 && box.x1 >= 96 + 2 + 5, JSON.stringify(box));
    assert.ok(steepest(s) <= HEIGHT_STEP_MAX);
  });

  it("snaps houses to the cell grid and refuses overlaps and pads", () => {
    const s = fresh();
    const h = houseAt("house", 101, 99, 5);
    assert.equal(h.x % TILE_SUBDIV, 0);
    assert.equal(h.y % TILE_SUBDIV, 0);
    assert.equal(h.facing, 1);
    assert.equal(houseProblem(s, h), null);
    s.features.push(h);
    assert.match(houseProblem(s, houseAt("cottage", 101, 99, 0)) ?? "", /Overlaps/);
    s.spawns.push({ id: 1, x: 40, y: 40 });
    assert.match(houseProblem(s, houseAt("cottage", 42, 42, 0)) ?? "", /start/);
    assert.match(houseProblem(s, houseAt("manor", 1, 1, 0)) ?? "", /Off the map/);
  });

  it("numbers starts from 1 and keeps them apart", () => {
    const s = fresh(3);
    assert.equal(nextSpawnId(s), 1);
    s.spawns.push({ id: 1, x: 40, y: 40 });
    s.spawns.push({ id: 3, x: 150, y: 150 });
    assert.equal(nextSpawnId(s), 2);
    assert.match(spawnProblem(s, 50, 40) ?? "", /start 1/);
    assert.match(spawnProblem(s, 2, 100) ?? "", /edge/);
    assert.equal(spawnProblem(s, 150, 40), null);
    assert.equal(setMaxPlayers(s, 2), 1);
    assert.deepEqual(s.spawns.map((sp) => sp.id), [1]);
  });

  it("saves a sheet the server accepts, and loads it back unchanged", () => {
    const s = fresh();
    s.spawns.push({ id: 1, x: 40, y: 40 }, { id: 2, x: 150, y: 150 });
    for (let i = 0; i < 8; i++) liftDisk(s, 96, 96, 6, 1);
    paintDisk(s, 60, 140, 5, TILE_WATER);
    s.features.push(houseAt("inn", 120, 60, 2));
    settle(s);
    assert.equal(sheetProblem(s), null);
    const spec = sheetToSpec(s);
    assert.equal(validateCustomMap(spec).ok, true);
    const back = sheetFromSpec(spec);
    assert.deepEqual(back.heights, s.heights);
    assert.deepEqual(back.tiles, s.tiles);
  });

  it("undoes to an earlier mark", () => {
    const s = fresh();
    const mark = markSheet(s);
    liftDisk(s, 96, 96, 5, 1);
    s.spawns.push({ id: 1, x: 40, y: 40 });
    restoreSheet(s, mark);
    assert.ok(s.heights.every((h) => h === HEIGHT_BASE));
    assert.equal(s.spawns.length, 0);
  });
});

describe("builder ground cover", () => {
  it("lays cover over open ground only, and the Grass brush takes it back", () => {
    const s = fresh();
    paintDisk(s, 60, 60, 2, TILE_WATER);
    const box = emptyDirty();
    const n = paintCover(s, 60, 60, 5, GROUND_SAND, box);
    assert.ok(n > 0);
    assert.equal(s.ground[60 * s.width + 60], GROUND_GRASS, "water keeps its own surface");
    assert.equal(s.ground[60 * s.width + 64], GROUND_SAND);
    assert.ok(box.x0 <= 55 && box.x1 >= 65, "the dirty box covers the stroke");
    assert.equal(paintCover(s, 60, 60, 5, 42), 0, "unknown cover is refused");
    paintDisk(s, 64, 60, 0, TILE_EMPTY);
    assert.equal(s.ground[60 * s.width + 64], GROUND_GRASS);
  });

  it("saves cover only when some was painted, and reads it back", () => {
    const s = fresh();
    assert.equal(sheetToSpec(s).ground, undefined);
    paintCover(s, 30, 30, 3, GROUND_SWAMP);
    const spec = sheetToSpec(s);
    assert.ok(spec.ground);
    const back = sheetFromSpec(spec);
    assert.deepEqual(back.ground, s.ground);
    assert.equal(sheetToMap(s).ground?.[30 * s.width + 30], GROUND_SWAMP);
    const mark = markSheet(s);
    paintCover(s, 30, 30, 3, GROUND_GRASS);
    restoreSheet(s, mark);
    assert.equal(s.ground[30 * s.width + 30], GROUND_SWAMP);
  });
});

describe("builder select and defences", () => {
  it("moves a picked-up house by whole cells and refuses an overlap", () => {
    const s = fresh();
    s.features.push(houseAt("cottage", 40, 40, 0), houseAt("barn", 100, 40, 0));
    const from = { ...s.features[0]! };
    assert.equal(moveFeature(s, 0, from, 5, 1), null);
    assert.equal(s.features[0]!.x, from.x + TILE_SUBDIV, "five tiles rounds to one cell");
    assert.equal(s.features[0]!.y, from.y);
    const barn = s.features[1]!;
    assert.notEqual(moveFeature(s, 0, from, barn.x - from.x, barn.y - from.y), null);
    assert.equal(s.features[0]!.x, from.x + TILE_SUBDIV, "a refused move leaves it where it was");
  });

  it("turns a placed section in place unless the turn would cross another", () => {
    const s = fresh();
    s.features.push(houseAt("wall", 60, 60, 0));
    assert.equal(turnFeature(s, 0), null);
    assert.equal(s.features[0]!.facing, 1);
    // Runs east-west on row 61; turned back north-south, the first wall would cross it at (60, 61).
    s.features.push(houseAt("wall", 60, 61, 1));
    assert.notEqual(turnFeature(s, 0), null);
    assert.equal(s.features[0]!.facing, 1);
  });

  it("sets a section on the cursor tile and a bunker on the cell grid", () => {
    assert.deepEqual(houseAt("sandbags", 37, 41, 2), { type: "sandbags", x: 37, y: 41, facing: 2, turn: 12 });
    const bunker = houseAt("bunker", 37, 41, 0);
    assert.equal(bunker.x % TILE_SUBDIV, 0);
    assert.equal(bunker.y % TILE_SUBDIV, 0);
  });

  it("turns a bunker or tower in 15° steps on its own lot, and a house only by quarters", () => {
    const bunker = houseAt("bunker", 37, 41, 0, 3);
    assert.equal(bunker.turn, 3);
    assert.equal(bunker.facing, 1, "45° reads as the nearest quarter");
    assert.deepEqual([bunker.x, bunker.y], [houseAt("bunker", 37, 41, 0).x, houseAt("bunker", 37, 41, 0).y], "the lot does not move as it turns");
    assert.equal(houseAt("cottage", 37, 41, 1, 3).turn, undefined);
    assert.equal(wrapTurn(-1), 23);
    assert.equal(wrapTurn(25), 1);
    const s = fresh();
    s.features.push(bunker);
    assert.equal(turnFeature(s, 0, 1), null);
    assert.equal(s.features[0]!.turn, 4);
  });

  it("lays a wall line the way a match does: legs snapped to 15°, end to end, saved as drawn", () => {
    const s = fresh();
    s.spawns.push({ id: 1, x: 30, y: 30 }, { id: 2, x: 160, y: 160 });
    // East 12 tiles, then a corner drawn about 40° down-right: it snaps to 45°.
    const pts = [tileWorld(70, 60), tileWorld(82, 60), tileWorld(91, 68)];
    const pieces = sectionLine("wall", pts, QUARTER_TURN);
    assert.ok(pieces.length >= 6, `${pieces.length} pieces`);
    const turns = new Set(pieces.map((p) => p.turn));
    assert.deepEqual([...turns].sort((a, b) => a! - b!), [6, 9], "the first leg faces south, the corner leg south-west");
    for (const p of pieces) {
      assert.equal(Number.isInteger(p.x * TILE_SIZE), true, "on whole world pixels");
      assert.equal(Number.isInteger(p.y * TILE_SIZE), true);
    }
    assert.deepEqual(laySections(s, pieces), { laid: pieces.length, refused: 0 }, "a line's own corners do not block it");
    assert.equal(sheetProblem(s), null);
    const back = validateCustomMap(sheetToSpec(s));
    assert.equal(back.ok, true);
    if (back.ok) assert.deepEqual(back.spec.features, s.features);
    // Laid twice, every section lands on one already there.
    assert.deepEqual(laySections(s, pieces), { laid: 0, refused: pieces.length });
  });

  it("lays a bridge brick by brick like a wall, across any width of water, and saves it", () => {
    const s = fresh();
    s.spawns.push({ id: 1, x: 30, y: 30 }, { id: 2, x: 160, y: 160 });
    // A river 60 tiles wide.
    for (let y = 40; y < 100; y++) for (let x = 60; x < 120; x++) s.tiles[y * s.width + x] = TILE_WATER;
    const pts = [tileWorld(55, 70), tileWorld(125, 71)];
    const bricks = bridgeLine("bigbridge", pts, 0, deckAt(s, pts[0]!));
    assert.ok(bricks.length >= 8, `${bricks.length} bricks`);
    assert.ok(bricks.every((b) => b.deck === s.heights[70 * s.width + 55]), "the deck keeps the level it started on");
    assert.ok(bricks.every((b) => b.turn === 0), "the leg snaps to due east");
    assert.deepEqual(laySections(s, bricks), { laid: bricks.length, refused: 0 }, "end to end, no brick blocks the next");
    assert.equal(defenceCount(s), 0, "bridges are not defences");
    assert.equal(sheetProblem(s), null);
    const back = validateCustomMap(sheetToSpec(s));
    assert.equal(back.ok, true, back.ok ? "" : back.message);
    if (back.ok) assert.deepEqual(back.spec.features, s.features);
    assert.deepEqual(laySections(s, bricks), { laid: 0, refused: bricks.length }, "laid twice, every brick overlaps");
    // The water under it stays water once settled, and a river can still be painted under it.
    settle(s);
    assert.equal(s.tiles[70 * s.width + 90], TILE_WATER);
    assert.ok(paintDisk(s, 50, 70, 2, TILE_WATER) > 0, "water paints under a bridge brick");
  });

  it("a stone bridge turns a corner without dropping the brick at the bend, and the saved map takes it", () => {
    const s = fresh();
    s.spawns.push({ id: 1, x: 30, y: 30 }, { id: 2, x: 160, y: 160 });
    // East, then a corner drawn about 40° down-right: it snaps to 45°, the sharpest common bend.
    const pts = [tileWorld(60, 60), tileWorld(84, 60), tileWorld(102, 76)];
    const bricks = bridgeLine("bigbridge", pts, 0, deckAt(s, pts[0]!));
    const turns = new Set(bricks.map((b) => b.turn));
    assert.equal(turns.size, 2, `two legs, got turns ${[...turns].join(",")}`);
    assert.deepEqual(laySections(s, bricks), { laid: bricks.length, refused: 0 }, "the corner brick is laid too");
    assert.equal(sheetProblem(s), null);
    const back = validateCustomMap(sheetToSpec(s));
    assert.equal(back.ok, true, back.ok ? "" : back.message);
    if (back.ok) assert.equal(back.spec.features.length, bricks.length);
  });

  it("keeps bridge bricks off woods; a lone click is one brick on the wheel's heading", () => {
    const s = fresh();
    for (let y = 60; y < 70; y++) for (let x = 60; x < 70; x++) s.tiles[y * s.width + x] = TILE_TREE;
    const [one] = bridgeLine("bridge", [tileWorld(64, 64)], QUARTER_TURN, 0);
    assert.equal(one!.turn, QUARTER_TURN);
    assert.match(houseProblem(s, one!) ?? "", /footing/);
    const [open] = bridgeLine("bridge", [tileWorld(120, 120)], 0, 0);
    assert.equal(houseProblem(s, open!), null);
  });

  it("lays a lone section on the cursor at the wheel's heading", () => {
    const one = sectionLine("sandbags", [tileWorld(50, 50)], 2);
    assert.deepEqual(one, [{ type: "sandbags", x: 50, y: 50, facing: 0, turn: 2 }]);
  });

  it("lays barbwire like sandbags, and teeth block by block along the line", () => {
    const wire = sectionLine("barbwire", [tileWorld(50, 50)], 2);
    assert.deepEqual(wire, [{ type: "barbwire", x: 50, y: 50, facing: 0, turn: 2 }]);
    // Seven tiles east is 56 world px: four 14 px blocks of teeth, each on its own square.
    const teeth = sectionLine("teeth", [tileWorld(50, 50), tileWorld(57, 50)], 0);
    assert.ok(teeth.length >= 3 && teeth.length <= 5, `${teeth.length} blocks`);
    assert.ok(teeth.every((t) => t.type === "teeth" && t.y === 50));
    const gap = teeth[1]!.x - teeth[0]!.x;
    assert.ok(Math.abs(gap - 14 / TILE_SIZE) < 1e-9, `blocks ${gap} tiles apart`);
    const laid = laySections(fresh(), teeth);
    assert.equal(laid.laid, teeth.length, "every block fits beside the last");
  });

  it("draws a road like a wall line: legs snapped to 15°, a lone start a stub on the wheel's heading", () => {
    // East 12 tiles, then a corner drawn about 40° down-right: it snaps to 45°.
    const legs = roadLegs([tileWorld(70, 60), tileWorld(82, 60), tileWorld(91, 68)], 0);
    assert.equal(legs.length, 3);
    assert.deepEqual(legs[1], tileWorld(82, 60));
    const a = Math.atan2(legs[2]!.y - legs[1]!.y, legs[2]!.x - legs[1]!.x);
    assert.ok(Math.abs(a - Math.PI / 4) < 1e-9, `corner leg at ${a}`);
    const stub = roadLegs([tileWorld(50, 50)], QUARTER_TURN);
    assert.equal(stub.length, 2);
    assert.ok(Math.abs(stub[0]!.x - stub[1]!.x) < 1e-9, "a quarter turn runs the stub north-south");
    assert.ok(Math.abs(stub[1]!.y - stub[0]!.y - ROAD_STUB * TILE_SIZE) < 1e-9);
    assert.equal(roadQuads(stub, ROAD_WIDTH).length, 1);
  });

  it("lays a road lane around houses and ponds", () => {
    const s = fresh();
    const legs = roadLegs([tileWorld(40, 60), tileWorld(100, 60)], 0);
    s.features.push(houseAt("cottage", 80, 60, 0));
    s.tiles[60 * s.width + 50] = TILE_WATER;
    const changed = paintRoad(s, legs, 4);
    assert.ok(changed > 200, `${changed} cells`);
    assert.equal(s.tiles[59 * s.width + 45], TILE_ROAD, "the lane is four tiles across");
    assert.equal(s.tiles[57 * s.width + 45], TILE_EMPTY);
    assert.equal(s.tiles[60 * s.width + 50], TILE_WATER, "ponds stay water");
    assert.notEqual(s.tiles[60 * s.width + 80], TILE_ROAD, "houses keep their lots");
    assert.equal(paintRoad(s, legs, 4), 0, "laid twice, nothing changes");
  });

  it("counts defences apart from houses and saves them", () => {
    const s = fresh();
    s.spawns.push({ id: 1, x: 30, y: 30 }, { id: 2, x: 150, y: 150 });
    s.features.push(houseAt("cottage", 80, 80, 0), houseAt("tower", 120, 80, 0), houseAt("sandbags", 100, 120, 0));
    assert.equal(defenceCount(s), 2);
    assert.equal(sheetProblem(s), null);
  });

  it("play tests with a single start", () => {
    const s = fresh(4);
    assert.notEqual(playtestProblem(s), null);
    s.spawns.push({ id: 1, x: 30, y: 30 });
    assert.equal(playtestProblem(s), null);
    assert.notEqual(sheetProblem(s), null, "saving still wants every start");
  });
});

describe("builder lamps", () => {
  it("stands a lamp on open ground and refuses water, a lot, and a crowded post", () => {
    const s = fresh();
    assert.equal(placeLamp(s, "streetlamp", 60, 60), null);
    assert.match(placeLamp(s, "gaslamp", 61, 60) ?? "", /another lamp/);
    s.tiles[70 * s.width + 70] = TILE_WATER;
    assert.match(placeLamp(s, "gaslamp", 70, 70) ?? "", /dry ground/);
    s.features.push(houseAt("factory", 100, 100, 0));
    assert.match(placeLamp(s, "gaslamp", 100, 100) ?? "", /lot/);
    assert.equal(lampIndexAt(s, 60, 61), 0);
    assert.equal(lampIndexAt(s, 64, 64), -1);
  });

  it("saves the lamps a building does not cover, and undo brings them back", () => {
    const s = fresh();
    placeLamp(s, "floodlight", 40, 40);
    placeLamp(s, "gaslamp", 90, 90);
    const mark = markSheet(s);
    s.features.push(houseAt("warehouse", 90, 90, 0));
    assert.deepEqual(sheetToSpec(s).lamps, [{ type: "floodlight", x: 40, y: 40 }]);
    s.lamps = [];
    restoreSheet(s, mark);
    assert.equal(s.lamps.length, 2);
    assert.deepEqual(sheetFromSpec(sheetToSpec(s)).lamps, sheetToSpec(s).lamps);
  });
});

describe("builder clutter", () => {
  it("stands a piece on open ground and refuses water, a lot, and a taken tile", () => {
    const s = fresh();
    assert.equal(placeClutter(s, "crates", 60, 60), null);
    assert.match(placeClutter(s, "bins", 60, 60) ?? "", /already/);
    assert.equal(placeClutter(s, "bins", 61, 60), null);
    s.tiles[70 * s.width + 70] = TILE_WATER;
    assert.match(placeClutter(s, "cart", 70, 70) ?? "", /dry ground/);
    s.features.push(houseAt("factory", 100, 100, 0));
    assert.match(placeClutter(s, "cart", 100, 100) ?? "", /lot/);
    assert.equal(clutterIndexAt(s, 62, 60), 1);
    assert.equal(clutterIndexAt(s, 64, 64), -1);
  });

  it("saves what a building or water does not cover, and scatters more by the houses", () => {
    const s = fresh();
    placeClutter(s, "woodpile", 40, 40);
    placeClutter(s, "haybale", 90, 90);
    placeClutter(s, "tires", 120, 120);
    s.features.push(houseAt("warehouse", 90, 90, 0));
    s.tiles[120 * s.width + 120] = TILE_WATER;
    assert.deepEqual(sheetToSpec(s).clutter, [{ type: "woodpile", x: 40, y: 40 }]);
    assert.deepEqual(sheetFromSpec(sheetToSpec(s)).clutter, sheetToSpec(s).clutter);
    const before = s.clutter.length;
    const added = scatterSheetClutter(s, "seed");
    assert.ok(added > 0);
    assert.equal(s.clutter.length, before + added);
    const near = s.clutter.slice(before).filter((c) => c.x >= 84 && c.x < 112 && c.y >= 84 && c.y < 112);
    assert.ok(near.length > 0, "nothing by the warehouse");
  });
});

describe("builder neutral units", () => {
  it("stands a unit on open ground and refuses water, a lot, and a crowd", () => {
    const s = fresh();
    assert.equal(placeUnit(s, "rifleman", 90, 90, 45), null);
    assert.deepEqual(s.units[0], { type: "rifleman", x: 90, y: 90, facing: 45 });
    assert.equal(placeUnit(s, "rifleman", 90, 90, 0), "Too close to another unit.");
    s.features.push(houseAt("bunker", 120, 120, 0));
    settle(s);
    assert.equal(placeUnit(s, "rifleman", 120, 120, 0), "Inside a building.");
    paintDisk(s, 60, 150, 3, TILE_WATER);
    assert.equal(placeUnit(s, "ss3", 60, 150, 0), "Units stand on open ground.");
    assert.equal(placeUnit(s, "gunboat", 60, 150, 0), null, "a boat floats");
  });

  it("garrisons infantry up to the building's room, and carries them when it moves", () => {
    const s = fresh();
    s.features.push(houseAt("bunker", 120, 120, 0));
    settle(s);
    const host = garrisonHostAt(s, "rifleman", 120, 120);
    assert.equal(host, 0);
    assert.equal(garrisonHostAt(s, "ss3", 120, 120), -1, "a tank does not garrison");
    let placed = 0;
    while (garrisonUnit(s, "rifleman", host, 0) === null) placed++;
    assert.ok(placed > 0);
    assert.equal(unitsInside(s, host).length, placed);
    assert.equal(liveUnits(s).length, placed);
    const before = { ...s.features[0]! };
    assert.equal(moveFeature(s, 0, before, 16, 0), null);
    reseatGarrison(s, before, s.features[0]!);
    assert.equal(unitsInside(s, 0).length, placed, "they moved with it");
    const out = unloadGarrison(s, 0);
    assert.equal(out, placed);
    assert.equal(unitsInside(s, 0).length, 0);
    assert.ok(s.units.every((u) => !u.inside && garrisonHostAt(s, u.type, u.x, u.y) < 0), "they stand outside");
    assert.equal(liveUnits(s).length, placed, "every man found ground");
  });

  it("drops a building's garrison with it", () => {
    const s = fresh();
    s.features.push(houseAt("bunker", 120, 120, 0));
    garrisonUnit(s, "rifleman", 0, 0);
    assert.equal(dropGarrison(s, s.features[0]!), 1);
    assert.equal(s.units.length, 0);
  });

  it("moves a unit with its route, and keeps it through save, load, and undo", () => {
    const s = fresh();
    placeUnit(s, "rifleman", 90, 90, 0);
    s.units[0]!.patrol = [{ x: 100, y: 90 }];
    const from = { ...s.units[0]!, patrol: [{ x: 100, y: 90 }] };
    assert.equal(moveUnit(s, 0, from, 4, 2), null);
    assert.deepEqual(s.units[0]!.patrol, [{ x: 104, y: 92 }]);
    const mark = markSheet(s);
    s.units = [];
    restoreSheet(s, mark);
    assert.equal(s.units.length, 1);
    const back = sheetFromSpec(sheetToSpec(s));
    assert.deepEqual(back.units, s.units);
    assert.equal(degreesToward(0, 0, 0, 5), 90, "south");
  });

  it("paints only the selected patrol until Always visible patrol is on", () => {
    const routes = [
      { id: "selected", strong: true },
      { id: "other", strong: false },
      { id: "draft", strong: true },
    ];
    assert.deepEqual(
      routesToShow(routes, false).map((r) => r.id),
      ["selected", "draft"],
    );
    assert.deepEqual(
      routesToShow(routes, true).map((r) => r.id),
      ["selected", "other", "draft"],
    );
  });
});

describe("builder complete fog of war", () => {
  it("starts off and leaves the spec field out", () => {
    const s = fresh();
    assert.equal(s.shroud, false);
    assert.equal("shroud" in sheetToSpec(s), false);
    assert.equal(sheetToMap(s).shroud, undefined);
  });

  it("carries the flag through save, reopen, play test, and undo", () => {
    const s = fresh();
    const before = markSheet(s);
    s.shroud = true;
    assert.equal(sheetToSpec(s).shroud, true);
    assert.equal(sheetFromSpec(sheetToSpec(s)).shroud, true);
    assert.equal(playtestSpec(s, "p-check").shroud, true);
    assert.equal(sheetToMap(s).shroud, true);
    restoreSheet(s, before);
    assert.equal(s.shroud, false);
  });
});

describe("builder dirty boxes", () => {
  /** Every index where two grids differ lies inside `box`. */
  const covered = (width: number, a: readonly number[], b: readonly number[], box: { x0: number; y0: number; x1: number; y1: number }): boolean =>
    a.every((v, i) => v === b[i] || ((i % width) >= box.x0 && (i % width) < box.x1 && ((i / width) | 0) >= box.y0 && ((i / width) | 0) < box.y1));

  it("reports nothing to repaint when settle changes nothing", () => {
    const s = fresh();
    const box = settle(s);
    assert.ok(box.x1 <= box.x0, "empty");
  });

  it("boxes every cell settle touched: a lot levelled on a hill, a start's pad, a pond floor", () => {
    const s = newSheet({ id: "c-model00002", name: "Hills", author: "T", cells: 48, maxPlayers: 2, hills: true, seed: "hills" });
    settle(s);
    const tiles = s.tiles.slice();
    const heights = s.heights.slice();
    s.features.push(houseAt("warehouse", 96, 96, 0));
    s.spawns.push({ id: 1, x: 40, y: 40 });
    paintDisk(s, 150, 150, 4, TILE_WATER);
    const box = settle(s);
    assert.ok(box.x1 > box.x0, "something settled");
    assert.ok(covered(s.width, tiles, s.tiles, box), "tiles outside the box did not change");
    assert.ok(covered(s.width, heights, s.heights, box), "heights outside the box did not change");
  });

  it("diffs grids and undo marks into one box", () => {
    const a = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    const b = [0, 0, 0, 0, 1, 0, 0, 0, 2];
    assert.deepEqual(gridDiff(3, a, b), { x0: 1, y0: 1, x1: 3, y1: 3 });
    assert.deepEqual(unionDirty({ x0: 0, y0: 0, x1: 1, y1: 1 }, { x0: 4, y0: 4, x1: 5, y1: 5 }), { x0: 0, y0: 0, x1: 5, y1: 5 });
    const s = fresh();
    const mark = markSheet(s);
    s.ground[7 * s.width + 5] = GROUND_SAND;
    s.heights[20 * s.width + 30] = HEIGHT_BASE + 1;
    assert.deepEqual(markDiff(mark, s), { x0: 5, y0: 7, x1: 31, y1: 21 });
  });
});

describe("builder sides, planes, and guard", () => {
  it("stands a unit and a building for a start, and hands them over", () => {
    const s = fresh();
    assert.equal(placeUnit(s, "rifleman", 90, 90, 0, 1), null);
    assert.equal(s.units[0]!.owner, 1);
    assert.equal(placeUnit(s, "gunner", 100, 90, 0), null);
    assert.equal(s.units[1]!.owner, undefined);
    s.features.push({ ...houseAt("bunker", 120, 120, 0), owner: 1 });
    settle(s);
    assert.equal(garrisonUnit(s, "rifleman", 0, 0), null);
    assert.equal(s.units[2]!.owner, 1, "a man inside takes the building's side");
    assert.equal(setUnitOwner(s, 2, 0), "A man inside a building is its side's.");
    assert.equal(setFeatureOwner(s, 0, 2), null);
    assert.equal(s.units[2]!.owner, 2, "and follows it when it changes hands");
    assert.equal(setUnitOwner(s, 0, 0), null);
    assert.equal(s.units[0]!.owner, undefined);
    s.features.push({ ...houseAt("core", 160, 160, 0), owner: 1 });
    assert.equal(setFeatureOwner(s, 1, 0), "A Core belongs to a start.");
    assert.equal(liveUnits(s).length, 3);
  });

  it("parks planes on the nearest free hardstand of their own Airfield", () => {
    const s = fresh();
    s.features.push({ ...houseAt("airfield", 96, 96, 0, 2), owner: 1 });
    settle(s);
    assert.equal(placeUnit(s, "stuka", 60, 60, 0, 1), "Planes park on an Airfield.");
    assert.equal(placeUnit(s, "stuka", 100, 100, 0), "That Airfield is another side's.");
    const pads = new Set<number>();
    for (let i = 0; i < 4; i++) {
      assert.equal(placeUnit(s, "stuka", 100, 100, 0, 1), null);
      pads.add(s.units[i]!.pad!);
    }
    assert.equal(pads.size, 4, "four planes, four pads");
    assert.ok(s.units.every((u) => u.owner === 1 && mapAirfieldAt(s.features, u.x, u.y) === 0), "each sits on the field");
    assert.ok(placeUnit(s, "fw190", 100, 100, 0, 1)!.startsWith("Every hardstand"));
    assert.equal(liveUnits(s).length, 4);
    // A plane moves between pads of a field, never onto bare ground.
    const first = copyMapUnit(s.units[0]!);
    assert.ok(moveUnit(s, 0, first, -60, -60));
    assert.equal(setUnitOwner(s, 0, 2), "A plane is its Airfield's side's.");
    assert.equal(setFeatureOwner(s, 0, 2), null);
    assert.ok(s.units.every((u) => u.owner === 2), "the planes change hands with the field");
    assert.equal(planesOn(s, 0).length, 4);
  });

  it("sends a unit to a guard point, one order at a time", () => {
    const s = fresh();
    placeUnit(s, "rifleman", 90, 90, 0);
    s.units[0]!.patrol = [{ x: 100, y: 90 }];
    assert.equal(setGuard(s, 0, 120, 90), null);
    assert.deepEqual(s.units[0]!.guard, { x: 120, y: 90 });
    assert.equal(s.units[0]!.patrol, undefined, "the patrol went");
    assert.equal(moveUnit(s, 0, copyMapUnit(s.units[0]!), 4, 0), null);
    assert.deepEqual(s.units[0]!.guard, { x: 124, y: 90 }, "the point moves with it");
    assert.deepEqual(sheetToSpec(s).units?.[0]?.guard, { x: 124, y: 90 }, "and is saved");
    clearOrders(s, 0);
    assert.equal(s.units[0]!.guard, undefined);
  });

  it("stands a dropped start's things neutral when the seat count falls", () => {
    const s = fresh(4);
    s.features.push({ ...houseAt("dynamo", 120, 120, 0), owner: 4 }, { ...houseAt("core", 160, 160, 0), owner: 4 });
    placeUnit(s, "rifleman", 90, 90, 0, 4);
    placeUnit(s, "rifleman", 60, 60, 0, 2);
    setMaxPlayers(s, 2);
    assert.equal(s.features.length, 1, "the Core went");
    assert.equal(s.features[0]!.owner, undefined);
    assert.equal(s.units[0]!.owner, undefined);
    assert.equal(s.units[1]!.owner, 2);
    assert.deepEqual(ownersWithoutStart(s), [2]);
  });
});
