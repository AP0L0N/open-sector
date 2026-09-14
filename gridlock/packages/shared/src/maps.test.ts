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

  it("shapes scrap-yard ponds as irregular blobs, not filled rectangles", () => {
    const yard = MAPS["yard-64"]!;
    const w = yard.width;
    const h = yard.height;
    const seen = new Uint8Array(w * h);
    const ponds: { size: number; box: number; minX: number; minY: number; maxX: number; maxY: number }[] = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const start = y * w + x;
        if (seen[start] || yard.tiles[start] !== TILE_WATER) continue;
        const q = [{ x, y }];
        seen[start] = 1;
        let minX = x;
        let maxX = x;
        let minY = y;
        let maxY = y;
        for (let i = 0; i < q.length; i++) {
          const c = q[i]!;
          minX = Math.min(minX, c.x);
          maxX = Math.max(maxX, c.x);
          minY = Math.min(minY, c.y);
          maxY = Math.max(maxY, c.y);
          for (const [dx, dy] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ] as const) {
            const nx = c.x + dx;
            const ny = c.y + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            const ni = ny * w + nx;
            if (seen[ni] || yard.tiles[ni] !== TILE_WATER) continue;
            seen[ni] = 1;
            q.push({ x: nx, y: ny });
          }
        }
        ponds.push({
          size: q.length,
          box: (maxX - minX + 1) * (maxY - minY + 1),
          minX,
          minY,
          maxX,
          maxY,
        });
      }
    }
    const lakes = ponds.filter((p) => p.size >= 40);
    const water = lakes.reduce((n, p) => n + p.size, 0);
    assert.ok(lakes.length >= 2, `lakes ${lakes.length}`);
    assert.ok(water > 400 && water < 2500, `water ${water}`);
    for (const p of lakes) {
      assert.ok(p.size < p.box * 0.9, `pond fills its bbox ${p.size}/${p.box} at ${p.minX},${p.minY}`);
      let fullEdges = 0;
      let top = 0;
      let bot = 0;
      let left = 0;
      let right = 0;
      for (let x = p.minX; x <= p.maxX; x++) {
        if (tileAt(yard, x, p.minY) === TILE_WATER) top++;
        if (tileAt(yard, x, p.maxY) === TILE_WATER) bot++;
      }
      for (let y = p.minY; y <= p.maxY; y++) {
        if (tileAt(yard, p.minX, y) === TILE_WATER) left++;
        if (tileAt(yard, p.maxX, y) === TILE_WATER) right++;
      }
      const spanX = p.maxX - p.minX + 1;
      const spanY = p.maxY - p.minY + 1;
      if (top === spanX) fullEdges++;
      if (bot === spanX) fullEdges++;
      if (left === spanY) fullEdges++;
      if (right === spanY) fullEdges++;
      assert.ok(fullEdges <= 1, `pond has ${fullEdges} straight bbox edges`);
    }
    for (const s of yard.spawns) {
      assert.notEqual(tileAt(yard, s.x, s.y), TILE_WATER, `spawn ${s.id} in water`);
    }
  });

  it("mixes isolated trees with connected groves", () => {
    for (const map of Object.values(MAPS)) {
      let trees = 0;
      let singles = 0;
      let batched = 0;
      for (let y = 0; y < map.height; y++) {
        for (let x = 0; x < map.width; x++) {
          if (tileAt(map, x, y) !== TILE_TREE) continue;
          trees += 1;
          let neighbor = false;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue;
              if (tileAt(map, x + dx, y + dy) === TILE_TREE) neighbor = true;
            }
          }
          if (neighbor) batched += 1;
          else singles += 1;
        }
      }
      assert.ok(trees > 2500, `${map.id} trees ${trees}`);
      assert.ok(singles > 40, `${map.id} singles ${singles}`);
      assert.ok(batched > 400, `${map.id} groves ${batched}`);
      assert.ok(singles < trees * 0.5, `${map.id} too many isolated trees`);
    }
  });
});
