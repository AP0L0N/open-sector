import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { drawHeatContact, drawScanContact, heatPulse, SCAN_MS, SCAN_PERIOD_MS, scanPhase } from "./thermal-fx.js";

/** A canvas stand-in that records every fill and stroke colour. */
function recorder() {
  const log = { fills: [] as string[], strokes: [] as string[] };
  const ctx = {
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    save() {},
    restore() {},
    beginPath() {},
    closePath() {},
    moveTo() {},
    lineTo() {},
    ellipse() {},
    fill() {
      log.fills.push(String(ctx.fillStyle));
    },
    stroke() {
      log.strokes.push(String(ctx.strokeStyle));
    },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, log };
}

describe("thermal contact", () => {
  it("breathes between 0 and 1, each contact on its own clock", () => {
    for (const t of [0, 300, 1099, 5000]) {
      const k = heatPulse(t, 7);
      assert.ok(k >= 0 && k <= 1);
    }
    assert.notEqual(heatPulse(0, 1), heatPulse(0, 2));
  });

  it("glows dark orange with a yellow core, and strokes nothing", () => {
    const { ctx, log } = recorder();
    drawHeatContact(ctx, 0, 0, { nowMs: 0, id: 1, unit: 20 });
    assert.equal(log.fills.length, 3);
    assert.ok(log.fills.some((f) => f.startsWith("rgba(215, 105, 15")));
    assert.ok(log.fills.some((f) => f.startsWith("rgba(255, 200, 60")));
    assert.equal(log.strokes.length, 0);
  });
});

describe("APS scan contact", () => {
  it("sweeps for SCAN_MS of every SCAN_PERIOD_MS", () => {
    let on = 0;
    for (let t = 0; t < SCAN_PERIOD_MS; t += 10) if (scanPhase(t, 0) != null) on++;
    assert.equal(on, SCAN_MS / 10);
  });

  it("holds a faint diamond between sweeps and lays the grid during one", () => {
    const quiet = recorder();
    drawScanContact(quiet.ctx, 0, 0, { nowMs: SCAN_MS + 10, id: 0, unit: 20 });
    assert.equal(quiet.log.strokes.length, 1);
    const sweep = recorder();
    drawScanContact(sweep.ctx, 0, 0, { nowMs: SCAN_MS / 2, id: 0, unit: 20 });
    assert.ok(sweep.log.strokes.length > 10);
  });
});
