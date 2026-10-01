import {
  FIRE_BURN_DPS,
  FIRE_CAP,
  FIRE_CYBORG_MUL,
  FIRE_DIE_SHARE,
  FIRE_MERGE_SHARE,
  FIRE_PYRO_MUL,
  FIRE_RADIUS,
  FIRE_RADIUS_MAX,
  FIRE_SECONDS,
  FIRE_SOFT_VEHICLE_MUL,
  FLAMER,
  FLAMER_APEX,
  FLAMER_BURST,
  FLAMER_BURST_PAUSE,
  FLAMER_GLOB_INTERVAL,
  FLAMER_GLOB_SECONDS,
  FLAMER_SCATTER_ACROSS,
  FLAMER_SCATTER_ALONG,
  FLAMER_SPLASH,
  isArmoredType,
  isCyborg,
  isInfantryType,
  PYRO_COOKOFF_CHANCE_DRY,
  PYRO_COOKOFF_CHANCE_FULL,
  PYRO_COOKOFF_DAMAGE,
  PYRO_COOKOFF_FIRES,
  PYRO_COOKOFF_RADIUS,
} from "../catalog.js";
import { coverStrike } from "./field.js";
import { allies, burnTreeAt, isWater, nearestWalkable, occupant, playerTeam, tileCenter, worldToTile } from "./geo.js";
import { garrisonMuzzleToward, livingGarrison, woundGarrison } from "./garrison.js";
import { mortarAirZ } from "./mortar.js";
import { setPath } from "./path.js";
import { nextRand } from "./rng.js";
import { isAirborne } from "./air.js";
import type { Entity, GroundFire, MatchState, Projectile } from "./types.js";

/**
 * One glob of the Pyro's jet. It leaves the lance along his aim, arcs a
 * little, and comes down scattered around the aim point, never past his reach.
 * The burst is paced here: a glob a tick, then a pause once FLAMER_BURST are out.
 */
export function throwFlame(
  state: MatchState,
  e: Entity,
  aimX: number,
  aimY: number,
  range: number,
  forced: boolean,
): void {
  const dx = aimX - e.x;
  const dy = aimY - e.y;
  const dist = Math.hypot(dx, dy);
  const ux = dist > 1e-6 ? dx / dist : Math.cos(e.facing);
  const uy = dist > 1e-6 ? dy / dist : Math.sin(e.facing);
  const along = (nextRand(state) - 0.5) * 2 * FLAMER_SCATTER_ALONG;
  const across = (nextRand(state) - 0.5) * 2 * FLAMER_SCATTER_ACROSS;
  const reach = Math.min(range, Math.max(e.radius, dist + along));
  const maxX = Math.max(1, state.width * state.tileSize - 1);
  const maxY = Math.max(1, state.height * state.tileSize - 1);
  const landX = Math.min(maxX, Math.max(0, e.x + ux * reach - uy * across));
  const landY = Math.min(maxY, Math.max(0, e.y + uy * reach + ux * across));
  const flight = FLAMER_GLOB_SECONDS * (0.55 + 0.45 * Math.min(1, reach / Math.max(1, range)));
  // From inside, the jet leaves the opening facing the target, not the middle of the room.
  const slit = garrisonMuzzleToward(state, e, aimX, aimY);
  const fromX = slit?.x ?? e.x;
  const fromY = slit?.y ?? e.y;
  const p: Projectile = {
    id: state.nextId++,
    ownerId: e.ownerId,
    team: playerTeam(state, e.ownerId),
    x: fromX,
    y: fromY,
    vx: (landX - fromX) / flight,
    vy: (landY - fromY) / flight,
    damage: FLAMER.damage,
    penetration: FLAMER.penetration,
    caliber: FLAMER.caliber,
    life: flight,
    ignoreId: slit?.house.id ?? e.id,
    fromId: e.id,
    bounced: false,
    shell: null,
    flight: "flame",
    landX,
    landY,
    apex: FLAMER_APEX,
    flightTime: flight,
    harmAllies: forced,
    z: 0,
    ...(forced ? { aimX, aimY } : {}),
  };
  state.projectiles.push(p);
  e.clip = Math.max(0, e.clip - 1);
  // The last glob of a burst: he lets go of the trigger for a moment.
  e.cooldown = e.clip % FLAMER_BURST === 0 ? FLAMER_BURST_PAUSE : FLAMER_GLOB_INTERVAL;
}

