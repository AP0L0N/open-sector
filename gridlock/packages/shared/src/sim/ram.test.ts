import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AIR_CRUISE_ALT,
  BUILDING_TYPES,
  CIWS_RANGE_TILES,
  DRONE_HIGH_ALT,
  DRONE_STRIKE_ALT,
  DRONE_SURVEIL_ALT,
  NEBELWERFER_RANGE_TILES,
  NEBELWERFER_ROCKET,
  RAM_INTERCEPT_CHANCE,
  RAM_RANGE_TILES,
  RAM_ROCKET,
  RAM_ROCKET_AMMO,
  SUPPLY_CARGO,
  TICK_DT,
  TITAN_ROCKET,
  catalog,
  hasTurret,
  launcherOnlyOf,
  radarLaidOf,
  rocketAmmoOf,
  rocketRackOf,
  supplyShortOf,
  isCivilianType,
} from "../catalog.js";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import { TILE_EMPTY } from "../maps.js";
import { applyCommand } from "./commands.js";
import { reachesDrone } from "./drone.js";
import { destroyEntity, makeEntity, playerTeam, tileCenter } from "./geo.js";
import { createMatch, step } from "./match.js";
import { snapshotFor } from "./snapshot.js";
import type { Entity, MatchState, Projectile } from "./types.js";

function match(): MatchState {
  const r = createRoom({ id: "RAM1", hostId: "A", hostName: "Alpha", mapId: "yard-64", maxSlots: 8 });
  if (!r.ok) throw new Error(r.message);
  const room = r.value;
  assert.equal(joinRoom(room, "B", "Bravo").ok, true);
  updateSelf(room, "A", { ready: true, spawnId: 1 });
  updateSelf(room, "B", { ready: true, spawnId: 4 });
  const started = startMatch(room, "A", () => 0);
  if (!started.ok) throw new Error(started.message);
  const state = createMatch(room, started.value);
  // Flat, open ground in the middle of the map: nothing blocks sight or shots.
  // The village on the crossroads goes too.
  for (const e of [...state.entities.values()]) {
    if (isCivilianType(e.type)) destroyEntity(state, e);
  }
  for (let y = 60; y <= 170; y++) {
    for (let x = 90; x <= 170; x++) {
      const i = y * state.width + x;
      state.terrain[i] = TILE_EMPTY;
      state.blocked[i] = 0;
      state.occupy[i] = 0;
      state.heights[i] = 0;
    }
  }
  return state;
}

function ticks(state: MatchState, n: number): void {
  for (let i = 0; i < n && !state.ended; i++) step(state, TICK_DT);
}

function until(state: MatchState, max: number, done: () => boolean): number {
  for (let i = 0; i < max; i++) {
    if (done()) return i;
    step(state, TICK_DT);
  }
  return -1;
}

/** A's RAM with its footprint's corner on (tx, ty). */
function seedRam(state: MatchState, tx = 120, ty = 120, owner = "A"): Entity {
  const ts = state.tileSize;
  const def = catalog("ram");
  return makeEntity(state, "ram", owner, (tx + def.tileW / 2) * ts, (ty + def.tileH / 2) * ts, {
    tileX: tx,
    tileY: ty,
  });
}

function seedCiws(state: MatchState, tx: number, ty: number): Entity {
  const ts = state.tileSize;
  const def = catalog("ciws");
  return makeEntity(state, "ciws", "A", (tx + def.tileW / 2) * ts, (ty + def.tileH / 2) * ts, { tileX: tx, tileY: ty });
}

function planeOver(state: MatchState, owner: string, x: number, y: number): Entity {
  const plane = makeEntity(state, "stuka", owner, x, y);
  plane.air!.phase = "fly";
  plane.air!.alt = AIR_CRUISE_ALT;
  plane.air!.speed = 1;
  plane.order = { kind: "move", x, y };
  return plane;
}

