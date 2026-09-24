import {
  HEIGHT_BASE,
  HEIGHT_MAX,
  ISO_TILE_H,
  TILE_BLOCKED,
  TILE_EMPTY,
  TILE_FENCE,
  TILE_ROAD,
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
  BUSH_FACES,
  DIRT_TEX,
  GRASS_TEXS,
  SCRAP_FACES,
  TUFT_FACES,
  WATER_TEX,
  WATER_TEX_B,
  drawPropSprite,
  whenImagesReady,
  PROP_IMAGES,
  type PropSprite,
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

const TILE_OVERLAP_PX = 0.85;

/** Grow a diamond so adjacent tiles overlap and hide hairline seams. */
function expandQuad(n: IsoPt, e: IsoPt, s: IsoPt, w: IsoPt, px: number): [IsoPt, IsoPt, IsoPt, IsoPt] {
  const cx = (n.x + e.x + s.x + w.x) / 4;
  const cy = (n.y + e.y + s.y + w.y) / 4;
  const grow = (p: IsoPt): IsoPt => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    const len = Math.hypot(dx, dy) || 1;
    return { x: p.x + (dx / len) * px, y: p.y + (dy / len) * px };
  };
  return [grow(n), grow(e), grow(s), grow(w)];
}

function bakePt(p: IsoPt, originX: number, originY: number): IsoPt {
  return { x: p.x - originX, y: p.y - originY };
}

function elevShadeFactor(h: number): number {
  const span = Math.max(1, HEIGHT_MAX - HEIGHT_BASE);
  return 1 + ((h - HEIGHT_BASE) / span) * 0.48;
}

function groundFill(map: MapDef, tx: number, ty: number, kind: number, scrap: boolean): string {
  if (kind === TILE_WATER) return "#1a4554";
  if (kind === TILE_BLOCKED) return "#3a3228";
  const bare = kind === TILE_ROAD || scrap;
  const fill = bare ? "#6b5840" : kind === TILE_TREE ? "#314628" : "#3e5232";
  return shade(fill, elevShadeFactor(heightAt(map, tx, ty)));
}

function hash2(tx: number, ty: number, salt: number): number {
  return (Math.imul(tx * 374761393 + ty * 668265263 + salt, 1103515245) >>> 0);
}

function waterPattern(ctx: CanvasRenderingContext2D, frame = 0): CanvasPattern | null {
  const img = frame === 1 ? WATER_TEX_B : WATER_TEX;
  if (!img.complete || img.naturalWidth <= 0) return null;
  return ctx.createPattern(img, "repeat");
}

const texPatFor = new WeakMap<CanvasRenderingContext2D, Map<HTMLImageElement, CanvasPattern>>();

function texPattern(ctx: CanvasRenderingContext2D, img: HTMLImageElement): CanvasPattern | null {
  if (!img.complete || img.naturalWidth <= 0) return null;
  let bag = texPatFor.get(ctx);
  if (!bag) {
    bag = new Map();
    texPatFor.set(ctx, bag);
  }
  const hit = bag.get(img);
  if (hit) return hit;
  const pat = ctx.createPattern(img, "repeat");
  if (pat) bag.set(img, pat);
  return pat;
}

/** One meadow, with a few broad drier or darker fields. Fine tiles stay the same photo. */
function surfaceImage(kind: number, tx: number, ty: number, scrap: boolean): HTMLImageElement | null {
  if (kind === TILE_BLOCKED || kind === TILE_WATER) return null;
  if (kind === TILE_ROAD || scrap) return DIRT_TEX;
  const meadow = GRASS_TEXS[0];
  if (!meadow) return null;
  const field = hash2(tx >> 6, ty >> 6, 5);
  if (field % 5 === 0) return GRASS_TEXS[1] ?? meadow;
  if (field % 8 === 0) return GRASS_TEXS[2] ?? meadow;
  return meadow;
}

