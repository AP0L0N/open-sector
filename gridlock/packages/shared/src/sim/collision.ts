import {
  catalog,
  hasTurret,
  isArmoredType,
  isInfantryType,
  isNavalType,
  wadesOf,
  isMotorVehicle,
  REVERSE_TILES,
  snapTankYaw,
  TICK_DT,
  TILE_SIZE,
  TRACK_ARRIVE_SLOP,
  UNIT_SPACE_PAD,
} from "../catalog.js";
import { moveSpeedMul, takeDamage } from "./crits.js";
import { setPath } from "./path.js";
import { allies, crushTreeAt, inBounds, isTree, isWall, isWater, jetAloft, occupant, tileCenter, tileIndex, walkable, worldToTile } from "./geo.js";
import type { Entity, MatchState } from "./types.js";

/** Ground unit that takes part in collision. Aircraft never do, parked or flying, nor a Jump Jet in the air. */
export function isActiveUnit(e: Entity): boolean {
  return e.kind === "unit" && e.hp > 0 && !e.wreck && !e.garrisonedIn && !e.air && !jetAloft(e);
}

export function massOf(e: Entity): number {
  if (e.wreck || e.kind === "building") return 1e9;
  const moving = e.waypoints.length > 0 || e.state === "move" || e.state === "attack";
  let base = 4;
  if (isArmoredType(e.type)) base = 8;
  else if (isInfantryType(e.type)) base = 1;
  return moving ? base * 2.2 : base;
}

export function rolling(e: Entity): boolean {
  return e.waypoints.length > 0 || e.state === "move" || e.state === "attack";
}

export function canCrush(state: MatchState, mover: Entity, victim: Entity): boolean {
  if (!isActiveUnit(mover) || !isActiveUnit(victim)) return false;
  if (!isArmoredType(mover.type) || !isInfantryType(victim.type)) return false;
  if (allies(state, mover.ownerId, victim.ownerId)) return false;
  return rolling(mover);
}

/** Friendly infantry step out of an armored hull's way. A hull never gives way to them. */
export function makesWayFor(state: MatchState, walker: Entity, hull: Entity): boolean {
  if (!isActiveUnit(walker) || !isActiveUnit(hull)) return false;
  if (!isInfantryType(walker.type) || !isArmoredType(hull.type)) return false;
  return allies(state, walker.ownerId, hull.ownerId);
}

function tileFree(state: MatchState, e: Entity, x: number, y: number): boolean {
  const ts = state.tileSize;
  const tx = worldToTile(x, ts);
  const ty = worldToTile(y, ts);
  if (!inBounds(state, tx, ty)) return false;
  if (isWall(state, tx, ty)) return false;
  if (isNavalType(e.type)) {
    if (!isWater(state, tx, ty)) return false;
  } else if (isWater(state, tx, ty) && !isInfantryType(e.type) && !wadesOf(e.type)) return false;
  if (isTree(state, tx, ty) && !walkable(state, tx, ty, e.type)) return false;
  const idx = tileIndex(state, tx, ty);
  const fort = state.fortBlock[idx] ?? 0;
  // An unlocked gate lifts for its owner's side; anyone else stops at the boom.
  const shutGate = fort === 3 && !allies(state, e.ownerId, state.fortOwner.get(idx) ?? "");
  if (fort === 1 || (fort === 2 && !isInfantryType(e.type)) || shutGate) {
    const cx = worldToTile(e.x, ts);
    const cy = worldToTile(e.y, ts);
    if (tx !== cx || ty !== cy) return false;
  }
  const occ = occupant(state, tx, ty);
  if (occ !== 0 && occ !== e.id) {
    const cx = worldToTile(e.x, ts);
    const cy = worldToTile(e.y, ts);
    if (tx === cx && ty === cy) return true;
    return false;
  }
  return true;
}

