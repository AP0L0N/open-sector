import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import {
  OVERSEER_CRUISE_ALT,
  OVERSEER_FUEL_SECONDS,
  OVERSEER_HOVER_ALT,
  OVERSEER_HULL_MUL,
  OVERSEER_PULSE_DAMAGE,
  OVERSEER_PULSE_SECONDS,
  TICK_DT,
  catalog,
  factionDamage,
  isAircraftType,
  isHoverType,
  isHq,
  secondsToTicks,
} from "../catalog.js";
import { isAirborne } from "./air.js";
import { applyCommand } from "./commands.js";
import { destroyEntity, makeEntity, tileCenter } from "./geo.js";
import { createMatch, step } from "./match.js";
import { spawnUnit } from "./train.js";
import type { Entity, MatchState } from "./types.js";

function twoPlayerMatch(): MatchState {
  const r = createRoom({ id: "OVS1", hostId: "A", hostName: "Alpha", mapId: "yard-64", maxSlots: 8 });
  if (!r.ok) throw new Error(r.message);
  const room = r.value;
  assert.equal(joinRoom(room, "B", "Bravo").ok, true);
  updateSelf(room, "A", { ready: true, spawnId: 1, faction: "xeno" });
  updateSelf(room, "B", { ready: true, spawnId: 4 });
  const started = startMatch(room, "A", () => 0);
  if (!started.ok) throw new Error(started.message);
  const state = createMatch(room, started.value);
  state.heights.fill(0);
  // Not about the opening armies: nobody else on the field shoots.
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

/** An Aerie with the Nexus and power it needs, and an Overseer parked on a nest. */
function nest(state: MatchState): { aerie: Entity; craft: Entity } {
  const ts = state.tileSize;
  const tx = 30;
  const ty = 30;
  makeEntity(state, "nexus", "A", tileCenter(tx, ts), tileCenter(ty - 8, ts), { tileX: tx, tileY: ty - 8 });
  makeEntity(state, "fusionnode", "A", tileCenter(tx + 8, ts), tileCenter(ty - 8, ts), { tileX: tx + 8, tileY: ty - 8 });
  makeEntity(state, "fusionnode", "A", tileCenter(tx + 14, ts), tileCenter(ty - 8, ts), { tileX: tx + 14, tileY: ty - 8 });
  makeEntity(state, "fusionnode", "A", tileCenter(tx + 0, ts), tileCenter(ty - 14, ts), { tileX: tx + 0, tileY: ty - 14 });
  makeEntity(state, "fusionnode", "A", tileCenter(tx + 8, ts), tileCenter(ty - 14, ts), { tileX: tx + 8, tileY: ty - 14 });
  makeEntity(state, "fusionnode", "A", tileCenter(tx + 14, ts), tileCenter(ty - 14, ts), { tileX: tx + 14, tileY: ty - 14 });
  const def = catalog("aerie");
  const aerie = makeEntity(state, "aerie", "A", (tx + def.tileW / 2) * ts, (ty + def.tileH / 2) * ts, { tileX: tx, tileY: ty });
  const craft = spawnUnit(state, "A", "overseer", aerie, false);
  assert.ok(craft, "the Overseer takes a nest");
  return { aerie, craft };
}

describe("Overseer", () => {
  it("is a Xenomorph hover craft grown at the Aerie", () => {
    assert.ok(isAircraftType("overseer"));
    assert.ok(isHoverType("overseer"));
    assert.equal(isHoverType("scourge"), false);
  });

  it("lifts straight off its nest, flies to the point, and hangs there", () => {
    const state = twoPlayerMatch();
    const { craft } = nest(state);
    const ts = state.tileSize;
    const x0 = craft.x;
    const y0 = craft.y;
    const gx = craft.x + 40 * ts;
    const gy = craft.y + 30 * ts;
    assert.equal(applyCommand(state, "A", { type: "cmd.move", ids: [craft.id], x: gx, y: gy }).ok, true);
    assert.ok(until(state, 200, () => craft.air?.phase === "fly") >= 0, "it is up");
    assert.ok(Math.hypot(craft.x - x0, craft.y - y0) < 1, "straight up: no roll along a strip");
    assert.ok(until(state, 2000, () => craft.order == null) >= 0, "the move ends on the spot");
    assert.ok(Math.hypot(craft.x - gx, craft.y - gy) < 1);
    ticks(state, 100);
    assert.ok(Math.hypot(craft.x - gx, craft.y - gy) < 1, "it hangs where it was sent, no orbit");
    assert.ok(Math.abs(craft.air!.alt - OVERSEER_CRUISE_ALT) < 0.5);
  });

  it("hangs over an enemy soldier and burns him down with pulses in quick succession", () => {
    const state = twoPlayerMatch();
    const { craft } = nest(state);
    const ts = state.tileSize;
    const man = makeEntity(state, "rifleman", "B", craft.x + 20 * ts, craft.y + 14 * ts);
    assert.equal(applyCommand(state, "A", { type: "cmd.attack", ids: [craft.id], targetId: man.id }).ok, true);
    const pulses: number[] = [];
    for (let i = 0; i < 3000 && man.hp > 0; i++) {
      step(state, TICK_DT);
      for (const imp of state.impacts) if (imp.downLaser && imp.fromId === craft.id) pulses.push(state.tick);
    }
    assert.ok(man.hp <= 0, "the soldier burns");
    assert.ok(pulses.length >= 2, `pulses ${pulses.length}`);
    const gap = pulses[1]! - pulses[0]!;
    assert.ok(gap <= secondsToTicks(OVERSEER_PULSE_SECONDS) + 1, `gap ${gap} ticks`);
    assert.ok(Math.hypot(craft.x - man.x, craft.y - man.y) < 2 * ts, "right over him");
    assert.ok(Math.abs(craft.air!.alt - OVERSEER_HOVER_ALT) < 1, "down at hover height");
    assert.equal(state.projectiles.filter((p) => p.fromId === craft.id).length, 0, "a beam, not a round");
  });

  it("burns a tank through its roof at the hull share", () => {
    const state = twoPlayerMatch();
    const { craft } = nest(state);
    const ts = state.tileSize;
    const tank = makeEntity(state, "ss3", "B", craft.x + 16 * ts, craft.y + 10 * ts);
    tank.ammo = {};
    applyCommand(state, "A", { type: "cmd.attack", ids: [craft.id], targetId: tank.id });
    assert.ok(until(state, 3000, () => tank.hp < tank.hpMax) >= 0, "the pulse lands");
    const per = factionDamage("overseer", OVERSEER_PULSE_DAMAGE) * OVERSEER_HULL_MUL;
    assert.ok(tank.hpMax - tank.hp <= Math.ceil(per * 1.15), `first pulse ${tank.hpMax - tank.hp}`);
  });

  it("never lands: Land stops it in the air, and it never runs dry", () => {
    const state = twoPlayerMatch();
    const { craft } = nest(state);
    const ts = state.tileSize;
    applyCommand(state, "A", { type: "cmd.move", ids: [craft.id], x: craft.x + 30 * ts, y: craft.y + 30 * ts });
    ticks(state, 300);
    assert.ok(isAirborne(craft));
    assert.equal(applyCommand(state, "A", { type: "cmd.land", ids: [craft.id] }).ok, true);
    const x = craft.x;
    const y = craft.y;
    ticks(state, secondsToTicks(OVERSEER_FUEL_SECONDS * 2));
    assert.ok(craft.hp > 0 && isAirborne(craft), "still up, long past a tank's worth");
    assert.notEqual(craft.air?.phase, "parked");
    assert.ok(Math.hypot(craft.x - x, craft.y - y) < 1, "it hangs where it stopped");
  });
});