function fillPatternInQuad(
  ctx: CanvasRenderingContext2D,
  n: IsoPt,
  e: IsoPt,
  s: IsoPt,
  w: IsoPt,
  pat: CanvasPattern,
  alpha: number,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(n.x, n.y);
  ctx.lineTo(e.x, e.y);
  ctx.lineTo(s.x, s.y);
  ctx.lineTo(w.x, w.y);
  ctx.closePath();
  ctx.clip();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = pat;
  const minX = Math.floor(Math.min(n.x, e.x, s.x, w.x));
  const minY = Math.floor(Math.min(n.y, e.y, s.y, w.y));
  const maxX = Math.ceil(Math.max(n.x, e.x, s.x, w.x));
  const maxY = Math.ceil(Math.max(n.y, e.y, s.y, w.y));
  ctx.fillRect(minX, minY, Math.max(1, maxX - minX), Math.max(1, maxY - minY));
  ctx.restore();
}

function paintWaterOverlay(
  ctx: CanvasRenderingContext2D,
  map: MapDef,
  tx: number,
  ty: number,
  originX: number,
  originY: number,
): void {
  const elev = map.heights;
  const d = tileDiamond(tx, ty, map.tileSize);
  const up = (p: IsoPt, z: number): IsoPt => {
    const q = bakePt(p, originX, originY);
    return { x: q.x, y: q.y - z };
  };
  const n = up(d.n, isoLift(vertexElev(elev, map.width, map.height, tx, ty)));
  const e = up(d.e, isoLift(vertexElev(elev, map.width, map.height, tx + 1, ty)));
  const s = up(d.s, isoLift(vertexElev(elev, map.width, map.height, tx + 1, ty + 1)));
  const w = up(d.w, isoLift(vertexElev(elev, map.width, map.height, tx, ty + 1)));
  const pat = waterPattern(ctx, 0);
  if (pat) fillPatternInQuad(ctx, ...expandQuad(n, e, s, w, 1.25), pat, 1);
}