export function crushTreesUnder(state: MatchState, e: Entity): void {
  if (!isActiveUnit(e) || !isMotorVehicle(e.type)) return;
  if (!rolling(e)) return;
  const ts = state.tileSize;
  const r = e.radius + ts * 0.45;
  const x0 = worldToTile(e.x - r, ts);
  const x1 = worldToTile(e.x + r, ts);
  const y0 = worldToTile(e.y - r, ts);
  const y1 = worldToTile(e.y + r, ts);
  const reach = r * r;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (!inBounds(state, x, y)) continue;
      const cx = tileCenter(x, ts);
      const cy = tileCenter(y, ts);
      const dx = e.x - cx;
      const dy = e.y - cy;
      if (dx * dx + dy * dy > reach) continue;
      if (!crushTreeAt(state, x, y)) continue;
      state.impacts.push({
        id: state.nextId++,
        ownerId: e.ownerId,
        kind: "crush",
        x: cx,
        y: cy,
        vx: Math.cos(e.facing),
        vy: Math.sin(e.facing),
      });
    }
  }
}

/**
 * Two friendly units that are both on the move may brush this far into each
 * other; the separation pass eases them apart. A column flows past itself
 * instead of locking up on hard contact.
 */
const FRIENDLY_MOVER_SQUEEZE = 0.6;

/** The unit `e` would run into standing at (x, y), if any. */
function blockerAt(
  state: MatchState,
  e: Entity,
  x: number,
  y: number,
  ignoreId?: number,
  passes?: (o: Entity) => boolean,
): Entity | null {
  const r = e.radius;
  const moving = rolling(e);
  for (const o of state.entities.values()) {
    if (o.id === e.id || o.id === ignoreId || o.hp <= 0 || o.garrisonedIn) continue;
    if (passes?.(o)) continue;
    if (o.kind === "building" || o.air || jetAloft(o)) continue;
    let need = r + o.radius;
    const dx = x - o.x;
    const dy = y - o.y;
    const newD = dx * dx + dy * dy;
    if (newD >= need * need) continue;
    if (canCrush(state, e, o)) continue;
    if (moving && makesWayFor(state, o, e)) continue;
    // A soldier also slips through the gap between parked friendly vehicles.
    if (moving && !o.wreck && (rolling(o) || isInfantryType(e.type)) && allies(state, e.ownerId, o.ownerId)) {
      need *= FRIENDLY_MOVER_SQUEEZE;
      if (newD >= need * need) continue;
    }
    const odx = e.x - o.x;
    const ody = e.y - o.y;
    const oldD = odx * odx + ody * ody;
    if (oldD < need * need && newD + 1e-6 >= oldD) continue;
    return o;
  }
  return null;
}

function canStand(state: MatchState, e: Entity, x: number, y: number, ignoreId?: number): boolean {
  return tileFree(state, e, x, y) && !blockerAt(state, e, x, y, ignoreId);
}

function yieldSide(across: number, id: number): 1 | -1 {
  if (across > 0.5) return 1;
  if (across < -0.5) return -1;
  return id % 2 === 0 ? 1 : -1;
}

export function resolveMove(
  state: MatchState,
  e: Entity,
  wantX: number,
  wantY: number,
): { x: number; y: number; blocked: boolean } {
  const tryPos = (x: number, y: number): boolean => canStand(state, e, x, y);
  if (tryPos(wantX, wantY)) return { x: wantX, y: wantY, blocked: false };
  const dx = wantX - e.x;
  const dy = wantY - e.y;
  const len = Math.hypot(dx, dy) || 1;
  const px = -dy / len;
  const py = dx / len;
  const step = len;
  for (const mul of [1, 2, 3]) {
    for (const sign of [1, -1] as const) {
      const sx = e.x + px * sign * step * mul;
      const sy = e.y + py * sign * step * mul;
      if (tryPos(sx, sy)) return { x: sx, y: sy, blocked: false };
    }
  }
  for (let f = 0.7; f >= 0.15; f -= 0.2) {
    const sx = e.x + dx * f;
    const sy = e.y + dy * f;
    if (tryPos(sx, sy)) return { x: sx, y: sy, blocked: false };
  }
  return { x: e.x, y: e.y, blocked: true };
}

