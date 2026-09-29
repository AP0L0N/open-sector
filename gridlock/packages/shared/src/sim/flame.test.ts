import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  catalog,
  FIRE_BURN_DPS,
  FIRE_SECONDS,
  FLAMER,
  FLAMER_BURST,
  FLAMER_BURSTS,
  HANDGUN_RANGE_TILES,
  infantryGunFor,
  infantryLoadout,
  isInfantryType,
  PYRO_COOKOFF_CHANCE_DRY,
  PYRO_COOKOFF_CHANCE_FULL,
  RIFLE_RANGE_TILES,
  supplyShortOf,
  TICK_DT,
  TRAIN_TYPES,
} from "../catalog.js";
import { TILE_EMPTY, TILE_WATER } from "../maps.js";
import { applyCommand } from "./commands.js";
import { cookOff, cookOffChance, igniteAt } from "./flame.js";
import { makeEntity, tileCenter } from "./geo.js";
import { enterGarrison } from "./garrison.js";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import { createMatch, step } from "./match.js";
import { snapshotFor } from "./snapshot.js";
import { producerType } from "./train.js";
import type { Entity, MatchState } from "./types.js";

function twoPlayerMatch(): MatchState {
  const r = createRoom({ id: "PY1", hostId: "A", hostName: "Alpha", mapId: "yard-64", maxSlots: 8 });
  if (!r.ok) throw new Error(r.message);
  const room = r.value;
  assert.equal(joinRoom(room, "B", "Bravo").ok, true);
  updateSelf(room, "A", { ready: true, spawnId: 1 });
  updateSelf(room, "B", { ready: true, spawnId: 4 });
  const started = startMatch(room, "A");
  if (!started.ok) throw new Error(started.message);
  return createMatch(room, started.value);
}

/** Flat, dry pad and nothing else on it. */
function range(): { state: MatchState; y: number; ts: number } {
  const state = twoPlayerMatch();
  state.heights.fill(0);
  const ts = state.tileSize;
  const y = 40;
  for (let ty = y - 8; ty <= y + 8; ty++) {
    for (let tx = 60; tx <= 130; tx++) {
      const i = ty * state.width + tx;
      state.terrain[i] = TILE_EMPTY;
      state.blocked[i] = 0;
      state.occupy[i] = 0;
      state.heights[i] = 0;
    }
  }
  return { state, y, ts };
}

function pyro(state: MatchState, x: number, y: number, owner = "A"): Entity {
  const e = makeEntity(state, "pyro", owner, x, y);
  e.facing = 0;
  e.holdPosition = true;
  return e;
}

/** A target that will not fire back or die, so the test measures the jet. */
function dummy(state: MatchState, type: Parameters<typeof makeEntity>[1], x: number, y: number, owner = "B"): Entity {
  const e = makeEntity(state, type, owner, x, y);
  e.holdPosition = true;
  e.cooldown = 1e9;
  e.mgCooldown = 1e9;
  e.hp = e.hpMax = 100000;
  return e;
}

/** Step `n` ticks and record the tick each new glob from `e` first appeared. */
function watch(state: MatchState, e: Entity, n: number, seen = new Map<number, number>()): Map<number, number> {
  for (let i = 0; i < n; i++) {
    step(state, TICK_DT);
    for (const p of state.projectiles) {
      if (p.fromId === e.id && p.flight === "flame" && !seen.has(p.id)) seen.set(p.id, state.tick);
    }
  }
  return seen;
}

const secs = (s: number) => Math.ceil(s / TICK_DT);

