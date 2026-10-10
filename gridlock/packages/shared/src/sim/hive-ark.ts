import {
  ARK_CANNON_AT,
  ARK_CANNON_CELL,
  ARK_CANNON_RECHARGE_SECONDS,
  ARK_DOME_DOWN_SECONDS,
  ARK_DOME_HP,
  ARK_DOME_QUIET_SECONDS,
  ARK_DOME_RADIUS,
  ARK_DOME_REGROW_PER_SEC,
  ARK_HULL_RADIUS,
  ARK_POD_AT,
  ARK_WASP_CALM_SECONDS,
  ARK_WASP_DOCK_TILES,
  ARK_WASP_LEASH_TILES,
  ARK_WASP_REGROW_SECONDS,
  catalog,
  isHiveArk,
  isTorpedoBody,
  TICK_DT,
} from "../catalog.js";
import { isCrashing } from "./air.js";
import { allies, destroyEntity, makeEntity, newAirState } from "./geo.js";
import { diving } from "./naval.js";
import { hiddenFromAuto } from "./simunit.js";
import type { ArkState, EnergyShield, Entity, MatchState } from "./types.js";
import { canSeeEntity } from "./vision.js";

/**
 * The Hive Ark (catalog ARK_*). Its two plasma cannons fire in combat.ts (fireArk); this
 * phase keeps everything else: each cannon's energy cell, the dome that rides over the hull,
 * and the two Wasps on its pods, which lift by themselves when an enemy unit shows inside the
 * Ark's sight and come home when nothing is left. Nobody commands those Wasps (commands.ts
 * owned, ai.ts): the Ark does.
 */

/** A fresh Ark: both cells full, both Wasps on their pods, the dome about to rise. */
export function newArkState(facing: number): ArkState {
  return {
    cannons: ARK_CANNON_AT.map(() => ({ facing, energy: ARK_CANNON_CELL, cooldown: 0, drained: false })),
    pods: [0, 1].map(() => ({ waspId: null, regrow: 0 })),
    domeId: null,
    domeDown: 0,
    calm: 0,
  };
}

/** World point of cannon `i`: on the keel line, fore (0) or aft (1) of the middle. */
export function arkCannonPoint(e: Pick<Entity, "x" | "y" | "facing">, i: number): { x: number; y: number } {
  const d = (ARK_CANNON_AT[i] ?? 0) * ARK_HULL_RADIUS;
  return { x: e.x + Math.cos(e.facing) * d, y: e.y + Math.sin(e.facing) * d };
}

/** World point of pod `i`: abeam, port (0) or starboard (1). */
export function arkPodPoint(e: Pick<Entity, "x" | "y" | "facing">, i: number): { x: number; y: number } {
  const a = e.facing + (i === 0 ? -Math.PI / 2 : Math.PI / 2);
  const d = ARK_POD_AT * ARK_HULL_RADIUS;
  return { x: e.x + Math.cos(a) * d, y: e.y + Math.sin(a) * d };
}

function arkLive(e: Entity | undefined): e is Entity {
  return !!e && e.hp > 0 && !e.wreck && !!e.ark;
}

/** The Wasp flying off pod `i`, if it still lives. */
export function podWasp(state: MatchState, ark: Entity, i: number): Entity | null {
  const id = ark.ark?.pods[i]?.waspId;
  if (id == null) return null;
  const w = state.entities.get(id);
  return w && w.hp > 0 && !w.wreck && w.arkOf === ark.id && !isCrashing(w) ? w : null;
}

/** The dome standing over this Ark, if any. */
export function arkDome(state: MatchState, ark: Entity): EnergyShield | null {
  const id = ark.ark?.domeId;
  if (id == null) return null;
  return state.energyShields?.find((s) => s.id === id && s.hp > 0) ?? null;
}

/** An enemy unit the Wasps may go after: alive, in the open, seen, and not under the water. */
function waspQuarry(state: MatchState, ark: Entity, o: Entity): boolean {
  if (o.kind !== "unit" || o.hp <= 0 || o.wreck || o.garrisonedIn != null || o.chute) return false;
  if (isTorpedoBody(o.type) || isCrashing(o) || hiddenFromAuto(o) || diving(o)) return false;
  if (allies(state, ark.ownerId, o.ownerId)) return false;
  return canSeeEntity(state, ark.ownerId, o);
}

/** Every enemy unit inside the Ark's own sight that its owner can see. */
function threats(state: MatchState, ark: Entity): Entity[] {
  const reach = catalog(ark.type).sightTiles * state.tileSize;
  const out: Entity[] = [];
  for (const o of state.entities.values()) {
    if (Math.abs(o.x - ark.x) > reach || Math.abs(o.y - ark.y) > reach) continue;
    if (Math.hypot(o.x - ark.x, o.y - ark.y) > reach) continue;
    if (waspQuarry(state, ark, o)) out.push(o);
  }
  return out;
}

function nearest(list: readonly Entity[], x: number, y: number): Entity | null {
  let best: Entity | null = null;
  let bestD = Infinity;
  for (const o of list) {
    const d = Math.hypot(o.x - x, o.y - y);
    if (d < bestD || (d === bestD && best && o.id < best.id)) {
      best = o;
      bestD = d;
    }
  }
  return best;
}

