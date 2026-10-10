import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRoom, hostSlot, joinRoom, startMatch, updateSelf } from "../lobby.js";
import {
  BLOOM_TYPES,
  MATRIARCH_BROOD,
  MATRIARCH_LAY_SECONDS,
  BUILDING_TYPES,
  FACTIONS,
  HQ_OF,
  REGROWTH_DELAY_SECONDS,
  TICK_DT,
  TRAIN_TYPES,
  catalog,
  dockOf,
  airfieldOf,
  endlessAmmo,
  factionDamage,
  factionOf,
  isAircraftType,
  isBrood,
  isDefenceStructure,
  isInfantryType,
  isNavalType,
  isRadarStation,
  isCyborg,
  noStance,
  powerPlantOf,
  smelterOf,
  stanceOf,
  type Faction,
} from "../catalog.js";
import { applyCommand } from "./commands.js";
import { rollCrits } from "./crits.js";
import { hasCore, hqOf, makeEntity, tileCenter } from "./geo.js";
import { createMatch, step, stepMatch } from "./match.js";
import { BLOOM_BEASTS, BLOOM_BROOD, tickAi } from "./ai.js";
import { lay, tickMatriarchs } from "./matriarch.js";
import { tickRegrowth } from "./regrowth.js";
import { producerType } from "./train.js";
import type { MatchState } from "./types.js";

/** A is Alliance, B fields `bFaction`. */
function match(bFaction: Faction = "bloom"): MatchState {
  const r = createRoom({ id: "BL1", hostId: "A", hostName: "Alpha", mapId: "yard-64", maxSlots: 8 });
  if (!r.ok) throw new Error(r.message);
  const room = r.value;
  assert.equal(joinRoom(room, "B", "Bravo").ok, true);
  updateSelf(room, "A", { ready: true, spawnId: 1 });
  updateSelf(room, "B", { ready: true, spawnId: 4, faction: bFaction });
  const started = startMatch(room, "A", () => 0);
  if (!started.ok) throw new Error(started.message);
  return createMatch(room, started.value);
}

function unpack(state: MatchState, pid: string): void {
  const rig = hqOf(state, pid)!;
  applyCommand(state, pid, { type: "cmd.deploy", id: rig.id });
  for (let i = 0; i < 60; i++) {
    step(state, TICK_DT);
    if (hasCore(state, pid)) return;
  }
  throw new Error("never unpacked");
}

const BLOOM_TRAIN = TRAIN_TYPES.filter((t) => factionOf(t) === "bloom");
const BLOOM_BUILD = BUILDING_TYPES.filter((b) => factionOf(b) === "bloom");