function paintSurface(
  ctx: CanvasRenderingContext2D,
  map: MapDef,
  tx: number,
  ty: number,
  kind: number,
  scrap: boolean,
  originX: number,
  originY: number,
): void {
  const img = surfaceImage(kind, tx, ty, scrap);
  if (!img) return;
  const pat = texPattern(ctx, img);
  if (!pat) return;
  const elev = map.heights;
  const d = tileDiamond(tx, ty, map.tileSize);
  const up = (p: IsoPt, z: number): IsoPt => {
    const q = bakePt(p, originX, originY);
    return { x: q.x, y: q.y - z };
  };
  const n = up(d.n, isoLift(vertexElev(elev, map.width, map.height, tx, ty)));
  const e = up(d.e, isoLift(vertexElev(elev, map.width, map.height, tx + 1, ty)));
  const s = up(d.s, isoLift(vertexElev(elev, map.width, map.height, tx + 1, ty + 1)));
  const w = up(d.w, isoLift(vertexElev(elev, map.width, map.height, tx, ty + 1)));
  const alpha = kind === TILE_ROAD || scrap ? 0.92 : 0.84;
  fillPatternInQuad(ctx, ...expandQuad(n, e, s, w, TILE_OVERLAP_PX), pat, alpha);
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
  slopeTint = false,
  expandPx = TILE_OVERLAP_PX,
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
  const lo = Math.min(nH, eH, sH, wH);
  const hi = Math.max(nH, eH, sH, wH);
  if (slopeTint && hi - lo > 0.2 && fill.startsWith("#") && fill.length === 7) {
    const pts: [IsoPt, number][] = [
      [n, nH],
      [e, eH],
      [s, sH],
      [w, wH],
    ];
    const high = pts.reduce((a, b) => (b[1] > a[1] ? b : a));
    const low = pts.reduce((a, b) => (b[1] < a[1] ? b : a));
    const g = ctx.createLinearGradient(high[0].x, high[0].y, low[0].x, low[0].y);
    g.addColorStop(0, shade(fill, 1.1));
    g.addColorStop(1, shade(fill, 0.88));
    ctx.fillStyle = g;
  } else {
    ctx.fillStyle = fill;
  }
  fillQuad(ctx, ...expandQuad(n, e, s, w, expandPx));
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
    return;
  } else if (scrap) {
    const lift = isoLift(elev);
    const p = worldToIso((tx + 0.5) * ts, (ty + 0.55) * ts, ts);
    const x = p.x - originX;
    const y = p.y - originY - lift;
    const h = hash2(tx, ty, 3);
    const pile = SCRAP_FACES[h % SCRAP_FACES.length] ?? SCRAP_FACES[0];
    const drawn = pile ? drawPropSprite(ctx, pile, x, y, 12 + (h % 5), false) : false;
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

/** One decor sprite per neighborhood, chosen by the lowest hash so clumps do not stack. */
function spacedDecor(tx: number, ty: number, mod: number, salt: number, spacing: number): boolean {
  const h = hash2(tx, ty, salt);
  if (h % mod !== 0) return false;
  for (let dy = -spacing; dy <= spacing; dy++) {
    for (let dx = -spacing; dx <= spacing; dx++) {
      if (dx === 0 && dy === 0) continue;
      const n = hash2(tx + dx, ty + dy, salt);
      if (n % mod === 0 && n > h) return false;
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
  const bushHere = spacedDecor(tx, ty, 64, 29, 5);
  const tuftHere = !bushHere && spacedDecor(tx, ty, 17, 11, 2);
  if (!bushHere && !tuftHere) return;
  const faces: PropSprite[] = bushHere ? BUSH_FACES : TUFT_FACES;
  const ts = map.tileSize;
  const elev = heightAt(map, tx, ty);
  const lift = isoLift(elev);
  const h = hash2(tx, ty, bushHere ? 29 : 11);
  const jx = ((h >>> 8) % 9) * 0.06 - 0.24;
  const jy = ((h >>> 4) % 9) * 0.06 - 0.18;
  const p = worldToIso((tx + 0.5 + jx) * ts, (ty + 0.62 + jy) * ts, ts);
  const spr = faces[h % faces.length];
  if (!spr) return;
  const drawH = bushHere ? 18 + (h % 9) : 8 + (h % 6);
  drawPropSprite(ctx, spr, p.x - originX, p.y - originY - lift, drawH, false);
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
  expandPx = TILE_OVERLAP_PX,
): void {
  fillElevatedTile(ctx, map, tx, ty, fill, originX, originY, false, expandPx);
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
  fillElevatedTile(ctx, map, tx, ty, groundFill(map, tx, ty, kind, scrap), originX, originY, kind !== TILE_WATER);
  if (kind === TILE_WATER) paintWaterOverlay(ctx, map, tx, ty, originX, originY);
  else paintSurface(ctx, map, tx, ty, kind, scrap, originX, originY);
}

/** Blur radius that rounds a one-tile stair into a bank. */
const SHORE_BLUR = 10;

function shoreTouches(map: MapDef, indices: number[]): boolean {
  const w = map.width;
  const h = map.height;
  const tiles = map.tiles;
  for (const i of indices) {
    const x = i % w;
    const y = (i / w) | 0;
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        if (tiles[ny * w + nx] === TILE_WATER) return true;
      }
    }
  }
  return false;
}

function waterBodies(map: MapDef): number[][] {
  const w = map.width;
  const h = map.height;
  const tiles = map.tiles;
  const seen = new Uint8Array(tiles.length);
  const bodies: number[][] = [];
  const step: readonly [number, number][] = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  for (let i = 0; i < tiles.length; i++) {
    if (tiles[i] !== TILE_WATER || seen[i]) continue;
    const body: number[] = [];
    const q = [i];
    seen[i] = 1;
    for (let qi = 0; qi < q.length; qi++) {
      const c = q[qi]!;
      body.push(c);
      const x = c % w;
      const y = (c / w) | 0;
      for (const [dx, dy] of step) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const ni = ny * w + nx;
        if (seen[ni] || tiles[ni] !== TILE_WATER) continue;
        seen[ni] = 1;
        q.push(ni);
      }
    }
    bodies.push(body);
  }
  return bodies;
}

