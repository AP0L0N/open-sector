import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  INFANTRY_SIGHT_TILES,
  MORTAR,
  MORTAR_ARMOR_CHIP,
  MORTAR_MIN_RANGE_TILES,
  MORTAR_PLANT_SECONDS,
  MORTAR_RANGE_TILES,
  MORTAR_SPLASH_TILES,
  MORTAR_TRACK_CHANCE,
  TILE_SIZE,
  addCrit,
  catalog,
  hasTracks,
  infantryGunFor,
  infantryLoadout,
  isInfantryType,
} from "../catalog.js";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import { TILE_EMPTY, TILE_TREE, TILE_WATER } from "../maps.js";
import { applyCommand } from "./commands.js";
import { destroyEntity, makeEntity, tileCenter, tileIndex } from "./geo.js";
import { createMatch, step } from "./match.js";
import { mortarAirZ, mortarArcPoints, mortarArmorNick, mortarFalloff, mortarScatterRadius } from "./mortar.js";
import { nextRand } from "./rng.js";
import { tickCombat, tickProjectiles } from "./combat.js";
import { snapshotFor } from "./snapshot.js";
import { canSeeEntity } from "./vision.js";
import type { MatchState, Projectile } from "./types.js";

function match(): { state: MatchState; a: string; b: string } {
  const r = createRoom({
    id: "MR",
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

function ticks(state: MatchState, n: number): void {
  for (let i = 0; i < n; i++) step(state, 0.1);
}

function isolate(state: MatchState, keep: readonly number[]): void {
  for (const e of [...state.entities.values()]) {
    if (!keep.includes(e.id)) destroyEntity(state, e);
  }
}

/** First nextRand is the nick's damage roll. The second is the track roll. */
function seedAfterOneRand(want: (roll: number) => boolean): number {
  for (let s = 1; s < 50000; s++) {
    const st = { rngState: s };
    nextRand(st);
    if (want(nextRand(st))) return s;
  }
  throw new Error("no rng seed");
}

function bomb(state: MatchState, owner: string, fromId: number, x: number, y: number, harmAllies = false): Projectile {
  const p: Projectile = {
    id: state.nextId++,
    ownerId: owner,
    team: 1,
    x,
    y,
    vx: 40,
    vy: 0,
    damage: MORTAR.damage,
    penetration: MORTAR.penetration,
    caliber: MORTAR.caliber,
    life: 0.01,
    ignoreId: fromId,
    fromId,
    bounced: false,
    shell: null,
    flight: "mortar",
    landX: x,
    landY: y,
    apex: 20,
    flightTime: 1,
    harmAllies,
    z: 4,
  };
  state.projectiles.push(p);
  return p;
}

describe("mortar", () => {
  it("is a Muster infantry tube with reach past his eyes", () => {
    const m = catalog("mortarman");
    assert.equal(m.name, "Mortarman");
    assert.equal(m.letter, "O");
    assert.equal(isInfantryType("mortarman"), true);
    assert.equal(m.sightTiles, INFANTRY_SIGHT_TILES);
    assert.ok(m.rangeTiles > m.sightTiles * 2, `range ${m.rangeTiles} sight ${m.sightTiles}`);
    assert.equal(m.rangeTiles, MORTAR_RANGE_TILES);
    assert.equal(MORTAR.minRangeTiles, MORTAR_MIN_RANGE_TILES);
    assert.ok(MORTAR_MIN_RANGE_TILES < m.sightTiles);
    assert.equal(MORTAR.caliber, 60);
    assert.ok(MORTAR.damage >= catalog("rifleman").hp);
    assert.ok(MORTAR.penetration < catalog("warden").armorFront * 0.5);
    assert.ok(MORTAR_ARMOR_CHIP < 0.1);
    assert.ok(MORTAR_TRACK_CHANCE <= 0.15);
    assert.equal(hasTracks("warden"), true);
    assert.equal(hasTracks("ss3"), true);
    assert.equal(hasTracks("walker"), false);
    assert.equal(hasTracks("hauler"), false);
    assert.deepEqual(infantryLoadout("mortarman").map((g) => g.id), ["mortar"]);
    assert.equal(infantryGunFor({ type: "mortarman" })?.id, "mortar");
    assert.equal(infantryGunFor({ type: "mortarman", crits: ["arm"] }), null);
    const trained = applyCommand(match().state, "A", { type: "cmd.train", unit: "mortarman" });
    assert.equal(trained.ok, false);
    if (!trained.ok) assert.equal(trained.message, "Need a Muster.");
  });

  it("scatters more at range, peaks in the air, and still hurts at the rim", () => {
    const near = mortarScatterRadius(100, 800);
    const far = mortarScatterRadius(800, 800);
    assert.ok(far > near * 2);
    assert.ok(far < MORTAR_SPLASH_TILES * TILE_SIZE, `scatter ${far} should stay inside the blast`);
    const arc = mortarArcPoints({
      x: 200,
      y: 80,
      vx: 40,
      vy: 0,
      apex: 40,
      arc: 0.5,
      hang: 2,
      steps: 8,
    });
    assert.equal(arc[0]!.u, 0);
    assert.equal(arc[0]!.z, 0);
    assert.ok(arc[0]!.x < 200, "the trail starts back at the tube");
    assert.equal(arc[arc.length - 1]!.x, 200);
    assert.equal(arc[arc.length - 1]!.z, mortarAirZ(0.5, 40));
    const mid = arc[Math.floor(arc.length / 2)]!;
    assert.ok(mid.z > arc[0]!.z && mid.z >= arc[arc.length - 1]!.z * 0.5);
    assert.equal(mortarAirZ(0, 30), 0);
    assert.equal(mortarAirZ(1, 30), 0);
    assert.equal(mortarAirZ(0.5, 30), 30);
    assert.equal(mortarFalloff(0, 80), 1);
    assert.ok(mortarFalloff(80, 80) < 0.4);
    assert.ok(mortarFalloff(40, 80) > mortarFalloff(80, 80));
  });

  it("does not auto-attack a soldier the side cannot see", () => {
    const { state, a, b } = match();
    const ts = state.tileSize;
    const tube = makeEntity(state, "mortarman", a, tileCenter(30, ts), tileCenter(40, ts));
    const gap = INFANTRY_SIGHT_TILES + 16;
    const foe = makeEntity(state, "rifleman", b, tileCenter(30 + gap, ts), tileCenter(40, ts));
    const mid = makeEntity(state, "rifleman", a, tileCenter(30 + 20, ts), tileCenter(40, ts));
    foe.holdPosition = true;
    foe.cooldown = 99;
    mid.holdPosition = true;
    // The lane between the screen and the target has to stay blocked no matter
    // where the yard's trees landed. A short grove is enough to spend the LOS budget.
    for (let x = 30 + 28; x <= 30 + 36; x++) {
      for (let y = 38; y <= 42; y++) state.terrain[tileIndex(state, x, y)] = TILE_TREE;
    }
    isolate(state, [tube.id, mid.id, foe.id]);
    const dist = Math.hypot(foe.x - tube.x, foe.y - tube.y);
    assert.ok(dist > catalog("mortarman").sightTiles * ts);
    assert.ok(dist < MORTAR_RANGE_TILES * ts);
    assert.ok(dist > MORTAR_MIN_RANGE_TILES * ts);
    assert.equal(canSeeEntity(state, a, foe), false);
    tube.stance = "crouch";
    tube.stanceOrder = "crouch";
    tube.bipod = MORTAR_PLANT_SECONDS;
    tube.facing = Math.atan2(foe.y - tube.y, foe.x - tube.x);
    ticks(state, 2);
    assert.equal(tube.attackTarget, null);
    assert.equal(state.projectiles.some((p) => p.fromId === tube.id), false);

    tube.order = { kind: "attackmove", x: foe.x, y: foe.y };
    ticks(state, 2);
    assert.equal(tube.attackTarget, null);
    assert.equal(state.projectiles.some((p) => p.fromId === tube.id), false);
  });

  it("lobs past his own eyes once a teammate can see the target, and the bomb flies over a man in between", () => {
    const { state, a, b } = match();
    const ts = state.tileSize;
    const tube = makeEntity(state, "mortarman", a, tileCenter(30, ts), tileCenter(40, ts));
    const gap = INFANTRY_SIGHT_TILES + 16;
    const foe = makeEntity(state, "rifleman", b, tileCenter(30 + gap, ts), tileCenter(40, ts));
    const mid = makeEntity(state, "rifleman", a, tileCenter(30 + 20, ts), tileCenter(40, ts));
    const spotter = makeEntity(state, "rifleman", a, tileCenter(30 + gap - 4, ts), tileCenter(40, ts));
    foe.holdPosition = true;
    foe.cooldown = 99;
    mid.holdPosition = true;
    spotter.holdPosition = true;
    spotter.cooldown = 99;
    for (let x = 30 + 28; x <= 30 + 36; x++) {
      for (let y = 38; y <= 42; y++) state.terrain[tileIndex(state, x, y)] = TILE_TREE;
    }
    isolate(state, [tube.id, mid.id, foe.id, spotter.id]);
    const dist = Math.hypot(foe.x - tube.x, foe.y - tube.y);
    assert.ok(dist > catalog("mortarman").sightTiles * ts);
    assert.ok(dist < MORTAR_RANGE_TILES * ts);
    assert.equal(canSeeEntity(state, a, foe), true, "spotter must light the target");
    tube.stance = "crouch";
    tube.stanceOrder = "crouch";
    tube.bipod = MORTAR_PLANT_SECONDS;
    tube.facing = Math.atan2(foe.y - tube.y, foe.x - tube.x);
    ticks(state, 2);
    assert.equal(tube.attackTarget, foe.id);
    const shot = state.projectiles.find((p) => p.fromId === tube.id);
    assert.ok(shot, "a mortar round is in the air");
    assert.equal(shot!.flight, "mortar");
    assert.ok((shot!.flightTime ?? 0) > 1);
    assert.equal(mid.hp, mid.hpMax);
    assert.equal(foe.hp, foe.hpMax);
    const snap = snapshotFor(state, a);
    const view = snap.projectiles.find((p) => p.id === shot!.id);
    assert.equal(view?.mortar, true);
    assert.equal(typeof view?.z, "number");
    assert.ok((view?.apex ?? 0) > 20);
    assert.ok((view?.arc ?? -1) > 0 && (view?.arc ?? 2) < 1);
    assert.ok((view?.hang ?? 0) > 1);

    destroyEntity(state, spotter);
    ticks(state, 1);
    assert.equal(canSeeEntity(state, a, foe), false);
    assert.equal(tube.attackTarget, null);
    assert.equal(tube.order, null);
  });

  it("will not fire until the tube is planted, inside the minimum, or with a broken arm", () => {
    const { state, a, b } = match();
    const ts = state.tileSize;
    const tube = makeEntity(state, "mortarman", a, tileCenter(40, ts), tileCenter(40, ts));
    const foe = makeEntity(state, "rifleman", b, tileCenter(40 + 70, ts), tileCenter(40, ts));
    foe.cooldown = 99;
    foe.holdPosition = true;
    tube.facing = 0;
    const clip = tube.clip;
    assert.equal(applyCommand(state, a, { type: "cmd.attack", ids: [tube.id], targetId: foe.id }).ok, true);
    ticks(state, 3);
    assert.equal(tube.stanceOrder, "crouch");
    assert.equal(tube.clip, clip);
    assert.equal(state.projectiles.length, 0);

    tube.stance = "crouch";
    tube.stanceOrder = "crouch";
    tube.bipod = MORTAR_PLANT_SECONDS;
    const close = makeEntity(state, "rifleman", b, tileCenter(44, ts), tileCenter(40, ts));
    close.cooldown = 99;
    close.holdPosition = true;
    assert.ok(Math.hypot(close.x - tube.x, close.y - tube.y) < MORTAR_MIN_RANGE_TILES * ts);
    assert.equal(applyCommand(state, a, { type: "cmd.attack", ids: [tube.id], targetId: close.id }).ok, true);
    ticks(state, 4);
    assert.equal(tube.clip, clip);
    assert.equal(close.hp, close.hpMax);

    addCrit(tube, "arm");
    tube.attackTarget = foe.id;
    tube.order = { kind: "attack", targetId: foe.id };
    ticks(state, 2);
    assert.equal(tube.clip, clip);
  });

  it("kills infantry in the blast, wounds the rim, and glances off a tank", () => {
    const { state, a, b } = match();
    const ts = state.tileSize;
    const tube = makeEntity(state, "mortarman", a, tileCenter(10, ts), tileCenter(10, ts));
    const x = tileCenter(80, ts);
    const y = tileCenter(80, ts);
    const center = makeEntity(state, "rifleman", b, x, y);
    const rim = MORTAR_SPLASH_TILES * TILE_SIZE * 0.72;
    const edge = makeEntity(state, "rifleman", b, x + rim, y);
    const tank = makeEntity(state, "warden", b, tileCenter(90, ts), tileCenter(80, ts));
    tank.facing = 0;
    center.holdPosition = true;
    edge.holdPosition = true;
    bomb(state, a, tube.id, x, y);
    tickProjectiles(state, 0.1);
    assert.equal(center.hp, 0, "center infantry dies");
    assert.ok(edge.hp > 0 && edge.hp < edge.hpMax, `rim hp ${edge.hp}`);
    const before = tank.hp;
    bomb(state, a, tube.id, tank.x, tank.y);
    const shot = state.projectiles[state.projectiles.length - 1]!;
    shot.vx = 80;
    shot.vy = 0;
    tickProjectiles(state, 0.1);
    assert.ok(tank.hp < before, "a mortar nicks the hull");
    assert.ok(tank.hp > before - before * 0.12, `nick should stay small hp=${tank.hp}`);
    assert.equal(tank.wreck, false);
  });

  it("nicks every face, throws a track on a tracked hull, and leaves a Walker on its legs", () => {
    const kept = mortarArmorNick(120, 1, true, () => 0.99);
    assert.ok(kept.damage >= 1 && kept.damage < 15);
    assert.equal(kept.throwTrack, false);
    const thrown = mortarArmorNick(120, 1, true, () => 0);
    assert.equal(thrown.throwTrack, true);
    const legs = mortarArmorNick(80, 1, false, () => 0);
    assert.equal(legs.throwTrack, false);

    const throwSeed = seedAfterOneRand((roll) => roll < MORTAR_TRACK_CHANCE);
    const keepSeed = seedAfterOneRand((roll) => roll >= MORTAR_TRACK_CHANCE);
    const { state, a } = match();
    const ts = state.tileSize;
    const tube = makeEntity(state, "mortarman", a, tileCenter(4, ts), tileCenter(4, ts));
    for (const facing of [0, Math.PI / 2, Math.PI]) {
      const tank = makeEntity(state, "warden", "B", tileCenter(40, ts), tileCenter(40, ts));
      tank.facing = facing;
      tank.holdPosition = true;
      state.terrain[tileIndex(state, 40, 40)] = TILE_EMPTY;
      isolate(state, [tube.id, tank.id]);
      const before = tank.hp;
      bomb(state, a, tube.id, tank.x, tank.y);
      state.rngState = keepSeed;
      tickProjectiles(state, 0.1);
      assert.ok(tank.hp < before && tank.hp > before * 0.88, `facing ${facing} hp=${tank.hp}`);
      assert.deepEqual(tank.crits, []);
      assert.equal(tank.wreck, false);
      destroyEntity(state, tank);
    }

    const tiger = makeEntity(state, "warden", "B", tileCenter(40, ts), tileCenter(40, ts));
    tiger.holdPosition = true;
    const stug = makeEntity(state, "ss3", "B", tileCenter(80, ts), tileCenter(40, ts));
    stug.holdPosition = true;
    state.terrain[tileIndex(state, 40, 40)] = TILE_EMPTY;
    state.terrain[tileIndex(state, 80, 40)] = TILE_EMPTY;
    isolate(state, [tube.id, tiger.id, stug.id]);
    bomb(state, a, tube.id, tiger.x, tiger.y);
    state.rngState = throwSeed;
    tickProjectiles(state, 0.1);
    assert.ok(tiger.hp < tiger.hpMax && tiger.hp > 0);
    assert.ok(tiger.crits.includes("tracks"), `tiger crits=${tiger.crits.join(",")}`);

    bomb(state, a, tube.id, stug.x, stug.y);
    state.rngState = throwSeed;
    tickProjectiles(state, 0.1);
    assert.ok(stug.crits.includes("tracks"), `stug crits=${stug.crits.join(",")}`);

    const walker = makeEntity(state, "walker", "B", tileCenter(40, ts), tileCenter(40, ts));
    walker.holdPosition = true;
    walker.cooldown = 99;
    const walkerHp = walker.hp;
    isolate(state, [tube.id, walker.id]);
    bomb(state, a, tube.id, walker.x, walker.y);
    state.rngState = throwSeed;
    tickProjectiles(state, 0.1);
    assert.ok(walker.hp < walkerHp && walker.hp > walkerHp * 0.8, `walker hp=${walker.hp}`);
    assert.deepEqual(walker.crits, []);
    assert.equal(walker.wreck, false);
  });

  it("auto-attacks an armored hull a rifle would ignore", () => {
    const { state, a, b } = match();
    state.heights.fill(0);
    const ts = state.tileSize;
    for (const e of [...state.entities.values()]) {
      if (e.ownerId === b) destroyEntity(state, e);
    }
    const tube = makeEntity(state, "mortarman", a, tileCenter(30, ts), tileCenter(30, ts));
    const rifle = makeEntity(state, "rifleman", a, tileCenter(30, ts), tileCenter(34, ts));
    const tank = makeEntity(state, "warden", b, tileCenter(30, ts), tileCenter(70, ts));
    tube.holdPosition = true;
    rifle.holdPosition = true;
    tank.holdPosition = true;
    tank.cooldown = 99;
    tank.mgCooldown = 99;
    tank.mgAmmo = 0;
    const gap = Math.hypot(tank.x - tube.x, tank.y - tube.y) / ts;
    assert.ok(gap > MORTAR_MIN_RANGE_TILES && gap < MORTAR_RANGE_TILES, `gap ${gap}`);
    tickCombat(state, 0.1);
    assert.equal(tube.attackTarget, tank.id);
    assert.equal(tube.order?.kind, "attack");
    assert.equal(tube.order?.auto, true);
    assert.notEqual(rifle.attackTarget, tank.id);
  });

  it("craters open dirt, splashes water, and fells a tree it lands on", () => {
    const { state, a } = match();
    const ts = state.tileSize;
    const tube = makeEntity(state, "mortarman", a, tileCenter(8, ts), tileCenter(8, ts));
    const dirt = { x: 24, y: 24 };
    state.terrain[tileIndex(state, dirt.x, dirt.y)] = TILE_EMPTY;
    const dx = tileCenter(dirt.x, ts);
    const dy = tileCenter(dirt.y, ts);
    bomb(state, a, tube.id, dx, dy);
    tickProjectiles(state, 0.1);
    assert.equal(state.impacts[0]?.splash, undefined);
    assert.equal(state.impacts[0]?.mortar, true);
    const hole = state.holes.find((h) => Math.hypot(h.x - dx, h.y - dy) < 4);
    assert.ok(hole);
    assert.equal(hole!.round, true);
    assert.equal(hole!.ang, 0);

    const wet = { x: 26, y: 24 };
    state.terrain[tileIndex(state, wet.x, wet.y)] = TILE_WATER;
    const holes = state.holes.length;
    bomb(state, a, tube.id, tileCenter(wet.x, ts), tileCenter(wet.y, ts));
    tickProjectiles(state, 0.1);
    assert.equal(state.impacts.at(-1)?.splash, true);
    assert.equal(state.holes.length, holes);

    const tree = { x: 28, y: 24 };
    const beside = { x: 29, y: 24 };
    const far = { x: 34, y: 24 };
    state.terrain[tileIndex(state, tree.x, tree.y)] = TILE_TREE;
    state.terrain[tileIndex(state, beside.x, beside.y)] = TILE_TREE;
    state.terrain[tileIndex(state, far.x, far.y)] = TILE_TREE;
    bomb(state, a, tube.id, tileCenter(tree.x, ts), tileCenter(tree.y, ts));
    tickProjectiles(state, 0.1);
    assert.ok(state.clearedTrees.some((t) => t.x === tree.x && t.y === tree.y));
    assert.ok(state.clearedTrees.some((t) => t.x === beside.x && t.y === beside.y), "a trunk in the scar comes down");
    assert.equal(
      state.clearedTrees.some((t) => t.x === far.x && t.y === far.y),
      false,
    );
  });
});
