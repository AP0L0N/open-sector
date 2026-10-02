import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fieldSpan } from "@gridlock/shared";
import { WALL_SLAB_H, WALL_WIRE_H, wallEndSeal, wallPostAlong, wallSectionsConnect, wallTopElev } from "./wall.js";

describe("concrete wall", () => {
  const span = fieldSpan("wall")!;

  it("stands the posts inside one section, with wire above the slab", () => {
    const posts = wallPostAlong(span.length);
    assert.equal(posts.length, 2);
    assert.ok(posts[0]! < 0 && posts[1]! > 0);
    assert.ok(Math.abs(posts[0]!) < span.length / 2);
    assert.ok(posts[1]! < span.length / 2);
    assert.ok(WALL_WIRE_H > 0);
    assert.ok(WALL_SLAB_H > span.thick);
  });

  it("keeps one top across sections that meet, and stretches from the highest ground", () => {
    const length = span.length;
    assert.equal(wallSectionsConnect({ x: 0, y: 0, length }, { x: length, y: 0, length }), true);
    assert.equal(wallSectionsConnect({ x: 0, y: 0, length }, { x: length * 2, y: 0, length }), false);
    assert.equal(wallTopElev([2, 5, 3], 4), 9);
    assert.equal(wallTopElev([], 4), 4);
  });

  it("hides the cap where the next section butts in", () => {
    const section = { x: 0, y: 0, facing: 0, length: span.length, thick: span.thick };
    const sealed = wallEndSeal(section, [{ x: 0, y: span.length }]);
    assert.deepEqual(sealed, { neg: false, pos: true });
    const open = wallEndSeal(section, [{ x: 0, y: span.length * 2 }]);
    assert.deepEqual(open, { neg: false, pos: false });
    const beside = wallEndSeal(section, [{ x: span.thick + 2, y: span.length }]);
    assert.deepEqual(beside, { neg: false, pos: false });
  });
});
