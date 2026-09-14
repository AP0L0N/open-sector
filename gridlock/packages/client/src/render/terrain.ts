import {
  HEIGHT_MAX,
  ISO_TILE_H,
  TILE_BLOCKED,
  TILE_EMPTY,
  TILE_SCRAP,
  TILE_SUBDIV,
  TILE_TREE,
  TILE_WATER,
  heightAt,
  isoBoxSilhouette,
  isoLift,
  isoMapBounds,
  maxHeightOf,
  tileDiamond,
  vertexElev,
  worldToIso,
  type IsoPt,
  type MapDef,
} from "@gridlock/shared";
import {
  BUSH_A,
  BUSH_B,
  GRASS_TILES,
  SCRAP_A,
  WATER_TEX,
  WATER_TEX_B,
  drawPropSprite,
  whenImagesReady,
  PROP_IMAGES,
} from "./sprites.js";

const WALL_H = 20;
const TREE_H = 14;
const SCRAP_H = 12;
/** Isolated trees extrude past the tile diamond; restamp must repaint that far. */
const RESTAMP_RADIUS = Math.ceil((TREE_H + 8) / ISO_TILE_H) + 3;
/** Wall boxes extend above the northern ground bound. */
const PROP_PAD = WALL_H + 10;

export type ScrapCell = { x: number; y: number };

export type TerrainBake = {
  canvas: HTMLCanvasElement;
  originX: number;
  originY: number;
  width: number;
  height: number;
  scrap: Set<number>;
};

export type MiniBake = {
  canvas: HTMLCanvasElement;
  scrap: Set<number>;
};

const terrainCache = new Map<string, TerrainBake>();
const miniCache = new Map<string, MiniBake>();

function packScrap(cells: Iterable<ScrapCell>, width: number): Set<number> {
  const s = new Set<number>();
  for (const c of cells) {
    if (c.x < 0 || c.y < 0) continue;
    s.add(c.y * width + c.x);
  }
  return s;
}

const mapScrapCache = new Map<string, ScrapCell[]>();

export function scrapFromMapTiles(map: MapDef): ScrapCell[] {
  const hit = mapScrapCache.get(map.id);
  if (hit) return hit;
  const out: ScrapCell[] = [];
  const tiles = map.tiles;
  const w = map.width;
  for (let i = 0; i < tiles.length; i++) {
    if (tiles[i] === TILE_SCRAP) out.push({ x: i % w, y: (i / w) | 0 });
  }
  mapScrapCache.set(map.id, out);
  return out;
}

function shade(hex: string, t: number): string {
  const raw = hex.startsWith("#") ? hex.slice(1) : hex;
  if (raw.length !== 6) return hex;
  const n = parseInt(raw, 16);
  if (Number.isNaN(n)) return hex;
  const r = Math.min(255, Math.max(0, Math.round(((n >> 16) & 255) * t)));
  const g = Math.min(255, Math.max(0, Math.round(((n >> 8) & 255) * t)));
  const b = Math.min(255, Math.max(0, Math.round((n & 255) * t)));
  return `rgb(${r},${g},${b})`;
}

function fillQuad(ctx: CanvasRenderingContext2D, a: IsoPt, b: IsoPt, c: IsoPt, d: IsoPt): void {
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.lineTo(c.x, c.y);
  ctx.lineTo(d.x, d.y);
  ctx.closePath();
  ctx.fill();
}

function bakePt(p: IsoPt, originX: number, originY: number): IsoPt {
  return { x: p.x - originX, y: p.y - originY };
}

function groundFill(map: MapDef, tx: number, ty: number, kind: number, scrap: boolean): string {
  const chk = (Math.floor(tx / TILE_SUBDIV) + Math.floor(ty / TILE_SUBDIV)) % 2 === 0;
  if (kind === TILE_WATER) return chk ? "#1d4a5c" : "#183f52";
  if (kind === TILE_TREE) return chk ? "#1c3320" : "#182c1c";
  const fill = kind === TILE_BLOCKED ? "#2a1e18" : scrap ? (chk ? "#4a3c18" : "#3e3314") : chk ? "#2a3a24" : "#243320";
  const h = heightAt(map, tx, ty);
  if (h <= 0 || kind === TILE_BLOCKED) return fill;
  return shade(fill, 1 + (h / HEIGHT_MAX) * 0.48);
}

function hash2(tx: number, ty: number, salt: number): number {
  return (Math.imul(tx * 374761393 + ty * 668265263 + salt, 1103515245) >>> 0);
}