/** A rocket at (x, y), flying east, fused far enough out that it is still in the air next tick. */
function rocket(state: MatchState, ownerId: string, x: number, y: number): Projectile {
  const p: Projectile = {
    id: state.nextId++,
    ownerId,
    team: playerTeam(state, ownerId),
    x,
    y,
    vx: 400,
    vy: 0,
    damage: TITAN_ROCKET.damage,
    penetration: TITAN_ROCKET.penetration,
    caliber: TITAN_ROCKET.caliber,
    life: 0.5,
    ignoreId: -1,
    fromId: -1,
    bounced: false,
    shell: null,
    flight: "rocket",
    landX: x + 200,
    landY: y,
    flightTime: 0.5,
    z: 40,
    vz: 0,
  };
  state.projectiles.push(p);
  return p;
}

function ramRockets(state: MatchState, ram: Entity): Projectile[] {
  return state.projectiles.filter((p) => p.fromId === ram.id && p.flight === "rocket");
}

describe("RAM catalog", () => {
  it("is a radar-laid structure whose only weapon is a rack of rockets only a truck refills", () => {
    const def = catalog("ram");
    assert.equal(def.kind, "building");
    assert.ok(BUILDING_TYPES.includes("ram"));
    assert.ok(def.power < 0, "draws power");
    assert.ok(def.cost > 0 && def.buildSeconds > 0);
    assert.equal(radarLaidOf("ram"), true);
    assert.equal(launcherOnlyOf("ram"), true);
    assert.equal(hasTurret("ram"), true);
    assert.equal(rocketAmmoOf("ram"), RAM_ROCKET_AMMO);
    assert.equal(rocketRackOf("ram"), RAM_ROCKET);
    assert.equal(RAM_ROCKET.antiAir, true, "lays on planes");
    assert.equal(supplyShortOf("ram", {}, 0, 0, RAM_ROCKET_AMMO), false);
    assert.equal(supplyShortOf("ram", {}, 0, 0, RAM_ROCKET_AMMO - 1), true);
  });

  it("reaches past a CIWS but short of a Nebelwerfer, and scatters far tighter", () => {
    assert.ok(RAM_RANGE_TILES > CIWS_RANGE_TILES);
    assert.ok(RAM_RANGE_TILES < NEBELWERFER_RANGE_TILES / 2);
    assert.ok(RAM_ROCKET.scatterNearTiles < NEBELWERFER_ROCKET.scatterNearTiles / 3);
    assert.ok(RAM_ROCKET.scatterFarTiles < NEBELWERFER_ROCKET.scatterFarTiles / 3);
    assert.ok((RAM_ROCKET.volleyMax ?? 1) > 1, "a barrage, not one rocket at a time");
    assert.equal(RAM_ROCKET.apexFar, undefined, "flies straight");
  });

  it("is queued and placed from the construction yard with a full rack", () => {
    const state = match();
    const ts = state.tileSize;
    state.players.get("A")!.scrap = 50_000;
    makeEntity(state, "core", "A", tileCenter(120, ts), tileCenter(120, ts), { tileX: 118, tileY: 118 });
    const d = catalog("dynamo");
    makeEntity(state, "dynamo", "A", (110 + d.tileW / 2) * ts, (110 + d.tileH / 2) * ts, { tileX: 110, tileY: 110 });
    assert.equal(applyCommand(state, "A", { type: "cmd.build", building: "ram" }).ok, true);
    const t = until(state, 900, () => state.players.get("A")!.defence?.ready === true);
    assert.ok(t >= 0, "the RAM finishes building");
    assert.equal(applyCommand(state, "A", { type: "cmd.place", building: "ram", tx: 132, ty: 120 }).ok, true);
    const placed = [...state.entities.values()].find((e) => e.type === "ram");
    assert.ok(placed);
    assert.equal(placed.rockets, RAM_ROCKET_AMMO, "comes with a full rack");
  });
});

