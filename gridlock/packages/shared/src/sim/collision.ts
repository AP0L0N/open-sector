import { isArmoredType, isInfantryType, isMotorVehicle, UNIT_SPACE_PAD } from "../catalog.js";
import { allies, crushTreeAt, inBounds, isTree, isWall, isWater, occupant, tileCenter, walkable, worldToTile } from "./geo.js";
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

function blockedByUnit(state: MatchState, e: Entity, x: number, y: number): boolean {
  const r = e.radius;
  for (const o of state.entities.values()) {
    if (o.id === e.id || o.hp <= 0) continue;
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

function canStand(state: MatchState, e: Entity, x: number, y: number): boolean {
  return tileFree(state, e, x, y) && !blockedByUnit(state, e, x, y);
}

export function resolveMove(
  state: MatchState,
  e: Entity,
  wantX: number,
  wantY: number,
): { x: number; y: number; blocked: boolean } {
  if (canStand(state, e, wantX, wantY)) return { x: wantX, y: wantY, blocked: false };
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
      if (canStand(state, e, sx, sy)) return { x: sx, y: sy, blocked: false };
    }
  }
  for (let f = 0.7; f >= 0.15; f -= 0.2) {
    const sx = e.x + dx * f;
    const sy = e.y + dy * f;
    if (canStand(state, e, sx, sy)) return { x: sx, y: sy, blocked: false };
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
  const pos = resolveMove(state, e, wantX, wantY);
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

export function tickCollision(state: MatchState): void {
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
  const ma = massOf(a);
  const mb = massOf(b);
  const tot = ma + mb;
  const ux = dx / dist;
  const uy = dy / dist;
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