describe("the Bloom in the catalog", () => {
  it("is the third faction, with its own base roles", () => {
    assert.deepEqual([...FACTIONS], ["alliance", "xeno", "bloom"]);
    assert.deepEqual(HQ_OF.bloom, { rig: "sporepod", core: "broodheart" });
    assert.equal(smelterOf("bloom"), "gorger");
    assert.equal(powerPlantOf("bloom"), "lumenbulb");
    assert.equal(dockOf("bloom"), "tidewomb");
    assert.equal(airfieldOf("bloom"), "roost");
    assert.ok(isRadarStation("braincoral"));
    assert.ok(catalog("lumenbulb").power > 0);
    assert.equal(catalog("tidewomb").onWater, true);
    assert.equal(catalog("roost").tileW, catalog("airfield").tileW);
    assert.equal(catalog("gorger").tileW, catalog("smelter").tileW);
    for (const t of BLOOM_TYPES) assert.equal(factionOf(t), "bloom", t);
    // Nothing of another faction leaks in.
    for (const t of ["rig", "core", "seed", "hivecore", "rifleman", "cyborg"]) assert.notEqual(factionOf(t), "bloom", t);
  });

  it("fields at least five of every kind, melee and ranged among them", () => {
    const brood = BLOOM_TRAIN.filter((t) => isInfantryType(t));
    const air = BLOOM_TRAIN.filter((t) => isAircraftType(t));
    const sea = BLOOM_TRAIN.filter((t) => isNavalType(t));
    const beasts = BLOOM_TRAIN.filter((t) => !isInfantryType(t) && !isAircraftType(t) && !isNavalType(t));
    const defences = BLOOM_BUILD.filter((b) => isDefenceStructure(b));
    const structures = BLOOM_BUILD.filter((b) => !isDefenceStructure(b));
    for (const [kind, list] of Object.entries({ brood, air, sea, beasts, defences, structures })) {
      assert.ok(list.length >= 5, `${kind}: ${list.join(", ")}`);
    }
    assert.ok(catalog("spawnling").rangeTiles < catalog("gobber").rangeTiles, "a melee brood and a ranged one");
    assert.equal(catalog("goretusk").bite, true, "a melee beast");
    assert.equal(catalog("driftjelly").bite, true, "a melee swimmer");
  });

  it("hatches brood at the Brood Nest, grows beasts at the Gestator, ships and flyers at its own yards", () => {
    for (const t of BLOOM_TRAIN) {
      const want = isInfantryType(t) ? "broodnest" : isNavalType(t) ? "tidewomb" : isAircraftType(t) ? "roost" : "gestator";
      assert.equal(producerType(t), want, t);
    }
  });

  it("never runs dry, hits full weight, and its brood are no cyborgs", () => {
    for (const t of BLOOM_TRAIN) {
      assert.ok(endlessAmmo(t), t);
      assert.equal(factionDamage(t, 40), 40, t);
    }
    for (const t of BLOOM_TRAIN.filter((u) => isInfantryType(u))) {
      assert.ok(isBrood(t) && noStance(t) && !isCyborg(t), t);
    }
  });
});

describe("a Bloom seat", () => {
  it("starts with a Spore Pod that bursts into a Brood Heart", () => {
    const state = match();
    assert.equal(hqOf(state, "B")!.type, "sporepod");
    unpack(state, "B");
    assert.equal(hqOf(state, "B")!.type, "broodheart");
  });

  it("grows only Bloom structures, and Alliance cannot grow them", () => {
    const state = match();
    unpack(state, "A");
    unpack(state, "B");
    state.players.get("A")!.scrap = 50_000;
    state.players.get("B")!.scrap = 50_000;
    const b = applyCommand(state, "B", { type: "cmd.build", building: "dynamo" });
    assert.equal(b.ok, false);
    const a = applyCommand(state, "A", { type: "cmd.build", building: "lumenbulb" });
    assert.equal(a.ok, false);
    assert.equal(applyCommand(state, "B", { type: "cmd.build", building: "lumenbulb" }).ok, true);
  });

  it("hatches a Spawnling at a Brood Nest", () => {
    const state = match();
    unpack(state, "B");
    state.players.get("B")!.scrap = 50_000;
    const ts = state.tileSize;
    makeEntity(state, "lumenbulb", "B", tileCenter(40, ts), tileCenter(36, ts), { tileX: 40, tileY: 36 });
    makeEntity(state, "broodnest", "B", tileCenter(40, ts), tileCenter(40, ts), { tileX: 40, tileY: 40 });
    assert.equal(applyCommand(state, "B", { type: "cmd.train", unit: "spawnling" }).ok, true);
    for (let i = 0; i < 200; i++) step(state, TICK_DT);
    assert.ok([...state.entities.values()].some((e) => e.ownerId === "B" && e.type === "spawnling"));
  });
});

