import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  carriesShell,
  catalog,
  FIRE_BURN_DPS,
  FIRE_RADIUS,
  FIRE_SECONDS,
  FLAMER,
  FLAMER_BURST,
  FLAMER_BURSTS,
  FLAMER_TRAIL_GAP,
  LASER_SWEEP_CYBORG_DAMAGE,
  HE_FIRE_PATCHES,
  HE_FIRE_RADIUS,
  HANDGUN_RANGE_TILES,
  infantryGunFor,
  infantryLoadout,
  isInfantryType,
  PYRO_COOKOFF_CHANCE_DRY,
  PYRO_COOKOFF_CHANCE_FULL,
  RIFLE_RANGE_TILES,
  shellsFor,
  supplyShortOf,
  TICK_DT,
  TRAIN_TYPES,
  type ShellType,
} from "../catalog.js";
import { TILE_EMPTY, TILE_TREE, TILE_WATER } from "../maps.js";
import { applyCommand } from "./commands.js";
import { tickProjectiles } from "./combat.js";
import { cookOff, cookOffChance, igniteAt, throwFlame } from "./flame.js";
import { burnVariant } from "./remains.js";
import { makeEntity, tileCenter } from "./geo.js";
import { enterGarrison } from "./garrison.js";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import { createMatch, step } from "./match.js";
import { snapshotFor } from "./snapshot.js";
import { producerType } from "./train.js";
import type { Entity, MatchState, Projectile } from "./types.js";

