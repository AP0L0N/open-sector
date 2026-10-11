import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DIAMOND_SCRAP_TILE_YIELD, SCRAP_TILE_YIELD, catalog, scrapIsGround } from "../catalog.js";
import { TILE_DIAMOND_SCRAP, TILE_EMPTY, TILE_SCRAP } from "../maps.js";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import { buildingSiteError } from "./build.js";
import { beginDeploy } from "./deploy.js";
import { makeEntity, tileCenter } from "./geo.js";
import { createMatch } from "./match.js";
import { previewSite } from "./preview.js";
import { snapshotFor } from "./snapshot.js";
import type { MatchState } from "./types.js";

function twoPlayerMatch(): MatchState {
  const r = createRoom({ id: "XSG1", hostId: "A", hostName: "Alpha", mapId: "yard-64", maxSlots: 8 });
  if (!r.ok) throw new Error(r.message);
  const room = r.value;
  assert.equal(joinRoom(room, "B", "Bravo").ok, true);
  updateSelf(room, "A", { ready: true, spawnId: 1 });
  updateSelf(room, "B", { ready: true, spawnId: 4 });
  const started = startMatch(room, "A", () => 0);
  if (!started.ok) throw new Error(started.message);
  return createMatch(room, started.value);
}

/** Bare, open ground over the box, scrap (or diamond scrap) where `scrap` says. */
function paint(state: MatchState, x0: number, y0: number, x1: number, y1: number, scrap: "none" | "scrap" | "diamond"): void {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = y * state.width + x;
      state.terrain[i] = scrap === "scrap" ? TILE_SCRAP : scrap === "diamond" ? TILE_DIAMOND_SCRAP : TILE_EMPTY;
      state.blocked[i] = 0;
      state.heights[i] = 0;
      state.occupy[i] = 0;
      state.scrapYield[i] = scrap === "scrap" ? SCRAP_TILE_YIELD : scrap === "diamond" ? DIAMOND_SCRAP_TILE_YIELD : 0;
    }
  }
}

function clearUnits(state: MatchState): void {
  for (const e of [...state.entities.values()]) if (e.kind === "unit") state.entities.delete(e.id);
}

describe("Xenite build on scrap", () => {
  it("only the Xenite take scrap for ground", () => {
    assert.equal(scrapIsGround("fusionnode"), true);
    assert.equal(scrapIsGround("hivecore"), true);
    assert.equal(scrapIsGround("dynamo"), false);
    assert.equal(scrapIsGround("core"), false);
  });

  for (const kind of ["scrap", "diamond"] as const) {
    it(`a Xenite structure stands on ${kind}; an Alliance one still cannot`, () => {
      const state = twoPlayerMatch();
      clearUnits(state);
      paint(state, 24, 24, 36, 36, kind);
      assert.equal(buildingSiteError(state, "fusionnode", 26, 26), null);
      assert.equal(buildingSiteError(state, "dynamo", 26, 26), "Cannot place there.");
      const snap = snapshotFor(state, "A");
      assert.equal(previewSite(snap, "fusionnode", 26, 26), true, "client ghost agrees: a Xenite stands on it");
      assert.equal(previewSite(snap, "dynamo", 26, 26), false, "client ghost agrees: an Alliance Dynamo stays red");
    });

    it(`the Seed unfolds its Hive Core on ${kind}; the Alliance Rig does not`, () => {
      const state = twoPlayerMatch();
      clearUnits(state);
      paint(state, 20, 20, 40, 40, kind);
      const seed = makeEntity(state, "seed", "A", tileCenter(30, state.tileSize), tileCenter(30, state.tileSize));
      assert.equal(beginDeploy(state, seed), null);
      const rig = makeEntity(state, "rig", "B", tileCenter(30, state.tileSize), tileCenter(30, state.tileSize));
      const core = catalog("core");
      assert.equal(beginDeploy(state, rig), `Need a clear ${core.tileW}×${core.tileH} to deploy.`);
    });
  }
});
