import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  catalog,
  HEIGHT_BASE,
  HULL_LEVEL_SIGHT,
  INFANTRY_UPHILL_SIGHT,
  TICK_DT,
  isCivilianType,
} from "../catalog.js";
import { TILE_BLOCKED, TILE_EMPTY, TILE_TREE } from "../maps.js";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import { destroyEntity, makeEntity, tileCenter } from "./geo.js";
import { createMatch, step } from "./match.js";
import { sightTilesOf } from "./elevation.js";
import { spawnSmokeCloud } from "./smoke.js";
import { snapshotFor } from "./snapshot.js";
import {
  canSeeEntity,
  paintEntitySight,
  sealFovIslands,
  tileOnMask,
  visionMask,
  visionMaskFromSnapshot,
  type SightSource,
} from "./vision.js";
import type { MatchState } from "./types.js";

function twoPlayerMatch(): { state: MatchState; a: string; b: string } {
  const r = createRoom({
    id: "V1",
    hostId: "A",
    hostName: "Alpha",
    mapId: "yard-64",
    maxSlots: 8,
  });
  if (!r.ok) throw new Error(r.message);
  const room = r.value;
  assert.equal(joinRoom(room, "B", "Bravo").ok, true);
  updateSelf(room, "A", { ready: true, spawnId: 1 });
  updateSelf(room, "B", { ready: true, spawnId: 4 });
  const started = startMatch(room, "A");
  if (!started.ok) throw new Error(started.message);
  return { state: createMatch(room, started.value, { startingUnits: false }), a: "A", b: "B" };
}

