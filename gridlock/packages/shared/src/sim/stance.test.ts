import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CRIT_LEG_SPEED,
  HANDGUN,
  STANCE_AIM_SPREAD,
  STANCE_HIT_RADIUS,
  STANCE_SPEED,
  STANCE_TARGET_SPREAD,
  addCrit,
  catalog,
} from "../catalog.js";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import { applyCommand } from "./commands.js";
import { fireStats, moveSpeedMul } from "./crits.js";
import { makeEntity, tileCenter } from "./geo.js";
import { createMatch, step } from "./match.js";
import { snapshotFor } from "./snapshot.js";
import { stanceHitRadiusMul, stanceTargetSpreadMul, tickStance } from "./stance.js";
import type { MatchState } from "./types.js";

function twoPlayerMatch(): { state: MatchState; a: string; b: string } {
  const r = createRoom({
    id: "ST",
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

describe("stance knobs", () => {
  it("makes crawl the strongest posture and crouch the middle", () => {
    assert.ok(STANCE_SPEED.crawl < STANCE_SPEED.crouch);
    assert.ok(STANCE_SPEED.crouch < STANCE_SPEED.stand);
    assert.ok(STANCE_AIM_SPREAD.crawl < STANCE_AIM_SPREAD.crouch);
    assert.ok(STANCE_AIM_SPREAD.crouch < STANCE_AIM_SPREAD.stand);
    assert.ok(STANCE_TARGET_SPREAD.crawl > STANCE_TARGET_SPREAD.crouch);
    assert.ok(STANCE_TARGET_SPREAD.crouch > STANCE_TARGET_SPREAD.stand);
    assert.ok(STANCE_HIT_RADIUS.crawl < STANCE_HIT_RADIUS.crouch);
    assert.ok(STANCE_HIT_RADIUS.crouch < STANCE_HIT_RADIUS.stand);
    assert.equal(CRIT_LEG_SPEED, STANCE_SPEED.crawl);
  });
});

describe("stance commands", () => {
  it("crouches and crawls on order", () => {
    const { state, a } = twoPlayerMatch();
    const t = makeEntity(state, "rifleman", a, 100, 100);
    const crouch = applyCommand(state, a, { type: "cmd.stance", ids: [t.id], stance: "crouch" });
    assert.equal(crouch.ok, true, !crouch.ok ? crouch.message : "");
    assert.equal(t.stanceOrder, "crouch");
    assert.equal(t.stance, "crouch");
    const crawl = applyCommand(state, a, { type: "cmd.stance", ids: [t.id], stance: "crawl" });
    assert.equal(crawl.ok, true);
    assert.equal(t.stance, "crawl");
    const stand = applyCommand(state, a, { type: "cmd.stance", ids: [t.id], stance: "stand" });
    assert.equal(stand.ok, true);
    assert.equal(t.stance, "stand");
  });

  it("rejects stand and crouch when a leg is broken", () => {
    const { state, a } = twoPlayerMatch();
    const t = makeEntity(state, "rifleman", a, 100, 100);
    addCrit(t, "leg");
    const stand = applyCommand(state, a, { type: "cmd.stance", ids: [t.id], stance: "stand" });
    assert.equal(stand.ok, false);
    if (!stand.ok) assert.match(stand.message, /crawl/i);
    const crouch = applyCommand(state, a, { type: "cmd.stance", ids: [t.id], stance: "crouch" });
    assert.equal(crouch.ok, false);
    const crawl = applyCommand(state, a, { type: "cmd.stance", ids: [t.id], stance: "crawl" });
    assert.equal(crawl.ok, true);
    assert.equal(t.stance, "crawl");
    assert.equal(t.stanceOrder, "crawl");
  });

  it("ignores stance orders on vehicles", () => {
    const { state, a } = twoPlayerMatch();
    const tank = makeEntity(state, "warden", a, 100, 100);
    const res = applyCommand(state, a, { type: "cmd.stance", ids: [tank.id], stance: "crouch" });
    assert.equal(res.ok, false);
  });
});

describe("auto-prone", () => {
  it("drops a targeted trooper to crawl and stands them back up after", () => {
    const { state, a, b } = twoPlayerMatch();
    state.heights.fill(0);
    const inf = makeEntity(state, "rifleman", a, tileCenter(20, state.tileSize), tileCenter(20, state.tileSize));
    const tank = makeEntity(state, "warden", b, tileCenter(24, state.tileSize), tileCenter(20, state.tileSize));
    applyCommand(state, a, { type: "cmd.stance", ids: [inf.id], stance: "crouch" });
    assert.equal(inf.stance, "crouch");
    applyCommand(state, b, { type: "cmd.attack", ids: [tank.id], targetId: inf.id });
    tickStance(state);
    assert.equal(inf.stance, "crawl");
    assert.equal(inf.stanceOrder, "crouch");
    applyCommand(state, b, { type: "cmd.stop", ids: [tank.id] });
    tickStance(state);
    assert.equal(inf.stance, "crouch");
  });

  it("keeps a broken-leg trooper crawling even when nobody is aiming", () => {
    const { state, a } = twoPlayerMatch();
    const t = makeEntity(state, "rifleman", a, 100, 100);
    t.stanceOrder = "stand";
    addCrit(t, "leg");
    tickStance(state);
    assert.equal(t.stance, "crawl");
    assert.equal(t.stanceOrder, "crawl");
  });
});

describe("stance combat effects", () => {
  it("tightens aim and shrinks the hitbox as the posture drops", () => {
    const { state, a } = twoPlayerMatch();
    const t = makeEntity(state, "rifleman", a, 100, 100);
    const standAim = fireStats(t).spreadDeg;
    const standHit = stanceHitRadiusMul(t);
    t.stance = "crouch";
    t.stanceOrder = "crouch";
    const crouchAim = fireStats(t).spreadDeg;
    t.stance = "crawl";
    t.stanceOrder = "crawl";
    const crawlAim = fireStats(t).spreadDeg;
    assert.ok(crouchAim < standAim);
    assert.ok(crawlAim < crouchAim);
    assert.ok(stanceHitRadiusMul(t) < standHit);
    assert.ok(stanceTargetSpreadMul(t) > 1);
    assert.equal(standAim, catalog("rifleman").spreadDeg);
  });

  it("keeps the handgun bonus when a crouched shooter has a broken arm", () => {
    const { state, a } = twoPlayerMatch();
    const t = makeEntity(state, "rifleman", a, 100, 100);
    addCrit(t, "arm");
    t.stance = "crouch";
    t.stanceOrder = "crouch";
    const gun = fireStats(t);
    assert.equal(gun.damage, HANDGUN.damage);
    assert.ok(gun.spreadDeg < HANDGUN.spreadDeg);
  });

  it("slows crouch more than stand and crawl more than crouch", () => {
    const { state, a } = twoPlayerMatch();
    const stand = makeEntity(state, "rifleman", a, 100, 100);
    const crouch = makeEntity(state, "rifleman", a, 140, 100);
    const crawl = makeEntity(state, "rifleman", a, 180, 100);
    crouch.stance = "crouch";
    crouch.stanceOrder = "crouch";
    crawl.stance = "crawl";
    crawl.stanceOrder = "crawl";
    assert.equal(moveSpeedMul(stand), STANCE_SPEED.stand);
    assert.equal(moveSpeedMul(crouch), STANCE_SPEED.crouch);
    assert.equal(moveSpeedMul(crawl), STANCE_SPEED.crawl);
    addCrit(stand, "leg");
    assert.equal(moveSpeedMul(stand), STANCE_SPEED.crawl);
  });

  it("puts posture on a friendly snapshot", () => {
    const { state, a } = twoPlayerMatch();
    const t = makeEntity(state, "rifleman", a, 100, 100);
    t.stance = "crawl";
    t.stanceOrder = "crouch";
    const view = snapshotFor(state, a).entities.find((e) => e.id === t.id);
    assert.equal(view?.stance, "crawl");
    assert.equal(view?.stanceOrder, "crouch");
  });
});

describe("combat drop", () => {
  it("hits the dirt on the same tick someone acquires them", () => {
    const { state, a, b } = twoPlayerMatch();
    state.heights.fill(0);
    const inf = makeEntity(state, "rifleman", a, tileCenter(20, state.tileSize), tileCenter(20, state.tileSize));
    const tank = makeEntity(state, "warden", b, tileCenter(24, state.tileSize), tileCenter(20, state.tileSize));
    tank.facing = Math.PI;
    tank.turretFacing = Math.PI;
    applyCommand(state, b, { type: "cmd.attack", ids: [tank.id], targetId: inf.id });
    step(state);
    assert.equal(inf.stance, "crawl");
  });
});
