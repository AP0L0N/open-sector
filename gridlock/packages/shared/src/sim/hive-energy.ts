import { energyOf, energySupplyOf, HIVE_SWITCH_SECONDS, isDefenceStructure, LOW_POWER_MIN_SPEED, secondsToTicks, usesHiveEnergy } from "../catalog.js";
import { isAirborne } from "./air.js";
import { clearOrder } from "./geo.js";
import { fenceLinkEnergy, laserFenceLinks, laserFenceReach, totalFenceLinkEnergy, type FencePost } from "./laser-fence.js";
import { powerOf, productionSpeed } from "./power.js";
import type { Entity, MatchState, SimPlayer } from "./types.js";

/**
 * Hive energy. The Xenite pay no scrap and draw no power. Their Hive Core holds
 * HIVE_CORE_ENERGY and each standing Fusion Node FUSION_NODE_ENERGY more. Every unit, defence, and
 * base structure takes its catalog `energy` while it stands, a Laser Fence post more for each link
 * it holds. The HUD counts down from the full store: 200 / 200 with a bare Hive Core, less for each
 * thing the hive feeds, and below zero when it feeds more than it holds.
 *
 * Nothing is refused for want of energy. Below zero the yard and the factories work slower, in
 * proportion, as a short-powered base does (never under LOW_POWER_MIN_SPEED). And while the hive
 * is below zero, its units and defences go offline one at a time, every HIVE_SWITCH_SECONDS, the
 * hungriest first, until it is back at zero or above: a unit shuts down where it stands, a defence
 * falls silent. Base structures never go offline, and a plane in the air keeps flying. Once there
 * is room again they wake one at a time, the hungriest that fits first. Before the first Hive Core
 * stands there is no store to run short of, and nothing goes offline. Runs right after tickPower.
 */

function live(e: Entity): boolean {
  return e.hp > 0 && !e.wreck;
}

/** Energy the hive of `playerId` holds: its Hive Core and every standing Fusion Node. */
export function hiveEnergyCap(state: MatchState, playerId: string): number {
  let cap = 0;
  for (const e of state.entities.values()) {
    if (e.ownerId !== playerId || e.kind !== "building" || !live(e) || e.ruined) continue;
    cap += energySupplyOf(e.type);
  }
  return cap;
}

function fencePosts(state: MatchState, playerId: string): FencePost[] {
  const posts: FencePost[] = [];
  for (const e of state.entities.values()) {
    if (e.type === "laserfence" && e.ownerId === playerId && live(e) && !e.ruined) posts.push(e);
  }
  return posts;
}

/** Energy each post's links take, by post id. A link is the newer post's to pay. */
function linkEnergyByPost(state: MatchState, posts: readonly FencePost[]): Map<number, number> {
  const out = new Map<number, number>();
  if (posts.length < 2) return out;
  const byId = new Map(posts.map((p) => [p.id, p]));
  for (const link of laserFenceLinks(posts, laserFenceReach(state))) {
    const a = byId.get(link.a)!;
    const b = byId.get(link.b)!;
    out.set(link.b, (out.get(link.b) ?? 0) + fenceLinkEnergy(Math.hypot(b.x - a.x, b.y - a.y), state.tileSize));
  }
  return out;
}

function totalLinkEnergy(state: MatchState, posts: readonly FencePost[]): number {
  return totalFenceLinkEnergy(posts, laserFenceReach(state), state.tileSize);
}

/** How much more energy the links would take with new posts of `playerId`'s at `at` (world px). */
export function fenceEnergyToAdd(state: MatchState, playerId: string, at: readonly { x: number; y: number }[]): number {
  const posts = fencePosts(state, playerId);
  const ghosts: FencePost[] = at.map((p, i) => ({ id: Number.MAX_SAFE_INTEGER - i, ownerId: playerId, x: p.x, y: p.y }));
  return Math.max(0, totalLinkEnergy(state, [...posts, ...ghosts]) - totalLinkEnergy(state, posts));
}

/** Hive energy a sited Laser Fence line takes once it stands: each post's own, and the links it adds. */
export function fenceLineEnergy(state: MatchState, playerId: string, sites: readonly { x: number; y: number }[]): number {
  return sites.length * energyOf("laserfence") + fenceEnergyToAdd(state, playerId, sites);
}

/**
 * Energy each living unit, defence, and base structure of `playerId` takes, oldest first. An Assembler's Thralls
 * are its, and a Hive Ark's Wasps are the Ark's: they take none.
 */
