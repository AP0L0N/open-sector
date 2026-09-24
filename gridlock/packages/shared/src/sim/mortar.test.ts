import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  INFANTRY_SIGHT_TILES,
  MORTAR,
  MORTAR_MIN_RANGE_TILES,
  MORTAR_PLANT_SECONDS,
  MORTAR_RANGE_TILES,
  MORTAR_SPLASH_TILES,
  TILE_SIZE,
  addCrit,
  catalog,
  infantryGunFor,
  infantryLoadout,
  isInfantryType,
} from "../catalog.js";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import { TILE_EMPTY, TILE_TREE, TILE_WATER } from "../maps.js";
import { applyCommand } from "./commands.js";
import { makeEntity, tileCenter, tileIndex } from "./geo.js";
import { createMatch, step } from "./match.js";
import { mortarAirZ, mortarArcPoints, mortarFalloff, mortarScatterRadius } from "./mortar.js";
import { tickProjectiles } from "./combat.js";
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

  it("acquires and lobs at a soldier he cannot see, and the bomb flies over a man in between", () => {
    const { state, a, b } = match();
    const ts = state.tileSize;
    const tube = makeEntity(state, "mortarman", a, tileCenter(30, ts), tileCenter(40, ts));
    const gap = INFANTRY_SIGHT_TILES + 16;
    const foe = makeEntity(state, "rifleman", b, tileCenter(30 + gap, ts), tileCenter(40, ts));
    const mid = makeEntity(state, "rifleman", a, tileCenter(30 + 20, ts), tileCenter(40, ts));
    foe.holdPosition = true;
    foe.cooldown = 99;
    mid.holdPosition = true;
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
    assert.equal(tank.hp, before, "front plate shrugs a mortar bomb");
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
