/**
 * Concrete field walls, drawn in the wall's own frame so each section matches
 * the sim box at any facing. `along` runs down the wall, `across` is the look
 * direction. The slab top is one level across a connected run; the bottom
 * follows the ground under each corner. That level is the highest ground the
 * run has stood on. A section that falls does not lower the rest. Where that
 * level would stand a section more than two slabs over its ground, the run is
 * cut there and the low part starts its own top (`wallRunTops`). Wherever the
 * level would still leave a corner of the slab under one slab or over the rise
 * limit, that corner's top gives way (`wallSlabTop`): the height bounds win
 * over a level top.
 *
 * The ordinary Wall is a chest-high slab with barbed wire. The Large wall is
 * the same concrete, taller, with firing slits down both flanks for the men
 * garrisoned inside. Both share this drawer; `WallStyle` tells them apart.
 *
 * Sections laid in one line meet end to end. Where a line turns, the sim lays
 * the next leg into the mitre of the corner (see `fieldCornerStart`), and the
 * section at the end of the old leg draws itself out to that mitre so the two
 * legs read as one wall: no cap in the joint, the outer flank runs on round
 * the corner, and nothing shows in the inner angle.
 */

import { FIELD_TURN_MAX, fieldTurn, LARGE_WALL_SLAB_HEIGHT, WALL_RISE_MAX_SLABS, WALL_SLAB_HEIGHT } from "@gridlock/shared";

export interface WallSection {
  x: number;
  y: number;
  facing: number;
  length: number;
  thick: number;
  /** Terrain peak this section remembers for the run. Missing on a ghost. */
  crest?: number;
}

type Pt = { x: number; y: number };

/** The end of a section that runs into the first section of a turning leg. */
export interface WallCorner {
  kind: "corner";
  /** Outer corner of the next leg's first cap, world. The outer flank runs on to here. */
  outer: Pt;
  /** Inner corner of that cap, world: the inner mitre vertex, on this section's inner flank. */
  inner: Pt;
  /** Outward normal of the next leg's outer flank, for the light on the extension. */
  normal: Pt;
  /** 1 when this section's +across flank is the outer side of the turn, -1 for -across. */
  outerSide: 1 | -1;
}

/** `flush`: another section butts straight on, or this is the first section of a turning leg. */
export type WallEnd = null | { kind: "flush" } | WallCorner;

export interface WallJoins {
  neg: WallEnd;
  pos: WallEnd;
}

/** How far an end may miss its neighbour's end and still join, world units. */
const JOIN_TOL = 1.25;
/** Turns below this are a straight continuation. */
const STRAIGHT = 0.02;

function perpLeft(d: Pt): Pt {
  return { x: -d.y, y: d.x };
}

function alongAxis(facing: number): Pt {
  return { x: -Math.sin(facing), y: Math.cos(facing) };
}

/**
 * What each end of `section` meets among `others`: nothing, a section straight
 * on, or the first section of a leg that turns away. Both the tail that turns
 * into a corner and the head that starts there hide their caps; only the tail
 * draws the mitre.
 */
