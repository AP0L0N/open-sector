import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import {
  AIR_CRUISE_ALT,
  BUNKER_GARRISON_CAP,
  FLAK_BURST_DAMAGE,
  FLAK_FUSE_SCATTER_Z,
  FLAK_RACK,
  FLAK_SCATTER_FAR,
  FLAK_SCATTER_NEAR,
  MGNEST_BELT,
  PAK36_RACK,
  PAK43_RACK,
  CREWED_GUNS,
  GUN_CREW_TYPE,
  NEUTRAL_OWNER,
  TICK_DT,
  TILE_SUBDIV,
  TOWER_GARRISON_CAP,
  fieldSpan,
  TOWER_SIGHT_BONUS,
  catalog,
  garrisonCapOf,
  isCivilianType,
  isDefenceStructure,
  isRotatableBuilding,
  type BuildingType,
} from "../catalog.js";
import { TILE_EMPTY, MAP_DEFENCE_TYPES, getMap, registerMap, type MapFeature } from "../maps.js";
import { raiseBuilding } from "./build.js";
import { applyCommand } from "./commands.js";
import { garrisonCanShoot, inMountArc, tickProjectiles } from "./combat.js";
import { needsSupply } from "./supply.js";
import { reachesAircraft } from "./air.js";
import { destroyEntity, makeEntity, worldToTile } from "./geo.js";
import { SANDBAG_CLEAR_RISE, restampForts } from "./field.js";
import { enterGarrison, exitGarrison, livingGarrison } from "./garrison.js";
import { createMatch, step } from "./match.js";
import type { Entity, MatchState } from "./types.js";

function match(): MatchState {
  const r = createRoom({ id: "EMP1", hostId: "A", hostName: "Alpha", mapId: "yard-64", maxSlots: 8 });
  if (!r.ok) throw new Error(r.message);
  const room = r.value;
  assert.equal(joinRoom(room, "B", "Bravo").ok, true);
  updateSelf(room, "A", { ready: true, spawnId: 1 });
  updateSelf(room, "B", { ready: true, spawnId: 4 });
  const started = startMatch(room, "A", () => 0);
  if (!started.ok) throw new Error(started.message);
  const state = createMatch(room, started.value);
  // Flat, open ground in the middle of the map: nothing blocks sight or shots.
  for (const e of [...state.entities.values()]) {
    if (isCivilianType(e.type)) destroyEntity(state, e);
  }
  for (let y = 70; y <= 190; y++) {
    for (let x = 70; x <= 190; x++) {
      const i = y * state.width + x;
      state.terrain[i] = TILE_EMPTY;
      state.blocked[i] = 0;
      state.occupy[i] = 0;
      state.heights[i] = 0;
    }
  }
  return state;
}

/** A gun of A's raised in the middle of the field, facing east unless turned. */
function gun(state: MatchState, type: BuildingType, facing = 0): Entity {
  return raiseBuilding(state, "A", type, 128, 128, facing);
}

function foe(state: MatchState, type: "rifleman" | "ss3", at: Entity, dx: number, dy: number): Entity {
  const ts = state.tileSize;
  const e = makeEntity(state, type, "B", at.x + dx * ts, at.y + dy * ts);
  e.holdPosition = true;
  return e;
}

/** The gun has let a round go: its cooldown, belt change, or belt shows it. Rounds resolve within the tick. */
function shotsFrom(_state: MatchState, e: Entity): number {
  const belt = catalog(e.type).belt;
  return e.cooldown > 0 || e.reload > 0 || (belt != null && e.clip < belt) ? 1 : 0;
}

/** Steps until `done` or `ticks` run out; true when it came true. */
function until(state: MatchState, ticks: number, done: () => boolean): boolean {
  for (let i = 0; i < ticks; i++) {
    step(state, TICK_DT);
    if (done()) return true;
  }
  return false;
}

