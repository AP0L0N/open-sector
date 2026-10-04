import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import {
  AIR_CRUISE_ALT,
  ARTILLERY_SHELL,
  BATTLESHIP_CIWS_RANGE_TILES,
  CIWS_AIR_REACH_MUL,
  BATTLESHIP_BARREL_AMMO,
  BATTLESHIP_BARREL_GAP_MAX,
  BATTLESHIP_BARREL_RELOAD,
  BATTLESHIP_CIWS_BELT,
  BATTLESHIP_MIN_RANGE_TILES,
  BATTLESHIP_RANGE_TILES,
  BATTLESHIP_REARM_SECONDS,
  BATTLESHIP_SHELL,
  BATTLESHIP_TURRET_BLIND_DEG,
  SPOTLIGHT_TURN_DEG_PER_SEC,
  TICK_DT,
  TRAIN_TYPES,
  catalog,
  isNavalType,
  leavesWreck,
  secondsToTicks,
} from "../catalog.js";
import { TILE_EMPTY, TILE_WATER } from "../maps.js";
import { turretBearing } from "./battleship.js";
import { hasHeadlight, hasSpotlight } from "./night.js";
import { applyCommand } from "./commands.js";
import { makeEntity, tileCenter } from "./geo.js";
import { createMatch, step } from "./match.js";
import { snapshotFor } from "./snapshot.js";
import { producerType } from "./train.js";
import type { Entity, MatchState, Projectile } from "./types.js";

function twoPlayerMatch(): MatchState {
  const r = createRoom({ id: "BB1", hostId: "A", hostName: "Alpha", mapId: "yard-64", maxSlots: 8 });
  if (!r.ok) throw new Error(r.message);
  const room = r.value;
  assert.equal(joinRoom(room, "B", "Bravo").ok, true);
  updateSelf(room, "A", { ready: true, spawnId: 1 });
  updateSelf(room, "B", { ready: true, spawnId: 4 });
  const started = startMatch(room, "A", () => 0);
  if (!started.ok) throw new Error(started.message);
  return createMatch(room, started.value);
}

/** Open, level ground over the rectangle, inclusive. Water where `water` says so. */
function paint(state: MatchState, x0: number, y0: number, x1: number, y1: number, water: boolean): void {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = y * state.width + x;
      state.terrain[i] = water ? TILE_WATER : TILE_EMPTY;
      state.blocked[i] = water ? 1 : 0;
      state.heights[i] = 0;
      state.scrapYield[i] = 0;
    }
  }
  state.visionTick = -1;
}

/** A wide bay: water from x0 to x0 + 60, a beach east of it. */
function bay(): { state: MatchState; x0: number; y0: number } {
  const state = twoPlayerMatch();
  const x0 = 40;
  const y0 = 40;
  paint(state, x0 - 4, y0 - 20, x0 + 110, y0 + 40, false);
  paint(state, x0, y0 - 20, x0 + 60, y0 + 40, true);
  return { state, x0, y0 };
}

function spawn(state: MatchState, type: Parameters<typeof makeEntity>[1], owner: string, tx: number, ty: number): Entity {
  return makeEntity(state, type, owner, tileCenter(tx, state.tileSize), tileCenter(ty, state.tileSize));
}

function ticks(state: MatchState, n: number): void {
  for (let i = 0; i < n; i++) step(state, TICK_DT);
}

/** A battleship bow east at (x0 + 20, y0 + 10), and an enemy target ashore `dist` tiles east of it. */
function shoot(dist: number): { state: MatchState; ship: Entity; target: Entity } {
  const { state, x0, y0 } = bay();
  const ship = spawn(state, "battleship", "A", x0 + 20, y0 + 10);
  ship.facing = 0;
  ship.turretFacing = 0;
  for (const t of ship.ship!.turrets) t.facing = 0;
  for (const m of ship.ship!.ciws) m.facing = 0;
  const target = spawn(state, "bunker", "B", x0 + 20 + dist, y0 + 10);
  target.hp = target.hpMax = 1_000_000;
  return { state, ship, target };
}

function shipShells(state: MatchState, shipId: number): Projectile[] {
  return state.projectiles.filter((p) => p.fromId === shipId && p.shipBarrel != null);
}

