import {
  carriesShell,
  fires,
  hasAmmo,
  radarLaidOf,
  rocketsOf,
  hasCrit,
  hasScout,
  infantryGunFor,
  infantryLoadout,
  isBuildingType,
  isFieldStructure,
  isYardField,
  isGarrisonable,
  isInfantryType,
  isInfantryWeaponId,
  isShellType,
  isSmokeShell,
  isStance,
  isTrainType,
  isDroneMode,
  isAirDrop,
  isTransportType,
  ORDER_QUEUE_MAX,
  pickLoadedShell,
  PENETRATOR_ARM_SECONDS,
  reloadSecondsOf,
  type AirDrop,
  type DroneMode,
  type InfantryWeaponId,
  type ShellType,
  type Stance,
} from "../catalog.js";
import type { ClientMessage, ErrorCode } from "../protocol.js";
import { pathToCapture, wantsCapture } from "./capture.js";
import { allies, clearOrder, hqOf, worldToTile } from "./geo.js";
import { endWalkerCharge } from "./walker-charge.js";
import { garrisonCanShoot, garrisonShotReaches, relayGarrisonForce } from "./combat.js";
import { approachTile, canGarrison, exitGarrison, garrisonOwner, livingGarrison, setGarrisonHide } from "./garrison.js";
import { setScoutOut } from "./scout.js";
import { cancelStructure, pauseStructure, placeBaseField, placeBuilding, sellBuilding, startBuild } from "./build.js";
import { orderFieldBuild, orderRepair } from "./field.js";
import { deployId } from "./deploy.js";
import { cancelTrain, pauseTrain, setRally, startTrain } from "./train.js";
import { groupMovePace, groupMoveTargets } from "./formation.js";
import { escortAnchor } from "./orders.js";
import { setPath } from "./path.js";
import { tickStance } from "./stance.js";
import { dismountSupply, orderBoard, orderDisable, orderSupply, supplyCanDrive } from "./supply.js";
import { orderCrew, orderTow } from "./artillery.js";
import { orderAircraft, stopAircraft } from "./air.js";
import { buildPatrolRoute, cleanPatrolPoints } from "./patrol.js";
import { orderBoardPlane, setPayload, unloadPlane } from "./airdrop.js";
import { droneOf, guardDrone, launchDrone, orderDrone, recallDrone, setDroneMode, stopDrone } from "./drone.js";
import { landJet, takeOff } from "./jet.js";
import { spotFacingOf, spotlightManned } from "./night.js";
import type { Entity, MatchState, QueueableCommand, Vec } from "./types.js";

export type CmdResult = { ok: true } | { ok: false; code: ErrorCode; message: string };

const ok = (): CmdResult => ({ ok: true });
const fail = (code: ErrorCode, message: string): CmdResult => ({ ok: false, code, message });

export function applyCommand(state: MatchState, playerId: string, msg: ClientMessage): CmdResult {
  if (state.ended) return fail("ended", "Match is over.");
  const p = state.players.get(playerId);
  if (!p) return fail("not_member", "You are not in this match.");
  if (!p.alive && msg.type.startsWith("cmd.")) return fail("dead", "Your Core is down.");

  if (isQueueable(msg) && msg.queue) return queueCommand(state, playerId, msg);
  dropQueues(state, playerId, msg);
  return runCommand(state, playerId, msg);
}