/** Advance along waypoints without passing through other units. */
export function moveWithCollision(
  state: MatchState,
  e: Entity,
  speed: number,
  dt: number,
  reverse = false,
  acrossSlop = TRACK_ARRIVE_SLOP,
): boolean {
  const wp = e.waypoints[0];
  if (!wp) return false;
  const dx = wp.x - e.x;
  const dy = wp.y - e.y;
  const dist = Math.hypot(dx, dy);
  const step = speed * dt;
  let wantX: number;
  let wantY: number;
  let arrive = false;
  const tracks = !!catalog(e.type).turnInPlace;
  const slop = Math.max(TRACK_ARRIVE_SLOP, acrossSlop);
  // A few pixels past the waypoint on the travel axis: the steering keeps the
  // face, so the hull would sit there forever. Call it reached.
  let overshot = false;
  if (tracks) {
    const fx = Math.cos(e.facing);
    const fy = Math.sin(e.facing);
    const along = dx * fx + dy * fy;
    const across = dx * -fy + dy * fx;
    // Tracks only roll along the hull axis: stop at the waypoint's foot and
    // let the residual lateral miss (path slop + face-grid snap) count as
    // arrival. Re-aiming for it would spin the hull for a few pixels.
    const room = reverse ? Math.max(0, -along) : Math.max(0, along);
    const travel = Math.min(step, room) * (reverse ? -1 : 1);
    wantX = e.x + fx * travel;
    wantY = e.y + fy * travel;
    arrive = Math.abs(along) <= step && Math.abs(across) <= slop;
    const ahead = reverse ? -along : along;
    overshot = ahead < 0 && ahead > -TRACK_ARRIVE_SLOP && Math.abs(across) <= slop;
  } else if (dist <= 2 || dist <= step) {
    wantX = wp.x;
    wantY = wp.y;
    arrive = true;
  } else {
    wantX = e.x + (dx / dist) * step;
    wantY = e.y + (dy / dist) * step;
  }
  const pos = tracks ? resolveAxisMove(state, e, wantX, wantY) : resolveMove(state, e, wantX, wantY);
  e.x = pos.x;
  e.y = pos.y;
  crushTreesUnder(state, e);
  const left = Math.hypot(e.x - wp.x, e.y - wp.y);
  if (!pos.blocked) blockedFor.delete(e);
  if ((arrive && left <= slop) || overshot) {
    e.waypoints.shift();
  } else if (pos.blocked && e.waypoints.length > 1 && left < step * 1.4) {
    e.waypoints.shift();
  } else if (pos.blocked && tracks && !waitForFriend(state, e, wantX, wantY)) {
    planTrackDetour(state, e, reverse);
  }
  return e.waypoints.length > 0;
}

/** Ticks a hull has sat blocked in a row. */
const blockedFor = new WeakMap<Entity, number>();
/** How long a hull waits on a friend that is already moving before it drives around. */
const FRIEND_PATIENCE_TICKS = 30;

/**
 * A friend in the way that is rolling or stepping aside will clear the lane on
 * its own. Hold for a moment instead of laying a detour around it.
 */
function waitForFriend(state: MatchState, e: Entity, wantX: number, wantY: number): boolean {
  const n = (blockedFor.get(e) ?? 0) + 1;
  blockedFor.set(e, n);
  if (n > FRIEND_PATIENCE_TICKS) return false;
  const b = blockerAt(state, e, wantX, wantY);
  if (!b || b.wreck || !allies(state, e.ownerId, b.ownerId)) return false;
  if (rolling(b) || shuffledFor(state, b) || givingWay.has(b)) return true;
  // Nose against a parked friend: ask it to roll aside, then wait for it.
  const dx = wantX - e.x;
  const dy = wantY - e.y;
  const d = Math.hypot(dx, dy);
  return d > 1e-6 && canShuffle(state, b, e) && askToShuffle(state, b, e, dx / d, dy / d);
}

/**
 * Tracked hulls never side-step: the only legal moves are shorter rolls on the
 * same axis. A blocked hull stays put and plans a detour it can drive.
 */
