import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BuildingAlphaMap } from "./building-hit.js";
import {
  alphaCellBox,
  cellBoxToDest,
  inScreenRect,
  snapToUnitHitMask,
  unionCellBox,
  unitPickRect,
  unitDestMaskFromSheets,
  unitGroundSink,
  unitSpriteDest,
  type UnitHitMask,
} from "./unit-hit.js";

function blobMask(w: number, h: number, x0: number, y0: number, x1: number, y1: number): UnitHitMask {
  const solid = new Uint8Array(w * h);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) solid[y * w + x] = 1;
  }
  return { w, h, solid };
}

describe("unitSpriteDest", () => {
  it("pins the contact fraction to the ground point", () => {
    const d = unitSpriteDest(100, 200, 50, 0.8);
    assert.equal(d.x, 75);
    assert.equal(d.y, 160 + unitGroundSink(50));
    assert.equal(d.w, 50);
    assert.equal(d.h, 50);
  });
});

describe("alphaCellBox", () => {
  it("bounds the painted texels of one cell in a strip, ignoring its neighbour", () => {
    // Two 8px cells side by side; only the second is read.
    const a = new Uint8Array(16 * 8);
    a[0] = 255;
    for (let y = 5; y <= 6; y++) {
      for (let x = 10; x <= 13; x++) a[y * 16 + x] = 255;
    }
    const box = alphaCellBox(a, 16, 8, 8);
    assert.deepEqual(box, { x0: 2 / 8, y0: 5 / 8, x1: 6 / 8, y1: 7 / 8 });
  });

  it("skips the faint fringe and returns null for an empty cell", () => {
    const a = new Uint8Array(8 * 8).fill(20);
    assert.equal(alphaCellBox(a, 8, 0, 8), null);
  });
});

describe("unit pick rect", () => {
  it("unions boxes and maps them onto the drawn cell", () => {
    const box = unionCellBox({ x0: 0.25, y0: 0.5, x1: 0.5, y1: 0.9 }, { x0: 0.4, y0: 0.3, x1: 0.75, y1: 0.6 });
    assert.deepEqual(box, { x0: 0.25, y0: 0.3, x1: 0.75, y1: 0.9 });
    const r = cellBoxToDest(box!, { x: 100, y: 200, w: 40, h: 40 });
    assert.equal(r.x, 110);
    assert.ok(Math.abs(r.y - 212) < 1e-9);
    assert.equal(r.w, 20);
    assert.ok(Math.abs(r.h - 24) < 1e-9);
  });

  it("leaves the empty top of a tall cell out of the click target", () => {
    // A 100px cell whose art fills only its lower half.
    const dest = { x: 0, y: 0, w: 100, h: 100 };
    const pick = unitPickRect(cellBoxToDest({ x0: 0.3, y0: 0.5, x1: 0.7, y1: 0.95 }, dest));
    assert.equal(inScreenRect(pick, 50, 20), false);
    assert.equal(inScreenRect(pick, 50, 49), true);
    assert.equal(inScreenRect(pick, 50, 80), true);
  });

  it("keeps a minimum target around a tiny sprite", () => {
    const pick = unitPickRect({ x: 50, y: 50, w: 2, h: 2 }, 0, 12);
    assert.equal(pick.w, 12);
    assert.equal(pick.h, 12);
    assert.equal(inScreenRect(pick, 45, 45), true);
  });
});

describe("snapToUnitHitMask", () => {
  it("keeps a point already on the painted hull", () => {
    const mask = blobMask(16, 16, 4, 4, 11, 11);
    const p = snapToUnitHitMask(mask, 7.4, 8.2);
    assert.ok(p);
    assert.equal(p!.x, 7);
    assert.equal(p!.y, 8);
    assert.equal(mask.solid[p!.y * mask.w + p!.x], 1);
  });

  it("pulls a transparent miss onto the nearest painted pixel", () => {
    const mask = blobMask(16, 16, 4, 4, 11, 11);
    const p = snapToUnitHitMask(mask, 0, 8);
    assert.ok(p);
    assert.equal(p!.x, 4);
    assert.equal(p!.y, 8);
    assert.equal(mask.solid[p!.y * mask.w + p!.x], 1);
  });

  it("snaps a hit in empty canvas outside the dest rect onto the hull", () => {
    const mask = blobMask(16, 16, 6, 6, 10, 10);
    const p = snapToUnitHitMask(mask, -4, -3);
    assert.ok(p);
    assert.equal(mask.solid[p!.y * mask.w + p!.x], 1);
  });

  it("returns null when the sprite cell is empty", () => {
    assert.equal(snapToUnitHitMask({ w: 8, h: 8, solid: new Uint8Array(64) }, 4, 4), null);
  });
});

describe("unitDestMaskFromSheets", () => {
  it("marks dest pixels that sample a painted texel and skips padding", () => {
    const a = new Uint8Array(8 * 8);
    for (let y = 1; y <= 6; y++) {
      for (let x = 1; x <= 6; x++) a[y * 8 + x] = 255;
    }
    const map: BuildingAlphaMap = { w: 8, h: 8, a, toMap: 1 };
    const mask = unitDestMaskFromSheets(8, { map, sx: 0, sy: 0, cell: 8 });
    assert.equal(mask.solid[0], 0);
    assert.equal(mask.solid[7 * 8 + 7], 0);
    assert.equal(mask.solid[4 * 8 + 4], 1);
  });

  it("ORs turret pixels onto the hull mask", () => {
    const hullA = new Uint8Array(8 * 8);
    const turretA = new Uint8Array(8 * 8);
    for (let y = 2; y <= 6; y++) {
      for (let x = 1; x <= 4; x++) hullA[y * 8 + x] = 255;
    }
    for (let y = 1; y <= 4; y++) {
      for (let x = 4; x <= 6; x++) turretA[y * 8 + x] = 255;
    }
    const hull: BuildingAlphaMap = { w: 8, h: 8, a: hullA, toMap: 1 };
    const turret: BuildingAlphaMap = { w: 8, h: 8, a: turretA, toMap: 1 };
    const mask = unitDestMaskFromSheets(
      8,
      { map: hull, sx: 0, sy: 0, cell: 8 },
      { map: turret, sx: 0, sy: 0, cell: 8 },
    );
    assert.equal(mask.solid[4 * 8 + 2], 1);
    assert.equal(mask.solid[2 * 8 + 4], 1);
    assert.equal(mask.solid[0], 0);
  });

  it("ORs gun pixels onto the hull mask", () => {
    const hullA = new Uint8Array(8 * 8);
    const gunA = new Uint8Array(8 * 8);
    for (let y = 2; y <= 6; y++) {
      for (let x = 1; x <= 4; x++) hullA[y * 8 + x] = 255;
    }
    for (let y = 1; y <= 4; y++) {
      for (let x = 4; x <= 6; x++) gunA[y * 8 + x] = 255;
    }
    const hull: BuildingAlphaMap = { w: 8, h: 8, a: hullA, toMap: 1 };
    const gun: BuildingAlphaMap = { w: 8, h: 8, a: gunA, toMap: 1 };
    const mask = unitDestMaskFromSheets(
      8,
      { map: hull, sx: 0, sy: 0, cell: 8 },
      null,
      { map: gun, sx: 0, sy: 0, cell: 8 },
    );
    assert.equal(mask.solid[4 * 8 + 2], 1);
    assert.equal(mask.solid[2 * 8 + 4], 1);
    assert.equal(mask.solid[0], 0);
  });
});
