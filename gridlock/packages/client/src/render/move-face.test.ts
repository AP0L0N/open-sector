import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MOVE_FACE_DRAG_PX,
  MOVE_FACE_HOLD_MS,
  aimMoveFace,
  moveFaceArmed,
  moveFaceCommand,
} from "./move-face.js";

describe("move and face", () => {
  it("stays a plain move until the click is held or dragged", () => {
    const draft = { armed: false, at: 1000 };
    assert.equal(moveFaceArmed(draft, 1000 + MOVE_FACE_HOLD_MS - 1, 0), false);
    assert.equal(moveFaceArmed(draft, 1000 + MOVE_FACE_HOLD_MS, 0), true);
    assert.equal(moveFaceArmed(draft, 1000, MOVE_FACE_DRAG_PX), true);
    assert.equal(moveFaceArmed({ armed: true, at: 1000 }, 1000, 0), true);
  });

  it("aims from the destination and keeps the heading inside the slop", () => {
    const anchor = { x: 10, y: 20 };
    const held = aimMoveFace(anchor, { x: 12, y: 21 }, Math.PI / 2);
    assert.equal(held.aimed, false);
    assert.equal(held.facing, Math.PI / 2);
    const aimed = aimMoveFace(anchor, { x: 10, y: 40 }, 0);
    assert.equal(aimed.aimed, true);
    assert.ok(Math.abs(aimed.facing - Math.PI / 2) < 1e-6);
  });

  it("sends the arrival heading only once the gesture is armed", () => {
    const g = { ids: [3, 4], x: 8, y: 9, facing: 1.2, armed: false };
    assert.deepEqual(moveFaceCommand(g), { type: "cmd.move", ids: [3, 4], x: 8, y: 9 });
    assert.deepEqual(moveFaceCommand({ ...g, armed: true }), {
      type: "cmd.move",
      ids: [3, 4],
      x: 8,
      y: 9,
      facing: 1.2,
    });
  });
});
