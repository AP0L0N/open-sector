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
  nukesOnDeath,
  NEUTRAL_OWNER,
  PLAYTEST_START_SCRAP,
  START_SCRAP,
  TICK_DT,
  HQ_OF,
  isHq,
  isHqBuilding,
  type Faction,
} from "../catalog.js";
import { featureAngle, featureLotSite, getMap, isMapBridge, isMapSection, isPlaytestMapId, type MapDef } from "../maps.js";
import { mapAirfieldAt, mapUnitHostAt } from "../custom-maps.js";
import { commanders } from "../lobby.js";
import { tickAi } from "./ai.js";
import { aiProfile } from "./ai-profile.js";
import type { ImpactView, RocketLaunchView, RoomState } from "../protocol.js";
import { buildingCenter, destroyEntity, initGrids, makeEntity, newAirState, tileCenter } from "./geo.js";
import { aircraftDown, airfieldPadWorld, beginAircraftCrash, isAirborne, orderAircraft, parkHeading, tickAir } from "./air.js";
import { ejectParatroopers, loseRiders, syncPlaneRiders, tickChutes, tickCrates, tickMines, tickPlaneBoarding } from "./airdrop.js";
import { tickDrones } from "./drone.js";
import { beginJetCrash, tickJets } from "./jet.js";
import { detonateNuke } from "./nuke.js";
import { tickThralls } from "./thrall.js";
import { tickWeavers } from "./weaver.js";
import { tickBrood } from "./brood.js";
import { tickAcid } from "./acid.js";
import { tickShades } from "./shade.js";
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
import { tickCollision, wasFlattened } from "./collision.js";
import { tickThermal } from "./thermal.js";
import { tickDeploy } from "./deploy.js";
import { tickSmelters } from "./smelter.js";
import { tickConstructs } from "./construct.js";
import { guardBridges, placeBrick, restampBridges, settleBridges, tickBridges } from "./bridge.js";
import { tickHeal } from "./heal.js";
import { tickForceFields, tickLasers } from "./laser.js";
import { tickSupply } from "./supply.js";
import { tickMineLaunchers } from "./minelauncher.js";
import { tickSimUnits } from "./simunit.js";
import { tickJuggernauts } from "./juggernaut.js";
import { holdShieldLines, shieldWatch, tickEnergyShields } from "./energy-shield.js";
import { tickLunges } from "./lunge.js";
import { tickBurrows } from "./burrow.js";
import { tickMatriarchs } from "./matriarch.js";
import { tickRegrowth } from "./regrowth.js";
import type { BlinkView } from "../protocol.js";
import { syncTowedGuns, tickArtillery } from "./artillery.js";
import { tickShipRearm } from "./battleship.js";
import { tickHiveAmmo } from "./hive-ammo.js";
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
import { holdSightKeys } from "./vision.js";

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
    energyShields: [],
    fires: [],
    mines: [],
    crates: [],
    impacts: [],
    launches: [],
    blinks: [],
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
    phaseRev: 0,
  };

  // Who sits on which start: a map object owned by a start is that commander's, and is left out when nobody sits there.
  const seated = new Map<number, string>();
  for (const slot of commanders(room)) {
    const pos = spawns.get(slot.playerId!);
    if (pos) seated.set(pos.spawnId, slot.playerId!);
  }
  const ownerOf = (o: { owner?: number }): string | null => (o.owner == null ? NEUTRAL_OWNER : (seated.get(o.owner) ?? null));

  // Houses and map defences stand neutral unless the map gave them to a start. A defence changes hands when someone takes it.
  const sections: Entity[] = [];
  /** The building each map feature raised, by feature index, for the troops a map puts inside. */
  const raised = new Map<number, Entity>();
  /** A ready-built Core by the start it belongs to: that commander begins with it instead of a Rig. */
  const coreOf = new Map<number, Entity>();
  let bricks = 0;
  (map.features ?? []).forEach((f, fi) => {
    const facing = featureAngle({ ...f, facing: f.facing ?? 0 });
    const owner = ownerOf(f);
    if (owner === null && !isMapBridge(f.type) && !isMapSection(f.type)) return;
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
    const b = makeEntity(state, f.type, owner!, c.x, c.y, {
      tileX: site.tx,
      tileY: site.ty,
      tileW: site.w,
      tileH: site.h,
      facing,
    });
    if (isHqBuilding(f.type) && f.owner != null) coreOf.set(f.owner, b);
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

  for (const slot of commanders(room)) {
    const pid = slot.playerId!;
    const pos = spawns.get(pid);
    if (!pos) continue;
    // A start the map built a Core on begins from that Core, grown as its seat's own; the rest unpack a Rig or a Seed.
    const faction: Faction = slot.faction ?? "alliance";
    const core = coreOf.get(pos.spawnId);
    let hqId: number;
    if (core) {
      core.type = HQ_OF[faction].core;
      hqId = core.id;
    } else {
      const x = tileCenter(pos.x, map.tileSize);
      const y = tileCenter(pos.y, map.tileSize);
      const rig = makeEntity(state, HQ_OF[faction].rig, pid, x, y);
      const towardX = map.width / 2 - pos.x;
      const towardY = map.height / 2 - pos.y;
      rig.facing = Math.atan2(towardY, towardX);
      rig.turretFacing = rig.facing;
      hqId = rig.id;
    }
    players.set(pid, {
      playerId: pid,
      name: slot.name ?? "Commander",
      colorId: slot.colorId,
      team: slot.team,
      faction,
      alive: true,
      scrap: isPlaytestMapId(room.mapId) ? PLAYTEST_START_SCRAP : START_SCRAP,
      scrapCarry: 0,
      structure: null,
      defence: null,
      line: null,
      placingType: null,
      hqId,
      ai: slot.ai,
      aiNextAttackTick: slot.ai ? aiProfile(slot.ai).attackFirstTicks : 0,
    });
  }

  standMapUnits(state, map, raised, ownerOf);
  // A map's gun is crewed like one the player raises: its side's riflemen in every place the map left empty.
  for (const b of raised.values()) manGun(state, b, b.ownerId);

  return state;
}

/**
 * The map's troops. A neutral one is grey and no one's: it shoots at anyone its own eyes
 * find and holds its post, standing guard on its heading, walking its patrol route, or
 * sitting inside the house or bunker it was put in. An owned one is the seated commander's
 * from the first tick and stands idle until told otherwise, unless the map gave it a guard
 * point or a patrol. A plane sits on its Airfield's hardstand.
 */
function standMapUnits(
  state: MatchState,
  map: MapDef,
  raised: ReadonlyMap<number, Entity>,
  ownerOf: (o: { owner?: number }) => string | null,
): void {
  const ts = map.tileSize;
  const features = map.features ?? [];
  for (const mu of map.units ?? []) {
    const owner = ownerOf(mu);
    if (owner === null) continue;
    const facing = (mu.facing * Math.PI) / 180;
    const x = tileCenter(mu.x, ts);
    const y = tileCenter(mu.y, ts);
    const loop = mu.loop === true;
    const patrol = mu.patrol?.length ? mu.patrol.map((p) => ({ x: tileCenter(p.x, ts), y: tileCenter(p.y, ts) })) : null;
    const guard = mu.guard ? { x: tileCenter(mu.guard.x, ts), y: tileCenter(mu.guard.y, ts) } : null;
    if (isAircraftType(mu.type)) {
      const field = raised.get(mapAirfieldAt(features, mu.x, mu.y));
      if (!field || field.ownerId !== owner) continue;
      const pad = mu.pad ?? 0;
      const at = airfieldPadWorld(field, pad, ts);
      const plane = makeEntity(state, mu.type, owner, at.x, at.y, { facing: parkHeading(field, ts) });
      plane.air = newAirState(field.id, pad, mu.type);
      if (patrol) {
        const route = buildPatrolRoute(state, plane, patrol, 0, 0, loop);
        orderAircraft(state, plane, { kind: "patrol", route, leg: loop ? 0 : 1, dir: 1, ...(loop ? { loop: true } : {}) });
      } else if (guard) {
        orderAircraft(state, plane, { kind: "guard", x: guard.x, y: guard.y, facing });
      }
      continue;
    }
    if (mu.inside) {
      const house = raised.get(mapUnitHostAt(features, mu.x, mu.y));
      if (!house || house.ownerId !== owner) continue;
      const e = makeEntity(state, mu.type, owner, house.x, house.y, { facing });
      if (!enterGarrison(state, e, house)) destroyEntity(state, e);
      continue;
    }
    const e = makeEntity(state, mu.type, owner, x, y, { facing });
    // A Battle Ship's searchlight starts where the map pointed it, and turns with the hull from there.
    if (mu.spot != null && hasSpotlight(mu.type)) {
      e.spotFacing = (mu.spot * Math.PI) / 180;
      e.spotHull = facing;
    }
    if (patrol) {
      const route = buildPatrolRoute(state, e, patrol, 0, 0, loop);
      const leg = loop ? 0 : 1;
      e.order = { kind: "patrol", route, leg, dir: 1, ...(loop ? { loop: true } : {}) };
      e.state = "move";
      const dest = route[leg]!;
      setPath(state, e, dest.x, dest.y);
      continue;
    }
    if (guard) {
      // As Guard (G) orders it in a match: walk there, then hold that heading.
      e.holdPosition = true;
      e.guardFacing = facing;
      e.order = { kind: "guard", x: guard.x, y: guard.y, facing };
      e.state = "move";
      setPath(state, e, guard.x, guard.y);
      continue;
    }
    if (owner !== NEUTRAL_OWNER) continue;
    // Neutral and never chasing: a target out of reach is left to come closer.
    e.holdPosition = true;
    e.guardFacing = facing;
    e.order = { kind: "guard", x, y, facing };
  }
}

export function step(state: MatchState, dt = TICK_DT): void {
  if (state.ended) return;
  holdSightKeys(true);
  try {
    stepHeld(state, dt);
  } finally {
    holdSightKeys(false);
  }
}

function stepHeld(state: MatchState, dt: number): void {
  state.tick += 1;
  state.phaseRev++;
  state.impacts = [];
  state.blinks = [];
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
  tickRegrowth(state, dt);
  tickForceFields(state, dt);
  tickGarrisonCare(state, dt);
  tickSupply(state, dt);
  tickShipRearm(state, dt);
  tickHiveAmmo(state);
  tickArtillery(state, dt);
  tickPlaneBoarding(state);
  tickMineLaunchers(state, dt);
  tickSimUnits(state);
  tickJuggernauts(state);
  tickThralls(state);
  tickWeavers(state);
  tickBrood(state);
  tickAcid(state);
  tickLunges(state);
  tickBurrows(state);
  tickMatriarchs(state, dt);
  tickOrderQueue(state);
  tickPatrol(state);
  groundLstBows(state);
  const shieldLines = shieldWatch(state);
  tickMovement(state, dt);
  state.phaseRev++;
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
  state.phaseRev++;
  tickCollision(state, dt);
  // No enemy walks through a hive energy wall, whatever moved him this tick.
  holdShieldLines(state, shieldLines);
  syncTowedGuns(state);
  tickThermal(state);
  state.phaseRev++;
  tickMines(state, dt);
  tickCrates(state, dt);
  tickField(state, dt);
  tickConstructs(state, dt);
  tickBridges(state, dt);
  tickSmelters(state, dt);
  tickBuild(state, dt);
  tickTrain(state, dt);
  state.phaseRev++;
  tickEnergyShields(state, dt);
  tickShades(state);
  tickCombat(state, dt);
  tickLasers(state);
  state.phaseRev++;
  tickProjectiles(state, dt);
  syncTorpedoes(state);
  tickFires(state, dt);
  tickCapture(state, dt);
  settleBridges(state, bridgeHp);
  reapDead(state);
  reapLostHqs(state);
  checkWin(state);
  state.phaseRev++;
}

/** One wall-clock tick: `gameSpeed` sim steps (max 8×). A paused skirmish stays put. */
export function stepMatch(state: MatchState, dt = TICK_DT): void {
  if (state.paused) return;
  const n = clampGameSpeed(state.gameSpeed);
  const impacts: ImpactView[] = [];
  const launches: RocketLaunchView[] = [];
  const blinks: BlinkView[] = [];
  holdSightKeys(true);
  try {
    for (let i = 0; i < n; i++) {
      step(state, dt);
      impacts.push(...state.impacts);
      launches.push(...state.launches);
      blinks.push(...state.blinks);
      if (state.ended) break;
    }
    state.impacts = impacts;
    state.launches = launches;
    state.blinks = blinks;
    state.phaseRev++;
    tickAi(state);
  } finally {
    holdSightKeys(false);
  }
}

/** Whether the route from where `e` stands through its waypoints passes within reach of any hulk made this tick. */
function routeMeetsWreck(e: Entity, wrecks: readonly Entity[], tileSize: number): boolean {
  let ax = e.x;
  let ay = e.y;
  for (const w of e.waypoints) {
    const bx = w.x;
    const by = w.y;
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    for (const h of wrecks) {
      const reach = h.radius + e.radius + 2 * tileSize;
      let t = len2 > 0 ? ((h.x - ax) * dx + (h.y - ay) * dy) / len2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = ax + dx * t - h.x;
      const py = ay + dy * t - h.y;
      if (px * px + py * py <= reach * reach) return true;
    }
    ax = bx;
    ay = by;
  }
  return false;
}

function reapDead(state: MatchState): void {
  const dead: number[] = [];
  /** Hulks made this tick: only the units whose route runs by one re-plan. */
  const wrecks: Entity[] = [];
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
    // A Titan shot down in the air falls first; it goes up when it hits the ground.
    if (e.jet?.crash && e.jet.alt > 0) {
      e.hp = 1;
      continue;
    }
    if (!e.wreck && beginJetCrash(e)) continue;
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
    // The Titan's reactor: a small nuclear blast where it lies, and nothing left of the walker.
    if (!e.wreck && nukesOnDeath(e.type) && e.garrisonedIn == null) {
      detonateNuke(state, e);
      dead.push(e.id);
      continue;
    }
    // A tank that goes down with its LST, or flat under an Apocalypse, leaves no hulk of its own.
    if (!e.wreck && leavesWreck(e.type) && !isHq(e.type) && e.garrisonedIn == null && !wasFlattened(e)) {
      toWreck(state, e);
      wrecks.push(e);
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
  if (wrecks.length > 0) {
    for (const o of state.entities.values()) {
      if (o.kind !== "unit" || o.wreck || o.hp <= 0 || o.waypoints.length === 0) continue;
      if (routeMeetsWreck(o, wrecks, state.tileSize)) repathIfBlocked(state, o);
    }
  }
  const hqOwners = new Set<string>();
  for (const id of dead) {
    const e = state.entities.get(id);
    if (!e) continue;
    if (isHq(e.type)) hqOwners.add(e.ownerId);
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
    if (hq && hq.hp > 0 && hq.ownerId !== p.playerId && isHq(hq.type)) {
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
  if (state.energyShields) state.energyShields = state.energyShields.filter((s) => s.ownerId !== playerId);
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
