/**
 * Engineer bridges, drawn procedurally: a timber trestle (one tank wide) or a
 * concrete span on piers (two abreast). The deck runs at the bank height at
 * each end and lifts a little over the water between. A fallen bridge leaves
 * its footings on both banks and broken pieces in the water.
 */

import { bridgeAxes, type BridgeSpan, type BridgeType, type IsoPt } from "@gridlock/shared";

/** Height units the deck rides above a straight line between its two banks, at mid-water. */
export const BRIDGE_DECK_RISE = 1;

export interface BridgeHeights {
  /** Ground height under each end of the deck. */
  a: number;
  b: number;
}

/**
 * Deck height at share `s` (0 at end A, 1 at end B): the line between the
 * banks, lifted by BRIDGE_DECK_RISE away from the ends. `ramp` is the share
 * of the length over which it climbs at each end.
 */
export function bridgeDeckElev(h: BridgeHeights, s: number, ramp: number): number {
  const u = Math.max(0, Math.min(1, s));
  const edge = Math.min(u, 1 - u);
  const lift = ramp > 0 ? Math.min(1, edge / ramp) : 1;
  return h.a + (h.b - h.a) * u + BRIDGE_DECK_RISE * lift;
}

export interface BridgeDrawOpts {
  type: BridgeType;
  span: BridgeSpan;
  /** Deck width, world px. */
  width: number;
  heights: BridgeHeights;
  /** Share of the length the deck takes to climb off each bank. */
  ramp: number;
  project: (wx: number, wy: number, elev: number) => IsoPt;
  /** Terrain height at a world point. */
  ground: (wx: number, wy: number) => number;
  /** Ground under this point is water (the deck needs supports there). */
  wet: (wx: number, wy: number) => boolean;
  ruined?: boolean;
  /** 0 whole, 1 nearly down. */
  hurt?: number;
  alpha?: number;
  /** Placement ghost: tinted, no detail. `bad` turns it red. */
  ghost?: boolean;
  bad?: boolean;
  /** Stable per bridge, so wreckage and scorch marks do not jump between frames. */
  seed: number;
}

const WOOD = { deck: "#8d6c45", plank: "rgba(58,38,20,0.38)", side: "#5a4128", edge: "#3b2a19", post: "#4a3422", rail: "#6e5233" };
const BURNT = { deck: "#4a3a2b", plank: "rgba(20,14,8,0.45)", side: "#2f251b", edge: "#1d160f", post: "#2a2018", rail: "#3a2d21" };
const STONE = { deck: "#8a877d", joint: "rgba(52,50,46,0.5)", side: "#5c5a53", edge: "#45433e", pier: "#6a675f", pierDark: "#504e48", curb: "#9c998f", curbTop: "#aaa79c", lane: "rgba(222,214,186,0.3)" };

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

