import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fieldSpan } from "@gridlock/shared";
import { courseHeight, sandbagLayout } from "./sandbags.js";

describe("sandbag layout", () => {
  const span = fieldSpan("sandbags")!;

  for (const ruined of [false, true]) {
    it(`keeps every ${ruined ? "ruined" : "intact"} bag inside the wall footprint`, () => {
      for (const seed of [1, 7, 991, 123456]) {
        const bags = sandbagLayout(span.length, span.thick, ruined, seed);
        assert.ok(bags.length > 0);
        for (const b of bags) {
          const reach = Math.hypot(b.halfAlong, b.halfAcross);
          const along = Math.abs(b.along) + (b.yaw ? reach : b.halfAlong);
          const across = Math.abs(b.across) + (b.yaw ? reach : b.halfAcross);
          assert.ok(along <= span.length / 2 + (b.yaw ? span.thick / 2 : 0.01), `along ${along}`);
          assert.ok(across <= span.thick / 2 + (b.yaw ? span.thick / 2 : 0.01), `across ${across}`);
        }
      }
    });
  }

  it("stacks three courses on an intact wall and one on a ruin", () => {
    const h = courseHeight(span.thick);
    const intact = sandbagLayout(span.length, span.thick, false, 3);
    const ruin = sandbagLayout(span.length, span.thick, true, 3);
    assert.equal(intact.length, 17);
    assert.ok(Math.max(...intact.map((b) => b.z1)) > h * 3);
    assert.ok(Math.max(...ruin.map((b) => b.z1)) < h * 1.2);
  });

  it("lays the same wall for the same seed", () => {
    assert.deepEqual(sandbagLayout(span.length, span.thick, true, 42), sandbagLayout(span.length, span.thick, true, 42));
  });
});
