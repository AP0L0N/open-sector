import {
  BV222_TROOPS,
  CLUSTER_FALL_SECONDS,
  CLUSTER_MINES,
  CLUSTER_RADIUS_TILES,
  CRATE_HP_PER_POINT,
  CRATE_LIFE_SECONDS,
  CRATE_PER_SEC,
  CRATE_REACH_TILES,
  CRATE_SINK_PER_SEC,
  CRATE_SUPPLY,
  MINE_ARM_SECONDS,
  MINE_ARMOR_SHARE,
  MINE_CALIBER,
  MINE_CAP,
  MINE_INFANTRY_DAMAGE,
  MINE_LIFE_SECONDS,
  MINE_SOFT_SHARE,
  MINE_SPLASH_TILES,
  MINE_SPOT_TILES,
  MINE_TRACK_CHANCE,
  MINE_TRIGGER_TILES,
  PARA_DOOR_SECONDS,
  PARA_DRAG,
  PARA_SINK_PER_SEC,
  PARA_THROW,
  addCrit,
  catalog,
  hasTracks,
  isAircraftType,
  isArmoredType,
  isDroneType,
  isInfantryType,
  isTransportType,
  type AirDrop,
} from "../catalog.js";
import type { CrateView, ImpactView, MineView } from "../protocol.js";
import { takeDamage } from "./crits.js";
import { airAlt } from "./elevation.js";
import { detachGarrisoned, livingGarrison } from "./garrison.js";
import {
  adjacentToBuilding,
  allies,
  clearOrder,
  inBounds,
  isWater,
  nearestWalkable,
  playerTeam,
  tileCenter,
  walkable,
  worldToTile,
} from "./geo.js";
import { mortarFalloff } from "./mortar.js";
import { setPath } from "./path.js";
import { noteImpactSurface } from "./remains.js";
import { nextRand } from "./rng.js";
import { needsSupply, transferOnce } from "./supply.js";
import { canSeeWorld } from "./vision.js";
import type { Entity, MatchState, Projectile } from "./types.js";

const BOARD_SLACK = 14;

/** Hanging under a canopy on the way down. */
export function isParachuting(e: { chute?: { alt: number } }): boolean {
  return !!e.chute;
}

/** What this transport's bay takes on the pad. Undefined for every other plane. */
export function payloadOf(e: Entity): AirDrop | undefined {
  if (!isTransportType(e.type) || !e.air) return undefined;
  return e.air.payload ?? "mines";
}

/** Units aboard, in the order they climbed in. */
export function planeRiders(state: MatchState, plane: Entity): Entity[] {
  if (!isTransportType(plane.type)) return [];
  return livingGarrison(state, plane);
}

/** Something in the bay to drop. */
export function hasCargo(state: MatchState, e: Entity): boolean {
  const load = payloadOf(e);
  if (!load) return false;
  if (load === "troops") return planeRiders(state, e).length > 0;
  return (e.air?.bombs ?? 0) > 0;
}

function parkedTransport(e: Entity): boolean {
  return isTransportType(e.type) && e.hp > 0 && e.air?.phase === "parked";
}

function homeField(state: MatchState, plane: Entity): Entity | undefined {
  const id = plane.air?.homeId;
  const f = id != null ? state.entities.get(id) : undefined;
  return f && f.hp > 0 && f.type === "airfield" ? f : undefined;
}

/** Ground units jump. A plane and a drone do not climb into the bay. */
function canParadrop(unit: Entity): boolean {
  return unit.kind === "unit" && !isAircraftType(unit.type) && !isDroneType(unit.type);
}

/** Why this unit cannot board this transport, or null. */
export function canBoardPlane(state: MatchState, unit: Entity, plane: Entity): string | null {
  if (unit.kind !== "unit" || unit.hp <= 0 || unit.wreck) return "Only units jump.";
  if (!canParadrop(unit)) return "That cannot board.";
  if (unit.braced || unit.state === "deploy" || unit.state === "undeploy") return "Pack up to move.";
  if (airAlt(unit) > 0.5) return "Land first.";
  if (!isTransportType(plane.type) || plane.hp <= 0) return "Cannot board that.";
  if (unit.garrisonedIn === plane.id) return "Already aboard.";
  if (unit.garrisonedIn != null) return "Already inside.";
  if (unit.chute) return "Still in the air.";
  if (plane.ownerId !== unit.ownerId) return "Not your plane.";
  if (payloadOf(plane) !== "troops") return "The bay is loaded for a drop. Load paratroops first.";
  if (plane.air?.phase !== "parked") return "Board on the hardstand.";
  if (planeRiders(state, plane).length >= BV222_TROOPS) return "The plane is full.";
  return null;
}