describe("Battle Ship catalog", () => {
  it("is a hull trained at the Marine Base that leaves a sunken hulk", () => {
    assert.ok(TRAIN_TYPES.includes("battleship"));
    assert.equal(catalog("battleship").name, "Battle Ship");
    assert.equal(isNavalType("battleship"), true);
    assert.equal(producerType("battleship"), "dock");
    assert.equal(leavesWreck("battleship"), true);
  });

  it("leaves the yard with two loaded triple turrets and two full CIWS belts", () => {
    const { state, x0, y0 } = bay();
    const ship = spawn(state, "battleship", "A", x0 + 20, y0 + 10);
    assert.equal(ship.ship!.turrets.length, 2);
    for (const t of ship.ship!.turrets) {
      assert.deepEqual(t.barrels.map((b) => b.ammo), [BATTLESHIP_BARREL_AMMO, BATTLESHIP_BARREL_AMMO, BATTLESHIP_BARREL_AMMO]);
    }
    assert.deepEqual(ship.ship!.ciws.map((m) => m.ammo), [BATTLESHIP_CIWS_BELT, BATTLESHIP_CIWS_BELT]);
  });

  it("shoots as far as Artillery, on a much faster, flatter arc", () => {
    assert.equal(BATTLESHIP_RANGE_TILES, catalog("artillery").rangeTiles);
    assert.ok(BATTLESHIP_SHELL.flightFar * 2 < ARTILLERY_SHELL.flightNear);
    assert.ok(BATTLESHIP_SHELL.apexFar * 2 < ARTILLERY_SHELL.apexNear);
  });
});

describe("Battle Ship main battery", () => {
  it("lets every barrel go one at a time, each spending its own shell", () => {
    const { state, ship, target } = shoot(36);
    applyCommand(state, "A", { type: "cmd.attack", ids: [ship.id], targetId: target.id });
    const shotTicks: number[] = [];
    const seen = new Set<number>();
    for (let i = 0; i < 80; i++) {
      step(state, TICK_DT);
      for (const p of shipShells(state, ship.id)) {
        if (seen.has(p.id)) continue;
        seen.add(p.id);
        shotTicks.push(state.tick);
        assert.equal(p.flight, "mortar");
        assert.equal(p.big, true);
        assert.ok((p.flightTime ?? 99) <= BATTLESHIP_SHELL.flightFar + 1e-9, "the low, fast arc");
      }
    }
    assert.equal(seen.size, 6, "all six barrels fired once");
    // Two turrets fire side by side, but inside one turret no two barrels share a tick.
    for (const t of ship.ship!.turrets) {
      const at = t.firedTick.map((x) => x!);
      assert.equal(new Set(at).size, 3, `turret barrels fired apart: ${at}`);
      const spread = Math.max(...at) - Math.min(...at);
      assert.ok(spread <= 2 * secondsToTicks(BATTLESHIP_BARREL_GAP_MAX) + 2, `a short gap apart: ${spread}`);
      for (const b of t.barrels) {
        assert.equal(b.ammo, BATTLESHIP_BARREL_AMMO - 1);
        assert.ok(b.cooldown > 0);
      }
    }
  });

  it("fires its barrels in no set order", () => {
    const { state, ship, target } = shoot(36);
    applyCommand(state, "A", { type: "cmd.attack", ids: [ship.id], targetId: target.id });
    const orders = new Set<string>();
    for (let v = 0; v < 6; v++) {
      ticks(state, secondsToTicks(BATTLESHIP_BARREL_RELOAD) + 20);
      for (const t of ship.ship!.turrets) {
        const order = [0, 1, 2].sort((a, b) => t.firedTick[a]! - t.firedTick[b]!);
        orders.add(order.join(""));
      }
    }
    assert.ok(orders.size >= 2, `orders seen: ${[...orders]}`);
  });

  it("an empty barrel stays silent while its loaded neighbours fire", () => {
    const { state, ship, target } = shoot(36);
    ship.ship!.turrets[0]!.barrels[1]!.ammo = 0;
    applyCommand(state, "A", { type: "cmd.attack", ids: [ship.id], targetId: target.id });
    ticks(state, 80);
    const fired = ship.ship!.turrets[0]!.firedTick;
    assert.notEqual(fired[0], undefined);
    assert.equal(fired[1], undefined, "the dry barrel never fired");
    assert.notEqual(fired[2], undefined);
  });

  it("holds fire with every barrel dry", () => {
    const { state, ship, target } = shoot(36);
    for (const t of ship.ship!.turrets) for (const b of t.barrels) b.ammo = 0;
    applyCommand(state, "A", { type: "cmd.attack", ids: [ship.id], targetId: target.id });
    ticks(state, 80);
    assert.equal(shipShells(state, ship.id).length, 0);
  });

  it("will not fire inside its minimum range", () => {
    const { state, ship, target } = shoot(BATTLESHIP_MIN_RANGE_TILES - 4);
    applyCommand(state, "A", { type: "cmd.attack", ids: [ship.id], targetId: target.id });
    ticks(state, 80);
    assert.equal(shipShells(state, ship.id).length, 0);
  });

  it("the forward turrets cannot train through the superstructure astern", () => {
    assert.equal(turretBearing(0, Math.PI / 2).blind, false);
    const astern = turretBearing(0, Math.PI);
    assert.equal(astern.blind, true);
    const limit = Math.PI - (BATTLESHIP_TURRET_BLIND_DEG * Math.PI) / 180;
    assert.ok(Math.abs(Math.abs(astern.facing) - limit) < 1e-9);
  });

  it("brings the hull round for a target dead astern, then fires", () => {
    const { state, ship, target } = shoot(36);
    ship.facing = Math.PI;
    ship.turretFacing = Math.PI;
    for (const t of ship.ship!.turrets) t.facing = Math.PI;
    applyCommand(state, "A", { type: "cmd.attack", ids: [ship.id], targetId: target.id });
    ticks(state, 10);
    assert.equal(shipShells(state, ship.id).length, 0, "blind at first");
    ticks(state, secondsToTicks(16));
    assert.ok(shipShells(state, ship.id).length > 0 || ship.ship!.turrets.some((t) => t.firedTick.some((x) => x != null)));
  });
});

