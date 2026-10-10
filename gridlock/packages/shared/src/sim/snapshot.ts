import {
  canLunge,
  factionOf,
  isAirfieldType,
  bridgeBuildSeconds,
  isBridge,
  airFuelOf,
  ARTILLERY_CREW,
  ARTILLERY_CREW_HP,
  ARTILLERY_SETUP_SECONDS,
  BV222_TROOPS,
  TRUCK_SEATS,
  DRONE_BATTERY_SECONDS,
  DRONE_LAUNCH_MIN_SECONDS,
  JET_FUEL_SECONDS,
  JET_TAKEOFF_MIN_SECONDS,
  jetFlightOf,
  AIRFIELD_PADS,
  beltOf,
  catalog,
  engineerBuildSeconds,
  isConcreteLine,
  clampGameSpeed,
  deploySecondsOf,
  entityIsScouting,
  garrisonCapOf,
  isCivilianType,
  NEUTRAL_OWNER,
  CYBORG_TAKEOVER_SECONDS,
  secondsToTicks,
  hasMg,
  gatlingHeatOf,
  roofCiwsOf,
  hasScout,
  hasTurret,
  isGarrisonable,
  tankDeckOf,
  isInfantryType,
  isSupplyCarrier,
  isTransportType,
  MG42_BIPOD_SECONDS,
  MORTAR_PLANT_SECONDS,
  SUB_DIVE_SECONDS,
  neverSurfacesOf,
  submergesOf,
  walkerGunsOf,
  forceFieldMax,
  hasForceField,
  TICK_DT,
} from "../catalog.js";
import { padsTaken } from "./air.js";
import { bridgeOrderSpan } from "./bridge.js";
import { artilleryCanLay, gunCrewOf } from "./artillery.js";
import { crateViews, mineViews, payloadOf, planeRiders } from "./airdrop.js";
import { cyborgShielded } from "./crits.js";
import { plasmaCharge } from "./hive-ammo.js";
import { laserProgress } from "./laser.js";
import { garrisonBars, garrisonOwner } from "./garrison.js";
import { deckLoad } from "./lst.js";
import { allies, unitInWater } from "./geo.js";
import { energyRound } from "./remains.js";
import { brokenClutter } from "./clutter.js";
import { diving, hiddenSubmarine, sonarSpotted, submerged } from "./naval.js";
import { medicTendView } from "./heal.js";
import { supplyHasDriver, supplyRiders } from "./supply.js";
import { powerOf } from "./power.js";
import { radarContacts, radarOnline } from "./radar.js";
import { cyborgShutdownIn } from "./cyborg-link.js";
import { blinkCharge, purgeProgress } from "./simunit.js";
import { lungeAlt, lungeCharge } from "./lunge.js";
import { hiddenBurrowed } from "./burrow.js";
import { hiddenCloaked } from "./shade.js";
import { isSimUnit, onUplink, vaultsWalls } from "../catalog.js";
import { onFortTop } from "./thrall.js";
import { aswDeckView, sonarContacts } from "./destroyer.js";
import { scrapCap } from "./smelter.js";
import { thermalContacts } from "./thermal.js";
import { canSeeWorld, encodeVisionRuns, entityOnMask, maskRevOf, visionMask } from "./vision.js";
import { spotFacingOf, spotlightManned } from "./night.js";
import type { Entity, LaserBeam, MatchState, Order, QueueableCommand, StructureJob } from "./types.js";
import type {
  CorpseView,
  EnergyShieldView,
  EntityView,
  MatchSnapshot,
  PlanKind,
  PlanPointView,
  ScrapCell,
  StructureQueueView,
} from "../protocol.js";

/** Sunk tiles as flat (index, height) pairs for the wire. */
function dugCells(state: MatchState): number[] {
  const out: number[] = [];
  for (const [i, h] of state.dug) out.push(i, h);
  return out;
}

function plantRemaining(e: Entity, friendly: boolean): number | undefined {
  if (!friendly) return undefined;
  const limit =
    e.type === "gunner"
      ? MG42_BIPOD_SECONDS
      : e.type === "mortarman"
        ? MORTAR_PLANT_SECONDS
        : e.type === "artillery" && artilleryCanLay(e)
          ? ARTILLERY_SETUP_SECONDS
          : 0;
  if (limit <= 0 || e.bipod >= limit) return undefined;
  return Math.max(0, limit - e.bipod);
}

/** Snapshots follow a batch of `gameSpeed` ticks, so any volley inside that batch counts. */
function gatlingView(state: MatchState, e: Entity): EntityView["gatling"] {
  const f = e.gatlingFire;
  if (!f || e.wreck || state.tick - f.tick >= Math.max(1, clampGameSpeed(state.gameSpeed))) return undefined;
  return f.offAim != null ? { arms: f.arms, off: f.offAim } : { arms: f.arms };
}

/** Roof mount facing, and whether it fired inside the last batch of ticks (same window as gatlingView). */
function ciwsView(state: MatchState, e: Entity): EntityView["ciws"] {
  if (!roofCiwsOf(e.type)) return undefined;
  const at = e.ciwsFireTick;
  const fire = !e.wreck && at != null && state.tick - at < Math.max(1, clampGameSpeed(state.gameSpeed));
  return fire ? { facing: e.ciwsFacing ?? e.turretFacing, fire: true } : { facing: e.ciwsFacing ?? e.turretFacing };
}

