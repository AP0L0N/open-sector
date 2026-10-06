/**
 * Engineer and map bridges, drawn procedurally one brick at a time.
 *
 * A bridge is a run of bricks laid end to end. `layoutBridges` finds where the
 * bricks meet, gives every joint a deck height (the bank's height on land, lifted
 * clear of the water between the banks), and says how each brick ends: arched down
 * onto the bank, joined to the next brick, broken where the next one fell, or cut
 * off over open water. `drawBrick` paints one brick from that.
 *
 * The wooden bridge is a timber trestle: a plank deck with wheel runners, a bent of
 * braced piles under every joint, a log crib where it meets the bank. The concrete
 * one is an arch bridge: one arch per brick between cutwater piers, parapet walls,
 * and wing walls at the banks. A fallen brick leaves its slabs hanging from the
 * bricks either side, slumped into the water, and its rubble in the river.
 */

import { bridgeAxes, bridgeEnds, type BridgeSpan, type BridgeType, type IsoPt } from "@gridlock/shared";

/** Height units the deck rides above the banks once it is clear of them, by type. */
export const BRIDGE_DECK_RISE: Record<BridgeType, number> = { bridge: 1.5, bigbridge: 2.5 };

/**
 * How a brick ends. `abut` comes down onto dry land at the end of the run; `join`
 * meets a standing brick; `break` meets a fallen one; `open` stops over the water
 * (the next brick is not built yet).
 */
export type BrickEnd = "abut" | "join" | "break" | "open";

export interface BrickIn {
  type: BridgeType;
  span: BridgeSpan;
  /** Width of the deck, world px. */
  width: number;
  ruined?: boolean;
}

export interface BrickLayout {
  /** Deck height (height units) at end A (s = 0) and end B (s = 1). */
  ha: number;
  hb: number;
  endA: BrickEnd;
  endB: BrickEnd;
}

/** Deck height at share `s` along a brick. An abutting end eases down onto the bank in an arch. */
export function brickDeckElev(l: Pick<BrickLayout, "ha" | "hb" | "endA" | "endB">, s: number): number {
  const u = Math.max(0, Math.min(1, s));
  const a = l.endA === "abut";
  const b = l.endB === "abut";
  let t = u;
  if (a && !b) t = Math.sin((u * Math.PI) / 2);
  else if (b && !a) t = 1 - Math.cos((u * Math.PI) / 2);
  else if (a && b) t = (1 - Math.cos(u * Math.PI)) / 2;
  const arch = a && b ? Math.sin(u * Math.PI) * 0.6 : 0;
  return l.ha + (l.hb - l.ha) * t + arch;
}

/** Where two bricks count as meeting: end points this close, as a share of the wider deck. */
const JOIN_SHARE = 0.75;

/**
 * Joints, heights, and end kinds for a set of bricks. `ground` is the terrain
 * height at a world point, `wet` whether it is water. Wreckage takes part, so the
 * bricks either side of a fallen one keep their height and break toward it.
 */
