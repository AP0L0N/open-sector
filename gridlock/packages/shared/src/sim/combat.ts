import {
  AIR_HIT_BAND,
  APOCALYPSE_CIWS_INTERCEPT_CHANCE,
  APOCALYPSE_CIWS_RANGE_TILES,
  APOCALYPSE_CIWS_SHOTS_PER_TICK,
  APOCALYPSE_CIWS_TURN_DEG_PER_SEC,
  APOCALYPSE_TWIN_GAP,
  APOCALYPSE_TWIN_WINDOW,
  CIWS_AIR_REACH_MUL,
  CIWS_AIR_SPREAD,
  CIWS_AIR_Z_SCATTER,
  CIWS_GUN,
  GATLING_GROUND_SPREAD_MUL,
  GATLING_STREAM_WANDER_DEG,
  GATLING_STREAM_WANDER_HZ,
  GATLING_STREAM_WANDER_Z,
  FACE_FIRE_DEG,
  gatlingHeatOf,
  gatlingSprayOf,
  RADAR_LONG_RANGE_SPREAD,
  mainGunBarrels,
  roofCiwsOf,
  SMALL_ARMS_SPEED,
  aimFacing,
  beltOf,
  CIWS_INTERCEPT_CHANCE,
  CIWS_INTERCEPT_ROUNDS,
  CIWS_INTERCEPTS_PER_TICK,
  RAM_INTERCEPT_CHANCE,
  RAM_INTERCEPT_INTERVAL,
  RAM_ROCKET,
  radarLaidOf,
  TICK_DT,
  MG42_BIPOD_SECONDS,
  MORTAR,
  MORTAR_LOB,
  MORTAR_MIN_RANGE_TILES,
  MORTAR_PLANT_SECONDS,
  MORTAR_SPLASH_TILES,
  ARTILLERY_MIN_RANGE_TILES,
  ARTILLERY_BUILDING_MUL,
  ARTILLERY_SHELL,
  ROCKET_BUILDING_MUL,
  type LobShellDef,
  addCrit,
  FW190_BARRAGE_LINE_TILES,
  FW190_ROOF_ENGINE_CHANCE,
  FW190_SPLASH_DAMAGE,
  FW190_SPLASH_TILES,
  isMotorVehicle,
  catalog,
  isLightHull,
  gunArcDegOf,
  GARRISON_STRUCTURAL_CALIBER,
  GUARD_CONE_DEG,
  HAULER_SMOKE_COOLDOWN,
  HAULER_SMOKE_RELOAD,
  PROJECTILE_RADIUS,
  TANK_MG,
  WALKER_ONE_BURST,
  walkerGunsOf,
  TREE_COVER_HEIGHT,
  TREE_HIT_CHANCE,
  WITHDRAW_TILES,
  coverHeightOf,
  fires,
  hasAmmo,
  hasCrit,
  hasMg,
  hasTracks,
  hasTurret,
  infantryGunFor,
  isTransportType,
  PTRD_CALIBER,
  PTRD_CLOSE_TILES,
  PTRD_TRACK_CHANCE,
  ptrdPenetration,
  scopedHpFraction,
  entityIsScouting,
  garrisonFullArmsOf,
  garrisonOpenTopOf,
  isCivilianType,
  isFieldStructure,
  isGarrisonable,
  isInfantryType,
  isSmokeShell,
  stanceOf,
  leavesWreck,
  pickLoadedShell,
  reloadSecondsOf,
  rocketsOf,
  launcherOnlyOf,
  rocketRackOf,
  type RocketRackDef,
  LAUNCHER_ROCKET_RACK,
  PENETRATOR_RACK,
  FLAMER_BURST,
  type CatalogEntry,
  type ShellType,
} from "../catalog.js";
import type { ImpactKind, ImpactView } from "../protocol.js";
import {
  WALL_COVER_DR,
  coverStrike,
  isTankShell,
  ruinSandbags,
  sandbagSweep,
  sandbagsBlockGun,
  wallSweep,
  greatWallSweep,
  woundBehindSandbags,
} from "./field.js";
import {
  aimAngle,
  armorHarmPossible,
  hitFace,
  isArmored,
  ptrdHarmPossible,
  resolveAtRifleHit,
  resolveGatlingLight,
  resolveRoofHit,
  resolveHit,
  scatterHullImpact,
  RICOCHET_SPARK_SPEED,
  RICOCHET_TRAVEL,
  RICOCHET_TRAVEL_MIN,
} from "./ballistics.js";
import { fireStats, hullTurnMul, immobilized, rollCrits, takeDamage } from "./crits.js";
import { damageMaulerCart } from "./mauler-cart.js";
import { artilleryCanLay, artilleryReady, artilleryReloadMul, blastOnGun, bulletOnGun, gunCrewOf } from "./artillery.js";
import { noteImpactSurface } from "./remains.js";
import { stanceHitRadiusMul, stanceTargetSpreadMul, tickStance } from "./stance.js";
import {
  aimHeight,
  airAlt,
  canAimWeapon,
  entityHeight,
  longReachMul,
  rangeTilesOf,
  muzzleHeight,
  shotClearsCover,
  sightTilesForEntity,
  tileHeight,
  weaponRangeWorld,
  worldTileHeight,
} from "./elevation.js";
import {
  allies,
  buildingBounds,
  clearOrder,
  fellTreeAt,
  inBounds,
  isTree,
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
  garrisonMuzzleToward,
  syncHullGarrisons,
  wallsShieldGarrison,
  woundGarrison,
} from "./garrison.js";
import {
  mortarAirZ,
  mortarApex,
  mortarArmorNick,
  mortarFalloff,
  mortarFlightSeconds,
  mortarLanding,
  mortarScatterRadius,
  rocketArmorDamage,
  rocketScatterRadius,
} from "./mortar.js";
import { setPath } from "./path.js";
import { nextRand } from "./rng.js";
import { isSupplyBullet, noteSupplyHit, stowedInTransport, supplyRiderFights, syncSupplyRiders } from "./supply.js";
import { spawnSmokeCloud } from "./smoke.js";
import { stepFlame, throwFlame } from "./flame.js";
import { distToRoute } from "./patrol.js";
import { canSeeEntity } from "./vision.js";
import { hideScout, woundScout } from "./scout.js";
import { escorting, reversing, stepTurn, turnToward, turnTurretTo, turnTurretToward } from "./orders.js";
import { airTargetSpreadMul, isAirborne, isCrashing, reachesAircraft, stepBomb } from "./air.js";
import { stepCluster } from "./airdrop.js";
import { projectileMeetsDrone, reachesDrone } from "./drone.js";
import { reachesJet } from "./jet.js";
import { nightReachMul, nightTiles } from "./night.js";
import type { Entity, MatchState, Order, Projectile } from "./types.js";

/** A twin mount's barrels sit this share of the hull radius either side of the bore line. */
const TWIN_GUN_SIDE = 0.25;

/**
 * A soldier who can shoot from inside this host. A house window is not a
 * bipod ledge, a roof is not a mortar pit, and a truck driver keeps his
 * weapon slung. Hidden garrisons and men in a transport bay do not fire.
 */
export function garrisonCanShoot(state: MatchState, unit: Entity, host: Entity): boolean {
  if (unit.hp <= 0 || unit.wreck || unit.garrisonedIn !== host.id) return false;
  if (!fires(unit.type) || !supplyRiderFights(state, unit)) return false;
  if (host.garrisonHide || isTransportType(host.type)) return false;
  if (unit.type === "gunner") {
    // The truck bed is a ledge for the bipod, the same as a bunker slit.
    const ledge = host.type === "supply" || garrisonFullArmsOf(host.type);
    return ledge && !hasCrit(unit, "arm");
  }
  if (unit.type === "mortarman") return garrisonOpenTopOf(host.type) && !hasCrit(unit, "arm");
  if (
    (unit.type === "sniper" || unit.type === "atinfantry" || unit.type === "rocketer" || unit.type === "pyro") &&
    !infantryGunFor(unit)
  ) {
    return false;
  }
  return true;
}

/** The point is inside this soldier's reach from where he is standing now. */
export function garrisonShotReaches(
  state: MatchState,
  unit: Entity,
  x: number,
  y: number,
  target?: Entity,
): boolean {
  const dist = Math.hypot(x - unit.x, y - unit.y);
  if (dist > weaponRangeWorld(state, unit)) return false;
  const min = infantryGunFor(unit)?.minRangeTiles;
  if (min != null && dist < min * state.tileSize) return false;
  return canAimWeapon(state, unit, x, y, target);
}

/**
 * A force-attack on a Mammoth, bunker, tower, house, or trench is also the
 * aim of every soldier who can fire from it. They take the point only while
 * it is in range, and they never leave the host to chase it.
 */
export function relayGarrisonForce(state: MatchState): void {
  for (const host of state.entities.values()) {
    if (host.hp <= 0 || host.garrison.length === 0) continue;
    const order = host.order;
    if (!order || order.kind !== "forceattack") {
      releaseRelayedForce(state, host);
      continue;
    }
    const aimed = forceAim(state, order);
    if (!aimed || host.garrisonHide || isTransportType(host.type)) {
      if (!aimed && !fires(host.type) && !radarLaidOf(host.type)) clearOrder(host);
      releaseRelayedForce(state, host);
      continue;
    }
    for (const u of livingGarrison(state, host)) {
      if (!garrisonCanShoot(state, u, host) || !garrisonShotReaches(state, u, aimed.x, aimed.y, aimed.target)) {
        if (u.order?.relay) clearOrder(u);
        continue;
      }
      if (sameRelayedAim(u.order, order)) continue;
      u.order = {
        kind: "forceattack",
        x: aimed.x,
        y: aimed.y,
        targetId: order.targetId,
        relay: true,
      };
      u.attackTarget = order.targetId ?? null;
      u.waypoints = [];
      u.guardFacing = null;
      u.harvestTile = null;
      u.state = "garrison";
    }
  }
}

function forceAim(
  state: MatchState,
  order: Order,
): { x: number; y: number; target?: Entity } | null {
  if (order.targetId != null) {
    const target = state.entities.get(order.targetId);
    if (!target || target.hp <= 0) return null;
    return { x: target.x, y: target.y, target };
  }
  if (order.x == null || order.y == null) return null;
  return { x: order.x, y: order.y };
}

function sameRelayedAim(current: Order | null, host: Order): boolean {
  if (!current?.relay || current.kind !== "forceattack") return false;
  if ((current.targetId ?? null) !== (host.targetId ?? null)) return false;
  if (host.targetId == null && (current.x !== host.x || current.y !== host.y)) return false;
  return true;
}

function releaseRelayedForce(state: MatchState, host: Entity): void {
  for (const u of livingGarrison(state, host)) {
    if (u.order?.relay) clearOrder(u);
  }
}

export function tickCombat(state: MatchState, dt: number): void {
  syncSupplyRiders(state);
  syncHullGarrisons(state);
  relayGarrisonForce(state);
  for (const e of state.entities.values()) {
    if (!canFight(e) || !supplyRiderFights(state, e)) continue;
    tickWeaponClocks(e, dt);
    if (waterSilences(state, e) || garrisonIsHiding(state, e)) continue;
    resolveTarget(state, e);
  }
  tickStance(state);
  const downed = new Set<number>();
  // Missiles launched later in this tick (a Rocketer, a Titan pod) are born at or after this id.
  const bornAt = state.nextId;
  for (const e of state.entities.values()) {
    if (!canFight(e) || !supplyRiderFights(state, e) || waterSilences(state, e) || garrisonIsHiding(state, e)) continue;
    if (roofCiwsOf(e.type)) tickRoofCiws(state, e, dt, downed);
    if (interceptRockets(state, e, downed)) continue;
    fireAtCurrent(state, e, dt);
  }
  // Rocket racks: their own clock, whatever the main gun is doing. Titan pods also pick their own target.
  for (const e of state.entities.values()) {
    if (!rocketsOf(e.type) || !canFight(e)) continue;
    tickRocketPods(state, e);
  }
  // The roof mount's first look ran before those launches. Catch the new missiles before they fly.
  for (const e of state.entities.values()) {
    if (!roofCiwsOf(e.type) || !canFight(e) || waterSilences(state, e) || garrisonIsHiding(state, e)) continue;
    if (roofRocketSweep(state, e, downed, bornAt)) e.ciwsTarget = null;
  }
  if (downed.size > 0) state.projectiles = state.projectiles.filter((p) => !downed.has(p.id));
}

/**
 * CIWS against rockets. Each hostile rocket inside the gun's reach draws one
 * burst from each mount, nearest first, CIWS_INTERCEPTS_PER_TICK a tick. A
 * hit bursts it in the air and nothing under it is hurt. True when the mount
 * spent this tick on rockets, so it does not also fire on its ground target.
 */
function interceptRockets(state: MatchState, e: Entity, downed: Set<number>): boolean {
  if (!radarLaidOf(e.type)) return false;
  if (rocketsOf(e.type)) return launchInterceptor(state, e, downed);
  if (e.clip <= 0 || gatlingHot(e)) return false;
  return burstRockets(state, e, downed, {
    // Max range reaches for units only. Rockets are met inside the normal reach.
    range: weaponRangeWorld(state, e) / longReachMul(e),
    rounds: () => e.clip,
    spend: (n) => {
      e.clip -= n;
      heatGatling(e, n);
    },
    lay: (facing) => {
      // The radar lays the barrels straight onto the nearest rocket.
      e.turretFacing = facing;
      e.gatlingFire = { tick: state.tick, arms: 1 };
      e.cooldown = TICK_DT;
    },
  });
}

