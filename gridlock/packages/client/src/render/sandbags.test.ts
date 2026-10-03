import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fieldSpan } from "@gridlock/shared";
import { cornerBags, courseHeight, sandbagLayout } from "./sandbags.js";

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

  it("piles bags into the outer angle of a bend, none at a right angle or a straight joint", () => {
    const L = span.length;
    const T = span.thick;
    // Section along +x (facing -π/2 looks toward -y), ending at x = L/2. The next leg bends right by `turn`.
    const corner = (turn: number) => {
      const off = (T / 2) * Math.tan(turn / 2);
      const v = { x: Math.cos(turn), y: -Math.sin(turn) };
      const start = { x: L / 2 + off * (v.x - 1), y: off * v.y };
      // Right turn: the outer flank is on +y, which is -across for this facing.
      const nOut = { x: -v.y, y: v.x };
      return {
        outer: { x: start.x + (T / 2) * nOut.x, y: start.y + (T / 2) * nOut.y },
        inner: { x: start.x - (T / 2) * nOut.x, y: start.y - (T / 2) * nOut.y },
      };
    };
    const bend = corner(Math.PI / 3);
    const bags = cornerBags(L, T, -Math.PI / 2, 1, bend.outer, bend.inner, -1, 5);
    assert.equal(bags.length, 3, "one bag per course");
    for (const b of bags) {
      assert.ok(Math.abs(b.yaw) > 0.2 && Math.abs(b.yaw) < 1.2, `turned into the bend: yaw ${b.yaw}`);
      assert.ok(b.along > L / 2 - T, "at the end of the section");
      assert.ok(b.across < 0, "on the outer side");
    }
    const square = corner(Math.PI / 2);
    assert.deepEqual(cornerBags(L, T, -Math.PI / 2, 1, square.outer, square.inner, -1, 5), []);
    const straight = corner(0);
    assert.deepEqual(cornerBags(L, T, -Math.PI / 2, 1, straight.outer, straight.inner, -1, 5), []);
  });
});