function runCommand(state: MatchState, playerId: string, msg: ClientMessage): CmdResult {
  if (RELEASES_DOOR_GROUP.has(msg.type)) releaseDoorGroup(state, playerId, commandIds(msg));
  const drones = routeDrones(state, playerId, msg);
  if (drones) return drones;
  const air = routeAircraft(state, playerId, msg);
  if (air) return air;

  switch (msg.type) {
    case "cmd.move":
      return cmdMove(state, playerId, msg.ids, msg.x, msg.y, msg.facing);
    case "cmd.attack":
      return cmdAttack(state, playerId, msg.ids, msg.targetId);
    case "cmd.attackmove":
      return cmdAttackMove(state, playerId, msg.ids, msg.x, msg.y);
    case "cmd.patrol":
      return cmdPatrol(state, playerId, msg.ids, msg.points);
    case "cmd.forceattack":
      return cmdForceAttack(state, playerId, msg.ids, msg.x, msg.y, msg.targetId, msg.once);
    case "cmd.stop":
      return cmdStop(state, playerId, msg.ids);
    case "cmd.harvest":
      return cmdHarvest(state, playerId, msg.ids, msg.tileX, msg.tileY);
    case "cmd.ammo":
      if (!isShellType(msg.shell)) return fail("bad_payload", "Unknown shell.");
      return cmdAmmo(state, playerId, msg.ids, msg.shell);
    case "cmd.weapon":
      if (!isInfantryWeaponId(msg.weapon)) return fail("bad_payload", "Unknown weapon.");
      return cmdWeapon(state, playerId, msg.ids, msg.weapon);
    case "cmd.rockets":
      if (typeof msg.on !== "boolean") return fail("bad_payload", "Unknown rocket setting.");
      return cmdRockets(state, playerId, msg.ids, msg.on);
    case "cmd.reach":
      if (typeof msg.max !== "boolean") return fail("bad_payload", "Unknown reach setting.");
      return cmdReach(state, playerId, msg.ids, msg.max);
    case "cmd.guns":
      if (msg.guns !== 1 && msg.guns !== 2) return fail("bad_payload", "Unknown gatling setting.");
      return cmdGuns(state, playerId, msg.ids, msg.guns);
    case "cmd.selfdestruct":
      if (typeof msg.on !== "boolean") return fail("bad_payload", "Unknown self-destroy setting.");
      return cmdSelfDestruct(state, playerId, msg.ids, msg.on);
    case "cmd.build":
      if (isYardField(msg.building)) return fail("bad_payload", "Place that on the map.");
      if (!isBuildingType(msg.building)) return fail("bad_payload", "Unknown structure.");
      return wrap(startBuild(state, playerId, msg.building), "no_core");
    case "cmd.place":
      if (!isBuildingType(msg.building)) return fail("bad_payload", "Unknown structure.");
      return wrap(placeBuilding(state, playerId, msg.building, msg.tx, msg.ty), "invalid_place");
    case "cmd.train":
      if (!isTrainType(msg.unit)) return fail("bad_payload", "Unknown unit.");
      return wrap(startTrain(state, playerId, msg.unit), "busy");
    case "cmd.pause":
      if (msg.what === "structure") return wrap(pauseStructure(state, playerId, msg.paused), "busy");
      if (msg.what !== "train") return fail("bad_payload", "Unknown pause.");
      if (msg.unit != null && !isTrainType(msg.unit)) return fail("bad_payload", "Unknown unit.");
      return wrap(
        pauseTrain(state, playerId, { jobId: msg.jobId, unit: msg.unit, paused: msg.paused }),
        "busy",
      );
    case "cmd.cancel":
      if (msg.what === "structure") return wrap(cancelStructure(state, playerId), "busy");
      if (msg.unit != null && !isTrainType(msg.unit)) return fail("bad_payload", "Unknown unit.");
      return wrap(
        cancelTrain(state, playerId, { buildingId: msg.buildingId, jobId: msg.jobId, unit: msg.unit }),
        "busy",
      );
    case "cmd.rally":
      if (!Array.isArray(msg.ids)) return fail("bad_payload", "Bad rally point.");
      return wrap(setRally(state, playerId, msg.ids, msg.x, msg.y), "bad_payload");
    case "cmd.sell":
      return wrap(sellBuilding(state, playerId, msg.id), "not_yours");
    case "cmd.deploy": {
      const err = deployId(state, playerId, msg.id);
      return wrap(err, "busy");
    }
    case "cmd.garrison":
      return cmdGarrison(state, playerId, msg.ids, msg.buildingId);
    case "cmd.ungarrison":
      return cmdUngarrison(state, playerId, msg.ids, msg.buildingId, msg.x, msg.y);
    case "cmd.garrisonhide":
      return cmdGarrisonHide(state, playerId, msg.ids, msg.hide);
    case "cmd.scout":
      return cmdScout(state, playerId, msg.ids, msg.out);
    case "cmd.stance":
      if (!isStance(msg.stance)) return fail("bad_payload", "Unknown stance.");
      return cmdStance(state, playerId, msg.ids, msg.stance);
    case "cmd.hold":
      return cmdHold(state, playerId, msg.ids, msg.hold);
    case "cmd.rotate":
      return cmdRotate(state, playerId, msg.ids, msg.x, msg.y);
    case "cmd.guard":
      return cmdGuard(state, playerId, msg.ids, msg.x, msg.y, msg.facing, msg.targetId);
    case "cmd.field":
      if (!isFieldStructure(msg.structure)) return fail("bad_payload", "Unknown structure.");
      if (!Array.isArray(msg.ids) || msg.ids.length === 0) {
        if (!isYardField(msg.structure)) return wrap("That structure is not ready.", "invalid_place");
        return wrap(
          placeBaseField(state, playerId, msg.structure, msg.x, msg.y, msg.facing, msg.x2, msg.y2),
          "invalid_place",
        );
      }
      return wrap(
        orderFieldBuild(
          state,
          playerId,
          owned(state, playerId, msg.ids),
          msg.structure,
          msg.x,
          msg.y,
          msg.facing,
          msg.x2,
          msg.y2,
        ),
        "invalid_place",
      );
    case "cmd.repair":
      return wrap(orderRepair(state, playerId, owned(state, playerId, msg.ids), msg.targetId), "not_found");
    case "cmd.board": {
      const plane = state.entities.get(msg.truckId);
      if (plane && isTransportType(plane.type)) {
        return wrap(orderBoardPlane(state, playerId, owned(state, playerId, msg.ids), plane), "busy");
      }
      if (plane?.type === "artillery") {
        return wrap(orderCrew(state, playerId, owned(state, playerId, msg.ids), plane.id), "busy");
      }
      return wrap(orderBoard(state, playerId, owned(state, playerId, msg.ids), msg.truckId), "busy");
    }
    case "cmd.payload":
      if (!isAirDrop(msg.payload)) return fail("bad_payload", "Unknown load.");
      return cmdPayload(state, playerId, msg.ids, msg.payload);
    case "cmd.unboard":
      return cmdUnboard(state, playerId, msg.ids, msg.truckId);
    case "cmd.supply":
      return wrap(orderSupply(state, playerId, owned(state, playerId, msg.ids), msg.targetId), "not_found");
    case "cmd.disable":
      if (!Array.isArray(msg.ids) || typeof msg.mineId !== "number") return fail("bad_payload", "Bad disable order.");
      return wrap(orderDisable(state, playerId, owned(state, playerId, msg.ids), msg.mineId), "not_found");
    case "cmd.tow":
      if (!Array.isArray(msg.ids)) return fail("bad_payload", "Bad tow order.");
      if (msg.targetId != null && typeof msg.targetId !== "number") return fail("bad_payload", "Bad tow order.");
      return wrap(orderTow(state, playerId, owned(state, playerId, msg.ids), msg.targetId), "not_found");
    case "cmd.drone":
      if (!Array.isArray(msg.ids)) return fail("bad_payload", "Bad drone order.");
      if (msg.action !== "launch" && msg.action !== "recall" && msg.action !== "mode") {
        return fail("bad_payload", "Unknown drone order.");
      }
      if (msg.action === "mode" && !isDroneMode(msg.mode)) return fail("bad_payload", "Unknown drone mode.");
      return cmdDrone(state, playerId, msg.ids, msg.action, msg.mode);
    case "cmd.jet":
      if (!Array.isArray(msg.ids)) return fail("bad_payload", "Bad jet order.");
      if (msg.action !== "up" && msg.action !== "land") return fail("bad_payload", "Unknown jet order.");
      return cmdJet(state, playerId, msg.ids, msg.action);
    default:
      return fail("bad_payload", "Unknown command.");
  }
}

const QUEUEABLE = new Set<string>([
  "cmd.move",
  "cmd.attack",
  "cmd.attackmove",
  "cmd.forceattack",
  "cmd.guard",
  "cmd.rotate",
  "cmd.garrison",
  "cmd.harvest",
  "cmd.repair",
  "cmd.supply",
  "cmd.disable",
  "cmd.board",
]);

/** Unqueued orders that replace what a unit was doing, and so drop its queue. */
const DROPS_QUEUE = new Set<string>([
  ...QUEUEABLE,
  "cmd.stop",
  "cmd.hold",
  "cmd.field",
  "cmd.ungarrison",
  "cmd.unboard",
  "cmd.tow",
  "cmd.land",
  "cmd.deploy",
  "cmd.patrol",
]);

/** Orders that take a unit out of the pack waiting at the producer's door. */
const RELEASES_DOOR_GROUP = new Set<string>([...DROPS_QUEUE, "cmd.jet", "cmd.drone"]);

function commandIds(msg: ClientMessage): readonly number[] {
  if (msg.type === "cmd.deploy") return [msg.id];
  if ("ids" in msg && Array.isArray(msg.ids)) return msg.ids;
  return [];
}

/** A player order means this unit is no longer part of the door pack. */
function releaseDoorGroup(state: MatchState, playerId: string, ids: readonly number[]): void {
  for (const id of ids) {
    const e = state.entities.get(id);
    if (e && e.ownerId === playerId) delete e.doorGroup;
  }
}

function isQueueable(msg: ClientMessage): msg is QueueableCommand {
  return QUEUEABLE.has(msg.type);
}

function dropQueues(state: MatchState, playerId: string, msg: ClientMessage): void {
  if (!DROPS_QUEUE.has(msg.type)) return;
  if (msg.type === "cmd.hold" && !msg.hold) return;
  const ids = msg.type === "cmd.deploy" ? [msg.id] : "ids" in msg && Array.isArray(msg.ids) ? msg.ids : [];
  for (const id of ids) {
    const e = state.entities.get(id);
    if (e && e.ownerId === playerId) e.orderQueue = undefined;
  }
}

