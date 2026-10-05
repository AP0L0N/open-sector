import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import {
  ASW_REARM_SECONDS,
  ASW_REPLACE_SECONDS,
  ASW_TORPEDOES,
  SONAR_RANGE_TILES,
  SUB_DIVE_SECONDS,
  TICK_DT,
  TILE_SUBDIV,
  TORPEDO_RANGE_TILES,
  TORPEDO_SPEED,
  TRAIN_TYPES,
  WATER_MINE_ARM_SECONDS,
  WATER_MINE_GAP_SECONDS,
  WATER_MINE_REARM_SECONDS,
  WATER_MINES,
  catalog,
  hasSonar,
  isAircraftType,
  isAswHeli,
  isNavalType,
  isTorpedoBody,
  secondsToTicks,
} from "../catalog.js";
import { TILE_EMPTY, TILE_WATER } from "../maps.js";
import { applyCommand } from "./commands.js";
import { heliOf, sonarContacts } from "./destroyer.js";
import { makeEntity, tileCenter } from "./geo.js";
import { createMatch, step } from "./match.js";
import { hiddenSubmarine } from "./naval.js";
import { snapshotFor } from "./snapshot.js";
import { producerType } from "./train.js";
import { canSeeEntity } from "./vision.js";
import type { Entity, MatchState } from "./types.js";

const T = TILE_SUBDIV;

function twoPlayerMatch(): MatchState {
  const r = createRoom({ id: "DD1", hostId: "A", hostName: "Alpha", mapId: "yard-64", maxSlots: 8 });
  if (!r.ok) throw new Error(r.message);
  const room = r.value;
  assert.equal(joinRoom(room, "B", "Bravo").ok, true);
  updateSelf(room, "A", { ready: true, spawnId: 1 });
  updateSelf(room, "B", { ready: true, spawnId: 4 });
  const started = startMatch(room, "A", () => 0);
  if (!started.ok) throw new Error(started.message);
  const state = createMatch(room, started.value);
  // Bare board: no village, no Rigs. Each test lays the units it is about.
  for (const e of [...state.entities.values()]) state.entities.delete(e.id);
  state.occupy.fill(0);
  return state;
}

function paint(state: MatchState, x0: number, y0: number, x1: number, y1: number, tile: number): void {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = y * state.width + x;
      state.terrain[i] = tile;
      state.blocked[i] = tile === TILE_WATER ? 1 : 0;
      state.heights[i] = 0;
      state.scrapYield[i] = 0;
    }
  }
  state.visionTick = -1;
}

/** The whole middle of the map is open water, with a dry rim. */
function sea(): MatchState {
  const state = twoPlayerMatch();
  paint(state, 0, 0, state.width - 1, state.height - 1, TILE_EMPTY);
  paint(state, 20, 20, state.width - 21, state.height - 21, TILE_WATER);
  return state;
}

function spawn(state: MatchState, type: Parameters<typeof makeEntity>[1], owner: string, tx: number, ty: number): Entity {
  return makeEntity(state, type, owner, tileCenter(tx, state.tileSize), tileCenter(ty, state.tileSize));
}

function ticks(state: MatchState, n: number): void {
  for (let i = 0; i < n; i++) step(state, TICK_DT);
}

function heliTorpedoes(state: MatchState, heliId: number) {
  return state.projectiles.filter((p) => p.torpedo && p.fromId === heliId);
}

/** A submarine sitting still, submerged, its own tubes quiet. */
function sub(state: MatchState, owner: string, tx: number, ty: number): Entity {
  const s = spawn(state, "submarine", owner, tx, ty);
  s.dive = { down: true, air: SUB_DIVE_SECONDS };
  s.cooldown = 1e6;
  s.clip = 0;
  return s;
}