describe("new bunkers and towers", () => {
  it("differ from the Bunker and Watch Tower in room, cover, and sight", () => {
    assert.ok(garrisonCapOf("tobruk") < BUNKER_GARRISON_CAP);
    assert.ok(garrisonCapOf("casemate") > BUNKER_GARRISON_CAP);
    assert.ok(catalog("casemate").hp > catalog("bunker").hp);
    assert.ok((catalog("casemate").garrisonWoundMul ?? 1) < (catalog("bunker").garrisonWoundMul ?? 1));
    assert.equal(catalog("tobruk").garrisonOpenTop, true, "the ring-stand is open to the sky");
    assert.ok(catalog("tobruk").garrisonTypes?.includes("mortarman"));
    assert.ok(garrisonCapOf("hochstand") < TOWER_GARRISON_CAP);
    assert.ok((catalog("hochstand").garrisonSightBonus ?? 0) > TOWER_SIGHT_BONUS, "the lookout sees farthest");
    assert.ok(garrisonCapOf("leitturm") > TOWER_GARRISON_CAP);
    assert.ok((catalog("leitturm").garrisonReachBonus ?? 0) > (catalog("tower").garrisonReachBonus ?? 0));
  });

  it("are Defences-tab structures the player turns before placing, as are every gun, the CIWS, and the RAM", () => {
    for (const type of ["tobruk", "casemate", "hochstand", "leitturm", ...CREWED_GUNS, "ciws", "ram"] as BuildingType[]) {
      assert.ok(isRotatableBuilding(type), type);
      assert.ok(isDefenceStructure(type), type);
    }
  });

  it("are all map defences", () => {
    for (const type of ["tobruk", "casemate", "hochstand", "leitturm", ...CREWED_GUNS]) {
      assert.ok((MAP_DEFENCE_TYPES as readonly string[]).includes(type), type);
    }
  });
});

/**
 * A line of A's sandbags across the gun's front, 6 tiles out, on a band of ground at `bagH`.
 * Ground nearer the gun stands at `gunH`, ground beyond at 0.
 */
function bagsInFront(state: MatchState, g: Entity, gunH: number, bagH: number): Entity[] {
  const ts = state.tileSize;
  const bx = g.x + 6 * ts;
  const lo = worldToTile(bx - 2 * ts, ts);
  const hi = worldToTile(bx + 2 * ts, ts);
  for (let y = 70; y <= 190; y++) {
    for (let x = 70; x <= 190; x++) state.heights[y * state.width + x] = x < lo ? gunH : x <= hi ? bagH : 0;
  }
  const span = fieldSpan("sandbags")!;
  const bags: Entity[] = [];
  for (let k = -4; k <= 4; k++) {
    const b = makeEntity(state, "sandbags", "A", bx, g.y + k * span.length, { facing: 0 });
    b.facing = 0;
    bags.push(b);
  }
  restampForts(state);
  return bags;
}

