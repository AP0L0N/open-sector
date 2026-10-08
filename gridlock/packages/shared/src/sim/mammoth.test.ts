import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BUNKER_TYPES,
  MAMMOTH_GARRISON_CAP,
  MAMMOTH_WADE_SPEED,
  TECH_REQUIRES,
  TICK_DT,
  TRAIN_TYPES,
  catalog,
  garrisonCapOf,
  type EntityType,
} from "../catalog.js";
import { TILE_EMPTY, TILE_WATER } from "../maps.js";
import { applyCommand } from "./commands.js";
import { weaponRangeWorld } from "./elevation.js";
import { canGarrison, enterGarrison, livingGarrison, wallsShieldGarrison } from "./garrison.js";
import { moveSpeedMul } from "./crits.js";
import { makeEntity, tileCenter, unitInWater, walkable } from "./geo.js";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import { createMatch, step } from "./match.js";
import { astar } from "./path.js";
import { snapshotFor } from "./snapshot.js";
import { producerType } from "./train.js";
import type { Entity, MatchState } from "./types.js";

function twoPlayerMatch(): { state: MatchState; a: string; b: string } {
  const r = createRoom({ id: "MM1", hostId: "A", hostName: "Alpha", mapId: "yard-64", maxSlots: 8 });
  if (!r.ok) throw new Error(r.message);
  const room = r.value;
  assert.equal(joinRoom(room, "B", "Bravo").ok, true);
  updateSelf(room, "A", { ready: true, spawnId: 1 });
  updateSelf(room, "B", { ready: true, spawnId: 4 });
  const started = startMatch(room, "A", () => 0);
  if (!started.ok) throw new Error(started.message);
  const state = createMatch(room, started.value);
  state.heights.fill(0);
  return { state, a: "A", b: "B" };
}

function clearPad(state: MatchState, x0: number, y0: number, x1: number, y1: number): void {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = y * state.width + x;
      state.terrain[i] = TILE_EMPTY;
      state.blocked[i] = 0;
      state.occupy[i] = 0;
      state.heights[i] = 0;
    }
  }
}

function flood(state: MatchState, x: number, y: number): void {
  const i = y * state.width + x;
  state.terrain[i] = TILE_WATER;
  state.blocked[i] = 1;
}

function ticks(state: MatchState, n: number): void {
  for (let i = 0; i < n; i++) step(state, TICK_DT);
}

function at(state: MatchState, type: EntityType, owner: string, tx: number, ty: number): Entity {
  const ts = state.tileSize;
  return makeEntity(state, type, owner, tileCenter(tx, ts), tileCenter(ty, ts));
}

/** A full load of riflemen already aboard. */
function loaded(state: MatchState, hull: Entity, n = MAMMOTH_GARRISON_CAP): Entity[] {
  const out: Entity[] = [];
  for (let i = 0; i < n; i++) {
    const u = at(state, "rifleman", hull.ownerId, 60, 40);
    assert.equal(enterGarrison(state, u, hull), true);
    out.push(u);
  }
  return out;
}

const Y = 40;