/** Point a queued ground order walks to, when it has one to spread into a formation. */
function travelPoint(msg: QueueableCommand): Vec | null {
  if (msg.type === "cmd.move" || msg.type === "cmd.attackmove") return { x: msg.x, y: msg.y };
  if (msg.type === "cmd.guard" && msg.targetId == null && Number.isFinite(msg.x) && Number.isFinite(msg.y)) {
    return { x: msg.x!, y: msg.y! };
  }
  return null;
}

/** Where the unit will stand once its current and queued orders are done walking. */
function queueTail(e: Entity): Vec {
  for (let i = (e.orderQueue?.length ?? 0) - 1; i >= 0; i--) {
    const at = travelPoint(e.orderQueue![i]!.msg);
    if (at) return at;
  }
  const o = e.order;
  if (o && !o.auto && (o.kind === "move" || o.kind === "attackmove" || o.kind === "guard") && o.x != null && o.y != null) {
    return { x: o.x, y: o.y };
  }
  return { x: e.x, y: e.y };
}

/**
 * Shift-queue: each ground unit keeps its own copy of the order, its point
 * spread into the formation slot it will hold from where its earlier orders
 * leave it. An idle unit starts at once. Aircraft, drones, and CIWS mounts
 * take the order now.
 */
function queueCommand(state: MatchState, playerId: string, msg: QueueableCommand): CmdResult {
  const units = owned(state, playerId, msg.ids).filter((e) => !e.air && !e.drone);
  const unitIds = new Set(units.map((e) => e.id));
  const ground = units.filter((e) => (e.orderQueue?.length ?? 0) < ORDER_QUEUE_MAX);
  const rest = msg.ids.filter((id) => !unitIds.has(id));
  const now = rest.length > 0 ? runCommand(state, playerId, { ...msg, ids: rest, queue: undefined }) : null;
  if (ground.length === 0) return now ?? fail("not_yours", "No owned units.");

  const at = travelPoint(msg);
  let spots: Map<number, Vec> | null = null;
  let pace: number | undefined;
  if (at) {
    // Lay out the formation from the ground each unit will be standing on.
    const from = ground.map((e) => ({ ...e, ...queueTail(e) }));
    spots = groupMoveTargets(state, from, at.x, at.y);
    pace = groupMovePace(ground);
  }
  for (const e of ground) delete e.doorGroup;
  for (const e of ground) {
    const spot = spots?.get(e.id);
    const one = { ...msg, ids: [e.id], queue: undefined, ...(spot ? { x: spot.x, y: spot.y } : {}) } as QueueableCommand;
    (e.orderQueue ??= []).push(pace != null ? { msg: one, pace } : { msg: one });
  }
  for (const e of ground) advanceQueue(state, e);
  return ok();
}

/** Idle for the queue: no order, or only one the unit picked for itself. */
function readyForNext(e: Entity): boolean {
  return !e.order || !!e.order.auto;
}

/** Start queued orders until one takes hold or the queue runs dry. */
function advanceQueue(state: MatchState, e: Entity): void {
  const q = e.orderQueue;
  if (!q) return;
  if (e.hp <= 0 || e.wreck) {
    e.orderQueue = undefined;
    return;
  }
  if (e.state === "deploy" || e.state === "undeploy") return;
  while (q.length > 0 && readyForNext(e)) {
    const next = q.shift()!;
    const r = runCommand(state, e.ownerId, next.msg);
    const o = e.order;
    if (r.ok && next.pace != null && o && (o.kind === "move" || o.kind === "attackmove" || o.kind === "guard")) {
      o.pace = next.pace;
    }
  }
  if (q.length === 0) e.orderQueue = undefined;
}

/** Sim phase: units whose order just ended take their next queued one. */
export function tickOrderQueue(state: MatchState): void {
  for (const e of state.entities.values()) {
    if (e.orderQueue) advanceQueue(state, e);
  }
}

const AIR_ROUTED = new Set([
  "cmd.move",
  "cmd.attack",
  "cmd.attackmove",
  "cmd.forceattack",
  "cmd.stop",
  "cmd.hold",
  "cmd.guard",
  "cmd.rotate",
  "cmd.land",
]);

/**
 * Drones in a selection take flight orders (Return means recall); everyone
 * else gets the rest of the command. Null when no drone is involved.
 */
function routeDrones(state: MatchState, playerId: string, msg: ClientMessage): CmdResult | null {
  if (!AIR_ROUTED.has(msg.type) || !("ids" in msg) || !Array.isArray(msg.ids)) return null;
  const drones = owned(state, playerId, msg.ids).filter((e) => e.drone);
  if (drones.length === 0) return null;
  const ids = new Set(drones.map((e) => e.id));
  drones.forEach((d, i) => {
    const ang = (i / Math.max(1, drones.length)) * Math.PI * 2;
    const spread = drones.length > 1 ? state.tileSize * 2 : 0;
    const x = "x" in msg && typeof msg.x === "number" ? msg.x + Math.cos(ang) * spread : undefined;
    const y = "y" in msg && typeof msg.y === "number" ? msg.y + Math.sin(ang) * spread : undefined;
    switch (msg.type) {
      case "cmd.move":
      case "cmd.attackmove":
        if (x != null && y != null) orderDrone(state, d, { kind: "move", x, y });
        break;
      case "cmd.attack":
      case "cmd.forceattack": {
        const t = msg.targetId != null ? state.entities.get(msg.targetId) : undefined;
        if (t && t.hp > 0 && t.id !== d.id && !allies(state, playerId, t.ownerId)) {
          orderDrone(state, d, { kind: "attack", targetId: t.id });
        } else if (x != null && y != null) {
          orderDrone(state, d, { kind: "move", x, y });
        }
        break;
      }
      case "cmd.stop":
        stopDrone(d);
        break;
      case "cmd.land":
        recallDrone(d);
        break;
      case "cmd.guard": {
        const t = msg.targetId != null ? state.entities.get(msg.targetId) : undefined;
        const face = Number.isFinite(msg.facing) ? msg.facing! : d.facing;
        if (t && t.hp > 0 && t.id !== d.id && t.kind === "unit" && allies(state, playerId, t.ownerId)) {
          guardDrone(d, t.x, t.y, face, t.id);
        } else if (x != null && y != null && Number.isFinite(x) && Number.isFinite(y)) {
          guardDrone(d, x, y, face);
        }
        break;
      }
      default:
        break;
    }
  });
  const rest = msg.ids.filter((id) => !ids.has(id));
  if (rest.length === 0) return ok();
  const others = { ...msg, ids: rest } as ClientMessage;
  // Return with only ground units left means nothing to them.
  if (msg.type === "cmd.land" && !owned(state, playerId, rest).some((e) => e.air)) return ok();
  return applyCommand(state, playerId, others);
}

