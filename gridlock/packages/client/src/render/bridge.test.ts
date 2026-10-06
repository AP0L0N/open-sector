import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bridgePath, bridgeWidth } from "@gridlock/shared";
import { brickDeckElev, brickFrame, layoutBridges, type BrickIn } from "./bridge.js";

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

  it("a straight run has no bends", () => {
    for (const b of layoutBridges(line(76, 220), wet)) {
      assert.equal(b.bendA, undefined);
      assert.equal(b.bendB, undefined);
    }
  });

  for (const type of ["bridge", "bigbridge"] as const) {
    for (const [name, corner] of [
      ["45°", { x: 300, y: 160 }],
      ["90°", { x: 180, y: 300 }],
    ] as const) {
      it(`a ${type} turning ${name} bends both bricks of the corner onto one seamless curve`, () => {
        const width = bridgeWidth(type);
        const spans = bridgePath(type, [{ x: 20, y: 40 }, { x: 180, y: 40 }, corner]);
        const bricks: BrickIn[] = spans.map((span) => ({ type, span, width, deck: 3 }));
        const l = layoutBridges(bricks, () => true);
        const bent = l.findIndex((b) => b.bendB);
        assert.ok(bent >= 0, "the corner brick bends");
        const a = l[bent]!.bendB!;
        const b = l[bent + 1]!.bendA!;
        assert.ok(b, "so does the one after it");
        assert.equal(a.cx, b.cx);
        assert.equal(a.cy, b.cy);
        assert.equal(a.tan, b.tan);
        assert.ok(Math.abs(a.turn + b.turn) < 1e-9);
        assert.equal(l.filter((x) => x.bendA || x.bendB).length, 2);
        // Every joint meets edge to edge, the bent one included.
        for (let i = 0; i + 1 < spans.length; i++) {
          const f0 = brickFrame(spans[i]!, width, l[i]!);
          const f1 = brickFrame(spans[i + 1]!, width, l[i + 1]!);
          for (const k of [-0.5, 0, 0.5]) {
            const p = f0(1, k);
            const q = f1(0, k);
            assert.ok(Math.hypot(p.x - q.x, p.y - q.y) < 1e-6, `joint ${i} k ${k}`);
          }
        }
      });
    }
  }
});
