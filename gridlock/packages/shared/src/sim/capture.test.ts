import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import { CAPTURE_SECONDS_MIN, TICK_DT, catalog, isCivilianType } from "../catalog.js";
import { applyCommand } from "./commands.js";
import { captureDurationSec } from "./capture.js";
import { buildingCenter, destroyEntity, makeEntity, tileCenter } from "./geo.js";
import { enterGarrison } from "./garrison.js";
import { createMatch, step } from "./match.js";
import { snapshotFor } from "./snapshot.js";
import type { MatchState } from "./types.js";

function twoPlayerMatch(): { state: MatchState; a: string; b: string } {
  const r = createRoom({
    id: "CP1",
    hostId: "A",
    hostName: "Alpha",
    mapId: "yard-64",
    maxSlots: 8,
  });
  if (!r.ok) throw new Error(r.message);
  const room = r.value;
  assert.equal(joinRoom(room, "B", "Bravo").ok, true);
  updateSelf(room, "A", { ready: true, spawnId: 1 });
  updateSelf(room, "B", { ready: true, spawnId: 4 });
  const started = startMatch(room, "A");
  if (!started.ok) throw new Error(started.message);
  return { state: createMatch(room, started.value, { startingUnits: false }), a: "A", b: "B" };
}

function clearCivilians(state: MatchState): void {
  for (const e of [...state.entities.values()]) {
    if (isCivilianType(e.type)) destroyEntity(state, e);
  }
}

function ticks(state: MatchState, n: number): void {
  for (let i = 0; i < n; i++) step(state, TICK_DT);
}

function placeAdjacent(
  state: MatchState,
  type: "trooper" | "warden",
  ownerId: string,
  building: { tileX: number; tileY: number },
): ReturnType<typeof makeEntity> {
  const ts = state.tileSize;
  return makeEntity(state, type, ownerId, tileCenter(building.tileX - 1, ts), tileCenter(building.tileY, ts));
}

