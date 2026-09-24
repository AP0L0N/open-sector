import {
  fires,
  hasAmmo,
  hasCrit,
  hasScout,
  infantryGunFor,
  infantryLoadout,
  isBuildingType,
  isFieldStructure,
  isGarrisonable,
  isInfantryType,
  isInfantryWeaponId,
  isShellType,
  isSmokeShell,
  isStance,
  isTrainType,
  pickLoadedShell,
  type InfantryWeaponId,
  type ShellType,
  type Stance,
} from "../catalog.js";
import type { ClientMessage, ErrorCode } from "../protocol.js";
import { pathToCapture, wantsCapture } from "./capture.js";
import { allies, clearOrder, hqOf } from "./geo.js";
import { approachTile, canGarrison, exitGarrison, garrisonOwner, livingGarrison, setGarrisonHide } from "./garrison.js";
import { setScoutOut } from "./scout.js";
import { cancelStructure, pauseStructure, placeBuilding, sellBuilding, startBuild } from "./build.js";
import { orderCover, orderFieldBuild, orderRepair } from "./field.js";
import { deployId } from "./deploy.js";
import { cancelTrain, pauseTrain, startTrain } from "./train.js";
import { groupMovePace, groupMoveTargets } from "./formation.js";
import { escortAnchor } from "./orders.js";
import { setPath } from "./path.js";
import { tickStance } from "./stance.js";
import type { Entity, MatchState } from "./types.js";

export type CmdResult = { ok: true } | { ok: false; code: ErrorCode; message: string };

const ok = (): CmdResult => ({ ok: true });
const fail = (code: ErrorCode, message: string): CmdResult => ({ ok: false, code, message });

export function applyCommand(state: MatchState, playerId: string, msg: ClientMessage): CmdResult {
  if (state.ended) return fail("ended", "Match is over.");
  const p = state.players.get(playerId);
  if (!p) return fail("not_member", "You are not in this match.");
  if (!p.alive && msg.type.startsWith("cmd.")) return fail("dead", "Your Core is down.");

  switch (msg.type) {
    case "cmd.move":
      return cmdMove(state, playerId, msg.ids, msg.x, msg.y);
    case "cmd.attack":
      return cmdAttack(state, playerId, msg.ids, msg.targetId);
    case "cmd.attackmove":
      return cmdAttackMove(state, playerId, msg.ids, msg.x, msg.y);
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
    case "cmd.guns":
      if (msg.guns !== 1 && msg.guns !== 2) return fail("bad_payload", "Unknown gatling setting.");
      return cmdGuns(state, playerId, msg.ids, msg.guns);
    case "cmd.build":
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
      return wrap(
        orderFieldBuild(state, playerId, owned(state, playerId, msg.ids), msg.structure, msg.x, msg.y, msg.facing),
        "invalid_place",
      );
    case "cmd.repair":
      return wrap(orderRepair(state, playerId, owned(state, playerId, msg.ids), msg.targetId), "not_found");
    case "cmd.cover":
      return wrap(orderCover(state, owned(state, playerId, msg.ids), msg.targetId), "not_found");
    default:
      return fail("bad_payload", "Unknown command.");
  }
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
    if (e && e.ownerId === playerId && e.hp > 0 && e.kind === "unit" && !e.wreck) out.push(e);
  }
  return out;
}

function cmdMove(state: MatchState, playerId: string, ids: number[], x: number, y: number): CmdResult {
  const units = owned(state, playerId, ids);
  if (units.length === 0) return fail("not_yours", "No owned units.");
  const movers = units.filter((e) => e.state !== "deploy" && e.state !== "undeploy");
  const dests = groupMoveTargets(state, movers, x, y);
  const pace = groupMovePace(movers);
  for (const e of movers) {
    const d = dests.get(e.id) ?? { x, y };
    if (e.garrisonedIn) {
      e.guardFacing = null;
      exitGarrison(state, e, d);
      if (pace != null && e.order) e.order.pace = pace;
      continue;
    }
    e.order = { kind: "move", x: d.x, y: d.y };
    if (pace != null) e.order.pace = pace;
    e.returnToBase = false;
    e.attackTarget = null;
    e.harvestTile = null;
    e.guardFacing = null;
    e.state = "move";
    setPath(state, e, d.x, d.y);
  }
  return ok();
}

function cmdAttackMove(state: MatchState, playerId: string, ids: number[], x: number, y: number): CmdResult {
  const units = owned(state, playerId, ids);
  if (units.length === 0) return fail("not_yours", "No owned units.");
  const movers = units.filter((e) => e.state !== "deploy" && e.state !== "undeploy");
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
  if (units.length === 0) return fail("not_yours", "No owned units.");
  let n = 0;
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
  if (n === 0) return fail("busy", "No guns in that selection.");
  return ok();
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
  if (units.length === 0) return fail("not_yours", "No owned units.");
  for (const e of units) {
    e.order = { kind: "rotate", x, y };
    e.returnToBase = false;
    e.attackTarget = null;
    e.harvestTile = null;
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
    if (!e || e.ownerId !== playerId) continue;
    if (e.state === "deploy" || e.state === "undeploy") continue;
    clearOrder(e);
    if (e.type === "hauler") e.autoHarvest = false;
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
  const units = owned(state, playerId, ids).filter((e) => hasAmmo(e.type));
  if (units.length === 0) return fail("not_yours", "No guns with a rack.");
  for (const e of units) e.shell = shell;
  return ok();
}

function cmdGuns(state: MatchState, playerId: string, ids: number[], guns: 1 | 2): CmdResult {
  const units = owned(state, playerId, ids).filter((e) => e.type === "walker");
  if (units.length === 0) return fail("not_yours", "Select a Walker.");
  for (const e of units) e.gatlingGuns = guns;
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
  const units = owned(state, playerId, ids).filter((e) => isInfantryType(e.type) && e.type !== "engineer");
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
