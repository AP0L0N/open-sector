import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bridgePath, bridgeWidth } from "@gridlock/shared";
import { brickDeckElev, layoutBridges, type BrickIn } from "./bridge.js";

/** A river from x = 100 to x = 200. */
const wet = (x: number): boolean => x >= 100 && x < 200;

function line(x0: number, x1: number, ruined: number[] = [], deck = 3): BrickIn[] {
  return bridgePath("bridge", [
    { x: x0, y: 50 },
    { x: x1, y: 50 },
  ]).map((span, i) => ({ type: "bridge", span, width: bridgeWidth("bridge"), deck, ruined: ruined.includes(i) }));
}

describe("bridge layout", () => {
  it("keeps one deck level the whole way and ends on the banks", () => {
    const l = layoutBridges(line(76, 220), wet);
    assert.equal(l[0]!.endA, "abut");
    assert.equal(l[l.length - 1]!.endB, "abut");
    for (const b of l) {
      assert.equal(b.ha, 3);
      assert.equal(b.hb, 3);
      assert.equal(brickDeckElev(b, 0.5), 3);
    }
    for (let i = 1; i < l.length; i++) {
      assert.equal(l[i - 1]!.endB, "join");
      assert.equal(l[i]!.endA, "join");
    }
  });

  it("the bricks either side of a fallen one break toward it; the wreck hangs from them", () => {
    const l = layoutBridges(line(76, 220, [3]), wet);
    assert.equal(l[2]!.endB, "break");
    assert.equal(l[4]!.endA, "break");
    assert.equal(l[3]!.endA, "join");
    assert.equal(l[3]!.endB, "join");
    assert.equal(l[1]!.endB, "join");
  });

  it("a run that stops over the water is left open there", () => {
    const l = layoutBridges(line(76, 150), wet);
    assert.equal(l[0]!.endA, "abut");
    assert.equal(l[l.length - 1]!.endB, "open");
  });
});
