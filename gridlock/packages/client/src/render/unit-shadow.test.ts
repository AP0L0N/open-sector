import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { shadowStanceScale, unitCastsShadow, unitShadowFootprint } from "./unit-shadow.js";

function extent(points: { x: number; y: number }[]): { w: number; h: number } {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}

describe("unitCastsShadow", () => {
  it("skips garrisoned, swimming, and non-units", () => {
    assert.equal(unitCastsShadow({ kind: "unit" }), true);
    assert.equal(unitCastsShadow({ kind: "unit", swimming: true }), false);
    assert.equal(unitCastsShadow({ kind: "unit", garrisonedIn: 3 }), false);
    assert.equal(unitCastsShadow({ kind: "building" }), false);
  });
});

describe("shadowStanceScale", () => {
  it("shrinks as the soldier goes lower", () => {
    assert.equal(shadowStanceScale(), 1);
    assert.ok(shadowStanceScale("crouch") < 1);
    assert.ok(shadowStanceScale("crawl") < shadowStanceScale("crouch"));
  });
});

describe("unitShadowFootprint", () => {
  it("slides the blob east and south of the feet", () => {
    const foot = unitShadowFootprint({ x: 40, y: 80, facing: 0, radius: 12, elongated: true });
    assert.ok(foot.cx > 40 && foot.cy > 80);
  });

  it("elongates vehicles along the hull", () => {
    const e = extent(unitShadowFootprint({ x: 0, y: 0, facing: 0, radius: 12, elongated: true }).points);
    assert.ok(e.w > e.h);
  });

  it("keeps infantry roughly round", () => {
    const e = extent(unitShadowFootprint({ x: 0, y: 0, facing: 0, radius: 7, elongated: false }).points);
    assert.ok(Math.abs(e.w - e.h) < 0.05);
  });
});
