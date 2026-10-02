import { AIRFIELD_PADS, catalog, isAircraftType, secondsToTicks, TECH_REQUIRES, TRAIN_QUEUE_CAP, UNIT_CAP, UNIT_SPACE_PAD, type BuildingType, type TrainType } from "../catalog.js";
import { airfieldPadWorld, freePad, padsSpoken, PARK_HEADING } from "./air.js";
import { makeEntity, newAirState, ownedUnits, rallyPoint, worldToTile } from "./geo.js";
import { openSpotNear, packRadius, packSlots } from "./formation.js";
import { setPath } from "./path.js";
import { powerOf, productionSpeed } from "./power.js";
import { advancePaidJob, jobFullyPaid, refundPaid } from "./production.js";
import type { Entity, MatchState, TrainJob } from "./types.js";

export function producerType(unit: TrainType): "muster" | "smelter" | "armory" | "airfield" {
  if (unit === "rifleman" || unit === "gunner" || unit === "sniper" || unit === "atinfantry" || unit === "rocketer" || unit === "pyro" || unit === "mortarman" || unit === "engineer" || unit === "medic" || unit === "droneop" || unit === "jumpjet") return "muster";
  if (unit === "hauler") return "smelter";
  if (isAircraftType(unit)) return "airfield";
  return "armory";
}

/** Tech building this unit still needs, or null once the player has one standing. */
export function techMissing(state: MatchState, playerId: string, unit: TrainType): BuildingType | null {
  const need = TECH_REQUIRES[unit];
  if (!need) return null;
  for (const e of state.entities.values()) {
    if (e.ownerId === playerId && e.type === need && e.hp > 0 && !e.wreck) return null;
  }
  return need;
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
    if (want === "airfield" && padsSpoken(state, e) >= AIRFIELD_PADS) continue;
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
    if (busy && want === "airfield") return `Airfield pads full (${AIRFIELD_PADS} planes). Build another Airfield.`;
    if (busy) return "Queue is full.";
    if (want === "airfield") return "Need an Airfield.";
    if (want === "muster") return "Need a Muster.";
    if (unit === "hauler") return "Need a Smelter.";
    return "Need an Armory.";
  }
  const tech = techMissing(state, playerId, unit);
  if (tech) return `Need a ${catalog(tech).name}.`;
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
  if (isAircraftType(type)) {
    // A plane rolls out onto a free hardstand and waits there for orders.
    const pad = from.type === "airfield" ? freePad(state, from) : null;
    if (pad == null) return null;
    const at = airfieldPadWorld(from, pad, state.tileSize);
    const plane = makeEntity(state, type, playerId, at.x, at.y, { facing: PARK_HEADING });
    plane.air = newAirState(from.id, pad, type);
    return plane;
  }
  const door = rallyPoint(state, from);
  const u = makeEntity(state, type, playerId, door.x, door.y);
  if (from.rally) {
    const spot = openSpotNear(state, u, from.rally.x, from.rally.y);
    u.order = { kind: "move", x: spot.x, y: spot.y };
    u.state = "move";
    setPath(state, u, spot.x, spot.y);
  } else {
    if (type === "hauler") u.autoHarvest = true;
    packAtDoor(state, from, u, door);
  }
  return u;
}

/** Idle, or walking to the slot the last spawn gave it. A self-issued move is left alone. */
function looseAtDoor(e: Entity): boolean {
  if (e.kind !== "unit" || e.hp <= 0 || e.wreck) return false;
  if (e.garrisonedIn || e.air || e.chute) return false;
  if (e.state === "deploy" || e.state === "undeploy" || e.braced) return false;
  if (e.holdPosition) return false;
  if (e.jet && e.jet.alt > 0) return false;
  const o = e.order;
  if (!o) return true;
  return o.kind === "move" && o.auto !== true;
}

