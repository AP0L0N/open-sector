import {
  bridgeBrickLength,
  catalog,
  clampGameSpeed,
  GAME_SPEED_DEFAULT,
  garrisonDiesWithHostOf,
  hasCrit,
  isAircraftType,
  isInfantryType,
  isTransportType,
  leavesRubble,
  leavesWreck,
  NEUTRAL_OWNER,
  START_SCRAP,
  TICK_DT,
} from "../catalog.js";
import { featureAngle, featureLotSite, getMap, isMapBridge, isMapSection, type MapDef } from "../maps.js";
import { mapUnitHostAt } from "../custom-maps.js";
import { commanders } from "../lobby.js";
import { EASY_ATTACK_FIRST_TICKS, tickAi } from "./ai.js";
import type { ImpactView, RocketLaunchView, RoomState } from "../protocol.js";
import { buildingCenter, destroyEntity, initGrids, makeEntity, tileCenter } from "./geo.js";
import { aircraftDown, beginAircraftCrash, isAirborne, tickAir } from "./air.js";
import { ejectParatroopers, loseRiders, syncPlaneRiders, tickChutes, tickCrates, tickMines, tickPlaneBoarding } from "./airdrop.js";
import { tickDrones } from "./drone.js";
import { tickJets } from "./jet.js";
import { tickCapture } from "./capture.js";
import { detachGarrisoned, enterGarrison, killGarrison, manGun, spillGarrison, tickGarrison, tickGarrisonCare } from "./garrison.js";
import { buildPatrolRoute } from "./patrol.js";
import { setPath } from "./path.js";
import { seedRng } from "./rng.js";
import { tickBuild } from "./build.js";
import { raiseWallCrest, restampForts, tickField } from "./field.js";
import { syncTorpedoes, tickCombat, tickPatrol, tickProjectiles } from "./combat.js";
import { tickSubmarines } from "./naval.js";
import { tickDestroyers } from "./destroyer.js";
import { groundLstBows } from "./lst.js";
import { tickSmoke } from "./smoke.js";
import { maybeCookOff, tickFires } from "./flame.js";
import { tickBipod, tickStance } from "./stance.js";
import { tickCollision } from "./collision.js";
import { tickDeploy } from "./deploy.js";
import { tickSmelters } from "./smelter.js";
import { tickConstructs } from "./construct.js";
import { guardBridges, placeBrick, restampBridges, settleBridges, tickBridges } from "./bridge.js";
import { tickHeal } from "./heal.js";
import { tickForceFields, tickLasers } from "./laser.js";
import { tickSupply } from "./supply.js";
import { syncTowedGuns, tickArtillery } from "./artillery.js";
import { tickShipRearm } from "./battleship.js";
import { tickMovement, repathIfBlocked } from "./orders.js";
import { tickWalkerCharge } from "./walker-charge.js";
import { tickOrderQueue } from "./commands.js";
import { tickTrain } from "./train.js";
import { aimSpotlightPatrol, hasSpotlight, tickSpotlights } from "./night.js";
import type { Entity, MatchState, SimPlayer } from "./types.js";
import { leaveCorpse } from "./remains.js";
import { keepRubbleStanding, toRubble } from "./rubble.js";
import { toWreck } from "./wreck.js";
import { freshClutterHp } from "./clutter.js";
import { tickPower } from "./power.js";
import { tickCyborgLink } from "./cyborg-link.js";