/** A radar-laid 20mm that bursts rockets: the CIWS pad's gun, or the Apocalypse's roof mount. */
interface RocketGun {
  range: number;
  rounds: () => number;
  spend: (n: number) => void;
  /** Lays the barrels on the nearest rocket tried, and starts the gun's clock. */
  lay: (facing: number) => void;
  /** Burst chance for one full belt burst. The pad uses CIWS_INTERCEPT_CHANCE. */
  chance?: number;
  /** Skip projectiles born before this id, so a second look only sees missiles launched this tick. */
  bornAfter?: number;
}

/** One burst at each hostile rocket in reach this mount has not tried, nearest first. True when it fired. */
function burstRockets(state: MatchState, e: Entity, downed: Set<number>, gun: RocketGun): boolean {
  const range = gun.range;
  const inbound: { p: Projectile; d: number }[] = [];
  for (const p of state.projectiles) {
    if (p.flight !== "rocket" || downed.has(p.id) || p.ciwsTried?.includes(e.id)) continue;
    if (gun.bornAfter != null && p.id < gun.bornAfter) continue;
    if (allies(state, e.ownerId, p.ownerId)) continue;
    const d = Math.hypot(p.x - e.x, p.y - e.y);
    if (d <= range) inbound.push({ p, d });
  }
  if (inbound.length === 0) return false;
  inbound.sort((a, b) => a.d - b.d || a.p.id - b.p.id);
  const first = inbound[0]!.p;
  const chance = gun.chance ?? CIWS_INTERCEPT_CHANCE;
  for (const { p } of inbound.slice(0, CIWS_INTERCEPTS_PER_TICK)) {
    if (gun.rounds() <= 0) break;
    const spent = Math.min(gun.rounds(), CIWS_INTERCEPT_ROUNDS);
    gun.spend(spent);
    // An ordinary rocket gets one try. A heavy round stays on the gun until it comes apart.
    const heavy = (p.plate ?? 1) > 1;
    if (!heavy) (p.ciwsTried ??= []).push(e.id);
    if (nextRand(state) >= chance * (spent / CIWS_INTERCEPT_ROUNDS)) continue;
    const killed = burstBreaksRocket(p);
    if (killed) {
      if (heavy) (p.ciwsTried ??= []).push(e.id);
      downed.add(p.id);
    }
    state.impacts.push({
      id: state.nextId++,
      ownerId: e.ownerId,
      kind: killed ? "kill" : "hit",
      fromId: e.id,
      x: p.x,
      y: p.y,
      vx: p.vx,
      vy: p.vy,
      caliber: p.caliber,
      blast: true,
      intercept: true,
    });
  }
  gun.lay(Math.atan2(first.y - e.y, first.x - e.x));
  return true;
}

/** Roof mount reach: its own base, plus the height bonus every gun gets. */
function roofCiwsRange(state: MatchState, e: Entity): number {
  return (
    rangeTilesOf(e.type, entityHeight(state, e), APOCALYPSE_CIWS_RANGE_TILES) * state.tileSize * nightReachMul(state.tick)
  );
}

/** The 20mm can put damage on this unit from here. Soft targets and an open hatch always. */
function roofRoundCanHarm(e: Entity, target: Entity): boolean {
  const def = catalog(target.type);
  if (!isArmored(def) || entityIsScouting(target)) return true;
  return armorHarmPossible({
    gun: CIWS_GUN_STATS,
    target: def,
    targetFacing: target.facing,
    targetHpMax: target.hpMax,
    vx: target.x - e.x,
    vy: target.y - e.y,
  });
}

/** The roof mount fires the CIWS pad's own 20mm round. */
const CIWS_GUN_STATS = { ...CIWS_GUN, projectileSpeed: SMALL_ARMS_SPEED };

/**
 * What the roof mount lays on. Like the CIWS pad: units only, a plane or a
 * drone in the air before anything on the ground, nearest first, seen by the
 * side, and nothing its rounds cannot hurt. No player order moves it.
 */
function roofCiwsTarget(state: MatchState, e: Entity, range: number): Entity | undefined {
  let best: Entity | undefined;
  let bestD = range * range;
  let bestAir: Entity | undefined;
  let bestAirD = range * range;
  for (const o of state.entities.values()) {
    if (o.kind !== "unit" || o.hp <= 0 || o.id === e.id || o.wreck || o.garrisonedIn != null) continue;
    if (allies(state, e.ownerId, o.ownerId)) continue;
    const air = isAirborne(o) || !!o.drone;
    const d = (o.x - e.x) ** 2 + (o.y - e.y) ** 2;
    if (d > (air ? bestAirD : bestD)) continue;
    if (!canSeeEntity(state, e.ownerId, o)) continue;
    if (!air && !roofRoundCanHarm(e, o)) continue;
    if (air) {
      bestAirD = d;
      bestAir = o;
    } else {
      bestD = d;
      best = o;
    }
  }
  return bestAir ?? best;
}

/**
 * One intercept look for the roof mount. `bornAfter` limits it to missiles
 * launched this tick, so the look after the rocket pods does not spend a
 * second burst on a rocket the first look already tried.
 */
function roofRocketSweep(state: MatchState, e: Entity, downed: Set<number>, bornAfter?: number): boolean {
  if (e.mgAmmo <= 0 || gatlingHot(e)) return false;
  return burstRockets(state, e, downed, {
    range: roofCiwsRange(state, e),
    rounds: () => e.mgAmmo,
    spend: (n) => {
      e.mgAmmo = Math.max(0, e.mgAmmo - n);
      heatGatling(e, n);
    },
    lay: (facing) => {
      e.ciwsFacing = facing;
      e.ciwsFireTick = state.tick;
      e.mgCooldown = TICK_DT;
    },
    chance: APOCALYPSE_CIWS_INTERCEPT_CHANCE,
    bornAfter,
  });
}

/**
 * The Apocalypse's roof mount. Its own traverse, target, and clock, whatever
 * the main guns are doing: a hostile missile in reach first, then the best unit
 * it can hurt. With nothing to shoot it swings back to ride the turret. The
 * belt is the coaxial MG's (mgAmmo), so only a supply truck refills it.
 * Missiles launched later in the tick get a second look from tickCombat.
 */
function tickRoofCiws(state: MatchState, e: Entity, dt: number, downed: Set<number>): void {
  const range = roofCiwsRange(state, e);
  if (e.mgCooldown <= 0 && roofRocketSweep(state, e, downed)) {
    e.ciwsTarget = null;
    return;
  }
  const target = e.mgAmmo > 0 ? roofCiwsTarget(state, e, range) : undefined;
  e.ciwsTarget = target?.id ?? null;
  const want = target ? Math.atan2(target.y - e.y, target.x - e.x) : e.turretFacing;
  const turn = stepTurn(e.ciwsFacing ?? e.turretFacing, want, APOCALYPSE_CIWS_TURN_DEG_PER_SEC, dt);
  e.ciwsFacing = turn.angle;
  if (!target || e.mgCooldown > 0 || gatlingHot(e) || Math.abs(turn.remainingDeg) > FACE_FIRE_DEG) return;
  const dist = Math.hypot(target.x - e.x, target.y - e.y);
  for (let i = 0; i < APOCALYPSE_CIWS_SHOTS_PER_TICK && e.mgAmmo > 0; i++) {
    fireRound(state, e, target.x, target.y, CIWS_GUN_STATS, range, dist, {
      target,
      bearing: e.ciwsFacing,
      accurateRange: range,
      radar: true,
    });
    e.mgAmmo -= 1;
    heatGatling(e, 1);
  }
  e.ciwsFireTick = state.tick;
  e.mgCooldown = TICK_DT;
}

/**
 * RAM against rockets. The nearest hostile rocket in reach that this mount has
 * not tried draws one interceptor off the rack, RAM_INTERCEPT_INTERVAL apart,
 * with RAM_INTERCEPT_CHANCE to burst it in the air. The rack's clock covers
 * both, so an interceptor holds the next barrage rocket back. Tubes off or an
 * empty rack, it lets rockets by.
 */
function launchInterceptor(state: MatchState, e: Entity, downed: Set<number>): boolean {
  if (e.rocketsOff || (e.rockets ?? 0) <= 0 || (e.rocketCooldown ?? 0) > 0) return false;
  const range = weaponRangeWorld(state, e) / longReachMul(e);
  let best: Projectile | undefined;
  let bestD = Infinity;
  for (const p of state.projectiles) {
    if (p.flight !== "rocket" || downed.has(p.id) || p.ciwsTried?.includes(e.id)) continue;
    if (allies(state, e.ownerId, p.ownerId)) continue;
    const d = Math.hypot(p.x - e.x, p.y - e.y);
    if (d <= range && (d < bestD || (d === bestD && best && p.id < best.id))) {
      best = p;
      bestD = d;
    }
  }
  if (!best) return false;
  e.rockets = Math.max(0, (e.rockets ?? 0) - 1);
  if (e.rockets <= 0) e.rocketSalvo = 0;
  e.rocketCooldown = e.rockets > 0 ? RAM_INTERCEPT_INTERVAL : rocketRackOf(e.type).reload;
  const heavy = (best.plate ?? 1) > 1;
  if (!heavy) (best.ciwsTried ??= []).push(e.id);
  e.turretFacing = Math.atan2(best.y - e.y, best.x - e.x);
  const connected = nextRand(state) < RAM_INTERCEPT_CHANCE;
  const killed = connected && burstBreaksRocket(best);
  if (killed) {
    if (heavy) (best.ciwsTried ??= []).push(e.id);
    downed.add(best.id);
  }
  // A burst in the air either way: the interceptor's own, on the rocket or just off it.
  state.impacts.push({
    id: state.nextId++,
    ownerId: e.ownerId,
    kind: killed ? "kill" : connected ? "hit" : "miss",
    fromId: e.id,
    x: best.x,
    y: best.y,
    vx: best.vx,
    vy: best.vy,
    caliber: RAM_ROCKET.caliber,
    blast: true,
    intercept: true,
  });
  return true;
}

/** Standing in water stops every gun except the Titan's shoulder rockets, which ride above it. */
function waterSilences(state: MatchState, e: Entity): boolean {
  return unitInWater(state, e) && !rocketsOf(e.type);
}

function canFight(e: Entity): boolean {
  // Aircraft fire their own guns and bombs in tickAir.
  // A paratrooper under his canopy keeps his rifle slung until he is down.
  if (e.type === "artillery" && gunCrewOf(e) === 0) return false;
  return fires(e.type) && e.hp > 0 && !e.wreck && !e.air && !e.chute && e.state !== "deploy" && e.state !== "undeploy";
}

/**
 * A plane in the air is out of reach for tank guns and the mortar. A drone
 * has its own rule: high, only anti-air guns; low, bullets and rockets.
 */
function outOfReachAloft(e: Entity, target: Entity): boolean {
  if (target.drone) return !reachesDrone(e, target);
  // A Jump Jet in the air: anti-air weapons only.
  if (target.jet) return isAirborne(target) && !reachesJet(e);
  return isAirborne(target) && !reachesAircraft(e);
}

/** Move, attack-move, patrol, and unit-escort all engage in-range enemies. Attack-move halts; the others keep walking. */
function travelFights(e: Entity): boolean {
  const k = e.order?.kind;
  return k === "attackmove" || k === "move" || k === "patrol" || escorting(e);
}

/**
 * Patrol contact. Runs before movement so a unit peels off the same tick an
 * enemy comes within weapon range of its route. The order stays a patrol.
 */
export function tickPatrol(state: MatchState): void {
  const groups = new Map<number, Entity[]>();
  const solo: Entity[] = [];
  for (const e of state.entities.values()) {
    if (e.order?.kind !== "patrol" || !e.order.route || e.order.route.length < 2) continue;
    if (e.hp <= 0 || e.wreck || e.air) continue;
    const g = e.order.group;
    if (g == null) solo.push(e);
    else {
      const list = groups.get(g);
      if (list) list.push(e);
      else groups.set(g, [e]);
    }
  }
  for (const members of groups.values()) focusPatrolGroup(state, members);
  for (const e of solo) focusPatrolGroup(state, [e]);
}

/** A patrol member who can actually shoot. Haulers, medics, and a dry pyro keep walking. */
function patrolCanFight(e: Entity): boolean {
  if (!fires(e.type) || e.hp <= 0 || e.wreck || e.air || e.chute) return false;
  if (e.garrisonedIn != null || e.state === "deploy" || e.state === "undeploy") return false;
  if (e.type === "pyro" && e.clip <= 0 && e.reload <= 0) return false;
  return true;
}

/** Enemy unit this fighter can harm, seen, and within weapon range of the patrol line. */
function patrolContact(state: MatchState, e: Entity, o: Entity): boolean {
  const route = e.order?.route;
  if (!route) return false;
  if (o.kind !== "unit" || o.hp <= 0 || o.wreck || o.id === e.id || o.garrisonedIn != null) return false;
  if (isCrashing(o) || !o.ownerId || allies(state, e.ownerId, o.ownerId)) return false;
  if (!canSeeEntity(state, e.ownerId, o) || outOfReachAloft(e, o)) return false;
  if (dropsUnharmedArmor(state, e, o)) return false;
  const range = weaponRangeWorld(state, e);
  if (range <= 0) return false;
  return distToRoute(route, o.x, o.y) <= range;
}

