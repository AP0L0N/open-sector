/**
 * Engineer and map bridges, drawn procedurally one brick at a time.
 *
 * A bridge is a run of bricks laid end to end. Every brick of a line keeps one deck
 * level, the ground's height where the line was started, and its underside reaches
 * down to whatever lies under it, the way a wall's base follows the ground: water
 * shows under the spans, a valley gets taller piers, a bank comes up to meet the deck.
 * `layoutBridges` finds where the bricks meet and says how each one ends: down onto the
 * bank, joined to the next brick, broken where the next one fell, or cut off over open
 * water. Where the line turns a corner, the two bricks there bend onto one curve
 * (`brickFrame`). `drawBrick` paints one brick from that.
 *
 * The wooden bridge is a timber trestle: a plank deck with wheel runners, a bent of
 * braced piles under every joint, a log crib and an approach ramp at each bank. The
 * stone one is an old masonry arch bridge: one arch per brick between piers with
 * cutwaters that rise into refuges in the parapet, coursed ashlar, a sett roadway,
 * and wing walls at the banks. A fallen brick leaves its deck hanging from the bricks
 * either side, slumped into the water, and its rubble in the river.
 */

import { BRIDGE_TURN_MAX, bridgeAxes, bridgeEnds, type BridgeSpan, type BridgeType, type IsoPt } from "@gridlock/shared";

/**
 * How a brick ends. `abut` is a free end of the run on dry land; `join` meets a
 * standing brick; `break` meets a fallen one; `open` stops over the water (the next
 * brick is not built yet).
 */
export type BrickEnd = "abut" | "join" | "break" | "open";

export interface BrickIn {
  type: BridgeType;
  span: BridgeSpan;
  /** Width of the deck, world px. */
  width: number;
  /** Deck level, map height units. */
  deck: number;
  ruined?: boolean;
}

/**
 * A joint where the line turns. Both bricks bend half the turn on a shared circular
 * fillet, so the deck sweeps round the corner instead of meeting at an angle.
 */
export interface BrickBend {
  /** Where the two bricks' centre lines cross, world px. */
  cx: number;
  cy: number;
  /** Signed radians from this brick's heading into the joint to the neighbour's heading out of it. */
  turn: number;
  /** Fillet tangent length: how far back from the crossing the bend starts, world px. */
  tan: number;
}

export interface BrickLayout {
  /** Deck height (height units) at end A (s = 0) and end B (s = 1). One level for a whole line. */
  ha: number;
  hb: number;
  endA: BrickEnd;
  endB: BrickEnd;
  bendA?: BrickBend;
  bendB?: BrickBend;
}

/** Deck height at share `s` along a brick. */
export function brickDeckElev(l: Pick<BrickLayout, "ha" | "hb">, s: number): number {
  const u = Math.max(0, Math.min(1, s));
  return l.ha + (l.hb - l.ha) * u;
}

/** Where two bricks count as meeting: end points this close, as a share of the wider deck. */
const JOIN_SHARE = 0.75;
/** Turns gentler than this stay a straight butt joint, radians. */
const BEND_MIN = 0.08;
/** Fillet radius of a bend, as a share of the wider deck. */
const BEND_RADIUS = 0.85;
/** Most of a brick one bend may take, as a share of the shorter brick. */
const BEND_ROOM = 0.45;

/**
 * How each brick meets its neighbours, and its deck height. `wet` says whether a
 * world point is water. Wreckage takes part, so the bricks either side of a fallen
 * one break toward it.
 */
export function layoutBridges(bricks: readonly BrickIn[], wet: (wx: number, wy: number) => boolean): BrickLayout[] {
  const n = bricks.length;
  const ends: { x: number; y: number }[] = [];
  for (const b of bricks) {
    const e = bridgeEnds(b.span);
    ends.push({ x: e.ax, y: e.ay }, { x: e.bx, y: e.by });
  }
  /** Signed turn from heading into end `e` to heading out of the other brick's end `m`. */
  const turnAt = (e: number, m: number): number => {
    const ai = bridgeAxes(bricks[e >> 1]!.span.facing);
    const aj = bridgeAxes(bricks[m >> 1]!.span.facing);
    const inS = e & 1 ? 1 : -1;
    const outS = m & 1 ? -1 : 1;
    const ix = ai.ux * inS;
    const iy = ai.uy * inS;
    const ox = aj.ux * outS;
    const oy = aj.uy * outS;
    return Math.atan2(ix * oy - iy * ox, ix * ox + iy * oy);
  };
  // Union the end points of different bricks that meet. A line turning a corner pushes
  // the next leg into the mitre, so its ends sit further apart the sharper the turn.
  const parent = ends.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) i = parent[i] = parent[parent[i]!]!;
    return i;
  };
  for (let i = 0; i < 2 * n; i++) {
    for (let j = i + 1; j < 2 * n; j++) {
      const bi = i >> 1;
      const bj = j >> 1;
      if (bi === bj) continue;
      const turn = Math.abs(turnAt(i, j));
      const mitre = turn <= BRIDGE_TURN_MAX + 0.1 ? Math.tan(turn / 2) * Math.sin(turn / 2) + 0.1 : 0;
      const tol = Math.max(JOIN_SHARE, mitre) * Math.max(bricks[bi]!.width, bricks[bj]!.width);
      if (Math.hypot(ends[i]!.x - ends[j]!.x, ends[i]!.y - ends[j]!.y) > tol) continue;
      const ri = find(i);
      const rj = find(j);
      if (ri !== rj) parent[rj] = ri;
    }
  }
  const members = new Map<number, number[]>();
  for (let i = 0; i < 2 * n; i++) {
    const r = find(i);
    const list = members.get(r);
    if (list) list.push(i);
    else members.set(r, [i]);
  }
  const endKind = (b: number, end: number): BrickEnd => {
    const others = members.get(find(end))!.filter((m) => m >> 1 !== b);
    if (others.length === 0) return wet(ends[end]!.x, ends[end]!.y) ? "open" : "abut";
    if (bricks[b]!.ruined) return others.some((m) => !bricks[m >> 1]!.ruined) ? "join" : "break";
    return others.every((m) => bricks[m >> 1]!.ruined) ? "break" : "join";
  };
  // A wide deck's joints can fall into one group with the next joint along, so a bend
  // pairs each end with the nearest end of another brick, when that one pairs back.
  const nearest = (end: number): number | null => {
    let best: number | null = null;
    let bestD = Infinity;
    for (const m of members.get(find(end))!) {
      if (m >> 1 === end >> 1) continue;
      const d = Math.hypot(ends[m]!.x - ends[end]!.x, ends[m]!.y - ends[end]!.y);
      if (d < bestD) {
        bestD = d;
        best = m;
      }
    }
    return best;
  };
  // Both bricks of a turned joint work the same fillet out from the same two lines.
  const bendAt = (b: number, end: number): BrickBend | undefined => {
    const m = nearest(end);
    if (m == null || nearest(m) !== end) return undefined;
    const j = m >> 1;
    const si = bricks[b]!.span;
    const sj = bricks[j]!.span;
    const turn = turnAt(end, m);
    if (Math.abs(turn) < BEND_MIN || Math.abs(turn) > BRIDGE_TURN_MAX + 0.1) return undefined;
    const ai = bridgeAxes(si.facing);
    const aj = bridgeAxes(sj.facing);
    const ix = ai.ux * (end & 1 ? 1 : -1);
    const iy = ai.uy * (end & 1 ? 1 : -1);
    const ox = aj.ux * (m & 1 ? -1 : 1);
    const oy = aj.uy * (m & 1 ? -1 : 1);
    const cross = ix * oy - iy * ox;
    const p = ends[end]!;
    const q = ends[m]!;
    const t = ((q.x - p.x) * oy - (q.y - p.y) * ox) / cross;
    const w = Math.max(bricks[b]!.width, bricks[j]!.width);
    const tan = Math.min(BEND_RADIUS * w * Math.tan(Math.abs(turn) / 2), BEND_ROOM * Math.min(si.length, sj.length));
    return { cx: p.x + ix * t, cy: p.y + iy * t, turn, tan };
  };
  return bricks.map((b, i) => {
    const out: BrickLayout = { ha: b.deck, hb: b.deck, endA: endKind(i, 2 * i), endB: endKind(i, 2 * i + 1) };
    const bendA = bendAt(i, 2 * i);
    const bendB = bendAt(i, 2 * i + 1);
    if (bendA) out.bendA = bendA;
    if (bendB) out.bendB = bendB;
    return out;
  });
}