function resolveAxisMove(
  state: MatchState,
  e: Entity,
  wantX: number,
  wantY: number,
): { x: number; y: number; blocked: boolean } {
  const tryPos = (x: number, y: number): boolean => canStand(state, e, x, y);
  if (tryPos(wantX, wantY)) return { x: wantX, y: wantY, blocked: false };
  const dx = wantX - e.x;
  const dy = wantY - e.y;
  for (let f = 0.7; f >= 0.15; f -= 0.2) {
    const sx = e.x + dx * f;
    const sy = e.y + dy * f;
    if (tryPos(sx, sy)) return { x: sx, y: sy, blocked: false };
  }
  return { x: e.x, y: e.y, blocked: true };
}

/** Detour legs the hull is currently driving, so a still-blocked hull waits instead of stacking detours. */
const trackDetour = new WeakMap<Entity, { legs: { x: number; y: number }[]; tick: number }>();
const TRACK_DETOUR_COOLDOWN_TICKS = 5;

/**
 * Blocked with the bow on the lane: lay two legs the hull can drive — a
 * sidestep to a parallel lane, then forward past the obstacle — so it yaws
 * toward each leg and rolls, then yaws back onto its path. Replaces the old
 * perpendicular slide, which moved the hull without turning it.
 */
function planTrackDetour(state: MatchState, e: Entity, back = false): boolean {
  const wp = e.waypoints[0];
  if (!wp) return false;
  const prev = trackDetour.get(e);
  if (prev && (prev.legs.includes(wp) || state.tick - prev.tick < TRACK_DETOUR_COOLDOWN_TICKS)) return false;
  // A hull backing up (a gun hauled trail first) detours along its travel axis, not its bow.
  const travel = back ? e.facing + Math.PI : e.facing;
  const fx = Math.cos(travel);
  const fy = Math.sin(travel);
  const px = -fy;
  const py = fx;
  const across = (wp.x - e.x) * px + (wp.y - e.y) * py;
  const first = yieldSide(across, e.id);
  const base = e.radius * 2 + UNIT_SPACE_PAD;
  const stands = (x: number, y: number): boolean => canStand(state, e, x, y);
  for (const lat of [base, base * 1.5, base * 2]) {
    for (const side of [first, -first] as const) {
      const sx = e.x + px * side * lat;
      const sy = e.y + py * side * lat;
      if (!stands(sx, sy) || !stands((e.x + sx) / 2, (e.y + sy) / 2)) continue;
      const ahead = lat * 2;
      const ax = sx + fx * ahead;
      const ay = sy + fy * ahead;
      if (!stands(ax, ay) || !stands((sx + ax) / 2, (sy + ay) / 2)) continue;
      const legs = [
        { x: sx, y: sy },
        { x: ax, y: ay },
      ];
      e.waypoints.unshift(...legs);
      trackDetour.set(e, { legs, tick: state.tick });
      return true;
    }
  }
  return false;
}

/** Side-step a soldier is taking to clear a hull's lane. */
const givingWay = new WeakMap<Entity, { x: number; y: number; hullId: number; until: number }>();
const GIVE_WAY_TICKS = 30;

/** Friendly infantry in the lane ahead of a rolling hull pick a spot beside it. */
export function tickMakeWay(state: MatchState): void {
  const units = [...state.entities.values()].filter(isActiveUnit);
  const walkers = units.filter((u) => isInfantryType(u.type));
  if (walkers.length === 0) return;
  for (const hull of units) {
    if (!isArmoredType(hull.type) || !rolling(hull)) continue;
    const wp = hull.waypoints[0];
    if (!wp) continue;
    const dx = wp.x - hull.x;
    const dy = wp.y - hull.y;
    const d = Math.hypot(dx, dy);
    if (d < 1e-3) continue;
    const ux = dx / d;
    const uy = dy / d;
    const px = -uy;
    const py = ux;
    const lane = hull.radius * 3;
    const reach = hull.waypoints.length > 1 ? lane : Math.min(lane, d + hull.radius);
    for (const inf of walkers) {
      if (!makesWayFor(state, inf, hull)) continue;
      // Marching the same way as the hull: keep walking. Stepping out of one
      // hull's lane only to land in the next one's makes a soldier shake.
      const iwp = inf.waypoints[0];
      if (iwp && rolling(inf) && !givingWay.has(inf)) {
        const iw = Math.hypot(iwp.x - inf.x, iwp.y - inf.y);
        if (iw > 1e-3 && ((iwp.x - inf.x) * ux + (iwp.y - inf.y) * uy) / iw > 0.5) continue;
      }
      const clear = hull.radius + inf.radius + UNIT_SPACE_PAD;
      const rx = inf.x - hull.x;
      const ry = inf.y - hull.y;
      const along = rx * ux + ry * uy;
      const across = rx * px + ry * py;
      if (along < -clear * 0.5 || along > reach + inf.radius) continue;
      if (Math.abs(across) >= clear) continue;
      const cur = givingWay.get(inf);
      if (cur && cur.hullId === hull.id && state.tick <= cur.until) {
        cur.until = state.tick + GIVE_WAY_TICKS;
        continue;
      }
      const first = yieldSide(across, inf.id);
      placing: for (const extra of [0, inf.radius, inf.radius * 2 + UNIT_SPACE_PAD]) {
        for (const side of [first, -first] as const) {
          const off = side * (clear + 1 + extra) - across;
          const sx = inf.x + px * off;
          const sy = inf.y + py * off;
          if (!canStand(state, inf, sx, sy, hull.id)) continue;
          givingWay.set(inf, { x: sx, y: sy, hullId: hull.id, until: state.tick + GIVE_WAY_TICKS });
          break placing;
        }
      }
    }
  }
}