/** Units walk to the parked transport and climb in. */
export function orderBoardPlane(state: MatchState, playerId: string, units: Entity[], plane: Entity): string | null {
  const feet = units.filter((e) => e.ownerId === playerId && canParadrop(e));
  if (feet.length === 0) return "Select units.";
  let room = BV222_TROOPS - planeRiders(state, plane).length;
  let why = "Cannot board.";
  let n = 0;
  for (const e of feet) {
    const err = room > 0 ? canBoardPlane(state, e, plane) : "The plane is full.";
    if (err) {
      why = err;
      continue;
    }
    clearOrder(e);
    e.harvestTile = null;
    if (e.type === "hauler") e.autoHarvest = false;
    e.order = { kind: "board", targetId: plane.id };
    e.state = "move";
    walkToPlane(state, e, plane);
    room--;
    n++;
  }
  return n > 0 ? null : why;
}

function walkToPlane(state: MatchState, e: Entity, plane: Entity): void {
  const ts = state.tileSize;
  const snap = nearestWalkable(state, worldToTile(plane.x, ts), worldToTile(plane.y, ts), e.type);
  const at = snap ? { x: tileCenter(snap.x, ts), y: tileCenter(snap.y, ts) } : { x: plane.x, y: plane.y };
  setPath(state, e, at.x, at.y);
}

/** Alongside the plane, or at the edge of the Airfield it stands on. */
function atPlane(state: MatchState, e: Entity, plane: Entity): boolean {
  if (Math.hypot(e.x - plane.x, e.y - plane.y) <= e.radius + plane.radius + BOARD_SLACK) return true;
  const field = homeField(state, plane);
  if (!field || !adjacentToBuilding(state, e, field)) return false;
  return Math.hypot(e.x - plane.x, e.y - plane.y) <= (field.tileW + field.tileH) * state.tileSize * 0.5;
}

function enterPlane(unit: Entity, plane: Entity): void {
  unit.garrisonedIn = plane.id;
  if (!plane.garrison.includes(unit.id)) plane.garrison.push(unit.id);
  unit.x = plane.x;
  unit.y = plane.y;
  unit.tileX = plane.tileX;
  unit.tileY = plane.tileY;
  unit.waypoints = [];
  unit.order = null;
  unit.attackTarget = null;
  unit.orderQueue = undefined;
  unit.state = "garrison";
}

/** Units on a board order to a transport walk over and climb in. */
export function tickPlaneBoarding(state: MatchState): void {
  for (const e of state.entities.values()) {
    if (e.kind !== "unit" || e.hp <= 0 || e.garrisonedIn != null || e.order?.kind !== "board") continue;
    const plane = e.order.targetId != null ? state.entities.get(e.order.targetId) : undefined;
    if (!plane || !isTransportType(plane.type)) continue;
    if (canBoardPlane(state, e, plane)) {
      clearOrder(e);
      e.state = "idle";
      continue;
    }
    if (atPlane(state, e, plane)) {
      enterPlane(e, plane);
      continue;
    }
    e.state = "move";
    if (e.waypoints.length === 0 || state.tick % 8 === 0) walkToPlane(state, e, plane);
  }
}

/** Park every rider on the plane so sight leaves from its hull. */
export function syncPlaneRiders(state: MatchState): void {
  for (const plane of state.entities.values()) {
    if (!isTransportType(plane.type) || plane.hp <= 0 || plane.garrison.length === 0) continue;
    for (const r of planeRiders(state, plane)) {
      r.x = plane.x;
      r.y = plane.y;
      r.tileX = plane.tileX;
      r.tileY = plane.tileY;
    }
  }
}

