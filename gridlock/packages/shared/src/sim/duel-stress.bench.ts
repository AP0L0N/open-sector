/**
 * Duel stress: a Map Builder map (default Test01) with two human seats, each
 * with N infantry walking a loop toward the middle, plus the map's neutrals.
 *
 *   N=20 TICKS=900 EVERY=300 npm run stress:duel -w @gridlock/shared
 *   WALK=0 stands them still; NAI adds Easy CPUs; FILE picks another map.
 *
 * Baseline 2026-10-08 (N=20, before the round-2 work): sim 22-29 ms/tick,
 * two snapshots 1-2 ms, worst 80-180 ms. Target: <= 8 ms mean, worst < 40.
 */
import fs from "node:fs";
import { createRoom, joinRoom, hostSlot, startMatch, updateSelf } from "../lobby.js";
import { loadCustomMap } from "../custom-maps.js";
import { createMatch, stepMatch } from "./match.js";
import { snapshotFor } from "./snapshot.js";
import { applyCommand } from "./commands.js";
import { hqOf, makeEntity } from "./geo.js";
import { sweepStats } from "./sight-sweep.js";
import { memoStats } from "./vision.js";

const file = process.env.FILE ?? "/home/apolon/projects/open-sector/gridlock/data/maps/c-9u3jzf0dh6.json";
const n = Number(process.env.N ?? 20);
const nAi = Number(process.env.NAI ?? 0);
const ticks = Number(process.env.TICKS ?? 900);
const every = Number(process.env.EVERY ?? 300);
const walk = process.env.WALK !== "0";
const raw = JSON.parse(fs.readFileSync(file, "utf8"));
const loaded = loadCustomMap(raw.spec ?? raw);
if (!loaded.ok) throw new Error(loaded.message);
const map = loaded.map;
const made = createRoom({ id: "TWO", hostId: "A", hostName: "Alpha", mapId: map.id, maxSlots: 8 });
if (!made.ok) throw new Error(made.message);
const room = made.value;
if (!joinRoom(room, "B", "Bravo").ok) throw new Error("join");
for (let i = 2; i < 2 + nAi; i++) hostSlot(room, "A", i, { status: "ai" });
updateSelf(room, "A", { ready: true, spawnId: 1 });
updateSelf(room, "B", { ready: true, spawnId: 2 });
const started = startMatch(room, "A", () => 0);
if (!started.ok) throw new Error(started.message);
const state = createMatch(room, started.value);
const ts = state.tileSize;
for (const pid of ["A", "B"]) {
  const hq = hqOf(state, pid)!;
  const ids: number[] = [];
  for (let i = 0; i < n; i++) {
    const e = makeEntity(state, i % 4 === 3 ? "gunner" : "rifleman", pid, hq.x + ((i % 5) - 2) * ts * 1.5, hq.y + (Math.floor(i / 5) - 2) * ts * 1.5 + 6 * ts);
    ids.push(e.id);
  }
  if (walk) {
    const cx = (map.width * ts) / 2;
    const cy = (map.height * ts) / 2;
    const r = applyCommand(state, pid, { type: "cmd.patrol", ids, points: [{ x: (hq.x + cx) / 2, y: (hq.y + cy) / 2 }, { x: cx, y: cy }], loop: true });
    if (!r.ok) console.log("patrol failed", r.message);
  }
}
console.log(`Test01: 2 humans x ${n} infantry (${walk ? "walking" : "standing"}), ${nAi} CPUs, entities ${state.entities.size}`);
let simMs = 0, snapMs = 0, worst = 0, over = 0;
for (let t = 1; t <= ticks; t++) {
  const a = performance.now();
  stepMatch(state);
  const b = performance.now();
  snapshotFor(state, "A", { scrap: false });
  snapshotFor(state, "B", { scrap: false });
  const c = performance.now();
  simMs += b - a; snapMs += c - b; worst = Math.max(worst, c - a); if (c - a >= 50) over++;
  if (t % every === 0) {
    let units = 0; for (const e of state.entities.values()) if (e.kind === "unit" && e.hp > 0) units++;
    console.log(`tick ${t} units ${units} | sim ${(simMs / every).toFixed(2)} ms snapshots(2) ${(snapMs / every).toFixed(2)} ms worst ${worst.toFixed(1)} over50 ${over} | sweeps/tick ${(sweepStats.sweeps / every).toFixed(1)} tiles/sweep ${(sweepStats.tiles / Math.max(1, sweepStats.sweeps)).toFixed(0)} memo ${JSON.stringify(memoStats)}`);
    simMs = snapMs = worst = 0; over = 0;
    for (const k of Object.keys(sweepStats)) (sweepStats as Record<string, number>)[k] = 0;
    for (const k of Object.keys(memoStats)) (memoStats as Record<string, number>)[k] = 0;
  }
}