/** When an idle friend was last sent out of a lane, and its spot. */
const shuffled = new WeakMap<Entity, { x: number; y: number; tick: number }>();
const SHUFFLE_COOLDOWN_TICKS = 15;
/** A side spot farther than this many unit radii past the lane is not worth the trip. */
const SHUFFLE_MAX_RADII = 4;

/** Still rolling to the spot a mover asked it to clear to. */
function shuffledFor(state: MatchState, e: Entity): boolean {
  const s = shuffled.get(e);
  if (!s || state.tick - s.tick > 60) return false;
  const last = e.waypoints[e.waypoints.length - 1];
  return !!last && last.x === s.x && last.y === s.y;
}

/** Parked friend with nothing to do: free to roll aside. Hold position, braced, and busy units stay put. */
function canShuffle(state: MatchState, o: Entity, mover: Entity): boolean {
  if (!isActiveUnit(o) || o.id === mover.id || o.chute) return false;
  if (!allies(state, o.ownerId, mover.ownerId)) return false;
  // A hull or gun never gives way to a soldier; he walks around it.
  if (isInfantryType(mover.type) && !isInfantryType(o.type)) return false;
  if (o.order || o.waypoints.length > 0 || o.holdPosition || o.braced) return false;
  if (o.state !== "idle" || o.attackTarget != null || o.towedBy != null || o.towing != null) return false;
  if (catalog(o.type).moveTilesPerSec <= 0 || moveSpeedMul(o) <= 0) return false;
  const prev = shuffled.get(o);
  return !prev || state.tick - prev.tick >= SHUFFLE_COOLDOWN_TICKS;
}

function angDiff(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d);
}

/**
 * Quickest spot beside the lane for `o`. A tracked hull prefers rolling along
 * its own axis (no yaw); a gun is hauled trail first; feet go anywhere.
 */
