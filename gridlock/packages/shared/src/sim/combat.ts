import {
  aimFacing,
  catalog,
  FACE_FIRE_DEG,
  GARRISON_STRUCTURAL_CALIBER,
  GUARD_CONE_DEG,
  PROJECTILE_RADIUS,
  TANK_MG,
  WEAPON_RANGE_SIGHT_MUL,
  WITHDRAW_TILES,
  fires,
  hasAmmo,
  hasCrit,
  hasMg,
  hasTurret,
  entityIsScouting,
  isGarrisonable,
  isInfantryType,
  isSmokeShell,
  leavesWreck,
  pickLoadedShell,
  type CatalogEntry,
  type ShellType,
} from "../catalog.js";
import type { ImpactKind, ImpactView } from "../protocol.js";
import {
  aimAngle,
  isArmored,
  resolveHit,
  scatterHullImpact,
  RICOCHET_SPARK_SPEED,
  RICOCHET_TRAVEL,
  RICOCHET_TRAVEL_MIN,
} from "./ballistics.js";
import { fireStats, hullTurnMul, immobilized, rollCrits } from "./crits.js";
import { stanceHitRadiusMul, stanceTargetSpreadMul, tickStance } from "./stance.js";
import { canAimWeapon, weaponRangeWorld } from "./elevation.js";
import {
  allies,
  buildingBounds,
  clearOrder,
  nearestWalkable,
  playerTeam,
  tileCenter,
  unitInWater,
  worldToTile,
} from "./geo.js";
import {
  garrisonIsHiding,
  garrisonIsHostile,
  garrisonLooksOccupied,
  livingGarrison,
  pickGarrisonMuzzle,
  woundGarrison,
} from "./garrison.js";
import { setPath } from "./path.js";
import { nextRand } from "./rng.js";
import { spawnSmokeCloud } from "./smoke.js";
import { canSeeEntity } from "./vision.js";
import { hideScout, woundScout } from "./scout.js";
import { reversing, turnToward, turnTurretTo, turnTurretToward } from "./orders.js";
import type { Entity, MatchState, Projectile } from "./types.js";

export function tickCombat(state: MatchState, dt: number): void {
  for (const e of state.entities.values()) {
    if (!canFight(e)) continue;
    tickWeaponClocks(e, dt);
    if (unitInWater(state, e) || garrisonIsHiding(state, e)) continue;
    resolveTarget(state, e);
  }
  tickStance(state);
  for (const e of state.entities.values()) {
    if (!canFight(e) || unitInWater(state, e) || garrisonIsHiding(state, e)) continue;
    fireAtCurrent(state, e, dt);
  }
}

function canFight(e: Entity): boolean {
  return fires(e.type) && e.hp > 0 && !e.wreck && e.state !== "deploy" && e.state !== "undeploy";
}

/** Move and attack-move both engage in-range enemies. Attack-move halts; move keeps walking. */
function travelFights(e: Entity): boolean {
  const k = e.order?.kind;
  return k === "attackmove" || k === "move";
}

function resolveTarget(state: MatchState, e: Entity): Entity | undefined {
  if (e.order?.kind === "forceattack") {
    if (e.order.targetId == null) {
      e.attackTarget = null;
      return undefined;
    }
    const t = state.entities.get(e.order.targetId);
    if (!t || t.hp <= 0 || t.id === e.id) {
      e.order = null;
      e.attackTarget = null;
      if (e.state === "attack") e.state = "idle";
      return undefined;
    }
    e.attackTarget = t.id;
    return t;
  }
  let target: Entity | undefined;
  if (e.order?.kind === "attack" && e.order.targetId != null) {
    target = state.entities.get(e.order.targetId);
    if (!target || target.hp <= 0 || skipsFriendly(state, e, target) || dropsEmptyGarrison(state, e, target)) {
      e.order = null;
      e.attackTarget = null;
      target = undefined;
      if (e.state === "attack") e.state = "idle";
    }
  } else if (travelFights(e) && e.attackTarget != null) {
    target = state.entities.get(e.attackTarget);
    if (!target || target.hp <= 0 || skipsFriendly(state, e, target) || dropsEmptyGarrison(state, e, target)) {
      e.attackTarget = null;
      target = undefined;
    }
  }

  if (target && e.order?.kind !== "forceattack" && !canSeeEntity(state, e.ownerId, target)) {
    if (e.order?.auto) {
      e.order = null;
      e.attackTarget = null;
      if (e.state === "attack") e.state = "idle";
      target = undefined;
    } else if (travelFights(e) || e.order?.kind === "guard") {
      e.attackTarget = null;
      target = undefined;
    }
  }

  if (e.guardFacing != null && (!e.order || e.order.kind === "guard") && e.waypoints.length === 0) {
    const cone = acquire(state, e, true);
    const pick = cone ?? acquire(state, e, false);
    e.attackTarget = pick?.id ?? null;
    return pick;
  }

  const canAcquire =
    !target &&
    (!e.order ||
      e.order.kind === "attack" ||
      e.order.kind === "attackmove" ||
      e.order.kind === "move" ||
      e.order.kind === "guard") &&
    (travelFights(e) || e.waypoints.length === 0);
  if (canAcquire) {
    target = acquire(state, e);
    if (target) {
      e.attackTarget = target.id;
      if (!travelFights(e) && e.order?.kind !== "guard") {
        e.order = { kind: "attack", targetId: target.id, auto: true };
      }
    }
  }
  return target;
}

