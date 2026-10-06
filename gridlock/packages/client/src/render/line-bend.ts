/**
 * Bends and slopes for field lines: walls, sandbags, and barbed wire.
 *
 * A line is laid section by section, and where it turns the sim pushes the next leg into
 * the mitre of the corner (`fieldPath`). That leaves the two sections meeting at an angle
 * with a notch on the outside. `lineShapes` finds which section ends meet, the same way
 * the bridges do (`layoutBridges`), and bends both sections of a corner onto one circular
 * fillet (`brickFrame`), so the line sweeps round. It also lays a smooth height profile
 * through the line: each section rises or falls toward the next one's level instead of
 * stepping. All of it is drawing only; the sim's sections stay where they are.
 */

import { FIELD_TURN_MAX } from "@gridlock/shared";
import { brickFrame, type BrickBend } from "./bridge.js";

type Pt = { x: number; y: number };

/** A field section as the line drawing reads it. `facing` is the look direction, as the sim keeps it. */
export interface LinePiece {
  x: number;
  y: number;
  facing: number;
  length: number;
  thick: number;
}

/** The section across one end: its index in the list, and which of its ends meets this one (0 neg, 1 pos). */
export interface LineLink {
  piece: number;
  end: 0 | 1;
}

export interface LineShape {
  /** Bend at the neg (−along) and pos (+along) end, when the line turns there. */
  bendNeg?: BrickBend;
  bendPos?: BrickBend;
  /** The section across each end, when one meets it. */
  neg?: LineLink;
  pos?: LineLink;
}

/** How far a section end may miss where the mitre puts its neighbour's end, world px. */
const MEET_TOL = 1.5;
/** Turns gentler than this stay a straight butt joint, radians. */
const BEND_MIN = 0.08;
/**
 * Fillet radius of a bend, as a share of the section's length. A field section is long and thin,
 * so a radius off its thickness alone would leave the corner a kink; this one reads as a curve.
 */
const BEND_RADIUS = 0.9;
/** Most of a section one bend may take, as a share of its length. */
const BEND_ROOM = 0.45;

/** Unit vector down a section, from its neg end to its pos end. */
function alongAxis(facing: number): Pt {
  return { x: -Math.sin(facing), y: Math.cos(facing) };
}

/** The direction a bent frame runs along: a bridge brick's `facing`. */
export function alongFacing(facing: number): number {
  return facing + Math.PI / 2;
}

function endPoint(p: LinePiece, end: 0 | 1): Pt {
  const u = alongAxis(p.facing);
  const s = end === 1 ? 1 : -1;
  return { x: p.x + u.x * s * (p.length / 2), y: p.y + u.y * s * (p.length / 2) };
}

/** Unit vector pointing out of a section through `end`. */
function outward(p: LinePiece, end: 0 | 1): Pt {
  const u = alongAxis(p.facing);
  return end === 1 ? u : { x: -u.x, y: -u.y };
}

/**
 * Whether end `ei` of `a` and end `ej` of `b` are one joint of a laid line: straight on,
 * or round a corner with the next leg pushed `(t / 2) · tan(turn / 2)` into the mitre
 * (either section may be the leg's tail). Returns the signed turn from heading into the
 * joint along `a` to heading out of it along `b`, or null.
 */
function meet(a: LinePiece, ei: 0 | 1, b: LinePiece, ej: 0 | 1): number | null {
  const d = outward(a, ei);
  const o = outward(b, ej);
  const v = { x: -o.x, y: -o.y };
  const cos = Math.max(-1, Math.min(1, d.x * v.x + d.y * v.y));
  const turn = Math.acos(cos);
  if (turn > FIELD_TURN_MAX + 1e-6) return null;
  const off = (Math.max(a.thick, b.thick) / 2) * Math.tan(turn / 2);
  const e = endPoint(a, ei);
  const s = endPoint(b, ej);
  const mx = off * (v.x - d.x);
  const my = off * (v.y - d.y);
  const miss = Math.min(Math.hypot(s.x - (e.x + mx), s.y - (e.y + my)), Math.hypot(s.x - (e.x - mx), s.y - (e.y - my)));
  if (miss > MEET_TOL) return null;
  return Math.atan2(d.x * v.y - d.y * v.x, cos);
}

/**
 * Which ends meet, and the bend at each turned joint. An end pairs with the closest end of
 * another section that meets it, when that one pairs back, so a wide joint is never shared
 * three ways.
 */
export function lineShapes(pieces: readonly LinePiece[]): LineShape[] {
  const n = pieces.length;
  const best: (LineLink & { turn: number; dist: number })[] = [];
  const keyOf = (i: number, e: 0 | 1) => i * 2 + e;
  for (let i = 0; i < n; i++) {
    for (const ei of [0, 1] as const) {
      let pick: (LineLink & { turn: number; dist: number }) | undefined;
      const e = endPoint(pieces[i]!, ei);
      for (let j = 0; j < n; j++) {
        if (j === i) continue;
        const pj = pieces[j]!;
        // Only sections near enough to share an end.
        if (Math.hypot(pj.x - pieces[i]!.x, pj.y - pieces[i]!.y) > (pj.length + pieces[i]!.length) / 2 + pj.thick * 2) continue;
        for (const ej of [0, 1] as const) {
          const turn = meet(pieces[i]!, ei, pj, ej);
          if (turn == null) continue;
          const s = endPoint(pj, ej);
          const dist = Math.hypot(s.x - e.x, s.y - e.y);
          if (!pick || dist < pick.dist) pick = { piece: j, end: ej, turn, dist };
        }
      }
      if (pick) best[keyOf(i, ei)] = pick;
    }
  }
  const out: LineShape[] = pieces.map(() => ({}));
  for (let i = 0; i < n; i++) {
    for (const ei of [0, 1] as const) {
      const link = best[keyOf(i, ei)];
      if (!link) continue;
      const back = best[keyOf(link.piece, link.end)];
      if (!back || back.piece !== i || back.end !== ei) continue;
      const shape = out[i]!;
      if (ei === 0) shape.neg = { piece: link.piece, end: link.end };
      else shape.pos = { piece: link.piece, end: link.end };
      const bend = bendAt(pieces[i]!, ei, pieces[link.piece]!, link.end, link.turn);
      if (!bend) continue;
      if (ei === 0) shape.bendNeg = bend;
      else shape.bendPos = bend;
    }
  }
  return out;
}

