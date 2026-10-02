import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { columnPolygon, uniformVeil, veilCells, veilLevel, VEIL_LEVELS } from "./building-fog.js";
import { FOG_VEIL_ALPHA, FogField } from "./fog-field.js";

describe("building fog", () => {
  it("covers the footprint once, back to front", () => {
    const cells = veilCells(10, 20, 4, 3);
    assert.equal(cells.length, 12);
    let area = 0;
    let last = -Infinity;
    for (const c of cells) {
      area += c.tw * c.th;
      const depth = c.cu + c.cv;
      assert.ok(depth >= last);
      last = depth;
    }
    assert.equal(area, 12);
    assert.deepEqual(cells[0], { tx: 10, ty: 20, tw: 1, th: 1, cu: 10.5, cv: 20.5 });
  });

  it("groups a large footprint into at most 8 x 8 columns", () => {
    const cells = veilCells(0, 0, 20, 12);
    assert.ok(cells.length <= 64);
    assert.equal(
      cells.reduce((s, c) => s + c.tw * c.th, 0),
      240,
    );
  });

  it("sweeps a ground diamond up into a column", () => {
    const n = { x: 0, y: 0 };
    const e = { x: 8, y: 4 };
    const s = { x: 0, y: 8 };
    const w = { x: -8, y: 4 };
    assert.deepEqual(columnPolygon(n, e, s, w, 0), [n, e, s, w]);
    const col = columnPolygon(n, e, s, w, 10);
    assert.equal(col.length, 6);
    assert.deepEqual(col[0], { x: 0, y: -10 });
    assert.deepEqual(col[3], s);
  });

  it("reads each column's veil from the shared fog field", () => {
    const w = 8;
    const mask = new Uint8Array(w * w);
    for (let y = 0; y < w; y++) for (let x = 0; x < 4; x++) mask[y * w + x] = 1;
    const field = new FogField(w, w);
    field.set(mask, 0, true);
    const cells = veilCells(0, 2, 8, 2);
    const alphas = cells.map((c) => field.veil(c.cu, c.cv, 0));
    const west = alphas[cells.findIndex((c) => c.tx === 0)]!;
    const east = alphas[cells.findIndex((c) => c.tx === 7)]!;
    assert.ok(west < 0.05, `west ${west}`);
    assert.ok(Math.abs(east - FOG_VEIL_ALPHA) < 0.05, `east ${east}`);
    assert.equal(uniformVeil(alphas), null, "half in sight needs a per-column mask");
    assert.ok(uniformVeil([0.3, 0.31]) != null);
  });

  it("quantises veil levels", () => {
    assert.equal(veilLevel(0), 0);
    assert.equal(veilLevel(FOG_VEIL_ALPHA), VEIL_LEVELS);
    assert.equal(veilLevel(FOG_VEIL_ALPHA * 4), VEIL_LEVELS);
  });
});
