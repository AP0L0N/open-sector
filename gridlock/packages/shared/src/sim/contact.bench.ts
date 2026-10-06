/**
 * Contact bench: idle army vs two armies already in rifle range.
 *
 *   npm run contact -w @gridlock/shared
 *   N=40 TICKS=8 npm run contact -w @gridlock/shared
 *
 * Times tickCombat (first look, then a held target), visionMask, a full
 * stepMatch, and one snapshot plus its JSON size. Not a CI test.
 */
import { TILE_EMPTY } from "../maps.js";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import { weaponRangeWorld } from "./elevation.js";
import { makeEntity, tileCenter } from "./geo.js";
import { createMatch, stepMatch } from "./match.js";
import { tickAi } from "./ai.js";
import { tickCombat, tickProjectiles } from "./combat.js";
import { snapshotFor } from "./snapshot.js";
import { visionMask } from "./vision.js";
import type { EntityType } from "../catalog.js";
import type { MatchState } from "./types.js";

const n = Number(process.env.N ?? 80);
const ticks = Number(process.env.TICKS ?? 6);

function match(): MatchState {
  const made = createRoom({ id: "CONTACT", hostId: "A", hostName: "Alpha", mapId: "yard-64", maxSlots: 8 });
  if (!made.ok) throw new Error(made.message);
  const room = made.value;
  if (!joinRoom(room, "B", "Bravo").ok) throw new Error("join");
  updateSelf(room, "A", { ready: true, spawnId: 1 });
  updateSelf(room, "B", { ready: true, spawnId: 4 });
  const started = startMatch(room, "A", () => 0);
  if (!started.ok) throw new Error(started.message);
  return createMatch(room, started.value);
}

function clearPad(state: MatchState, x0: number, y0: number, x1: number, y1: number): void {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = y * state.width + x;
      state.terrain[i] = TILE_EMPTY;
      state.blocked[i] = 0;
      state.occupy[i] = 0;
      state.heights[i] = 0;
    }
  }
}

/** A block of units. `gap` is how many tiles the block's near edge sits from the origin tile. */
function placeBlock(
  state: MatchState,
  owner: string,
  type: EntityType,
  count: number,
  originX: number,
  originY: number,
): void {
  const cols = Math.ceil(Math.sqrt(count));
  const ts = state.tileSize;
  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = (i / cols) | 0;
    makeEntity(state, type, owner, tileCenter(originX + col * 2, ts), tileCenter(originY + row * 2, ts));
  }
}

function ms(fn: () => void): number {
  const a = performance.now();
  fn();
  return performance.now() - a;
}

function report(label: string, state: MatchState): void {
  let units = 0;
  for (const e of state.entities.values()) if (e.kind === "unit" && e.hp > 0 && !e.wreck) units++;
  const combat1 = ms(() => tickCombat(state, 0.1));
  const combat2 = ms(() => tickCombat(state, 0.1));
  const vision = ms(() => visionMask(state, "A"));
  const shots = ms(() => tickProjectiles(state, 0.1));
  const ai = ms(() => tickAi(state));
  let stepMs = 0;
  for (let i = 0; i < ticks; i++) stepMs += ms(() => stepMatch(state));
  let bytes = 0;
  const snap = ms(() => {
    bytes = Buffer.byteLength(JSON.stringify(snapshotFor(state, "A")));
  });
  console.log(
    `${label}  units ${units}  projectiles ${state.projectiles.length}  ` +
      `combat ${combat1.toFixed(1)}/${combat2.toFixed(1)} ms  vision ${vision.toFixed(1)} ms  ` +
      `shots ${shots.toFixed(1)} ms  ai ${ai.toFixed(1)} ms  ` +
      `step ${(stepMs / ticks).toFixed(1)} ms  snapshot ${bytes} B in ${snap.toFixed(1)} ms`,
  );
}

function main(): void {
  const solo = match();
  clearPad(solo, 90, 90, 170, 170);
  placeBlock(solo, "A", "rifleman", n, 100, 100);
  const range = weaponRangeWorld(solo, [...solo.entities.values()].find((e) => e.type === "rifleman")!);
  console.log(`rifle range ${range.toFixed(0)} px, N=${n}`);
  report("solo idle", solo);

  const fight = match();
  clearPad(fight, 80, 80, 190, 190);
  // 36-tile rifle reach. Two blocks whose near edges are 10 tiles apart.
  placeBlock(fight, "A", "rifleman", n, 100, 110);
  placeBlock(fight, "B", "rifleman", n, 100 + 10 + Math.ceil(Math.sqrt(n)) * 2, 110);
  report("in range", fight);

  const armor = match();
  clearPad(armor, 80, 80, 190, 190);
  placeBlock(armor, "A", "rifleman", Math.min(n, 40), 100, 110);
  placeBlock(armor, "B", "warden", Math.min(n, 20), 150, 110);
  const cold = ms(() => visionMask(armor, "A"));
  for (const e of armor.entities.values()) if (e.type === "warden") e.x += armor.tileSize;
  const moved = ms(() => visionMask(armor, "A"));
  const steady = ms(() => visionMask(armor, "A"));
  console.log(`armor fog  cold ${cold.toFixed(1)} ms  after tank step ${moved.toFixed(1)} ms  cached ${steady.toFixed(1)} ms`);
}

main();
