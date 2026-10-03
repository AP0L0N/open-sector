/**
 * Sandbag wall, drawn bag by bag in the wall's own frame so it matches the sim box at any facing.
 * `along` runs down the wall, `across` is the look direction, `up` is world units above the ground.
 * Where a line turns, the section at the end of the old leg piles bags into the outer
 * angle of the corner so the two legs read as one wall.
 */

import type { WallJoins } from "./wall.js";

export interface Bag {
  along: number;
  across: number;
  /** Half extents in the wall frame. */
  halfAlong: number;
  halfAcross: number;
  z0: number;
  z1: number;
  /** Small yaw off the wall line, radians. Ruins only. */
  yaw: number;
  /** Brightness jitter, around 1. */
  tone: number;
}

export interface SandbagDraw {
  x: number;
  y: number;
  facing: number;
  length: number;
  thick: number;
  ruined: boolean;
  seed: number;
  alpha: number;
  /** Ghost on a spot the engineer cannot use. */
  bad?: boolean;
  /** World point plus height to screen. */
  project: (wx: number, wy: number, up: number) => { x: number; y: number };
  /** What each end meets. A corner gets bags piled into its outer angle. */
  joins?: WallJoins;
}

/** Gap between bags as a share of wall thickness. */
const GAP = 0.032;
/** Ground-plane direction the lit bag faces point toward (WNW). */
const LIT = { x: Math.cos((9 * Math.PI) / 8), y: Math.sin((9 * Math.PI) / 8) };

function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Course height as a share of wall thickness. Three courses is about waist high on a crouched man. */
export function courseHeight(thick: number): number {
  return thick * 0.34;
}

/**
 * Stretcher bond: two rows of four on the ground, two staggered rows of three,
 * one row of three on top. Every bag stays inside the length × thick footprint.
 */
export function sandbagLayout(length: number, thick: number, ruined: boolean, seed: number): Bag[] {
  const rand = rng(seed);
  const h = courseHeight(thick);
  const gap = thick * GAP;
  const bagLen = length / 4;
  const out: Bag[] = [];
  const push = (along: number, across: number, halfAcross: number, course: number, yaw = 0, squash = 1) => {
    out.push({
      along,
      across,
      halfAlong: bagLen / 2 - gap,
      halfAcross: halfAcross - gap,
      z0: course * h * squash,
      z1: (course + 1) * h * squash + h * 0.12,
      yaw,
      tone: 0.93 + rand() * 0.12,
    });
  };
  const row = thick / 4;
  if (ruined) {
    const keep = [0, 1, 2, 3, 4, 5, 6, 7].filter(() => rand() > 0.3);
    for (const i of keep) {
      const slot = i % 4;
      const side = i < 4 ? -row : row;
      const along = (slot - 1.5) * bagLen + (rand() - 0.5) * bagLen * 0.35;
      const across = side + (rand() - 0.5) * row * 0.6;
      push(clampAlong(along, length, bagLen), clampAcross(across, thick, row), row, 0, (rand() - 0.5) * 0.7, 0.55);
    }
    return out;
  }
  for (const side of [-row, row]) {
    for (let i = 0; i < 4; i++) push((i - 1.5) * bagLen, side, row, 0);
  }
  for (const side of [-row, row]) {
    for (let i = 0; i < 3; i++) push((i - 1) * bagLen, side, row, 1);
  }
  for (let i = 0; i < 3; i++) push((i - 1) * bagLen, 0, row * 1.15, 2);
  return out;
}

/**
 * Bags for the outer angle where this section's `sign` end turns into the next leg.
 * The uncovered ground is the triangle between this section's cap, the next leg's
 * cap, and the outer flank running from this section's outer end corner to the
 * next leg's outer start corner (`outer` and `inner` are that cap, as world
 * offsets from this section's centre). One bag per course sits on it, turned to
 * the bisector of the bend. A straight joint and a right angle leave no triangle.
 */
