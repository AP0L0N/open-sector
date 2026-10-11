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
  BOMBARD_CELL,
  BOMBARD_FIST_HULL_MUL,
  BOMBARD_ROUND,
  BOMBARD_MIN_RANGE_TILES,
  BOMBARD_RANGE_TILES,
  SCOPED,
  SHADE_REVEAL_SECONDS,
  TICK_DT,
  TILE_SUBDIV,
  TRAIN_TYPES,
  WEAVER_MEND_CYBORG,
  WEAVER_MEND_HEAVY,
  WEAVER_PULSE_SECONDS,
  WEAVER_CELL,
  WEAVER_DOME_POINTS_PER_SHOT,
  FISTS,
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
import { airAlt, entityHeight } from "./elevation.js";
import { destroyEntity, makeEntity, tileCenter } from "./geo.js";
import { createMatch, step } from "./match.js";
import { revealShade } from "./shade.js";
import { snapshotFor } from "./snapshot.js";
import { dropCannon } from "./bombard.js";
import { producerType } from "./train.js";
import { canSeeEntity } from "./vision.js";
import type { Entity, MatchState } from "./types.js";

/** A is Alliance, B the Xenite, on bare flat ground, nothing but what a test places. */
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
  // A launcher (the Bombard's sac, the Mawcaster's maw) keeps its own clock: hold the rack too.
  e.rocketsOff = true;
  return e;
}

/** A Cyborg Commander far off keeps B's cyborgs on the uplink. */
function uplink(state: MatchState): void {
  still(at(state, "cyborgcommander", "B", 4, 4));
}

const CYBORGS = ["bombard", "weaver", "shade"] as const;
const HEAVIES = ["siphon", "assembler", "mawcaster"] as const;

