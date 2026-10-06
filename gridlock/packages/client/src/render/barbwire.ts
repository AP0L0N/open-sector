/**
 * Barbwire section: a coil of wire strung between two posts, drawn in the section's own
 * frame so it matches the sim box at any facing. `along` runs down the line, `across` is
 * the look direction, `up` is world units above the ground. Flattened by a hull it lies
 * as a tangle with its posts knocked over.
 */

export interface BarbwireDraw {
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
}

/** Post height, world units: about the three courses of a sandbag wall. */
export const WIRE_POST_H = 7;
/** Coil centre and radius above the ground, world units. */
const COIL_MID = 3.6;
const COIL_R = 3;
/** Turns of the coil along one section. */
const COIL_TURNS = 5;
/** Points drawn per turn. */
const COIL_STEPS = 10;

type Pt = { x: number; y: number };

function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** The coil as world-frame samples: along, across, up. A flattened coil lies spread on the ground. */
export function coilPath(length: number, thick: number, ruined: boolean, seed: number): { along: number; across: number; up: number }[] {
  const rand = rng(seed);
  const hl = length / 2;
  const ht = thick / 2;
  const n = COIL_TURNS * COIL_STEPS;
  const out: { along: number; across: number; up: number }[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const th = (i / COIL_STEPS) * Math.PI * 2;
    if (ruined) {
      // Pressed flat and pushed out sideways, the loops wander.
      out.push({
        along: -hl + length * t + (rand() - 0.5) * 1.2,
        across: Math.cos(th) * ht * 1.6 + (rand() - 0.5) * 1.5,
        up: 0.5 + Math.max(0, Math.sin(th)) * 0.9,
      });
    } else {
      out.push({
        along: -hl + length * t,
        across: Math.cos(th) * ht * 0.9,
        up: COIL_MID + Math.sin(th) * COIL_R,
      });
    }
  }
  return out;
}

export function drawBarbwire(ctx: CanvasRenderingContext2D, d: BarbwireDraw): void {
  const fx = Math.cos(d.facing);
  const fy = Math.sin(d.facing);
  const tx = -fy;
  const ty = fx;
  const at = (along: number, across: number, up: number): Pt =>
    d.project(d.x + tx * along + fx * across, d.y + ty * along + fy * across, up);
  const o0 = d.project(d.x, d.y, 0);
  const o1 = d.project(d.x + 1, d.y, 0);
  const px = Math.hypot(o1.x - o0.x, o1.y - o0.y);
  const line = Math.max(0.35, Math.min(0.9, px * 0.3));
  const hl = d.length / 2;
  const rand = rng(d.seed ^ 0x2545f491);

  ctx.save();
  ctx.globalAlpha = d.alpha;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  // Trodden ground under the wire.
  ctx.fillStyle = d.bad ? "rgba(150, 60, 48, 0.28)" : "rgba(40, 34, 22, 0.22)";
  ctx.beginPath();
  const ht = d.thick / 2;
  for (const [a, c] of [
    [-hl, -ht],
    [hl, -ht],
    [hl, ht],
    [-hl, ht],
  ] as const) {
    const p = at(a, c, 0);
    ctx.lineTo(p.x, p.y);
  }
  ctx.closePath();
  ctx.fill();

  const wire = d.bad ? "rgba(96, 40, 32, 0.95)" : d.ruined ? "rgba(58, 54, 46, 0.9)" : "rgba(60, 64, 58, 0.95)";
  const glint = d.bad ? "rgba(255, 150, 130, 0.35)" : "rgba(220, 228, 232, 0.45)";

  // Posts: a dark stake with a lit edge. A knocked-over post leans along the line.
  const posts = [-hl + 0.8, hl - 0.8];
  const postTop = (along: number): { along: number; up: number } => {
    if (!d.ruined) return { along, up: WIRE_POST_H };
    const lean = (rand() > 0.5 ? 1 : -1) * (2 + rand() * 2.5);
    return { along: along + lean, up: 1.2 + rand() * 1.2 };
  };
  const tops = posts.map(postTop);

  // Strands between the posts, sagging a touch in the middle. A flat section keeps one slack strand.
  ctx.strokeStyle = wire;
  ctx.lineWidth = Math.max(0.7, line * 0.7);
  const strand = (up: number, sag: number, across: number): void => {
    ctx.beginPath();
    const steps = 6;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const a = posts[0]! + (posts[1]! - posts[0]!) * t;
      const p = at(a, across, up - Math.sin(t * Math.PI) * sag);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
  };
  if (d.ruined) {
    strand(0.6, -0.3, ht * 0.6 * (rand() > 0.5 ? 1 : -1));
  } else {
    strand(1.4, 0.35, 0);
    strand(WIRE_POST_H - 0.4, 0.5, 0);
  }

  // The coil, back half first so the near loops read in front.
  const coil = coilPath(d.length, d.thick, d.ruined, d.seed);
  const pts = coil.map((c) => at(c.along, c.across, c.up));
  ctx.lineWidth = Math.max(0.6, line * 0.8);
  ctx.strokeStyle = wire;
  ctx.beginPath();
  pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.stroke();

  // Barbs: short ticks off every few points of the coil.
  ctx.lineWidth = Math.max(0.5, line * 0.6);
  ctx.beginPath();
  for (let i = 2; i < coil.length; i += 3) {
    const c = coil[i]!;
    const p = pts[i]!;
    const q = at(c.along + 0.7, c.across + 0.5, c.up + (d.ruined ? 0.4 : 0.9));
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(q.x, q.y);
  }
  ctx.stroke();

  // A glint along the top of the standing coil.
  if (!d.ruined) {
    ctx.strokeStyle = glint;
    ctx.lineWidth = Math.max(0.4, line * 0.45);
    ctx.beginPath();
    let open = false;
    for (let i = 0; i < coil.length; i++) {
      const c = coil[i]!;
      if (c.up < COIL_MID + COIL_R * 0.6) {
        open = false;
        continue;
      }
      const p = pts[i]!;
      if (!open) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
      open = true;
    }
    ctx.stroke();
  }

  // Posts over the wire.
  for (let i = 0; i < posts.length; i++) {
    const foot = at(posts[i]!, 0, 0);
    const top = tops[i]!;
    const tip = at(top.along, 0, top.up);
    ctx.strokeStyle = d.bad ? "rgba(80, 30, 26, 0.95)" : "rgba(46, 36, 26, 0.95)";
    ctx.lineWidth = Math.max(1, line * 1.6);
    ctx.beginPath();
    ctx.moveTo(foot.x, foot.y);
    ctx.lineTo(tip.x, tip.y);
    ctx.stroke();
    ctx.strokeStyle = d.bad ? "rgba(200, 110, 96, 0.6)" : "rgba(150, 126, 92, 0.7)";
    ctx.lineWidth = Math.max(0.4, line * 0.5);
    ctx.beginPath();
    ctx.moveTo(foot.x - line, foot.y);
    ctx.lineTo(tip.x - line, tip.y);
    ctx.stroke();
  }

  ctx.restore();
}
