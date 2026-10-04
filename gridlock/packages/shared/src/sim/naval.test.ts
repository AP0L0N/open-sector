import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import {
  BUILDING_TYPES,
  SUB_AIR_RECOVER_MUL,
  SUB_DETECT_TILES,
  SUB_DIVE_SECONDS,
  SUB_REARM_SECONDS,
  SUB_REVEAL_SECONDS,
  SUB_TORPEDOES,
  TICK_DT,
  TORPEDO_SPEED,
  TRAIN_TYPES,
  catalog,
  isNavalType,
  isTorpedoBody,
  leavesWreck,
  secondsToTicks,
  trackCritAllowed,
  type BuildingType,
} from "../catalog.js";
import { HEIGHT_BASE } from "../catalog.js";
import { TILE_EMPTY, TILE_WATER, getMap } from "../maps.js";
import { canBoardPlane } from "./airdrop.js";
import { buildingSiteError } from "./build.js";
import { applyCommand } from "./commands.js";
import { canAimWeapon } from "./elevation.js";
import { hqOf, isWater, makeEntity, tileCenter, walkable, worldToTile } from "./geo.js";
import { createMatch, step } from "./match.js";
import { afloat, diving, hiddenSubmarine } from "./naval.js";
import { setPath } from "./path.js";
import { previewSite } from "./preview.js";
import { snapshotFor } from "./snapshot.js";
import { producerType, startTrain } from "./train.js";
import { canSeeEntity } from "./vision.js";
import type { Entity, MatchState } from "./types.js";

function twoPlayerMatch(): MatchState {
  const r = createRoom({ id: "NV1", hostId: "A", hostName: "Alpha", mapId: "yard-64", maxSlots: 8 });
  if (!r.ok) throw new Error(r.message);
  const room = r.value;
  assert.equal(joinRoom(room, "B", "Bravo").ok, true);
  updateSelf(room, "A", { ready: true, spawnId: 1 });
  updateSelf(room, "B", { ready: true, spawnId: 4 });
  const started = startMatch(room, "A", () => 0);
  if (!started.ok) throw new Error(started.message);
  return createMatch(room, started.value);
}

function ticks(state: MatchState, n: number): void {
  for (let i = 0; i < n; i++) step(state, TICK_DT);
}

function deploy(state: MatchState, pid: string): void {
  const rig = hqOf(state, pid)!;
  applyCommand(state, pid, { type: "cmd.deploy", id: rig.id });
  for (let i = 0; i < 60; i++) {
    step(state, TICK_DT);
    if (hqOf(state, pid)?.type === "core") return;
  }
  throw new Error("Rig never unpacked");
}

/** Open, level water over the rectangle, inclusive. */
function lake(state: MatchState, x0: number, y0: number, x1: number, y1: number): void {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = y * state.width + x;
      state.terrain[i] = TILE_WATER;
      state.blocked[i] = 1;
      state.heights[i] = 0;
      state.scrapYield[i] = 0;
    }
  }
  state.visionTick = -1;
}

/** Open, level ground over the rectangle, inclusive. */
function land(state: MatchState, x0: number, y0: number, x1: number, y1: number, h = 0): void {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = y * state.width + x;
      state.terrain[i] = TILE_EMPTY;
      state.blocked[i] = 0;
      state.heights[i] = h;
      state.scrapYield[i] = 0;
    }
  }
  state.visionTick = -1;
}

/** Hand A a finished job of this type in the structure lane and place it. Null when the yard takes it. */
function place(state: MatchState, type: BuildingType, tx: number, ty: number): string | null {
  const p = state.players.get("A")!;
  p.scrap = 10_000;
  p.structure = { type, progressTicks: 1, totalTicks: 1, ready: true, paused: false, paid: catalog(type).cost };
  const res = applyCommand(state, "A", { type: "cmd.place", building: type, tx, ty });
  return res.ok ? null : res.message;
}

/** A deployed base for A with a lake just east of the Core, inside yard range. */
function harbour(): { state: MatchState; lx0: number; ly0: number; lx1: number; ly1: number } {
  const state = twoPlayerMatch();
  deploy(state, "A");
  const hq = hqOf(state, "A")!;
  const lx0 = hq.tileX + hq.tileW + 6;
  const ly0 = hq.tileY - 4;
  const lx1 = lx0 + 40;
  const ly1 = ly0 + 30;
  land(state, lx0 - 6, Math.max(0, ly0 - 6), lx1 + 6, ly1 + 6, 0);
  lake(state, lx0, Math.max(0, ly0), lx1, ly1);
  return { state, lx0, ly0: Math.max(0, ly0), lx1, ly1 };
}