function shuffleSpot(
  state: MatchState,
  o: Entity,
  mover: Entity,
  ux: number,
  uy: number,
  clear: number,
): { x: number; y: number } | null {
  const def = catalog(o.type);
  const px = -uy;
  const py = ux;
  const across0 = (o.x - mover.x) * px + (o.y - mover.y) * py;
  const speed = Math.max(1e-3, def.moveTilesPerSec * state.tileSize * moveSpeedMul(o));
  const turn = Math.max(1e-3, def.turnDegPerSec);
  const tracks = !!def.turnInPlace;
  const trailFirst = o.type === "artillery";
  const side = yieldSide(across0, o.id);
  const sideways = [Math.atan2(py * side, px * side), Math.atan2(-py * side, -px * side)];
  const heads: number[] = [];
  if (tracks) {
    // Travel headings the hull rolls without a yaw come first.
    if (trailFirst) heads.push(o.facing + Math.PI);
    else {
      heads.push(o.facing);
      if (!def.noReverse) heads.push(o.facing + Math.PI);
    }
    for (const a of sideways) {
      const hull = snapTankYaw(trailFirst ? a + Math.PI : a);
      heads.push(trailFirst ? hull + Math.PI : hull);
    }
  } else {
    heads.push(...sideways);
  }
  let best: { x: number; y: number } | null = null;
  let bestCost = Infinity;
  for (const h of heads) {
    const vx = Math.cos(h);
    const vy = Math.sin(h);
    const vp = vx * px + vy * py;
    if (Math.abs(vp) < 0.3) continue;
    const d = (clear - Math.sign(vp) * across0) / Math.abs(vp) + 1;
    if (d <= 0 || d > o.radius * SHUFFLE_MAX_RADII + clear) continue;
    // A tank only backs up a short hop; farther it spins and drives.
    const backing = tracks && !trailFirst && angDiff(h, o.facing) > Math.PI / 2;
    if (backing && d > REVERSE_TILES * TILE_SIZE) continue;
    const hull = tracks ? (trailFirst || backing ? h + Math.PI : h) : o.facing;
    const yaw = tracks ? (angDiff(hull, o.facing) * 180) / Math.PI : 0;
    let cost = d / speed + yaw / turn;
    if (cost >= bestCost) continue;
    const sx = o.x + vx * d;
    const sy = o.y + vy * d;
    const mx = o.x + vx * d * 0.5;
    const my = o.y + vy * d * 0.5;
    if (!tileFree(state, o, sx, sy) || !tileFree(state, o, mx, my)) continue;
    if (blockerAt(state, o, sx, sy, mover.id) || blockerAt(state, o, mx, my, mover.id)) {
      // Packed in: take a spot only parked friends hold; they shuffle on in turn.
      const parked = (b: Entity): boolean => canShuffle(state, b, mover);
      if (blockerAt(state, o, sx, sy, mover.id, parked) || blockerAt(state, o, mx, my, mover.id, parked)) continue;
      cost += SHUFFLE_CHAIN_PENALTY_SEC;
      if (cost >= bestCost) continue;
    }
    best = { x: sx, y: sy };
    bestCost = cost;
  }
  return best;
}

/** A spot that makes another parked friend move too counts as this many seconds slower. */
const SHUFFLE_CHAIN_PENALTY_SEC = 3;

/**
 * Idle friends parked in a mover's lane roll aside, the way a column parts
 * for a tank coming through. Infantry clearing a hull's lane use tickMakeWay.
 */
export function tickShuffle(state: MatchState): void {
  const units = [...state.entities.values()].filter(isActiveUnit);
  const parked = units.filter((u) => u.waypoints.length === 0 && !u.order);
  if (parked.length === 0) return;
  for (const mover of units) {
    if (!rolling(mover) || mover.waypoints.length === 0) continue;
    const wp = mover.waypoints[0]!;
    const dx = wp.x - mover.x;
    const dy = wp.y - mover.y;
    const d = Math.hypot(dx, dy);
    if (d < 1e-3) continue;
    const lanes = [{ ux: dx / d, uy: dy / d }];
    if (catalog(mover.type).turnInPlace) {
      // Tracks roll along the hull axis, which can be a face off the waypoint bearing.
      const sign = Math.cos(mover.facing) * dx + Math.sin(mover.facing) * dy >= 0 ? 1 : -1;
      lanes.push({ ux: Math.cos(mover.facing) * sign, uy: Math.sin(mover.facing) * sign });
    }
    const goal = mover.waypoints[mover.waypoints.length - 1]!;
    const toGoal = Math.hypot(goal.x - mover.x, goal.y - mover.y);
    const reach = Math.min(mover.radius * 3, toGoal + mover.radius);
    for (const o of parked) {
      if (makesWayFor(state, o, mover) || !canShuffle(state, o, mover)) continue;
      const clear = mover.radius + o.radius + UNIT_SPACE_PAD;
      const rx = o.x - mover.x;
      const ry = o.y - mover.y;
      const lane = lanes.find(({ ux, uy }) => {
        const along = rx * ux + ry * uy;
        const across = rx * -uy + ry * ux;
        return along >= 0 && along <= reach + o.radius && Math.abs(across) < clear;
      });
      if (!lane) continue;
      // The mover is headed for this friend's own spot: it settles beside it instead.
      // A friend already shuffling into this spot is the exception: it chains.
      const chain = shuffledFor(state, mover);
      if (!chain && mover.waypoints.length === 1 && Math.hypot(goal.x - o.x, goal.y - o.y) < clear) continue;
      askToShuffle(state, o, mover, lane.ux, lane.uy);
    }
  }
}

