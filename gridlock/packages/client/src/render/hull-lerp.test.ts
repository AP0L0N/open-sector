import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cornerPivot, lerpHullPose } from "./hull-lerp.js";

const deg = (d: number): number => (d * Math.PI) / 180;
const near = (a: number, b: number, eps = 1e-6): boolean => Math.abs(a - b) <= eps;

describe("lerpHullPose", () => {
  it("lerps position immediately when facing is unchanged", () => {
    const p = lerpHullPose({ x: 0, y: 0, facing: 0 }, { x: 40, y: 0, facing: 0 }, 0.5, 85, 5, 0.1);
    assert.equal(p.x, 20);
    assert.equal(p.facing, 0);
  });

  it("yaws first when the whole roll is on the new heading", () => {
    const prev = { x: 0, y: 0, facing: 0 };
    const next = { x: 40 * Math.cos(deg(36)), y: 40 * Math.sin(deg(36)), facing: deg(36) };
    const early = lerpHullPose(prev, next, 0.2, 85, 5, 0.1);
    assert.equal(early.x, 0);
    assert.equal(early.y, 0);
    assert.ok(early.facing > 0.05 && early.facing < next.facing);
    const late = lerpHullPose(prev, next, 0.95, 85, 5, 0.1);
    assert.ok(near(late.facing, next.facing));
    assert.ok(late.x > 0);
    assert.ok(near(Math.atan2(late.y, late.x), deg(36)), "rolls along the new heading");
    const end = lerpHullPose(prev, next, 1, 85, 5, 0.1);
    assert.ok(near(end.x, next.x) && near(end.y, next.y));
  });

  it("rolls to the pivot on the old heading before yawing", () => {
    const prev = { x: 0, y: 0, facing: 0 };
    const next = { x: 40, y: 0, facing: deg(20) };
    const early = lerpHullPose(prev, next, 0.2, 85, 5, 0.1);
    assert.ok(early.x > 0, "should already be rolling");
    assert.equal(early.y, 0);
    assert.equal(early.facing, 0);
    const end = lerpHullPose(prev, next, 1, 85, 5, 0.1);
    assert.equal(end.x, 40);
    assert.ok(near(end.facing, next.facing));
  });

  it("rebuilds a path corner instead of cutting it diagonally", () => {
    const prev = { x: 0, y: 0, facing: 0 };
    const next = { x: 40, y: 30, facing: deg(90) };
    let sawOld = false;
    let sawTurn = false;
    let sawNew = false;
    let lx = 0;
    let ly = 0;
    let lf = 0;
    for (let i = 1; i <= 100; i++) {
      const p = lerpHullPose(prev, next, i / 100, 85, 5, 0.1);
      const mx = p.x - lx;
      const my = p.y - ly;
      const moved = Math.hypot(mx, my) > 1e-6;
      const turned = Math.abs(p.facing - lf) > 1e-9;
      if (turned) {
        const atPivot = (near(p.x, 40) && near(p.y, 0)) || (near(lx, 40) && near(ly, 0));
        assert.ok(atPivot, `yawed away from the pivot at u=${i / 100}`);
      }
      if (moved && !turned) {
        const md = Math.atan2(my, mx);
        assert.ok(near(md, p.facing, 1e-6), `moved off-axis at u=${i / 100}: motion ${md} facing ${p.facing}`);
        if (near(p.facing, 0)) sawOld = true;
        if (near(p.facing, deg(90))) sawNew = true;
      }
      if (turned) sawTurn = true;
      lx = p.x;
      ly = p.y;
      lf = p.facing;
    }
    assert.ok(sawOld && sawTurn && sawNew, `phases old=${sawOld} turn=${sawTurn} new=${sawNew}`);
    assert.ok(near(lx, 40) && near(ly, 30));
  });

  it("falls back to yaw-then-roll when the corner is not explainable", () => {
    // Nearly parallel headings with a sideways offset — a shove, not a corner.
    const prev = { x: 0, y: 0, facing: 0 };
    const next = { x: 40, y: 6, facing: deg(2) };
    assert.equal(cornerPivot(prev, next), null);
    const early = lerpHullPose(prev, next, 0.01, 85, 5, 0.1);
    assert.equal(early.x, 0);
    assert.equal(early.y, 0);
  });
});

describe("cornerPivot", () => {
  it("finds the intersection of the two heading lines", () => {
    const p = cornerPivot({ x: 0, y: 0, facing: 0 }, { x: 40, y: 30, facing: deg(90) });
    assert.ok(p);
    assert.ok(near(p.x, 40) && near(p.y, 0));
    assert.ok(near(p.before, 40) && near(p.after, 30));
  });

  it("rejects unchanged headings and no travel", () => {
    assert.equal(cornerPivot({ x: 0, y: 0, facing: 0 }, { x: 40, y: 0, facing: 0 }), null);
    assert.equal(cornerPivot({ x: 0, y: 0, facing: 0 }, { x: 0, y: 0, facing: deg(40) }), null);
  });
});
