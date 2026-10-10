import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import {
  ACID_CORRODE_MAX_SHARE,
  ACID_CORRODE_MM,
  ACID_CORRODE_SECONDS,
  XENO_DAMAGE_MUL,
  BROOD_FIRST_SECONDS,
  BROOD_MAX,
  MAWCASTER_POD,
  MAWCASTER_SALVO,
  SCOPED,
  SHADE_REVEAL_SECONDS,
  TICK_DT,
  TILE_SUBDIV,
  TRAIN_TYPES,
  WEAVER_MEND_CYBORG,
  WEAVER_MEND_HEAVY,
  WEAVER_PULSE_SECONDS,
  WEAVER_CELL,
  WEAVER_SHIELD,
  WEAVER_SHIELD_GAP_SECONDS,
  catalog,
  factionOf,
  infantryGunFor,
  isCivilianType,
  isCyborg,
  isInfantryType,
  onUplink,
  rocketAmmoOf,
  secondsToTicks,
  techNeeds,
  type EntityType,
} from "../catalog.js";
import { TILE_BLOCKED, TILE_EMPTY, TILE_TREE } from "../maps.js";
import { acidMm, coatAcid, corrodedDef } from "./acid.js";
import { applyCommand } from "./commands.js";
import { destroyEntity, makeEntity, tileCenter } from "./geo.js";
import { createMatch, step } from "./match.js";
import { revealShade } from "./shade.js";
import { snapshotFor } from "./snapshot.js";
import { producerType } from "./train.js";
import { canSeeEntity } from "./vision.js";
import type { Entity, MatchState } from "./types.js";

/** A is Alliance, B the Xenomorphs, on bare flat ground, nothing but what a test places. */
function field(): MatchState {
  const r = createRoom({ id: "XEN", hostId: "A", hostName: "Alpha", mapId: "yard-64", maxSlots: 8 });
  if (!r.ok) throw new Error(r.message);
  const room = r.value;
  assert.equal(joinRoom(room, "B", "Bravo").ok, true);
  updateSelf(room, "A", { ready: true, spawnId: 1 });
  updateSelf(room, "B", { ready: true, spawnId: 4, faction: "xeno" });
  const started = startMatch(room, "A", () => 0);
  if (!started.ok) throw new Error(started.message);
  const state = createMatch(room, started.value);
  state.heights.fill(0);
  state.occupy.fill(0);
  for (let i = 0; i < state.terrain.length; i++) {
    const t = state.terrain[i];
    if (t === TILE_TREE || t === TILE_BLOCKED) state.terrain[i] = TILE_EMPTY;
  }
  state.blocked.fill(0);
  for (const e of [...state.entities.values()]) if (isCivilianType(e.type)) destroyEntity(state, e);
  return state;
}

function ticks(state: MatchState, n: number): void {
  for (let i = 0; i < n; i++) step(state, TICK_DT);
}

/** Places a unit at cell (cx, cy). */
function at(state: MatchState, type: EntityType, owner: string, cx: number, cy: number): Entity {
  const ts = state.tileSize;
  return makeEntity(state, type, owner, tileCenter(Math.round(cx * TILE_SUBDIV), ts), tileCenter(Math.round(cy * TILE_SUBDIV), ts));
}

/** Holds still and never fires. */
function still(e: Entity): Entity {
  e.holdPosition = true;
  e.cooldown = 1e9;
  return e;
}

/** A Cyborg Commander far off keeps B's cyborgs on the uplink. */
function uplink(state: MatchState): void {
  still(at(state, "cyborgcommander", "B", 4, 4));
}

const CYBORGS = ["spitter", "weaver", "shade"] as const;
const HEAVIES = ["siphon", "broodmother", "mawcaster"] as const;

