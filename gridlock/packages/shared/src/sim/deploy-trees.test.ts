import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import { TICK_DT, catalog } from "../catalog.js";
import { TILE_TREE } from "../maps.js";
import { applyCommand } from "./commands.js";
import { canDeployAt } from "./deploy.js";
import { hqOf, isTree } from "./geo.js";
import { createMatch, step } from "./match.js";
import type { MatchState } from "./types.js";

function twoPlayerMatch(): MatchState {
  const r = createRoom({ id: "DT1", hostId: "A", hostName: "Alpha", mapId: "yard-64", maxSlots: 8 });
  if (!r.ok) throw new Error(r.message);
  const room = r.value;
  assert.equal(joinRoom(room, "B", "Bravo").ok, true);
  updateSelf(room, "A", { ready: true, spawnId: 1 });
  updateSelf(room, "B", { ready: true, spawnId: 4 });
  const started = startMatch(room, "A", () => 0);
  if (!started.ok) throw new Error(started.message);
  return createMatch(room, started.value);
}

/** The Core's top-left tile when the Rig unpacks where it stands. */
function coreSite(state: MatchState): { tx: number; ty: number; w: number; h: number } {
  const rig = hqOf(state, "A")!;
  const core = catalog("core");
  return {
    tx: rig.tileX - Math.floor(core.tileW / 2),
    ty: rig.tileY - Math.floor(core.tileH / 2),
    w: core.tileW,
    h: core.tileH,
  };
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

function plant(state: MatchState, x: number, y: number): void {
  state.terrain[y * state.width + x] = TILE_TREE;
  state.blocked[y * state.width + x] = 0;
}

describe("Rig deploys over trees", () => {
  it("unpacks on a grove like a base structure and fells the trees under the Core", () => {
    const state = twoPlayerMatch();
    const s = coreSite(state);
    clearGround(state, s.tx - 1, s.ty - 1, s.w + 2, s.h + 2);
    for (let y = s.ty; y < s.ty + s.h; y++) {
      for (let x = s.tx; x < s.tx + s.w; x++) plant(state, x, y);
    }
    plant(state, s.tx + s.w, s.ty);
    const rig = hqOf(state, "A")!;
    assert.equal(canDeployAt(state, rig.tileX, rig.tileY), true, "trees do not bar the site");
    const res = applyCommand(state, "A", { type: "cmd.deploy", id: rig.id });
    assert.equal(res.ok, true, res.ok ? "" : res.message);
    for (let i = 0; i < 60 && hqOf(state, "A")?.type !== "core"; i++) step(state, TICK_DT);
    assert.equal(hqOf(state, "A")?.type, "core", "the Rig unpacked");
    for (let y = s.ty; y < s.ty + s.h; y++) {
      for (let x = s.tx; x < s.tx + s.w; x++) {
        assert.equal(isTree(state, x, y), false, `tree at ${x},${y} is felled`);
        assert.ok(state.clearedTrees.some((c) => c.x === x && c.y === y), "the client is told to fell it");
      }
    }
    assert.equal(isTree(state, s.tx + s.w, s.ty), true, "the tree beside it stays");
  });

  it("still refuses a rock under the Core", () => {
    const state = twoPlayerMatch();
    const s = coreSite(state);
    clearGround(state, s.tx, s.ty, s.w, s.h);
    state.blocked[s.ty * state.width + s.tx] = 1;
    const rig = hqOf(state, "A")!;
    assert.equal(canDeployAt(state, rig.tileX, rig.tileY), false);
    const res = applyCommand(state, "A", { type: "cmd.deploy", id: rig.id });
    assert.equal(res.ok, false);
  });
});