function at(state: MatchState, tx: number, ty: number): { x: number; y: number } {
  return { x: tileCenter(tx, state.tileSize), y: tileCenter(ty, state.tileSize) };
}

function spawn(state: MatchState, type: Parameters<typeof makeEntity>[1], owner: string, tx: number, ty: number): Entity {
  const p = at(state, tx, ty);
  return makeEntity(state, type, owner, p.x, p.y);
}

describe("naval catalog", () => {
  it("lists the Marine Base and both hulls, routed to the Marine Base", () => {
    assert.ok(BUILDING_TYPES.includes("dock"));
    assert.equal(catalog("dock").name, "Marine Base");
    for (const t of ["gunboat", "submarine"] as const) {
      assert.ok(TRAIN_TYPES.includes(t), t);
      assert.equal(isNavalType(t), true, t);
      assert.equal(producerType(t), "dock", t);
      assert.equal(leavesWreck(t), false, `${t} sinks`);
      assert.equal(trackCritAllowed(t), false, `${t} has no tracks to throw`);
      assert.equal(catalog(t).wades, undefined, `${t} floats; it does not wade`);
    }
    assert.equal(isNavalType("warden"), false);
  });
});

describe("Marine Base placement", () => {
  it("finds open water for it in a Scrap Yard pond, and the ghost agrees with the yard", () => {
    const state = twoPlayerMatch();
    const map = getMap("yard-64")!;
    const w = catalog("dock").tileW;
    const h = catalog("dock").tileH;
    const allWater = (tx: number, ty: number): boolean => {
      for (let y = ty; y < ty + h; y++) {
        for (let x = tx; x < tx + w; x++) if (map.tiles[y * map.width + x] !== TILE_WATER) return false;
      }
      return true;
    };
    let site: { tx: number; ty: number } | null = null;
    for (let ty = 0; ty + h <= map.height && !site; ty++) {
      for (let tx = 0; tx + w <= map.width && !site; tx++) if (allWater(tx, ty)) site = { tx, ty };
    }
    assert.ok(site, "the shipped map has a pond a Marine Base fits in");
    const snap = snapshotFor(state, "A");
    assert.equal(previewSite(snap, "dock", site.tx, site.ty), true);
    assert.equal(buildingSiteError(state, "dock", site.tx, site.ty), null);
    assert.equal(previewSite(snap, "dynamo", site.tx, site.ty), false, "a Power Plant ghost stays red on water");
    assert.notEqual(buildingSiteError(state, "dynamo", site.tx, site.ty), null);
    // Slide off the pond until the footprint touches dry ground.
    let dry = site.tx;
    while (allWater(dry, site.ty)) dry--;
    assert.equal(previewSite(snap, "dock", dry, site.ty), false, "part of it ashore");
    assert.match(buildingSiteError(state, "dock", dry, site.ty) ?? "", /water/);
  });

  it("stands only on open water", () => {
    const { state, lx0, ly0 } = harbour();
    const w = catalog("dock").tileW;
    // Half on the bank, half in the lake.
    const halfX = lx0 - w / 2;
    assert.match(place(state, "dock", halfX, ly0 + 4) ?? "", /water/);
    assert.match(place(state, "dock", lx0 - w - 2, ly0 + 4) ?? "", /water/);
    assert.equal(place(state, "dock", lx0 + 1, ly0 + 4), null);
    const dock = [...state.entities.values()].find((e) => e.type === "dock" && e.ownerId === "A");
    assert.ok(dock);
    assert.equal(afloat(state, dock), true);
  });
});

describe("naval training", () => {
  it("needs a Marine Base, and launches the boat onto the water beside it", () => {
    const { state, lx0, ly0 } = harbour();
    state.players.get("A")!.scrap = 10_000;
    assert.equal(startTrain(state, "A", "gunboat"), "Need a Marine Base.");
    assert.equal(place(state, "dock", lx0 + 1, ly0 + 4), null);
    assert.equal(startTrain(state, "A", "gunboat"), null);
    ticks(state, secondsToTicks(catalog("gunboat").buildSeconds) * 3);
    const boat = [...state.entities.values()].find((e) => e.type === "gunboat" && e.ownerId === "A");
    assert.ok(boat, "the boat came off the slipway");
    assert.equal(isWater(state, worldToTile(boat.x, state.tileSize), worldToTile(boat.y, state.tileSize)), true, "it floats");
  });
});

