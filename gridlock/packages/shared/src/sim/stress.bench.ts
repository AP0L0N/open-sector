/**
 * Headless stress run: one idle human against NAI Defensive CPUs on one map, timing
 * `stepMatch` and the human's snapshot as the armies grow.
 *
 *   npm run stress -w @gridlock/shared
 *   NAI=7 TICKS=9000 EVERY=900 MAP=yard-64 npm run stress -w @gridlock/shared
 *
 * Prints, every EVERY ticks, the entity counts and the mean sim / snapshot
 * milliseconds per tick with the worst tick in that window. The server tick
 * budget is 100 ms at game speed 1 and that budget is shared by every speed
 * step, so a healthy late game sits well under 20 ms.
 */
import { createRoom, hostSlot, startMatch, updateSelf } from "../lobby.js";
import { createMatch, stepMatch } from "./match.js";
import { snapshotFor } from "./snapshot.js";

const nAi = Number(process.env.NAI ?? 5);
const ticks = Number(process.env.TICKS ?? 6000);
const every = Number(process.env.EVERY ?? 600);
const made = createRoom({
  id: process.env.SEED ?? "STRESS",
  hostId: "A",
  hostName: "Alpha",
  mapId: process.env.MAP ?? "yard-64",
  maxSlots: 8,
});
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

let simMs = 0;
let snapMs = 0;
let worstMs = 0;
const t0 = performance.now();
for (let t = 1; t <= ticks; t++) {
  const a = performance.now();
  stepMatch(state);
  const b = performance.now();
  snapshotFor(state, "A");
  const c = performance.now();
  simMs += b - a;
  snapMs += c - b;
  worstMs = Math.max(worstMs, c - a);
  if (t % every === 0) {
    let units = 0;
    let buildings = 0;
    for (const e of state.entities.values()) {
      if (e.hp <= 0 || e.wreck) continue;
      if (e.kind === "unit") units++;
      else buildings++;
    }
    console.log(
      `tick ${t} (${(state.tick / 600).toFixed(1)} min) units ${units} buildings ${buildings} ` +
        `projectiles ${state.projectiles.length} fires ${state.fires.length} | ` +
        `sim ${(simMs / every).toFixed(2)} ms  snapshot ${(snapMs / every).toFixed(2)} ms  worst ${worstMs.toFixed(1)} ms`,
    );
    simMs = snapMs = worstMs = 0;
  }
  if (state.ended) {
    console.log(`match ended at tick ${t}`);
    break;
  }
}
console.log(`total ${((performance.now() - t0) / 1000).toFixed(1)} s`);