export function wallJoins(section: WallSection, others: readonly WallSection[]): WallJoins {
  const u = alongAxis(section.facing);
  const f = { x: Math.cos(section.facing), y: Math.sin(section.facing) };
  const hl = section.length / 2;
  const t = section.thick;
  const endOf = (sign: 1 | -1): WallEnd => {
    const dir = { x: u.x * sign, y: u.y * sign };
    const e = { x: section.x + dir.x * hl, y: section.y + dir.y * hl };
    let flush = false;
    for (const o of others) {
      if (Math.abs(o.x - section.x) < 0.5 && Math.abs(o.y - section.y) < 0.5) continue;
      const ou = alongAxis(o.facing);
      const ohl = o.length / 2;
      const a = { x: o.x - ou.x * ohl, y: o.y - ou.y * ohl };
      const b = { x: o.x + ou.x * ohl, y: o.y + ou.y * ohl };
      // This end is the tail; `o` starts at it and leaves along `v`.
      for (const [start, v] of [
        [a, ou],
        [b, { x: -ou.x, y: -ou.y }],
      ] as [Pt, Pt][]) {
        const turn = fieldTurn(dir.x, dir.y, v.x, v.y);
        if (turn > FIELD_TURN_MAX + 1e-6) continue;
        const off = (t / 2) * Math.tan(turn / 2);
        const sx = e.x + off * (v.x - dir.x);
        const sy = e.y + off * (v.y - dir.y);
        if (Math.hypot(sx - start.x, sy - start.y) > JOIN_TOL) continue;
        if (turn < STRAIGHT) {
          flush = true;
          continue;
        }
        const left = dir.x * v.y - dir.y * v.x > 0 ? 1 : -1;
        const n1 = perpLeft(dir);
        const n2 = perpLeft(v);
        const n1Out = { x: -left * n1.x, y: -left * n1.y };
        const n2Out = { x: -left * n2.x, y: -left * n2.y };
        return {
          kind: "corner",
          outer: { x: sx + (t / 2) * n2Out.x, y: sy + (t / 2) * n2Out.y },
          inner: { x: sx - (t / 2) * n2Out.x, y: sy - (t / 2) * n2Out.y },
          normal: n2Out,
          outerSide: n1Out.x * f.x + n1Out.y * f.y > 0 ? 1 : -1,
        };
      }
      // This end is the head of a turning leg; `o` ends at the corner behind it.
      const back = { x: -dir.x, y: -dir.y };
      for (const [end, dirO] of [
        [b, ou],
        [a, { x: -ou.x, y: -ou.y }],
      ] as [Pt, Pt][]) {
        const turn = fieldTurn(dirO.x, dirO.y, back.x, back.y);
        if (turn > FIELD_TURN_MAX + 1e-6) continue;
        const off = (o.thick / 2) * Math.tan(turn / 2);
        const sx = end.x + off * (back.x - dirO.x);
        const sy = end.y + off * (back.y - dirO.y);
        if (Math.hypot(sx - e.x, sy - e.y) <= JOIN_TOL) flush = true;
      }
    }
    return flush ? { kind: "flush" } : null;
  };
  return { neg: endOf(-1), pos: endOf(1) };
}

export interface WallSeg {
  x: number;
  y: number;
  length: number;
}

/** Neighboring sections share a top when their ends meet, straight on or round a corner. */
export function wallSectionsConnect(a: WallSeg, b: WallSeg): boolean {
  const reach = Math.max(a.length, b.length) + 4;
  const d = Math.hypot(a.x - b.x, a.y - b.y);
  return d > 0.5 && d <= reach;
}

/**
 * Slab top: the highest ground under the run, plus the slab.
 * `crests` are terrain peaks the standing sections still remember, so losing
 * the high section does not drop the run.
 */
export function wallTopElev(grounds: readonly number[], slabLevels: number, crests?: readonly number[]): number {
  let m = Number.NEGATIVE_INFINITY;
  for (const g of grounds) if (g > m) m = g;
  if (crests) for (const c of crests) if (c > m) m = c;
  if (!Number.isFinite(m)) m = 0;
  return m + Math.max(0, slabLevels);
}

/**
 * Slab top over one point of ground: the run's level `top`, held between one slab and
 * one slab plus WALL_RISE_MAX_SLABS slabs above that ground. All in terrain levels.
 * Where the bounds bite, the top is no longer level; the wall never stands short or towers.
 */
export function wallSlabTop(top: number, ground: number, slabLevels: number): number {
  const slab = Math.max(0, slabLevels);
  const lo = ground + slab;
  const hi = lo + WALL_RISE_MAX_SLABS * slab;
  return Math.min(hi, Math.max(lo, top));
}

/** Slab height in world units. About chest-high on a standing soldier. */
export const WALL_SLAB_H = WALL_SLAB_HEIGHT;
/** Barbed wire above the slab, in world units. */
export const WALL_WIRE_H = 5.5;
/** Large wall slab, world units. Well over a standing man; the slits sit at his shoulder. */
export const LARGE_WALL_SLAB_H = LARGE_WALL_SLAB_HEIGHT;

export interface WallStyle {
  /** Slab height, world units. */
  slabH: number;
  /** Barbed wire on posts along the top. */
  wire: boolean;
  /** Firing slits on both flanks. */
  slits: boolean;
}