function waterPattern(ctx: CanvasRenderingContext2D, frame = 0): CanvasPattern | null {
  const img = frame === 1 ? WATER_TEX_B : WATER_TEX;
  if (!img.complete || img.naturalWidth <= 0) return null;
  return ctx.createPattern(img, "repeat");
}

function landNeighbor(map: MapDef, tx: number, ty: number, dx: number, dy: number): boolean {
  const x = tx + dx;
  const y = ty + dy;
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return true;
  return map.tiles[y * map.width + x] !== TILE_WATER;
}

function paintWaterOverlay(
  ctx: CanvasRenderingContext2D,
  map: MapDef,
  tx: number,
  ty: number,
  originX: number,
  originY: number,
): void {
  const d = tileDiamond(tx, ty, map.tileSize);
  const n = bakePt(d.n, originX, originY);
  const e = bakePt(d.e, originX, originY);
  const s = bakePt(d.s, originX, originY);
  const w = bakePt(d.w, originX, originY);
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(n.x, n.y);
  ctx.lineTo(e.x, e.y);
  ctx.lineTo(s.x, s.y);
  ctx.lineTo(w.x, w.y);
  ctx.closePath();
  ctx.clip();
  const pat = waterPattern(ctx, 0);
  if (pat) {
    ctx.globalAlpha = 0.82;
    ctx.fillStyle = pat;
    const minX = Math.floor(Math.min(n.x, e.x, s.x, w.x));
    const minY = Math.floor(Math.min(n.y, e.y, s.y, w.y));
    const maxX = Math.ceil(Math.max(n.x, e.x, s.x, w.x));
    const maxY = Math.ceil(Math.max(n.y, e.y, s.y, w.y));
    ctx.fillRect(minX, minY, Math.max(1, maxX - minX), Math.max(1, maxY - minY));
    ctx.globalAlpha = 1;
  }
  ctx.restore();
  const edges: [number, number, IsoPt, IsoPt][] = [
    [0, -1, n, e],
    [1, 0, e, s],
    [0, 1, s, w],
    [-1, 0, w, n],
  ];
  ctx.save();
  ctx.lineCap = "round";
  for (const [dx, dy, a, b] of edges) {
    if (!landNeighbor(map, tx, ty, dx, dy)) continue;
    ctx.strokeStyle = "rgba(186, 216, 206, 0.62)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.strokeStyle = "rgba(230, 244, 236, 0.28)";
    ctx.lineWidth = 0.7;
    ctx.stroke();
  }
  ctx.restore();
}

function grassPattern(ctx: CanvasRenderingContext2D, variant: number): CanvasPattern | null {
  const img = GRASS_TILES[variant % GRASS_TILES.length];
  if (!img || !img.complete || img.naturalWidth <= 0) return null;
  return ctx.createPattern(img, "repeat");
}

function paintGrassOverlay(
  ctx: CanvasRenderingContext2D,
  map: MapDef,
  tx: number,
  ty: number,
  originX: number,
  originY: number,
): void {
  const d = tileDiamond(tx, ty, map.tileSize);
  const n = bakePt(d.n, originX, originY);
  const e = bakePt(d.e, originX, originY);
  const s = bakePt(d.s, originX, originY);
  const w = bakePt(d.w, originX, originY);
  const v = hash2(tx, ty, 4) % GRASS_TILES.length;
  const pat = grassPattern(ctx, v);
  if (!pat) return;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(n.x, n.y);
  ctx.lineTo(e.x, e.y);
  ctx.lineTo(s.x, s.y);
  ctx.lineTo(w.x, w.y);
  ctx.closePath();
  ctx.clip();
  ctx.globalAlpha = 0.92;
  ctx.fillStyle = pat;
  const minX = Math.floor(Math.min(n.x, e.x, s.x, w.x));
  const minY = Math.floor(Math.min(n.y, e.y, s.y, w.y));
  const maxX = Math.ceil(Math.max(n.x, e.x, s.x, w.x));
  const maxY = Math.ceil(Math.max(n.y, e.y, s.y, w.y));
  ctx.fillRect(minX, minY, Math.max(1, maxX - minX), Math.max(1, maxY - minY));
  ctx.restore();
}

export function atlasSize(map: MapDef): {
  originX: number;
  originY: number;
  width: number;
  height: number;
} {
  const b = isoMapBounds(map.width, map.height, map.tileSize, maxHeightOf(map));
  return {
    originX: b.minX,
    originY: b.minY - PROP_PAD,
    width: Math.ceil(b.maxX - b.minX),
    height: Math.ceil(b.maxY - b.minY + PROP_PAD),
  };
}