export function createMatch(
  room: RoomState,
  spawns: Map<string, { spawnId: number; x: number; y: number }>,
): MatchState {
  const map = getMap(room.mapId);
  if (!map) throw new Error("map missing");
  const grids = initGrids(map);
  const players = new Map<string, SimPlayer>();
  const state: MatchState = {
    roomId: room.id,
    mapId: room.mapId,
    tick: 0,
    gameSpeed: GAME_SPEED_DEFAULT,
    nextId: 1,
    tileSize: map.tileSize,
    width: map.width,
    height: map.height,
    blocked: grids.blocked,
    terrain: grids.terrain,
    heights: grids.heights,
    scrapYield: grids.scrapYield,
    occupy: grids.occupy,
    sightOccupy: new Int32Array(map.width * map.height),
    wreckBlock: new Uint8Array(map.width * map.height),
    fortBlock: new Uint8Array(map.width * map.height),
    fortOwner: new Map(),
    bridgeDeck: new Uint8Array(map.width * map.height),
    players,
    entities: new Map(),
    projectiles: [],
    smokeClouds: [],
    fires: [],
    mines: [],
    crates: [],
    impacts: [],
    launches: [],
    rngState: seedRng(room.id),
    ended: false,
    initialHumans: commanders(room).length,
    pendingComms: [],
    visionTick: -1,
    visionByPlayer: new Map(),
    visionKeyByPlayer: new Map(),
    smokeMask: new Uint8Array(map.width * map.height),
    smokeMaskTick: -1,
    hullMask: new Int32Array(map.width * map.height),
    seeTick: -1,
    seeByPlayer: new Map(),
    clearedTrees: [],
    clutterHp: freshClutterHp(map),
    bodies: [],
    holes: [],
    blast: new Map(),
    dug: new Map(),
    digRev: 0,
    scrapRev: 0,
    sceneryRev: 0,
    sceneryKey: 0,
    sceneryKeyTick: -1,
  };

  for (const slot of commanders(room)) {
    const pid = slot.playerId!;
    const pos = spawns.get(pid);
    if (!pos) continue;
    const x = tileCenter(pos.x, map.tileSize);
    const y = tileCenter(pos.y, map.tileSize);
    const rig = makeEntity(state, "rig", pid, x, y);
    const towardX = map.width / 2 - pos.x;
    const towardY = map.height / 2 - pos.y;
    rig.facing = Math.atan2(towardY, towardX);
    rig.turretFacing = rig.facing;
    players.set(pid, {
      playerId: pid,
      name: slot.name ?? "Commander",
      colorId: slot.colorId,
      team: slot.team,
      alive: true,
      scrap: START_SCRAP,
      scrapCarry: 0,
      structure: null,
      defence: null,
      line: null,
      placingType: null,
      hqId: rig.id,
      ai: slot.ai,
      aiNextAttackTick: slot.ai ? EASY_ATTACK_FIRST_TICKS : 0,
    });
  }

  // Houses and map defences stand neutral. A defence changes hands when someone takes it.
  const sections: Entity[] = [];
  /** The building each map feature raised, by feature index, for the troops a map puts inside. */
  const raised = new Map<number, Entity>();
  let bricks = 0;
  (map.features ?? []).forEach((f, fi) => {
    const facing = featureAngle({ ...f, facing: f.facing ?? 0 });
    if (isMapBridge(f.type)) {
      placeBrick(
        state,
        f.type,
        {
          x: tileCenter(f.x, map.tileSize),
          y: tileCenter(f.y, map.tileSize),
          facing,
          length: bridgeBrickLength(f.type),
        },
        f.deck,
      );
      bricks++;
      return;
    }
    if (isMapSection(f.type)) {
      const s = makeEntity(state, f.type, NEUTRAL_OWNER, tileCenter(f.x, map.tileSize), tileCenter(f.y, map.tileSize), { facing });
      s.turretFacing = facing;
      sections.push(s);
      return;
    }
    // A turned bunker or tower stands on its turned site, like one the player placed.
    const site = featureLotSite({ ...f, facing: f.facing ?? 0 });
    const c = buildingCenter(site.tx, site.ty, site.w, site.h, map.tileSize);
    const b = makeEntity(state, f.type, NEUTRAL_OWNER, c.x, c.y, {
      tileX: site.tx,
      tileY: site.ty,
      tileW: site.w,
      tileH: site.h,
      facing,
    });
    // The tower's lamp rests where the map pointed it, and lights that way once someone holds it.
    if (f.spot != null) b.spotFacing = (f.spot * Math.PI) / 180;
    if (f.patrol?.length && hasSpotlight(f.type)) {
      const loop = f.loop === true;
      const points = f.patrol.map((p) => ({ x: tileCenter(p.x, map.tileSize), y: tileCenter(p.y, map.tileSize) }));
      b.order = { kind: "patrol", route: buildPatrolRoute(state, b, points, 0, 0, loop), leg: loop ? 0 : 1, dir: 1, ...(loop ? { loop: true } : {}) };
      aimSpotlightPatrol(b);
    }
    raised.set(fi, b);
  });
  if (sections.length > 0) {
    raiseWallCrest(state, sections);
    restampForts(state);
  }
  if (bricks > 0) restampBridges(state);
  standMapUnits(state, map, raised);
  // A map's gun is crewed like one the player raises: neutral riflemen in every place the map left empty.
  for (const b of raised.values()) manGun(state, b, NEUTRAL_OWNER);

  return state;
}

