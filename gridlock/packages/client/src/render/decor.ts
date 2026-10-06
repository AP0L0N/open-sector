import {
  GROUND_SAND,
  GROUND_STONES,
  GROUND_SWAMP,
  TILE_EMPTY,
  TILE_ROAD,
  TILE_ROCK,
  isMountainCliff,
  TILE_SCRAP,
  TILE_SUBDIV,
  TILE_TREE,
  TILE_WATER,
  featureBox,
  getMap,
  groundAt,
  heightAt,
  type MapDef,
} from "@gridlock/shared";
import { hash2 } from "./terrain-light.js";

/**
 * Visual-only map dress: bushes, signposts, boulders, rubble, stumps, and old
 * craters. Nothing here reaches the sim. Placement is a pure function of the
 * shipped map (its id and tiles), so every client draws the same layout.
 */
export type DecorKind = "bush" | "sign" | "boulder" | "stones" | "stump" | "crater";

export interface DecorItem {
  kind: DecorKind;
  tx: number;
  ty: number;
  /** Offset inside the tile, in tiles (0..1 from the tile's top corner). */
  ox: number;
  oy: number;
  /** Variant index; callers take it modulo the sprite list. */
  face: number;
  /** Screen height in pixels at zoom 1. For craters this is the pit radius in tiles. */
  drawH: number;
  flip: boolean;
  /** Standing props depth-sort with units; flat ones are baked into the ground. */
  standing: boolean;
  /** Bake opacity for flat props. */
  alpha: number;
}

export interface DecorLayout {
  items: DecorItem[];
  standing: DecorItem[];
  /** Ground-baked items (craters, rubble, boulders) by tile (`ty * width + tx`). Units and structures always draw over them. */
  flatAt: Map<number, DecorItem[]>;
}

/** Spawn pad kept clear for the opening base, in fine tiles. */
const PAD_R = 5 * TILE_SUBDIV;

function mix(map: MapDef, salt: number): number {
  let h = salt >>> 0;
  for (let i = 0; i < map.id.length; i++) h = Math.imul(h ^ map.id.charCodeAt(i), 16777619) >>> 0;
  return h;
}

/** One pick per neighborhood: the tile whose hash is lowest among candidates nearby. */
function spaced(seed: number, tx: number, ty: number, mod: number, spacing: number): boolean {
  const h = hash2(tx, ty, seed);
  if (h % mod !== 0) return false;
  for (let dy = -spacing; dy <= spacing; dy++) {
    for (let dx = -spacing; dx <= spacing; dx++) {
      if (dx === 0 && dy === 0) continue;
      const n = hash2(tx + dx, ty + dy, seed);
      if (n % mod === 0 && n > h) return false;
    }
  }
  return true;
}

function keepOut(map: MapDef): Uint8Array {
  const w = map.width;
  const h = map.height;
  const out = new Uint8Array(w * h);
  for (const f of map.features) {
    const b = featureBox(f);
    for (let y = b.y0 - 2; y < b.y1 + 2; y++) {
      for (let x = b.x0 - 2; x < b.x1 + 2; x++) {
        if (x >= 0 && y >= 0 && x < w && y < h) out[y * w + x] = 1;
      }
    }
  }
  // A street lamp or a piece of clutter keeps its own tile and the ring round it clear of signposts and bushes.
  for (const l of [...(map.lamps ?? []), ...(map.clutter ?? [])]) {
    for (let y = l.y - 1; y <= l.y + 1; y++) {
      for (let x = l.x - 1; x <= l.x + 1; x++) {
        if (x >= 0 && y >= 0 && x < w && y < h) out[y * w + x] = 1;
      }
    }
  }
  for (const s of map.spawns) {
    for (let y = s.y - PAD_R; y <= s.y + PAD_R; y++) {
      for (let x = s.x - PAD_R; x <= s.x + PAD_R; x++) {
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        if (Math.hypot(x - s.x, y - s.y) <= PAD_R) out[y * w + x] = 1;
      }
    }
  }
  return out;
}

/** Nearest tile of `kind` within `r` (Chebyshev), or Infinity. */
function nearest(map: MapDef, tx: number, ty: number, kind: number, r: number): number {
  const w = map.width;
  for (let d = 1; d <= r; d++) {
    for (let dy = -d; dy <= d; dy++) {
      for (let dx = -d; dx <= d; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue;
        const x = tx + dx;
        const y = ty + dy;
        if (x < 0 || y < 0 || x >= map.width || y >= map.height) continue;
        if (map.tiles[y * w + x] === kind) return d;
      }
    }
  }
  return Infinity;
}

const RING_R = 7;
const RING_N = 32;

/**
 * Road arcs crossing a ring around a road tile. Three or more is a junction;
 * two that do not sit opposite each other is a bend.
 */