describe("building sight", () => {
  it("paints a core from its center and still lights the footprint", () => {
    const { state, a } = twoPlayerMatch();
    const ts = state.tileSize;
    const tileX = 40;
    const tileY = 40;
    const core = makeEntity(state, "core", a, tileCenter(tileX, ts), tileCenter(tileY, ts), {
      tileX,
      tileY,
    });
    const mask = new Uint8Array(state.width * state.height);
    paintEntitySight(mask, state.width, state.height, ts, core);

    for (let y = tileY; y < tileY + core.tileH; y++) {
      for (let x = tileX; x < tileX + core.tileW; x++) {
        assert.equal(tileOnMask(mask, state.width, x, y), true, `footprint ${x},${y}`);
      }
    }

    const cx = tileX + Math.floor(core.tileW / 2);
    const cy = tileY + Math.floor(core.tileH / 2);
    const r = sightTilesOf("core", 0);
    assert.equal(tileOnMask(mask, state.width, cx + r, cy), true);
    assert.equal(tileOnMask(mask, state.width, cx + r + 1, cy), false);
    assert.equal(tileOnMask(mask, state.width, tileX - r, cy), false);

    const unitMask = new Uint8Array(state.width * state.height);
    const unit: SightSource = {
      kind: "unit",
      type: "core",
      ownerId: a,
      x: tileCenter(cx, ts),
      y: tileCenter(cy, ts),
      tileX: cx,
      tileY: cy,
      tileW: 1,
      tileH: 1,
    };
    paintEntitySight(unitMask, state.width, state.height, ts, unit);
    let coreN = 0;
    let unitN = 0;
    for (const v of mask) if (v) coreN++;
    for (const v of unitMask) if (v) unitN++;
    assert.ok(coreN >= unitN, `core ${coreN} vs unit ${unitN}`);
    assert.ok(coreN < unitN * 4, `core ${coreN} vs unit ${unitN}`);
  });

  it("matches infantry fog radius and peeks over a rise that hides a hull", () => {
    const { state, a } = twoPlayerMatch();
    state.heights.fill(0);
    const ts = state.tileSize;
    const ox = 20;
    const oy = 20;
    const inf = makeEntity(state, "trooper", a, tileCenter(ox, ts), tileCenter(oy, ts));
    const bldg: SightSource = {
      kind: "building",
      type: "dynamo",
      ownerId: a,
      x: tileCenter(ox, ts),
      y: tileCenter(oy, ts),
      tileX: ox,
      tileY: oy,
      tileW: 1,
      tileH: 1,
    };
    const infMask = new Uint8Array(state.width * state.height);
    const bldgMask = new Uint8Array(state.width * state.height);
    paintEntitySight(infMask, state.width, state.height, ts, inf, state.heights);
    paintEntitySight(bldgMask, state.width, state.height, ts, bldg, state.heights);
    const r = sightTilesOf("trooper", 0);
    assert.equal(sightTilesOf("dynamo", 0), r);
    assert.equal(tileOnMask(infMask, state.width, ox + r, oy), true);
    assert.equal(tileOnMask(bldgMask, state.width, ox + r, oy), true);

    state.heights[oy * state.width + (ox + 2)] = 6;
    const tank = makeEntity(state, "warden", a, tileCenter(ox, ts), tileCenter(oy, ts));
    const peekInf = new Uint8Array(state.width * state.height);
    const peekBldg = new Uint8Array(state.width * state.height);
    const peekTank = new Uint8Array(state.width * state.height);
    paintEntitySight(peekInf, state.width, state.height, ts, inf, state.heights);
    paintEntitySight(peekBldg, state.width, state.height, ts, bldg, state.heights);
    paintEntitySight(peekTank, state.width, state.height, ts, tank, state.heights);
    assert.equal(tileOnMask(peekInf, state.width, ox + 8, oy), true);
    assert.equal(tileOnMask(peekBldg, state.width, ox + 8, oy), true);
    assert.equal(tileOnMask(peekTank, state.width, ox + 8, oy), false);
  });

  it("sees a hilltop past flat sight that a tank still misses", () => {
    const { state, a } = twoPlayerMatch();
    state.heights.fill(0);
    const ts = state.tileSize;
    const ox = 20;
    const oy = 20;
    const rise = 6;
    const dist = catalog("trooper").sightTiles + rise * INFANTRY_UPHILL_SIGHT;
    assert.ok(dist < state.width - ox);
    state.heights[oy * state.width + (ox + dist)] = rise;
    const bldg: SightSource = {
      kind: "building",
      type: "core",
      ownerId: a,
      x: tileCenter(ox, ts),
      y: tileCenter(oy, ts),
      tileX: ox,
      tileY: oy,
      tileW: 1,
      tileH: 1,
    };
    const tank = makeEntity(state, "warden", a, tileCenter(ox, ts), tileCenter(oy, ts));
    const bldgMask = new Uint8Array(state.width * state.height);
    const tankMask = new Uint8Array(state.width * state.height);
    paintEntitySight(bldgMask, state.width, state.height, ts, bldg, state.heights);
    paintEntitySight(tankMask, state.width, state.height, ts, tank, state.heights);
    assert.equal(tileOnMask(bldgMask, state.width, ox + dist, oy), true);
    assert.equal(tileOnMask(tankMask, state.width, ox + dist, oy), false);
  });

  it("sees a valley floor past flat sight that a tank still misses", () => {
    const { state, a } = twoPlayerMatch();
    const ts = state.tileSize;
    const ox = 20;
    const oy = 20;
    const drop = 6;
    const dist = catalog("trooper").sightTiles + drop * INFANTRY_UPHILL_SIGHT;
    assert.ok(dist < state.width - ox);
    state.heights.fill(drop);
    state.heights[oy * state.width + (ox + dist)] = 0;
    const bldg: SightSource = {
      kind: "building",
      type: "core",
      ownerId: a,
      x: tileCenter(ox, ts),
      y: tileCenter(oy, ts),
      tileX: ox,
      tileY: oy,
      tileW: 1,
      tileH: 1,
    };
    const tank = makeEntity(state, "warden", a, tileCenter(ox, ts), tileCenter(oy, ts));
    const bldgMask = new Uint8Array(state.width * state.height);
    const tankMask = new Uint8Array(state.width * state.height);
    paintEntitySight(bldgMask, state.width, state.height, ts, bldg, state.heights);
    paintEntitySight(tankMask, state.width, state.height, ts, tank, state.heights);
    assert.equal(tileOnMask(bldgMask, state.width, ox + dist, oy), true);
    assert.equal(tileOnMask(tankMask, state.width, ox + dist, oy), false);
  });

  it("does not light a farther peak over a closer lower ridge", () => {
    const { state, a } = twoPlayerMatch();
    state.heights.fill(0);
    const ts = state.tileSize;
    const ox = 20;
    const oy = 20;
    const peak = ox + 16;
    state.heights[oy * state.width + (ox + 4)] = HEIGHT_BASE;
    state.heights[oy * state.width + peak] = HEIGHT_BASE + 4;
    const tank = makeEntity(state, "warden", a, tileCenter(ox, ts), tileCenter(oy, ts));
    const mask = new Uint8Array(state.width * state.height);
    paintEntitySight(mask, state.width, state.height, ts, tank, state.heights);
    assert.equal(tileOnMask(mask, state.width, ox + 4, oy), true, "ridge itself");
    assert.equal(tileOnMask(mask, state.width, peak, oy), false, "peak behind ridge");
  });

  it("lets a hilltop see each lower terrace lip", () => {
    const { state, a } = twoPlayerMatch();
    state.heights.fill(0);
    const ts = state.tileSize;
    const ox = 20;
    const oy = 20;
    for (let dx = 0; dx <= 8; dx++) {
      state.heights[oy * state.width + (ox + dx)] = Math.max(0, 6 - Math.max(0, dx - 1));
    }
    const inf = makeEntity(state, "trooper", a, tileCenter(ox, ts), tileCenter(oy, ts));
    const tank = makeEntity(state, "warden", a, tileCenter(ox, ts), tileCenter(oy, ts));
    const infMask = new Uint8Array(state.width * state.height);
    const tankMask = new Uint8Array(state.width * state.height);
    paintEntitySight(infMask, state.width, state.height, ts, inf, state.heights);
    paintEntitySight(tankMask, state.width, state.height, ts, tank, state.heights);
    for (let dx = 0; dx <= 8; dx++) {
      assert.equal(tileOnMask(infMask, state.width, ox + dx, oy), true, `infantry lip ${dx}`);
      assert.equal(tileOnMask(tankMask, state.width, ox + dx, oy), true, `tank lip ${dx}`);
    }
  });

  it("does not light floor tiles behind a ridge", () => {
    const { state, a } = twoPlayerMatch();
    state.heights.fill(0);
    const ts = state.tileSize;
    const ox = 20;
    const oy = 20;
    const beyond = ox + 12;
    state.heights[oy * state.width + (ox + 6)] = HEIGHT_BASE;
    const inf = makeEntity(state, "trooper", a, tileCenter(ox, ts), tileCenter(oy, ts));
    const mask = new Uint8Array(state.width * state.height);
    paintEntitySight(mask, state.width, state.height, ts, inf, state.heights);
    assert.equal(tileOnMask(mask, state.width, ox + 6, oy), true, "ridge itself");
    assert.equal(tileOnMask(mask, state.width, beyond, oy), false, "floor behind ridge");
  });
});

