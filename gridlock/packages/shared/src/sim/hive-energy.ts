import { energyOf, energySupplyOf, usesHiveEnergy } from "../catalog.js";
import { isAirborne } from "./air.js";
import { clearOrder } from "./geo.js";
import { fenceLinkEnergy, laserFenceLinks, laserFenceReach, totalFenceLinkEnergy, type FencePost } from "./laser-fence.js";
import type { Entity, MatchState, SimPlayer } from "./types.js";

/**
 * Hive energy. The Xenomorphs pay no scrap and draw no power. Their Hive Core holds
 * HIVE_CORE_ENERGY and each standing Fusion Node FUSION_NODE_ENERGY more. Every unit and defence
 * takes its catalog `energy` while it lives, a Laser Fence post more for each link it holds, and a
 * job on the yard or a factory takes its share as it advances, as scrap would be paid. With no
 * energy free the job waits.
 *
 * When the hive holds less than its units and defences take (a Fusion Node falls), the newest go
 * offline until there is room: a unit shuts down where it stands, a defence falls silent. They
 * wake by themselves once the hive has energy for them again. Before the first Hive Core stands
 * there is no store to run short of, and nothing goes offline. Runs right after tickPower.
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

/** Energy each living unit and defence of `playerId` takes, oldest first. An Assembler's Thralls are its: they take none. */
function consumers(state: MatchState, playerId: string): { e: Entity; energy: number }[] {
  const links = linkEnergyByPost(state, fencePosts(state, playerId));
  const out: { e: Entity; energy: number }[] = [];
  for (const e of state.entities.values()) {
    if (e.ownerId !== playerId || !live(e) || e.ruined || e.assembledBy != null) continue;
    const energy = energyOf(e.type) + (links.get(e.id) ?? 0);
    if (energy > 0) out.push({ e, energy });
  }
  return out.sort((a, b) => a.e.id - b.e.id);
}

/** Energy jobs on the yard and in the factories have taken so far. */
function reservedByJobs(state: MatchState, p: SimPlayer): number {
  let n = (p.structure?.paid ?? 0) + (p.defence?.paid ?? 0) + (p.line?.paid ?? 0);
  for (const e of state.entities.values()) {
    if (e.ownerId !== p.playerId || e.queue.length === 0 || !live(e)) continue;
    for (const job of e.queue) n += job.paid;
  }
  return n;
}

/** The hive's store as the HUD shows it. */
export interface HiveEnergy {
  /** Energy the Hive Core and the Fusion Nodes hold. */
  cap: number;
  /** Taken by units and defences online, and by jobs under way. */
  used: number;
  /** Units and defences offline for want of energy. */
  offline: number;
}

export function hiveEnergyOf(state: MatchState, playerId: string): HiveEnergy {
  const p = state.players.get(playerId);
  if (!p) return { cap: 0, used: 0, offline: 0 };
  let used = reservedByJobs(state, p);
  let offline = 0;
  for (const c of consumers(state, playerId)) {
    if (c.e.hiveOffline) offline++;
    else used += c.energy;
  }
  return { cap: hiveEnergyCap(state, playerId), used, offline };
}

/** Energy free for a job of `p`'s to take, as a wallet advancePaidJob can draw on. */
export function hiveEnergyWallet(state: MatchState, p: SimPlayer): { scrap: number } {
  const { cap, used } = hiveEnergyOf(state, p.playerId);
  return { scrap: Math.max(0, cap - used) };
}

/** Where a job of `p`'s pays from, and how much it costs there: hive energy for the Xenomorphs, scrap for everyone else. */
export function jobBill(
  state: MatchState,
  p: SimPlayer,
  type: string,
  scrapCost: number,
  hive?: { scrap: number },
): { wallet: { scrap: number }; cost: number } {
  if (!usesHiveEnergy(p.faction)) return { wallet: p, cost: scrapCost };
  return { wallet: hive ?? hiveEnergyWallet(state, p), cost: energyOf(type) };
}

/** Give back what a cancelled job had taken: scrap to the wallet, or energy back to the hive's store. */
export function refundJob(p: SimPlayer, job: { paid: number }): void {
  if (usesHiveEnergy(p.faction)) job.paid = 0;
  else {
    p.scrap += Math.max(0, Math.floor(job.paid));
    job.paid = 0;
  }
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
    let room = cap - reservedByJobs(state, p);
    // A plane in the air cannot switch off mid-flight: it keeps its share first.
    for (const c of list) {
      if (!isAirborne(c.e)) continue;
      room -= c.energy;
      comeOnline(c.e);
    }
    for (const c of list) {
      if (isAirborne(c.e)) continue;
      if (c.energy <= room) {
        room -= c.energy;
        comeOnline(c.e);
      } else goOffline(c.e);
    }
  }
}
