import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import {
  BUILD_RADIUS,
  SMELTER_SCRAP_COVER,
  SMELTER_SCRAP_PER_SEC,
  SCRAP_TILE_YIELD,
  TICK_DT,
  TILE_SUBDIV,
  TRAIN_TYPES,
  catalog,
} from "../catalog.js";
import { TILE_EMPTY, TILE_ROAD, TILE_SCRAP, getMap } from "../maps.js";
import { findSmelterTile } from "./ai.js";
import { applyCommand } from "./commands.js";
import { buildingCenter, hqOf, makeEntity, scrapAt, tileCenter } from "./geo.js";
import { createMatch, step } from "./match.js";
import { previewConstruct, previewPlace } from "./preview.js";
import { smelterIncome, smelterScrapNeeded, smelterSiteOk, tickSmelters } from "./smelter.js";
import { snapshotFor } from "./snapshot.js";
import type { MatchState } from "./types.js";

function twoPlayerMatch(): { state: MatchState; a: string; b: string } {
  const r = createRoom({ id: "SM1", hostId: "A", hostName: "Alpha", mapId: "yard-64", maxSlots: 8 });
  if (!r.ok) throw new Error(r.message);
  const room = r.value;
  assert.equal(joinRoom(room, "B", "Bravo").ok, true);
  updateSelf(room, "A", { ready: true, spawnId: 1 });
  updateSelf(room, "B", { ready: true, spawnId: 4 });
  const started = startMatch(room, "A", () => 0);
  if (!started.ok) throw new Error(started.message);
  return { state: createMatch(room, started.value), a: "A", b: "B" };
}

function ticks(state: MatchState, n: number): void {
  for (let i = 0; i < n; i++) step(state, TICK_DT);
}

/** Unpack the Rig so the yard can build, and stand the Core where it was. */
function deploy(state: MatchState, pid: string): void {
  const rig = hqOf(state, pid)!;
  applyCommand(state, pid, { type: "cmd.deploy", id: rig.id });
  for (let i = 0; i < 60; i++) {
    step(state, TICK_DT);
    if (hqOf(state, pid)?.type === "core") return;
  }
  throw new Error("Rig never unpacked");
}

/** Clear the ground and paint a square scrap field whose top-left tile is (tx, ty). */
function paintScrap(state: MatchState, tx: number, ty: number, w: number, h: number): void {
  for (let y = ty; y < ty + h; y++) {
    for (let x = tx; x < tx + w; x++) {
      const i = y * state.width + x;
      state.scrapYield[i] = SCRAP_TILE_YIELD;
      state.terrain[i] = TILE_SCRAP;
      state.blocked[i] = 0;
    }
  }
}

/**
 * Top-left of the first w×h patch at or east of (fromX, fromY) that the map itself leaves open,
 * so the snapshot-side preview (which reads the map's own tiles) agrees with the sim.
 */
function openPatch(
  state: MatchState,
  fromX: number,
  fromY: number,
  w: number,
  h: number,
  bounds?: { x1: number; y1: number },
): { x: number; y: number } {
  const map = getMap(state.mapId)!;
  const x1 = Math.min(map.width, bounds?.x1 ?? map.width);
  const y1 = Math.min(map.height, bounds?.y1 ?? map.height);
  for (let y = fromY; y + h <= y1; y++) {
    for (let x = fromX; x + w <= x1; x++) {
      let open = true;
      for (let yy = y; yy < y + h && open; yy++) {
        for (let xx = x; xx < x + w; xx++) {
          const k = map.tiles[yy * map.width + xx];
          if (k !== TILE_EMPTY && k !== TILE_ROAD) {
            open = false;
            break;
          }
        }
      }
      if (open && !tilesOccupied(state, x, y, w, h)) return { x, y };
    }
  }
  throw new Error("no open patch");
}

