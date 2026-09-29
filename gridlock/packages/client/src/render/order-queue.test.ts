import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { planColor, withQueue } from "./order-queue.js";

describe("shift order queue", () => {
  it("tags unit orders only while Shift is held", () => {
    const move = { type: "cmd.move", ids: [1], x: 10, y: 20 } as const;
    assert.deepEqual(withQueue(move, false), move);
    assert.deepEqual(withQueue(move, true), { ...move, queue: true });
    assert.deepEqual(withQueue({ type: "cmd.attack", ids: [1], targetId: 9 }, true), {
      type: "cmd.attack",
      ids: [1],
      targetId: 9,
      queue: true,
    });
  });

  it("leaves non-order commands alone", () => {
    const stop = { type: "cmd.stop", ids: [1] } as const;
    assert.deepEqual(withQueue(stop, true), stop);
    const rally = { type: "cmd.rally", ids: [3], x: 1, y: 2 } as const;
    assert.deepEqual(withQueue(rally, true), rally);
    const stance = { type: "cmd.stance", ids: [1], stance: "crouch" } as const;
    assert.deepEqual(withQueue(stance, true), stance);
  });

  it("colours each leg by what the unit does there", () => {
    assert.notEqual(planColor("move"), planColor("attack"));
    assert.notEqual(planColor("attack"), planColor("other"));
  });
});
