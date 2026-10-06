import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bridgePath, bridgeWidth } from "@gridlock/shared";
import { BRIDGE_DECK_RISE, brickDeckElev, layoutBridges, type BrickIn } from "./bridge.js";

/** A river from x = 100 to x = 200, banks at height 3 west and 1 east, water at 0. */
const wet = (x: number): boolean => x >= 100 && x < 200;
const ground = (x: number): number => (x < 100 ? 3 : x >= 200 ? 1 : 0);

function line(x0: number, x1: number, ruined: number[] = []): BrickIn[] {
  return bridgePath("bridge", [
    { x: x0, y: 50 },
    { x: x1, y: 50 },
  ]).map((span, i) => ({ type: "bridge", span, width: bridgeWidth("bridge"), ruined: ruined.includes(i) }));
}

describe("bridge layout", () => {
  it("rests on each bank at its ends and rides clear of the water between", () => {
    const bricks = line(76, 220);
    const l = layoutBridges(bricks, ground, wet);
    assert.equal(l[0]!.endA, "abut");
    assert.equal(l[l.length - 1]!.endB, "abut");
    assert.equal(l[0]!.ha, 3);
    assert.equal(l[l.length - 1]!.hb, 1);
    for (let i = 1; i < l.length; i++) {
      assert.equal(l[i - 1]!.endB, "join");
      assert.equal(l[i]!.endA, "join");
      // Neighbours share the height of the joint they meet at.
      assert.ok(Math.abs(l[i - 1]!.hb - l[i]!.ha) < 1e-9);
    }
    const mid = l[Math.floor(l.length / 2)]!;
    assert.ok(mid.ha > 1 && mid.ha <= 3 + BRIDGE_DECK_RISE.bridge, `mid ${mid.ha}`);
  });

  it("an abutting end eases onto the bank in an arch, not a straight ramp", () => {
    const l = { ha: 0, hb: 2, endA: "abut" as const, endB: "join" as const };
    assert.equal(brickDeckElev(l, 0), 0);
    assert.ok(Math.abs(brickDeckElev(l, 1) - 2) < 1e-9);
    assert.ok(brickDeckElev(l, 0.5) > 1, "the arch is above the straight line");
  });

  it("the bricks either side of a fallen one break toward it; the wreck hangs from them", () => {
    const bricks = line(76, 220, [3]);
    const l = layoutBridges(bricks, ground, wet);
    assert.equal(l[2]!.endB, "break");
    assert.equal(l[4]!.endA, "break");
    assert.equal(l[3]!.endA, "join");
    assert.equal(l[3]!.endB, "join");
    assert.equal(l[1]!.endB, "join");
  });

  it("a run that stops over the water is left open there", () => {
    const l = layoutBridges(line(76, 150), ground, wet);
    assert.equal(l[0]!.endA, "abut");
    assert.equal(l[l.length - 1]!.endB, "open");
  });
});