export function cornerBags(
  length: number,
  thick: number,
  facing: number,
  sign: 1 | -1,
  outer: { x: number; y: number },
  inner: { x: number; y: number },
  outerSide: 1 | -1,
  seed: number,
): Bag[] {
  const ux = -Math.sin(facing);
  const uy = Math.cos(facing);
  const fx = Math.cos(facing);
  const fy = Math.sin(facing);
  const hl = length / 2;
  const ht = thick / 2;
  // This section's outer end corner, and the point where its cap meets the next leg's cap.
  const mx = ux * sign * hl + fx * outerSide * ht;
  const my = uy * sign * hl + fy * outerSide * ht;
  const ex = ux * sign * hl;
  const ey = uy * sign * hl;
  const cx = outer.x - inner.x;
  const cy = outer.y - inner.y;
  const den = fx * cy - fy * cx;
  if (Math.abs(den) < 1e-6) return [];
  const s = ((inner.x - ex) * cy - (inner.y - ey) * cx) / den;
  const xx = ex + fx * s;
  const xy = ey + fy * s;
  const area = Math.abs((outer.x - mx) * (xy - my) - (outer.y - my) * (xx - mx)) / 2;
  if (area < thick * thick * 0.03) return [];
  const rand = rng(seed ^ 0x51ed270b);
  const h = courseHeight(thick);
  const bagLen = length / 4;
  const row = thick / 4;
  // The pile sits on the triangle, nudged a touch outward so the corner reads as rounded.
  const px = (mx + outer.x + xx) / 3 + fx * outerSide * row * 0.3;
  const py = (my + outer.y + xy) / 3 + fy * outerSide * row * 0.3;
  const along = px * ux + py * uy;
  const across = px * fx + py * fy;
  const gx = outer.x - mx;
  const gy = outer.y - my;
  const gap = Math.hypot(gx, gy) || 1;
  const bx = ux * sign + gx / gap;
  const by = uy * sign + gy / gap;
  const yaw = Math.atan2(bx * fx + by * fy, bx * ux + by * uy);
  const out: Bag[] = [];
  for (let course = 0; course < 3; course++) {
    const squeeze = course === 2 ? 0.8 : 1;
    out.push({
      along: along + (rand() - 0.5) * 0.6,
      across: across + (rand() - 0.5) * 0.5,
      halfAlong: (bagLen / 2) * 0.9 * squeeze,
      halfAcross: row * squeeze,
      z0: course * h,
      z1: (course + 1) * h + h * 0.12,
      yaw,
      tone: 0.93 + rand() * 0.12,
    });
  }
  return out;
}

function clampAlong(v: number, length: number, bagLen: number): number {
  const lim = length / 2 - bagLen / 2;
  return Math.max(-lim, Math.min(lim, v));
}

function clampAcross(v: number, thick: number, row: number): number {
  const lim = thick / 2 - row;
  return Math.max(-lim, Math.min(lim, v));
}

type Pt = { x: number; y: number };