/** Feuerwirbel mounts: facings and fire like ciwsView; heat only for the owner's side. */
function twinCiwsView(state: MatchState, e: Entity, friendly: boolean): EntityView["mounts"] {
  if (!e.twinCiws) return undefined;
  const window = Math.max(1, clampGameSpeed(state.gameSpeed));
  return e.twinCiws.map((m) => ({
    facing: m.facing,
    ...(!e.wreck && m.fireTick != null && state.tick - m.fireTick < window ? { fire: true as const } : {}),
    ...(friendly ? { heat: m.heat } : {}),
    ...(friendly && m.overheat > 0 ? { hot: true as const } : {}),
  }));
}

/** Battle Ship turrets and CIWS mounts. Shells and belts only for the ship's own side. */
function shipView(state: MatchState, e: Entity, friendly: boolean): EntityView["ship"] {
  const ship = e.ship;
  if (!ship) return undefined;
  const window = Math.max(1, clampGameSpeed(state.gameSpeed));
  return {
    turrets: ship.turrets.map((t) =>
      friendly ? { facing: t.facing, ammo: t.barrels.map((b) => b.ammo) } : { facing: t.facing },
    ),
    ciws: ship.ciws.map((m) => {
      const fire = !e.wreck && m.fireTick != null && state.tick - m.fireTick < window;
      return {
        facing: m.facing,
        ...(fire ? { fire: true as const } : {}),
        ...(friendly ? { ammo: m.ammo } : {}),
      };
    }),
  };
}

function scoutView(e: Entity, friendly: boolean): EntityView["scout"] {
  if (!hasScout(e.type) || e.scoutHpMax <= 0) return undefined;
  const out = entityIsScouting(e);
  if (!friendly && !out) return undefined;
  return {
    hp: e.scoutHp,
    hpMax: e.scoutHpMax,
    out: out ? true : undefined,
  };
}

function fieldSitesView(e: Entity, friendly: boolean): EntityView["fieldSites"] {
  const o = e.order;
  if (o?.kind !== "build" || o.structure == null || o.x == null || o.y == null) return undefined;
  const digging = e.state === "build" && e.work > 0;
  if (!friendly && !digging) return undefined;
  const structure = o.structure;
  const queued = e.fieldQueue ?? [];
  const line = isConcreteLine(structure);
  const count = line ? 1 + queued.length : 1;
  const progress = digging ? Math.min(1, e.work / (catalog(structure).buildSeconds * count)) : undefined;
  const sites: NonNullable<EntityView["fieldSites"]> = [
    {
      structure,
      x: o.x,
      y: o.y,
      facing: o.facing ?? 0,
      progress,
    },
  ];
  // A concrete line is one job: once he is building, everyone sees every piece.
  if (friendly || (line && digging)) {
    for (const p of queued) {
      sites.push({ structure, x: p.x, y: p.y, facing: p.facing, progress: line ? progress : undefined });
    }
  }
  return sites;
}

/** The base building a friendly engineer is set to raise. Enemies never get it. */
function buildSiteView(e: Entity, friendly: boolean): EntityView["buildSite"] {
  const o = e.order;
  if (!friendly || o?.kind !== "build" || o.building == null || o.tileX == null || o.tileY == null) return undefined;
  const working = e.state === "build" && e.work > 0;
  const progress = working ? Math.min(1, e.work / engineerBuildSeconds(o.building)) : undefined;
  return { building: o.building, tileX: o.tileX, tileY: o.tileY, progress };
}

function bridgeSiteView(e: Entity, friendly: boolean): EntityView["bridgeSite"] {
  if (!friendly) return undefined;
  const job = bridgeOrderSpan(e);
  if (!job) return undefined;
  const total = bridgeBuildSeconds(job.type, job.span.length);
  const working = e.state === "build" && e.work > 0;
  const progress = working ? Math.min(1, e.work / Math.max(1e-6, total)) : undefined;
  const { x, y, facing, length } = job.span;
  const queue = e.fieldQueue?.length ? e.fieldQueue.map((q) => ({ x: q.x, y: q.y, facing: q.facing })) : undefined;
  return { bridge: job.type, x, y, facing, span: length, progress, deck: job.deck, queue };
}

function structureQueueView(job: StructureJob | null | undefined): StructureQueueView | null {
  if (!job) return null;
  return {
    type: job.type,
    progressTicks: job.progressTicks,
    totalTicks: job.totalTicks,
    ready: job.ready,
    paused: job.paused,
    ...(job.sites?.length ? { sites: job.sites.map((s) => ({ x: s.x, y: s.y, facing: s.facing })) } : {}),
  };
}

function entityAt(state: MatchState, id: number | undefined): PlanPointView | null {
  const t = id != null ? state.entities.get(id) : undefined;
  return t && t.hp > 0 ? { kind: "other", x: t.x, y: t.y } : null;
}