describe("infantry fog", () => {
  it("paints a wider disc than a tank on the flat", () => {
    const { state, a } = twoPlayerMatch();
    state.heights.fill(0);
    const ts = state.tileSize;
    const x = tileCenter(40, ts);
    const y = tileCenter(40, ts);
    const inf = makeEntity(state, "trooper", a, x, y);
    const tank = makeEntity(state, "warden", a, x, y);
    const infMask = new Uint8Array(state.width * state.height);
    const tankMask = new Uint8Array(state.width * state.height);
    paintEntitySight(infMask, state.width, state.height, ts, inf, state.heights);
    paintEntitySight(tankMask, state.width, state.height, ts, tank, state.heights);
    const cx = 40;
    const cy = 40;
    const infR = sightTilesOf("trooper", 0);
    const tankR = sightTilesOf("warden", 0);
    assert.ok(infR > tankR);
    assert.equal(tileOnMask(infMask, state.width, cx + infR, cy), true);
    assert.equal(tileOnMask(tankMask, state.width, cx + tankR, cy), true);
    assert.equal(tileOnMask(tankMask, state.width, cx + infR, cy), false);
  });

  it("sees a hilltop past flat sight that a tank still misses", () => {
    const { state, a } = twoPlayerMatch();
    state.heights.fill(0);
    const ts = state.tileSize;
    const ox = 20;
    const oy = 20;
    const rise = 6;
    const dist = catalog("trooper").sightTiles + rise * INFANTRY_UPHILL_SIGHT;
    assert.ok(dist < state.width - ox);
    state.heights[oy * state.width + (ox + dist)] = rise;
    const inf = makeEntity(state, "trooper", a, tileCenter(ox, ts), tileCenter(oy, ts));
    const tank = makeEntity(state, "warden", a, tileCenter(ox, ts), tileCenter(oy, ts));
    const infMask = new Uint8Array(state.width * state.height);
    const tankMask = new Uint8Array(state.width * state.height);
    paintEntitySight(infMask, state.width, state.height, ts, inf, state.heights);
    paintEntitySight(tankMask, state.width, state.height, ts, tank, state.heights);
    assert.equal(tileOnMask(infMask, state.width, ox + dist, oy), true);
    assert.equal(tileOnMask(tankMask, state.width, ox + dist, oy), false);
  });

  it("sees a valley floor past flat sight that a tank still misses", () => {
    const { state, a } = twoPlayerMatch();
    state.heights.fill(0);
    const ts = state.tileSize;
    const ox = 20;
    const oy = 20;
    const drop = 6;
    const dist = catalog("trooper").sightTiles + drop * INFANTRY_UPHILL_SIGHT;
    assert.ok(dist < state.width - ox);
    state.heights.fill(drop);
    state.heights[oy * state.width + (ox + dist)] = 0;
    const inf = makeEntity(state, "trooper", a, tileCenter(ox, ts), tileCenter(oy, ts));
    const tank = makeEntity(state, "warden", a, tileCenter(ox, ts), tileCenter(oy, ts));
    const infMask = new Uint8Array(state.width * state.height);
    const tankMask = new Uint8Array(state.width * state.height);
    paintEntitySight(infMask, state.width, state.height, ts, inf, state.heights);
    paintEntitySight(tankMask, state.width, state.height, ts, tank, state.heights);
    assert.equal(tileOnMask(infMask, state.width, ox + dist, oy), true);
    assert.equal(tileOnMask(tankMask, state.width, ox + dist, oy), false);
  });

  it("lets a hull see a nearby rise a step past flat sight", () => {
    const { state, a } = twoPlayerMatch();
    state.heights.fill(0);
    const ts = state.tileSize;
    const ox = 20;
    const oy = 20;
    const rise = 4;
    const dist = catalog("warden").sightTiles + rise * HULL_LEVEL_SIGHT;
    assert.ok(dist < state.width - ox);
    state.heights[oy * state.width + (ox + dist)] = rise;
    const tank = makeEntity(state, "warden", a, tileCenter(ox, ts), tileCenter(oy, ts));
    const mask = new Uint8Array(state.width * state.height);
    paintEntitySight(mask, state.width, state.height, ts, tank, state.heights);
    assert.equal(tileOnMask(mask, state.width, ox + dist, oy), true);
    assert.equal(tileOnMask(mask, state.width, ox + dist + 1, oy), false);
  });
});