/** Glob flight. True while it is still in the air. */
export function stepFlame(state: MatchState, p: Projectile, dt: number): boolean {
  const total = p.flightTime ?? Math.max(0.05, p.life);
  const stepDt = p.life > 0 ? Math.min(dt, p.life) : 0;
  p.x += p.vx * stepDt;
  p.y += p.vy * stepDt;
  p.life -= dt;
  const u = Math.min(1, Math.max(0, (total - Math.max(0, p.life)) / total));
  p.z = mortarAirZ(u, p.apex ?? 0);
  if (p.life > 0) return true;
  if (p.landX != null && p.landY != null) {
    p.x = p.landX;
    p.y = p.landY;
  }
  p.z = 0;
  landFlame(state, p);
  return false;
}

/** Share of the burn that reaches this entity. 0 for what fire does not hurt. */
export function burnShare(e: Entity): number {
  if (e.kind !== "unit" || e.hp <= 0 || e.wreck || e.garrisonedIn != null) return 0;
  if (e.drone || isAirborne(e)) return 0;
  if (isInfantryType(e.type)) {
    if (e.type === "pyro") return FIRE_PYRO_MUL;
    if (isCyborg(e.type)) return FIRE_CYBORG_MUL;
    return 1;
  }
  return isArmoredType(e.type) ? 0 : FIRE_SOFT_VEHICLE_MUL;
}

/** Fire is what killed this soldier. A later bullet cannot claim a man already at 0. */
function markFireKill(e: Entity, before: number): void {
  if (before > 0 && e.hp <= 0 && isInfantryType(e.type)) e.fireDeath = true;
}

/**
 * A forced jet burns the tree it was aimed at, and the tree the glob actually
 * lands on. Scatter often misses the trunk; the aim tile still goes. An
 * ordinary attack leaves the woods standing.
 */
function burnForcedTrees(state: MatchState, p: Projectile): void {
  if (!p.harmAllies) return;
  const ts = state.tileSize;
  const points = [{ x: p.x, y: p.y }];
  if (p.aimX != null && p.aimY != null) points.push({ x: p.aimX, y: p.aimY });
  for (const s of points) {
    const tx = worldToTile(s.x, ts);
    const ty = worldToTile(s.y, ts);
    if (!burnTreeAt(state, tx, ty)) continue;
    igniteAt(state, tileCenter(tx, ts), tileCenter(ty, ts), p.ownerId);
  }
}

/** Burning fuel lands: it splashes whoever it falls among, pours in at a window, and sets the ground alight. */
function landFlame(state: MatchState, p: Projectile): void {
  burnForcedTrees(state, p);
  const tx = worldToTile(p.x, state.tileSize);
  const ty = worldToTile(p.y, state.tileSize);
  if (isWater(state, tx, ty)) return;
  const houseId = occupant(state, tx, ty);
  const house = houseId ? state.entities.get(houseId) : undefined;
  if (house && house.kind === "building" && house.hp > 0) {
    // The jet goes in through the openings. The walls do not burn.
    if (livingGarrison(state, house).length > 0 && (p.harmAllies || !allies(state, p.ownerId, house.ownerId))) {
      woundGarrison(state, house, p.damage * 1.5, p.caliber);
    }
    return;
  }
  for (const e of state.entities.values()) {
    const share = burnShare(e);
    if (share <= 0 || e.id === p.fromId) continue;
    if (!p.harmAllies && allies(state, p.ownerId, e.ownerId)) continue;
    const d = Math.hypot(e.x - p.x, e.y - p.y);
    if (d > FLAMER_SPLASH + e.radius * 0.5) continue;
    const before = e.hp;
    coverStrike(e, p.damage * share, state.tick, false);
    markFireKill(e, before);
  }
  igniteAt(state, p.x, p.y, p.ownerId);
}

/**
 * Set the ground burning at a point. Fuel landing on a patch already burning
 * feeds it: it flares back up and spreads a little. Water, and the floor of a
 * building, do not burn.
 */
