import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import {
  AIR_FUEL_SECONDS,
  FW190_BARRAGE_TILES,
  HIVE_BOMB_SECONDS,
  HIVE_WASP_STANDOFF_TILES,
  TICK_DT,
  TRAIN_TYPES,
  catalog,
  factionOf,
  isAircraftType,
  isAirfieldType,
  isHq,
  secondsToTicks,
  staysAloft,
} from "../catalog.js";
import { isAirborne } from "./air.js";
import { applyCommand } from "./commands.js";
import { destroyEntity, makeEntity, tileCenter } from "./geo.js";
import { createMatch, step } from "./match.js";
import { spawnUnit } from "./train.js";
import type { Entity, MatchState } from "./types.js";

function twoPlayerMatch(): MatchState {
  const r = createRoom({ id: "HIVE", hostId: "A", hostName: "Alpha", mapId: "yard-64", maxSlots: 8 });
  if (!r.ok) throw new Error(r.message);
  const room = r.value;
  assert.equal(joinRoom(room, "B", "Bravo").ok, true);
  updateSelf(room, "A", { ready: true, spawnId: 1, faction: "xeno" });
  updateSelf(room, "B", { ready: true, spawnId: 4 });
  const started = startMatch(room, "A", () => 0);
  if (!started.ok) throw new Error(started.message);
  const state = createMatch(room, started.value);
  state.heights.fill(0);
  for (const e of [...state.entities.values()]) if (e.kind === "unit" && !isHq(e.type)) destroyEntity(state, e);
  return state;
}

function ticks(state: MatchState, n: number): void {
  for (let i = 0; i < n; i++) step(state, TICK_DT);
}

function until(state: MatchState, max: number, done: () => boolean): number {
  for (let i = 0; i < max; i++) {
    if (done()) return i;
    step(state, TICK_DT);
  }
  return -1;
}

/** An Aerie with the Nexus and power it needs. */
function aerieAt(state: MatchState): Entity {
  const ts = state.tileSize;
  const tx = 30;
  const ty = 30;
  makeEntity(state, "nexus", "A", tileCenter(tx, ts), tileCenter(ty - 8, ts), { tileX: tx, tileY: ty - 8 });
  makeEntity(state, "fusionnode", "A", tileCenter(tx + 8, ts), tileCenter(ty - 8, ts), { tileX: tx + 8, tileY: ty - 8 });
  makeEntity(state, "fusionnode", "A", tileCenter(tx + 14, ts), tileCenter(ty - 8, ts), { tileX: tx + 14, tileY: ty - 8 });
  const def = catalog("aerie");
  return makeEntity(state, "aerie", "A", (tx + def.tileW / 2) * ts, (ty + def.tileH / 2) * ts, { tileX: tx, tileY: ty });
}

function grow(state: MatchState, type: "wasp" | "scourge" | "gnat" | "overseer"): Entity {
  const flier = spawnUnit(state, "A", type, aerieAt(state), false);
  assert.ok(flier?.air, `${type} is grown`);
  assert.ok(until(state, 400, () => flier.order == null) >= 0, `${type} reaches the door`);
  return flier;
}

/** Spread of its path over the last `n` ticks: how far it wandered while it should hang still. */
function wander(state: MatchState, e: Entity, n: number): number {
  const x = e.x;
  const y = e.y;
  let far = 0;
  for (let i = 0; i < n; i++) {
    step(state, TICK_DT);
    far = Math.max(far, Math.hypot(e.x - x, e.y - y));
  }
  return far;
}

