import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RADAR_BLINK_DUTY, RADAR_BLINK_MS, radarContactLit, radarContactPhase } from "./radar-panel.js";

describe("radar contact blink", () => {
  it("is on for the duty share of each period and off for the rest", () => {
    let on = 0;
    const steps = 200;
    for (let i = 0; i < steps; i++) if (radarContactLit((i / steps) * RADAR_BLINK_MS, 0)) on++;
    assert.ok(Math.abs(on / steps - RADAR_BLINK_DUTY) < 0.02, `${on}/${steps}`);
  });

  it("repeats every period", () => {
    for (const id of [1, 7, 42]) {
      for (let ms = 0; ms < RADAR_BLINK_MS; ms += 37) {
        assert.equal(radarContactLit(ms, id), radarContactLit(ms + RADAR_BLINK_MS * 3, id));
      }
    }
  });

  it("gives different contacts different phases, and the same contact the same phase", () => {
    assert.equal(radarContactPhase(5), radarContactPhase(5));
    const phases = new Set([1, 2, 3, 4, 5, 6, 7].map(radarContactPhase));
    assert.ok(phases.size >= 5);
    for (const p of phases) assert.ok(p >= 0 && p < 1);
  });
});
