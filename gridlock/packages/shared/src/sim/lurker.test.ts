import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import {
  LURKER_BITE_DAMAGE,
  LURKER_SIGHT_TILES,
  SUB_DIVE_SECONDS,
  SUB_REVEAL_SECONDS,
  TILE_SUBDIV,
  TICK_DT,
  catalog,
  factionDamage,
  isHq,
  meleeOf,
  torpedoesOf,
} from "../catalog.js";
import { TILE_EMPTY, TILE_WATER } from "../maps.js";
import { applyCommand } from "./commands.js";
import { destroyEntity, makeEntity, tileCenter } from "./geo.js";
import { createMatch, step } from "./match.js";
import { liveSightExtra } from "./elevation.js";
import { diving, submerged } from "./naval.js";
import { snapshotFor } from "./snapshot.js";
import type { Entity, MatchState } from "./types.js";

function twoPlayerMatch(): MatchState {
  const r = createRoom({ id: "LRK1", hostId: "A", hostName: "Alpha", mapId: "yard-64", maxSlots: 8 });
  if (!r.ok) throw new Error(r.message);
  const room = r.value;
  assert.equal(joinRoom(room, "B", "Bravo").ok, true);
  updateSelf(room, "A", { ready: true, spawnId: 1 });
  updateSelf(room, "B", { ready: true, spawnId: 4, faction: "xeno" });
  const started = startMatch(room, "A", () => 0);
  if (!started.ok) throw new Error(started.message);
  const state = createMatch(room, started.value);
  // Not about the opening armies: nobody else on the field shoots.
  for (const e of [...state.entities.values()]) if (e.kind === "unit" && !isHq(e.type)) destroyEntity(state, e);
  return state;
}

/** Level ground, and open water over x0..x1 (inclusive) across the rows y0..y1. */
function shore(state: MatchState, x0: number, x1: number, y0: number, y1: number): void {
  for (let y = y0 - 8; y <= y1 + 8; y++) {
    for (let x = x0 - 12; x <= x1 + 12; x++) {
      const i = y * state.width + x;
      const wet = x >= x0 && x <= x1 && y >= y0 && y <= y1;
      state.terrain[i] = wet ? TILE_WATER : TILE_EMPTY;
      state.blocked[i] = wet ? 1 : 0;
      state.heights[i] = 0;
      state.scrapYield[i] = 0;
    }
  }
  state.visionTick = -1;
}

function spawn(state: MatchState, type: Parameters<typeof makeEntity>[1], owner: string, tx: number, ty: number): Entity {
  const ts = state.tileSize;
  return makeEntity(state, type, owner, tileCenter(tx, ts), tileCenter(ty, ts));
}

function ticks(state: MatchState, n: number): void {
  for (let i = 0; i < n; i++) step(state, TICK_DT);
}

describe("Lurker", () => {
  it("is a sea beast with jaws, no torpedo tubes", () => {
    assert.ok(meleeOf("lurker"));
    assert.equal(torpedoesOf("lurker"), false);
    assert.equal(catalog("lurker").belt, undefined);
  });

  it("bites a boat beside it: the hit lands at once, no round in the water", () => {
    const state = twoPlayerMatch();
    shore(state, 100, 140, 100, 130);
    const beast = spawn(state, "lurker", "B", 115, 115);
    const boat = spawn(state, "gunboat", "A", 119, 115);
    boat.ammo = {};
    boat.clip = 0;
    applyCommand(state, "B", { type: "cmd.attack", ids: [beast.id], targetId: boat.id });
    let bit = false;
    for (let i = 0; i < 400 && !bit; i++) {
      step(state, TICK_DT);
      bit = state.impacts.some((m) => m.bite && m.fromId === beast.id);
      assert.equal(state.projectiles.filter((p) => p.fromId === beast.id).length, 0);
    }
    assert.ok(bit, "the jaws close");
    const want = factionDamage("lurker", LURKER_BITE_DAMAGE);
    assert.ok(boat.hpMax - boat.hp >= Math.floor(want * 0.85) || boat.hp <= 0, `took ${boat.hpMax - boat.hp}`);
  });

  it("kills a soldier at the water's edge with one bite", () => {
    const state = twoPlayerMatch();
    shore(state, 100, 140, 100, 130);
    const beast = spawn(state, "lurker", "B", 101, 115);
    const man = spawn(state, "rifleman", "A", 98, 115);
    man.clip = 0;
    applyCommand(state, "B", { type: "cmd.attack", ids: [beast.id], targetId: man.id });
    let bites = 0;
    for (let i = 0; i < 400 && man.hp > 0; i++) {
      step(state, TICK_DT);
      bites += state.impacts.filter((m) => m.bite && m.fromId === beast.id && m.kind !== "miss").length;
    }
    assert.ok(man.hp <= 0, "the soldier on the bank is taken");
    assert.equal(bites, 1, "one bite");
  });

  it("lives below: no order brings it up, and it never runs out of air", () => {
    const state = twoPlayerMatch();
    shore(state, 100, 140, 100, 130);
    const beast = spawn(state, "lurker", "B", 115, 115);
    assert.ok(diving(beast), "it leaves the pool below");
    assert.ok(submerged(state, beast));
    assert.equal(applyCommand(state, "B", { type: "cmd.dive", ids: [beast.id], down: false }).ok, false);
    ticks(state, Math.ceil((SUB_DIVE_SECONDS + 5) / TICK_DT));
    assert.ok(diving(beast), "still below long after a submarine's air is gone");
    assert.ok(submerged(state, beast));
    const view = snapshotFor(state, "B").entities.find((v) => v.id === beast.id);
    assert.equal(view?.dive, undefined, "no air meter, no Dive or Surface");
    assert.equal(view?.submerged, true);
  });

  it("sees less than it did on the surface: its sight is its sight through the water", () => {
    assert.equal(catalog("lurker").sightTiles, LURKER_SIGHT_TILES);
    assert.ok(LURKER_SIGHT_TILES < 16 * TILE_SUBDIV);
    assert.equal(liveSightExtra({ type: "lurker" }), 0);
    assert.equal(liveSightExtra({ type: "lurker", submerged: true }), 0);
  });

  it("bites from below, and the bite gives it away", () => {
    const state = twoPlayerMatch();
    shore(state, 100, 140, 100, 130);
    const beast = spawn(state, "lurker", "B", 115, 115);
    ticks(state, 2);
    assert.ok(diving(beast));
    assert.ok(submerged(state, beast));
    const boat = spawn(state, "gunboat", "A", 119, 115);
    boat.ammo = {};
    boat.clip = 0;
    applyCommand(state, "B", { type: "cmd.attack", ids: [beast.id], targetId: boat.id });
    for (let i = 0; i < 400 && boat.hp === boat.hpMax; i++) step(state, TICK_DT);
    assert.ok(boat.hp < boat.hpMax, "bitten from below");
    assert.ok(diving(beast), "it stays down to bite");
    assert.equal(submerged(state, beast), false, "but the enemy sees it for a while");
    assert.equal(snapshotFor(state, "B").entities.find((v) => v.id === beast.id)?.submerged, undefined, "its owner sees it surfaced");
    ticks(state, Math.ceil((SUB_REVEAL_SECONDS + 1) / TICK_DT));
    destroyEntity(state, boat);
    ticks(state, Math.ceil((SUB_REVEAL_SECONDS + 1) / TICK_DT));
    assert.ok(submerged(state, beast), "and it sinks out of sight again");
  });
});