describe("Destroyer catalog", () => {
  it("is a ship trained at the Marine Base, with sonar, a helicopter, and mines", () => {
    assert.ok(TRAIN_TYPES.includes("destroyer"));
    assert.equal(isNavalType("destroyer"), true);
    assert.equal(hasSonar("destroyer"), true);
    assert.equal(producerType("destroyer"), "dock");
    assert.ok(catalog("destroyer").rangeTiles < catalog("gunboat").rangeTiles, "short reach");
    assert.ok(catalog("destroyer").cooldown < catalog("gunboat").cooldown, "fast fire");
    const state = sea();
    const d = spawn(state, "destroyer", "A", 60, 60);
    assert.equal(d.asw?.torpedoes, ASW_TORPEDOES);
    assert.equal(d.asw?.mines, WATER_MINES);
    assert.equal(d.asw?.heliId, null);
  });

  it("its helicopter is an aircraft nobody trains", () => {
    assert.equal(isAircraftType("aswheli"), true);
    assert.equal(isAswHeli("aswheli"), true);
    assert.equal(TRAIN_TYPES.includes("aswheli" as never), false);
  });
});

describe("Destroyer sonar", () => {
  it("hears an enemy submarine down or up within its ring, and not past it", () => {
    const state = sea();
    spawn(state, "destroyer", "A", 60, 120);
    const near = sub(state, "B", 60 + SONAR_RANGE_TILES - 2 * T, 120);
    const far = sub(state, "B", 60 + SONAR_RANGE_TILES + 4 * T, 120);
    const up = spawn(state, "submarine", "B", 60, 120 + 10 * T);
    up.cooldown = 1e6;
    const ids = sonarContacts(state, "A").map((c) => c.id);
    assert.ok(ids.includes(near.id), "submerged boat inside the ring");
    assert.ok(ids.includes(up.id), "surfaced boat inside the ring");
    assert.equal(ids.includes(far.id), false, "beyond the ring");
    assert.equal(sonarContacts(state, "A").find((c) => c.id === near.id)?.down, true);
    assert.deepEqual(sonarContacts(state, "B"), [], "the other side hears nothing");
  });

  it("goes out on the owner's snapshot only, and a boat it hears below is in sight past the fog", () => {
    const state = sea();
    const d = spawn(state, "destroyer", "A", 60, 120);
    d.asw!.torpedoes = 0; // keep the helicopter home for this one
    d.asw!.rearm = 1e6;
    d.cooldown = 1e6;
    const gap = catalog("destroyer").sightTiles + 3 * T;
    assert.ok(gap < SONAR_RANGE_TILES, "past the ship's own sight, inside the ring");
    const s = sub(state, "B", 60 + gap, 120);
    step(state, TICK_DT);
    const mine = snapshotFor(state, "A");
    assert.deepEqual(mine.sonar?.map((c) => c.id), [s.id]);
    assert.equal(snapshotFor(state, "B").sonar, undefined);
    assert.equal(hiddenSubmarine(state, "A", s), false, "a gun can lay on it");
    assert.equal(canSeeEntity(state, "A", s), true);
    assert.equal(mine.entities.some((e) => e.id === s.id), true, "it shows through the fog");
    s.x = tileCenter(60 + SONAR_RANGE_TILES + 4 * T, state.tileSize);
    assert.equal(hiddenSubmarine(state, "A", s), true, "out of the ring it is gone again");
    assert.equal(snapshotFor(state, "A").entities.some((e) => e.id === s.id), false);
    const own = mine.entities.find((e) => e.id === d.id);
    assert.equal(own?.asw?.heli, "rearm");
    assert.equal(own?.asw?.mines, WATER_MINES);
  });
});

