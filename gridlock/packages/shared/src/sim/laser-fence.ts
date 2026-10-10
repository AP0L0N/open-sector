import {
  LASER_FENCE_BEAM_HALF_WIDTH,
  LASER_FENCE_BURN_MIN,
  LASER_FENCE_BURN_SHARE,
  LASER_FENCE_ENERGY_PER_CELL,
  LASER_FENCE_REACH_TILES,
  LASER,
  factionOf,
  isInfantryType,
  secondsToTicks,
  TILE_SUBDIV,
} from "../catalog.js";
import { isAirborne } from "./air.js";
import { takeDamage } from "./crits.js";
import type { MatchState } from "./types.js";

/**
 * The Xenomorph Laser Fence. Each post links to its nearest post of the same owner within
 * LASER_FENCE_REACH_TILES, and to the nearest one on its far side, so a row of posts is one fence.
 * Each link holds two beams. Nothing is stopped by them: soldiers and hulls walk through, rounds
 * fly through. Any ground unit that is not the hive's burns while it touches a beam. A post short
 * on power goes dark, and so do its links.
 */

/** A post as the link rule needs it: the sim's entity and the client's view both fit. */
export interface FencePost {
  id: number;
  ownerId: string | null;
  x: number;
  y: number;
}

/** Each link once, the lower id first. */
export interface FenceLink {
  a: number;
  b: number;
}

/** Links between `posts` (living, lit) that are `reach` world px or nearer: nearest neighbour, then the nearest on the far side. */
export function laserFenceLinks(posts: readonly FencePost[], reach: number): FenceLink[] {
  const seen = new Set<string>();
  const links: FenceLink[] = [];
  const add = (a: number, b: number) => {
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    const key = `${lo}:${hi}`;
    if (seen.has(key)) return;
    seen.add(key);
    links.push({ a: lo, b: hi });
  };
  for (const p of posts) {
    const near = posts
      .filter((o) => o.id !== p.id && o.ownerId === p.ownerId)
      .map((o) => ({ o, d: Math.hypot(o.x - p.x, o.y - p.y) }))
      .filter((n) => n.d > 0 && n.d <= reach)
      .sort((u, v) => u.d - v.d || u.o.id - v.o.id);
    const first = near[0];
    if (!first) continue;
    add(p.id, first.o.id);
    const fx = (first.o.x - p.x) / first.d;
    const fy = (first.o.y - p.y) / first.d;
    // The other way along the line: more than a right angle from the first.
    const far = near.find((n) => n !== first && ((n.o.x - p.x) * fx + (n.o.y - p.y) * fy) / n.d < 0);
    if (far) add(p.id, far.o.id);
  }
  return links;
}

/** Hive energy one link of `lengthPx` world px holds (sim/hive-energy.ts): LASER_FENCE_ENERGY_PER_CELL a cell. */
export function fenceLinkEnergy(lengthPx: number, tileSize: number): number {
  return Math.round((lengthPx / (tileSize * TILE_SUBDIV)) * LASER_FENCE_ENERGY_PER_CELL);
}

/** Hive energy every link between `posts` holds together. */
export function totalFenceLinkEnergy(posts: readonly FencePost[], reach: number, tileSize: number): number {
  if (posts.length < 2) return 0;
  const byId = new Map(posts.map((p) => [p.id, p]));
  let n = 0;
  for (const link of laserFenceLinks(posts, reach)) {
    const a = byId.get(link.a)!;
    const b = byId.get(link.b)!;
    n += fenceLinkEnergy(Math.hypot(b.x - a.x, b.y - a.y), tileSize);
  }
  return n;
}

/** World px a post reaches to its neighbour. */
export function laserFenceReach(state: MatchState): number {
  return LASER_FENCE_REACH_TILES * state.tileSize;
}

/** The lit posts and their links this tick. */
export function liveFenceLinks(state: MatchState): { links: FenceLink[]; posts: Map<number, FencePost> } {
  const posts = new Map<number, FencePost>();
  for (const e of state.entities.values()) {
    if (e.type !== "laserfence" || e.hp <= 0 || e.wreck || e.ruined || e.unpowered) continue;
    posts.set(e.id, e);
  }
  if (posts.size < 2) return { links: [], posts };
  return { links: laserFenceLinks([...posts.values()], laserFenceReach(state)), posts };
}

/** How often a burning unit throws a spark at the beam, so the client sees and hears it. */
const SPARK_SECONDS = 0.4;

/** Every ground unit not of the hive that touches a lit beam burns: LASER_FENCE_BURN_SHARE of its body a second. */
export function tickLaserFences(state: MatchState, dt: number): void {
  const { links, posts } = liveFenceLinks(state);
  if (links.length === 0) return;
  const spark = Math.max(1, secondsToTicks(SPARK_SECONDS));
  for (const o of state.entities.values()) {
    if (o.kind !== "unit" || o.hp <= 0 || o.wreck || o.garrisonedIn != null || isAirborne(o)) continue;
    if (factionOf(o.type) === "xeno") continue;
    for (const link of links) {
      const a = posts.get(link.a)!;
      const b = posts.get(link.b)!;
      const hit = touches(o.x, o.y, o.radius + LASER_FENCE_BEAM_HALF_WIDTH, a, b);
      if (!hit) continue;
      const before = o.hp;
      o.fenceZapTick = state.tick;
      takeDamage(o, Math.max(1, Math.round(Math.max(LASER_FENCE_BURN_MIN, o.hpMax * LASER_FENCE_BURN_SHARE) * dt)), state.tick);
      if (before > 0 && o.hp <= 0 && isInfantryType(o.type)) o.fireDeath = true;
      if (o.hp <= 0 || state.tick % spark === o.id % spark) {
        const ux = b.x - a.x;
        const uy = b.y - a.y;
        const len = Math.hypot(ux, uy) || 1;
        state.impacts.push({
          id: state.nextId++,
          ownerId: a.ownerId ?? "",
          kind: o.hp <= 0 ? "kill" : "hit",
          x: hit.x,
          y: hit.y,
          vx: -uy / len,
          vy: ux / len,
          fromId: a.id,
          caliber: LASER.caliber,
          laser: true,
        });
      }
      break;
    }
  }
}

/** Where a body of radius `r` at (x, y) touches the beam a→b, or null. */
function touches(x: number, y: number, r: number, a: FencePost, b: FencePost): { x: number; y: number } | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  if (l2 < 1e-9) return null;
  const t = Math.min(1, Math.max(0, ((x - a.x) * dx + (y - a.y) * dy) / l2));
  const px = a.x + dx * t;
  const py = a.y + dy * t;
  return Math.hypot(x - px, y - py) <= r ? { x: px, y: py } : null;
}