/** Send an idle friend to the quickest spot clear of the mover's lane. */
function askToShuffle(state: MatchState, o: Entity, mover: Entity, ux: number, uy: number): boolean {
  const spot = shuffleSpot(state, o, mover, ux, uy, mover.radius + o.radius + UNIT_SPACE_PAD);
  if (!spot) return false;
  o.order = { kind: "move", x: spot.x, y: spot.y };
  o.waypoints = [spot];
  o.state = "move";
  shuffled.set(o, { x: spot.x, y: spot.y, tick: state.tick });
  return true;
}

/**
 * Re-plan a stuck unit's route with the parked units in its way marked as
 * ground it cannot cross, so it goes around a packed block instead of nosing
 * into it again. Falls back to the plain route when that leaves no way through.
 */
export function pathAroundParked(state: MatchState, e: Entity, toX: number, toY: number): boolean {
  const ts = state.tileSize;
  const reach = PARKED_REACH_TILES * TILE_SIZE;
  const ex = worldToTile(e.x, ts);
  const ey = worldToTile(e.y, ts);
  const stamped: number[] = [];
  for (const o of state.entities.values()) {
    if (o.id === e.id || !isActiveUnit(o) || o.waypoints.length > 0) continue;
    if (Math.abs(o.x - e.x) > reach || Math.abs(o.y - e.y) > reach) continue;
    if (canCrush(state, e, o) || makesWayFor(state, o, e)) continue;
    const r = (o.radius + e.radius) * 0.9;
    // Settling beside it at the end of the route is the settle pass's job.
    if (Math.hypot(toX - o.x, toY - o.y) < r + ts) continue;
    const x0 = worldToTile(o.x - r, ts);
    const x1 = worldToTile(o.x + r, ts);
    const y0 = worldToTile(o.y - r, ts);
    const y1 = worldToTile(o.y + r, ts);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        if (!inBounds(state, tx, ty) || (tx === ex && ty === ey)) continue;
        if (Math.hypot(tileCenter(tx, ts) - o.x, tileCenter(ty, ts) - o.y) > r) continue;
        const i = tileIndex(state, tx, ty);
        if ((state.occupy[i] ?? 0) !== 0) continue;
        state.occupy[i] = -1;
        stamped.push(i);
      }
    }
  }
  let ok = false;
  try {
    ok = setPath(state, e, toX, toY);
  } finally {
    for (const i of stamped) state.occupy[i] = 0;
  }
  return ok || setPath(state, e, toX, toY);
}

/** How far around a stuck unit parked units count as obstacles, in sim tiles. */
const PARKED_REACH_TILES = 48;

/** Walk toward a pending side-step. Returns true while the soldier is still stepping aside. */
export function stepGiveWay(state: MatchState, e: Entity, speed: number, dt: number): boolean {
  const g = givingWay.get(e);
  if (!g) return false;
  const dx = g.x - e.x;
  const dy = g.y - e.y;
  const d = Math.hypot(dx, dy);
  if (state.tick > g.until || d <= 1 || speed <= 0) {
    givingWay.delete(e);
    return false;
  }
  const s = Math.min(d, speed * dt);
  const pos = resolveMove(state, e, e.x + (dx / d) * s, e.y + (dy / d) * s);
  e.x = pos.x;
  e.y = pos.y;
  e.facing = Math.atan2(dy, dx);
  if (!hasTurret(e.type)) e.turretFacing = e.facing;
  if (e.state === "idle") e.state = "move";
  return true;
}