export function fillElevatedTile(
  ctx: CanvasRenderingContext2D,
  map: MapDef,
  tx: number,
  ty: number,
  fill: string,
  originX: number,
  originY: number,
): void {
  const elev = map.heights;
  const d = tileDiamond(tx, ty, map.tileSize);
  const up = (p: IsoPt, z: number): IsoPt => {
    const q = bakePt(p, originX, originY);
    return { x: q.x, y: q.y - z };
  };
  const nH = vertexElev(elev, map.width, map.height, tx, ty);
  const eH = vertexElev(elev, map.width, map.height, tx + 1, ty);
  const sH = vertexElev(elev, map.width, map.height, tx + 1, ty + 1);
  const wH = vertexElev(elev, map.width, map.height, tx, ty + 1);
  const n = up(d.n, isoLift(nH));
  const e = up(d.e, isoLift(eH));
  const s = up(d.s, isoLift(sH));
  const w = up(d.w, isoLift(wH));
  const floorS = ty + 1 >= map.height;
  const floorE = tx + 1 >= map.width;
  if (floorS && (wH > 0 || sH > 0)) {
    ctx.fillStyle = shade(fill, 0.42);
    fillQuad(ctx, w, s, up(d.s, 0), up(d.w, 0));
  }
  if (floorE && (eH > 0 || sH > 0)) {
    ctx.fillStyle = shade(fill, 0.68);
    fillQuad(ctx, e, s, up(d.s, 0), up(d.e, 0));
  }
  ctx.fillStyle = fill;
  fillQuad(ctx, n, e, s, w);
}

function isoBox(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  ez: number,
  top: string,
  elev: number,
  tileSize: number,
  originX: number,
  originY: number,
): void {
  const lift = isoLift(elev);
  const corner = (wx: number, wy: number): IsoPt => {
    const p = worldToIso(wx, wy, tileSize);
    return { x: p.x - originX, y: p.y - originY - lift };
  };
  const n = corner(x, y);
  const e = corner(x + w, y);
  const s = corner(x + w, y + h);
  const west = corner(x, y + h);
  const up = (p: IsoPt): IsoPt => ({ x: p.x, y: p.y - ez });
  const n2 = up(n);
  const e2 = up(e);
  const s2 = up(s);
  const w2 = up(west);
  if (ez > 0) {
    ctx.fillStyle = shade(top, 0.42);
    fillQuad(ctx, west, s, s2, w2);
    ctx.fillStyle = shade(top, 0.68);
    fillQuad(ctx, e, s, s2, e2);
  }
  ctx.fillStyle = top;
  fillQuad(ctx, n2, e2, s2, w2);
}

/** Stem of a grove, or a lone tree. Null if this cell is only canopy cover. */
export function treePropKind(map: MapDef, tx: number, ty: number): "lone" | "grove" | null {
  if ((map.tiles[ty * map.width + tx] ?? 0) !== TILE_TREE) return null;
  const batch = treeNeighbor(map, tx, ty);
  if (batch && !treeStem(tx, ty)) return null;
  return batch ? "grove" : "lone";
}

export function treeNeighbor(map: MapDef, tx: number, ty: number): boolean {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const x = tx + dx;
      const y = ty + dy;
      if (x < 0 || y < 0 || x >= map.width || y >= map.height) continue;
      if (map.tiles[y * map.width + x] === TILE_TREE) return true;
    }
  }
  return false;
}

function treeStem(tx: number, ty: number): boolean {
  const sub = TILE_SUBDIV;
  const ax = Math.floor(tx / sub);
  const ay = Math.floor(ty / sub);
  const h = Math.imul(ax * 1103515245 + ay * 12345 + 0x9e3779b9, 2654435761) >>> 0;
  const n = 1 + (h % 2);
  const lx0 = h % sub;
  const ly0 = (h >>> 4) % sub;
  if (tx % sub === lx0 && ty % sub === ly0) return true;
  if (n < 2) return false;
  const lx1 = (h >>> 8) % sub;
  const ly1 = (h >>> 12) % sub;
  if (lx1 === lx0 && ly1 === ly0) return false;
  return tx % sub === lx1 && ty % sub === ly1;
}