/** Door-group units still standing close enough to be packed with the newcomer. */
function doorMates(state: MatchState, fresh: Entity, door: { x: number; y: number }): Entity[] {
  const pool: Entity[] = [];
  for (const e of state.entities.values()) {
    if (e !== fresh && !e.doorGroup) continue;
    if (e.ownerId !== fresh.ownerId) continue;
    if (!looseAtDoor(e)) continue;
    pool.push(e);
  }
  let pitch = 0;
  for (const e of pool) pitch = Math.max(pitch, e.radius * 2 + UNIT_SPACE_PAD);
  const reach = Math.max(state.tileSize * 4, (pitch || state.tileSize) * 10);
  const keep: Entity[] = [];
  for (const e of pool) {
    if (e === fresh || Math.hypot(e.x - door.x, e.y - door.y) <= reach) keep.push(e);
    else delete e.doorGroup;
  }
  return keep;
}

/**
 * Drop the new unit into a hex block with whoever is still loitering at this
 * door, and walk anyone the new shape displaced back onto their slot.
 */
function packAtDoor(state: MatchState, from: Entity, fresh: Entity, door: { x: number; y: number }): void {
  fresh.doorGroup = true;
  const mates = doorMates(state, fresh, door);
  if (mates.length < 2) return;
  let pitch = 0;
  for (const e of mates) pitch = Math.max(pitch, e.radius * 2 + UNIT_SPACE_PAD);
  const ts = state.tileSize;
  const bx = (from.tileX + from.tileW / 2) * ts;
  const by = (from.tileY + from.tileH / 2) * ts;
  let dx = door.x - bx;
  let dy = door.y - by;
  const len = Math.hypot(dx, dy) || 1;
  dx /= len;
  dy /= len;
  const shift = packRadius(mates.length, pitch);
  const slots = packSlots(state, mates, door.x + dx * shift, door.y + dy * shift, Math.atan2(dy, dx));
  const here = slots.get(fresh.id);
  if (here) {
    fresh.x = here.x;
    fresh.y = here.y;
    fresh.tileX = worldToTile(here.x, ts);
    fresh.tileY = worldToTile(here.y, ts);
  }
  const slop = 4;
  for (const e of mates) {
    if (e.id === fresh.id) continue;
    const spot = slots.get(e.id);
    if (!spot) continue;
    if (Math.hypot(e.x - spot.x, e.y - spot.y) <= slop) continue;
    const ox = e.order?.kind === "move" ? e.order.x : undefined;
    const oy = e.order?.kind === "move" ? e.order.y : undefined;
    if (ox != null && oy != null && Math.hypot(ox - spot.x, oy - spot.y) <= slop) continue;
    e.order = { kind: "move", x: spot.x, y: spot.y };
    e.state = "move";
    setPath(state, e, spot.x, spot.y);
  }
}

export function isProducer(e: Entity): boolean {
  return e.kind === "building" && (e.type === "muster" || e.type === "smelter" || e.type === "armory");
}

/** Sets the rally point on every owned producer in `ids`. A point on the building's own footprint clears it. */
export function setRally(state: MatchState, playerId: string, ids: number[], x: number, y: number): string | null {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return "Bad rally point.";
  const ts = state.tileSize;
  const px = Math.max(0, Math.min(state.width * ts - 1, x));
  const py = Math.max(0, Math.min(state.height * ts - 1, y));
  const tx = worldToTile(px, ts);
  const ty = worldToTile(py, ts);
  let n = 0;
  for (const id of ids) {
    const b = state.entities.get(id);
    if (!b || b.ownerId !== playerId || b.hp <= 0 || !isProducer(b)) continue;
    const onSelf = tx >= b.tileX && tx < b.tileX + b.tileW && ty >= b.tileY && ty < b.tileY + b.tileH;
    if (onSelf) delete b.rally;
    else b.rally = { x: px, y: py };
    n++;
  }
  return n === 0 ? "Select a Muster, Smelter, or Armory." : null;
}