describe("Xenomorph fliers", () => {
  it("are every Xenomorph aircraft, and the Aerie is a plain producer with the Forge's footprint", () => {
    const fliers = TRAIN_TYPES.filter((t) => isAircraftType(t) && factionOf(t) === "xeno");
    assert.deepEqual([...fliers].sort(), ["gnat", "overseer", "scourge", "wasp"]);
    for (const t of fliers) assert.ok(staysAloft(t), t);
    assert.equal(staysAloft("stuka"), false);
    assert.equal(staysAloft("drifter"), false, "the Bloom still nest");
    assert.equal(isAirfieldType("aerie"), false);
    assert.equal(catalog("aerie").tileW, catalog("forge").tileW);
    assert.equal(catalog("aerie").tileH, catalog("forge").tileH);
  });

  it("lift straight up out of the Aerie and hover off to the door, never parked, any number of them", () => {
    const state = twoPlayerMatch();
    const aerie = aerieAt(state);
    const grown: Entity[] = [];
    for (let i = 0; i < 6; i++) {
      const w = spawnUnit(state, "A", "wasp", aerie, false);
      assert.ok(w?.air, `wasp ${i + 1}: no pad limit`);
      grown.push(w);
    }
    const w = grown[0]!;
    assert.ok(Math.hypot(w.x - aerie.x, w.y - aerie.y) < 1, "it starts in the hive");
    assert.equal(w.air!.homeId, null);
    ticks(state, 5);
    assert.ok(Math.hypot(w.x - aerie.x, w.y - aerie.y) < 1, "straight up first");
    assert.ok(until(state, 400, () => w.order == null) >= 0);
    assert.ok(isAirborne(w));
    assert.ok(Math.hypot(w.x - aerie.x, w.y - aerie.y) > state.tileSize, "out of the hive");
  });

  it("never run dry and never go home", () => {
    const state = twoPlayerMatch();
    const w = grow(state, "wasp");
    const ts = state.tileSize;
    applyCommand(state, "A", { type: "cmd.move", ids: [w.id], x: w.x + 40 * ts, y: w.y + 20 * ts });
    ticks(state, secondsToTicks(AIR_FUEL_SECONDS * 2));
    assert.ok(w.hp > 0 && isAirborne(w));
    assert.equal(w.order, null, "the move ended and it hangs there");
    assert.equal(applyCommand(state, "A", { type: "cmd.land", ids: [w.id] }).ok, true);
    ticks(state, 50);
    assert.ok(isAirborne(w), "Land does not bring it down");
  });

  it("hang still where they are sent instead of circling", () => {
    for (const type of ["wasp", "scourge", "gnat"] as const) {
      const state = twoPlayerMatch();
      const f = grow(state, type);
      const ts = state.tileSize;
      const gx = f.x + 30 * ts;
      const gy = f.y + 20 * ts;
      applyCommand(state, "A", { type: "cmd.guard", ids: [f.id], x: gx, y: gy, facing: 0 });
      ticks(state, 600);
      assert.ok(Math.hypot(f.x - gx, f.y - gy) < 1, `${type} is on the point`);
      assert.ok(wander(state, f, 100) < 1, `${type} holds still`);
    }
  });

  it("a Gnat sent at a unit hangs over it", () => {
    const state = twoPlayerMatch();
    const g = grow(state, "gnat");
    const ts = state.tileSize;
    const man = makeEntity(state, "rifleman", "B", g.x + 20 * ts, g.y + 12 * ts);
    man.holdPosition = true;
    applyCommand(state, "A", { type: "cmd.attack", ids: [g.id], targetId: man.id });
    ticks(state, 400);
    assert.ok(Math.hypot(g.x - man.x, g.y - man.y) < 1, "right over him");
    assert.ok(wander(state, g, 60) < 1);
  });

  it("a Wasp hangs a few cells off its target, turned on it, and lays barrage after barrage", () => {
    const state = twoPlayerMatch();
    const w = grow(state, "wasp");
    const ts = state.tileSize;
    const truck = makeEntity(state, "supply", "B", w.x + 24 * ts, w.y + 16 * ts);
    truck.holdPosition = true;
    applyCommand(state, "A", { type: "cmd.attack", ids: [w.id], targetId: truck.id });
    let firstHit = -1;
    let barrages = 0;
    for (let i = 0; i < 1500 && truck.hp > 0 && !truck.wreck; i++) {
      const cd = w.cooldown;
      const hp = truck.hp;
      step(state, TICK_DT);
      if (w.cooldown > cd) barrages++;
      if (firstHit < 0 && truck.hp < hp) firstHit = Math.hypot(w.x - truck.x, w.y - truck.y);
    }
    assert.ok(barrages >= 2, `barrages ${barrages}`);
    assert.ok(firstHit > 0, "it hits");
    const standoff = HIVE_WASP_STANDOFF_TILES * ts;
    assert.ok(firstHit <= FW190_BARRAGE_TILES * ts + 1, `within the barrage's reach (${firstHit.toFixed(0)})`);
    const settled = Math.hypot(w.x - truck.x, w.y - truck.y);
    assert.ok(settled > standoff * 0.6 && settled < standoff * 1.2, `it hangs a few cells off (${settled.toFixed(0)} of ${standoff})`);
  });

  it("a Scourge hangs off its target and lobs a bomb on it every few seconds", () => {
    const state = twoPlayerMatch();
    const s = grow(state, "scourge");
    const ts = state.tileSize;
    const depot = makeEntity(state, "dynamo", "B", s.x + 24 * ts, s.y + 16 * ts);
    applyCommand(state, "A", { type: "cmd.attack", ids: [s.id], targetId: depot.id });
    const drops: number[] = [];
    const seen = new Set<number>();
    for (let i = 0; i < secondsToTicks(HIVE_BOMB_SECONDS * 4) + 600; i++) {
      step(state, TICK_DT);
      for (const p of state.projectiles) {
        if (p.fromId !== s.id || p.flight !== "bomb" || seen.has(p.id)) continue;
        seen.add(p.id);
        drops.push(state.tick);
      }
    }
    assert.ok(drops.length >= 3, `bombs ${drops.length}`);
    const gap = drops[1]! - drops[0]!;
    assert.ok(Math.abs(gap - secondsToTicks(HIVE_BOMB_SECONDS)) <= 1, `gap ${gap}`);
    assert.ok(depot.hp < depot.hpMax);
    assert.ok(isAirborne(s), "still up: no trip home to rearm");
  });

  it("a Weaver mends them in the air", () => {
    const state = twoPlayerMatch();
    const w = grow(state, "wasp");
    const weaver = makeEntity(state, "weaver", "A", w.x, w.y);
    weaver.holdPosition = true;
    w.hp = Math.round(w.hpMax / 2);
    const hurt = w.hp;
    ticks(state, 60);
    assert.ok(isAirborne(w));
    assert.ok(w.hp > hurt, "mended");
  });
});
