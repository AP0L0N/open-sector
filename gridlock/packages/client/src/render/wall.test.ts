import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fieldCornerStart, fieldPath, fieldSpan } from "@gridlock/shared";
import {
  GATE_POST_LEN,
  gateBoom,
  LARGE_WALL_SLAB_H,
  LARGE_WALL_STYLE,
  WALL_SLAB_H,
  WALL_STYLE,
  WALL_WIRE_H,
  wallFootprintWorld,
  wallJoins,
  wallPostAlong,
  wallSectionsConnect,
  wallSlitAlong,
  wallTopElev,
  type WallSection,
} from "./wall.js";

describe("concrete wall", () => {
  const span = fieldSpan("wall")!;
  const L = span.length;
  const T = span.thick;
  const section = (p: { x: number; y: number; facing: number }): WallSection => ({ ...p, length: L, thick: T });

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
    assert.equal(wallSectionsConnect({ x: 0, y: 0, length: L }, { x: L, y: 0, length: L }), true);
    assert.equal(wallSectionsConnect({ x: 0, y: 0, length: L }, { x: L * 2, y: 0, length: L }), false);
    assert.equal(wallTopElev([2, 5, 3], 4), 9);
    assert.equal(wallTopElev([], 4), 4);
  });

  it("hides the cap where the next section butts straight on", () => {
    const me = section({ x: 0, y: 0, facing: 0 });
    const sealed = wallJoins(me, [section({ x: 0, y: L, facing: 0 })]);
    assert.deepEqual(sealed, { neg: null, pos: { kind: "flush" } });
    const open = wallJoins(me, [section({ x: 0, y: L * 2, facing: 0 })]);
    assert.deepEqual(open, { neg: null, pos: null });
    const beside = wallJoins(me, [section({ x: T + 2, y: L, facing: 0 })]);
    assert.deepEqual(beside, { neg: null, pos: null });
    const both = wallJoins(me, [section({ x: 0, y: L, facing: 0 }), section({ x: 0, y: -L, facing: Math.PI })]);
    assert.deepEqual(both, { neg: { kind: "flush" }, pos: { kind: "flush" } });
  });

  it("runs the tail of a leg out to the mitre where the line turns, and seals the head of the next leg", () => {
    const pieces = fieldPath(
      "wall",
      [
        { x: 0, y: 0 },
        { x: L * 2, y: 0 },
        { x: L * 2, y: L * 2 },
      ],
      Math.PI / 2,
    );
    assert.equal(pieces.length, 4);
    const all = pieces.map(section);
    // Facing +y puts the along axis on -x, so the corner is at this section's neg end and the straight joint at its pos end.
    const tail = wallJoins(all[1]!, all);
    assert.equal(tail.pos?.kind, "flush");
    assert.equal(tail.neg?.kind, "corner");
    if (tail.neg?.kind !== "corner") return;
    const corner = tail.neg;
    // The next leg starts on this one's flank; its outer start corner is at the corner's outer edge.
    const start = fieldCornerStart(T, L * 2, 0, 1, 0, 0, 1);
    assert.ok(Math.abs(corner.outer.x - (start.x + T / 2)) < 1e-6);
    assert.ok(Math.abs(corner.outer.y - start.y) < 1e-6);
    assert.ok(Math.abs(corner.inner.x - (start.x - T / 2)) < 1e-6);
    // Turning left (toward +y) the outer side is -y: this section looks toward +y, so -across.
    assert.equal(corner.outerSide, -1);
    assert.ok(Math.abs(corner.normal.x - 1) < 1e-6, "the next leg's outer flank faces +x");
    const head = wallJoins(all[2]!, all);
    assert.equal(head.neg?.kind, "flush", "the first section of the new leg hides its cap");
    assert.equal(head.pos?.kind, "flush");
    const end = wallJoins(all[3]!, all);
    assert.ok(end.pos === null || end.neg === null, "the far end is open");
    // The tail's footprint reaches the outer corner, for its cast shadow.
    const foot = wallFootprintWorld(all[1]!, tail);
    assert.equal(foot.length, 5);
    assert.ok(foot.some((p) => Math.abs(p.x - corner.outer.x) < 1e-6 && Math.abs(p.y - corner.outer.y) < 1e-6));
  });

  it("joins a bend short of a right angle too", () => {
    const a = 0.9;
    const pieces = fieldPath(
      "wall",
      [
        { x: 0, y: 0 },
        { x: L * 2, y: 0 },
        { x: L * 2 + L * 2 * Math.cos(a), y: L * 2 * Math.sin(a) },
      ],
      Math.PI / 2,
    );
    assert.equal(pieces.length, 4);
    const all = pieces.map(section);
    const tail = wallJoins(all[1]!, all);
    assert.ok(tail.neg?.kind === "corner" || tail.pos?.kind === "corner", "the tail runs out to the mitre");
    const head = wallJoins(all[2]!, all);
    assert.equal(head.neg?.kind, "flush");
    assert.equal(head.pos?.kind, "flush");
  });

  it("gives the Large wall the same concrete, taller, with slits where the sim puts the muzzles", () => {
    assert.ok(LARGE_WALL_SLAB_H > WALL_SLAB_H * 1.4);
    assert.equal(LARGE_WALL_STYLE.slits, true);
    assert.equal(LARGE_WALL_STYLE.wire, false);
    assert.equal(WALL_STYLE.slits, false);
    const slits = wallSlitAlong(L);
    assert.deepEqual(slits, [-L / 4, L / 4]);
  });
});

describe("gate boom", () => {
  const L = fieldSpan("wall")!.length;

  it("lies flat across the gap when down and stands nearly upright when up", () => {
    const down = gateBoom(0, L, WALL_SLAB_H);
    const arm = L - GATE_POST_LEN * 2 - 1;
    assert.ok(Math.abs(down.a1 - down.a0 - arm) < 1e-9);
    assert.equal(down.rise, 0);
    assert.ok(down.hinge > WALL_SLAB_H * 0.6 && down.hinge < WALL_SLAB_H);
    const up = gateBoom(1, L, WALL_SLAB_H);
    assert.ok(up.rise > arm * 0.95, "nearly vertical");
    assert.ok(up.a1 - up.a0 < arm * 0.15, "barely reaches across");
    const half = gateBoom(0.5, L, WALL_SLAB_H);
    assert.ok(half.rise > 0 && half.rise < up.rise);
  });
});
