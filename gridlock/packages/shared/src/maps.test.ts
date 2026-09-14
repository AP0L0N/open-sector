import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { HEIGHT_MAX, HEIGHT_STEP_MAX, TILE_SUBDIV } from "./catalog.js";
import { MAPS, TILE_BLOCKED, TILE_TREE, TILE_WATER, heightAt, maxHeightOf, tileAt } from "./maps.js";

describe("maps", () => {
  it("ships two maps with 8 spawns", () => {
    assert.ok(MAPS["yard-64"]);
    assert.ok(MAPS["canal-48"]);
    for (const map of Object.values(MAPS)) {
      assert.equal(map.spawns.length, 8);
      assert.equal(map.tiles.length, map.width * map.height);
      assert.equal(map.heights.length, map.width * map.height);
      for (const s of map.spawns) {
        assert.equal(tileAt(map, s.x, s.y), 0, `${map.id} spawn ${s.id} blocked`);
      }
    }
  });

  it("canal has a water strip with bridge gaps", () => {
    const canal = MAPS["canal-48"]!;
    const s = TILE_SUBDIV;
    assert.equal(tileAt(canal, 0, 23 * s), TILE_WATER);
    assert.equal(tileAt(canal, 11 * s, 23 * s), 0);
  });

  it("keeps the canal flat", () => {
    const canal = MAPS["canal-48"]!;
    assert.equal(maxHeightOf(canal), 0);
  });

  it("scatters walkable hills on the yard without cliffing spawns", () => {
    const yard = MAPS["yard-64"]!;
    assert.ok(maxHeightOf(yard) >= Math.ceil(HEIGHT_MAX / 2));
    assert.ok(maxHeightOf(yard) <= HEIGHT_MAX);
    let raised = 0;
    const bands = new Set<number>();
    for (let y = 0; y < yard.height; y++) {
      for (let x = 0; x < yard.width; x++) {
        const h = heightAt(yard, x, y);
        bands.add(h);
        if (h > 0) raised++;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= yard.width || ny >= yard.height) continue;
            const n = heightAt(yard, nx, ny);
            assert.ok(Math.abs(h - n) <= HEIGHT_STEP_MAX, `cliff ${x},${y} vs ${nx},${ny}`);
          }
        }
      }
    }
    assert.ok(bands.size >= 6, `hills should use many height bands, got ${bands.size}`);
    assert.ok(raised > yard.width * yard.height * 0.08);
    for (const s of yard.spawns) {
      assert.equal(heightAt(yard, s.x, s.y), 0, `spawn ${s.id} on a slope`);
    }
  });

  it("runs a peak down in many one-step tiles, not a 3-terrace stair", () => {
    const yard = MAPS["yard-64"]!;
    let peakX = 0;
    let peakY = 0;
    let peak = 0;
    for (let y = 0; y < yard.height; y++) {
      for (let x = 0; x < yard.width; x++) {
        const h = heightAt(yard, x, y);
        if (h > peak) {
          peak = h;
          peakX = x;
          peakY = y;
        }
      }
    }
    assert.ok(peak >= TILE_SUBDIV, `peak ${peak}`);
    const q: { x: number; y: number; d: number }[] = [{ x: peakX, y: peakY, d: 0 }];
    const seen = new Uint8Array(yard.width * yard.height);
    seen[peakY * yard.width + peakX] = 1;
    let dist = -1;
    for (let i = 0; i < q.length; i++) {
      const cur = q[i]!;
      if (heightAt(yard, cur.x, cur.y) === 0) {
        dist = cur.d;
        break;
      }
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = cur.x + dx;
          const ny = cur.y + dy;
          if (nx < 0 || ny < 0 || nx >= yard.width || ny >= yard.height) continue;
          const k = ny * yard.width + nx;
          if (seen[k]) continue;
          seen[k] = 1;
          q.push({ x: nx, y: ny, d: cur.d + 1 });
        }
      }
    }
    assert.ok(dist >= peak, `floor is only ${dist} tiles from a height-${peak} peak`);
  });

  it("paints water, trees, and civilian houses", () => {
    const yard = MAPS["yard-64"]!;
    let water = 0;
    let trees = 0;
    for (const t of yard.tiles) {
      if (t === TILE_WATER) water++;
      if (t === TILE_TREE) trees++;
    }
    assert.ok(water > 20, `water ${water}`);
    assert.ok(trees > 40, `trees ${trees}`);
    assert.ok((yard.features?.length ?? 0) >= 4, "houses");
    assert.ok(!yard.features?.some((f) => tileAt(yard, f.x, f.y) === TILE_BLOCKED));
  });
});