describe("crewed guns over sandbags", () => {
  for (const type of ["mgnest", "pak36", "pak43"] as BuildingType[]) {
    const prey = type === "mgnest" ? "rifleman" : "ss3";
    it(`${type} fires over its own sandbags on level ground`, () => {
      const state = match();
      const g = gun(state, type);
      const bags = bagsInFront(state, g, 0, 0);
      const man = foe(state, prey, g, 14, 0);
      assert.ok(until(state, 300, () => man.hp < catalog(prey).hp), `${prey} kept ${man.hp}`);
      assert.ok(bags.every((b) => !b.ruined && b.hp === b.hpMax), "the bags stand");
    });

    it(`${type} fires down over sandbags below it`, () => {
      const state = match();
      const g = gun(state, type);
      const bags = bagsInFront(state, g, TILE_SUBDIV + 2, 0);
      const man = foe(state, prey, g, 14, 0);
      assert.ok(until(state, 300, () => man.hp < catalog(prey).hp), `${prey} kept ${man.hp}`);
      assert.ok(bags.every((b) => !b.ruined), "the bags stand");
    });

    it(`${type} is stopped by sandbags a terrace above it`, () => {
      const state = match();
      const g = gun(state, type);
      const bags = bagsInFront(state, g, 0, SANDBAG_CLEAR_RISE);
      foe(state, prey, g, 14, 0);
      // The gun's own rounds only: the crewman's rifle is not the gun.
      const seen: { x: number }[] = [];
      until(state, 300, () => {
        seen.push(...state.impacts.filter((i) => i.fromId === g.id));
        return false;
      });
      const first = seen[0];
      if (type === "mgnest") {
        assert.equal(first, undefined, "the nest held its fire");
        assert.equal(g.clip, MGNEST_BELT, "the nest holds its belt");
        assert.ok(bags.every((b) => !b.ruined));
      } else {
        assert.ok(first, "the gun fired");
        assert.ok(Math.abs(first.x - bags[0]!.x) <= state.tileSize, `first shell landed at ${first.x}, not the bags`);
        assert.ok(bags.some((b) => b.ruined), "the shell knocked the bags down");
      }
    });
  }

  it("a sandbag a little above the gun is still level enough to fire over", () => {
    const state = match();
    const g = gun(state, "pak43");
    const bags = bagsInFront(state, g, 0, SANDBAG_CLEAR_RISE - 1);
    const tank = foe(state, "ss3", g, 14, 0);
    assert.ok(until(state, 300, () => tank.hp < catalog("ss3").hp));
    assert.ok(bags.every((b) => !b.ruined));
  });
});

