import {
  CAPTURE_DECAY_PER_SEC,
  CAPTURE_HP_REF,
  CAPTURE_SECONDS,
  CAPTURE_SECONDS_MIN,
  NEUTRAL_OWNER,
  catalog,
  isInfantryType,
} from "../catalog.js";
import { adjacentToBuilding, allies, tileCenter } from "./geo.js";
import { approachTile, spillGarrison } from "./garrison.js";
import { setPath } from "./path.js";
import type { Entity, MatchState } from "./types.js";

export function wantsCapture(unit: Entity, target: Entity): boolean {
  return (
    isInfantryType(unit.type) &&
    unit.kind === "unit" &&
    !unit.wreck &&
    unit.garrisonedIn == null &&
    target.kind === "building" &&
    !target.wreck &&
    target.hp > 0
  );
}

export function captureDurationSec(building: Entity): number {
  return Math.max(CAPTURE_SECONDS_MIN, CAPTURE_SECONDS * (building.hpMax / CAPTURE_HP_REF));
}

export function pathToCapture(state: MatchState, unit: Entity, building: Entity): void {
  const door = approachTile(state, building);
  const ts = state.tileSize;
  if (door) setPath(state, unit, tileCenter(door.x, ts), tileCenter(door.y, ts));
  else setPath(state, unit, building.x, building.y);
}

export function isCapturing(state: MatchState, unit: Entity, building: Entity): boolean {
  if (!wantsCapture(unit, building) || unit.hp <= 0) return false;
  if (unit.ownerId === building.ownerId) return false;
  if (building.ownerId && building.ownerId !== NEUTRAL_OWNER && allies(state, unit.ownerId, building.ownerId)) {
    return false;
  }
  const id = building.id;
  const targeting =
    unit.attackTarget === id || (unit.order?.kind === "attack" && unit.order.targetId === id);
  if (!targeting) return false;
  return adjacentToBuilding(state, unit, building);
}

export function tickCapture(state: MatchState, dt: number): void {
  const byBuilding = new Map<number, Map<string, Entity[]>>();
  for (const e of state.entities.values()) {
    if (e.kind !== "unit" || e.hp <= 0) continue;
    const tid = e.attackTarget ?? (e.order?.kind === "attack" ? e.order.targetId : undefined);
    if (tid == null) continue;
    const b = state.entities.get(tid);
    if (!b || b.kind !== "building") continue;
    if (!isCapturing(state, e, b)) continue;
    let owners = byBuilding.get(b.id);
    if (!owners) {
      owners = new Map();
      byBuilding.set(b.id, owners);
    }
    let list = owners.get(e.ownerId);
    if (!list) {
      list = [];
      owners.set(e.ownerId, list);
    }
    list.push(e);
  }

  for (const b of state.entities.values()) {
    if (b.kind !== "building" || b.hp <= 0) continue;
    const owners = byBuilding.get(b.id);
    const groups: { leader: string; units: Entity[] }[] = [];
    if (owners) {
      for (const [pid, units] of owners) {
        const g = groups.find((x) => allies(state, x.leader, pid));
        if (g) g.units.push(...units);
        else groups.push({ leader: pid, units: [...units] });
      }
    }
    if (groups.length === 1) {
      const g = groups[0]!;
      let pid = g.leader;
      const counts = new Map<string, number>();
      for (const u of g.units) counts.set(u.ownerId, (counts.get(u.ownerId) ?? 0) + 1);
      let bestN = 0;
      for (const [id, n] of counts) {
        if (n > bestN || (n === bestN && id === b.captureOwnerId)) {
          bestN = n;
          pid = id;
        }
      }
      const n = g.units.length;
      if (b.captureOwnerId !== pid) {
        b.captureOwnerId = pid;
        b.captureProgress = 0;
      }
      const dur = captureDurationSec(b);
      b.captureProgress = Math.min(1, b.captureProgress + (n / dur) * dt);
      if (b.captureProgress >= 1) completeCapture(state, b, pid, g.units);
    } else if (groups.length === 0 && b.captureProgress > 0) {
      b.captureProgress = Math.max(0, b.captureProgress - CAPTURE_DECAY_PER_SEC * dt);
      if (b.captureProgress <= 0) {
        b.captureProgress = 0;
        b.captureOwnerId = "";
      }
    }
  }
}

function completeCapture(state: MatchState, building: Entity, ownerId: string, capturers: Entity[]): void {
  building.ownerId = ownerId;
  building.captureOwnerId = "";
  building.captureProgress = 0;
  building.queue = [];
  if (building.garrison.length) spillGarrison(state, building, { damage: false });
  state.visionTick = -1;
  const p = state.players.get(ownerId);
  if (p) state.pendingComms.push(`${p.name} captured a ${catalog(building.type).name}.`);
  for (const u of capturers) {
    if (u.order?.kind === "attack" && u.order.targetId === building.id) {
      u.order = null;
      u.attackTarget = null;
      if (u.state === "attack") u.state = "idle";
    } else if (u.attackTarget === building.id) {
      u.attackTarget = null;
    }
  }
}
