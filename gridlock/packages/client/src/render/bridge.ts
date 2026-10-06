/**
 * Engineer and map bridges, drawn procedurally one brick at a time.
 *
 * A bridge is a run of bricks laid end to end. Every brick of a line keeps one deck
 * level, the ground's height where the line was started, and its underside reaches
 * down to whatever lies under it, the way a wall's base follows the ground: water
 * shows under the spans, a valley gets taller piers, a bank comes up to meet the deck.
 * `layoutBridges` finds where the bricks meet and says how each one ends: down onto the
 * bank, joined to the next brick, broken where the next one fell, or cut off over open
 * water. `drawBrick` paints one brick from that.
 *
 * The wooden bridge is a timber trestle: a plank deck with wheel runners, a bent of
 * braced piles under every joint, a log crib and an approach ramp at each bank. The
 * stone one is an old masonry arch bridge: one arch per brick between piers with
 * cutwaters that rise into refuges in the parapet, coursed ashlar, a sett roadway,
 * and wing walls at the banks. A fallen brick leaves its deck hanging from the bricks
 * either side, slumped into the water, and its rubble in the river.
 */

import { bridgeAxes, bridgeEnds, type BridgeSpan, type BridgeType, type IsoPt } from "@gridlock/shared";

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

export interface BrickLayout {
  /** Deck height (height units) at end A (s = 0) and end B (s = 1). One level for a whole line. */
  ha: number;
  hb: number;
  endA: BrickEnd;
  endB: BrickEnd;
}

/** Deck height at share `s` along a brick. */
export function brickDeckElev(l: Pick<BrickLayout, "ha" | "hb">, s: number): number {
  const u = Math.max(0, Math.min(1, s));
  return l.ha + (l.hb - l.ha) * u;
}

/** Where two bricks count as meeting: end points this close, as a share of the wider deck. */
const JOIN_SHARE = 0.75;

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
  return bricks.map((b, i) => ({ ha: b.deck, hb: b.deck, endA: endKind(i, 2 * i), endB: endKind(i, 2 * i + 1) }));
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
/** Weathered limestone ashlar, old setts on the roadway. */
const STONE = {
  road: "#6f685d",
  roadLit: "#7a7366",
  sett: "rgba(40,35,28,0.32)",
  kerb: "#9d9483",
  parapet: "#a39a89",
  parapetTop: "#bdb3a0",
  parapetFar: "#867e70",
  face: "#968d7c",
  faceFar: "#6d665a",
  joint: "rgba(52,46,37,0.42)",
  ring: "#aca290",
  ringJoint: "rgba(52,46,37,0.5)",
  soffit: "#3b3730",
  pier: "#8c8372",
  pierDark: "#6c6458",
  edge: "#4a443a",
  moss: "rgba(70,86,48,0.35)",
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

  /**
   * Where a free end meets a bank lower than the deck, a ramp runs on down to it, the
   * length the drop needs. Returns how far past the end it reaches, as a share of the brick.
   */
  function approach(s: number, fill: string, side: string, edge: string): number {
    const out = s === 0 ? -1 : 1;
    const drop = deck(s) - groundAt(s + out * 0.3, 0);
    if (drop < 0.4) return 0;
    const reach = Math.min(1.2, (drop * 7) / span.length);
    const s1 = s + out * reach;
    const lo = (k: number): number => groundAt(s1, k);
    const top: IsoPt[] = [at(s, -0.5), at(s, 0.5), atH(s1, 0.5, lo(0.5)), atH(s1, -0.5, lo(-0.5))];
    poly([at(s, nearK), atH(s1, nearK, lo(nearK)), atGround(s, nearK, 0.2)], side);
    poly(top, fill);
    line(at(s, nearK), atH(s1, nearK, lo(nearK)), edge, 0.8);
    return reach;
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
    for (const [s, end] of [
      [0, o.endA],
      [1, o.endB],
    ] as const) {
      if (end === "abut") approach(s, pal.deck, pal.side, pal.edge);
    }
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
      // Head joints, staggered.
      const stone = 5.5 / span.length;
      for (let s = (row % 2) * stone * 0.5 + stone; s < 1; s += stone) {
        const hi = deck(s) - h + course;
        const lo = deck(s) - h;
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
    for (const [s, end] of [
      [0, o.endA],
      [1, o.endB],
    ] as const) {
      if (end === "abut") approach(s, STONE.road, STONE.faceFar, STONE.edge);
    }
    // The roadway: old setts between kerb stones.
    poly(strip(0, 1, -0.5, 0.5), STONE.road);
    poly(strip(0, 1, farK * 0.5, farK * 0.15), STONE.roadLit);
    for (let d = 1.6; d < span.length; d += 1.6) line(at(d / span.length, -0.4), at(d / span.length, 0.4), STONE.sett, 0.45);
    for (const k of [-0.25, 0, 0.25]) polyline(strip(0, 1, k, k).slice(0, steps + 1), STONE.sett, 0.4);
    for (const k of [-0.44, 0.44]) poly(strip(0, 1, k - 0.05, k + 0.05, 0.06), STONE.kerb);
    // Near spandrel: coursed stone, a voussoir ring round the arch, moss low down.
    const near = stoneFace(nearK, STONE.face);
    void near;
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
    cutwaters(nearK);
    line(at(0, nearK, -0.05), at(1, nearK, -0.05), STONE.edge, 0.6);
    for (const [s, end] of [
      [0, o.endA],
      [1, o.endB],
    ] as const) {
      if (end === "break") stoneBreakEnd(s);
      if (end === "abut") stoneWing(s);
    }
    // Near parapet: coursed blocks under a projecting coping.
    poly(face(0, 1, nearK, 1.1, (s) => deck(s)), STONE.parapet);
    line(at(0, nearK, 0.55), at(1, nearK, 0.55), STONE.joint, 0.5);
    const block = 4 / span.length;
    for (let s = block; s < 1; s += block) line(at(s, nearK, 0), at(s, nearK, 0.55), STONE.joint, 0.45);
    for (let s = block * 0.5; s < 1; s += block) line(at(s, nearK, 0.55), at(s, nearK, 1.1), STONE.joint, 0.45);
    poly(strip(0, 1, nearK * 0.86, nearK * 1.04, 1.1, 1.2), STONE.parapetTop);
    line(at(0, nearK * 1.04, 1.1), at(1, nearK * 1.04, 1.1), STONE.edge, 0.5);
  }

  function stoneWing(s: number): void {
    // Wing walls splay out into the bank, and a pier block ends each parapet.
    const out = s === 0 ? -0.3 : 1.3;
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