describe("crewed guns", () => {
  it("go up with their crew at them: one man at the MG and the Pak 36, two at the Pak 43 and the Flak", () => {
    const state = match();
    const want: Record<string, number> = { mgnest: 1, pak36: 1, pak43: 2, flak: 2 };
    let tx = 100;
    for (const type of CREWED_GUNS) {
      const g = raiseBuilding(state, "A", type, tx, 100, 0);
      tx += 20;
      const crew = livingGarrison(state, g);
      assert.equal(crew.length, want[type], type);
      for (const u of crew) {
        assert.equal(u.type, GUN_CREW_TYPE);
        assert.equal(u.ownerId, "A");
      }
    }
  });

  it("fire only while someone is at them; the crew's own rifles stay slung", () => {
    const state = match();
    const nest = gun(state, "mgnest");
    const [man] = livingGarrison(state, nest);
    assert.ok(man);
    assert.equal(garrisonCanShoot(state, man, nest), false);
    assert.ok(exitGarrison(state, man));
    const target = foe(state, "rifleman", nest, 8, 0);
    assert.equal(until(state, 40, () => shotsFrom(state, nest) > 0), false, "an empty nest is silent");
    const hand = makeEntity(state, "rifleman", "A", man.x, man.y);
    destroyEntity(state, man);
    assert.ok(enterGarrison(state, hand, nest), "another soldier takes his place");
    assert.ok(until(state, 60, () => shotsFrom(state, nest) > 0), "manned again, it opens up");
    assert.ok(target.hp < target.hpMax || !state.entities.has(target.id));
  });

  it("leave alone what stands behind their traverse", () => {
    const state = match();
    const nest = gun(state, "mgnest");
    assert.ok(inMountArc(nest, nest.x + 50, nest.y));
    assert.ok(!inMountArc(nest, nest.x - 50, nest.y));
    foe(state, "rifleman", nest, -8, 0);
    assert.equal(until(state, 60, () => shotsFrom(state, nest) > 0), false, "a soldier behind it is safe");
    foe(state, "rifleman", nest, 8, 2);
    assert.ok(until(state, 60, () => shotsFrom(state, nest) > 0), "one in front draws fire");
    const off = Math.abs(nest.turretFacing - nest.facing);
    assert.ok(off <= (catalog("mgnest").mountArcDeg! * Math.PI) / 180 + 1e-6);
  });

  it("leave walls and sandbags be, neutral or enemy, and wait for the enemy", () => {
    const state = match();
    const ts = state.tileSize;
    const pak = gun(state, "pak43");
    const works = [
      makeEntity(state, "wall", NEUTRAL_OWNER, pak.x + 6 * ts, pak.y),
      makeEntity(state, "wall", "B", pak.x + 8 * ts, pak.y + 2 * ts),
      makeEntity(state, "sandbags", "B", pak.x + 5 * ts, pak.y - 2 * ts),
    ];
    assert.equal(until(state, 60, () => pak.attackTarget != null), false, `gun took ${pak.attackTarget}`);
    assert.ok(works.every((w) => w.hp === w.hpMax));
    const man = foe(state, "rifleman", pak, 10, 0);
    assert.ok(until(state, 60, () => pak.attackTarget === man.id));
  });

  it("an AT gun picks the tank over a nearer soldier", () => {
    const state = match();
    const pak = gun(state, "pak43");
    foe(state, "rifleman", pak, 6, 0);
    const tank = foe(state, "ss3", pak, 12, 0);
    assert.ok(until(state, 200, () => shotsFrom(state, pak) > 0));
    assert.equal(pak.attackTarget, tank.id);
  });

  it("short-handed, a two-man gun loads at half pace", () => {
    const full = match();
    const a = gun(full, "pak43");
    foe(full, "ss3", a, 12, 0);
    assert.ok(until(full, 200, () => shotsFrom(full, a) > 0));
    const fullCooldown = a.cooldown;
    const lone = match();
    const b = gun(lone, "pak43");
    const [first] = livingGarrison(lone, b);
    assert.ok(first && exitGarrison(lone, first));
    foe(lone, "ss3", b, 12, 0);
    assert.ok(until(lone, 200, () => shotsFrom(lone, b) > 0));
    assert.ok(Math.abs(b.cooldown - fullCooldown * 2) < 0.05, `${b.cooldown} vs ${fullCooldown}`);
  });

  it("short-handed, a two-man gun swings at half pace", () => {
    const swing = (lone: boolean) => {
      const state = match();
      const pak = gun(state, "pak43");
      if (lone) {
        const [first] = livingGarrison(state, pak);
        assert.ok(first && exitGarrison(state, first));
      }
      const start = pak.turretFacing;
      // Straight behind: far enough that neither crew gets there in a few ticks.
      assert.equal(applyCommand(state, "A", { type: "cmd.rotate", ids: [pak.id], x: pak.x - 100, y: pak.y + 1 }).ok, true);
      for (let i = 0; i < 3; i++) step(state, TICK_DT);
      return Math.abs(pak.turretFacing - start);
    };
    const full = swing(false);
    const half = swing(true);
    assert.ok(full > 0 && full < Math.PI - 0.1, `full crew swung ${full}`);
    assert.ok(Math.abs(half - full / 2) < 1e-6, `${half} vs ${full}`);
  });

  it("only the Flak and the MG reach a plane", () => {
    const state = match();
    for (const [type, aa] of [
      ["flak", true],
      ["mgnest", true],
      ["pak36", false],
      ["pak43", false],
    ] as [BuildingType, boolean][]) {
      const g = makeEntity(state, type, "A", 100, 100);
      assert.equal(reachesAircraft(g), aa, type);
    }
  });
});

