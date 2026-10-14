import {
  MAWCASTER_AIR_BALL,
  MAWCASTER_AIR_RANGE_TILES,
  MAWCASTER_MIN_RANGE_TILES,
  MAWCASTER_POD,
  MAWCASTER_RANGE_TILES,
  MOTHERSHIP_CELLS,
  MOTHERSHIP_HULL_RADIUS,
  MOTHERSHIP_MAW_TURN_DEG_PER_SEC,
  MOTHERSHIP_MOUNT_AT,
  MOTHERSHIP_MOUNTS,
  PULSE_SPIRE_SHELLS,
  catalog,
  factionDamage,
  isArmoredType,
  isInfantryType,
  isMothership,
  type MothershipMount,
  type RocketRackDef,
} from "../catalog.js";
import { isAirborne, isCrashing, planeIsHigh } from "./air.js";
import { launchRocket } from "./combat.js";
import { droneIsHigh } from "./drone.js";
import { airAlt, entityHeight, worldTileHeight } from "./elevation.js";
import { allies, playerTeam } from "./geo.js";
import { resumeShots } from "./hive-ammo.js";
import { nextRand } from "./rng.js";
import { hiddenFromAuto } from "./simunit.js";
import type { Entity, MatchState, MothershipGun, MothershipState } from "./types.js";
import { canSeeEntity } from "./vision.js";

/**
 * The Mothership (catalog MOTHERSHIP_*). It flies in sim/air.ts (tickHover): sent at a target it
 * hangs MOTHERSHIP_STANDOFF_TILES off it. This phase works its four mounts. Each lays itself and
 * fires on its own, on its own energy cell, with the numbers of the gun it is: the Spine Turret's
 * repeater and the Pulse Spire's emitter (their catalog entries), the Mawcaster's maw on Ground
 * attacks and on Air attacks (MAWCASTER_POD, MAWCASTER_AIR_BALL). A mount takes the target the
 * ship was sent at when it can hurt it, and otherwise the best one in its own reach that its side
 * can see. Its dome is an energy dome in the air (catalog MOTHERSHIP_DOME, sim/energy-shield.ts).
 */

/** A fresh Mothership: every cell full, every mount on the nose. */
export function newMothershipState(facing: number): MothershipState {
  const gun = (m: MothershipMount): MothershipGun => ({
    facing,
    cooldown: 0,
    energy: MOTHERSHIP_CELLS[m].shots,
    drained: false,
    targetId: null,
    salvo: 0,
  });
  return { spine: gun("spine"), pulse: gun("pulse"), maw: gun("maw"), flak: gun("flak") };
}

/** World point of mount `m` on the hull. */
export function mothershipMountPoint(e: Pick<Entity, "x" | "y" | "facing">, m: MothershipMount): { x: number; y: number } {
  const at = MOTHERSHIP_MOUNT_AT[m];
  const c = Math.cos(e.facing);
  const s = Math.sin(e.facing);
  const along = at.along * MOTHERSHIP_HULL_RADIUS;
  const across = at.across * MOTHERSHIP_HULL_RADIUS;
  return { x: e.x + c * along - s * across, y: e.y + s * along + c * across };
}

/** Reach of mount `m`, fine tiles. */
export function mountReachTiles(m: MothershipMount): number {
  if (m === "spine") return catalog("spineturret").rangeTiles;
  if (m === "pulse") return catalog("pulsespire").rangeTiles;
  return m === "maw" ? MAWCASTER_RANGE_TILES : MAWCASTER_AIR_RANGE_TILES;
}

/** Closest the mount fires, fine tiles: the maw will not lob inside the Mawcaster's band. */
function mountMinTiles(m: MothershipMount): number {
  return m === "maw" ? MAWCASTER_MIN_RANGE_TILES : 0;
}

function turnDegPerSec(m: MothershipMount): number {
  if (m === "spine") return catalog("spineturret").turretTurnDegPerSec ?? 140;
  if (m === "pulse") return catalog("pulsespire").turretTurnDegPerSec ?? 45;
  return MOTHERSHIP_MAW_TURN_DEG_PER_SEC;
}

/** Degrees off the bearing a mount still fires: the maws on their racks' arcs, the guns nearly dead on. */
function arcDeg(m: MothershipMount): number {
  if (m === "maw") return MAWCASTER_POD.arcDeg ?? catalog("mawcaster").gunArcDeg ?? 4;
  if (m === "flak") return MAWCASTER_AIR_BALL.arcDeg ?? 30;
  return 4;
}