/** Everyone aboard climbs out onto the grass beside the hardstand. */
function climbOut(state: MatchState, plane: Entity): void {
  const ts = state.tileSize;
  planeRiders(state, plane).forEach((r, i) => {
    detachGarrisoned(state, r);
    const ang = plane.facing + Math.PI / 2 + (i - 4.5) * 0.35;
    const x = plane.x + Math.cos(ang) * (plane.radius + 14);
    const y = plane.y + Math.sin(ang) * (plane.radius + 14);
    const snap = nearestWalkable(state, worldToTile(x, ts), worldToTile(y, ts), r.type);
    r.x = snap ? tileCenter(snap.x, ts) + (nextRand(state) - 0.5) * ts * 0.5 : x;
    r.y = snap ? tileCenter(snap.y, ts) + (nextRand(state) - 0.5) * ts * 0.5 : y;
    r.tileX = worldToTile(r.x, ts);
    r.tileY = worldToTile(r.y, ts);
    clearOrder(r);
    r.state = "idle";
  });
}

/** Get the stick out on the pad. */
export function unloadPlane(state: MatchState, plane: Entity): string | null {
  if (!isTransportType(plane.type) || plane.hp <= 0) return "No such plane.";
  if (planeRiders(state, plane).length === 0) return "Nobody aboard.";
  if (plane.air?.phase !== "parked") return "They jump over the drop point, not here.";
  climbOut(state, plane);
  return null;
}

/**
 * Change what the bay takes. Only on the pad: the ground crew swaps the load.
 * A new canister needs hanging (BOMB_REARM_SECONDS); switching away from
 * paratroops sends the stick back out onto the grass.
 */
export function setPayload(state: MatchState, plane: Entity, load: AirDrop): string | null {
  const a = plane.air;
  if (!a || !isTransportType(plane.type) || plane.hp <= 0) return "Select a transport.";
  if (payloadOf(plane) === load) return null;
  if (!parkedTransport(plane)) return "Change the load on the pad.";
  if (payloadOf(plane) === "troops") climbOut(state, plane);
  a.payload = load;
  a.bombs = 0;
  a.rearm = 0;
  return null;
}

/** Let the canister go over (tx, ty): mines in a bomb case that bursts over the ground, or a crate on a parachute. */
export function releaseCanister(state: MatchState, e: Entity, tx: number, ty: number): void {
  const a = e.air!;
  if (a.bombs <= 0) return;
  const load = payloadOf(e);
  a.bombs -= 1;
  if (load === "crate") {
    const fall = Math.max(0.5, a.alt / CRATE_SINK_PER_SEC);
    state.crates.push({
      id: state.nextId++,
      ownerId: e.ownerId,
      x: e.x,
      y: e.y,
      alt: a.alt,
      vx: (tx - e.x) / fall,
      vy: (ty - e.y) / fall,
      supply: CRATE_SUPPLY,
      life: CRATE_LIFE_SECONDS,
      work: 0,
      turn: 0,
    });
    return;
  }
  const fall = CLUSTER_FALL_SECONDS;
  state.projectiles.push({
    id: state.nextId++,
    ownerId: e.ownerId,
    team: playerTeam(state, e.ownerId),
    x: e.x,
    y: e.y,
    vx: (tx - e.x) / fall,
    vy: (ty - e.y) / fall,
    damage: 0,
    penetration: 0,
    caliber: MINE_CALIBER,
    life: fall,
    ignoreId: e.id,
    fromId: e.id,
    bounced: false,
    shell: null,
    flight: "cluster",
    landX: tx,
    landY: ty,
    apex: a.alt,
    flightTime: fall,
    z: a.alt,
  });
}

/** The first jumper goes at once; the rest follow PARA_DOOR_SECONDS apart. */
export function startJumping(e: Entity): void {
  const a = e.air!;
  if (a.jumping) return;
  a.jumping = true;
  a.door = 0;
}

/** Jumpers go out of the door one after another. False once the bay is empty. */
export function tickDoor(state: MatchState, e: Entity, dt: number): boolean {
  const a = e.air!;
  if (!a.jumping) return false;
  a.door = (a.door ?? 0) - dt;
  while ((a.door ?? 0) <= 0) {
    const r = planeRiders(state, e)[0];
    if (!r) break;
    jump(state, e, r);
    a.door = (a.door ?? 0) + PARA_DOOR_SECONDS;
  }
  if (planeRiders(state, e).length === 0) {
    a.jumping = false;
    a.door = 0;
    return false;
  }
  return true;
}