describe("crewed gun orders", () => {
  it("Force attack holds a gun on a ground point in its arc, and Stop hands it back", () => {
    const state = match();
    const ts = state.tileSize;
    const nest = gun(state, "mgnest");
    const x = nest.x + 8 * ts;
    const y = nest.y + 2 * ts;
    assert.equal(applyCommand(state, "A", { type: "cmd.forceattack", ids: [nest.id], x, y }).ok, true);
    assert.equal(nest.order?.kind, "forceattack");
    assert.ok(until(state, 60, () => shotsFrom(state, nest) > 0), "it fires on the empty ground");
    assert.equal(applyCommand(state, "A", { type: "cmd.stop", ids: [nest.id] }).ok, true);
    assert.equal(nest.order, null);
  });

  it("Force attack lays every ground gun on a named target, the Pak 36 included", () => {
    for (const type of ["pak36", "pak43"] as BuildingType[]) {
      const state = match();
      const g = gun(state, type);
      const tank = foe(state, "ss3", g, 10, 0);
      assert.equal(applyCommand(state, "A", { type: "cmd.forceattack", ids: [g.id], x: tank.x, y: tank.y, targetId: tank.id }).ok, true, type);
      assert.equal(g.order?.targetId, tank.id, type);
    }
  });

  it("Rotate rests the gun inside its arc and leaves the placed facing, pad, and arc alone", () => {
    const state = match();
    const nest = gun(state, "mgnest");
    const half = (catalog("mgnest").mountArcDeg! * Math.PI) / 180;
    // Straight behind: the gun stops at the edge of its traverse.
    assert.equal(applyCommand(state, "A", { type: "cmd.rotate", ids: [nest.id], x: nest.x - 100, y: nest.y + 1 }).ok, true);
    assert.equal(nest.facing, 0, "the emplacement does not turn");
    assert.ok(Math.abs(Math.abs(nest.gunRest!) - half) < 1e-6, `rest ${nest.gunRest}`);
    for (let i = 0; i < 80; i++) step(state, TICK_DT);
    assert.ok(Math.abs(nest.turretFacing - nest.gunRest!) < 0.02, "the gun swings over and rests there");
    // The Pak 43 turns all round: it rests right where it was told.
    const pak = raiseBuilding(state, "A", "pak43", 100, 100, 0);
    applyCommand(state, "A", { type: "cmd.rotate", ids: [pak.id], x: pak.x, y: pak.y - 100 });
    assert.ok(Math.abs(pak.gunRest! + Math.PI / 2) < 1e-6);
    assert.equal(pak.facing, 0);
  });

  it("the CIWS takes Rotate the same way: its turned pad stays put", () => {
    const state = match();
    const ciws = raiseBuilding(state, "A", "ciws", 128, 128, Math.PI / 4);
    const before = ciws.facing;
    applyCommand(state, "A", { type: "cmd.rotate", ids: [ciws.id], x: ciws.x - 100, y: ciws.y });
    assert.equal(ciws.facing, before);
    assert.ok(Math.abs(Math.abs(ciws.gunRest!) - Math.PI) < 1e-6);
  });
});

/** A Stuka flying over (x, y) at cruise height, held on that spot. */
function planeOver(state: MatchState, owner: string, x: number, y: number): Entity {
  const plane = makeEntity(state, "stuka", owner, x, y);
  plane.air!.phase = "fly";
  plane.air!.alt = AIR_CRUISE_ALT;
  plane.air!.speed = 1;
  plane.order = { kind: "move", x, y };
  return plane;
}

