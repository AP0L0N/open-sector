import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { unitStepping } from "./stepping.js";

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