/** Take off or land every Jump Jet in the selection. Others ignore it. */
function cmdJet(state: MatchState, playerId: string, ids: number[], action: "up" | "land"): CmdResult {
  const jets = owned(state, playerId, ids).filter((e) => e.jet && e.hp > 0);
  if (jets.length === 0) return fail("not_yours", "Select a Jump Jet.");
  if (action === "land") {
    for (const e of jets) landJet(e);
    return ok();
  }
  let err: string | null = null;
  let done = 0;
  for (const e of jets) {
    const why = takeOff(state, e);
    if (why) err = why;
    else done++;
  }
  if (done > 0) return ok();
  return wrap(err ?? "Cannot take off.", "busy");
}

function cmdDrone(
  state: MatchState,
  playerId: string,
  ids: number[],
  action: "launch" | "recall" | "mode",
  mode?: DroneMode,
): CmdResult {
  const units = owned(state, playerId, ids).filter((e) => e.drone || e.droneLink);
  if (units.length === 0) return fail("not_yours", "Select a Drone Op or his drone.");
  let err: string | null = null;
  let done = 0;
  for (const e of units) {
    if (action === "mode") {
      if (!mode) return fail("bad_payload", "Unknown drone mode.");
      setDroneMode(state, e, mode);
      done++;
    } else if (action === "recall") {
      const d = e.drone ? e : droneOf(state, e);
      if (d) {
        recallDrone(d);
        done++;
      }
    } else if (e.droneLink) {
      const why = launchDrone(state, e);
      if (why) err = why;
      else done++;
    }
  }
  if (done > 0) return ok();
  return wrap(err ?? "No drone up.", "busy");
}

/**
 * Aircraft in a selection take flight orders; everyone else in the same
 * selection gets the ground command. Null when no plane is involved.
 */
function routeAircraft(state: MatchState, playerId: string, msg: ClientMessage): CmdResult | null {
  if (!AIR_ROUTED.has(msg.type) || !("ids" in msg) || !Array.isArray(msg.ids)) return null;
  const planes = owned(state, playerId, msg.ids).filter((e) => e.air);
  if (msg.type === "cmd.land" && planes.length === 0) return fail("not_yours", "Select an aircraft.");
  if (planes.length === 0) return null;
  const planeIds = new Set(planes.map((e) => e.id));
  planes.forEach((e, i) => {
    // Spread a flight over a small ring so the planes do not stack.
    const ang = (i / Math.max(1, planes.length)) * Math.PI * 2;
    const spread = planes.length > 1 ? state.tileSize * 3 : 0;
    const ox = Math.cos(ang) * spread;
    const oy = Math.sin(ang) * spread;
    switch (msg.type) {
      case "cmd.move":
        orderAircraft(state, e, { kind: "move", x: msg.x + ox, y: msg.y + oy });
        break;
      case "cmd.attackmove":
        orderAircraft(state, e, { kind: "attackmove", x: msg.x + ox, y: msg.y + oy });
        break;
      case "cmd.attack": {
        const t = state.entities.get(msg.targetId);
        if (!t || t.hp <= 0 || t.id === e.id) break;
        if (t.type === "airfield" && t.ownerId === playerId) orderAircraft(state, e, { kind: "land" });
        else if (!allies(state, playerId, t.ownerId)) {
          orderAircraft(state, e, { kind: "attack", targetId: t.id, x: t.x, y: t.y });
        }
        break;
      }
      case "cmd.forceattack":
        orderAircraft(state, e, { kind: "forceattack", x: msg.x, y: msg.y, targetId: msg.targetId });
        break;
      case "cmd.stop":
        stopAircraft(e);
        break;
      case "cmd.land":
        orderAircraft(state, e, { kind: "land" });
        break;
      case "cmd.guard": {
        const t = msg.targetId != null ? state.entities.get(msg.targetId) : undefined;
        const baseX = t && t.hp > 0 ? t.x : msg.x;
        const baseY = t && t.hp > 0 ? t.y : msg.y;
        if (baseX == null || baseY == null || !Number.isFinite(baseX) || !Number.isFinite(baseY)) break;
        const face = Number.isFinite(msg.facing) ? msg.facing : e.facing;
        orderAircraft(state, e, { kind: "guard", x: baseX + ox, y: baseY + oy, facing: face });
        break;
      }
      default:
        // Hold and rotate mean nothing to a plane.
        break;
    }
  });
  const rest = msg.ids.filter((id) => !planeIds.has(id));
  if (rest.length === 0 || msg.type === "cmd.land") return ok();
  return applyCommand(state, playerId, { ...msg, ids: rest } as ClientMessage);
}

function wrap(err: string | null, fallback: ErrorCode): CmdResult {
  if (!err) return ok();
  const code: ErrorCode =
    err.includes("scrap") ? "low_scrap"
    : err.includes("Deploy") ? "no_core"
    : err.includes("place") || err.includes("far") || err.includes("clear") ? "invalid_place"
    : err.includes("yours") || err.includes("Select") ? "not_yours"
    : err.includes("cap") ? "unit_cap"
    : err.includes("already") ||
        err.includes("Stop") ||
        err.includes("transform") ||
        err.includes("recharg") ||
        err.includes("queue") ||
        err.includes("Queue")
      ? "busy"
    : err.includes("out of the fight") ? "dead"
    : fallback;
  return fail(code, err);
}

function owned(state: MatchState, playerId: string, ids: number[]) {
  const out = [];
  for (const id of ids) {
    const e = state.entities.get(id);
    // A paratrooper takes orders once he is on the ground.
    if (e && e.ownerId === playerId && e.hp > 0 && e.kind === "unit" && !e.wreck && !e.chute) out.push(e);
  }
  return out;
}

/** Own watch towers in the selection. Rotate swings the spotlight. */
function ownedLamps(state: MatchState, playerId: string, ids: number[]) {
  const out = [];
  for (const id of ids) {
    const e = state.entities.get(id);
    if (e && e.ownerId === playerId && e.kind === "building" && spotlightManned(e)) out.push(e);
  }
  return out;
}

/** Own CIWS mounts in the selection. A structure with its own gun: it takes Rotate, Force attack, and Stop. */
function ownedMounts(state: MatchState, playerId: string, ids: number[]) {
  const out = [];
  for (const id of ids) {
    const e = state.entities.get(id);
    if (e && e.ownerId === playerId && e.hp > 0 && e.kind === "building" && radarLaidOf(e.type)) out.push(e);
  }
  return out;
}

