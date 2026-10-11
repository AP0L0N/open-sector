/**
 * CPU-vs-CPU watch on a Map Builder map: one CPU on each start, no human, and every game minute
 * what each CPU holds, where its forces stand, and how many of the map's neutrals are left.
 *
 *   cd gridlock/packages/shared && FILE=../../data/maps/c-9u3jzf0dh6.json node --import tsx src/sim/map-cpu.bench.ts
 *
 * NAI CPUs (default every start), AI type (defensive|balanced|aggressive), MIN game minutes, FACTION.
 */
import fs from "node:fs";
import { createRoom, hostSlot, startMatch, updateSelf } from "../lobby.js";
import { loadCustomMap } from "../custom-maps.js";
import { DIAMOND_SCRAP_TILE_YIELD, TICK_HZ, type Faction } from "../catalog.js";
import type { AiDifficulty } from "../protocol.js";
import { createMatch, stepMatch } from "./match.js";
import { aiPlanOf, diamondCentre, findBuildTile, findOutlyingSmelterTile, findSmelterTile } from "./ai.js";
import { powerOf } from "./power.js";
import { hqOf, scrapAt } from "./geo.js";

const file = process.env.FILE ?? "../../data/maps/c-9u3jzf0dh6.json";
const raw = JSON.parse(fs.readFileSync(file, "utf8"));
const loaded = loadCustomMap({ ...(raw.spec ?? raw) });
if (!loaded.ok) throw new Error(loaded.message);
const map = loaded.map;
// The host holds a seat too (its units are taken off the map below).
const nAi = Number(process.env.NAI ?? (map.spawns?.length ?? 3) - 1);
const ai = (process.env.AI ?? "balanced") as AiDifficulty;
const minutes = Number(process.env.MIN ?? 12);
const faction = process.env.FACTION as Faction | undefined;

const made = createRoom({ id: process.env.SEED ?? "WATCH", hostId: "A", hostName: "Alpha", mapId: map.id, maxSlots: 8 });
if (!made.ok) throw new Error(made.message);
const room = made.value;
// Pogla's maps are three starts a side: 1–3 against 4–6. TEAMS=0 plays every CPU for itself.
const starts = map.spawns?.length ?? 2;
const teamOf = (spawn: number): number => (process.env.TEAMS === "0" ? 0 : spawn <= starts / 2 ? 1 : 2);
for (let i = 1; i <= nAi; i++) {
  const spawnId = i + 1;
  const r = hostSlot(room, "A", i, { status: "ai", ai, spawnId, team: teamOf(spawnId), ...(faction ? { faction } : {}) });
  if (!r.ok) throw new Error(r.message);
}
updateSelf(room, "A", { ready: true, spawnId: 1, team: teamOf(1) });
const started = startMatch(room, "A", () => 0);
if (!started.ok) throw new Error(started.message);
const state = createMatch(room, started.value);
for (const e of [...state.entities.values()]) if (e.ownerId === "A") state.entities.delete(e.id);
const host = state.players.get("A");
if (host) host.alive = false;

const ts = state.tileSize;
let scrap = 0;
let diamond = 0;
for (let ty = 0; ty < state.height; ty++)
  for (let tx = 0; tx < state.width; tx++) {
    const s = scrapAt(state, tx, ty);
    if (s >= DIAMOND_SCRAP_TILE_YIELD) diamond++;
    else if (s > 0) scrap++;
  }
const c = diamondCentre(state);
console.log(`map ${map.name} ${state.width}x${state.height} tiles (ts ${ts}) scrap ${scrap} diamond ${diamond} centre ${(c.x / ts).toFixed(0)},${(c.y / ts).toFixed(0)}`);
let nb = 0;
let nu = 0;
for (const e of state.entities.values()) {
  if (e.ownerId || e.hp <= 0) continue;
  if (e.kind === "building") nb++;
  else nu++;
}
console.log(`neutral buildings ${nb} units ${nu}`);

const cpus = [...state.players.values()].filter((p) => p.ai);
const tile = (v: { x: number; y: number }): string => `${(v.x / ts).toFixed(0)},${(v.y / ts).toFixed(0)}`;
const report = (): void => {
  let nUnits = 0;
  let nBld = 0;
  for (const e of state.entities.values()) {
    if (e.ownerId || e.hp <= 0 || e.wreck) continue;
    if (e.kind === "unit") nUnits++;
    else nBld++;
  }
  console.log(`-- min ${(state.tick / TICK_HZ / 60).toFixed(0)}  neutrals: units ${nUnits} buildings ${nBld}`);
  for (const p of cpus) {
    const hq = hqOf(state, p.playerId);
    const counts: Record<string, number> = {};
    let units = 0;
    for (const e of state.entities.values()) {
      if (e.ownerId !== p.playerId || e.hp <= 0 || e.wreck) continue;
      if (e.kind === "unit") units++;
      else counts[e.type] = (counts[e.type] ?? 0) + 1;
    }
    const plan = aiPlanOf(p);
    const forces = plan.forces.map((f) => `${f.goal}#${f.id}[${f.ids.length}/${f.size0}] route ${f.route.length}`).join(" ");
    const noRoom = Object.entries(p.aiNoRoomUntil ?? {})
      .filter(([, t]) => (t as number) > state.tick)
      .map(([k]) => k);
    const smelt = findSmelterTile(state, p.playerId);
    console.log(
      `  ${p.playerId} ${p.faction} ${p.alive ? "" : "DEAD "}hq ${hq ? tile(hq) : "-"} ${plan.posture} waves ${plan.waves} units ${units} scrap ${Math.floor(p.scrap)} ` +
        `smelterSite ${smelt ? `${smelt.tx},${smelt.ty}` : "none"} job ${p.structure?.type ?? "-"}/${p.defence?.type ?? "-"} noRoom [${noRoom.join(",")}]`,
    );
    console.log(`    ${JSON.stringify(counts)}`);
    if (forces) console.log(`    forces ${forces}`);
    if (process.env.PROBE) {
      const pow = powerOf(state, p.playerId);
      const room = (["dynamo", "muster", "armory", "research", "airfield", "radar"] as const).map((t) => `${t}:${findBuildTile(state, p.playerId, t) ? "y" : "n"}`);
      const out = hq ? findOutlyingSmelterTile(state, p.playerId, hq) : null;
      const engs = [...state.entities.values()].filter((e) => e.ownerId === p.playerId && e.type === "engineer" && e.hp > 0);
      console.log(
        `    power ${pow.used}/${pow.provided} room ${room.join(" ")} outlying ${out ? `${out.tx},${out.ty}` : "none"} ` +
          `engineers ${engs.map((e) => `${tile(e)}:${e.order?.kind ?? "-"}`).join(" ")}`,
      );
    }
  }
};

report();
const end = minutes * 60 * TICK_HZ;
const t0 = performance.now();
while (state.tick < end && !state.ended) {
  stepMatch(state);
  if (state.tick % (60 * TICK_HZ) === 0) report();
}
console.log(`ended ${state.ended ? "yes" : "no"} in ${((performance.now() - t0) / 1000).toFixed(0)} s`);