export function igniteAt(state: MatchState, x: number, y: number, ownerId: string): GroundFire | null {
  const tx = worldToTile(x, state.tileSize);
  const ty = worldToTile(y, state.tileSize);
  if (tx < 0 || ty < 0 || tx >= state.width || ty >= state.height) return null;
  if (isWater(state, tx, ty)) return null;
  const occ = occupant(state, tx, ty);
  if (occ && state.entities.get(occ)?.kind === "building") return null;
  let near: GroundFire | null = null;
  let nearD = Infinity;
  for (const f of state.fires) {
    const d = Math.hypot(f.x - x, f.y - y);
    if (d < f.radius * FIRE_MERGE_SHARE && d < nearD) {
      near = f;
      nearD = d;
    }
  }
  if (near) {
    near.life = near.lifeMax;
    near.radius = Math.min(FIRE_RADIUS_MAX, near.radius + FIRE_RADIUS * 0.12);
    near.x += (x - near.x) * 0.15;
    near.y += (y - near.y) * 0.15;
    return near;
  }
  const f: GroundFire = {
    id: state.nextId++,
    ownerId,
    x,
    y,
    radius: FIRE_RADIUS * (0.85 + nextRand(state) * 0.3),
    life: FIRE_SECONDS * (0.9 + nextRand(state) * 0.2),
    lifeMax: 0,
  };
  f.lifeMax = f.life;
  state.fires.push(f);
  if (state.fires.length > FIRE_CAP) state.fires.splice(0, state.fires.length - FIRE_CAP);
  return f;
}

/** 1 while the patch burns hot, sinking to 0 over the last FIRE_DIE_SHARE of its life. */
export function fireHeat(f: Pick<GroundFire, "life" | "lifeMax">): number {
  if (f.lifeMax <= 0 || f.life <= 0) return 0;
  const share = f.life / f.lifeMax;
  return share >= FIRE_DIE_SHARE ? 1 : share / FIRE_DIE_SHARE;
}

/** Hottest patch under this point, 0–1. Patches do not stack: one fire is as bad as two. */
export function heatAt(state: MatchState, x: number, y: number, pad = 0): number {
  let heat = 0;
  for (const f of state.fires) {
    const r = f.radius + pad;
    const dx = f.x - x;
    const dy = f.y - y;
    if (dx * dx + dy * dy > r * r) continue;
    heat = Math.max(heat, fireHeat(f));
  }
  return heat;
}

/** Burning ground: patches burn down, and burn whoever stands in them. Soldiers left idle walk out. */
export function tickFires(state: MatchState, dt: number): void {
  if (state.fires.length === 0) return;
  for (const f of state.fires) f.life -= dt;
  state.fires = state.fires.filter((f) => f.life > 0);
  if (state.fires.length === 0) return;
  for (const e of state.entities.values()) {
    const share = burnShare(e);
    if (share <= 0) continue;
    const heat = heatAt(state, e.x, e.y, e.radius * 0.3);
    if (heat <= 0) continue;
    const before = e.hp;
    coverStrike(e, FIRE_BURN_DPS * share * heat * dt, state.tick, false);
    markFireKill(e, before);
    if (e.hp > 0 && isInfantryType(e.type) && e.type !== "pyro") stepOutOfFire(state, e);
  }
}

/**
 * Nobody stands in flames by choice. A soldier with no order of his own (idle,
 * auto-engaging, or already falling back) walks to the nearest ground that is
 * not burning. A player's order, Hold, or a guard post keeps him where he is.
 */
function stepOutOfFire(state: MatchState, e: Entity): void {
  if (e.holdPosition || e.guardFacing != null || e.waypoints.length > 0) return;
  const k = e.order?.kind;
  if (k && k !== "withdraw" && !(k === "attack" && e.order?.auto)) return;
  const ts = state.tileSize;
  const base = Math.atan2(e.y - averageFireY(state, e), e.x - averageFireX(state, e));
  for (const step of [1, 2, 3]) {
    const dist = (FIRE_RADIUS_MAX + e.radius) * step;
    for (const off of [0, 0.6, -0.6, 1.2, -1.2, 1.9, -1.9, Math.PI]) {
      const a = base + off;
      const wx = e.x + Math.cos(a) * dist;
      const wy = e.y + Math.sin(a) * dist;
      const tile = nearestWalkable(state, worldToTile(wx, ts), worldToTile(wy, ts), e.type);
      if (!tile) continue;
      const cx = tileCenter(tile.x, ts);
      const cy = tileCenter(tile.y, ts);
      if (heatAt(state, cx, cy, e.radius) > 0) continue;
      e.order = { kind: "withdraw", x: cx, y: cy };
      e.attackTarget = null;
      e.state = "move";
      if (setPath(state, e, cx, cy)) return;
    }
  }
}