describe("mammoth", () => {
  it("is a slow, heavily armored research unit from the Armory that carries five", () => {
    const def = catalog("mammoth");
    assert.equal(def.kind, "unit");
    assert.ok(TRAIN_TYPES.includes("mammoth"));
    assert.equal(producerType("mammoth"), "armory");
    assert.equal(TECH_REQUIRES.mammoth, "research");
    assert.equal(garrisonCapOf("mammoth"), 5);
    assert.deepEqual(def.garrisonTypes, BUNKER_TYPES);
    assert.equal(def.wades, true);
    assert.ok(def.moveTilesPerSec < catalog("titan").moveTilesPerSec, "slower than the Titan");
    assert.ok(def.armorFront > catalog("warden").armorFront && def.armorSide > catalog("warden").armorSide);
    assert.equal(def.turretTurnDegPerSec, undefined, "a bow gun, no turret");
    assert.ok((def.gunArcDeg ?? 99) <= 30, "the bow MG swings only a little");
    assert.ok(def.caliber < 20, "a small machine gun");
  });

  it("takes the Bunker's infantry, up to five, and refuses the rest", () => {
    const { state, a, b } = twoPlayerMatch();
    clearPad(state, 50, Y - 6, 80, Y + 6);
    const hull = at(state, "mammoth", a, 64, Y);
    loaded(state, hull, MAMMOTH_GARRISON_CAP - 1);
    const mortar = at(state, "mortarman", a, 62, Y);
    assert.match(canGarrison(state, mortar, hull) ?? "", /cannot enter/);
    const gunner = at(state, "gunner", a, 62, Y);
    assert.equal(canGarrison(state, gunner, hull), null);
    enterGarrison(state, gunner, hull);
    const sixth = at(state, "rifleman", a, 62, Y);
    assert.equal(canGarrison(state, sixth, hull), "The Mammoth is full.");
    const enemy = at(state, "rifleman", b, 66, Y);
    assert.equal(canGarrison(state, enemy, hull), "Held by the enemy.");
    const tank = at(state, "warden", a, 62, Y + 2);
    assert.equal(canGarrison(state, tank, hull), "Only infantry can garrison.");
  });

  it("boards on a garrison order, even while the hull drives off", () => {
    const { state, a } = twoPlayerMatch();
    clearPad(state, 40, Y - 6, 90, Y + 6);
    const ts = state.tileSize;
    const hull = at(state, "mammoth", a, 60, Y);
    const rifle = at(state, "rifleman", a, 50, Y);
    assert.equal(applyCommand(state, a, { type: "cmd.garrison", ids: [rifle.id], buildingId: hull.id }).ok, true);
    assert.equal(applyCommand(state, a, { type: "cmd.move", ids: [hull.id], x: tileCenter(75, ts), y: tileCenter(Y, ts) }).ok, true);
    for (let i = 0; i < 600 && rifle.garrisonedIn == null; i++) step(state, TICK_DT);
    assert.equal(rifle.garrisonedIn, hull.id, "caught up and climbed in");
    assert.ok(hull.x > tileCenter(61, ts), "the hull kept driving");
  });

  it("carries its riders along and hides them from the enemy", () => {
    const { state, a, b } = twoPlayerMatch();
    clearPad(state, 40, Y - 6, 90, Y + 6);
    const ts = state.tileSize;
    const hull = at(state, "mammoth", a, 55, Y);
    const riders = loaded(state, hull, 2);
    applyCommand(state, a, { type: "cmd.move", ids: [hull.id], x: tileCenter(70, ts), y: tileCenter(Y, ts) });
    ticks(state, 120);
    assert.ok(hull.x > tileCenter(56, ts), "moved");
    for (const r of riders) {
      assert.equal(r.garrisonedIn, hull.id);
      assert.equal(r.x, hull.x);
      assert.equal(r.y, hull.y);
    }
    const theirs = snapshotFor(state, b).entities.map((e) => e.id);
    for (const r of riders) assert.equal(theirs.includes(r.id), false);
    const ours = snapshotFor(state, a).entities.find((e) => e.id === hull.id);
    assert.equal(ours?.garrison?.count, 2);
    assert.equal(ours?.garrison?.cap, MAMMOTH_GARRISON_CAP);
  });

  it("lets the riders fire out of it, from outside the hull", () => {
    const { state, a, b } = twoPlayerMatch();
    clearPad(state, 50, Y - 6, 80, Y + 6);
    const ts = state.tileSize;
    const hull = at(state, "mammoth", a, 60, Y);
    hull.facing = Math.PI; // nose away, so the bow gun cannot bear
    hull.holdPosition = true;
    const [rider] = loaded(state, hull, 1);
    const foe = at(state, "rifleman", b, 66, Y);
    foe.hp = foe.hpMax = 100000;
    foe.holdPosition = true;
    foe.cooldown = 999;
    let shot = false;
    for (let i = 0; i < 120 && !shot; i++) {
      step(state, TICK_DT);
      const p = state.projectiles.find((q) => q.fromId === rider!.id);
      if (p) {
        shot = true;
        assert.ok(Math.hypot(p.x - hull.x, p.y - hull.y) >= hull.radius, "the round leaves outside the plate");
      }
    }
    assert.ok(shot || foe.hp < foe.hpMax, "the rider fired");
    assert.ok(Math.abs(hull.x - tileCenter(60, ts)) < 1, "held position");
  });

  it("fires the bow MG at infantry in front of it", () => {
    const { state, a, b } = twoPlayerMatch();
    clearPad(state, 50, Y - 6, 80, Y + 6);
    const hull = at(state, "mammoth", a, 60, Y);
    hull.facing = 0;
    hull.holdPosition = true;
    const foe = at(state, "rifleman", b, 65, Y);
    foe.hp = foe.hpMax = 100000;
    foe.cooldown = 999;
    let fired = false;
    for (let i = 0; i < 60 && !fired; i++) {
      step(state, TICK_DT);
      fired = state.projectiles.some((p) => p.fromId === hull.id) || hull.clip < (catalog("mammoth").belt ?? 0);
    }
    assert.ok(fired);
  });

  it("wades through water that stops the Tiger; in it the bow MG falls silent and the riders still fire", () => {
    const { state, a, b } = twoPlayerMatch();
    const ts = state.tileSize;
    // The pond fills the whole corridor, so the only way over is through it.
    clearPad(state, 60, Y - 4, 120, Y + 4);
    for (let gy = Y - 4; gy <= Y + 4; gy++) {
      for (let gx = 80; gx <= 92; gx++) flood(state, gx, gy);
    }
    assert.equal(walkable(state, 86, Y, "mammoth"), true);
    assert.equal(walkable(state, 86, Y, "warden"), false);
    const path = astar(state, 72, Y, 100, Y, "mammoth");
    assert.ok(path.some((p) => state.terrain[p.y * state.width + p.x] === TILE_WATER), "wades straight across");

    const hull = at(state, "mammoth", a, 86, Y);
    hull.facing = 0;
    hull.holdPosition = true;
    const [rider] = loaded(state, hull, 1);
    assert.equal(unitInWater(state, hull), true);
    const foe = at(state, "rifleman", b, 94, Y + 2);
    foe.hp = foe.hpMax = 100000;
    foe.holdPosition = true;
    foe.cooldown = 999;
    const belt = catalog("mammoth").belt ?? 0;
    let riderShot = false;
    for (let i = 0; i < 120; i++) {
      step(state, TICK_DT);
      assert.equal(state.projectiles.some((p) => p.fromId === hull.id), false, "bow MG silent in water");
      assert.equal(hull.clip, belt);
      riderShot ||= state.projectiles.some((p) => p.fromId === rider!.id);
    }
    assert.ok(riderShot || foe.hp < foe.hpMax, "the rider fires from the water");
  });

  it("rolls thirty percent slower while it is wading", () => {
    const { state, a } = twoPlayerMatch();
    const hull = at(state, "mammoth", a, 60, Y);
    assert.equal(moveSpeedMul(hull), 1);
    assert.equal(moveSpeedMul(hull, true), MAMMOTH_WADE_SPEED);
    assert.equal(MAMMOTH_WADE_SPEED, 0.7);
    assert.equal(catalog("mammoth").wadeSpeed, MAMMOTH_WADE_SPEED);
  });

  it("keeps its riders unhurt while the hull takes the hits", () => {
    const { state, a, b } = twoPlayerMatch();
    clearPad(state, 50, Y - 6, 80, Y + 6);
    const hull = at(state, "mammoth", a, 60, Y);
    hull.holdPosition = true;
    hull.cooldown = 999;
    const riders = loaded(state, hull, 3);
    for (const r of riders) r.cooldown = 999;
    assert.equal(wallsShieldGarrison(state, hull), false);
    const tank = at(state, "warden", b, 68, Y);
    tank.holdPosition = true;
    applyCommand(state, b, { type: "cmd.attack", ids: [tank.id], targetId: hull.id });
    const start = hull.hp;
    for (let i = 0; i < 400 && hull.hp >= start; i++) {
      step(state, TICK_DT);
      for (const r of riders) r.cooldown = 999;
    }
    assert.ok(hull.hp < start, "the Tiger got through");
    for (const r of riders) assert.equal(r.hp, r.hpMax, "nothing reaches the men inside");
  });

  it("kills everyone inside when it is destroyed, and leaves no bodies in the open", () => {
    const { state, a } = twoPlayerMatch();
    clearPad(state, 50, Y - 6, 80, Y + 6);
    const hull = at(state, "mammoth", a, 60, Y);
    const riders = loaded(state, hull);
    const bodies = state.bodies.length;
    hull.hp = 0;
    ticks(state, 2);
    assert.equal(hull.wreck, true, "a wreck stays behind");
    for (const r of riders) assert.equal(state.entities.has(r.id), false, "died with the hull");
    assert.equal(livingGarrison(state, hull).length, 0);
    assert.equal(state.bodies.length, bodies);
  });

  it("lets its riders out alive on an ungarrison order", () => {
    const { state, a } = twoPlayerMatch();
    clearPad(state, 50, Y - 6, 80, Y + 6);
    const hull = at(state, "mammoth", a, 60, Y);
    const riders = loaded(state, hull, 3);
    assert.equal(applyCommand(state, a, { type: "cmd.ungarrison", buildingId: hull.id }).ok, true);
    for (const r of riders) {
      assert.equal(r.garrisonedIn, null);
      assert.ok(r.hp > 0);
      assert.ok(Math.hypot(r.x - hull.x, r.y - hull.y) > hull.radius, "stepped off the hull");
    }
    assert.equal(hull.garrison.length, 0);
  });

  it("force-attack on the hull aims every rider who can reach that point", () => {
    const { state, a, b } = twoPlayerMatch();
    clearPad(state, 40, Y - 8, 140, Y + 8);
    const hull = at(state, "mammoth", a, 60, Y);
    hull.facing = Math.PI;
    hull.holdPosition = true;
    const rifles = [0, 1].map(() => {
      const u = at(state, "rifleman", a, 60, Y);
      assert.equal(enterGarrison(state, u, hull), true);
      return u;
    });
    const sniper = at(state, "sniper", a, 60, Y);
    const medic = at(state, "medic", a, 60, Y);
    assert.equal(enterGarrison(state, sniper, hull), true);
    assert.equal(enterGarrison(state, medic, hull), true);
    const rifleRange = weaponRangeWorld(state, rifles[0]!);
    const sniperRange = weaponRangeWorld(state, sniper);
    assert.ok(sniperRange > rifleRange);
    const aimX = hull.x + sniperRange + state.tileSize * 4;
    const aimY = hull.y;
    assert.equal(applyCommand(state, a, { type: "cmd.forceattack", ids: [hull.id], x: aimX, y: aimY }).ok, true);
    assert.equal(hull.order?.kind, "forceattack");
    for (const r of rifles) {
      const before = r.order;
      assert.equal(before, null, "a rifle cannot reach yet");
    }
    const sniperBefore = sniper.order;
    assert.equal(sniperBefore, null);
    const medicBefore = medic.order;
    assert.equal(medicBefore, null);

    hull.x = aimX - rifleRange * 0.5;
    hull.waypoints = [];
    step(state, TICK_DT);
    for (const r of rifles) {
      assert.equal(r.order?.kind, "forceattack");
      assert.equal(r.order?.relay, true);
      assert.equal(r.garrisonedIn, hull.id);
    }
    assert.equal(sniper.order?.kind, "forceattack");
    const medicOrder = medic.order;
    assert.equal(medicOrder, null, "a medic has no gun");
    // A ground force-attack is fused to the click, so the round lands in this same tick.
    assert.ok(
      state.impacts.some((p) => p.fromId === rifles[0]!.id),
      "the rifle fires from the hull",
    );
    assert.equal(Math.abs(hull.x - (aimX - rifleRange * 0.5)) < 1, true, "held still");

    assert.equal(applyCommand(state, a, { type: "cmd.stop", ids: [hull.id] }).ok, true);
    for (const r of [...rifles, sniper]) assert.equal(r.order, null);
    assert.equal(applyCommand(state, b, { type: "cmd.forceattack", ids: [hull.id], x: aimX, y: aimY }).ok, false);
    assert.equal(rifles[0]!.order, null);
  });
});