function currentTarget(state: MatchState, e: Entity): Entity | undefined {
  const id =
    e.attackTarget ??
    (e.order?.kind === "attack" || e.order?.kind === "forceattack" ? e.order.targetId : undefined);
  if (id == null) return undefined;
  const t = state.entities.get(id);
  if (!t || t.hp <= 0 || t.id === e.id) return undefined;
  if (e.order?.kind !== "forceattack" && skipsFriendly(state, e, t)) return undefined;
  if (e.order?.kind !== "forceattack" && dropsEmptyGarrison(state, e, t)) return undefined;
  return t;
}

function skipsFriendly(state: MatchState, e: Entity, target: Entity): boolean {
  return !target.wreck && allies(state, e.ownerId, target.ownerId);
}

/** Auto-fire and infantry stop once a civilian house is empty. Tanks may still demolish on a player order. */
function dropsEmptyGarrison(state: MatchState, e: Entity, target: Entity): boolean {
  if (!isGarrisonable(target.type) || target.kind !== "building") return false;
  if (garrisonIsHostile(state, e.ownerId, target)) return false;
  if (e.order?.kind === "forceattack") return false;
  if (e.order?.kind === "attack" && !e.order.auto && !isInfantryType(e.type)) return false;
  return true;
}

function fireAtCurrent(state: MatchState, e: Entity, dt: number): void {
  const holedUp = e.garrisonedIn != null;
  const target = currentTarget(state, e);
  const ground =
    !target && e.order?.kind === "forceattack" && e.order.x != null && e.order.y != null
      ? { x: e.order.x, y: e.order.y }
      : null;
  const def = catalog(e.type);
  const turreted = hasTurret(e.type);
  let remainingDeg = 180;
  if (turreted) {
    remainingDeg = slewTurret(e, target, dt, ground);
  }

  const aimX = ground?.x ?? target?.x;
  const aimY = ground?.y ?? target?.y;
  if (aimX == null || aimY == null) return;
  if (!ground && (!target || target.hp <= 0)) return;

  if (!ground && target && isInfantryType(e.type) && target.kind === "building" && !target.wreck) {
    if (!garrisonIsHostile(state, e.ownerId, target)) {
      if (!holedUp) {
        e.state = "attack";
        if (!turreted) turnToward(e, target.x, target.y, def.turnDegPerSec * hullTurnMul(e), dt);
      }
      return;
    }
  }
  const range = weaponRangeWorld(state, e);
  const dist = Math.hypot(aimX - e.x, aimY - e.y);
  if (dist > range) {
    if (!holedUp) e.state = "attack";
    return;
  }
  if (!canAimWeapon(state, e, aimX, aimY, target)) {
    if (!holedUp) e.state = "attack";
    return;
  }
  if (e.waypoints.length > 0 && !travelFights(e) && !reversing(e) && !holedUp) return;

  if (!holedUp) e.state = "attack";
  if (!turreted && !holedUp) {
    remainingDeg = turnToward(e, aimX, aimY, def.turnDegPerSec * hullTurnMul(e), dt);
  }
  if (!holedUp && Math.abs(remainingDeg) > FACE_FIRE_DEG) return;

  const useMg = !ground && !e.order?.once && target ? wantsMg(e, target) : false;
  if (useMg && target) {
    if (e.mgCooldown > 0 || e.mgOverheat > 0 || e.mgAmmo <= 0) return;
    fireRound(
      state,
      e,
      aimX,
      aimY,
      {
        damage: TANK_MG.damage,
        penetration: TANK_MG.penetration,
        caliber: TANK_MG.caliber,
        spreadDeg: TANK_MG.spreadDeg,
        projectileSpeed: TANK_MG.projectileSpeed,
        spreadPower: TANK_MG.spreadPower,
      },
      range,
      dist,
      { target, accurateRange: accurateWeaponRange(e, range) },
    );
    e.mgCooldown = TANK_MG.cooldown;
    e.mgAmmo = Math.max(0, e.mgAmmo - 1);
    e.mgHeat = Math.min(TANK_MG.heatMax, e.mgHeat + TANK_MG.heatPerShot);
    if (e.mgHeat >= TANK_MG.heatMax) e.mgOverheat = TANK_MG.overheatSeconds;
    return;
  }

  if (e.cooldown > 0) return;
  const shell = hasAmmo(e.type) ? pickLoadedShell(e.ammo, e.shell) : null;
  if (hasAmmo(e.type) && !shell) return;
  if (isSmokeShell(shell) && !mayFireSmoke(e)) return;
  if (shell) e.shell = shell;
  const gun = fireStats(e);
  fireRound(
    state,
    e,
    aimX,
    aimY,
    {
      damage: gun.damage,
      penetration: gun.penetration,
      caliber: gun.caliber,
      spreadDeg: gun.spreadDeg,
      projectileSpeed: def.projectileSpeed,
    },
    range,
    dist,
    { target, shell, fuse: !!ground, accurateRange: accurateWeaponRange(e, range) },
  );
  e.cooldown = gun.cooldown;
  if (shell) e.ammo[shell] = Math.max(0, (e.ammo[shell] ?? 0) - 1);
  if (e.order?.once) clearOrder(e);
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
  if (!hasMg(e.type) || e.mgAmmo <= 0) return false;
  if (isInfantryType(target.type)) return true;
  return entityIsScouting(target);
}