function tilesOccupied(state: MatchState, tx: number, ty: number, w: number, h: number): boolean {
  for (let y = ty; y < ty + h; y++) for (let x = tx; x < tx + w; x++) if (state.occupy[y * state.width + x] !== 0) return true;
  return false;
}

function clearGround(state: MatchState, tx: number, ty: number, w: number, h: number): void {
  for (let y = ty; y < ty + h; y++) {
    for (let x = tx; x < tx + w; x++) {
      const i = y * state.width + x;
      state.scrapYield[i] = 0;
      state.terrain[i] = 0;
      state.blocked[i] = 0;
      state.heights[i] = 0;
    }
  }
}

describe("Smelter on scrap", () => {
  const sm = catalog("smelter");

  it("is not in the training roster and the Mauler is not either", () => {
    assert.equal((TRAIN_TYPES as readonly string[]).includes("hauler"), false);
    assert.ok(smelterScrapNeeded() >= Math.ceil(sm.tileW * sm.tileH * SMELTER_SCRAP_COVER));
  });

  it("needs half its footprint on scrap and refuses bare ground", () => {
    const { state } = twoPlayerMatch();
    clearGround(state, 60, 60, 40, 40);
    assert.equal(smelterSiteOk(state, 70, 70), false, "bare ground");
    // Scrap under exactly half the footprint: the west half.
    paintScrap(state, 70, 70, sm.tileW / 2, sm.tileH);
    assert.equal(smelterSiteOk(state, 70, 70), true, "half on scrap");
    // Shift the footprint off the field so only a third is covered.
    assert.equal(smelterSiteOk(state, 70 + sm.tileW / 2 + 2, 70), false, "too little scrap");
  });

  it("places from the yard only on scrap in build range, and other buildings never on scrap", () => {
    const { state } = twoPlayerMatch();
    deploy(state, "A");
    const hq = hqOf(state, "A")!;
    const p = state.players.get("A")!;
    // Room for the Smelter and a Dynamo beside it, on ground the map leaves open.
    const reach = { x1: hq.tileX + hq.tileW + BUILD_RADIUS, y1: hq.tileY + hq.tileH + BUILD_RADIUS };
    const patch = openPatch(state, hq.tileX + hq.tileW + 4, hq.tileY, sm.tileW + 12, sm.tileH, reach);
    clearGround(state, patch.x, patch.y, sm.tileW + 12, sm.tileH);
    const tx = patch.x;
    const ty = patch.y;
    p.scrap = 10_000;
    p.structure = { type: "smelter", progressTicks: 1, totalTicks: 1, ready: true, paused: false, paid: sm.cost };
    let res = applyCommand(state, "A", { type: "cmd.place", building: "smelter", tx, ty });
    assert.equal(res.ok, false, "bare ground refuses a Smelter");
    if (!res.ok) assert.match(res.message, /scrap/i);
    paintScrap(state, tx, ty, sm.tileW, sm.tileH);
    const snap = snapshotFor(state, "A");
    assert.equal(previewPlace(snap, "smelter", tx, ty), true, "client ghost agrees");
    assert.equal(previewPlace(snap, "dynamo", tx, ty), false, "a Dynamo ghost stays red on scrap");
    res = applyCommand(state, "A", { type: "cmd.place", building: "smelter", tx, ty });
    assert.equal(res.ok, true, res.ok ? "" : res.message);
    const smelter = [...state.entities.values()].find((e) => e.ownerId === "A" && e.type === "smelter");
    assert.ok(smelter, "Smelter stands");
    assert.equal(smelter!.tileX, tx);
    assert.equal(
      [...state.entities.values()].some((e) => e.type === "hauler"),
      false,
      "no Mauler comes with it",
    );
    // Scrap stays under the building and is never used up.
    assert.ok(scrapAt(state, tx + 1, ty + 1) > 0);
    // Another building cannot share the field.
    p.structure = { type: "dynamo", progressTicks: 1, totalTicks: 1, ready: true, paused: false, paid: catalog("dynamo").cost };
    paintScrap(state, tx + sm.tileW + 2, ty, 8, 8);
    res = applyCommand(state, "A", { type: "cmd.place", building: "dynamo", tx: tx + sm.tileW + 2, ty });
    assert.equal(res.ok, false, "a Dynamo does not go on scrap");
  });

  it("pours scrap every second for each Smelter on scrap, slower on short power, and never drains the field", () => {
    const { state } = twoPlayerMatch();
    deploy(state, "A");
    const p = state.players.get("A")!;
    clearGround(state, 60, 60, 60, 30);
    const place = (tx: number, ty: number): void => {
      paintScrap(state, tx, ty, sm.tileW, sm.tileH);
      const c = buildingCenter(tx, ty, sm.tileW, sm.tileH, state.tileSize);
      makeEntity(state, "smelter", "A", c.x, c.y, { tileX: tx, tileY: ty });
    };
    // Power first so the pour runs at full speed.
    const dyn = catalog("dynamo");
    const dc = buildingCenter(60, 80, dyn.tileW, dyn.tileH, state.tileSize);
    makeEntity(state, "dynamo", "A", dc.x, dc.y, { tileX: 60, tileY: 80 });
    place(64, 64);
    assert.equal(smelterIncome(state, "A"), SMELTER_SCRAP_PER_SEC);
    const before = p.scrap;
    for (let i = 0; i < 10; i++) tickSmelters(state, TICK_DT);
    assert.equal(p.scrap - before, SMELTER_SCRAP_PER_SEC, "one second pays the catalog rate");
    place(64 + sm.tileW + 2, 64);
    assert.equal(smelterIncome(state, "A"), 2 * SMELTER_SCRAP_PER_SEC, "each Smelter adds its share");
    const mid = p.scrap;
    for (let i = 0; i < 100; i++) tickSmelters(state, TICK_DT);
    assert.equal(p.scrap - mid, 20 * SMELTER_SCRAP_PER_SEC);
    assert.equal(scrapAt(state, 65, 65), SCRAP_TILE_YIELD, "the field is not used up");
    // No power at all: production speed floor.
    for (const e of state.entities.values()) if (e.type === "dynamo") e.hp = 0;
    const low = p.scrap;
    for (let i = 0; i < 100; i++) tickSmelters(state, TICK_DT);
    const slowPay = p.scrap - low;
    assert.ok(slowPay > 0 && slowPay < 20 * SMELTER_SCRAP_PER_SEC, `short power slows the pour: ${slowPay}`);
    // A Smelter off its scrap earns nothing.
    const c = buildingCenter(90, 64, sm.tileW, sm.tileH, state.tileSize);
    makeEntity(state, "smelter", "A", c.x, c.y, { tileX: 90, tileY: 64 });
    assert.equal(smelterIncome(state, "A"), 2 * SMELTER_SCRAP_PER_SEC, "bare-ground Smelter pays nothing");
  });

  it("stops paying when the Smelter falls and pays its captor instead", () => {
    const { state } = twoPlayerMatch();
    clearGround(state, 60, 60, 30, 30);
    paintScrap(state, 64, 64, sm.tileW, sm.tileH);
    const c = buildingCenter(64, 64, sm.tileW, sm.tileH, state.tileSize);
    const smelter = makeEntity(state, "smelter", "A", c.x, c.y, { tileX: 64, tileY: 64 });
    assert.equal(smelterIncome(state, "A"), SMELTER_SCRAP_PER_SEC);
    smelter.ownerId = "B";
    assert.equal(smelterIncome(state, "A"), 0);
    assert.equal(smelterIncome(state, "B"), SMELTER_SCRAP_PER_SEC);
    smelter.hp = 0;
    assert.equal(smelterIncome(state, "B"), 0);
  });
});