describe("new Xenite roster", () => {
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

  it("prices hit points inside the band the existing Xenite roster already spans", () => {
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

describe("Bombard", () => {
  it("hauls a long plasma cannon: a laid launcher with one big round a salvo, no infantry gun while it holds it", () => {
    const def = catalog("bombard");
    assert.equal(def.rockets, true);
    assert.equal(def.rocketRack, BOMBARD_ROUND);
    assert.equal(BOMBARD_ROUND.salvo, 1);
    assert.equal(BOMBARD_ROUND.laid, true);
    assert.equal(def.rangeTiles, BOMBARD_RANGE_TILES);
    assert.ok(BOMBARD_RANGE_TILES > INFANTRY_SIGHT_TILES, "it reaches past its own eyes");
    assert.equal(infantryGunFor({ type: "bombard", crits: [] }) ?? undefined, undefined);
    assert.equal(isInfantryType("bombard"), true);
  });

  it("throws one round at a time at a target and never runs dry", () => {
    const state = field();
    uplink(state);
    const s = at(state, "bombard", "B", 20, 30);
    s.holdPosition = true;
    const tank = still(at(state, "warden", "A", 30, 30));
    tank.hp = tank.hpMax = 1e9;
    still(at(state, "xenodrone", "B", 29, 31)); // spotter
    assert.equal(applyCommand(state, "B", { type: "cmd.attack", ids: [s.id], targetId: tank.id }).ok, true);
    const seen = new Set<number>();
    let most = 0;
    for (let i = 0; i < secondsToTicks(BOMBARD_ROUND.reload * 3 + 4); i++) {
      step(state, TICK_DT);
      const flying = state.projectiles.filter((p) => p.fromId === s.id && p.flight === "rocket");
      most = Math.max(most, flying.length);
      for (const p of flying) seen.add(p.id);
    }
    assert.ok(seen.size >= 3, `${seen.size} balls`);
    assert.equal(most, 1, "one ball in the air at a time");
    assert.equal(s.rockets ?? rocketAmmoOf("bombard"), rocketAmmoOf("bombard"), "the hive refills the sac");
  });

  it("each round drains its energy cell, which regrows slowly", () => {
    assert.equal(plasmaCellOf("bombard"), BOMBARD_CELL);
    assert.ok(BOMBARD_CELL.rechargeSeconds > BOMBARD_ROUND.reload, "the cell regrows slower than the cannon reloads");
    assert.ok(BOMBARD_MIN_RANGE_TILES > BOMBARD_ROUND.splashTiles, "its least range clears its own splash");
    const state = field();
    uplink(state);
    const s = at(state, "bombard", "B", 20, 30);
    s.holdPosition = true;
    const tank = still(at(state, "warden", "A", 30, 30));
    tank.hp = tank.hpMax = 1e9;
    still(at(state, "xenodrone", "B", 29, 31)); // spotter
    assert.equal(snapshotFor(state, "B").entities.find((v) => v.id === s.id)?.energy, 1);
    assert.equal(applyCommand(state, "B", { type: "cmd.attack", ids: [s.id], targetId: tank.id }).ok, true);
    const seen = new Set<number>();
    let low = Infinity;
    for (let i = 0; i < secondsToTicks(BOMBARD_ROUND.reload * 6); i++) {
      step(state, TICK_DT);
      for (const p of state.projectiles) if (p.fromId === s.id && p.flight === "rocket") seen.add(p.id);
      low = Math.min(low, s.energy ?? Infinity);
    }
    assert.ok(low < 1, `the cell ran down to ${low}`);
    // A full cell plus what regrew: well short of one round every reload.
    const most = BOMBARD_CELL.shots + Math.ceil((BOMBARD_ROUND.reload * 6) / BOMBARD_CELL.rechargeSeconds);
    assert.ok(seen.size >= BOMBARD_CELL.shots && seen.size <= most, `${seen.size} rounds`);
    assert.ok(seen.size < 6, "the cell, not the reload, sets the pace");
  });

  it("will not fire inside its least range", () => {
    const state = field();
    uplink(state);
    const s = at(state, "bombard", "B", 20, 30);
    s.holdPosition = true;
    const close = (BOMBARD_MIN_RANGE_TILES / TILE_SUBDIV) * 0.5;
    const foe = still(at(state, "rifleman", "A", 20 + close, 30));
    foe.hp = foe.hpMax = 1e9;
    assert.equal(applyCommand(state, "B", { type: "cmd.attack", ids: [s.id], targetId: foe.id }).ok, true);
    ticks(state, secondsToTicks(3));
    assert.equal(state.projectiles.filter((p) => p.fromId === s.id).length, 0);
  });
});

describe("Bombard drops its cannon", () => {
  it("attacked from inside its least range, drops the cannon for good and closes with its fists", () => {
    const state = field();
    uplink(state);
    const s = at(state, "bombard", "B", 20, 30);
    const foe = at(state, "rifleman", "A", 21, 30);
    foe.holdPosition = true;
    foe.hp = foe.hpMax = 1e9;
    foe.attackTarget = s.id;
    s.hp = s.hpMax = 1e9;
    ticks(state, 2);
    assert.equal(s.fists, true, "the cannon is down");
    assert.equal(infantryGunFor(s), FISTS);
    assert.equal(s.attackTarget, foe.id, "it squares up to the one that came in close");
    const view = snapshotFor(state, "B").entities.find((v) => v.id === s.id);
    assert.equal(view?.fists, true);
    assert.equal(view?.energy, undefined, "no cannon, no energy bar");
    const before = foe.hp;
    ticks(state, secondsToTicks(4));
    assert.ok(foe.hp < before, "its fists land");
    assert.equal(state.projectiles.filter((p) => p.fromId === s.id && p.flight === "rocket").length, 0, "no more rounds");
    // The foe gone, it still has only its fists: the cannon does not come back.
    destroyEntity(state, foe);
    ticks(state, secondsToTicks(BOMBARD_ROUND.reload * 2));
    assert.equal(s.fists, true);
    const far = still(at(state, "warden", "A", 34, 30));
    far.hp = far.hpMax = 1e9;
    assert.equal(applyCommand(state, "B", { type: "cmd.attack", ids: [s.id], targetId: far.id }).ok, true);
    ticks(state, secondsToTicks(2));
    assert.equal(state.projectiles.filter((p) => p.fromId === s.id && p.flight === "rocket").length, 0, "it walks in instead of firing");
  });

  it("keeps the cannon when the enemy attacks from outside the ring", () => {
    const state = field();
    uplink(state);
    const s = at(state, "bombard", "B", 20, 30);
    s.holdPosition = true;
    s.hp = s.hpMax = 1e9;
    const foe = at(state, "rifleman", "A", 20 + BOMBARD_MIN_RANGE_TILES / TILE_SUBDIV + 2, 30);
    foe.holdPosition = true;
    foe.attackTarget = s.id;
    ticks(state, secondsToTicks(2));
    assert.equal(s.fists, undefined);
  });

  it("punches a hull for a share of the blow and never detonates like a Thrall", () => {
    const state = field();
    uplink(state);
    const s = at(state, "bombard", "B", 20, 30);
    dropCannon(s);
    const tank = still(at(state, "warden", "A", 21, 30));
    tank.hp = tank.hpMax = 1e6;
    assert.equal(applyCommand(state, "B", { type: "cmd.attack", ids: [s.id], targetId: tank.id }).ok, true);
    ticks(state, secondsToTicks(2));
    assert.ok(state.entities.has(s.id) && s.hp > 0, "still standing");
    const lost = 1e6 - tank.hp;
    assert.ok(lost > 0 && lost <= 2 * 8 * FISTS.damage * BOMBARD_FIST_HULL_MUL * 1.2, `the plate took ${lost}`);
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

  it("throws a small wall in front of a friend under fire, facing the shooter, for all of its cell", () => {
    const state = field();
    uplink(state);
    const w = still(at(state, "weaver", "B", 20, 30));
    const friend = still(at(state, "bombard", "B", 25, 30));
    const far = still(at(state, "bombard", "B", 20, 45));
    const foe = still(at(state, "rifleman", "A", 31, 30));
    const foe2 = still(at(state, "rifleman", "A", 20, 52));
    foe.attackTarget = friend.id;
    foe2.attackTarget = far.id;
    ticks(state, 2);
    const walls = (state.energyShields ?? []).filter((s) => s.fromId === w.id && !s.dome);
    assert.equal(walls.length, 1, "one wall, for the friend in reach; the far one is beyond it");
    const s = walls[0]!;
    assert.equal(s.forId, friend.id);
    assert.equal(s.x, friend.x);
    assert.equal(s.r, WEAVER_SHIELD.arcPx);
    assert.equal(s.hpMax, WEAVER_SHIELD.hp);
    assert.ok(Math.abs(s.angle) < 0.05, "faces the rifleman to the east");
    assert.equal(w.energy, 0, `the wall takes the whole cell: ${w.energy}`);
    assert.equal(w.energyDrained, true);
    ticks(state, secondsToTicks(2));
    assert.equal(state.energyShields!.filter((x) => x.forId === friend.id).length, 1, "never two walls on one friend");
    const view = snapshotFor(state, "B").shields!.find((x) => x.id === s.id)!;
    assert.equal(view.by, w.id);
  });

  it("runs dry after one wall, which takes its dome down too, and throws again once a quarter regrows", () => {
    const state = field();
    uplink(state);
    const w = still(at(state, "weaver", "B", 20, 30));
    const friends = [w, ...[0, 1, 2, 3].map((i) => still(at(state, "bombard", "B", 22, 26 + i * 2)))];
    const shooters = friends.map((f, i) => {
      const r = still(at(state, "rifleman", "A", 28, 26 + i * 2));
      r.attackTarget = f.id;
      return r;
    });
    ticks(state, secondsToTicks(WEAVER_SHIELD_GAP_SECONDS * 6));
    const mine = () => state.energyShields!.filter((s) => s.fromId === w.id && !s.dome);
    assert.equal(mine().length, 1, "one wall takes the whole cell, so no second one comes");
    assert.ok(w.energy! < 1, `all of it spent, less what has regrown since: ${w.energy}`);
    assert.ok(!mine().some((s) => s.forId === w.id), "its own dome guards it, so the walls go to the friends");
    const dome = () => state.energyShields!.find((s) => s.weave && s.fromId === w.id);
    assert.equal(dome(), undefined, "the wall drained the cell, and the dome with it");
    // Its shooter had looked elsewhere while the dome stood.
    shooters[0]!.attackTarget = w.id;
    ticks(state, secondsToTicks(WEAVER_CELL.rechargeSeconds + 0.5));
    assert.equal(mine().length, 2, "a quarter regrown is enough for the next wall");
    assert.equal(dome(), undefined, "a quarter is not a full cell, so no dome");
  });

  it("keeps a free dome over itself; hits drain its cell, and drained it waits for a full cell", () => {
    const state = field();
    uplink(state);
    const w = still(at(state, "weaver", "B", 20, 30));
    ticks(state, 2);
    const dome = () => state.energyShields!.find((s) => s.weave && s.fromId === w.id);
    const d = dome()!;
    assert.ok(d, "dome up");
    assert.equal(d.forId, undefined);
    assert.equal(d.hpMax, WEAVER_CELL.shots * WEAVER_DOME_POINTS_PER_SHOT);
    assert.equal(w.energy ?? WEAVER_CELL.shots, WEAVER_CELL.shots, "holding it costs nothing");
    d.hp -= 2 * WEAVER_DOME_POINTS_PER_SHOT;
    ticks(state, 1);
    assert.ok(Math.abs(w.energy! - 2) < 0.01, `half the cell paid for the hits: ${w.energy}`);
    assert.ok(Math.abs(dome()!.hp - w.energy! * WEAVER_DOME_POINTS_PER_SHOT) < 1e-6);
    dome()!.hp = 0;
    ticks(state, 2);
    assert.equal(dome(), undefined, "drained, it is gone");
    ticks(state, secondsToTicks(WEAVER_CELL.rechargeSeconds * (WEAVER_CELL.shots - 0.5)));
    assert.equal(dome(), undefined, "not cast again on a part-filled cell");
    ticks(state, secondsToTicks(WEAVER_CELL.rechargeSeconds));
    assert.ok(dome(), "cast again once the cell is full");
  });

  it("stops an enemy round with its dome", () => {
    const state = field();
    uplink(state);
    const w = still(at(state, "weaver", "B", 20, 30));
    w.hp = w.hpMax = 1000;
    const foe = at(state, "rifleman", "A", 24, 30);
    foe.holdPosition = true;
    ticks(state, 1);
    assert.equal(applyCommand(state, "A", { type: "cmd.attack", ids: [foe.id], targetId: w.id }).ok, true);
    ticks(state, secondsToTicks(3));
    assert.equal(w.hp, 1000, "the dome took the rounds");
    assert.ok((w.energy ?? WEAVER_CELL.shots) < WEAVER_CELL.shots, "and the cell paid for them");
  });

  it("force attack on a friend puts the dome on it; the Weaver follows; Stop takes it back", () => {
    const state = field();
    uplink(state);
    const w = at(state, "weaver", "B", 20, 30);
    const friend = still(at(state, "xenodrone", "B", 24, 30));
    ticks(state, 2);
    assert.equal(applyCommand(state, "B", { type: "cmd.forceattack", ids: [w.id], x: friend.x, y: friend.y, targetId: friend.id }).ok, true);
    assert.equal(w.weaveFor, friend.id);
    ticks(state, 2);
    const dome = () => state.energyShields!.find((s) => s.weave && s.fromId === w.id)!;
    assert.equal(dome().forId, friend.id);
    assert.equal(dome().x, friend.x);
    assert.equal(dome().r, friend.radius + 5);
    assert.equal(snapshotFor(state, "B").shields!.find((v) => v.id === dome().id)?.fromId, friend.id, "drawn on the friend");
    // The friend walks off: the Weaver goes after it.
    friend.holdPosition = false;
    friend.x += 14 * TILE_SUBDIV * state.tileSize;
    ticks(state, secondsToTicks(16));
    assert.ok(Math.hypot(w.x - friend.x, w.y - friend.y) < 7.5 * TILE_SUBDIV * state.tileSize, "it caught up");
    assert.equal(dome().forId, friend.id);
    assert.equal(applyCommand(state, "B", { type: "cmd.stop", ids: [w.id] }).ok, true);
    ticks(state, 1);
    assert.equal(w.weaveFor, undefined);
    assert.equal(dome().forId, undefined, "back on the Weaver");
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

  it("lands the scoped hit at the Xenite share and gives itself away when it shoots", () => {
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

  it("on Air attacks steers each ball onto a turning plane and bursts it on the plane, at its height", () => {
    const state = field();
    const n = at(state, "mawcaster", "B", 10, 30);
    n.holdPosition = true;
    n.airMode = true;
    const plane = makeEntity(state, "stuka", "A", n.x + 4 * state.tileSize * TILE_SUBDIV, n.y);
    plane.air!.phase = "fly";
    plane.air!.alt = AIR_CRUISE_ALT;
    plane.air!.speed = 1;
    plane.order = { kind: "move", x: plane.x, y: plane.y };
    plane.hp = plane.hpMax = 1e6;
    let bursts = 0;
    for (let i = 0; i < secondsToTicks(6); i++) {
      step(state, TICK_DT);
      for (const p of state.projectiles) if (p.fromId === n.id) assert.equal(p.homeOn, plane.id, "each ball steers on the plane");
      for (const im of state.impacts) {
        if (im.fromId !== n.id) continue;
        bursts++;
        assert.equal(im.homed, plane.id, "burst on the plane");
        assert.equal(im.z, entityHeight(state, plane) + airAlt(plane), "at its altitude, not under it");
        assert.ok(Math.hypot(im.x - plane.x, im.y - plane.y) < 1e-6, "on it, not beside it");
      }
    }
    assert.ok(bursts >= MAWCASTER_AIR_SALVO, `${bursts} bursts`);
    assert.ok(snapshotFor(state, "B").projectiles.every((p) => p.fromId !== n.id || p.homeOn === plane.id), "the client knows its flier");
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
