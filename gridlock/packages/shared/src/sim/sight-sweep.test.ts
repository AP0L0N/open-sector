import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GROVE_SIGHT_BUDGET, LOS_TERRAIN_SLACK } from "../catalog.js";
import { TILE_EMPTY, TILE_TREE } from "../maps.js";
import { fillLosFlags, type CoverField } from "./elevation.js";
import { armSightBlocks, clearSightBlocks, sweepSight, type LitList, type SweepEye } from "./sight-sweep.js";

const W = 64;
const H = 64;

function ground(): { elev: Uint8Array; cover: CoverField } {
  const n = W * H;
  const cover: CoverField = {
    terrain: new Uint8Array(n).fill(TILE_EMPTY),
    occupy: new Int32Array(n),
    hull: new Int32Array(n),
    smoke: new Uint8Array(n),
    losFlags: new Uint8Array(n),
  };
  return { elev: new Uint8Array(n), cover };
}

function sweep(eye: Partial<SweepEye>, elev: Uint8Array, cover: CoverField): Uint8Array {
  fillLosFlags(cover, cover.losFlags!);
  const p: SweepEye = { ox: 32, oy: 32, radius: 12, eye: 0, uphill: 0, ignore: 0, ...eye };
  const out: LitList = { tiles: new Int32Array(64), n: 0 };
  sweepSight(p, W, H, elev, cover, out);
  const mask = new Uint8Array(W * H);
  for (let k = 0; k < out.n; k++) mask[out.tiles[k]!] = 1;
  return mask;
}

const at = (mask: Uint8Array, x: number, y: number): number => mask[y * W + x]!;

describe("sight sweep", () => {
  it("lights the whole round disc on open flat ground", () => {
    const { elev, cover } = ground();
    const mask = sweep({}, elev, cover);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const inDisc = Math.round(Math.hypot(x - 32, y - 32)) <= 12 ? 1 : 0;
        assert.equal(at(mask, x, y), inDisc, `tile ${x},${y}`);
      }
    }
  });

  it("shows a wall and hides the ground behind it, not beside it", () => {
    const { elev, cover } = ground();
    for (let y = 30; y <= 34; y++) (cover.occupy as Int32Array)[y * W + 36] = 7;
    const mask = sweep({}, elev, cover);
    assert.equal(at(mask, 36, 32), 1, "the wall face is lit");
    assert.equal(at(mask, 38, 32), 0, "ground right behind the wall is dark");
    assert.equal(at(mask, 42, 32), 0, "ground farther behind the wall is dark");
    assert.equal(at(mask, 38, 24), 1, "ground beside the wall's shadow is lit");
    assert.equal(at(mask, 28, 32), 1, "ground the other way is lit");
  });

  it("looks past its own body and lights every tile of a hull it sees", () => {
    const { elev, cover } = ground();
    const own = 3;
    const foe = 9;
    (cover.hull as Int32Array)[32 * W + 33] = own;
    (cover.hull as Int32Array)[32 * W + 36] = foe;
    (cover.hull as Int32Array)[32 * W + 37] = foe;
    const mask = sweep({ ignore: own }, elev, cover);
    assert.equal(at(mask, 34, 32), 1, "ground past the observer's own hull is lit");
    assert.equal(at(mask, 36, 32), 1, "the hull's near tile is lit");
    assert.equal(at(mask, 37, 32), 1, "the hull's far tile is lit through its own near tile");
    assert.equal(at(mask, 39, 32), 0, "ground behind the hull is dark");
  });

  it("sees through a grove up to the budget and no farther", () => {
    const { elev, cover } = ground();
    const terrain = cover.terrain as Uint8Array;
    const trees = Math.ceil(GROVE_SIGHT_BUDGET / 2) + 1;
    for (let k = 0; k < trees; k++) terrain[32 * W + 34 + k] = TILE_TREE;
    const mask = sweep({}, elev, cover);
    assert.equal(at(mask, 34, 32), 1, "the first tree is lit");
    assert.equal(at(mask, 34 + trees + 1, 32), 0, "ground past the grove is dark");
    assert.equal(at(mask, 34, 28), 1, "ground beside the grove is lit");
  });

  it("hides the floor behind a ridge but shows a taller peak past it", () => {
    const { elev, cover } = ground();
    const ridge = LOS_TERRAIN_SLACK + 3;
    for (let y = 28; y <= 36; y++) elev[y * W + 36] = ridge;
    for (let y = 30; y <= 34; y++) elev[y * W + 42] = ridge * 3;
    const mask = sweep({ radius: 14 }, elev, cover);
    assert.equal(at(mask, 36, 32), 1, "the ridge face is lit");
    assert.equal(at(mask, 39, 32), 0, "the floor behind the ridge is dark");
    assert.equal(at(mask, 42, 32), 1, "the taller peak past the ridge is lit");
  });

  it("reaches a hilltop past catalog sight with the uphill bonus, armed or not", () => {
    const { elev, cover } = ground();
    for (let y = 30; y <= 34; y++) for (let x = 48; x <= 50; x++) elev[y * W + x] = 8;
    clearSightBlocks();
    const slow = sweep({ radius: 10, uphill: 1 }, elev, cover);
    armSightBlocks(elev, W, H);
    const fast = sweep({ radius: 10, uphill: 1 }, elev, cover);
    clearSightBlocks();
    assert.equal(at(slow, 49, 32), 1, "the hilltop is in reach");
    assert.equal(at(slow, 45, 32), 0, "flat ground past catalog sight is not");
    assert.deepEqual(fast, slow, "block culling does not change the picture");
  });

  it("peeks one tile into smoke and no deeper", () => {
    const { elev, cover } = ground();
    const smoke = cover.smoke as Uint8Array;
    for (let y = 28; y <= 36; y++) for (let x = 33; x <= 40; x++) smoke[y * W + x] = 1;
    const mask = sweep({}, elev, cover);
    assert.equal(at(mask, 33, 32), 1, "the first smoke tile shows");
    assert.equal(at(mask, 34, 32), 0, "deeper smoke is dark");
    assert.equal(at(mask, 42, 32), 0, "ground past the cloud is dark");
  });
});
