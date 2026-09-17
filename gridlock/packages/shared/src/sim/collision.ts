import {
  GIVE_WAY_CONE_DEG,
  GIVE_WAY_LOOKAHEAD_TILES,
  isArmoredType,
  isInfantryType,
  isMotorVehicle,
  TICK_DT,
  UNIT_SPACE_PAD,
} from "../catalog.js";
import { moveSpeedMul } from "./crits.js";
import { allies, crushTreeAt, inBounds, isTree, isWall, isWater, occupant, tileCenter, unitInWater, walkable, worldToTile } from "./geo.js";
import type { Entity, MatchState } from "./types.js";

export function isActiveUnit(e: Entity): boolean {
  return e.kind === "unit" && e.hp > 0 && !e.wreck && !e.garrisonedIn;
}

export function massOf(e: Entity): number {
  if (e.wreck || e.kind === "building") return 1e9;
  const moving = e.waypoints.length > 0 || e.state === "move" || e.state === "attack";
  let base = 4;
  if (isArmoredType(e.type)) base = 8;
  else if (isInfantryType(e.type)) base = 1;
  return moving ? base * 2.2 : base;
}

export function canCrush(state: MatchState, mover: Entity, victim: Entity): boolean {
  if (!isActiveUnit(mover) || !isActiveUnit(victim)) return false;
  if (!isArmoredType(mover.type) || !isInfantryType(victim.type)) return false;
  if (allies(state, mover.ownerId, victim.ownerId)) return false;
  return mover.waypoints.length > 0 || mover.state === "move" || mover.state === "attack";
}