describe("ASW helicopter", () => {
  it("takes off on a contact, drops three full-run torpedoes at it, and comes home to load", () => {
    const state = sea();
    const d = spawn(state, "destroyer", "A", 60, 120);
    d.cooldown = 1e6;
    sub(state, "B", 60 + 12 * T, 120);
    step(state, TICK_DT);
    const heli = heliOf(state, d);
    assert.ok(heli, "it launched");
    assert.equal(heli.type, "aswheli");
    assert.equal(d.asw!.torpedoes, 0, "the torpedoes went with it");
    const heliId = heli.id;
    let dropped = heliTorpedoes(state, heliId);
    for (let i = 0; i < 2000 && dropped.length === 0; i++) {
      step(state, TICK_DT);
      dropped = heliTorpedoes(state, heliId);
    }
    assert.equal(dropped.length, ASW_TORPEDOES, "three torpedoes at once");
    const run = TORPEDO_RANGE_TILES * state.tileSize;
    for (const p of dropped) {
      assert.ok(Math.abs(p.life - (run / TORPEDO_SPEED + 0.05)) < TICK_DT * 2, "each runs the full length");
      assert.equal(p.deep, undefined, "a surface torpedo: it meets a boat down or up");
    }
    const headings = dropped.map((p) => Math.atan2(p.vy, p.vx));
    assert.ok(Math.max(...headings) - Math.min(...headings) > 0.05, "a fan, not one line");
    for (let i = 0; i < 3000 && state.entities.has(heliId); i++) step(state, TICK_DT);
    assert.equal(state.entities.has(heliId), false, "landed and stowed");
    assert.equal(d.asw!.heliId, null);
    assert.equal(d.asw!.torpedoes, 0);
    assert.ok(d.asw!.rearm > ASW_REARM_SECONDS - 1, "loading on deck");
  });

  it("a contact close aboard still waits for the climb before the drop", () => {
    const state = sea();
    const d = spawn(state, "destroyer", "A", 60, 120);
    d.cooldown = 1e6;
    const s = sub(state, "B", 60 + 2 * T, 120);
    step(state, TICK_DT);
    const heli = heliOf(state, d)!;
    step(state, TICK_DT);
    assert.equal(heli.heli!.torpedoes, ASW_TORPEDOES, "not from the deck");
    const x0 = heli.x;
    for (let i = 0; i < 200 && heli.heli!.torpedoes > 0; i++) step(state, TICK_DT);
    assert.equal(heli.heli!.torpedoes, 0, "all three went");
    assert.ok(heli.air!.alt >= 3, "dropped from the air");
    assert.ok(heli.x > x0 + T * state.tileSize, "flew out toward the contact first");
    assert.ok(s.hp < s.hpMax || s.wreck, "the boat close aboard was hit");
    ticks(state, secondsToTicks(4));
    assert.equal(d.hp, d.hpMax, "torpedoes let go over its own deck run under it");
  });

  it("sinks a submarine that sits still below", () => {
    const state = sea();
    const d = spawn(state, "destroyer", "A", 60, 120);
    d.cooldown = 1e6;
    const s = sub(state, "B", 60 + 12 * T, 120);
    const hp = s.hp;
    for (let i = 0; i < 3000 && s.hp === hp; i++) step(state, TICK_DT);
    assert.ok(s.hp < hp || s.wreck, "a torpedo found the boat below");
  });

  it("loads again after the rearm and goes out on the next contact", () => {
    const state = sea();
    const d = spawn(state, "destroyer", "A", 60, 120);
    d.asw!.torpedoes = 0;
    d.asw!.rearm = 2;
    sub(state, "B", 60 + 12 * T, 120);
    step(state, TICK_DT);
    assert.equal(heliOf(state, d), null, "still loading");
    ticks(state, secondsToTicks(2) + 2);
    assert.ok(heliOf(state, d), "loaded and away");
  });

  it("takes no orders", () => {
    const state = sea();
    const d = spawn(state, "destroyer", "A", 60, 120);
    sub(state, "B", 60 + 12 * T, 120);
    step(state, TICK_DT);
    const heli = heliOf(state, d)!;
    applyCommand(state, "A", { type: "cmd.move", ids: [heli.id], x: 10, y: 10 });
    assert.equal(heli.order ?? null, null);
    assert.equal(heli.heli!.contactId != null, true, "still after its contact");
  });

  it("shot down, the ship gets a new one after a while", () => {
    const state = sea();
    const d = spawn(state, "destroyer", "A", 60, 120);
    d.cooldown = 1e6;
    const s = sub(state, "B", 60 + 12 * T, 120);
    step(state, TICK_DT);
    heliOf(state, d)!.hp = 0;
    ticks(state, 2);
    assert.equal(d.asw!.heliId, null);
    assert.ok(d.asw!.replace > ASW_REPLACE_SECONDS - 1);
    assert.equal(snapshotFor(state, "A").entities.find((e) => e.id === d.id)?.asw?.heli, "lost");
    state.entities.delete(s.id);
    ticks(state, secondsToTicks(ASW_REPLACE_SECONDS) + 2);
    assert.equal(d.asw!.torpedoes, ASW_TORPEDOES, "a new one on deck, loaded");
  });

  it("goes down when its ship is sunk", () => {
    const state = sea();
    const d = spawn(state, "destroyer", "A", 60, 120);
    d.cooldown = 1e6;
    sub(state, "B", 60 + 12 * T, 120);
    ticks(state, 20);
    const heli = heliOf(state, d)!;
    d.hp = 0;
    ticks(state, 2);
    assert.ok(heli.hp <= 0 || heli.air?.phase === "crash" || !state.entities.has(heli.id));
  });
});

