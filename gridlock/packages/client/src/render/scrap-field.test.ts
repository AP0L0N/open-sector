import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SCRAP_SOFT_REACH, scrapCoverAt, scrapCoverByte, scrapDressAt, scrapField, scrapGround } from "./scrap-field.js";

const W = 40;
const H = 40;

/** One 16×16 block of scrap tiles: the hardest corner the map makes. */
function block(x0: number, y0: number, n: number): Set<number> {
  const s = new Set<number>();
  for (let y = y0; y < y0 + n; y++) for (let x = x0; x < x0 + n; x++) s.add(y * W + x);
  return s;
}

describe("scrap yard field", () => {
  const set = block(12, 12, 16);
  const field = scrapField(set, W, H);

  it("is full inside a yard and empty far from it", () => {
    assert.ok(scrapCoverAt(field, 20, 20) > 0.99);
    assert.equal(scrapCoverAt(field, 2, 2), 0);
    assert.ok(scrapGround(field, 20 * W + 20));
    assert.ok(!scrapGround(field, 2 * W + 2));
  });

  it("keeps a straight edge where it is and rounds the square corner off", () => {
    // Midway along an edge the rim stays on the tile boundary.
    assert.ok(Math.abs(scrapCoverAt(field, 12, 20) - 0.5) < 0.05);
    // The block's own corner tile falls outside the rounded rim.
    assert.ok(scrapCoverAt(field, 12.5, 12.5) < 0.5, "corner is cut");
    assert.ok(!scrapGround(field, 12 * W + 12), "corner tile ground is not yard");
  });

  it("keeps a lone remnant tile visible after the rest is mined", () => {
    const lone = scrapField(new Set([20 * W + 20]), W, H);
    assert.ok(scrapCoverByte(lone, 20 * W + 20) >= Math.round(0.42 * 255), "stain held up under the remnant");
    assert.equal(scrapCoverByte(lone, 2 * W + 2), 0);
  });

  it("samples the tile-centre grid exactly at a centre", () => {
    for (const [x, y] of [
      [20, 20],
      [12, 20],
      [11, 11],
      [14, 13],
    ] as const) {
      assert.ok(Math.abs(field.cover[y * W + x]! - scrapCoverAt(field, x + 0.5, y + 0.5)) < 1e-6);
    }
  });

  it("dresses the inside, drops the cut corner, and places the same every time", () => {
    let inside = 0;
    for (let y = 16; y < 24; y++) for (let x = 16; x < 24; x++) if (scrapDressAt(field, x, y)) inside++;
    assert.ok(inside > 20, `inside ${inside}`);
    // Below even the most generous ragged rim, so the square's tip stays bare.
    assert.ok(scrapCoverAt(field, 12.2, 12.2) < 0.4);
    assert.equal(scrapDressAt(field, 2, 2), null);
    assert.deepEqual(scrapDressAt(field, 18, 21), scrapDressAt(scrapField(block(12, 12, 16), W, H), 18, 21));
  });

  it("puts at most one hull heap in a neighborhood", () => {
    const heaps: [number, number][] = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (scrapDressAt(field, x, y)?.kind === "heap") heaps.push([x, y]);
    for (const [ax, ay] of heaps) {
      for (const [bx, by] of heaps) {
        if (ax === bx && ay === by) continue;
        assert.ok(Math.max(Math.abs(ax - bx), Math.abs(ay - by)) > 3);
      }
    }
  });

  it("clears every bit of dress once the yard is mined out", () => {
    const empty = scrapField(new Set(), W, H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) assert.equal(scrapDressAt(empty, x, y), null);
  });

  it("only changes dress within reach of an emptied tile", () => {
    const less = new Set(set);
    less.delete(20 * W + 20);
    const after = scrapField(less, W, H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (Math.max(Math.abs(x - 20), Math.abs(y - 20)) <= SCRAP_SOFT_REACH) continue;
        assert.deepEqual(scrapDressAt(after, x, y), scrapDressAt(field, x, y), `${x},${y}`);
      }
    }
  });
});