function roadArcs(map: MapDef, tx: number, ty: number): number[] {
  const on: boolean[] = [];
  for (let i = 0; i < RING_N; i++) {
    const a = (i / RING_N) * Math.PI * 2;
    const x = Math.round(tx + Math.cos(a) * RING_R);
    const y = Math.round(ty + Math.sin(a) * RING_R);
    on.push(x >= 0 && y >= 0 && x < map.width && y < map.height && map.tiles[y * map.width + x] === TILE_ROAD);
  }
  const start = on.indexOf(false);
  if (start < 0) return [];
  const mids: number[] = [];
  let run = -1;
  for (let k = 1; k <= RING_N; k++) {
    const i = (start + k) % RING_N;
    if (on[i] && run < 0) run = k;
    if (!on[i] && run >= 0) {
      const mid = start + (run + k - 1) / 2;
      mids.push((mid / RING_N) * Math.PI * 2);
      run = -1;
    }
  }
  return mids;
}

function signSpots(map: MapDef, free: (x: number, y: number) => boolean): { tx: number; ty: number; face: number }[] {
  const w = map.width;
  const picks: { tx: number; ty: number; score: number }[] = [];
  for (let ty = RING_R; ty < map.height - RING_R; ty += 2) {
    for (let tx = RING_R; tx < w - RING_R; tx += 2) {
      if (map.tiles[ty * w + tx] !== TILE_ROAD) continue;
      // Only centreline tiles: road on both sides along some axis.
      const arcs = roadArcs(map, tx, ty);
      let score = 0;
      if (arcs.length >= 3) score = 2;
      else if (arcs.length === 2) {
        let d = Math.abs(arcs[0]! - arcs[1]!);
        if (d > Math.PI) d = Math.PI * 2 - d;
        if (d < Math.PI - 1.0) score = 1;
      }
      if (score > 0) picks.push({ tx, ty, score });
    }
  }
  picks.sort((a, b) => b.score - a.score || hash2(a.tx, a.ty, 77) - hash2(b.tx, b.ty, 77));
  const out: { tx: number; ty: number; face: number }[] = [];
  for (const p of picks) {
    if (out.some((o) => Math.hypot(o.tx - p.tx, o.ty - p.ty) < 34)) continue;
    // Step off the road to the nearest free verge tile.
    let best: { tx: number; ty: number; d: number } | null = null;
    for (let dy = -6; dy <= 6; dy++) {
      for (let dx = -6; dx <= 6; dx++) {
        const x = p.tx + dx;
        const y = p.ty + dy;
        if (!free(x, y)) continue;
        if (nearest(map, x, y, TILE_ROAD, 1) !== 1) continue;
        const d = Math.hypot(dx, dy) + (hash2(x, y, 91) % 100) / 400;
        if (!best || d < best.d) best = { tx: x, ty: y, d };
      }
    }
    if (best) out.push({ tx: best.tx, ty: best.ty, face: p.score === 2 ? 0 : 1 });
  }
  return out;
}

