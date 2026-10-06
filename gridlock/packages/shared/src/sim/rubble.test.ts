import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NEUTRAL_OWNER, TICK_DT, catalog, isCivilianType, isRubble, leavesRubble } from "../catalog.js";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import { TILE_EMPTY, TILE_TREE } from "../maps.js";
import { applyCommand } from "./commands.js";
import { canGarrison, enterGarrison } from "./garrison.js";
import { destroyEntity, makeEntity, tileCenter, tilesBlocked, walkable } from "./geo.js";
import { createMatch, step } from "./match.js";
import { RUBBLE_HP } from "./rubble.js";
import { snapshotFor } from "./snapshot.js";
import { tileOnMask, visionMask, visionMaskFromSnapshot } from "./vision.js";
import type { Entity, MatchState } from "./types.js";

function match(): { state: MatchState; a: string; b: string } {
  const r = createRoom({ id: "RB", hostId: "A", hostName: "Alpha", mapId: "yard-64", maxSlots: 8 });
  if (!r.ok) throw new Error(r.message);
  const room = r.value;
  assert.equal(joinRoom(room, "B", "Bravo").ok, true);
  updateSelf(room, "A", { ready: true, spawnId: 1 });
  updateSelf(room, "B", { ready: true, spawnId: 4 });
  const started = startMatch(room, "A", () => 0);
  if (!started.ok) throw new Error(started.message);
  const state = createMatch(room, started.value);
  // Flat, open ground with no map houses: the test places its own.
  state.heights.fill(0);
  for (let i = 0; i < state.terrain.length; i++) if (state.terrain[i] === TILE_TREE) state.terrain[i] = TILE_EMPTY;
  for (const e of [...state.entities.values()]) {
    if (e.kind === "unit" || isCivilianType(e.type)) destroyEntity(state, e);
  }
  return { state, a: "A", b: "B" };
}

/** A house (12×12 gameplay tiles) with its north-west tile at (tx, ty). */
function house(state: MatchState, tx: number, ty: number): Entity {
  const ts = state.tileSize;
  const w = catalog("house").tileW;
  const h = catalog("house").tileH;
  const e = makeEntity(state, "house", NEUTRAL_OWNER, (tx + w / 2) * ts, (ty + h / 2) * ts, { tileX: tx, tileY: ty });
  assert.equal(e.tileW, 12);
  return e;
}

function footprint(e: Entity): { x: number; y: number }[] {
  const tiles = [];
  for (let y = e.tileY; y < e.tileY + e.tileH; y++) for (let x = e.tileX; x < e.tileX + e.tileW; x++) tiles.push({ x, y });
  return tiles;
}

describe("building rubble", () => {
  it("every civilian house falls into rubble; player buildings do not", () => {
    assert.equal(leavesRubble("house"), true);
    assert.equal(leavesRubble("shack"), true);
    assert.equal(leavesRubble("factory"), true);
    assert.equal(leavesRubble("dynamo"), false);
    assert.equal(leavesRubble("bunker"), false);
    assert.equal(leavesRubble("sandbags"), false);
  });

  it("a house at 0 HP stays as rubble that still takes the ground", () => {
    const { state } = match();
    const h = house(state, 30, 30);
    for (const t of footprint(h)) assert.equal(walkable(state, t.x, t.y, "rifleman"), false);
    h.hp = 0;
    step(state, TICK_DT);
    assert.equal(state.entities.get(h.id), h, "the heap stays in the match");
    assert.equal(h.ruined, true);
    assert.equal(isRubble(h), true);
    assert.equal(h.hp, RUBBLE_HP);
    for (const t of footprint(h)) {
      assert.equal(walkable(state, t.x, t.y, "rifleman"), false, `infantry on ${t.x},${t.y}`);
      assert.equal(walkable(state, t.x, t.y, "warden"), false, `tank on ${t.x},${t.y}`);
    }
    assert.equal(tilesBlocked(state, h.tileX, h.tileY, h.tileW, h.tileH), true, "nothing can be built on it");
  });

  it("sight passes over the heap once the house is down", () => {
    const { state, a } = match();
    const ts = state.tileSize;
    const ox = 20;
    const oy = 31;
    makeEntity(state, "warden", a, tileCenter(ox, ts), tileCenter(oy, ts));
    const h = house(state, 23, 25);
    const far = { x: 37, y: 31 };
    const before = visionMask(state, a);
    assert.equal(tileOnMask(before, state.width, far.x, far.y), false, "the standing house hides the far tile");
    h.hp = 0;
    state.tick += 1;
    step(state, TICK_DT);
    const after = visionMask(state, a);
    assert.equal(tileOnMask(after, state.width, far.x, far.y), true, "the heap is too low to hide it");
    for (const t of footprint(h)) assert.equal(tileOnMask(after, state.width, t.x, t.y), true, `heap tile ${t.x},${t.y}`);

    const snap = snapshotFor(state, a);
    const view = snap.entities.find((e) => e.id === h.id);
    assert.ok(view, "the rubble is in the snapshot");
    assert.equal(view.ruined, true);
    assert.equal(view.hp, RUBBLE_HP);
    const client = visionMaskFromSnapshot(snap, state.width, state.height, ts);
    assert.equal(tileOnMask(client, state.width, far.x, far.y), true, "the client's own fog agrees");
  });

  it("spills the garrison onto the street and lets nobody back in", () => {
    const { state, b } = match();
    const ts = state.tileSize;
    const h = house(state, 30, 30);
    const rifle = makeEntity(state, "rifleman", b, tileCenter(29, ts), tileCenter(31, ts));
    assert.equal(enterGarrison(state, rifle, h), true);
    assert.equal(rifle.garrisonedIn, h.id);
    h.hp = 0;
    step(state, TICK_DT);
    assert.equal(h.ruined, true);
    assert.equal(h.garrison.length, 0);
    assert.equal(rifle.garrisonedIn, null);
    assert.equal(state.entities.has(rifle.id), true);
    const other = makeEntity(state, "rifleman", b, tileCenter(28, ts), tileCenter(31, ts));
    assert.equal(canGarrison(state, other, h), "Cannot enter that.");
    assert.equal(enterGarrison(state, other, h), false);
  });

  it("nothing wears the heap down, and an attack on it fires on the spot instead", () => {
    const { state, a } = match();
    const ts = state.tileSize;
    const h = house(state, 30, 30);
    h.hp = 0;
    step(state, TICK_DT);
    assert.equal(h.ruined, true);
    // A burst that reaches the heap leaves it as it was.
    h.hp = 0;
    step(state, TICK_DT);
    assert.equal(state.entities.get(h.id), h);
    assert.equal(h.hp, RUBBLE_HP);
    const tank = makeEntity(state, "warden", a, tileCenter(24, ts), tileCenter(31, ts));
    const res = applyCommand(state, a, { type: "cmd.forceattack", ids: [tank.id], x: h.x, y: h.y, targetId: h.id });
    assert.equal(res.ok, true, res.ok ? "" : res.message);
    assert.ok(tank.order);
    assert.equal(tank.order.kind, "forceattack");
    assert.notEqual(tank.order.targetId, h.id, "the guns lay on the ground, not the heap");
  });
});
