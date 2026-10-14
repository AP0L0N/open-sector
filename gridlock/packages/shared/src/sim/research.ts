import { canStartResearch, catalog, RESEARCH, researchDone, secondsToTicks, type BuildingType, type ResearchId } from "../catalog.js";
import { advancePaidJob, jobFullyPaid } from "./production.js";
import { jobBill, jobSpeed, refundJob } from "./hive-energy.js";
import type { Entity, MatchState } from "./types.js";

/**
 * Research. A structure that offers it (catalog RESEARCH) upgrades itself one level at a time:
 * the Fusion Node to Advanced Fusion, then to Ultra Fusion; a Xenite defence to its Force Shield
 * (a small dome of its own, sim/energy-shield.ts); an Ion Turret to Sky Tracking (it reaches
 * aircraft, catalog antiAirGun). The job runs on the structure itself,
 * at the owner's job pace (power, or the hive's energy), and takes its scrap as it goes, like a
 * yard job. While it runs a Fusion Node holds only RESEARCH_OUTPUT_SHARE of its energy
 * (energySupplyOfEntity). Cancelled, it gives the scrap back; captured, the job is dropped and
 * the level stays with the structure. Runs with tickBuild and tickTrain.
 */

function live(e: Entity): boolean {
  return e.hp > 0 && !e.wreck && !e.ruined;
}

export type ResearchResult = { ok: true } | { ok: false; reason: string };

/** Can `e` start `id` for `playerId` now? A reason when it cannot. */
export function researchBlocker(state: MatchState, playerId: string, e: Entity, id: ResearchId): string | null {
  const def = RESEARCH[id];
  if (e.ownerId !== playerId || e.kind !== "building" || !live(e)) return "Select your own structure.";
  if (!def.buildings.includes(e.type as BuildingType)) return `${catalog(e.type).name} cannot research ${def.name}.`;
  if (e.research) return "Already researching.";
  if (researchDone(e, def)) return "Already researched.";
  if (!canStartResearch(e, def)) return "Research the level before it first.";
  if (!state.players.get(playerId)) return "No such player.";
  return null;
}

/** Start `id` on each of `ids` that can take it. */
export function startResearch(state: MatchState, playerId: string, ids: readonly number[], id: ResearchId): ResearchResult {
  let started = 0;
  let why = "Nothing selected can research that.";
  for (const eid of ids) {
    const e = state.entities.get(eid);
    if (!e) continue;
    const blocker = researchBlocker(state, playerId, e, id);
    if (blocker) {
      why = blocker;
      continue;
    }
    e.research = { id, ownerId: playerId, progressTicks: 0, totalTicks: secondsToTicks(RESEARCH[id].seconds), paid: 0 };
    started++;
  }
  return started > 0 ? { ok: true } : { ok: false, reason: why };
}

/** Cancel the research running on each of `ids`; the scrap it took comes back. */
export function cancelResearch(state: MatchState, playerId: string, ids: readonly number[]): ResearchResult {
  let cancelled = 0;
  for (const eid of ids) {
    const e = state.entities.get(eid);
    if (!e?.research || e.ownerId !== playerId) continue;
    const p = state.players.get(playerId);
    if (p) refundJob(p, e.research);
    e.research = undefined;
    cancelled++;
  }
  return cancelled > 0 ? { ok: true } : { ok: false, reason: "No research to cancel." };
}

export function tickResearch(state: MatchState): void {
  let speeds: Map<string, number> | undefined;
  for (const e of state.entities.values()) {
    const job = e.research;
    if (!job) continue;
    // Destroyed, or taken by another side: the job goes with it.
    if (!live(e) || e.ownerId !== job.ownerId) {
      e.research = undefined;
      continue;
    }
    const p = state.players.get(job.ownerId);
    if (!p) {
      e.research = undefined;
      continue;
    }
    speeds ??= new Map();
    let speed = speeds.get(p.playerId);
    if (speed === undefined) speeds.set(p.playerId, (speed = jobSpeed(state, p.playerId)));
    const def = RESEARCH[job.id];
    const cost = jobBill(p, def.cost);
    advancePaidJob(p, job, cost, speed);
    if (!jobFullyPaid(job, cost)) continue;
    if (def.level != null) e.level = def.level;
    if (def.grants === "forceShield") e.forceShield = true;
    if (def.grants === "skySpines") e.skySpines = true;
    e.research = undefined;
  }
}