describe("new Xenomorph roster", () => {
  it("trains the three cyborgs at the Conversion Chamber and the three heavies at the Forge", () => {
    for (const t of CYBORGS) {
      assert.ok(TRAIN_TYPES.includes(t), t);
      assert.equal(factionOf(t), "xeno");
      assert.ok(isInfantryType(t) && isCyborg(t) && onUplink(t), t);
      assert.equal(producerType(t), "conversion");
    }
    for (const t of HEAVIES) {
      assert.ok(TRAIN_TYPES.includes(t), t);
      assert.equal(factionOf(t), "xeno");
      assert.ok(!isInfantryType(t), t);
      assert.equal(producerType(t), "forge");
      assert.ok(catalog(t).armorFront > 0 && catalog(t).leavesWreck, t);
    }
    assert.ok(techNeeds("shade").includes("nexus"));
    assert.ok(techNeeds("broodmother").includes("nexus"));
  });

  it("prices hit points inside the band the existing Xenomorph roster already spans", () => {
    const band = (types: readonly EntityType[]) => {
      const r = types.map((t) => catalog(t).hp / catalog(t).cost);
      return [Math.min(...r), Math.max(...r)] as const;
    };
    const [cLo, cHi] = band(["xenodrone", "thrall", "cyborg", "lancer", "simunit2", "cyborgcommander"]);
    const [hLo, hHi] = band(["stalker", "ravager", "behemoth", "juggernaut"]);
    for (const t of CYBORGS) {
      const r = catalog(t).hp / catalog(t).cost;
      assert.ok(r >= cLo && r <= cHi, `${t} ${r.toFixed(3)} HP/scrap`);
    }
    for (const t of HEAVIES) {
      const r = catalog(t).hp / catalog(t).cost;
      assert.ok(r >= hLo && r <= hHi, `${t} ${r.toFixed(3)} HP/scrap`);
    }
  });
});

describe("Spitter acid", () => {
  it("spits the acid gun and coats a hull it hits", () => {
    assert.equal(infantryGunFor({ type: "spitter", crits: [] })?.id, "acid");
    const state = field();
    uplink(state);
    const s = at(state, "spitter", "B", 20, 30);
    const tank = still(at(state, "warden", "A", 26, 30));
    assert.equal(applyCommand(state, "B", { type: "cmd.attack", ids: [s.id], targetId: tank.id }).ok, true);
    ticks(state, secondsToTicks(4));
    assert.ok(acidMm(tank, state.tick) >= ACID_CORRODE_MM, `coat ${acidMm(tank, state.tick)}`);
    const snap = snapshotFor(state, "A").entities.find((e) => e.id === tank.id);
    assert.ok((snap?.acid ?? 0) > 0, "the coat shows");
  });

  it("spits at a tank on its own, with no order", () => {
    const state = field();
    uplink(state);
    at(state, "spitter", "B", 20, 30).holdPosition = true;
    const tank = still(at(state, "warden", "A", 25, 30));
    ticks(state, secondsToTicks(4));
    assert.ok(acidMm(tank, state.tick) > 0, "coated unprompted");
  });

  it("eats every face, never past half the plate, and dries after the last glob", () => {
    const state = field();
    const tank = still(at(state, "warden", "A", 26, 30));
    const def = catalog("warden");
    assert.equal(coatAcid(state, tank), true);
    const thin = corrodedDef(tank, def, state.tick);
    assert.equal(thin.armorFront, def.armorFront - ACID_CORRODE_MM);
    assert.equal(thin.armorSide, def.armorSide - ACID_CORRODE_MM);
    for (let i = 0; i < 40; i++) coatAcid(state, tank);
    const eaten = corrodedDef(tank, def, state.tick);
    assert.equal(eaten.armorFront, def.armorFront * (1 - ACID_CORRODE_MAX_SHARE));
    assert.equal(eaten.armorRear, def.armorRear * (1 - ACID_CORRODE_MAX_SHARE));
    // A soldier takes no coat.
    assert.equal(coatAcid(state, at(state, "rifleman", "A", 30, 30)), false);
    ticks(state, secondsToTicks(ACID_CORRODE_SECONDS) + 1);
    assert.equal(acidMm(tank, state.tick), 0);
    assert.equal(tank.acid, undefined);
    assert.equal(corrodedDef(tank, def, state.tick), def);
  });
});

