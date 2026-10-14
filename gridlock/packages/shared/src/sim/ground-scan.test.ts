import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import {
  DAY_SECONDS,
  DUSK_SECONDS,
  GROUND_SCAN_FOLD_SECONDS,
  GROUND_SCAN_OPEN_SECONDS,
  GROUND_SCAN_SIDE_TILES,
  HIVE_CORE_ENERGY,
  NIGHT_SECONDS,
  RESEARCH,
  TICK_DT,
  TILE_SUBDIV,
  energySupplyOfEntity,
  isCivilianType,
  researchOf,
  secondsToTicks,
} from "../catalog.js";
import { TILE_BLOCKED, TILE_EMPTY, TILE_TREE } from "../maps.js";
import { applyCommand } from "./commands.js";
import { destroyEntity, hasCore, hqOf, makeEntity, tileCenter } from "./geo.js";
import { groundScanSlots, scanLightRects, scanRect } from "./ground-scan.js";
import { createMatch, step, stepMatch } from "./match.js";
import { snapshotFor } from "./snapshot.js";
import type { Entity, MatchState } from "./types.js";
import { canSeeEntity, visionMask, visionMaskFromSnapshot } from "./vision.js";

const NIGHT_TICK = Math.round((DAY_SECONDS + DUSK_SECONDS + NIGHT_SECONDS / 2) / TICK_DT);

/** A is Alliance, B the Xenite with its Hive Core standing, on bare flat ground. */
function field(): MatchState {
  const r = createRoom({ id: "GSC", hostId: "A", hostName: "Alpha", mapId: "yard-64", maxSlots: 8 });
  if (!r.ok) throw new Error(r.message);
  const room = r.value;
  assert.equal(joinRoom(room, "B", "Bravo").ok, true);
  updateSelf(room, "A", { ready: true, spawnId: 1 });
  updateSelf(room, "B", { ready: true, spawnId: 4, faction: "xeno" });
  const started = startMatch(room, "A", () => 0);
  if (!started.ok) throw new Error(started.message);
  const state = createMatch(room, started.value);
  state.heights.fill(0);
  state.occupy.fill(0);
  for (let i = 0; i < state.terrain.length; i++) {
    const t = state.terrain[i];
    if (t === TILE_TREE || t === TILE_BLOCKED) state.terrain[i] = TILE_EMPTY;
  }
  state.blocked.fill(0);
  for (const e of [...state.entities.values()]) if (isCivilianType(e.type)) destroyEntity(state, e);
  applyCommand(state, "B", { type: "cmd.deploy", id: hqOf(state, "B")!.id });
  for (let i = 0; i < 80 && !hasCore(state, "B"); i++) step(state, TICK_DT);
  assert.ok(hasCore(state, "B"), "the Hive Core stands");
  // Only the two HQs: no army walking about and lighting the test ground.
  for (const e of [...state.entities.values()]) if (e.kind === "unit") destroyEntity(state, e);
  return state;
}

function ticks(state: MatchState, n: number): void {
  for (let i = 0; i < n; i++) step(state, TICK_DT);
}

function hive(state: MatchState): Entity {
  return [...state.entities.values()].find((e) => e.type === "hivecore" && e.ownerId === "B")!;
}

function scan(state: MatchState, slot: number, x: number, y: number, who = "B") {
  return applyCommand(state, who, { type: "cmd.groundscan", slot, x, y });
}

function research(state: MatchState, e: Entity, id: keyof typeof RESEARCH): void {
  assert.equal(applyCommand(state, "B", { type: "cmd.research", ids: [e.id], research: id }).ok, true, id);
  ticks(state, secondsToTicks(RESEARCH[id].seconds) + 2);
}

/**
 * A tile out from the Hive Core toward the middle of the map: past the core's sight at night,
 * inside it by day. Returns the tile and the world point at its centre.
 */
function farTile(state: MatchState, core: Entity): { tx: number; ty: number; wx: number; wy: number } {
  const ts = state.tileSize;
  const ox = core.tileX + Math.floor(core.tileW / 2);
  const oy = core.tileY + Math.floor(core.tileH / 2);
  const dir = ox < state.width / 2 ? 1 : -1;
  const tx = ox + dir * 36;
  return { tx, ty: oy, wx: tileCenter(tx, ts), wy: tileCenter(oy, ts) };
}