function paintTileProps(
  ctx: CanvasRenderingContext2D,
  map: MapDef,
  tx: number,
  ty: number,
  scrap: boolean,
  originX: number,
  originY: number,
  fillOverride?: string,
): void {
  const kind = map.tiles[ty * map.width + tx] ?? 0;
  const ts = map.tileSize;
  const elev = heightAt(map, tx, ty);
  if (kind === TILE_BLOCKED) {
    isoBox(ctx, tx * ts, ty * ts, ts, ts, WALL_H, fillOverride ?? "#3a2a22", elev, ts, originX, originY);
  } else if (kind === TILE_TREE) {
    if (!treePropKind(map, tx, ty)) return;
    const inset = ts * 0.32;
    isoBox(
      ctx,
      tx * ts + inset,
      ty * ts + inset,
      ts - inset * 2,
      ts - inset * 2,
      5,
      fillOverride ?? "#2a2218",
      elev,
      ts,
      originX,
      originY,
    );
  } else if (scrap) {
    const lift = isoLift(elev);
    const p = worldToIso((tx + 0.5) * ts, (ty + 0.55) * ts, ts);
    const x = p.x - originX;
    const y = p.y - originY - lift;
    const h = hash2(tx, ty, 3);
    const drawn = drawPropSprite(ctx, SCRAP_A, x, y, 11 + (h % 5), (h & 1) === 0);
    if (!drawn) {
      const inset = ts * 0.18;
      isoBox(
        ctx,
        tx * ts + inset,
        ty * ts + inset,
        ts - inset * 2,
        ts - inset * 2,
        SCRAP_H,
        fillOverride ?? "#c4a24a",
        elev,
        ts,
        originX,
        originY,
      );
    }
  } else if (kind === TILE_EMPTY) {
    paintDecor(ctx, map, tx, ty, originX, originY);
  }
}

function bushRoll(tx: number, ty: number): number {
  return hash2(tx, ty, 29);
}

function wantBush(tx: number, ty: number): boolean {
  const h = bushRoll(tx, ty);
  if (h >= 0x00600000) return false;
  for (let dy = -5; dy <= 5; dy++) {
    for (let dx = -5; dx <= 5; dx++) {
      if (dx === 0 && dy === 0) continue;
      const n = bushRoll(tx + dx, ty + dy);
      if (n < 0x00600000 && n >= h) return false;
    }
  }
  return true;
}

function paintDecor(
  ctx: CanvasRenderingContext2D,
  map: MapDef,
  tx: number,
  ty: number,
  originX: number,
  originY: number,
): void {
  if (!wantBush(tx, ty)) return;
  const ts = map.tileSize;
  const elev = heightAt(map, tx, ty);
  const lift = isoLift(elev);
  const h = bushRoll(tx, ty);
  const jx = ((h >>> 8) % 9) * 0.06 - 0.24;
  const jy = ((h >>> 4) % 9) * 0.06 - 0.18;
  const p = worldToIso((tx + 0.5 + jx) * ts, (ty + 0.62 + jy) * ts, ts);
  const bush = (h >>> 11) % 2 === 0 ? BUSH_A : BUSH_B;
  drawPropSprite(ctx, bush, p.x - originX, p.y - originY - lift, 14 + (h % 11), (h & 4) === 0);
}

export function coverTile(
  ctx: CanvasRenderingContext2D,
  map: MapDef,
  tx: number,
  ty: number,
  scrap: boolean,
  originX: number,
  originY: number,
  fill: string,
): void {
  fillElevatedTile(ctx, map, tx, ty, fill, originX, originY);
  paintTileProps(ctx, map, tx, ty, scrap, originX, originY, fill);
}

function paintGround(
  ctx: CanvasRenderingContext2D,
  map: MapDef,
  tx: number,
  ty: number,
  scrap: boolean,
  originX: number,
  originY: number,
): void {
  const kind = map.tiles[ty * map.width + tx] ?? 0;
  fillElevatedTile(ctx, map, tx, ty, groundFill(map, tx, ty, kind, scrap), originX, originY);
  if (kind === TILE_WATER) paintWaterOverlay(ctx, map, tx, ty, originX, originY);
  else if (kind !== TILE_BLOCKED) paintGrassOverlay(ctx, map, tx, ty, originX, originY);
}

function paintTileStamp(
  ctx: CanvasRenderingContext2D,
  map: MapDef,
  indices: number[],
  scrap: Set<number>,
  originX: number,
  originY: number,
): void {
  const w = map.width;
  indices.sort((a, b) => (a % w) + ((a / w) | 0) - ((b % w) + ((b / w) | 0)));
  for (const i of indices) {
    paintGround(ctx, map, i % w, (i / w) | 0, scrap.has(i), originX, originY);
  }
  for (const i of indices) {
    paintTileProps(ctx, map, i % w, (i / w) | 0, scrap.has(i), originX, originY);
  }
}