function minePoint(state: MatchState, id: number | undefined): PlanPointView | null {
  if (id == null) return null;
  const m = state.mines.find((mine) => mine.id === id);
  return m ? { kind: "other", x: m.x, y: m.y } : null;
}

function planKind(k: Order["kind"] | QueueableCommand["type"]): PlanKind {
  const s = k.startsWith("cmd.") ? k.slice(4) : k;
  if (s === "move") return "move";
  if (s === "attack" || s === "attackmove" || s === "forceattack") return "attack";
  return "other";
}

function queuedPoint(state: MatchState, m: QueueableCommand): PlanPointView | null {
  const kind = planKind(m.type);
  let at: PlanPointView | null;
  switch (m.type) {
    case "cmd.attack":
    case "cmd.repair":
    case "cmd.supply":
    case "cmd.purge":
      at = entityAt(state, m.targetId);
      break;
    case "cmd.disable":
      at = minePoint(state, m.mineId);
      break;
    case "cmd.forceattack":
      at = entityAt(state, m.targetId) ?? { kind, x: m.x, y: m.y };
      break;
    case "cmd.guard":
      at = m.targetId != null ? entityAt(state, m.targetId) : m.x != null && m.y != null ? { kind, x: m.x, y: m.y } : null;
      break;
    case "cmd.garrison":
      at = entityAt(state, m.buildingId);
      break;
    case "cmd.board":
      at = entityAt(state, m.truckId);
      break;
    default:
      at = { kind, x: m.x, y: m.y };
  }
  return at ? { ...at, kind } : null;
}

/** Current order's point, then each queued order's point. Own units with a queue only. */
function planView(state: MatchState, e: Entity, own: boolean): PlanPointView[] | undefined {
  if (!own || !e.orderQueue?.length) return undefined;
  const out: PlanPointView[] = [];
  const o = e.order;
  if (o && !o.auto) {
    const at =
      entityAt(state, o.targetId) ??
      (o.kind === "disable" ? minePoint(state, o.targetId) : null) ??
      (o.x != null && o.y != null ? { kind: "other" as const, x: o.x, y: o.y } : null);
    if (at) out.push({ ...at, kind: planKind(o.kind) });
  }
  for (const q of e.orderQueue) {
    const at = queuedPoint(state, q.msg);
    if (at) out.push(at);
  }
  return out.length > 0 ? out : undefined;
}

/** A map house out of sight. Its shape is scenery; who holds it stays hidden. */
function sceneryView(e: Entity): EntityView {
  return {
    id: e.id,
    kind: e.kind,
    type: e.type,
    ownerId: NEUTRAL_OWNER,
    x: e.x,
    y: e.y,
    facing: e.facing,
    hp: e.hp,
    hpMax: e.hpMax,
    state: e.state,
    tileW: e.tileW,
    tileH: e.tileH,
    tileX: e.tileX,
    tileY: e.tileY,
    ruined: e.ruined || undefined,
    span: isBridge(e.type) ? e.span : undefined,
    deck: isBridge(e.type) ? e.deckLevel : undefined,
    garrison: isGarrisonable(e.type) ? { count: 0, cap: garrisonCapOf(e.type) } : undefined,
  };
}

export interface SnapshotOptions {
  /** Include the scrap fields. Off for a tick snapshot whose receiver already holds the current `scrapRev`. */
  scrap?: boolean;
  /** Include the scenery list. Off for a tick snapshot whose receiver already holds the current `sceneryRev`. */
  scenery?: boolean;
}

/** A house or untaken map defence: ground the fog does not hide. */
function isScenery(e: Entity): boolean {
  return e.kind === "building" && (isCivilianType(e.type) || e.ownerId === NEUTRAL_OWNER);
}

/**
 * Bump `sceneryRev` when the scenery list changed since it was last read
 * this match, and return it. Cheap enough to ask once a tick per snapshot.
 */
export function refreshSceneryRev(state: MatchState): number {
  if (state.sceneryKeyTick === state.tick) return state.sceneryRev;
  let h = 2166136261;
  for (const e of state.entities.values()) {
    if (e.hp <= 0 || !isScenery(e)) continue;
    h = Math.imul(h ^ e.id, 16777619);
    h = Math.imul(h ^ Math.round(e.hp), 16777619);
    h = Math.imul(h ^ (e.ruined ? 1 : 0), 16777619);
    h = Math.imul(h ^ e.tileX, 16777619);
    h = Math.imul(h ^ e.tileY, 16777619);
  }
  if (h !== state.sceneryKey || state.sceneryKeyTick < 0) {
    state.sceneryKey = h;
    state.sceneryRev++;
  }
  state.sceneryKeyTick = state.tick;
  return state.sceneryRev;
}

/**
 * The client's view of a snapshot: the scenery list it holds (this
 * snapshot's, else the last one's) folded back into `entities`, so every
 * house and map defence is there as before. The ones in sight came in full.
 */
export function foldScenery(next: MatchSnapshot, prev: MatchSnapshot | null = null): MatchSnapshot {
  const scenery = next.scenery ?? prev?.scenery ?? [];
  if (scenery.length === 0) return next;
  const seen = new Set(next.entities.map((e) => e.id));
  const entities = next.entities.concat(scenery.filter((s) => !seen.has(s.id)));
  return { ...next, scenery, entities };
}