function jump(state: MatchState, plane: Entity, r: Entity): void {
  const a = plane.air!;
  detachGarrisoned(state, r);
  const v = catalog(plane.type).moveTilesPerSec * state.tileSize * a.speed * PARA_THROW;
  // A little spread off the door so the canopies do not stack.
  const side = (nextRand(state) - 0.5) * 10;
  r.x = plane.x - Math.sin(plane.facing) * side;
  r.y = plane.y + Math.cos(plane.facing) * side;
  r.tileX = worldToTile(r.x, state.tileSize);
  r.tileY = worldToTile(r.y, state.tileSize);
  r.facing = plane.facing;
  r.turretFacing = plane.facing;
  r.chute = { alt: Math.max(1, a.alt), vx: Math.cos(plane.facing) * v, vy: Math.sin(plane.facing) * v };
  clearOrder(r);
  r.stance = "stand";
  r.stanceOrder = "stand";
  r.state = "idle";
}

/** Canopies sink, drift, and put their men down on the nearest open ground. */
export function tickChutes(state: MatchState, dt: number): void {
  const ts = state.tileSize;
  const maxX = state.width * ts - 1;
  const maxY = state.height * ts - 1;
  const drag = Math.pow(PARA_DRAG, dt);
  for (const e of state.entities.values()) {
    const c = e.chute;
    if (!c || e.hp <= 0) continue;
    e.waypoints = [];
    e.order = null;
    e.attackTarget = null;
    c.alt -= PARA_SINK_PER_SEC * dt;
    e.x = Math.max(1, Math.min(maxX, e.x + c.vx * dt));
    e.y = Math.max(1, Math.min(maxY, e.y + c.vy * dt));
    c.vx *= drag;
    c.vy *= drag;
    e.tileX = worldToTile(e.x, ts);
    e.tileY = worldToTile(e.y, ts);
    if (c.alt > 0) continue;
    e.chute = undefined;
    if (!walkable(state, e.tileX, e.tileY, e.type)) {
      // Came down on a roof or a wall: he climbs down beside it.
      const snap = nearestWalkable(state, e.tileX, e.tileY, e.type);
      if (snap) {
        e.x = tileCenter(snap.x, ts);
        e.y = tileCenter(snap.y, ts);
        e.tileX = snap.x;
        e.tileY = snap.y;
      }
    }
    e.state = "idle";
  }
}

/** A plane that goes down in the air takes everyone in the bay with it. */
export function loseRiders(state: MatchState, plane: Entity): void {
  if (!isTransportType(plane.type) || airAlt(plane) <= 0.5) return;
  for (const r of planeRiders(state, plane)) {
    detachGarrisoned(state, r);
    r.x = plane.x;
    r.y = plane.y;
    r.hp = 0;
    r.state = "dead";
  }
}

/** Advance a falling mine canister. False once it has burst and scattered its bomblets. */
export function stepCluster(state: MatchState, p: Projectile, dt: number): boolean {
  const total = p.flightTime ?? CLUSTER_FALL_SECONDS;
  const stepDt = p.life > 0 ? Math.min(dt, p.life) : 0;
  p.x += p.vx * stepDt;
  p.y += p.vy * stepDt;
  p.life -= dt;
  const u = Math.min(1, Math.max(0, (total - Math.max(0, p.life)) / total));
  p.z = (p.apex ?? 0) * (1 - u * u);
  if (p.life > 0) return true;
  if (p.landX != null && p.landY != null) {
    p.x = p.landX;
    p.y = p.landY;
  }
  p.z = 0;
  scatterMines(state, p.ownerId, p.x, p.y);
  return false;
}

