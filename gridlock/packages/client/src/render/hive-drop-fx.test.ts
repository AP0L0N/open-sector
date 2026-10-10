import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  cometLift,
  drawDeploymentGrid,
  drawHiveComet,
  drawHiveImpact,
  gridBreath,
  gridSweep,
  HIVE_SHAKE_MS,
  hiveShake,
} from "./hive-drop-fx.js";

/** A canvas stand-in that records every fill and stroke, and every point a path passes. */
function recorder() {
  const log = { fills: 0, strokes: 0, points: [] as [number, number][] };
  const grad = { addColorStop() {} };
  const ctx = {
    fillStyle: "" as unknown,
    strokeStyle: "" as unknown,
    lineWidth: 1,
    save() {},
    restore() {},
    beginPath() {},
    closePath() {},
    moveTo(x: number, y: number) {
      log.points.push([x, y]);
    },
    lineTo(x: number, y: number) {
      log.points.push([x, y]);
    },
    ellipse() {},
    arc() {},
    quadraticCurveTo() {},
    fillRect() {},
    createLinearGradient: () => grad,
    createRadialGradient: () => grad,
    fill() {
      log.fills++;
    },
    stroke() {
      log.strokes++;
    },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, log };
}

/** 2:1 iso, one world unit to one screen px across. */
const iso = (x: number, y: number) => ({ x: x - y, y: (x + y) / 2 });

describe("Deployment grid", () => {
  it("breathes and sweeps between 0 and 1", () => {
    for (const t of [0, 500, 1600, 9999]) {
      const k = gridBreath(t);
      const s = gridSweep(t);
      assert.ok(k >= 0 && k <= 1);
      assert.ok(s >= 0 && s < 1);
    }
    assert.notEqual(gridBreath(0), gridBreath(800));
  });

  it("lays rings and spokes flat on the ground inside its radius", () => {
    const { ctx, log } = recorder();
    drawDeploymentGrid(ctx, iso, 100, 100, { nowMs: 0, radius: 40 });
    // Four rings, twelve spokes, and the sweep ring.
    assert.equal(log.strokes, 4 + 12 + 1);
    const c = iso(100, 100);
    const far = iso(140, 140);
    for (const [x, y] of log.points) {
      assert.ok(Math.abs(x - c.x) <= Math.abs(iso(140, 60).x - c.x) + 1e-6);
      assert.ok(Math.abs(y - c.y) <= far.y - c.y + 1e-6);
    }
  });

  it("draws in as the Hive Core comes down", () => {
    const wide = recorder();
    drawDeploymentGrid(wide.ctx, iso, 0, 0, { nowMs: 0, radius: 40, charge: 0 });
    const narrow = recorder();
    drawDeploymentGrid(narrow.ctx, iso, 0, 0, { nowMs: 0, radius: 40, charge: 1 });
    const reach = (pts: [number, number][]) => Math.max(...pts.map(([x]) => Math.abs(x)));
    assert.ok(reach(narrow.log.points) < reach(wide.log.points));
  });
});

describe("Hive Core drop", () => {
  it("shakes the view hard on landing and settles", () => {
    const mag = (s: { x: number; y: number }) => Math.hypot(s.x, s.y);
    let early = 0;
    let late = 0;
    for (let t = 0; t < 200; t += 7) {
      early = Math.max(early, mag(hiveShake(40, t)));
      late = Math.max(late, mag(hiveShake(HIVE_SHAKE_MS - 60, t)));
    }
    assert.ok(early > 5 && late < early / 4);
    assert.equal(mag(hiveShake(HIVE_SHAKE_MS, 123)), 0);
  });

  it("falls from far off the screen, faster near the ground, and lands at zero height", () => {
    // Two dozen tiles' worth of sky: past the top of the view.
    assert.ok(cometLift(0, 32) > 700);
    assert.equal(cometLift(1, 10), 0);
    const early = cometLift(0, 10) - cometLift(0.2, 10);
    const late = cometLift(0.8, 10) - cometLift(1, 10);
    assert.ok(late > early);
  });

  it("draws the falling core and its landing, and nothing once the landing is over", () => {
    const fall = recorder();
    drawHiveComet(fall.ctx, 0, 0, { u: 0.5, unit: 20, nowMs: 0 });
    assert.ok(fall.log.fills > 0);
    const land = recorder();
    drawHiveImpact(land.ctx, 0, 0, { age: 0.1, unit: 20 });
    assert.ok(land.log.fills > 0 && land.log.strokes > 0);
    const done = recorder();
    drawHiveImpact(done.ctx, 0, 0, { age: 1, unit: 20 });
    assert.equal(done.log.fills + done.log.strokes, 0);
  });
});
