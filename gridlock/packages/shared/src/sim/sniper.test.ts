import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  HEIGHT_BASE,
  INFANTRY_SIGHT_TILES,
  RIFLE,
  SCOPED,
  SCOPED_HP_FAR,
  SCOPED_HP_NEAR,
  WEAPON_RANGE_SIGHT_MUL,
  scopedHpFraction,
  addCrit,
  catalog,
  infantryGunFor,
  infantryLoadout,
  isInfantryType,
} from "../catalog.js";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import { applyCommand } from "./commands.js";
import { resolveHit } from "./ballistics.js";
import { rangeTilesOf, sightTilesOf } from "./elevation.js";
import { makeEntity, tileCenter } from "./geo.js";
import { createMatch, step } from "./match.js";
import type { MatchState } from "./types.js";

function match(): { state: MatchState; a: string; b: string } {
  const r = createRoom({
    id: "SN",
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

describe("sniper", () => {
  it("is a muster infantry with a scoped rifle and extra sight", () => {
    const s = catalog("sniper");
    const rifle = catalog("rifleman");
    assert.equal(s.name, "Sniper");
    assert.equal(s.letter, "T");
    assert.equal(isInfantryType("sniper"), true);
    assert.deepEqual(
      infantryLoadout("sniper").map((g) => g.id),
      ["scoped"],
    );
    assert.equal(infantryGunFor({ type: "sniper" })?.id, "scoped");
    assert.equal(infantryGunFor({ type: "sniper", crits: ["arm"] }), null);
    assert.equal(s.sightTiles, INFANTRY_SIGHT_TILES);
    assert.equal(s.sightBonusTiles, INFANTRY_SIGHT_TILES / 3);
    assert.equal(sightTilesOf("sniper", HEIGHT_BASE), s.sightTiles + (s.sightBonusTiles ?? 0));
    assert.equal(s.rangeTiles, sightTilesOf("sniper", HEIGHT_BASE) * WEAPON_RANGE_SIGHT_MUL);
    assert.ok(rangeTilesOf("sniper", HEIGHT_BASE) > rangeTilesOf("rifleman", HEIGHT_BASE));
    assert.equal(SCOPED_HP_NEAR, 1);
    assert.equal(SCOPED_HP_FAR, 0.9);
    assert.equal(scopedHpFraction(0, 100), 1);
    assert.equal(scopedHpFraction(100, 100), 0.9);
    assert.equal(scopedHpFraction(50, 100), 0.95);
    const rifleDef = catalog("rifleman");
    const far = resolveHit({
      gun: { damage: Math.round(rifleDef.hp * SCOPED_HP_FAR), penetration: 8, caliber: 8 },
      target: rifleDef,
      targetFacing: 0,
      targetHp: rifleDef.hp,
      targetHpMax: rifleDef.hp,
      vx: 1,
      vy: 0,
      rand: () => 0.5,
      exact: true,
    });
    assert.equal(far.damage, Math.round(rifleDef.hp * 0.9));
    assert.equal(far.kind, "hit");
    assert.ok(SCOPED.damage > RIFLE.damage);
    assert.equal(SCOPED.cooldown, 4.8);
    assert.equal(catalog("sniper").cooldown, SCOPED.cooldown);
    assert.ok(SCOPED.spreadDeg < RIFLE.spreadDeg);
    assert.ok(s.cost > rifle.cost && s.cost < catalog("gunner").cost);
    const trained = applyCommand(match().state, "A", { type: "cmd.train", unit: "sniper" });
    assert.equal(trained.ok, false);
    if (!trained.ok) assert.equal(trained.message, "Need a Muster.");
  });

  it("engages past a rifleman's reach and hits up close", () => {
    const { state, a, b } = match();
    const ts = state.tileSize;
    const gap = 60;
    const sn = makeEntity(state, "sniper", a, tileCenter(40, ts), tileCenter(80, ts));
    const foe = makeEntity(state, "rifleman", b, tileCenter(40 + gap, ts), tileCenter(80, ts));
    foe.cooldown = 99;
    const dist = Math.hypot(foe.x - sn.x, foe.y - sn.y) / ts;
    assert.ok(dist < rangeTilesOf("sniper", HEIGHT_BASE));
    assert.ok(dist > rangeTilesOf("rifleman", HEIGHT_BASE));
    assert.equal(applyCommand(state, a, { type: "cmd.attack", ids: [sn.id], targetId: foe.id }).ok, true);
    const before = sn.clip;
    let steps = 0;
    while (sn.clip === before && steps < 30) {
      ticks(state, 1);
      steps++;
    }
    assert.equal(sn.clip, SCOPED.clip - 1, "scope reaches");
    assert.equal(foe.clip, RIFLE.clip);

    const near = makeEntity(state, "rifleman", b, tileCenter(42, ts), tileCenter(80, ts));
    near.cooldown = 99;
    sn.clip = SCOPED.clip;
    sn.cooldown = 0;
    assert.equal(applyCommand(state, a, { type: "cmd.attack", ids: [sn.id], targetId: near.id }).ok, true);
    const armed = sn.clip;
    steps = 0;
    while (sn.clip === armed && steps < 20) {
      ticks(state, 1);
      steps++;
    }
    assert.equal(near.hp, 0);
  });

  it("cannot fire with a broken arm", () => {
    const { state, a, b } = match();
    const ts = state.tileSize;
    const sn = makeEntity(state, "sniper", a, tileCenter(50, ts), tileCenter(50, ts));
    const foe = makeEntity(state, "rifleman", b, tileCenter(52, ts), tileCenter(50, ts));
    addCrit(sn, "arm");
    const before = sn.clip;
    assert.equal(applyCommand(state, a, { type: "cmd.attack", ids: [sn.id], targetId: foe.id }).ok, true);
    ticks(state, 5);
    assert.equal(sn.clip, before);
    assert.equal(foe.hp, foe.hpMax);
  });
});