describe("smoke screens", () => {
  it("blocks sight through the cloud for every player", () => {
    const { state, a, b } = twoPlayerMatch();
    state.heights.fill(0);
    const ts = state.tileSize;
    const ox = 30;
    const oy = 30;
    const observer = makeEntity(state, "warden", a, tileCenter(ox, ts), tileCenter(oy, ts));
    const foe = makeEntity(state, "warden", b, tileCenter(ox + 20, ts), tileCenter(oy, ts));
    const visOpen = visionMask(state, a);
    assert.equal(tileOnMask(visOpen, state.width, ox + 20, oy), true, "should see the far tile before smoke");

    spawnSmokeCloud(state, tileCenter(ox + 10, ts), tileCenter(oy, ts), 1, 0);
    state.tick += 1;
    const vis = visionMask(state, a);
    assert.equal(tileOnMask(vis, state.width, ox, oy), true, "own tile");
    assert.equal(tileOnMask(vis, state.width, ox + 20, oy), false, "must not see through smoke");
    void observer;
    void foe;
  });
});

describe("visionMask cache", () => {
  it("reuses the mask while observers stay on the same tiles", () => {
    const { state, a } = twoPlayerMatch();
    const first = visionMask(state, a);
    assert.equal(visionMask(state, a), first);
    state.tick += 1;
    assert.equal(visionMask(state, a), first);
  });

  it("rebuilds after an observer moves to a new tile", () => {
    const { state, a } = twoPlayerMatch();
    const first = visionMask(state, a);
    const rig = [...state.entities.values()].find((e) => e.ownerId === a && e.kind === "unit");
    assert.ok(rig);
    rig.x += state.tileSize;
    rig.y += state.tileSize;
    const next = visionMask(state, a);
    assert.notEqual(next, first);
    assert.equal(visionMask(state, a), next);
  });
});

