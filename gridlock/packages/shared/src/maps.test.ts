import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { HEIGHT_BASE, HEIGHT_MAX, HEIGHT_STEP_MAX, TILE_SUBDIV } from "./catalog.js";
import {
  MAPS,
  TILE_BLOCKED,
  TILE_FENCE,
  TILE_ROAD,
  TILE_ROCK,
  TILE_SCRAP,
  TILE_TREE,
  TILE_WATER,
  heightAt,
  maxHeightOf,
  tileAt,
} from "./maps.js";

describe("maps", () => {
  it("ships Scrap Yard with 8 spawns", () => {
    assert.deepEqual(Object.keys(MAPS), ["yard-64", "broad-143"]);
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
      if (yard.id === "broad-143") {
        assert.equal(h, HEIGHT_MAX, `${yard.id} spawn ${s.id} height ${h}`);
      } else {
        assert.equal(h, HEIGHT_BASE, `${yard.id} spawn ${s.id} on a slope`);
      }
    }
    }
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
    const open = (t: number): boolean => t !== TILE_FENCE && t !== TILE_BLOCKED && t !== TILE_WATER;
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

  it("spreads Broad Yard across five times Scrap Yard's ground", () => {
    const yard = MAPS["yard-64"]!;
    const map = MAPS["broad-143"]!;
    assert.equal(map.name, "Broad Yard");
    assert.equal(map.width, 143 * TILE_SUBDIV);
    assert.equal(map.height, map.width);
    const ratio = (map.width * map.height) / (yard.width * yard.height);
    assert.ok(Math.abs(ratio - 5) < 0.02, `area ratio ${ratio}`);

    let water = 0;
    let roads = 0;
    let scrap = 0;
    for (const t of map.tiles) {
      if (t === TILE_WATER) water++;
      if (t === TILE_ROAD) roads++;
      if (t === TILE_SCRAP) scrap++;
      if (t === TILE_FENCE || t === TILE_BLOCKED) assert.fail(`broad yard tile ${t}`);
    }
    assert.equal(scrap, 0);
    assert.equal(yard.tiles.filter((t) => t === TILE_SCRAP).length, 0);
    assert.ok(water > 1500 && water < 16000, `water ${water}`);
    assert.ok(roads > yard.tiles.filter((t) => t === TILE_ROAD).length, `roads ${roads}`);
    assert.ok(map.features.length >= 40, `houses ${map.features.length}`);
    const facings = new Set(map.features.map((f) => f.facing));
    assert.ok(facings.size >= 2, `facings ${[...facings]}`);

    const w = map.width;
    const h = map.height;
    const seen = new Uint8Array(w * h);
    const ponds: { size: number; box: number }[] = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const start = y * w + x;
        if (seen[start] || map.tiles[start] !== TILE_WATER) continue;
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
            if (seen[ni] || map.tiles[ni] !== TILE_WATER) continue;
            seen[ni] = 1;
            q.push({ x: nx, y: ny });
          }
        }
        ponds.push({ size: q.length, box: (maxX - minX + 1) * (maxY - minY + 1) });
      }
    }
    const lakes = ponds.filter((p) => p.size >= 40);
    assert.ok(lakes.length >= 6, `lakes ${lakes.length} water ${water}`);
    for (const p of lakes) assert.ok(p.size < p.box * 0.9, `pond fills its box ${p.size}/${p.box}`);

    const open = (t: number): boolean =>
      t !== TILE_FENCE && t !== TILE_BLOCKED && t !== TILE_WATER && t !== TILE_ROCK;
    const walk = new Uint8Array(w * h);
    const start = map.spawns[0]!;
    const queue: { x: number; y: number }[] = [{ x: start.x, y: start.y }];
    walk[start.y * w + start.x] = 1;
    for (let i = 0; i < queue.length; i++) {
      const c = queue[i]!;
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
        if (walk[k] || !open(map.tiles[k] ?? TILE_BLOCKED)) continue;
        walk[k] = 1;
        queue.push({ x, y });
      }
    }
    for (const s of map.spawns) {
      assert.equal(walk[s.y * w + s.x], 1, `spawn ${s.id} is cut off`);
      assert.notEqual(tileAt(map, s.x, s.y), TILE_WATER, `spawn ${s.id} in water`);
      assert.notEqual(tileAt(map, s.x, s.y), TILE_SCRAP, `spawn ${s.id} on scrap`);
      assert.notEqual(tileAt(map, s.x, s.y), TILE_ROCK, `spawn ${s.id} on rock`);
    }
  });

  it("sets Broad Yard as four paired hills with one gate each", () => {
    const map = MAPS["broad-143"]!;
    const w = map.width;
    const h = map.height;
    const byTeam = new Map<number, { id: number; x: number; y: number }[]>();
    for (const s of map.spawns) {
      const team = s.suggestedTeam ?? 0;
      assert.ok(team >= 1 && team <= 4, `spawn ${s.id} team ${team}`);
      const list = byTeam.get(team) ?? [];
      list.push(s);
      byTeam.set(team, list);
    }
    assert.deepEqual([...byTeam.keys()].sort(), [1, 2, 3, 4]);
    for (const [team, pair] of byTeam) assert.equal(pair.length, 2, `team ${team}`);

    const closed = (t: number): boolean =>
      t === TILE_ROCK || t === TILE_BLOCKED || t === TILE_WATER || t === TILE_FENCE;
    const stepOk = (x: number, y: number, nx: number, ny: number): boolean => {
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) return false;
      if (closed(tileAt(map, nx, ny))) return false;
      if (nx !== x && ny !== y) {
        if (closed(tileAt(map, nx, y)) || closed(tileAt(map, x, ny))) return false;
      }
      return Math.abs(heightAt(map, x, y) - heightAt(map, nx, ny)) <= HEIGHT_STEP_MAX;
    };
    const dirs: readonly [number, number][] = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ];
    const ortho: readonly [number, number][] = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];

    assert.equal(map.tiles.filter((t) => t === TILE_SCRAP).length, 0);

    for (const [team, pair] of byTeam) {
      const home = pair[0]!;
      const high = new Uint8Array(w * h);
      const hq: { x: number; y: number }[] = [{ x: home.x, y: home.y }];
      high[home.y * w + home.x] = 1;
      for (let i = 0; i < hq.length; i++) {
        const c = hq[i]!;
        for (const [dx, dy] of dirs) {
          const nx = c.x + dx;
          const ny = c.y + dy;
          if (!stepOk(c.x, c.y, nx, ny)) continue;
          if (heightAt(map, nx, ny) < HEIGHT_MAX) continue;
          const k = ny * w + nx;
          if (high[k]) continue;
          high[k] = 1;
          hq.push({ x: nx, y: ny });
        }
      }
      for (const s of pair) assert.equal(high[s.y * w + s.x], 1, `team ${team} spawn ${s.id} off the summit`);

      const exits: { x: number; y: number }[] = [];
      for (const c of hq) {
        for (const [dx, dy] of dirs) {
          const nx = c.x + dx;
          const ny = c.y + dy;
          if (!stepOk(c.x, c.y, nx, ny)) continue;
          if (high[ny * w + nx]) continue;
          exits.push(c);
          break;
        }
      }
      assert.ok(exits.length >= 8, `team ${team} gate tiles ${exits.length}`);
      const cluster = new Uint8Array(w * h);
      const cq = [exits[0]!];
      cluster[exits[0]!.y * w + exits[0]!.x] = 1;
      for (let i = 0; i < cq.length; i++) {
        const c = cq[i]!;
        for (const [dx, dy] of ortho) {
          const nx = c.x + dx;
          const ny = c.y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const k = ny * w + nx;
          if (cluster[k] || !high[k]) continue;
          let leaves = false;
          for (const [ex, ey] of dirs) {
            const xx = nx + ex;
            const yy = ny + ey;
            if (!stepOk(nx, ny, xx, yy)) continue;
            if (!high[yy * w + xx]) leaves = true;
          }
          if (!leaves) continue;
          cluster[k] = 1;
          cq.push({ x: nx, y: ny });
        }
      }
      for (const e of exits) assert.equal(cluster[e.y * w + e.x], 1, `team ${team} has a second gate`);

      let cx = 0;
      let cy = 0;
      for (const e of exits) {
        cx += e.x;
        cy += e.y;
      }
      cx /= exits.length;
      cy /= exits.length;
      const sealed = map.tiles.slice();
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (Math.hypot(x - cx, y - cy) > 36) continue;
          if (heightAt(map, x, y) >= HEIGHT_MAX && !cluster[y * w + x]) continue;
          const t = sealed[y * w + x] ?? TILE_BLOCKED;
          if (t === TILE_WATER) continue;
          sealed[y * w + x] = TILE_ROCK;
        }
      }
      const reach = new Uint8Array(w * h);
      const rq: { x: number; y: number }[] = [];
      const borderOpen = (x: number, y: number): boolean => {
        const t = sealed[y * w + x] ?? TILE_BLOCKED;
        return t !== TILE_ROCK && t !== TILE_BLOCKED && t !== TILE_WATER && t !== TILE_FENCE;
      };
      for (let x = 0; x < w; x++) {
        if (borderOpen(x, 1)) rq.push({ x, y: 1 });
        if (borderOpen(x, h - 2)) rq.push({ x, y: h - 2 });
      }
      for (let y = 0; y < h; y++) {
        if (borderOpen(1, y)) rq.push({ x: 1, y });
        if (borderOpen(w - 2, y)) rq.push({ x: w - 2, y });
      }
      for (const p of rq) reach[p.y * w + p.x] = 1;
      const sealedStep = (x: number, y: number, nx: number, ny: number): boolean => {
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) return false;
        const kind = sealed[ny * w + nx] ?? TILE_BLOCKED;
        if (kind === TILE_ROCK || kind === TILE_BLOCKED || kind === TILE_WATER || kind === TILE_FENCE) return false;
        if (nx !== x && ny !== y) {
          const a = sealed[y * w + nx] ?? TILE_BLOCKED;
          const b = sealed[ny * w + x] ?? TILE_BLOCKED;
          if (a === TILE_ROCK || a === TILE_BLOCKED || a === TILE_WATER || a === TILE_FENCE) return false;
          if (b === TILE_ROCK || b === TILE_BLOCKED || b === TILE_WATER || b === TILE_FENCE) return false;
        }
        return Math.abs(heightAt(map, x, y) - heightAt(map, nx, ny)) <= HEIGHT_STEP_MAX;
      };
      for (let i = 0; i < rq.length; i++) {
        const c = rq[i]!;
        for (const [dx, dy] of dirs) {
          const nx = c.x + dx;
          const ny = c.y + dy;
          if (!sealedStep(c.x, c.y, nx, ny)) continue;
          const k = ny * w + nx;
          if (reach[k]) continue;
          reach[k] = 1;
          rq.push({ x: nx, y: ny });
        }
      }
      for (const s of pair) assert.equal(reach[s.y * w + s.x], 0, `team ${team} still has a way up`);
      assert.equal(map.applySuggestedTeams, true);
    }
  });
});