/** NW (low x+y) first so south-east cliffs and props paint in front. */
function forEachTile(map: MapDef, fn: (x: number, y: number) => void): void {
  const w = map.width;
  const h = map.height;
  for (let sum = 0; sum <= w + h - 2; sum++) {
    const x0 = Math.max(0, sum - (h - 1));
    const x1 = Math.min(w - 1, sum);
    for (let x = x0; x <= x1; x++) fn(x, sum - x);
  }
}

function makeAtlasCanvas(map: MapDef): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  originX: number;
  originY: number;
  width: number;
  height: number;
} {
  const size = atlasSize(map);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, size.width);
  canvas.height = Math.max(1, size.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.imageSmoothingEnabled = false;
  return { canvas, ctx, ...size };
}

export function bakeTerrain(map: MapDef, scrap: Iterable<ScrapCell>): TerrainBake {
  const { canvas, ctx, originX, originY, width, height } = makeAtlasCanvas(map);
  const packed = packScrap(scrap, map.width);
  forEachTile(map, (x, y) => paintGround(ctx, map, x, y, packed.has(y * map.width + x), originX, originY));
  forEachTile(map, (x, y) => paintTileProps(ctx, map, x, y, packed.has(y * map.width + x), originX, originY));
  return { canvas, originX, originY, width, height, scrap: packed };
}

function tileStampBounds(
  map: MapDef,
  tx: number,
  ty: number,
  originX: number,
  originY: number,
): { x: number; y: number; w: number; h: number } {
  const ts = map.tileSize;
  const inset = ts * -0.4;
  const sil = isoBoxSilhouette(
    tx * ts + inset,
    ty * ts + inset,
    ts - inset * 2,
    ts - inset * 2,
    TREE_H + 8,
    ts,
    isoLift(heightAt(map, tx, ty)),
  );
  const pad = 6;
  const xs = sil.map((p) => p.x);
  const ys = sil.map((p) => p.y);
  const minX = Math.min(...xs) - originX - pad;
  const maxX = Math.max(...xs) - originX + pad;
  const minY = Math.min(...ys) - originY - pad;
  const maxY = Math.max(...ys) - originY + pad;
  return {
    x: Math.floor(minX),
    y: Math.floor(minY),
    w: Math.ceil(maxX - minX),
    h: Math.ceil(maxY - minY),
  };
}

function expandIndices(map: MapDef, indices: number[], radius: number): number[] {
  const w = map.width;
  const h = map.height;
  const expanded = new Set<number>();
  for (const i of indices) {
    const x = i % w;
    const y = (i / w) | 0;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        expanded.add(ny * w + nx);
      }
    }
  }
  return [...expanded];
}

export function restampTiles(
  bake: TerrainBake,
  map: MapDef,
  indices: number[],
  scrapCells: Iterable<ScrapCell>,
): void {
  if (indices.length === 0) return;
  const ctx = bake.canvas.getContext("2d");
  if (!ctx) return;
  const packed = packScrap(scrapCells, map.width);
  const w = map.width;
  for (const i of indices) {
    const b = tileStampBounds(map, i % w, (i / w) | 0, bake.originX, bake.originY);
    ctx.clearRect(b.x, b.y, b.w, b.h);
  }
  paintTileStamp(ctx, map, expandIndices(map, indices, RESTAMP_RADIUS), packed, bake.originX, bake.originY);
  bake.scrap = packed;
}

export function restampMini(
  bake: MiniBake,
  map: MapDef,
  indices: number[],
  scrapCells: Iterable<ScrapCell>,
): void {
  if (indices.length === 0) return;
  const ctx = bake.canvas.getContext("2d");
  if (!ctx) return;
  const packed = packScrap(scrapCells, map.width);
  const w = map.width;
  const h = map.height;
  const touch = new Set<number>();
  for (const i of indices) {
    const x = i % w;
    const y = (i / w) | 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        touch.add(ny * w + nx);
      }
    }
  }
  for (const i of touch) {
    ctx.fillStyle = miniFill(map, i % w, (i / w) | 0, packed.has(i));
    ctx.fillRect(i % w, (i / w) | 0, 1, 1);
  }
  bake.scrap = packed;
}