/** Sight reach in world units. Handgun has no extra long-shot band. */
function accurateWeaponRange(e: Entity, range: number): number {
  if (isInfantryType(e.type) && hasCrit(e, "arm")) return range;
  return range / WEAPON_RANGE_SIGHT_MUL;
}

/** Smoke is a player-placed screen, never an auto-attack fallback. */
function mayFireSmoke(e: Entity): boolean {
  const o = e.order;
  if (!o || o.auto) return false;
  return o.kind === "attack" || o.kind === "forceattack";
}

function slewTurret(
  e: Entity,
  target: Entity | undefined,
  dt: number,
  ground?: { x: number; y: number } | null,
): number {
  const def = catalog(e.type);
  const rate = def.turretTurnDegPerSec ?? def.turnDegPerSec;
  if (ground) return turnTurretToward(e, ground.x, ground.y, rate, dt);
  if (target && target.hp > 0) return turnTurretToward(e, target.x, target.y, rate, dt);
  const wp = e.waypoints[0];
  if (wp && !reversing(e)) return turnTurretToward(e, wp.x, wp.y, rate, dt);
  return turnTurretTo(e, e.facing, rate, dt);
}

function fireRound(
  state: MatchState,
  e: Entity,
  aimX: number,
  aimY: number,
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
  opts?: { target?: Entity; shell?: ShellType | null; fuse?: boolean; accurateRange?: number },
): void {
  const target = opts?.target;
  const moving = !!target && (target.waypoints.length > 0 || target.state === "move");
  const ang = aimAngle(
    aimFacing(e),
    stats.spreadDeg,
    dist,
    range,
    () => nextRand(state),
    moving,
    stats.spreadPower ?? 1,
    target ? stanceTargetSpreadMul(target, unitInWater(state, target)) : 1,
    opts?.accurateRange ?? range,
  );
  const speed = stats.projectileSpeed;
  const muzzleReach = e.radius + 2;
  const travel = opts?.fuse ? Math.max(8, dist - muzzleReach) : range;
  const life = travel / Math.max(1, speed) + 0.05;
  const dx = Math.cos(ang);
  const dy = Math.sin(ang);
  let x = e.x + dx * muzzleReach;
  let y = e.y + dy * muzzleReach;
  let ignoreId = e.id;
  if (e.garrisonedIn != null) {
    const house = state.entities.get(e.garrisonedIn);
    if (house) {
      const muzzle = pickGarrisonMuzzle(house, state.tileSize, ang, e.id);
      x = muzzle.x + dx * 4;
      y = muzzle.y + dy * 4;
      ignoreId = house.id;
    }
  }
  const p: Projectile = {
    id: state.nextId++,
    ownerId: e.ownerId,
    team: playerTeam(state, e.ownerId),
    x,
    y,
    vx: dx * speed,
    vy: dy * speed,
    damage: stats.damage,
    penetration: stats.penetration,
    caliber: stats.caliber,
    life,
    ignoreId,
    fromId: e.id,
    bounced: false,
    shell: opts?.shell ?? null,
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
    const struck = nearestSweepHit(state, x0, y0, p);
    if (isSmokeShell(p.shell) && (struck || p.life <= 0)) {
      const ix = struck ? (struck.e.kind === "building" ? struck.x : struck.e.x) : p.x;
      const iy = struck ? (struck.e.kind === "building" ? struck.y : struck.e.y) : p.y;
      if (struck) hideScout(state, struck.e);
      spawnSmokeCloud(state, ix, iy, p.vx, p.vy);
      pushImpact(state, p, "puff", ix, iy);
      continue;
    }
    if (!struck) {
      if (p.life <= 0) {
        pushImpact(state, p, p.bounced ? "puff" : "miss", p.x, p.y);
        continue;
      }
      keep.push(p);
      continue;
    }
    const e = struck.e;
    if (entityIsScouting(e) && p.caliber < GARRISON_STRUCTURAL_CALIBER) {
      const dmg = Math.max(1, Math.round(p.damage * (0.9 + rand() * 0.2)));
      woundScout(state, e, dmg);
      pushImpact(state, p, "hit", e.x, e.y);
      continue;
    }
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
    const occupied = isGarrisonable(e.type) && livingGarrison(state, e).length > 0;
    const chipWalls = !occupied || p.caliber >= GARRISON_STRUCTURAL_CALIBER;
    if (chipWalls) {
      e.hp -= res.damage;
      if (e.hp < 0) e.hp = 0;
      if (e.hp > 0) rollCrits(e, res.face, res.kind, res.damage, rand);
      if (e.hp > 0 && res.kind !== "ricochet" && res.damage > 0) maybeWithdraw(state, e, p);
      hideScout(state, e);
    }
    if (occupied) woundGarrison(state, e, res.damage, p.caliber);
    const lethal = e.hp <= 0 && res.kind !== "ricochet";
    let kind: ImpactKind = lethal ? "kill" : res.kind;
    if (!chipWalls && kind === "kill") kind = "hit";
    const blast = lethal && !e.wreck && (e.kind === "building" || leavesWreck(e.type));
    const hit = impactPoint(e, targetDef, struck.x, struck.y, blast, rand);
    pushImpact(
      state,
      p,
      kind,
      hit.x,
      hit.y,
      res.kind === "ricochet" ? res.bounceVx : p.vx,
      res.kind === "ricochet" ? res.bounceVy : p.vy,
      blast,
    );
    if (res.kind !== "ricochet") continue;
    p.vx = res.bounceVx;
    p.vy = res.bounceVy;
    p.ignoreId = e.id;
    p.bounced = true;
    let sp = Math.hypot(p.vx, p.vy) || 1;
    if (p.caliber < 40 && sp > RICOCHET_SPARK_SPEED) {
      p.vx = (p.vx / sp) * RICOCHET_SPARK_SPEED;
      p.vy = (p.vy / sp) * RICOCHET_SPARK_SPEED;
      sp = RICOCHET_SPARK_SPEED;
    }
    const travel = RICOCHET_TRAVEL_MIN + rand() * (RICOCHET_TRAVEL - RICOCHET_TRAVEL_MIN);
    p.life = travel / sp;
    p.x = hit.x + (p.vx / sp) * 3;
    p.y = hit.y + (p.vy / sp) * 3;
    keep.push(p);
  }
  state.projectiles = keep;
}

