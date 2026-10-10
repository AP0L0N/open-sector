import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import {
  AIR_CRUISE_ALT,
  XENO_DAMAGE_MUL,
  ASSEMBLER_REGEN_SECONDS,
  ASSEMBLER_SPEEDUP,
  ASSEMBLER_THRALLS,
  INFANTRY_SIGHT_TILES,
  MAWCASTER_AIR_BALL,
  MAWCASTER_AIR_SALVO,
  MAWCASTER_CELL,
  MAWCASTER_POD,
  MAWCASTER_SALVO,
  SPITTER_BALL,
  SPITTER_MIN_RANGE_TILES,
  SPITTER_RANGE_TILES,
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
  plasmaCellOf,
  rocketRackFor,
  rocketAmmoOf,
  secondsToTicks,
  techNeeds,
  type EntityType,
} from "../catalog.js";
import { TILE_BLOCKED, TILE_EMPTY, TILE_TREE } from "../maps.js";
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
  // A launcher (the Spitter's sac, the Mawcaster's maw) keeps its own clock: hold the rack too.
  e.rocketsOff = true;
  return e;
}

/** A Cyborg Commander far off keeps B's cyborgs on the uplink. */
function uplink(state: MatchState): void {
  still(at(state, "cyborgcommander", "B", 4, 4));
}

const CYBORGS = ["spitter", "weaver", "shade"] as const;
const HEAVIES = ["siphon", "assembler", "mawcaster"] as const;

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
    assert.ok(techNeeds("assembler").includes("nexus"));
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

