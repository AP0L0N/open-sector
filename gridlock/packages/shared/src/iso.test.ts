import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getMap } from "./maps.js";
import {
  clampIsoCamera,
  facingToIso,
  isoDir16,
  isoDir8,
  isoLift,
  isoMapBounds,
  isoToWorld,
  pickElevatedTile,
  pointInIsoBox,
  tileDiamond,
  worldToIso,
  worldToIso3,
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

  it("maps screen vectors onto 8 sprite rows", () => {
    assert.equal(isoDir8(1, 0), 0);
    assert.equal(isoDir8(1, 1), 1);
    assert.equal(isoDir8(0, 1), 2);
    assert.equal(isoDir8(-1, 1), 3);
    assert.equal(isoDir8(-1, 0), 4);
    assert.equal(isoDir8(-1, -1), 5);
    assert.equal(isoDir8(0, -1), 6);
    assert.equal(isoDir8(1, -1), 7);
  });

  it("picks SE for world-east and SW for world-south", () => {
    const east = facingToIso(0, 32);
    assert.equal(isoDir8(east.x, east.y), 1);
    const south = facingToIso(Math.PI / 2, 32);
    assert.equal(isoDir8(south.x, south.y), 3);
  });

  it("maps 16-way screen vectors onto sprite rows", () => {
    assert.equal(isoDir16(1, 0), 0);
    assert.equal(isoDir16(1, 0.4), 1);
    assert.equal(isoDir16(1, 1), 2);
    assert.equal(isoDir16(0.4, 1), 3);
    assert.equal(isoDir16(0, 1), 4);
    assert.equal(isoDir16(-1, 0), 8);
    assert.equal(isoDir16(0, -1), 12);
  });

  it("picks ESE for world-east on a 16-dir sheet", () => {
    const east = facingToIso(0, 32);
    assert.equal(isoDir16(east.x, east.y), 1);
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

  it("lifts a point straight up in screen space", () => {
    const ts = 32;
    const a = worldToIso(16, 16, ts);
    const b = worldToIso3(16, 16, 2, ts);
    assert.equal(b.x, a.x);
    assert.equal(b.y, a.y - isoLift(2));
  });

  it("picks the raised tile instead of the floor unprojection behind it", () => {
    const ts = 32;
    const heights = (x: number, y: number) => (x === 2 && y === 2 ? 2 : 0);
    const top = worldToIso3(2 * ts + 16, 2 * ts + 16, 2, ts);
    const hit = pickElevatedTile(top.x, top.y, 8, 8, ts, heights);
    assert.deepEqual(hit, { x: 2, y: 2 });
    const naive = isoToWorld(top.x, top.y, ts);
    const naiveTile = { x: Math.floor(naive.x / ts), y: Math.floor(naive.y / ts) };
    assert.equal(naiveTile.x === 2 && naiveTile.y === 2, false);
  });

  it("picks a raised yard tile without scanning the whole map", () => {
    const map = getMap("yard-64");
    assert.ok(map);
    const ts = map.tileSize;
    const spawn = map.spawns[0];
    assert.ok(spawn);
    let hill: { x: number; y: number; h: number } | undefined;
    outer: for (let r = 0; r < 48; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const x = spawn.x + dx;
          const y = spawn.y + dy;
          if (x < 0 || y < 0 || x >= map.width || y >= map.height) continue;
          const h = map.heights[y * map.width + x] ?? 0;
          if (h >= 4) {
            hill = { x, y, h };
            break outer;
          }
        }
      }
    }
    assert.ok(hill, "expected a spawn-adjacent hill");
    const top = worldToIso3((hill.x + 0.5) * ts, (hill.y + 0.5) * ts, hill.h, ts);
    let calls = 0;
    const heightOf = (x: number, y: number) => {
      calls++;
      if (x < 0 || y < 0 || x >= map.width || y >= map.height) return 0;
      return map.heights[y * map.width + x] ?? 0;
    };
    const hit = pickElevatedTile(top.x, top.y, map.width, map.height, ts, heightOf);
    assert.deepEqual(hit, { x: hill.x, y: hill.y });
    assert.ok(calls < map.width * map.height / 8, `scanned ${calls} tiles`);
  });

  it("does not pick a tile excluded by clip", () => {
    const ts = 32;
    const heights = (x: number, y: number) => (x === 2 && y === 2 ? 2 : 0);
    const top = worldToIso3(2 * ts + 16, 2 * ts + 16, 2, ts);
    const inside = pickElevatedTile(top.x, top.y, 8, 8, ts, heights, {
      x0: 2,
      y0: 2,
      x1: 2,
      y1: 2,
    });
    assert.deepEqual(inside, { x: 2, y: 2 });
    const excluded = pickElevatedTile(top.x, top.y, 8, 8, ts, heights, {
      x0: 0,
      y0: 0,
      x1: 1,
      y1: 1,
    });
    assert.equal(excluded?.x === 2 && excluded?.y === 2, false);
  });
});
