/**
 * One-man fighting trench, drawn in its own frame so it matches the sim box at any facing.
 * `along` runs down the slit, `across` is the look direction, `up` is world units above the ground.
 * The spoil is thrown forward into a parapet; a lower lip rims the back.
 */

export interface TrenchDraw {
  x: number;
  y: number;
  facing: number;
  length: number;
  thick: number;
  seed: number;
  alpha: number;
  /** Someone is in it: a helmet shows between the lips. */
  manned?: boolean;
  /** Occupant's side colour, for the helmet band. */
  bandColor?: string;
  /** Ghost on a spot the engineer cannot use. */
  bad?: boolean;
  /** World point plus height to screen. */
  project: (wx: number, wy: number, up: number) => { x: number; y: number };
}

type Pt = { x: number; y: number };

/** Slit half-width as a share of the footprint thickness. */
const SLIT = 0.22;
/** Parapet height, world units. Matches TRENCH_COVER_HEIGHT in spirit: waist-high on a crouched man. */
const FRONT_H = 2.4;
const BACK_H = 1.1;

function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function rgb(c: readonly [number, number, number], k: number): string {
  const v = (n: number) => Math.max(0, Math.min(255, Math.round(n * k)));
  return `rgb(${v(c[0])},${v(c[1])},${v(c[2])})`;
}

/** Closed path through edge midpoints with corners as controls: a mound instead of a box. */
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

export function drawTrench(ctx: CanvasRenderingContext2D, d: TrenchDraw): void {
  const fx = Math.cos(d.facing);
  const fy = Math.sin(d.facing);
  const tx = -fy;
  const ty = fx;
  const at = (along: number, across: number, up = 0) =>
    d.project(d.x + tx * along + fx * across, d.y + ty * along + fy * across, up);
  const earth: readonly [number, number, number] = d.bad ? [190, 78, 60] : [128, 102, 66];
  const pit: readonly [number, number, number] = d.bad ? [96, 30, 22] : [44, 32, 20];
  const half = d.length / 2;
  const slit = d.thick * SLIT;
  const o0 = d.project(d.x, d.y, 0);
  const o1 = d.project(d.x + 1, d.y, 0);
  const line = Math.max(0.35, Math.min(0.9, Math.hypot(o1.x - o0.x, o1.y - o0.y) * 0.3));
  const rand = rng(d.seed);

  ctx.save();
  ctx.globalAlpha = d.alpha;
  ctx.lineJoin = "round";

  // Trampled apron of loose spoil around the works.
  ctx.fillStyle = rgb(earth, 0.78);
  ctx.globalAlpha = d.alpha * 0.5;
  softPath(ctx, [at(-half - 1.5, -d.thick / 2), at(half + 1.5, -d.thick / 2), at(half + 2, d.thick / 2 + 1), at(-half - 2, d.thick / 2 + 1)]);
  ctx.fill();
  ctx.globalAlpha = d.alpha;

  // The slit itself, darker toward the back wall where the sun does not reach.
  const floor = [at(-half + 1.2, -slit), at(half - 1.2, -slit), at(half - 1.2, slit), at(-half + 1.2, slit)];
  ctx.fillStyle = rgb(pit, 1);
  softPath(ctx, floor);
  ctx.fill();
  ctx.fillStyle = rgb(pit, 1.6);
  softPath(ctx, [at(-half + 1.6, slit * 0.2), at(half - 1.6, slit * 0.2), at(half - 1.4, slit), at(-half + 1.4, slit)]);
  ctx.fill();

  const berm = (a0: number, a1: number, h: number, inset: number) => {
    const mid = (a0 + a1) / 2;
    const base = [at(-half + inset, a0), at(half - inset, a0), at(half - inset, a1), at(-half + inset, a1)];
    const ridge = [at(-half + inset + 1.5, mid, h), at(half - inset - 1.5, mid, h)];
    return { depth: mid, sil: hull([...base, ...ridge]), ridge, lip: at(0, a0, 0) };
  };
  const front = berm(slit, d.thick / 2, FRONT_H, 0);
  const back = berm(-d.thick / 2, -slit, BACK_H, 1);
  // Paint the far lip, then the man, then the near lip.
  const nearIsFront = fx + fy > 0;
  const far = nearIsFront ? back : front;
  const near = nearIsFront ? front : back;

  const paintBerm = (b: ReturnType<typeof berm>, k: number) => {
    ctx.fillStyle = rgb(earth, k * 0.86);
    softPath(ctx, b.sil);
    ctx.fill();
    ctx.strokeStyle = rgb(earth, k * 1.18);
    ctx.lineWidth = line * 1.6;
    ctx.beginPath();
    ctx.moveTo(b.ridge[0]!.x, b.ridge[0]!.y);
    ctx.lineTo(b.ridge[1]!.x, b.ridge[1]!.y);
    ctx.stroke();
    ctx.strokeStyle = "rgba(34, 24, 12, 0.8)";
    ctx.lineWidth = line;
    softPath(ctx, b.sil);
    ctx.stroke();
  };

  paintBerm(far, 0.92);

  if (d.manned) {
    const c = at(0, -slit * 0.1, 2);
    const r = Math.max(2, Math.hypot(at(2.3, 0).x - at(0, 0).x, at(2.3, 0).y - at(0, 0).y));
    ctx.fillStyle = "#3f4630";
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, r, r * 0.72, 0, Math.PI, 0);
    ctx.lineTo(c.x + r * 1.15, c.y);
    ctx.lineTo(c.x - r * 1.15, c.y);
    ctx.closePath();
    ctx.fill();
    if (d.bandColor) {
      ctx.strokeStyle = d.bandColor;
      ctx.lineWidth = Math.max(1, line * 1.4);
      ctx.beginPath();
      ctx.moveTo(c.x - r * 1.05, c.y - r * 0.12);
      ctx.lineTo(c.x + r * 1.05, c.y - r * 0.12);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(230, 230, 200, 0.28)";
    ctx.beginPath();
    ctx.ellipse(c.x - r * 0.3, c.y - r * 0.45, r * 0.35, r * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(20, 18, 10, 0.85)";
    ctx.lineWidth = line;
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, r, r * 0.72, 0, Math.PI, 0);
    ctx.stroke();
  }

  paintBerm(near, 1);

  // Clods of spoil on the parapet.
  for (let i = 0; i < 7; i++) {
    const p = at((rand() - 0.5) * d.length * 0.9, slit + rand() * (d.thick / 2 - slit), FRONT_H * (0.3 + rand() * 0.6));
    ctx.fillStyle = rgb(earth, 0.7 + rand() * 0.5);
    ctx.beginPath();
    ctx.arc(p.x, p.y, line * (0.8 + rand() * 0.9), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
