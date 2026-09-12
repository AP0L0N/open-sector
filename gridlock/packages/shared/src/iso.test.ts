import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clampIsoCamera,
  facingToIso,
  isoMapBounds,
  isoToWorld,
  pointInIsoBox,
  tileDiamond,
  worldToIso,
} from "./iso.js";

function near(a: { x: number; y: number }, b: { x: number; y: number }, eps = 1e-6): void {
  assert.ok(Math.abs(a.x - b.x) < eps, `x ${a.x} vs ${b.x}`);
  assert.ok(Math.abs(a.y - b.y) < eps, `y ${a.y} vs ${b.y}`);
}

describe("iso projection", () => {
  it("roundtrips world <-> iso", () => {
    const ts = 32;
    for (const [x, y] of [
      [0, 0],
      [32, 0],
      [0, 32],
      [100, 50],
      [2048, 2048],
    ] as const) {
      const iso = worldToIso(x, y, ts);
      near(isoToWorld(iso.x, iso.y, ts), { x, y });
    }
  });

  it("puts world origin at the top of the map diamond", () => {
    const ts = 32;
    const origin = worldToIso(0, 0, ts);
    const bounds = isoMapBounds(64, 64, ts);
    assert.equal(origin.y, bounds.minY);
    assert.ok(worldToIso(2048, 2048, ts).y > origin.y);
  });

  it("shares edges between neighboring tile diamonds", () => {
    const ts = 32;
    const a = tileDiamond(0, 0, ts);
    const east = tileDiamond(1, 0, ts);
    const south = tileDiamond(0, 1, ts);
    near(a.e, east.n);
    near(a.s, east.w);
    near(a.w, south.n);
    near(a.s, south.e);
  });

  it("east faces down-right and south faces down-left", () => {
    const east = facingToIso(0, 32);
    assert.ok(east.x > 0);
    assert.ok(east.y > 0);
    const south = facingToIso(Math.PI / 2, 32);
    assert.ok(south.x < 0);
    assert.ok(south.y > 0);
  });

  it("picks a flat tile at its iso center and not far above it", () => {
    const ts = 32;
    const c = worldToIso(16, 16, ts);
    assert.equal(pointInIsoBox(c.x, c.y, 0, 0, 32, 32, 0, ts), true);
    assert.equal(pointInIsoBox(c.x, c.y - 50, 0, 0, 32, 32, 0, ts), false);
  });

  it("extrusion extends picking upward", () => {
    const ts = 32;
    const c = worldToIso(16, 16, ts);
    assert.equal(pointInIsoBox(c.x, c.y - 20, 0, 0, 32, 32, 24, ts), true);
    assert.equal(pointInIsoBox(c.x, c.y - 20, 0, 0, 32, 32, 0, ts), false);
  });

  it("centers the camera when the view is larger than the map", () => {
    const p = clampIsoCamera(0, 0, 8000, 8000, 64, 64, 32);
    const b = isoMapBounds(64, 64, 32);
    const cx = (b.minX + b.maxX) / 2;
    const cy = (b.minY + b.maxY) / 2;
    assert.ok(Math.abs(p.x + 4000 - cx) < 1e-6);
    assert.ok(Math.abs(p.y + 4000 - cy) < 1e-6);
  });

  it("lets the viewport center sit on a map corner so a corner spawn can be framed", () => {
    const b = isoMapBounds(64, 64, 32);
    const p = clampIsoCamera(b.minX - 500, b.minY - 500, 400, 300, 64, 64, 32);
    near(p, { x: b.minX - 200, y: b.minY - 150 });
    const q = clampIsoCamera(b.maxX + 50, b.maxY + 50, 400, 300, 64, 64, 32);
    near(q, { x: b.maxX - 200, y: b.maxY - 150 });
  });
});
