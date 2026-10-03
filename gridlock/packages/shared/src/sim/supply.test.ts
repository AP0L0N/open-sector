import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DRIVER_KILL_CHANCE,
  SUPPLY_CARGO,
  SUPPLY_SEEK_TILES,
  SUPPLY_REGEN_PER_SEC,
  TRUCK_RIDER_HP_MUL,
  TRUCK_SEATS,
  WALKER_BELT,
  catalog,
  isInfantryType,
  isMotorVehicle,
  supplyShortOf,
  weaponFitsTruck,
  infantryGunById,
  MINE_DISABLE_SECONDS,
  MINE_SCRAP,
  TICK_DT,
  type EntityType,
} from "../catalog.js";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import { TILE_EMPTY } from "../maps.js";
import { applyCommand } from "./commands.js";
import { makeEntity, tileCenter } from "./geo.js";
import { createMatch, step } from "./match.js";
import { snapshotFor } from "./snapshot.js";
import { noteSupplyHit, supplyBodies, supplyHasDriver, supplyShooter } from "./supply.js";
import type { MatchState, Order } from "./types.js";

function match(): { state: MatchState; a: string; b: string } {
  const r = createRoom({
    id: "SP",
    hostId: "A",
    hostName: "Alpha",
    mapId: "yard-64",
    maxSlots: 8,
  });
  if (!r.ok) throw new Error(r.message);
  const room = r.value;
  assert.equal(joinRoom(room, "B", "Bravo").ok, true);
  updateSelf(room, "A", { ready: true, spawnId: 1, team: 0 });
  updateSelf(room, "B", { ready: true, spawnId: 4, team: 0 });
  const started = startMatch(room, "A");
  if (!started.ok) throw new Error(started.message);
  return { state: createMatch(room, started.value), a: "A", b: "B" };
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

function ticks(state: MatchState, n: number): void {
  for (let i = 0; i < n; i++) step(state, TICK_DT);
}

describe("supply truck", () => {
  it("is a light armored Armory truck and not part of the opening army", () => {
    const s = catalog("supply");
    assert.equal(s.name, "Supply Truck");
    assert.equal(s.letter, "V");
    assert.equal(isInfantryType("supply"), false);
    assert.equal(isMotorVehicle("supply"), true);
    assert.equal(s.turnInPlace, true);
    assert.ok(s.armorFront > s.armorSide && s.armorSide >= s.armorRear);
    assert.ok(s.armorFront < catalog("walker").armorFront);
    assert.equal(s.ammo, undefined);
    const { state, a } = match();
    assert.equal([...state.entities.values()].some((e) => e.type === "supply"), false);
    const trained = applyCommand(state, a, { type: "cmd.train", unit: "supply" });
    assert.equal(trained.ok, false);
    if (!trained.ok) assert.equal(trained.message, "Need an Armory.");
    assert.equal(weaponFitsTruck(infantryGunById("rifle")), true);
    assert.equal(weaponFitsTruck(infantryGunById("handgun")), true);
    assert.equal(weaponFitsTruck(infantryGunById("assault")), true);
    assert.equal(weaponFitsTruck(infantryGunById("mg42")), true);
    assert.equal(weaponFitsTruck(infantryGunById("scoped")), true);
    assert.equal(weaponFitsTruck(infantryGunById("ptrd")), true);
    assert.equal(weaponFitsTruck(infantryGunById("launcher")), true);
    assert.equal(weaponFitsTruck(infantryGunById("penetrator")), true);
    assert.equal(weaponFitsTruck(infantryGunById("flamer")), true);
    assert.equal(weaponFitsTruck(infantryGunById("mortar")), false);
    assert.equal(weaponFitsTruck({ id: "gatling" }), false);
    assert.equal(supplyShortOf("rifleman", undefined, undefined, 0), false);
    assert.equal(supplyShortOf("warden", { ap: 0 }, 0, undefined), true);
    assert.equal(supplyShortOf("walker", undefined, undefined, 0), true);
  });

  it("starts with a factory driver and one free seat", () => {
    const { state, a } = match();
    clearPad(state, 30, 30, 50, 50);
    const ts = state.tileSize;
    const truck = makeEntity(state, "supply", a, tileCenter(40, ts), tileCenter(40, ts));
    assert.equal(truck.crew, true);
    assert.equal(truck.supply, SUPPLY_CARGO);
    assert.equal(supplyBodies(state, truck), 1);
    assert.equal(supplyHasDriver(state, truck), true);
    assert.equal(TRUCK_SEATS, 2);
    const first = makeEntity(state, "rifleman", a, tileCenter(42, ts), tileCenter(40, ts));
    const second = makeEntity(state, "rifleman", a, tileCenter(38, ts), tileCenter(40, ts));
    assert.equal(applyCommand(state, a, { type: "cmd.board", ids: [first.id, second.id], truckId: truck.id }).ok, true);
    ticks(state, 5);
    const aboard = [first, second].filter((e) => e.garrisonedIn === truck.id);
    assert.equal(aboard.length, 1);
    assert.equal(supplyBodies(state, truck), 2);
    assert.equal(truck.crew, true);
    const unload = applyCommand(state, a, { type: "cmd.unboard", truckId: truck.id });
    assert.equal(unload.ok, true);
    assert.equal(supplyBodies(state, truck), 1);
    assert.equal(truck.crew, true);
    const stayed = applyCommand(state, a, { type: "cmd.unboard", truckId: truck.id });
    assert.equal(stayed.ok, false);
    if (!stayed.ok) assert.match(stayed.message, /cannot dismount/i);
  });

  it("slowly scrounges its cargo back on its own, up to a full load", () => {
    const { state, a } = match();
    clearPad(state, 30, 30, 50, 50);
    const ts = state.tileSize;
    const truck = makeEntity(state, "supply", a, tileCenter(40, ts), tileCenter(40, ts));
    truck.supply = 0;
    const secs = 10;
    ticks(state, Math.round(secs / TICK_DT));
    assert.ok(Math.abs(truck.supply - SUPPLY_REGEN_PER_SEC * secs) < 0.01);
    truck.supply = SUPPLY_CARGO - 0.1;
    ticks(state, Math.round(secs / TICK_DT));
    assert.equal(truck.supply, SUPPLY_CARGO);
  });

  it("stays parked after a soldier boards", () => {
    const { state, a } = match();
    clearPad(state, 30, 30, 50, 50);
    const ts = state.tileSize;
    const truck = makeEntity(state, "supply", a, tileCenter(40, ts), tileCenter(40, ts));
    const rifle = makeEntity(state, "rifleman", a, tileCenter(43, ts), tileCenter(40, ts));
    assert.equal(applyCommand(state, a, { type: "cmd.board", ids: [rifle.id], truckId: truck.id }).ok, true);
    ticks(state, 20);
    assert.equal(rifle.garrisonedIn, truck.id);
    const x = truck.x;
    const y = truck.y;
    ticks(state, 60);
    assert.equal(truck.x, x);
    assert.equal(truck.y, y);
    assert.equal(truck.state, "idle");
  });

  it("lets the passenger out while the factory driver stays, and the passenger can shoot a rifle", () => {
    const { state, a, b } = match();
    clearPad(state, 20, 20, 60, 60);
    const ts = state.tileSize;
    const truck = makeEntity(state, "supply", a, tileCenter(40, ts), tileCenter(40, ts));
    const rifle = makeEntity(state, "rifleman", a, tileCenter(42, ts), tileCenter(40, ts));
    const gunner = makeEntity(state, "gunner", a, tileCenter(36, ts), tileCenter(40, ts));
    assert.equal(applyCommand(state, a, { type: "cmd.board", ids: [rifle.id], truckId: truck.id }).ok, true);
    ticks(state, 3);
    assert.equal(rifle.garrisonedIn, truck.id);
    assert.equal(rifle.hpMax, Math.round(catalog("rifleman").hp * TRUCK_RIDER_HP_MUL));
    assert.equal(supplyShooter(state, truck)?.id, rifle.id);
    const out = applyCommand(state, a, { type: "cmd.unboard", truckId: truck.id });
    assert.equal(out.ok, true);
    assert.equal(rifle.garrisonedIn, null);
    assert.equal(truck.crew, true);
    assert.equal(supplyBodies(state, truck), 1);
    assert.equal(rifle.hpMax, catalog("rifleman").hp);

    assert.equal(applyCommand(state, a, { type: "cmd.board", ids: [gunner.id], truckId: truck.id }).ok, true);
    ticks(state, 3);
    assert.equal(gunner.garrisonedIn, truck.id);
    assert.equal(supplyShooter(state, truck)?.id, gunner.id);
    assert.equal(truck.crew, true);
    assert.equal(applyCommand(state, a, { type: "cmd.unboard", truckId: truck.id }).ok, true);

    rifle.x = tileCenter(38, ts);
    rifle.y = tileCenter(40, ts);
    assert.equal(applyCommand(state, a, { type: "cmd.board", ids: [rifle.id], truckId: truck.id }).ok, true);
    ticks(state, 3);
    assert.equal(supplyShooter(state, truck)?.id, rifle.id);
    const foe = makeEntity(state, "rifleman", b, tileCenter(44, ts), tileCenter(40, ts));
    truck.facing = Math.PI;
    const foeHp = foe.hp;
    ticks(state, 20);
    assert.ok(foe.hp < foeHp, `passenger rifle did not hit, foe hp ${foe.hp}`);
  });

  it("lets a gunner, sniper, anti-tank rifle, rocketer, pyro, and jump jet fire from the bed", () => {
    const bed: readonly EntityType[] = ["gunner", "sniper", "atinfantry", "rocketer", "pyro", "jumpjet"];
    for (const type of bed) {
      const { state, a, b } = match();
      clearPad(state, 20, 20, 60, 60);
      const ts = state.tileSize;
      const truck = makeEntity(state, "supply", a, tileCenter(40, ts), tileCenter(40, ts));
      const man = makeEntity(state, type, a, tileCenter(38, ts), tileCenter(40, ts));
      assert.equal(applyCommand(state, a, { type: "cmd.board", ids: [man.id], truckId: truck.id }).ok, true);
      ticks(state, 5);
      assert.equal(man.garrisonedIn, truck.id, type);
      assert.equal(supplyShooter(state, truck)?.id, man.id, type);
      const foe = makeEntity(state, "rifleman", b, tileCenter(44, ts), tileCenter(40, ts));
      foe.clip = 0;
      foe.reload = 999;
      truck.facing = Math.PI;
      const belt = man.clip;
      ticks(state, 40);
      assert.ok(man.clip < belt, `${type} did not fire from the bed (clip ${man.clip})`);
      assert.equal(truck.crew, true);
    }
  });

  it("keeps a mortar and a cyborg gatling slung in the bed", () => {
    for (const type of ["mortarman", "cyborg"] as const) {
      const { state, a, b } = match();
      clearPad(state, 20, 20, 60, 60);
      const ts = state.tileSize;
      const truck = makeEntity(state, "supply", a, tileCenter(40, ts), tileCenter(40, ts));
      const man = makeEntity(state, type, a, tileCenter(38, ts), tileCenter(40, ts));
      assert.equal(applyCommand(state, a, { type: "cmd.board", ids: [man.id], truckId: truck.id }).ok, true);
      ticks(state, 5);
      assert.equal(supplyShooter(state, truck)?.id, man.id, type);
      const foe = makeEntity(state, "rifleman", b, tileCenter(44, ts), tileCenter(40, ts));
      foe.clip = 0;
      foe.reload = 999;
      const belt = man.clip;
      ticks(state, 30);
      assert.equal(man.clip, belt, `${type} fired from the bed`);
      assert.equal(
        state.projectiles.some((p) => p.fromId === man.id),
        false,
        `${type} launched from the bed`,
      );
    }
  });

  it("shows the riders' hit-point bars beside the truck to anyone who can see it", () => {
    const { state, a, b } = match();
    clearPad(state, 20, 20, 60, 60);
    const ts = state.tileSize;
    const truck = makeEntity(state, "supply", a, tileCenter(40, ts), tileCenter(40, ts));
    const rifle = makeEntity(state, "rifleman", a, tileCenter(42, ts), tileCenter(40, ts));
    assert.equal(applyCommand(state, a, { type: "cmd.board", ids: [rifle.id], truckId: truck.id }).ok, true);
    ticks(state, 5);
    rifle.hp = Math.max(1, Math.floor(rifle.hpMax / 2));
    const yours = snapshotFor(state, a).entities.find((e) => e.id === truck.id);
    assert.equal(yours?.garrison?.count, 1);
    assert.equal(yours?.garrison?.cap, TRUCK_SEATS);
    assert.equal(yours?.garrison?.ownerId, a);
    assert.equal(yours?.garrison?.hide, undefined);
    assert.deepEqual(yours?.garrison?.bars, [{ hp: rifle.hp, hpMax: rifle.hpMax }]);
    assert.ok(yours?.bed);
    truck.x = 90 * ts;
    truck.y = 90 * ts;
    rifle.x = truck.x;
    rifle.y = truck.y;
    makeEntity(state, "rifleman", b, truck.x + ts, truck.y);
    state.visionTick = -1;
    const seen = snapshotFor(state, b).entities.find((e) => e.id === truck.id);
    assert.equal(seen?.garrison?.bars?.length, 1);
    assert.equal(seen?.garrison?.bars?.[0]?.hp, rifle.hp);
    assert.equal(
      snapshotFor(state, b).entities.some((e) => e.garrisonedIn === truck.id),
      false,
    );
  });

  it("kills the driver on a front bullet and lets either side take the truck", () => {
    const { state, a, b } = match();
    clearPad(state, 20, 20, 70, 70);
    const ts = state.tileSize;
    const truck = makeEntity(state, "supply", a, tileCenter(40, ts), tileCenter(40, ts));
    const x0 = truck.x;
    for (let i = 0; i < 40; i++) noteSupplyHit(state, truck, "side", true, 0);
    assert.equal(truck.crew, true);
    let front = 0;
    while (truck.crew && front < 80) {
      noteSupplyHit(state, truck, "front", true, 0);
      front++;
    }
    assert.equal(truck.crew, false, `driver survived ${front} front bullets at ${DRIVER_KILL_CHANCE}`);
    assert.equal(supplyHasDriver(state, truck), false);
    const held = applyCommand(state, a, { type: "cmd.move", ids: [truck.id], x: truck.x + 40, y: truck.y });
    assert.equal(held.ok, false);
    ticks(state, 8);
    assert.equal(truck.x, x0);

    const foe = makeEntity(state, "rifleman", b, tileCenter(42, ts), tileCenter(40, ts));
    assert.equal(applyCommand(state, b, { type: "cmd.board", ids: [foe.id], truckId: truck.id }).ok, true);
    ticks(state, 3);
    assert.equal(truck.ownerId, b);
    assert.equal(foe.garrisonedIn, truck.id);
    assert.equal(supplyHasDriver(state, truck), true);
    const friend = makeEntity(state, "rifleman", b, tileCenter(38, ts), tileCenter(40, ts));
    assert.equal(applyCommand(state, b, { type: "cmd.board", ids: [friend.id], truckId: truck.id }).ok, true);
    ticks(state, 3);
    assert.equal(supplyShooter(state, truck)?.id, friend.id);
    assert.equal(supplyBodies(state, truck), 2);

    const leave = applyCommand(state, b, { type: "cmd.unboard", truckId: truck.id });
    assert.equal(leave.ok, true);
    assert.equal(foe.garrisonedIn, null);
    assert.equal(friend.garrisonedIn, null);
    assert.equal(supplyHasDriver(state, truck), false);
    assert.equal(truck.crew, false);
  });

  it("wounds riders less from the side and rear than from the front", () => {
    const { state, a } = match();
    clearPad(state, 20, 20, 70, 70);
    const ts = state.tileSize;
    const frontTruck = makeEntity(state, "supply", a, tileCenter(30, ts), tileCenter(40, ts));
    const sideTruck = makeEntity(state, "supply", a, tileCenter(50, ts), tileCenter(40, ts));
    frontTruck.crew = false;
    sideTruck.crew = false;
    const frontRider = makeEntity(state, "rifleman", a, tileCenter(32, ts), tileCenter(40, ts));
    const sideRider = makeEntity(state, "rifleman", a, tileCenter(52, ts), tileCenter(40, ts));
    assert.equal(applyCommand(state, a, { type: "cmd.board", ids: [frontRider.id], truckId: frontTruck.id }).ok, true);
    assert.equal(applyCommand(state, a, { type: "cmd.board", ids: [sideRider.id], truckId: sideTruck.id }).ok, true);
    ticks(state, 3);
    const frontBefore = frontRider.hp;
    const sideBefore = sideRider.hp;
    noteSupplyHit(state, frontTruck, "front", false, 20);
    noteSupplyHit(state, sideTruck, "side", false, 20);
    const frontLoss = frontBefore - frontRider.hp;
    const sideLoss = sideBefore - sideRider.hp;
    assert.ok(frontLoss > sideLoss, `front ${frontLoss} side ${sideLoss}`);
    const rearBefore = sideRider.hp;
    noteSupplyHit(state, sideTruck, "rear", false, 20);
    assert.ok(sideRider.hp < rearBefore);
    assert.ok(rearBefore - sideRider.hp < frontLoss);
  });

  it("refills tank racks and a Walker backpack, and restocks at an Armory", () => {
    const { state, a } = match();
    clearPad(state, 20, 20, 80, 80);
    const ts = state.tileSize;
    const truck = makeEntity(state, "supply", a, tileCenter(40, ts), tileCenter(40, ts));
    const tank = makeEntity(state, "warden", a, tileCenter(43, ts), tileCenter(40, ts));
    const walker = makeEntity(state, "walker", a, tileCenter(40, ts), tileCenter(44, ts));
    tank.ammo = { ap: 0, he: 0, heat: 0, smoke: 0 };
    tank.mgAmmo = 0;
    walker.clip = 0;
    const rifle = makeEntity(state, "rifleman", a, tileCenter(36, ts), tileCenter(40, ts));
    rifle.clip = 0;
    const cargo = truck.supply;
    assert.equal(applyCommand(state, a, { type: "cmd.supply", ids: [truck.id], targetId: rifle.id }).ok, false);
    assert.equal(applyCommand(state, a, { type: "cmd.supply", ids: [truck.id], targetId: tank.id }).ok, true);
    ticks(state, 40);
    assert.ok((tank.ammo.ap ?? 0) > 0, `ap ${tank.ammo.ap}`);
    assert.ok(truck.supply < cargo);
    assert.equal(applyCommand(state, a, { type: "cmd.supply", ids: [truck.id], targetId: walker.id }).ok, true);
    ticks(state, 30);
    assert.ok(walker.clip > 0 && walker.clip <= WALKER_BELT, `clip ${walker.clip}`);

    truck.supply = 0;
    const armory = makeEntity(state, "armory", a, tileCenter(60, ts), tileCenter(60, ts));
    truck.x = armory.x;
    truck.y = armory.y + 12;
    truck.waypoints = [];
    assert.equal(applyCommand(state, a, { type: "cmd.supply", ids: [truck.id], targetId: armory.id }).ok, true);
    ticks(state, 15);
    assert.ok(truck.supply > 0, `supply ${truck.supply}`);
  });

  it("drives to allies short of ammo nearby on its own, like a medic", () => {
    const { state, a } = match();
    clearPad(state, 20, 20, 80, 80);
    const ts = state.tileSize;
    const truck = makeEntity(state, "supply", a, tileCenter(40, ts), tileCenter(40, ts));
    const tank = makeEntity(state, "warden", a, tileCenter(50, ts), tileCenter(40, ts));
    tank.ammo = { ap: 0, he: 0, heat: 0, smoke: 0 };
    tank.mgAmmo = 0;
    ticks(state, 2);
    assert.equal(truck.order?.kind, "supply");
    assert.equal(truck.order?.auto, true);
    assert.equal(truck.order?.targetId, tank.id);
    ticks(state, 80);
    assert.ok((tank.ammo.ap ?? 0) > 0, `ap ${tank.ammo.ap}`);
  });

  it("ignores enemies and allies past its seek range, and follows a player move order", () => {
    const { state, a, b } = match();
    clearPad(state, 20, 20, 80, 80);
    const ts = state.tileSize;
    const truck = makeEntity(state, "supply", a, tileCenter(30, ts), tileCenter(40, ts));
    const far = makeEntity(state, "warden", a, tileCenter(30 + SUPPLY_SEEK_TILES + 4, ts), tileCenter(40, ts));
    far.ammo = { ap: 0, he: 0, heat: 0, smoke: 0 };
    const foe = makeEntity(state, "warden", b, tileCenter(34, ts), tileCenter(40, ts));
    foe.ammo = { ap: 0, he: 0, heat: 0, smoke: 0 };
    ticks(state, 10);
    assert.equal(truck.order, null);
    assert.equal(far.ammo.ap, 0);
    assert.equal(foe.ammo.ap, 0);
    foe.hp = 0;
    state.entities.delete(foe.id);

    const near = makeEntity(state, "warden", a, tileCenter(30, ts), tileCenter(36, ts));
    near.ammo = { ap: 0, he: 0, heat: 0, smoke: 0 };
    const res = applyCommand(state, a, { type: "cmd.move", ids: [truck.id], x: tileCenter(30, ts), y: tileCenter(46, ts) });
    assert.equal(res.ok, true, res.ok ? "" : res.message);
    ticks(state, 3);
    const order = truck.order as Order | null;
    assert.equal(order?.kind, "move");
  });

  it("stays put with an empty bed", () => {
    const { state, a } = match();
    clearPad(state, 20, 20, 80, 80);
    const ts = state.tileSize;
    const truck = makeEntity(state, "supply", a, tileCenter(40, ts), tileCenter(40, ts));
    truck.supply = 0;
    const tank = makeEntity(state, "warden", a, tileCenter(44, ts), tileCenter(40, ts));
    tank.ammo = { ap: 0, he: 0, heat: 0, smoke: 0 };
    ticks(state, 10);
    assert.equal(truck.order, null);
  });

  it("disables a mine for scrap without setting that mine off", () => {
    const { state, a } = match();
    clearPad(state, 10, 10, 50, 50);
    const ts = state.tileSize;
    const x = tileCenter(24, ts);
    const y = tileCenter(24, ts);
    const mineId = state.nextId++;
    state.mines.push({ id: mineId, ownerId: "B", x, y, arm: 0, life: 300 });
    const truck = makeEntity(state, "supply", a, x + 28, y);
    const scrap = state.players.get(a)!.scrap;
    const hp = truck.hp;
    const denied = applyCommand(state, a, { type: "cmd.disable", ids: [truck.id], mineId: mineId + 9 });
    assert.equal(denied.ok, false);
    const r = applyCommand(state, a, { type: "cmd.disable", ids: [truck.id], mineId });
    assert.equal(r.ok, true, r.ok ? "" : r.message);
    ticks(state, 5);
    assert.equal(state.mines.length, 1);
    assert.ok((snapshotFor(state, a).mines.find((m) => m.id === mineId)?.disarm ?? 0) > 0);
    assert.equal(state.players.get(a)!.scrap, scrap);
    assert.equal(truck.hp, hp);
    ticks(state, Math.ceil(MINE_DISABLE_SECONDS / TICK_DT));
    assert.equal(state.mines.length, 0);
    assert.equal(state.players.get(a)!.scrap, scrap + MINE_SCRAP);
    assert.equal(truck.hp, hp);
    assert.notEqual(truck.order?.kind, "disable");
  });
});