export const WALL_STYLE: WallStyle = { slabH: WALL_SLAB_H, wire: true, slits: false };
export const LARGE_WALL_STYLE: WallStyle = { slabH: LARGE_WALL_SLAB_H, wire: false, slits: true };

/** Two posts per section, inset so neighboring sections meet without a double post. */
export function wallPostAlong(length: number): number[] {
  return [-length / 4, length / 4];
}

/** Firing slits along a Large wall section, as shares of the length from the centre. Matches `largeWallSlit`. */
export function wallSlitAlong(length: number): number[] {
  return [-length / 4, length / 4];
}

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
  /** What each end meets. Open ends draw a cap. */
  joins?: WallJoins;
  /**
   * The section's own frame, bent round any corner it turns (`lineFrame`): a world point at
   * `along` and `across`. A bent corner replaces the mitre run-out; without it the section is
   * the plain rectangle.
   */
  frame?: (along: number, across: number) => Pt;
  /**
   * The line's slab top down this section, terrain levels, `along` world px from the centre:
   * a smooth curve through the tops of the sections either side (`lineProfile`), so where one
   * run stands higher than the next the top climbs or falls to it instead of stepping. The
   * slab's own bounds (`wallSlabTop`) still hold. Without it the top is `topElev` throughout.
   */
  topAt?: (along: number) => number;
  style?: WallStyle;
  /** Men inside a Large wall: the slits glow. */
  manned?: boolean;
  /** Their side colour, for a band over each slit. */
  bandColor?: string;
  /** A Wall section converted into a gate: two posts and a lifting boom instead of the slab. */
  gate?: { open: number; locked: boolean };
}

/** Length of each gate post along the section, world units. */
export const GATE_POST_LEN = 5;
/** Hinge height of the boom on its post, as a share of the slab height. */
export const GATE_HINGE = 0.82;

/**
 * The boom of a gate, in the section's frame: it swings from flat across the
 * gap (open 0) to nearly upright (open 1) about a hinge on the -along post.
 */
export function gateBoom(open: number, length: number, slabH: number): { a0: number; a1: number; rise: number; hinge: number } {
  const hl = length / 2;
  const a0 = -hl + GATE_POST_LEN;
  const arm = length - GATE_POST_LEN * 2 - 1;
  const theta = Math.max(0, Math.min(1, open)) * (Math.PI / 2) * 0.94;
  const hinge = slabH * GATE_HINGE;
  return { a0, a1: a0 + Math.cos(theta) * arm, rise: Math.sin(theta) * arm, hinge };
}