/**
 * The map's neutral troops. Grey, no one's, they shoot at anyone their own eyes
 * find and hold their post: each stands guard on its heading, walks its patrol
 * route, or sits inside the house or bunker it was put in.
 */
function standMapUnits(state: MatchState, map: MapDef, raised: ReadonlyMap<number, Entity>): void {
  const ts = map.tileSize;
  for (const mu of map.units ?? []) {
    const facing = (mu.facing * Math.PI) / 180;
    const x = tileCenter(mu.x, ts);
    const y = tileCenter(mu.y, ts);
    if (mu.inside) {
      const house = raised.get(mapUnitHostAt(map.features ?? [], mu.x, mu.y));
      if (!house) continue;
      const e = makeEntity(state, mu.type, NEUTRAL_OWNER, house.x, house.y, { facing });
      if (!enterGarrison(state, e, house)) destroyEntity(state, e);
      continue;
    }
    const e = makeEntity(state, mu.type, NEUTRAL_OWNER, x, y, { facing });
    // Never chases: a target out of reach is left to come closer.
    e.holdPosition = true;
    // A Battle Ship's searchlight starts where the map pointed it, and turns with the hull from there.
    if (mu.spot != null && hasSpotlight(mu.type)) {
      e.spotFacing = (mu.spot * Math.PI) / 180;
      e.spotHull = facing;
    }
    if (mu.patrol?.length) {
      const loop = mu.loop === true;
      const points = mu.patrol.map((p) => ({ x: tileCenter(p.x, ts), y: tileCenter(p.y, ts) }));
      const route = buildPatrolRoute(state, e, points, 0, 0, loop);
      const leg = loop ? 0 : 1;
      e.order = { kind: "patrol", route, leg, dir: 1, ...(loop ? { loop: true } : {}) };
      e.state = "move";
      const dest = route[leg]!;
      setPath(state, e, dest.x, dest.y);
      continue;
    }
    e.guardFacing = facing;
    e.order = { kind: "guard", x, y, facing };
  }
}

export function step(state: MatchState, dt = TICK_DT): void {
  if (state.ended) return;
  state.tick += 1;
  state.impacts = [];
  state.launches = [];
  restampForts(state);
  restampBridges(state);
  // Only rounds aimed at a bridge hurt it; every other knock this step is undone below.
  const bridgeHp = guardBridges(state);
  tickPower(state);
  tickCyborgLink(state);
  tickSmoke(state, dt);
  tickSpotlights(state, dt);
  tickStance(state);
  tickBipod(state);
  tickDeploy(state, dt);
  tickGarrison(state);
  tickHeal(state, dt);
  tickForceFields(state, dt);
  tickGarrisonCare(state, dt);
  tickSupply(state, dt);
  tickShipRearm(state, dt);
  tickArtillery(state, dt);
  tickPlaneBoarding(state);
  tickOrderQueue(state);
  tickPatrol(state);
  groundLstBows(state);
  tickMovement(state, dt);
  // After movement, before collision, so a charging walker detonates on
  // infantry he is overlapping instead of crushing them and walking on.
  tickWalkerCharge(state);
  tickAir(state, dt);
  syncPlaneRiders(state);
  tickChutes(state, dt);
  tickDrones(state, dt);
  tickSubmarines(state, dt);
  tickDestroyers(state, dt);
  tickJets(state, dt);
  tickCollision(state, dt);
  syncTowedGuns(state);
  tickMines(state, dt);
  tickCrates(state, dt);
  tickField(state, dt);
  tickConstructs(state, dt);
  tickBridges(state, dt);
  tickSmelters(state, dt);
  tickBuild(state, dt);
  tickTrain(state, dt);
  tickCombat(state, dt);
  tickLasers(state);
  tickProjectiles(state, dt);
  syncTorpedoes(state);
  tickFires(state, dt);
  tickCapture(state, dt);
  settleBridges(state, bridgeHp);
  reapDead(state);
  reapLostHqs(state);
  checkWin(state);
}

/** One wall-clock tick: `gameSpeed` sim steps (max 5×). A paused skirmish stays put. */
export function stepMatch(state: MatchState, dt = TICK_DT): void {
  if (state.paused) return;
  const n = clampGameSpeed(state.gameSpeed);
  const impacts: ImpactView[] = [];
  const launches: RocketLaunchView[] = [];
  for (let i = 0; i < n; i++) {
    step(state, dt);
    impacts.push(...state.impacts);
    launches.push(...state.launches);
    if (state.ended) break;
  }
  state.impacts = impacts;
  state.launches = launches;
  tickAi(state);
}