/**
 * World point at share `s` along a brick (0 end A, 1 end B; past them it runs on) and
 * `k` across it (−0.5 to 0.5 of the width). A bent end sweeps round its fillet and
 * meets the neighbour square across the bisector.
 */
export function brickFrame(
  span: BridgeSpan,
  width: number,
  bends: Pick<BrickLayout, "bendA" | "bendB">,
): (s: number, k: number) => { x: number; y: number } {
  const { ux, uy, vx, vy } = bridgeAxes(span.facing);
  const along = (x: number, y: number): number => (x - span.x) * ux + (y - span.y) * uy;
  const arc = (b: BrickBend | undefined, side: 1 | -1): { d: number; r: number; sg: number; len: number } | null => {
    if (!b) return null;
    const half = Math.abs(b.turn) / 2;
    const r = b.tan / Math.tan(half);
    return { d: along(b.cx, b.cy) - side * b.tan, r, sg: Math.sign(b.turn), len: r * half };
  };
  const a = arc(bends.bendA, -1);
  const b = arc(bends.bendB, 1);
  const d0 = a ? a.d : -span.length / 2;
  const d1 = b ? b.d : span.length / 2;
  const straight = Math.max(0, d1 - d0);
  const lenA = a?.len ?? 0;
  const total = lenA + straight + (b?.len ?? 0);
  return (s, k) => {
    const q = s * total;
    let d: number;
    let c: number;
    let turn: number;
    // The inner edge of a tight bend is held off the fillet's centre so it never folds over.
    let off = k * width;
    if (a && q < lenA) {
      const phi = (lenA - q) / a.r;
      d = d0 - a.r * Math.sin(phi);
      c = -a.sg * a.r * (1 - Math.cos(phi));
      turn = a.sg * phi;
      if (Math.sign(off) === -a.sg) off = Math.sign(off) * Math.min(Math.abs(off), a.r * 0.9);
    } else if (b && q - lenA > straight) {
      const phi = (q - lenA - straight) / b.r;
      d = d1 + b.r * Math.sin(phi);
      c = b.sg * b.r * (1 - Math.cos(phi));
      turn = b.sg * phi;
      if (Math.sign(off) === b.sg) off = Math.sign(off) * Math.min(Math.abs(off), b.r * 0.9);
    } else {
      d = d0 + q - lenA;
      c = 0;
      turn = 0;
    }
    const ct = Math.cos(turn);
    const st = Math.sin(turn);
    return {
      x: span.x + ux * d + vx * c + (vx * ct - ux * st) * off,
      y: span.y + uy * d + vy * c + (vy * ct - uy * st) * off,
    };
  };
}

export interface BrickDrawOpts extends BrickLayout {
  type: BridgeType;
  span: BridgeSpan;
  /** Deck width, world px. */
  width: number;
  project: (wx: number, wy: number, elev: number) => IsoPt;
  /** Terrain height at a world point. */
  ground: (wx: number, wy: number) => number;
  /** Ground under this point is water. */
  wet: (wx: number, wy: number) => boolean;
  ruined?: boolean;
  /** 0 whole, 1 nearly down. */
  hurt?: number;
  alpha?: number;
  /** Placement ghost: tinted, no detail. `bad` turns it red. */
  ghost?: boolean;
  bad?: boolean;
  /** Stable per brick, so wreckage and scars do not jump between frames. */
  seed: number;
}

/** Grey, rain-bleached timber over creosoted piles, mud ground into the planks. */
const WOOD = {
  deck: "#5a4f42",
  deckLit: "#615546",
  plank: "rgba(18,13,8,0.55)",
  runner: "#655a4b",
  runnerEdge: "rgba(18,13,8,0.6)",
  side: "#3b3127",
  sideDark: "#2a231c",
  edge: "#17120d",
  pile: "#2a221b",
  pileLit: "#3a3027",
  brace: "#352c23",
  rail: "#4a4034",
  post: "#30281f",
  crib: "#433829",
  cribLine: "rgba(12,9,5,0.6)",
  earth: "#4a4030",
  earthDark: "#362e22",
};
const WOOD_BURNT = { ...WOOD, deck: "#352c24", deckLit: "#3b3128", runner: "#3d3329", side: "#221c16", sideDark: "#1a1511", pile: "#1d1813", brace: "#221c16", rail: "#2b241d", post: "#1d1813" };
/** Soot-stained grey ashlar, worn setts on the roadway. */
const STONE = {
  road: "#4a4741",
  roadLit: "#524e47",
  sett: "rgba(16,14,11,0.42)",
  kerb: "#625d54",
  parapet: "#68635a",
  parapetTop: "#777166",
  parapetFar: "#55504a",
  face: "#5f5a51",
  faceFar: "#47433d",
  joint: "rgba(20,18,14,0.55)",
  ring: "#6a6459",
  ringJoint: "rgba(20,18,14,0.6)",
  soffit: "#211f1b",
  pier: "#58534a",
  pierDark: "#423e37",
  edge: "#24211d",
  moss: "rgba(46,58,32,0.5)",
};
/** Grime and wear laid over both kinds: soot, mud, damp, and the odd paler scuff. */
const GRIME = ["rgba(14,11,8,0.22)", "rgba(14,11,8,0.14)", "rgba(40,32,20,0.2)", "rgba(28,30,20,0.16)", "rgba(190,180,160,0.05)"];

/** A ramp falls one height unit over this many world px. */
const RAMP_RUN = 9;
/** Longest ramp off one end, world px. */
const RAMP_MAX_PX = 72;