function rectsOverlap(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** Soft bank painted over the diamond water so the shore reads as a curve. */
function paintSmoothShores(
  ctx: CanvasRenderingContext2D,
  map: MapDef,
  originX: number,
  originY: number,
  clip?: { x: number; y: number; w: number; h: number },
): void {
  const atlasW = ctx.canvas.width;
  const atlasH = ctx.canvas.height;
  if (atlasW < 2 || atlasH < 2) return;
  const pad = (SHORE_BLUR + 4) * 3;
  const elev = map.heights;
  const mw = map.width;
  const mh = map.height;
  for (const body of waterBodies(map)) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const i of body) {
      const tx = i % mw;
      const ty = (i / mw) | 0;
      const d = tileDiamond(tx, ty, map.tileSize);
      const lift = isoLift(
        Math.max(
          vertexElev(elev, mw, mh, tx, ty),
          vertexElev(elev, mw, mh, tx + 1, ty),
          vertexElev(elev, mw, mh, tx + 1, ty + 1),
          vertexElev(elev, mw, mh, tx, ty + 1),
        ),
      );
      for (const p of [d.n, d.e, d.s, d.w]) {
        const q = bakePt(p, originX, originY);
        minX = Math.min(minX, q.x);
        maxX = Math.max(maxX, q.x);
        minY = Math.min(minY, q.y - lift);
        maxY = Math.max(maxY, q.y);
      }
    }
    const x0 = Math.max(0, Math.floor(minX - pad));
    const y0 = Math.max(0, Math.floor(minY - pad));
    const x1 = Math.min(atlasW, Math.ceil(maxX + pad));
    const y1 = Math.min(atlasH, Math.ceil(maxY + pad));
    const bw = x1 - x0;
    const bh = y1 - y0;
    if (bw < 2 || bh < 2) continue;
    const bounds = { x: x0, y: y0, w: bw, h: bh };
    if (clip && !rectsOverlap(bounds, clip)) continue;

    const mask = document.createElement("canvas");
    mask.width = bw;
    mask.height = bh;
    const mctx = mask.getContext("2d");
    if (!mctx) continue;
    const ox = originX + x0;
    const oy = originY + y0;
    for (const i of body) {
      fillElevatedTile(mctx, map, i % mw, (i / mw) | 0, "#ffffff", ox, oy, false, 1.2);
    }

    const soft = document.createElement("canvas");
    soft.width = bw;
    soft.height = bh;
    const sctx = soft.getContext("2d");
    if (!sctx) continue;
    sctx.filter = `blur(${SHORE_BLUR}px)`;
    sctx.drawImage(mask, 0, 0);
    sctx.filter = "none";
    const pix = sctx.getImageData(0, 0, bw, bh);
    const data = pix.data;
    for (let i = 0; i < data.length; i += 4) {
      const on = (data[i + 3] ?? 0) > 128;
      data[i] = on ? 255 : 0;
      data[i + 1] = on ? 255 : 0;
      data[i + 2] = on ? 255 : 0;
      data[i + 3] = on ? 255 : 0;
    }
    sctx.putImageData(pix, 0, 0);

    // Points of the diamond stair that fall outside the rounded bank.
    const tips = document.createElement("canvas");
    tips.width = bw;
    tips.height = bh;
    const tctx = tips.getContext("2d");
    if (!tctx) continue;
    tctx.drawImage(mask, 0, 0);
    tctx.globalCompositeOperation = "destination-out";
    tctx.drawImage(soft, 0, 0);
    tctx.globalCompositeOperation = "source-in";
    const grass = GRASS_TEXS[0];
    const gpat = grass ? texPattern(tctx, grass) : null;
    tctx.fillStyle = gpat ?? "#3e5232";
    tctx.fillRect(0, 0, bw, bh);

    const rim = document.createElement("canvas");
    rim.width = bw;
    rim.height = bh;
    const rctx = rim.getContext("2d");
    if (!rctx) continue;
    for (const [dx, dy] of [
      [3, 0],
      [-3, 0],
      [0, 3],
      [0, -3],
      [2, 2],
      [-2, 2],
      [2, -2],
      [-2, -2],
    ] as const) {
      rctx.drawImage(soft, dx, dy);
    }
    rctx.globalCompositeOperation = "source-in";
    rctx.fillStyle = "#6b5a42";
    rctx.fillRect(0, 0, bw, bh);
    rctx.globalCompositeOperation = "destination-out";
    rctx.drawImage(soft, 0, 0);

    const pond = document.createElement("canvas");
    pond.width = bw;
    pond.height = bh;
    const pctx = pond.getContext("2d");
    if (!pctx) continue;
    pctx.drawImage(soft, 0, 0);
    pctx.globalCompositeOperation = "source-in";
    pctx.fillStyle = "#1a4554";
    pctx.fillRect(0, 0, bw, bh);
    const pat = waterPattern(pctx, 0);
    if (pat) {
      pctx.globalAlpha = 0.92;
      pctx.fillStyle = pat;
      pctx.fillRect(0, 0, bw, bh);
    }

    ctx.save();
    if (clip) {
      ctx.beginPath();
      ctx.rect(clip.x, clip.y, clip.w, clip.h);
      ctx.clip();
    }
    ctx.drawImage(tips, x0, y0);
    ctx.drawImage(rim, x0, y0);
    ctx.drawImage(pond, x0, y0);
    ctx.restore();
  }
}

