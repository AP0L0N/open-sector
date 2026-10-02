/**
 * Concrete field wall with barbed wire, drawn in the wall's own frame so it
 * matches the sim box at any facing. `along` runs down the wall, `across` is
 * the look direction. The slab top is one level across a connected run; the
 * bottom follows the ground under each corner.
 */

export interface WallDraw {
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
  /** Terrain level of the slab top for this connected run. */
  topElev: number;
  /** Screen pixels per terrain level. */
  levelPx: number;
  /** Screen pixels per world unit, for the wire above the slab. */
  worldPx: number;
  project: (wx: number, wy: number, elev: number) => { x: number; y: number };
  /** Ends buried in a neighboring section. Those faces are not drawn. */
  seal?: { neg: boolean; pos: boolean };
}

export interface WallSeg {
  x: number;
  y: number;
  length: number;
}

/** Neighboring sections share a top when their ends meet. */
export function wallSectionsConnect(a: WallSeg, b: WallSeg): boolean {
  const reach = Math.max(a.length, b.length) + 4;
  const d = Math.hypot(a.x - b.x, a.y - b.y);
  return d > 0.5 && d <= reach;
}

/**
 * Ends that butt into another section. Those caps are inside the run, so the
 * slab draws through them instead of painting a joint.
 */
export function wallEndSeal(
  section: { x: number; y: number; facing: number; length: number; thick: number },
  others: readonly { x: number; y: number }[],
): { neg: boolean; pos: boolean } {
  const tx = -Math.sin(section.facing);
  const ty = Math.cos(section.facing);
  const fx = Math.cos(section.facing);
  const fy = Math.sin(section.facing);
  let neg = false;
  let pos = false;
  for (const o of others) {
    const dx = o.x - section.x;
    const dy = o.y - section.y;
    const along = dx * tx + dy * ty;
    const across = dx * fx + dy * fy;
    if (Math.abs(across) > section.thick) continue;
    if (Math.abs(Math.abs(along) - section.length) > 4) continue;
    if (along > 0) pos = true;
    else if (along < 0) neg = true;
  }
  return { neg, pos };
}

/** Slab top: the highest ground under the run, plus the slab. */
export function wallTopElev(grounds: readonly number[], slabLevels: number): number {
  let m = Number.NEGATIVE_INFINITY;
  for (const g of grounds) if (g > m) m = g;
  if (!Number.isFinite(m)) m = 0;
  return m + Math.max(0, slabLevels);
}

/** Slab height in world units. About chest-high on a standing soldier. */
export const WALL_SLAB_H = 15;
/** Barbed wire above the slab, in world units. */
export const WALL_WIRE_H = 5.5;

/** Two posts per section, inset so neighboring sections meet without a double post. */
export function wallPostAlong(length: number): number[] {
  return [-length / 4, length / 4];
}

