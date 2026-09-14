import {
  aimFacing,
  catalog,
  FACE_FIRE_DEG,
  PROJECTILE_RADIUS,
  TANK_MG,
  fires,
  hasAmmo,
  hasMg,
  hasTurret,
  isGarrisonable,
  isInfantryType,
  leavesWreck,
  pickLoadedShell,
} from "../catalog.js";
import type { ImpactKind, ImpactView } from "../protocol.js";
import { aimAngle, resolveHit, RICOCHET_TRAVEL } from "./ballistics.js";
import { fireStats, hullTurnMul, rollCrits } from "./crits.js";
import { weaponRangeWorld } from "./elevation.js";
import { allies, buildingContains, playerTeam } from "./geo.js";
import { nextRand } from "./rng.js";
import { canSeeEntity, visionMask } from "./vision.js";
import { turnToward, turnTurretTo, turnTurretToward } from "./orders.js";
import type { Entity, MatchState, Projectile } from "./types.js";

export function tickCombat(state: MatchState, dt: number): void {
  for (const e of state.entities.values()) {
    if (!fires(e.type) || e.hp <= 0 || e.wreck) continue;
    if (e.state === "deploy" || e.state === "undeploy") continue;
    const holedUp = e.garrisonedIn != null;
    tickWeaponClocks(e, dt);

    let target: Entity | undefined;
    if (e.order?.kind === "attack" && e.order.targetId != null) {
      target = state.entities.get(e.order.targetId);
      if (!target || target.hp <= 0 || (allies(state, e.ownerId, target.ownerId) && !target.wreck)) {
        e.order = null;
        e.attackTarget = null;
        target = undefined;
        if (e.state === "attack") e.state = "idle";
      }
    } else if (e.order?.kind === "attackmove" && e.attackTarget != null) {
      target = state.entities.get(e.attackTarget);
      if (!target || target.hp <= 0 || (allies(state, e.ownerId, target.ownerId) && !target.wreck)) {
        e.attackTarget = null;
        target = undefined;
      }
    }

    const canAcquire =
      !target &&
      (!e.order || e.order.kind === "attack" || e.order.kind === "attackmove") &&
      (e.order?.kind === "attackmove" || e.waypoints.length === 0);
    if (canAcquire) {
      target = acquire(state, e);
      if (target) {
        e.attackTarget = target.id;
        if (e.order?.kind !== "attackmove") e.order = { kind: "attack", targetId: target.id };
      }
    }

    const def = catalog(e.type);
    const turreted = hasTurret(e.type);
    let remainingDeg = 180;
    if (turreted) {
      remainingDeg = slewTurret(e, target, dt);
    }

    if (!target || target.hp <= 0) continue;
    const range = weaponRangeWorld(state, e);
    const dist = Math.hypot(target.x - e.x, target.y - e.y);
    if (dist > range) {
      if (!holedUp) e.state = "attack";
      continue;
    }
    if (e.waypoints.length > 0 && e.order?.kind !== "attackmove" && !holedUp) continue;

    if (!holedUp) e.state = "attack";
    if (!turreted && !holedUp) {
      remainingDeg = turnToward(e, target.x, target.y, def.turnDegPerSec * hullTurnMul(e), dt);
    }
    if (!holedUp && Math.abs(remainingDeg) > FACE_FIRE_DEG) continue;

    const useMg = wantsMg(e, target);
    if (useMg) {
      if (e.mgCooldown > 0 || e.mgOverheat > 0 || e.mgAmmo <= 0) continue;
      fireRound(state, e, target, {
        damage: TANK_MG.damage,
        penetration: TANK_MG.penetration,
        caliber: TANK_MG.caliber,
        spreadDeg: TANK_MG.spreadDeg,
        projectileSpeed: TANK_MG.projectileSpeed,
        spreadPower: TANK_MG.spreadPower,
      }, range, dist);
      e.mgCooldown = TANK_MG.cooldown;
      e.mgAmmo = Math.max(0, e.mgAmmo - 1);
      e.mgHeat = Math.min(TANK_MG.heatMax, e.mgHeat + TANK_MG.heatPerShot);
      if (e.mgHeat >= TANK_MG.heatMax) e.mgOverheat = TANK_MG.overheatSeconds;
      continue;
    }

    if (e.cooldown > 0) continue;
    const shell = hasAmmo(e.type) ? pickLoadedShell(e.ammo, e.shell) : null;
    if (hasAmmo(e.type) && !shell) continue;
    if (shell) e.shell = shell;
    const gun = fireStats(e);
    fireRound(state, e, target, {
      damage: gun.damage,
      penetration: gun.penetration,
      caliber: gun.caliber,
      spreadDeg: gun.spreadDeg,
      projectileSpeed: def.projectileSpeed,
    }, range, dist);
    e.cooldown = gun.cooldown;
    if (shell) e.ammo[shell] = Math.max(0, (e.ammo[shell] ?? 0) - 1);
  }
}

function tickWeaponClocks(e: Entity, dt: number): void {
  if (e.cooldown > 0) e.cooldown = Math.max(0, e.cooldown - dt);
  if (!hasMg(e.type)) return;
  const bursting = e.mgCooldown > 0 || e.mgOverheat > 0;
  if (e.mgCooldown > 0) e.mgCooldown = Math.max(0, e.mgCooldown - dt);
  if (e.mgOverheat > 0) {
    e.mgOverheat = Math.max(0, e.mgOverheat - dt);
    if (e.mgOverheat <= 0) e.mgHeat = 0;
    return;
  }
  if (bursting) return;
  e.mgHeat = Math.max(0, e.mgHeat - TANK_MG.heatCoolPerSec * dt);
}