describe("pyro", () => {
  it("is Muster infantry with a flamethrower", () => {
    assert.ok(TRAIN_TYPES.includes("pyro"));
    assert.equal(producerType("pyro"), "muster");
    assert.ok(isInfantryType("pyro"));
    assert.deepEqual(infantryLoadout("pyro"), [FLAMER]);
    assert.equal(FLAMER.clip, FLAMER_BURST * FLAMER_BURSTS);
    assert.equal(FLAMER.reload, 0, "the tanks never refill by themselves");
    assert.ok(FLAMER.rangeTiles > HANDGUN_RANGE_TILES && FLAMER.rangeTiles < RIFLE_RANGE_TILES / 2);
    assert.equal(catalog("pyro").rangeTiles, FLAMER.rangeTiles);
  });

  it("throws one burst of globs, pauses, and sets the ground around the target alight", () => {
    const { state, y, ts } = range();
    const me = pyro(state, tileCenter(70, ts), tileCenter(y, ts));
    const foe = dummy(state, "rifleman", tileCenter(80, ts), tileCenter(y, ts));
    applyCommand(state, "A", { type: "cmd.attack", ids: [me.id], targetId: foe.id });
    const seen = watch(state, me, secs(1.2));
    assert.equal(seen.size, FLAMER_BURST, "one burst");
    assert.equal(me.clip, FLAMER.clip - FLAMER_BURST);
    watch(state, me, secs(0.5), seen);
    assert.equal(seen.size, FLAMER_BURST, "a pause after the burst");
    assert.ok(foe.hp < foe.hpMax, "the jet burned the soldier");
    assert.ok(state.fires.length > 0, "the ground burns");
    for (const f of state.fires) {
      assert.ok(Math.hypot(f.x - foe.x, f.y - foe.y) < 4 * ts, "fire lands around the target");
      assert.ok(Math.hypot(f.x - me.x, f.y - me.y) <= catalog("pyro").rangeTiles * ts + 1, "never past his reach");
    }
  });

  it("does not reach past his short range", () => {
    const { state, y, ts } = range();
    const me = pyro(state, tileCenter(70, ts), tileCenter(y, ts));
    const foe = dummy(state, "rifleman", tileCenter(70 + catalog("pyro").rangeTiles + 3, ts), tileCenter(y, ts));
    applyCommand(state, "A", { type: "cmd.attack", ids: [me.id], targetId: foe.id });
    assert.equal(watch(state, me, secs(3)).size, 0);
  });

  it("runs dry after a few bursts, then stops looking for fights until a truck refills him", () => {
    const { state, y, ts } = range();
    const me = pyro(state, tileCenter(70, ts), tileCenter(y, ts));
    const foe = dummy(state, "rifleman", tileCenter(80, ts), tileCenter(y, ts));
    applyCommand(state, "A", { type: "cmd.attack", ids: [me.id], targetId: foe.id });
    const seen = watch(state, me, secs(15));
    assert.equal(seen.size, FLAMER.clip, "every glob in the tanks, no more");
    assert.equal(me.clip, 0);
    assert.equal(me.reload, 0);
    assert.equal(supplyShortOf("pyro", me.ammo, me.mgAmmo, me.clip), true);
    applyCommand(state, "A", { type: "cmd.stop", ids: [me.id] });
    watch(state, me, secs(2), seen);
    assert.equal(me.attackTarget, null, "dry tanks: no auto-engage");

    const truck = makeEntity(state, "supply", "A", tileCenter(66, ts), tileCenter(y, ts));
    assert.equal(applyCommand(state, "A", { type: "cmd.supply", ids: [truck.id], targetId: me.id }).ok, true);
    const glob0 = seen.size;
    for (let i = 0; i < secs(3); i++) step(state, TICK_DT);
    watch(state, me, secs(1), seen);
    assert.ok(seen.size > glob0, "refilled, he goes straight back at the soldier in reach");
    state.entities.delete(foe.id);
    me.clip = 0;
    applyCommand(state, "A", { type: "cmd.supply", ids: [truck.id], targetId: me.id });
    for (let i = 0; i < secs(4); i++) step(state, TICK_DT);
    assert.equal(me.clip, FLAMER.clip, "the truck fills both tanks");
  });

  it("puts the lance down with a broken arm, and cannot fire swimming", () => {
    const { state, y, ts } = range();
    const me = pyro(state, tileCenter(70, ts), tileCenter(y, ts));
    me.crits.push("arm");
    assert.equal(infantryGunFor(me), null);
    const foe = dummy(state, "rifleman", tileCenter(80, ts), tileCenter(y, ts));
    applyCommand(state, "A", { type: "cmd.attack", ids: [me.id], targetId: foe.id });
    assert.equal(watch(state, me, secs(2)).size, 0);

    const wet = range();
    for (let tx = 69; tx <= 71; tx++) {
      for (let ty = wet.y - 1; ty <= wet.y + 1; ty++) {
        const i = ty * wet.state.width + tx;
        wet.state.terrain[i] = TILE_WATER;
        wet.state.blocked[i] = 1;
      }
    }
    const swimmer = pyro(wet.state, tileCenter(70, ts), tileCenter(wet.y, ts));
    const foe2 = dummy(wet.state, "rifleman", tileCenter(80, ts), tileCenter(wet.y, ts));
    applyCommand(wet.state, "A", { type: "cmd.attack", ids: [swimmer.id], targetId: foe2.id });
    assert.equal(watch(wet.state, swimmer, secs(2)).size, 0);
  });

  it("pours the jet in through the windows of a held house: the walls stand, the men inside burn", () => {
    const { state, y, ts } = range();
    const house = makeEntity(state, "cottage", "", tileCenter(84, ts), tileCenter(y, ts), { tileX: 80, tileY: y - 4 });
    const inside = makeEntity(state, "rifleman", "B", tileCenter(78, ts), tileCenter(y, ts));
    assert.equal(enterGarrison(state, inside, house), true);
    inside.cooldown = 1e9;
    const me = pyro(state, house.x - (house.tileW / 2 + 5) * ts, house.y);
    const hp0 = house.hp;
    applyCommand(state, "A", { type: "cmd.attack", ids: [me.id], targetId: house.id });
    const seen = watch(state, me, secs(2));
    assert.ok(seen.size > 0, "he lays the jet on the house");
    assert.ok(inside.hp < inside.hpMax, "the occupant is burned");
    assert.equal(house.hp, hp0, "fuel does not bring walls down");
  });

  it("leaves tanks alone on his own", () => {
    const { state, y, ts } = range();
    const me = pyro(state, tileCenter(70, ts), tileCenter(y, ts));
    dummy(state, "warden", tileCenter(78, ts), tileCenter(y, ts));
    assert.equal(watch(state, me, secs(3)).size, 0);
  });
});

