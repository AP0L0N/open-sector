/**
 * The lane a ground unit keeps over a bridge deck.
 *
 * The deck is stamped onto the tile grid (`restampBridges`), so a pulled path
 * may cross it on a slant, in at one edge and out at the other. `laneOverBridges`
 * trades each crossing for the deck's own lane: the unit lines up on the bank,
 * runs the length of the deck, and steps off at the far end.
 *
 * The lane sits toward the deck edge higher on screen (`laneLift`). The near
 * railing stands in front of the deck and hides its near strip, so the road
 * reads as narrower and higher than the deck is; the lane follows the middle of
 * the road the player sees. A crossing whose raised lane the ground does not
 * take runs down the middle of the deck, and one that cannot do even that keeps
 * its old path.
 */

import { bridgeWidth, catalog, isAircraftType, isBridge, isNavalType, snapTankYaw, type EntityType } from "../catalog.js";
import { bridgeAxes, bridgeEnds, inBridge, type BridgeSpan } from "../bridge-plan.js";
import { ISO_TILE_H } from "../iso.js";
import { TILE_WATER } from "../maps.js";
import { climbableDelta, tileHeight } from "./elevation.js";
import { inBounds, isWater, tileIndex, walkable, worldToTile } from "./geo.js";
import type { MatchState, Vec, Waypoint } from "./types.js";

/** Path sampling step, world px. */
const LANE_STEP = 2;
/** How far before and after the water the unit is lined up on the lane, world px, longest first. */
const LANE_RUN_UPS = [12, 6, 0];
/**
 * How far up the screen the lane sits from the middle of the deck, iso px: about
 * half the near railing's height, which hides that much of the road.
 */
export const LANE_LIFT_ISO = 3;
/** Bricks whose facings differ by less than this run as one straight lane, radians. */
const LANE_BEND = 0.02;

interface LaneBrick {
  span: BridgeSpan;
  width: number;
}

const laneCache = new WeakMap<MatchState, LaneBrick[]>();

/** The deck changed: read the bricks again on the next path. */
export function forgetBridgeLanes(state: MatchState): void {
  laneCache.delete(state);
}

function intactBricks(state: MatchState): LaneBrick[] {
  let out = laneCache.get(state);
  if (out) return out;
  out = [];
  for (const e of state.entities.values()) {
    if (!isBridge(e.type) || e.hp <= 0 || e.ruined) continue;
    out.push({ span: { x: e.x, y: e.y, facing: e.facing, length: e.span ?? 0 }, width: bridgeWidth(e.type) });
  }
  laneCache.set(state, out);
  return out;
}

function onDeck(state: MatchState, x: number, y: number): boolean {
  const ts = state.tileSize;
  const tx = worldToTile(x, ts);
  const ty = worldToTile(y, ts);
  if (!inBounds(state, tx, ty)) return false;
  const i = tileIndex(state, tx, ty);
  return state.terrain[i] === TILE_WATER && state.bridgeDeck[i] === 1;
}

function brickAt(bricks: readonly LaneBrick[], x: number, y: number, pad: number): LaneBrick | null {
  for (const b of bricks) if (inBridge(b.span, b.width, x, y, pad)) return b;
  return null;
}

/**
 * The lane's offset from the middle of a brick, world px, toward the edge higher
 * on screen. Screen y grows with world x + y at ISO_TILE_H / (2 tileSize) per px,
 * and a railing lifted h iso px hides h·|ux − uy|·tileSize / ISO_TILE_H world px
 * of the deck across. A deck running up the screen hides nothing and keeps the
 * middle. The lane stays far enough in that every tile it crosses is decked.
 */
export function laneLift(span: BridgeSpan, width: number, tileSize: number): { x: number; y: number } {
  const { ux, uy } = bridgeAxes(span.facing);
  let { vx, vy } = bridgeAxes(span.facing);
  if (vx + vy > 0) {
    vx = -vx;
    vy = -vy;
  }
  const want = (LANE_LIFT_ISO * Math.abs(ux - uy) * tileSize) / ISO_TILE_H;
  const room = width / 2 - (tileSize * Math.SQRT2) / 2 - 0.5;
  const lift = Math.max(0, Math.min(want, room));
  return { x: vx * lift, y: vy * lift };
}

function along(b: LaneBrick, x: number, y: number): number {
  const { ux, uy } = bridgeAxes(b.span.facing);
  return (x - b.span.x) * ux + (y - b.span.y) * uy;
}

