/**
 * Ablation stress run on a Map Builder map file: one idle human vs NAI Easy CPUs.
 *
 *   cd gridlock/packages/shared && FILE=../../data/maps/c-9u3jzf0dh6.json node --import tsx <this file>
 *
 * STRIP=units,patrol,inside,features,lamps,clutter,shroud,walls removes that part
 * of the map before the match starts. Prints sim / snapshot ms per tick every
 * EVERY ticks (mean over that window), snapshot bytes, and sweep / memo counts.
 */
import fs from "node:fs";
import { createRoom, hostSlot, startMatch, updateSelf } from "../lobby.js";
import { loadCustomMap } from "../custom-maps.js";
import { createMatch, stepMatch } from "./match.js";
import { snapshotFor } from "./snapshot.js";
import { sweepStats } from "./sight-sweep.js";
import { memoStats } from "./vision.js";

const file = process.env.FILE ?? "/home/apolon/projects/open-sector/gridlock/data/maps/c-9u3jzf0dh6.json";
const nAi = Number(process.env.NAI ?? 1);
const ticks = Number(process.env.TICKS ?? 1500);
const every = Number(process.env.EVERY ?? 500);
const strip = new Set((process.env.STRIP ?? "").split(",").filter(Boolean));

const raw = JSON.parse(fs.readFileSync(file, "utf8"));
const spec = { ...(raw.spec ?? raw) };
// Keep the map's own id: the validator only accepts the builder's id shape.
if (strip.has("units")) spec.units = [];
if (strip.has("patrol")) spec.units = (spec.units ?? []).map((u: { patrol?: unknown; loop?: unknown }) => ({ ...u, patrol: undefined, loop: undefined }));
if (strip.has("inside")) spec.units = (spec.units ?? []).filter((u: { inside?: boolean }) => !u.inside);
if (strip.has("features")) spec.features = [];
if (strip.has("walls")) spec.features = (spec.features ?? []).filter((f: { type: string }) => f.type !== "wall" && f.type !== "sandbags");
if (strip.has("lamps")) spec.lamps = [];
if (strip.has("clutter")) spec.clutter = [];
if (strip.has("shroud")) spec.shroud = false;
const loaded = loadCustomMap(spec);
if (!loaded.ok) throw new Error(loaded.message);
const map = loaded.map;

const made = createRoom({ id: process.env.SEED ?? "STRESS", hostId: "A", hostName: "Alpha", mapId: map.id, maxSlots: 8 });
if (!made.ok) throw new Error(made.message);
const room = made.value;
for (let i = 1; i <= nAi; i++) {
  const r = hostSlot(room, "A", i, { status: "ai" });
  if (!r.ok) throw new Error(r.message);
}
updateSelf(room, "A", { ready: true });
const started = startMatch(room, "A", () => 0);
if (!started.ok) throw new Error(started.message);
const state = createMatch(room, started.value);
console.log(
  `map ${map.name} ${map.width}x${map.height} strip=[${[...strip].join(",")}] units ${map.units?.length ?? 0} features ${map.features?.length ?? 0} ` +
    `lamps ${map.lamps?.length ?? 0} clutter ${map.clutter?.length ?? 0} | ${nAi} CPUs, entities ${state.entities.size}`,
);

let simMs = 0;
let snapMs = 0;
let worstMs = 0;
let over50 = 0;
const t0 = performance.now();
for (let t = 1; t <= ticks; t++) {
  const a = performance.now();
  stepMatch(state);
  const b = performance.now();
  const snap = snapshotFor(state, "A", { scrap: false });
  const c = performance.now();
  simMs += b - a;
  snapMs += c - b;
  worstMs = Math.max(worstMs, c - a);
  if (c - a >= 50) over50++;
  if (t % every === 0) {
    const bytes = JSON.stringify(snap).length;
    let unitsN = 0;
    let buildings = 0;
    let neutralUnits = 0;
    for (const e of state.entities.values()) {
      if (e.hp <= 0 || e.wreck) continue;
      if (e.kind === "unit") {
        unitsN++;
        if (!e.ownerId) neutralUnits++;
      } else buildings++;
    }
    console.log(
      `tick ${t} units ${unitsN} (neutral ${neutralUnits}) buildings ${buildings} proj ${state.projectiles.length} | ` +
        `sim ${(simMs / every).toFixed(2)} ms  snapshot ${(snapMs / every).toFixed(2)} ms  worst ${worstMs.toFixed(1)} ms  over50 ${over50}  ` +
        `snapBytes ${bytes} visible ${snap.entities.length} | sweeps ${JSON.stringify(sweepStats)} memo ${JSON.stringify(memoStats)}`,
    );
    simMs = snapMs = worstMs = 0;
    over50 = 0;
    for (const key of Object.keys(sweepStats)) (sweepStats as Record<string, number>)[key] = 0;
    for (const key of Object.keys(memoStats)) (memoStats as Record<string, number>)[key] = 0;
  }
  if (state.ended) {
    console.log(`match ended at tick ${t}`);
    break;
  }
}
console.log(`total ${((performance.now() - t0) / 1000).toFixed(1)} s`);
