import { isArmoredType, isInfantryType } from "../catalog.js";
import { allies, inBounds, isWall, occupant, worldToTile } from "./geo.js";
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
  const occ = occupant(state, tx, ty);
  if (occ !== 0 && occ !== e.id) {
    const cx = worldToTile(e.x, ts);
    const cy = worldToTile(e.y, ts);
    if (tx === cx && ty === cy) return true;
    return false;
  }
  return true;
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