describe("boats stay on the water", () => {
  it("treats water as the only ground a boat can stand on", () => {
    const { state, lx0, ly0 } = harbour();
    assert.equal(walkable(state, lx0 + 5, ly0 + 5, "gunboat"), true);
    assert.equal(walkable(state, lx0 - 3, ly0 + 5, "gunboat"), false);
    assert.equal(walkable(state, lx0 - 3, ly0 + 5, "warden"), true);
    assert.equal(walkable(state, lx0 + 5, ly0 + 5, "warden"), false);
  });

  it("crosses open water on one heading, and a click ashore stops at the waterline", () => {
    const { state, lx0, ly0, lx1, ly1 } = harbour();
    const boat = spawn(state, "gunboat", "A", lx0 + 3, ly0 + 3);
    const far = at(state, lx1 - 3, ly1 - 3);
    assert.equal(setPath(state, boat, far.x, far.y), true);
    const legs = boat.waypoints.length;
    assert.equal(legs, 1, "no staircase across open water");
    const ashore = at(state, lx0 - 5, ly0 + 10);
    applyCommand(state, "A", { type: "cmd.move", ids: [boat.id], x: ashore.x, y: ashore.y });
    for (let i = 0; i < 200; i++) {
      step(state, TICK_DT);
      assert.equal(isWater(state, worldToTile(boat.x, state.tileSize), worldToTile(boat.y, state.tileSize)), true, `tick ${i}: still afloat`);
    }
    assert.ok(Math.abs(worldToTile(boat.x, state.tileSize) - lx0) <= 4, "it went to the bank");
  });

  it("does not board a transport plane", () => {
    const { state, lx0, ly0 } = harbour();
    const boat = spawn(state, "gunboat", "A", lx0 + 3, ly0 + 3);
    const plane = spawn(state, "bv222", "A", lx0 - 4, ly0 + 3);
    assert.equal(canBoardPlane(state, boat, plane), "That cannot board.");
  });
});

describe("Attack Boat gun", () => {
  it("lays up a raised bank where a tank gun could not", () => {
    const { state, lx0, ly0 } = harbour();
    land(state, lx0 - 6, ly0, lx0 - 1, ly0 + 10, HEIGHT_BASE);
    const boat = spawn(state, "gunboat", "A", lx0 + 1, ly0 + 5);
    const man = spawn(state, "rifleman", "B", lx0 - 3, ly0 + 5);
    assert.equal(canAimWeapon(state, boat, man.x, man.y, man), true);
  });
});