describe("Weaver", () => {
  it("mends hurt hive units near it once a pulse, Weavers not stacking, never itself or the enemy", () => {
    const state = field();
    uplink(state);
    const w1 = at(state, "weaver", "B", 20, 30);
    const w2 = at(state, "weaver", "B", 20, 31);
    const drone = still(at(state, "xenodrone", "B", 21, 30));
    const stalker = still(at(state, "stalker", "B", 21, 32));
    const far = still(at(state, "xenodrone", "B", 40, 30));
    const foe = still(at(state, "rifleman", "A", 22, 31));
    drone.hp = 60;
    stalker.hp = 50;
    far.hp = 60;
    foe.hp = 10;
    w1.hp = 100;
    w2.hp = 100;
    ticks(state, secondsToTicks(WEAVER_PULSE_SECONDS * 3) + 1);
    assert.equal(drone.hp, 60 + 3 * WEAVER_MEND_CYBORG);
    assert.equal(stalker.hp, 50 + 3 * WEAVER_MEND_HEAVY);
    assert.equal(far.hp, 60, "out of reach");
    assert.equal(foe.hp, 10, "the enemy is not mended");
    // Each Weaver mends the other, never itself.
    assert.equal(w1.hp, 100 + 3 * WEAVER_MEND_CYBORG);
  });

  it("throws a small wall in front of a friend under fire, facing the shooter, for a quarter of its cell", () => {
    const state = field();
    uplink(state);
    const w = still(at(state, "weaver", "B", 20, 30));
    const friend = still(at(state, "spitter", "B", 25, 30));
    const far = still(at(state, "spitter", "B", 20, 45));
    const foe = still(at(state, "rifleman", "A", 31, 30));
    const foe2 = still(at(state, "rifleman", "A", 20, 52));
    foe.attackTarget = friend.id;
    foe2.attackTarget = far.id;
    ticks(state, 2);
    const walls = (state.energyShields ?? []).filter((s) => s.fromId === w.id);
    assert.equal(walls.length, 1, "one wall, for the friend in reach; the far one is beyond it");
    const s = walls[0]!;
    assert.equal(s.forId, friend.id);
    assert.equal(s.x, friend.x);
    assert.equal(s.r, WEAVER_SHIELD.arcPx);
    assert.equal(s.hpMax, WEAVER_SHIELD.hp);
    assert.ok(Math.abs(s.angle) < 0.05, "faces the rifleman to the east");
    assert.ok(w.energy! >= 3 && w.energy! < 3.1, `a quarter of the cell spent: ${w.energy}`);
    ticks(state, secondsToTicks(2));
    assert.equal(state.energyShields!.filter((x) => x.forId === friend.id).length, 1, "never two walls on one friend");
    const view = snapshotFor(state, "B").shields!.find((x) => x.id === s.id)!;
    assert.equal(view.by, w.id);
  });

  it("shields itself, runs dry after four walls, and throws again once the cell regrows", () => {
    const state = field();
    uplink(state);
    const w = still(at(state, "weaver", "B", 20, 30));
    const friends = [w, ...[0, 1, 2, 3].map((i) => still(at(state, "spitter", "B", 22, 26 + i * 2)))];
    friends.forEach((f, i) => {
      still(at(state, "rifleman", "A", 28, 26 + i * 2)).attackTarget = f.id;
    });
    ticks(state, secondsToTicks(WEAVER_SHIELD_GAP_SECONDS * 6));
    const mine = () => state.energyShields!.filter((s) => s.fromId === w.id);
    assert.equal(mine().length, WEAVER_CELL.shots, "four walls drain the cell");
    assert.ok(w.energy! < 1);
    assert.ok(mine().some((s) => s.forId === w.id), "all as hurt, so the nearest first: the Weaver itself");
    ticks(state, secondsToTicks(WEAVER_CELL.rechargeSeconds));
    assert.equal(mine().length, WEAVER_CELL.shots + 1, "one more once a quarter regrows");
  });

  it("mends nothing shut down", () => {
    const state = field();
    const w = at(state, "weaver", "B", 20, 30);
    const drone = still(at(state, "xenodrone", "B", 21, 30));
    drone.hp = 60;
    w.shutdown = true;
    drone.shutdown = true;
    ticks(state, secondsToTicks(WEAVER_PULSE_SECONDS * 2) + 1);
    assert.equal(drone.hp, 60);
  });
});

