import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { drawSonarContact, drawWaterMine, SONAR_PING_MS, sonarPingPhase, waterMineBob } from "./sonar-fx.js";

/** A canvas stand-in that records every fill and stroke colour and ellipse radius. */
function recorder() {
  const log = { fills: [] as string[], strokes: [] as string[], radii: [] as number[] };
  const ctx = {
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    lineCap: "butt",
    save() {},
    restore() {},
    beginPath() {},
    closePath() {},
    moveTo() {},
    lineTo() {},
    arc(_x: number, _y: number, r: number) {
      log.radii.push(r);
    },
    ellipse(_x: number, _y: number, rx: number) {
      log.radii.push(rx);
    },
    fill() {
      log.fills.push(String(ctx.fillStyle));
    },
    stroke() {
      log.strokes.push(String(ctx.strokeStyle));
    },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, log };
}

describe("sonar contact", () => {
  it("pings on a loop, each contact on its own clock", () => {
    for (const t of [0, 400, 1799]) {
      const k = sonarPingPhase(t, 3);
      assert.ok(k >= 0 && k < 1);
    }
    assert.equal(sonarPingPhase(250, 3), sonarPingPhase(250 + SONAR_PING_MS, 3));
    assert.notEqual(sonarPingPhase(0, 1), sonarPingPhase(0, 2));
  });

  it("fills the marker for a boat on the surface and leaves it hollow for one below", () => {
    const up = recorder();
    drawSonarContact(up.ctx, 0, 0, { nowMs: 0, id: 1, down: false, unit: 16 });
    const down = recorder();
    drawSonarContact(down.ctx, 0, 0, { nowMs: 0, id: 1, down: true, unit: 16 });
    assert.equal(up.log.fills.length, 1);
    assert.equal(down.log.fills.length, 0);
  });
});

describe("water mine", () => {
  it("bobs a little at the waterline", () => {
    for (let t = 0; t < 4000; t += 100) assert.ok(Math.abs(waterMineBob(5, t)) <= 0.6 + 1e-9);
  });

  it("draws the ball and its horns at the size it is given; arming horns stay dark", () => {
    const live = recorder();
    drawWaterMine(live.ctx, 0, 0, { seed: 1, arming: false, nowMs: 0, size: 4 });
    assert.ok(Math.max(...live.log.radii) <= 4 * 2.5, "stays near its size");
    assert.ok(live.log.radii.includes(4), "the ball");
    const arming = recorder();
    drawWaterMine(arming.ctx, 0, 0, { seed: 1, arming: true, nowMs: 0, size: 4 });
    assert.ok(arming.log.fills.includes("#3a3530"));
    assert.equal(live.log.fills.includes("#3a3530"), false);
  });
});