function cmdMove(
  state: MatchState,
  playerId: string,
  ids: number[],
  x: number,
  y: number,
  facing?: number,
): CmdResult {
  const units = owned(state, playerId, ids);
  if (units.length === 0) return fail("not_yours", "No owned units.");
  const arrive = Number.isFinite(facing) ? facing : undefined;
  const movers = units.filter(
    (e) => e.state !== "deploy" && e.state !== "undeploy" && !e.braced && supplyCanDrive(state, e),
  );
  if (movers.length === 0) {
    return fail("busy", units.every((e) => e.braced) ? "Deployed. Pack up to move." : "No driver.");
  }
  const dests = groupMoveTargets(state, movers, x, y);
  const pace = groupMovePace(movers);
  for (const e of movers) {
    const d = dests.get(e.id) ?? { x, y };
    if (e.garrisonedIn) {
      e.guardFacing = null;
      exitGarrison(state, e, d);
      if (e.order?.kind === "move") {
        if (pace != null) e.order.pace = pace;
        if (arrive != null) e.order.arrive = arrive;
      }
      continue;
    }
    e.returnToBase = false;
    e.attackTarget = null;
    e.harvestTile = null;
    e.guardFacing = null;
    stopHaulerLoop(e);
    const dropoff = e.type === "hauler" && e.cargo > 0 ? smelterAt(state, playerId, x, y) : null;
    if (dropoff) {
      e.order = { kind: "unload", targetId: dropoff.id };
      e.state = "unload";
      e.waypoints = [];
      continue;
    }
    e.order = { kind: "move", x: d.x, y: d.y };
    if (arrive != null) e.order.arrive = arrive;
    if (pace != null) e.order.pace = pace;
    e.state = "move";
    setPath(state, e, d.x, d.y);
  }
  return ok();
}

/** Owned Smelter whose footprint contains this point. A move there dumps the cart. */
function smelterAt(state: MatchState, playerId: string, x: number, y: number): Entity | null {
  const tx = worldToTile(x, state.tileSize);
  const ty = worldToTile(y, state.tileSize);
  for (const b of state.entities.values()) {
    if (b.ownerId !== playerId || b.type !== "smelter" || b.hp <= 0) continue;
    if (tx >= b.tileX && tx < b.tileX + b.tileW && ty >= b.tileY && ty < b.tileY + b.tileH) return b;
  }
  return null;
}

function stopHaulerLoop(e: Entity): void {
  if (e.type === "hauler") e.autoHarvest = false;
}

function cmdPatrol(
  state: MatchState,
  playerId: string,
  ids: number[],
  raw: { x: number; y: number }[] | undefined,
): CmdResult {
  const points = cleanPatrolPoints(state, raw);
  if (!points) return fail("bad_payload", "Place a patrol point.");
  const ownedUnits = owned(state, playerId, ids);
  if (ownedUnits.length === 0) return fail("not_yours", "No owned units.");
  const drones = ownedUnits.filter((e) => e.drone);
  const planes = ownedUnits.filter((e) => e.air && !e.drone);
  const ground = ownedUnits.filter(
    (e) => !e.air && !e.drone && e.state !== "deploy" && e.state !== "undeploy" && !e.braced && supplyCanDrive(state, e),
  );
  if (drones.length === 0 && planes.length === 0 && ground.length === 0) {
    return fail("busy", ownedUnits.every((e) => e.braced) ? "Deployed. Pack up to move." : "No driver.");
  }
  const group = state.nextId++;
  for (const e of ground) {
    if (e.garrisonedIn) {
      e.guardFacing = null;
      exitGarrison(state, e);
    }
  }
  let cx = 0;
  let cy = 0;
  for (const e of ground) {
    cx += e.x;
    cy += e.y;
  }
  if (ground.length > 0) {
    cx /= ground.length;
    cy /= ground.length;
  }
  const pace = groupMovePace(ground);
  for (const e of ground) {
    const route = buildPatrolRoute(state, e, points, e.x - cx, e.y - cy);
    const dest = route[1]!;
    e.returnToBase = false;
    e.attackTarget = null;
    e.harvestTile = null;
    e.guardFacing = null;
    stopHaulerLoop(e);
    e.order = { kind: "patrol", route, leg: 1, dir: 1, group };
    if (pace != null) e.order.pace = pace;
    e.state = "move";
    setPath(state, e, dest.x, dest.y);
  }
  planes.forEach((e, i) => {
    const ang = (i / Math.max(1, planes.length)) * Math.PI * 2;
    const spread = planes.length > 1 ? state.tileSize * 3 : 0;
    const ox = Math.cos(ang) * spread;
    const oy = Math.sin(ang) * spread;
    const shifted = points.map((p) => ({ x: p.x + ox, y: p.y + oy }));
    const route = buildPatrolRoute(state, e, shifted, 0, 0);
    orderAircraft(state, e, { kind: "patrol", route, leg: 1, dir: 1, group });
  });
  for (const d of drones) {
    const route = buildPatrolRoute(state, d, points, 0, 0);
    orderDrone(state, d, { kind: "patrol", route, leg: 1, dir: 1, group });
  }
  return ok();
}

function cmdAttackMove(state: MatchState, playerId: string, ids: number[], x: number, y: number): CmdResult {
  const units = owned(state, playerId, ids);
  if (units.length === 0) return fail("not_yours", "No owned units.");
  const movers = units.filter(
    (e) => e.state !== "deploy" && e.state !== "undeploy" && !e.braced && supplyCanDrive(state, e),
  );
  const dests = groupMoveTargets(state, movers, x, y);
  const pace = groupMovePace(movers);
  for (const e of movers) {
    const d = dests.get(e.id) ?? { x, y };
    e.order = { kind: "attackmove", x: d.x, y: d.y };
    if (pace != null) e.order.pace = pace;
    e.returnToBase = false;
    e.attackTarget = null;
    e.harvestTile = null;
    e.guardFacing = null;
    stopHaulerLoop(e);
    e.state = "move";
    setPath(state, e, d.x, d.y);
  }
  return ok();
}