/** Every house and untaken map defence standing, in sight or not. */
function sceneryList(state: MatchState): EntityView[] {
  const out: EntityView[] = [];
  for (const e of state.entities.values()) {
    if (e.hp > 0 && isScenery(e)) out.push(sceneryView(e));
  }
  return out;
}

/**
 * A world coordinate for the wire, to a tenth of a pixel. The sim keeps the full double; the client
 * draws on a pixel grid and blends two snapshots 100 ms apart, so the extra fifteen digits were only
 * bytes to stringify, send and parse, for every unit, every tick, every client.
 */
function wire(v: number): number {
  return Math.round(v * 10) / 10;
}

/** A heading for the wire, to a thousandth of a radian: finer than the finest sheet's sixteen faces. */
function wireAngle(a: number): number {
  return Math.round(a * 1000) / 1000;
}

export function snapshotFor(state: MatchState, youPlayerId: string, opts: SnapshotOptions = {}): MatchSnapshot {
  const you = state.players.get(youPlayerId);
  const power = you ? powerOf(state, youPlayerId) : { provided: 0, used: 0, lowPower: false };
  const vis = you ? visionMask(state, youPlayerId) : new Uint8Array(state.width * state.height);
  const entities: EntityView[] = [];
  for (const e of state.entities.values()) {
    if (e.hp <= 0) continue;
    const friendly = allies(state, youPlayerId, e.ownerId);
    if (e.garrisonedIn && !friendly) continue;
    // A submerged boat shows only to an enemy whose Destroyer sonar hears it, fog or not.
    if (!friendly && hiddenSubmarine(state, youPlayerId, e)) continue;
    // A Stalker down under the ground shows to no enemy.
    if (hiddenBurrowed(state, youPlayerId, e)) continue;
    // A Shade with its skin settled shows to no enemy.
    if (hiddenCloaked(state, youPlayerId, e)) continue;
    // Houses and untaken map defences out of sight are part of the ground: the client draws them from the scenery list.
    if (!friendly && !sonarSpotted(state, youPlayerId, e) && !entityOnMask(e, vis, state.width, state.height, state.tileSize)) continue;
    const job = e.queue[0];
    const transport = isTransportType(e.type);
    const supplyBed = e.type === "supply" && !e.wreck;
    const occBars = isGarrisonable(e.type) || transport || supplyBed ? garrisonBars(state, e) : [];
    entities.push({
      id: e.id,
      kind: e.kind,
      type: e.type,
      // Powered down, he reads to the other side as no one's machine.
      ownerId: e.dormant && !friendly ? NEUTRAL_OWNER : e.ownerId,
      x: wire(e.x),
      y: wire(e.y),
      facing: wireAngle(e.facing),
      turretFacing: hasTurret(e.type) ? wireAngle(e.turretFacing) : undefined,
      hp: e.hp,
      hpMax: e.hpMax,
      state: e.state,
      tileW: e.tileW,
      tileH: e.tileH,
      tileX: e.tileX,
      tileY: e.tileY,
      trainProgress: job ? job.progressTicks / job.totalTicks : undefined,
      trainQueue:
        friendly && e.queue.length > 0
          ? e.queue.map((j) => ({
              id: j.id,
              type: j.type,
              progress: j.progressTicks / j.totalTicks,
              paused: j.paused,
            }))
          : undefined,
      rally: e.rally && e.ownerId === youPlayerId ? { x: e.rally.x, y: e.rally.y } : undefined,
      cart: e.type === "hauler" ? e.cartHp : undefined,
      smokeCharges: friendly && e.type === "hauler" && !e.wreck ? e.smokeCharges : undefined,
      deployProgress:
        e.state === "deploy" || e.state === "undeploy"
          ? Math.min(1, e.deployTime / deploySecondsOf(e.type))
          : undefined,
      specialCooldown: e.specialCooldown > 0 ? e.specialCooldown : undefined,
      wreck: e.wreck || undefined,
      shielded: e.hp > 0 && cyborgShielded(e, state.tick) ? true : undefined,
      field: e.hp > 0 && hasForceField(e.type) ? { hp: Math.round(e.field ?? 0), max: forceFieldMax(e) } : undefined,
      shutdown: e.shutdown,
      dormant: e.dormant,
      blink: friendly && isSimUnit(e.type) && !e.wreck ? { u: blinkCharge(state, e) } : undefined,
      lungeAlt: e.lunge ? Math.round(lungeAlt(state, e) * 10) / 10 : undefined,
      lungeCharge: friendly && canLunge(e.type) && !e.wreck ? Math.round(lungeCharge(state, e) * 100) / 100 : undefined,
      greenLaser: e.laser && factionOf(e.type) === "xeno" && e.type !== "cyborgcommander" ? true : undefined,
      burrow: e.burrow ? e.burrow.phase : undefined,
      sprint: e.sprint,
      cloaked: friendly ? e.cloaked : undefined,
      fists: e.fists,
      purge: friendly && e.purge ? { hostId: e.purge.hostId, u: purgeProgress(state, e) ?? 0 } : undefined,
      takeover: e.takeover ? { by: e.takeover.by, u: Math.min(1, e.takeover.ticks / secondsToTicks(CYBORG_TAKEOVER_SECONDS)) } : undefined,
      laser: e.laser ? laserView(e.laser, state.tick) : undefined,
      crits: e.crits.length > 0 ? [...e.crits] : undefined,
      stance: isInfantryType(e.type) ? e.stance : undefined,
      stanceOrder: isInfantryType(e.type) && e.stanceOrder !== e.stance ? e.stanceOrder : undefined,
      swimming: isInfantryType(e.type) && unitInWater(state, e) ? true : undefined,
      wading: !isInfantryType(e.type) && unitInWater(state, e) ? true : undefined,
      // A Lurker shows surfaced only while a bite still gives it away.
      submerged: friendly && (neverSurfacesOf(e.type) ? submerged(state, e) : diving(e)) ? true : undefined,
      dive:
        friendly && submergesOf(e.type) && !neverSurfacesOf(e.type) && !e.wreck
          ? { air: e.dive?.air ?? SUB_DIVE_SECONDS, airMax: SUB_DIVE_SECONDS, winded: e.dive?.winded || undefined }
          : undefined,
      braced: e.braced || undefined,
      anchor: friendly && e.type === "seed" && e.anchor ? { x: e.anchor.x, y: e.anchor.y } : undefined,
      rocketReload: friendly && (e.rocketCooldown ?? 0) > 0 ? e.rocketCooldown : undefined,
      rockets: friendly && e.rockets != null ? e.rockets : undefined,
      heavy: friendly && e.type === "rocketer" ? (e.heavy ?? 0) : undefined,
      minePacks: friendly && e.minePacks != null ? e.minePacks : undefined,
      mineReload: friendly && (e.mineReload ?? 0) > 0 ? Math.round((e.mineReload ?? 0) * 10) / 10 : undefined,
      rocketsOff: friendly && e.rocketsOff ? true : undefined,
      airMode: friendly && e.airMode ? true : undefined,
      longRange: friendly && e.longRange ? true : undefined,
      spotFacing: spotlightManned(e) ? spotFacingOf(e) : undefined,
      unpowered: e.kind === "building" && e.unpowered ? true : undefined,
      holdPosition: friendly && e.holdPosition ? true : undefined,
      patrol:
        friendly && e.order?.kind === "patrol" && e.order.route
          ? e.order.route.map((p) => ({ x: p.x, y: p.y }))
          : undefined,
      patrolLoop: friendly && e.order?.kind === "patrol" && e.order.loop ? true : undefined,
      guardFacing: friendly && e.guardFacing != null ? e.guardFacing : undefined,
      guardTargetId:
        friendly && e.order?.kind === "guard" && e.order.targetId != null ? e.order.targetId : undefined,
      tend: medicTendView(state, e),
      ruined: e.ruined || undefined,
      span: isBridge(e.type) ? e.span : undefined,
      deck: isBridge(e.type) ? e.deckLevel : undefined,
      gate: e.gate ? { locked: e.gate.locked, open: Math.round(e.gate.open * 100) / 100 } : undefined,
      wallCrest: isConcreteLine(e.type) && e.wallCrest != null ? e.wallCrest : undefined,
      fieldSites: e.type === "engineer" ? fieldSitesView(e, friendly) : undefined,
      buildSite: e.type === "engineer" ? buildSiteView(e, friendly) : undefined,
      bridgeSite: e.type === "engineer" ? bridgeSiteView(e, friendly) : undefined,
      scout: scoutView(e, friendly),
      supply: friendly && isSupplyCarrier(e.type) && !e.wreck ? e.supply : undefined,
      gun:
        e.type === "artillery" && !e.wreck
          ? {
              crew: gunCrewOf(e),
              cap: ARTILLERY_CREW,
              bars: friendly ? (e.gunCrew ?? []).map((hp) => ({ hp, hpMax: ARTILLERY_CREW_HP })) : undefined,
              towedBy: e.towedBy,
            }
          : undefined,
      towing: e.type === "supply" && e.towing != null ? e.towing : undefined,
      bed:
        e.type === "supply" && !e.wreck
          ? {
              crew: e.crew ? true : undefined,
              seats: supplyRiders(state, e).length,
              open: supplyHasDriver(state, e) ? undefined : true,
              riders: friendly ? supplyRiders(state, e).map((r) => r.id) : undefined,
            }
          : undefined,
      ammo: friendly && Object.keys(e.ammo).length > 0 ? { ...e.ammo } : undefined,
      energy: friendly ? plasmaCharge(e) : undefined,
      shell: friendly && e.shell ? e.shell : undefined,
      mgAmmo: friendly && hasMg(e.type) ? e.mgAmmo : undefined,
      mgHeat: friendly && (hasMg(e.type) || !!gatlingHeatOf(e.type)) ? e.mgHeat : undefined,
      mgOverheat: friendly && (hasMg(e.type) || !!gatlingHeatOf(e.type)) && e.mgOverheat > 0 ? e.mgOverheat : undefined,
      weapon: friendly && isInfantryType(e.type) ? (e.weapon ?? undefined) : undefined,
      clip: friendly && (isInfantryType(e.type) || beltOf(e.type)) ? e.clip : undefined,
      guns: friendly && e.type === "walker" ? walkerGunsOf(e) : undefined,
      fieldDivert: friendly && e.hp > 0 ? e.fieldDivert : undefined,
      engageContacts: friendly && e.hp > 0 ? e.engageContacts : undefined,
      selfDestruct: friendly && e.type === "walker" && !e.wreck ? !e.selfDestructOff : undefined,
      charging: e.type === "walker" && e.charging ? true : undefined,
      stagger: e.staggered,
      vault: vaultsWalls(e.type) && !e.wreck && e.garrisonedIn == null && onFortTop(state, e) ? true : undefined,
      gatling: gatlingView(state, e),
      ciws: ciwsView(state, e),
      mounts: twinCiwsView(state, e, friendly),
      ship: shipView(state, e, friendly),
      reload: friendly && (isInfantryType(e.type) || beltOf(e.type)) && e.reload > 0 ? e.reload : undefined,
      bipod: plantRemaining(e, friendly),
      garrisonedIn: friendly && e.garrisonedIn ? e.garrisonedIn : undefined,
      mountedGun: friendly && e.mountedGun != null ? e.mountedGun : undefined,
      plan: planView(state, e, e.ownerId === youPlayerId),
      garrison: isGarrisonable(e.type)
        ? (() => {
            const occOwner = garrisonOwner(state, e);
            const occFriendly = allies(state, youPlayerId, occOwner);
            const conceal = e.garrisonHide && occBars.length > 0 && !occFriendly;
            return {
              count: conceal ? 0 : tankDeckOf(e.type) ? deckLoad(state, e) : occBars.length,
              cap: garrisonCapOf(e.type),
              ownerId: conceal ? undefined : occOwner || undefined,
              bars: conceal || occBars.length === 0 ? undefined : occBars,
              hide: occFriendly && occBars.length > 0 && e.garrisonHide ? true : undefined,
              neutral: !conceal && occBars.length > 0 && !occOwner ? true : undefined,
            };
          })()
        : transport && occBars.length > 0
          ? {
              count: occBars.length,
              cap: BV222_TROOPS,
              ownerId: garrisonOwner(state, e) || undefined,
              bars: occBars,
            }
          : supplyBed && occBars.length > 0
            ? {
                count: occBars.length,
                cap: TRUCK_SEATS,
                ownerId: e.ownerId,
                bars: occBars,
              }
            : undefined,
      capture:
        e.kind === "building" && e.captureProgress > 0 && e.captureOwnerId
          ? { ownerId: e.captureOwnerId, progress: e.captureProgress }
          : undefined,
      air: e.air
        ? {
            phase: e.air.phase,
            alt: e.air.alt,
            fuel: friendly ? e.air.fuel : undefined,
            fuelMax: friendly ? airFuelOf(e.type) : undefined,
            bombs: friendly ? e.air.bombs : undefined,
            rounds: friendly ? e.air.rounds : undefined,
            homeId: friendly && e.air.homeId != null ? e.air.homeId : undefined,
            payload: friendly ? payloadOf(e) : undefined,
            troops: friendly && payloadOf(e) ? planeRiders(state, e).length : undefined,
          }
        : undefined,
      chute: e.chute ? e.chute.alt : undefined,
      pads:
        friendly && isAirfieldType(e.type) ? { used: padsTaken(state, e).size, cap: AIRFIELD_PADS } : undefined,
      drone: e.drone
        ? {
            mode: e.drone.mode,
            opId: friendly ? e.drone.opId : undefined,
            battery: friendly ? e.drone.battery : undefined,
            batteryMax: friendly ? DRONE_BATTERY_SECONDS : undefined,
            recall: friendly && e.drone.recall ? true : undefined,
          }
        : undefined,
      droneLink:
        friendly && e.droneLink
          ? {
              mode: e.droneLink.mode,
              droneId: e.droneLink.droneId ?? undefined,
              charge: e.droneLink.charge,
              chargeMax: DRONE_BATTERY_SECONDS,
              rebuild: e.droneLink.rebuild > 0 ? e.droneLink.rebuild : undefined,
              launchMin: DRONE_LAUNCH_MIN_SECONDS,
            }
          : undefined,
      asw: friendly && e.asw && !e.wreck ? aswDeckView(e) : undefined,
      jet: e.jet
        ? {
            alt: e.jet.alt,
            up: friendly && e.jet.up ? true : undefined,
            fuel: friendly ? e.jet.fuel : undefined,
            fuelMax: friendly ? (jetFlightOf(e.type)?.fuelSeconds ?? JET_FUEL_SECONDS) : undefined,
            takeoffMin: friendly ? (jetFlightOf(e.type)?.takeoffMinSeconds ?? JET_TAKEOFF_MIN_SECONDS) : undefined,
            refuel: friendly && e.jet.refuel > 0 && e.jet.alt <= 0 ? e.jet.refuel : undefined,
            crash: e.jet.crash ? true : undefined,
          }
        : undefined,
    });
  }
  const scrap = opts.scrap === false ? undefined : scrapCells(state);
  const hq = you ? state.entities.get(you.hqId) : undefined;
  const radar = you ? radarOnline(state, youPlayerId) : false;
  // The countdown shows only while you still have a Cyborg on the field to lose.
  const linkIn = you ? cyborgShutdownIn(state, youPlayerId) : null;
  const cyborgShutdown =
    linkIn != null && linkIn > 0 && [...state.entities.values()].some((e) => e.ownerId === youPlayerId && onUplink(e.type) && e.hp > 0 && !e.wreck && !e.shutdown)
      ? Math.round(linkIn * 10) / 10
      : undefined;
  return {
    tick: state.tick,
    gameSpeed: clampGameSpeed(state.gameSpeed),
    ...(state.paused ? { paused: true as const } : {}),
    mapId: state.mapId,
    youPlayerId,
    you: {
      scrap: you?.scrap ?? 0,
      scrapCap: you ? scrapCap(state, youPlayerId) : 0,
      provided: power.provided,
      used: power.used,
      lowPower: power.lowPower,
      structureQueue: structureQueueView(you?.structure),
      defenceQueue: structureQueueView(you?.defence),
      lineQueue: structureQueueView(you?.line),
      placingType: you?.placingType ?? null,
      alive: you?.alive ?? false,
      hqId: hq && hq.hp > 0 ? hq.id : (you?.hqId ?? null),
      radar,
      ...(cyborgShutdown != null ? { cyborgShutdownIn: cyborgShutdown } : {}),
      ...(you?.continuous && you.continuous.length > 0 ? { continuous: [...you.continuous] } : {}),
    },
    players: [...state.players.values()].map((p) => ({
      playerId: p.playerId,
      name: p.name,
      colorId: p.colorId,
      team: p.team,
      alive: p.alive,
      faction: p.faction ?? "alliance",
    })),
    entities,
    projectiles: state.projectiles
      // A torpedo shows as its body, an entity.
      .filter((p) => p.bodyId == null)
      .filter((p) => allies(state, youPlayerId, p.ownerId) || canSeeWorld(state, vis, p.x, p.y))
      .map((p) => ({
        id: p.id,
        x: wire(p.x),
        y: wire(p.y),
        vx: wire(p.vx),
        vy: wire(p.vy),
        ...(energyShot(state, p.ownerId) ? { energy: true as const } : {}),
        caliber: p.caliber,
        fromId: p.fromId,
        bounced: p.bounced,
        shell: p.shell ?? undefined,
        z: p.flight === "mortar" ? (p.z ?? 0) : undefined,
        mortar: p.flight === "mortar" ? true : undefined,
        big: p.flight === "mortar" && p.big ? true : undefined,
        shipBarrel: p.flight === "mortar" ? p.shipBarrel : undefined,
        apex: p.flight === "mortar" ? p.apex : undefined,
        arc:
          p.flight === "mortar" && (p.flightTime ?? 0) > 0
            ? Math.min(1, Math.max(0, ((p.flightTime ?? 0) - Math.max(0, p.life)) / (p.flightTime ?? 1)))
            : undefined,
        hang: p.flight === "mortar" || p.flight === "flame" ? p.flightTime : undefined,
        // A mine canister falls like a small bomb; its caliber tells the client it is not an SC 250.
        bomb: p.flight === "bomb" || p.flight === "cluster" ? true : undefined,
        rocket: p.flight === "rocket" ? true : undefined,
        drain: p.drain ? true : undefined,
        heavy: p.heavy ? true : undefined,
        hammer: p.hammer,
        ...(p.flight === "bomb" || p.flight === "rocket" || p.flight === "cluster" ? { z: p.z ?? 0 } : {}),
        ...(p.flight === "flak" ? { flak: true, z: p.z ?? 0 } : {}),
        ...(p.flight === "flame"
          ? {
              flame: true,
              z: p.z ?? 0,
              arc: Math.min(1, Math.max(0, ((p.flightTime ?? 0) - Math.max(0, p.life)) / Math.max(1e-6, p.flightTime ?? 1))),
            }
          : {}),
      })),
    // A reactor going up is seen from everywhere: the cloud towers over the fog.
    impacts: state.impacts
      .filter((i) => i.nuke || allies(state, youPlayerId, i.ownerId) || canSeeWorld(state, vis, i.x, i.y))
      .map((i) => (energyShot(state, i.ownerId) ? { ...i, energy: true as const } : i)),
    launches: state.launches.filter((l) => {
      const from = state.entities.get(l.fromId);
      return (from != null && allies(state, youPlayerId, from.ownerId)) || canSeeWorld(state, vis, l.x, l.y);
    }),
    blinks: state.blinks.filter(
      (b) => allies(state, youPlayerId, b.ownerId) || canSeeWorld(state, vis, b.x, b.y) || canSeeWorld(state, vis, b.tx, b.ty),
    ),
    smoke: state.smokeClouds.map((c) => ({
      id: c.id,
      x: c.x,
      y: c.y,
      ux: c.ux,
      uy: c.uy,
      halfAlong: c.halfAlong,
      halfAcross: c.halfAcross,
      life: c.life,
      lifeMax: c.lifeMax,
    })),
    shields: shieldViews(state, youPlayerId, vis),
    fires: state.fires
      .filter((f) => allies(state, youPlayerId, f.ownerId) || canSeeWorld(state, vis, f.x, f.y))
      .map((f) => ({ id: f.id, x: f.x, y: f.y, radius: f.radius, life: f.life, lifeMax: f.lifeMax })),
    mines: mineViews(state, youPlayerId),
    crates: crateViews(state, youPlayerId, vis),
    scrap,
    clearedTrees: state.clearedTrees.map((t) => (t.burn ? { x: t.x, y: t.y, burn: true as const } : { x: t.x, y: t.y })),
    bodies: visibleBodies(state, youPlayerId, vis),
    holes: state.holes.map((h) => ({ ...h })),
    ...(state.clutterHp.some((hp) => hp <= 0) ? { brokenClutter: brokenClutter(state) } : {}),
    ...(state.dug.size > 0 ? { dug: dugCells(state) } : {}),
    scenery: opts.scenery ? sceneryList(state) : undefined,
    vision: you ? visionRuns(vis) : undefined,
    radar: radar ? radarContacts(state, youPlayerId, vis) : undefined,
    sonar: you ? nonEmpty(sonarContacts(state, youPlayerId)) : undefined,
    thermal: you ? nonEmpty(thermalContacts(state, youPlayerId, vis)) : undefined,
    winner: state.winner,
  };
}