/** Lift the Wasp on pod `i` off the deck and send it at `target`. */
function launchWasp(state: MatchState, ark: Entity, i: number, target: Entity): Entity {
  const at = arkPodPoint(ark, i);
  const w = makeEntity(state, "wasp", ark.ownerId, at.x, at.y, { facing: Math.atan2(target.y - at.y, target.x - at.x) });
  w.air = newAirState(null, 0, "wasp");
  w.air.phase = "takeoff";
  w.arkOf = ark.id;
  w.order = { kind: "attack", targetId: target.id };
  w.attackTarget = target.id;
  w.state = "move";
  ark.ark!.pods[i]!.waspId = w.id;
  return w;
}

/** Each cannon's cell regrows; one that ran dry wakes only once it is full. The reload ticks down. */
function tickCannons(ark: ArkState, dt: number): void {
  for (const c of ark.cannons) {
    if (c.cooldown > 0) c.cooldown = Math.max(0, c.cooldown - dt);
    c.energy = Math.min(ARK_CANNON_CELL, c.energy + dt / ARK_CANNON_RECHARGE_SECONDS);
    if (c.drained && c.energy >= ARK_CANNON_CELL) c.drained = false;
  }
}

/** The dome rides with the hull. Quiet a while, it mends; broken, it rises again full after ARK_DOME_DOWN_SECONDS. */
function tickDome(state: MatchState, e: Entity, dt: number): void {
  const ark = e.ark!;
  const dome = arkDome(state, e);
  if (dome) {
    dome.x = e.x;
    dome.y = e.y;
    dome.life = ARK_DOME_DOWN_SECONDS;
    const quiet = dome.hitTick == null || (state.tick - dome.hitTick) * TICK_DT >= ARK_DOME_QUIET_SECONDS;
    if (quiet) dome.hp = Math.min(dome.hpMax, dome.hp + ARK_DOME_REGROW_PER_SEC * dt);
    return;
  }
  if (ark.domeId != null) {
    // Broken this tick (tickEnergyShields drops it once its points are gone).
    ark.domeId = null;
    ark.domeDown = ARK_DOME_DOWN_SECONDS;
  }
  if (ark.domeDown > 0) {
    ark.domeDown = Math.max(0, ark.domeDown - dt);
    if (ark.domeDown > 0) return;
  }
  const s: EnergyShield = {
    id: state.nextId++,
    ownerId: e.ownerId,
    fromId: e.id,
    x: e.x,
    y: e.y,
    angle: e.facing,
    half: Math.PI,
    r: ARK_DOME_RADIUS,
    hp: ARK_DOME_HP,
    hpMax: ARK_DOME_HP,
    life: ARK_DOME_DOWN_SECONDS,
    dome: true,
  };
  (state.energyShields ??= []).push(s);
  ark.domeId = s.id;
}

/** The pods: a lost Wasp regrows; the Wasps lift on a threat, hunt, and come home once it is calm. */
function tickPods(state: MatchState, e: Entity, dt: number): void {
  const ark = e.ark!;
  const seen = threats(state, e);
  ark.calm = seen.length > 0 ? 0 : ark.calm + dt;
  const leash = (catalog(e.type).sightTiles + ARK_WASP_LEASH_TILES) * state.tileSize;
  const dock = ARK_WASP_DOCK_TILES * state.tileSize;
  ark.pods.forEach((pod, i) => {
    if (pod.waspId != null && !podWasp(state, e, i)) {
      // Shot down. A new one grows on the pod.
      pod.waspId = null;
      pod.regrow = ARK_WASP_REGROW_SECONDS;
    }
    if (pod.waspId == null) {
      if (pod.regrow > 0) {
        pod.regrow = Math.max(0, pod.regrow - dt);
        return;
      }
      const t = nearest(seen, e.x, e.y);
      if (t) launchWasp(state, e, i, t);
      return;
    }
    const w = podWasp(state, e, i)!;
    if (w.air?.phase === "takeoff") return;
    const cur = w.order?.kind === "attack" && w.order.targetId != null ? state.entities.get(w.order.targetId) : undefined;
    const keep =
      cur && waspQuarry(state, e, cur) && Math.hypot(cur.x - e.x, cur.y - e.y) <= leash ? cur : null;
    if (keep && ark.calm < ARK_WASP_CALM_SECONDS) return;
    const next = ark.calm < ARK_WASP_CALM_SECONDS ? nearest(seen, w.x, w.y) : null;
    if (next) {
      w.order = { kind: "attack", targetId: next.id };
      w.attackTarget = next.id;
      return;
    }
    // Nothing left to fight: home to the pod, and down onto it.
    const at = arkPodPoint(e, i);
    w.attackTarget = null;
    w.order = { kind: "move", x: at.x, y: at.y };
    if (Math.hypot(w.x - at.x, w.y - at.y) <= dock) {
      destroyEntity(state, w);
      pod.waspId = null;
    }
  });
}

/** Sim phase: every Hive Ark's cells, dome, and pods, and every Wasp whose Ark is gone. */
export function tickHiveArks(state: MatchState, dt: number): void {
  const orphans: Entity[] = [];
  for (const e of state.entities.values()) {
    if (e.arkOf != null) {
      const home = state.entities.get(e.arkOf);
      if (e.hp > 0 && (!arkLive(home) || home.ownerId !== e.ownerId)) orphans.push(e);
      continue;
    }
    if (!isHiveArk(e.type) || !arkLive(e)) continue;
    tickCannons(e.ark!, dt);
    tickDome(state, e, dt);
    tickPods(state, e, dt);
  }
  // Its pods are gone: a Wasp off a sunk Ark has nowhere to live and falls with it.
  for (const w of orphans) w.hp = 0;
}
