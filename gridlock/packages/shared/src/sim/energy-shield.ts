import { energyShieldOf, secondsToTicks } from "../catalog.js";
import { weaponRangeWorld } from "./elevation.js";
import { allies, worldToTile } from "./geo.js";
import type { Entity, EnergyShield, MatchState, Projectile } from "./types.js";

/**
 * Hive energy walls. A Behemoth, Drone, or Lancer fighting a target in reach
 * raises a curved wall across its front. The wall stays where it went up. Enemy
 * rounds and beams that meet it stop there and take points off it; enemy ground
 * units cannot walk through it. Its own side walks and shoots through.
 * A Weaver throws smaller ones in front of friends under fire (sim/weaver.ts).
 */

/** Where a line first meets an enemy wall: `t` along it, 0–1. */
export interface ShieldHit {
  s: EnergyShield;
  t: number;
  x: number;
  y: number;
}

function wrapPi(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/** First point where (x0,y0)→(x1,y1) crosses the arc, as `t` 0–1, or -1. */
function crossArc(s: EnergyShield, x0: number, y0: number, x1: number, y1: number): number {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const fx = x0 - s.x;
  const fy = y0 - s.y;
  const a = dx * dx + dy * dy;
  if (a < 1e-9) return -1;
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - s.r * s.r;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return -1;
  const q = Math.sqrt(disc);
  for (const t of [(-b - q) / (2 * a), (-b + q) / (2 * a)]) {
    if (t < 0 || t > 1) continue;
    const ang = Math.atan2(fy + dy * t, fx + dx * t);
    if (Math.abs(wrapPi(ang - s.angle)) <= s.half) return t;
  }
  return -1;
}

/** The first standing wall not on `ownerId`'s side that the line meets. */
export function shieldSweep(state: MatchState, ownerId: string, x0: number, y0: number, x1: number, y1: number): ShieldHit | null {
  const shields = state.energyShields;
  if (!shields || shields.length === 0) return null;
  let best: ShieldHit | null = null;
  for (const s of shields) {
    if (s.hp <= 0 || allies(state, s.ownerId, ownerId)) continue;
    const t = crossArc(s, x0, y0, x1, y1);
    if (t < 0 || (best && t >= best.t)) continue;
    best = { s, t, x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t };
  }
  return best;
}

/** A round stops on the wall: the wall loses the round's damage and the round is spent. */
export function absorbRound(state: MatchState, p: Projectile, hit: ShieldHit): void {
  const s = hit.s;
  s.hp = Math.max(0, s.hp - Math.max(1, p.damage));
  s.hitTick = state.tick;
  state.impacts.push({
    id: state.nextId++,
    ownerId: p.ownerId,
    kind: "ricochet",
    fromId: p.fromId,
    x: hit.x,
    y: hit.y,
    vx: p.vx,
    vy: p.vy,
    caliber: p.caliber,
  });
}

function canRaise(state: MatchState, e: Entity): boolean {
  if (e.kind !== "unit" || e.hp <= 0 || e.shutdown || e.dormant || e.garrisonedIn != null || e.lunge) return false;
  if (e.shieldReady != null && state.tick < e.shieldReady) return false;
  if (e.attackTarget == null) return false;
  const target = state.entities.get(e.attackTarget);
  if (!target || target.hp <= 0 || allies(state, e.ownerId, target.ownerId)) return false;
  const reach = weaponRangeWorld(state, e) + target.radius;
  const dx = target.x - e.x;
  const dy = target.y - e.y;
  return dx * dx + dy * dy <= reach * reach;
}

/** Walls burn down and break; a fighting Behemoth, Drone, or Lancer without one raises the next. */
export function tickEnergyShields(state: MatchState, dt: number): void {
  const shields = (state.energyShields ??= []);
  if (shields.length > 0) {
    const keep: EnergyShield[] = [];
    for (const s of shields) {
      s.life -= dt;
      if (s.hp > 0 && s.life > 0) {
        keep.push(s);
        continue;
      }
      const from = state.entities.get(s.fromId);
      const def = from ? energyShieldOf(from.type) : undefined;
      if (from && def) from.shieldReady = state.tick + secondsToTicks(def.rechargeSeconds);
    }
    state.energyShields = keep;
  }
  const standing = new Set(state.energyShields!.map((s) => s.fromId));
  for (const e of state.entities.values()) {
    const def = energyShieldOf(e.type);
    if (!def || standing.has(e.id) || !canRaise(state, e)) continue;
    const target = state.entities.get(e.attackTarget!)!;
    state.energyShields!.push({
      id: state.nextId++,
      ownerId: e.ownerId,
      fromId: e.id,
      x: e.x,
      y: e.y,
      angle: Math.atan2(target.y - e.y, target.x - e.x),
      half: (def.halfDeg * Math.PI) / 180,
      r: def.arcPx,
      hp: def.hp,
      hpMax: def.hp,
      life: def.seconds,
    });
  }
}

/** Ground units that could walk into an enemy wall this tick, and where they stood. Null with no walls up. */
export function shieldWatch(state: MatchState): Map<Entity, { x: number; y: number }> | null {
  if (!state.energyShields || state.energyShields.length === 0) return null;
  const at = new Map<Entity, { x: number; y: number }>();
  for (const e of state.entities.values()) {
    if (e.kind !== "unit" || e.hp <= 0 || e.garrisonedIn != null || e.air || e.jet || e.drone) continue;
    at.set(e, { x: e.x, y: e.y });
  }
  return at;
}

/** A unit whose step took it through an enemy wall is put back where it stood. */
export function holdShieldLines(state: MatchState, watch: Map<Entity, { x: number; y: number }> | null): void {
  if (!watch) return;
  for (const [e, from] of watch) {
    if (e.hp <= 0 || e.lunge || (from.x === e.x && from.y === e.y)) continue;
    if (!shieldSweep(state, e.ownerId, from.x, from.y, e.x, e.y)) continue;
    e.x = from.x;
    e.y = from.y;
    e.tileX = worldToTile(e.x, state.tileSize);
    e.tileY = worldToTile(e.y, state.tileSize);
  }
}