function paintTileStamp(
  ctx: CanvasRenderingContext2D,
  map: MapDef,
  indices: number[],
  scrap: Set<number>,
  originX: number,
  originY: number,
  shoreClip?: { x: number; y: number; w: number; h: number },
): void {
  const w = map.width;
  indices.sort((a, b) => (a % w) + ((a / w) | 0) - ((b % w) + ((b / w) | 0)));
  for (const i of indices) {
    paintGround(ctx, map, i % w, (i / w) | 0, scrap.has(i), originX, originY);
  }
  if (shoreClip) paintSmoothShores(ctx, map, originX, originY, shoreClip);
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
  paintSmoothShores(ctx, map, originX, originY);
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
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const i of indices) {
    const b = tileStampBounds(map, i % w, (i / w) | 0, bake.originX, bake.originY);
    ctx.clearRect(b.x, b.y, b.w, b.h);
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.w);
    maxY = Math.max(maxY, b.y + b.h);
  }
  const shoreClip = shoreTouches(map, indices)
    ? { x: minX, y: minY, w: Math.max(1, maxX - minX), h: Math.max(1, maxY - minY) }
    : undefined;
  paintTileStamp(
    ctx,
    map,
    expandIndices(map, indices, RESTAMP_RADIUS),
    packed,
    bake.originX,
    bake.originY,
    shoreClip,
  );
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
  const dirty: number[] = [];
  for (const i of prev) if (!next.has(i)) dirty.push(i);
  for (const i of next) if (!prev.has(i)) dirty.push(i);
  if (dirty.length === 0) {
    bake.scrap = next;
    return;
  }
  // Same clear+repaint path as felled trees: scrap sprites sit above the
  // diamond, so overpainting ground leaves outline pixels behind.
  restampTiles(bake, map, dirty, scrapCells);
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
  if (kind === TILE_TREE) return "#2a4a30";
  if (kind === TILE_ROAD) return "#8a7348";
  if (kind === TILE_FENCE) return "#6e5c3c";
  if (kind === TILE_BLOCKED) return "#3a2a22";
  if (scrap) return "#6a5428";
  const span = Math.max(1, HEIGHT_MAX - HEIGHT_BASE);
  const u = (heightAt(map, tx, ty) - HEIGHT_BASE) / span;
  if (u >= 0.75) return "#5a6a3c";
  if (u >= 0.35) return "#4a5a32";
  if (u > 0.08) return "#3a4c2c";
  if (u < -0.45) return "#243428";
  if (u < -0.08) return "#2c3c28";
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
