import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SHADOW_CAST,
  SUN_AZIMUTH,
  shadowLength,
  shadowStanceScale,
  shadowWorldDir,
  sunSkyWorld,
  sunWorldDir,
  treeShadowFootprint,
  buildingShadowFootprint,
  unitCastsShadow,
  unitShadowFootprint,
  unitShadowHeight,
} from "./sun.js";

const near = (a: number, b: number, eps = 1e-6): boolean => Math.abs(a - b) <= eps;

describe("unitCastsShadow", () => {
  it("runs on live units on land", () => {
    assert.equal(unitCastsShadow({ kind: "unit" }), true);
    assert.equal(unitCastsShadow({ kind: "unit", swimming: true }), false);
    assert.equal(unitCastsShadow({ kind: "unit", garrisonedIn: 3 }), false);
    assert.equal(unitCastsShadow({ kind: "building" }), false);
  });
});

describe("sun direction", () => {
  it("casts shadows opposite the sun", () => {
    const sun = sunWorldDir();
    const sh = shadowWorldDir();
    assert.ok(near(sun.x * sh.x + sun.y * sh.y, -1, 1e-6));
  });

  it("puts the sun WNW so shadows fall ESE", () => {
    const sun = sunWorldDir();
    assert.ok(sun.x < 0 && sun.y < 0, "sun is west and north");
    const sh = shadowWorldDir();
    assert.ok(sh.x > 0 && sh.y > 0, "shadows go east and south");
    assert.ok(Math.abs(SUN_AZIMUTH - (9 * Math.PI) / 8) < 1e-9);
  });
});

describe("shadowLength", () => {
  it("grows as the caster gets taller", () => {
    assert.equal(shadowLength(0), 0);
    assert.ok(shadowLength(20) > shadowLength(10));
  });
});

describe("shadowStanceScale", () => {
  it("shortens crouched and crawling casters", () => {
    assert.equal(shadowStanceScale(), 1);
    assert.equal(shadowStanceScale("stand"), 1);
    assert.ok(shadowStanceScale("crouch") < 1);
    assert.ok(shadowStanceScale("crawl") < shadowStanceScale("crouch"));
    assert.ok(unitShadowHeight(12, "crawl") < unitShadowHeight(12, "stand"));
  });
});

describe("unitShadowFootprint", () => {
  it("slides the blob away from the sun", () => {
    const sh = shadowWorldDir();
    const foot = unitShadowFootprint({
      x: 40,
      y: 80,
      facing: 0,
      radius: 12,
      elongated: true,
    });
    const dx = foot.cx - 40;
    const dy = foot.cy - 80;
    const mag = Math.hypot(dx, dy);
    assert.ok(mag > 1);
    assert.ok(near(dx / mag, sh.x, 1e-6));
    assert.ok(near(dy / mag, sh.y, 1e-6));
    const expect = shadowLength(unitShadowHeight(12)) * SHADOW_CAST;
    assert.ok(near(mag, expect, 1e-6));
  });

  it("elongates vehicles along the hull", () => {
    const east = unitShadowFootprint({
      x: 0,
      y: 0,
      facing: 0,
      radius: 12,
      elongated: true,
    });
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of east.points) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
    assert.ok(maxX - minX > maxY - minY);
  });

  it("keeps infantry roughly round", () => {
    const foot = unitShadowFootprint({
      x: 0,
      y: 0,
      facing: 0,
      radius: 7,
      elongated: false,
    });
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of foot.points) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
    assert.ok(near(maxX - minX, maxY - minY, 0.05));
  });
});

describe("sunSkyWorld", () => {
  it("hangs northwest of the map origin", () => {
    const p = sunSkyWorld(8);
    assert.ok(p.x < 0 && p.y < 0);
    assert.ok(p.z > 0);
  });
});

describe("treeShadowFootprint", () => {
  it("keeps a round canopy puddle at the stem", () => {
    const foot = treeShadowFootprint(10, 20, 38);
    const sh = shadowWorldDir();
    assert.ok(foot.cx > 10 && foot.cy > 20);
    const mag = Math.hypot(foot.cx - 10, foot.cy - 20);
    assert.ok(mag > 0.2);
    assert.ok(near((foot.cx - 10) / mag, sh.x, 1e-6));
  });
});

describe("buildingShadowFootprint", () => {
  it("slides with the sun and reaches past the lot corners", () => {
    const halfW = 24;
    const halfH = 16;
    const foot = buildingShadowFootprint({ x: 80, y: 40, halfW, halfH });
    const sh = shadowWorldDir();
    const mag = Math.hypot(foot.cx - 80, foot.cy - 40);
    assert.ok(mag > 0.5);
    assert.ok(near((foot.cx - 80) / mag, sh.x, 1e-6));
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of foot.points) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
    assert.ok(maxX - minX > maxY - minY);
    // South corner of the lot. The blob has to clear it or the ground pad hides it.
    const corner = Math.hypot(halfW, halfH);
    let reach = 0;
    for (const p of foot.points) {
      const dx = p.x - 80;
      const dy = p.y - 40;
      reach = Math.max(reach, (dx * halfW + dy * halfH) / corner);
    }
    assert.ok(reach > corner);
  });
});
