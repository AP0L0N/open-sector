import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CYBORG_DEATH_SPARK_MS, cyborgHipPoint, cyborgSparkAlpha } from "./cyborg-sparks.js";

describe("cyborg sparks", () => {
  it("sputters at full strength, fades, then goes dark", () => {
    assert.equal(cyborgSparkAlpha(0), 1);
    assert.equal(cyborgSparkAlpha(CYBORG_DEATH_SPARK_MS * 0.3), 1);
    const late = cyborgSparkAlpha(CYBORG_DEATH_SPARK_MS * 0.8);
    assert.ok(late > 0 && late < 1, `late ${late}`);
    assert.equal(cyborgSparkAlpha(CYBORG_DEATH_SPARK_MS), 0);
    assert.equal(cyborgSparkAlpha(-1), 0);
  });

  it("puts the torn hips behind the torso, the way the body points", () => {
    const east = cyborgHipPoint(0, 0, 100, 1, 0);
    assert.ok(east.x < -15);
    const south = cyborgHipPoint(0, 0, 100, 0, 1);
    assert.ok(south.y < -15);
  });
});
