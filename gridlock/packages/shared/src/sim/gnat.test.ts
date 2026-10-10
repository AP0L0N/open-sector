import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import {
  AIR_CRUISE_ALT,
  HORTEN_CRUISE_ALT,
  MG42,
  TICK_DT,
  TRAIN_TYPES,
  airLoadoutOf,
  catalog,
  factionOf,
  isAircraftType,
  isReconType,
  techNeeds,
} from "../catalog.js";
import { TILE_EMPTY } from "../maps.js";
import { planeIsHigh } from "./air.js";
import { applyCommand } from "./commands.js";
import { liveSightExtra } from "./elevation.js";
import { makeEntity, tileCenter } from "./geo.js";
import { createMatch, step } from "./match.js";
import { producerType } from "./train.js";
import type { Entity, MatchState } from "./types.js";

function dry(): MatchState {
  const r = createRoom({ id: "GNAT", hostId: "A", hostName: "Alpha", mapId: "yard-64", maxSlots: 8 });
  if (!r.ok) throw new Error(r.message);
  const room = r.value;
  assert.equal(joinRoom(room, "B", "Bravo").ok, true);
  updateSelf(room, "A", { ready: true, spawnId: 1 });
  updateSelf(room, "B", { ready: true, spawnId: 4 });
  const started = startMatch(room, "A", () => 0);
  if (!started.ok) throw new Error(started.message);
  const state = createMatch(room, started.value);
  for (const e of [...state.entities.values()]) state.entities.delete(e.id);
  state.occupy.fill(0);
  for (let i = 0; i < state.terrain.length; i++) {
    state.terrain[i] = TILE_EMPTY;
    state.blocked[i] = 0;
    state.heights[i] = 0;
    state.scrapYield[i] = 0;
  }
  state.visionTick = -1;
  return state;
}

function at(state: MatchState, tx: number, ty: number): { x: number; y: number } {
  return { x: tileCenter(tx, state.tileSize), y: tileCenter(ty, state.tileSize) };
}

/** A flyer in the air over (tx, ty), heading east, at `alt`. */
function flyerOver(state: MatchState, type: "gnat" | "horten", tx: number, ty: number, alt: number): Entity {
  const p = at(state, tx, ty);
  const plane = makeEntity(state, type, "A", p.x, p.y);
  plane.facing = 0;
  plane.air!.phase = "fly";
  plane.air!.alt = alt;
  plane.air!.speed = 1;
  plane.order = { kind: "guard", x: p.x, y: p.y };
  plane.air!.guard = { x: p.x, y: p.y };
  return plane;
}

const OTHER_PLANES = TRAIN_TYPES.filter((t) => isAircraftType(t) && t !== "gnat" && factionOf(t) !== "bloom");

function flyingSight(type: (typeof TRAIN_TYPES)[number]): number {
  return catalog(type).sightTiles + liveSightExtra({ type, air: { alt: AIR_CRUISE_ALT } });
}

describe("Gnat", () => {
  it("is an unarmed Xenite recon flyer grown at the Aerie with no tech to wait on", () => {
    assert.ok(TRAIN_TYPES.includes("gnat"));
    assert.equal(factionOf("gnat"), "xeno");
    assert.equal(producerType("gnat"), "aerie");
    assert.ok(isAircraftType("gnat"));
    assert.ok(isReconType("gnat"));
    assert.equal(catalog("gnat").rangeTiles, 0);
    assert.deepEqual(airLoadoutOf("gnat"), { bombs: 0, rounds: 0 });
    assert.deepEqual([...techNeeds("gnat")], []);
  });

  it("is the cheapest, quickest, frailest thing in the air, and out-sees every plane but the Horten", () => {
    const g = catalog("gnat");
    for (const t of OTHER_PLANES) {
      const c = catalog(t);
      if (factionOf(t) === "xeno") assert.ok((g.energy ?? 0) < (c.energy ?? 0) / 2, `takes well under ${t}'s energy`);
      else assert.ok(g.cost < c.cost / 2, `costs well under ${t}`);
      assert.ok(g.buildSeconds < c.buildSeconds / 2, `grows well faster than ${t}`);
      assert.ok(g.hp < c.hp / 2, `far frailer than ${t}`);
      if (t !== "horten") assert.ok(flyingSight("gnat") > flyingSight(t), `sees farther than ${t}`);
    }
    assert.ok(flyingSight("gnat") >= flyingSight("horten") - 2 * 4, "nearly the Horten's sight");
  });

  it("cruises at the Horten's height, above everything but anti-air", () => {
    const state = dry();
    const g = flyerOver(state, "gnat", 60, 120, AIR_CRUISE_ALT);
    const p = at(state, 200, 120);
    applyCommand(state, "A", { type: "cmd.move", ids: [g.id], x: p.x, y: p.y });
    for (let i = 0; i < Math.ceil(8 / TICK_DT); i++) step(state, TICK_DT);
    assert.equal(g.air!.alt, HORTEN_CRUISE_ALT);
    assert.ok(planeIsHigh(g));
  });

  it("comes apart in one short machine-gun burst", () => {
    assert.ok(catalog("gnat").hp <= 3 * MG42.damage, "three MG42 rounds");
    const state = dry();
    const p = at(state, 120, 120);
    const g = flyerOver(state, "gnat", 120, 120, HORTEN_CRUISE_ALT);
    for (let i = 0; i < 4; i++) {
      // Off to the side: a round climbing straight up crosses the hit band within a tick.
      const s = makeEntity(state, "gunner", "B", p.x + (i - 1.5) * 12, p.y + 100);
      s.holdPosition = true;
    }
    // Shot down, it crashes and lies as a wreck under the same id.
    for (let i = 0; i < Math.ceil(8 / TICK_DT) && g.air?.phase === "fly"; i++) step(state, TICK_DT);
    assert.notEqual(g.air?.phase, "fly", "down within seconds");
  });
});