function clearCover(state: MatchState): void {
  state.heights.fill(0);
  state.occupy.fill(0);
  for (let i = 0; i < state.terrain.length; i++) {
    const t = state.terrain[i];
    if (t === TILE_TREE || t === TILE_BLOCKED) state.terrain[i] = TILE_EMPTY;
  }
  for (const e of [...state.entities.values()]) {
    if (isCivilianType(e.type)) destroyEntity(state, e);
  }
}

describe("building cover", () => {
  it("hides tiles behind a cottage", () => {
    const { state, a } = twoPlayerMatch();
    clearCover(state);
    const ts = state.tileSize;
    const oy = 80;
    const ox = 80;
    makeEntity(state, "trooper", a, tileCenter(ox, ts), tileCenter(oy, ts));
    const house = makeEntity(state, "cottage", "", tileCenter(ox + 8, ts), tileCenter(oy, ts), {
      tileX: ox + 4,
      tileY: oy - 3,
    });
    const behind = ox + 4 + house.tileW + 2;
    const vis = visionMask(state, a);
    assert.equal(tileOnMask(vis, state.width, house.tileX, oy), true, "near face of the house");
    assert.equal(tileOnMask(vis, state.width, behind, oy), false, "must not see through the house");
  });

  it("stamps map houses into snapshot fog even when the entity is hidden", () => {
    const { state, a } = twoPlayerMatch();
    state.heights.fill(0);
    for (let i = 0; i < state.terrain.length; i++) {
      const t = state.terrain[i];
      if (t === TILE_TREE || t === TILE_BLOCKED) state.terrain[i] = TILE_EMPTY;
    }
    const ts = state.tileSize;
    const house = [...state.entities.values()].find((e) => isCivilianType(e.type));
    assert.ok(house, "yard map has civilian houses");
    const ox = Math.max(0, house.tileX - 6);
    const oy = house.tileY + Math.floor(house.tileH / 2);
    makeEntity(state, "trooper", a, tileCenter(ox, ts), tileCenter(oy, ts));
    const behind = house.tileX + house.tileW + 2;
    assert.ok(behind < state.width);
    const live = visionMask(state, a);
    assert.equal(tileOnMask(live, state.width, behind, oy), false, "live fog blocked by house");
    const snap = snapshotFor(state, a);
    const hidden = { ...snap, entities: snap.entities.filter((e) => e.id !== house.id) };
    const fromSnap = visionMaskFromSnapshot(hidden, state.width, state.height, ts);
    assert.equal(
      tileOnMask(fromSnap, state.width, behind, oy),
      false,
      "snapshot fog still blocked by the map house",
    );
  });
});