describe("burning ground", () => {
  it("burns soft infantry hard, the Cyborg and the Pyro a little, and armor not at all", () => {
    const { state, y, ts } = range();
    const spots = [72, 80, 88, 96, 104].map((tx) => ({ x: tileCenter(tx, ts), y: tileCenter(y, ts) }));
    const rifle = makeEntity(state, "rifleman", "B", spots[0]!.x, spots[0]!.y);
    const cy = makeEntity(state, "cyborg", "B", spots[1]!.x, spots[1]!.y);
    const suit = makeEntity(state, "pyro", "B", spots[2]!.x, spots[2]!.y);
    const tank = makeEntity(state, "warden", "B", spots[3]!.x, spots[3]!.y);
    const ally = makeEntity(state, "rifleman", "A", spots[4]!.x, spots[4]!.y);
    for (const e of [rifle, cy, suit, tank, ally]) {
      e.holdPosition = true;
      e.cooldown = 1e9;
      e.mgCooldown = 1e9;
    }
    for (const s of spots) igniteAt(state, s.x, s.y, "A");
    const hp0 = [rifle, cy, suit, tank, ally].map((e) => e.hp);
    for (let i = 0; i < secs(1); i++) step(state, TICK_DT);
    const lost = [rifle, cy, suit, tank, ally].map((e, i) => hp0[i]! - e.hp);
    assert.ok(Math.abs(lost[0]! - FIRE_BURN_DPS) < 2, `rifleman lost ${lost[0]}`);
    assert.ok(lost[1]! > 0 && lost[1]! < lost[0]! * 0.3, `cyborg lost ${lost[1]}`);
    assert.ok(lost[2]! > 0 && lost[2]! < lost[0]! * 0.3, `pyro lost ${lost[2]}`);
    assert.equal(lost[3], 0, "armor plate does not burn");
    assert.ok(Math.abs(lost[4]! - lost[0]!) < 1e-6, "the fire burns his own side too");
    for (let i = 0; i < secs(1.5); i++) step(state, TICK_DT);
    assert.equal(rifle.hp, 0, "a rifleman held in the flames dies in a couple of seconds");
  });

  it("dies down and goes out", () => {
    const { state, y, ts } = range();
    igniteAt(state, tileCenter(80, ts), tileCenter(y, ts), "A");
    assert.equal(state.fires.length, 1);
    for (let i = 0; i < secs(FIRE_SECONDS * 0.8); i++) step(state, TICK_DT);
    assert.equal(state.fires.length, 1, "still burning");
    for (let i = 0; i < secs(FIRE_SECONDS * 0.4); i++) step(state, TICK_DT);
    assert.equal(state.fires.length, 0, "gone out");
  });

  it("feeds a patch already burning instead of stacking a new one", () => {
    const { state, y, ts } = range();
    const x = tileCenter(80, ts);
    const f = igniteAt(state, x, tileCenter(y, ts), "A")!;
    f.life = 1;
    const r0 = f.radius;
    igniteAt(state, x + 1, tileCenter(y, ts), "A");
    assert.equal(state.fires.length, 1);
    assert.equal(f.life, f.lifeMax, "flares back up");
    assert.ok(f.radius > r0, "spreads");
  });

  it("does not burn on water", () => {
    const { state, y, ts } = range();
    const i = y * state.width + 80;
    state.terrain[i] = TILE_WATER;
    assert.equal(igniteAt(state, tileCenter(80, ts), tileCenter(y, ts), "A"), null);
    assert.equal(state.fires.length, 0);
  });

  it("an idle soldier walks out of the flames; one holding position stays", () => {
    const { state, y, ts } = range();
    const idle = makeEntity(state, "rifleman", "B", tileCenter(80, ts), tileCenter(y, ts));
    const held = makeEntity(state, "rifleman", "B", tileCenter(100, ts), tileCenter(y, ts));
    held.holdPosition = true;
    igniteAt(state, idle.x, idle.y, "A");
    igniteAt(state, held.x, held.y, "A");
    const x0 = idle.x;
    const y0 = idle.y;
    for (let i = 0; i < secs(1.5); i++) step(state, TICK_DT);
    assert.ok(Math.hypot(idle.x - x0, idle.y - y0) > ts, "he moved off the fire");
    assert.ok(idle.hp > held.hp, "and burned less for it");
    assert.equal(held.order?.kind, undefined);
  });

  it("is in the snapshot, with the globs in flight", () => {
    const { state, y, ts } = range();
    const me = pyro(state, tileCenter(70, ts), tileCenter(y, ts));
    const foe = dummy(state, "rifleman", tileCenter(80, ts), tileCenter(y, ts));
    applyCommand(state, "A", { type: "cmd.attack", ids: [me.id], targetId: foe.id });
    let flame = false;
    for (let i = 0; i < secs(1) && !flame; i++) {
      step(state, TICK_DT);
      const snap = snapshotFor(state, "A");
      flame = snap.projectiles.some((p) => p.flame && p.fromId === me.id && p.arc != null);
    }
    assert.ok(flame, "globs carry the flame flag and their arc");
    for (let i = 0; i < secs(1); i++) step(state, TICK_DT);
    const snap = snapshotFor(state, "A");
    assert.ok(snap.fires.length > 0);
    assert.ok(snap.fires.every((f) => f.radius > 0 && f.life > 0 && f.lifeMax >= f.life));
  });
});