function rgb(r: number, g: number, b: number, k: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${c(r)},${c(g)},${c(b)})`;
}

/** Closed path through edge midpoints with corners as controls: a pillow instead of a box. */
function softPath(ctx: CanvasRenderingContext2D, pts: Pt[]): void {
  const n = pts.length;
  const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const start = mid(pts[n - 1]!, pts[0]!);
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  for (let i = 0; i < n; i++) {
    const c = pts[i]!;
    const m = mid(c, pts[(i + 1) % n]!);
    ctx.quadraticCurveTo(c.x, c.y, m.x, m.y);
  }
  ctx.closePath();
}

function hull(points: Pt[]): Pt[] {
  const p = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (p.length < 3) return p;
  const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Pt[] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: Pt[] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, q) <= 0) upper.pop();
    upper.push(q);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

export function drawSandbags(ctx: CanvasRenderingContext2D, d: SandbagDraw): void {
  const fx = Math.cos(d.facing);
  const fy = Math.sin(d.facing);
  const tx = -fy;
  const ty = fx;
  const world = (along: number, across: number) => ({
    x: d.x + tx * along + fx * across,
    y: d.y + ty * along + fy * across,
  });
  const base = d.bad ? [196, 74, 58] : [142, 118, 78];
  const [br, bg, bb] = base as [number, number, number];
  const bags = sandbagLayout(d.length, d.thick, d.ruined, d.seed);
  if (!d.ruined && d.joins) {
    for (const sign of [1, -1] as const) {
      const end = sign > 0 ? d.joins.pos : d.joins.neg;
      if (!end || end.kind !== "corner") continue;
      const outer = { x: end.outer.x - d.x, y: end.outer.y - d.y };
      const inner = { x: end.inner.x - d.x, y: end.inner.y - d.y };
      bags.push(...cornerBags(d.length, d.thick, d.facing, sign, outer, inner, end.outerSide, d.seed + sign));
    }
  }
  const o0 = d.project(d.x, d.y, 0);
  const o1 = d.project(d.x + 1, d.y, 0);
  const px = Math.hypot(o1.x - o0.x, o1.y - o0.y);
  const line = Math.max(0.35, Math.min(0.9, px * 0.3));
  const h = courseHeight(d.thick);
  ctx.save();
  ctx.globalAlpha = d.alpha;
  ctx.lineJoin = "round";

  if (d.ruined) {
    const rand = rng(d.seed ^ 0x9e3779b9);
    ctx.fillStyle = d.bad ? "rgba(170, 70, 50, 0.5)" : "rgba(120, 98, 62, 0.55)";
    for (let i = 0; i < 4; i++) {
      const c = world((rand() - 0.5) * d.length * 0.9, (rand() - 0.5) * d.thick * 1.6);
      const r = d.thick * (0.14 + rand() * 0.22);
      const pts = [0, 1, 2, 3, 4, 5].map((k) => {
        const a = (k / 6) * Math.PI * 2;
        return d.project(c.x + Math.cos(a) * r * 1.4, c.y + Math.sin(a) * r, 0);
      });
      softPath(ctx, pts);
      ctx.fill();
    }
  }

  const order = bags
    .map((b) => {
      const c = world(b.along, b.across);
      return { b, depth: c.x + c.y, course: Math.round(b.z0 / Math.max(0.001, h)) };
    })
    .sort((p, q) => p.course - q.course || p.depth - q.depth);

  const light = (nx: number, ny: number) => 0.62 + 0.38 * Math.max(0, nx * LIT.x + ny * LIT.y);
  for (const { b } of order) {
    const cy = Math.cos(b.yaw);
    const sy = Math.sin(b.yaw);
    const corner = (sa: number, sc: number, up: number) => {
      const la = sa * b.halfAlong * cy - sc * b.halfAcross * sy;
      const lc = sa * b.halfAlong * sy + sc * b.halfAcross * cy;
      const w = world(b.along + la, b.across + lc);
      return d.project(w.x, w.y, up);
    };
    const signs: [number, number][] = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ];
    const lo = signs.map(([a, c]) => corner(a, c, b.z0));
    const hi = signs.map(([a, c]) => corner(a, c, b.z1));
    const sil = hull([...lo, ...hi]);
    const bagT = { x: tx * cy + fx * sy, y: ty * cy + fy * sy };
    const bagF = { x: -tx * sy + fx * cy, y: -ty * sy + fy * cy };
    const faces = [
      { n: { x: -bagF.x, y: -bagF.y }, i: [0, 1] },
      { n: bagT, i: [1, 2] },
      { n: bagF, i: [2, 3] },
      { n: { x: -bagT.x, y: -bagT.y }, i: [3, 0] },
    ].filter((f) => f.n.x + f.n.y > 0);
    const k = b.tone * (d.ruined ? 0.82 : 1);

    const dim = faces.reduce((m, f) => Math.min(m, light(f.n.x, f.n.y)), 1);
    ctx.fillStyle = rgb(br, bg, bb, k * dim * 0.86);
    softPath(ctx, sil);
    ctx.fill();
    ctx.save();
    softPath(ctx, sil);
    ctx.clip();
    for (const f of faces) {
      const [i0, i1] = f.i as [number, number];
      ctx.fillStyle = rgb(br, bg, bb, k * light(f.n.x, f.n.y) * 0.88);
      ctx.beginPath();
      ctx.moveTo(lo[i0]!.x, lo[i0]!.y);
      ctx.lineTo(lo[i1]!.x, lo[i1]!.y);
      ctx.lineTo(hi[i1]!.x, hi[i1]!.y);
      ctx.lineTo(hi[i0]!.x, hi[i0]!.y);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    ctx.fillStyle = rgb(br, bg, bb, k * 1.1);
    softPath(ctx, hi);
    ctx.fill();

    const seamA = corner(0.62, -0.8, b.z1);
    const seamB = corner(0.62, 0.8, b.z1);
    ctx.strokeStyle = rgb(br, bg, bb, k * 0.7);
    ctx.lineWidth = line * 0.85;
    ctx.beginPath();
    ctx.moveTo(seamA.x, seamA.y);
    ctx.lineTo(seamB.x, seamB.y);
    ctx.stroke();

    const glintA = corner(-0.55, -0.35, b.z1);
    const glintB = corner(0.35, -0.35, b.z1);
    ctx.strokeStyle = `rgba(255, 240, 200, ${d.ruined ? 0.12 : 0.22})`;
    ctx.beginPath();
    ctx.moveTo(glintA.x, glintA.y);
    ctx.lineTo(glintB.x, glintB.y);
    ctx.stroke();

    ctx.strokeStyle = "rgba(40, 28, 14, 0.85)";
    ctx.lineWidth = line;
    softPath(ctx, sil);
    ctx.stroke();
  }
  ctx.restore();
}