describe("armored hull cover", () => {
  it("hides infantry behind a live tank and a wreck", () => {
    const { state, a, b } = twoPlayerMatch();
    clearCover(state);
    const ts = state.tileSize;
    const oy = 80;
    const ox = 80;
    const tankX = ox + 8;
    const infX = ox + 12;
    const observer = makeEntity(state, "trooper", a, tileCenter(ox, ts), tileCenter(oy, ts));
    const tank = makeEntity(state, "warden", b, tileCenter(tankX, ts), tileCenter(oy, ts));
    const hid = makeEntity(state, "trooper", b, tileCenter(infX, ts), tileCenter(oy, ts));
    assert.equal(canSeeEntity(state, a, tank), true, "tank itself stays visible");
    assert.equal(canSeeEntity(state, a, hid), false, "infantry behind the hull is hidden");
    assert.equal(tileOnMask(visionMask(state, a), state.width, infX, oy), false);

    tank.hp = 0;
    step(state, TICK_DT);
    assert.equal(tank.wreck, true);
    assert.equal(canSeeEntity(state, a, tank), true, "wreck stays visible");
    assert.equal(canSeeEntity(state, a, hid), false, "wreck still hides infantry");
    void observer;
  });

  it("does not blind a tank looking past its own hull", () => {
    const { state, a, b } = twoPlayerMatch();
    clearCover(state);
    const ts = state.tileSize;
    const oy = 80;
    const ox = 80;
    const tank = makeEntity(state, "warden", a, tileCenter(ox, ts), tileCenter(oy, ts));
    const foe = makeEntity(state, "trooper", b, tileCenter(ox + 16, ts), tileCenter(oy, ts));
    assert.equal(canSeeEntity(state, a, foe), true);
    assert.equal(tileOnMask(visionMask(state, a), state.width, ox + 16, oy), true);
    void tank;
  });

  it("hides infantry behind a hauler", () => {
    const { state, a, b } = twoPlayerMatch();
    clearCover(state);
    const ts = state.tileSize;
    const oy = 80;
    const ox = 80;
    makeEntity(state, "trooper", a, tileCenter(ox, ts), tileCenter(oy, ts));
    const truck = makeEntity(state, "hauler", b, tileCenter(ox + 8, ts), tileCenter(oy, ts));
    truck.autoHarvest = false;
    const hid = makeEntity(state, "trooper", b, tileCenter(ox + 12, ts), tileCenter(oy, ts));
    assert.equal(canSeeEntity(state, a, hid), false, "infantry behind the hull is hidden");
  });

  it("rebuilds fog when an armored hull moves aside", () => {
    const { state, a, b } = twoPlayerMatch();
    clearCover(state);
    const ts = state.tileSize;
    const oy = 80;
    const ox = 80;
    makeEntity(state, "trooper", a, tileCenter(ox, ts), tileCenter(oy, ts));
    const tank = makeEntity(state, "warden", b, tileCenter(ox + 8, ts), tileCenter(oy, ts));
    const hid = makeEntity(state, "trooper", b, tileCenter(ox + 12, ts), tileCenter(oy, ts));
    const blocked = visionMask(state, a);
    assert.equal(tileOnMask(blocked, state.width, ox + 12, oy), false);
    tank.y = tileCenter(oy + 8, ts);
    const opened = visionMask(state, a);
    assert.notEqual(opened, blocked);
    assert.equal(tileOnMask(opened, state.width, ox + 12, oy), true);
    assert.equal(canSeeEntity(state, a, hid, opened), true);
  });

  it("stamps wreck hulls into snapshot fog", () => {
    const { state, a, b } = twoPlayerMatch();
    clearCover(state);
    const ts = state.tileSize;
    const oy = 80;
    const ox = 80;
    makeEntity(state, "trooper", a, tileCenter(ox, ts), tileCenter(oy, ts));
    const tank = makeEntity(state, "warden", b, tileCenter(ox + 8, ts), tileCenter(oy, ts));
    makeEntity(state, "trooper", b, tileCenter(ox + 12, ts), tileCenter(oy, ts));
    tank.hp = 0;
    step(state, TICK_DT);
    assert.equal(tank.wreck, true);
    const snap = snapshotFor(state, a);
    const mask = visionMaskFromSnapshot(snap, state.width, state.height, ts);
    assert.equal(tileOnMask(mask, state.width, ox + 12, oy), false);
    assert.ok(snap.entities.some((e) => e.id === tank.id && e.wreck));
    assert.equal(
      snap.entities.some((e) => e.type === "trooper" && e.ownerId === b),
      false,
    );
  });
});

describe("combat visibility", () => {
  it("matches the fog mask", () => {
    const { state, a, b } = twoPlayerMatch();
    const ts = state.tileSize;
    makeEntity(state, "trooper", a, tileCenter(40, ts), tileCenter(40, ts));
    makeEntity(state, "trooper", b, tileCenter(48, ts), tileCenter(40, ts));
    makeEntity(state, "trooper", b, tileCenter(200, ts), tileCenter(200, ts));
    const mask = visionMask(state, a);
    for (const e of state.entities.values()) {
      if (e.hp <= 0) continue;
      const cheap = canSeeEntity(state, a, e);
      const fog = canSeeEntity(state, a, e, mask);
      assert.equal(cheap, fog, `id=${e.id} type=${e.type} at ${e.x},${e.y}`);
    }
  });
});

