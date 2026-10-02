import {
  AIR_FUEL_SECONDS,
  ARTILLERY_CREW,
  ARTILLERY_CREW_HP,
  ARTILLERY_SETUP_SECONDS,
  BV222_TROOPS,
  TRUCK_SEATS,
  DRONE_BATTERY_SECONDS,
  DRONE_LAUNCH_MIN_SECONDS,
  JET_FUEL_SECONDS,
  JET_TAKEOFF_MIN_SECONDS,
  AIRFIELD_PADS,
  beltOf,
  catalog,
  clampGameSpeed,
  deploySecondsOf,
  entityIsScouting,
  garrisonCapOf,
  isCivilianType,
  NEUTRAL_OWNER,
  hasMg,
  roofCiwsOf,
  hasScout,
  hasTurret,
  isGarrisonable,
  isInfantryType,
  isTransportType,
  MG42_BIPOD_SECONDS,
  MORTAR_PLANT_SECONDS,
  walkerGunsOf,
} from "../catalog.js";
import { padsTaken } from "./air.js";
import { artilleryCanLay, gunCrewOf } from "./artillery.js";
import { crateViews, mineViews, payloadOf, planeRiders } from "./airdrop.js";
import { cyborgShielded } from "./crits.js";
import { garrisonBars, garrisonOwner } from "./garrison.js";
import { allies, unitInWater } from "./geo.js";
import { medicTendView } from "./heal.js";
import { supplyHasDriver, supplyRiders } from "./supply.js";
import { powerOf } from "./power.js";
import { canSeeWorld, encodeVisionRuns, entityOnMask, visionMask } from "./vision.js";
import type { Entity, MatchState, Order, QueueableCommand } from "./types.js";
import type { CorpseView, EntityView, MatchSnapshot, PlanKind, PlanPointView, ScrapCell } from "../protocol.js";

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
  const count = structure === "wall" ? 1 + queued.length : 1;
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
  if (friendly || (structure === "wall" && digging)) {
    for (const p of queued) {
      sites.push({ structure, x: p.x, y: p.y, facing: p.facing, progress: structure === "wall" ? progress : undefined });
    }
  }
  return sites;
}

function entityAt(state: MatchState, id: number | undefined): PlanPointView | null {
  const t = id != null ? state.entities.get(id) : undefined;
  return t && t.hp > 0 ? { kind: "other", x: t.x, y: t.y } : null;
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
      at = entityAt(state, m.targetId);
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
    case "cmd.harvest":
      at =
        m.tileX != null && m.tileY != null
          ? { kind, x: (m.tileX + 0.5) * state.tileSize, y: (m.tileY + 0.5) * state.tileSize }
          : null;
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
    const at = entityAt(state, o.targetId) ?? (o.x != null && o.y != null ? { kind: "other" as const, x: o.x, y: o.y } : null);
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
    garrison: isGarrisonable(e.type) ? { count: 0, cap: garrisonCapOf(e.type) } : undefined,
  };
}

