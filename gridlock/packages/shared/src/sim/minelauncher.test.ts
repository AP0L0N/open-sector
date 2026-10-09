import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CLUSTER_MINES,
  CLUSTER_RADIUS_TILES,
  MAMMOTH_MINE_FLIGHT_SECONDS,
  MAMMOTH_MINE_PACKS,
  MAMMOTH_MINE_RANGE_TILES,
  MAMMOTH_MINE_RELOAD_SECONDS,
  MAMMOTH_MINE_SUPPLY_COST,
  TICK_DT,
  catalog,
  minePacksOf,
  type EntityType,
} from "../catalog.js";
import { TILE_EMPTY } from "../maps.js";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import { applyCommand } from "./commands.js";
import { makeEntity, tileCenter } from "./geo.js";
import { createMatch, step } from "./match.js";
import { mineLaunchReach } from "./minelauncher.js";
import { snapshotFor } from "./snapshot.js";
import { needsSupply, transferOnce } from "./supply.js";
import type { Entity, MatchState } from "./types.js";

function twoPlayerMatch(): { state: MatchState; a: string; b: string } {
  const r = createRoom({ id: "ML1", hostId: "A", hostName: "Alpha", mapId: "yard-64", maxSlots: 8 });
  if (!r.ok) throw new Error(r.message);
  const room = r.value;
  assert.equal(joinRoom(room, "B", "Bravo").ok, true);
  updateSelf(room, "A", { ready: true, spawnId: 1 });
  updateSelf(room, "B", { ready: true, spawnId: 4 });
  const started = startMatch(room, "A", () => 0);
  if (!started.ok) throw new Error(started.message);
  const state = createMatch(room, started.value);
  state.heights.fill(0);
  return { state, a: "A", b: "B" };
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

function at(state: MatchState, type: EntityType, owner: string, tx: number, ty: number): Entity {
  const ts = state.tileSize;
  return makeEntity(state, type, owner, tileCenter(tx, ts), tileCenter(ty, ts));
}

/** Step until `done` or `max` ticks. */
function until(state: MatchState, done: () => boolean, max: number): void {
  for (let i = 0; i < max && !done(); i++) step(state, TICK_DT);
}

function seconds(state: MatchState, s: number): void {
  for (let i = 0; i < Math.ceil(s / TICK_DT); i++) step(state, TICK_DT);
}

const Y = 40;

describe("mammoth mine launcher", () => {
  it("only the Mammoth carries one, with three packs", () => {
    assert.equal(minePacksOf("mammoth"), 3);
    assert.equal(MAMMOTH_MINE_PACKS, 3);
    assert.equal(minePacksOf("titan"), 0);
    assert.equal(minePacksOf("bv222"), 0);
    assert.match(catalog("mammoth").blurb ?? "", /Deploy mines/);
    const { state, a } = twoPlayerMatch();
    assert.equal(at(state, "mammoth", a, 60, Y).minePacks, MAMMOTH_MINE_PACKS);
    assert.equal(at(state, "warden", a, 60, Y + 4).minePacks, undefined);
  });

  it("lobs a pack inside reach that bursts into a BV 222's field around the point", () => {
    const { state, a } = twoPlayerMatch();
    clearPad(state, 50, Y - 16, 140, Y + 16);
    const ts = state.tileSize;
    const hull = at(state, "mammoth", a, 60, Y);
    const x = tileCenter(60 + 30, ts);
    const y = tileCenter(Y, ts);
    assert.ok(Math.hypot(x - hull.x, y - hull.y) < mineLaunchReach(state));
    const x0 = hull.x;
    assert.equal(applyCommand(state, a, { type: "cmd.minelay", ids: [hull.id], x, y }).ok, true);
    step(state, TICK_DT);
    assert.equal(hull.minePacks, MAMMOTH_MINE_PACKS - 1, "fired at once");
    assert.equal(hull.order, null, "one pack per order");
    const can = state.projectiles.find((p) => p.fromId === hull.id);
    assert.ok(can, "a canister is in the air");
    assert.equal(can.flight, "cluster");
    assert.equal(can.lobbed, true);
    assert.equal(state.mines.length, 0);
    seconds(state, MAMMOTH_MINE_FLIGHT_SECONDS / 2);
    assert.ok((can.z ?? 0) > 0, "it arcs up off the deck");
    seconds(state, MAMMOTH_MINE_FLIGHT_SECONDS);
    assert.equal(state.mines.length, CLUSTER_MINES, "the same field a BV 222 drops");
    const r = CLUSTER_RADIUS_TILES * ts + 1;
    for (const m of state.mines) {
      assert.ok(Math.hypot(m.x - x, m.y - y) <= r);
      assert.equal(m.ownerId, a);
    }
    assert.equal(hull.x, x0, "stood where it was");
  });

  it("walks toward a point out of reach and fires once it is in reach", () => {
    const { state, a } = twoPlayerMatch();
    clearPad(state, 40, Y - 16, 200, Y + 16);
    const ts = state.tileSize;
    const hull = at(state, "mammoth", a, 50, Y);
    const reach = mineLaunchReach(state);
    const x = hull.x + reach + 10 * ts;
    const y = hull.y;
    assert.equal(MAMMOTH_MINE_RANGE_TILES * ts, reach);
    assert.equal(applyCommand(state, a, { type: "cmd.minelay", ids: [hull.id], x, y }).ok, true);
    step(state, TICK_DT);
    assert.equal(hull.minePacks, MAMMOTH_MINE_PACKS, "out of reach: no shot yet");
    assert.equal(hull.order?.kind, "minelay");
    let firedFrom: number | null = null;
    for (let i = 0; i < 20000 && firedFrom == null; i++) {
      const before = hull.minePacks ?? 0;
      step(state, TICK_DT);
      if ((hull.minePacks ?? 0) < before) firedFrom = Math.hypot(x - hull.x, y - hull.y);
    }
    assert.ok(firedFrom != null, "it fired");
    assert.ok(firedFrom <= reach, "only from inside reach");
    assert.ok(firedFrom > reach - 3 * ts, "and stopped as soon as it was in reach");
    assert.equal(hull.order, null);
    assert.equal(hull.waypoints.length, 0);
  });

  it("runs dry after three packs and refuses the next order", () => {
    const { state, a } = twoPlayerMatch();
    clearPad(state, 50, Y - 16, 140, Y + 16);
    const ts = state.tileSize;
    const hull = at(state, "mammoth", a, 60, Y);
    for (let k = 0; k < MAMMOTH_MINE_PACKS; k++) {
      const x = tileCenter(80 + k * 12, ts);
      assert.equal(applyCommand(state, a, { type: "cmd.minelay", ids: [hull.id], x, y: tileCenter(Y + 10, ts) }).ok, true);
      until(state, () => hull.order == null, 2000);
      assert.equal(hull.minePacks, MAMMOTH_MINE_PACKS - 1 - k);
    }
    const r = applyCommand(state, a, { type: "cmd.minelay", ids: [hull.id], x: tileCenter(90, ts), y: tileCenter(Y - 10, ts) });
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.message, /No mine packs left/);
    assert.equal(hull.order, null);
  });

  it("feeds the next pack only after the reload", () => {
    const { state, a } = twoPlayerMatch();
    clearPad(state, 50, Y - 16, 140, Y + 16);
    const ts = state.tileSize;
    const hull = at(state, "mammoth", a, 60, Y);
    applyCommand(state, a, { type: "cmd.minelay", ids: [hull.id], x: tileCenter(85, ts), y: tileCenter(Y + 10, ts) });
    step(state, TICK_DT);
    applyCommand(state, a, { type: "cmd.minelay", ids: [hull.id], x: tileCenter(85, ts), y: tileCenter(Y - 10, ts) });
    step(state, TICK_DT);
    assert.equal(hull.minePacks, MAMMOTH_MINE_PACKS - 1, "still feeding");
    seconds(state, MAMMOTH_MINE_RELOAD_SECONDS);
    assert.equal(hull.minePacks, MAMMOTH_MINE_PACKS - 2);
  });

  it("takes Shift-queued fields one after another", () => {
    const { state, a } = twoPlayerMatch();
    clearPad(state, 50, Y - 16, 140, Y + 16);
    const ts = state.tileSize;
    const hull = at(state, "mammoth", a, 60, Y);
    for (let k = 0; k < 3; k++) {
      const msg = { type: "cmd.minelay" as const, ids: [hull.id], x: tileCenter(80 + k * 10, ts), y: tileCenter(Y + 12, ts), queue: true };
      assert.equal(applyCommand(state, a, msg).ok, true);
    }
    seconds(state, MAMMOTH_MINE_RELOAD_SECONDS * 3 + MAMMOTH_MINE_FLIGHT_SECONDS + 1);
    assert.equal(hull.minePacks, 0);
    assert.equal(state.mines.length, CLUSTER_MINES * 3);
  });

  it("a supply truck or a crate puts packs back, at a pack's price", () => {
    const { state, a } = twoPlayerMatch();
    const hull = at(state, "mammoth", a, 60, Y);
    assert.equal(needsSupply(hull), false);
    hull.minePacks = 0;
    assert.equal(needsSupply(hull), true);
    const store = { supply: MAMMOTH_MINE_SUPPLY_COST * 2 + 1 };
    let packs = 0;
    while (transferOnce(store, hull) && packs < 10) packs++;
    assert.equal(hull.minePacks, 2, "two packs paid for");
    assert.equal(store.supply, 1);
    hull.minePacks = MAMMOTH_MINE_PACKS;
    assert.equal(needsSupply(hull), false);
  });

  it("refills from a supply truck parked alongside", () => {
    const { state, a } = twoPlayerMatch();
    clearPad(state, 50, Y - 16, 140, Y + 16);
    const hull = at(state, "mammoth", a, 60, Y);
    hull.minePacks = 0;
    at(state, "supply", a, 60, Y + 7);
    until(state, () => hull.minePacks === MAMMOTH_MINE_PACKS, 6000);
    assert.equal(hull.minePacks, MAMMOTH_MINE_PACKS);
  });

  it("shows its packs to its own side only", () => {
    const { state, a, b } = twoPlayerMatch();
    const hull = at(state, "mammoth", a, 60, Y);
    hull.minePacks = 2;
    const mine = snapshotFor(state, a).entities.find((e) => e.id === hull.id);
    assert.equal(mine?.minePacks, 2);
    const theirs = snapshotFor(state, b).entities.find((e) => e.id === hull.id);
    assert.equal(theirs?.minePacks, undefined);
  });

  it("refuses a hull that is not yours or not a Mammoth", () => {
    const { state, a, b } = twoPlayerMatch();
    const ts = state.tileSize;
    const hull = at(state, "mammoth", a, 60, Y);
    const tank = at(state, "warden", a, 64, Y);
    const x = tileCenter(70, ts);
    const y = tileCenter(Y, ts);
    assert.equal(applyCommand(state, b, { type: "cmd.minelay", ids: [hull.id], x, y }).ok, false);
    assert.equal(applyCommand(state, a, { type: "cmd.minelay", ids: [tank.id], x, y }).ok, false);
    assert.equal(hull.minePacks, MAMMOTH_MINE_PACKS);
  });
});
