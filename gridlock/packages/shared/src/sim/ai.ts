/** Easy CPU: raise a small army and attack-move it at the enemy now and then. */

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
import { smelterDock } from "./harvest.js";
import { powerOf } from "./power.js";
import type { Entity, MatchState, SimPlayer } from "./types.js";

export const EASY_ATTACK_FIRST_TICKS = 70 * TICK_HZ;
export const EASY_ATTACK_EVERY_TICKS = 55 * TICK_HZ;
export const EASY_ATTACK_RETRY_TICKS = 8 * TICK_HZ;
export const EASY_MIN_FIGHTERS = 4;
export const EASY_WANT_HAULERS = 2;
export const EASY_WANT_TROOPERS = 10;
export const EASY_WANT_WARDENS = 4;
const TRAIN_QUEUE_SOFT = 2;
const FIRST_WAVE_TROOPERS = 4;

/** Smelter second so the free Mauler funds Muster, Armory, troops, and tanks. */
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
  } else if (!p.structure) {
    const next = nextBuilding(state, p);
    if (next && canStartBuilding(state, p, next)) {
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

function canStartBuilding(state: MatchState, p: SimPlayer, next: BuildingType): boolean {
  const cost = catalog(next).cost;
  if (p.scrap < cost) return false;
  if (next === "dynamo" || next === "smelter" || next === "muster") return true;
  const troopers = countType(state, p.playerId, "trooper");
  const hold = Math.max(0, FIRST_WAVE_TROOPERS - troopers) * catalog("trooper").cost;
  return p.scrap >= cost + hold;
}

function trainEasy(state: MatchState, p: SimPlayer): void {
  const reserve = trainReserve(state, p);
  const tryTrain = (unit: TrainType, want: number): boolean => {
    if (countType(state, p.playerId, unit) >= want) return false;
    if (queuedAt(state, p.playerId, unit) >= TRAIN_QUEUE_SOFT) return false;
    if (p.scrap < catalog(unit).cost + reserve) return false;
    return applyCommand(state, p.playerId, { type: "cmd.train", unit }).ok;
  };
  if (tryTrain("hauler", EASY_WANT_HAULERS)) return;
  if (tryTrain("trooper", FIRST_WAVE_TROOPERS)) return;
  if (tryTrain("warden", EASY_WANT_WARDENS)) return;
  tryTrain("trooper", EASY_WANT_TROOPERS);
}

/** Hold scrap for the next factory. Do not starve the first troop wave to save for Armory. */
function trainReserve(state: MatchState, p: SimPlayer): number {
  if (p.structure && !p.structure.ready) {
    return Math.max(0, catalog(p.structure.type).cost - p.structure.paid);
  }
  if (countType(state, p.playerId, "dynamo") === 0) return catalog("dynamo").cost;
  if (countType(state, p.playerId, "muster") === 0) return catalog("muster").cost;
  if (countType(state, p.playerId, "trooper") < FIRST_WAVE_TROOPERS) return 0;
  if (countType(state, p.playerId, "armory") === 0) return catalog("armory").cost;
  return 0;
}

function harvestIdle(state: MatchState, p: SimPlayer): void {
  const ids: number[] = [];
  for (const e of state.entities.values()) {
    if (e.ownerId !== p.playerId || e.type !== "hauler" || e.hp <= 0 || e.wreck) continue;
    if (e.returnToBase || e.holdPosition || e.order?.kind === "withdraw") continue;
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
  const fighters = waveIds(state, p.playerId);
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

function waveIds(state: MatchState, playerId: string): number[] {
  const ids: number[] = [];
  for (const e of state.entities.values()) {
    if (e.ownerId !== playerId || e.hp <= 0 || e.wreck || e.garrisonedIn) continue;
    if (e.kind !== "unit" || !fires(e.type)) continue;
    if (e.state === "deploy" || e.state === "undeploy") continue;
    if (e.order?.kind === "attackmove" || e.order?.kind === "attack" || e.order?.kind === "forceattack") {
      continue;
    }
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
  const ox = hq.tileX + Math.floor(hq.tileW / 2);
  const oy = hq.tileY + Math.floor(hq.tileH / 2);
  const inwardX = Math.sign(state.width / 2 - ox) || 1;
  const inwardY = Math.sign(state.height / 2 - oy) || 1;
  const maxR = BUILD_RADIUS + Math.max(def.tileW, def.tileH);
  const halfW = Math.floor(def.tileW / 2);
  const halfH = Math.floor(def.tileH / 2);
  for (let r = 1; r <= maxR; r++) {
    const ring: { tx: number; ty: number; inward: number }[] = [];
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        ring.push({
          tx: ox + dx - halfW,
          ty: oy + dy - halfH,
          inward: dx * inwardX + dy * inwardY,
        });
      }
    }
    ring.sort((a, b) => b.inward - a.inward);
    for (const spot of ring) {
      if (tilesBlockedOrScrap(state, spot.tx, spot.ty, def.tileW, def.tileH)) continue;
      if (!inBuildRadius(state, playerId, spot.tx, spot.ty, def.tileW, def.tileH, BUILD_RADIUS)) continue;
      if (type === "smelter" && !smelterDock(state, { tileX: spot.tx, tileY: spot.ty, tileW: def.tileW, tileH: def.tileH })) {
        continue;
      }
      return { tx: spot.tx, ty: spot.ty };
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