/** Every tile with scrap left on it. The whole grid, so it goes out only when `scrapRev` moved. */
function scrapCells(state: MatchState): ScrapCell[] {
  const scrap: ScrapCell[] = [];
  for (let y = 0; y < state.height; y++) {
    for (let x = 0; x < state.width; x++) {
      const yld = state.scrapYield[y * state.width + x] ?? 0;
      if (yld > 0) scrap.push({ x, y, yield: yld });
    }
  }
  return scrap;
}

function nonEmpty<T>(xs: T[]): T[] | undefined {
  return xs.length > 0 ? xs : undefined;
}

/** A Cyborg Commander's beam as every client that sees him draws it. */
function laserView(beam: LaserBeam, tick: number): NonNullable<EntityView["laser"]> {
  return {
    a0: beam.a0,
    a1: beam.a1,
    u: beam.line ? 1 : laserProgress(beam, tick),
    dur: Math.max(1, beam.endTick - beam.startTick) * TICK_DT,
    lens: [...beam.lens],
    line: beam.line ? true : undefined,
  };
}

const runsByMask = new WeakMap<Uint8Array, { rev: number; runs: number[] }>();

/** A mask array is repainted in place between paints, so each paint is encoded once. */
function visionRuns(vis: Uint8Array): number[] {
  const rev = maskRevOf(vis);
  const hit = runsByMask.get(vis);
  if (hit && hit.rev === rev) return hit.runs;
  const runs = encodeVisionRuns(vis);
  runsByMask.set(vis, { rev, runs });
  return runs;
}

