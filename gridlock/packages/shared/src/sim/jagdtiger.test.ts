import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  JAGDTIGER_RANGE_TILES,
  JAGDTIGER_SHELLS,
  SCOPED_RANGE_TILES,
  SHELLS,
  STUG_SHELLS,
  TECH_REQUIRES,
  TICK_DT,
  TIGER_RANGE_TILES,
  TRAIN_TYPES,
  carriesShell,
  catalog,
  gunArcDegOf,
  hasMg,
  hasScout,
  hasTurret,
  isCivilianType,
  shellsFor,
} from "../catalog.js";
import { TILE_BLOCKED, TILE_EMPTY, TILE_TREE } from "../maps.js";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import { resolveHit } from "./ballistics.js";
import { applyCommand } from "./commands.js";
import { destroyEntity, makeEntity, tileCenter } from "./geo.js";
import { createMatch, step } from "./match.js";
import { producerType } from "./train.js";
import type { MatchState } from "./types.js";

function twoPlayerMatch(): MatchState {
  const r = createRoom({ id: "JT1", hostId: "A", hostName: "Alpha", mapId: "yard-64", maxSlots: 8 });
  if (!r.ok) throw new Error(r.message);
  const room = r.value;
  assert.equal(joinRoom(room, "B", "Bravo").ok, true);
  updateSelf(room, "A", { ready: true, spawnId: 1 });
  updateSelf(room, "B", { ready: true, spawnId: 4 });
  const started = startMatch(room, "A", () => 0);
  if (!started.ok) throw new Error(started.message);
  const state = createMatch(room, started.value);
  state.heights.fill(0);
  state.occupy.fill(0);
  for (let i = 0; i < state.terrain.length; i++) {
    const t = state.terrain[i];
    if (t === TILE_TREE || t === TILE_BLOCKED) state.terrain[i] = TILE_EMPTY;
  }
  for (const e of [...state.entities.values()]) if (isCivilianType(e.type)) destroyEntity(state, e);
  return state;
}

function seq(values: number[]): () => number {
  let i = 0;
  return () => values[i++] ?? 0.5;
}

const jt = catalog("jagdtiger");
const tiger = catalog("warden");

describe("jagdtiger catalog", () => {
  it("is a casemate tank destroyer trained at the Armory behind Research", () => {
    assert.equal(jt.name, "Breaker");
    assert.ok(TRAIN_TYPES.includes("jagdtiger"));
    assert.equal(producerType("jagdtiger"), "armory");
    assert.equal(TECH_REQUIRES.jagdtiger, "research");
    assert.equal(hasTurret("jagdtiger"), false);
    assert.equal(jt.turretTurnDegPerSec, undefined);
    assert.equal(gunArcDegOf("jagdtiger"), 10);
    assert.equal(jt.turnInPlace, true);
    assert.equal(jt.tracked, true);
    assert.equal(hasMg("jagdtiger"), true);
    assert.equal(hasScout("jagdtiger"), true);
    assert.equal(jt.leavesWreck, true);
    assert.ok((jt.blurb ?? "").length > 24);
  });

  it("is heavier and slower than the Warden, with the thickest front on the field", () => {
    assert.ok(jt.cost > tiger.cost);
    assert.ok(jt.hp > tiger.hp);
    assert.ok(jt.armorFront > tiger.armorFront);
    assert.ok(jt.armorSide > tiger.armorSide);
    assert.ok(jt.armorRear < jt.armorSide);
    assert.ok(jt.moveTilesPerSec < tiger.moveTilesPerSec);
    assert.ok(jt.turnDegPerSec < catalog("ss3").turnDegPerSec);
    assert.ok(jt.cooldown > tiger.cooldown);
    for (const other of ["warden", "apocalypse", "ss3", "titan", "mammoth"] as const) {
      assert.ok(jt.armorFront > catalog(other).armorFront, other);
    }
  });

  it("outranges every other tank gun and the scope, past its own eyes", () => {
    assert.equal(jt.rangeTiles, JAGDTIGER_RANGE_TILES);
    assert.ok(JAGDTIGER_RANGE_TILES > TIGER_RANGE_TILES);
    assert.ok(JAGDTIGER_RANGE_TILES > SCOPED_RANGE_TILES);
    assert.ok(jt.rangeTiles > jt.sightTiles);
  });

  it("carries 128mm AP and HE only, AP deeper than any other rack", () => {
    assert.equal(shellsFor("jagdtiger"), JAGDTIGER_SHELLS);
    assert.equal(jt.defaultShell, "ap");
    assert.equal(carriesShell("jagdtiger", "ap"), true);
    assert.equal(carriesShell("jagdtiger", "he"), true);
    assert.equal(carriesShell("jagdtiger", "heat"), false);
    assert.equal(carriesShell("jagdtiger", "smoke"), false);
    assert.equal(jt.penetration, JAGDTIGER_SHELLS.ap.penetration);
    assert.equal(jt.caliber, 128);
    assert.ok(JAGDTIGER_SHELLS.ap.penetration > SHELLS.heat.penetration);
    assert.ok(JAGDTIGER_SHELLS.ap.penetration > STUG_SHELLS.heat.penetration);
    assert.ok(JAGDTIGER_SHELLS.ap.damage > SHELLS.ap.damage);
    assert.ok(JAGDTIGER_SHELLS.he.damage > JAGDTIGER_SHELLS.ap.damage);
  });
});

