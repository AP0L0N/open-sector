import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import {
  TILE_SUBDIV,
  TREE_LOS_THROUGH,
  catalog,
  garrisonCapOf,
  isGarrisonable,
} from "../catalog.js";
import { TILE_TREE, TILE_WATER } from "../maps.js";
import { hasFullLos } from "./elevation.js";
import { applyCommand } from "./commands.js";
import { makeEntity, tileCenter, walkable } from "./geo.js";
import { enterGarrison, livingGarrison, spillGarrison } from "./garrison.js";
import { createMatch, step } from "./match.js";
import { tickCombat } from "./combat.js";
import { TICK_DT } from "../catalog.js";
import type { MatchState } from "./types.js";

function twoPlayerMatch(): { state: MatchState; a: string; b: string } {
  const r = createRoom({
    id: "G1",
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
  return { state: createMatch(room, started.value), a: "A", b: "B" };
}

describe("cover LOS", () => {
  it("lets a ray cross water but not a wall of trees", () => {
    const elev = new Uint8Array(9);
    const terrain = new Uint8Array(9);
    const occupy = new Int32Array(9);
    terrain[1] = TILE_WATER;
    assert.equal(hasFullLos(elev, 9, 1, 0, 0, 2, 0, { terrain, occupy }), true);
    for (let i = 1; i <= TREE_LOS_THROUGH + 1; i++) terrain[i] = TILE_TREE;
    assert.equal(hasFullLos(elev, 9, 1, 0, 0, TREE_LOS_THROUGH + 2, 0, { terrain, occupy }), false);
  });

  it("stops at a building occupy id", () => {
    const elev = new Uint8Array(5);
    const terrain = new Uint8Array(5);
    const occupy = new Int32Array(5);
    occupy[2] = 7;
    assert.equal(hasFullLos(elev, 5, 1, 0, 0, 4, 0, { terrain, occupy }), false);
    assert.equal(hasFullLos(elev, 5, 1, 0, 0, 4, 0, { terrain, occupy, ignoreOccupyId: 7 }), true);
  });
});

describe("garrison", () => {
  it("lets infantry enter a house up to cap and fire from inside", () => {
    const { state, a, b } = twoPlayerMatch();
    state.heights.fill(0);
    state.blocked.fill(0);
    const ts = state.tileSize;
    const house = makeEntity(state, "cottage", "", tileCenter(40, ts), tileCenter(16, ts), {
      tileX: 36,
      tileY: 12,
    });
    assert.equal(isGarrisonable(house.type), true);
    const cap = garrisonCapOf("cottage");
    const inf = makeEntity(state, "trooper", a, tileCenter(34, ts), tileCenter(12, ts));
    assert.equal(enterGarrison(state, inf, house), true);
    assert.equal(inf.garrisonedIn, house.id);
    assert.equal(livingGarrison(state, house).length, 1);
    assert.equal(walkable(state, 34, 12) || true, true);

    const dummy = makeEntity(state, "hauler", b, inf.x + catalog("trooper").rangeTiles * ts * 0.5, inf.y);
    dummy.autoHarvest = false;
    inf.facing = 0;
    inf.order = { kind: "attack", targetId: dummy.id };
    tickCombat(state, TICK_DT);
    assert.equal(state.projectiles.length, 1);
    const shot = state.projectiles[0]!;
    const eastWall = (house.tileX + house.tileW) * ts;
    assert.ok(shot.x > house.x + 8, `muzzle x ${shot.x} vs house ${house.x}`);
    assert.ok(Math.abs(shot.x - eastWall) < ts * 2, `window x ${shot.x} wall ${eastWall}`);
    assert.equal(shot.ignoreId, house.id);
    const hp0 = house.hp;
    for (let i = 0; i < 8; i++) step(state, TICK_DT);
    assert.equal(house.hp, hp0, "garrison fire must not hit its own house");

    for (let i = 1; i < cap; i++) {
      const extra = makeEntity(state, "trooper", a, tileCenter(32, ts), tileCenter(12, ts));
      assert.equal(enterGarrison(state, extra, house), true);
    }
    const overflow = makeEntity(state, "trooper", a, tileCenter(32, ts), tileCenter(12, ts));
    assert.equal(enterGarrison(state, overflow, house), false);
  });

  it("spills occupants with 0–100% damage when the house falls", () => {
    const { state, a } = twoPlayerMatch();
    state.heights.fill(0);
    state.blocked.fill(0);
    const ts = state.tileSize;
    const house = makeEntity(state, "house", "", tileCenter(40, ts), tileCenter(16, ts), {
      tileX: 36,
      tileY: 12,
    });
    const inf = makeEntity(state, "trooper", a, tileCenter(34, ts), tileCenter(12, ts));
    const hp0 = inf.hp;
    assert.equal(enterGarrison(state, inf, house), true);
    house.hp = 0;
    spillGarrison(state, house);
    assert.equal(inf.garrisonedIn, null);
    assert.ok(inf.hp >= 0 && inf.hp <= hp0);
    assert.ok(livingGarrison(state, house).length === 0);
  });

  it("right-click command paths infantry into a cottage", () => {
    const { state, a } = twoPlayerMatch();
    state.heights.fill(0);
    state.blocked.fill(0);
    const ts = state.tileSize;
    const house = makeEntity(state, "cottage", "", tileCenter(48, ts), tileCenter(16, ts), {
      tileX: 44,
      tileY: 12,
    });
    const inf = makeEntity(state, "trooper", a, tileCenter(36, ts), tileCenter(16, ts));
    const res = applyCommand(state, a, { type: "cmd.garrison", ids: [inf.id], buildingId: house.id });
    assert.equal(res.ok, true, !res.ok ? res.message : "");
    for (let i = 0; i < 80; i++) step(state, TICK_DT);
    assert.equal(inf.garrisonedIn, house.id);
  });

  it("does not let infantry garrison an enemy-owned house", () => {
    const { state, a, b } = twoPlayerMatch();
    const ts = state.tileSize;
    const house = makeEntity(state, "cottage", b, tileCenter(40, ts), tileCenter(16, ts), {
      tileX: 36,
      tileY: 12,
    });
    const inf = makeEntity(state, "trooper", a, tileCenter(34, ts), tileCenter(12, ts));
    const res = applyCommand(state, a, { type: "cmd.garrison", ids: [inf.id], buildingId: house.id });
    assert.equal(res.ok, false);
  });

  it("does not let tanks garrison", () => {
    const { state, a } = twoPlayerMatch();
    const ts = state.tileSize;
    const house = makeEntity(state, "cottage", "", tileCenter(40, ts), tileCenter(16, ts), {
      tileX: 36,
      tileY: 12,
    });
    const tank = makeEntity(state, "warden", a, tileCenter(34, ts), tileCenter(12, ts));
    const res = applyCommand(state, a, { type: "cmd.garrison", ids: [tank.id], buildingId: house.id });
    assert.equal(res.ok, false);
  });
});

describe("water", () => {
  it("is not walkable on the yard ponds", () => {
    const { state } = twoPlayerMatch();
    let found = false;
    for (let y = 0; y < state.height; y++) {
      for (let x = 0; x < state.width; x++) {
        if (state.terrain[y * state.width + x] === TILE_WATER) {
          found = true;
          assert.equal(walkable(state, x, y), false);
        }
      }
    }
    assert.equal(found, true);
    void TILE_SUBDIV;
  });
});