describe("Xenite Ground Scan", () => {
  it("one from the start for the Xenite, none for anyone else", () => {
    const state = field();
    assert.equal(groundScanSlots(state, "B"), 1);
    assert.equal(groundScanSlots(state, "A"), 0);
    assert.equal(scan(state, 0, 500, 500, "A").ok, false);
    assert.equal(scan(state, 1, 500, 500).ok, false, "the second relay is not in orbit yet");
    assert.equal(scan(state, 0, 500, 500).ok, true);
    assert.equal(snapshotFor(state, "B").you.groundScanSlots, 1);
    assert.equal(snapshotFor(state, "A").you.groundScanSlots, undefined);
  });

  it("opens from its centre, and a move folds it in before it opens round the new one", () => {
    const state = field();
    assert.equal(scan(state, 0, 400, 400).ok, true);
    const s = state.players.get("B")!.groundScans![0]!;
    assert.equal(s.open, 0);
    ticks(state, secondsToTicks(GROUND_SCAN_OPEN_SECONDS / 2));
    assert.ok(s.open > 0.4 && s.open < 0.6, `half open, ${s.open}`);
    ticks(state, secondsToTicks(GROUND_SCAN_OPEN_SECONDS / 2) + 1);
    assert.equal(s.open, 1);
    assert.equal(s.dir, 0);
    const full = scanRect(s, state.width, state.height, state.tileSize)!;
    assert.equal(full.x1 - full.x0 + 1, GROUND_SCAN_SIDE_TILES, "a perfect square");
    assert.equal(full.y1 - full.y0 + 1, GROUND_SCAN_SIDE_TILES);

    assert.equal(scan(state, 0, 900, 700).ok, true);
    ticks(state, secondsToTicks(GROUND_SCAN_FOLD_SECONDS / 2));
    assert.equal(s.x, 400, "still folding over the old ground");
    assert.ok(s.open < 0.6 && s.open > 0.4, `half folded, ${s.open}`);
    ticks(state, secondsToTicks(GROUND_SCAN_FOLD_SECONDS / 2) + 1);
    assert.equal(s.x, 900);
    assert.equal(s.y, 700);
    assert.equal(s.dir, 1, "opening round the new centre");
    ticks(state, secondsToTicks(GROUND_SCAN_OPEN_SECONDS) + 1);
    assert.equal(s.open, 1);
    const rect = scanRect(s, state.width, state.height, state.tileSize)!;
    const ts = state.tileSize;
    assert.ok(rect.x0 <= 900 / ts && rect.x1 >= 900 / ts && rect.y0 <= 700 / ts && rect.y1 >= 700 / ts);
  });

  it("goes anywhere on the map, held inside its edge", () => {
    const state = field();
    assert.equal(scan(state, 0, -1000, 99999).ok, true);
    const s = state.players.get("B")!.groundScans![0]!;
    assert.ok(s.x >= 0 && s.y < state.height * state.tileSize);
  });

  it("the Hive Core's Orbital Relay adds a second, its Orbital Array a third", () => {
    const state = field();
    const core = hive(state);
    assert.deepEqual(researchOf("hivecore").map((r) => r.id), ["scanrelay", "scanarray"]);
    assert.equal(applyCommand(state, "B", { type: "cmd.research", ids: [core.id], research: "scanrelay" }).ok, true);
    assert.equal(energySupplyOfEntity(core), HIVE_CORE_ENERGY, "the hive's store does not dip while the relay goes up");
    ticks(state, secondsToTicks(RESEARCH.scanrelay.seconds) + 2);
    assert.equal(core.level, 1);
    assert.equal(groundScanSlots(state, "B"), 2);
    assert.equal(scan(state, 1, 600, 600).ok, true);
    assert.equal(applyCommand(state, "B", { type: "cmd.research", ids: [core.id], research: "scanarray" }).ok, false, "needs a Neural Nexus");
    const ts = state.tileSize;
    makeEntity(state, "nexus", "B", tileCenter(20, ts), tileCenter(20, ts), { tileX: 18, tileY: 18 });
    research(state, core, "scanarray");
    // The Nexus draws on the hive: short of energy, the job runs slower.
    const level = (): number => core.level ?? 0;
    for (let i = 0; i < 4000 && level() !== 2; i++) step(state, TICK_DT);
    assert.equal(level(), 2);
    assert.equal(groundScanSlots(state, "B"), 3);
    assert.equal(scan(state, 2, 700, 700).ok, true);
    assert.equal(scan(state, 3, 700, 700).ok, false, "three at most");
  });

  it("keeps its square as bright as day: night does not cut the side's sight over it", () => {
    const state = field();
    const core = hive(state);
    const far = farTile(state, core);
    const i = far.ty * state.width + far.tx;
    assert.equal(visionMask(state, "B")[i], 1, "by day the core sees that far");
    state.tick = NIGHT_TICK;
    assert.equal(visionMask(state, "B")[i], 0, "at night it does not");
    assert.equal(scan(state, 0, far.wx, far.wy).ok, true);
    ticks(state, secondsToTicks(GROUND_SCAN_OPEN_SECONDS) + 1);
    assert.equal(visionMask(state, "B")[i], 1, "under the scan it sees as by day");
    // The light is the core's eye let out to its day reach, not a window: ground past that stays dark.
    const s = state.players.get("B")!.groundScans![0]!;
    const rect = scanRect(s, state.width, state.height, state.tileSize)!;
    const beyond = core.tileX < state.width / 2 ? rect.x1 : rect.x0;
    assert.equal(visionMask(state, "B")[far.ty * state.width + beyond], 0, "past the core's day sight, the scan shows nothing");
    // The enemy gets nothing from it, and is not told it is there.
    assert.deepEqual(scanLightRects(state, "A"), []);
    assert.equal(snapshotFor(state, "A").scans, undefined);
    // The client repaints the same light from its snapshot.
    const snap = snapshotFor(state, "B");
    assert.equal(snap.scans?.length, 1);
    const client = visionMaskFromSnapshot(snap, state.width, state.height, state.tileSize);
    assert.equal(client[i], 1);
  });

  it("folding away gives the night back", () => {
    const state = field();
    const core = hive(state);
    const far = farTile(state, core);
    const i = far.ty * state.width + far.tx;
    state.tick = NIGHT_TICK;
    scan(state, 0, far.wx, far.wy);
    ticks(state, secondsToTicks(GROUND_SCAN_OPEN_SECONDS) + 1);
    assert.equal(visionMask(state, "B")[i], 1);
    // Sent clear across the map: the old square folds away.
    scan(state, 0, far.wx + (core.tileX < state.width / 2 ? 1 : -1) * 60 * TILE_SUBDIV * state.tileSize, far.wy);
    ticks(state, secondsToTicks(GROUND_SCAN_FOLD_SECONDS) + 1);
    assert.equal(visionMask(state, "B")[i], 0);
  });

  it("lights a CPU side's ray sight the same way", () => {
    const state = field();
    state.players.get("B")!.ai = "defensive";
    const core = hive(state);
    const far = farTile(state, core);
    const foe = makeEntity(state, "rifleman", "A", far.wx, far.wy);
    state.tick = NIGHT_TICK;
    assert.equal(canSeeEntity(state, "B", foe), false, "out in the dark");
    scan(state, 0, far.wx, far.wy);
    ticks(state, secondsToTicks(GROUND_SCAN_OPEN_SECONDS) + 1);
    foe.x = far.wx;
    foe.y = far.wy;
    assert.equal(canSeeEntity(state, "B", foe), true, "under the scan");
  });

  it("the Xenite CPU puts its scan over its Hive Core", () => {
    const state = field();
    state.players.get("B")!.ai = "defensive";
    for (let i = 0; i < 40; i++) stepMatch(state, TICK_DT);
    const s = state.players.get("B")!.groundScans?.[0];
    assert.ok(s, "a scan is placed");
    const core = hive(state);
    assert.ok(Math.hypot(s.x - core.x, s.y - core.y) < state.tileSize);
  });

  it("goes with its side when the Hive Core falls", () => {
    const state = field();
    scan(state, 0, 500, 500);
    destroyEntity(state, hive(state));
    ticks(state, 2);
    assert.equal(state.players.get("B")!.groundScans?.length ?? 0, 0);
  });
});