function twoPlayerMatch(): MatchState {
  const r = createRoom({ id: "PY1", hostId: "A", hostName: "Alpha", mapId: "yard-64", maxSlots: 8 });
  if (!r.ok) throw new Error(r.message);
  const room = r.value;
  assert.equal(joinRoom(room, "B", "Bravo").ok, true);
  updateSelf(room, "A", { ready: true, spawnId: 1 });
  updateSelf(room, "B", { ready: true, spawnId: 4 });
  const started = startMatch(room, "A", () => 0);
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
    assert.equal(FLAMER.clip, 36, "half again the old twenty-four charges");
    assert.equal(FLAMER.reload, 0, "the tanks never refill by themselves");
    assert.ok(FLAMER.rangeTiles > HANDGUN_RANGE_TILES && FLAMER.rangeTiles < RIFLE_RANGE_TILES / 2);
    assert.equal(catalog("pyro").rangeTiles, FLAMER.rangeTiles);
  });

  it("throws one burst of globs, pauses, and lays fire from just past him out to the aim", () => {
    const { state, y, ts } = range();
    const me = pyro(state, tileCenter(70, ts), tileCenter(y, ts));
    const aimX = tileCenter(80, ts);
    const aimY = tileCenter(y, ts);
    assert.equal(applyCommand(state, "A", { type: "cmd.forceattack", ids: [me.id], x: aimX, y: aimY }).ok, true);
    const seen = watch(state, me, secs(1.2));
    assert.equal(seen.size, FLAMER_BURST, "one burst");
    assert.equal(me.clip, FLAMER.clip - FLAMER_BURST);
    watch(state, me, secs(0.5), seen);
    assert.equal(seen.size, FLAMER_BURST, "a pause after the burst");
    const dist = Math.hypot(aimX - me.x, aimY - me.y);
    const near = me.radius + FLAMER_TRAIL_GAP;
    assert.ok(state.fires.length > 1, "a trail, not one patch");
    let reached = false;
    for (const f of state.fires) {
      const along = f.x - me.x;
      assert.ok(along > near, `fire at ${along.toFixed(1)} starts further out than he stands`);
      assert.ok(along <= dist + FIRE_RADIUS, "not past the aim");
      assert.ok(Math.abs(f.y - me.y) < FIRE_RADIUS * 2, "on the line");
      if (dist - along < FIRE_RADIUS * 2) reached = true;
    }
    assert.equal(reached, true, "the trail reaches the aim");
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
    const aimX = tileCenter(80, ts);
    const aimY = tileCenter(y, ts);
    assert.equal(applyCommand(state, "A", { type: "cmd.forceattack", ids: [me.id], x: aimX, y: aimY }).ok, true);
    const seen = watch(state, me, secs(20));
    assert.equal(seen.size, FLAMER.clip, "every glob in the tanks, no more");
    assert.equal(me.clip, 0);
    assert.equal(me.reload, 0);
    assert.equal(me.hp, me.hpMax, "a full tank of trail stays off him");
    assert.equal(supplyShortOf("pyro", me.ammo, me.mgAmmo, me.clip), true);
    applyCommand(state, "A", { type: "cmd.stop", ids: [me.id] });
    watch(state, me, secs(2), seen);
    assert.equal(me.attackTarget, null, "dry tanks: no auto-engage");

    const foe = dummy(state, "rifleman", tileCenter(80, ts), tileCenter(y, ts));
    const truck = makeEntity(state, "supply", "A", tileCenter(66, ts), tileCenter(y, ts));
    assert.equal(applyCommand(state, "A", { type: "cmd.supply", ids: [truck.id], targetId: me.id }).ok, true);
    // He burns the man on the first glob, so the shots are during the fill, not after it.
    let back = 0;
    for (let i = 0; i < secs(3); i++) {
      step(state, TICK_DT);
      for (const p of state.projectiles) {
        if (p.fromId === me.id && p.flight === "flame" && !seen.has(p.id)) {
          seen.set(p.id, state.tick);
          back++;
        }
      }
    }
    assert.ok(back > 0, "refilled, he goes straight back at the soldier in reach");
    assert.equal(foe.hp, 0, "that jet burns him where he stands");
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

  it("burns every soldier on the jet, friend or foe, and spares the flanks and anyone past the target", () => {
    const { state, y, ts } = range();
    const me = pyro(state, tileCenter(70, ts), tileCenter(y, ts));
    const x = me.x;
    const foe = makeEntity(state, "rifleman", "B", tileCenter(78, ts), tileCenter(y, ts));
    const friend = makeEntity(state, "gunner", "A", tileCenter(74, ts), tileCenter(y, ts));
    const borg = makeEntity(state, "cyborg", "B", tileCenter(76, ts), tileCenter(y, ts));
    const flank = makeEntity(state, "rifleman", "B", tileCenter(76, ts), tileCenter(y + 3, ts));
    const past = makeEntity(state, "rifleman", "B", tileCenter(82, ts), tileCenter(y, ts));
    const tank = makeEntity(state, "warden", "B", tileCenter(77, ts), tileCenter(y, ts));
    for (const u of [foe, friend, borg, flank, past, tank]) {
      u.holdPosition = true;
      u.cooldown = 1e9;
      u.mgCooldown = 1e9;
    }
    const reach = catalog("pyro").rangeTiles * ts;
    throwFlame(state, me, foe.x, foe.y, reach, false);
    for (const dead of [foe, friend]) {
      assert.equal(dead.hp, 0, `${dead.type} of ${dead.ownerId} burned`);
      assert.equal(dead.fireDeath, true);
    }
    assert.equal(borg.hp, borg.hpMax - LASER_SWEEP_CYBORG_DAMAGE, "a cyborg's plating takes one heavy cut");
    assert.equal(flank.hp, flank.hpMax, "off the jet");
    assert.equal(past.hp, past.hpMax, "past the target");
    assert.equal(tank.hp, tank.hpMax, "armor plate does not take the cut");
    const hp = borg.hp;
    throwFlame(state, me, foe.x, foe.y, reach, false);
    assert.equal(borg.hp, hp, "the rest of the burst does not cut him again");
    const dist = foe.x - x;
    const near = me.radius + FLAMER_TRAIL_GAP;
    assert.ok(state.fires.length > 1);
    for (const f of state.fires) {
      assert.ok(f.x - x > near, "the trail starts a little further out than he stands");
      assert.ok(f.x <= foe.x + FIRE_RADIUS, "not past the target");
    }
    assert.ok(state.fires.some((f) => dist - (f.x - x) < FIRE_RADIUS * 2), "it reaches the target");
  });

  it("a building stops the jet: the man behind it is spared, the man in front burns", () => {
    const { state, y, ts } = range();
    // The cottage covers tiles 78–85. Both men are inside his reach; only the wall keeps the far one safe.
    const house = makeEntity(state, "cottage", "", tileCenter(82, ts), tileCenter(y, ts), { tileX: 78, tileY: y - 4 });
    const me = pyro(state, tileCenter(74, ts), tileCenter(y, ts));
    const front = makeEntity(state, "rifleman", "B", tileCenter(76, ts), tileCenter(y, ts));
    const behind = makeEntity(state, "rifleman", "B", tileCenter(87, ts), tileCenter(y, ts));
    front.holdPosition = true;
    behind.holdPosition = true;
    throwFlame(state, me, behind.x, behind.y, catalog("pyro").rangeTiles * ts, false);
    assert.equal(front.hp, 0, "in front of the house");
    assert.equal(behind.hp, behind.hpMax, "the wall stops the jet");
    assert.equal(house.hp, house.hpMax, "fuel does not bring the wall down");
    assert.ok(state.fires.every((f) => f.x < house.x), "no fire past the house");
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

  it("a soldier the fireball kills is charred, with no blood", () => {
    const { state, y, ts } = range();
    const me = pyro(state, tileCenter(80, ts), tileCenter(y, ts));
    const near = makeEntity(state, "rifleman", "B", tileCenter(81, ts), tileCenter(y, ts));
    cookOff(state, me);
    step(state, TICK_DT);
    const body = state.bodies.find((b) => b.type === "rifleman" && b.x === near.x);
    assert.ok(body, "he fell in the open");
    assert.equal(body.burned, true);
    assert.equal(body.blood.length, 0);
    assert.equal(snapshotFor(state, "B").bodies.some((b) => b.id === body.id && b.burned), true);
  });
});

describe("pyro and trees", () => {
  it("burns every tree the jet crosses, and leaves a tree off the line standing", () => {
    const { state, y, ts } = range();
    const ty = y;
    const on = 73;
    const off = 73;
    state.terrain[ty * state.width + on] = TILE_TREE;
    state.terrain[(ty + 3) * state.width + off] = TILE_TREE;
    const me = pyro(state, tileCenter(70, ts), tileCenter(ty, ts));
    const reach = catalog("pyro").rangeTiles * ts;
    throwFlame(state, me, tileCenter(78, ts), tileCenter(ty, ts), reach, false);
    assert.equal(state.terrain[ty * state.width + on], TILE_EMPTY, "the trunk on the jet burns");
    assert.equal(state.terrain[(ty + 3) * state.width + off], TILE_TREE, "a trunk off the line stands");
    const cleared = state.clearedTrees.find((t) => t.x === on && t.y === ty);
    assert.equal(cleared?.burn, true);
    assert.equal(snapshotFor(state, "A").clearedTrees.some((t) => t.x === on && t.y === ty && t.burn), true);
  });

  it("force-attack on a tree burns that trunk", () => {
    const { state, y, ts } = range();
    const tx = 73;
    const ty = y;
    state.terrain[ty * state.width + tx] = TILE_TREE;
    const me = pyro(state, tileCenter(70, ts), tileCenter(ty, ts));
    const res = applyCommand(state, "A", {
      type: "cmd.forceattack",
      ids: [me.id],
      x: tileCenter(tx, ts),
      y: tileCenter(ty, ts),
    });
    assert.equal(res.ok, true);
    let burned = false;
    for (let i = 0; i < secs(3) && !burned; i++) {
      step(state, TICK_DT);
      burned = state.clearedTrees.some((t) => t.x === tx && t.y === ty && t.burn);
    }
    assert.equal(burned, true);
    assert.equal(state.terrain[ty * state.width + tx], TILE_EMPTY);
  });
});

describe("death by fire", () => {
  it("kills the soldier where he stands and leaves a charred corpse with no blood", () => {
    const { state, y, ts } = range();
    const foe = makeEntity(state, "rifleman", "B", tileCenter(80, ts), tileCenter(y, ts));
    foe.holdPosition = true;
    foe.hp = 5;
    igniteAt(state, foe.x, foe.y, "A");
    for (let i = 0; i < secs(3) && state.entities.has(foe.id); i++) step(state, TICK_DT);
    assert.equal(state.entities.has(foe.id), false, "he is dead at once, not still fighting through the burn");
    const body = state.bodies.find((b) => b.type === "rifleman");
    assert.ok(body);
    assert.equal(body.burned, true);
    assert.equal(body.blood.length, 0);
    assert.equal(body.x, foe.x);
    assert.equal(body.y, foe.y);
    const v = burnVariant(body.id);
    assert.ok(v === 0 || v === 1 || v === 2);
  });
});

describe("tank HE", () => {
  /** A Tiger round already in flight from (x, y), heading east. It stops after `life` seconds. */
  function shell(state: MatchState, x: number, y: number, kind: ShellType, life = 1): Projectile {
    const def = shellsFor("warden")[kind];
    const p: Projectile = {
      id: state.nextId++,
      ownerId: "A",
      team: 1,
      x,
      y,
      vx: catalog("warden").projectileSpeed,
      vy: 0,
      damage: def.damage,
      penetration: def.penetration,
      caliber: def.caliber,
      life,
      ignoreId: -1,
      fromId: -1,
      bounced: false,
      shell: kind,
    };
    state.projectiles.push(p);
    return p;
  }

  /** Flight time to come down six tiles out, on the cleared pad. */
  const hop = (ts: number) => (6 * ts) / catalog("warden").projectileSpeed;

  function land(state: MatchState): void {
    for (let i = 0; i < 60 && state.projectiles.length > 0; i++) tickProjectiles(state, TICK_DT);
  }

  it("sets a wide patch of ground burning where it lands, and the burst is flagged for the fireball", () => {
    const { state, y, ts } = range();
    shell(state, tileCenter(70, ts), tileCenter(y, ts), "he", hop(ts));
    land(state);
    const burst = state.impacts.find((i) => i.heBurst);
    assert.ok(burst, `impacts=${state.impacts.map((i) => i.kind).join(",")}`);
    assert.ok(state.fires.length >= HE_FIRE_PATCHES, `burning patches ${state.fires.length}`);
    const spread = Math.max(...state.fires.map((f) => Math.hypot(f.x - burst.x, f.y - burst.y)));
    assert.ok(spread > HE_FIRE_RADIUS * 0.6, `fire reaches out ${spread}`);
    assert.ok(spread <= HE_FIRE_RADIUS + 1, "and no farther than the burst");
  });

  it("burns the soldiers standing in it, like the Pyro's fuel", () => {
    const { state, y, ts } = range();
    const p = shell(state, tileCenter(70, ts), tileCenter(y, ts), "he", hop(ts));
    land(state);
    const at = state.impacts.find((i) => i.heBurst)!;
    const man = makeEntity(state, "rifleman", "B", at.x, at.y);
    man.holdPosition = true;
    for (let i = 0; i < secs(1); i++) step(state, TICK_DT);
    assert.ok(man.hp < man.hpMax, `hp ${man.hp}`);
    assert.equal(p.shell, "he");
  });

  it("bursts on armor instead of skipping on", () => {
    const { state, y, ts } = range();
    const tank = dummy(state, "warden", tileCenter(80, ts), tileCenter(y, ts));
    tank.facing = Math.PI;
    shell(state, tileCenter(76, ts), tileCenter(y, ts), "he");
    land(state);
    assert.equal(state.projectiles.length, 0, "nothing bounces away");
    assert.equal(state.impacts.filter((i) => i.heBurst).length, 1);
    assert.ok(state.fires.length > 0, "the ground around the hull burns");
  });

  it("solid shot leaves no fire", () => {
    const { state, y, ts } = range();
    shell(state, tileCenter(70, ts), tileCenter(y, ts), "ap", hop(ts));
    land(state);
    assert.equal(state.fires.length, 0);
    assert.equal(state.impacts.some((i) => i.heBurst), false);
  });

  it("does not set water alight", () => {
    const { state, y, ts } = range();
    for (let ty = y - 8; ty <= y + 8; ty++) {
      for (let tx = 60; tx <= 130; tx++) state.terrain[ty * state.width + tx] = TILE_WATER;
    }
    shell(state, tileCenter(70, ts), tileCenter(y, ts), "he", hop(ts));
    land(state);
    assert.equal(state.fires.length, 0);
  });

  it("the Tiger and the StuG carry no smoke", () => {
    assert.equal(carriesShell("warden", "smoke"), false);
    assert.equal(carriesShell("ss3", "smoke"), false);
    assert.equal(carriesShell("warden", "he"), true);
  });
});

