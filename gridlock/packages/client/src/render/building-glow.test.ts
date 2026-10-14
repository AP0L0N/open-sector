import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { glowWeight } from "./building-glow.js";

describe("building glow", () => {
  it("lights amber windows and hive panels", () => {
    assert.ok(glowWeight(255, 190, 70, 255) > 0.8, "a lit Alliance window");
    assert.ok(glowWeight(90, 245, 200, 255) > 0.8, "a Xenite panel");
    assert.ok(glowWeight(186, 245, 225, 255) > 0.5, "a hive's near-white core");
  });

  it("leaves paint, hull and pad dark", () => {
    assert.equal(glowWeight(200, 165, 40, 255), 0, "a hazard stripe");
    assert.equal(glowWeight(232, 184, 56, 255), 0, "the Core pylon chevrons, at their brightest");
    assert.equal(glowWeight(72, 66, 45, 255), 0, "olive hull plate");
    assert.equal(glowWeight(153, 157, 148, 255), 0, "a grey pad");
    assert.equal(glowWeight(250, 250, 250, 255), 0, "plain white");
    assert.equal(glowWeight(255, 190, 70, 40), 0, "a soft edge");
  });
});