/**
 * One patrol order. Every fighter who can reach the shared enemy takes it.
 * The enemy the most of them can reach wins. A tie stays on the target they
 * already had, then the one closest to the path. A fighter who cannot reach
 * that one takes his own nearest contact.
 */
function focusPatrolGroup(state: MatchState, members: Entity[]): void {
  const fighters = members.filter(patrolCanFight);
  const rows = new Map<number, { enemy: Entity; who: Entity[]; dist: number }>();
  for (const e of fighters) {
    const route = e.order!.route!;
    for (const o of state.entities.values()) {
      if (!patrolContact(state, e, o)) continue;
      let row = rows.get(o.id);
      if (!row) {
        row = { enemy: o, who: [], dist: distToRoute(route, o.x, o.y) };
        rows.set(o.id, row);
      }
      row.who.push(e);
      row.dist = Math.min(row.dist, distToRoute(route, o.x, o.y));
    }
  }

  let sticky: number | null = null;
  let stickyN = 0;
  const tallies = new Map<number, number>();
  for (const e of fighters) {
    if (e.attackTarget == null) continue;
    const n = (tallies.get(e.attackTarget) ?? 0) + 1;
    tallies.set(e.attackTarget, n);
    if (n > stickyN) {
      sticky = e.attackTarget;
      stickyN = n;
    }
  }

  let bestId: number | null = null;
  let bestCount = 0;
  let bestDist = Infinity;
  for (const [id, row] of rows) {
    const count = row.who.length;
    const closerTie = count === bestCount && id !== sticky && bestId !== sticky && row.dist < bestDist;
    const keepSticky = count === bestCount && id === sticky && bestId !== sticky;
    if (bestId == null || count > bestCount || keepSticky || closerTie) {
      bestId = id;
      bestCount = count;
      bestDist = row.dist;
    }
  }

  const focus = bestId != null ? rows.get(bestId) : undefined;
  const onFocus = new Set(focus?.who.map((f) => f.id) ?? []);
  for (const e of members) {
    if (!patrolCanFight(e)) {
      e.attackTarget = null;
      continue;
    }
    if (focus && onFocus.has(e.id)) {
      e.attackTarget = focus.enemy.id;
      continue;
    }
    let near: Entity | undefined;
    let nearD = Infinity;
    for (const row of rows.values()) {
      if (!row.who.includes(e)) continue;
      const d = Math.hypot(row.enemy.x - e.x, row.enemy.y - e.y);
      if (d < nearD) {
        nearD = d;
        near = row.enemy;
      }
    }
    e.attackTarget = near?.id ?? null;
  }
}

