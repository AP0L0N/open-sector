import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { HEIGHT_BASE, HEIGHT_MAX, HEIGHT_STEP_MAX, TILE_SUBDIV, catalog } from "./catalog.js";
import {
  MAPS,
  type MapDef,
  type MapFeature,
  TILE_BLOCKED,
  TILE_DIAMOND_SCRAP,
  TILE_EMPTY,
  TILE_FENCE,
  TILE_MOUNTAIN,
  TILE_ROAD,
  TILE_ROCK,
  TILE_SCRAP,
  TILE_TREE,
  TILE_WATER,
  YARD_HILL_CEIL,
  MOUNTAIN_MIN_HEIGHT,
  GROUND_GRASS,
  GROUND_KINDS,
  GROUND_SAND,
  GROUND_STONES,
  GROUND_SWAMP,
  GROUND_TALL_GRASS,
  dressGroundCover,
  featureBox,
  groundAt,
  heightAt,
  isMountainCliff,
  isScrapTile,
  maxHeightOf,
  normalizeTerrain,
  tileAt,
} from "./maps.js";
import { featureOnWater } from "./custom-maps.js";
import { vertexElev } from "./sim/elevation.js";
import { initGrids } from "./sim/geo.js";

describe("maps", () => {
  it("ships Scrap Yard with 8 spawns", () => {
    assert.deepEqual(Object.keys(MAPS), ["yard-64"]);
    for (const map of Object.values(MAPS)) {
      assert.equal(map.spawns.length, 8);
      assert.equal(map.tiles.length, map.width * map.height);
      assert.equal(map.heights.length, map.width * map.height);
      for (const s of map.spawns) {
        const ground = tileAt(map, s.x, s.y);
        assert.ok(
          ground === 0 || ground === TILE_ROAD,
          `${map.id} spawn ${s.id} on tile ${ground}`,
        );
      }
    }
  });

  it("scatters walkable hills and valleys on the yard without cliffing spawns", () => {
    for (const yard of Object.values(MAPS)) {
    assert.ok(maxHeightOf(yard) >= HEIGHT_BASE + 3);
    assert.ok(maxHeightOf(yard) <= HEIGHT_MAX);
    let raised = 0;
    let lowered = 0;
    const bands = new Set<number>();
    for (let y = 0; y < yard.height; y++) {
      for (let x = 0; x < yard.width; x++) {
        const h = heightAt(yard, x, y);
        bands.add(h);
        if (h > HEIGHT_BASE) raised++;
        if (h < HEIGHT_BASE) lowered++;
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
    assert.ok(lowered > yard.width * yard.height * 0.04, `valleys ${lowered}`);
    for (const s of yard.spawns) {
      const h = heightAt(yard, s.x, s.y);
      assert.equal(h, HEIGHT_BASE, `${yard.id} spawn ${s.id} on a slope`);
    }
    }
  });

  it("keeps Scrap Yard hills to half the full rise over the plain", () => {
    const yard = MAPS["yard-64"]!;
    const peak = maxHeightOf(yard);
    assert.ok(peak <= YARD_HILL_CEIL, `peak ${peak}`);
    assert.ok(peak >= HEIGHT_BASE + 2 * TILE_SUBDIV, `peak ${peak} is too flat to hold`);
  });

  it("runs a peak down in many one-step tiles, not a 3-terrace stair", () => {
    for (const yard of Object.values(MAPS)) {
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
      if (heightAt(yard, cur.x, cur.y) <= HEIGHT_BASE) {
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
    const rise = peak - HEIGHT_BASE;
    assert.ok(dist >= rise, `${yard.id} base is only ${dist} tiles from a height-${peak} peak (rise ${rise})`);
    }
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
    const facings = new Set(yard.features.map((f) => f.facing));
    assert.ok(
      yard.features.every((f) => f.facing >= 0 && f.facing <= 3),
      "cardinal facing",
    );
    assert.ok(facings.size >= 2, `houses should not all face the same way (${[...facings]})`);
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

  it("runs dirt lanes between the starts", () => {
    const yard = MAPS["yard-64"]!;
    let roads = 0;
    let fences = 0;
    for (const t of yard.tiles) {
      if (t === TILE_ROAD) roads++;
      if (t === TILE_FENCE) fences++;
    }
    assert.ok(roads > 600, `roads ${roads}`);
    assert.equal(fences, 0, `fences ${fences}`);
    assert.equal(
      yard.tiles.filter((t) => t === TILE_BLOCKED).length,
      0,
      "scrap yard has no solid blocks",
    );
    const w = yard.width;
    const h = yard.height;
    const open = (t: number): boolean =>
      t !== TILE_FENCE && t !== TILE_BLOCKED && t !== TILE_WATER && t !== TILE_ROCK;
    const start = yard.spawns[0]!;
    const seen = new Uint8Array(w * h);
    const q: { x: number; y: number }[] = [{ x: start.x, y: start.y }];
    seen[start.y * w + start.x] = 1;
    const step: readonly [number, number][] = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];
    for (let i = 0; i < q.length; i++) {
      const c = q[i]!;
      for (const [dx, dy] of step) {
        const x = c.x + dx;
        const y = c.y + dy;
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const k = y * w + x;
        if (seen[k] || !open(yard.tiles[k] ?? TILE_BLOCKED)) continue;
        seen[k] = 1;
        q.push({ x, y });
      }
    }
    for (const s of yard.spawns) {
      assert.equal(seen[s.y * w + s.x], 1, `spawn ${s.id} is fenced off`);
      assert.notEqual(tileAt(yard, s.x, s.y), TILE_FENCE, `spawn ${s.id} on a fence`);
    }
    for (let k = 0; k < yard.tiles.length; k++) {
      if (isScrapTile(yard.tiles[k])) assert.equal(seen[k], 1, `scrap at ${k % w},${(k / w) | 0} is cut off`);
    }
  });

  it("turns the scrap field in the middle of Scrap Yard to diamond scrap, and only that one", () => {
    const yard = MAPS["yard-64"]!;
    const w = yard.width;
    const cx = (w - 1) / 2;
    const cy = (yard.height - 1) / 2;
    let diamond = 0;
    let plain = 0;
    let nearestPlain = Infinity;
    let nearestDiamond = Infinity;
    let sx = 0;
    let sy = 0;
    for (let k = 0; k < yard.tiles.length; k++) {
      const d = Math.hypot((k % w) - cx, Math.floor(k / w) - cy);
      if (yard.tiles[k] === TILE_DIAMOND_SCRAP) {
        diamond++;
        sx += k % w;
        sy += Math.floor(k / w);
        nearestDiamond = Math.min(nearestDiamond, d);
      } else if (yard.tiles[k] === TILE_SCRAP) {
        plain++;
        nearestPlain = Math.min(nearestPlain, d);
      }
    }
    // One whole blob of the coarse field, upsampled.
    assert.equal(diamond, 8 * TILE_SUBDIV * TILE_SUBDIV, `diamond tiles ${diamond}`);
    assert.ok(plain > diamond * 10, `plain fields stay plain: ${plain}`);
    assert.ok(nearestDiamond < nearestPlain, "the diamond field is the one nearest the middle");
    const off = Math.hypot(sx / diamond - cx, sy / diamond - cy);
    assert.ok(off < 5 * TILE_SUBDIV, `diamond scrap sits in the middle: ${off}`);
    for (const s of yard.spawns) {
      const near = yard.tiles.some(
        (t, k) => t === TILE_DIAMOND_SCRAP && Math.hypot((k % w) - s.x, Math.floor(k / w) - s.y) < 16 * TILE_SUBDIV,
      );
      assert.equal(near, false, `spawn ${s.id} is not handed the diamond field`);
    }
  });

  it("winds the scrap-yard lanes instead of ruling them straight", () => {
    const yard = MAPS["yard-64"]!;
    const w = yard.width;
    const midX = Math.floor(w / 2);
    const midY = Math.floor(yard.height / 2);
    const nearestRoad = (px: number, py: number): number => {
      for (let r = 0; r < 40; r++) {
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
            if (tileAt(yard, px + dx, py + dy) === TILE_ROAD) return r;
          }
        }
      }
      return 40;
    };
    for (const s of yard.spawns.slice(0, 4)) {
      let wander = 0;
      for (let i = 1; i < 10; i++) {
        const t = 0.2 + (i / 10) * 0.6;
        const px = Math.round(s.x + (midX - s.x) * t);
        const py = Math.round(s.y + (midY - s.y) * t);
        wander = Math.max(wander, nearestRoad(px, py));
      }
      assert.ok(wander >= 3, `spawn ${s.id} lane is ruler-straight (wander ${wander})`);
    }
  });

  it("puts rocky flanks on scrap-yard hills and leaves every summit a way up", () => {
    const yard = MAPS["yard-64"]!;
    const w = yard.width;
    const h = yard.height;
    let rock = 0;
    for (let k = 0; k < yard.tiles.length; k++) {
      if (yard.tiles[k] !== TILE_ROCK) continue;
      rock++;
      assert.ok(heightAt(yard, k % w, (k / w) | 0) > HEIGHT_BASE, `rock on flat ground at ${k % w},${(k / w) | 0}`);
    }
    assert.ok(rock > 150, `rock ${rock}`);
    for (const s of yard.spawns) {
      for (let dy = -20; dy <= 20; dy++) {
        for (let dx = -20; dx <= 20; dx++) {
          assert.notEqual(tileAt(yard, s.x + dx, s.y + dy), TILE_ROCK, `rock by spawn ${s.id}`);
        }
      }
    }
    const closed = (t: number): boolean =>
      t === TILE_ROCK || t === TILE_BLOCKED || t === TILE_WATER || t === TILE_FENCE;
    const start = yard.spawns[0]!;
    const seen = new Uint8Array(w * h);
    const q: { x: number; y: number }[] = [{ x: start.x, y: start.y }];
    seen[start.y * w + start.x] = 1;
    for (let i = 0; i < q.length; i++) {
      const c = q[i]!;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const x = c.x + dx;
        const y = c.y + dy;
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const k = y * w + x;
        if (seen[k] || closed(yard.tiles[k] ?? TILE_BLOCKED)) continue;
        if (Math.abs(heightAt(yard, c.x, c.y) - heightAt(yard, x, y)) > HEIGHT_STEP_MAX) continue;
        seen[k] = 1;
        q.push({ x, y });
      }
    }
    for (let y = 10; y < h - 10; y++) {
      for (let x = 10; x < w - 10; x++) {
        const top = heightAt(yard, x, y);
        if (top < HEIGHT_BASE + 4) continue;
        let peak = true;
        for (let dy = -10; dy <= 10 && peak; dy++) {
          for (let dx = -10; dx <= 10; dx++) {
            if (heightAt(yard, x + dx, y + dy) > top) {
              peak = false;
              break;
            }
          }
        }
        if (!peak || closed(tileAt(yard, x, y))) continue;
        assert.equal(seen[y * w + x], 1, `summit ${x},${y} (h ${top}) is walled in`);
      }
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

function lot(f: MapFeature): { x0: number; y0: number; x1: number; y1: number } {
  const d = catalog(f.type);
  return { x0: f.x, y0: f.y, x1: f.x + d.tileW, y1: f.y + d.tileH };
}

/** Houses whose walls meet along a side: a terrace, not two lots with a yard between. */
function touchingPairs(map: MapDef): number {
  const lots = map.features.map(lot);
  let n = 0;
  for (let i = 0; i < lots.length; i++) {
    for (let j = i + 1; j < lots.length; j++) {
      const a = lots[i]!;
      const b = lots[j]!;
      const gx = Math.max(a.x0, b.x0) - Math.min(a.x1, b.x1);
      const gy = Math.max(a.y0, b.y0) - Math.min(a.y1, b.y1);
      assert.ok(gx >= 0 || gy >= 0, `houses overlap at ${a.x0},${a.y0} and ${b.x0},${b.y0}`);
      if ((gx === 0 && gy < 0) || (gy === 0 && gx < 0)) n++;
    }
  }
  return n;
}

describe("villages", () => {
  it("builds Scrap Yard's houses into a village on the crossroads", () => {
    const yard = MAPS["yard-64"]!;
    const mid = yard.width / 2;
    const reach = 10 * TILE_SUBDIV;
    const inTown = yard.features.filter((f) => {
      const b = lot(f);
      return Math.abs((b.x0 + b.x1) / 2 - mid) < reach && Math.abs((b.y0 + b.y1) / 2 - mid) < reach;
    });
    assert.ok(inTown.length >= 8, `village houses ${inTown.length}`);
    assert.ok(touchingPairs(yard) >= 4, `touching pairs ${touchingPairs(yard)}`);
  });

  it("turns village doors onto the street", () => {
    const yard = MAPS["yard-64"]!;
    const mid = yard.width / 2;
    // Facing: 0 east, 1 south, 2 west, 3 north. A door looks toward the street it fronts.
    for (const f of yard.features) {
      const b = lot(f);
      const cx = (b.x0 + b.x1) / 2;
      const cy = (b.y0 + b.y1) / 2;
      if (b.y1 <= mid && b.y1 >= mid - 4 && Math.abs(cx - mid) > 8) assert.equal(f.facing, 1, `north of the street at ${f.x},${f.y}`);
      if (b.y0 >= mid && b.y0 <= mid + 4 && Math.abs(cx - mid) > 8) assert.equal(f.facing, 3, `south of the street at ${f.x},${f.y}`);
      if (b.x1 <= mid && b.x1 >= mid - 4 && Math.abs(cy - mid) > 8) assert.equal(f.facing, 0, `west of the street at ${f.x},${f.y}`);
      if (b.x0 >= mid && b.x0 <= mid + 4 && Math.abs(cy - mid) > 8) assert.equal(f.facing, 2, `east of the street at ${f.x},${f.y}`);
    }
  });

  it("keeps the village street a road and not a lot", () => {
    const yard = MAPS["yard-64"]!;
    const mid = yard.width / 2;
    let road = 0;
    for (let x = mid - 30; x <= mid + 30; x++) if (tileAt(yard, x, mid) === TILE_ROAD) road++;
    assert.ok(road >= 55, `street road tiles ${road}`);
    for (const f of yard.features) {
      const b = lot(f);
      assert.ok(!(b.y0 <= mid && b.y1 > mid && b.x0 < mid + 30 && b.x1 > mid - 30), `house on the street at ${f.x},${f.y}`);
    }
  });

  it("levels the ground under every house", () => {
    for (const map of Object.values(MAPS)) {
      for (const f of map.features) {
        const b = lot(f);
        const z = heightAt(map, b.x0, b.y0);
        for (let y = b.y0; y < b.y1; y++) {
          for (let x = b.x0; x < b.x1; x++) {
            assert.equal(heightAt(map, x, y), z, `${map.id} ${f.type} at ${f.x},${f.y} is not level`);
          }
        }
      }
    }
  });
});

describe("mountains", () => {
  it("holds a flat cap and rings it with rock that opens onto ground of the same height", () => {
    const w = 7;
    const h = 7;
    const tiles = new Array<number>(w * h).fill(TILE_EMPTY);
    const heights = new Array<number>(w * h).fill(HEIGHT_BASE);
    tiles[3 * w + 3] = TILE_MOUNTAIN;
    heights[3 * w + 3] = 16;
    assert.equal(isMountainCliff(tiles, heights, w, h, 4, 3), true, "east skirt");
    assert.equal(isMountainCliff(tiles, heights, w, h, 4, 4), true, "corner skirt");
    assert.equal(isMountainCliff(tiles, heights, w, h, 5, 3), false);
    assert.equal(isMountainCliff(tiles, heights, w, h, 3, 3), false, "the cap is open ground");
    assert.equal(vertexElev(heights, w, h, 3, 3, tiles), 16, "the lip stays at the cap");
    heights[3 * w + 4] = 16;
    assert.equal(isMountainCliff(tiles, heights, w, h, 4, 3), false, "same height opens the rock");
    assert.equal(isMountainCliff(tiles, heights, w, h, 4, 4), true, "the other sides stay rock");
    const grids = initGrids({
      id: "mtn",
      name: "mtn",
      width: w,
      height: h,
      tileSize: 8,
      tiles,
      heights,
      maxHeight: 16,
      spawns: [],
      features: [],
    });
    assert.equal(grids.blocked[3 * w + 3], 0);
    assert.equal(grids.blocked[3 * w + 4], 0);
    assert.equal(grids.blocked[3 * w + 2], 1);
    heights[3 * w + 4] = HEIGHT_BASE;
    normalizeTerrain(tiles, heights, w, h, [], []);
    assert.equal(heights[3 * w + 3], 16);
    assert.equal(heights[3 * w + 2], HEIGHT_BASE, "the cliff does not drag a ramp");
    assert.equal(isMountainCliff(tiles, heights, w, h, 2, 3), true);
    assert.ok(MOUNTAIN_MIN_HEIGHT >= 12);
  });

  it("keeps the water under a Marine Base and clears it under a house", () => {
    const w = 64;
    const tiles = new Array<number>(w * w).fill(TILE_WATER);
    const heights = new Array<number>(w * w).fill(0);
    const dock: MapFeature = { type: "dock", x: 2 * TILE_SUBDIV, y: 2 * TILE_SUBDIV, facing: 0 };
    const core: MapFeature = { type: "core", x: 9 * TILE_SUBDIV, y: 9 * TILE_SUBDIV, facing: 0 };
    normalizeTerrain(tiles, heights, w, w, [], [dock, core]);
    const under = (f: MapFeature): number[] => {
      const b = featureBox(f);
      const out: number[] = [];
      for (let y = b.y0; y < b.y1; y++) for (let x = b.x0; x < b.x1; x++) out.push(tiles[y * w + x]!);
      return out;
    };
    assert.ok(under(dock).every((t) => t === TILE_WATER), "the Marine Base still floats");
    assert.ok(featureOnWater(dock, { width: w, tiles }));
    assert.ok(under(core).every((t) => t === TILE_EMPTY), "a house still gets dry ground");
  });

  it("walks over rock like open ground; only mountain cliffs block", () => {
    const yard = MAPS["yard-64"]!;
    const grids = initGrids(yard);
    let rock = 0;
    for (let i = 0; i < yard.tiles.length; i++) {
      if (yard.tiles[i] !== TILE_ROCK) continue;
      rock++;
      assert.equal(grids.blocked[i], 0, `rock blocks at ${i % yard.width},${(i / yard.width) | 0}`);
    }
    assert.ok(rock > 0);
    const w = 5;
    const tiles = [TILE_ROCK, TILE_ROCK, TILE_FENCE, TILE_ROCK, TILE_EMPTY];
    const grid = initGrids({ id: "r", name: "r", width: w, height: 1, tileSize: 8, tiles, heights: tiles.map(() => HEIGHT_BASE), maxHeight: HEIGHT_BASE, spawns: [], features: [] });
    assert.deepEqual([...grid.blocked], [0, 0, 1, 0, 0]);
  });
});

describe("ground cover", () => {
  it("dresses the Scrap Yard with cover the sim never reads, one entry per tile", () => {
    const yard = MAPS["yard-64"]!;
    assert.ok(yard.ground, "the yard carries a cover layer");
    assert.equal(yard.ground!.length, yard.tiles.length);
    const counts = new Map<number, number>();
    for (let i = 0; i < yard.ground!.length; i++) {
      const g = yard.ground![i]!;
      assert.ok(GROUND_KINDS.includes(g));
      counts.set(g, (counts.get(g) ?? 0) + 1);
      // Cover only dresses open ground; water, trees, rock, roads, and scrap keep their own look.
      if (g !== GROUND_GRASS) assert.equal(yard.tiles[i], TILE_EMPTY);
    }
    assert.ok((counts.get(GROUND_TALL_GRASS) ?? 0) > 0, "tall grass stands somewhere");
    assert.ok((counts.get(GROUND_SAND) ?? 0) + (counts.get(GROUND_SWAMP) ?? 0) > 0, "the ponds have banks");
    assert.ok((counts.get(GROUND_STONES) ?? 0) > 0, "stony ground somewhere");
    // Meadow stays the rule: most of the yard is plain grass.
    assert.ok((counts.get(GROUND_GRASS) ?? 0) > yard.ground!.length / 2);
  });

  it("keeps start pads as meadow and is the same on every machine", () => {
    const yard = MAPS["yard-64"]!;
    for (const s of yard.spawns) {
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) assert.equal(groundAt(yard, (s.y + dy) * yard.width + s.x + dx), GROUND_GRASS);
    }
    const again = dressGroundCover(yard.tiles, yard.heights, yard.width, yard.height, "yard-64-cover", yard.spawns.map((s) => ({ x: s.x, y: s.y, r: 16 })));
    assert.deepEqual(again, yard.ground);
  });

  it("returns null for a sheet with nothing to dress", () => {
    const tiles = new Array(16 * 16).fill(TILE_WATER);
    assert.equal(dressGroundCover(tiles, new Array(256).fill(0), 16, 16, "none", []), null);
  });
});
