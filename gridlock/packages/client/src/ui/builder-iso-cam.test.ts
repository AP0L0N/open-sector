import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TILE_SIZE, isoLift, worldToIso } from "@gridlock/shared";
import { isoFit, isoPick, isoZoomAt, type IsoCam } from "./builder-iso-cam.js";
import { newSheet } from "./builder-model.js";

function flatSheet() {
  return newSheet({ id: "t", name: "t", author: "t", cells: 48, maxPlayers: 2, hills: false, seed: "t" });
}

/** Screen point of a tile's centre on its own height. */
function screenOf(cam: IsoCam, s: ReturnType<typeof flatSheet>, tx: number, ty: number): { x: number; y: number } {
  const p = worldToIso((tx + 0.5) * TILE_SIZE, (ty + 0.5) * TILE_SIZE, TILE_SIZE);
  const z = isoLift(s.heights[ty * s.width + tx]!);
  return { x: (p.x - cam.camX) * cam.zoom, y: (p.y - z - cam.camY) * cam.zoom };
}

describe("map builder in-game view camera", () => {
  it("fits the map centre to the stage centre at battlefield zoom", () => {
    const s = flatSheet();
    const cam: IsoCam = { zoom: 0, camX: 0, camY: 0 };
    isoFit(cam, s, 800, 600);
    assert.equal(cam.zoom, 1);
    const hit = isoPick(s, cam, 400, 600 / 2);
    assert.ok(hit.inside);
    assert.ok(Math.abs(hit.x - s.width / 2) <= 1 && Math.abs(hit.y - s.height / 2) <= 1);
  });

  it("picks the tile drawn under the pointer, on raised ground too", () => {
    const s = flatSheet();
    const cam: IsoCam = { zoom: 0, camX: 0, camY: 0 };
    isoFit(cam, s, 800, 600);
    for (let y = 60; y < 70; y++) for (let x = 60; x < 70; x++) s.heights[y * s.width + x] = s.heights[y * s.width + x]! + 6;
    for (const [tx, ty] of [
      [64, 64],
      [90, 100],
      [61, 68],
    ] as const) {
      const p = screenOf(cam, s, tx, ty);
      assert.deepEqual(isoPick(s, cam, p.x, p.y), { x: tx, y: ty, inside: true });
    }
  });

  it("answers off the sheet with the flat tile, marked outside", () => {
    const s = flatSheet();
    const cam: IsoCam = { zoom: 1, camX: 0, camY: 0 };
    // Where the tile four west of the edge would sit, on the edge's own height.
    const p = worldToIso(-3.5 * TILE_SIZE, 10.5 * TILE_SIZE, TILE_SIZE);
    const hit = isoPick(s, cam, p.x, p.y - isoLift(s.heights[10 * s.width]!));
    assert.deepEqual(hit, { x: -4, y: 10, inside: false });
  });

  it("zooms around the pointer", () => {
    const s = flatSheet();
    const cam: IsoCam = { zoom: 0, camX: 0, camY: 0 };
    isoFit(cam, s, 800, 600);
    const before = isoPick(s, cam, 250, 180);
    isoZoomAt(cam, 250, 180, -100);
    assert.ok(cam.zoom > 1);
    assert.deepEqual(isoPick(s, cam, 250, 180), before);
    for (let i = 0; i < 60; i++) isoZoomAt(cam, 250, 180, 100);
    assert.equal(cam.zoom, 0.15);
  });
});