function resolveTarget(state: MatchState, e: Entity): Entity | undefined {
  // The CIWS lays on the best target in reach every tick, so a plane cuts in at once.
  // A player force-attack holds it on that point or target instead, until Stop or the target is gone.
  if (radarLaidOf(e.type) && e.order?.kind !== "forceattack") {
    const pick = acquire(state, e);
    e.attackTarget = pick?.id ?? null;
    e.order = pick ? { kind: "attack", targetId: pick.id, auto: true } : null;
    if (!pick && e.state === "attack") e.state = "idle";
    return pick;
  }
  if (e.order?.kind === "forceattack") {
    if (e.order.targetId == null) {
      e.attackTarget = null;
      return undefined;
    }
    const t = state.entities.get(e.order.targetId);
    if (!t || t.hp <= 0 || t.id === e.id || isCrashing(t) || walkerSparesBuilding(state, e, t) || outOfReachAloft(e, t)) {
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
    if (
      !target ||
      target.hp <= 0 ||
      isCrashing(target) ||
      outOfReachAloft(e, target) ||
      skipsFriendly(state, e, target) ||
      dropsEmptyGarrison(state, e, target) ||
      walkerSparesBuilding(state, e, target) ||
      dropsWreck(e, target) ||
      dropsUnharmedArmor(state, e, target)
    ) {
      e.order = null;
      e.attackTarget = null;
      target = undefined;
      if (e.state === "attack") e.state = "idle";
    }
  } else if (travelFights(e) && e.attackTarget != null) {
    target = state.entities.get(e.attackTarget);
    if (
      !target ||
      target.hp <= 0 ||
      isCrashing(target) ||
      outOfReachAloft(e, target) ||
      skipsFriendly(state, e, target) ||
      dropsEmptyGarrison(state, e, target) ||
      walkerSparesBuilding(state, e, target) ||
      dropsWreck(e, target) ||
      dropsUnharmedArmor(state, e, target)
    ) {
      e.attackTarget = null;
      target = undefined;
    }
  }

  // Auto-fire, attack-move, and guard drop a target the side cannot see.
  // A planted mortar still lobs past its own eyes when a teammate has the target.
  if (
    target &&
    e.order?.kind !== "forceattack" &&
    !canSeeEntity(state, e.ownerId, target)
  ) {
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

  if (
    !escorting(e) &&
    e.guardFacing != null &&
    (!e.order || e.order.kind === "guard") &&
    e.waypoints.length === 0
  ) {
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
  if (!t || t.hp <= 0 || t.id === e.id || isCrashing(t)) return undefined;
  if (outOfReachAloft(e, t)) return undefined;
  if (e.order?.kind !== "forceattack" && skipsFriendly(state, e, t)) return undefined;
  if (e.order?.kind !== "forceattack" && dropsEmptyGarrison(state, e, t)) return undefined;
  if (walkerSparesBuilding(state, e, t)) return undefined;
  if (e.order?.kind !== "forceattack" && dropsWreck(e, t)) return undefined;
  if (e.order?.kind !== "forceattack" && dropsUnharmedArmor(state, e, t)) return undefined;
  return t;
}

function skipsFriendly(state: MatchState, e: Entity, target: Entity): boolean {
  return !target.wreck && allies(state, e.ownerId, target.ownerId);
}

/** Auto-fire stops once a hull is wrecked so the wreck stays. A player order can still shoot it. */
function dropsWreck(e: Entity, target: Entity): boolean {
  if (!target.wreck) return false;
  if (e.order?.kind === "forceattack") return false;
  if (e.order?.kind === "attack" && !e.order.auto) return false;
  return true;
}

/**
 * Auto-fire stays quiet when this soldier's round cannot mark the hull.
 * A player attack or force-attack still fires.
 */
function dropsUnharmedArmor(state: MatchState, e: Entity, target: Entity): boolean {
  if (!isInfantryType(e.type) && !radarLaidOf(e.type)) return false;
  if (e.order?.kind === "forceattack") return false;
  if (e.order?.kind === "attack" && !e.order.auto) return false;
  return !infantryRoundCanHarm(state, e, target);
}

/** The shot from here can put damage on that hull. Unarmored targets always can. Covers the CIWS gun too. */
function infantryRoundCanHarm(state: MatchState, e: Entity, target: Entity): boolean {
  if (target.kind !== "unit") return true;
  // Bullets only find the crew. An empty field gun is worth a bomb or a rocket, not a rifle.
  if (target.type === "artillery" && gunCrewOf(target) === 0) {
    const gun = infantryGunFor(e);
    if (radarLaidOf(e.type)) return false;
    return !!gun && (gun.id === "mortar" || gun.id === "launcher" || gun.id === "penetrator" || gun.caliber >= GARRISON_STRUCTURAL_CALIBER);
  }
  const def = catalog(target.type);
  if (!isArmored(def)) return true;
  if (radarLaidOf(e.type)) {
    if (entityIsScouting(target)) return true;
    return armorHarmPossible({
      gun: catalog(e.type),
      target: def,
      targetFacing: target.facing,
      targetHpMax: target.hpMax,
      vx: target.x - e.x,
      vy: target.y - e.y,
    });
  }
  const gun = infantryGunFor(e);
  if (!gun) return false;
  // A bomb or a rocket burst always nicks the hull.
  if (gun.id === "mortar" || gun.id === "launcher") return true;
  // The Cyborg's gatling sometimes bites a Walker or a truck, so he engages them.
  if (gun.id === "gatling" && isLightHull(def)) return true;
  if (entityIsScouting(target) && gun.caliber < GARRISON_STRUCTURAL_CALIBER) return true;
  const vx = target.x - e.x;
  const vy = target.y - e.y;
  if (gun.id === "ptrd") {
    const distTiles = Math.hypot(vx, vy) / state.tileSize;
    // Penetration falls off over the daylight reach; the dark shortens the sight, not the round.
    const rangeTiles = weaponRangeWorld(state, e) / nightReachMul(state.tick) / Math.max(1e-6, state.tileSize);
    return ptrdHarmPossible({
      penetration: ptrdPenetration(distTiles, rangeTiles),
      distTiles,
      target: def,
      targetFacing: target.facing,
      vx,
      vy,
    });
  }
  return armorHarmPossible({
    gun,
    target: def,
    targetFacing: target.facing,
    targetHpMax: target.hpMax,
    vx,
    vy,
  });
}

/**
 * Walker gatlings never bring a building down. They still fire while a hostile
 * garrison is the thing inside. Tanks keep an order on the walls.
 */
function walkerSparesBuilding(state: MatchState, e: Entity, target: Entity): boolean {
  if (e.type !== "walker" || target.kind !== "building") return false;
  return !(
    garrisonIsHostile(state, e.ownerId, target) && garrisonLooksOccupied(state, e.ownerId, target)
  );
}

/**
 * Auto-fire and infantry stop once a civilian house is empty. Tanks may still demolish on a player order.
 * A player-built garrison (the Bunker) is an enemy structure whether or not anyone is inside.
 */
function dropsEmptyGarrison(state: MatchState, e: Entity, target: Entity): boolean {
  if (!isGarrisonable(target.type) || !isCivilianType(target.type) || target.kind !== "building") return false;
  if (garrisonIsHostile(state, e.ownerId, target)) return false;
  if (e.order?.kind === "forceattack") return false;
  if (e.order?.kind === "attack" && !e.order.auto && !isInfantryType(e.type)) return false;
  return true;
}

/**
 * The owed second barrel has had its window. Drop it and start the long reload.
 * During the window this does nothing, so the barrel can still leave once the gun lays.
 */
function settleTwin(state: MatchState, e: Entity): void {
  if (e.twinUntil == null || state.tick <= e.twinUntil) return;
  e.twinUntil = undefined;
  const full = catalog(e.type).cooldown;
  if (e.cooldown < full) e.cooldown = full;
}

function fireAtCurrent(state: MatchState, e: Entity, dt: number): void {
  settleTwin(state, e);
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
  const range = weaponRangeWorld(state, e) * airReachMul(e, target);
  const dist = Math.hypot(aimX - e.x, aimY - e.y);
  if (dist > range) {
    if (!holedUp) e.state = "attack";
    return;
  }
  // A laid launcher's only weapon is its rockets (tickRocketPods). Here the frame just swings on.
  if (launcherOnlyOf(e.type)) {
    if (!holedUp) e.state = "attack";
    return;
  }
  if (e.type === "mortarman" && dist < MORTAR_MIN_RANGE_TILES * state.tileSize) {
    if (!holedUp) e.state = "attack";
    return;
  }
  if (e.type === "artillery") {
    fireArtillery(state, e, aimX, aimY, range, dist, target, dt);
    return;
  }
  if (!canAimWeapon(state, e, aimX, aimY, target)) {
    if (!holedUp) e.state = "attack";
    return;
  }
  const crawlingGun = stanceOf(e) === "crawl" && infantryGunFor(e)?.id !== "mortar";
  if (crawlingGun && sandbagsBlockGun(state, e.x, e.y, aimX, aimY)) {
    if (!holedUp) e.state = "attack";
    return;
  }
  if (e.waypoints.length > 0 && !travelFights(e) && !reversing(e) && !holedUp) return;

  if (!holedUp) e.state = "attack";
  if (!turreted && !holedUp) {
    remainingDeg = turnToward(e, aimX, aimY, def.turnDegPerSec * hullTurnMul(e), dt);
  }
  // No turret: remainingDeg is the hull, and the shot leaves along that facing.
  // A traversing turret fires along the turret once it is on the target.
  const gunArc = gunArcDegOf(e.type);
  const gunArcOk = Math.abs(remainingDeg) <= gunArc;

  const useMg = !ground && !e.order?.once && target ? wantsMg(e, target) : false;
  if (useMg && target && gunArcOk && e.mgCooldown <= 0 && e.mgOverheat <= 0 && e.mgAmmo > 0) {
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
      {
        target,
        accurateRange: accurateWeaponRange(state, e, range),
      },
    );
    e.mgCooldown = TANK_MG.cooldown;
    e.mgAmmo = Math.max(0, e.mgAmmo - 1);
    e.mgHeat = Math.min(TANK_MG.heatMax, e.mgHeat + TANK_MG.heatPerShot);
    if (e.mgHeat >= TANK_MG.heatMax) e.mgOverheat = TANK_MG.overheatSeconds;
  }
  // Infantry take the coaxial and the main gun together. An exposed hatch on an
  // armored hull still takes the MG alone, and only while that gun can bear.
  if (useMg && target && gunArcOk && !isInfantryType(target.type)) return;
  // Only the coaxial meets a drone. The main gun holds; rockets and small arms go on.
  const atDrone = !!target?.drone;
  if (atDrone && hasMg(e.type) && !rocketsOf(e.type) && e.type !== "walker") return;

  if (!holedUp && !gunArcOk) return;

  // The Titan's main gun stays silent in water, and never lays on a drone. Its pods fire on their own in tickRocketPods.
  if (rocketsOf(e.type) && (unitInWater(state, e) || atDrone)) return;

  if (e.type === "walker") {
    if (target && walkerSparesBuilding(state, e, target)) return;
    fireWalker(state, e, aimX, aimY, range, dist, target);
    return;
  }
  if (radarLaidOf(e.type)) {
    fireWalker(state, e, aimX, aimY, range, dist, target);
    return;
  }

  if (e.type === "gunner" && !gunnerReady(state, e)) {
    if (e.order?.kind !== "move" && !unitInWater(state, e) && e.garrisonedIn == null) e.stanceOrder = "crawl";
    return;
  }
  if (e.type === "mortarman" && !mortarReady(state, e)) {
    if (
      e.order?.kind !== "move" &&
      !unitInWater(state, e) &&
      e.garrisonedIn == null &&
      !hasCrit(e, "leg")
    ) {
      e.stanceOrder = "crouch";
    }
    return;
  }
  // A broken arm drops the scoped rifle, the PTRD, and the launcher. There is no sidearm.
  if ((e.type === "sniper" || e.type === "atinfantry" || e.type === "rocketer" || e.type === "pyro") && !infantryGunFor(e)) return;

  if (e.reload > 0) return;
  if (e.cooldown > 0) return;
  const infantryGun = infantryGunFor(e);
  // The heavy missile is not the tube. An empty tube, or a tube still reloading, does not block it.
  // He spends the one round only on a shot the player ordered.
  if (infantryGun?.id === "penetrator") {
    if (e.order?.auto || (e.heavy ?? 0) <= 0) return;
    launchRocket(state, e, PENETRATOR_RACK, aimX, aimY, range, dist, target, 0);
    e.heavy = 0;
    e.cooldown = infantryGun.cooldown;
    if (e.order?.once) clearOrder(e);
    return;
  }
  const belt = beltOf(e.type);
  if ((infantryGun || belt) && e.clip <= 0) {
    const reloadSec = infantryGun?.reload ?? belt?.reload ?? 0;
    if (reloadSec > 0) beginReload(e, infantryGun ?? { reload: reloadSec });
    return;
  }
  const shell = hasAmmo(e.type) ? pickLoadedShell(e.ammo, e.shell) : null;
  if (hasAmmo(e.type) && !shell) return;
  if (isSmokeShell(shell) && !mayFireSmoke(e)) return;
  if (shell) e.shell = shell;
  const gun = fireStats(e);
  // A twin mount fires one barrel, then the other after a short gap. Smoke is one round.
  const twin = !!shell && !isSmokeShell(shell) && mainGunBarrels(e.type) > 1;
  const second = twin && e.twinUntil != null;
  const burst = Math.max(1, infantryGun?.shotsPerTick ?? def.shotsPerTick ?? 1);
  let fired = 0;
  if (infantryGun?.id === "flamer") {
    // throwFlame paces the burst itself: a glob a tick, then a pause.
    throwFlame(state, e, aimX, aimY, range, e.order?.kind === "forceattack");
    if (e.order?.once && e.clip % FLAMER_BURST === 0) clearOrder(e);
    return;
  }
  // The Cyborg's arm heats like every gatling. (The Apocalypse's heat is its roof mount, not this gun.)
  const armGatling = infantryGun?.id === "gatling";
  for (let i = 0; i < burst; i++) {
    if ((infantryGun || belt) && e.clip <= 0) break;
    if (armGatling && gatlingHot(e)) break;
    if (infantryGun?.id === "mortar") {
      launchMortar(state, e, aimX, aimY, range, dist, target);
      fired++;
      e.clip = Math.max(0, e.clip - 1);
      if (e.clip <= 0) beginReload(e, infantryGun);
      break;
    }
    if (infantryGun?.id === "launcher") {
      launchRocket(state, e, LAUNCHER_ROCKET_RACK, aimX, aimY, range, dist, target, 0);
      fired++;
      e.clip = Math.max(0, e.clip - 1);
      if (e.clip <= 0) beginReload(e, infantryGun);
      break;
    }
    // The second barrel only fires while the rack still holds that shell.
    if (shell && (e.ammo[shell] ?? 0) <= 0) break;
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
      {
        target,
        shell,
        fuse: !!ground || isSmokeShell(shell),
        accurateRange: accurateWeaponRange(state, e, range),
        side: twin ? (second ? 1 : -1) * e.radius * TWIN_GUN_SIDE : undefined,
      },
    );
    fired++;
    if (armGatling) heatGatling(e, 1);
    if (shell) e.ammo[shell] = Math.max(0, (e.ammo[shell] ?? 0) - 1);
    if (infantryGun || belt) {
      e.clip = Math.max(0, e.clip - 1);
      if (e.clip <= 0) {
        const reloadSec = infantryGun?.reload ?? belt?.reload ?? 0;
        if (reloadSec > 0) beginReload(e, infantryGun ?? { reload: reloadSec });
        break;
      }
    }
  }
  if (fired > 0) {
    const follow = twin && !second && !!shell && (e.ammo[shell] ?? 0) > 0;
    if (follow) {
      e.twinUntil = state.tick + Math.round(APOCALYPSE_TWIN_WINDOW / TICK_DT);
      e.cooldown = APOCALYPSE_TWIN_GAP;
    } else {
      e.twinUntil = undefined;
      e.cooldown = gun.cooldown;
    }
  }
  if (fired > 0 && e.order?.once) clearOrder(e);
}

function mortarReady(state: MatchState, e: Entity): boolean {
  if (e.type !== "mortarman") return true;
  if (e.garrisonedIn != null) {
    // A trench is open to the sky: the tube stands in the bottom of it. A roof is not.
    const house = state.entities.get(e.garrisonedIn);
    return !!house && garrisonOpenTopOf(house.type) && !hasCrit(e, "arm");
  }
  if (unitInWater(state, e)) return false;
  if (stanceOf(e) !== "crouch") return false;
  if (hasCrit(e, "arm") || hasCrit(e, "leg")) return false;
  if (e.state === "move") return false;
  return e.bipod >= MORTAR_PLANT_SECONDS;
}

/**
 * The field gun lays the whole carriage on the target, then needs the trail
 * set again before it fires. Inside its minimum it will not fire; an
 * auto-picked target that close is dropped so it can find another.
 */
function fireArtillery(
  state: MatchState,
  e: Entity,
  aimX: number,
  aimY: number,
  range: number,
  dist: number,
  target: Entity | undefined,
  dt: number,
): void {
  e.state = "attack";
  if (dist < ARTILLERY_MIN_RANGE_TILES * state.tileSize) {
    if (e.order?.auto) {
      e.order = null;
      e.state = "idle";
    }
    if (e.order?.kind !== "attack" && e.order?.kind !== "forceattack") e.attackTarget = null;
    return;
  }
  if (!artilleryCanLay(e)) return;
  const rest = turnToward(e, aimX, aimY, catalog(e.type).turnDegPerSec * hullTurnMul(e), dt);
  if (Math.abs(rest) > gunArcDegOf(e.type)) {
    e.bipod = 0;
    return;
  }
  if (!artilleryReady(e) || e.cooldown > 0) return;
  if ((e.ammo.he ?? 0) <= 0) return;
  launchMortar(state, e, aimX, aimY, range, dist, target, ARTILLERY_SHELL);
  e.ammo.he = Math.max(0, (e.ammo.he ?? 0) - 1);
  e.cooldown = catalog(e.type).cooldown * artilleryReloadMul(e);
  if (e.order?.once) clearOrder(e);
}

function launchMortar(
  state: MatchState,
  e: Entity,
  aimX: number,
  aimY: number,
  range: number,
  dist: number,
  target: Entity | undefined,
  lob: LobShellDef = MORTAR_LOB,
): void {
  const moving = !!target && (target.waypoints.length > 0 || target.state === "move");
  const posture = target ? stanceTargetSpreadMul(target, unitInWater(state, target)) : 1;
  let mul = 1 + (posture - 1) * 0.25;
  if (moving) mul *= 1.12;
  const radius = mortarScatterRadius(dist, range, mul, lob);
  const land = mortarLanding(aimX, aimY, radius, () => nextRand(state));
  const maxX = Math.max(1, state.width * state.tileSize - 1);
  const maxY = Math.max(1, state.height * state.tileSize - 1);
  land.x = Math.min(maxX, Math.max(0, land.x));
  land.y = Math.min(maxY, Math.max(0, land.y));
  const flight = mortarFlightSeconds(dist, range, lob);
  const p: Projectile = {
    id: state.nextId++,
    ownerId: e.ownerId,
    team: playerTeam(state, e.ownerId),
    x: e.x,
    y: e.y,
    vx: (land.x - e.x) / flight,
    vy: (land.y - e.y) / flight,
    damage: lob.damage,
    penetration: lob.penetration,
    caliber: lob.caliber,
    big: lob === MORTAR_LOB ? undefined : true,
    life: flight,
    ignoreId: e.id,
    fromId: e.id,
    bounced: false,
    shell: null,
    flight: "mortar",
    landX: land.x,
    landY: land.y,
    apex: mortarApex(dist, range, lob),
    flightTime: flight,
    harmAllies: e.order?.kind === "forceattack",
    z: 0,
  };
  state.projectiles.push(p);
}

/**
 * Rocket racks. A salvo ripples one rocket after another, rack.interval apart,
 * then the rack reloads. Switched off or empty, it fires nothing.
 *
 * Titan pods pick and hold their own target, apart from the main gun's, fire
 * from water, reach planes in the air, and follow a player's force-attack.
 *
 * A laid launcher (the Nebelwerfer) has no other gun: it fires on the unit's
 * own target, only while halted, and only once the frame bears on it.
 */
function tickRocketPods(state: MatchState, e: Entity): void {
  if (stowedInTransport(state, e)) {
    e.rocketSalvo = 0;
    e.rocketTarget = null;
    return;
  }
  if (e.rocketsOff || (e.rockets ?? 0) <= 0 || garrisonIsHiding(state, e)) {
    e.rocketSalvo = 0;
    e.rocketTarget = null;
    return;
  }
  if ((e.rocketCooldown ?? 0) > 0) return;
  const rack = rocketRackOf(e.type);
  const aim = rack.laid ? launcherAim(state, e) : podAim(state, e);
  if (!aim) {
    e.rocketTarget = null;
    return;
  }
  e.rocketTarget = aim.target?.id ?? null;
  if (rack.laid && (e.waypoints.length > 0 || !launcherBears(e, aim.x, aim.y))) return;
  const range = weaponRangeWorld(state, e);
  const dist = Math.hypot(aim.x - e.x, aim.y - e.y);
  fireRockets(state, e, rack, aim.x, aim.y, range, dist, aim.target);
}

/** Inside a laid launcher's band: short of its reach and past its minimum. */
function inLauncherBand(state: MatchState, e: Entity, x: number, y: number): boolean {
  const d = Math.hypot(x - e.x, y - e.y);
  const min = (rocketRackOf(e.type).minRangeTiles ?? 0) * state.tileSize;
  return d <= weaponRangeWorld(state, e) && d >= min;
}

/**
 * Where a laid launcher fires: a player's force-attack on the ground, else the
 * unit's own target, picked by resolveTarget like any gun's. The rockets lob,
 * so no sight line is needed from the truck. Outside its band it holds.
 */
function launcherAim(state: MatchState, e: Entity): { x: number; y: number; target?: Entity } | null {
  const o = e.order;
  if (o?.kind === "forceattack" && o.targetId == null && o.x != null && o.y != null) {
    return inLauncherBand(state, e, o.x, o.y) ? { x: o.x, y: o.y } : null;
  }
  const t = currentTarget(state, e);
  if (!t || !inLauncherBand(state, e, t.x, t.y)) return null;
  return { x: t.x, y: t.y, target: t };
}

/** The launcher frame is on the bearing to (x, y), inside the type's gun arc. */
function launcherBears(e: Entity, x: number, y: number): boolean {
  let d = Math.atan2(y - e.y, x - e.x) - (e.turretFacing ?? e.facing);
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d) <= (gunArcDegOf(e.type) * Math.PI) / 180;
}

/** The main gun's target, if it has one. */
function mainTargetId(e: Entity): number | null {
  if (e.attackTarget != null) return e.attackTarget;
  if ((e.order?.kind === "attack" || e.order?.kind === "forceattack") && e.order.targetId != null) {
    return e.order.targetId;
  }
  return null;
}

/**
 * How much the pods want this target. 0 means leave it. Tanks, walkers, and
 * planes in the air come first, then soldiers and hostile garrisons.
 */
function podValue(state: MatchState, e: Entity, o: Entity): number {
  if (o.hp <= 0 || o.wreck || o.garrisonedIn != null || o.id === e.id || isCrashing(o)) return 0;
  if (allies(state, e.ownerId, o.ownerId)) return 0;
  if (o.kind === "building") {
    return isGarrisonable(o.type) && garrisonIsHostile(state, e.ownerId, o) && garrisonLooksOccupied(state, e.ownerId, o)
      ? 2
      : 0;
  }
  if (o.drone && !reachesDrone(e, o)) return 0;
  if (isAirborne(o)) return rocketRackOf(e.type).antiAir ? 3 : 0;
  if (isInfantryType(o.type)) return 2;
  return isArmored(catalog(o.type)) ? 3 : 2;
}

