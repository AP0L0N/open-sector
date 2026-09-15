import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  hasNeighbor,
  houseGroups,
  lotsEdgeAdjacent,
  neighborMap,
  neighborSides,
  seamInset,
  type HouseLot,
} from "./house-group.js";

function lot(id: number, x: number, y: number, w = 2, h = 2): HouseLot {
  return { id, x, y, w, h };
}

describe("house groups", () => {
  it("treats shared edges as adjacent and corners as not", () => {
    assert.equal(lotsEdgeAdjacent(lot(1, 0, 0), lot(2, 2, 0)), true);
    assert.equal(lotsEdgeAdjacent(lot(1, 0, 0), lot(2, 0, 2)), true);
    assert.equal(lotsEdgeAdjacent(lot(1, 0, 0), lot(2, 2, 2)), false);
    assert.equal(lotsEdgeAdjacent(lot(1, 0, 0, 3, 3), lot(2, 3, 1, 2, 2)), true);
  });

  it("names the side that touches a neighbor", () => {
    const a = lot(1, 4, 4);
    const sides = neighborSides(a, [a, lot(2, 6, 4), lot(3, 4, 2)]);
    assert.deepEqual(sides, { n: true, e: true, s: false, w: false });
  });

  it("clusters 4-connected lots and leaves a diagonal house alone", () => {
    const lots = [lot(1, 0, 0), lot(2, 2, 0), lot(3, 0, 2), lot(4, 8, 8)];
    const groups = houseGroups(lots);
    const sizes = groups.map((g) => g.length).sort((a, b) => a - b);
    assert.deepEqual(sizes, [1, 3]);
    const trio = groups.find((g) => g.length === 3)!;
    assert.ok(trio.some((h) => h.id === 1));
    assert.ok(trio.some((h) => h.id === 2));
    assert.ok(trio.some((h) => h.id === 3));
  });

  it("insets only shared sides so a 2×2 keeps the outer fence", () => {
    const lots = [lot(1, 0, 0), lot(2, 2, 0), lot(3, 0, 2), lot(4, 2, 2)];
    const sides = neighborMap(lots);
    const nw = sides.get(1)!;
    assert.deepEqual(nw, { n: false, e: true, s: true, w: false });
    assert.equal(hasNeighbor(nw), true);
    const inset = seamInset(lot(1, 0, 0), nw, 1);
    assert.deepEqual(inset, { id: 1, x: 0, y: 0, w: 1, h: 1 });
    const se = seamInset(lot(4, 2, 2), sides.get(4)!, 1);
    assert.deepEqual(se, { id: 4, x: 3, y: 3, w: 1, h: 1 });
  });

  it("does not inset an isolated house", () => {
    const a = lot(1, 5, 5, 8, 8);
    const sides = neighborSides(a, [a]);
    assert.equal(hasNeighbor(sides), false);
    assert.deepEqual(seamInset(a, sides, 2), a);
  });
});
