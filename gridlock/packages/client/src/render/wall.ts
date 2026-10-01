/**
 * Concrete field wall with barbed wire, drawn in the wall's own frame so it
 * matches the sim box at any facing. `along` runs down the wall, `across` is
 * the look direction, `up` is world units above the ground.
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
  project: (wx: number, wy: number, up: number) => { x: number; y: number };
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
  const at = (along: number, across: number, up: number) => {
    const w = world(along, across);
    return d.project(w.x, w.y, up);
  };
  const base = d.bad ? [176, 72, 58] : [138, 140, 132];
  const [br, bg, bb] = base as [number, number, number];
  const o0 = d.project(d.x, d.y, 0);
  const o1 = d.project(d.x + 1, d.y, 0);
  const px = Math.hypot(o1.x - o0.x, o1.y - o0.y);
  const line = Math.max(0.6, Math.min(1.4, px * 0.45));
  const hl = d.length / 2;
  const ht = d.thick / 2;
  const slab = WALL_SLAB_H * (1 - d.hurt * 0.08);
  const signs: [number, number][] = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ];
  const lo = signs.map(([a, c]) => at(a * hl, c * ht, 0));
  const hi = signs.map(([a, c]) => at(a * hl, c * ht, slab));
  const light = (nx: number, ny: number) => 0.55 + 0.45 * Math.max(0, nx * LIT.x + ny * LIT.y);
  const faces = [
    { n: { x: -fx, y: -fy }, i: [0, 1] },
    { n: { x: tx, y: ty }, i: [1, 2] },
    { n: { x: fx, y: fy }, i: [2, 3] },
    { n: { x: -tx, y: -ty }, i: [3, 0] },
  ].filter((f) => f.n.x + f.n.y > 0);

  ctx.save();
  ctx.globalAlpha = d.alpha;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  const ground = [0, 1, 2, 3, 4, 5].map((k) => {
    const a = (k / 6) * Math.PI * 2;
    return d.project(d.x + Math.cos(a) * hl * 0.92, d.y + Math.sin(a) * ht * 1.15, 0);
  });
  ctx.fillStyle = d.bad ? "rgba(120, 40, 32, 0.35)" : "rgba(40, 42, 36, 0.28)";
  ctx.beginPath();
  ground.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  lo.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  hi.forEach((p) => ctx.lineTo(p.x, p.y));
  ctx.closePath();
  ctx.fillStyle = rgb(br, bg, bb, 0.72);
  ctx.fill();

  for (const f of faces) {
    const [i0, i1] = f.i as [number, number];
    ctx.beginPath();
    ctx.moveTo(lo[i0]!.x, lo[i0]!.y);
    ctx.lineTo(lo[i1]!.x, lo[i1]!.y);
    ctx.lineTo(hi[i1]!.x, hi[i1]!.y);
    ctx.lineTo(hi[i0]!.x, hi[i0]!.y);
    ctx.closePath();
    ctx.fillStyle = rgb(br, bg, bb, light(f.n.x, f.n.y));
    ctx.fill();
  }
  ctx.beginPath();
  hi.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.closePath();
  ctx.fillStyle = rgb(br, bg, bb, 1.12);
  ctx.fill();

  ctx.strokeStyle = "rgba(48, 50, 44, 0.9)";
  ctx.lineWidth = line;
  ctx.beginPath();
  lo.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.closePath();
  hi.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.closePath();
  for (let i = 0; i < 4; i++) {
    ctx.moveTo(lo[i]!.x, lo[i]!.y);
    ctx.lineTo(hi[i]!.x, hi[i]!.y);
  }
  ctx.stroke();

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
