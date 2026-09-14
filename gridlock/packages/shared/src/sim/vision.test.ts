import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { catalog, INFANTRY_UPHILL_SIGHT } from "../catalog.js";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import { makeEntity, tileCenter } from "./geo.js";
import { createMatch } from "./match.js";
import { sightTilesOf } from "./elevation.js";
import { spawnSmokeCloud } from "./smoke.js";
import { canSeeEntity, paintEntitySight, tileOnMask, visionMask, type SightSource } from "./vision.js";
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
  return { state: createMatch(room, started.value), a: "A", b: "B" };
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

    state.heights[oy * state.width + (ox + 2)] = 1;
    const tank = makeEntity(state, "warden", a, tileCenter(ox, ts), tileCenter(oy, ts));
    const peekInf = new Uint8Array(state.width * state.height);
    const peekBldg = new Uint8Array(state.width * state.height);
    const peekTank = new Uint8Array(state.width * state.height);
    paintEntitySight(peekInf, state.width, state.height, ts, inf, state.heights);
    paintEntitySight(peekBldg, state.width, state.height, ts, bldg, state.heights);
    paintEntitySight(peekTank, state.width, state.height, ts, tank, state.heights);
    assert.equal(tileOnMask(peekInf, state.width, ox + 4, oy), true);
    assert.equal(tileOnMask(peekBldg, state.width, ox + 4, oy), true);
    assert.equal(tileOnMask(peekTank, state.width, ox + 4, oy), false);
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

  it("does not light a farther peak over a closer lower ridge", () => {
    const { state, a } = twoPlayerMatch();
    state.heights.fill(0);
    const ts = state.tileSize;
    const ox = 20;
    const oy = 20;
    const peak = ox + 16;
    state.heights[oy * state.width + (ox + 4)] = 3;
    state.heights[oy * state.width + peak] = 6;
    const tank = makeEntity(state, "warden", a, tileCenter(ox, ts), tileCenter(oy, ts));
    const mask = new Uint8Array(state.width * state.height);
    paintEntitySight(mask, state.width, state.height, ts, tank, state.heights);
    assert.equal(tileOnMask(mask, state.width, ox + 4, oy), true, "ridge itself");
    assert.equal(tileOnMask(mask, state.width, peak, oy), false, "peak behind ridge");
  });

  it("does not light floor tiles behind a ridge", () => {
    const { state, a } = twoPlayerMatch();
    state.heights.fill(0);
    const ts = state.tileSize;
    const ox = 20;
    const oy = 20;
    const beyond = ox + 12;
    state.heights[oy * state.width + (ox + 6)] = 3;
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

describe("combat visibility", () => {
  it("matches the fog mask without painting one", () => {
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