describe("regrowth", () => {
  it("closes a Bloom wound once it has been out of the fire a while, and a new hit restarts the clock", () => {
    const state = match();
    const ts = state.tileSize;
    const s = makeEntity(state, "gobber", "B", tileCenter(30, ts), tileCenter(30, ts));
    const r = makeEntity(state, "rifleman", "A", tileCenter(10, ts), tileCenter(10, ts));
    tickRegrowth(state, TICK_DT);
    s.hp = s.hpMax / 2;
    r.hp = r.hpMax / 2;
    const ticks = Math.round(REGROWTH_DELAY_SECONDS / TICK_DT) - 2;
    for (let i = 0; i < ticks; i++) tickRegrowth(state, TICK_DT);
    assert.equal(s.hp, s.hpMax / 2, "nothing before the delay");
    for (let i = 0; i < 20; i++) tickRegrowth(state, TICK_DT);
    assert.ok(s.hp > s.hpMax / 2, "it regrows after the delay");
    const healed = s.hp;
    s.hp -= 5;
    for (let i = 0; i < 20; i++) tickRegrowth(state, TICK_DT);
    assert.equal(s.hp, healed - 5, "a new hit restarts the clock");
    assert.equal(r.hp, r.hpMax / 2, "Alliance flesh does not regrow");
    for (let i = 0; i < 2000; i++) tickRegrowth(state, TICK_DT);
    assert.equal(s.hp, s.hpMax, "never past whole");
  });

  it("regrows Bloom structures too", () => {
    const state = match();
    const ts = state.tileSize;
    const b = makeEntity(state, "husk", "B", tileCenter(30, ts), tileCenter(30, ts), { tileX: 30, tileY: 30 });
    tickRegrowth(state, TICK_DT);
    b.hp = b.hpMax / 2;
    for (let i = 0; i < Math.round((REGROWTH_DELAY_SECONDS + 2) / TICK_DT); i++) tickRegrowth(state, TICK_DT);
    assert.ok(b.hp > b.hpMax / 2);
  });
});

describe("the Matriarch", () => {
  it(`lays a Spawnling every ${MATRIARCH_LAY_SECONDS} seconds, up to ${MATRIARCH_BROOD} of her own`, () => {
    const state = match();
    const ts = state.tileSize;
    const m = makeEntity(state, "matriarch", "B", tileCenter(32, ts), tileCenter(32, ts));
    const mine = () => [...state.entities.values()].filter((e) => e.type === "spawnling" && e.matriarchOf === m.id && e.hp > 0);
    const lap = Math.round(MATRIARCH_LAY_SECONDS / TICK_DT);
    for (let i = 0; i < lap - 2; i++) tickMatriarchs(state, TICK_DT);
    assert.equal(mine().length, 0);
    for (let i = 0; i < 4; i++) tickMatriarchs(state, TICK_DT);
    assert.equal(mine().length, 1);
    assert.equal(mine()[0]!.ownerId, "B");
    for (let i = 0; i < lap * (MATRIARCH_BROOD + 3); i++) tickMatriarchs(state, TICK_DT);
    assert.equal(mine().length, MATRIARCH_BROOD, "never more than her brood");
    mine()[0]!.hp = 0;
    for (let i = 0; i < lap + 2; i++) tickMatriarchs(state, TICK_DT);
    assert.equal(mine().length, MATRIARCH_BROOD, "a gap is filled again");
  });

  it("lays on open ground beside her", () => {
    const state = match();
    const ts = state.tileSize;
    const m = makeEntity(state, "matriarch", "B", tileCenter(32, ts), tileCenter(32, ts));
    const child = lay(state, m)!;
    assert.ok(child);
    assert.ok(Math.hypot(child.x - m.x, child.y - m.y) < ts * 4);
  });
});

describe("brood soldiers", () => {
  it("take no stance orders and lose no limbs", () => {
    const state = match();
    const ts = state.tileSize;
    const q = makeEntity(state, "quillback", "B", tileCenter(30, ts), tileCenter(30, ts));
    const r = applyCommand(state, "B", { type: "cmd.stance", ids: [q.id], stance: "crawl" });
    assert.equal(r.ok, false);
    assert.equal(stanceOf(q), "stand");
    for (let i = 0; i < 200; i++) rollCrits(q, "none", "hit", 10, () => 0);
    assert.deepEqual(q.crits, []);
  });

  it("are knitted closed by a Mender", () => {
    const state = match();
    const ts = state.tileSize;
    makeEntity(state, "mender", "B", tileCenter(30, ts), tileCenter(30, ts));
    const s = makeEntity(state, "gobber", "B", tileCenter(31, ts), tileCenter(30, ts));
    s.hp = s.hpMax / 3;
    // Fewer ticks than regrowth needs to start: only the Mender can have done it.
    for (let i = 0; i < Math.round((REGROWTH_DELAY_SECONDS - 1) / TICK_DT); i++) step(state, TICK_DT);
    assert.ok(s.hp > s.hpMax / 3);
  });
});

