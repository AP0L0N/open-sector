import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PULSAR_AREA_DAY, PULSAR_AREA_SEGMENTS, PULSAR_PULSE_MS, pulsarAreaStrength, pulsarPulse, pulsarRim } from "./pulsar-area.js";

describe("Neural Pulsar area", () => {
  it("rings the dome's ground circle", () => {
    const rim = pulsarRim(100, 50, 30);
    assert.equal(rim.length, PULSAR_AREA_SEGMENTS);
    for (const p of rim) assert.ok(Math.abs(Math.hypot(p.x - 100, p.y - 50) - 30) < 1e-9);
  });

  it("reads faintly by day and fully at night", () => {
    assert.equal(pulsarAreaStrength(0), PULSAR_AREA_DAY);
    assert.equal(pulsarAreaStrength(1), 1);
    assert.ok(pulsarAreaStrength(0.5) > PULSAR_AREA_DAY && pulsarAreaStrength(0.5) < 1);
  });

  it("pulses out from the Nexus to the rim, dark at both ends", () => {
    const start = pulsarPulse(0, 0);
    const mid = pulsarPulse(PULSAR_PULSE_MS / 2, 0);
    assert.ok(start.k < 0.01 && start.a < 0.01);
    assert.ok(Math.abs(mid.k - 0.5) < 1e-9 && mid.a > 0.5);
    assert.ok(pulsarPulse(PULSAR_PULSE_MS * 0.99, 0).a < 0.05);
  });
});
