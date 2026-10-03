/**
 * Great Wall: a broad stone rampart drawn in the wall's own frame, so it
 * matches the sim box at any facing. `along` runs down the wall, `across` is
 * the look direction. The top is one flat level (the highest ground under the
 * section plus the rampart), so infantry standing on it share that level.
 */

import { ISO_ELEVATION } from "@gridlock/shared";

/** Rampart height in screen pixels at zoom 1. About half a standing soldier. */
export const RAMPART_LIFT_PX = 14;
/** Parapet merlon height above the walkway, in screen pixels at zoom 1. */
const MERLON_PX = 5;
/** Parapet depth across the top, in world units. */
const PARAPET_DEPTH = 3.5;

/** Terrain levels the walkway sits above the highest ground under it. */
export function rampartLevels(): number {
  return ISO_ELEVATION > 0 ? RAMPART_LIFT_PX / ISO_ELEVATION : 0;
}

/** Walkway level: the highest ground under the section, plus the rampart. */
export function rampartTopElev(grounds: readonly number[]): number {
  let m = Number.NEGATIVE_INFINITY;
  for (const g of grounds) if (g > m) m = g;
  if (!Number.isFinite(m)) m = 0;
  return m + rampartLevels();
}

export interface RampartBox {
  x: number;
  y: number;
  facing: number;
  length: number;
  thick: number;
  top: number;
}

/** True when a world point is on the walkway of this section. */
export function onRampart(box: RampartBox, wx: number, wy: number): boolean {
  const dx = wx - box.x;
  const dy = wy - box.y;
  const along = dx * -Math.sin(box.facing) + dy * Math.cos(box.facing);
  const across = dx * Math.cos(box.facing) + dy * Math.sin(box.facing);
  return Math.abs(along) <= box.length / 2 && Math.abs(across) <= box.thick / 2;
}

export interface GreatWallDraw {
  x: number;
  y: number;
  facing: number;
  length: number;
  thick: number;
  /** 0 intact, 1 about to fall. Cracks only. */
  hurt: number;
  seed: number;
  alpha: number;
  /** Ghost on a spot the engineer cannot use. */
  bad?: boolean;
  /** Terrain level under a world point. */
  ground: (wx: number, wy: number) => number;
  /** Walkway level. */
  top: number;
  project: (wx: number, wy: number, elev: number) => { x: number; y: number };
}

type Pt = { x: number; y: number };

