/**
 * A fallen house: the rubble heap drawn where the building stood. The sim keeps the
 * footprint impassable but lets sight over it, so the drawing stays low: a dust floor,
 * broken wall stubs along the back edges, and fallen blocks and timbers inside the lot.
 * Every piece is laid out from the entity id so all clients draw the same heap.
 */

export interface RubblePiece {
  /** Center, world px from the footprint's north-west corner. */
  x: number;
  y: number;
  /** Half extents along world x and y. */
  hx: number;
  hy: number;
  /** Top of the piece, world px above the ground. */
  z: number;
  /** 0 = broken wall stub on a back edge, 1 = fallen block, 2 = fallen timber. */
  kind: 0 | 1 | 2;
  /** Brightness jitter, around 1. */
  tone: number;
}

export interface RubbleDraw {
  /** Footprint, world px. */
  x: number;
  y: number;
  w: number;
  h: number;
  tileSize: number;
  type: string;
  seed: number;
  alpha: number;
  /** World point `up` world units above the ground to screen. */
  project: (wx: number, wy: number, up: number) => { x: number; y: number };
}

/** Tallest piece of a heap as a share of a tile. Well under a crouched man. */
export const RUBBLE_MAX_RISE = 0.28;
/** Nothing is drawn closer than this to the footprint edge, as a share of a tile. */
export const RUBBLE_EDGE_PAD = 0.06;

function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

type Rgb = [number, number, number];

/** Wall and dust tones for a house type. Timbers are the same dark wood everywhere. */
export function rubblePalette(type: string): { wall: Rgb; accent: Rgb; dust: Rgb } {
  switch (type) {
    case "shack":
    case "barn":
    case "cottage":
      return { wall: [118, 90, 58], accent: [96, 70, 44], dust: [70, 58, 44] };
    case "chapel":
      return { wall: [138, 136, 128], accent: [112, 108, 100], dust: [78, 76, 70] };
    case "factory":
    case "warehouse":
    case "foundry":
    case "granary":
      return { wall: [128, 104, 92], accent: [142, 78, 60], dust: [72, 66, 62] };
    default:
      return { wall: [172, 156, 134], accent: [142, 78, 60], dust: [84, 78, 70] };
  }
}

const TIMBER: Rgb = [84, 62, 40];

function clampCenter(c: number, half: number, lo: number, hi: number): number {
  return Math.min(hi - half, Math.max(lo + half, c));
}

/** Lay out the heap for a `w`×`h` world px footprint. Every piece stays inside it. */
export function rubbleLayout(w: number, h: number, tileSize: number, seed: number): RubblePiece[] {
  const rand = rng(seed ^ 0x5eed1e);
  const ts = tileSize;
  const pad = ts * RUBBLE_EDGE_PAD;
  const pieces: RubblePiece[] = [];
  const stubThick = ts * 0.09;
  // Broken wall along the north edge, then the west edge: what is left standing of the back walls.
  const northStubs = Math.max(1, Math.round(w / ts));
  for (let i = 0; i < northStubs; i++) {
    const hx = ts * (0.14 + rand() * 0.2);
    const z = ts * (0.1 + rand() * (RUBBLE_MAX_RISE - 0.1));
    const slot = (w - pad * 2) / northStubs;
    const x = clampCenter(pad + slot * (i + 0.2 + rand() * 0.6), hx, pad, w - pad);
    pieces.push({ x, y: pad + stubThick, hx, hy: stubThick, z, kind: 0, tone: 0.9 + rand() * 0.2 });
  }
  const westStubs = Math.max(1, Math.round(h / ts));
  for (let i = 0; i < westStubs; i++) {
    const hy = ts * (0.14 + rand() * 0.2);
    const z = ts * (0.1 + rand() * (RUBBLE_MAX_RISE - 0.1));
    const slot = (h - pad * 2) / westStubs;
    const y = clampCenter(pad + slot * (i + 0.2 + rand() * 0.6), hy, pad, h - pad);
    pieces.push({ x: pad + stubThick, y, hx: stubThick, hy, z, kind: 0, tone: 0.9 + rand() * 0.2 });
  }
  // Fallen masonry across the lot.
  const blocks = Math.max(3, Math.round(((w * h) / (ts * ts)) * 1.6));
  for (let i = 0; i < blocks; i++) {
    const hx = ts * (0.06 + rand() * 0.1);
    const hy = ts * (0.06 + rand() * 0.1);
    const z = ts * (0.04 + rand() * 0.09);
    const x = clampCenter(pad + rand() * (w - pad * 2), hx, pad, w - pad);
    const y = clampCenter(pad + rand() * (h - pad * 2), hy, pad, h - pad);
    pieces.push({ x, y, hx, hy, z, kind: 1, tone: 0.85 + rand() * 0.3 });
  }
  // Two roof timbers down across the heap.
  for (let i = 0; i < 2; i++) {
    const alongX = rand() < 0.5;
    const len = ts * (0.3 + rand() * 0.25);
    const hx = alongX ? len : ts * 0.035;
    const hy = alongX ? ts * 0.035 : len;
    const x = clampCenter(pad + rand() * (w - pad * 2), hx, pad, w - pad);
    const y = clampCenter(pad + rand() * (h - pad * 2), hy, pad, h - pad);
    pieces.push({ x, y, hx, hy, z: ts * 0.06, kind: 2, tone: 0.9 + rand() * 0.2 });
  }
  // Painter's order: the far corner first, the near corner last.
  pieces.sort((a, b) => a.x + a.y - (b.x + b.y));
  return pieces;
}