function cmdForceAttack(
  state: MatchState,
  playerId: string,
  ids: number[],
  x: number,
  y: number,
  targetId?: number,
  once?: boolean,
): CmdResult {
  let t = targetId != null ? state.entities.get(targetId) : undefined;
  if (targetId != null) {
    if (!t || t.hp <= 0) return fail("not_found", "No such target.");
    if (t.garrisonedIn) t = state.entities.get(t.garrisonedIn) ?? t;
  }
  const units = owned(state, playerId, ids);
  const mounts = ownedMounts(state, playerId, ids);
  const hosts = forceHosts(state, playerId, ids);
  if (units.length === 0 && mounts.length === 0 && hosts.length === 0) return fail("not_yours", "No owned units.");
  let n = 0;
  let outOfRange = false;
  // A CIWS holds the forced aim until Stop, a new order, or the target is gone. Rockets still cut in.
  for (const e of mounts) {
    if (t && e.id === t.id) continue;
    e.order = t
      ? { kind: "forceattack", targetId: t.id, x: t.x, y: t.y }
      : { kind: "forceattack", x, y };
    e.attackTarget = t ? t.id : null;
    e.state = "attack";
    n++;
  }
  for (const e of units) {
    if (!fires(e.type)) continue;
    if (e.state === "deploy" || e.state === "undeploy") continue;
    if (t && e.id === t.id) continue;
    e.harvestTile = null;
    e.guardFacing = null;
    const oneShot = !!once || isSmokeShell(pickLoadedShell(e.ammo, e.shell));
    if (t) {
      e.order = { kind: "forceattack", targetId: t.id, x: t.x, y: t.y, once: oneShot || undefined };
      e.attackTarget = t.id;
    } else {
      e.order = { kind: "forceattack", x, y, once: oneShot || undefined };
      e.attackTarget = null;
    }
    e.state = e.garrisonedIn ? "garrison" : "attack";
    if (e.garrisonedIn) {
      n++;
      continue;
    }
    if (e.holdPosition) {
      e.waypoints = [];
      n++;
      continue;
    }
    if (t) {
      if (wantsCapture(e, t)) pathToCapture(state, e, t);
      else setPath(state, e, t.x, t.y);
    } else {
      setPath(state, e, x, y);
    }
    n++;
  }
  const aim = t ? { x: t.x, y: t.y } : { x, y };
  for (const host of hosts) {
    if (t && host.id === t.id) continue;
    const shooters = livingGarrison(state, host).filter(
      (u) => u.ownerId === playerId && garrisonCanShoot(state, u, host),
    );
    if (shooters.length === 0) continue;
    const reached = shooters.some((u) => garrisonShotReaches(state, u, aim.x, aim.y, t));
    const hostAims = fires(host.type) || radarLaidOf(host.type);
    // A gun on the host closes the range itself. A building only keeps an aim someone can already reach.
    if (!reached && !hostAims) {
      outOfRange = true;
      continue;
    }
    if (host.order?.kind !== "forceattack") {
      host.order = t
        ? { kind: "forceattack", targetId: t.id, x: t.x, y: t.y }
        : { kind: "forceattack", x, y };
      host.attackTarget = t ? t.id : null;
      host.waypoints = [];
    }
    n++;
  }
  if (n > 0) relayGarrisonForce(state);
  if (n === 0) return fail("busy", outOfRange ? "Out of range." : "No guns in that selection.");
  return ok();
}

/** Selected garrison hosts this player holds. A transport's bay is a drop, not a firing slit. */
function forceHosts(state: MatchState, playerId: string, ids: number[]): Entity[] {
  const out: Entity[] = [];
  const seen = new Set<number>();
  for (const id of ids) {
    const e = state.entities.get(id);
    if (!e || e.hp <= 0 || e.wreck || e.garrison.length === 0 || seen.has(e.id)) continue;
    if (isTransportType(e.type)) continue;
    if (e.kind !== "unit" && e.kind !== "building") continue;
    if (garrisonOwner(state, e) !== playerId) continue;
    seen.add(e.id);
    out.push(e);
  }
  return out;
}

function cmdAttack(state: MatchState, playerId: string, ids: number[], targetId: number): CmdResult {
  let t = state.entities.get(targetId);
  if (!t || t.hp <= 0) return fail("not_found", "No such target.");
  if (t.garrisonedIn) t = state.entities.get(t.garrisonedIn) ?? t;
  const units = owned(state, playerId, ids);
  if (units.length === 0) return fail("not_yours", "No owned units.");
  for (const e of units) {
    if (!fires(e.type)) continue;
    if (e.state === "deploy" || e.state === "undeploy") continue;
    if (e.id === t.id) continue;
    e.order = { kind: "attack", targetId: t.id };
    e.attackTarget = t.id;
    e.guardFacing = null;
    e.state = e.garrisonedIn ? "garrison" : "attack";
    if (e.garrisonedIn) continue;
    if (e.holdPosition) {
      e.waypoints = [];
      continue;
    }
    if (wantsCapture(e, t)) pathToCapture(state, e, t);
    else setPath(state, e, t.x, t.y);
  }
  return ok();
}

function cmdHold(state: MatchState, playerId: string, ids: number[], hold: boolean): CmdResult {
  const units = owned(state, playerId, ids);
  if (units.length === 0) return fail("not_yours", "No owned units.");
  for (const e of units) {
    if (e.state === "deploy" || e.state === "undeploy") continue;
    e.holdPosition = hold;
    e.returnToBase = false;
    if (!hold) {
      dropGuard(e);
      continue;
    }
    if (
      e.order?.kind === "withdraw" ||
      e.order?.kind === "move" ||
      e.order?.kind === "attackmove" ||
      (e.order?.kind === "guard" && e.order.targetId != null)
    ) {
      e.order = null;
      e.attackTarget = null;
      e.waypoints = [];
      e.state = e.garrisonedIn ? "garrison" : "idle";
      continue;
    }
    if (e.order?.kind === "attack" || e.order?.kind === "forceattack") e.waypoints = [];
  }
  return ok();
}

function cmdRotate(state: MatchState, playerId: string, ids: number[], x: number, y: number): CmdResult {
  const units = owned(state, playerId, ids).filter(
    (e) => e.state !== "deploy" && e.state !== "undeploy" && !e.garrisonedIn,
  );
  const mounts = ownedMounts(state, playerId, ids);
  const lamps = ownedLamps(state, playerId, ids);
  if (units.length === 0 && mounts.length === 0 && lamps.length === 0) return fail("not_yours", "No owned units.");
  // The lamp swings over at its own pace; see tickSpotlights.
  for (const e of lamps) {
    e.spotFacing = spotFacingOf(e);
    e.spotAim = Math.atan2(y - e.y, x - e.x);
  }
  // A CIWS rests its gun on this heading between targets, and drops a forced aim.
  for (const e of mounts) {
    e.facing = Math.atan2(y - e.y, x - e.x);
    e.order = null;
    e.attackTarget = null;
    e.state = "idle";
  }
  for (const e of units) {
    e.order = { kind: "rotate", x, y };
    e.returnToBase = false;
    e.attackTarget = null;
    e.harvestTile = null;
    stopHaulerLoop(e);
    e.waypoints = [];
    e.state = "idle";
    if (e.guardFacing != null) e.guardFacing = Math.atan2(y - e.y, x - e.x);
  }
  return ok();
}

function cmdGuard(
  state: MatchState,
  playerId: string,
  ids: number[],
  x?: number,
  y?: number,
  facing?: number,
  targetId?: number,
): CmdResult {
  if (targetId != null) return cmdGuardUnit(state, playerId, ids, targetId);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(facing)) {
    return fail("bad_payload", "Bad guard point.");
  }
  const px = x!;
  const py = y!;
  const face = facing!;
  const units = owned(state, playerId, ids).filter((e) => e.state !== "deploy" && e.state !== "undeploy");
  if (units.length === 0) return fail("not_yours", "No owned units.");
  const movers = units.filter((e) => !e.garrisonedIn);
  const dests = groupMoveTargets(state, movers, px, py);
  const pace = groupMovePace(movers);
  for (const e of units) {
    const d = dests.get(e.id) ?? { x: px, y: py };
    e.holdPosition = true;
    e.returnToBase = false;
    e.guardFacing = face;
    e.attackTarget = null;
    e.harvestTile = null;
    stopHaulerLoop(e);
    e.order = { kind: "guard", x: d.x, y: d.y, facing: face };
    if (pace != null) e.order.pace = pace;
    if (e.garrisonedIn) {
      exitGarrison(state, e, d);
      e.order = { kind: "guard", x: d.x, y: d.y, facing: face };
      if (pace != null) e.order.pace = pace;
      e.holdPosition = true;
      e.guardFacing = face;
      continue;
    }
    e.state = "move";
    setPath(state, e, d.x, d.y);
  }
  return ok();
}