/** A target the pods can lay on from here: in reach, seen by the side, and not masked by the ground. */
function podCanReach(state: MatchState, e: Entity, o: Entity, range: number): boolean {
  if (Math.hypot(o.x - e.x, o.y - e.y) > range) return false;
  if (!canSeeEntity(state, e.ownerId, o)) return false;
  return isAirborne(o) || canAimWeapon(state, e, o.x, o.y, o);
}

/**
 * Where the pods fire next. A player's force-attack wins. A salvo under way
 * stays on its target while it lives. Otherwise the pods take the best target
 * in reach, and among targets as good as the main gun's they take a different
 * one, so a Titan facing two tanks works both. With nothing else in reach they
 * back up the main gun, even on a structure it was ordered to shell.
 */
function podAim(state: MatchState, e: Entity): { x: number; y: number; target?: Entity } | null {
  const range = weaponRangeWorld(state, e);
  const o = e.order;
  if (o?.kind === "forceattack") {
    const t = o.targetId != null ? state.entities.get(o.targetId) : undefined;
    if (t && t.hp > 0 && t.id !== e.id) return Math.hypot(t.x - e.x, t.y - e.y) <= range ? { x: t.x, y: t.y, target: t } : null;
    if (o.x != null && o.y != null) return Math.hypot(o.x - e.x, o.y - e.y) <= range ? { x: o.x, y: o.y } : null;
  }
  if ((e.rocketSalvo ?? 0) > 0 && e.rocketTarget != null) {
    const held = state.entities.get(e.rocketTarget);
    const ordered = held != null && held.id === mainTargetId(e) && held.id === currentTarget(state, e)?.id;
    if (held && podValue(state, e, held) > 0 && (podCanReach(state, e, held, range) || (ordered && !isAirborne(held) && Math.hypot(held.x - e.x, held.y - e.y) <= range))) {
      return { x: held.x, y: held.y, target: held };
    }
  }
  const main = mainTargetId(e);
  let best: Entity | undefined;
  let bestScore = -Infinity;
  for (const c of state.entities.values()) {
    const value = podValue(state, e, c);
    if (value <= 0 || !podCanReach(state, e, c, range)) continue;
    // Tier first, then nearest. The main gun's target drops half a tier, so an
    // equal target elsewhere wins but a tank still beats a soldier.
    const score = value * 1000 - (c.id === main ? 500 : 0) - Math.hypot(c.x - e.x, c.y - e.y) / state.tileSize;
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  if (best) return { x: best.x, y: best.y, target: best };
  // The main gun's own target, on the main gun's rules: a player's attack order
  // holds even past the Titan's sight, so the pods back it up there too.
  const fallback = main != null ? currentTarget(state, e) : undefined;
  if (
    fallback &&
    !fallback.wreck &&
    !isAirborne(fallback) &&
    Math.hypot(fallback.x - e.x, fallback.y - e.y) <= range &&
    canAimWeapon(state, e, fallback.x, fallback.y, fallback)
  ) {
    return { x: fallback.x, y: fallback.y, target: fallback };
  }
  return null;
}

/**
 * One launch of the salvo at the rack's aim point, then the rack's clock. A rack
 * with volleyMax sends a random 1..volleyMax rockets together, never more than
 * the salvo or the rack has left.
 */
function fireRockets(
  state: MatchState,
  e: Entity,
  rack: RocketRackDef,
  aimX: number,
  aimY: number,
  range: number,
  dist: number,
  target: Entity | undefined,
): void {
  if (!e.rocketSalvo) e.rocketSalvo = Math.min(rack.salvo, e.rockets ?? 0);
  const most = rack.volleyMax ?? 1;
  const roll = most > 1 ? 1 + Math.floor(nextRand(state) * most) : 1;
  const volley = Math.max(1, Math.min(roll, e.rocketSalvo, e.rockets ?? 0));
  for (let i = 0; i < volley; i++) {
    const slot = e.rocketSalvo;
    // Pods sit either side of the torso; the ripple alternates left and right.
    // A launcher frame walks across its six columns of tubes instead.
    // A pad mount (the RAM) has no hull radius; its cells span part of the footprint.
    const span = e.radius > 0 ? e.radius : Math.min(e.tileW, e.tileH) * state.tileSize * 0.5;
    const side = rack.laid
      ? ((((slot - 1) % 6) - 2.5) / 2.5) * span * 0.35
      : (slot % 2 === 0 ? 1 : -1) * span * 0.8;
    launchRocket(state, e, rack, aimX, aimY, range, dist, target, side);
    e.rockets = Math.max(0, (e.rockets ?? 0) - 1);
    e.rocketSalvo = e.rockets > 0 ? e.rocketSalvo - 1 : 0;
    if (e.rocketSalvo <= 0) break;
  }
  const jitter = (rack.intervalJitter ?? 0) > 0 ? nextRand(state) * (rack.intervalJitter ?? 0) : 0;
  e.rocketCooldown = e.rocketSalvo > 0 ? rack.interval + jitter : rack.reload;
}

/**
 * One rocket, from a Titan pod, a Nebelwerfer tube, or a Rocketer's launcher.
 * On a plane it leads the plane's flight and is fused at its height, so it
 * bursts in the air beside it. On anything else it is fused on the ground.
 * A rack with an apex lobs it over whatever stands between. `side` is the
 * launch offset off the aim line, world pixels.
 */
function launchRocket(
  state: MatchState,
  e: Entity,
  rack: RocketRackDef,
  aimX: number,
  aimY: number,
  range: number,
  dist: number,
  target: Entity | undefined,
  side: number,
): void {
  const aloft = !!target && isAirborne(target);
  const moving = !!target && (aloft || target.waypoints.length > 0 || target.state === "move");
  // The pods lay on their own bearing, not the torso's. A tube lies along the soldier's.
  // From inside, the tube pokes out of the opening facing the target.
  const slit = garrisonMuzzleToward(state, e, aimX, aimY);
  const fromX = slit?.x ?? e.x;
  const fromY = slit?.y ?? e.y;
  const aim = Math.atan2(aimY - fromY, aimX - fromX);
  const sideX = -Math.sin(aim);
  const sideY = Math.cos(aim);
  const x = fromX + sideX * side;
  const y = fromY + sideY * side;
  const z0 = muzzleHeight(state, e) + rack.podLift;
  let goalX = aimX;
  let goalY = aimY;
  if (aloft && target) {
    const lead = Math.hypot(target.x - x, target.y - y) / rack.speed;
    const speed = catalog(target.type).moveTilesPerSec * state.tileSize;
    goalX += Math.cos(target.facing) * speed * lead;
    goalY += Math.sin(target.facing) * speed * lead;
  }
  // A RAM at Max range scatters as at its normal reach, then wider the farther past it.
  const reach = longReachMul(e);
  const normal = range / reach;
  const far = reach > 1 ? Math.max(0, Math.min(1, (dist - normal) / Math.max(1e-6, range - normal))) : 0;
  const radius =
    reach > 1
      ? rocketScatterRadius(Math.min(dist, normal), normal, moving ? 1.15 : 1, rack) * (1 + far * (RADAR_LONG_RANGE_SPREAD - 1))
      : rocketScatterRadius(dist, range, moving ? 1.15 : 1, rack);
  const land = mortarLanding(goalX, goalY, radius, () => nextRand(state));
  const maxX = Math.max(1, state.width * state.tileSize - 1);
  const maxY = Math.max(1, state.height * state.tileSize - 1);
  land.x = Math.min(maxX, Math.max(0, land.x));
  land.y = Math.min(maxY, Math.max(0, land.y));
  const dx = land.x - x;
  const dy = land.y - y;
  const len = Math.max(1, Math.hypot(dx, dy));
  const flight = len / rack.speed;
  const zLand =
    aloft && target ? entityHeight(state, target) + airAlt(target) : worldTileHeight(state, land.x, land.y);
  state.projectiles.push({
    id: state.nextId++,
    ownerId: e.ownerId,
    team: playerTeam(state, e.ownerId),
    x,
    y,
    vx: dx / flight,
    vy: dy / flight,
    damage: rack.damage,
    penetration: rack.penetration,
    caliber: rack.caliber,
    life: flight,
    ignoreId: slit?.house.id ?? e.id,
    fromId: e.id,
    bounced: false,
    shell: null,
    flight: "rocket",
    landX: land.x,
    landY: land.y,
    flightTime: flight,
    harmAllies: e.order?.kind === "forceattack",
    airBurst: aloft || undefined,
    z: z0,
    vz: (zLand - z0) / flight,
    launcher: e.type,
    heavy: rack.plate != null && rack.plate > 1 ? true : undefined,
    plate: rack.plate != null && rack.plate > 1 ? rack.plate : undefined,
    ...lob(rack, dist, range, z0),
  });
}

/** True when this connecting burst destroys the rocket. A heavy round loses one plate and flies on. */
function burstBreaksRocket(p: Projectile): boolean {
  const plate = p.plate ?? 1;
  if (plate > 1) {
    p.plate = plate - 1;
    return false;
  }
  return true;
}

/** Arc fields for a rack whose rockets arc: the peak over the straight line grows with the shot. */
function lob(rack: RocketRackDef, dist: number, range: number, z0: number): Pick<Projectile, "apex" | "launchZ"> {
  if (rack.apexFar == null) return {};
  const near = rack.apexNear ?? rack.apexFar;
  const u = Math.min(1, Math.max(0, dist / Math.max(1, range)));
  return { apex: near + (rack.apexFar - near) * u, launchZ: z0 };
}

/** Advance a rocket along its straight line, or its shallow arc. True while it is still flying. */
function stepRocket(state: MatchState, p: Projectile, dt: number, rand: () => number): boolean {
  const x0 = p.x;
  const y0 = p.y;
  const z0 = p.z ?? 0;
  const stepDt = p.life > 0 ? Math.min(dt, p.life) : 0;
  p.x += p.vx * stepDt;
  p.y += p.vy * stepDt;
  p.life -= dt;
  if (p.apex != null) {
    const total = p.flightTime ?? Math.max(0.05, p.life + stepDt);
    const u = Math.min(1, Math.max(0, (total - Math.max(0, p.life)) / total));
    p.z = (p.launchZ ?? 0) + (p.vz ?? 0) * total * u + mortarAirZ(u, p.apex);
  } else {
    p.z = z0 + (p.vz ?? 0) * stepDt;
  }
  // It flies low and fast, so a hull, a wall, or a tree in the way takes the burst.
  const wallHit = wallSweep(state, x0, y0, p.x, p.y);
  const struck = nearestSweepHit(state, x0, y0, p, z0, p.z);
  const tree = nearestTreeSweep(state, x0, y0, p, z0, p.z, rand);
  if (wallHit && (!struck || wallHit.t <= struck.t) && (!tree || wallHit.t <= tree.t)) {
    p.x = wallHit.x;
    p.y = wallHit.y;
    p.airBurst = undefined;
    detonateMortar(state, p, rand, wallHit.e);
    return false;
  }
  const first = struck && (!tree || struck.t <= tree.t) ? struck : tree;
  if (first) {
    p.x = first.x;
    p.y = first.y;
    const hit = struck && first === struck ? struck.e : undefined;
    // Met something on the ground before the plane: a ground burst after all.
    p.airBurst = hit && isAirborne(hit) ? true : undefined;
    detonateMortar(state, p, rand, hit);
    return false;
  }
  if (p.life > 0) return true;
  if (p.landX != null && p.landY != null) {
    p.x = p.landX;
    p.y = p.landY;
  }
  if (!p.airBurst) p.z = 0;
  detonateMortar(state, p, rand);
  return false;
}

/** A rocket bursting near a low drone's height catches it in the splash. */
function rocketCatchesDrone(state: MatchState, p: Projectile, e: Entity): boolean {
  if (p.flight !== "rocket" || !e.drone || !projectileMeetsDrone(p, e)) return false;
  return Math.abs((p.z ?? 0) - (entityHeight(state, e) + airAlt(e))) <= AIR_HIT_BAND * 2;
}

/**
 * Mortar bomb or Titan rocket burst. Both throw splash over a disk; the rocket's
 * disk is smaller and it dents armor harder. `direct` is the hull a rocket met
 * in flight: it takes the center of the burst whatever its size.
 */
function detonateMortar(state: MatchState, p: Projectile, rand: () => number, direct?: Entity): void {
  const rocket = p.flight === "rocket";
  const inAir = rocket && !!p.airBurst;
  const tx = worldToTile(p.x, state.tileSize);
  const ty = worldToTile(p.y, state.tileSize);
  if (!inAir && isTree(state, tx, ty)) fellTreeAt(state, tx, ty);
  const rack = p.heavy ? PENETRATOR_RACK : rocketRackOf(p.launcher ?? "titan");
  const lob = p.big ? ARTILLERY_SHELL : MORTAR_LOB;
  const radius = (rocket ? rack.splashTiles : p.big ? lob.splashTiles : MORTAR_SPLASH_TILES) * state.tileSize;
  for (const e of [...state.entities.values()]) {
    if (e.hp <= 0 || e.wreck || e.id === p.fromId || e.garrisonedIn != null) continue;
    // A ground burst never reaches a plane; an air burst only catches planes.
    // A drone is caught by a burst near its height, air or ground, or when the rocket meets it.
    if (e.drone ? e !== direct && !rocketCatchesDrone(state, p, e) : isAirborne(e) !== inAir) continue;
    const d = e === direct ? 0 : Math.hypot(e.x - p.x, e.y - p.y);
    const reach =
      e.kind === "building"
        ? radius + Math.min(e.tileW, e.tileH) * state.tileSize * 0.25
        : radius;
    if (d > reach) continue;
    const friendly = e.ownerId !== "" && allies(state, p.ownerId, e.ownerId);
    if (friendly && !p.harmAllies) continue;
    const falloff = mortarFalloff(d, reach);
    const def = catalog(e.type);
    if (inAir) {
      e.hp = Math.max(0, e.hp - Math.max(1, Math.round(p.damage * rack.airMul * falloff)));
      continue;
    }
    if (e.kind === "unit" && isArmored(def)) {
      const nick = rocket
        ? rocketArmorDamage(
            rack.armorDamage,
            falloff,
            hasTracks(e.type),
            hitFace(e.facing, p.vx || 0.01, p.vy),
            d <= e.radius,
            rand,
          )
        : mortarArmorNick(def.hp, falloff, hasTracks(e.type), rand, lob);
      let nickDmg = nick.damage;
      if ((e.wallCover ?? 0) > 0) {
        if (rocket) nickDmg = Math.max(1, Math.round(nickDmg * WALL_COVER_DR));
        else if (nickDmg >= Math.max(0, e.hp - e.wallCover)) nickDmg = e.hp;
      }
      e.hp = Math.max(0, e.hp - nickDmg);
      if (e.hp > 0 && nick.throwTrack) addCrit(e, "tracks");
      damageMaulerCart(e, {
        caliber: p.caliber,
        damage: Math.max(1, Math.round(p.damage * falloff)),
        shell: p.shell,
        flight: "mortar",
        face: "none",
        kind: "hit",
      });
      const smoked = maybeHaulerSmokeScreen(state, e, p);
      if (e.hp > 0 && !smoked) maybeWithdraw(state, e, p);
      hideScout(state, e);
      continue;
    }
    const scaled = Math.max(1, Math.round(p.damage * falloff));
    const res = resolveHit({
      gun: { damage: scaled, penetration: p.penetration, caliber: p.caliber },
      target: catalog(e.type),
      targetFacing: e.facing,
      targetHp: e.hp,
      targetHpMax: e.hpMax,
      vx: p.vx || 0.01,
      vy: p.vy,
      rand,
    });
    const occupied = wallsShieldGarrison(state, e);
    const chipWalls = !occupied || p.caliber >= GARRISON_STRUCTURAL_CALIBER;
    if (chipWalls) {
      const wallMul = e.kind !== "building" ? 1 : p.big ? ARTILLERY_BUILDING_MUL : rocket ? ROCKET_BUILDING_MUL : 1;
      const wallDmg = Math.round(res.damage * wallMul);
      coverStrike(e, wallDmg, state.tick, !rocket);
      if (e.hp > 0) rollCrits(e, res.face, res.kind, res.damage, rand);
      const smoked = maybeHaulerSmokeScreen(state, e, p);
      if (e.hp > 0 && !smoked && res.kind !== "ricochet" && res.damage > 0) maybeWithdraw(state, e, p);
      hideScout(state, e);
    }
    if (occupied) woundGarrison(state, e, res.damage, p.caliber, !!p.plunging);
    if (e.type === "supply" && !e.wreck && e.hp > 0) {
      noteSupplyHit(state, e, res.face, false, chipWalls ? res.damage : 0);
    }
    if (e.type === "artillery") blastOnGun(state, e, res.damage);
  }
  pushImpact(state, p, "miss", p.x, p.y);
}

function fireWalker(
  state: MatchState,
  e: Entity,
  aimX: number,
  aimY: number,
  range: number,
  dist: number,
  target: Entity | undefined,
): void {
  if (e.cooldown > 0 || e.clip <= 0 || gatlingHot(e)) return;
  const guns = walkerGunsOf(e);
  // Walker: one arm's burst. The CIWS barrel cluster: its catalog rate.
  const per = e.type === "walker" ? WALKER_ONE_BURST : (catalog(e.type).shotsPerTick ?? 1);
  const second = guns === 2 && target ? walkerSecondTarget(state, e, target) : undefined;
  const gun = fireStats(e);
  const stats = {
    damage: gun.damage,
    penetration: gun.penetration,
    caliber: gun.caliber,
    spreadDeg: gun.spreadDeg,
    projectileSpeed: catalog(e.type).projectileSpeed,
  };
  // Max range, or the pad's longer reach on a plane: inside the normal reach the mount is
  // laid as usual; past it the cone opens the farther the round has to go.
  const normal = range / (longReachMul(e) * airReachMul(e, target));
  const shoot = (x: number, y: number, n: number, tgt: Entity | undefined, d: number) => {
    const far = range > normal + 1e-6 ? Math.max(0, Math.min(1, (d - normal) / (range - normal))) : 0;
    for (let i = 0; i < n && e.clip > 0 && !gatlingHot(e); i++) {
      fireRound(state, e, x, y, stats, range, d, {
        target: tgt,
        accurateRange: accurateWeaponRange(state, e, range),
        bearing: Math.atan2(y - e.y, x - e.x),
        spreadMul: 1 + far * (RADAR_LONG_RANGE_SPREAD - 1),
      });
      e.clip -= 1;
      heatGatling(e, 1);
    }
  };
  const before = e.clip;
  if (second) {
    shoot(aimX, aimY, per, target, dist);
    shoot(second.x, second.y, per, second, Math.hypot(second.x - e.x, second.y - e.y));
  } else {
    shoot(aimX, aimY, per * guns, target, dist);
  }
  if (e.clip < before) {
    e.gatlingFire = { tick: state.tick, arms: guns };
    if (second) e.gatlingFire.offAim = Math.atan2(second.y - e.y, second.x - e.x);
  }
  e.cooldown = gun.cooldown;
}

/** Nearest other enemy the off-arm can already bear on. */
function walkerSecondTarget(state: MatchState, e: Entity, primary: Entity): Entity | undefined {
  const range = weaponRangeWorld(state, e);
  const arc = gunArcDegOf(e.type);
  let best: Entity | undefined;
  let bestD = range * range;
  for (const o of state.entities.values()) {
    if (o.id === primary.id || o.id === e.id || o.hp <= 0 || o.wreck || o.garrisonedIn) continue;
    if (allies(state, e.ownerId, o.ownerId)) continue;
    if (walkerSparesBuilding(state, e, o)) continue;
    if (
      o.kind === "building" &&
      isGarrisonable(o.type) &&
      (!garrisonLooksOccupied(state, e.ownerId, o) || !garrisonIsHostile(state, e.ownerId, o))
    ) {
      continue;
    }
    const dx = o.x - e.x;
    const dy = o.y - e.y;
    const d = dx * dx + dy * dy;
    if (d > bestD) continue;
    if (!canSeeEntity(state, e.ownerId, o)) continue;
    if (!canAimWeapon(state, e, o.x, o.y, o)) continue;
    if (Math.abs(aimRemainingDeg(e, o.x, o.y)) > arc) continue;
    bestD = d;
    best = o;
  }
  return best;
}

function gunnerReady(state: MatchState, e: Entity): boolean {
  if (e.type !== "gunner") return true;
  if (e.garrisonedIn != null) {
    // A bunker slit is a ready ledge for the bipod. A house window is not.
    // The supply-truck bed is a ledge too.
    const house = state.entities.get(e.garrisonedIn);
    if (!house || hasCrit(e, "arm")) return false;
    return house.type === "supply" || garrisonFullArmsOf(house.type);
  }
  if (unitInWater(state, e)) return false;
  if (stanceOf(e) !== "crawl") return false;
  if (hasCrit(e, "arm")) return false;
  return e.bipod >= MG42_BIPOD_SECONDS;
}

function beginReload(e: Entity, gun: { reload: number }): void {
  if (e.reload > 0) return;
  e.reload = reloadSecondsOf(gun, e.reloadMul);
  e.cooldown = 0;
}

function tickWeaponClocks(e: Entity, dt: number): void {
  if (e.cooldown > 0) {
    e.cooldown = Math.max(0, e.cooldown - dt);
    // 6 × TICK_DT minus six ticks leaves a dust remainder that would hold the gun an extra tick.
    if (e.cooldown < 1e-9) e.cooldown = 0;
  }
  if ((e.rocketCooldown ?? 0) > 0) e.rocketCooldown = Math.max(0, (e.rocketCooldown ?? 0) - dt);
  if (e.reload > 0) {
    e.reload = Math.max(0, e.reload - dt);
    if (e.reload <= 0) {
      const gun = infantryGunFor(e);
      const belt = beltOf(e.type);
      // Arming the heavy missile shares this clock. Finishing it must not refill the tube.
      if (gun && gun.id !== "penetrator") e.clip = gun.clip;
      else if (!gun && belt) e.clip = belt.clip;
    }
  }
  const heat = gatlingHeatOf(e.type);
  if (heat) {
    // The roof mount keeps the coaxial's clock; its heat is the gatling's, not the MG's.
    if (e.mgCooldown > 0) e.mgCooldown = Math.max(0, e.mgCooldown - dt);
    if (e.mgOverheat > 0) {
      e.mgOverheat = Math.max(0, e.mgOverheat - dt);
      if (e.mgOverheat <= 0) e.mgHeat = 0;
      return;
    }
    e.mgHeat = Math.max(0, e.mgHeat - heat.coolPerSec * dt);
    return;
  }
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

/**
 * Where a gatling's stream sits off a plane at this tick, each axis -1..1:
 * two slow swells per gun, so every round of a burst shares it and the stream
 * walks onto the airframe and off again. Seeded by the gun, not the match RNG.
 */
export function streamWander(gunId: number, tick: number): { yaw: number; z: number } {
  const t = tick * TICK_DT * Math.PI * 2 * GATLING_STREAM_WANDER_HZ;
  const p = gunId * 1.37;
  return {
    yaw: 0.65 * Math.sin(t + p) + 0.35 * Math.sin(t * 2.3 + p * 2.1),
    z: 0.65 * Math.sin(t * 0.8 + p * 1.7 + 1.1) + 0.35 * Math.sin(t * 1.9 + p * 0.6 + 2.3),
  };
}

/** The CIWS pad reaches farther for a plane in the air than for anything on the ground. */
function airReachMul(e: Entity, target: Entity | undefined): number {
  return e.type === "ciws" && !!target && isAirborne(target) ? CIWS_AIR_REACH_MUL : 1;
}

/** The gatling is sitting out an overheat and cannot fire. */
function gatlingHot(e: Entity): boolean {
  return !!gatlingHeatOf(e.type) && e.mgOverheat > 0;
}

/** Heat from `rounds` just fired. At full heat the gun locks for its overheat time. */
function heatGatling(e: Entity, rounds: number): void {
  const heat = gatlingHeatOf(e.type);
  if (!heat || rounds <= 0) return;
  e.mgHeat = Math.min(1, e.mgHeat + heat.perRound * rounds);
  if (e.mgHeat >= 1 && e.mgOverheat <= 0) e.mgOverheat = heat.overheatSeconds;
}

function wantsMg(e: Entity, target: Entity): boolean {
  // The roof mount spends that belt on its own (tickRoofCiws); there is no coaxial.
  if (!hasMg(e.type) || e.mgAmmo <= 0 || roofCiwsOf(e.type)) return false;
  if (isInfantryType(target.type) || target.drone) return true;
  return entityIsScouting(target);
}

/** Degrees from the gun's facing (turret or torso, else hull) to the aim point. */
function aimRemainingDeg(e: Entity, aimX: number, aimY: number): number {
  return stepTurn(aimFacing(e), Math.atan2(aimY - e.y, aimX - e.x), 0, 1).remainingDeg;
}

/**
 * Shots inside the shooter's own eyes use the normal cone. Anything past
 * that sight — a Tiger or StuG firing on a spotter — opens LONG_SHOT_SPREAD.
 */
function accurateWeaponRange(state: MatchState, e: Entity, range: number): number {
  const sight = nightTiles(sightTilesForEntity(state, e), nightReachMul(state.tick)) * state.tileSize;
  return Math.min(range, sight);
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
  if (e.order?.kind === "rotate" && e.order.x != null && e.order.y != null) {
    return turnTurretToward(e, e.order.x, e.order.y, rate, dt);
  }
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
  opts?: {
    target?: Entity;
    shell?: ShellType | null;
    fuse?: boolean;
    accurateRange?: number;
    bearing?: number;
    /** Muzzle offset across the bore, world px, left of the shot negative. One barrel of a twin mount. */
    side?: number;
    /** A radar-laid 20mm off a hull (the roof mount): anti-air round, the CIWS's cone on a plane. */
    radar?: boolean;
    /** Extra cone and height scatter: a CIWS reaching past its normal range. */
    spreadMul?: number;
  },
): void {
  const target = opts?.target;
  // Walker, Cyborg, pad CIWS, and the Apocalypse roof. Not the Gunner's MG42, not the main gun.
  const gatling =!!opts?.radar || e.type === "walker" || e.type === "ciws" || e.type === "cyborg";
  // A gatling hoses its rounds; a cheap gun or a secondary mount hoses them wider.
  const spray = (gatling ? gatlingSprayOf(e.type) : 1) * (opts?.spreadMul ?? 1);
  const moving = !!target && (target.waypoints.length > 0 || target.state === "move");
  // A Jump Jet in the air fires down on the ground: a crouch hides nothing from overhead.
  const plunging = !!e.jet && isAirborne(e) && !(target && isAirborne(target));
  // A soldier inside does not turn: his round leaves the opening facing the target, aimed from there.
  const slit = garrisonMuzzleToward(state, e, aimX, aimY);
  // Fused ground shots aim at the click (plus spread), not along current turret facing.
  const bearing =
    opts?.bearing ??
    (slit
      ? Math.atan2(aimY - slit.y, aimX - slit.x)
      : opts?.fuse
      ? Math.atan2(aimY - e.y, aimX - e.x)
      : aimFacing(e));
  const aloft = !!target && isAirborne(target) && gatling;
  // On a plane the whole stream drifts on and off the airframe together; on the ground the cone is tight.
  const wander = aloft ? streamWander(e.id, state.tick) : null;
  const ang = aimAngle(
    bearing + (wander ? (wander.yaw * GATLING_STREAM_WANDER_DEG * spray * Math.PI) / 180 : 0),
    stats.spreadDeg * spray * (gatling && !aloft ? GATLING_GROUND_SPREAD_MUL : 1),
    dist,
    range,
    () => nextRand(state),
    moving,
    stats.spreadPower ?? 1,
    target
      ? (plunging ? 1 : stanceTargetSpreadMul(target, unitInWater(state, target))) *
          // Every gatling hoses a plane the way the CIWS does; small arms take aimed shots.
          (gatling && isAirborne(target) ? CIWS_AIR_SPREAD : airTargetSpreadMul(target, e))
      : 1,
    opts?.accurateRange ?? range,
  );
  const speed = stats.projectileSpeed;
  const muzzleReach = e.radius + 2;
  // A round fired down from the air goes into the ground just past what it was aimed at.
  const travel = opts?.fuse ? Math.max(8, dist - muzzleReach) : plunging ? Math.max(8, dist - muzzleReach) + e.radius * 2 : range;
  // Fused rounds skip the 0.05s miss pad — at tank-shell speed that is 500px past the click.
  const life = travel / Math.max(1, speed) + (opts?.fuse || plunging ? 0 : 0.05);
  const dx = Math.cos(ang);
  const dy = Math.sin(ang);
  const side = opts?.side ?? 0;
  let x = e.x + dx * muzzleReach - dy * side;
  let y = e.y + dy * muzzleReach + dx * side;
  let ignoreId = e.id;
  if (slit) {
    x = slit.x;
    y = slit.y;
    ignoreId = slit.house.id;
  }
  const z0 = muzzleHeight(state, e);
  let zAim = target ? aimHeight(state, target) : worldTileHeight(state, aimX, aimY);
  // In height too the stream walks above and below the plane, each round a little off the stream.
  // It never dips below half the climb, so a stray round does not rake the ground around the gun.
  if (wander) {
    const floor = z0 + Math.max(0, zAim - z0) * 0.5;
    const off = wander.z * GATLING_STREAM_WANDER_Z * spray + (nextRand(state) * 2 - 1) * CIWS_AIR_Z_SCATTER * spray;
    zAim = Math.max(floor, zAim + off);
  }
  const aimDist = Math.hypot(aimX - x, aimY - y);
  const gunId = infantryGunFor(e)?.id;
  const distTiles = dist / state.tileSize;
  const rangeTiles = range / nightReachMul(state.tick) / Math.max(1e-6, state.tileSize);
  const p: Projectile = {
    id: state.nextId++,
    ownerId: e.ownerId,
    team: playerTeam(state, e.ownerId),
    x,
    y,
    vx: dx * speed,
    vy: dy * speed,
    damage: stats.damage,
    penetration: gunId === "ptrd" ? ptrdPenetration(distTiles, rangeTiles) : stats.penetration,
    caliber: stats.caliber,
    life,
    ignoreId,
    fromId: e.id,
    bounced: false,
    shell: opts?.shell ?? null,
    hpFraction: gunId === "scoped" || gunId === "ptrd" ? scopedHpFraction(dist, range) : undefined,
    antiAir:
      opts?.radar || (!opts?.shell && (e.type === "walker" || radarLaidOf(e.type) || !!infantryGunFor(e)?.antiAir))
        ? true
        : undefined,
    gatling: gatling || undefined,
    plunging: plunging || undefined,
    aloft: aloft || undefined,
    z: z0,
    vz: ((zAim - z0) / Math.max(1e-6, aimDist)) * speed,
  };
  state.projectiles.push(p);
}

/**
 * A wreck stays soft to shells, so a gun can still clear the hulk.
 * Rifles and machine guns meet the plate and only spark. The floor is the
 * lightest tank rear: a Walker's own rear is thin enough for a belt to chip.
 */
function wreckHitDef(e: Entity, caliber: number): CatalogEntry {
  const live = catalog(e.type);
  if (caliber >= GARRISON_STRUCTURAL_CALIBER || !isArmored(live)) {
    return { ...live, armorFront: 0, armorSide: 0, armorRear: 0 };
  }
  const plate = (n: number) => Math.max(n, 16);
  return {
    ...live,
    armorFront: plate(live.armorFront),
    armorSide: plate(live.armorSide),
    armorRear: plate(live.armorRear),
  };
}

export function tickProjectiles(state: MatchState, dt: number): void {
  const keep: Projectile[] = [];
  const rand = () => nextRand(state);
  for (const p of state.projectiles) {
    if (p.flight === "bomb") {
      if (stepBomb(state, p, dt)) keep.push(p);
      continue;
    }
    if (p.flight === "cluster") {
      if (stepCluster(state, p, dt)) keep.push(p);
      continue;
    }
    if (p.flight === "rocket") {
      if (stepRocket(state, p, dt, rand)) keep.push(p);
      continue;
    }
    if (p.flight === "flame") {
      if (stepFlame(state, p, dt)) keep.push(p);
      continue;
    }
    if (p.flight === "mortar") {
      const total = p.flightTime ?? Math.max(0.05, p.life);
      const stepDt = p.life > 0 ? Math.min(dt, p.life) : 0;
      p.x += p.vx * stepDt;
      p.y += p.vy * stepDt;
      p.life -= dt;
      const u = Math.min(1, Math.max(0, (total - Math.max(0, p.life)) / total));
      p.z = mortarAirZ(u, p.apex ?? 0);
      if (p.life > 0) {
        keep.push(p);
        continue;
      }
      if (p.landX != null && p.landY != null) {
        p.x = p.landX;
        p.y = p.landY;
      }
      p.z = 0;
      detonateMortar(state, p, rand);
      continue;
    }
    const x0 = p.x;
    const y0 = p.y;
    const z0 = p.z ?? 0;
    const stepDt = p.life > 0 ? Math.min(dt, p.life) : 0;
    p.x += p.vx * stepDt;
    p.y += p.vy * stepDt;
    p.z = z0 + (p.vz ?? 0) * stepDt;
    p.life -= dt;
    const z1 = p.z;
    // A round from overhead drops over the bags and the concrete.
    const overheadShot = !!p.plunging || !!p.fromAbove;
    const bagHit = overheadShot ? null : sandbagSweep(state, x0, y0, p.x, p.y, isTankShell(p));
    const thinWall = overheadShot ? null : wallSweep(state, x0, y0, p.x, p.y);
    // Rifle fire flies over the rampart; a tank shell that meets it strikes the stone.
    const rampart = overheadShot || !isTankShell(p) ? null : greatWallSweep(state, x0, y0, p.x, p.y);
    const concrete = rampart && (!thinWall || rampart.t < thinWall.t) ? rampart : thinWall;
    const struck = nearestSweepHit(state, x0, y0, p, z0, z1);
    const blocker = concrete && (!bagHit || concrete.t < bagHit.t) ? concrete : bagHit;
    if (blocker && (!struck || blocker.t <= struck.t)) {
      if (blocker.e.type === "wall" || blocker.e.type === "greatwall") {
        if (isTankShell(p)) takeDamage(blocker.e, Math.max(1, Math.round(p.damage)), state.tick);
        pushImpact(state, p, "hit", blocker.x, blocker.y);
        continue;
      }
      woundBehindSandbags(state, blocker.e, x0, y0, p.damage);
      ruinSandbags(state, blocker.e);
      pushImpact(state, p, "hit", blocker.x, blocker.y);
      continue;
    }
    // A barrage from a plane comes down through the canopy; only what it lands on counts.
    const tree = p.fromAbove || p.plunging ? null : nearestTreeSweep(state, x0, y0, p, z0, z1, rand);
    if (tree && (!struck || tree.t <= struck.t)) {
      if (canFellTrees(p)) fellTreeAt(state, tree.tx, tree.ty);
      pushImpact(state, p, "miss", tree.x, tree.y);
      continue;
    }
    if (isSmokeShell(p.shell)) {
      const wall = struck?.e.kind === "building" ? struck : null;
      if (wall || p.life <= 0) {
        const ix = wall ? wall.x : p.x;
        const iy = wall ? wall.y : p.y;
        if (wall) hideScout(state, wall.e);
        spawnSmokeCloud(state, ix, iy, p.vx, p.vy);
        pushImpact(state, p, "puff", ix, iy);
        continue;
      }
      keep.push(p);
      continue;
    }
    if (!struck) {
      if (p.life <= 0) {
        if (p.fromAbove && !p.bounced) cannonSplash(state, p);
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
    // Small arms ring off the steel. Some find a crewman instead.
    if (e.type === "artillery" && !e.wreck && isSupplyBullet(p.caliber, p.shell, p.flight)) {
      const face = hitFace(e.facing, p.vx, p.vy);
      const dmg = Math.max(1, Math.round(p.damage * (0.9 + rand() * 0.2)));
      const crewHit = bulletOnGun(state, e, face, dmg);
      pushImpact(state, p, crewHit ? "hit" : "ricochet", struck.x, struck.y, -p.vx * 0.2, -p.vy * 0.2);
      continue;
    }
    const liveDef = catalog(e.type);
    const targetDef = e.wreck ? wreckHitDef(e, p.caliber) : liveDef;
    const frac = p.hpFraction;
    const scopedInfantry = frac != null && isInfantryType(e.type) && !e.wreck;
    const atArmor =
      !p.bounced &&
      p.caliber === PTRD_CALIBER &&
      !scopedInfantry &&
      isArmored(liveDef) &&
      liveDef.kind !== "building";
    // A plane's cannon comes down on the roof of a hull on the ground.
    const roofHit =
      !p.bounced &&
      !!p.fromAbove &&
      !e.wreck &&
      !isAirborne(e) &&
      isArmored(liveDef) &&
      liveDef.kind !== "building";
    const shooter = state.entities.get(p.fromId);
    const distTiles =
      atArmor && shooter
        ? Math.hypot(e.x - shooter.x, e.y - shooter.y) / state.tileSize
        : PTRD_CLOSE_TILES + 1;
    // Living light hulls: a gatling round rolls a nick instead of the plate test.
    // StuG sides, a Tiger's rear, and every heavier face stay on resolveHit.
    const gatlingLight = !!p.gatling && !p.bounced && !e.wreck && !roofHit && !atArmor && isLightHull(liveDef);
    const res = roofHit
      ? resolveRoofHit({ penetration: p.penetration, target: liveDef, targetHp: e.hp, targetHpMax: e.hpMax, rand })
      : atArmor
      ? resolveAtRifleHit({
          penetration: p.penetration,
          distTiles,
          target: liveDef,
          targetFacing: e.facing,
          targetHp: e.hp,
          targetHpMax: e.hpMax,
          vx: p.vx,
          vy: p.vy,
          rand,
        })
      : gatlingLight
      ? resolveGatlingLight({
          damage: p.damage,
          caliber: p.caliber,
          target: liveDef,
          targetFacing: e.facing,
          targetHp: e.hp,
          vx: p.vx,
          vy: p.vy,
          rand,
        })
      : resolveHit({
          gun: {
            damage: scopedInfantry ? Math.max(1, Math.round(catalog(e.type).hp * frac)) : p.damage,
            penetration: p.penetration,
            caliber: p.caliber,
          },
          target: targetDef,
          targetFacing: e.facing,
          targetHp: e.hp,
          targetHpMax: e.hpMax,
          vx: p.vx,
          vy: p.vy,
          rand,
          exact: scopedInfantry,
        });
    const occupied = wallsShieldGarrison(state, e);
    // A walker round stops on the wall. It does not chew the structure, even
    // when the house is empty or the target is a Core.
    const walkerWall = e.kind === "building" && shooter?.type === "walker";
    const chipWalls = (!occupied || p.caliber >= GARRISON_STRUCTURAL_CALIBER) && !walkerWall;
    let dealt = res.damage;
    if (chipWalls) {
      dealt = coverStrike(e, dealt, state.tick, !!(p.fromAbove || p.plunging));
      if (e.hp > 0 && roofHit) {
        if (res.kind === "pen" && isMotorVehicle(e.type) && rand() < FW190_ROOF_ENGINE_CHANCE) addCrit(e, "engine");
      } else if (e.hp > 0 && !gatlingLight) {
        const tracks =
          p.caliber === PTRD_CALIBER && res.kind === "pen" && res.face === "side" ? PTRD_TRACK_CHANCE : undefined;
        rollCrits(e, res.face, res.kind, dealt, rand, tracks);
      }
      if (!p.bounced) {
        damageMaulerCart(e, {
          caliber: p.caliber,
          damage: p.damage,
          shell: p.shell,
          flight: p.flight,
          face: res.face,
          kind: res.kind,
        });
      }
      const smoked = maybeHaulerSmokeScreen(state, e, p);
      if (e.hp > 0 && !smoked && res.kind !== "ricochet" && dealt > 0) {
        maybeWithdraw(state, e, p);
      }
      hideScout(state, e);
    }
    if (occupied) woundGarrison(state, e, res.damage, p.caliber, !!p.plunging);
    if (e.type === "supply" && !e.wreck && e.hp > 0) {
      noteSupplyHit(state, e, res.face, isSupplyBullet(p.caliber, p.shell, p.flight), chipWalls ? dealt : 0);
    }
    if (e.type === "artillery" && !e.wreck) blastOnGun(state, e, dealt);
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
    if (p.caliber === PTRD_CALIBER) p.penetration = 0;
    p.vx = res.bounceVx;
    p.vy = res.bounceVy;
    p.vz = 0;
    p.ignoreId = e.id;
    p.bounced = true;
    let sp = Math.hypot(p.vx, p.vy) || 1;
    if (sp > RICOCHET_SPARK_SPEED) {
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
    damage: p.caliber >= GARRISON_STRUCTURAL_CALIBER && p.damage > 0 ? p.damage : undefined,
    blast: blast || undefined,
    mortar: p.flight === "mortar" ? true : undefined,
    bomb: p.flight === "mortar" && p.big ? true : undefined,
    rocket: p.flight === "rocket" ? true : undefined,
    z: p.airBurst ? (p.z ?? 0) : undefined,
    airZ: p.aloft ? (p.z ?? 0) : undefined,
  };
  // An air burst leaves no crater and no splash under the plane. Nor does a round lost in the sky.
  if (!p.airBurst && !p.aloft) noteImpactSurface(state, impact, p, kind);
  state.impacts.push(impact);
}

function canFellTrees(p: Projectile): boolean {
  if (p.bounced) return false;
  return p.shell === "ap" || p.shell === "he" || p.shell === "heat";
}

function nearestTreeSweep(
  state: MatchState,
  x0: number,
  y0: number,
  p: Projectile,
  z0: number,
  z1: number,
  rand: () => number,
): { t: number; x: number; y: number; tx: number; ty: number } | null {
  if (p.bounced || isSmokeShell(p.shell)) return null;
  const ts = state.tileSize;
  const x1 = p.x;
  const y1 = p.y;
  const minX = Math.min(x0, x1);
  const maxX = Math.max(x0, x1);
  const minY = Math.min(y0, y1);
  const maxY = Math.max(y0, y1);
  const tx0 = worldToTile(minX, ts);
  const tx1 = worldToTile(maxX, ts);
  const ty0 = worldToTile(minY, ts);
  const ty1 = worldToTile(maxY, ts);
  const hits: { t: number; x: number; y: number; tx: number; ty: number }[] = [];
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      if (!inBounds(state, tx, ty) || !isTree(state, tx, ty)) continue;
      const t = segmentAabbT(x0, y0, x1, y1, {
        x0: tx * ts,
        y0: ty * ts,
        x1: (tx + 1) * ts,
        y1: (ty + 1) * ts,
      });
      if (t == null) continue;
      hits.push({ t, x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t, tx, ty });
    }
  }
  hits.sort((a, b) => a.t - b.t);
  for (const tree of hits) {
    const shotZ = z0 + (z1 - z0) * tree.t;
    if (shotClearsCover(shotZ, tileHeight(state, tree.tx, tree.ty), TREE_COVER_HEIGHT)) continue;
    if (rand() >= TREE_HIT_CHANCE) continue;
    return tree;
  }
  return null;
}

/** A plane's 30 mm round bursting in the dirt: soldiers and soft units close by take the splash. */
function cannonSplash(state: MatchState, p: Projectile): void {
  const radius = FW190_SPLASH_TILES * state.tileSize;
  for (const e of state.entities.values()) {
    if (e.hp <= 0 || e.wreck || e.kind !== "unit" || e.garrisonedIn != null || isAirborne(e)) continue;
    if (!p.harmAllies && e.ownerId && allies(state, p.ownerId, e.ownerId)) continue;
    if (isArmored(catalog(e.type))) continue;
    const d = Math.hypot(e.x - p.x, e.y - p.y);
    if (d > radius + e.radius) continue;
    const dmg = Math.max(1, Math.round(FW190_SPLASH_DAMAGE * mortarFalloff(Math.max(0, d - e.radius), radius)));
    const dealt = coverStrike(e, dmg, state.tick, true);
    if (e.hp > 0) rollCrits(e, "none", "hit", dealt, () => nextRand(state));
  }
}

function nearestSweepHit(
  state: MatchState,
  x0: number,
  y0: number,
  p: Projectile,
  z0: number,
  z1: number,
): { e: Entity; t: number; x: number; y: number } | null {
  let best: { e: Entity; t: number; x: number; y: number } | null = null;
  let parked: { e: Entity; t: number; x: number; y: number } | null = null;
  for (const e of state.entities.values()) {
    if (e.hp <= 0 || isCrashing(e)) continue;
    if (e.id === p.ignoreId) continue;
    // A pilot strafes the enemy's line, not his own side's, unless he was told to (force-attack).
    if (p.fromAbove && !p.harmAllies && e.ownerId && allies(state, p.ownerId, e.ownerId)) continue;
    if (e.garrisonedIn != null) continue;
    const hit = sweepAgainst(state, x0, y0, p, e);
    if (!hit) continue;
    // Plunging fire is still high over everything short of its line; it only strikes near where it lands.
    if (p.fromAbove && p.landX != null && p.landY != null) {
      if (Math.hypot(hit.x - p.landX, hit.y - (p.landY ?? 0)) > FW190_BARRAGE_LINE_TILES * state.tileSize) continue;
    }
    const shotZ = z0 + (z1 - z0) * hit.t;
    // Shells, mortar bombs, and bombs pass a drone by; a high one takes only anti-air fire.
    if (e.drone && !projectileMeetsDrone(p, e)) continue;
    // Only anti-air fire meets a Jump Jet in the air. A rifle round passes under him.
    if (e.jet && isAirborne(e) && !p.antiAir) continue;
    if (isAirborne(e)) {
      // Only a round near the plane's height meets it. Everything else passes under or over.
      if (Math.abs(shotZ - (entityHeight(state, e) + airAlt(e))) > AIR_HIT_BAND) continue;
    } else if (shotClearsCover(shotZ, entityHeight(state, e), coverHeightOf(e.type))) {
      // A steep round clears his head at the edge of his circle and comes down into him further in.
      if (!p.plunging || !plungesInto(state, x0, y0, p, z0, z1, e)) continue;
    }
    if (e.air && (!parked || hit.t < parked.t)) parked = { e, t: hit.t, x: hit.x, y: hit.y };
    if (!best || hit.t < best.t) best = { e, t: hit.t, x: hit.x, y: hit.y };
  }
  // A plane on its hardstand sits on top of the strip. The round finds the plane, not the grass.
  if (best?.e.type === "airfield" && parked && !isAirborne(parked.e)) return parked;
  return best;
}

/** A plunging round is below the top of this unit where its line passes closest to his middle. */
function plungesInto(state: MatchState, x0: number, y0: number, p: Projectile, z0: number, z1: number, e: Entity): boolean {
  const dx = p.x - x0;
  const dy = p.y - y0;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((e.x - x0) * dx + (e.y - y0) * dy) / len2)) : 0;
  return !shotClearsCover(z0 + (z1 - z0) * t, entityHeight(state, e), coverHeightOf(e.type));
}

function sweepAgainst(
  state: MatchState,
  x0: number,
  y0: number,
  p: Projectile,
  e: Entity,
): { t: number; x: number; y: number } | null {
  if (e.type === "sandbags" || e.type === "teeth" || e.type === "wall" || e.type === "greatwall") return null;
  // An empty trench is a hole in the ground. Rounds only find it with a man in it.
  if (e.type === "trench" && livingGarrison(state, e).length === 0) return null;
  const reach = e.radius * (p.plunging ? 1 : stanceHitRadiusMul(e, unitInWater(state, e)));
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
          reach + PROJECTILE_RADIUS,
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
  // Dry tanks: the Pyro has nothing to go at them with until a truck refills him.
  if (e.type === "pyro" && e.clip <= 0) return undefined;
  const range = weaponRangeWorld(state, e);
  // The CIWS takes units only, and a plane in the air before anything on the ground.
  const radar = radarLaidOf(e.type);
  let best: Entity | undefined;
  let bestD = range * range;
  let bestAir: Entity | undefined;
  let bestAirD = (range * (e.type === "ciws" ? CIWS_AIR_REACH_MUL : 1)) ** 2;
  for (const o of state.entities.values()) {
    if (o.hp <= 0 || o.id === e.id || o.wreck || o.garrisonedIn || isCrashing(o)) continue;
    if (allies(state, e.ownerId, o.ownerId)) continue;
    if (walkerSparesBuilding(state, e, o)) continue;
    if (outOfReachAloft(e, o)) continue;
    if (radar) {
      if (o.kind !== "unit") continue;
      const d = (o.x - e.x) ** 2 + (o.y - e.y) ** 2;
      const air = isAirborne(o);
      if (d > (air ? bestAirD : bestD)) continue;
      if (!canSeeEntity(state, e.ownerId, o)) continue;
      if (!infantryRoundCanHarm(state, e, o)) continue;
      if (air) {
        bestAirD = d;
        bestAir = o;
      } else {
        bestD = d;
        best = o;
      }
      continue;
    }
    if (isInfantryType(e.type) && o.kind === "building") {
      if (!garrisonIsHostile(state, e.ownerId, o) || !garrisonLooksOccupied(state, e.ownerId, o)) continue;
    } else if (
      isGarrisonable(o.type) &&
      (isCivilianType(o.type) || isFieldStructure(o.type)) &&
      (!garrisonLooksOccupied(state, e.ownerId, o) || !garrisonIsHostile(state, e.ownerId, o))
    ) {
      // An empty house, or an empty trench, is not worth a round.
      continue;
    }
    const dx = o.x - e.x;
    const dy = o.y - e.y;
    const d = dx * dx + dy * dy;
    if (d > bestD) continue;
    if (launcherOnlyOf(e.type) && !inLauncherBand(state, e, o.x, o.y)) continue;
    if (e.type === "artillery" && d < (ARTILLERY_MIN_RANGE_TILES * state.tileSize) ** 2) continue;
    if (coneOnly && !inGuardCone(e, o)) continue;
    if (!canSeeEntity(state, e.ownerId, o)) continue;
    if (!canAimWeapon(state, e, o.x, o.y, o)) continue;
    if (isInfantryType(e.type) && !infantryRoundCanHarm(state, e, o)) continue;
    bestD = d;
    best = o;
  }
  return bestAir ?? best;
}

export function inGuardCone(e: Entity, t: { x: number; y: number }): boolean {
  if (e.guardFacing == null) return false;
  const half = (GUARD_CONE_DEG * Math.PI) / 360;
  let delta = Math.atan2(t.y - e.y, t.x - e.x) - e.guardFacing;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return Math.abs(delta) <= half;
}

/** Heavy shells (not rifles / MG) pop a screen and send the Mauler home. */
function maybeHaulerSmokeScreen(state: MatchState, victim: Entity, p: Projectile): boolean {
  if (victim.type !== "hauler" || victim.kind !== "unit" || victim.wreck) return false;
  if (p.bounced || p.caliber < GARRISON_STRUCTURAL_CALIBER) return false;

  if (victim.specialCooldown <= 0 && victim.smokeCharges > 0) {
    spawnSmokeCloud(state, victim.x, victim.y, p.vx, p.vy);
    victim.smokeCharges -= 1;
    victim.specialCooldown = victim.smokeCharges <= 0 ? HAULER_SMOKE_RELOAD : HAULER_SMOKE_COOLDOWN;
  }

  if (victim.cartHp <= 0) return true;
  if (victim.hp <= 0 || victim.holdPosition || immobilized(victim)) return true;
  if (victim.state === "deploy" || victim.state === "undeploy") return true;
  if (victim.returnToBase && (victim.order?.kind === "withdraw" || victim.order?.kind === "move")) {
    return true;
  }

  const dest = withdrawDest(state, victim, victim.x - p.vx, victim.y - p.vy);
  if (!dest) return true;
  victim.returnToBase = true;
  victim.autoHarvest = false;
  victim.harvestTile = null;
  victim.order = { kind: "withdraw", x: dest.x, y: dest.y, returnToBase: true };
  victim.attackTarget = null;
  victim.state = "move";
  setPath(state, victim, dest.x, dest.y);
  return true;
}

function maybeWithdraw(state: MatchState, victim: Entity, p: Projectile): void {
  if (victim.kind !== "unit" || victim.wreck || victim.garrisonedIn || victim.air) return;
  if (catalog(victim.type).turnInPlace) return;
  if (victim.holdPosition || immobilized(victim)) return;
  if (victim.state === "deploy" || victim.state === "undeploy") return;
  if (victim.waypoints.length > 0) return;
  if (keepsStation(victim)) return;
  const shooter = p.fromId > 0 ? state.entities.get(p.fromId) : undefined;
  if (threatInSight(state, victim, shooter)) return;
  const fromX = shooter && shooter.hp > 0 ? shooter.x : p.x - p.vx;
  const fromY = shooter && shooter.hp > 0 ? shooter.y : p.y - p.vy;
  const dest = withdrawDest(state, victim, fromX, fromY);
  if (!dest) return;
  victim.order = { kind: "withdraw", x: dest.x, y: dest.y };
  victim.attackTarget = null;
  victim.harvestTile = null;
  victim.state = "move";
  setPath(state, victim, dest.x, dest.y);
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
