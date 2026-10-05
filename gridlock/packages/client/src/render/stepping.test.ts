import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { strideFrame, strideHop, unitStepping, WALKER_STRIDE_WORLD } from "./stepping.js";

const here = { x: 100, y: 100 };
const onward = { x: 103, y: 100 };

describe("unitStepping", () => {
  it("steps on a plain move order", () => {
    assert.equal(unitStepping({ type: "trooper", state: "move", prev: here, curr: here }), true);
  });

  it("steps while travelling on attack-move or force-attack", () => {
    assert.equal(unitStepping({ type: "trooper", state: "attack", prev: here, curr: onward }), true);
    assert.equal(unitStepping({ type: "tank", state: "attack", prev: here, curr: onward }), true);
  });

  it("stands still while attacking in place", () => {
    assert.equal(unitStepping({ type: "trooper", state: "attack", prev: here, curr: here }), false);
    assert.equal(unitStepping({ type: "trooper", state: "attack", prev: here, curr: { x: 100.2, y: 100 } }), false);
    assert.equal(unitStepping({ type: "trooper", state: "attack", curr: here }), false);
  });

  it("keeps build, repair and swim cycles", () => {
    assert.equal(unitStepping({ type: "engineer", state: "build", prev: here, curr: here }), true);
    assert.equal(unitStepping({ type: "engineer", state: "repair", prev: here, curr: here }), true);
    assert.equal(unitStepping({ type: "trooper", state: "idle", swimming: true, prev: here, curr: here }), true);
  });

  it("walkers stride only when the hull really moves", () => {
    assert.equal(unitStepping({ type: "walker", state: "move", prev: here, curr: here }), false);
    assert.equal(unitStepping({ type: "walker", state: "move", prev: here, curr: onward }), true);
    assert.equal(unitStepping({ type: "walker", state: "attack", prev: here, curr: onward }), true);
    assert.equal(unitStepping({ type: "titan", state: "attack", prev: here, curr: here }), false);
  });
});

describe("strideFrame", () => {
  it("walks one full cycle per stride length", () => {
    assert.equal(strideFrame(0, WALKER_STRIDE_WORLD, 8, 0), 0);
    assert.equal(strideFrame(WALKER_STRIDE_WORLD / 2, WALKER_STRIDE_WORLD, 8, 0), 4);
    assert.equal(strideFrame(WALKER_STRIDE_WORLD, WALKER_STRIDE_WORLD, 8, 0), 0);
  });

  it("stays on the sheet", () => {
    for (let d = 0; d < 200; d += 3.7) {
      const f = strideFrame(d, WALKER_STRIDE_WORLD, 8, 11);
      assert.ok(f >= 0 && f < 8);
    }
  });
});

describe("strideHop", () => {
  it("counts ground covered and drops snaps", () => {
    assert.equal(strideHop(undefined, here), 0);
    assert.equal(strideHop(here, onward), 3);
    assert.equal(strideHop(here, { x: 200, y: 100 }), 0);
  });
});
