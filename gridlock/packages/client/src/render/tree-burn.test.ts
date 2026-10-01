import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TREE_BURN_MS, treeBurnPose, treeStamp } from "./tree-burn.js";

describe("burning tree", () => {
  it("chars upright, then slumps, and the seed picks the lean", () => {
    assert.equal(TREE_BURN_MS, 1800);
    const early = treeBurnPose(0.05, 1);
    assert.equal(early.rot, 0);
    assert.ok(early.heat > 0);
    assert.ok(early.brightness > 0.7);
    const late = treeBurnPose(0.95, 1);
    assert.ok(late.alpha < 1);
    assert.ok(late.brightness < 0.25);
    const leans = new Set([0, 1, 2].map((seed) => treeBurnPose(0.9, seed).variant));
    assert.equal(leans.size, 3);
    const right = treeBurnPose(0.9, 0);
    const left = treeBurnPose(0.9, 1);
    assert.ok(right.rot > 0);
    assert.ok(left.rot < 0);
    assert.equal(treeBurnPose(0.9, 2).rot, treeBurnPose(0.9, 2).rot);
    assert.ok(Math.abs(treeBurnPose(0.9, 2).rot) < Math.abs(right.rot));
  });

  it("picks the same trunk the standing painter would", () => {
    const a = treeStamp(12, 40, "lone");
    const b = treeStamp(12, 40, "lone");
    assert.deepEqual(a, b);
    assert.ok(a.drawH > 40);
    assert.ok(a.face >= 0 && a.face < 3);
  });
});