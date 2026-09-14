import { catalog, FACE_FIRE_DEG, PROJECTILE_RADIUS, fires } from "../catalog.js";
import type { ImpactKind, ImpactView } from "../protocol.js";
import { aimAngle, resolveHit } from "./ballistics.js";
import { weaponRangeWorld } from "./elevation.js";
import { allies, buildingContains, playerTeam } from "./geo.js";
import { nextRand } from "./rng.js";
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
    const range = weaponRangeWorld(state, e);
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

    const moving = target.waypoints.length > 0 || target.state === "move";
    const ang = aimAngle(e.facing, def.spreadDeg, dist, range, () => nextRand(state), moving);
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
      penetration: def.penetration,
      caliber: def.caliber,
      life,
      ignoreId: e.id,
      fromId: e.id,
      bounced: false,
    };
    state.projectiles.push(p);
    e.cooldown = def.cooldown;
  }
}

export function tickProjectiles(state: MatchState, dt: number): void {
  const keep: Projectile[] = [];
  const rand = () => nextRand(state);
  for (const p of state.projectiles) {
    const x0 = p.x;
    const y0 = p.y;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    if (p.life <= 0) {
      pushImpact(state, p, "miss", p.x, p.y);
      continue;
    }
    let hit = false;
    let bounced = false;
    for (const e of state.entities.values()) {
      if (e.hp <= 0) continue;
      if (e.id === p.ignoreId) continue;
      if (allies(state, p.ownerId, e.ownerId)) continue;
      if (!overlapsSweep(state, x0, y0, p, e)) continue;
      const res = resolveHit({
        gun: { damage: p.damage, penetration: p.penetration, caliber: p.caliber },
        target: catalog(e.type),
        targetFacing: e.facing,
        targetHp: e.hp,
        targetHpMax: e.hpMax,
        vx: p.vx,
        vy: p.vy,
        rand,
      });
      e.hp -= res.damage;
      if (e.hp < 0) e.hp = 0;
      const ix = e.kind === "building" ? p.x : e.x;
      const iy = e.kind === "building" ? p.y : e.y;
      const kind: ImpactKind = e.hp <= 0 && res.kind !== "ricochet" ? "kill" : res.kind;
      pushImpact(state, p, kind, ix, iy, res.kind === "ricochet" ? res.bounceVx : p.vx, res.kind === "ricochet" ? res.bounceVy : p.vy);
      if (res.kind === "ricochet") {
        p.vx = res.bounceVx;
        p.vy = res.bounceVy;
        p.ignoreId = e.id;
        p.bounced = true;
        p.life = Math.max(p.life, 1.35);
        const sp = Math.hypot(p.vx, p.vy) || 1;
        p.x += (p.vx / sp) * Math.max(8, e.radius * 0.5);
        p.y += (p.vy / sp) * Math.max(8, e.radius * 0.5);
        bounced = true;
      }
      hit = true;
      break;
    }
    if (!hit || bounced) keep.push(p);
  }
  state.projectiles = keep;
}

function pushImpact(
  state: MatchState,
  p: Projectile,
  kind: ImpactKind,
  x: number,
  y: number,
  vx?: number,
  vy?: number,
): void {
  const impact: ImpactView = {
    id: state.nextId++,
    ownerId: p.ownerId,
    kind,
    x,
    y,
    vx: vx ?? p.vx,
    vy: vy ?? p.vy,
  };
  state.impacts.push(impact);
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
  const range = weaponRangeWorld(state, e);
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