function impactPoint(
  e: Entity,
  def: CatalogEntry,
  struckX: number,
  struckY: number,
  blast: boolean,
  rand: () => number,
): { x: number; y: number } {
  if (e.kind === "building") return { x: struckX, y: struckY };
  if (blast) return { x: e.x, y: e.y };
  const r = isArmored(def) ? Math.max(e.radius * 1.9, 16) : e.radius;
  return scatterHullImpact(e.x, e.y, r, struckX, struckY, rand);
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
    fromId: p.fromId,
    shell: p.shell ?? undefined,
    x,
    y,
    vx: vx ?? p.vx,
    vy: vy ?? p.vy,
    caliber: p.caliber,
    blast: blast || undefined,
  };
  state.impacts.push(impact);
}

function nearestSweepHit(
  state: MatchState,
  x0: number,
  y0: number,
  p: Projectile,
): { e: Entity; t: number; x: number; y: number } | null {
  let best: { e: Entity; t: number; x: number; y: number } | null = null;
  for (const e of state.entities.values()) {
    if (e.hp <= 0) continue;
    if (e.id === p.ignoreId) continue;
    if (e.garrisonedIn != null) continue;
    const hit = sweepAgainst(state, x0, y0, p, e);
    if (!hit) continue;
    if (!best || hit.t < best.t) best = { e, t: hit.t, x: hit.x, y: hit.y };
  }
  return best;
}

