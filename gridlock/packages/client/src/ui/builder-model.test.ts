import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  HEIGHT_BASE,
  HEIGHT_STEP_MAX,
  TILE_EMPTY,
  TILE_ROAD,
  TILE_SUBDIV,
  TILE_TREE,
  TILE_WATER,
  validateCustomMap,
} from "@gridlock/shared";
import {
  defenceCount,
  houseAt,
  houseProblem,
  moveFeature,
  playtestProblem,
  turnFeature,
  levelDisk,
  liftDisk,
  markSheet,
  newSheet,
  nextSpawnId,
  paintDisk,
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
    assert.deepEqual(houseAt("sandbags", 37, 41, 2), { type: "sandbags", x: 37, y: 41, facing: 2 });
    const bunker = houseAt("bunker", 37, 41, 0);
    assert.equal(bunker.x % TILE_SUBDIV, 0);
    assert.equal(bunker.y % TILE_SUBDIV, 0);
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
