import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CRIT_TRACKS_CHANCE,
  HEIGHT_BASE,
  INFANTRY_SIGHT_TILES,
  PTRD,
  PTRD_CLOSE_TILES,
  PTRD_DMG_LIGHT,
  PTRD_DMG_REAR,
  PTRD_DMG_SIDE,
  PTRD_PEN_CLOSE,
  PTRD_PEN_FAR,
  PTRD_PEN_MUZZLE,
  PTRD_TRACK_CHANCE,
  SCOPED,
  addCrit,
  catalog,
  infantryGunFor,
  infantryLoadout,
  isInfantryType,
  ptrdPenetration,
} from "../catalog.js";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import { applyCommand } from "./commands.js";
import { ptrdHarmPossible, resolveAtRifleHit } from "./ballistics.js";
import { rollCrits } from "./crits.js";
import { rangeTilesOf, sightTilesOf } from "./elevation.js";
import { makeEntity, tileCenter } from "./geo.js";
import { createMatch, step } from "./match.js";
import type { CatalogEntry } from "../catalog.js";
import type { MatchState } from "./types.js";

function match(): { state: MatchState; a: string; b: string } {
  const r = createRoom({
    id: "AT",
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

/** rand 0.5 lands on the middle of the 0.85–1.15 damage band. */
function penAt(
  target: CatalogEntry,
  face: "front" | "side" | "rear",
  distTiles: number,
  pen: number,
) {
  const vx = face === "front" ? -1 : face === "rear" ? 1 : 0;
  const vy = face === "side" ? -1 : 0;
  return resolveAtRifleHit({
    penetration: pen,
    distTiles,
    target,
    targetFacing: 0,
    targetHp: target.hp,
    targetHpMax: target.hp,
    vx,
    vy,
    rand: () => 0.5,
  });
}

function expectChip(target: CatalogEntry, face: "front" | "side" | "rear", distTiles: number, pen: number, frac: number) {
  const hit = penAt(target, face, distTiles, pen);
  assert.equal(hit.kind, "pen", `${target.type} ${face}`);
  assert.equal(hit.face, face);
  assert.equal(hit.damage, Math.round(target.hp * frac));
  assert.ok(hit.damage < target.hp, `${target.type} ${face} must not delete a fresh hull`);
}

describe("AT infantry", () => {
  it("is a muster soldier with the sniper's reach and a PTRD", () => {
    const s = catalog("atinfantry");
    const sniper = catalog("sniper");
    assert.equal(s.name, "AT Infantry");
    assert.equal(s.letter, "P");
    assert.equal(isInfantryType("atinfantry"), true);
    assert.deepEqual(
      infantryLoadout("atinfantry").map((g) => g.id),
      ["ptrd"],
    );
    assert.equal(infantryGunFor({ type: "atinfantry" })?.id, "ptrd");
    assert.equal(infantryGunFor({ type: "atinfantry", crits: ["arm"] }), null);
    assert.equal(s.sightTiles, INFANTRY_SIGHT_TILES);
    assert.equal(s.sightBonusTiles, sniper.sightBonusTiles);
    assert.equal(sightTilesOf("atinfantry", HEIGHT_BASE), sightTilesOf("sniper", HEIGHT_BASE));
    assert.equal(s.rangeTiles, PTRD.rangeTiles);
    assert.equal(s.rangeTiles, sniper.rangeTiles);
    assert.ok(s.rangeTiles < sightTilesOf("atinfantry", HEIGHT_BASE));
    assert.equal(rangeTilesOf("atinfantry", HEIGHT_BASE), rangeTilesOf("sniper", HEIGHT_BASE));
    assert.equal(PTRD.cooldown, SCOPED.cooldown);
    assert.equal(PTRD.clip, SCOPED.clip);
    assert.equal(PTRD.reload, SCOPED.reload);
    assert.equal(PTRD.damage, SCOPED.damage);
    assert.equal(s.cooldown, PTRD.cooldown);
    assert.ok(s.cost > sniper.cost);
    assert.ok(s.moveTilesPerSec < sniper.moveTilesPerSec);
    assert.equal(ptrdPenetration(0, 80), PTRD_PEN_MUZZLE);
    assert.equal(ptrdPenetration(PTRD_CLOSE_TILES, 80), PTRD_PEN_CLOSE);
    assert.equal(ptrdPenetration(80, 80), PTRD_PEN_FAR);
    assert.ok(ptrdPenetration(PTRD_CLOSE_TILES / 2, 80) < PTRD_PEN_MUZZLE);
    assert.ok(ptrdPenetration(PTRD_CLOSE_TILES / 2, 80) > PTRD_PEN_CLOSE);
    const trained = applyCommand(match().state, "A", { type: "cmd.train", unit: "atinfantry" });
    assert.equal(trained.ok, false);
    if (!trained.ok) assert.equal(trained.message, "Need a Muster.");
  });

  it("opens light armor and a tank's side or rear up close, and nothing else", () => {
    const tiger = catalog("warden");
    const stug = catalog("ss3");
    const walker = catalog("walker");
    const hauler = catalog("hauler");
    const close = PTRD_CLOSE_TILES * 0.25;
    const far = PTRD_CLOSE_TILES + 12;

    expectChip(tiger, "side", close, PTRD_PEN_MUZZLE, PTRD_DMG_SIDE);
    expectChip(tiger, "rear", close, PTRD_PEN_MUZZLE, PTRD_DMG_REAR);
    expectChip(tiger, "side", PTRD_CLOSE_TILES, PTRD_PEN_CLOSE, PTRD_DMG_SIDE);
    expectChip(stug, "side", close, PTRD_PEN_MUZZLE, PTRD_DMG_SIDE);
    expectChip(stug, "rear", close, PTRD_PEN_MUZZLE, PTRD_DMG_REAR);
    for (const face of ["front", "side", "rear"] as const) {
      const plate = penAt(hauler, face, close, PTRD_PEN_MUZZLE);
      assert.equal(plate.kind, "ricochet", `mauler ${face}`);
      assert.equal(plate.damage, 0, `mauler ${face}`);
    }
    expectChip(walker, "front", far, PTRD_PEN_FAR, PTRD_DMG_LIGHT);
    expectChip(walker, "side", far, PTRD_PEN_FAR, PTRD_DMG_LIGHT);
    expectChip(walker, "rear", far, PTRD_PEN_FAR, PTRD_DMG_LIGHT);
    expectChip(walker, "front", close, PTRD_PEN_MUZZLE, PTRD_DMG_LIGHT);

    for (const plate of [tiger, stug, hauler]) {
      const front = penAt(plate, "front", 0, PTRD_PEN_MUZZLE);
      assert.equal(front.kind, "ricochet", plate.type);
      assert.equal(front.damage, 0);
      const side = penAt(plate, "side", far, PTRD_PEN_FAR);
      assert.equal(side.kind, "ricochet", `${plate.type} side past close`);
      assert.equal(side.damage, 0);
      const rear = penAt(plate, "rear", far, PTRD_PEN_MUZZLE);
      assert.equal(rear.kind, "ricochet", `${plate.type} rear past close`);
    }

    // 45° off the nose, still on the Walker's front plate. 22 mm no longer bites.
    const oblique = resolveAtRifleHit({
      penetration: PTRD_PEN_FAR,
      distTiles: far,
      target: walker,
      targetFacing: 0,
      targetHp: walker.hp,
      targetHpMax: walker.hp,
      vx: -Math.cos(Math.PI / 4),
      vy: -Math.sin(Math.PI / 4),
      rand: () => 0.5,
    });
    assert.equal(oblique.face, "front");
    assert.equal(oblique.kind, "ricochet");
  });

  it("calls a hit possible only when the round would actually wound", () => {
    const plates = [catalog("warden"), catalog("ss3"), catalog("walker"), catalog("hauler")];
    const dists = [0, PTRD_CLOSE_TILES * 0.5, PTRD_CLOSE_TILES, PTRD_CLOSE_TILES + 6, 70];
    const shots = [
      [-1, 0],
      [1, 0],
      [0, -1],
      [-0.5, 0.5],
    ] as const;
    for (const target of plates) {
      for (const distTiles of dists) {
        for (const [vx, vy] of shots) {
          const penetration = ptrdPenetration(distTiles, 80);
          const possible = ptrdHarmPossible({
            penetration,
            distTiles,
            target,
            targetFacing: 0,
            vx,
            vy,
          });
          const res = resolveAtRifleHit({
            penetration,
            distTiles,
            target,
            targetFacing: 0,
            targetHp: target.hp,
            targetHpMax: target.hp,
            vx,
            vy,
            rand: () => 0.5,
          });
          assert.equal(
            possible,
            res.damage > 0,
            `${target.type} d=${distTiles} v=${vx},${vy} ${res.kind} dmg=${res.damage}`,
          );
        }
      }
    }
  });

  it("throws a track on a penetrating side hit more often than a shell does", () => {
    const { state, a } = match();
    const ts = state.tileSize;
    const tank = makeEntity(state, "warden", a, tileCenter(20, ts), tileCenter(20, ts));
    const cold = makeEntity(state, "warden", a, tileCenter(24, ts), tileCenter(20, ts));
    assert.ok(PTRD_TRACK_CHANCE > CRIT_TRACKS_CHANCE);
    rollCrits(tank, "side", "pen", 11, () => (CRIT_TRACKS_CHANCE + PTRD_TRACK_CHANCE) / 2);
    assert.deepEqual(tank.crits, []);
    rollCrits(tank, "side", "pen", 11, () => (CRIT_TRACKS_CHANCE + PTRD_TRACK_CHANCE) / 2, PTRD_TRACK_CHANCE);
    assert.deepEqual(tank.crits, ["tracks"]);
    rollCrits(cold, "side", "ricochet", 0, () => 0, PTRD_TRACK_CHANCE);
    assert.deepEqual(cold.crits, []);
  });

  it("kills a soldier up close and chips a Tiger's side without breaking the front", () => {
    const { state, a, b } = match();
    const ts = state.tileSize;
    const guy = makeEntity(state, "atinfantry", a, tileCenter(30, ts), tileCenter(30, ts));
    const foe = makeEntity(state, "rifleman", b, tileCenter(33, ts), tileCenter(30, ts));
    foe.cooldown = 99;
    guy.facing = 0;
    guy.holdPosition = true;
    assert.equal(applyCommand(state, a, { type: "cmd.attack", ids: [guy.id], targetId: foe.id }).ok, true);
    const armed = guy.clip;
    let steps = 0;
    while (foe.hp > 0 && steps < 30) {
      ticks(state, 1);
      steps++;
    }
    assert.equal(foe.hp, 0);
    assert.ok(guy.clip < armed);

    const tiger = makeEntity(state, "warden", b, tileCenter(30, ts), tileCenter(36, ts));
    tiger.cooldown = 99;
    tiger.mgAmmo = 0;
    tiger.facing = 0;
    tiger.holdPosition = true;
    guy.clip = PTRD.clip;
    guy.cooldown = 0;
    guy.holdPosition = true;
    const before = tiger.hp;
    assert.equal(applyCommand(state, a, { type: "cmd.attack", ids: [guy.id], targetId: tiger.id }).ok, true);
    steps = 0;
    while (tiger.hp === before && steps < 40) {
      ticks(state, 1);
      steps++;
    }
    assert.ok(tiger.hp < before, "close side shot pens");
    assert.ok(tiger.hp > before - before * 0.2, "a 14.5 mm hole is not a shell");
    assert.equal(tiger.wreck, false);

    const front = makeEntity(state, "warden", b, tileCenter(34, ts), tileCenter(30, ts));
    front.cooldown = 99;
    front.mgAmmo = 0;
    front.facing = Math.PI;
    front.holdPosition = true;
    guy.clip = PTRD.clip;
    guy.cooldown = 0;
    guy.x = tileCenter(30, ts);
    guy.y = tileCenter(30, ts);
    guy.facing = 0;
    const frontHp = front.hp;
    const clip = guy.clip;
    assert.equal(applyCommand(state, a, { type: "cmd.attack", ids: [guy.id], targetId: front.id }).ok, true);
    steps = 0;
    while (guy.clip === clip && steps < 40) {
      ticks(state, 1);
      steps++;
    }
    assert.ok(guy.clip < clip);
    assert.equal(front.hp, frontHp);
    assert.ok(state.impacts.some((i) => i.kind === "ricochet"));
  });

  it("still punches a Walker past close range and sparks on a Tiger's side out there", () => {
    const { state, a, b } = match();
    const ts = state.tileSize;
    const gap = PTRD_CLOSE_TILES + 10;
    const guy = makeEntity(state, "atinfantry", a, tileCenter(10, ts), tileCenter(20, ts));
    const walker = makeEntity(state, "walker", b, tileCenter(10, ts), tileCenter(20 + gap, ts));
    walker.cooldown = 99;
    walker.holdPosition = true;
    guy.facing = Math.PI / 2;
    guy.holdPosition = true;
    const walkerHp = walker.hp;
    assert.equal(applyCommand(state, a, { type: "cmd.attack", ids: [guy.id], targetId: walker.id }).ok, true);
    let steps = 0;
    while (walker.hp === walkerHp && steps < 50) {
      ticks(state, 1);
      steps++;
    }
    assert.ok(walker.hp < walkerHp);
    assert.ok(walker.hp > 0);

    const tiger = makeEntity(state, "warden", b, tileCenter(10 + gap, ts), tileCenter(20, ts));
    tiger.cooldown = 99;
    tiger.mgAmmo = 0;
    tiger.facing = Math.PI / 2;
    tiger.holdPosition = true;
    guy.cooldown = 0;
    guy.clip = PTRD.clip;
    guy.facing = 0;
    const tigerHp = tiger.hp;
    const clip = guy.clip;
    assert.equal(applyCommand(state, a, { type: "cmd.attack", ids: [guy.id], targetId: tiger.id }).ok, true);
    steps = 0;
    while (guy.clip === clip && steps < 50) {
      ticks(state, 1);
      steps++;
    }
    assert.ok(guy.clip < clip);
    assert.equal(tiger.hp, tigerHp);
    assert.ok(state.impacts.some((i) => i.kind === "ricochet"));
  });

  it("cannot fire with a broken arm", () => {
    const { state, a, b } = match();
    const ts = state.tileSize;
    const guy = makeEntity(state, "atinfantry", a, tileCenter(50, ts), tileCenter(50, ts));
    const foe = makeEntity(state, "rifleman", b, tileCenter(52, ts), tileCenter(50, ts));
    addCrit(guy, "arm");
    const before = guy.clip;
    assert.equal(applyCommand(state, a, { type: "cmd.attack", ids: [guy.id], targetId: foe.id }).ok, true);
    ticks(state, 5);
    assert.equal(guy.clip, before);
    assert.equal(foe.hp, foe.hpMax);
  });
});