describe("RAM fire", () => {
  it("fires a barrage on its own at an enemy soldier in reach and kills him", () => {
    const state = match();
    const ts = state.tileSize;
    const ram = seedRam(state);
    const soldier = makeEntity(state, "rifleman", "B", ram.x + 30 * ts, ram.y);
    soldier.holdPosition = true;
    let most = 0;
    const t = until(state, 200, () => {
      most = Math.max(most, ramRockets(state, ram).length);
      return soldier.hp <= 0 || !state.entities.has(soldier.id);
    });
    assert.ok(t >= 0, "the soldier goes down");
    assert.ok((ram.rockets ?? 0) < RAM_ROCKET_AMMO, `rack ${ram.rockets}`);
    assert.ok(most >= 2, `several rockets in the air at once (${most})`);
    assert.ok(Math.abs(ram.turretFacing) < 0.2, "the launcher swung east onto him");
  });

  it("lands its rockets tight around the aim point", () => {
    const state = match();
    const ts = state.tileSize;
    const ram = seedRam(state);
    const soldier = makeEntity(state, "rifleman", "B", ram.x + 40 * ts, ram.y);
    soldier.holdPosition = true;
    soldier.hp = 1e6;
    soldier.hpMax = 1e6;
    const lands: { x: number; y: number }[] = [];
    const seen = new Set<number>();
    until(state, 120, () => {
      for (const p of ramRockets(state, ram)) {
        if (seen.has(p.id)) continue;
        seen.add(p.id);
        lands.push({ x: p.landX!, y: p.landY! });
      }
      return lands.length >= 8;
    });
    assert.ok(lands.length >= 8, `rockets ${lands.length}`);
    const far = RAM_ROCKET.scatterFarTiles * ts;
    for (const l of lands) {
      assert.ok(Math.hypot(l.x - soldier.x, l.y - soldier.y) <= far + 1, "inside the far scatter");
    }
  });

  it("leaves friendly units, enemy buildings, and tank plate alone", () => {
    const state = match();
    const ts = state.tileSize;
    const ram = seedRam(state);
    makeEntity(state, "rifleman", "A", ram.x + 10 * ts, ram.y);
    const d = catalog("dynamo");
    makeEntity(state, "dynamo", "B", (136 + d.tileW / 2) * ts, (116 + d.tileH / 2) * ts, { tileX: 136, tileY: 116 });
    const titan = makeEntity(state, "titan", "B", ram.x, ram.y + 24 * ts);
    titan.holdPosition = true;
    titan.order = null;
    titan.rocketCooldown = 999;
    ticks(state, 30);
    assert.equal(ram.rockets, RAM_ROCKET_AMMO, "no rocket fired");
    assert.equal(ram.attackTarget, null);
  });

  it("takes a plane in the air before a nearer soldier, and bursts rockets beside it", () => {
    const state = match();
    const ts = state.tileSize;
    const ram = seedRam(state);
    const soldier = makeEntity(state, "rifleman", "B", ram.x + 6 * ts, ram.y);
    soldier.holdPosition = true;
    const plane = planeOver(state, "B", ram.x, ram.y - 40 * ts);
    step(state, TICK_DT);
    assert.equal(ram.attackTarget, plane.id);
    const t = until(state, 120, () => !state.entities.has(plane.id) || plane.hp < plane.hpMax);
    assert.ok(t >= 0, "rockets reach the plane");
  });

  it("lays on a low drone, but not a high one its rockets cannot reach", () => {
    const state = match();
    const ram = seedRam(state);
    const ciws = seedCiws(state, 150, 150);
    const high = { drone: true, air: { alt: DRONE_SURVEIL_ALT } } as unknown as Entity;
    const low = { drone: true, air: { alt: DRONE_STRIKE_ALT } } as unknown as Entity;
    assert.ok(DRONE_SURVEIL_ALT >= DRONE_HIGH_ALT && DRONE_STRIKE_ALT < DRONE_HIGH_ALT);
    assert.equal(reachesDrone(ram, high), false);
    assert.equal(reachesDrone(ram, low), true);
    assert.equal(reachesDrone(ciws, high), true, "the CIWS gatling still does");
  });

  it("goes quiet on an empty rack, and a supply truck fills it from the footprint's edge", () => {
    const state = match();
    const ts = state.tileSize;
    const ram = seedRam(state);
    ram.rockets = 0;
    const soldier = makeEntity(state, "rifleman", "B", ram.x + 40 * ts, ram.y);
    soldier.holdPosition = true;
    ticks(state, 20);
    assert.equal(soldier.hp, soldier.hpMax, "an empty rack does not fire");
    assert.equal(ramRockets(state, ram).length, 0);
    state.entities.delete(soldier.id);

    const truck = makeEntity(state, "supply", "A", ram.x - 24 * ts, ram.y);
    assert.equal(truck.supply, SUPPLY_CARGO);
    assert.equal(applyCommand(state, "A", { type: "cmd.supply", ids: [truck.id], targetId: ram.id }).ok, true);
    const t = until(state, 1500, () => (ram.rockets ?? 0) >= RAM_ROCKET_AMMO || truck.supply <= 0);
    assert.ok(t >= 0, `rack ${ram.rockets}, truck ${truck.supply}`);
    assert.ok((ram.rockets ?? 0) > 0, "rockets went back in");
    assert.ok(truck.supply < SUPPLY_CARGO, "the truck paid for it");
    assert.equal(snapshotFor(state, "A").entities.find((e) => e.id === ram.id)?.rockets, ram.rockets);
  });
});