describe("Submarine torpedoes", () => {
  it("leaves targets ashore alone", () => {
    const { state, lx0, ly0 } = harbour();
    const sub = spawn(state, "submarine", "A", lx0 + 4, ly0 + 6);
    const man = spawn(state, "rifleman", "B", lx0 - 3, ly0 + 6);
    man.holdPosition = true;
    const hp = man.hp;
    ticks(state, 30);
    assert.equal(man.hp, hp);
    assert.equal(sub.surfacedTick, undefined, "it never fired");
  });

  it("strikes a boat on the water and shows itself when it fires", () => {
    const { state, lx0, ly0 } = harbour();
    const sub = spawn(state, "submarine", "A", lx0 + 4, ly0 + 10);
    sub.facing = 0;
    const boat = spawn(state, "gunboat", "B", lx0 + 22, ly0 + 10);
    boat.holdPosition = true;
    boat.cooldown = 1e6;
    const hp = boat.hp;
    applyCommand(state, "A", { type: "cmd.attack", ids: [sub.id], targetId: boat.id });
    for (let i = 0; i < 200 && boat.hp === hp; i++) step(state, TICK_DT);
    assert.ok(boat.hp < hp, "the torpedo found it");
    assert.notEqual(sub.surfacedTick, undefined);
  });

  it("runs slow and in sight as a body the enemy can see but nobody can order", () => {
    const { state, lx0, ly0 } = harbour();
    const sub = spawn(state, "submarine", "A", lx0 + 4, ly0 + 10);
    sub.facing = 0;
    const boat = spawn(state, "gunboat", "B", lx0 + 40, ly0 + 10);
    boat.holdPosition = true;
    boat.cooldown = 1e6;
    applyCommand(state, "A", { type: "cmd.attack", ids: [sub.id], targetId: boat.id });
    let body: Entity | undefined;
    for (let i = 0; i < 200 && !body; i++) {
      step(state, TICK_DT);
      body = [...state.entities.values()].find((e) => isTorpedoBody(e.type) && e.hp > 0);
    }
    assert.ok(body, "the torpedo runs as an entity");
    assert.equal(body.ownerId, "A");
    const p = state.projectiles.find((q) => q.bodyId === body!.id);
    assert.ok(p, "its warhead round rides with it");
    assert.ok(Math.abs(Math.hypot(p.vx, p.vy) - TORPEDO_SPEED) < 1e-9);
    assert.equal(snapshotFor(state, "B").entities.some((v) => v.id === body!.id), true, "the enemy sees it running");
    assert.equal(snapshotFor(state, "A").projectiles.some((v) => v.id === p.id), false, "drawn as its body, not as a round");
    const x0 = body.x;
    step(state, TICK_DT);
    assert.ok(body.x > x0, "the body moves with its round");
    assert.equal(applyCommand(state, "A", { type: "cmd.move", ids: [body.id], x: body.x, y: body.y + 40 }).ok, false);
  });

  it("is lost when a gun shoots its body apart before it arrives", () => {
    const { state, lx0, ly0 } = harbour();
    const sub = spawn(state, "submarine", "A", lx0 + 4, ly0 + 10);
    sub.facing = 0;
    const boat = spawn(state, "gunboat", "B", lx0 + 40, ly0 + 10);
    boat.holdPosition = true;
    boat.cooldown = 1e6;
    const hp = boat.hp;
    applyCommand(state, "A", { type: "cmd.attack", ids: [sub.id], targetId: boat.id });
    let body: Entity | undefined;
    for (let i = 0; i < 200 && !body; i++) {
      step(state, TICK_DT);
      body = [...state.entities.values()].find((e) => isTorpedoBody(e.type) && e.hp > 0);
    }
    assert.ok(body);
    sub.cooldown = 1e6;
    boat.cooldown = 0;
    assert.equal(applyCommand(state, "B", { type: "cmd.attack", ids: [boat.id], targetId: body.id }).ok, true);
    const id = body.id;
    for (let i = 0; i < 200 && state.entities.has(id); i++) step(state, TICK_DT);
    assert.equal(state.entities.has(id), false, "the 20mm took it apart");
    assert.equal(state.projectiles.some((q) => q.bodyId === id), false, "and its warhead with it");
    ticks(state, 100);
    assert.equal(boat.hp, hp, "it never arrived");
  });

  it("runs aground on a spit of land between it and the target", () => {
    const { state, lx0, ly0 } = harbour();
    land(state, lx0 + 12, ly0, lx0 + 14, ly0 + 20, 0);
    const sub = spawn(state, "submarine", "A", lx0 + 4, ly0 + 10);
    sub.facing = 0;
    const boat = spawn(state, "gunboat", "B", lx0 + 22, ly0 + 10);
    boat.holdPosition = true;
    const hp = boat.hp;
    applyCommand(state, "A", { type: "cmd.attack", ids: [sub.id], targetId: boat.id });
    ticks(state, 60);
    assert.notEqual(sub.surfacedTick, undefined, "it fired");
    assert.equal(boat.hp, hp, "the spit took the torpedo");
  });
});