function wantsMg(e: Entity, target: Entity): boolean {
  if (!hasMg(e.type) || !isInfantryType(target.type)) return false;
  return e.mgAmmo > 0;
}

function slewTurret(e: Entity, target: Entity | undefined, dt: number): number {
  const def = catalog(e.type);
  const rate = def.turretTurnDegPerSec ?? def.turnDegPerSec;
  if (target && target.hp > 0) return turnTurretToward(e, target.x, target.y, rate, dt);
  const wp = e.waypoints[0];
  if (wp) return turnTurretToward(e, wp.x, wp.y, rate, dt);
  return turnTurretTo(e, e.facing, rate, dt);
}

function fireRound(
  state: MatchState,
  e: Entity,
  target: Entity,
  stats: {
    damage: number;
    penetration: number;
    caliber: number;
    spreadDeg: number;
    projectileSpeed: number;
    spreadPower?: number;
  },
  range: number,
  dist: number,
): void {
  const moving = target.waypoints.length > 0 || target.state === "move";
  const ang = aimAngle(
    aimFacing(e),
    stats.spreadDeg,
    dist,
    range,
    () => nextRand(state),
    moving,
    stats.spreadPower ?? 1,
  );
  const speed = stats.projectileSpeed;
  const life = range / speed + 0.05;
  const p: Projectile = {
    id: state.nextId++,
    ownerId: e.ownerId,
    team: playerTeam(state, e.ownerId),
    x: e.x + Math.cos(ang) * (e.radius + 2),
    y: e.y + Math.sin(ang) * (e.radius + 2),
    vx: Math.cos(ang) * speed,
    vy: Math.sin(ang) * speed,
    damage: stats.damage,
    penetration: stats.penetration,
    caliber: stats.caliber,
    life,
    ignoreId: e.id,
    fromId: e.id,
    bounced: false,
  };
  state.projectiles.push(p);
}

export function tickProjectiles(state: MatchState, dt: number): void {
  const keep: Projectile[] = [];
  const rand = () => nextRand(state);
  for (const p of state.projectiles) {
    const x0 = p.x;
    const y0 = p.y;
    const stepDt = p.life > 0 ? Math.min(dt, p.life) : 0;
    p.x += p.vx * stepDt;
    p.y += p.vy * stepDt;
    p.life -= dt;
    if (p.life <= 0) {
      pushImpact(state, p, p.bounced ? "puff" : "miss", p.x, p.y);
      continue;
    }
    let hit = false;
    let bounced = false;
    for (const e of state.entities.values()) {
      if (e.hp <= 0) continue;
      if (e.id === p.ignoreId) continue;
      if (!e.wreck && allies(state, p.ownerId, e.ownerId)) continue;
      if (!overlapsSweep(state, x0, y0, p, e)) continue;
      const targetDef = e.wreck
        ? { ...catalog(e.type), armorFront: 0, armorSide: 0, armorRear: 0 }
        : catalog(e.type);
      const res = resolveHit({
        gun: { damage: p.damage, penetration: p.penetration, caliber: p.caliber },
        target: targetDef,
        targetFacing: e.facing,
        targetHp: e.hp,
        targetHpMax: e.hpMax,
        vx: p.vx,
        vy: p.vy,
        rand,
      });
      e.hp -= res.damage;
      if (e.hp < 0) e.hp = 0;
      if (e.hp > 0) rollCrits(e, res.face, res.kind, res.damage, rand);
      const ix = e.kind === "building" ? p.x : e.x;
      const iy = e.kind === "building" ? p.y : e.y;
      const lethal = e.hp <= 0 && res.kind !== "ricochet";
      const kind: ImpactKind = lethal ? "kill" : res.kind;
      const blast = lethal && !e.wreck && (e.kind === "building" || leavesWreck(e.type));
      pushImpact(
        state,
        p,
        kind,
        ix,
        iy,
        res.kind === "ricochet" ? res.bounceVx : p.vx,
        res.kind === "ricochet" ? res.bounceVy : p.vy,
        blast,
      );
      if (res.kind === "ricochet") {
        p.vx = res.bounceVx;
        p.vy = res.bounceVy;
        p.ignoreId = e.id;
        p.bounced = true;
        const sp = Math.hypot(p.vx, p.vy) || 1;
        p.life = (RICOCHET_TRAVEL * (0.75 + rand() * 0.5)) / sp;
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
  blast?: boolean,
): void {
  const impact: ImpactView = {
    id: state.nextId++,
    ownerId: p.ownerId,
    kind,
    x,
    y,
    vx: vx ?? p.vx,
    vy: vy ?? p.vy,
    caliber: p.caliber,
    blast: blast || undefined,
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
    if (o.hp <= 0 || o.id === e.id || o.wreck || o.garrisonedIn) continue;
    if (allies(state, e.ownerId, o.ownerId)) continue;
    if (isGarrisonable(o.type) && o.garrison.length === 0) continue;
    if (isGarrisonable(o.type)) {
      const occ = o.garrison[0] != null ? state.entities.get(o.garrison[0]) : undefined;
      if (occ && allies(state, e.ownerId, occ.ownerId)) continue;
    }
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