export function tickCollision(state: MatchState, dt = TICK_DT): void {
  const units = [...state.entities.values()].filter((e) => e.kind === "unit" && e.hp > 0 && !e.garrisonedIn && !e.air && !e.chute && !jetAloft(e));
  for (const a of units) {
    if (isActiveUnit(a)) crushTreesUnder(state, a);
  }
  for (const a of units) {
    if (!isActiveUnit(a)) continue;
    for (const b of units) {
      if (a.id === b.id || !isActiveUnit(b)) continue;
      const need = a.radius + b.radius;
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      if (dx * dx + dy * dy >= need * need) continue;
      if (!canCrush(state, a, b)) continue;
      // The whole bar: a soldier dies, a cyborg on his legs is torn down to crawling.
      takeDamage(b, b.hp, state.tick);
      if (b.hp > 0) continue;
      state.impacts.push({
        id: state.nextId++,
        ownerId: a.ownerId,
        kind: "kill",
        x: b.x,
        y: b.y,
        vx: a.x - b.x,
        vy: a.y - b.y,
      });
    }
  }
  for (let iter = 0; iter < 3; iter++) {
    for (let i = 0; i < units.length; i++) {
      const a = units[i]!;
      if (a.hp <= 0) continue;
      for (let j = i + 1; j < units.length; j++) {
        const b = units[j]!;
        if (b.hp <= 0) continue;
        separatePair(state, a, b);
      }
    }
  }
}

function separatePair(state: MatchState, a: Entity, b: Entity): void {
  const need = a.radius + b.radius;
  let dx = b.x - a.x;
  let dy = b.y - a.y;
  let dist = Math.hypot(dx, dy);
  if (dist >= need) return;
  if (canCrush(state, a, b) || canCrush(state, b, a)) return;
  if (dist < 1e-4) {
    dx = 1;
    dy = 0;
    dist = 1;
  }
  const overlap = need - dist;
  const ux = dx / dist;
  const uy = dy / dist;
  if (makesWayFor(state, a, b)) {
    tryShift(state, a, -ux * overlap, -uy * overlap);
    return;
  }
  if (makesWayFor(state, b, a)) {
    tryShift(state, b, ux * overlap, uy * overlap);
    return;
  }
  const ma = massOf(a);
  const mb = massOf(b);
  const tot = ma + mb;
  tryShift(state, a, -ux * overlap * (mb / tot), -uy * overlap * (mb / tot));
  tryShift(state, b, ux * overlap * (ma / tot), uy * overlap * (ma / tot));
}

/** Push units out of a new wreck so they can path from a walkable tile. */
export function shoveFromWreck(state: MatchState, wreck: Entity): void {
  const ts = state.tileSize;
  for (const u of state.entities.values()) {
    if (u.id === wreck.id || !isActiveUnit(u)) continue;
    const need = u.radius + wreck.radius + UNIT_SPACE_PAD;
    let dx = u.x - wreck.x;
    let dy = u.y - wreck.y;
    let dist = Math.hypot(dx, dy);
    if (dist >= need) continue;
    if (dist < 1e-4) {
      dx = Math.cos(u.facing) || 1;
      dy = Math.sin(u.facing);
      dist = 1;
    }
    const base = Math.atan2(dy, dx);
    let placed = false;
    for (let ring = 0; ring <= 4 && !placed; ring++) {
      const r = need + ring * ts;
      const n = 8 + ring * 4;
      for (let i = 0; i < n; i++) {
        const a = base + (i * Math.PI * 2) / n;
        const nx = wreck.x + Math.cos(a) * r;
        const ny = wreck.y + Math.sin(a) * r;
        if (!canStand(state, u, nx, ny)) continue;
        u.x = nx;
        u.y = ny;
        u.tileX = worldToTile(nx, ts);
        u.tileY = worldToTile(ny, ts);
        placed = true;
        break;
      }
    }
  }
}

function tryShift(state: MatchState, e: Entity, dx: number, dy: number): void {
  if (e.wreck) return;
  const nx = e.x + dx;
  const ny = e.y + dy;
  if (!tileFree(state, e, nx, ny)) return;
  e.x = nx;
  e.y = ny;
  e.tileX = worldToTile(e.x, state.tileSize);
  e.tileY = worldToTile(e.y, state.tileSize);
}