describe("jagdtiger ballistics", () => {
  const gun = { damage: jt.damage, penetration: jt.penetration, caliber: jt.caliber, spreadDeg: jt.spreadDeg };

  it("kills a Warden with one AP hit to the front plate", () => {
    // Warden faces +x; the shell flies -x into its nose.
    const res = resolveHit({ gun, target: tiger, targetFacing: 0, targetHp: tiger.hp, targetHpMax: tiger.hp, vx: -1, vy: 0, rand: seq([0.5]) });
    assert.equal(res.face, "front");
    assert.equal(res.kind, "kill");
  });

  it("goes through the Apocalypse front plate for a heavy wound", () => {
    const apo = catalog("apocalypse");
    const res = resolveHit({ gun, target: apo, targetFacing: 0, targetHp: apo.hp, targetHpMax: apo.hp, vx: -1, vy: 0, rand: seq([0.5, 0.5]) });
    assert.equal(res.face, "front");
    assert.ok(res.damage >= jt.damage, `damage=${res.damage} kind=${res.kind}`);
  });

  it("shrugs a Warden AP round off the front plate but not off the rear", () => {
    const tigerGun = { damage: SHELLS.ap.damage, penetration: SHELLS.ap.penetration, caliber: SHELLS.ap.caliber, spreadDeg: SHELLS.ap.spreadDeg };
    const front = resolveHit({ gun: tigerGun, target: jt, targetFacing: 0, targetHp: jt.hp, targetHpMax: jt.hp, vx: -1, vy: 0, rand: seq([0.5, 0.5, 0.5]) });
    assert.equal(front.face, "front");
    assert.ok(front.damage <= 2, `front damage=${front.damage} kind=${front.kind}`);
    const rear = resolveHit({ gun: tigerGun, target: jt, targetFacing: 0, targetHp: jt.hp, targetHpMax: jt.hp, vx: 1, vy: 0, rand: seq([0.5, 0.5, 0.5]) });
    assert.equal(rear.face, "rear");
    assert.ok(rear.damage > 20, `rear damage=${rear.damage} kind=${rear.kind}`);
  });
});

describe("jagdtiger casemate", () => {
  it("cannot swing the gun: it turns the whole hull onto a target off the arc before it fires", () => {
    const state = twoPlayerMatch();
    const ts = state.tileSize;
    const gun = makeEntity(state, "jagdtiger", "A", tileCenter(24, ts), tileCenter(24, ts));
    const tgt = makeEntity(state, "warden", "B", tileCenter(30, ts), tileCenter(24, ts));
    tgt.holdPosition = true;
    tgt.cooldown = 99;
    gun.facing = Math.PI / 2;
    gun.turretFacing = Math.PI / 2;
    gun.holdPosition = true;
    applyCommand(state, "A", { type: "cmd.attack", ids: [gun.id], targetId: tgt.id });
    step(state, TICK_DT);
    assert.equal(state.projectiles.filter((p) => p.fromId === gun.id).length, 0, "fired while facing away");
    assert.ok(Math.abs(gun.facing - Math.PI / 2) > 0.01, "hull should start turning");
    let fired = false;
    for (let i = 0; i < 80 && !fired; i++) {
      step(state, TICK_DT);
      assert.equal(gun.turretFacing, gun.facing, "gun left the hull");
      const rounds = [...state.projectiles, ...state.impacts].filter((p) => p.fromId === gun.id);
      if (rounds.length > 0) fired = true;
    }
    assert.equal(fired, true, "should fire once the hull faces the target");
    assert.ok(Math.abs(gun.facing) < 0.2, `facing=${gun.facing}`);
  });
});
