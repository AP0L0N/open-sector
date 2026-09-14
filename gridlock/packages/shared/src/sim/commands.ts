import { fires, isBuildingType, isTrainType } from "../catalog.js";
import type { ClientMessage, ErrorCode } from "../protocol.js";
import { clearOrder, hqOf } from "./geo.js";
import { cancelStructure, placeBuilding, sellBuilding, startBuild } from "./build.js";
import { deployId } from "./deploy.js";
import { cancelTrain, pauseTrain, startTrain } from "./train.js";
import { groupMoveTargets } from "./formation.js";
import { setPath } from "./path.js";
import type { MatchState } from "./types.js";

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
    case "cmd.stop":
      return cmdStop(state, playerId, msg.ids);
    case "cmd.harvest":
      return cmdHarvest(state, playerId, msg.ids, msg.tileX, msg.tileY);
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
      if (msg.what !== "train") return fail("bad_payload", "Unknown pause.");
      if (msg.unit != null && !isTrainType(msg.unit)) return fail("bad_payload", "Unknown unit.");
      return wrap(pauseTrain(state, playerId, { jobId: msg.jobId, unit: msg.unit }), "busy");
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
    if (e && e.ownerId === playerId && e.hp > 0 && e.kind === "unit") out.push(e);
  }
  return out;
}

function cmdMove(state: MatchState, playerId: string, ids: number[], x: number, y: number): CmdResult {
  const units = owned(state, playerId, ids);
  if (units.length === 0) return fail("not_yours", "No owned units.");
  const movers = units.filter((e) => e.state !== "deploy" && e.state !== "undeploy");
  const dests = groupMoveTargets(state, movers, x, y);
  for (const e of movers) {
    const d = dests.get(e.id) ?? { x, y };
    e.order = { kind: "move", x: d.x, y: d.y };
    e.attackTarget = null;
    e.harvestTile = null;
    e.state = "move";
    setPath(state, e, d.x, d.y);
  }
  return ok();
}

function cmdAttack(state: MatchState, playerId: string, ids: number[], targetId: number): CmdResult {
  const t = state.entities.get(targetId);
  if (!t || t.hp <= 0) return fail("not_found", "No such target.");
  const units = owned(state, playerId, ids);
  if (units.length === 0) return fail("not_yours", "No owned units.");
  for (const e of units) {
    if (!fires(e.type)) continue;
    if (e.state === "deploy" || e.state === "undeploy") continue;
    e.order = { kind: "attack", targetId };
    e.attackTarget = targetId;
    e.state = "attack";
    setPath(state, e, t.x, t.y);
  }
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

function cmdHarvest(state: MatchState, playerId: string, ids: number[], tileX: number, tileY: number): CmdResult {
  const units = owned(state, playerId, ids).filter((e) => e.type === "hauler");
  if (units.length === 0) return fail("not_yours", "Select a Mauler.");
  for (const e of units) {
    e.order = { kind: "harvest", tileX, tileY };
    e.harvestTile = { x: tileX, y: tileY };
    e.autoHarvest = true;
    e.state = "harvest";
    const ts = state.tileSize;
    setPath(state, e, tileX * ts + ts / 2, tileY * ts + ts / 2);
  }
  return ok();
}