function shade(rgb: Rgb, k: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${c(rgb[0])}, ${c(rgb[1])}, ${c(rgb[2])})`;
}

function poly(ctx: CanvasRenderingContext2D, pts: { x: number; y: number }[]): void {
  ctx.beginPath();
  ctx.moveTo(pts[0]!.x, pts[0]!.y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]!.x, pts[i]!.y);
  ctx.closePath();
}

export function drawRubble(ctx: CanvasRenderingContext2D, d: RubbleDraw): void {
  const pal = rubblePalette(d.type);
  const ts = d.tileSize;
  const pad = ts * RUBBLE_EDGE_PAD;
  const world = (px: number, py: number, up: number) => d.project(d.x + px, d.y + py, up);
  const o0 = d.project(d.x, d.y, 0);
  const o1 = d.project(d.x + 1, d.y, 0);
  const px = Math.hypot(o1.x - o0.x, o1.y - o0.y);
  const line = Math.max(0.35, Math.min(0.9, px * 0.3));
  ctx.save();
  ctx.globalAlpha = d.alpha;
  ctx.lineJoin = "round";
  ctx.lineWidth = line;

  // Dust and ash over the whole lot, a little short of the footprint edge.
  const [dr, dg, db] = pal.dust;
  ctx.fillStyle = `rgba(${dr}, ${dg}, ${db}, 0.55)`;
  poly(ctx, [world(pad, pad, 0), world(d.w - pad, pad, 0), world(d.w - pad, d.h - pad, 0), world(pad, d.h - pad, 0)]);
  ctx.fill();
  // Scorched patches where the heap burned.
  const rand = rng(d.seed ^ 0x9e3779b9);
  ctx.fillStyle = `rgba(${Math.round(dr * 0.5)}, ${Math.round(dg * 0.5)}, ${Math.round(db * 0.5)}, 0.28)`;
  for (let i = 0; i < 3; i++) {
    const cx = pad + ts * 0.3 + rand() * Math.max(0, d.w - pad * 2 - ts * 0.6);
    const cy = pad + ts * 0.3 + rand() * Math.max(0, d.h - pad * 2 - ts * 0.6);
    const r = ts * (0.12 + rand() * 0.16);
    const pts = [0, 1, 2, 3, 4, 5].map((k) => {
      const a = (k / 6) * Math.PI * 2;
      const rr = r * (0.7 + rand() * 0.5);
      return world(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, 0);
    });
    poly(ctx, pts);
    ctx.fill();
  }

  ctx.strokeStyle = "rgba(20, 16, 12, 0.55)";
  for (const p of rubbleLayout(d.w, d.h, ts, d.seed)) {
    const base: Rgb = p.kind === 2 ? TIMBER : p.kind === 1 && p.tone > 1.05 ? pal.accent : pal.wall;
    const x0 = p.x - p.hx;
    const x1 = p.x + p.hx;
    const y0 = p.y - p.hy;
    const y1 = p.y + p.hy;
    const aT = world(x0, y0, p.z);
    const bT = world(x1, y0, p.z);
    const cT = world(x1, y1, p.z);
    const dT = world(x0, y1, p.z);
    const c0 = world(x1, y1, 0);
    const b0 = world(x1, y0, 0);
    const d0 = world(x0, y1, 0);
    // South face, then east face, then the top: the two faces the camera sees, lit from the north-west.
    ctx.fillStyle = shade(base, p.tone * 0.62);
    poly(ctx, [dT, cT, c0, d0]);
    ctx.fill();
    ctx.fillStyle = shade(base, p.tone * 0.8);
    poly(ctx, [bT, cT, c0, b0]);
    ctx.fill();
    ctx.fillStyle = shade(base, p.tone);
    poly(ctx, [aT, bT, cT, dT]);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}