describe("Battle Ship armor", () => {
  it("shrugs off most tank fire, but a torpedo bites", () => {
    const { state, x0, y0 } = bay();
    const ship = spawn(state, "battleship", "A", x0 + 30, y0 + 10);
    ship.holdPosition = true;
    for (const t of ship.ship!.turrets) for (const b of t.barrels) b.ammo = 0;
    for (const m of ship.ship!.ciws) m.ammo = 0;
    assert.ok(catalog("battleship").armorSide > catalog("warden").penetration);
    const sub = spawn(state, "submarine", "B", x0 + 8, y0 + 10);
    sub.facing = 0;
    applyCommand(state, "B", { type: "cmd.attack", ids: [sub.id], targetId: ship.id });
    const hp = ship.hp;
    for (let i = 0; i < 120 && ship.hp === hp; i++) step(state, TICK_DT);
    assert.ok(ship.hp < hp, "the torpedo found it");
  });
});

describe("Battle Ship CIWS", () => {
  it("each mount lays and spends its own belt", () => {
    const { state, x0, y0 } = bay();
    const ship = spawn(state, "battleship", "A", x0 + 20, y0 + 10);
    ship.facing = 0;
    ship.holdPosition = true;
    // A soldier swimming just off the stern: inside both mounts' reach, inside the main guns' minimum.
    const man = spawn(state, "rifleman", "B", x0 + 12, y0 + 10);
    man.holdPosition = true;
    man.hp = man.hpMax = 1_000_000;
    ticks(state, 20);
    const [mid, aft] = ship.ship!.ciws;
    assert.ok(aft!.ammo < BATTLESHIP_CIWS_BELT, "the stern mount fired");
    assert.ok(mid!.ammo < BATTLESHIP_CIWS_BELT, "the superstructure mount fired");
    assert.equal(shipShells(state, ship.id).length, 0, "the main guns held");
  });

  it("an empty mount stays silent while the other keeps firing", () => {
    const { state, x0, y0 } = bay();
    const ship = spawn(state, "battleship", "A", x0 + 20, y0 + 10);
    ship.facing = 0;
    ship.holdPosition = true;
    ship.ship!.ciws[1]!.ammo = 0;
    const man = spawn(state, "rifleman", "B", x0 + 12, y0 + 10);
    man.holdPosition = true;
    man.hp = man.hpMax = 1_000_000;
    ticks(state, 20);
    assert.equal(ship.ship!.ciws[1]!.ammo, 0);
    assert.equal(ship.ship!.ciws[1]!.fireTick, undefined);
    assert.ok(ship.ship!.ciws[0]!.ammo < BATTLESHIP_CIWS_BELT);
  });
});

/** An enemy plane holding station at (x, y), flying. */
function planeOver(state: MatchState, owner: string, x: number, y: number): Entity {
  const plane = makeEntity(state, "stuka", owner, x, y);
  plane.air!.phase = "fly";
  plane.air!.alt = AIR_CRUISE_ALT;
  plane.air!.speed = 1;
  plane.order = { kind: "move", x, y };
  return plane;
}