function tileFree(state: MatchState, e: Entity, x: number, y: number): boolean {
  const ts = state.tileSize;
  const tx = worldToTile(x, ts);
  const ty = worldToTile(y, ts);
  if (!inBounds(state, tx, ty)) return false;
  if (isWall(state, tx, ty)) return false;
  if (isWater(state, tx, ty) && !isInfantryType(e.type)) return false;
  if (isTree(state, tx, ty) && !walkable(state, tx, ty, e.type)) return false;
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
  const rolling = e.waypoints.length > 0 || e.state === "move" || e.state === "attack";
  if (!rolling) return;
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

function blockedByUnit(state: MatchState, e: Entity, x: number, y: number, ignoreId?: number): boolean {
  const r = e.radius;
  for (const o of state.entities.values()) {
    if (o.id === e.id || o.id === ignoreId || o.hp <= 0) continue;
    if (o.kind === "building") continue;
    const need = r + o.radius;
    const dx = x - o.x;
    const dy = y - o.y;
    const newD = dx * dx + dy * dy;
    if (newD >= need * need) continue;
    if (canCrush(state, e, o)) continue;
    const odx = e.x - o.x;
    const ody = e.y - o.y;
    const oldD = odx * odx + ody * ody;
    if (oldD < need * need && newD + 1e-6 >= oldD) continue;
    return true;
  }
  return false;
}

function canStand(state: MatchState, e: Entity, x: number, y: number, ignoreId?: number): boolean {
  return tileFree(state, e, x, y) && !blockedByUnit(state, e, x, y, ignoreId);
}

/** Higher class keeps the lane: armored, then other vehicles, then infantry. */
function pathClass(e: Entity): number {
  if (isArmoredType(e.type)) return 2;
  if (isMotorVehicle(e.type)) return 1;
  return 0;
}

/** True when `other` should step aside for a moving `mover`. */
function yieldsTo(mover: Entity, other: Entity): boolean {
  const mc = pathClass(mover);
  const oc = pathClass(other);
  if (mc !== oc) return mc > oc;
  return other.radius + UNIT_SPACE_PAD < mover.radius;
}

function travelDir(e: Entity): { x: number; y: number } {
  return { x: Math.cos(e.facing), y: Math.sin(e.facing) };
}

const GIVE_WAY_CONE_TAN = Math.tan((GIVE_WAY_CONE_DEG * Math.PI) / 180);

function coneHalfWidth(mover: Entity, other: Entity, along: number): number {
  const hull = mover.radius + other.radius + UNIT_SPACE_PAD;
  if (along <= 0) return hull;
  return hull + along * GIVE_WAY_CONE_TAN;
}

function relativeToMover(
  mover: Entity,
  x: number,
  y: number,
): { along: number; across: number; dir: { x: number; y: number }; px: number; py: number } {
  const dir = travelDir(mover);
  const px = -dir.y;
  const py = dir.x;
  const dx = x - mover.x;
  const dy = y - mover.y;
  return { along: dx * dir.x + dy * dir.y, across: dx * px + dy * py, dir, px, py };
}

function yieldSide(across: number, id: number): 1 | -1 {
  if (across > 0.5) return 1;
  if (across < -0.5) return -1;
  return id % 2 === 0 ? 1 : -1;
}

export function tickGiveWay(state: MatchState): void {
  const units: Entity[] = [];
  for (const e of state.entities.values()) {
    if (isActiveUnit(e)) units.push(e);
  }
  for (const mover of units) {
    if (mover.waypoints.length === 0) continue;
    if (pathClass(mover) === 0) continue;
    if (moveSpeedMul(mover, unitInWater(state, mover)) <= 0) continue;
    for (const other of units) {
      if (other.id === mover.id) continue;
      if (!yieldsTo(mover, other)) continue;
      if (!allies(state, mover.ownerId, other.ownerId)) continue;
      if (other.state === "deploy" || other.state === "undeploy") continue;
      if (!canYieldWalk(other)) continue;
      stepAside(state, mover, other);
    }
  }
}

function canYieldWalk(e: Entity): boolean {
  if (!isInfantryType(e.type)) return false;
  const kind = e.order?.kind;
  if (kind === "rotate" || kind === "harvest" || kind === "unload" || kind === "garrison") return false;
  return moveSpeedMul(e) > 0;
}

function stepAside(state: MatchState, mover: Entity, other: Entity): void {
  if (moveSpeedMul(other, unitInWater(state, other)) <= 0) return;
  const rel = relativeToMover(mover, other.x, other.y);
  const need = mover.radius + other.radius + UNIT_SPACE_PAD;
  const look = need + GIVE_WAY_LOOKAHEAD_TILES * state.tileSize;
  if (rel.along < -other.radius * 0.35) return;
  if (rel.along > look) return;
  const half = coneHalfWidth(mover, other, rel.along) + UNIT_SPACE_PAD;
  if (Math.abs(rel.across) >= half) return;
  const sign = yieldSide(rel.across, other.id);
  const first = other.waypoints[0];
  if (first) {
    const fr = relativeToMover(mover, first.x, first.y);
    if (Math.sign(fr.across || sign) === sign && Math.abs(fr.across) >= half - 1) return;
  }
  const ts = state.tileSize;
  for (const extra of [0, ts, ts * 2]) {
    const targetAcross = sign * (half + extra);
    const shift = targetAcross - rel.across;
    const nx = other.x + rel.px * shift;
    const ny = other.y + rel.py * shift;
    if (!canStand(state, other, nx, ny, mover.id)) continue;
    const next = relativeToMover(mover, nx, ny);
    if (next.along > rel.along + 1) continue;
    if (Math.abs(next.across) + 1e-6 < half) continue;
    if (Math.sign(next.across || sign) !== sign) continue;
    assignYieldPath(other, nx, ny);
    return;
  }
}

function eachYieldMover(state: MatchState, e: Entity, fn: (mover: Entity) => void): void {
  for (const mover of state.entities.values()) {
    if (mover.id === e.id || !isActiveUnit(mover)) continue;
    if (mover.waypoints.length === 0) continue;
    if (!yieldsTo(mover, e)) continue;
    if (!allies(state, mover.ownerId, e.ownerId)) continue;
    fn(mover);
  }
}

function inForwardCone(mover: Entity, other: Entity, along: number, across: number): boolean {
  if (along < -other.radius * 0.35) return false;
  return Math.abs(across) < coneHalfWidth(mover, other, along);
}

/** Strip any step that would walk into a moving hull's forward cone. */
function clipYieldWant(state: MatchState, e: Entity, wantX: number, wantY: number): { x: number; y: number } {
  if (!isInfantryType(e.type)) return { x: wantX, y: wantY };
  let x = wantX;
  let y = wantY;
  const lookPad = GIVE_WAY_LOOKAHEAD_TILES * state.tileSize;
  eachYieldMover(state, e, (mover) => {
    const rel = relativeToMover(mover, e.x, e.y);
    const need = mover.radius + e.radius + UNIT_SPACE_PAD;
    const look = need + lookPad;
    if (rel.along < -e.radius * 0.35 || rel.along > look) return;
    const wx = x - e.x;
    const wy = y - e.y;
    let alongStep = wx * rel.dir.x + wy * rel.dir.y;
    let acrossStep = wx * rel.px + wy * rel.py;
    const nextAlong = rel.along + alongStep;
    const nextAcross = rel.across + acrossStep;
    const inside = inForwardCone(mover, e, rel.along, rel.across);
    const enters = inForwardCone(mover, e, nextAlong, nextAcross);
    if (!inside && !enters) return;
    if (alongStep > 0) alongStep = 0;
    const sign = yieldSide(rel.across, e.id);
    if (acrossStep * sign < 0) acrossStep = 0;
    x = e.x + rel.dir.x * alongStep + rel.px * acrossStep;
    y = e.y + rel.dir.y * alongStep + rel.py * acrossStep;
  });
  return { x, y };
}

function worseForGiveWay(state: MatchState, e: Entity, x: number, y: number): boolean {
  if (!isInfantryType(e.type)) return false;
  let worse = false;
  const lookPad = GIVE_WAY_LOOKAHEAD_TILES * state.tileSize;
  eachYieldMover(state, e, (mover) => {
    if (worse) return;
    const cur = relativeToMover(mover, e.x, e.y);
    const need = mover.radius + e.radius + UNIT_SPACE_PAD;
    const look = need + lookPad;
    if (cur.along < -e.radius * 0.35 || cur.along > look) return;
    const next = relativeToMover(mover, x, y);
    const inside = inForwardCone(mover, e, cur.along, cur.across);
    const enters = inForwardCone(mover, e, next.along, next.across);
    if (!inside && !enters) return;
    if (next.along > cur.along + 0.35) {
      worse = true;
      return;
    }
    if (Math.abs(next.across) + 0.35 < Math.abs(cur.across)) {
      worse = true;
    }
  });
  return worse;
}

function assignYieldPath(e: Entity, x: number, y: number): void {
  const first = e.waypoints[0];
  if (first && Math.hypot(first.x - x, first.y - y) <= 8) {
    first.x = x;
    first.y = y;
  } else if (e.waypoints.length === 0) {
    e.waypoints = [{ x, y }];
  } else {
    e.waypoints.unshift({ x, y });
  }
  if (!e.order) e.order = { kind: "move", x, y, auto: true };
}

export function resolveMove(
  state: MatchState,
  e: Entity,
  wantX: number,
  wantY: number,
): { x: number; y: number; blocked: boolean } {
  const tryPos = (x: number, y: number): boolean => canStand(state, e, x, y) && !worseForGiveWay(state, e, x, y);
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
export function moveWithCollision(state: MatchState, e: Entity, speed: number, dt: number): boolean {
  const wp = e.waypoints[0];
  if (!wp) return false;
  const dx = wp.x - e.x;
  const dy = wp.y - e.y;
  const dist = Math.hypot(dx, dy);
  const step = speed * dt;
  let wantX: number;
  let wantY: number;
  let arrive = false;
  if (dist <= 2 || dist <= step) {
    wantX = wp.x;
    wantY = wp.y;
    arrive = true;
  } else {
    wantX = e.x + (dx / dist) * step;
    wantY = e.y + (dy / dist) * step;
  }
  const clipped = clipYieldWant(state, e, wantX, wantY);
  const pos = resolveMove(state, e, clipped.x, clipped.y);
  e.x = pos.x;
  e.y = pos.y;
  crushTreesUnder(state, e);
  const left = Math.hypot(e.x - wp.x, e.y - wp.y);
  if (arrive && left <= 8) {
    e.waypoints.shift();
  } else if (pos.blocked && e.waypoints.length > 1 && left < step * 1.4) {
    e.waypoints.shift();
  }
  return e.waypoints.length > 0;
}

export function tickCollision(state: MatchState, dt = TICK_DT): void {
  const units = [...state.entities.values()].filter((e) => e.kind === "unit" && e.hp > 0);
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
      b.hp = 0;
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
  if (shoveYieldAside(state, a, b, overlap) || shoveYieldAside(state, b, a, overlap)) return;
  const ma = massOf(a);
  const mb = massOf(b);
  const tot = ma + mb;
  const ux = dx / dist;
  const uy = dy / dist;
  tryShift(state, a, -ux * overlap * (mb / tot), -uy * overlap * (mb / tot));
  tryShift(state, b, ux * overlap * (ma / tot), uy * overlap * (ma / tot));
}

function shoveYieldAside(state: MatchState, mover: Entity, other: Entity, overlap: number): boolean {
  if (mover.waypoints.length === 0) return false;
  if (!isInfantryType(other.type)) return false;
  if (!yieldsTo(mover, other)) return false;
  if (!allies(state, mover.ownerId, other.ownerId)) return false;
  const rel = relativeToMover(mover, other.x, other.y);
  const sign = yieldSide(rel.across, other.id);
  const ox = other.x;
  const oy = other.y;
  tryShift(state, other, rel.px * sign * overlap, rel.py * sign * overlap);
  return other.x !== ox || other.y !== oy;
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
