import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MG42,
  MG42_BELT,
  MG42_BIPOD_SECONDS,
  MG42_RPM,
  TICK_DT,
  addCrit,
  catalog,
  infantryGunFor,
  infantryLoadout,
  isInfantryType,
} from "../catalog.js";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import { applyCommand } from "./commands.js";
import { destroyEntity, makeEntity, tileCenter } from "./geo.js";
import { createMatch, step } from "./match.js";
import type { MatchState } from "./types.js";

function match(): { state: MatchState; a: string; b: string } {
  const r = createRoom({
    id: "GN",
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
  for (let i = 0; i < n; i++) step(state, TICK_DT);
}

describe("MG42", () => {
  it("names the rifle infantry Rifleman and keeps the gunner on the MG42 only", () => {
    assert.equal(catalog("rifleman").name, "Rifleman");
    assert.equal(catalog("gunner").name, "Gunner");
    assert.equal(isInfantryType("gunner"), true);
    assert.equal(isInfantryType("warden"), false);
    assert.deepEqual(
      infantryLoadout("gunner").map((g) => g.id),
      ["mg42"],
    );
    assert.equal(infantryGunFor({ type: "gunner" })?.id, "mg42");
    assert.equal(infantryGunFor({ type: "gunner", crits: ["arm"] }), null);
  });

  it("fires 1,200 rounds a minute from a 50-round belt", () => {
    assert.equal(MG42_RPM, 1200);
    assert.equal(MG42_BELT, 50);
    assert.equal(MG42.clip, 50);
    assert.equal(MG42.reload, 6);
    assert.equal(MG42.shotsPerTick, 2);
    assert.equal(MG42.cooldown, TICK_DT);
    assert.equal((MG42.shotsPerTick ?? 1) / TICK_DT * 60, MG42_RPM);
  });

  it("will not shoot until it has crawled and the bipod is set", () => {
    const { state, a, b } = match();
    const ts = state.tileSize;
    const gun = makeEntity(state, "gunner", a, tileCenter(20, ts), tileCenter(20, ts));
    const foe = makeEntity(state, "rifleman", b, tileCenter(22, ts), tileCenter(20, ts));
    assert.equal(applyCommand(state, a, { type: "cmd.attack", ids: [gun.id], targetId: foe.id }).ok, true);
    let steps = 0;
    while (gun.clip === MG42.clip && steps < 40) {
      ticks(state, 1);
      steps++;
    }
    assert.equal(gun.stance, "crawl");
    assert.ok(gun.bipod >= MG42_BIPOD_SECONDS);
    assert.equal(gun.clip, MG42.clip - 2);
    assert.ok(steps >= 14 && steps <= 16, `bipod set in ${steps} ticks`);
  });

  it("dumps the belt two rounds a tick, then reloads", () => {
    const { state, a, b } = match();
    const ts = state.tileSize;
    const gun = makeEntity(state, "gunner", a, tileCenter(30, ts), tileCenter(30, ts));
    const foe = makeEntity(state, "rifleman", b, tileCenter(32, ts), tileCenter(30, ts));
    gun.stance = "crawl";
    gun.stanceOrder = "crawl";
    gun.bipod = MG42_BIPOD_SECONDS;
    gun.clip = 2;
    foe.cooldown = 99;
    assert.equal(applyCommand(state, a, { type: "cmd.attack", ids: [gun.id], targetId: foe.id }).ok, true);
    ticks(state, 1);
    const spent = Number(gun.clip);
    assert.equal(spent, 0);
    assert.ok(gun.reload > 0);
    assert.ok(foe.hp < foe.hpMax);
    destroyEntity(state, foe);
    gun.crits = [];
    gun.order = null;
    gun.attackTarget = null;
    let refilled = false;
    for (let i = 0; i < 80 && !refilled; i++) {
      ticks(state, 1);
      refilled = gun.clip === MG42.clip && gun.reload === 0;
    }
    const clip = gun.clip as number;
    assert.equal(clip, MG42.clip, `clip=${clip} reload=${gun.reload} hp=${gun.hp} tgt=${gun.attackTarget}`);
    assert.equal(gun.reload, 0);
  });

  it("drops the bipod when he stands, and a broken arm cannot serve the gun", () => {
    const { state, a, b } = match();
    const ts = state.tileSize;
    const gun = makeEntity(state, "gunner", a, tileCenter(40, ts), tileCenter(40, ts));
    const foe = makeEntity(state, "rifleman", b, tileCenter(70, ts), tileCenter(70, ts));
    gun.stance = "crawl";
    gun.stanceOrder = "crawl";
    gun.bipod = MG42_BIPOD_SECONDS;
    assert.equal(applyCommand(state, a, { type: "cmd.stance", ids: [gun.id], stance: "stand" }).ok, true);
    assert.equal(gun.stance, "stand");
    assert.equal(gun.bipod, 0);
    foe.x = tileCenter(42, ts);
    foe.y = tileCenter(40, ts);
    gun.stance = "crawl";
    gun.stanceOrder = "crawl";
    gun.bipod = MG42_BIPOD_SECONDS;
    addCrit(gun, "arm");
    const before = gun.clip;
    assert.equal(applyCommand(state, a, { type: "cmd.attack", ids: [gun.id], targetId: foe.id }).ok, true);
    ticks(state, 3);
    assert.equal(gun.clip, before);
    assert.equal(gun.weapon, "mg42");
  });
});