describe("Submarine torpedo load", () => {
  it("leaves the slip with a full load and spends one torpedo a shot", () => {
    const { state, lx0, ly0 } = harbour();
    const sub = spawn(state, "submarine", "A", lx0 + 4, ly0 + 10);
    assert.equal(sub.clip, SUB_TORPEDOES);
    sub.facing = 0;
    sub.clip = 1;
    const boat = spawn(state, "gunboat", "B", lx0 + 22, ly0 + 10);
    boat.holdPosition = true;
    boat.cooldown = 1e6;
    boat.hp = boat.hpMax = 1_000_000;
    applyCommand(state, "A", { type: "cmd.attack", ids: [sub.id], targetId: boat.id });
    for (let i = 0; i < 200 && boat.hp === boat.hpMax; i++) step(state, TICK_DT);
    assert.ok(boat.hp < boat.hpMax, "the last torpedo found it");
    assert.equal(sub.clip, 0);
    const hp = boat.hp;
    ticks(state, secondsToTicks(catalog("submarine").cooldown * 3));
    assert.equal(boat.hp, hp, "empty tubes stay silent");
    const running = [...state.entities.values()].filter((e) => isTorpedoBody(e.type) && e.hp > 0);
    assert.equal(running.length, 0);
  });

  it("loads again only beside a friendly Marine Base", () => {
    const { state, lx0, ly0 } = harbour();
    const sub = spawn(state, "submarine", "A", lx0 + 10, ly0 + 10);
    sub.holdPosition = true;
    sub.clip = 0;
    ticks(state, secondsToTicks(SUB_REARM_SECONDS) + 2);
    assert.equal(sub.clip, 0, "no base, no torpedoes");
    makeEntity(state, "dock", "A", tileCenter(lx0 + 13, state.tileSize), tileCenter(ly0 + 10, state.tileSize), {
      tileX: lx0 + 13,
      tileY: ly0 + 9,
    });
    ticks(state, secondsToTicks(SUB_REARM_SECONDS) + 2);
    assert.equal(sub.clip, 1);
    ticks(state, secondsToTicks(SUB_REARM_SECONDS * (SUB_TORPEDOES + 2)));
    assert.equal(sub.clip, SUB_TORPEDOES, "never past a full load");
  });
});