describe("FOV islands", () => {
  function litMask(width: number, height: number, cells: readonly [number, number][]): Uint8Array {
    const mask = new Uint8Array(width * height);
    for (const [x, y] of cells) mask[y * width + x] = 1;
    return mask;
  }

  function fillRect(mask: Uint8Array, width: number, x0: number, y0: number, x1: number, y1: number, v: number): void {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) mask[y * width + x] = v;
    }
  }

  it("fills an unseen hole of 12 tiles and leaves a hole of 13", () => {
    const w = 14;
    const h = 14;
    const mask = new Uint8Array(w * h);
    fillRect(mask, w, 1, 1, 12, 12, 1);
    fillRect(mask, w, 4, 4, 7, 6, 0);
    mask[7 * w + 4] = 0;
    sealFovIslands(mask, w, h);
    assert.equal(tileOnMask(mask, w, 5, 5), false, "13-tile hole stays unseen");

    const hole12 = new Uint8Array(w * h);
    fillRect(hole12, w, 1, 1, 12, 12, 1);
    fillRect(hole12, w, 4, 4, 7, 6, 0);
    sealFovIslands(hole12, w, h);
    assert.equal(tileOnMask(hole12, w, 4, 4), true);
    assert.equal(tileOnMask(hole12, w, 7, 6), true);
  });

  it("hides a visible speck of 12 tiles and leaves a blob of 13", () => {
    const w = 14;
    const h = 14;
    const speck = new Uint8Array(w * h);
    fillRect(speck, w, 2, 2, 5, 4, 1);
    sealFovIslands(speck, w, h);
    assert.equal(tileOnMask(speck, w, 2, 2), false);
    assert.equal(tileOnMask(speck, w, 5, 4), false);

    const blob = new Uint8Array(w * h);
    fillRect(blob, w, 2, 2, 5, 4, 1);
    blob[5 * w + 2] = 1;
    sealFovIslands(blob, w, h);
    assert.equal(tileOnMask(blob, w, 3, 3), true);
  });

  it("treats diagonal tiles as one island", () => {
    const w = 8;
    const h = 8;
    const mask = new Uint8Array(w * h);
    fillRect(mask, w, 1, 1, 6, 6, 1);
    mask[3 * w + 3] = 0;
    mask[4 * w + 4] = 0;
    sealFovIslands(mask, w, h);
    assert.equal(tileOnMask(mask, w, 3, 3), true);
    assert.equal(tileOnMask(mask, w, 4, 4), true);
  });

  it("fills a hole in the same pass as it hides a distant speck", () => {
    const w = 14;
    const h = 10;
    const mask = new Uint8Array(w * h);
    fillRect(mask, w, 1, 1, 8, 8, 1);
    mask[4 * w + 4] = 0;
    mask[2 * w + 12] = 1;
    mask[2 * w + 13] = 1;
    sealFovIslands(mask, w, h);
    assert.equal(tileOnMask(mask, w, 4, 4), true, "hole filled");
    assert.equal(tileOnMask(mask, w, 12, 2), false, "speck hidden");
    assert.equal(tileOnMask(mask, w, 5, 5), true, "main blob stays");
  });

  it("does not fill leftover tiles of a 14-tile hole", () => {
    const w = 16;
    const h = 16;
    const mask = new Uint8Array(w * h);
    fillRect(mask, w, 1, 1, 14, 14, 1);
    fillRect(mask, w, 4, 4, 7, 6, 0);
    mask[7 * w + 4] = 0;
    mask[7 * w + 5] = 0;
    sealFovIslands(mask, w, h);
    assert.equal(tileOnMask(mask, w, 4, 4), false);
    assert.equal(tileOnMask(mask, w, 7, 6), false);
    assert.equal(tileOnMask(mask, w, 5, 7), false);
  });

  it("leaves a large fog ocean around a central blob", () => {
    const w = 64;
    const h = 64;
    const mask = new Uint8Array(w * h);
    fillRect(mask, w, 20, 20, 43, 43, 1);
    sealFovIslands(mask, w, h);
    assert.equal(tileOnMask(mask, w, 30, 30), true);
    assert.equal(tileOnMask(mask, w, 19, 30), false);
    assert.equal(tileOnMask(mask, w, 0, 0), false);
    assert.equal(tileOnMask(mask, w, 63, 63), false);
  });

  it("does nothing when the limit is 0", () => {
    const w = 6;
    const h = 6;
    const mask = litMask(w, h, [[2, 2]]);
    sealFovIslands(mask, w, h, 0);
    assert.equal(tileOnMask(mask, w, 2, 2), true);
  });
});