describe("crewed gun ammunition", () => {
  it("the Paks fire armor-piercing shells from a finite rack, as a StuG does", () => {
    for (const [type, rack] of [
      ["pak36", PAK36_RACK],
      ["pak43", PAK43_RACK],
    ] as [BuildingType, number][]) {
      const state = match();
      const g = gun(state, type);
      assert.equal(g.ammo.ap, rack, `${type} comes with a full rack`);
      assert.equal(catalog(type).defaultShell, "ap");
      foe(state, "ss3", g, 8, 0);
      assert.ok(until(state, 200, () => (g.ammo.ap ?? 0) < rack), `${type} spends a shell`);
      assert.equal(needsSupply(g), true, `${type} short of a full rack wants a truck`);
      g.ammo.ap = 0;
      const cd = g.cooldown;
      for (let i = 0; i < 40; i++) step(state, TICK_DT);
      assert.equal(g.ammo.ap, 0, `${type}: an empty rack stays empty`);
      assert.ok(g.cooldown <= cd);
    }
  });

  it("the MG nest's boxes run dry and stay dry until a truck comes, and it flashes as it fires", () => {
    const state = match();
    const nest = gun(state, "mgnest");
    assert.equal(nest.clip, MGNEST_BELT);
    foe(state, "rifleman", nest, 8, 0);
    let flashed = false;
    assert.ok(
      until(state, 80, () => {
        flashed ||= nest.gatlingFire?.tick === state.tick;
        return nest.clip < MGNEST_BELT;
      }),
    );
    assert.ok(flashed || nest.gatlingFire != null, "the muzzle flash is raised");
    nest.clip = 0;
    for (let i = 0; i < 120; i++) step(state, TICK_DT);
    assert.equal(nest.clip, 0, "no belt change refills it");
    assert.equal(nest.reload, 0);
    assert.equal(needsSupply(nest), true);
  });

  it("the Flak's burst scatters about 30% wider than its first lay", () => {
    assert.ok(Math.abs(FLAK_SCATTER_NEAR / 12 - 1.3) < 0.02);
    assert.ok(Math.abs(FLAK_SCATTER_FAR / 34 - 1.3) < 0.02);
    assert.ok(Math.abs(FLAK_FUSE_SCATTER_Z / 4 - 1.3) < 0.02);
  });

  it("the Flak leaves the ground alone and fires flak shells at a plane", () => {
    const state = match();
    const flak = gun(state, "flak");
    assert.equal(flak.ammo.he, FLAK_RACK);
    foe(state, "rifleman", flak, 6, 0);
    foe(state, "ss3", flak, 8, 2);
    for (let i = 0; i < 60; i++) step(state, TICK_DT);
    assert.equal(flak.ammo.he, FLAK_RACK, "no shell at soldiers or tanks");
    const plane = planeOver(state, "B", flak.x + 30 * state.tileSize, flak.y);
    let shell = false;
    assert.ok(
      until(state, 120, () => {
        shell ||= state.projectiles.some((p) => p.fromId === flak.id && p.flight === "flak");
        return (flak.ammo.he ?? 0) < FLAK_RACK && shell;
      }),
      "it puts a shell up",
    );
    const up = state.projectiles.find((p) => p.fromId === flak.id && p.flight === "flak");
    assert.ok(!up || Math.abs(Math.atan2(up.vy, up.vx) - Math.atan2(plane.y - flak.y, plane.x - flak.x)) < 0.6, "laid toward the plane");
  });

  it("a flak burst hurts every plane inside it, not a soldier under it", () => {
    const state = match();
    const flak = gun(state, "flak");
    const ts = state.tileSize;
    const x = flak.x + 20 * ts;
    const y = flak.y;
    const a = planeOver(state, "B", x, y);
    const b = planeOver(state, "B", x + 14, y + 6);
    const far = planeOver(state, "B", x + 200, y);
    const man = makeEntity(state, "rifleman", "B", x, y);
    const hp = [a.hp, b.hp, far.hp, man.hp];
    state.projectiles = [
      {
        id: state.nextId++,
        ownerId: "A",
        team: 0,
        x,
        y,
        vx: 0,
        vy: 0,
        damage: catalog("flak").damage,
        penetration: 10,
        caliber: 37,
        life: 0.001,
        ignoreId: flak.id,
        fromId: flak.id,
        bounced: false,
        shell: "he",
        flight: "flak",
        z: AIR_CRUISE_ALT,
        vz: 0,
      },
    ];
    state.impacts = [];
    tickProjectiles(state, TICK_DT);
    assert.ok(a.hp < hp[0]!, "the plane in the burst is hit");
    assert.ok(b.hp < hp[1]!, "so is its wingman");
    assert.equal(far.hp, hp[2], "a plane well clear is not");
    assert.equal(man.hp, hp[3], "nothing on the ground is touched");
    const burst = state.impacts.find((i) => i.flak);
    assert.ok(burst && burst.z === AIR_CRUISE_ALT, "the client gets a burst at the plane's height");
    assert.equal(state.projectiles.length, 0);
  });

  it("one flak burst takes a little off every plane of a loose formation", () => {
    const state = match();
    const flak = gun(state, "flak");
    const x = flak.x + 20 * state.tileSize;
    const y = flak.y;
    const wing = [planeOver(state, "B", x, y), planeOver(state, "B", x + 40, y - 24), planeOver(state, "B", x - 36, y + 30)];
    const hp = wing.map((p) => p.hp);
    state.projectiles = [
      {
        id: state.nextId++,
        ownerId: "A",
        team: 0,
        x,
        y,
        vx: 0,
        vy: 0,
        damage: catalog("flak").damage,
        penetration: 10,
        caliber: 37,
        life: 0.001,
        ignoreId: flak.id,
        fromId: flak.id,
        bounced: false,
        shell: "he",
        flight: "flak",
        z: AIR_CRUISE_ALT + 6,
        vz: 0,
      },
    ];
    tickProjectiles(state, TICK_DT);
    wing.forEach((p, i) => {
      const lost = hp[i]! - p.hp;
      assert.ok(lost > 0, `plane ${i} is hit`);
      assert.ok(lost <= FLAK_BURST_DAMAGE * 1.2, `plane ${i} loses only a little (${lost})`);
    });
  });

  it("a forced aim at the ground puts a barrage up over that point", () => {
    const state = match();
    const flak = gun(state, "flak");
    const ts = state.tileSize;
    applyCommand(state, "A", { type: "cmd.forceattack", ids: [flak.id], x: flak.x + 20 * ts, y: flak.y });
    let up: number | undefined;
    until(state, 60, () => {
      const p = state.projectiles.find((q) => q.fromId === flak.id && q.flight === "flak");
      if (p && (p.vz ?? 0) > 0) up = p.vz;
      return up != null;
    });
    assert.ok(up != null && up > 0, "the shell climbs");
    assert.ok((flak.ammo.he ?? 0) < FLAK_RACK);
  });
});

