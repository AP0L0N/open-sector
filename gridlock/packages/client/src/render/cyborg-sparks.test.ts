import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CYBORG_DEATH_SPARK_MS, arcLit, cyborgHipPoint, cyborgSparkAlpha } from "./cyborg-sparks.js";

describe("cyborg sparks", () => {
  it("shorts out at full strength, fades, then goes dark", () => {
    assert.equal(cyborgSparkAlpha(0), 1);
    assert.equal(cyborgSparkAlpha(CYBORG_DEATH_SPARK_MS * 0.5), 1);
    const late = cyborgSparkAlpha(CYBORG_DEATH_SPARK_MS * 0.8);
    assert.ok(late > 0 && late < 1, `late ${late}`);
    assert.equal(cyborgSparkAlpha(CYBORG_DEATH_SPARK_MS), 0);
    assert.equal(cyborgSparkAlpha(-1), 0);
  });

  it("flickers the same way on every redraw of a slot and never at zero chance", () => {
    for (const ms of [0, 35, 69]) assert.equal(arcLit(ms, 7, 0, 0.5), arcLit(0, 7, 0, 0.5));
    let lit = 0;
    for (let slot = 0; slot < 400; slot++) if (arcLit(slot * 70, 7, 0, 0.5)) lit++;
    assert.ok(lit > 120 && lit < 280, `lit ${lit}/400`);
    for (let slot = 0; slot < 50; slot++) assert.equal(arcLit(slot * 70, 7, 0, 0), false);
  });

  it("puts the torn hips behind the torso, the way the body points", () => {
    const east = cyborgHipPoint(0, 0, 100, 1, 0);
    assert.ok(east.x < -15);
    const south = cyborgHipPoint(0, 0, 100, 0, 1);
    assert.ok(south.y < -15);
  });
});
