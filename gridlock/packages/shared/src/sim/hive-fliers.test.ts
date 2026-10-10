import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import {
  AIR_FUEL_SECONDS,
  FW190_BARRAGE_TILES,
  HIVE_BOMB_SECONDS,
  HIVE_BOMB_ENERGY,
  HIVE_WASP_STANDOFF_TILES,
  OVERSEER_PULSE_SECONDS,
  TICK_DT,
  WASP_BURST_BOLTS,
  WASP_BURST_COOLDOWN,
  WASP_BURST_SCATTER_TILES,
  WASP_BURST_TILES,
  TRAIN_TYPES,
  catalog,
  factionOf,
  isAircraftType,
  isAirfieldType,
  isHq,
  plasmaCellOf,
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

  it("a Wasp hangs far off its target, still in the air, and looses scattered energy bursts at the spot", () => {
    const state = twoPlayerMatch();
    const w = grow(state, "wasp");
    const ts = state.tileSize;
    const truck = makeEntity(state, "supply", "B", w.x + 40 * ts, w.y + 24 * ts);
    truck.holdPosition = true;
    applyCommand(state, "A", { type: "cmd.attack", ids: [w.id], targetId: truck.id });
    const full = plasmaCellOf("wasp")!.shots;
    const lands: { x: number; y: number }[] = [];
    let bursts = 0;
    let firstBurst = -1;
    for (let i = 0; i < 1500 && truck.hp > 0 && !truck.wreck; i++) {
      const before = w.energy ?? full;
      // The bolts land in the tick they are fired: catch them as they go out.
      const out = state.projectiles;
      const push = out.push.bind(out);
      out.push = (...ps) => {
        for (const p of ps) if (p.fromId === w.id && p.landX != null && p.landY != null) lands.push({ x: p.landX, y: p.landY });
        return push(...ps);
      };
      step(state, TICK_DT);
      if ((w.energy ?? full) < before) {
        bursts++;
        if (firstBurst < 0) firstBurst = Math.hypot(w.x - truck.x, w.y - truck.y);
      }
    }
    assert.ok(bursts >= 2, `bursts ${bursts}`);
    assert.ok(truck.wreck || truck.hp < truck.hpMax, "the bolts that come down on it hurt it");
    assert.equal(lands.length % WASP_BURST_BOLTS, 0, "whole bursts");
    assert.ok(lands.length >= WASP_BURST_BOLTS * 2);
    const scatter = WASP_BURST_SCATTER_TILES * ts;
    const off = lands.map((l) => Math.hypot(l.x - truck.x, l.y - truck.y));
    assert.ok(Math.max(...off) <= scatter + 1, "every bolt lands on the spot");
    assert.ok(Math.max(...off) > scatter * 0.6, "and they spread over it: poor aim");
    assert.ok(firstBurst > 0 && firstBurst <= WASP_BURST_TILES * ts + 1, `within reach (${firstBurst.toFixed(0)})`);
    const standoff = HIVE_WASP_STANDOFF_TILES * ts;
    const settled = Math.hypot(w.x - truck.x, w.y - truck.y);
    assert.ok(standoff > FW190_BARRAGE_TILES * ts, "it stands off further than a fighter's barrage reaches");
    assert.ok(settled > standoff * 0.6 && settled < standoff * 1.2, `it hangs far off (${settled.toFixed(0)} of ${standoff})`);
  });

  it("a Wasp's cell drains with each burst and it waits in the air for the charge", () => {
    const state = twoPlayerMatch();
    const w = grow(state, "wasp");
    const ts = state.tileSize;
    const cell = plasmaCellOf("wasp")!;
    applyCommand(state, "A", { type: "cmd.forceattack", ids: [w.id], x: w.x + 30 * ts, y: w.y + 20 * ts });
    let bursts = 0;
    let drained = false;
    const seconds = 40;
    for (let i = 0; i < secondsToTicks(seconds); i++) {
      const before = w.energy ?? cell.shots;
      step(state, TICK_DT);
      if ((w.energy ?? cell.shots) < before) bursts++;
      if ((w.energy ?? cell.shots) < 1) drained = true;
    }
    assert.ok(drained, "the cell runs low");
    assert.ok(bursts >= cell.shots, `bursts ${bursts}`);
    assert.ok(bursts <= cell.shots + Math.ceil(seconds / cell.rechargeSeconds) + 1, `the cell sets the pace: ${bursts}`);
    assert.ok(bursts < seconds / WASP_BURST_COOLDOWN / 2, "far slower than the emitters could cycle");
    assert.ok(isAirborne(w), "it never goes home to recharge");
    applyCommand(state, "A", { type: "cmd.stop", ids: [w.id] });
    ticks(state, secondsToTicks(cell.shots * cell.rechargeSeconds + 1));
    assert.equal(w.energy, cell.shots, "it charges back up while it hangs");
  });

  it("every armed Xenomorph flier carries an energy cell; the Gnat has nothing to draw on", () => {
    for (const t of ["wasp", "scourge", "overseer"] as const) {
      const cell = plasmaCellOf(t);
      assert.ok(cell && cell.shots >= 1 && cell.rechargeSeconds > 0, t);
    }
    assert.equal(plasmaCellOf("gnat"), undefined);
    assert.ok(plasmaCellOf("scourge")!.shots >= HIVE_BOMB_ENERGY, "a full cell holds a bomb");
  });

  it("an Overseer's pulse slows to its cell's pace once the cell runs low", () => {
    const state = twoPlayerMatch();
    const o = grow(state, "overseer");
    const ts = state.tileSize;
    const cell = plasmaCellOf("overseer")!;
    applyCommand(state, "A", { type: "cmd.forceattack", ids: [o.id], x: o.x + 10 * ts, y: o.y + 6 * ts });
    const pulsesIn = (sec: number): number => {
      let n = 0;
      for (let i = 0; i < secondsToTicks(sec); i++) {
        const before = o.energy ?? cell.shots;
        step(state, TICK_DT);
        if ((o.energy ?? cell.shots) < before) n++;
      }
      return n;
    };
    // Fly over, then burn long enough to drain the cell.
    assert.ok(until(state, 600, () => (o.energy ?? cell.shots) < cell.shots) >= 0, "it starts burning");
    pulsesIn(20);
    const late = pulsesIn(10);
    assert.ok(late >= 1, "it still burns");
    assert.ok(late <= Math.ceil(10 / cell.rechargeSeconds) + 1, `drained, it fires at the cell's pace: ${late}`);
    assert.ok(late < 10 / OVERSEER_PULSE_SECONDS - 3, "slower than its full rate");
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