/** The fillet both sections of a turned joint share, worked out the same from either side. */
function bendAt(a: LinePiece, ei: 0 | 1, b: LinePiece, ej: 0 | 1, turn: number): BrickBend | undefined {
  if (Math.abs(turn) < BEND_MIN) return undefined;
  const d = outward(a, ei);
  const o = outward(b, ej);
  const v = { x: -o.x, y: -o.y };
  const cross = d.x * v.y - d.y * v.x;
  if (Math.abs(cross) < 1e-9) return undefined;
  const p = endPoint(a, ei);
  const q = endPoint(b, ej);
  // Where the two centre lines cross.
  const t = ((q.x - p.x) * v.y - (q.y - p.y) * v.x) / cross;
  const len = Math.min(a.length, b.length);
  const radius = Math.max(BEND_RADIUS * len, Math.max(a.thick, b.thick));
  const tan = Math.min(radius * Math.tan(Math.abs(turn) / 2), BEND_ROOM * len);
  return { cx: p.x + d.x * t, cy: p.y + d.y * t, turn, tan };
}

/**
 * A section's own frame: a world point at `along` (world px from the centre, toward the pos
 * end) and `across` (world px toward the facing). A bent end sweeps round its fillet.
 * Without bends it is the plain rectangle the sim uses.
 */
export function lineFrame(p: LinePiece, shape?: LineShape): (along: number, across: number) => Pt {
  const fx = Math.cos(p.facing);
  const fy = Math.sin(p.facing);
  const ux = -fy;
  const uy = fx;
  if (!shape?.bendNeg && !shape?.bendPos) {
    return (along, across) => ({ x: p.x + ux * along + fx * across, y: p.y + uy * along + fy * across });
  }
  // The bridge frame runs s from end A to end B along `alongFacing`, k across its left (−facing).
  const span = { x: p.x, y: p.y, facing: alongFacing(p.facing), length: p.length };
  const frame = brickFrame(span, p.thick, { bendA: shape.bendNeg, bendB: shape.bendPos });
  return (along, across) => frame(along / p.length + 0.5, -across / p.thick);
}

/**
 * The height a line lies at, along each section: a smooth curve through the sections' own
 * levels, so a section on higher ground eases down to meet a lower neighbour (and the other
 * way) instead of standing a step above it. `levels[i]` is section i's own level at its
 * centre. Both sections of a joint work out the same curve, so they meet at one height.
 */
export function lineProfile(pieces: readonly LinePiece[], shapes: readonly LineShape[], levels: readonly number[]): ((along: number) => number)[] {
  const gap = (i: number, link: LineLink | undefined): number => {
    if (!link) return 0;
    const a = pieces[i]!;
    const b = pieces[link.piece]!;
    return Math.max(1, Math.hypot(b.x - a.x, b.y - a.y));
  };
  // Slope at each section's centre, per world px toward its pos end. Monotone (Fritsch–Carlson):
  // a section between a rise and a fall, or beside a level neighbour, lies flat, so the curve
  // never overshoots a level stretch or dips before it climbs.
  const slope = pieces.map((_, i) => {
    const s = shapes[i]!;
    const h = levels[i]!;
    const dn = s.neg ? (h - levels[s.neg.piece]!) / gap(i, s.neg) : null;
    const dp = s.pos ? (levels[s.pos.piece]! - h) / gap(i, s.pos) : null;
    if (dn != null && dp != null) return dn * dp <= 0 ? 0 : 2 / (1 / dn + 1 / dp);
    return dp ?? dn ?? 0;
  });
  return pieces.map((p, i) => {
    const s = shapes[i]!;
    const h = levels[i]!;
    const half = p.length / 2;
    return (along: number): number => {
      const sign = along >= 0 ? 1 : -1;
      const link = sign > 0 ? s.pos : s.neg;
      if (!link) return h;
      const L = gap(i, link);
      // Travel from this centre toward the neighbour's: slopes in that direction at both ends.
      const d0 = slope[i]! * sign;
      const d1 = slope[link.piece]! * (link.end === 0 ? 1 : -1);
      const t = Math.min(Math.abs(along), half) / L;
      const t2 = t * t;
      const t3 = t2 * t;
      const hj = levels[link.piece]!;
      return (2 * t3 - 3 * t2 + 1) * h + (t3 - 2 * t2 + t) * L * d0 + (-2 * t3 + 3 * t2) * hj + (t3 - t2) * L * d1;
    };
  });
}