function consumers(state: MatchState, playerId: string): { e: Entity; energy: number }[] {
  const links = linkEnergyByPost(state, fencePosts(state, playerId));
  const out: { e: Entity; energy: number }[] = [];
  for (const e of state.entities.values()) {
    if (e.ownerId !== playerId || !live(e) || e.ruined || e.assembledBy != null || e.arkOf != null) continue;
    const energy = energyOf(e.type) + (links.get(e.id) ?? 0);
    if (energy > 0) out.push({ e, energy });
  }
  return out.sort((a, b) => a.e.id - b.e.id);
}

/** The hive's store as the HUD shows it. */
export interface HiveEnergy {
  /** Energy the Hive Core and the Fusion Nodes hold. */
  cap: number;
  /** Taken by everything online: the HUD shows `cap - used` left, below zero when short. */
  used: number;
  /** Units and defences offline for want of energy. */
  offline: number;
}

export function hiveEnergyOf(state: MatchState, playerId: string): HiveEnergy {
  let used = 0;
  let offline = 0;
  for (const c of consumers(state, playerId)) {
    if (c.e.hiveOffline) offline++;
    else used += c.energy;
  }
  return { cap: hiveEnergyCap(state, playerId), used, offline };
}

/** How fast the hive builds and grows at `cap` held and `used` taken: 1 at zero or above, slower in proportion below. */
export function hiveSpeed(cap: number, used: number): number {
  if (cap <= 0 || used <= cap) return 1;
  return Math.max(LOW_POWER_MIN_SPEED, cap / used);
}

/** Pace of `playerId`'s yard and factories: the hive's energy for the Xenite, power for everyone else. */
export function jobSpeed(state: MatchState, playerId: string): number {
  if (usesHiveEnergy(state.players.get(playerId)?.faction)) {
    const { cap, used } = hiveEnergyOf(state, playerId);
    return hiveSpeed(cap, used);
  }
  const pow = powerOf(state, playerId);
  return productionSpeed(pow.provided, pow.used);
}

/** What a job of `p`'s costs: scrap for everyone else; nothing for the Xenite, who pay in energy once it stands. */
export function jobBill(p: SimPlayer, scrapCost: number): number {
  return usesHiveEnergy(p.faction) ? 0 : scrapCost;
}

/** Give back the scrap a cancelled job had taken. */
export function refundJob(p: SimPlayer, job: { paid: number }): void {
  p.scrap += Math.max(0, Math.floor(job.paid));
  job.paid = 0;
}

/** May go offline when the hive runs short: a unit on the ground or a defence. Base structures and planes aloft never do. */
function switchable(e: Entity): boolean {
  if (e.kind === "building") return isDefenceStructure(e.type);
  return !isAirborne(e);
}

function goOffline(e: Entity): void {
  e.hiveOffline = true;
  if (e.kind === "building") {
    e.unpowered = true;
    return;
  }
  e.shutdown = true;
  if (e.order || e.waypoints.length > 0 || e.attackTarget != null || e.orderQueue) clearOrder(e);
  e.orderQueue = undefined;
  e.holdPosition = false;
}

function comeOnline(e: Entity): void {
  if (!e.hiveOffline) return;
  e.hiveOffline = undefined;
  if (e.kind === "unit") e.shutdown = undefined;
}

export function tickHiveEnergy(state: MatchState): void {
  for (const p of state.players.values()) {
    if (!usesHiveEnergy(p.faction)) continue;
    const cap = hiveEnergyCap(state, p.playerId);
    const list = consumers(state, p.playerId);
    // No Hive Core yet (the Seed still on the move, or units the map gave): no store to run short of.
    if (cap <= 0) {
      for (const c of list) comeOnline(c.e);
      continue;
    }
    let used = 0;
    for (const c of list) {
      // Offline stays offline (tickPower relit the buildings); one that can no longer switch wakes.
      if (c.e.hiveOffline && switchable(c.e)) goOffline(c.e);
      else {
        comeOnline(c.e);
        used += c.energy;
      }
    }
    if (state.tick < (p.hiveSwitchTick ?? 0)) continue;
    const left = cap - used;
    let pick: { e: Entity; energy: number } | undefined;
    if (left < 0) {
      // Short: the hungriest online unit or defence goes dark, the newest among equals.
      for (const c of list) {
        if (c.e.hiveOffline || !switchable(c.e)) continue;
        if (!pick || c.energy > pick.energy || (c.energy === pick.energy && c.e.id > pick.e.id)) pick = c;
      }
      if (pick) goOffline(pick.e);
    } else {
      // Room again: the hungriest offline one that fits wakes, the oldest among equals.
      for (const c of list) {
        if (!c.e.hiveOffline || c.energy > left) continue;
        if (!pick || c.energy > pick.energy || (c.energy === pick.energy && c.e.id < pick.e.id)) pick = c;
      }
      if (pick) comeOnline(pick.e);
    }
    if (pick) p.hiveSwitchTick = state.tick + secondsToTicks(HIVE_SWITCH_SECONDS);
  }
}