function lanePoint(b: LaneBrick, a: number, lift: { x: number; y: number } | null): Vec {
  const { ux, uy } = bridgeAxes(b.span.facing);
  return { x: b.span.x + ux * a + (lift?.x ?? 0), y: b.span.y + uy * a + (lift?.y ?? 0) };
}

/** Where two bricks of a bent line meet, on the lane. */
function jointPoint(a: LaneBrick, b: LaneBrick, ts: number, raised: boolean): Vec {
  const ea = bridgeEnds(a.span);
  const eb = bridgeEnds(b.span);
  let best = { x: 0, y: 0 };
  let bestD = Infinity;
  for (const p of [{ x: ea.ax, y: ea.ay }, { x: ea.bx, y: ea.by }]) {
    for (const q of [{ x: eb.ax, y: eb.ay }, { x: eb.bx, y: eb.by }]) {
      const d = Math.hypot(p.x - q.x, p.y - q.y);
      if (d < bestD) {
        bestD = d;
        best = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
      }
    }
  }
  if (!raised) return best;
  const la = laneLift(a.span, a.width, ts);
  const lb = laneLift(b.span, b.width, ts);
  return { x: best.x + (la.x + lb.x) / 2, y: best.y + (la.y + lb.y) / 2 };
}

/** Dry ground or deck the whole way, no step too steep. */
function laneWalkable(state: MatchState, x0: number, y0: number, x1: number, y1: number, type?: EntityType): boolean {
  const ts = state.tileSize;
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / LANE_STEP));
  let px = worldToTile(x0, ts);
  let py = worldToTile(y0, ts);
  for (let i = 1; i <= n; i++) {
    const tx = worldToTile(x0 + ((x1 - x0) * i) / n, ts);
    const ty = worldToTile(y0 + ((y1 - y0) * i) / n, ts);
    if (tx === px && ty === py) continue;
    if (!walkable(state, tx, ty, type) || isWater(state, tx, ty)) return false;
    if (!climbableDelta(tileHeight(state, tx, ty) - tileHeight(state, px, py))) return false;
    px = tx;
    py = ty;
  }
  return true;
}

interface Sample {
  x: number;
  y: number;
  /** Index into `pts` of the waypoint this sample walks toward. */
  seg: number;
  brick: LaneBrick;
}

/**
 * Stretches of the path on or beside a deck, each sample with the brick it is by.
 * Only a stretch that goes over decked water is a crossing. A path that hugs the
 * deck's stepped edge, in and out of its tiles, is one stretch, not many.
 */
function deckRuns(state: MatchState, bricks: readonly LaneBrick[], fromX: number, fromY: number, pts: readonly Vec[]): Sample[][] {
  const ts = state.tileSize;
  const runs: Sample[][] = [];
  let run: Sample[] | null = null;
  let wet = false;
  const close = (): void => {
    if (run && !wet) runs.pop();
    run = null;
    wet = false;
  };
  let ax = fromX;
  let ay = fromY;
  for (let seg = 0; seg < pts.length; seg++) {
    const p = pts[seg]!;
    const n = Math.max(1, Math.ceil(Math.hypot(p.x - ax, p.y - ay) / LANE_STEP));
    for (let i = seg === 0 ? 0 : 1; i <= n; i++) {
      const x = ax + ((p.x - ax) * i) / n;
      const y = ay + ((p.y - ay) * i) / n;
      const brick = brickAt(bricks, x, y, 0) ?? brickAt(bricks, x, y, ts);
      if (!brick) {
        close();
        continue;
      }
      if (!run) runs.push((run = []));
      run.push({ x, y, seg, brick });
      wet ||= onDeck(state, x, y);
    }
    ax = p.x;
    ay = p.y;
  }
  close();
  return runs;
}

/**
 * The path from (fromX, fromY) through `pts`, each deck crossing on its lane.
 * Boats and aircraft keep their path.
 */