export function layoutBridges(
  bricks: readonly BrickIn[],
  ground: (wx: number, wy: number) => number,
  wet: (wx: number, wy: number) => boolean,
): BrickLayout[] {
  const n = bricks.length;
  const ends: { x: number; y: number }[] = [];
  for (const b of bricks) {
    const e = bridgeEnds(b.span);
    ends.push({ x: e.ax, y: e.ay }, { x: e.bx, y: e.by });
  }
  // Union the end points of different bricks that meet.
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
      const tol = JOIN_SHARE * Math.max(bricks[bi]!.width, bricks[bj]!.width);
      if (Math.hypot(ends[i]!.x - ends[j]!.x, ends[i]!.y - ends[j]!.y) > tol) continue;
      const ri = find(i);
      const rj = find(j);
      if (ri !== rj) parent[rj] = ri;
    }
  }
  // Joints: each set of end points that met. Ends of one brick never share a joint.
  const jointOf = new Map<number, number>();
  const joints: { x: number; y: number; count: number; members: number[] }[] = [];
  for (let i = 0; i < 2 * n; i++) {
    const r = find(i);
    let j = jointOf.get(r);
    if (j == null) {
      j = joints.length;
      jointOf.set(r, j);
      joints.push({ x: 0, y: 0, count: 0, members: [] });
    }
    const jt = joints[j]!;
    jt.x += ends[i]!.x;
    jt.y += ends[i]!.y;
    jt.count++;
    jt.members.push(i);
  }
  for (const jt of joints) {
    jt.x /= jt.count;
    jt.y /= jt.count;
  }
  const jA = (b: number): number => jointOf.get(find(2 * b))!;
  const jB = (b: number): number => jointOf.get(find(2 * b + 1))!;
  // The deck graph: joints joined by bricks.
  const adj: { to: number; len: number }[][] = joints.map(() => []);
  for (let b = 0; b < n; b++) {
    const a = jA(b);
    const c = jB(b);
    if (a === c) continue;
    adj[a]!.push({ to: c, len: bricks[b]!.span.length });
    adj[c]!.push({ to: a, len: bricks[b]!.span.length });
  }
  const dry = joints.map((jt) => !wet(jt.x, jt.y));
  const dryIds = joints.map((_, i) => i).filter((i) => dry[i]);
  // Graph distance from every dry joint, for the wet ones to lean on.
  const dist = new Map<number, Float64Array>();
  for (const src of dryIds) {
    const d = new Float64Array(joints.length).fill(Infinity);
    d[src] = 0;
    const open = [src];
    while (open.length > 0) {
      let k = 0;
      for (let q = 1; q < open.length; q++) if (d[open[q]!]! < d[open[k]!]!) k = q;
      const at = open.splice(k, 1)[0]!;
      for (const e of adj[at]!) {
        const nd = d[at]! + e.len;
        if (nd < d[e.to]!) {
          if (d[e.to] === Infinity) open.push(e.to);
          d[e.to] = nd;
        }
      }
    }
    dist.set(src, d);
  }
  const rampOf = (j: number): number => {
    let r = 0;
    for (const m of joints[j]!.members) r = Math.max(r, bricks[m >> 1]!.span.length);
    return r || 24;
  };
  const riseOf = (j: number): number => {
    let r = 0;
    for (const m of joints[j]!.members) r = Math.max(r, BRIDGE_DECK_RISE[bricks[m >> 1]!.type]);
    return r;
  };
  // How far each joint is from a free end of its run: the deck rises off each end
  // over one brick, so the bricks at the banks arch up and the rest ride clear.
  const fromEnd = new Float64Array(joints.length).fill(Infinity);
  const open: number[] = [];
  joints.forEach((jt, j) => {
    if (jt.members.length === 1) {
      fromEnd[j] = 0;
      open.push(j);
    }
  });
  while (open.length > 0) {
    let k = 0;
    for (let q = 1; q < open.length; q++) if (fromEnd[open[q]!]! < fromEnd[open[k]!]!) k = q;
    const at = open.splice(k, 1)[0]!;
    for (const e of adj[at]!) {
      const nd = fromEnd[at]! + e.len;
      if (nd < fromEnd[e.to]!) {
        if (fromEnd[e.to] === Infinity) open.push(e.to);
        fromEnd[e.to] = nd;
      }
    }
  }
  const height = joints.map((jt, j) => {
    const lift = riseOf(j) * Math.min(1, fromEnd[j]! / rampOf(j));
    if (dry[j]) return ground(jt.x, jt.y) + lift;
    const near: { d: number; h: number }[] = [];
    for (const src of dryIds) {
      const d = dist.get(src)![j]!;
      if (Number.isFinite(d)) near.push({ d, h: ground(joints[src]!.x, joints[src]!.y) });
    }
    near.sort((p, q) => p.d - q.d);
    if (near.length === 0) return ground(jt.x, jt.y) + lift;
    if (near.length === 1) return near[0]!.h + lift;
    const [p, q] = near as [{ d: number; h: number }, { d: number; h: number }];
    return (p.h * q.d + q.h * p.d) / (p.d + q.d) + lift;
  });
  const endKind = (b: number, j: number): BrickEnd => {
    const others = joints[j]!.members.filter((m) => m >> 1 !== b);
    if (others.length === 0) return dry[j] ? "abut" : "open";
    if (bricks[b]!.ruined) return others.some((m) => !bricks[m >> 1]!.ruined) ? "join" : "break";
    return others.every((m) => bricks[m >> 1]!.ruined) ? "break" : "join";
  };
  const out: BrickLayout[] = [];
  for (let b = 0; b < n; b++) {
    const a = jA(b);
    const c = jB(b);
    out.push({ ha: height[a]!, hb: height[c]!, endA: endKind(b, a), endB: endKind(b, c) });
  }
  return out;
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