function sweepAgainst(
  state: MatchState,
  x0: number,
  y0: number,
  p: Projectile,
  e: Entity,
): { t: number; x: number; y: number } | null {
  const t =
    e.kind === "building"
      ? segmentAabbT(x0, y0, p.x, p.y, buildingBounds(e, state.tileSize))
      : segmentCircleT(
          x0,
          y0,
          p.x,
          p.y,
          e.x,
          e.y,
          e.radius * stanceHitRadiusMul(e, unitInWater(state, e)) + PROJECTILE_RADIUS,
        );
  if (t == null) return null;
  return { t, x: x0 + (p.x - x0) * t, y: y0 + (p.y - y0) * t };
}

function segmentAabbT(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  box: { x0: number; y0: number; x1: number; y1: number },
): number | null {
  if (x0 >= box.x0 && x0 < box.x1 && y0 >= box.y0 && y0 < box.y1) return 0;
  const dx = x1 - x0;
  const dy = y1 - y0;
  let t0 = 0;
  let t1 = 1;
  const clip = (p: number, q: number): boolean => {
    if (Math.abs(p) < 1e-12) return q >= 0;
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
    return true;
  };
  if (!clip(-dx, x0 - box.x0)) return null;
  if (!clip(dx, box.x1 - x0)) return null;
  if (!clip(-dy, y0 - box.y0)) return null;
  if (!clip(dy, box.y1 - y0)) return null;
  if (t0 > t1 || t0 > 1 || t1 < 0) return null;
  return t0 < 0 ? 0 : t0;
}

function segmentCircleT(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  cx: number,
  cy: number,
  r: number,
): number | null {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const fx = x0 - cx;
  const fy = y0 - cy;
  const a = dx * dx + dy * dy;
  const c0 = fx * fx + fy * fy - r * r;
  if (c0 <= 0) return 0;
  if (a < 1e-8) return null;
  const b = 2 * (fx * dx + fy * dy);
  const disc = b * b - 4 * a * c0;
  if (disc < 0) return null;
  const s = Math.sqrt(disc);
  const t1 = (-b - s) / (2 * a);
  const t2 = (-b + s) / (2 * a);
  if (t1 >= 0 && t1 <= 1) return t1;
  if (t2 >= 0 && t2 <= 1) return t2;
  return null;
}

