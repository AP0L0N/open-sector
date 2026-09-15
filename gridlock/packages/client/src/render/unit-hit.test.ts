import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BuildingAlphaMap } from "./building-hit.js";
import {
  snapToUnitHitMask,
  unitDestMaskFromSheets,
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
    assert.equal(d.y, 160);
    assert.equal(d.w, 50);
    assert.equal(d.h, 50);
  });
});

describe("snapToUnitHitMask", () => {
  it("keeps a point already on the painted hull", () => {
    const mask = blobMask(16, 16, 4, 4, 11, 11);
    const p = snapToUnitHitMask(mask, 7.4, 8.2);
    assert.ok(p);
    assert.equal(p!.x, 7.4);
    assert.equal(p!.y, 8.2);
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
    for (let y = 2; y <= 5; y++) {
      for (let x = 2; x <= 5; x++) a[y * 8 + x] = 255;
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
    hullA[4 * 8 + 3] = 255;
    turretA[2 * 8 + 6] = 255;
    const hull: BuildingAlphaMap = { w: 8, h: 8, a: hullA, toMap: 1 };
    const turret: BuildingAlphaMap = { w: 8, h: 8, a: turretA, toMap: 1 };
    const mask = unitDestMaskFromSheets(
      8,
      { map: hull, sx: 0, sy: 0, cell: 8 },
      { map: turret, sx: 0, sy: 0, cell: 8 },
    );
    assert.equal(mask.solid[4 * 8 + 3], 1);
    assert.equal(mask.solid[2 * 8 + 6], 1);
  });
});