const WOOD = {
  deck: "#8b6b45",
  deckLit: "#9a7a50",
  plank: "rgba(48,30,14,0.42)",
  runner: "#a2835a",
  runnerEdge: "rgba(52,34,18,0.55)",
  side: "#5c4229",
  sideDark: "#45311e",
  edge: "#2f2114",
  pile: "#4b3521",
  pileLit: "#5e4429",
  brace: "#56402a",
  rail: "#6f5334",
  post: "#4f3922",
  crib: "#6a4e30",
  cribLine: "rgba(34,22,10,0.55)",
};
const WOOD_BURNT = { ...WOOD, deck: "#4a3a2b", deckLit: "#55432f", runner: "#5a4733", side: "#2f251b", sideDark: "#251d15", pile: "#2a2018", brace: "#30251b", rail: "#3a2d21", post: "#2a2018" };
const STONE = {
  deck: "#66655f",
  deckLit: "#73716a",
  lane: "rgba(232,224,196,0.55)",
  kerb: "#9a978c",
  parapet: "#aaa69b",
  parapetTop: "#c6c2b6",
  parapetFar: "#8e8a80",
  face: "#908c81",
  faceFar: "#625f57",
  course: "rgba(60,57,50,0.28)",
  ring: "#b3afa3",
  soffit: "#3b3934",
  pier: "#837f74",
  pierDark: "#6a675e",
  edge: "#46443e",
  rebar: "#5a3b2a",
};

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
  const { ux, uy, vx, vy } = bridgeAxes(span.facing);
  const wood = o.type === "bridge";
  const world = (s: number, k: number): { x: number; y: number } => ({
    x: span.x + ux * (s - 0.5) * span.length + vx * k * width,
    y: span.y + uy * (s - 0.5) * span.length + vy * k * width,
  });
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
  // The side whose edge paints lower on screen is toward the viewer.
  const nearK = at(0.5, 0.5).y >= at(0.5, -0.5).y ? 0.5 : -0.5;
  const farK = -nearK;
  // End A or B shows its end face when it points toward the viewer.
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
    const n = Math.max(1, Math.ceil(steps * Math.abs(s1 - s0)));
    for (let i = 0; i <= n; i++) pts.push(at(s0 + ((s1 - s0) * i) / n, k, top));
    for (let i = n; i >= 0; i--) {
      const s = s0 + ((s1 - s0) * i) / n;
      pts.push(atH(s, k, bottom(s)));
    }
    return pts;
  };
  const ripple = (s: number, k: number, r: number): void => {
    const c = atGround(s, k);
    ctx.beginPath();
    ctx.ellipse(c.x, c.y + 0.5, r * 1.3, r * 0.55, 0, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(200,222,226,0.16)";
    ctx.lineWidth = 0.7;
    ctx.stroke();
  };

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
    const body = strip(0, 1, -0.5, 0.5);
    poly(body, o.bad ? "rgba(214,72,58,0.55)" : "rgba(126,214,104,0.42)");
    ctx.strokeStyle = o.bad ? "#ff5a4a" : "#7dff6a";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    body.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.closePath();
    ctx.stroke();
    const tick = o.bad ? "rgba(255,120,100,0.55)" : "rgba(190,255,170,0.5)";
    if (wood) {
      for (let d = 4; d < span.length; d += 4) line(at(d / span.length, -0.5), at(d / span.length, 0.5), tick, 0.6);
    } else {
      line(at(0.5, -0.5), at(0.5, 0.5), tick, 0.8);
      line(at(0.04, 0), at(0.96, 0), tick, 0.8);
    }
    // The arched end where it meets the bank.
    for (const [s, end] of [
      [0, o.endA],
      [1, o.endB],
    ] as const) {
      if (end !== "abut") continue;
      line(at(s, -0.5), at(s, 0.5), o.bad ? "#ff5a4a" : "#e8b84a", 1.6);
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

  // ---------------------------------------------------------------- wood

  function woodBent(s: number, pal: typeof WOOD): void {
    // A bent: three piles across the deck, a cap beam, and an X brace on the near face.
    const top = deck(s) - 0.55;
    const ks = [farK * 0.42, 0, nearK * 0.42];
    for (const k of ks) {
      line(atH(s, k, top), atGround(s, k, 0.35), pal.pile, 1.9);
      line(atH(s, k, top), atGround(s, k, 0.35), pal.pileLit, 0.6);
      ripple(s, k, 1.6);
    }
    const g = Math.max(groundAt(s, farK * 0.42), groundAt(s, nearK * 0.42));
    const mid = (top + g) / 2;
    line(atH(s, farK * 0.42, top - 0.1), atH(s, nearK * 0.42, mid), pal.brace, 0.9);
    line(atH(s, nearK * 0.42, top - 0.1), atH(s, farK * 0.42, mid), pal.brace, 0.9);
    line(atH(s, farK * 0.5, top), atH(s, nearK * 0.5, top), pal.sideDark, 1.6);
  }

  function woodCrib(s: number, pal: typeof WOOD): void {
    // A log crib holding the bank end: a squat box of laid timbers.
    const into = s === 0 ? 1 : -1;
    const s1 = s + into * Math.min(0.28, 6 / span.length);
    const h0 = groundAt(s, 0) - 0.2;
    const top = Math.max(deck(s), deck(s1)) - 0.2;
    if (top - h0 < 0.15) return;
    poly([atH(s, nearK * 0.6, top), atH(s1, nearK * 0.6, top), atH(s1, nearK * 0.6, h0), atH(s, nearK * 0.6, h0)], pal.crib);
    poly([atH(s, farK * 0.6, top), atH(s, nearK * 0.6, top), atH(s, nearK * 0.6, h0), atH(s, farK * 0.6, h0)], pal.side);
    for (let h = h0 + 0.35; h < top; h += 0.35) {
      line(atH(s, nearK * 0.6, h), atH(s1, nearK * 0.6, h), pal.cribLine, 0.6);
      line(atH(s, farK * 0.6, h), atH(s, nearK * 0.6, h), pal.cribLine, 0.6);
    }
  }

  function woodRail(k: number, s0: number, s1: number, pal: typeof WOOD, sag = 0): void {
    const posts: number[] = [];
    const gap = 6 / span.length;
    for (let s = s0; s <= s1 + 1e-6; s += gap) posts.push(Math.min(s, s1));
    for (const s of posts) line(at(s, k), at(s, k, 1.25), pal.post, 1.2);
    const rail = (up: number): IsoPt[] => {
      const pts: IsoPt[] = [];
      const n = Math.max(2, Math.ceil(steps * (s1 - s0)));
      for (let i = 0; i <= n; i++) {
        const s = s0 + ((s1 - s0) * i) / n;
        pts.push(at(s, k, up - sag * Math.sin(((s - s0) / Math.max(1e-6, s1 - s0)) * Math.PI)));
      }
      return pts;
    };
    polyline(rail(1.15), pal.rail, 1.2);
    polyline(rail(0.6), pal.rail, 0.8);
  }

  function woodDeck(s0: number, s1: number, pal: typeof WOOD): void {
    poly(strip(s0, s1, -0.5, 0.5), pal.deck);
    poly(strip(s0, s1, farK * 0.5, farK * 0.15), pal.deckLit);
    // Planks run across; the trucks ride on two runners laid along.
    for (let d = 2; d < span.length * (s1 - s0); d += 2.2) {
      const s = s0 + d / span.length;
      line(at(s, -0.5), at(s, 0.5), pal.plank, 0.5);
    }
    for (const k of [-0.27, 0.27]) {
      poly(strip(s0, s1, k - 0.09, k + 0.09, 0.05), pal.runner);
      polyline(strip(s0, s1, k + 0.09, k + 0.09, 0.05).slice(0, Math.max(2, Math.ceil(steps * (s1 - s0)) + 1)), pal.runnerEdge, 0.5);
    }
  }

  function drawWood(): void {
    const pal = WOOD;
    shadow(0, 1);
    // Far rail behind the deck.
    woodRail(farK, 0, 1, pal);
    for (const [s, end] of [
      [0, o.endA],
      [1, o.endB],
    ] as const) {
      if (end === "abut") woodCrib(s, pal);
      else if (wetAt(s) && (s === 1 || end !== "join")) woodBent(s, pal);
    }
    // A long bay over the water gets a bent in the middle too.
    if (span.length > 20 && wetAt(0.5)) woodBent(0.5, pal);
    woodDeck(0, 1, pal);
    // Near stringer face under the deck.
    poly(face(0, 1, nearK, 0, (s) => deck(s) - 0.6), pal.side);
    line(at(0, nearK, -0.6), at(1, nearK, -0.6), pal.edge, 0.6);
    for (const [s, end] of [
      [0, o.endA],
      [1, o.endB],
    ] as const) {
      if (end === "break") woodBreakEnd(s, pal);
      if (end === "abut") {
        // The rail runs out past the end and bows down to a post in the bank.
        const out = s === 0 ? -0.18 : 1.18;
        for (const k of [farK, nearK]) {
          const tip = atH(out, k * 1.1, groundAt(out, k * 1.1) + 0.6);
          line(at(s, k, 1.15), tip, pal.rail, 1.1);
          line(tip, atH(out, k * 1.1, groundAt(out, k * 1.1)), pal.post, 1.4);
        }
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
      const to = o.project(p.x, p.y, deck(s) - 0.6 - rand() * 1.2);
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
    for (const s of [0.5]) {
      if (!wetAt(s)) continue;
      for (const k of [farK * 0.42, nearK * 0.42]) {
        line(atGround(s, k, -0.6 - rand() * 0.8), atGround(s, k, 0.3), pal.pile, 1.8);
        ripple(s, k, 1.4);
      }
    }
    const allDry = !wetAt(0.5);
    if (allDry) {
      // Ashore it is only a heap of timber.
      debris(0.2, 0.8, pal.deck, pal.edge, 8, 1.6);
      return;
    }
    hanging(0, o.endA === "join", pal.deck, pal.edge, pal.plank);
    hanging(1, o.endB === "join", pal.deck, pal.edge, pal.plank);
    debris(0.3, 0.7, pal.deck, pal.edge, 6, 1.5);
    // A length of rail trailing in the river.
    const r0 = world(0.3 + rand() * 0.1, nearK * 0.7);
    const r1 = world(0.6 + rand() * 0.1, nearK * 0.9);
    line(o.project(r0.x, r0.y, o.ground(r0.x, r0.y) + 0.1), o.project(r1.x, r1.y, o.ground(r1.x, r1.y) + 0.3), pal.rail, 1);
  }

  // ---------------------------------------------------------------- concrete

  /** Bottom of the near/far face at s: the arch soffit over water, the ground ashore. */
  function archBottom(s: number, k: number, arch: boolean, pw: number): number {
    const g = groundAt(s, k) - 0.3;
    if (!arch) return g;
    const crown = deck(s) - 0.9;
    const spring = Math.min(crown - 0.2, Math.max(g, g + 0.5));
    const half = 0.5 - pw;
    const u = (s - 0.5) / half;
    if (Math.abs(u) >= 1) return g;
    return spring + (crown - spring) * Math.sqrt(1 - u * u);
  }

  function stoneFace(k: number, color: string, arch: boolean, pw: number): void {
    // The spandrel: down to the water at the piers, up to the arch between them.
    const pts: IsoPt[] = [];
    const n = steps * 2;
    for (let i = 0; i <= n; i++) pts.push(at(i / n, k, -0.05));
    for (let i = n; i >= 0; i--) {
      const s = i / n;
      pts.push(atH(s, k, archBottom(s, k, arch, pw)));
    }
    poly(pts, color);
  }

  function drawStone(): void {
    const pier = 4 / span.length;
    const arch = wetAt(0.5) && span.length > 16;
    shadow(0, 1);
    // Far parapet behind the deck.
    poly(face(0, 1, farK, 1.1, (s) => deck(s)), STONE.parapetFar);
    poly(strip(0, 1, farK, farK * 0.88, 1.1), STONE.parapetTop);
    // Far spandrel, then the dark underside of the arch between the two faces.
    stoneFace(farK, STONE.faceFar, arch, pier);
    if (arch) {
      const n = steps * 2;
      const soffit: IsoPt[] = [];
      for (let i = 0; i <= n; i++) {
        const s = i / n;
        soffit.push(atH(s, farK, archBottom(s, farK, arch, pier)));
      }
      for (let i = n; i >= 0; i--) {
        const s = i / n;
        soffit.push(atH(s, nearK, archBottom(s, nearK, arch, pier)));
      }
      poly(soffit, STONE.soffit);
    }
    // Piers stand under the joints over water, with a cutwater nosing out each side.
    for (const s of [0, 1]) {
      if (!wetAt(s)) continue;
      for (const k of [farK, nearK]) {
        const out = k * 1.22;
        const top = deck(s) - 1.1;
        const g = groundAt(s, k);
        const a = atH(s - pier, k, top);
        const b = atH(s + pier, k, top);
        const tip = atH(s, out, top - 0.2);
        poly([a, tip, atH(s, out, g - 0.3), atH(s - pier, k, g - 0.3)], STONE.pier);
        poly([tip, b, atH(s + pier, k, g - 0.3), atH(s, out, g - 0.3)], STONE.pierDark);
        ripple(s, out, 2.2);
      }
    }
    // The deck: a tarred carriageway between kerbs, a dashed centre line.
    poly(strip(0, 1, -0.5, 0.5), STONE.deck);
    poly(strip(0, 1, farK * 0.5, farK * 0.2), STONE.deckLit);
    for (const k of [-0.42, 0.42]) poly(strip(0, 1, k - 0.06, k + 0.06, 0.08), STONE.kerb);
    ctx.setLineDash([3.5, 3]);
    polyline([at(0.05, 0, 0.02), at(0.95, 0, 0.02)], STONE.lane, 0.8);
    ctx.setLineDash([]);
    // Near spandrel with its arch ring and coursing.
    stoneFace(nearK, STONE.face, arch, pier);
    for (let h = 0.6; h < 4; h += 0.6) {
      const pts: IsoPt[] = [];
      for (let i = 0; i <= steps; i++) {
        const s = i / steps;
        const lvl = deck(s) - h;
        if (lvl <= archBottom(s, nearK, arch, pier) + 0.05) {
          if (pts.length > 1) polyline(pts.splice(0), STONE.course, 0.5);
          else pts.length = 0;
          continue;
        }
        pts.push(atH(s, nearK, lvl));
      }
      if (pts.length > 1) polyline(pts, STONE.course, 0.5);
    }
    if (arch) {
      const ring: IsoPt[] = [];
      for (let i = 0; i <= steps * 2; i++) {
        const s = pier + ((1 - 2 * pier) * i) / (steps * 2);
        ring.push(atH(s, nearK, archBottom(s, nearK, arch, pier)));
      }
      polyline(ring, STONE.ring, 1.3);
    }
    line(at(0, nearK, -0.05), at(1, nearK, -0.05), STONE.edge, 0.6);
    for (const [s, end] of [
      [0, o.endA],
      [1, o.endB],
    ] as const) {
      if (end === "break") stoneBreakEnd(s);
      if (end === "abut") stoneWing(s);
    }
    // Near parapet with a coping along its top and a panel to each span.
    poly(face(0, 1, nearK, 1.1, (s) => deck(s)), STONE.parapet);
    poly(strip(0, 1, nearK * 0.88, nearK, 1.1), STONE.parapetTop);
    const panel: IsoPt[] = [at(0.12, nearK, 0.25), at(0.88, nearK, 0.25), at(0.88, nearK, 0.85), at(0.12, nearK, 0.85)];
    ctx.beginPath();
    panel.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.closePath();
    ctx.strokeStyle = "rgba(70,66,58,0.35)";
    ctx.lineWidth = 0.6;
    ctx.stroke();
    for (const s of [0, 1]) line(at(s, nearK, 0), at(s, nearK, 1.1), "rgba(70,66,58,0.4)", 0.6);
  }

  function stoneWing(s: number): void {
    // Wing walls fan out into the bank, and a squat pillar ends each parapet.
    const out = s === 0 ? -0.22 : 1.22;
    for (const k of [farK, nearK]) {
      const tip = world(out, k * 1.35);
      const g = o.ground(tip.x, tip.y);
      const base = at(s, k, 0);
      const pts = [at(s, k, 1.1), o.project(tip.x, tip.y, g + 0.5), o.project(tip.x, tip.y, g - 0.2), atH(s, k, groundAt(s, k) - 0.2), base];
      poly(pts, k === nearK ? STONE.face : STONE.faceFar);
      line(at(s, k, 1.1), o.project(tip.x, tip.y, g + 0.5), STONE.parapetTop, 1);
      // End pillar.
      const p0 = at(s, k * 1.05, 0);
      const p1 = at(s, k * 1.05, 1.7);
      line(p0, p1, STONE.parapet, 3.2);
      line(at(s, k * 1.05, 1.7), at(s, k * 1.05, 1.95), STONE.parapetTop, 3.6);
    }
  }

  function stoneBreakEnd(s: number): void {
    const dir = s === 0 ? 1 : -1;
    const jag: IsoPt[] = [];
    for (let k = -0.5; k <= 0.5001; k += 0.1) jag.push(at(s + dir * rand() * (4 / span.length), k, -rand() * 0.3));
    polyline(jag, STONE.edge, 1.4);
    // Bent rebar sticks out of the snapped slab.
    for (let i = 0; i < 5; i++) {
      const k = -0.4 + i * 0.2;
      const from = at(s, k, -0.3);
      const p = world(s - dir * (0.05 + rand() * 0.08), k + (rand() - 0.5) * 0.1);
      line(from, o.project(p.x, p.y, deck(s) - 0.5 - rand() * 0.8), STONE.rebar, 0.7);
    }
  }

  function drawStoneRuin(): void {
    if (wetAt(0.5)) {
      hanging(0, o.endA === "join", STONE.deck, STONE.edge, STONE.course);
      hanging(1, o.endB === "join", STONE.deck, STONE.edge, STONE.course);
      debris(0.3, 0.7, STONE.face, STONE.edge, 5, 4);
      return;
    }
    debris(0.15, 0.85, STONE.face, STONE.edge, 7, 3.5);
  }

  // ---------------------------------------------------------------- wreckage

  /**
   * The fallen brick's deck where it hangs off the brick still standing at end `s`:
   * a slab tipped from the joint down into the water, its far edge ragged.
   */
  function hanging(s: number, held: boolean, fill: string, edge: string, grain: string): void {
    const dir = s === 0 ? 1 : -1;
    const reach = 0.36 + rand() * 0.1;
    const s1 = s + dir * reach;
    const top = held ? deck(s) - (wood ? 0.15 : 0.35) : groundAt(s, 0) + 0.2;
    const k0 = -0.46;
    const k1 = 0.46;
    const wl = (k: number): number => groundAt(s1, k) - 0.4;
    const skew = (rand() - 0.5) * 0.5;
    const slab = [atH(s, k0, top), atH(s, k1, top), atH(s1, k1, wl(k1) + skew), atH(s1, k0, wl(k0) - skew)];
    // Its underside shows first, then the deck face.
    poly(slab.map((p) => ({ x: p.x, y: p.y + (wood ? 1 : 2) })), wood ? WOOD.sideDark : STONE.soffit);
    poly(slab, fill);
    const n = wood ? 7 : 3;
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const a = { x: slab[0]!.x + (slab[3]!.x - slab[0]!.x) * t, y: slab[0]!.y + (slab[3]!.y - slab[0]!.y) * t };
      const b = { x: slab[1]!.x + (slab[2]!.x - slab[1]!.x) * t, y: slab[1]!.y + (slab[2]!.y - slab[1]!.y) * t };
      line(a, b, grain, 0.5);
    }
    // The broken edge in the water, with a little foam.
    const jag: IsoPt[] = [];
    for (let i = 0; i <= 6; i++) {
      const t = i / 6;
      const p = { x: slab[3]!.x + (slab[2]!.x - slab[3]!.x) * t, y: slab[3]!.y + (slab[2]!.y - slab[3]!.y) * t };
      jag.push({ x: p.x + (rand() - 0.5) * 1.5, y: p.y + (rand() - 0.5) * 1.5 });
    }
    polyline(jag, edge, 1.2);
    polyline(jag.map((p) => ({ x: p.x, y: p.y + 1.2 })), "rgba(226,238,240,0.45)", 0.8);
    // A railing or parapet stub still on the slab, leaning.
    const kr = nearK * 0.98;
    const r0 = atH(s, kr, top + (wood ? 1.1 : 0.9));
    const r1 = atH(s + dir * reach * 0.6, kr, top - 0.6);
    line(atH(s, kr, top), r0, wood ? WOOD_BURNT.post : STONE.parapet, wood ? 1.2 : 2.4);
    line(r0, r1, wood ? WOOD_BURNT.rail : STONE.parapetTop, wood ? 1 : 2);
  }

  function debris(s0: number, s1: number, fill: string, edge: string, count: number, thick: number): void {
    for (let i = 0; i < count; i++) {
      const s = s0 + rand() * (s1 - s0);
      const k = (rand() - 0.5) * 1.3;
      const p = world(s, k);
      const len = (wood ? 7 : 9) * (0.5 + rand() * 0.7);
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
      poly(q, fill);
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
