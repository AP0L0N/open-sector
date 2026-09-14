import {
  garrisonCapOf,
  isGarrisonable,
  isInfantryType,
  NEUTRAL_OWNER,
} from "../catalog.js";
import { nextRand } from "./rng.js";
import { adjacentToBuilding, allies, inBounds, nearestWalkable, tileCenter, worldToTile } from "./geo.js";
import { setPath } from "./path.js";
import type { Entity, MatchState } from "./types.js";

export function livingGarrison(state: MatchState, house: Entity): Entity[] {
  const out: Entity[] = [];
  for (const id of house.garrison) {
    const u = state.entities.get(id);
    if (u && u.hp > 0 && u.garrisonedIn === house.id) out.push(u);
  }
  return out;
}

export function garrisonOwner(state: MatchState, house: Entity): string {
  return livingGarrison(state, house)[0]?.ownerId ?? NEUTRAL_OWNER;
}

export function garrisonSpace(state: MatchState, house: Entity): number {
  return Math.max(0, garrisonCapOf(house.type) - livingGarrison(state, house).length);
}

export function canGarrison(state: MatchState, unit: Entity, house: Entity): string | null {
  if (!isInfantryType(unit.type) || unit.kind !== "unit" || unit.wreck) return "Only infantry can garrison.";
  if (!isGarrisonable(house.type) || house.kind !== "building" || house.hp <= 0) return "Cannot enter that.";
  const occ = garrisonOwner(state, house);
  if (occ && occ !== NEUTRAL_OWNER && !allies(state, unit.ownerId, occ)) return "Held by the enemy.";
  if (house.ownerId && house.ownerId !== NEUTRAL_OWNER && !allies(state, unit.ownerId, house.ownerId)) {
    return "Held by the enemy.";
  }
  if (garrisonSpace(state, house) <= 0) return "Building is full.";
  return null;
}

export function approachTile(state: MatchState, house: Entity): { x: number; y: number } | null {
  const ring: { x: number; y: number }[] = [];
  for (let y = house.tileY - 1; y <= house.tileY + house.tileH; y++) {
    for (let x = house.tileX - 1; x <= house.tileX + house.tileW; x++) {
      const onEdge =
        x === house.tileX - 1 ||
        y === house.tileY - 1 ||
        x === house.tileX + house.tileW ||
        y === house.tileY + house.tileH;
      if (!onEdge) continue;
      if (!inBounds(state, x, y)) continue;
      ring.push({ x, y });
    }
  }
  for (const t of ring) {
    const snap = nearestWalkable(state, t.x, t.y, "trooper");
    if (snap) return snap;
  }
  return nearestWalkable(state, house.tileX, house.tileY, "trooper");
}

export function enterGarrison(state: MatchState, unit: Entity, house: Entity): boolean {
  if (canGarrison(state, unit, house)) return false;
  unit.garrisonedIn = house.id;
  if (!house.garrison.includes(unit.id)) house.garrison.push(unit.id);
  unit.x = house.x;
  unit.y = house.y;
  unit.tileX = house.tileX;
  unit.tileY = house.tileY;
  unit.waypoints = [];
  unit.order = null;
  unit.attackTarget = null;
  unit.harvestTile = null;
  unit.state = "garrison";
  return true;
}

export function exitGarrison(
  state: MatchState,
  unit: Entity,
  dest?: { x: number; y: number },
): void {
  const house = unit.garrisonedIn != null ? state.entities.get(unit.garrisonedIn) : undefined;
  unit.garrisonedIn = null;
  unit.state = "idle";
  if (house) house.garrison = house.garrison.filter((id) => id !== unit.id);
  const near = house
    ? approachTile(state, house)
    : nearestWalkable(state, worldToTile(unit.x, state.tileSize), worldToTile(unit.y, state.tileSize), unit.type);
  if (near) {
    unit.x = tileCenter(near.x, state.tileSize);
    unit.y = tileCenter(near.y, state.tileSize);
    unit.tileX = near.x;
    unit.tileY = near.y;
  }
  if (dest) {
    unit.order = { kind: "move", x: dest.x, y: dest.y };
    unit.state = "move";
    setPath(state, unit, dest.x, dest.y);
  }
}