function visibleBodies(state: MatchState, youPlayerId: string, vis: Uint8Array): CorpseView[] {
  const bodies: CorpseView[] = [];
  for (const b of state.bodies) {
    const friendly = allies(state, youPlayerId, b.ownerId);
    if (!friendly && !canSeeWorld(state, vis, b.x, b.y)) continue;
    bodies.push({
      id: b.id,
      type: b.type,
      ownerId: b.ownerId,
      x: b.x,
      y: b.y,
      facing: b.facing,
      bornTick: b.bornTick,
      blood: b.blood.map((s) => ({ ...s })),
      ...(b.burned ? { burned: true as const } : {}),
    });
  }
  return bodies;
}

/** Every Xenomorph weapon is an energy weapon: their shots and hits go out flagged so the client draws and voices them that way. */
function energyShot(state: MatchState, ownerId: string): boolean {
  return energyRound(state, ownerId);
}

/** Ticks a struck energy wall flares for. */
const SHIELD_FLASH_TICKS = 4;

function shieldViews(state: MatchState, youPlayerId: string, vis: Uint8Array): EnergyShieldView[] | undefined {
  const walls = state.energyShields;
  if (!walls || walls.length === 0) return undefined;
  const out: EnergyShieldView[] = [];
  for (const w of walls) {
    if (!allies(state, youPlayerId, w.ownerId) && !canSeeWorld(state, vis, w.x + Math.cos(w.angle) * w.r, w.y + Math.sin(w.angle) * w.r)) continue;
    out.push({
      id: w.id,
      ownerId: w.ownerId,
      x: w.x,
      y: w.y,
      angle: w.angle,
      half: w.half,
      r: w.r,
      hp: Math.ceil(w.hp),
      hpMax: w.hpMax,
      hit: w.hitTick != null && state.tick - w.hitTick < SHIELD_FLASH_TICKS ? true : undefined,
      by: w.forId != null ? w.fromId : undefined,
    });
  }
  return out.length > 0 ? out : undefined;
}