function rng(seed: number): () => number {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

export function drawBrick(ctx: CanvasRenderingContext2D, o: BrickDrawOpts): void {
  const { span, width } = o;
  const wood = o.type === "bridge";
  const world = brickFrame(span, width, o);
  const deck = (s: number): number => brickDeckElev(o, s);
  const at = (s: number, k: number, up = 0): IsoPt => {
    const p = world(s, k);
    return o.project(p.x, p.y, deck(s) + up);
  };
  const atH = (s: number, k: number, h: number): IsoPt => {
    const p = world(s, k);
    return o.project(p.x, p.y, h);
  };
  const groundAt = (s: number, k: number): number => {
    const p = world(s, k);
    return o.ground(p.x, p.y);
  };
  const atGround = (s: number, k: number, down = 0): IsoPt => atH(s, k, groundAt(s, k) - down);
  const wetAt = (s: number, k = 0): boolean => {
    const p = world(s, k);
    return o.wet(p.x, p.y);
  };
  /** Height of the deck over the ground at s, across k. */
  const clear = (s: number, k = 0): number => deck(s) - groundAt(s, k);
  // The side whose edge paints lower on screen is toward the viewer.
  const nearK = at(0.5, 0.5).y >= at(0.5, -0.5).y ? 0.5 : -0.5;
  const farK = -nearK;
  const steps = Math.max(4, Math.ceil(span.length / 3));

  const poly = (pts: IsoPt[], color: string): void => {
    if (pts.length < 3) return;
    ctx.beginPath();
    ctx.moveTo(pts[0]!.x, pts[0]!.y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]!.x, pts[i]!.y);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  };
  const line = (a: IsoPt, b: IsoPt, color: string, w: number): void => {
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.stroke();
  };
  const polyline = (pts: IsoPt[], color: string, w: number): void => {
    if (pts.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(pts[0]!.x, pts[0]!.y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]!.x, pts[i]!.y);
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.stroke();
  };
  /** A line the length of the brick at k, lifted `up`; it follows a bent end. */
  const edge = (k: number, up: number, color: string, w: number): void => {
    const pts: IsoPt[] = [];
    for (let i = 0; i <= steps; i++) pts.push(at(i / steps, k, up));
    polyline(pts, color, w);
  };
  /** The deck between s0 and s1, across k0..k1, lifted `up` (or `up0`→`up1` across). */
  const strip = (s0: number, s1: number, k0: number, k1: number, up0 = 0, up1 = up0): IsoPt[] => {
    const pts: IsoPt[] = [];
    const n = Math.max(1, Math.ceil(steps * Math.abs(s1 - s0)));
    for (let i = 0; i <= n; i++) pts.push(at(s0 + ((s1 - s0) * i) / n, k0, up0));
    for (let i = n; i >= 0; i--) pts.push(at(s0 + ((s1 - s0) * i) / n, k1, up1));
    return pts;
  };
  /** A vertical face on side k, from the deck (lifted `top`) down to `bottom(s)`. */
  const face = (s0: number, s1: number, k: number, top: number, bottom: (s: number) => number): IsoPt[] => {
    const pts: IsoPt[] = [];
    const n = Math.max(1, Math.ceil(steps * 2 * Math.abs(s1 - s0)));
    for (let i = 0; i <= n; i++) pts.push(at(s0 + ((s1 - s0) * i) / n, k, top));
    for (let i = n; i >= 0; i--) {
      const s = s0 + ((s1 - s0) * i) / n;
      pts.push(atH(s, k, Math.min(deck(s) + top, bottom(s))));
    }
    return pts;
  };
  const ripple = (s: number, k: number, r: number): void => {
    if (!wetAt(s, k)) return;
    const c = atGround(s, k);
    ctx.beginPath();
    ctx.ellipse(c.x, c.y + 0.5, r * 1.3, r * 0.55, 0, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(200,222,226,0.16)";
    ctx.lineWidth = 0.7;
    ctx.stroke();
  };

  /** Share of the brick a stone pier takes at each end. */
  const pier = Math.min(0.2, 4.5 / span.length);
  /** Road crown down to the arch's crown, height units: the deck slab and fill. */
  const fill = 0.9;
  /** An arch is turned when there is room under the deck for one. */
  const arched = !wood && clear(0.5) > fill + 0.6 && span.length > 16;

  const prevAlpha = ctx.globalAlpha;
  ctx.globalAlpha = prevAlpha * (o.alpha ?? 1);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (o.ghost) {
    drawGhost();
    ctx.globalAlpha = prevAlpha;
    return;
  }

  const rand = rng(o.seed);
  /** Wear and grime draw from their own stream, so they never shift the wreckage. */
  const grit = rng(o.seed * 7919 + 17);
  if (o.ruined) {
    if (wood) drawWoodRuin();
    else drawStoneRuin();
  } else if (wood) {
    drawWood();
  } else {
    drawStone();
  }
  drawScars();
  ctx.globalAlpha = prevAlpha;

  function drawGhost(): void {
    const tint = o.bad ? "rgba(255,120,100,0.6)" : "rgba(190,255,170,0.55)";
    // Legs down to the ground show how high the deck will stand.
    for (const s of [0, 1]) {
      for (const k of [-0.5, 0.5]) if (clear(s, k) > 0.2) line(at(s, k), atGround(s, k), tint, 0.9);
    }
    const body = strip(0, 1, -0.5, 0.5);
    poly(body, o.bad ? "rgba(214,72,58,0.55)" : "rgba(126,214,104,0.42)");
    ctx.strokeStyle = o.bad ? "#ff5a4a" : "#7dff6a";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    body.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.closePath();
    ctx.stroke();
    if (wood) {
      for (let d = 4; d < span.length; d += 4) line(at(d / span.length, -0.5), at(d / span.length, 0.5), tint, 0.6);
    } else {
      line(at(0.5, -0.5), at(0.5, 0.5), tint, 0.8);
    }
    for (const [s, end] of [
      [0, o.endA],
      [1, o.endB],
    ] as const) {
      if (end === "abut") line(at(s, -0.5), at(s, 0.5), o.bad ? "#ff5a4a" : "#e8b84a", 1.6);
    }
  }

  /** Soft shadow the deck casts on the water or ground, a little toward the viewer. */
  function shadow(s0: number, s1: number): void {
    const pts: IsoPt[] = [];
    const n = Math.max(1, Math.ceil(steps * (s1 - s0)));
    for (let i = 0; i <= n; i++) pts.push(atGround(s0 + ((s1 - s0) * i) / n, -0.55));
    for (let i = n; i >= 0; i--) pts.push(atGround(s0 + ((s1 - s0) * i) / n, 0.55));
    for (const p of pts) p.y += 2.5;
    poly(pts, "rgba(8,14,12,0.26)");
  }

  /** Blotches of grime over the deck between s0 and s1, sized `size` world px. */
  function grime(s0: number, s1: number, count: number, size: number): void {
    for (let i = 0; i < count; i++) {
      const s = s0 + grit() * (s1 - s0);
      const k = (grit() - 0.5) * 0.9;
      const ds = (size * (0.4 + grit())) / span.length;
      const dk = (size * (0.3 + grit() * 0.7)) / width;
      const skew = (grit() - 0.5) * dk;
      poly([at(s - ds, k - dk + skew), at(s + ds, k - dk), at(s + ds * 0.8, k + dk - skew), at(s - ds * 0.7, k + dk)], GRIME[Math.floor(grit() * GRIME.length)]!);
    }
  }

  /** Rain and soot streaks run down the near face from under the deck edge. */
  function streaks(k: number, count: number, bottom: (s: number) => number): void {
    for (let i = 0; i < count; i++) {
      const s = 0.04 + grit() * 0.92;
      const ds = (0.8 + grit() * 1.6) / span.length;
      const len = 0.6 + grit() * 2.4;
      const lo = (q: number): number => Math.max(bottom(q), deck(q) - len);
      if (lo(s) >= deck(s) - 0.3) continue;
      poly([at(s, k, -0.1), at(s + ds, k, -0.1), atH(s + ds * 0.7, k, lo(s + ds * 0.7)), atH(s + ds * 0.2, k, lo(s))], "rgba(10,8,6,0.2)");
    }
  }

  /**
   * Where a free end meets a bank lower than the deck, an embankment ramp runs on down
   * to it at a road's grade. Its top at each step, and how far past the end it reaches.
   */
  function rampOf(s: number): { reach: number; at: (t: number) => number; sAt: (t: number) => number } | null {
    const out = s === 0 ? -1 : 1;
    const top = deck(s);
    if (top - groundAt(s + (out * 4) / span.length, 0) < 0.4) return null;
    let reachPx = RAMP_MAX_PX;
    for (let d = 2; d <= RAMP_MAX_PX; d += 1) {
      const q = s + (out * d) / span.length;
      if (top - d / RAMP_RUN <= groundAt(q, 0) + 0.05) {
        reachPx = d;
        break;
      }
    }
    const reach = reachPx / span.length;
    const sAt = (t: number): number => s + out * reach * t;
    const drop = top - groundAt(sAt(1), 0);
    // Down at the grade, easing off onto the bank at the toe.
    const at = (t: number): number => Math.max(groundAt(sAt(t), 0), top - drop * (t + 0.3 * t * (1 - t)));
    return { reach, at, sAt };
  }

  /** The ramp's run: top heights, k widening a little toward the toe. */
  function rampSamples(r: NonNullable<ReturnType<typeof rampOf>>): { s: number; h: number; spread: number }[] {
    const n = Math.max(6, Math.ceil((r.reach * span.length) / 3));
    const out: { s: number; h: number; spread: number }[] = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      out.push({ s: r.sAt(t), h: r.at(t), spread: 1 + 0.18 * t * t });
    }
    return out;
  }

  /** A timber-shored earth ramp: corduroy planking on top, a log crib wall down the near side. */
  function woodRamp(s: number, pal: typeof WOOD): void {
    const r = rampOf(s);
    if (!r) return;
    const pts = rampSamples(r);
    const P = (i: number, k: number, up = 0): IsoPt => atH(pts[i]!.s, k * pts[i]!.spread, pts[i]!.h + up);
    const G = (i: number, k: number, down = 0.25): IsoPt => atGround(pts[i]!.s, k * pts[i]!.spread, down);
    const n = pts.length - 1;
    // Earth spills out past the crib at the near side.
    const spill: IsoPt[] = [];
    for (let i = 0; i <= n; i++) spill.push(atGround(pts[i]!.s, nearK * pts[i]!.spread * 1.35, 0));
    for (let i = n; i >= 0; i--) spill.push(P(i, nearK, -0.15));
    poly(spill, pal.earthDark);
    // Near crib wall: laid logs under the top edge, an upright every few px.
    const wall: IsoPt[] = [];
    for (let i = 0; i <= n; i++) wall.push(P(i, nearK));
    for (let i = n; i >= 0; i--) wall.push(G(i, nearK));
    poly(wall, pal.crib);
    const g0 = Math.min(...pts.map((p, i) => groundAt(p.s, nearK * pts[i]!.spread)));
    for (let h = g0 + 0.32; h < pts[0]!.h; h += 0.32) {
      let run: IsoPt[] = [];
      for (let i = 0; i <= n; i++) {
        const p = pts[i]!;
        if (h < p.h - 0.08 && h > groundAt(p.s, nearK * p.spread) - 0.2) run.push(atH(p.s, nearK * p.spread, h));
        else {
          if (run.length > 1) polyline(run, pal.cribLine, 0.55);
          run = [];
        }
      }
      if (run.length > 1) polyline(run, pal.cribLine, 0.55);
    }
    for (let i = 0; i <= n; i += 2) line(P(i, nearK), G(i, nearK), pal.post, 0.9);
    // The top: earth with planks laid across it, the runners carried on down.
    const top: IsoPt[] = [];
    for (let i = 0; i <= n; i++) top.push(P(i, -0.5));
    for (let i = n; i >= 0; i--) top.push(P(i, 0.5));
    poly(top, pal.earth);
    for (let i = 0; i < n; i++) {
      if (grit() < 0.15) continue;
      const q = [P(i, -0.47, 0.02), P(i, 0.47, 0.02), P(i + 1, 0.47, 0.02), P(i + 1, -0.47, 0.02)];
      poly(q, grit() < 0.5 ? pal.deck : pal.deckLit);
      line(q[2]!, q[3]!, pal.plank, 0.5);
    }
    for (const k of [-0.27, 0.27]) {
      const run: IsoPt[] = [];
      for (let i = 0; i <= n; i++) run.push(P(i, k, 0.05));
      polyline(run, pal.runner, 1.3);
    }
    // A kerb log down each edge, ending on a stake at the toe.
    for (const k of [farK, nearK]) {
      const run: IsoPt[] = [];
      for (let i = 0; i <= n; i++) run.push(P(i, k * 0.98, 0.15));
      polyline(run, pal.post, 1.3);
      line(P(n, k * 0.98), P(n, k * 0.98, 0.7), pal.post, 1.3);
    }
    line(P(0, nearK), P(n, nearK), pal.edge, 0.6);
  }

  /** A masonry approach: setts on top, a coursed retaining wall and a parapet stepping down to the bank. */
  function stoneRamp(s: number): boolean {
    const r = rampOf(s);
    if (!r) return false;
    const pts = rampSamples(r);
    const n = pts.length - 1;
    const P = (i: number, k: number, up = 0): IsoPt => atH(pts[i]!.s, k * pts[i]!.spread, pts[i]!.h + up);
    const G = (i: number, k: number): IsoPt => atGround(pts[i]!.s, k * pts[i]!.spread, 0.3);
    /** Parapet height, stepping down to a low wall at the toe. */
    const par = (i: number): number => 1.1 - 0.45 * (i / n);
    // Far parapet behind the road.
    const far: IsoPt[] = [];
    for (let i = 0; i <= n; i++) far.push(P(i, farK, par(i)));
    for (let i = n; i >= 0; i--) far.push(P(i, farK));
    poly(far, STONE.parapetFar);
    // Road, setts, kerbs.
    const top: IsoPt[] = [];
    for (let i = 0; i <= n; i++) top.push(P(i, -0.5));
    for (let i = n; i >= 0; i--) top.push(P(i, 0.5));
    poly(top, STONE.road);
    for (let i = 1; i < n; i++) line(P(i, -0.42), P(i, 0.42), STONE.sett, 0.45);
    for (const k of [-0.25, 0, 0.25]) {
      const run: IsoPt[] = [];
      for (let i = 0; i <= n; i++) run.push(P(i, k));
      polyline(run, STONE.sett, 0.4);
    }
    for (const k of [-0.44, 0.44]) {
      const run: IsoPt[] = [];
      for (let i = 0; i <= n; i++) run.push(P(i, k, 0.06));
      polyline(run, STONE.kerb, 1.1);
    }
    // Near retaining wall, coursed, with level beds cut by the slope.
    const wall: IsoPt[] = [];
    for (let i = 0; i <= n; i++) wall.push(P(i, nearK));
    for (let i = n; i >= 0; i--) wall.push(G(i, nearK));
    poly(wall, STONE.face);
    const g0 = Math.min(...pts.map((p) => groundAt(p.s, nearK * p.spread))) - 0.3;
    let row = 0;
    for (let h = g0 + 0.55; h < pts[0]!.h; h += 0.55, row++) {
      let run: IsoPt[] = [];
      const flush = (): void => {
        if (run.length > 1) polyline(run, STONE.joint, 0.5);
        run = [];
      };
      for (let i = 0; i <= n; i++) {
        const p = pts[i]!;
        if (h < p.h - 0.05 && h > groundAt(p.s, nearK * p.spread) - 0.3) run.push(atH(p.s, nearK * p.spread, h));
        else flush();
      }
      flush();
      for (let i = (row % 2) + 1; i < n; i += 2) {
        const p = pts[i]!;
        if (h + 0.55 > p.h - 0.05 || h < groundAt(p.s, nearK * p.spread) - 0.3) continue;
        line(atH(p.s, nearK * p.spread, h), atH(p.s, nearK * p.spread, h + 0.55), STONE.joint, 0.45);
      }
    }
    // Damp creeping up from the bank.
    const damp: IsoPt[] = [];
    for (let i = 0; i <= n; i++) damp.push(atGround(pts[i]!.s, nearK * pts[i]!.spread, 0.3));
    for (let i = n; i >= 0; i--) damp.push(atH(pts[i]!.s, nearK * pts[i]!.spread, Math.min(pts[i]!.h, groundAt(pts[i]!.s, nearK * pts[i]!.spread) + 0.5 + grit() * 0.3)));
    poly(damp, "rgba(30,34,22,0.35)");
    // Near parapet with its coping.
    const np: IsoPt[] = [];
    for (let i = 0; i <= n; i++) np.push(P(i, nearK, par(i)));
    for (let i = n; i >= 0; i--) np.push(P(i, nearK));
    poly(np, STONE.parapet);
    for (let i = 1; i < n; i += 2) line(P(i, nearK), P(i, nearK, par(i)), STONE.joint, 0.45);
    const cope: IsoPt[] = [];
    for (let i = 0; i <= n; i++) cope.push(P(i, nearK * 0.86, par(i)));
    for (let i = n; i >= 0; i--) cope.push(P(i, nearK * 1.04, par(i) + 0.1));
    poly(cope, STONE.parapetTop);
    line(P(0, nearK), P(n, nearK), STONE.edge, 0.6);
    // The parapets end on a squat block at the toe.
    for (const k of [farK, nearK]) {
      line(P(n, k * 1.04), P(n, k * 1.04, 1.1), k === nearK ? STONE.parapet : STONE.parapetFar, 3.4);
      line(P(n, k * 1.04, 1.1), P(n, k * 1.04, 1.3), STONE.parapetTop, 3.8);
    }
    return true;
  }

  /** The ramp sits in front of the brick when its toe paints lower on screen than the brick's middle. */
  function rampInFront(s: number): boolean {
    const out = s === 0 ? -1 : 1;
    return at(s + (out * 10) / span.length, 0).y > at(0.5, 0).y;
  }

  // ---------------------------------------------------------------- wood

  function woodBent(s: number, pal: typeof WOOD): void {
    // A bent: three piles across the deck, a cap beam, and X braces on the near face, one per storey.
    const top = deck(s) - 0.55;
    const ks = [farK * 0.42, 0, nearK * 0.42];
    for (const k of ks) {
      line(atH(s, k, top), atGround(s, k, 0.35), pal.pile, 1.9);
      line(atH(s, k, top), atGround(s, k, 0.35), pal.pileLit, 0.6);
      ripple(s, k, 1.6);
    }
    const g = Math.max(groundAt(s, farK * 0.42), groundAt(s, nearK * 0.42));
    const storeys = Math.max(1, Math.round((top - g) / 1.6));
    const h = (top - g) / storeys;
    for (let i = 0; i < storeys; i++) {
      const hi = top - h * i - 0.1;
      const lo = top - h * (i + 1) + 0.1;
      line(atH(s, farK * 0.42, hi), atH(s, nearK * 0.42, lo), pal.brace, 0.9);
      line(atH(s, nearK * 0.42, hi), atH(s, farK * 0.42, lo), pal.brace, 0.9);
      if (i > 0) line(atH(s, farK * 0.46, hi + 0.1), atH(s, nearK * 0.46, hi + 0.1), pal.sideDark, 1);
    }
    line(atH(s, farK * 0.5, top), atH(s, nearK * 0.5, top), pal.sideDark, 1.6);
  }

  function woodCrib(s: number, pal: typeof WOOD): void {
    // A log crib holding the bank end: a squat box of laid timbers up to the deck.
    const into = s === 0 ? 1 : -1;
    const s1 = s + into * Math.min(0.28, 6 / span.length);
    const h0 = Math.min(groundAt(s, nearK * 0.6), groundAt(s1, nearK * 0.6)) - 0.2;
    const top = deck(s) - 0.2;
    if (top - h0 < 0.15) return;
    poly([atH(s, nearK * 0.6, top), atH(s1, nearK * 0.6, top), atH(s1, nearK * 0.6, h0), atH(s, nearK * 0.6, h0)], pal.crib);
    poly([atH(s, farK * 0.6, top), atH(s, nearK * 0.6, top), atH(s, nearK * 0.6, h0), atH(s, farK * 0.6, h0)], pal.side);
    for (let h = h0 + 0.35; h < top; h += 0.35) {
      line(atH(s, nearK * 0.6, h), atH(s1, nearK * 0.6, h), pal.cribLine, 0.6);
      line(atH(s, farK * 0.6, h), atH(s, nearK * 0.6, h), pal.cribLine, 0.6);
    }
  }

  function woodRail(k: number, s0: number, s1: number, pal: typeof WOOD): void {
    const gap = 6 / span.length;
    for (let s = s0; s <= s1 + 1e-6; s += gap) line(at(Math.min(s, s1), k), at(Math.min(s, s1), k, 1.25), pal.post, 1.2);
    const rail = (up: number): IsoPt[] => {
      const pts: IsoPt[] = [];
      const n = Math.max(2, Math.ceil(steps * (s1 - s0)));
      for (let i = 0; i <= n; i++) pts.push(at(s0 + ((s1 - s0) * i) / n, k, up));
      return pts;
    };
    polyline(rail(1.15), pal.rail, 1.2);
    polyline(rail(0.6), pal.rail, 0.8);
  }

  function woodDeck(s0: number, s1: number, pal: typeof WOOD): void {
    poly(strip(s0, s1, -0.5, 0.5), pal.deck);
    poly(strip(s0, s1, farK * 0.5, farK * 0.3), pal.deckLit);
    // Planks run across, each its own shade of weathering, now and then one split or gone.
    const plank = 2.2 / span.length;
    for (let s = s0; s < s1 - 1e-6; s += plank) {
      const e = Math.min(s1, s + plank);
      const r = grit();
      if (r < 0.025) poly(strip(s + plank * 0.2, e - plank * 0.2, -0.5, 0.5), "rgba(8,6,4,0.5)");
      else if (r < 0.45) poly(strip(s, e, -0.5, 0.5), r < 0.25 ? "rgba(14,10,6,0.14)" : "rgba(200,190,170,0.05)");
      if (s > s0) line(at(s, -0.5), at(s, 0.5), pal.plank, 0.5);
      if (grit() < 0.12) line(at(s + plank * 0.5, -0.5 + grit() * 0.4), at(s + plank * 0.5, 0.1 + grit() * 0.4), pal.plank, 0.4);
    }
    // Mud carried in on the tracks, and oil where trucks stood.
    grime(s0, s1, Math.round(span.length / 6), 1.1);
    // The trucks ride on two runners laid along, worn dark in the middle.
    for (const k of [-0.27, 0.27]) {
      poly(strip(s0, s1, k - 0.09, k + 0.09, 0.05), pal.runner);
      poly(strip(s0, s1, k - 0.04, k + 0.04, 0.06), "rgba(20,14,8,0.25)");
      polyline(strip(s0, s1, k + 0.09, k + 0.09, 0.05).slice(0, Math.max(2, Math.ceil(steps * (s1 - s0)) + 1)), pal.runnerEdge, 0.5);
    }
  }

  function drawWood(): void {
    const pal = WOOD;
    shadow(0, 1);
    woodRail(farK, 0, 1, pal);
    for (const [s, end] of [
      [0, o.endA],
      [1, o.endB],
    ] as const) {
      if (end === "abut") woodCrib(s, pal);
      else if (clear(s) > 0.3 && (s === 1 || end !== "join")) woodBent(s, pal);
    }
    // A long bay gets a bent in the middle too.
    if (span.length > 20 && clear(0.5) > 0.3) woodBent(0.5, pal);
    const ramps = ([
      [0, o.endA],
      [1, o.endB],
    ] as const).filter(([, end]) => end === "abut").map(([s]) => s);
    for (const s of ramps) if (!rampInFront(s)) woodRamp(s, pal);
    woodDeck(0, 1, pal);
    // Near stringer face under the deck.
    poly(face(0, 1, nearK, 0, (s) => deck(s) - 0.6), pal.side);
    edge(nearK, -0.6, pal.edge, 0.6);
    streaks(nearK, 3, (s) => deck(s) - 0.6);
    for (const s of ramps) if (rampInFront(s)) woodRamp(s, pal);
    for (const [s, end] of [
      [0, o.endA],
      [1, o.endB],
    ] as const) {
      if (end === "break") woodBreakEnd(s, pal);
      if (end === "abut") {
        // The rail ends on a heavier post.
        for (const k of [farK, nearK]) line(at(s, k), at(s, k, 1.5), pal.post, 2);
      }
    }
    woodRail(nearK, 0, 1, pal);
  }

  function woodBreakEnd(s: number, pal: typeof WOOD): void {
    // Snapped planks splay down toward the water where the next bay fell.
    const dir = s === 0 ? 1 : -1;
    for (let i = 0; i < 4; i++) {
      const k = -0.4 + i * 0.27 + (rand() - 0.5) * 0.08;
      const from = at(s + dir * 0.02, k);
      const reach = (0.12 + rand() * 0.14) * -dir;
      const p = world(s + reach, k);
      const to = o.project(p.x, p.y, Math.max(groundAt(s + reach, k), deck(s) - 0.6 - rand() * 1.2));
      line(from, to, pal.deck, 1.6);
      line(from, to, pal.edge, 0.4);
    }
    const jag: IsoPt[] = [];
    for (let k = -0.5; k <= 0.5001; k += 0.125) jag.push(at(s + dir * rand() * (3 / span.length), k));
    polyline(jag, pal.edge, 1.2);
  }

  function drawWoodRuin(): void {
    const pal = WOOD_BURNT;
    // Broken pile stumps stand in the water; the bay's planks hang off the bays still up.
    if (wetAt(0.5)) {
      for (const k of [farK * 0.42, nearK * 0.42]) {
        line(atGround(0.5, k, -0.6 - rand() * 0.8), atGround(0.5, k, 0.3), pal.pile, 1.8);
        ripple(0.5, k, 1.4);
      }
    }
    if (clear(0.5) < 0.6 && !wetAt(0.5)) {
      // Ashore and low it is only a heap of timber.
      debris(0.2, 0.8, pal.deck, pal.edge, 8, 1.6);
      return;
    }
    hanging(0, o.endA === "join", pal.deck, pal.edge, pal.plank);
    hanging(1, o.endB === "join", pal.deck, pal.edge, pal.plank);
    debris(0.3, 0.7, pal.deck, pal.edge, 6, 1.5);
  }

  // ---------------------------------------------------------------- stone

  /** Bottom of the near/far face at s: the arch intrados between the piers, the ground at the piers. */
  function archBottom(s: number, k: number): number {
    const g = groundAt(s, k) - 0.3;
    if (!arched) return g;
    const crown = deck(s) - fill;
    // A segmental arch, as high as half its span allows; tall piers carry it in a deep valley.
    const half = 0.5 - pier;
    const rise = Math.max(0.6, Math.min(crown - g, (span.length * half) / 4.5));
    const spring = crown - rise;
    const u = (s - 0.5) / half;
    if (Math.abs(u) >= 1) return g;
    return Math.max(g, spring + rise * Math.sqrt(1 - u * u));
  }

  function stoneFace(k: number, color: string): IsoPt[] {
    const pts: IsoPt[] = [];
    const n = steps * 3;
    for (let i = 0; i <= n; i++) pts.push(at(i / n, k, -0.05));
    for (let i = n; i >= 0; i--) {
      const s = i / n;
      pts.push(atH(s, k, archBottom(s, k)));
    }
    poly(pts, color);
    return pts;
  }

  /** Coursed ashlar on the near face: level beds, joints staggered course to course. */
  function ashlar(k: number): void {
    const course = 0.55;
    const n = steps * 3;
    let row = 0;
    for (let h = course; h < 12; h += course, row++) {
      let any = false;
      let run: IsoPt[] = [];
      for (let i = 0; i <= n; i++) {
        const s = i / n;
        const lvl = deck(s) - h;
        if (lvl <= archBottom(s, k) + 0.05) {
          if (run.length > 1) polyline(run, STONE.joint, 0.5);
          run = [];
          continue;
        }
        any = true;
        run.push(atH(s, k, lvl));
      }
      if (run.length > 1) polyline(run, STONE.joint, 0.5);
      if (!any) break;
      // Head joints, staggered; every block weathered its own shade.
      const stone = 5.5 / span.length;
      for (let s = (row % 2) * stone * 0.5 + stone; s < 1; s += stone) {
        const hi = deck(s) - h + course;
        const lo = deck(s) - h;
        const e = Math.min(1, s + stone);
        const r = grit();
        if (r < 0.6 && lo > archBottom(s, k) + 0.05 && deck(e) - h > archBottom(e, k) + 0.05 && deck((s + e) / 2) - h > archBottom((s + e) / 2, k) + 0.05) {
          const tone = r < 0.3 ? `rgba(12,10,8,${(0.08 + r * 0.4).toFixed(2)})` : r < 0.5 ? "rgba(180,170,150,0.06)" : "rgba(40,44,30,0.14)";
          poly([atH(s, k, lo), atH(e, k, deck(e) - h), atH(e, k, Math.min(deck(e) - 0.05, deck(e) - h + course)), atH(s, k, Math.min(deck(s) - 0.05, hi))], tone);
        }
        if (lo <= archBottom(s, k) + 0.05 || hi > deck(s) - 0.05) continue;
        line(atH(s, k, hi), atH(s, k, lo), STONE.joint, 0.5);
      }
    }
  }

  /**
   * Pointed cutwaters nose out of the piers on face k, from the riverbed up to a capped
   * starling just under the arches' crown. Each joint's pier is drawn by one brick only.
   */
  function cutwaters(k: number): void {
    if (!arched) return;
    for (const [s, end] of [
      [0, o.endA],
      [1, o.endB],
    ] as const) {
      if (end === "abut" || (s === 0 && end === "join")) continue;
      const out = k * 1.3;
      const top = deck(s) - fill - 0.2;
      const g = Math.min(groundAt(s, k), groundAt(s, out)) - 0.3;
      const a0 = atH(s - pier, k, top);
      const b0 = atH(s + pier, k, top);
      const tip = atH(s, out, top);
      poly([a0, tip, atH(s, out, g), atH(s - pier, k, g)], STONE.pier);
      poly([tip, b0, atH(s + pier, k, g), atH(s, out, g)], STONE.pierDark);
      for (let h = g + 0.55; h < top; h += 0.55) {
        polyline([atH(s - pier, k, h), atH(s, out, h), atH(s + pier, k, h)], STONE.joint, 0.45);
      }
      poly([a0, tip, b0, atH(s, k * 0.9, top + 0.15)], STONE.parapetTop);
      ripple(s, out, 2.2);
    }
  }

  function drawStone(): void {
    shadow(0, 1);
    // Far parapet behind the road.
    poly(face(0, 1, farK, 1.1, (s) => deck(s)), STONE.parapetFar);
    poly(strip(0, 1, farK, farK * 0.86, 1.1), STONE.parapetTop);
    // Far spandrel, then the dark barrel of the arch between the two faces.
    stoneFace(farK, STONE.faceFar);
    if (arched) {
      const n = steps * 3;
      const soffit: IsoPt[] = [];
      for (let i = 0; i <= n; i++) soffit.push(atH(i / n, farK, archBottom(i / n, farK)));
      for (let i = n; i >= 0; i--) soffit.push(atH(i / n, nearK, archBottom(i / n, nearK)));
      poly(soffit, STONE.soffit);
    }
    cutwaters(farK);
    const abuts = ([
      [0, o.endA],
      [1, o.endB],
    ] as const).filter(([, end]) => end === "abut").map(([s]) => s);
    const ramped = abuts.filter((s) => rampOf(s));
    for (const s of ramped) if (!rampInFront(s)) stoneRamp(s);
    // The roadway: old setts between kerb stones, worn into two dark tracks.
    poly(strip(0, 1, -0.5, 0.5), STONE.road);
    poly(strip(0, 1, farK * 0.5, farK * 0.3), STONE.roadLit);
    for (const k of [-0.24, 0.24]) poly(strip(0, 1, k - 0.08, k + 0.08), "rgba(16,14,11,0.2)");
    for (let d = 1.6; d < span.length; d += 1.6) line(at(d / span.length, -0.4), at(d / span.length, 0.4), STONE.sett, 0.45);
    for (const k of [-0.25, 0, 0.25]) polyline(strip(0, 1, k, k).slice(0, steps + 1), STONE.sett, 0.4);
    grime(0, 1, Math.round(span.length / 4), 2.2);
    for (const k of [-0.44, 0.44]) poly(strip(0, 1, k - 0.05, k + 0.05, 0.06), STONE.kerb);
    // Near spandrel: coursed stone, a voussoir ring round the arch, moss low down.
    stoneFace(nearK, STONE.face);
    ashlar(nearK);
    if (arched) {
      const n = steps * 3;
      const inner: IsoPt[] = [];
      const outer: IsoPt[] = [];
      for (let i = 0; i <= n; i++) {
        const s = pier + ((1 - 2 * pier) * i) / n;
        const b = archBottom(s, nearK);
        inner.push(atH(s, nearK, b));
        outer.push(atH(s, nearK, Math.min(deck(s) - 0.2, b + 0.55)));
      }
      poly([...outer, ...inner.reverse()], STONE.ring);
      inner.reverse();
      // Radial joints between the voussoirs.
      for (let i = 0; i <= n; i += 2) line(inner[i]!, outer[i]!, STONE.ringJoint, 0.5);
      polyline(inner, STONE.edge, 0.7);
      // Damp and moss where the stone meets the water.
      for (const s of [pier * 0.5, 1 - pier * 0.5]) {
        if (!wetAt(s, nearK)) continue;
        const g = groundAt(s, nearK);
        poly([atH(s - pier * 0.5, nearK, g), atH(s + pier * 0.5, nearK, g), atH(s + pier * 0.5, nearK, g + 0.7), atH(s - pier * 0.5, nearK, g + 0.5)], STONE.moss);
      }
    }
    streaks(nearK, Math.round(span.length / 8), (s) => archBottom(s, nearK));
    cutwaters(nearK);
    edge(nearK, -0.05, STONE.edge, 0.6);
    for (const [s, end] of [
      [0, o.endA],
      [1, o.endB],
    ] as const) {
      if (end === "break") stoneBreakEnd(s);
      if (end === "abut" && !ramped.includes(s)) stoneWing(s);
    }
    // Near parapet: coursed blocks under a projecting coping.
    poly(face(0, 1, nearK, 1.1, (s) => deck(s)), STONE.parapet);
    edge(nearK, 0.55, STONE.joint, 0.5);
    const block = 4 / span.length;
    for (let s = block; s < 1; s += block) line(at(s, nearK, 0), at(s, nearK, 0.55), STONE.joint, 0.45);
    for (let s = block * 0.5; s < 1; s += block) line(at(s, nearK, 0.55), at(s, nearK, 1.1), STONE.joint, 0.45);
    poly(strip(0, 1, nearK * 0.86, nearK * 1.04, 1.1, 1.2), STONE.parapetTop);
    // Chipped coping and soot along the parapet.
    for (let i = 0; i < Math.round(span.length / 6); i++) {
      const s = grit();
      const ds = (0.6 + grit() * 1.4) / span.length;
      poly([at(s, nearK * 0.9, 1.12), at(s + ds, nearK * 0.9, 1.12), at(s + ds, nearK * 1.04, 1.0 - grit() * 0.3), at(s, nearK * 1.04, 1.05)], grit() < 0.5 ? "rgba(14,12,9,0.3)" : STONE.parapet);
    }
    edge(nearK * 1.04, 1.1, STONE.edge, 0.5);
    for (const s of ramped) if (rampInFront(s)) stoneRamp(s);
  }

  function stoneWing(s: number): void {
    // Wing walls splay out into the bank, and a pier block ends each parapet.
    const out = s === 0 ? -10 / span.length : 1 + 10 / span.length;
    for (const k of [farK, nearK]) {
      const tip = world(out, k * 1.45);
      const g = o.ground(tip.x, tip.y);
      const base = groundAt(s, k) - 0.2;
      const pts = [at(s, k, 1.1), o.project(tip.x, tip.y, Math.max(g + 0.6, Math.min(deck(s) + 1.1, g + 1.2))), o.project(tip.x, tip.y, g - 0.2), atH(s, k, base)];
      poly(pts, k === nearK ? STONE.face : STONE.faceFar);
      line(pts[0]!, pts[1]!, STONE.parapetTop, 1.2);
      // End pier block with a cap.
      const p0 = at(s, k * 1.06, 0);
      const p1 = at(s, k * 1.06, 1.6);
      line(p0, p1, STONE.parapet, 3.6);
      line(at(s, k * 1.06, 1.6), at(s, k * 1.06, 1.85), STONE.parapetTop, 4.2);
    }
  }

  function stoneBreakEnd(s: number): void {
    const dir = s === 0 ? 1 : -1;
    const jag: IsoPt[] = [];
    for (let k = -0.5; k <= 0.5001; k += 0.1) jag.push(at(s + dir * rand() * (4 / span.length), k, -rand() * 0.3));
    polyline(jag, STONE.edge, 1.4);
    // Loose blocks tumbled from the broken arch.
    for (let i = 0; i < 4; i++) {
      const k = -0.4 + i * 0.27;
      const p = world(s - dir * (0.06 + rand() * 0.1), k);
      const h = Math.max(o.ground(p.x, p.y), deck(s) - 0.6 - rand() * 1.4);
      const c = o.project(p.x, p.y, h);
      poly([{ x: c.x - 2, y: c.y - 1 }, { x: c.x + 2, y: c.y - 1.5 }, { x: c.x + 2.5, y: c.y + 1.2 }, { x: c.x - 1.5, y: c.y + 1.5 }], STONE.face);
    }
  }

  function drawStoneRuin(): void {
    if (clear(0.5) > 0.6 || wetAt(0.5)) {
      hanging(0, o.endA === "join", STONE.road, STONE.edge, STONE.joint);
      hanging(1, o.endB === "join", STONE.road, STONE.edge, STONE.joint);
      debris(0.3, 0.7, STONE.face, STONE.edge, 6, 3.5);
      return;
    }
    debris(0.15, 0.85, STONE.face, STONE.edge, 8, 3.2);
  }

  // ---------------------------------------------------------------- wreckage

  /**
   * The fallen brick's deck where it hangs off the brick still standing at end `s`:
   * a slab tipped from the joint down into the water or onto the ground, its far edge ragged.
   */
  function hanging(s: number, held: boolean, fillColor: string, edge: string, grain: string): void {
    const dir = s === 0 ? 1 : -1;
    const reach = 0.36 + rand() * 0.1;
    const s1 = s + dir * reach;
    const top = held ? deck(s) - (wood ? 0.15 : 0.35) : groundAt(s, 0) + 0.2;
    const k0 = -0.46;
    const k1 = 0.46;
    const low = (k: number): number => groundAt(s1, k) - (wetAt(s1, k) ? 0.4 : 0);
    const skew = (rand() - 0.5) * 0.5;
    const slab = [atH(s, k0, top), atH(s, k1, top), atH(s1, k1, low(k1) + skew), atH(s1, k0, low(k0) - skew)];
    poly(slab.map((p) => ({ x: p.x, y: p.y + (wood ? 1 : 2) })), wood ? WOOD.sideDark : STONE.soffit);
    poly(slab, fillColor);
    const n = wood ? 7 : 4;
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const a = { x: slab[0]!.x + (slab[3]!.x - slab[0]!.x) * t, y: slab[0]!.y + (slab[3]!.y - slab[0]!.y) * t };
      const b = { x: slab[1]!.x + (slab[2]!.x - slab[1]!.x) * t, y: slab[1]!.y + (slab[2]!.y - slab[1]!.y) * t };
      line(a, b, grain, 0.5);
    }
    const jag: IsoPt[] = [];
    for (let i = 0; i <= 6; i++) {
      const t = i / 6;
      const p = { x: slab[3]!.x + (slab[2]!.x - slab[3]!.x) * t, y: slab[3]!.y + (slab[2]!.y - slab[3]!.y) * t };
      jag.push({ x: p.x + (rand() - 0.5) * 1.5, y: p.y + (rand() - 0.5) * 1.5 });
    }
    polyline(jag, edge, 1.2);
    if (wetAt(s1)) polyline(jag.map((p) => ({ x: p.x, y: p.y + 1.2 })), "rgba(226,238,240,0.45)", 0.8);
    // A railing or parapet stub still on the slab, leaning.
    const kr = nearK * 0.98;
    const r0 = atH(s, kr, top + (wood ? 1.1 : 0.9));
    const r1 = atH(s + dir * reach * 0.6, kr, top - 0.6);
    line(atH(s, kr, top), r0, wood ? WOOD_BURNT.post : STONE.parapet, wood ? 1.2 : 2.4);
    line(r0, r1, wood ? WOOD_BURNT.rail : STONE.parapetTop, wood ? 1 : 2);
  }

  function debris(s0: number, s1: number, fillColor: string, edge: string, count: number, thick: number): void {
    for (let i = 0; i < count; i++) {
      const s = s0 + rand() * (s1 - s0);
      const k = (rand() - 0.5) * 1.3;
      const p = world(s, k);
      const len = (wood ? 7 : 6) * (0.5 + rand() * 0.7);
      const turn = span.facing + (rand() - 0.5) * 2;
      const cx = Math.cos(turn) * len * 0.5;
      const cy = Math.sin(turn) * len * 0.5;
      const wx = -Math.sin(turn) * thick;
      const wy = Math.cos(turn) * thick;
      const g = o.ground(p.x, p.y);
      const tilt = 0.2 + rand() * 0.6;
      const q = [
        o.project(p.x - cx - wx, p.y - cy - wy, g - 0.1),
        o.project(p.x + cx - wx, p.y + cy - wy, g + tilt),
        o.project(p.x + cx + wx, p.y + cy + wy, g + tilt),
        o.project(p.x - cx + wx, p.y - cy + wy, g - 0.1),
      ];
      poly(q, fillColor);
      line(q[1]!, q[2]!, edge, 0.7);
      if (o.wet(p.x, p.y)) polyline([q[0]!, q[3]!].map((v) => ({ x: v.x, y: v.y + 1 })), "rgba(226,238,240,0.4)", 0.7);
    }
  }

  function drawScars(): void {
    const scars = o.ruined ? 0 : Math.round((o.hurt ?? 0) * (wood ? 4 : 5));
    for (let i = 0; i < scars; i++) {
      const s = 0.15 + rand() * 0.7;
      const k = (rand() - 0.5) * 0.7;
      const c = at(s, k);
      const r = (wood ? 2 : 2.6) * (0.7 + rand() * 0.6);
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, r * 1.4, r * 0.7, 0, 0, Math.PI * 2);
      ctx.fillStyle = wood ? "rgba(22,14,8,0.6)" : "rgba(36,34,30,0.55)";
      ctx.fill();
    }
  }
}