export function snapshotFor(state: MatchState, youPlayerId: string): MatchSnapshot {
  const you = state.players.get(youPlayerId);
  const power = you ? powerOf(state, youPlayerId) : { provided: 0, used: 0, lowPower: false };
  const vis = you ? visionMask(state, youPlayerId) : new Uint8Array(state.width * state.height);
  const entities: EntityView[] = [];
  for (const e of state.entities.values()) {
    if (e.hp <= 0) continue;
    const friendly = allies(state, youPlayerId, e.ownerId);
    if (e.garrisonedIn && !friendly) continue;
    if (!friendly && !entityOnMask(e, vis, state.width, state.height, state.tileSize)) {
      if (e.kind === "building" && isCivilianType(e.type)) entities.push(sceneryView(e));
      continue;
    }
    const job = e.queue[0];
    const transport = isTransportType(e.type);
    const supplyBed = e.type === "supply" && !e.wreck;
    const occBars = isGarrisonable(e.type) || transport || supplyBed ? garrisonBars(state, e) : [];
    entities.push({
      id: e.id,
      kind: e.kind,
      type: e.type,
      ownerId: e.ownerId,
      x: e.x,
      y: e.y,
      facing: e.facing,
      turretFacing: hasTurret(e.type) ? e.turretFacing : undefined,
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
      cargo: e.type === "hauler" ? e.cargo : undefined,
      cart: e.type === "hauler" ? e.cartHp : undefined,
      smokeCharges: friendly && e.type === "hauler" && !e.wreck ? e.smokeCharges : undefined,
      deployProgress:
        e.state === "deploy" || e.state === "undeploy"
          ? Math.min(1, e.deployTime / deploySecondsOf(e.type))
          : undefined,
      specialCooldown: e.specialCooldown > 0 ? e.specialCooldown : undefined,
      wreck: e.wreck || undefined,
      shielded: e.hp > 0 && cyborgShielded(e, state.tick) ? true : undefined,
      crits: e.crits.length > 0 ? [...e.crits] : undefined,
      stance: isInfantryType(e.type) ? e.stance : undefined,
      stanceOrder: isInfantryType(e.type) && e.stanceOrder !== e.stance ? e.stanceOrder : undefined,
      swimming: isInfantryType(e.type) && unitInWater(state, e) ? true : undefined,
      wading: !isInfantryType(e.type) && unitInWater(state, e) ? true : undefined,
      braced: e.braced || undefined,
      rocketReload: friendly && (e.rocketCooldown ?? 0) > 0 ? e.rocketCooldown : undefined,
      rockets: friendly && e.rockets != null ? e.rockets : undefined,
      heavy: friendly && e.type === "rocketer" ? (e.heavy ?? 0) : undefined,
      rocketsOff: friendly && e.rocketsOff ? true : undefined,
      holdPosition: friendly && e.holdPosition ? true : undefined,
      patrol:
        friendly && e.order?.kind === "patrol" && e.order.route
          ? e.order.route.map((p) => ({ x: p.x, y: p.y }))
          : undefined,
      guardFacing: friendly && e.guardFacing != null ? e.guardFacing : undefined,
      guardTargetId:
        friendly && e.order?.kind === "guard" && e.order.targetId != null ? e.order.targetId : undefined,
      tend: medicTendView(state, e),
      ruined: e.ruined || undefined,
      fieldSites: e.type === "engineer" ? fieldSitesView(e, friendly) : undefined,
      scout: scoutView(e, friendly),
      supply: friendly && e.type === "supply" && !e.wreck ? e.supply : undefined,
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
      shell: friendly && e.shell ? e.shell : undefined,
      mgAmmo: friendly && hasMg(e.type) ? e.mgAmmo : undefined,
      mgHeat: friendly && hasMg(e.type) ? e.mgHeat : undefined,
      mgOverheat: friendly && hasMg(e.type) && e.mgOverheat > 0 ? e.mgOverheat : undefined,
      weapon: friendly && isInfantryType(e.type) ? (e.weapon ?? undefined) : undefined,
      clip: friendly && (isInfantryType(e.type) || beltOf(e.type)) ? e.clip : undefined,
      guns: friendly && e.type === "walker" ? walkerGunsOf(e) : undefined,
      selfDestruct: friendly && e.type === "walker" && !e.wreck ? !e.selfDestructOff : undefined,
      gatling: gatlingView(state, e),
      ciws: ciwsView(state, e),
      reload: friendly && (isInfantryType(e.type) || beltOf(e.type)) && e.reload > 0 ? e.reload : undefined,
      bipod: plantRemaining(e, friendly),
      garrisonedIn: friendly && e.garrisonedIn ? e.garrisonedIn : undefined,
      plan: planView(state, e, e.ownerId === youPlayerId),
      garrison: isGarrisonable(e.type)
        ? (() => {
            const occOwner = garrisonOwner(state, e);
            const occFriendly = allies(state, youPlayerId, occOwner);
            const conceal = e.garrisonHide && occBars.length > 0 && !occFriendly;
            return {
              count: conceal ? 0 : occBars.length,
              cap: garrisonCapOf(e.type),
              ownerId: conceal ? undefined : occOwner || undefined,
              bars: conceal || occBars.length === 0 ? undefined : occBars,
              hide: occFriendly && occBars.length > 0 && e.garrisonHide ? true : undefined,
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
            fuelMax: friendly ? AIR_FUEL_SECONDS : undefined,
            bombs: friendly ? e.air.bombs : undefined,
            rounds: friendly ? e.air.rounds : undefined,
            homeId: friendly && e.air.homeId != null ? e.air.homeId : undefined,
            payload: friendly ? payloadOf(e) : undefined,
            troops: friendly && payloadOf(e) ? planeRiders(state, e).length : undefined,
          }
        : undefined,
      chute: e.chute ? e.chute.alt : undefined,
      pads:
        friendly && e.type === "airfield" ? { used: padsTaken(state, e).size, cap: AIRFIELD_PADS } : undefined,
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
      jet: e.jet
        ? {
            alt: e.jet.alt,
            up: friendly && e.jet.up ? true : undefined,
            fuel: friendly ? e.jet.fuel : undefined,
            fuelMax: friendly ? JET_FUEL_SECONDS : undefined,
            takeoffMin: friendly ? JET_TAKEOFF_MIN_SECONDS : undefined,
            refuel: friendly && e.jet.refuel > 0 && e.jet.alt <= 0 ? e.jet.refuel : undefined,
          }
        : undefined,
    });
  }
  const scrap: ScrapCell[] = [];
  for (let y = 0; y < state.height; y++) {
    for (let x = 0; x < state.width; x++) {
      const yld = state.scrapYield[y * state.width + x] ?? 0;
      if (yld > 0) scrap.push({ x, y, yield: yld });
    }
  }
  const hq = you ? state.entities.get(you.hqId) : undefined;
  return {
    tick: state.tick,
    gameSpeed: clampGameSpeed(state.gameSpeed),
    mapId: state.mapId,
    youPlayerId,
    you: {
      scrap: you?.scrap ?? 0,
      provided: power.provided,
      used: power.used,
      lowPower: power.lowPower,
      structureQueue: you?.structure
        ? {
            type: you.structure.type,
            progressTicks: you.structure.progressTicks,
            totalTicks: you.structure.totalTicks,
            ready: you.structure.ready,
            paused: you.structure.paused,
            ...(you.structure.sites?.length
              ? { sites: you.structure.sites.map((s) => ({ x: s.x, y: s.y, facing: s.facing })) }
              : {}),
          }
        : null,
      placingType: you?.placingType ?? null,
      alive: you?.alive ?? false,
      hqId: hq && hq.hp > 0 ? hq.id : (you?.hqId ?? null),
    },
    players: [...state.players.values()].map((p) => ({
      playerId: p.playerId,
      name: p.name,
      colorId: p.colorId,
      team: p.team,
      alive: p.alive,
    })),
    entities,
    projectiles: state.projectiles
      .filter((p) => allies(state, youPlayerId, p.ownerId) || canSeeWorld(state, vis, p.x, p.y))
      .map((p) => ({
        id: p.id,
        x: p.x,
        y: p.y,
        vx: p.vx,
        vy: p.vy,
        caliber: p.caliber,
        fromId: p.fromId,
        bounced: p.bounced,
        shell: p.shell ?? undefined,
        z: p.flight === "mortar" ? (p.z ?? 0) : undefined,
        mortar: p.flight === "mortar" ? true : undefined,
        big: p.flight === "mortar" && p.big ? true : undefined,
        apex: p.flight === "mortar" ? p.apex : undefined,
        arc:
          p.flight === "mortar" && (p.flightTime ?? 0) > 0
            ? Math.min(1, Math.max(0, ((p.flightTime ?? 0) - Math.max(0, p.life)) / (p.flightTime ?? 1)))
            : undefined,
        hang: p.flight === "mortar" || p.flight === "flame" ? p.flightTime : undefined,
        // A mine canister falls like a small bomb; its caliber tells the client it is not an SC 250.
        bomb: p.flight === "bomb" || p.flight === "cluster" ? true : undefined,
        rocket: p.flight === "rocket" ? true : undefined,
        heavy: p.heavy ? true : undefined,
        ...(p.flight === "bomb" || p.flight === "rocket" || p.flight === "cluster" ? { z: p.z ?? 0 } : {}),
        ...(p.flight === "flame"
          ? {
              flame: true,
              z: p.z ?? 0,
              arc: Math.min(1, Math.max(0, ((p.flightTime ?? 0) - Math.max(0, p.life)) / Math.max(1e-6, p.flightTime ?? 1))),
            }
          : {}),
      })),
    impacts: state.impacts.filter(
      (i) => allies(state, youPlayerId, i.ownerId) || canSeeWorld(state, vis, i.x, i.y),
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
    fires: state.fires
      .filter((f) => allies(state, youPlayerId, f.ownerId) || canSeeWorld(state, vis, f.x, f.y))
      .map((f) => ({ id: f.id, x: f.x, y: f.y, radius: f.radius, life: f.life, lifeMax: f.lifeMax })),
    mines: mineViews(state, youPlayerId, vis),
    crates: crateViews(state, youPlayerId, vis),
    scrap,
    clearedTrees: state.clearedTrees.map((t) => (t.burn ? { x: t.x, y: t.y, burn: true as const } : { x: t.x, y: t.y })),
    bodies: visibleBodies(state, youPlayerId, vis),
    holes: state.holes.map((h) => ({ ...h })),
    vision: you ? visionRuns(vis) : undefined,
    winner: state.winner,
  };
}

const runsByMask = new WeakMap<Uint8Array, number[]>();

/** Masks are reused until the fog changes, so each one is encoded once. */
function visionRuns(vis: Uint8Array): number[] {
  let runs = runsByMask.get(vis);
  if (!runs) {
    runs = encodeVisionRuns(vis);
    runsByMask.set(vis, runs);
  }
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