function angleOff(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** A flier the flak maw reaches: a plane, a Jump Jet, or a drone, low enough. As on the Mawcaster. */
function flakReaches(o: Entity): boolean {
  if (o.drone) return !droneIsHigh(o);
  return isAirborne(o) && !planeIsHigh(o);
}

/**
 * How much mount `m` wants `o`, ignoring reach and sight. 0: it leaves it alone. The spine works
 * soldiers and soft hulls (plate turns its rounds); the pulse goes after armor first; the maw
 * blankets anything on the ground; the flak maw only fliers. Buildings only when ordered.
 */
export function mountValue(m: MothershipMount, o: Entity, ordered: boolean): number {
  if (o.hp <= 0 || o.wreck || isCrashing(o) || o.garrisonedIn != null) return 0;
  if (m === "flak") return flakReaches(o) ? 2 : 0;
  if (o.drone || isAirborne(o)) return 0;
  if (o.kind === "building") return ordered && m !== "spine" ? 1 : 0;
  const armored = isArmoredType(o.type);
  if (m === "spine") return armored ? 0 : isInfantryType(o.type) ? 3 : 2;
  if (m === "pulse") return armored ? 3 : isInfantryType(o.type) ? 1 : 2;
  return isInfantryType(o.type) ? 3 : 2;
}

/**
 * A force attack: the spine, the pulse, and the maw all fire on a point on the ground or on
 * anything standing there, armor and buildings too; the flak maw fires on anything flying it
 * can reach.
 */
function forcedMount(m: MothershipMount, t: Entity | undefined): boolean {
  const flying = !!t && (!!t.drone || isAirborne(t));
  if (m === "flak") return !!t && flying && flakReaches(t) && !isCrashing(t);
  return !flying;
}

/** Some mount can be forced onto `t`, friend or foe: the flak maw on a flier it reaches, the others on the ground. */
export function mothershipForceReaches(t: Entity): boolean {
  return MOTHERSHIP_MOUNTS.some((m) => forcedMount(m, t));
}

/** Some mount on this Mothership can hurt `t`: what it may be sent at. */
export function mothershipHurts(state: MatchState, e: Entity, t: Entity): boolean {
  if (t.id === e.id || allies(state, e.ownerId, t.ownerId)) return false;
  return MOTHERSHIP_MOUNTS.some((m) => mountValue(m, t, true) > 0);
}

/** An enemy the mounts may pick for themselves: seen by their side, in the open, not hidden. */
export function fairGame(state: MatchState, e: Entity, o: Entity): boolean {
  if (o.id === e.id || o.ownerId === "" || allies(state, e.ownerId, o.ownerId) || hiddenFromAuto(o) || o.dormant) return false;
  return canSeeEntity(state, e.ownerId, o);
}

type Aim = { x: number; y: number; target?: Entity; forced: boolean; fromOrder?: true };

/** What the ship was sent at: a unit it attacks, or a forced point or unit. */
function ordered(state: MatchState, e: Entity): Aim | null {
  const o = e.order;
  if (!o) return null;
  if (o.kind === "attack" && o.targetId != null) {
    const t = state.entities.get(o.targetId);
    return t && canSeeEntity(state, e.ownerId, t) ? { x: t.x, y: t.y, target: t, forced: false } : null;
  }
  if (o.kind === "forceattack") {
    const t = o.targetId != null ? state.entities.get(o.targetId) : undefined;
    if (t && t.hp > 0) return { x: t.x, y: t.y, target: t, forced: true };
    if (o.x != null && o.y != null) return { x: o.x, y: o.y, forced: true };
  }
  return null;
}

/** In the mount's band from where it sits. */
function inBand(state: MatchState, from: { x: number; y: number }, m: MothershipMount, x: number, y: number): boolean {
  const d = Math.hypot(x - from.x, y - from.y);
  return d <= mountReachTiles(m) * state.tileSize && d >= mountMinTiles(m) * state.tileSize;
}

/**
 * Where mount `m` lays this tick. The ship's ordered target or forced point comes first when the
 * mount can reach and hurt it. A maw keeps a salvo under way on its target. Otherwise the best
 * target in its band: value first, then nearest.
 */
function mountAim(state: MatchState, e: Entity, m: MothershipMount, gun: MothershipGun, near: readonly Entity[]): Aim | null {
  const from = mothershipMountPoint(e, m);
  const order = ordered(state, e);
  if (order) {
    const hurts = order.forced ? forcedMount(m, order.target) : !!order.target && mountValue(m, order.target, true) > 0;
    if (hurts && inBand(state, from, m, order.x, order.y)) return { ...order, fromOrder: true };
  }
  if (gun.targetId != null && (gun.salvo > 0 || m === "spine" || m === "pulse")) {
    const held = state.entities.get(gun.targetId);
    if (held && mountValue(m, held, false) > 0 && fairGame(state, e, held) && inBand(state, from, m, held.x, held.y)) {
      return { x: held.x, y: held.y, target: held, forced: false };
    }
  }
  let best: Entity | undefined;
  let bestScore = -Infinity;
  for (const o of near) {
    const v = mountValue(m, o, false);
    if (v <= 0 || !inBand(state, from, m, o.x, o.y)) continue;
    const score = v * 1000 - Math.hypot(o.x - from.x, o.y - from.y) / state.tileSize;
    if (score > bestScore) {
      bestScore = score;
      best = o;
    }
  }
  return best ? { x: best.x, y: best.y, target: best, forced: false } : null;
}

/** The ship's height over the ground it flies above: where every round leaves from. */
function shipZ(state: MatchState, e: Entity): number {
  return entityHeight(state, e) + airAlt(e);
}

/**
 * One round from the spine or the pulse: straight down the line from the ship's height onto the
 * target, landing within the gun's spread of it. It meets a hull's roof (fromAbove), as a
 * plane's cannon does.
 */
function fireRound(
  state: MatchState,
  e: Entity,
  from: { x: number; y: number },
  aim: Aim,
  round: { damage: number; penetration: number; caliber: number; spreadDeg: number; speed: number; shell: "ap" | null },
): void {
  const ts = state.tileSize;
  const z0 = shipZ(state, e);
  const flat = Math.hypot(aim.x - from.x, aim.y - from.y);
  const slant = Math.hypot(flat, z0);
  const scatter = Math.tan((round.spreadDeg * Math.PI) / 180) * slant * Math.sqrt(nextRand(state));
  const ang = nextRand(state) * Math.PI * 2;
  const lx = Math.max(0, Math.min(state.width * ts - 1, aim.x + Math.cos(ang) * scatter));
  const ly = Math.max(0, Math.min(state.height * ts - 1, aim.y + Math.sin(ang) * scatter));
  const run = Math.max(1, Math.hypot(lx - from.x, ly - from.y));
  const dir = Math.atan2(ly - from.y, lx - from.x);
  const zEnd = worldTileHeight(state, lx, ly);
  state.projectiles.push({
    id: state.nextId++,
    ownerId: e.ownerId,
    team: playerTeam(state, e.ownerId),
    x: from.x,
    y: from.y,
    vx: Math.cos(dir) * round.speed,
    vy: Math.sin(dir) * round.speed,
    damage: factionDamage(e.type, round.damage),
    penetration: round.penetration,
    caliber: round.caliber,
    life: run / round.speed,
    ignoreId: e.id,
    fromId: e.id,
    bounced: false,
    shell: round.shell,
    z: z0,
    vz: -((z0 - zEnd) / run) * round.speed,
    fromAbove: true,
    landX: lx,
    landY: ly,
    harmAllies: aim.forced ? true : undefined,
  });
}

/** Draw `shots` from a mount's cell. Run dry, it waits for part of the cell to regrow. */
function draw(gun: MothershipGun, shots: number): void {
  gun.energy = Math.max(0, gun.energy - shots);
  if (gun.energy < 1) gun.drained = true;
}

function canDraw(gun: MothershipGun): boolean {
  return !gun.drained && gun.energy >= 1;
}

/** The spine: an MG42's pace off the Spine Turret's cell, a round per shot of energy. */
function fireSpine(state: MatchState, e: Entity, gun: MothershipGun, aim: Aim): void {
  const def = catalog("spineturret");
  const per = Math.max(1, Math.round(def.shotsPerTick ?? 1));
  const from = mothershipMountPoint(e, "spine");
  for (let i = 0; i < per && canDraw(gun); i++) {
    fireRound(state, e, from, aim, {
      damage: def.damage,
      penetration: def.penetration,
      caliber: def.caliber,
      spreadDeg: def.spreadDeg,
      speed: def.projectileSpeed,
      shell: null,
    });
    draw(gun, 1);
  }
  gun.cooldown = def.cooldown;
}

/** The pulse: one armor-piercing pulse, the Pulse Spire's, off its cell. */
function firePulse(state: MatchState, e: Entity, gun: MothershipGun, aim: Aim): void {
  const def = catalog("pulsespire");
  const ap = PULSE_SPIRE_SHELLS.ap;
  fireRound(state, e, mothershipMountPoint(e, "pulse"), aim, {
    damage: ap.damage,
    penetration: ap.penetration,
    caliber: ap.caliber,
    spreadDeg: ap.spreadDeg,
    speed: def.projectileSpeed,
    shell: "ap",
  });
  draw(gun, 1);
  gun.cooldown = def.cooldown;
}

/**
 * A maw: one launch of the salvo, the Mawcaster's ripple, then its reload. The balls leave from
 * the ship's height as the Mawcaster's own (launcher "mawcaster"), so they burst, scatter, leave
 * bile, and home on a flier as its do.
 */
function fireMaw(state: MatchState, e: Entity, m: "maw" | "flak", gun: MothershipGun, aim: Aim): void {
  const rack: RocketRackDef = m === "maw" ? MAWCASTER_POD : MAWCASTER_AIR_BALL;
  const from = mothershipMountPoint(e, m);
  const range = mountReachTiles(m) * state.tileSize;
  const dist = Math.hypot(aim.x - from.x, aim.y - from.y);
  if (gun.salvo <= 0) gun.salvo = rack.salvo;
  const most = rack.volleyMax ?? 1;
  const volley = Math.max(1, Math.min(most > 1 ? 1 + Math.floor(nextRand(state) * most) : 1, gun.salvo));
  for (let i = 0; i < volley && canDraw(gun); i++) {
    const side = (((gun.salvo - 1) % 6) - 2.5) / 2.5 * MOTHERSHIP_HULL_RADIUS * 0.15;
    launchRocket(state, e, rack, aim.x, aim.y, range, dist, aim.target, side, {
      x: from.x,
      y: from.y,
      z: shipZ(state, e),
      launcher: "mawcaster",
      airRack: m === "flak",
      forced: aim.forced,
    });
    draw(gun, 1);
    gun.salvo--;
    if (gun.salvo <= 0) break;
  }
  const jitter = (rack.intervalJitter ?? 0) > 0 ? nextRand(state) * (rack.intervalJitter ?? 0) : 0;
  gun.cooldown = gun.salvo > 0 && canDraw(gun) ? rack.interval + jitter : rack.reload;
  if (!canDraw(gun)) gun.salvo = 0;
}

/** Every cell regrows; one that ran dry wakes once PLASMA_RESUME_SHARE of it is back. Clocks run down. */
function tickCells(ship: MothershipState, dt: number): void {
  for (const m of MOTHERSHIP_MOUNTS) {
    const gun = ship[m];
    const cell = MOTHERSHIP_CELLS[m];
    if (gun.cooldown > 0) gun.cooldown = Math.max(0, gun.cooldown - dt);
    gun.energy = Math.min(cell.shots, gun.energy + dt / cell.rechargeSeconds);
    if (gun.drained && gun.energy >= resumeShots(cell.shots)) gun.drained = false;
  }
}

/** Enemies the mounts may lay on: in the longest reach and seen by the ship's side. */
function nearby(state: MatchState, e: Entity): Entity[] {
  const reach = (MAWCASTER_RANGE_TILES * state.tileSize) + MOTHERSHIP_HULL_RADIUS;
  const out: Entity[] = [];
  for (const o of state.entities.values()) {
    if (Math.abs(o.x - e.x) > reach || Math.abs(o.y - e.y) > reach) continue;
    if (o.hp <= 0 || o.wreck || !fairGame(state, e, o)) continue;
    out.push(o);
  }
  return out;
}

function shipLive(e: Entity): boolean {
  return e.hp > 0 && !e.wreck && !!e.mothership && !!e.air && e.air.phase !== "crash" && airAlt(e) > 0;
}

/** Sim phase: every Mothership's cells, and each mount laying and firing on its own. */
export function tickMotherships(state: MatchState, dt: number): void {
  for (const e of state.entities.values()) {
    if (!isMothership(e.type) || !e.mothership) continue;
    if (!shipLive(e)) continue;
    const ship = e.mothership;
    tickCells(ship, dt);
    const near = nearby(state, e);
    for (const m of MOTHERSHIP_MOUNTS) {
      const gun = ship[m];
      const aim = mountAim(state, e, m, gun, near);
      gun.targetId = aim?.target?.id ?? null;
      if (!aim) {
        gun.salvo = 0;
        continue;
      }
      const from = mothershipMountPoint(e, m);
      const want = Math.atan2(aim.y - from.y, aim.x - from.x);
      const off = angleOff(want, gun.facing);
      const step = ((turnDegPerSec(m) * Math.PI) / 180) * dt;
      gun.facing = Math.abs(off) <= step ? want : gun.facing + Math.sign(off) * step;
      if (gun.cooldown > 0 || !canDraw(gun)) continue;
      if (Math.abs(angleOff(want, gun.facing)) > (arcDeg(m) * Math.PI) / 180) continue;
      if (m === "spine") fireSpine(state, e, gun, aim);
      else if (m === "pulse") firePulse(state, e, gun, aim);
      else fireMaw(state, e, m, gun, aim);
      gun.firedTick = state.tick;
      if (e.order?.once && aim.fromOrder) e.order = null;
    }
  }
}

/** Share 0–1 of mount `m`'s cell charged, to the hundredth. */
export function mountCharge(gun: MothershipGun, m: MothershipMount): number {
  return Math.round((gun.energy / MOTHERSHIP_CELLS[m].shots) * 100) / 100;
}