function cmdGuardUnit(state: MatchState, playerId: string, ids: number[], targetId: number): CmdResult {
  const t = state.entities.get(targetId);
  if (!t || t.hp <= 0 || t.kind !== "unit" || t.wreck || t.garrisonedIn) {
    return fail("not_found", "No such unit.");
  }
  if (!allies(state, playerId, t.ownerId)) return fail("not_found", "Guard a friendly unit.");
  const units = owned(state, playerId, ids).filter(
    (e) => e.id !== t.id && e.state !== "deploy" && e.state !== "undeploy",
  );
  if (units.length === 0) return fail("not_yours", "No owned units.");
  for (const e of units) {
    const d = escortAnchor(e, t);
    e.holdPosition = false;
    e.returnToBase = false;
    e.guardFacing = null;
    e.attackTarget = null;
    e.harvestTile = null;
    stopHaulerLoop(e);
    e.order = { kind: "guard", targetId: t.id };
    if (e.garrisonedIn) {
      exitGarrison(state, e, d);
      e.order = { kind: "guard", targetId: t.id };
      e.holdPosition = false;
      e.guardFacing = null;
      continue;
    }
    e.state = "move";
    setPath(state, e, d.x, d.y);
  }
  return ok();
}

function dropGuard(e: Entity): void {
  e.guardFacing = null;
  if (e.order?.kind !== "guard") return;
  if (e.order.targetId != null) {
    e.order = null;
    e.waypoints = [];
    e.attackTarget = null;
    if (e.state === "move" || e.state === "attack") e.state = e.garrisonedIn ? "garrison" : "idle";
    return;
  }
  if (e.waypoints.length > 0 && e.order.x != null && e.order.y != null) {
    const pace = e.order.pace;
    e.order = { kind: "move", x: e.order.x, y: e.order.y };
    if (pace != null) e.order.pace = pace;
    return;
  }
  e.order = null;
  if (e.state === "move" || e.state === "attack") e.state = e.garrisonedIn ? "garrison" : "idle";
}

function cmdGarrison(state: MatchState, playerId: string, ids: number[], buildingId: number): CmdResult {
  const house = state.entities.get(buildingId);
  if (!house || house.hp <= 0 || !isGarrisonable(house.type)) return fail("not_found", "No such building.");
  const units = owned(state, playerId, ids).filter((e) => isInfantryType(e.type));
  if (units.length === 0) return fail("not_yours", "Select infantry.");
  let n = 0;
  for (const e of units) {
    const err = canGarrison(state, e, house);
    if (err) continue;
    if (e.garrisonedIn === house.id) continue;
    if (e.garrisonedIn) exitGarrison(state, e);
    e.order = { kind: "garrison", targetId: house.id };
    e.attackTarget = null;
    e.harvestTile = null;
    e.guardFacing = null;
    e.state = "move";
    const door = approachTile(state, house);
    if (door) setPath(state, e, door.x * state.tileSize + state.tileSize / 2, door.y * state.tileSize + state.tileSize / 2);
    n++;
  }
  if (n === 0) return fail("busy", canGarrison(state, units[0]!, house) ?? "Cannot garrison.");
  return ok();
}

/** Transports on their pads swap the load in the bay. */
function cmdPayload(state: MatchState, playerId: string, ids: number[], payload: AirDrop): CmdResult {
  if (!Array.isArray(ids)) return fail("bad_payload", "Bad load order.");
  const planes = owned(state, playerId, ids).filter((e) => isTransportType(e.type));
  if (planes.length === 0) return fail("not_yours", "Select a transport.");
  let err: string | null = null;
  let done = 0;
  for (const e of planes) {
    const why = setPayload(state, e, payload);
    if (why) err = why;
    else done++;
  }
  return done > 0 ? ok() : wrap(err, "busy");
}

function cmdUnboard(state: MatchState, playerId: string, ids?: number[], truckId?: number): CmdResult {
  const plane = truckId != null ? state.entities.get(truckId) : undefined;
  if (plane && isTransportType(plane.type)) {
    if (plane.ownerId !== playerId) return fail("not_yours", "Not your plane.");
    return wrap(unloadPlane(state, plane), "busy");
  }
  const truck =
    truckId != null
      ? state.entities.get(truckId)
      : ids
          ?.map((id) => state.entities.get(id))
          .find((e) => e && e.type === "supply" && e.ownerId === playerId);
  const fromRider =
    !truck && ids
      ? ids
          .map((id) => state.entities.get(id))
          .map((e) => (e?.garrisonedIn != null ? state.entities.get(e.garrisonedIn) : undefined))
          .find((e) => e?.type === "supply")
      : undefined;
  const host = truck ?? fromRider;
  if (!host || host.type !== "supply") return fail("not_found", "No such truck.");
  if (host.ownerId !== playerId) return fail("not_yours", "Not your truck.");
  return wrap(dismountSupply(state, host), "busy");
}

function cmdUngarrison(
  state: MatchState,
  playerId: string,
  ids?: number[],
  buildingId?: number,
  x?: number,
  y?: number,
): CmdResult {
  const dest = x != null && y != null ? { x, y } : undefined;
  const units: Entity[] = [];
  if (buildingId != null) {
    const house = state.entities.get(buildingId);
    if (!house) return fail("not_found", "No such building.");
    for (const u of livingGarrison(state, house)) {
      if (u.ownerId === playerId) units.push(u);
    }
  } else if (ids) {
    for (const e of owned(state, playerId, ids)) {
      if (e.garrisonedIn) units.push(e);
    }
  }
  if (units.length === 0) return fail("not_yours", "No garrisoned infantry.");
  for (const e of units) exitGarrison(state, e, dest);
  return ok();
}

function cmdScout(state: MatchState, playerId: string, ids: number[], out: boolean): CmdResult {
  const units = owned(state, playerId, ids).filter((e) => hasScout(e.type));
  if (units.length === 0) return fail("not_yours", "Select a tank.");
  let n = 0;
  let dead = 0;
  for (const e of units) {
    if (e.scoutHp <= 0) {
      dead++;
      continue;
    }
    const err = setScoutOut(state, e, out);
    if (!err) n++;
  }
  if (n === 0 && dead > 0) return fail("busy", "Scout is dead.");
  if (n === 0) return fail("busy", "Cannot open the hatch.");
  return ok();
}

