import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  HEIGHT_BASE,
  HEIGHT_STEP_MAX,
  TILE_EMPTY,
  TILE_ROAD,
  TILE_SIZE,
  TILE_SUBDIV,
  TILE_TREE,
  TILE_WATER,
  validateCustomMap,
} from "@gridlock/shared";
import {
  defenceCount,
  diskTouches,
  emptyDirty,
  houseAt,
  houseProblem,
  laySections,
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
  turnFeature,
  lampIndexAt,
  levelDisk,
  liftDisk,
  markSheet,
  newSheet,
  nextSpawnId,
  paintDisk,
  placeLamp,
  restoreSheet,
  setMaxPlayers,
  settle,
  sheetFromSpec,
  sheetProblem,
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

  it("lays a lone section on the cursor at the wheel's heading", () => {
    const one = sectionLine("sandbags", [tileWorld(50, 50)], 2);
    assert.deepEqual(one, [{ type: "sandbags", x: 50, y: 50, facing: 0, turn: 2 }]);
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