function rgb(r: number, g: number, b: number, k: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${c(r)},${c(g)},${c(b)})`;
}

const LIT = { x: Math.cos((9 * Math.PI) / 8), y: Math.sin((9 * Math.PI) / 8) };

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

interface Face {
  a: Pt;
  b: Pt;
  /** Where `a` and `b` lie along the section, world units from its centre. */
  aAlong: number;
  bAlong: number;
  n: Pt;
  /** The flank this face runs down, for its streaks and slits. Null on a cap. */
  flank: 1 | -1 | null;
}

function unit(v: Pt): Pt {
  const l = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / l, y: v.y / l };
}

export function drawWall(ctx: CanvasRenderingContext2D, d: WallDraw): void {
  const style = d.style ?? WALL_STYLE;
  const fx = Math.cos(d.facing);
  const fy = Math.sin(d.facing);
  const tx = -fy;
  const ty = fx;
  const f = { x: fx, y: fy };
  const u = { x: tx, y: ty };
  const world = (along: number, across: number): Pt => ({
    x: d.x + tx * along + fx * across,
    y: d.y + ty * along + fy * across,
  });
  // The slab keeps its height whatever its damage: cracks only, so neighbours never step.
  const slab = style.slabH;
  const slabLevels = d.levelPx > 0 ? (slab * d.worldPx) / d.levelPx : 0;
  const hl = d.length / 2;
  const ht = d.thick / 2;
  /** The section's own frame: straight, or bent round its corners. */
  const frame = d.frame ?? world;
  /**
   * A world point lifted `up` world units: the bottom hangs on the terrain, the top is the
   * run's flat level (or the line's curve through the runs, at `along` world px from the
   * centre), bent only where that level would leave the slab short or towering.
   */
  const at = (w: Pt, up: number, along = 0): Pt => {
    const g = d.ground(w.x, w.y);
    const top = wallSlabTop(d.topAt ? d.topAt(along) : d.topElev, g, slabLevels);
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
  const atF = (along: number, across: number, up: number): Pt => at(frame(along, across), up, along);
  // The Tower's concrete: about (112,112,104) in the light, (72,72,64) in shade, (144,144,128) on top.
  const base = d.bad ? [176, 72, 58] : [108, 110, 100];
  const [br, bg, bb] = base as [number, number, number];
  const o0 = d.project(d.x, d.y, 0);
  const o1 = d.project(d.x + 1, d.y, 0);
  const px = Math.hypot(o1.x - o0.x, o1.y - o0.y);
  const line = Math.max(0.6, Math.min(1.4, px * 0.45));
  const joins = d.joins ?? { neg: null, pos: null };

  // The flanks sampled down the section: a straight one in a few even pieces, a bent one finely
  // enough to read as a curve. A joint of any kind (straight on or round a corner) hides the cap.
  const steps = d.frame ? 12 : 4;
  const alongs = Array.from({ length: steps + 1 }, (_, i) => -hl + (d.length * i) / steps);
  const negPts = alongs.map((a) => frame(a, -ht));
  const posPts = alongs.map((a) => frame(a, ht));
  const nNeg = { x: -fx, y: -fy };
  const nPos = { x: fx, y: fy };
  const faces: Face[] = [];
  /** Outward normal of a flank piece: square to it, away from the other flank. */
  const flankNormal = (a: Pt, b: Pt, away: Pt): Pt => {
    const n = unit({ x: -(b.y - a.y), y: b.x - a.x });
    return n.x * away.x + n.y * away.y >= 0 ? n : { x: -n.x, y: -n.y };
  };
  for (let i = 0; i < steps; i++) {
    const awayNeg = { x: negPts[i]!.x - posPts[i]!.x, y: negPts[i]!.y - posPts[i]!.y };
    faces.push({ a: negPts[i]!, b: negPts[i + 1]!, aAlong: alongs[i]!, bAlong: alongs[i + 1]!, n: flankNormal(negPts[i]!, negPts[i + 1]!, awayNeg), flank: -1 });
    const awayPos = { x: -awayNeg.x, y: -awayNeg.y };
    faces.push({ a: posPts[i + 1]!, b: posPts[i]!, aAlong: alongs[i + 1]!, bAlong: alongs[i]!, n: flankNormal(posPts[i]!, posPts[i + 1]!, awayPos), flank: 1 });
  }
  if (!joins.pos) {
    const n = unit({ x: frame(hl, 0).x - frame(hl - 1, 0).x, y: frame(hl, 0).y - frame(hl - 1, 0).y });
    faces.push({ a: negPts[steps]!, b: posPts[steps]!, aAlong: hl, bAlong: hl, n, flank: null });
  }
  if (!joins.neg) {
    const n = unit({ x: frame(-hl, 0).x - frame(-hl + 1, 0).x, y: frame(-hl, 0).y - frame(-hl + 1, 0).y });
    faces.push({ a: posPts[0]!, b: negPts[0]!, aAlong: -hl, bAlong: -hl, n, flank: null });
  }
  // The top: down the −across flank, back up the +across one.
  const topPoly: { p: Pt; along: number }[] = [
    ...negPts.map((p, i) => ({ p, along: alongs[i]! })),
    ...posPts.map((p, i) => ({ p, along: alongs[i]! })).reverse(),
  ];

  const light = (n: Pt) => 0.55 + 0.45 * Math.max(0, n.x * LIT.x + n.y * LIT.y);
  faces.sort((p, q) => p.a.x + p.a.y + p.b.x + p.b.y - (q.a.x + q.a.y + q.b.x + q.b.y));

  ctx.save();
  ctx.globalAlpha = d.alpha;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  const paint = (pts: Pt[], color: string) => {
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
  if (d.gate) {
    // Two concrete posts where the slab's ends were, a lamp head on each, and the boom between them.
    const postLen = Math.min(GATE_POST_LEN, hl * 0.4);
    const post = (a0: number, a1: number): void => {
      const corners = [world(a0, -ht), world(a1, -ht), world(a1, ht), world(a0, ht)];
      const ns = [nNeg, u, nPos, { x: -u.x, y: -u.y }];
      const sides = corners.map((c, i) => ({ a: c, b: corners[(i + 1) % 4]!, n: ns[i]! }));
      sides.sort((p, q) => p.a.x + p.a.y + p.b.x + p.b.y - (q.a.x + q.a.y + q.b.x + q.b.y));
      for (const f of sides) {
        const k = light(f.n);
        paint([at(f.a, 0), at(f.b, 0), at(f.b, slab), at(f.a, slab)], rgb(br, bg, bb, k));
      }
      paint(corners.map((c) => at(c, slab)), rgb(br, bg, bb, 1.3));
      // Lamp head on the post top: a small hooded box with a warm face on each flank.
      const mid = (a0 + a1) / 2;
      for (const side of [-1, 1] as const) {
        const h0 = atF(mid, side * (ht + 0.4), slab + 0.6);
        const r = Math.max(1.2, px * 1.6);
        ctx.fillStyle = "rgba(38, 40, 36, 0.95)";
        ctx.beginPath();
        ctx.arc(h0.x, h0.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = d.bad ? "rgba(255, 150, 120, 0.9)" : "rgba(255, 214, 140, 0.95)";
        ctx.beginPath();
        ctx.arc(h0.x + side * fx * r * 0.35, h0.y + side * fy * r * 0.2, r * 0.45, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    post(-hl, -hl + postLen);
    post(hl - postLen, hl);
    const boom = gateBoom(d.gate.open, d.length, slab);
    const steps = 6;
    ctx.lineCap = "butt";
    ctx.lineWidth = Math.max(2, line * 2.8);
    for (let i = 0; i < steps; i++) {
      const t0 = i / steps;
      const t1 = (i + 1) / steps;
      const p0 = atF(boom.a0 + (boom.a1 - boom.a0) * t0, 0, boom.hinge + boom.rise * t0);
      const p1 = atF(boom.a0 + (boom.a1 - boom.a0) * t1, 0, boom.hinge + boom.rise * t1);
      ctx.strokeStyle = i % 2 === 0 ? (d.bad ? "#7a2a22" : "#c43a2c") : "#e9e4d6";
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.stroke();
    }
    const hinge = atF(boom.a0, 0, boom.hinge);
    ctx.fillStyle = "rgba(40, 42, 38, 0.95)";
    ctx.beginPath();
    ctx.arc(hinge.x, hinge.y, Math.max(1.4, line * 1.6), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }
  const slits = style.slits ? wallSlitAlong(d.length) : [];
  const grime = `rgba(28, 26, 22, ${d.bad ? 0.1 : 0.16})`;
  const streak = `rgba(34, 32, 28, ${d.bad ? 0.08 : 0.12})`;
  for (const face of faces) {
    const k = light(face.n);
    const lo0 = at(face.a, 0, face.aAlong);
    const lo1 = at(face.b, 0, face.bAlong);
    const hi0 = at(face.a, slab, face.aAlong);
    const hi1 = at(face.b, slab, face.bAlong);
    paint([lo0, lo1, hi1, hi0], rgb(br, bg, bb, k));
    // Weather: a grime band at the foot and a couple of run-off streaks from the top.
    const g0 = at(face.a, slab * 0.22, face.aAlong);
    const g1 = at(face.b, slab * 0.22, face.bAlong);
    ctx.fillStyle = grime;
    ctx.beginPath();
    ctx.moveTo(lo0.x, lo0.y);
    ctx.lineTo(lo1.x, lo1.y);
    ctx.lineTo(g1.x, g1.y);
    ctx.lineTo(g0.x, g0.y);
    ctx.closePath();
    ctx.fill();
    if (face.flank == null) continue;
    const across = face.flank * ht;
    // Seeded per flank, so a neighbour going up or coming down does not move the stains.
    const rand = mulberry(d.seed + (face.flank > 0 ? 17 : 29));
    const streaks = 2;
    for (let i = 0; i < streaks; i++) {
      const a = -hl + d.length * (0.12 + rand() * 0.76);
      const wdt = 0.6 + rand() * 0.9;
      const drop = slab * (0.35 + rand() * 0.4);
      const q0 = atF(a - wdt, across, slab);
      const q1 = atF(a + wdt, across, slab);
      const q2 = atF(a + wdt * 0.6, across, slab - drop);
      const q3 = atF(a - wdt * 0.6, across, slab - drop);
      ctx.fillStyle = streak;
      ctx.beginPath();
      ctx.moveTo(q0.x, q0.y);
      ctx.lineTo(q1.x, q1.y);
      ctx.lineTo(q2.x, q2.y);
      ctx.lineTo(q3.x, q3.y);
      ctx.closePath();
      ctx.fill();
    }
    for (const a of slits) {
      // A horizontal firing slit at shoulder height, with a lighter sill under it.
      const half = Math.min(hl * 0.3, 3.2);
      const z0 = slab * 0.58;
      const z1 = slab * 0.7;
      const s0 = atF(a - half, across, z0);
      const s1 = atF(a + half, across, z0);
      const s2 = atF(a + half, across, z1);
      const s3 = atF(a - half, across, z1);
      ctx.fillStyle = d.manned ? "rgba(255, 196, 96, 0.92)" : "rgba(16, 14, 12, 0.92)";
      ctx.beginPath();
      ctx.moveTo(s0.x, s0.y);
      ctx.lineTo(s1.x, s1.y);
      ctx.lineTo(s2.x, s2.y);
      ctx.lineTo(s3.x, s3.y);
      ctx.closePath();
      ctx.fill();
      if (d.manned && d.bandColor) {
        const b0 = atF(a - half, across, z1 + slab * 0.03);
        const b1 = atF(a + half, across, z1 + slab * 0.03);
        ctx.strokeStyle = d.bandColor;
        ctx.lineWidth = Math.max(1, line * 1.1);
        ctx.beginPath();
        ctx.moveTo(b0.x, b0.y);
        ctx.lineTo(b1.x, b1.y);
        ctx.stroke();
      }
      ctx.strokeStyle = rgb(br, bg, bb, k * 1.18);
      ctx.lineWidth = Math.max(0.8, line * 0.8);
      ctx.beginPath();
      ctx.moveTo(s0.x, s0.y);
      ctx.lineTo(s1.x, s1.y);
      ctx.stroke();
    }
  }
  const topPts = topPoly.map((t) => at(t.p, slab, t.along));
  paint(topPts, rgb(br, bg, bb, 1.3));
  // Scruff on the top: chipped edges and a few spalls.
  const rand = mulberry(d.seed ^ 0x9e3779b9);
  const chips = 2 + Math.floor(rand() * 2);
  ctx.fillStyle = `rgba(40, 38, 34, ${d.bad ? 0.18 : 0.3})`;
  for (let i = 0; i < chips; i++) {
    const a = -hl + d.length * (0.08 + rand() * 0.84);
    const side = rand() < 0.5 ? -1 : 1;
    const w = 0.8 + rand() * 1.4;
    const deep = 0.6 + rand() * 1.1;
    const p0 = atF(a - w, side * ht, slab);
    const p1 = atF(a + w, side * ht, slab);
    const p2 = atF(a + (rand() - 0.5) * w, side * (ht - deep), slab);
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = `rgba(60, 58, 52, ${d.bad ? 0.12 : 0.22})`;
  for (let i = 0; i < 2; i++) {
    const a = -hl + d.length * (0.15 + rand() * 0.7);
    const c = (rand() - 0.5) * ht * 1.1;
    const r = 0.7 + rand() * 1.2;
    const q0 = atF(a - r, c, slab);
    const q1 = atF(a, c + r * 0.7, slab);
    const q2 = atF(a + r, c, slab);
    const q3 = atF(a, c - r * 0.7, slab);
    ctx.beginPath();
    ctx.moveTo(q0.x, q0.y);
    ctx.lineTo(q1.x, q1.y);
    ctx.lineTo(q2.x, q2.y);
    ctx.lineTo(q3.x, q3.y);
    ctx.closePath();
    ctx.fill();
  }

  if (d.hurt > 0.2) {
    ctx.strokeStyle = `rgba(42, 40, 36, ${0.35 + d.hurt * 0.45})`;
    ctx.lineWidth = line * 0.8;
    const crack = (a0: number, a1: number) => {
      ctx.beginPath();
      ctx.moveTo(atF(a0, 0, slab * 0.72).x, atF(a0, 0, slab * 0.72).y);
      ctx.lineTo(atF((a0 + a1) / 2, ht * 0.2, slab * 0.4).x, atF((a0 + a1) / 2, ht * 0.2, slab * 0.4).y);
      ctx.lineTo(atF(a1, -ht * 0.15, slab * 0.15).x, atF(a1, -ht * 0.15, slab * 0.15).y);
      ctx.stroke();
    };
    crack(-hl * 0.55, -hl * 0.05);
    if (d.hurt > 0.55) crack(hl * 0.1, hl * 0.62);
  }

  if (style.wire) {
    const posts = wallPostAlong(d.length);
    const wireY0 = slab + WALL_WIRE_H * 0.42;
    const wireY1 = slab + WALL_WIRE_H;
    const strand = (up: number, zig: number) => {
      ctx.beginPath();
      const steps = 8;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const along = -hl + d.length * t;
        const across = (i % 2 === 0 ? -1 : 1) * ht * zig;
        const p = atF(along, across, up);
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
      const foot = atF(along, 0, slab);
      const tip = atF(along, 0, slab + WALL_WIRE_H);
      ctx.beginPath();
      ctx.moveTo(foot.x, foot.y);
      ctx.lineTo(tip.x, tip.y);
      ctx.stroke();
    }

    ctx.strokeStyle = d.bad ? "rgba(60, 24, 20, 0.85)" : "rgba(28, 30, 26, 0.85)";
    ctx.lineWidth = Math.max(0.6, line * 0.45);
    for (let i = 0; i < 8; i++) {
      const along = -hl + d.length * ((i + 0.5) / 8);
      const up = i % 2 === 0 ? wireY0 : wireY1;
      const a = atF(along, -ht * 0.45, up);
      const b = atF(along, ht * 0.45, up + 0.6);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  } else {
    // Coping: a lighter edge where the top meets the lit flank.
    ctx.strokeStyle = rgb(br, bg, bb, 1.45);
    ctx.lineWidth = Math.max(0.8, line * 0.9);
    const negLit = nNeg.x * LIT.x + nNeg.y * LIT.y >= nPos.x * LIT.x + nPos.y * LIT.y;
    const edge = (negLit ? negPts : posPts).map((p, i) => at(p, slab, alongs[i]!));
    ctx.beginPath();
    edge.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.stroke();
  }

  ctx.restore();
}

/** Height of a wall for its cast shadow, world units. */
export function wallShadowHeight(style: WallStyle): number {
  return style.slabH + (style.wire ? WALL_WIRE_H * 0.5 : 0);
}

/**
 * The ground this section covers, with its mitre, for a cast shadow: the top
 * outline on the ground plane. With a bent `frame` it follows the bend instead.
 */
export function wallFootprintWorld(section: WallSection, joins?: WallJoins, frame?: (along: number, across: number) => Pt): Pt[] {
  if (frame) {
    const hl = section.length / 2;
    const ht = section.thick / 2;
    const out: Pt[] = [];
    for (let i = 0; i <= 8; i++) {
      const a = -hl + (section.length * i) / 8;
      out.push(frame(a, -ht), frame(a, ht));
    }
    return out;
  }
  const u = alongAxis(section.facing);
  const f = { x: Math.cos(section.facing), y: Math.sin(section.facing) };
  const hl = section.length / 2;
  const ht = section.thick / 2;
  const world = (along: number, across: number): Pt => ({
    x: section.x + u.x * along + f.x * across,
    y: section.y + u.y * along + f.y * across,
  });
  const c0 = world(-hl, -ht);
  const c1 = world(hl, -ht);
  const c2 = world(hl, ht);
  const c3 = world(-hl, ht);
  const out: Pt[] = [c0, c1, c2, c3];
  const pos = joins?.pos;
  const neg = joins?.neg;
  if (pos && pos.kind === "corner") out.push(pos.outer);
  if (neg && neg.kind === "corner") out.push(neg.outer);
  return out;
}