describe("engineer raises a Smelter", () => {
  const sm = catalog("smelter");

  function fixture(): { state: MatchState; eng: ReturnType<typeof makeEntity>; tx: number; ty: number } {
    const { state } = twoPlayerMatch();
    deploy(state, "A");
    const hq = hqOf(state, "A")!;
    // A scrap field far outside the yard's build range, on ground the map leaves open.
    const patch = openPatch(state, hq.tileX + hq.tileW + BUILD_RADIUS + 20, hq.tileY + 4, sm.tileW + 24, sm.tileH + 24);
    clearGround(state, patch.x, patch.y, sm.tileW + 24, sm.tileH + 24);
    const tx = patch.x + 12;
    const ty = patch.y + 12;
    paintScrap(state, tx, ty, sm.tileW, sm.tileH);
    const ts = state.tileSize;
    const eng = makeEntity(state, "engineer", "A", tileCenter(tx - 6, ts), tileCenter(ty + 2, ts));
    return { state, eng, tx, ty };
  }

  it("is refused from the yard that far out, but an engineer can take the job", () => {
    const { state, eng, tx, ty } = fixture();
    const p = state.players.get("A")!;
    p.scrap = 10_000;
    p.structure = { type: "smelter", progressTicks: 1, totalTicks: 1, ready: true, paused: false, paid: sm.cost };
    const far = applyCommand(state, "A", { type: "cmd.place", building: "smelter", tx, ty });
    assert.equal(far.ok, false);
    if (!far.ok) assert.match(far.message, /far/i);
    p.structure = null;
    const snap = snapshotFor(state, "A");
    assert.equal(previewConstruct(snap, "smelter", tx, ty), true, "the engineer's ghost is green out there");
    assert.equal(previewConstruct(snap, "dynamo", tx, ty), false, "only the Smelter is his to raise");
    const res = applyCommand(state, "A", { type: "cmd.construct", ids: [eng.id], building: "smelter", tx, ty });
    assert.equal(res.ok, true, res.ok ? "" : res.message);
    assert.equal(eng.order?.kind, "build");
    assert.equal(eng.order?.building, "smelter");
  });

  it("walks there, pays the cost when he starts, works the build time, and the Smelter appears on the field", () => {
    const { state, eng, tx, ty } = fixture();
    const p = state.players.get("A")!;
    p.scrap = sm.cost + 50;
    const res = applyCommand(state, "A", { type: "cmd.construct", ids: [eng.id], building: "smelter", tx, ty });
    assert.equal(res.ok, true, res.ok ? "" : res.message);
    let paidAt = -1;
    let builtAt = -1;
    for (let i = 0; i < 1200 && builtAt < 0; i++) {
      step(state, TICK_DT);
      if (paidAt < 0 && p.scrap <= 50) paidAt = i;
      if ([...state.entities.values()].some((e) => e.type === "smelter" && e.ownerId === "A")) builtAt = i;
    }
    assert.ok(paidAt >= 0, "the cost was taken");
    assert.ok(builtAt > paidAt, `Smelter never rose (paid=${paidAt} built=${builtAt})`);
    assert.ok(builtAt - paidAt >= sm.buildSeconds / TICK_DT - 2, `worked ${(builtAt - paidAt) * TICK_DT}s, wants ${sm.buildSeconds}s`);
    const smelter = [...state.entities.values()].find((e) => e.type === "smelter" && e.ownerId === "A")!;
    assert.equal(smelter.tileX, tx);
    assert.equal(smelter.tileY, ty);
    assert.equal(eng.order, null);
    assert.ok(eng.hp > 0, "the engineer is pushed off the footprint, not buried");
    assert.equal(smelterIncome(state, "A"), SMELTER_SCRAP_PER_SEC, "it pours at once");
    // The new Smelter is an anchor: the yard now reaches out there too.
    p.structure = { type: "dynamo", progressTicks: 1, totalTicks: 1, ready: true, paused: false, paid: catalog("dynamo").cost };
    p.scrap = 5000;
    const dyn = applyCommand(state, "A", { type: "cmd.place", building: "dynamo", tx: tx + sm.tileW + 2, ty });
    assert.equal(dyn.ok, true, dyn.ok ? "" : dyn.message);
  });

  it("refuses a bare-ground site at once and waits on scrap he cannot pay for", () => {
    const { state, eng, tx, ty } = fixture();
    const p = state.players.get("A")!;
    const bare = applyCommand(state, "A", { type: "cmd.construct", ids: [eng.id], building: "smelter", tx: tx + sm.tileW + 4, ty });
    assert.equal(bare.ok, false);
    const rifle = makeEntity(state, "rifleman", "A", eng.x, eng.y + 8);
    const wrong = applyCommand(state, "A", { type: "cmd.construct", ids: [rifle.id], building: "smelter", tx, ty });
    assert.equal(wrong.ok, false, "a rifleman is no engineer");
    p.scrap = 10;
    const res = applyCommand(state, "A", { type: "cmd.construct", ids: [eng.id], building: "smelter", tx, ty });
    assert.equal(res.ok, true, "the order is taken; scrap may come in on the way");
    ticks(state, 400);
    assert.equal(
      [...state.entities.values()].some((e) => e.type === "smelter" && e.ownerId === "A"),
      false,
    );
    assert.equal(p.scrap, 10, "nothing was taken");
    assert.equal(eng.order, null, "he gives up the job");
  });

  it("refunds the cost when the site is taken while he works", () => {
    const { state, eng, tx, ty } = fixture();
    const p = state.players.get("A")!;
    p.scrap = sm.cost;
    applyCommand(state, "A", { type: "cmd.construct", ids: [eng.id], building: "smelter", tx, ty });
    for (let i = 0; i < 600 && p.scrap > 0; i++) step(state, TICK_DT);
    assert.equal(p.scrap, 0, "he has started");
    // The enemy drops a Dynamo on the field first.
    const dyn = catalog("dynamo");
    const c = buildingCenter(tx, ty, dyn.tileW, dyn.tileH, state.tileSize);
    makeEntity(state, "dynamo", "B", c.x, c.y, { tileX: tx, tileY: ty });
    ticks(state, Math.ceil(sm.buildSeconds / TICK_DT) + 5);
    assert.equal(
      [...state.entities.values()].some((e) => e.type === "smelter" && e.ownerId === "A"),
      false,
    );
    assert.equal(p.scrap, sm.cost, "the cost comes back");
    assert.equal(eng.order, null);
  });
});