describe("Water mines", () => {
  it("lays one at a time over the stern, three in all", () => {
    const state = sea();
    const d = spawn(state, "destroyer", "A", 60, 120);
    d.facing = 0;
    assert.equal(applyCommand(state, "A", { type: "cmd.laymine", ids: [d.id] }).ok, true);
    assert.equal(state.mines.length, 1);
    const m = state.mines[0]!;
    assert.equal(m.water, true);
    assert.ok(m.x < d.x, "astern of a ship heading east");
    assert.equal(applyCommand(state, "A", { type: "cmd.laymine", ids: [d.id] }).ok, false, "rail still clearing");
    for (let k = 1; k < WATER_MINES; k++) {
      ticks(state, secondsToTicks(WATER_MINE_GAP_SECONDS) + 1);
      assert.equal(applyCommand(state, "A", { type: "cmd.laymine", ids: [d.id] }).ok, true);
    }
    ticks(state, secondsToTicks(WATER_MINE_GAP_SECONDS) + 1);
    assert.equal(applyCommand(state, "A", { type: "cmd.laymine", ids: [d.id] }).ok, false, "the rail is empty");
    assert.equal(state.mines.length, WATER_MINES);
    assert.equal(d.hp, d.hpMax, "its own mines spare the ship that laid them while it sits on them");
  });

  it("goes off under an enemy boat and a submarine down; never under a plane or a torpedo", () => {
    const state = sea();
    const d = spawn(state, "destroyer", "A", 60, 120);
    d.facing = 0;
    applyCommand(state, "A", { type: "cmd.laymine", ids: [d.id] });
    const m = state.mines[0]!;
    ticks(state, secondsToTicks(WATER_MINE_ARM_SECONDS) + 2);
    // Move the layer well away so it no longer counts.
    d.x += 40 * state.tileSize;
    ticks(state, 2);
    const plane = makeEntity(state, "he111", "B", m.x, m.y);
    plane.air!.phase = "fly";
    plane.air!.alt = 20;
    const torp = makeEntity(state, "torpedo", "B", m.x, m.y);
    ticks(state, 2);
    assert.equal(state.mines.length, 1, "neither sets it off");
    state.entities.delete(plane.id);
    state.entities.delete(torp.id);
    const s = makeEntity(state, "submarine", "B", m.x, m.y);
    s.dive = { down: true, air: SUB_DIVE_SECONDS };
    s.cooldown = 1e6;
    const hp = s.hp;
    step(state, TICK_DT);
    assert.equal(state.mines.length, 0, "spent");
    assert.ok(s.hp < hp || s.wreck, "the boat below took the blast");
  });

  it("is shown to the owner and allies only", () => {
    const state = sea();
    const d = spawn(state, "destroyer", "A", 60, 120);
    applyCommand(state, "A", { type: "cmd.laymine", ids: [d.id] });
    assert.equal(snapshotFor(state, "A").mines[0]?.water, true);
    assert.equal(snapshotFor(state, "B").mines.length, 0);
  });

  it("the rail fills again beside a Marine Base", () => {
    const state = sea();
    const dock = makeEntity(state, "dock", "A", tileCenter(60, state.tileSize), tileCenter(120, state.tileSize), {
      tileX: 58,
      tileY: 118,
    });
    const d = makeEntity(state, "destroyer", "A", dock.x + dock.tileW * state.tileSize, dock.y);
    d.asw!.mines = 0;
    ticks(state, secondsToTicks(WATER_MINE_REARM_SECONDS) + 2);
    assert.equal(d.asw!.mines, 1);
  });

  it("only the Destroyer lays them", () => {
    const state = sea();
    const g = spawn(state, "gunboat", "A", 60, 120);
    assert.equal(applyCommand(state, "A", { type: "cmd.laymine", ids: [g.id] }).ok, false);
    assert.equal(isTorpedoBody("destroyer"), false);
  });
});