/** The case splits over the ground and the bomblets spin down around the point. None stays live in water. */
export function scatterMines(state: MatchState, ownerId: string, x: number, y: number): void {
  const ts = state.tileSize;
  const r0 = CLUSTER_RADIUS_TILES * ts;
  const maxX = state.width * ts - 1;
  const maxY = state.height * ts - 1;
  for (let i = 0; i < CLUSTER_MINES; i++) {
    const r = r0 * Math.sqrt(nextRand(state));
    const ang = nextRand(state) * Math.PI * 2;
    const mx = Math.max(1, Math.min(maxX, x + Math.cos(ang) * r));
    const my = Math.max(1, Math.min(maxY, y + Math.sin(ang) * r));
    const tx = worldToTile(mx, ts);
    const ty = worldToTile(my, ts);
    if (!inBounds(state, tx, ty) || isWater(state, tx, ty)) continue;
    state.mines.push({ id: state.nextId++, ownerId, x: mx, y: my, arm: MINE_ARM_SECONDS, life: MINE_LIFE_SECONDS });
  }
  if (state.mines.length > MINE_CAP) state.mines.splice(0, state.mines.length - MINE_CAP);
  state.impacts.push({
    id: state.nextId++,
    ownerId,
    kind: "miss",
    x,
    y,
    vx: 0,
    vy: 0,
    caliber: MINE_CALIBER,
    blast: true,
  });
}

/** An enemy standing on the ground: what sets off a mine, and what its blast reaches. */
function onGround(e: Entity): boolean {
  return e.kind === "unit" && e.hp > 0 && !e.wreck && e.garrisonedIn == null && airAlt(e) <= 0.5 && !e.drone;
}

/** Live mines go off under an enemy's feet or tracks; old ones pop by themselves. */
export function tickMines(state: MatchState, dt: number): void {
  if (state.mines.length === 0) return;
  const ts = state.tileSize;
  const trigger = MINE_TRIGGER_TILES * ts;
  const keep = [];
  for (const m of state.mines) {
    m.arm -= dt;
    m.life -= dt;
    if (m.life <= 0) continue;
    if (m.arm > 0) {
      keep.push(m);
      continue;
    }
    let hit = false;
    for (const e of state.entities.values()) {
      if (!onGround(e) || !e.ownerId || allies(state, m.ownerId, e.ownerId)) continue;
      if (Math.hypot(e.x - m.x, e.y - m.y) <= trigger + e.radius) {
        hit = true;
        break;
      }
    }
    if (hit) detonateMine(state, m.ownerId, m.x, m.y);
    else keep.push(m);
  }
  state.mines = keep;
}

function detonateMine(state: MatchState, ownerId: string, x: number, y: number): void {
  const reach = MINE_SPLASH_TILES * state.tileSize;
  let killed = false;
  for (const e of [...state.entities.values()]) {
    if (!onGround(e) || !e.ownerId || allies(state, ownerId, e.ownerId)) continue;
    const d = Math.hypot(e.x - x, e.y - y);
    if (d > reach + e.radius) continue;
    const fall = mortarFalloff(Math.max(0, d - e.radius), reach);
    let dmg: number;
    if (isInfantryType(e.type)) {
      dmg = MINE_INFANTRY_DAMAGE * fall;
    } else if (isArmoredType(e.type)) {
      dmg = e.hpMax * MINE_ARMOR_SHARE * fall;
      if (hasTracks(e.type) && nextRand(state) < MINE_TRACK_CHANCE * fall) addCrit(e, "tracks");
    } else {
      dmg = e.hpMax * MINE_SOFT_SHARE * fall;
    }
    takeDamage(e, Math.max(1, Math.round(dmg)), state.tick);
    if (e.hp <= 0) killed = true;
  }
  const impact: ImpactView = {
    id: state.nextId++,
    ownerId,
    kind: killed ? "kill" : "miss",
    x,
    y,
    vx: 0,
    vy: 0,
    caliber: MINE_CALIBER * 2,
    blast: true,
    mortar: true,
  };
  noteImpactSurface(state, impact, { caliber: MINE_CALIBER, shell: null, vx: 0, vy: 0 }, "miss");
  state.impacts.push(impact);
}

/** Wounded, hull-damaged, or short of ammo: something a crate can do for this unit. */
function crateServes(e: Entity): boolean {
  if (!onGround(e) || isAircraftType(e.type)) return false;
  return needsSupply(e) || e.hp < e.hpMax;
}

