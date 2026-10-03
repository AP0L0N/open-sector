import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fieldSpan, fieldPath } from "@gridlock/shared";
import { fieldPointsWithCursor, pinFieldPoint, undoFieldPoint } from "./field-place.js";

describe("laying a field line in legs", () => {
  const L = fieldSpan("wall")!.length;

  it("pins the start on a click, the start and end on a drag, then one corner per release", () => {
    const click = pinFieldPoint([], { x: 10, y: 10 }, { x: 12, y: 11 }, L / 2);
    assert.deepEqual(click, [{ x: 10, y: 10 }]);
    const drag = pinFieldPoint([], { x: 10, y: 10 }, { x: 10 + L * 3, y: 10 }, L / 2);
    assert.deepEqual(drag, [
      { x: 10, y: 10 },
      { x: 10 + L * 3, y: 10 },
    ]);
    // The next press can be anywhere; only the release matters, the leg runs on from the last end.
    const next = pinFieldPoint(drag, { x: 500, y: 500 }, { x: 10 + L * 3, y: 10 + L * 2 }, L / 2);
    assert.equal(next.length, 3);
    assert.deepEqual(next[2], { x: 10 + L * 3, y: 10 + L * 2 });
    const pieces = fieldPath("wall", next, Math.PI / 2);
    assert.equal(pieces.length, 5, "three along, two up");
  });

  it("takes legs back one at a time and drops the start with the first leg", () => {
    const pts = [
      { x: 0, y: 0 },
      { x: L * 2, y: 0 },
      { x: L * 2, y: L * 2 },
    ];
    assert.equal(undoFieldPoint(pts).length, 2);
    assert.deepEqual(undoFieldPoint(undoFieldPoint(pts)), []);
    assert.deepEqual(undoFieldPoint([{ x: 1, y: 1 }]), []);
  });

  it("draws the live leg from the last pin to the cursor, or from a held press", () => {
    const cursor = { x: 50, y: 60 };
    assert.deepEqual(fieldPointsWithCursor([], null, cursor), [cursor]);
    assert.deepEqual(fieldPointsWithCursor([], { x: 1, y: 2 }, cursor), [{ x: 1, y: 2 }, cursor]);
    const pinned = [
      { x: 0, y: 0 },
      { x: L, y: 0 },
    ];
    const live = fieldPointsWithCursor(pinned, { x: 9, y: 9 }, cursor);
    assert.equal(live.length, 3);
    assert.deepEqual(live[2], cursor);
  });
});
