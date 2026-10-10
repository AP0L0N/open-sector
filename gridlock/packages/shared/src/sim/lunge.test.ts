import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import { BEHEMOTH_LUNGE_RANGE_TILES, BEHEMOTH_LUNGE_SECONDS, BEHEMOTH_RING_SWEEPS, TICK_DT, isCivilianType, secondsToTicks } from "../catalog.js";
import { TILE_BLOCKED, TILE_EMPTY, TILE_TREE } from "../maps.js";
import { applyCommand } from "./commands.js";
import { destroyEntity, makeEntity, tileCenter } from "./geo.js";
import { lungeAlt, lungeCharge } from "./lunge.js";
import { createMatch, step } from "./match.js";
import { snapshotFor } from "./snapshot.js";
import type { MatchState } from "./types.js";

/** A is Alliance, B the Xenomorphs, on bare flat ground. */
function field(): MatchState {
  const r = createRoom({ id: "LNG", hostId: "A", hostName: "Alpha", mapId: "yard-64", maxSlots: 8 });
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
  return state;
}

function ticks(state: MatchState, n: number): void {
  for (let i = 0; i < n; i++) step(state, TICK_DT);
}

describe("Behemoth lunge", () => {
  it("leaps up and forward, lands short of a point past its reach, and needs a recharge", () => {
    const state = field();
    const ts = state.tileSize;
    const b = makeEntity(state, "behemoth", "B", tileCenter(100, ts), tileCenter(120, ts));
    const x0 = b.x;
    assert.equal(lungeCharge(state, b), 1);
    const r = applyCommand(state, "B", { type: "cmd.lunge", ids: [b.id], x: b.x + 80 * ts, y: b.y });
    assert.equal(r.ok, true);
    ticks(state, Math.floor(secondsToTicks(BEHEMOTH_LUNGE_SECONDS) / 2));
    assert.ok(lungeAlt(state, b) > 0, "in the air mid-lunge");
    assert.ok((snapshotFor(state, "B").entities.find((e) => e.id === b.id)?.lungeAlt ?? 0) > 0, "drawn high");
    ticks(state, secondsToTicks(BEHEMOTH_LUNGE_SECONDS));
    assert.equal(b.lunge, undefined, "down again");
    const flown = (b.x - x0) / ts;
    assert.ok(flown > BEHEMOTH_LUNGE_RANGE_TILES - 2 && flown <= BEHEMOTH_LUNGE_RANGE_TILES + 1, `flew ${flown} tiles`);
    assert.ok(lungeCharge(state, b) < 1);
    const again = applyCommand(state, "B", { type: "cmd.lunge", ids: [b.id], x: b.x + 10 * ts, y: b.y });
    assert.equal(again.ok, false);
  });

  it("lands with a ring of green laser sweeps that burn enemy soldiers and light the ground, sparing its own", () => {
    const state = field();
    const ts = state.tileSize;
    const b = makeEntity(state, "behemoth", "B", tileCenter(100, ts), tileCenter(120, ts));
    applyCommand(state, "B", { type: "cmd.lunge", ids: [b.id], x: b.x + 20 * ts, y: b.y });
    // Soldiers in a ring round where it comes down.
    const land = { x: b.x + 20 * ts, y: b.y };
    const foes = [];
    const friends = [];
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      foes.push(makeEntity(state, "rifleman", "A", land.x + Math.cos(a) * 10 * ts, land.y + Math.sin(a) * 10 * ts));
      friends.push(makeEntity(state, "xenodrone", "B", land.x + Math.cos(a + 0.26) * 9 * ts, land.y + Math.sin(a + 0.26) * 9 * ts));
    }
    ticks(state, secondsToTicks(BEHEMOTH_LUNGE_SECONDS) + 2);
    assert.ok(b.laser, "the first sweep is out");
    assert.ok(snapshotFor(state, "B").entities.find((e) => e.id === b.id)?.greenLaser, "drawn green");
    const friendIds = new Set(friends.map((f) => f.id));
    const burned = new Set<number>();
    for (let i = 0; i < secondsToTicks(BEHEMOTH_RING_SWEEPS * 0.5) + 4; i++) {
      for (const id of b.laser?.hit ?? []) burned.add(id);
      step(state, TICK_DT);
    }
    assert.ok(foes.some((f) => burned.has(f.id)), "the ring burns enemy soldiers");
    assert.ok(![...burned].some((id) => friendIds.has(id)), "its own side is spared");
    assert.ok(state.fires.length > 0, "the ground burns");
  });

  it("refuses anything but a Behemoth", () => {
    const state = field();
    const ts = state.tileSize;
    const s = makeEntity(state, "stalker", "B", tileCenter(100, ts), tileCenter(120, ts));
    const r = applyCommand(state, "B", { type: "cmd.lunge", ids: [s.id], x: s.x + 10 * ts, y: s.y });
    assert.equal(r.ok, false);
  });
});
