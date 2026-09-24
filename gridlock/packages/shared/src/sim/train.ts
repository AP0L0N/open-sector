import { catalog, secondsToTicks, TRAIN_QUEUE_CAP, UNIT_CAP, type TrainType } from "../catalog.js";
import { makeEntity, ownedUnits, rallyPoint } from "./geo.js";
import { powerOf, productionSpeed } from "./power.js";
import { advancePaidJob, jobFullyPaid, refundPaid } from "./production.js";
import type { Entity, MatchState, TrainJob } from "./types.js";

export function producerType(unit: TrainType): "muster" | "smelter" | "armory" {
  if (unit === "rifleman" || unit === "gunner" || unit === "sniper" || unit === "atinfantry" || unit === "mortarman" || unit === "engineer" || unit === "medic") return "muster";
  if (unit === "hauler") return "smelter";
  return "armory";
}

function queuedCount(state: MatchState, playerId: string): number {
  let n = 0;
  for (const e of state.entities.values()) {
    if (e.ownerId === playerId) n += e.queue.length;
  }
  return n;
}

export function startTrain(state: MatchState, playerId: string, unit: TrainType): string | null {
  const p = state.players.get(playerId);
  if (!p || !p.alive) return "You are out of the fight.";
  const def = catalog(unit);
  if (ownedUnits(state, playerId) + queuedCount(state, playerId) >= UNIT_CAP) return "Unit cap reached.";
  const want = producerType(unit);
  let best: Entity | null = null;
  let bestLoad = Infinity;
  for (const e of state.entities.values()) {
    if (e.ownerId !== playerId || e.type !== want || e.hp <= 0) continue;
    if (e.queue.length >= TRAIN_QUEUE_CAP) continue;
    const load = e.queue.reduce((s, j) => s + (j.totalTicks - j.progressTicks), 0);
    if (load < bestLoad) {
      bestLoad = load;
      best = e;
    }
  }
  if (!best) {
    const busy = [...state.entities.values()].some(
      (e) => e.ownerId === playerId && e.type === want && e.hp > 0,
    );
    if (busy) return "Queue is full.";
    if (unit === "rifleman" || unit === "gunner" || unit === "sniper" || unit === "atinfantry" || unit === "mortarman" || unit === "medic") return "Need a Muster.";
    if (unit === "hauler") return "Need a Smelter.";
    return "Need an Armory.";
  }
  best.queue.push({
    id: state.nextId++,
    type: unit,
    progressTicks: 0,
    totalTicks: secondsToTicks(def.buildSeconds),
    paused: false,
    paid: 0,
  });
  return null;
}

export function pauseTrain(
  state: MatchState,
  playerId: string,
  opts: { jobId?: number; unit?: TrainType; paused?: boolean } = {},
): string | null {
  const setPaused = (job: TrainJob): void => {
    job.paused = opts.paused === undefined ? !job.paused : opts.paused;
  };
  if (opts.jobId != null) {
    for (const e of state.entities.values()) {
      if (e.ownerId !== playerId) continue;
      const job = e.queue.find((j) => j.id === opts.jobId);
      if (job) {
        setPaused(job);
        return null;
      }
    }
    return "No queue.";
  }
  if (opts.unit) {
    const heads: TrainJob[] = [];
    for (const e of state.entities.values()) {
      if (e.ownerId !== playerId || e.hp <= 0) continue;
      const job = e.queue[0];
      if (job && job.type === opts.unit) heads.push(job);
    }
    if (heads.length === 0) return "No queue.";
    const pause = opts.paused === undefined ? heads.some((j) => !j.paused) : opts.paused;
    for (const j of heads) j.paused = pause;
    return null;
  }
  return "No queue.";
}

function refund(state: MatchState, playerId: string, job: TrainJob): void {
  const p = state.players.get(playerId);
  if (p) refundPaid(p, job);
}

export function cancelTrain(
  state: MatchState,
  playerId: string,
  opts: { buildingId?: number; jobId?: number; unit?: TrainType } = {},
): string | null {
  const p = state.players.get(playerId);
  if (!p) return "Not in this match.";

  if (opts.jobId != null) {
    for (const e of state.entities.values()) {
      if (e.ownerId !== playerId) continue;
      const i = e.queue.findIndex((j) => j.id === opts.jobId);
      if (i >= 0) {
        const job = e.queue.splice(i, 1)[0];
        if (job) refund(state, playerId, job);
        return null;
      }
    }
    return "No queue.";
  }

  if (opts.unit) {
    let best: { entity: Entity; index: number; id: number } | null = null;
    for (const e of state.entities.values()) {
      if (e.ownerId !== playerId) continue;
      for (let i = 0; i < e.queue.length; i++) {
        const j = e.queue[i];
        if (!j || j.type !== opts.unit) continue;
        if (!best || j.id > best.id) best = { entity: e, index: i, id: j.id };
      }
    }
    if (!best) return "No queue.";
    const job = best.entity.queue.splice(best.index, 1)[0];
    if (job) refund(state, playerId, job);
    return null;
  }

  let b: Entity | undefined;
  if (opts.buildingId != null) b = state.entities.get(opts.buildingId);
  else {
    for (const e of state.entities.values()) {
      if (e.ownerId === playerId && e.queue.length > 0) b = e;
    }
  }
  if (!b || b.ownerId !== playerId) return "No queue.";
  const job = b.queue.pop();
  if (!job) return "No queue.";
  refund(state, playerId, job);
  return null;
}

export function tickTrain(state: MatchState, _dt: number): void {
  for (const e of state.entities.values()) {
    if (e.kind !== "building" || e.queue.length === 0 || e.hp <= 0) continue;
    const job = e.queue[0];
    if (!job || job.paused) continue;
    const p = state.players.get(e.ownerId);
    if (!p) continue;
    const def = catalog(job.type);
    const pow = powerOf(state, e.ownerId);
    advancePaidJob(p, job, def.cost, productionSpeed(pow.provided, pow.used));
    if (jobFullyPaid(job, def.cost)) {
      const spawned = spawnUnit(state, e.ownerId, job.type, e, false);
      if (spawned) e.queue.shift();
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
