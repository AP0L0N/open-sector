import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AIR_CRUISE_ALT,
  BUILDING_TYPES,
  CIWS_BELT,
  CIWS_INTERCEPT_CHANCE,
  CIWS_INTERCEPT_ROUNDS,
  CIWS_RANGE_TILES,
  SUPPLY_CARGO,
  TICK_DT,
  TITAN_ROCKET,
  beltOf,
  catalog,
  hasTurret,
  radarLaidOf,
  supplyShortOf,
} from "../catalog.js";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import { TILE_EMPTY } from "../maps.js";
import { applyCommand } from "./commands.js";
import { makeEntity, playerTeam, tileCenter } from "./geo.js";
import { createMatch, step } from "./match.js";
import { snapshotFor } from "./snapshot.js";
import type { Entity, MatchState, Projectile } from "./types.js";

function match(): MatchState {
  const r = createRoom({ id: "CIWS1", hostId: "A", hostName: "Alpha", mapId: "yard-64", maxSlots: 8 });
  if (!r.ok) throw new Error(r.message);
  const room = r.value;
  assert.equal(joinRoom(room, "B", "Bravo").ok, true);
  updateSelf(room, "A", { ready: true, spawnId: 1 });
  updateSelf(room, "B", { ready: true, spawnId: 4 });
  const started = startMatch(room, "A");
  if (!started.ok) throw new Error(started.message);
  const state = createMatch(room, started.value, { startingUnits: false });
  // Flat, open ground in the middle of the map: nothing blocks sight or shots.
  for (let y = 90; y <= 170; y++) {
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

/** A's CIWS with its footprint's corner on (tx, ty). */
function seedCiws(state: MatchState, tx = 120, ty = 120, owner = "A"): Entity {
  const ts = state.tileSize;
  const def = catalog("ciws");
  return makeEntity(state, "ciws", owner, (tx + def.tileW / 2) * ts, (ty + def.tileH / 2) * ts, {
    tileX: tx,
    tileY: ty,
  });
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

describe("CIWS catalog", () => {
  it("is a structure with a traversing radar-laid gatling and a belt only a truck refills", () => {
    const def = catalog("ciws");
    assert.equal(def.kind, "building");
    assert.ok(BUILDING_TYPES.includes("ciws"));
    assert.ok(def.power < 0, "draws power");
    assert.ok(def.cost > 0 && def.buildSeconds > 0);
    assert.equal(radarLaidOf("ciws"), true);
    assert.equal(radarLaidOf("walker"), false);
    assert.equal(hasTurret("ciws"), true);
    assert.deepEqual(beltOf("ciws"), { clip: CIWS_BELT, reload: 0 });
    assert.equal(def.rangeTiles, CIWS_RANGE_TILES);
    assert.equal(supplyShortOf("ciws", {}, 0, CIWS_BELT), false);
    assert.equal(supplyShortOf("ciws", {}, 0, CIWS_BELT - 1), true);
  });

  it("is queued and placed from the construction yard", () => {
    const state = match();
    const ts = state.tileSize;
    state.players.get("A")!.scrap = 50_000;
    makeEntity(state, "core", "A", tileCenter(120, ts), tileCenter(120, ts), { tileX: 118, tileY: 118 });
    makeEntity(state, "dynamo", "A", 0, 0, { tileX: 110, tileY: 110 });
    assert.equal(applyCommand(state, "A", { type: "cmd.build", building: "ciws" }).ok, true);
    const t = until(state, 600, () => state.players.get("A")!.structure?.ready === true);
    assert.ok(t >= 0, "the CIWS finishes building");
    assert.equal(applyCommand(state, "A", { type: "cmd.place", building: "ciws", tx: 132, ty: 120 }).ok, true);
    const placed = [...state.entities.values()].find((e) => e.type === "ciws");
    assert.ok(placed);
    assert.equal(placed.clip, CIWS_BELT, "comes with a full belt");
  });
});

describe("CIWS fire", () => {
  it("fires on its own at an enemy soldier in reach and spends the belt", () => {
    const state = match();
    const ts = state.tileSize;
    const ciws = seedCiws(state);
    const soldier = makeEntity(state, "rifleman", "B", ciws.x + 20 * ts, ciws.y);
    soldier.holdPosition = true;
    const t = until(state, 60, () => soldier.hp <= 0 || !state.entities.has(soldier.id));
    assert.ok(t >= 0, "the soldier goes down");
    assert.ok(ciws.clip < CIWS_BELT, `belt ${ciws.clip}`);
    assert.ok(Math.abs(ciws.turretFacing) < 0.2, "the gun swung east onto him");
  });

  it("leaves friendly units, enemy buildings, and tank plate alone", () => {
    const state = match();
    const ts = state.tileSize;
    const ciws = seedCiws(state);
    makeEntity(state, "rifleman", "A", ciws.x + 10 * ts, ciws.y);
    const d = catalog("dynamo");
    makeEntity(state, "dynamo", "B", (136 + d.tileW / 2) * ts, (116 + d.tileH / 2) * ts, { tileX: 136, tileY: 116 });
    const titan = makeEntity(state, "titan", "B", ciws.x, ciws.y + 24 * ts);
    titan.holdPosition = true;
    titan.order = null;
    titan.rocketCooldown = 999;
    ticks(state, 20);
    assert.equal(ciws.clip, CIWS_BELT, "no round fired");
    assert.equal(ciws.attackTarget, null);
  });

  it("takes a plane in the air before a nearer soldier on the ground, and hurts it", () => {
    const state = match();
    const ts = state.tileSize;
    const ciws = seedCiws(state);
    const soldier = makeEntity(state, "rifleman", "B", ciws.x + 6 * ts, ciws.y);
    soldier.holdPosition = true;
    const plane = planeOver(state, "B", ciws.x, ciws.y - 16 * ts);
    step(state, TICK_DT);
    assert.equal(ciws.attackTarget, plane.id);
    const t = until(state, 80, () => !state.entities.has(plane.id) || plane.hp < plane.hpMax);
    assert.ok(t >= 0, "rounds reach the plane");
  });

  it("stops firing on an empty belt, and a supply truck fills it from the footprint's edge", () => {
    const state = match();
    const ts = state.tileSize;
    const ciws = seedCiws(state);
    ciws.clip = 0;
    const soldier = makeEntity(state, "rifleman", "B", ciws.x + 20 * ts, ciws.y);
    soldier.holdPosition = true;
    ticks(state, 10);
    assert.equal(soldier.hp, soldier.hpMax, "a dry gun does not fire");
    state.entities.delete(soldier.id);

    const truck = makeEntity(state, "supply", "A", ciws.x - 24 * ts, ciws.y);
    assert.equal(truck.supply, SUPPLY_CARGO);
    assert.equal(applyCommand(state, "A", { type: "cmd.supply", ids: [truck.id], targetId: ciws.id }).ok, true);
    const t = until(state, 900, () => ciws.clip >= CIWS_BELT);
    assert.ok(t >= 0, `belt ${ciws.clip}, truck ${truck.supply}`);
    assert.ok(truck.supply < SUPPLY_CARGO, "the truck paid for it");
    assert.equal(snapshotFor(state, "A").entities.find((e) => e.id === ciws.id)?.clip, CIWS_BELT);
  });
});

describe("CIWS against rockets", () => {
  it("bursts some incoming rockets in the air, tries each once, and spends a short burst on each", () => {
    let downed = 0;
    let through = 0;
    const trials = 200;
    for (let i = 0; i < trials; i++) {
      const state = match();
      state.rngState = 1000 + i * 7919;
      const ts = state.tileSize;
      const ciws = seedCiws(state);
      const p = rocket(state, "B", ciws.x - 20 * ts, ciws.y + 6 * ts);
      step(state, TICK_DT);
      assert.ok(ciws.clip <= CIWS_BELT - CIWS_INTERCEPT_ROUNDS, "one burst spent");
      const shot = !state.projectiles.some((q) => q.id === p.id) && state.impacts.some((m) => m.intercept);
      if (shot) {
        downed++;
        continue;
      }
      through++;
      assert.deepEqual(p.ciwsTried, [ciws.id]);
      const left = ciws.clip;
      step(state, TICK_DT);
      assert.equal(ciws.clip, left, "the same rocket is not tried twice");
      assert.ok(!state.impacts.some((m) => m.intercept));
    }
    const rate = downed / trials;
    assert.ok(Math.abs(rate - CIWS_INTERCEPT_CHANCE) < 0.12, `intercept rate ${rate}`);
    assert.ok(through > 0, "some rockets get through");
  });

  it("an intercepted rocket hurts nothing under it", () => {
    const state = match();
    const ts = state.tileSize;
    const ciws = seedCiws(state);
    const under = makeEntity(state, "rifleman", "A", ciws.x - 16 * ts, ciws.y);
    under.holdPosition = true;
    let hit = false;
    for (let i = 0; i < 40 && !hit; i++) {
      state.projectiles = [];
      under.hp = under.hpMax;
      ciws.clip = CIWS_BELT;
      const p = rocket(state, "B", under.x - 2, under.y);
      p.life = 0.001;
      step(state, TICK_DT);
      if (state.impacts.some((m) => m.intercept)) {
        hit = true;
        assert.equal(under.hp, under.hpMax, "the burst was in the air");
        assert.ok(!state.impacts.some((m) => m.rocket), "no ground burst");
      }
    }
    assert.ok(hit, "at least one rocket burst in the air");
  });

  it("ignores its own side's rockets and rockets past its reach, and cannot try with an empty belt", () => {
    const state = match();
    const ts = state.tileSize;
    const ciws = seedCiws(state);
    rocket(state, "A", ciws.x - 10 * ts, ciws.y);
    rocket(state, "B", ciws.x - (CIWS_RANGE_TILES + 6) * ts, ciws.y - 20 * ts);
    step(state, TICK_DT);
    assert.equal(ciws.clip, CIWS_BELT);
    const dry = seedCiws(state, 160, 160);
    dry.clip = 0;
    const p = rocket(state, "B", dry.x + 4 * ts, dry.y + 6 * ts);
    step(state, TICK_DT);
    assert.ok(!p.ciwsTried?.includes(dry.id), "a dry mount does not engage");
  });
});

describe("CIWS orders", () => {
  function heading(a: number, b: number): number {
    let d = a - b;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return Math.abs(d);
  }

  it("Rotate lays the idle gun on a heading and it still fires on its own", () => {
    const state = match();
    const ts = state.tileSize;
    const ciws = seedCiws(state);
    // South-west of the mount.
    const res = applyCommand(state, "A", { type: "cmd.rotate", ids: [ciws.id], x: ciws.x - 40, y: ciws.y + 40 });
    assert.equal(res.ok, true);
    ticks(state, 10);
    assert.ok(heading(ciws.turretFacing, (3 * Math.PI) / 4) < 0.05, `turret ${ciws.turretFacing}`);
    assert.equal(ciws.clip, CIWS_BELT, "rotating spends nothing");
    const soldier = makeEntity(state, "rifleman", "B", ciws.x + 20 * ts, ciws.y);
    soldier.holdPosition = true;
    const t = until(state, 60, () => soldier.hp <= 0 || !state.entities.has(soldier.id));
    assert.ok(t >= 0, "it swings off the rest heading onto the soldier");
    ticks(state, 10);
    assert.ok(heading(ciws.turretFacing, (3 * Math.PI) / 4) < 0.05, "and goes back to rest");
  });

  it("Force attack here sprays a ground point until Stop", () => {
    const state = match();
    const ts = state.tileSize;
    const ciws = seedCiws(state);
    const x = ciws.x;
    const y = ciws.y - 20 * ts;
    assert.equal(applyCommand(state, "A", { type: "cmd.forceattack", ids: [ciws.id], x, y }).ok, true);
    ticks(state, 10);
    assert.equal(ciws.order?.kind, "forceattack", "the forced aim holds");
    assert.ok(heading(ciws.turretFacing, -Math.PI / 2) < 0.05, "the gun points north at the spot");
    assert.ok(ciws.clip < CIWS_BELT, "rounds go at nothing");
    assert.equal(applyCommand(state, "A", { type: "cmd.stop", ids: [ciws.id] }).ok, true);
    const left = ciws.clip;
    ticks(state, 10);
    assert.equal(ciws.clip, left, "Stop hands it back to its own targeting");
    assert.equal(ciws.order, null);
  });

  it("Force attack takes a target it would leave alone, then goes back to picking its own", () => {
    const state = match();
    const ciws = seedCiws(state);
    const ts = state.tileSize;
    const d = catalog("dynamo");
    const dynamo = makeEntity(state, "dynamo", "B", (136 + d.tileW / 2) * ts, (118 + d.tileH / 2) * ts, {
      tileX: 136,
      tileY: 118,
    });
    const res = applyCommand(state, "A", {
      type: "cmd.forceattack",
      ids: [ciws.id],
      x: dynamo.x,
      y: dynamo.y,
      targetId: dynamo.id,
    });
    assert.equal(res.ok, true);
    const t = until(state, 80, () => dynamo.hp < dynamo.hpMax);
    assert.ok(t >= 0, "the building takes rounds");
    assert.equal(ciws.attackTarget, dynamo.id);
    state.entities.delete(dynamo.id);
    ticks(state, 2);
    assert.notEqual(ciws.order?.kind, "forceattack", "a gone target frees it");
  });

  it("a rocket still cuts in on a forced aim", () => {
    const state = match();
    const ts = state.tileSize;
    const ciws = seedCiws(state);
    applyCommand(state, "A", { type: "cmd.forceattack", ids: [ciws.id], x: ciws.x, y: ciws.y - 20 * ts });
    const p = rocket(state, "B", ciws.x - 20 * ts, ciws.y + 6 * ts);
    step(state, TICK_DT);
    assert.deepEqual(p.ciwsTried, [ciws.id]);
    assert.equal(ciws.order?.kind, "forceattack", "and the forced aim comes back after");
  });

  it("only the owner can order it", () => {
    const state = match();
    const ciws = seedCiws(state);
    assert.equal(applyCommand(state, "B", { type: "cmd.rotate", ids: [ciws.id], x: 0, y: 0 }).ok, false);
    assert.equal(applyCommand(state, "B", { type: "cmd.forceattack", ids: [ciws.id], x: 0, y: 0 }).ok, false);
  });
});
