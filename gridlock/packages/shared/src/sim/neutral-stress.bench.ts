/**
 * Stress run with neutral map units: one idle human, NAI Easy CPUs, and NUNITS
 * neutral units scattered over the open ground of MAP. Prints sim / snapshot
 * ms per tick every EVERY ticks (mean over that window).
 *
 *   cd gridlock/packages/shared && node --import tsx <this file>
 *
 * SCALE=2 tiles the base map 2x2 (yard-64 -> 512x512 fine tiles).
 * PATROL=1 gives every neutral a short looped patrol so it moves.
 * MIX=rifleman,warden,... picks the neutral unit types.
 */
import { createRoom, hostSlot, startMatch, updateSelf } from "../lobby.js";
import type { TrainType } from "../catalog.js";
import { TILE_EMPTY, getMap, registerMap, type MapDef, type MapUnit } from "../maps.js";
import { createMatch, stepMatch } from "./match.js";
import { snapshotFor } from "./snapshot.js";
import { sweepStats } from "./sight-sweep.js";
import { memoStats } from "./vision.js";

const nAi = Number(process.env.NAI ?? 1);
const nUnits = Number(process.env.NUNITS ?? 200);
const ticks = Number(process.env.TICKS ?? 1500);
const every = Number(process.env.EVERY ?? 300);
const scale = Number(process.env.SCALE ?? 1);
const patrol = process.env.PATROL === "1";
const baseId = process.env.MAP ?? "yard-64";
const mix = (process.env.MIX ?? "rifleman,gunner,sniper,warden,ss3,atinfantry").split(",") as TrainType[];

const base0 = getMap(baseId);
if (!base0) throw new Error(`no map ${baseId}`);
let base: MapDef = base0;
if (scale > 1) {
  const w0 = base0.width;
  const h0 = base0.height;
  const w = w0 * scale;
  const h = h0 * scale;
  const tiles = new Array<number>(w * h);
  const heights = new Array<number>(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      tiles[y * w + x] = base0.tiles[(y % h0) * w0 + (x % w0)]!;
      heights[y * w + x] = base0.heights[(y % h0) * w0 + (x % w0)]!;
    }
  }
  base = { ...base0, width: w, height: h, tiles, heights };
}
const units: MapUnit[] = [];
// Walk a coarse lattice over the map, keeping clear of the corners where starts sit.
const w = base.width;
const h = base.height;
const stepT = Math.max(4, Math.floor(Math.sqrt((w * h) / (nUnits * 3))));
let k = 0;
outer: for (let y = Math.floor(h * 0.2); y < h * 0.8; y += stepT) {
  for (let x = Math.floor(w * 0.2); x < w * 0.8; x += stepT) {
    if (base.tiles[y * w + x] !== TILE_EMPTY) continue;
    const u: MapUnit = { type: mix[k % mix.length]!, x, y, facing: (k * 37) % 360 };
    if (patrol) {
      u.patrol = [
        { x: Math.min(w - 2, x + 6), y },
        { x: Math.min(w - 2, x + 6), y: Math.min(h - 2, y + 6) },
        { x, y: Math.min(h - 2, y + 6) },
      ];
      u.loop = true;
    }
    units.push(u);
    k++;
    if (units.length >= nUnits) break outer;
  }
}
const id = `${baseId}-neutral-stress`;
registerMap({ ...base, id, units: [...(base.units ?? []), ...units] });

const made = createRoom({ id: process.env.SEED ?? "STRESS", hostId: "A", hostName: "Alpha", mapId: id, maxSlots: 8 });
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
console.log(`map ${id} ${w}x${h}, placed ${units.length} neutral units (patrol ${patrol}), ${nAi} CPUs, entities ${state.entities.size}`);

let simMs = 0;
let snapMs = 0;
let worstMs = 0;
let bytes = 0;
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
  if (t % every === 0) {
    bytes = JSON.stringify(snap).length;
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
        `sim ${(simMs / every).toFixed(2)} ms  snapshot ${(snapMs / every).toFixed(2)} ms  worst ${worstMs.toFixed(1)} ms  ` +
        `snapBytes ${bytes} visible ${snap.entities.length} | sweeps ${JSON.stringify(sweepStats)} memo ${JSON.stringify(memoStats)}`,
    );
    simMs = snapMs = worstMs = 0;
    for (const key of Object.keys(sweepStats)) (sweepStats as Record<string, number>)[key] = 0;
    for (const key of Object.keys(memoStats)) (memoStats as Record<string, number>)[key] = 0;
  }
  if (state.ended) {
    console.log(`match ended at tick ${t}`);
    break;
  }
}
console.log(`total ${((performance.now() - t0) / 1000).toFixed(1)} s`);