function cmdGarrisonHide(state: MatchState, playerId: string, ids: number[], hide: boolean): CmdResult {
  const houses: Entity[] = [];
  const seen = new Set<number>();
  for (const id of ids) {
    const e = state.entities.get(id);
    if (!e || e.hp <= 0) continue;
    let house: Entity | undefined;
    if (isGarrisonable(e.type)) house = e;
    else if (e.ownerId === playerId && e.garrisonedIn != null) house = state.entities.get(e.garrisonedIn);
    if (!house || seen.has(house.id)) continue;
    if (garrisonOwner(state, house) !== playerId) continue;
    seen.add(house.id);
    houses.push(house);
  }
  if (houses.length === 0) return fail("not_yours", "No garrisoned building.");
  for (const h of houses) setGarrisonHide(state, h, hide);
  return ok();
}

function cmdStop(state: MatchState, playerId: string, ids: number[]): CmdResult {
  const hq = hqOf(state, playerId);
  for (const id of ids) {
    const e = state.entities.get(id);
    if (!e) continue;
    const holdsGarrison = e.garrison.length > 0 && garrisonOwner(state, e) === playerId;
    if (e.ownerId !== playerId && !holdsGarrison) continue;
    if (e.state === "deploy" || e.state === "undeploy") continue;
    clearOrder(e);
    if (e.type === "hauler") e.autoHarvest = false;
    for (const u of livingGarrison(state, e)) {
      if (u.ownerId === playerId && u.order?.relay) clearOrder(u);
    }
  }
  void hq;
  return ok();
}

function cmdHarvest(
  state: MatchState,
  playerId: string,
  ids: number[],
  tileX?: number,
  tileY?: number,
): CmdResult {
  const units = owned(state, playerId, ids).filter((e) => e.type === "hauler" && e.cartHp > 0);
  if (units.length === 0) {
    const any = owned(state, playerId, ids).some((e) => e.type === "hauler");
    return fail(any ? "cart" : "not_yours", any ? "Cart is off. It has to refit at the Smelter." : "Select a Mauler.");
  }
  for (const e of units) {
    e.autoHarvest = true;
    e.returnToBase = false;
    e.state = "harvest";
    e.guardFacing = null;
    if (tileX != null && tileY != null) {
      e.order = { kind: "harvest", tileX, tileY };
      e.harvestTile = { x: tileX, y: tileY };
      const ts = state.tileSize;
      setPath(state, e, tileX * ts + ts / 2, tileY * ts + ts / 2);
    } else {
      e.order = { kind: "harvest" };
      e.harvestTile = null;
    }
  }
  return ok();
}

function cmdAmmo(state: MatchState, playerId: string, ids: number[], shell: ShellType): CmdResult {
  const guns = owned(state, playerId, ids).filter((e) => hasAmmo(e.type));
  if (guns.length === 0) return fail("not_yours", "No guns with a rack.");
  const units = guns.filter((e) => carriesShell(e.type, shell));
  if (units.length === 0) return fail("bad_payload", "No selected gun carries that shell.");
  for (const e of units) e.shell = shell;
  return ok();
}

function cmdRockets(state: MatchState, playerId: string, ids: number[], on: boolean): CmdResult {
  // A RAM holds its barrage and its interceptors the same way.
  const units = [...owned(state, playerId, ids), ...ownedMounts(state, playerId, ids)].filter((e) => rocketsOf(e.type));
  if (units.length === 0) return fail("not_yours", "Select a Titan, a Nebelwerfer, or a RAM.");
  for (const e of units) {
    e.rocketsOff = on ? undefined : true;
    // Switching off mid-salvo holds the rest in the rack.
    if (!on) e.rocketSalvo = 0;
  }
  return ok();
}

function cmdReach(state: MatchState, playerId: string, ids: number[], max: boolean): CmdResult {
  const mounts = ownedMounts(state, playerId, ids);
  if (mounts.length === 0) return fail("not_yours", "Select a CIWS or a RAM.");
  for (const e of mounts) e.longRange = max ? true : undefined;
  return ok();
}

function cmdGuns(state: MatchState, playerId: string, ids: number[], guns: 1 | 2): CmdResult {
  const units = owned(state, playerId, ids).filter((e) => e.type === "walker");
  if (units.length === 0) return fail("not_yours", "Select a Walker.");
  for (const e of units) e.gatlingGuns = guns;
  return ok();
}

function cmdSelfDestruct(state: MatchState, playerId: string, ids: number[], on: boolean): CmdResult {
  const units = owned(state, playerId, ids).filter((e) => e.type === "walker");
  if (units.length === 0) return fail("not_yours", "Select a Walker.");
  for (const e of units) {
    e.selfDestructOff = on ? undefined : true;
    // The charge is a move order, and the swollen hit points have to come off
    // with it. Waiting for the next charge tick would leave him huge and running.
    if (!on) endWalkerCharge(e);
  }
  return ok();
}

function cmdWeapon(
  state: MatchState,
  playerId: string,
  ids: number[],
  weapon: InfantryWeaponId,
): CmdResult {
  const units = owned(state, playerId, ids).filter((e) => isInfantryType(e.type));
  if (units.length === 0) return fail("not_yours", "Select infantry.");
  let n = 0;
  let armed = 0;
  for (const e of units) {
    const carriesPistol = infantryLoadout(e.type).some((g) => g.id === "handgun");
    if (hasCrit(e, "arm") && !(carriesPistol && weapon === "handgun")) {
      armed++;
      continue;
    }
    const gun = infantryLoadout(e.type).find((g) => g.id === weapon);
    if (!gun) continue;
    const live = infantryGunFor(e);
    // The Rocketer's tube and his one heavy missile are separate stores.
    // Switching onto the heavy round arms it, unless it is already on the tube.
    if (e.type === "rocketer") {
      if (live?.id !== weapon) {
        e.weapon = weapon;
        e.cooldown = 0;
        if (weapon === "penetrator") {
          e.reload = (e.heavy ?? 0) > 0 ? PENETRATOR_ARM_SECONDS : 0;
        } else {
          e.reload = e.clip <= 0 ? reloadSecondsOf(gun, e.reloadMul) : 0;
        }
      }
      n++;
      continue;
    }
    e.weapon = weapon;
    if (live?.id !== weapon) {
      e.clip = gun.clip;
      e.reload = 0;
    }
    n++;
  }
  if (n === 0) {
    if (armed > 0) {
      const pistol = units.some((e) => infantryLoadout(e.type).some((g) => g.id === "handgun"));
      return fail("busy", pistol ? "Broken arm — can only use the handgun." : "Broken arm — cannot fire.");
    }
    return fail("busy", "That unit cannot carry that weapon.");
  }
  return ok();
}

function cmdStance(state: MatchState, playerId: string, ids: number[], stance: Stance): CmdResult {
  const units = owned(state, playerId, ids).filter(
    (e) => isInfantryType(e.type) && e.type !== "engineer" && e.type !== "cyborg",
  );
  if (units.length === 0) return fail("not_yours", "Select infantry.");
  let n = 0;
  for (const e of units) {
    if (hasCrit(e, "leg") && stance !== "crawl") continue;
    e.stanceOrder = stance;
    n++;
  }
  tickStance(state);
  if (n === 0) return fail("busy", "Broken leg — can only crawl.");
  return ok();
}