describe("Shade cloak", () => {
  it("hides from the enemy until it fires, shows to its own side, and is seen up close", () => {
    const state = field();
    uplink(state);
    const shade = still(at(state, "shade", "B", 20, 30));
    const foe = still(at(state, "rifleman", "A", 28, 30));
    ticks(state, 2);
    assert.equal(shade.cloaked, true);
    assert.equal(canSeeEntity(state, "A", shade), false, "cloaked");
    assert.equal(snapshotFor(state, "A").entities.some((e) => e.id === shade.id), false);
    assert.equal(snapshotFor(state, "B").entities.find((e) => e.id === shade.id)?.cloaked, true, "its owner still sees it");

    revealShade(state, shade);
    ticks(state, 1);
    assert.equal(canSeeEntity(state, "A", shade), true, "a shot shows it");
    ticks(state, secondsToTicks(SHADE_REVEAL_SECONDS) + 1);
    assert.equal(canSeeEntity(state, "A", shade), false, "settled again");

    // A hurt shows it too.
    shade.hp -= 5;
    ticks(state, 1);
    assert.equal(canSeeEntity(state, "A", shade), true, "hurt");
    ticks(state, secondsToTicks(SHADE_REVEAL_SECONDS) + 1);
    assert.equal(canSeeEntity(state, "A", shade), false);

    // An enemy right beside it sees it.
    foe.x = shade.x + state.tileSize * TILE_SUBDIV;
    foe.y = shade.y;
    ticks(state, 1);
    assert.equal(shade.cloaked, undefined);
    assert.equal(canSeeEntity(state, "A", shade), true, "an enemy close by");
  });

  it("lands the scoped hit at the Xenomorph share and gives itself away when it shoots", () => {
    const state = field();
    uplink(state);
    const shade = at(state, "shade", "B", 20, 30);
    const foe = still(at(state, "rifleman", "A", 28, 30));
    foe.hp = foe.hpMax = 1e9;
    ticks(state, 2);
    assert.equal(applyCommand(state, "B", { type: "cmd.attack", ids: [shade.id], targetId: foe.id }).ok, true);
    // The round crosses its reach inside a tick: read the first hit off the soldier.
    let lost = 0;
    let shown = false;
    for (let i = 0; i < secondsToTicks(SCOPED.cooldown + 2) && lost === 0; i++) {
      step(state, TICK_DT);
      lost = 1e9 - foe.hp;
      shown = shade.cloaked !== true;
    }
    const pool = catalog("rifleman").hp;
    assert.ok(lost > 0, "it fired");
    assert.ok(lost <= Math.round(pool * XENO_DAMAGE_MUL) && lost >= Math.floor(pool * 0.9 * XENO_DAMAGE_MUL), `took ${lost} of ${pool}`);
    assert.equal(shown, true, "the shot shows it");
  });
});

describe("Siphon drain", () => {
  it("mends itself from what its bolt takes off an enemy hull", () => {
    const state = field();
    const s = at(state, "siphon", "B", 20, 30);
    const foe = still(at(state, "warden", "A", 27, 30));
    foe.facing = Math.PI / 2; // side on
    foe.hp = foe.hpMax = 5000;
    s.hp = 60;
    assert.equal(applyCommand(state, "B", { type: "cmd.attack", ids: [s.id], targetId: foe.id }).ok, true);
    ticks(state, secondsToTicks(8));
    assert.ok(foe.hp < 5000, "it hit");
    assert.ok(s.hp > 60, `drank back to ${s.hp}`);
  });
});

describe("Broodmother", () => {
  it("births a Thrall behind her after a while, then more, up to her brood", () => {
    const state = field();
    uplink(state);
    const m = still(at(state, "broodmother", "B", 30, 30));
    const brood = () => [...state.entities.values()].filter((e) => e.broodOf === m.id && e.hp > 0);
    ticks(state, secondsToTicks(BROOD_FIRST_SECONDS) - 2);
    assert.equal(brood().length, 0);
    ticks(state, 3);
    assert.equal(brood().length, 1);
    const t = brood()[0]!;
    assert.equal(t.type, "thrall");
    assert.equal(t.ownerId, "B");
    for (let i = 0; i < BROOD_MAX + 2; i++) {
      m.broodNext = state.tick;
      ticks(state, 1);
    }
    assert.equal(brood().length, BROOD_MAX, "no more than her brood");
    destroyEntity(state, t);
    m.broodNext = state.tick;
    ticks(state, 1);
    assert.equal(brood().length, BROOD_MAX, "a lost Thrall is replaced");
  });
});

describe("Mawcaster", () => {
  it("is a laid spore launcher that throws a salvo and never runs dry", () => {
    const def = catalog("mawcaster");
    assert.equal(def.rocketRack, MAWCASTER_POD);
    const state = field();
    const n = at(state, "mawcaster", "B", 10, 30);
    n.facing = 0;
    n.turretFacing = 0;
    n.holdPosition = true;
    const foe = still(at(state, "rifleman", "A", 26, 30));
    foe.hp = foe.hpMax = 1e9;
    still(at(state, "xenodrone", "B", 25, 31)); // spotter
    assert.equal(applyCommand(state, "B", { type: "cmd.attack", ids: [n.id], targetId: foe.id }).ok, true);
    const seen = new Set<number>();
    for (let i = 0; i < secondsToTicks(MAWCASTER_POD.reload * 2 + 6); i++) {
      step(state, TICK_DT);
      for (const p of state.projectiles) if (p.fromId === n.id && p.flight === "rocket") seen.add(p.id);
    }
    assert.ok(seen.size >= MAWCASTER_SALVO * 2, `${seen.size} pods`);
    assert.equal(n.rockets ?? rocketAmmoOf("mawcaster"), rocketAmmoOf("mawcaster"), "the hive refills the maw");
  });
});