describe("Submarine runs submerged", () => {
  it("is seen only close by, or for a while after it fires", () => {
    const { state, lx0, ly0 } = harbour();
    const sub = spawn(state, "submarine", "B", lx0 + 30, ly0 + 20);
    sub.cooldown = 1e6; // keep the tube quiet: a shot would give it away
    const watcher = spawn(state, "gunboat", "A", lx0 + 30 - (SUB_DETECT_TILES + 6), ly0 + 20);
    watcher.holdPosition = true;
    watcher.cooldown = 1e6; // and hold its gun, or it sinks the sub the moment it shows
    step(state, TICK_DT);
    assert.equal(hiddenSubmarine(state, "A", sub), false, "it leaves the slip surfaced");
    assert.equal(applyCommand(state, "B", { type: "cmd.dive", ids: [sub.id], down: true }).ok, true);
    step(state, TICK_DT);
    assert.equal(hiddenSubmarine(state, "A", sub), true);
    assert.equal(canSeeEntity(state, "A", sub), false);
    assert.equal(snapshotFor(state, "A").entities.some((v) => v.id === sub.id), false, "not in A's snapshot");
    const own = snapshotFor(state, "B").entities.find((v) => v.id === sub.id);
    assert.equal(own?.submerged, true, "its owner is told it runs submerged");

    sub.surfacedTick = state.tick;
    assert.equal(canSeeEntity(state, "A", sub), true, "a shot gives it away");
    ticks(state, secondsToTicks(SUB_REVEAL_SECONDS) + 2);
    assert.equal(canSeeEntity(state, "A", sub), false, "and it slips under again");

    const close = at(state, lx0 + 30 - (SUB_DETECT_TILES - 2), ly0 + 20);
    watcher.x = close.x;
    watcher.y = close.y;
    assert.equal(hiddenSubmarine(state, "A", sub), false);
    assert.equal(canSeeEntity(state, "A", sub), true, "close by, it is spotted");
  });

  it("spawns surfaced with full air, spends it below, and comes up when it runs out", () => {
    const { state, lx0, ly0 } = harbour();
    const sub = spawn(state, "submarine", "A", lx0 + 10, ly0 + 10);
    sub.cooldown = 1e6;
    const view = snapshotFor(state, "A").entities.find((v) => v.id === sub.id);
    assert.equal(view?.submerged, undefined, "surfaced by default");
    assert.deepEqual(view?.dive, { air: SUB_DIVE_SECONDS, airMax: SUB_DIVE_SECONDS, winded: undefined });
    assert.equal(applyCommand(state, "A", { type: "cmd.dive", ids: [sub.id], down: true }).ok, true);
    assert.equal(diving(sub), true);
    ticks(state, secondsToTicks(10));
    assert.ok(Math.abs(sub.dive!.air - (SUB_DIVE_SECONDS - 10)) < 0.5, "ten seconds of air spent");
    assert.equal(snapshotFor(state, "A").entities.find((v) => v.id === sub.id)?.submerged, true);
    // Nearly out.
    sub.dive!.air = 0.5;
    ticks(state, secondsToTicks(1));
    assert.equal(diving(sub), false, "out of air, it surfaced");
    assert.equal(sub.dive!.winded, true);
    const refused = applyCommand(state, "A", { type: "cmd.dive", ids: [sub.id], down: true });
    assert.equal(refused.ok, false, "it cannot go back down yet");
    ticks(state, secondsToTicks(SUB_DIVE_SECONDS / SUB_AIR_RECOVER_MUL) + 2);
    assert.equal(sub.dive!.air, SUB_DIVE_SECONDS, "the air is back");
    assert.equal(sub.dive!.winded, undefined);
    assert.equal(applyCommand(state, "A", { type: "cmd.dive", ids: [sub.id], down: true }).ok, true);
    assert.equal(diving(sub), true);
  });

  it("must surface to strike a boat; an attack order brings it up", () => {
    const { state, lx0, ly0 } = harbour();
    const sub = spawn(state, "submarine", "A", lx0 + 4, ly0 + 10);
    sub.facing = 0;
    const boat = spawn(state, "gunboat", "B", lx0 + 14, ly0 + 10);
    boat.holdPosition = true;
    boat.cooldown = 1e6;
    const hp = boat.hp;
    applyCommand(state, "A", { type: "cmd.dive", ids: [sub.id], down: true });
    ticks(state, 120);
    assert.equal(boat.hp, hp, "below, it lets the hull pass");
    assert.equal(sub.surfacedTick, undefined, "and never fired");
    applyCommand(state, "A", { type: "cmd.attack", ids: [sub.id], targetId: boat.id });
    assert.equal(diving(sub), false, "the attack order brought it up");
    for (let i = 0; i < 200 && boat.hp === hp; i++) step(state, TICK_DT);
    assert.ok(boat.hp < hp);
  });

  it("torpedoes another submarine that is down, staying under", () => {
    const { state, lx0, ly0 } = harbour();
    const sub = spawn(state, "submarine", "A", lx0 + 4, ly0 + 10);
    sub.facing = 0;
    const prey = spawn(state, "submarine", "B", lx0 + 14, ly0 + 10);
    prey.holdPosition = true;
    prey.cooldown = 1e6;
    applyCommand(state, "A", { type: "cmd.dive", ids: [sub.id], down: true });
    applyCommand(state, "B", { type: "cmd.dive", ids: [prey.id], down: true });
    const hp = prey.hp;
    applyCommand(state, "A", { type: "cmd.attack", ids: [sub.id], targetId: prey.id });
    assert.equal(diving(sub), true, "a target below needs no surfacing");
    for (let i = 0; i < 200 && prey.hp === hp; i++) step(state, TICK_DT);
    assert.ok(prey.hp < hp, "the deep torpedo found it");
  });
});

describe("boats turn before they move", () => {
  it("swings the bow onto the course before it makes way", () => {
    const { state, lx0, ly0 } = harbour();
    const ships = TRAIN_TYPES.filter((t) => isNavalType(t));
    assert.deepEqual([...ships].sort(), ["battleship", "gunboat", "submarine"]);
    for (const type of ships) {
      assert.equal(catalog(type).turnInPlace, true, `${type} turns before it moves`);
      const lane = type === "gunboat" ? 4 : type === "submarine" ? 10 : 20;
      const boat = spawn(state, type, "A", lx0 + 25, ly0 + lane);
      boat.facing = 0;
      boat.cooldown = 1e6;
      const behind = { x: boat.x - 15 * state.tileSize, y: boat.y };
      const x0 = boat.x;
      const y0 = boat.y;
      applyCommand(state, "A", { type: "cmd.move", ids: [boat.id], x: behind.x, y: behind.y });
      step(state, TICK_DT);
      step(state, TICK_DT);
      assert.equal(boat.x, x0, `${type} holds while it turns`);
      assert.equal(boat.y, y0, `${type} holds while it turns`);
      assert.notEqual(boat.facing, 0, `${type} is turning`);
      ticks(state, secondsToTicks(180 / catalog(type).turnDegPerSec) + 200);
      assert.ok(boat.x < x0 - 5 * state.tileSize, `${type} got under way once round`);
    }
  });
});