/** Deterministic dress for `map`. Uncached; prefer `decorFor`. */
export function placeDecor(map: MapDef): DecorItem[] {
  const w = map.width;
  const h = map.height;
  const out = keepOut(map);
  const used = new Uint8Array(w * h);
  const items: DecorItem[] = [];
  const s = (salt: number): number => mix(map, salt);
  const inside = (x: number, y: number): boolean => x >= 1 && y >= 1 && x < w - 1 && y < h - 1;
  const free = (x: number, y: number): boolean =>
    inside(x, y) && !out[y * w + x] && !used[y * w + x] && map.tiles[y * w + x] === TILE_EMPTY;
  const claim = (x: number, y: number, r: number): void => {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (inside(x + dx, y + dy)) used[(y + dy) * w + x + dx] = 1;
      }
    }
  };
  const add = (kind: DecorKind, tx: number, ty: number, drawH: number, standing: boolean, salt: number, alpha = 1): DecorItem => {
    const hh = hash2(tx, ty, s(salt) ^ 0x5bd1e995);
    const item: DecorItem = {
      kind,
      tx,
      ty,
      ox: 0.3 + ((hh >>> 4) % 41) / 100,
      oy: 0.3 + ((hh >>> 11) % 41) / 100,
      face: (hh >>> 18) % 7,
      drawH,
      flip: (hh & 1) === 1,
      standing,
      alpha,
    };
    items.push(item);
    return item;
  };

  for (const p of signSpots(map, free)) {
    add("sign", p.tx, p.ty, 30 + (hash2(p.tx, p.ty, s(3)) % 4), true, 3).face = p.face;
    claim(p.tx, p.ty, 3);
  }

  // Boulders standing on the rocky flanks go first so the slope foot does not crowd them out.
  for (let ty = 1; ty < h - 1; ty++) {
    for (let tx = 1; tx < w - 1; tx++) {
      const i = ty * w + tx;
      if ((map.tiles[i] !== TILE_ROCK && !isMountainCliff(map.tiles, map.heights, w, h, tx, ty)) || out[i] || used[i]) continue;
      if (!spaced(s(11), tx, ty, 5, 2)) continue;
      add("boulder", tx, ty, 6 + (hash2(tx, ty, s(29)) % 4), false, 11);
      claim(tx, ty, 2);
    }
  }

  for (let ty = 1; ty < h - 1; ty++) {
    for (let tx = 1; tx < w - 1; tx++) {
      const i = ty * w + tx;
      const t = map.tiles[i];
      if (out[i] || used[i]) continue;
      const hv = hash2(tx, ty, s(29));
      if (t !== TILE_EMPTY) continue;
      const rock = nearest(map, tx, ty, TILE_ROCK, 3);
      if (rock <= 3) {
        // Foot of a slope: rock above, open ground here.
        let below = false;
        for (let dy = -3; dy <= 3 && !below; dy++) {
          for (let dx = -3; dx <= 3; dx++) {
            const x = tx + dx;
            const y = ty + dy;
            if (map.tiles[y * w + x] === TILE_ROCK && heightAt(map, x, y) > heightAt(map, tx, ty)) {
              below = true;
              break;
            }
          }
        }
        if (below && spaced(s(13), tx, ty, 6, 3)) {
          add("boulder", tx, ty, 5 + (hv % 4), false, 13);
          claim(tx, ty, 2);
          continue;
        }
        if (spaced(s(17), tx, ty, 14, 3)) {
          add("stones", tx, ty, 9 + (hv % 4), false, 17);
          claim(tx, ty, 1);
          continue;
        }
      }
      const tree = nearest(map, tx, ty, TILE_TREE, 2);
      if (tree <= 2) {
        if (tree === 1 && spaced(s(19), tx, ty, 70, 5)) {
          add("stump", tx, ty, 10 + (hv % 4), true, 19);
          claim(tx, ty, 2);
          continue;
        }
        if (spaced(s(23), tx, ty, 21, 3)) {
          add("bush", tx, ty, 15 + (hv % 8), true, 23);
          claim(tx, ty, 1);
          continue;
        }
      }
      const scrap = nearest(map, tx, ty, TILE_SCRAP, 3);
      if (scrap >= 2 && scrap <= 3 && spaced(s(31), tx, ty, 26, 4)) {
        add("bush", tx, ty, 14 + (hv % 7), true, 31);
        claim(tx, ty, 1);
        continue;
      }
      const road = nearest(map, tx, ty, TILE_ROAD, 3);
      if (road >= 2 && road <= 3 && spaced(s(37), tx, ty, 40, 5)) {
        add("bush", tx, ty, 13 + (hv % 7), true, 37);
        claim(tx, ty, 1);
        continue;
      }
      const water = nearest(map, tx, ty, TILE_WATER, 2);
      if (water <= 2) continue;
      if (road > 3 && spaced(s(41), tx, ty, 900, 14)) {
        // Weathered pit left from an older fight; radius in tiles.
        add("crater", tx, ty, 1.3 + (hv % 5) * 0.15, false, 41, 0.55);
        claim(tx, ty, 3);
        continue;
      }
      // Stony cover carries loose stones and the odd boulder; marsh and sand stay bare.
      const cover = groundAt(map, i);
      if (cover === GROUND_STONES) {
        if (spaced(s(53), tx, ty, 12, 2)) {
          add("stones", tx, ty, 8 + (hv % 4), false, 53);
          claim(tx, ty, 1);
          continue;
        }
        if (spaced(s(59), tx, ty, 60, 4)) {
          add("boulder", tx, ty, 5 + (hv % 3), false, 59);
          claim(tx, ty, 2);
          continue;
        }
      }
      if (cover === GROUND_SWAMP || cover === GROUND_SAND) continue;
      if (spaced(s(43), tx, ty, 220, 6)) {
        add("stones", tx, ty, 8 + (hv % 4), false, 43);
        claim(tx, ty, 1);
        continue;
      }
      if (spaced(s(47), tx, ty, 420, 8)) {
        add("boulder", tx, ty, 5 + (hv % 3), false, 47);
        claim(tx, ty, 2);
      }
    }
  }
  return items;
}

const cache = new Map<string, DecorLayout>();

export function forgetDecor(id: string): void {
  cache.delete(id);
}

/** Cached dress for a map id. Uses the shipped map so cleared trees never move it. */
export function decorFor(map: MapDef): DecorLayout {
  const hit = cache.get(map.id);
  if (hit) return hit;
  const base = getMap(map.id) ?? map;
  const items = placeDecor(base);
  const flatAt = new Map<number, DecorItem[]>();
  const standing: DecorItem[] = [];
  for (const it of items) {
    if (it.standing) {
      standing.push(it);
      continue;
    }
    const k = it.ty * base.width + it.tx;
    const list = flatAt.get(k) ?? [];
    list.push(it);
    flatAt.set(k, list);
  }
  const layout = { items, standing, flatAt };
  cache.set(map.id, layout);
  return layout;
}