export function laneOverBridges(state: MatchState, fromX: number, fromY: number, pts: Vec[], type?: EntityType): Waypoint[] {
  if (pts.length === 0 || (type && (isNavalType(type) || isAircraftType(type)))) return pts;
  const bricks = intactBricks(state);
  if (bricks.length === 0) return pts;
  const runs = deckRuns(state, bricks, fromX, fromY, pts);
  if (runs.length === 0) return pts;
  const ts = state.tileSize;
  const faced = !!type && !!catalog(type).turnInPlace;

  const out: Waypoint[] = [];
  let next = 0;
  let px = fromX;
  let py = fromY;
  for (const r of runs) {
    const first = r[0]!;
    const last = r[r.length - 1]!;
    const chain: LaneBrick[] = [];
    for (const s of r) if (chain[chain.length - 1] !== s.brick) chain.push(s.brick);
    if (first.seg < next) continue;
    // Waypoints before the crossing stand; the one it walks toward is replaced.
    const before = pts.slice(next, first.seg);
    const prev = before.length > 0 ? before[before.length - 1]! : { x: px, y: py };
    const after = pts[last.seg]!;
    // A goal on the deck is where the player sent it: the lane runs up to it.
    const goalOnDeck = last.seg === pts.length - 1 && onDeck(state, after.x, after.y);

    const b0 = chain[0]!;
    const b1 = chain[chain.length - 1]!;
    const dir0 = Math.sign(along(b0, last.x, last.y) - along(b0, first.x, first.y)) || 1;
    const dir1 = Math.sign(along(b1, last.x, last.y) - along(b1, first.x, first.y)) || 1;
    // Lined up on the bank before the water, never back behind where it walks from.
    const inA = along(b0, first.x, first.y);
    const fromA = along(b0, prev.x, prev.y);
    const entryA = (run: number): number =>
      dir0 > 0 ? Math.max(inA - run, Math.min(inA, fromA)) : Math.min(inA + run, Math.max(inA, fromA));
    const outA = along(b1, last.x, last.y);
    const toA = along(b1, after.x, after.y);
    const exitA = (run: number): number =>
      dir1 > 0 ? Math.min(outA + run, Math.max(outA, toA)) : Math.max(outA - run, Math.min(outA, toA));

    const laneFor = (raised: boolean, run: number): Vec[] => {
      const lift = (b: LaneBrick) => (raised ? laneLift(b.span, b.width, ts) : null);
      const lane: Vec[] = [lanePoint(b0, entryA(run), lift(b0))];
      for (let i = 1; i < chain.length; i++) {
        const a = chain[i - 1]!;
        const b = chain[i]!;
        let d = Math.abs(a.span.facing - b.span.facing) % Math.PI;
        if (d > Math.PI / 2) d = Math.PI - d;
        if (d > LANE_BEND) lane.push(jointPoint(a, b, ts, raised));
      }
      if (!goalOnDeck) lane.push(lanePoint(b1, exitA(run), lift(b1)));
      return lane;
    };
    // A hull that rolls only on its sprite faces cannot hold a deck laid between two
    // of them: it drifts across the whole way. Its run is the nearest face through
    // the middle of the lane, so it drifts half as far and evenly to either side.
    const onFace = (lane: Vec[]): Vec[] => {
      if (lane.length !== 2) return lane;
      const [p, q] = lane as [Vec, Vec];
      const yaw = Math.atan2(q.y - p.y, q.x - p.x);
      const face = snapTankYaw(yaw);
      const half = Math.hypot(q.x - p.x, q.y - p.y) / 2 / Math.max(0.5, Math.cos(face - yaw));
      const mx = (p.x + q.x) / 2;
      const my = (p.y + q.y) / 2;
      const fx = Math.cos(face) * half;
      const fy = Math.sin(face) * half;
      return [
        { x: mx - fx, y: my - fy },
        { x: mx + fx, y: my + fy },
      ];
    };
    const walks = (lane: Vec[]): boolean => {
      const legs = [prev, ...lane, after];
      for (let i = 1; i < legs.length; i++) {
        if (!laneWalkable(state, legs[i - 1]!.x, legs[i - 1]!.y, legs[i]!.x, legs[i]!.y, type)) return false;
      }
      return true;
    };
    // The raised lane first, then the middle; a long run-up first, then a short one
    // where the bank is too ragged to line up on.
    let lane: Vec[] | undefined;
    for (const raised of [true, false]) {
      for (const run of LANE_RUN_UPS) {
        const plain = laneFor(raised, run);
        lane = [faced ? onFace(plain) : plain, ...(faced && !raised ? [plain] : [])].find(walks);
        if (lane) break;
      }
      if (lane) break;
    }
    if (!lane) continue;
    out.push(...before, ...lane.map((p): Waypoint => ({ ...p, deck: true })));
    next = last.seg;
    const tail = out[out.length - 1]!;
    px = tail.x;
    py = tail.y;
  }
  out.push(...pts.slice(next));
  return out;
}