describe("crewed guns on a map", () => {
  it("stand neutral with neutral crews", () => {
    const yard = getMap("yard-64")!;
    const id = `yard-guns-${Math.random().toString(36).slice(2, 8)}`;
    const mid = 32 * TILE_SUBDIV;
    const features: MapFeature[] = [
      { type: "flak", x: mid, y: mid, facing: 0 },
      { type: "mgnest", x: mid + 20, y: mid, facing: 0, turn: 6 },
    ];
    registerMap({ ...yard, id, tiles: yard.tiles.map(() => TILE_EMPTY), heights: yard.heights.map(() => 0), maxHeight: 0, features });
    const r = createRoom({ id: "EMP2", hostId: "A", hostName: "Alpha", mapId: id, maxSlots: 8 });
    if (!r.ok) throw new Error(r.message);
    assert.equal(joinRoom(r.value, "B", "Bravo").ok, true);
    updateSelf(r.value, "A", { ready: true, spawnId: 1 });
    updateSelf(r.value, "B", { ready: true, spawnId: 4 });
    const started = startMatch(r.value, "A", () => 0);
    if (!started.ok) throw new Error(started.message);
    const state = createMatch(r.value, started.value);
    const flak = [...state.entities.values()].find((e) => e.type === "flak")!;
    const nest = [...state.entities.values()].find((e) => e.type === "mgnest")!;
    assert.equal(livingGarrison(state, flak).length, 2);
    assert.equal(livingGarrison(state, nest).length, 1);
    for (const u of [...livingGarrison(state, flak), ...livingGarrison(state, nest)]) assert.equal(u.ownerId, NEUTRAL_OWNER);
    assert.ok(Math.abs(nest.facing - Math.PI / 2) < 1e-6, "turned to face south");
  });
});
