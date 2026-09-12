import { catalog, secondsToTicks, UNIT_CAP, type TrainType } from "../catalog.js";
import { makeEntity, ownedUnits, rallyPoint } from "./geo.js";
import { powerOf, productionSpeed } from "./power.js";
import type { Entity, MatchState } from "./types.js";

export function producerType(unit: TrainType): "muster" | "smelter" | "armory" {
  if (unit === "trooper") return "muster";
  if (unit === "hauler") return "smelter";
  return "armory";
}

export function startTrain(state: MatchState, playerId: string, unit: TrainType): string | null {
  const p = state.players.get(playerId);
  if (!p || !p.alive) return "You are out of the fight.";
  const def = catalog(unit);
  if (p.scrap < def.cost) return "Not enough scrap.";
  if (ownedUnits(state, playerId) >= UNIT_CAP) return "Unit cap reached.";
  const want = producerType(unit);
  let best: Entity | null = null;
  let bestLoad = Infinity;
  for (const e of state.entities.values()) {
    if (e.ownerId !== playerId || e.type !== want || e.hp <= 0) continue;
    const load = e.queue.reduce((s, j) => s + (j.totalTicks - j.progressTicks), 0);
    if (load < bestLoad) {
      bestLoad = load;
      best = e;
    }
  }
  if (!best) {
    if (unit === "trooper") return "Need a Muster.";
    if (unit === "hauler") return "Need a Smelter.";
    return "Need an Armory.";
  }
  p.scrap -= def.cost;
  best.queue.push({
    type: unit,
    progressTicks: 0,
    totalTicks: secondsToTicks(def.buildSeconds),
  });
  return null;
}

export function cancelTrain(state: MatchState, playerId: string, buildingId?: number): string | null {
  const p = state.players.get(playerId);
  if (!p) return "Not in this match.";
  let b: Entity | undefined;
  if (buildingId != null) b = state.entities.get(buildingId);
  else {
    for (const e of state.entities.values()) {
      if (e.ownerId === playerId && e.queue.length > 0) b = e;
    }
  }
  if (!b || b.ownerId !== playerId) return "No queue.";
  const job = b.queue.pop();
  if (!job) return "No queue.";
  p.scrap += catalog(job.type).cost;
  return null;
}

export function tickTrain(state: MatchState, _dt: number): void {
  for (const e of state.entities.values()) {
    if (e.kind !== "building" || e.queue.length === 0 || e.hp <= 0) continue;
    const pow = powerOf(state, e.ownerId);
    const job = e.queue[0];
    if (!job) continue;
    job.progressTicks += productionSpeed(pow.provided, pow.used);
    if (job.progressTicks >= job.totalTicks) {
      e.queue.shift();
      spawnUnit(state, e.ownerId, job.type, e, false);
    }
  }
}

export function spawnUnit(
  state: MatchState,
  playerId: string,
  type: TrainType,
  from: Entity,
  ignoreCap: boolean,
): Entity | null {
  if (!ignoreCap && ownedUnits(state, playerId) >= UNIT_CAP) return null;
  const rally = rallyPoint(state, from);
  const u = makeEntity(state, type, playerId, rally.x, rally.y);
  if (type === "hauler") u.autoHarvest = true;
  return u;
}