/** House destroyed: occupants take 0–100% of max HP, then spill onto the street. */
export function spillGarrison(state: MatchState, house: Entity, opts?: { damage?: boolean }): void {
  const units = livingGarrison(state, house);
  house.garrison = [];
  const hurt = opts?.damage !== false;
  for (const u of units) {
    u.garrisonedIn = null;
    if (hurt) {
      const frac = nextRand(state);
      u.hp = Math.max(0, u.hp - Math.round(u.hpMax * frac));
    }
    u.order = null;
    u.waypoints = [];
    u.attackTarget = null;
    u.state = u.hp > 0 ? "idle" : "dead";
    const snap = approachTile(state, house);
    if (snap) {
      u.x = tileCenter(snap.x, state.tileSize);
      u.y = tileCenter(snap.y, state.tileSize);
      u.tileX = snap.x;
      u.tileY = snap.y;
    }
  }
}

export type GarrisonFace = "e" | "s";

export interface GarrisonMuzzle {
  x: number;
  y: number;
  face: GarrisonFace;
}

/** Visible-wall windows. Iso shows the south (left) and east (right) faces. */
export function garrisonWindows(house: Entity, tileSize: number): GarrisonMuzzle[] {
  const x0 = house.tileX * tileSize;
  const y0 = house.tileY * tileSize;
  const bw = house.tileW * tileSize;
  const bh = house.tileH * tileSize;
  const n = house.type === "manor" ? 4 : house.type === "house" ? 3 : 2;
  const pts: GarrisonMuzzle[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i + 1) / (n + 1);
    pts.push({ x: x0 + t * bw, y: y0 + bh, face: "s" });
    pts.push({ x: x0 + bw, y: y0 + t * bh, face: "e" });
  }
  return pts;
}

/** Pick a window on the wall facing the shot. */
export function pickGarrisonMuzzle(house: Entity, tileSize: number, ang: number, salt = 0): GarrisonMuzzle {
  const dx = Math.cos(ang);
  const dy = Math.sin(ang);
  const pts = garrisonWindows(house, tileSize);
  const cx = house.x;
  const cy = house.y;
  let best = pts[0] ?? { x: house.x, y: house.y, face: "e" as const };
  let bestScore = -Infinity;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    const fx = p.x - cx;
    const fy = p.y - cy;
    const fl = Math.hypot(fx, fy) || 1;
    const align = (fx / fl) * dx + (fy / fl) * dy;
    const jitter = ((Math.imul(salt + i * 19, 1103515245) >>> 0) % 100) / 400;
    const score = align + jitter;
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return best;
}

/** Screen-pixel lift from the pad to a glowing window, by story. */
export function garrisonWindowLift(type: Entity["type"], salt: number): number {
  const floors = type === "manor" ? 3 : type === "house" ? 2 : 1;
  const floor = ((salt % floors) + floors) % floors;
  if (type === "manor") return 24 + floor * 26;
  if (type === "house") return 22 + floor * 26;
  return 20;
}

export function tickGarrison(state: MatchState): void {
  for (const e of state.entities.values()) {
    if (e.kind !== "unit" || e.hp <= 0 || e.garrisonedIn) continue;
    if (e.order?.kind !== "garrison" || e.order.targetId == null) continue;
    const house = state.entities.get(e.order.targetId);
    if (!house || house.hp <= 0 || !isGarrisonable(house.type)) {
      e.order = null;
      e.state = "idle";
      continue;
    }
    if (canGarrison(state, e, house)) {
      e.order = null;
      e.waypoints = [];
      e.state = "idle";
      continue;
    }
    if (adjacentToBuilding(state, e, house)) enterGarrison(state, e, house);
  }
}