describe("yard scrap and the CPU", () => {
  it("gives every start a scrap field the yard can reach", () => {
    const map = getMap("yard-64")!;
    const reach = BUILD_RADIUS + 3 * TILE_SUBDIV;
    for (const s of map.spawns) {
      let near = false;
      for (let y = Math.max(0, s.y - reach); y <= Math.min(map.height - 1, s.y + reach) && !near; y++) {
        for (let x = Math.max(0, s.x - reach); x <= Math.min(map.width - 1, s.x + reach); x++) {
          if (map.tiles[y * map.width + x] === TILE_SCRAP && Math.hypot(x - s.x, y - s.y) <= reach) {
            near = true;
            break;
          }
        }
      }
      assert.equal(near, true, `start ${s.id} has no scrap in yard range`);
    }
  });

  it("finds a Smelter site on scrap within the CPU's build range", () => {
    const { state } = twoPlayerMatch();
    deploy(state, "A");
    const spot = findSmelterTile(state, "A");
    assert.ok(spot, "no site found");
    assert.equal(smelterSiteOk(state, spot!.tx, spot!.ty), true);
    const p = state.players.get("A")!;
    p.scrap = 10_000;
    p.structure = { type: "smelter", progressTicks: 1, totalTicks: 1, ready: true, paused: false, paid: catalog("smelter").cost };
    const res = applyCommand(state, "A", { type: "cmd.place", building: "smelter", tx: spot!.tx, ty: spot!.ty });
    assert.equal(res.ok, true, res.ok ? "" : res.message);
  });
});
