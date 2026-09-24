import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DRIVER_KILL_CHANCE,
  SUPPLY_CARGO,
  TRUCK_RIDER_HP_MUL,
  TRUCK_SEATS,
  WALKER_BELT,
  catalog,
  isInfantryType,
  isMotorVehicle,
  supplyShortOf,
  weaponFitsTruck,
  infantryGunById,
  TICK_DT,
} from "../catalog.js";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import { TILE_EMPTY } from "../maps.js";
import { applyCommand } from "./commands.js";
import { makeEntity, tileCenter } from "./geo.js";
import { createMatch, step } from "./match.js";
import { noteSupplyHit, supplyBodies, supplyHasDriver, supplyShooter } from "./supply.js";
import type { MatchState } from "./types.js";

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
  return { state: createMatch(room, started.value, { startingUnits: false }), a: "A", b: "B" };
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
    assert.equal(weaponFitsTruck(infantryGunById("mg42")), false);
    assert.equal(weaponFitsTruck(infantryGunById("scoped")), false);
    assert.equal(weaponFitsTruck(infantryGunById("ptrd")), false);
    assert.equal(weaponFitsTruck(infantryGunById("mortar")), false);
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
    const belt = gunner.clip;
    ticks(state, 12);
    assert.equal(gunner.clip, belt);
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
});