describe("Spitter", () => {
  it("is the Mawcaster on two legs: a laid launcher with one plasma ball a salvo, no infantry gun", () => {
    const def = catalog("spitter");
    assert.equal(def.rockets, true);
    assert.equal(def.rocketRack, SPITTER_BALL);
    assert.equal(SPITTER_BALL.salvo, 1);
    assert.equal(SPITTER_BALL.laid, true);
    assert.equal(def.rangeTiles, SPITTER_RANGE_TILES);
    assert.ok(SPITTER_RANGE_TILES > INFANTRY_SIGHT_TILES, "it reaches past its own eyes");
    assert.equal(infantryGunFor({ type: "spitter", crits: [] }) ?? undefined, undefined);
    assert.equal(isInfantryType("spitter"), true);
  });

  it("lobs one ball at a time at a target and never runs dry", () => {
    const state = field();
    uplink(state);
    const s = at(state, "spitter", "B", 20, 30);
    s.holdPosition = true;
    const tank = still(at(state, "warden", "A", 30, 30));
    tank.hp = tank.hpMax = 1e9;
    still(at(state, "xenodrone", "B", 29, 31)); // spotter
    assert.equal(applyCommand(state, "B", { type: "cmd.attack", ids: [s.id], targetId: tank.id }).ok, true);
    const seen = new Set<number>();
    let most = 0;
    for (let i = 0; i < secondsToTicks(SPITTER_BALL.reload * 3 + 4); i++) {
      step(state, TICK_DT);
      const flying = state.projectiles.filter((p) => p.fromId === s.id && p.flight === "rocket");
      most = Math.max(most, flying.length);
      for (const p of flying) seen.add(p.id);
    }
    assert.ok(seen.size >= 3, `${seen.size} balls`);
    assert.equal(most, 1, "one ball in the air at a time");
    assert.equal(s.rockets ?? rocketAmmoOf("spitter"), rocketAmmoOf("spitter"), "the hive refills the sac");
  });

  it("will not spit inside its least range", () => {
    const state = field();
    uplink(state);
    const s = at(state, "spitter", "B", 20, 30);
    s.holdPosition = true;
    const close = (SPITTER_MIN_RANGE_TILES / TILE_SUBDIV) * 0.5;
    const foe = still(at(state, "rifleman", "A", 20 + close, 30));
    foe.hp = foe.hpMax = 1e9;
    assert.equal(applyCommand(state, "B", { type: "cmd.attack", ids: [s.id], targetId: foe.id }).ok, true);
    ticks(state, secondsToTicks(3));
    assert.equal(state.projectiles.filter((p) => p.fromId === s.id).length, 0);
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

describe("Siphon", () => {
  it("is unarmed support: it never fires, and holds its dome", () => {
    const state = field();
    const s = at(state, "siphon", "B", 20, 30);
    const foe = still(at(state, "warden", "A", 24, 30));
    foe.hp = foe.hpMax = 5000;
    assert.equal(catalog("siphon").damage, 0);
    assert.equal(plasmaCellOf("siphon"), undefined);
    ticks(state, secondsToTicks(6));
    assert.equal(foe.hp, 5000, "no shot left it");
    assert.ok(state.energyShields?.some((w) => w.dome && w.fromId === s.id), "dome up");
  });
});

describe("Assembler", () => {
  it("builds a Thrall behind it three times as fast as the Forge, spending a tenth of its energy each", () => {
    const state = field();
    uplink(state);
    const a = still(at(state, "assembler", "B", 30, 30));
    const built = () => [...state.entities.values()].filter((e) => e.assembledBy === a.id && e.hp > 0);
    const each = secondsToTicks(catalog("thrall").buildSeconds / ASSEMBLER_SPEEDUP);
    assert.equal(ASSEMBLER_SPEEDUP, 3);
    ticks(state, each - 1);
    assert.equal(built().length, 0);
    ticks(state, 3);
    assert.equal(built().length, 1);
    const t = built()[0]!;
    assert.equal(t.type, "thrall");
    assert.equal(t.ownerId, "B");
    assert.equal(snapshotFor(state, "B").entities.find((e) => e.id === a.id)?.energy, 1 - 1 / ASSEMBLER_THRALLS, "its owner sees the energy");
    assert.equal(snapshotFor(state, "A").entities.find((e) => e.id === a.id)?.energy, undefined, "the enemy does not");
  });

  it("builds ten Thralls, then waits; a lost Thrall's tenth regrows slowly and a new one follows", () => {
    const state = field();
    uplink(state);
    const a = still(at(state, "assembler", "B", 30, 30));
    const built = () => [...state.entities.values()].filter((e) => e.assembledBy === a.id && e.hp > 0 && !e.wreck);
    for (let i = 0; i < ASSEMBLER_THRALLS + 3; i++) {
      a.assemblyDone = state.tick;
      ticks(state, 1);
    }
    assert.equal(built().length, ASSEMBLER_THRALLS);
    assert.equal(a.energy, 0);
    assert.equal(snapshotFor(state, "B").entities.find((e) => e.id === a.id)?.energy, 0);
    ticks(state, secondsToTicks(ASSEMBLER_REGEN_SECONDS * 2));
    assert.equal(a.energy, 0, "nothing regrows while all ten live");
    assert.equal(built().length, ASSEMBLER_THRALLS);

    destroyEntity(state, built()[0]!);
    destroyEntity(state, built()[0]!);
    ticks(state, secondsToTicks(ASSEMBLER_REGEN_SECONDS / 2));
    const half = a.energy!;
    assert.ok(half > 0.4 && half < 0.6, `half a Thrall's worth after half the time: ${half}`);
    assert.equal(built().length, ASSEMBLER_THRALLS - 2, "not enough energy yet");
    // A whole Thrall's worth back, then one build time: one new Thrall.
    ticks(state, secondsToTicks(ASSEMBLER_REGEN_SECONDS / 2) + secondsToTicks(catalog("thrall").buildSeconds / ASSEMBLER_SPEEDUP) + 2);
    assert.equal(built().length, ASSEMBLER_THRALLS - 1, "one back");
    ticks(state, secondsToTicks(ASSEMBLER_REGEN_SECONDS * 3));
    assert.equal(built().length, ASSEMBLER_THRALLS, "and the second");
    assert.ok(a.energy! < 0.01, "back to empty with ten alive");
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

  it("switches between Ground attacks and Air attacks; the snapshot shows its own side the mode", () => {
    const state = field();
    const n = at(state, "mawcaster", "B", 10, 30);
    assert.equal(applyCommand(state, "B", { type: "cmd.airmode", ids: [n.id], air: true }).ok, true);
    assert.equal(n.airMode, true);
    assert.equal(rocketRackFor(n), MAWCASTER_AIR_BALL);
    assert.equal(snapshotFor(state, "B").entities.find((e) => e.id === n.id)?.airMode, true);
    assert.equal(snapshotFor(state, "A").entities.find((e) => e.id === n.id)?.airMode, undefined);
    assert.equal(applyCommand(state, "A", { type: "cmd.airmode", ids: [n.id], air: false }).ok, false, "not A's");
    const drone = at(state, "xenodrone", "B", 12, 30);
    assert.equal(applyCommand(state, "B", { type: "cmd.airmode", ids: [drone.id], air: true }).ok, false, "only a Mawcaster");
    assert.equal(applyCommand(state, "B", { type: "cmd.airmode", ids: [n.id], air: false }).ok, true);
    assert.equal(n.airMode, undefined);
    assert.equal(rocketRackFor(n), MAWCASTER_POD);
  });

  it("on Air attacks leaves the ground alone, even a forced point", () => {
    const state = field();
    const n = at(state, "mawcaster", "B", 10, 30);
    n.facing = 0;
    n.turretFacing = 0;
    n.holdPosition = true;
    n.airMode = true;
    const foe = still(at(state, "rifleman", "A", 18, 30));
    foe.hp = foe.hpMax = 1e9;
    still(at(state, "xenodrone", "B", 17, 31)); // spotter
    assert.equal(applyCommand(state, "B", { type: "cmd.attack", ids: [n.id], targetId: foe.id }).ok, true);
    ticks(state, secondsToTicks(4));
    assert.equal(state.projectiles.filter((p) => p.fromId === n.id).length, 0, "no ball at a soldier");
    const ts = state.tileSize;
    assert.equal(applyCommand(state, "B", { type: "cmd.forceattack", ids: [n.id], x: foe.x, y: foe.y }).ok, true);
    ticks(state, secondsToTicks(4));
    assert.equal(state.projectiles.filter((p) => p.fromId === n.id).length, 0, `no ball at the ground (${ts})`);
  });

  it("on Air attacks spits small quick balls at a plane and bursts them beside it", () => {
    assert.ok(MAWCASTER_AIR_BALL.caliber < MAWCASTER_POD.caliber, "smaller balls");
    assert.ok(MAWCASTER_AIR_BALL.reload < MAWCASTER_POD.reload, "quicker");
    const state = field();
    const n = at(state, "mawcaster", "B", 10, 30);
    n.holdPosition = true;
    n.airMode = true;
    const plane = makeEntity(state, "stuka", "A", n.x + 5 * state.tileSize * TILE_SUBDIV, n.y);
    plane.air!.phase = "fly";
    plane.air!.alt = AIR_CRUISE_ALT;
    plane.air!.speed = 1;
    plane.order = { kind: "move", x: plane.x, y: plane.y };
    plane.hp = plane.hpMax = 1e6;
    const balls = new Set<number>();
    for (let i = 0; i < secondsToTicks(10); i++) {
      step(state, TICK_DT);
      for (const p of state.projectiles) {
        if (p.fromId !== n.id) continue;
        balls.add(p.id);
        assert.equal(p.airRack, true);
        assert.equal(p.caliber, MAWCASTER_AIR_BALL.caliber);
      }
    }
    assert.ok(balls.size >= MAWCASTER_AIR_SALVO * 2, `${balls.size} balls`);
    assert.ok(plane.hp < plane.hpMax, "the plane is hit");
  });

  it("draws every ball from an energy cell the snapshot shows as a bar, and waits on it when empty", () => {
    assert.deepEqual(plasmaCellOf("mawcaster"), MAWCASTER_CELL);
    const state = field();
    const n = at(state, "mawcaster", "B", 10, 30);
    n.facing = 0;
    n.turretFacing = 0;
    n.holdPosition = true;
    assert.equal(snapshotFor(state, "B").entities.find((e) => e.id === n.id)?.energy, 1);
    const foe = still(at(state, "rifleman", "A", 26, 30));
    foe.hp = foe.hpMax = 1e9;
    still(at(state, "xenodrone", "B", 25, 31)); // spotter
    assert.equal(applyCommand(state, "B", { type: "cmd.attack", ids: [n.id], targetId: foe.id }).ok, true);
    let fired = 0;
    for (let i = 0; i < secondsToTicks(4) && fired < MAWCASTER_SALVO; i++) {
      step(state, TICK_DT);
      fired = new Set(state.projectiles.filter((p) => p.fromId === n.id).map((p) => p.id)).size;
    }
    const charge = snapshotFor(state, "B").entities.find((e) => e.id === n.id)?.energy ?? 1;
    assert.ok(charge < 1, `cell ${charge}`);
    // Empty, the maw holds even with the rack ready.
    n.energy = 0;
    n.rocketCooldown = 0;
    n.rocketSalvo = 0;
    const before = new Set(state.projectiles.map((p) => p.id));
    step(state, TICK_DT);
    const fresh = state.projectiles.filter((p) => p.fromId === n.id && !before.has(p.id));
    assert.equal(fresh.length, 0, "no ball on an empty cell");
  });
});
