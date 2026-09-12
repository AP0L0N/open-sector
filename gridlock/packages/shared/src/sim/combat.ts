import { catalog, FACE_FIRE_DEG, PROJECTILE_RADIUS, fires } from "../catalog.js";
import { allies, buildingContains, playerTeam } from "./geo.js";
import { canSeeEntity, visionMask } from "./vision.js";
import { turnToward } from "./orders.js";
import type { Entity, MatchState, Projectile } from "./types.js";

export function tickCombat(state: MatchState, dt: number): void {
  for (const e of state.entities.values()) {
    if (!fires(e.type) || e.hp <= 0) continue;
    if (e.state === "deploy" || e.state === "undeploy") continue;
    if (e.cooldown > 0) e.cooldown = Math.max(0, e.cooldown - dt);

    let target: Entity | undefined;
    if (e.order?.kind === "attack" && e.order.targetId != null) {
      target = state.entities.get(e.order.targetId);
      if (!target || target.hp <= 0 || allies(state, e.ownerId, target.ownerId)) {
        e.order = null;
        e.attackTarget = null;
        target = undefined;
        if (e.state === "attack") e.state = "idle";
      }
    }

    if (!target && (!e.order || e.order.kind === "attack") && e.waypoints.length === 0) {
      target = acquire(state, e);
      if (target) {
        e.attackTarget = target.id;
        e.order = { kind: "attack", targetId: target.id };
      }
    }

    if (!target || target.hp <= 0) continue;
    const def = catalog(e.type);
    const range = def.rangeTiles * state.tileSize;
    const dist = Math.hypot(target.x - e.x, target.y - e.y);
    if (dist > range) {
      e.state = "attack";
      continue;
    }
    if (e.waypoints.length > 0) continue;

    e.state = "attack";
    const remainingDeg = turnToward(e, target.x, target.y, def.turnDegPerSec, dt);
    if (Math.abs(remainingDeg) > FACE_FIRE_DEG) continue;
    if (e.cooldown > 0) continue;

    const ang = e.facing;
    const speed = def.projectileSpeed;
    const life = range / speed + 0.05;
    const p: Projectile = {
      id: state.nextId++,
      ownerId: e.ownerId,
      team: playerTeam(state, e.ownerId),
      x: e.x + Math.cos(ang) * (e.radius + 2),
      y: e.y + Math.sin(ang) * (e.radius + 2),
      vx: Math.cos(ang) * speed,
      vy: Math.sin(ang) * speed,
      damage: def.damage,
      life,
    };
    state.projectiles.push(p);
    e.cooldown = def.cooldown;
  }
}

export function tickProjectiles(state: MatchState, dt: number): void {
  const keep: Projectile[] = [];
  for (const p of state.projectiles) {
    const x0 = p.x;
    const y0 = p.y;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    if (p.life <= 0) continue;
    let hit = false;
    for (const e of state.entities.values()) {
      if (e.hp <= 0) continue;
      if (allies(state, p.ownerId, e.ownerId)) continue;
      if (overlapsSweep(state, x0, y0, p, e)) {
        e.hp -= p.damage;
        hit = true;
        if (e.hp <= 0) e.hp = 0;
        break;
      }
    }
    if (!hit) keep.push(p);
  }
  state.projectiles = keep;
}

function overlapsSweep(state: MatchState, x0: number, y0: number, p: Projectile, e: Entity): boolean {
  if (e.kind === "building") {
    return buildingContains(e, state.tileSize, p.x, p.y) || buildingContains(e, state.tileSize, x0, y0);
  }
  const r = e.radius + PROJECTILE_RADIUS;
  return segmentHitsCircle(x0, y0, p.x, p.y, e.x, e.y, r);
}

function segmentHitsCircle(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  cx: number,
  cy: number,
  r: number,
): boolean {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const fx = x0 - cx;
  const fy = y0 - cy;
  const a = dx * dx + dy * dy;
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - r * r;
  if (a < 1e-8) return c <= 0;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return false;
  const s = Math.sqrt(disc);
  const t1 = (-b - s) / (2 * a);
  const t2 = (-b + s) / (2 * a);
  return (t1 >= 0 && t1 <= 1) || (t2 >= 0 && t2 <= 1);
}

function acquire(state: MatchState, e: Entity): Entity | undefined {
  const def = catalog(e.type);
  const range = def.rangeTiles * state.tileSize;
  const vis = visionMask(state, e.ownerId);
  let best: Entity | undefined;
  let bestD = range * range;
  for (const o of state.entities.values()) {
    if (o.hp <= 0 || o.id === e.id) continue;
    if (allies(state, e.ownerId, o.ownerId)) continue;
    if (!canSeeEntity(state, e.ownerId, o, vis)) continue;
    const dx = o.x - e.x;
    const dy = o.y - e.y;
    const d = dx * dx + dy * dy;
    if (d <= bestD) {
      bestD = d;
      best = o;
    }
  }
  return best;
}