describe("infantry capture", () => {
  it("scales capture time with building HP", () => {
    const { state, b } = twoPlayerMatch();
    const ts = state.tileSize;
    const dyn = makeEntity(state, "dynamo", b, tileCenter(40, ts), tileCenter(24, ts), { tileX: 40, tileY: 24 });
    assert.equal(captureDurationSec(dyn), 10);
    assert.ok(captureDurationSec(dyn) >= CAPTURE_SECONDS_MIN);
    const core = makeEntity(state, "core", b, tileCenter(10, ts), tileCenter(10, ts), { tileX: 8, tileY: 8 });
    assert.ok(captureDurationSec(core) > captureDurationSec(dyn));
  });

  it("does not shoot a Dynamo; troopers take it from the next tile", () => {
    const { state, a, b } = twoPlayerMatch();
    state.heights.fill(0);
    state.blocked.fill(0);
    clearCivilians(state);
    const ts = state.tileSize;
    const tileX = 40;
    const tileY = 24;
    const c = buildingCenter(tileX, tileY, catalog("dynamo").tileW, catalog("dynamo").tileH, ts);
    const dyn = makeEntity(state, "dynamo", b, c.x, c.y, { tileX, tileY });
    dyn.hpMax = 75;
    const inf = placeAdjacent(state, "trooper", a, dyn);
    const hp0 = dyn.hp;
    const res = applyCommand(state, a, { type: "cmd.attack", ids: [inf.id], targetId: dyn.id });
    assert.equal(res.ok, true, !res.ok ? res.message : "");
    ticks(state, 8);
    assert.equal(dyn.hp, hp0, "infantry must not damage the structure");
    assert.equal(state.projectiles.length, 0);
    assert.ok(dyn.captureProgress > 0, `progress=${dyn.captureProgress}`);
    assert.equal(dyn.captureOwnerId, a);
    const snap = snapshotFor(state, a);
    const view = snap.entities.find((e) => e.id === dyn.id);
    assert.ok(view?.capture && view.capture.progress > 0);
    assert.equal(view?.capture?.ownerId, a);

    const wait = Math.ceil(captureDurationSec(dyn) / TICK_DT) + 4;
    ticks(state, wait);
    assert.equal(dyn.ownerId, a);
    assert.equal(dyn.captureProgress, 0);
    assert.equal(dyn.captureOwnerId, "");
  });

  it("does not progress while the trooper is only in rifle range", () => {
    const { state, a, b } = twoPlayerMatch();
    state.heights.fill(0);
    state.blocked.fill(0);
    clearCivilians(state);
    const ts = state.tileSize;
    const tileX = 48;
    const tileY = 24;
    const c = buildingCenter(tileX, tileY, catalog("dynamo").tileW, catalog("dynamo").tileH, ts);
    const dyn = makeEntity(state, "dynamo", b, c.x, c.y, { tileX, tileY });
    const inf = makeEntity(state, "trooper", a, tileCenter(tileX - 20, ts), tileCenter(tileY, ts));
    inf.facing = 0;
    applyCommand(state, a, { type: "cmd.attack", ids: [inf.id], targetId: dyn.id });
    ticks(state, 3);
    assert.equal(dyn.captureProgress, 0);
    assert.equal(dyn.hp, catalog("dynamo").hp);
    assert.equal(state.projectiles.length, 0);
    assert.equal(dyn.ownerId, b);
  });

  it("decays after the troopers are pulled off", () => {
    const { state, a, b } = twoPlayerMatch();
    state.heights.fill(0);
    state.blocked.fill(0);
    clearCivilians(state);
    const ts = state.tileSize;
    const dyn = makeEntity(state, "dynamo", b, tileCenter(40, ts), tileCenter(24, ts), { tileX: 40, tileY: 24 });
    dyn.hpMax = 75;
    const inf = placeAdjacent(state, "trooper", a, dyn);
    applyCommand(state, a, { type: "cmd.attack", ids: [inf.id], targetId: dyn.id });
    ticks(state, 20);
    const mid = dyn.captureProgress;
    assert.ok(mid > 0.1, `mid=${mid}`);
    applyCommand(state, a, { type: "cmd.stop", ids: [inf.id] });
    ticks(state, 12);
    assert.ok(dyn.captureProgress < mid, `after stop ${dyn.captureProgress} vs ${mid}`);
    assert.equal(dyn.ownerId, b);
  });

  it("captures faster with more troopers", () => {
    const { state, a, b } = twoPlayerMatch();
    state.heights.fill(0);
    state.blocked.fill(0);
    clearCivilians(state);
    const ts = state.tileSize;
    const dyn = makeEntity(state, "dynamo", b, tileCenter(40, ts), tileCenter(24, ts), { tileX: 40, tileY: 24 });
    dyn.hpMax = 75;
    const one = placeAdjacent(state, "trooper", a, dyn);
    applyCommand(state, a, { type: "cmd.attack", ids: [one.id], targetId: dyn.id });
    ticks(state, 15);
    const solo = dyn.captureProgress;
    dyn.captureProgress = 0;
    dyn.captureOwnerId = "";
    applyCommand(state, a, { type: "cmd.stop", ids: [one.id] });
    const two = makeEntity(state, "trooper", a, tileCenter(dyn.tileX - 1, ts), tileCenter(dyn.tileY + 1, ts));
    applyCommand(state, a, { type: "cmd.attack", ids: [one.id, two.id], targetId: dyn.id });
    ticks(state, 15);
    assert.ok(dyn.captureProgress > solo * 1.4, `pair ${dyn.captureProgress} vs solo ${solo}`);
  });

  it("lets a Warden still shell a building", () => {
    const { state, a, b } = twoPlayerMatch();
    state.heights.fill(0);
    state.blocked.fill(0);
    clearCivilians(state);
    const ts = state.tileSize;
    const tileX = 40;
    const tileY = 24;
    const c = buildingCenter(tileX, tileY, catalog("dynamo").tileW, catalog("dynamo").tileH, ts);
    const dyn = makeEntity(state, "dynamo", b, c.x, c.y, { tileX, tileY });
    const tank = makeEntity(state, "warden", a, tileCenter(tileX - 6, ts), c.y);
    tank.facing = 0;
    tank.turretFacing = 0;
    const hp0 = dyn.hp;
    applyCommand(state, a, { type: "cmd.attack", ids: [tank.id], targetId: dyn.id });
    ticks(state, 20);
    assert.ok(dyn.hp < hp0, `dynamo hp ${dyn.hp} vs ${hp0}`);
    assert.equal(dyn.ownerId, b);
  });

  it("does not capture an empty civilian house", () => {
    const { state, a } = twoPlayerMatch();
    state.heights.fill(0);
    state.blocked.fill(0);
    clearCivilians(state);
    const ts = state.tileSize;
    const house = makeEntity(state, "cottage", "", tileCenter(40, ts), tileCenter(16, ts), {
      tileX: 36,
      tileY: 12,
    });
    const inf = placeAdjacent(state, "trooper", a, house);
    applyCommand(state, a, { type: "cmd.attack", ids: [inf.id], targetId: house.id });
    const wait = Math.ceil(captureDurationSec(house) / TICK_DT) + 8;
    ticks(state, wait);
    assert.equal(house.ownerId, "");
    assert.equal(house.captureProgress, 0);
    assert.ok(house.hp > 0);
  });

  it("does not capture a house while it is garrisoned", () => {
    const { state, a, b } = twoPlayerMatch();
    state.heights.fill(0);
    state.blocked.fill(0);
    clearCivilians(state);
    const ts = state.tileSize;
    const house = makeEntity(state, "cottage", "", tileCenter(40, ts), tileCenter(16, ts), {
      tileX: 36,
      tileY: 12,
    });
    const occ = makeEntity(state, "trooper", b, tileCenter(34, ts), tileCenter(12, ts));
    const houseHp = house.hp;
    assert.equal(enterGarrison(state, occ, house), true);
    const occHp = occ.hp;
    const inf = placeAdjacent(state, "trooper", a, house);
    applyCommand(state, a, { type: "cmd.attack", ids: [inf.id], targetId: house.id });
    ticks(state, 12);
    assert.equal(house.ownerId, "");
    assert.equal(house.hp, houseHp, "rifles must not chew occupied walls");
    const stillIn = state.entities.get(occ.id);
    if (stillIn) {
      assert.equal(stillIn.garrisonedIn, house.id);
      assert.ok(stillIn.hp < occHp, `occupant hp ${stillIn.hp} vs ${occHp}`);
    }
  });

  it("eliminates a player whose Core is captured", () => {
    const { state, a, b } = twoPlayerMatch();
    state.heights.fill(0);
    state.blocked.fill(0);
    clearCivilians(state);
    const ts = state.tileSize;
    const tileX = 36;
    const tileY = 20;
    const c = buildingCenter(tileX, tileY, catalog("core").tileW, catalog("core").tileH, ts);
    const core = makeEntity(state, "core", b, c.x, c.y, { tileX, tileY });
    core.hpMax = 75;
    const p = state.players.get(b)!;
    p.hqId = core.id;
    const inf = placeAdjacent(state, "trooper", a, core);
    applyCommand(state, a, { type: "cmd.attack", ids: [inf.id], targetId: core.id });
    const wait = Math.ceil(captureDurationSec(core) / TICK_DT) + 8;
    ticks(state, wait);
    assert.equal(core.ownerId, a);
    assert.equal(state.players.get(b)?.alive, false);
    assert.ok(state.entities.get(core.id), "captured Core must survive the wipe");
  });
});