function burningNear(state: MatchState, e: Entity): GroundFire[] {
  return state.fires.filter((f) => Math.hypot(f.x - e.x, f.y - e.y) <= f.radius + FIRE_RADIUS_MAX * 2);
}

function averageFireX(state: MatchState, e: Entity): number {
  const near = burningNear(state, e);
  return near.length ? near.reduce((s, f) => s + f.x, 0) / near.length : e.x - Math.cos(e.facing);
}

function averageFireY(state: MatchState, e: Entity): number {
  const near = burningNear(state, e);
  return near.length ? near.reduce((s, f) => s + f.y, 0) / near.length : e.y - Math.sin(e.facing);
}

/** Chance his tanks go up when he is killed. More fuel left, more likely. */
export function cookOffChance(e: Pick<Entity, "clip">): number {
  const full = Math.min(1, Math.max(0, e.clip / FLAMER.clip));
  return PYRO_COOKOFF_CHANCE_DRY + (PYRO_COOKOFF_CHANCE_FULL - PYRO_COOKOFF_CHANCE_DRY) * full;
}

/**
 * A Pyro was just killed. Now and then a round has gone through the tanks:
 * they burst in a fireball that throws burning fuel around the body, catching
 * friend and foe. True when the tanks went up.
 */
export function maybeCookOff(state: MatchState, e: Entity): boolean {
  if (e.type !== "pyro" || e.garrisonedIn != null) return false;
  if (unitSwimming(state, e)) return false;
  if (nextRand(state) >= cookOffChance(e)) return false;
  cookOff(state, e);
  return true;
}

function unitSwimming(state: MatchState, e: Entity): boolean {
  return isWater(state, worldToTile(e.x, state.tileSize), worldToTile(e.y, state.tileSize));
}

/** The fireball, the burning fuel it throws, and the impact the clients draw. */
export function cookOff(state: MatchState, e: Entity): void {
  const r = PYRO_COOKOFF_RADIUS;
  for (const o of state.entities.values()) {
    if (o.id === e.id || o.hp <= 0 || o.wreck || o.garrisonedIn != null) continue;
    if (o.drone || isAirborne(o)) continue;
    const reach = o.kind === "building" ? r + Math.min(o.tileW, o.tileH) * state.tileSize * 0.25 : r + o.radius * 0.5;
    const d = Math.hypot(o.x - e.x, o.y - e.y);
    if (d > reach) continue;
    const falloff = 1 - 0.75 * Math.min(1, d / reach);
    let mul = 1;
    if (o.kind === "building") mul = 0.5;
    else if (isCyborg(o.type)) mul = 0.4;
    else if (isArmoredType(o.type)) mul = 0.25;
    else if (!isInfantryType(o.type)) mul = 0.8;
    const dmg = PYRO_COOKOFF_DAMAGE * falloff * mul;
    if (o.kind === "building" && livingGarrison(state, o).length > 0) woundGarrison(state, o, dmg * 0.5, FLAMER.caliber);
    const before = o.hp;
    coverStrike(o, dmg, state.tick, false);
    markFireKill(o, before);
  }
  igniteAt(state, e.x, e.y, e.ownerId);
  const spin = nextRand(state) * Math.PI * 2;
  for (let i = 0; i < PYRO_COOKOFF_FIRES; i++) {
    const a = spin + (i / PYRO_COOKOFF_FIRES) * Math.PI * 2 + (nextRand(state) - 0.5) * 0.5;
    const d = r * (0.45 + nextRand(state) * 0.4);
    igniteAt(state, e.x + Math.cos(a) * d, e.y + Math.sin(a) * d, e.ownerId);
  }
  state.impacts.push({
    id: state.nextId++,
    ownerId: e.ownerId,
    kind: "kill",
    x: e.x,
    y: e.y,
    vx: 0,
    vy: 0,
    fromId: e.id,
    blast: true,
    cookoff: true,
  });
}