export function drawBridge(ctx: CanvasRenderingContext2D, o: BridgeDrawOpts): void {
  const { span, width } = o;
  const { ux, uy, vx, vy } = bridgeAxes(span.facing);
  const world = (s: number, k: number): { x: number; y: number } => ({
    x: span.x + ux * (s - 0.5) * span.length + vx * k * width,
    y: span.y + uy * (s - 0.5) * span.length + vy * k * width,
  });
  const deck = (s: number): number => bridgeDeckElev(o.heights, s, o.ramp);
  const at = (s: number, k: number, up = 0): IsoPt => {
    const p = world(s, k);
    return o.project(p.x, p.y, deck(s) + up);
  };
  const atGround = (s: number, k: number, down = 0): IsoPt => {
    const p = world(s, k);
    return o.project(p.x, p.y, o.ground(p.x, p.y) - down);
  };
  // The side whose edge paints lower on screen is toward the viewer.
  const nearK = at(0.5, 0.5).y >= at(0.5, -0.5).y ? 0.5 : -0.5;
  const farK = -nearK;
  const steps = Math.max(2, Math.ceil(span.length / 6));

  const strip = (s0: number, s1: number, k0: number, k1: number, up0 = 0, up1 = up0): IsoPt[] => {
    const pts: IsoPt[] = [];
    const n = Math.max(1, Math.ceil(steps * (s1 - s0)));
    for (let i = 0; i <= n; i++) pts.push(at(s0 + ((s1 - s0) * i) / n, k0, up0));
    for (let i = n; i >= 0; i--) pts.push(at(s0 + ((s1 - s0) * i) / n, k1, up1));
    return pts;
  };
  const fill = (pts: IsoPt[], color: string): void => {
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
  const overWater = (s: number): boolean => {
    const p = world(s, 0);
    return o.wet(p.x, p.y);
  };

  const prevAlpha = ctx.globalAlpha;
  ctx.globalAlpha = prevAlpha * (o.alpha ?? 1);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (o.ghost) {
    const body = strip(0, 1, -0.5, 0.5);
    fill(body, o.bad ? "rgba(214,72,58,0.55)" : "rgba(126,214,104,0.42)");
    ctx.strokeStyle = o.bad ? "#ff5a4a" : "#7dff6a";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    body.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.closePath();
    ctx.stroke();
    // Cross ticks show the plank or slab rhythm, so the two types read apart.
    const gap = o.type === "bigbridge" ? 24 : 8;
    for (let d = gap; d < span.length; d += gap) {
      const s = d / span.length;
      line(at(s, -0.5), at(s, 0.5), o.bad ? "rgba(255,120,100,0.5)" : "rgba(190,255,170,0.45)", 0.8);
    }
    ctx.globalAlpha = prevAlpha;
    return;
  }

  const rand = rng(o.seed);
  const wood = o.type === "bridge";
  const pal = o.ruined && wood ? BURNT : WOOD;

  // Which stretch of deck still stands: all of it, or the footing on each bank.
  const pieces: [number, number][] = [];
  if (o.ruined) {
    let a = 0;
    while (a < 0.45 && !overWater(a)) a += 0.02;
    let b = 1;
    while (b > 0.55 && !overWater(b)) b -= 0.02;
    pieces.push([0, Math.min(0.45, a + 0.04 + rand() * 0.05)], [Math.max(0.55, b - 0.04 - rand() * 0.05), 1]);
  } else {
    pieces.push([0, 1]);
  }

  // The deck's shadow on the water, cast a little toward the viewer.
  for (const [s0, s1] of pieces) {
    const n = Math.max(1, Math.ceil(steps * (s1 - s0)));
    const pts: IsoPt[] = [];
    for (let i = 0; i <= n; i++) {
      const s = s0 + ((s1 - s0) * i) / n;
      pts.push(atGround(s, -0.55, -0.0));
    }
    for (let i = n; i >= 0; i--) {
      const s = s0 + ((s1 - s0) * i) / n;
      pts.push(atGround(s, 0.55, 0));
    }
    for (const p of pts) p.y += 3;
    fill(pts, "rgba(8,14,12,0.24)");
  }

  // Supports where the deck stands over water, under everything else.
  const gap = wood ? 14 : 34;
  for (let d = gap / 2; d < span.length; d += gap) {
    const s = d / span.length;
    if (!overWater(s)) continue;
    const standing = pieces.some(([s0, s1]) => s >= s0 && s <= s1);
    if (wood) {
      for (const k of [farK * 0.9, nearK * 0.9]) {
        const top = standing ? at(s, k, -0.2) : atGround(s, k, -0.3 - rand() * 0.6);
        line(top, atGround(s, k, 0.4), pal.post, 1.6);
      }
      if (standing) line(at(s, farK * 0.9, -0.5), atGround(s, nearK * 0.9, 0.1), pal.post, 0.8);
    } else {
      const k0 = -0.38;
      const k1 = 0.38;
      const topUp = standing ? -0.9 : 0;
      const tops = standing ? [at(s, k0, topUp), at(s, k1, topUp)] : [atGround(s, k0, -0.5), atGround(s, k1, -0.2 - rand() * 0.4)];
      fill([tops[0]!, tops[1]!, atGround(s, k1, 0.3), atGround(s, k0, 0.3)], STONE.pier);
      const ds = 3 / span.length;
      const nearTop = standing ? at(s + ds, nearK * 0.76, topUp) : atGround(s + ds, nearK * 0.76, -0.3);
      fill([tops[nearK > 0 ? 1 : 0]!, nearTop, atGround(s + ds, nearK * 0.76, 0.3), atGround(s, nearK * 0.76, 0.3)], STONE.pierDark);
    }
  }

  // Wreckage in the water between the footings.
  if (o.ruined) {
    const n = wood ? 7 : 5;
    for (let i = 0; i < n; i++) {
      const s = 0.25 + rand() * 0.5;
      const k = (rand() - 0.5) * 1.2;
      const p = world(s, k);
      if (!o.wet(p.x, p.y)) continue;
      const len = (wood ? 8 : 14) * (0.6 + rand() * 0.6);
      const turn = span.facing + (rand() - 0.5) * 1.6;
      const cx = Math.cos(turn) * len * 0.5;
      const cy = Math.sin(turn) * len * 0.5;
      const wx = -Math.sin(turn) * (wood ? 1.5 : 4);
      const wy = Math.cos(turn) * (wood ? 1.5 : 4);
      const g = o.ground(p.x, p.y);
      const tilt = 0.3 + rand() * 0.6;
      const q = [
        o.project(p.x - cx - wx, p.y - cy - wy, g - 0.1),
        o.project(p.x + cx - wx, p.y + cy - wy, g + tilt),
        o.project(p.x + cx + wx, p.y + cy + wy, g + tilt),
        o.project(p.x - cx + wx, p.y - cy + wy, g - 0.1),
      ];
      fill(q, wood ? pal.deck : STONE.side);
      line(q[1]!, q[2]!, wood ? pal.edge : STONE.edge, 0.7);
    }
  }

  for (const [s0, s1] of pieces) {
    // Far railing behind the deck.
    if (wood) {
      for (let d = 0; d <= span.length * (s1 - s0) + 0.1; d += 8) {
        const s = s0 + d / span.length;
        line(at(s, farK), at(s, farK, 1), pal.post, 1);
      }
      line(at(s0, farK, 0.9), at(s1, farK, 0.9), pal.rail, 1.1);
    } else {
      fill(strip(s0, s1, farK, farK, 0, 0.7), STONE.curb);
    }
    // Deck top.
    fill(strip(s0, s1, -0.5, 0.5), wood ? pal.deck : STONE.deck);
    if (wood) {
      for (let d = 3; d < span.length * (s1 - s0); d += 3) {
        const s = s0 + d / span.length;
        line(at(s, -0.5), at(s, 0.5), pal.plank, 0.6);
      }
    } else {
      for (let d = 24; d < span.length * (s1 - s0); d += 24) {
        const s = s0 + d / span.length;
        line(at(s, -0.5), at(s, 0.5), STONE.joint, 0.8);
      }
      ctx.setLineDash([3, 4]);
      line(at(s0 + 6 / span.length, 0), at(s1 - 6 / span.length, 0), STONE.lane, 0.8);
      ctx.setLineDash([]);
    }
    // Near face of the deck slab.
    const thick = wood ? -0.5 : -0.9;
    fill(strip(s0, s1, nearK, nearK, 0, thick), wood ? pal.side : STONE.side);
    // A broken end is ragged.
    if (o.ruined) {
      const s = s0 === 0 ? s1 : s0;
      const jag: IsoPt[] = [];
      for (let k = -0.5; k <= 0.5001; k += 0.125) jag.push(at(s + (rand() - 0.5) * (6 / span.length), k));
      for (let i = 1; i < jag.length; i++) line(jag[i - 1]!, jag[i]!, wood ? pal.edge : STONE.edge, 1.4);
    }
    // Near railing over the deck.
    if (wood) {
      for (let d = 0; d <= span.length * (s1 - s0) + 0.1; d += 8) {
        const s = s0 + d / span.length;
        line(at(s, nearK), at(s, nearK, 1), pal.post, 1);
      }
      line(at(s0, nearK, 0.9), at(s1, nearK, 0.9), pal.rail, 1.1);
    } else {
      fill(strip(s0, s1, nearK, nearK, 0, 0.7), STONE.curb);
      fill(strip(s0, s1, nearK * 0.9, nearK, 0.7, 0.7), STONE.curbTop);
    }
  }

  // Shell scars on a hurt deck.
  const scars = o.ruined ? 0 : Math.round((o.hurt ?? 0) * (wood ? 6 : 9));
  for (let i = 0; i < scars; i++) {
    const s = 0.1 + rand() * 0.8;
    const k = (rand() - 0.5) * 0.8;
    const c = at(s, k);
    const r = (wood ? 2.2 : 3) * (0.7 + rand() * 0.6);
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, r * 1.4, r * 0.7, 0, 0, Math.PI * 2);
    ctx.fillStyle = wood ? "rgba(22,14,8,0.55)" : "rgba(40,38,34,0.5)";
    ctx.fill();
  }
  ctx.globalAlpha = prevAlpha;
}
