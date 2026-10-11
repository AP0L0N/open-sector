/**
 * Headless CPU-vs-CPU faction duel on yard-64: two CPUs of the given factions and types, no human,
 * a line every EVERY minutes with each side's army, base, defences, and economy, and who killed
 * whose headquarters.
 *
 *   A=alliance B=xeno AI=balanced SEED=1 MIN=25 npm run bench:duel -w @gridlock/shared
 *
 * Env: A / B (factions in slots 1 and 2), AI (CPU type; AIB for slot 2 alone), SEED, MIN (game
 * minutes, default 20), EVERY (report interval, default 5), FAIR (default 1: the CPUs' Smelter
 * head start is switched off, so the Alliance CPU pours scrap at a human's rate; 0 keeps the
 * shipped CPU).
 */
import { createRoom, hostSlot, startMatch, updateSelf } from "../lobby.js";
import { TICK_HZ, catalog, isDefenceStructure, isFaction, usesHiveEnergy } from "../catalog.js";
import { isAiDifficulty } from "../protocol.js";
import { AI_PROFILES } from "./ai-profile.js";
import { hiveEnergyOf } from "./hive-energy.js";
import { createMatch, stepMatch } from "./match.js";
import type { SimPlayer } from "./types.js";

const fA = process.env.A ?? "alliance";
const fB = process.env.B ?? "xeno";
const ai = process.env.AI ?? "balanced";
const aiB = process.env.AIB ?? ai;
if (!isFaction(fA) || !isFaction(fB)) throw new Error("A and B must be factions");
if (!isAiDifficulty(ai) || !isAiDifficulty(aiB)) throw new Error("AI and AIB must be CPU types");
const minutes = Number(process.env.MIN ?? 20);
const seed = Number(process.env.SEED ?? 1);
const every = Number(process.env.EVERY ?? 5);
if (process.env.FAIR !== "0") for (const p of Object.values(AI_PROFILES)) (p as { smelterMul: number }).smelterMul = 1;

let s = seed >>> 0 || 1;
const rng = (): number => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
const made = createRoom({ id: "DUEL", hostId: "A", hostName: "Alpha", mapId: "yard-64", maxSlots: 8 });
if (!made.ok) throw new Error(made.message);
const room = made.value;
for (const [slot, faction, type] of [[1, fA, ai], [2, fB, aiB]] as const) {
  const r = hostSlot(room, "A", slot, { status: "ai", ai: type, faction });
  if (!r.ok) throw new Error(r.message);
}
updateSelf(room, "A", { ready: true });
const started = startMatch(room, "A", rng);
if (!started.ok) throw new Error(started.message);
const state = createMatch(room, started.value);
// The host seat only opened the room: take it off the field so the CPUs have the map to themselves.
const host = state.players.get("A")!;
for (const e of [...state.entities.values()]) if (e.ownerId === "A") state.entities.delete(e.id);
host.alive = false;
const cpus = [...state.players.values()].filter((p) => p.playerId !== "A");

function holdings(p: SimPlayer): { units: number; bld: number; def: number; hp: number } {
  let units = 0;
  let bld = 0;
  let def = 0;
  let hp = 0;
  for (const e of state.entities.values()) {
    if (e.ownerId !== p.playerId || e.hp <= 0 || e.wreck) continue;
    if (e.kind === "unit") {
      units++;
      hp += catalog(e.type).hp;
    } else if (isDefenceStructure(e.type)) def++;
    else bld++;
  }
  return { units, bld, def, hp };
}

function economy(p: SimPlayer): string {
  if (!usesHiveEnergy(p.faction)) return `scrap ${Math.round(p.scrap)}`;
  const h = hiveEnergyOf(state, p.playerId);
  return `energy ${h.cap - h.used}/${h.cap} offline ${h.offline}`;
}

function report(min: number): void {
  const parts = cpus.map((p) => {
    const v = holdings(p);
    const hq = state.entities.get(p.hqId);
    return `${p.faction}[${p.alive ? "alive" : "DEAD"}] units ${v.units} (hp ${v.hp}) base ${v.bld} defences ${v.def} ${economy(p)} hq ${hq ? Math.round(hq.hp) : "none"} ${p.aiPlan?.posture ?? ""}`;
  });
  console.log(`${String(min).padStart(3)}m  ${parts.join("  |  ")}`);
}

const ticks = minutes * 60 * TICK_HZ;
for (let t = 1; t <= ticks; t++) {
  stepMatch(state);
  if (t % (every * 60 * TICK_HZ) === 0) report(t / (60 * TICK_HZ));
  if (cpus.some((p) => !p.alive)) {
    report(Math.round((t / (60 * TICK_HZ)) * 10) / 10);
    break;
  }
}
const alive = cpus.filter((p) => p.alive);
const tally = cpus.map((p) => `${p.faction}=${holdings(p).units}`).join(" vs ");
console.log(`RESULT seed=${seed} ai=${ai}/${aiB}: ${alive.length === 1 ? `${alive[0]!.faction} wins (HQ kill)` : `no HQ kill; units ${tally}`}`);