describe("Battle Ship CIWS against aircraft", () => {
  function station(): { state: MatchState; ship: Entity } {
    const { state, x0, y0 } = bay();
    const ship = spawn(state, "battleship", "A", x0 + 20, y0 + 10);
    ship.facing = 0;
    ship.holdPosition = true;
    return { state, ship };
  }

  it("lays both mounts on a plane overhead and brings it down", () => {
    const { state, ship } = station();
    const plane = planeOver(state, "B", ship.x, ship.y - BATTLESHIP_CIWS_RANGE_TILES * state.tileSize * 0.5);
    let hit = -1;
    for (let i = 0; i < 120 && hit < 0; i++) {
      step(state, TICK_DT);
      if (!state.entities.has(plane.id) || plane.hp < plane.hpMax) hit = i;
    }
    assert.ok(hit >= 0, "rounds reach the plane");
    assert.ok(ship.ship!.ciws.every((m) => m.ammo < BATTLESHIP_CIWS_BELT), "both mounts fired");
    assert.equal(shipShells(state, ship.id).length, 0, "the main guns held");
  });

  it("reaches a plane farther out than a target on the surface, like the CIWS pad", () => {
    const { state, ship } = station();
    const out = BATTLESHIP_CIWS_RANGE_TILES * state.tileSize * (1 + (CIWS_AIR_REACH_MUL - 1) / 2);
    const plane = planeOver(state, "B", ship.x, ship.y - out);
    ticks(state, 10);
    assert.ok(ship.ship!.ciws.some((m) => m.target === plane.id));
  });

  it("an attack order on a plane sticks, the CIWS take it, and the main guns hold", () => {
    const { state, ship } = station();
    const plane = planeOver(state, "B", ship.x + 40, ship.y - BATTLESHIP_CIWS_RANGE_TILES * state.tileSize * 0.5);
    plane.hp = plane.hpMax = 1_000_000;
    const r = applyCommand(state, "A", { type: "cmd.attack", ids: [ship.id], targetId: plane.id });
    assert.equal(r.ok, true);
    ticks(state, 30);
    assert.equal(ship.order?.kind, "attack");
    assert.equal(ship.order?.targetId, plane.id);
    assert.ok(ship.ship!.ciws.every((m) => m.target === plane.id));
    assert.ok(plane.hp < plane.hpMax, "rounds reach the plane");
    assert.equal(shipShells(state, ship.id).length, 0, "the main guns held");
  });

  it("an attack order on a plane goes ahead of a nearer swimmer", () => {
    const { state, ship } = station();
    const man = spawn(state, "rifleman", "B", Math.round(ship.x / state.tileSize) - 3, Math.round(ship.y / state.tileSize));
    man.holdPosition = true;
    man.hp = man.hpMax = 1_000_000;
    const plane = planeOver(state, "B", ship.x, ship.y - BATTLESHIP_CIWS_RANGE_TILES * state.tileSize * 0.8);
    plane.hp = plane.hpMax = 1_000_000;
    applyCommand(state, "A", { type: "cmd.attack", ids: [ship.id], targetId: plane.id });
    ticks(state, 10);
    assert.ok(ship.ship!.ciws.every((m) => m.target === plane.id));
  });

  it("force-attack lays the CIWS on a friendly plane", () => {
    const { state, ship } = station();
    const plane = planeOver(state, "A", ship.x, ship.y - BATTLESHIP_CIWS_RANGE_TILES * state.tileSize * 0.5);
    plane.hp = plane.hpMax = 1_000_000;
    ticks(state, 10);
    assert.ok(ship.ship!.ciws.every((m) => m.ammo === BATTLESHIP_CIWS_BELT), "a friendly plane is left alone");
    applyCommand(state, "A", { type: "cmd.forceattack", ids: [ship.id], x: plane.x, y: plane.y, targetId: plane.id });
    let laid = false;
    let hurt = false;
    for (let i = 0; i < 30; i++) {
      step(state, TICK_DT);
      laid ||= ship.ship!.ciws.some((m) => m.target === plane.id);
      hurt ||= plane.hp < plane.hpMax;
    }
    assert.ok(laid, "a mount laid on it");
    assert.ok(hurt, "rounds reach the plane");
    assert.equal(shipShells(state, ship.id).length, 0, "the main guns held");
  });
});