function shade(rgb: readonly [number, number, number], k: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${c(rgb[0])},${c(rgb[1])},${c(rgb[2])})`;
}

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LIT = { x: Math.cos((9 * Math.PI) / 8), y: Math.sin((9 * Math.PI) / 8) };

export function drawGreatWall(ctx: CanvasRenderingContext2D, d: GreatWallDraw): void {
  const fx = Math.cos(d.facing);
  const fy = Math.sin(d.facing);
  const tx = -fy;
  const ty = fx;
  const world = (along: number, across: number) => ({
    x: d.x + tx * along + fx * across,
    y: d.y + ty * along + fy * across,
  });
  const stone: [number, number, number] = d.bad ? [176, 72, 58] : [156, 142, 116];
  const line = "rgba(28,22,16,0.75)";
  const merlonLevels = ISO_ELEVATION > 0 ? MERLON_PX / ISO_ELEVATION : 0;

  ctx.save();
  ctx.globalAlpha = d.alpha;
  ctx.lineJoin = "round";
  ctx.lineWidth = 0.9;

  const poly = (pts: Pt[], fill: string): void => {
    ctx.beginPath();
    pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = line;
    ctx.stroke();
  };

  /**
   * One block in the wall frame. `floor` null hangs the bottom on the terrain;
   * otherwise it sits on that level. Faces paint back to front, then the top.
   */
  const block = (a0: number, a1: number, c0: number, c1: number, floor: number | null, roof: number, tone: number): void => {
    const corners: [number, number][] = [
      [a0, c0],
      [a1, c0],
      [a1, c1],
      [a0, c1],
    ];
    const faces: { depth: number; pts: Pt[]; k: number }[] = [];
    for (let i = 0; i < 4; i++) {
      const [pa, pc] = corners[i]!;
      const [qa, qc] = corners[(i + 1) % 4]!;
      const p = world(pa, pc);
      const q = world(qa, qc);
      const pb = floor ?? d.ground(p.x, p.y);
      const qb = floor ?? d.ground(q.x, q.y);
      // Outward normal of this edge, for a little light on the stone.
      const mx = (pa + qa) / 2;
      const mc = (pc + qc) / 2;
      const na = mx === a0 ? -1 : mx === a1 ? 1 : 0;
      const nc = mc === c0 ? -1 : mc === c1 ? 1 : 0;
      const nx = tx * na + fx * nc;
      const ny = ty * na + fy * nc;
      const lit = nx * LIT.x + ny * LIT.y;
      faces.push({
        depth: (p.x + q.x + p.y + q.y) / 2,
        pts: [d.project(p.x, p.y, pb), d.project(q.x, q.y, qb), d.project(q.x, q.y, roof), d.project(p.x, p.y, roof)],
        k: tone * (0.72 + 0.16 * lit),
      });
    }
    faces.sort((a, b) => a.depth - b.depth);
    for (const f of faces) poly(f.pts, shade(stone, f.k));
    poly(
      corners.map(([a, c]) => {
        const w = world(a, c);
        return d.project(w.x, w.y, roof);
      }),
      shade(stone, tone * 1.04),
    );
  };

  const hl = d.length / 2;
  const ht = d.thick / 2;
  block(-hl, hl, -ht, ht, null, d.top, 1);

  // Paving joints across the walkway.
  const rand = mulberry(d.seed);
  ctx.strokeStyle = "rgba(60,50,36,0.45)";
  ctx.lineWidth = 0.7;
  const inner = ht - PARAPET_DEPTH;
  const slabs = Math.max(2, Math.round(d.length / 8));
  for (let i = 1; i < slabs; i++) {
    const a = -hl + (d.length * i) / slabs;
    const p = world(a, -inner);
    const q = world(a, inner);
    const sp = d.project(p.x, p.y, d.top);
    const sq = d.project(q.x, q.y, d.top);
    ctx.beginPath();
    ctx.moveTo(sp.x, sp.y);
    ctx.lineTo(sq.x, sq.y);
    ctx.stroke();
  }
  const mid0 = d.project(world(-hl, 0).x, world(-hl, 0).y, d.top);
  const mid1 = d.project(world(hl, 0).x, world(hl, 0).y, d.top);
  ctx.beginPath();
  ctx.moveTo(mid0.x, mid0.y);
  ctx.lineTo(mid1.x, mid1.y);
  ctx.stroke();

  // Cracks on a battered section.
  if (d.hurt > 0.05) {
    ctx.strokeStyle = "rgba(30,24,18,0.8)";
    ctx.lineWidth = 0.9;
    const n = Math.ceil(d.hurt * 6);
    for (let i = 0; i < n; i++) {
      const a = (rand() - 0.5) * d.length * 0.9;
      const c = (rand() - 0.5) * d.thick * 0.7;
      let w = world(a, c);
      let s = d.project(w.x, w.y, d.top);
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      for (let k = 0; k < 3; k++) {
        w = world(a + (rand() - 0.5) * 8, c + (rand() - 0.5) * 8);
        s = d.project(w.x, w.y, d.top);
        ctx.lineTo(s.x, s.y);
      }
      ctx.stroke();
    }
  }

  // Merlons along both long edges: far parapet first, near one last.
  const merlons = Math.max(3, Math.round(d.length / 7));
  const step = d.length / merlons;
  const edges = [-1, 1]
    .map((side) => {
      const w = world(0, side * ht);
      return { side, depth: w.x + w.y };
    })
    .sort((a, b) => a.depth - b.depth);
  for (const { side } of edges) {
    const c0 = side < 0 ? -ht : ht - PARAPET_DEPTH;
    const c1 = side < 0 ? -ht + PARAPET_DEPTH : ht;
    const order = [...Array(merlons).keys()]
      .map((i) => {
        const a = -hl + step * (i + 0.5);
        const w = world(a, 0);
        return { a, depth: w.x + w.y };
      })
      .sort((p, q) => p.depth - q.depth);
    for (const { a } of order) {
      block(a - step * 0.3, a + step * 0.3, c0, c1, d.top, d.top + merlonLevels, 0.96);
    }
  }
  ctx.restore();
}
