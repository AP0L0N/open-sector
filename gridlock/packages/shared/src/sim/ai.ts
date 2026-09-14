/** Easy CPU: build an economy, train a modest army, push now and then. */

import {
  BUILD_RADIUS,
  TICK_HZ,
  catalog,
  fires,
  type BuildingType,
  type TrainType,
} from "../catalog.js";
import { applyCommand } from "./commands.js";
import { allies, hasCore, hqOf, inBuildRadius, tilesBlockedOrScrap } from "./geo.js";
import { powerOf } from "./power.js";
import type { Entity, MatchState, SimPlayer } from "./types.js";

export const EASY_ATTACK_FIRST_TICKS = 90 * TICK_HZ;
export const EASY_ATTACK_EVERY_TICKS = 70 * TICK_HZ;
export const EASY_ATTACK_RETRY_TICKS = 10 * TICK_HZ;
export const EASY_MIN_FIGHTERS = 6;
export const EASY_WANT_HAULERS = 2;
export const EASY_WANT_TROOPERS = 10;
export const EASY_WANT_WARDENS = 4;
const TRAIN_QUEUE_SOFT = 2;

const BUILD_ORDER: readonly BuildingType[] = ["dynamo", "smelter", "muster", "armory"];

export function tickAi(state: MatchState): void {
  if (state.ended) return;
  for (const p of state.players.values()) {
    if (!p.ai || !p.alive) continue;
    thinkEasy(state, p);
  }
}

function thinkEasy(state: MatchState, p: SimPlayer): void {
  const hq = hqOf(state, p.playerId);
  if (!hq) return;
  if (!hasCore(state, p.playerId)) {
    if (hq.type === "rig" && hq.state !== "deploy") {
      applyCommand(state, p.playerId, { type: "cmd.deploy", id: hq.id });
    }
    return;
  }

  if (p.structure?.ready) {
    const spot = findBuildTile(state, p.playerId, p.structure.type);
    if (spot) {
      applyCommand(state, p.playerId, {
        type: "cmd.place",
        building: p.structure.type,
        tx: spot.tx,
        ty: spot.ty,
      });
    }
    return;
  }

  if (!p.structure) {
    const next = nextBuilding(state, p);
    if (next && p.scrap >= catalog(next).cost) {
      applyCommand(state, p.playerId, { type: "cmd.build", building: next });
    }
  }

  harvestIdle(state, p);
  trainEasy(state, p);
  maybeAttack(state, p);
}

function nextBuilding(state: MatchState, p: SimPlayer): BuildingType | null {
  for (const t of BUILD_ORDER) {
    if (countType(state, p.playerId, t) === 0) return t;
  }
  const pow = powerOf(state, p.playerId);
  if (pow.used >= pow.provided) return "dynamo";
  return null;
}

function trainEasy(state: MatchState, p: SimPlayer): void {
  const saving = nextBuilding(state, p);
  const reserve = saving ? catalog(saving).cost : 0;
  const tryTrain = (unit: TrainType, want: number): boolean => {
    if (countType(state, p.playerId, unit) >= want) return false;
    if (queuedAt(state, p.playerId, unit) >= TRAIN_QUEUE_SOFT) return false;
    if (p.scrap < catalog(unit).cost + reserve) return false;
    const res = applyCommand(state, p.playerId, { type: "cmd.train", unit });
    return res.ok;
  };
  if (tryTrain("hauler", EASY_WANT_HAULERS)) return;
  if (tryTrain("trooper", EASY_WANT_TROOPERS)) return;
  tryTrain("warden", EASY_WANT_WARDENS);
}

function harvestIdle(state: MatchState, p: SimPlayer): void {
  const ids: number[] = [];
  for (const e of state.entities.values()) {
    if (e.ownerId !== p.playerId || e.type !== "hauler" || e.hp <= 0 || e.wreck) continue;
    if (e.autoHarvest || e.order?.kind === "harvest" || e.state === "harvest" || e.state === "unload") {
      continue;
    }
    if (e.cargo > 0) continue;
    ids.push(e.id);
  }
  if (ids.length === 0) return;
  applyCommand(state, p.playerId, { type: "cmd.harvest", ids });
}

function maybeAttack(state: MatchState, p: SimPlayer): void {
  if (state.tick < p.aiNextAttackTick) return;
  const fighters = combatIds(state, p.playerId);
  if (fighters.length < EASY_MIN_FIGHTERS) {
    p.aiNextAttackTick = state.tick + EASY_ATTACK_RETRY_TICKS;
    return;
  }
  const target = enemyHq(state, p.playerId);
  if (!target) {
    p.aiNextAttackTick = state.tick + EASY_ATTACK_RETRY_TICKS;
    return;
  }
  applyCommand(state, p.playerId, {
    type: "cmd.attackmove",
    ids: fighters,
    x: target.x,
    y: target.y,
  });
  p.aiNextAttackTick = state.tick + EASY_ATTACK_EVERY_TICKS;
}

function combatIds(state: MatchState, playerId: string): number[] {
  const ids: number[] = [];
  for (const e of state.entities.values()) {
    if (e.ownerId !== playerId || e.hp <= 0 || e.wreck || e.garrisonedIn) continue;
    if (e.kind !== "unit" || !fires(e.type)) continue;
    if (e.state === "deploy" || e.state === "undeploy") continue;
    ids.push(e.id);
  }
  return ids;
}

function enemyHq(state: MatchState, playerId: string): Entity | undefined {
  let best: Entity | undefined;
  let bestD = Infinity;
  const me = hqOf(state, playerId);
  for (const o of state.players.values()) {
    if (!o.alive || o.playerId === playerId) continue;
    if (allies(state, playerId, o.playerId)) continue;
    const hq = hqOf(state, o.playerId);
    if (!hq) continue;
    const d = me ? (hq.x - me.x) ** 2 + (hq.y - me.y) ** 2 : 0;
    if (d < bestD) {
      bestD = d;
      best = hq;
    }
  }
  return best;
}

export function findBuildTile(
  state: MatchState,
  playerId: string,
  type: BuildingType,
): { tx: number; ty: number } | null {
  const def = catalog(type);
  const hq = hqOf(state, playerId);
  if (!hq) return null;
  const maxR = BUILD_RADIUS + Math.max(def.tileW, def.tileH);
  for (let r = 1; r <= maxR; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const tx = hq.tileX + dx;
        const ty = hq.tileY + dy;
        if (tilesBlockedOrScrap(state, tx, ty, def.tileW, def.tileH)) continue;
        if (!inBuildRadius(state, playerId, tx, ty, def.tileW, def.tileH, BUILD_RADIUS)) continue;
        return { tx, ty };
      }
    }
  }
  return null;
}

function countType(state: MatchState, playerId: string, type: string): number {
  let n = 0;
  for (const e of state.entities.values()) {
    if (e.ownerId !== playerId || e.hp <= 0) continue;
    if (e.type === type) n++;
    for (const j of e.queue) {
      if (j.type === type) n++;
    }
  }
  return n;
}

function queuedAt(state: MatchState, playerId: string, type: TrainType): number {
  let n = 0;
  for (const e of state.entities.values()) {
    if (e.ownerId !== playerId || e.hp <= 0) continue;
    for (const j of e.queue) {
      if (j.type === type) n++;
    }
  }
  return n;
}
