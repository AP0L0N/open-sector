import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fieldSpan } from "@gridlock/shared";
import { WALL_SLAB_H, WALL_WIRE_H, wallPostAlong } from "./wall.js";

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
});