function reapDead(state: MatchState): void {
  const dead: number[] = [];
  let madeWreck = false;
  // A wrecked engine destroys an aircraft at once. It does not limp on.
  for (const e of state.entities.values()) {
    if (e.hp <= 0 || e.wreck || e.air?.phase === "crash" || e.drone) continue;
    if (isAircraftType(e.type) && hasCrit(e, "engine")) e.hp = 0;
  }
  for (const e of state.entities.values()) {
    if (e.hp > 0) continue;
    if (e.air?.phase === "crash") {
      e.hp = 1;
      continue;
    }
    // A heap of rubble is already as low as it goes.
    if (keepRubbleStanding(e)) continue;
    // A house comes down into rubble that still takes the ground. Whoever was inside spills out.
    if (!e.ruined && leavesRubble(e.type)) {
      toRubble(state, e);
      continue;
    }
    // The stick bails out before the airframe starts down or becomes a wreck.
    if (!e.wreck && isTransportType(e.type)) ejectParatroopers(state, e);
    if (!e.wreck && e.air && isAircraftType(e.type) && !e.drone && isAirborne(e)) {
      beginAircraftCrash(e);
      continue;
    }
    if (!e.wreck && e.garrison.length && garrisonDiesWithHostOf(e.type)) {
      for (const u of killGarrison(state, e)) dead.push(u.id);
    }
    // A tank that goes down with its LST leaves no hulk of its own.
    if (!e.wreck && leavesWreck(e.type) && e.type !== "core" && e.type !== "rig" && e.garrisonedIn == null) {
      toWreck(state, e);
      madeWreck = true;
      continue;
    }
    if (e.type === "pyro") maybeCookOff(state, e);
    if (isInfantryType(e.type)) leaveCorpse(state, e);
    if (e.air) {
      loseRiders(state, e);
      aircraftDown(state, e);
    }
    dead.push(e.id);
  }
  if (madeWreck) {
    for (const o of state.entities.values()) {
      if (o.kind === "unit" && !o.wreck && o.hp > 0) repathIfBlocked(state, o);
    }
  }
  const hqOwners = new Set<string>();
  for (const id of dead) {
    const e = state.entities.get(id);
    if (!e) continue;
    if (e.type === "core" || e.type === "rig") hqOwners.add(e.ownerId);
    if (e.garrisonedIn != null) detachGarrisoned(state, e);
    if (e.garrison.length) spillGarrison(state, e);
    destroyEntity(state, e);
  }
  for (const pid of hqOwners) eliminate(state, pid);
}

function reapLostHqs(state: MatchState): void {
  for (const p of [...state.players.values()]) {
    if (!p.alive) continue;
    const hq = state.entities.get(p.hqId);
    if (hq && hq.hp > 0 && hq.ownerId !== p.playerId && (hq.type === "core" || hq.type === "rig")) {
      eliminate(state, p.playerId);
    }
  }
}

function eliminate(state: MatchState, playerId: string): void {
  const p = state.players.get(playerId);
  if (!p || !p.alive) return;
  p.alive = false;
  p.structure = null;
  p.defence = null;
  p.line = null;
  p.placingType = null;
  state.pendingComms.push(`${p.name} Core down.`);
  for (const e of [...state.entities.values()]) {
    if (e.ownerId === playerId) destroyEntity(state, e);
  }
  state.projectiles = state.projectiles.filter((pr) => pr.ownerId !== playerId);
}

function checkWin(state: MatchState): void {
  if (state.ended || state.initialHumans < 2) return;
  const alive = [...state.players.values()].filter((p) => p.alive);
  if (alive.length === 0) {
    state.ended = true;
    return;
  }
  const ffa = alive.every((p) => p.team === 0) || [...state.players.values()].every((p) => p.team === 0);
  if (ffa) {
    if (alive.length === 1) {
      const w = alive[0]!;
      state.winner = { playerId: w.playerId, team: w.team };
      state.ended = true;
    }
    return;
  }
  const teams = new Set(alive.map((p) => p.team));
  if (teams.size === 1) {
    const w = alive[0]!;
    state.winner = { playerId: w.playerId, team: w.team };
    state.ended = true;
  }
}