export function updateScrap(bake: TerrainBake, map: MapDef, scrapCells: Iterable<ScrapCell>): void {
  const next = packScrap(scrapCells, map.width);
  const prev = bake.scrap;
  const dirty = new Set<number>();
  for (const i of prev) if (!next.has(i)) dirty.add(i);
  for (const i of next) if (!prev.has(i)) dirty.add(i);
  if (dirty.size === 0) {
    bake.scrap = next;
    return;
  }
  const ctx = bake.canvas.getContext("2d");
  if (!ctx) {
    bake.scrap = next;
    return;
  }
  const w = map.width;
  const h = map.height;
  const expanded = new Set<number>();
  for (const i of dirty) {
    const x = i % w;
    const y = (i / w) | 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        expanded.add(ny * w + nx);
      }
    }
  }
  paintTileStamp(ctx, map, [...expanded], next, bake.originX, bake.originY);
  bake.scrap = next;
}

export function blitTerrain(
  ctx: CanvasRenderingContext2D,
  bake: TerrainBake,
  camX: number,
  camY: number,
  viewW: number,
  viewH: number,
): void {
  ctx.drawImage(bake.canvas, camX - bake.originX, camY - bake.originY, viewW, viewH, 0, 0, viewW, viewH);
}

export function blitAtlas(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  originX: number,
  originY: number,
  camX: number,
  camY: number,
  viewW: number,
  viewH: number,
): void {
  ctx.drawImage(canvas, camX - originX, camY - originY, viewW, viewH, 0, 0, viewW, viewH);
}

export function terrainFor(map: MapDef, scrap: Iterable<ScrapCell>): TerrainBake {
  let bake = terrainCache.get(map.id);
  if (!bake) {
    bake = bakeTerrain(map, scrap);
    terrainCache.set(map.id, bake);
  } else {
    updateScrap(bake, map, scrap);
  }
  return bake;
}

function parseRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.startsWith("#") ? hex.slice(1) : hex, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function miniFill(map: MapDef, tx: number, ty: number, scrap: boolean): string {
  const kind = map.tiles[ty * map.width + tx] ?? 0;
  if (kind === TILE_WATER) return "#1d4a5c";
  if (kind === TILE_TREE) return "#1f4a28";
  if (kind === TILE_BLOCKED) return "#3a2a22";
  if (scrap) return "#5a4a18";
  const band = HEIGHT_MAX > 0 ? heightAt(map, tx, ty) / HEIGHT_MAX : 0;
  if (band >= 0.75) return "#5a6a3c";
  if (band >= 0.4) return "#4a5a32";
  if (band > 0) return "#3a4c2c";
  return "#334628";
}

export function bakeMini(map: MapDef, scrap: Iterable<ScrapCell>): MiniBake {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, map.width);
  canvas.height = Math.max(1, map.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  const packed = packScrap(scrap, map.width);
  const img = ctx.createImageData(map.width, map.height);
  const data = img.data;
  const n = map.width * map.height;
  for (let i = 0; i < n; i++) {
    const [r, g, b] = parseRgb(miniFill(map, i % map.width, (i / map.width) | 0, packed.has(i)));
    const o = i * 4;
    data[o] = r;
    data[o + 1] = g;
    data[o + 2] = b;
    data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return { canvas, scrap: packed };
}

export function updateMiniScrap(bake: MiniBake, map: MapDef, scrapCells: Iterable<ScrapCell>): void {
  const next = packScrap(scrapCells, map.width);
  const prev = bake.scrap;
  const ctx = bake.canvas.getContext("2d");
  if (!ctx) {
    bake.scrap = next;
    return;
  }
  const w = map.width;
  const touch = new Set<number>();
  for (const i of prev) if (!next.has(i)) touch.add(i);
  for (const i of next) if (!prev.has(i)) touch.add(i);
  for (const i of touch) {
    ctx.fillStyle = miniFill(map, i % w, (i / w) | 0, next.has(i));
    ctx.fillRect(i % w, (i / w) | 0, 1, 1);
  }
  bake.scrap = next;
}

export function miniFor(map: MapDef, scrap: Iterable<ScrapCell>): MiniBake {
  let bake = miniCache.get(map.id);
  if (!bake) {
    bake = bakeMini(map, scrap);
    miniCache.set(map.id, bake);
  } else {
    updateMiniScrap(bake, map, scrap);
  }
  return bake;
}

export function resetTerrainCache(): void {
  terrainCache.clear();
  miniCache.clear();
}

export function whenTerrainArtReady(cb: () => void): void {
  whenImagesReady(PROP_IMAGES, cb);
}