/** One hand-out: ammo first, else a field dressing or a crate of spares. */
function crateHandOut(crate: { supply: number }, e: Entity): boolean {
  if (needsSupply(e) && transferOnce(crate, e)) return true;
  if (e.hp < e.hpMax && crate.supply >= 1) {
    e.hp = Math.min(e.hpMax, e.hp + CRATE_HP_PER_POINT);
    crate.supply -= 1;
    return true;
  }
  return false;
}

/** Crates sink under their canopies, then hand out ammo and patch-ups to the allies standing at them. */
export function tickCrates(state: MatchState, dt: number): void {
  if (state.crates.length === 0) return;
  const ts = state.tileSize;
  const reach = CRATE_REACH_TILES * ts;
  const maxX = state.width * ts - 1;
  const maxY = state.height * ts - 1;
  const slice = 1 / CRATE_PER_SEC;
  for (const c of state.crates) {
    if (c.alt > 0) {
      c.alt = Math.max(0, c.alt - CRATE_SINK_PER_SEC * dt);
      c.x = Math.max(1, Math.min(maxX, c.x + c.vx * dt));
      c.y = Math.max(1, Math.min(maxY, c.y + c.vy * dt));
      if (c.alt <= 0) landCrate(state, c);
      continue;
    }
    c.life -= dt;
    const near = [...state.entities.values()]
      .filter((e) => allies(state, c.ownerId, e.ownerId) && crateServes(e) && Math.hypot(e.x - c.x, e.y - c.y) <= reach + e.radius)
      .sort((a, b) => a.id - b.id);
    if (near.length === 0) {
      c.work = 0;
      continue;
    }
    c.work += dt;
    let tries = near.length;
    while (c.work >= slice && c.supply > 0 && tries > 0) {
      const e = near[c.turn % near.length]!;
      c.turn++;
      if (crateServes(e) && crateHandOut(c, e)) {
        c.work -= slice;
        tries = near.length;
      } else {
        tries--;
      }
    }
    if (tries <= 0) c.work = 0;
  }
  state.crates = state.crates.filter((c) => c.supply > 0 && c.life > 0);
}

function landCrate(state: MatchState, c: { x: number; y: number; vx: number; vy: number }): void {
  const ts = state.tileSize;
  c.vx = 0;
  c.vy = 0;
  const tx = worldToTile(c.x, ts);
  const ty = worldToTile(c.y, ts);
  if (walkable(state, tx, ty, "rifleman")) return;
  // Came down on a roof or in the water: it tumbles off onto open ground beside it.
  const snap = nearestWalkable(state, tx, ty, "rifleman");
  if (!snap) return;
  c.x = tileCenter(snap.x, ts);
  c.y = tileCenter(snap.y, ts);
}

/** Your side's mines, and enemy mines one of your men is close enough to see. */
export function mineViews(state: MatchState, youPlayerId: string, vis: Uint8Array): MineView[] {
  const out: MineView[] = [];
  if (state.mines.length === 0) return out;
  const spot = MINE_SPOT_TILES * state.tileSize;
  const eyes = [...state.entities.values()].filter(
    (e) => e.kind === "unit" && e.hp > 0 && e.garrisonedIn == null && allies(state, youPlayerId, e.ownerId),
  );
  for (const m of state.mines) {
    const own = allies(state, youPlayerId, m.ownerId);
    if (!own) {
      if (!canSeeWorld(state, vis, m.x, m.y)) continue;
      if (!eyes.some((e) => Math.hypot(e.x - m.x, e.y - m.y) <= spot)) continue;
    }
    out.push({ id: m.id, ownerId: m.ownerId, x: m.x, y: m.y, armed: m.arm <= 0 ? undefined : false });
  }
  return out;
}

export function crateViews(state: MatchState, youPlayerId: string, vis: Uint8Array): CrateView[] {
  return state.crates
    .filter((c) => allies(state, youPlayerId, c.ownerId) || canSeeWorld(state, vis, c.x, c.y))
    .map((c) => ({
      id: c.id,
      ownerId: c.ownerId,
      x: c.x,
      y: c.y,
      alt: c.alt > 0 ? c.alt : undefined,
      supply: allies(state, youPlayerId, c.ownerId) ? Math.round(c.supply) : undefined,
      supplyMax: allies(state, youPlayerId, c.ownerId) ? CRATE_SUPPLY : undefined,
    }));
}