describe("Bloom beasts", () => {
  it("lets the Bile Worm burrow", () => {
    const state = match();
    const ts = state.tileSize;
    const w = makeEntity(state, "bileworm", "B", tileCenter(30, ts), tileCenter(30, ts));
    assert.equal(applyCommand(state, "B", { type: "cmd.burrow", ids: [w.id], on: true }).ok, true);
    assert.ok(w.burrow);
  });
});

describe("Bloom CPU", () => {
  function humanVsBloom(): { state: MatchState; aiId: string } {
    const made = createRoom({ id: "AIL", hostId: "A", hostName: "Alpha", mapId: "yard-64", maxSlots: 8 });
    if (!made.ok) throw new Error(made.message);
    const room = made.value;
    const add = hostSlot(room, "A", 1, { status: "ai", ai: "defensive", faction: "bloom" });
    if (!add.ok) throw new Error(add.message);
    updateSelf(room, "A", { ready: true });
    const started = startMatch(room, "A", () => 0);
    if (!started.ok) throw new Error(started.message);
    const state = createMatch(room, started.value);
    for (let i = 0; i < 400 && !hasCore(state, "ai:1"); i++) stepMatch(state, TICK_DT);
    assert.ok(hasCore(state, "ai:1"), "the CPU never rooted its Spore Pod");
    return { state, aiId: "ai:1" };
  }

  it("roots its Spore Pod, then grows a Lumen Bulb, then a Gorger", () => {
    const { state, aiId } = humanVsBloom();
    const cpu = state.players.get(aiId)!;
    const queued = (): string | undefined => state.players.get(aiId)!.structure?.type;
    assert.equal(hqOf(state, aiId)!.type, "broodheart");
    cpu.structure = null;
    cpu.scrap = 5000;
    tickAi(state);
    assert.equal(queued(), "lumenbulb");
    const hq = hqOf(state, aiId)!;
    makeEntity(state, "lumenbulb", aiId, hq.x - 96, hq.y, { tileX: hq.tileX - 12, tileY: hq.tileY });
    cpu.structure = null;
    tickAi(state);
    assert.equal(queued(), "gorger");
  });

  it("hatches its brood at the Brood Nest", () => {
    const { state, aiId } = humanVsBloom();
    const hq = hqOf(state, aiId)!;
    for (const [type, dx, dy] of [["lumenbulb", -12, 0], ["gorger", 16, 0], ["broodnest", 0, 16], ["lumenbulb", 0, -14]] as const) {
      makeEntity(state, type, aiId, hq.x + dx * 8, hq.y + dy * 8, { tileX: hq.tileX + dx, tileY: hq.tileY + dy });
    }
    state.players.get(aiId)!.scrap = 5000;
    tickAi(state);
    const nest = [...state.entities.values()].find((e) => e.ownerId === aiId && e.type === "broodnest")!;
    assert.ok(nest.queue.length > 0, "nothing queued at the Brood Nest");
    assert.ok(BLOOM_BROOD.some((r) => r.unit === nest.queue[0]!.type));
  });

  it("lists only Bloom units, each from the factory that grows it", () => {
    for (const row of BLOOM_BROOD) assert.equal(producerType(row.unit), "broodnest", row.unit);
    for (const row of BLOOM_BEASTS) assert.equal(producerType(row.unit), "gestator", row.unit);
  });
});