describe("pyro tanks", () => {
  it("are likelier to go up the more fuel is left", () => {
    assert.equal(cookOffChance({ clip: FLAMER.clip }), PYRO_COOKOFF_CHANCE_FULL);
    assert.equal(cookOffChance({ clip: 0 }), PYRO_COOKOFF_CHANCE_DRY);
    assert.ok(PYRO_COOKOFF_CHANCE_FULL < 0.5, "a small chance");
  });

  it("going up throws a fireball that kills soldiers close by and leaves the ground burning", () => {
    const { state, y, ts } = range();
    const me = pyro(state, tileCenter(80, ts), tileCenter(y, ts));
    const near = makeEntity(state, "rifleman", "B", tileCenter(81, ts), tileCenter(y, ts));
    const far = makeEntity(state, "rifleman", "B", tileCenter(100, ts), tileCenter(y, ts));
    const tank = makeEntity(state, "warden", "B", tileCenter(83, ts), tileCenter(y, ts));
    cookOff(state, me);
    assert.equal(near.hp, 0, "the soldier beside him");
    assert.equal(far.hp, far.hpMax, "out of the fireball");
    assert.ok(tank.hp > tank.hpMax * 0.9, "a tank shrugs it off");
    assert.ok(state.fires.length >= 4, `burning patches ${state.fires.length}`);
    assert.ok(state.impacts.some((i) => i.cookoff && i.blast));
  });

  it("go up now and then when he is killed", () => {
    let went = 0;
    const trials = 60;
    for (let n = 0; n < trials; n++) {
      const { state, y, ts } = range();
      state.rngState = (n * 2654435761) >>> 0 || 1;
      const me = pyro(state, tileCenter(80, ts), tileCenter(y, ts));
      me.hp = 0;
      step(state, TICK_DT);
      if (state.fires.length > 0) went++;
      assert.ok(!state.entities.has(me.id));
      assert.ok(state.bodies.some((b) => b.type === "pyro"), "he still leaves a body");
    }
    assert.ok(went > 0 && went < trials / 2, `cooked off ${went}/${trials}`);
  });
});