describe("Battle Ship spotlight", () => {
  it("carries a searchlight like the Watch Tower, and no submarine carries a lamp at all", () => {
    assert.equal(hasSpotlight("battleship"), true);
    assert.equal(hasHeadlight("submarine"), false);
    assert.equal(hasSpotlight("submarine"), false);
  });

  it("Rotate light swings the lamp at the lamp's pace, and leaves the hull and its course alone", () => {
    const { state, x0, y0 } = bay();
    const ship = spawn(state, "battleship", "A", x0 + 20, y0 + 10);
    ship.facing = 0;
    ship.holdPosition = true;
    step(state, TICK_DT);
    assert.equal(snapshotFor(state, "A").entities.find((e) => e.id === ship.id)!.spotFacing, 0, "it rests over the bow");
    const r = applyCommand(state, "A", { type: "cmd.rotate", ids: [ship.id], x: ship.x, y: ship.y + 100, light: true });
    assert.equal(r.ok, true);
    assert.equal(ship.order?.kind === "rotate", false, "the hull was not told to turn");
    ticks(state, secondsToTicks(90 / SPOTLIGHT_TURN_DEG_PER_SEC) + 2);
    assert.ok(Math.abs((ship.spotFacing ?? 0) - Math.PI / 2) < 1e-6, "the beam points where it was sent");
    assert.equal(ship.facing, 0);
  });

  it("plain Rotate turns the hull and the lamp turns with it", () => {
    const { state, x0, y0 } = bay();
    const ship = spawn(state, "battleship", "A", x0 + 20, y0 + 10);
    ship.facing = 0;
    ship.holdPosition = true;
    applyCommand(state, "A", { type: "cmd.rotate", ids: [ship.id], x: ship.x, y: ship.y + 100, light: true });
    ticks(state, secondsToTicks(90 / SPOTLIGHT_TURN_DEG_PER_SEC) + 2);
    applyCommand(state, "A", { type: "cmd.rotate", ids: [ship.id], x: ship.x + 100, y: ship.y - 100 });
    ticks(state, secondsToTicks(180 / catalog("battleship").turnDegPerSec));
    const turned = ship.facing;
    assert.ok(Math.abs(turned) > 0.05, "the hull came round");
    assert.equal(ship.spotAim, undefined, "the lamp was not sent anywhere");
    assert.ok(Math.abs((ship.spotFacing ?? 0) - (Math.PI / 2 + turned)) < 1e-6, "it is carried with the hull");
  });

  it("a crit on the lamp darkens it", () => {
    const { state, x0, y0 } = bay();
    const ship = spawn(state, "battleship", "A", x0 + 20, y0 + 10);
    ship.crits = ["lamp"];
    step(state, TICK_DT);
    assert.equal(snapshotFor(state, "A").entities.find((e) => e.id === ship.id)!.spotFacing, undefined);
  });
});

describe("Battle Ship rearm", () => {
  it("fills again only beside a friendly Marine Base", () => {
    const { state, x0, y0 } = bay();
    const ship = spawn(state, "battleship", "A", x0 + 20, y0 + 10);
    ship.holdPosition = true;
    const b = ship.ship!.turrets[0]!.barrels[0]!;
    b.ammo = 0;
    ship.ship!.ciws[0]!.ammo = 0;
    ticks(state, secondsToTicks(BATTLESHIP_REARM_SECONDS) + 2);
    assert.equal(b.ammo, 0, "no base, no shells");
    makeEntity(state, "dock", "A", tileCenter(x0 + 26, state.tileSize), tileCenter(y0 + 10, state.tileSize), {
      tileX: x0 + 26,
      tileY: y0 + 8,
    });
    ticks(state, secondsToTicks(BATTLESHIP_REARM_SECONDS) + 2);
    assert.equal(b.ammo, 1);
    assert.ok(ship.ship!.ciws[0]!.ammo > 0);
  });
});

describe("Battle Ship on the wire", () => {
  it("sends turret and mount facings to everyone, shells and belts only to its side", () => {
    const { state, ship, target } = shoot(36);
    applyCommand(state, "A", { type: "cmd.attack", ids: [ship.id], targetId: target.id });
    ticks(state, 30);
    const mine = snapshotFor(state, "A").entities.find((e) => e.id === ship.id)!;
    assert.equal(mine.ship!.turrets.length, 2);
    assert.equal(mine.ship!.turrets[0]!.ammo!.length, 3);
    assert.equal(typeof mine.ship!.ciws[0]!.ammo, "number");
    const shell = snapshotFor(state, "A").projectiles.find((p) => p.fromId === ship.id);
    if (shell) assert.equal(typeof shell.shipBarrel, "number");
    state.visionTick = -1;
    const theirs = snapshotFor(state, "B").entities.find((e) => e.id === ship.id);
    if (theirs) {
      assert.equal(theirs.ship!.turrets[0]!.ammo, undefined);
      assert.equal(theirs.ship!.ciws[0]!.ammo, undefined);
    }
  });
});