function acquire(state: MatchState, e: Entity, coneOnly = false): Entity | undefined {
  const range = weaponRangeWorld(state, e);
  let best: Entity | undefined;
  let bestD = range * range;
  for (const o of state.entities.values()) {
    if (o.hp <= 0 || o.id === e.id || o.wreck || o.garrisonedIn) continue;
    if (allies(state, e.ownerId, o.ownerId)) continue;
    if (isInfantryType(e.type) && o.kind === "building") {
      if (!garrisonIsHostile(state, e.ownerId, o) || !garrisonLooksOccupied(state, e.ownerId, o)) continue;
    } else if (
      isGarrisonable(o.type) &&
      (!garrisonLooksOccupied(state, e.ownerId, o) || !garrisonIsHostile(state, e.ownerId, o))
    ) {
      continue;
    }
    const dx = o.x - e.x;
    const dy = o.y - e.y;
    const d = dx * dx + dy * dy;
    if (d > bestD) continue;
    if (coneOnly && !inGuardCone(e, o)) continue;
    if (!canSeeEntity(state, e.ownerId, o)) continue;
    if (!canAimWeapon(state, e, o.x, o.y, o)) continue;
    bestD = d;
    best = o;
  }
  return best;
}

export function inGuardCone(e: Entity, t: { x: number; y: number }): boolean {
  if (e.guardFacing == null) return false;
  const half = (GUARD_CONE_DEG * Math.PI) / 360;
  let delta = Math.atan2(t.y - e.y, t.x - e.x) - e.guardFacing;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return Math.abs(delta) <= half;
}

function maybeWithdraw(state: MatchState, victim: Entity, p: Projectile): void {
  if (victim.kind !== "unit" || victim.wreck || victim.garrisonedIn) return;
  if (victim.holdPosition || immobilized(victim)) return;
  if (victim.state === "deploy" || victim.state === "undeploy") return;
  if (victim.waypoints.length > 0) return;
  if (keepsStation(victim)) return;
  const shooter = p.fromId > 0 ? state.entities.get(p.fromId) : undefined;
  const seen = threatInSight(state, victim, shooter);
  const reverse = reversesFromFire(victim);
  if (seen && !reverse) return;
  const fromX = shooter && shooter.hp > 0 ? shooter.x : p.x - p.vx;
  const fromY = shooter && shooter.hp > 0 ? shooter.y : p.y - p.vy;
  const dest = withdrawDest(state, victim, fromX, fromY);
  if (!dest) return;
  const dx = fromX - victim.x;
  const dy = fromY - victim.y;
  const facing = dx * dx + dy * dy >= 1 ? Math.atan2(dy, dx) : victim.facing;
  victim.order = { kind: "withdraw", x: dest.x, y: dest.y, reverse, facing: reverse ? facing : undefined };
  victim.attackTarget = reverse && seen && shooter ? shooter.id : null;
  victim.harvestTile = null;
  victim.state = "move";
  setPath(state, victim, dest.x, dest.y);
}

function reversesFromFire(e: Entity): boolean {
  return !!catalog(e.type).turnInPlace;
}

function keepsStation(e: Entity): boolean {
  const k = e.order?.kind;
  if (!k || k === "withdraw") return false;
  if (k === "attack" && e.order?.auto) return false;
  return true;
}

function threatInSight(state: MatchState, victim: Entity, shooter: Entity | undefined): boolean {
  if (!shooter || shooter.hp <= 0) return false;
  const seen =
    shooter.garrisonedIn != null ? (state.entities.get(shooter.garrisonedIn) ?? shooter) : shooter;
  return canSeeEntity(state, victim.ownerId, seen);
}

function withdrawDest(
  state: MatchState,
  e: Entity,
  fromX: number,
  fromY: number,
): { x: number; y: number } | null {
  const ts = state.tileSize;
  let dx = e.x - fromX;
  let dy = e.y - fromY;
  if (dx * dx + dy * dy < 1) {
    dx = -Math.cos(e.facing);
    dy = -Math.sin(e.facing);
  }
  const ang = Math.atan2(dy, dx);
  const dist = WITHDRAW_TILES * ts;
  const offsets = [0, 0.45, -0.45, 0.9, -0.9, 1.35, -1.35];
  for (const off of offsets) {
    const a = ang + off;
    const wx = e.x + Math.cos(a) * dist;
    const wy = e.y + Math.sin(a) * dist;
    const tile = nearestWalkable(state, worldToTile(wx, ts), worldToTile(wy, ts), e.type);
    if (!tile) continue;
    const cx = tileCenter(tile.x, ts);
    const cy = tileCenter(tile.y, ts);
    if (Math.hypot(cx - e.x, cy - e.y) < ts * 2) continue;
    return { x: cx, y: cy };
  }
  return null;
}