describe("RAM against rockets", () => {
  it("sends one interceptor at an incoming rocket, tries each once, and bursts some", () => {
    let downed = 0;
    let through = 0;
    const trials = 200;
    for (let i = 0; i < trials; i++) {
      const state = match();
      state.rngState = 1000 + i * 7919;
      const ts = state.tileSize;
      const ram = seedRam(state);
      const p = rocket(state, "B", ram.x - 20 * ts, ram.y + 6 * ts);
      step(state, TICK_DT);
      assert.equal(ram.rockets, RAM_ROCKET_AMMO - 1, "one interceptor spent");
      assert.deepEqual(p.ciwsTried, [ram.id]);
      const shot = !state.projectiles.some((q) => q.id === p.id);
      const burst = state.impacts.find((m) => m.intercept && m.fromId === ram.id);
      assert.ok(burst, "the interceptor bursts either way");
      if (shot) {
        assert.equal(burst.kind, "kill");
        downed++;
        continue;
      }
      assert.equal(burst.kind, "miss");
      through++;
      ram.rocketCooldown = 0;
      const left = ram.rockets;
      step(state, TICK_DT);
      assert.ok(!state.impacts.some((m) => m.intercept), "the same rocket is not tried twice");
      assert.ok((ram.rockets ?? 0) <= left!);
    }
    const rate = downed / trials;
    assert.ok(Math.abs(rate - RAM_INTERCEPT_CHANCE) < 0.12, `intercept rate ${rate}`);
    assert.ok(through > 0, "some rockets get through");
  });

  it("an intercepted rocket hurts nothing under it", () => {
    const state = match();
    const ts = state.tileSize;
    const ram = seedRam(state);
    const under = makeEntity(state, "rifleman", "A", ram.x - 16 * ts, ram.y);
    under.holdPosition = true;
    let hit = false;
    for (let i = 0; i < 60 && !hit; i++) {
      state.projectiles = [];
      under.hp = under.hpMax;
      ram.rockets = RAM_ROCKET_AMMO;
      ram.rocketCooldown = 0;
      const p = rocket(state, "B", under.x - 2, under.y);
      p.life = 0.001;
      step(state, TICK_DT);
      if (state.impacts.some((m) => m.intercept && m.kind === "kill")) {
        hit = true;
        assert.equal(under.hp, under.hpMax, "the burst was in the air");
        assert.ok(!state.impacts.some((m) => m.rocket), "no ground burst");
      }
    }
    assert.ok(hit, "at least one rocket burst in the air");
  });

  it("ignores its own side's rockets and rockets past its reach, and cannot try with an empty rack", () => {
    const state = match();
    const ts = state.tileSize;
    const ram = seedRam(state);
    rocket(state, "A", ram.x - 10 * ts, ram.y);
    rocket(state, "B", ram.x - (RAM_RANGE_TILES + 6) * ts, ram.y - 30 * ts);
    step(state, TICK_DT);
    assert.equal(ram.rockets, RAM_ROCKET_AMMO);
    const dry = seedRam(state, 160, 160);
    dry.rockets = 0;
    const p = rocket(state, "B", dry.x + 4 * ts, dry.y + 6 * ts);
    step(state, TICK_DT);
    assert.ok(!p.ciwsTried?.includes(dry.id), "a dry mount does not engage");
  });

  it("works a salvo of incoming rockets one interceptor at a time", () => {
    const state = match();
    const ts = state.tileSize;
    const ram = seedRam(state);
    for (let i = 0; i < 4; i++) {
      const p = rocket(state, "B", ram.x - 30 * ts, ram.y + (i - 2) * 4 * ts);
      p.vx = 1;
      p.life = 5;
      p.flightTime = 5;
    }
    step(state, TICK_DT);
    assert.equal(ram.rockets, RAM_ROCKET_AMMO - 1, "one at a time");
    ticks(state, 30);
    assert.ok((ram.rockets ?? 0) <= RAM_ROCKET_AMMO - 2, "then the next");
  });
});