function rgb(r: number, g: number, b: number, k: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${c(r)},${c(g)},${c(b)})`;
}

const LIT = { x: Math.cos((9 * Math.PI) / 8), y: Math.sin((9 * Math.PI) / 8) };

export function drawWall(ctx: CanvasRenderingContext2D, d: WallDraw): void {
  const fx = Math.cos(d.facing);
  const fy = Math.sin(d.facing);
  const tx = -fy;
  const ty = fx;
  const world = (along: number, across: number) => ({
    x: d.x + tx * along + fx * across,
    y: d.y + ty * along + fy * across,
  });
  const slab = WALL_SLAB_H * (1 - d.hurt * 0.08);
  const fullLevels = d.levelPx > 0 ? (WALL_SLAB_H * d.worldPx) / d.levelPx : 0;
  const slabLevels = d.levelPx > 0 ? (slab * d.worldPx) / d.levelPx : 0;
  const top = d.topElev - (fullLevels - slabLevels);
  const at = (along: number, across: number, up: number) => {
    const w = world(along, across);
    const g = d.ground(w.x, w.y);
    let elev = g;
    if (up > 0 && slab > 0) {
      if (up >= slab) {
        const extra = d.levelPx > 0 ? ((up - slab) * d.worldPx) / d.levelPx : 0;
        elev = top + extra;
      } else {
        elev = g + (top - g) * (up / slab);
      }
    }
    if (elev < g) elev = g;
    return d.project(w.x, w.y, elev);
  };
  const base = d.bad ? [176, 72, 58] : [138, 140, 132];
  const [br, bg, bb] = base as [number, number, number];
  const o0 = d.project(d.x, d.y, 0);
  const o1 = d.project(d.x + 1, d.y, 0);
  const px = Math.hypot(o1.x - o0.x, o1.y - o0.y);
  const line = Math.max(0.6, Math.min(1.4, px * 0.45));
  const hl = d.length / 2;
  const ht = d.thick / 2;
  const seal = d.seal ?? { neg: false, pos: false };
  const tuck = Math.min(1.5, d.thick * 0.2);
  const alongNeg = -hl - (seal.neg ? tuck : 0);
  const alongPos = hl + (seal.pos ? tuck : 0);
  const corners: [number, number][] = [
    [alongNeg, -ht],
    [alongPos, -ht],
    [alongPos, ht],
    [alongNeg, ht],
  ];
  const lo = corners.map(([a, c]) => at(a, c, 0));
  const hi = corners.map(([a, c]) => at(a, c, slab));
  const light = (nx: number, ny: number) => 0.55 + 0.45 * Math.max(0, nx * LIT.x + ny * LIT.y);
  const cornerW = corners.map(([a, c]) => world(a, c));
  const faces = [
    { n: { x: -fx, y: -fy }, i: [0, 1] as [number, number], end: null },
    { n: { x: tx, y: ty }, i: [1, 2] as [number, number], end: "pos" as const },
    { n: { x: fx, y: fy }, i: [2, 3] as [number, number], end: null },
    { n: { x: -tx, y: -ty }, i: [3, 0] as [number, number], end: "neg" as const },
  ].filter((f) => (f.end === "pos" ? !seal.pos : f.end === "neg" ? !seal.neg : true));
  faces.sort((a, b) => {
    const depth = (f: { i: [number, number] }) => {
      const p = cornerW[f.i[0]]!;
      const q = cornerW[f.i[1]]!;
      return p.x + p.y + q.x + q.y;
    };
    return depth(a) - depth(b);
  });

  ctx.save();
  ctx.globalAlpha = d.alpha;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  const ground = [0, 1, 2, 3, 4, 5].map((k) => {
    const a = (k / 6) * Math.PI * 2;
    const wx = d.x + Math.cos(a) * hl * 0.92;
    const wy = d.y + Math.sin(a) * ht * 1.15;
    return d.project(wx, wy, d.ground(wx, wy));
  });
  ctx.fillStyle = d.bad ? "rgba(120, 40, 32, 0.35)" : "rgba(40, 42, 36, 0.28)";
  ctx.beginPath();
  ground.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.closePath();
  ctx.fill();

  const paint = (pts: { x: number; y: number }[], color: string) => {
    ctx.beginPath();
    pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    // Same color as the face, so the seam between polygons does not show the ground.
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.stroke();
  };
  for (const f of faces) {
    const [i0, i1] = f.i;
    paint(
      [lo[i0]!, lo[i1]!, hi[i1]!, hi[i0]!],
      rgb(br, bg, bb, light(f.n.x, f.n.y)),
    );
  }
  paint(hi, rgb(br, bg, bb, 1.12));

  if (d.hurt > 0.2) {
    ctx.strokeStyle = `rgba(42, 40, 36, ${0.35 + d.hurt * 0.45})`;
    ctx.lineWidth = line * 0.8;
    const crack = (a0: number, a1: number) => {
      ctx.beginPath();
      ctx.moveTo(at(a0, 0, slab * 0.72).x, at(a0, 0, slab * 0.72).y);
      ctx.lineTo(at((a0 + a1) / 2, ht * 0.2, slab * 0.4).x, at((a0 + a1) / 2, ht * 0.2, slab * 0.4).y);
      ctx.lineTo(at(a1, -ht * 0.15, slab * 0.15).x, at(a1, -ht * 0.15, slab * 0.15).y);
      ctx.stroke();
    };
    crack(-hl * 0.55, -hl * 0.05);
    if (d.hurt > 0.55) crack(hl * 0.1, hl * 0.62);
  }

  const posts = wallPostAlong(d.length);
  const wireY0 = slab + WALL_WIRE_H * 0.42;
  const wireY1 = slab + WALL_WIRE_H;
  const strand = (up: number, zig: number) => {
    ctx.beginPath();
    const steps = 8;
    for (let i = 0; i <= steps; i++) {
      const u = i / steps;
      const along = -hl + d.length * u;
      const across = (i % 2 === 0 ? -1 : 1) * ht * zig;
      const p = at(along, across, up);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
  };
  ctx.strokeStyle = d.bad ? "rgba(90, 36, 30, 0.95)" : "rgba(54, 58, 52, 0.95)";
  ctx.lineWidth = Math.max(0.8, line * 0.7);
  strand(wireY0, 0.15);
  strand(wireY1, 0.28);

  ctx.strokeStyle = d.bad ? "rgba(70, 28, 24, 0.9)" : "rgba(36, 38, 34, 0.9)";
  ctx.lineWidth = line * 1.15;
  for (const along of posts) {
    const foot = at(along, 0, slab);
    const top = at(along, 0, slab + WALL_WIRE_H);
    ctx.beginPath();
    ctx.moveTo(foot.x, foot.y);
    ctx.lineTo(top.x, top.y);
    ctx.stroke();
  }

  ctx.strokeStyle = d.bad ? "rgba(60, 24, 20, 0.85)" : "rgba(28, 30, 26, 0.85)";
  ctx.lineWidth = Math.max(0.6, line * 0.45);
  for (let i = 0; i < 8; i++) {
    const along = -hl + d.length * ((i + 0.5) / 8);
    const up = i % 2 === 0 ? wireY0 : wireY1;
    const a = at(along, -ht * 0.45, up);
    const b = at(along, ht * 0.45, up + 0.6);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  ctx.restore();
}