describe("RAM orders", () => {
  it("Force attack here fires on a ground point until Stop", () => {
    const state = match();
    const ts = state.tileSize;
    const ram = seedRam(state);
    const x = ram.x + 40 * ts;
    const y = ram.y;
    assert.equal(applyCommand(state, "A", { type: "cmd.forceattack", ids: [ram.id], x, y }).ok, true);
    const t = until(state, 80, () => ramRockets(state, ram).length > 0);
    assert.ok(t >= 0, "rockets leave on the ground point");
    assert.equal(applyCommand(state, "A", { type: "cmd.stop", ids: [ram.id] }).ok, true);
    ticks(state, 60);
    const left = ram.rockets;
    ticks(state, 60);
    assert.equal(ram.rockets, left, "Stop holds fire");
  });

  it("Rockets off holds the barrage and the interceptors, and on lets them go again", () => {
    const state = match();
    const ts = state.tileSize;
    const ram = seedRam(state);
    assert.equal(applyCommand(state, "A", { type: "cmd.rockets", ids: [ram.id], on: false }).ok, true);
    const soldier = makeEntity(state, "rifleman", "B", ram.x + 30 * ts, ram.y);
    soldier.holdPosition = true;
    const p = rocket(state, "B", ram.x - 20 * ts, ram.y + 6 * ts);
    ticks(state, 20);
    assert.equal(ram.rockets, RAM_ROCKET_AMMO, "nothing left the rack");
    assert.ok(!p.ciwsTried?.includes(ram.id));
    assert.equal(applyCommand(state, "A", { type: "cmd.rockets", ids: [ram.id], on: true }).ok, true);
    const t = until(state, 80, () => (ram.rockets ?? 0) < RAM_ROCKET_AMMO);
    assert.ok(t >= 0, "fires again once switched on");
    assert.equal(applyCommand(state, "B", { type: "cmd.rockets", ids: [ram.id], on: false }).ok, false);
  });

  it("only the owner can order it", () => {
    const state = match();
    const ram = seedRam(state);
    assert.equal(applyCommand(state, "B", { type: "cmd.forceattack", ids: [ram.id], x: 0, y: 0 }).ok, false);
  });
});
