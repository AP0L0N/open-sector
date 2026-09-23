import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildingAnimActive, buildingProducesUnits, type BuildingAnimView } from "./building-fx.js";

function view(partial: Partial<BuildingAnimView> & Pick<BuildingAnimView, "type">): BuildingAnimView {
  return {
    id: 1,
    hp: 100,
    wreck: undefined,
    trainProgress: undefined,
    trainQueue: undefined,
    ...partial,
  };
}

describe("buildingProducesUnits", () => {
  it("is true only for the three trainers", () => {
    assert.equal(buildingProducesUnits("muster"), true);
    assert.equal(buildingProducesUnits("smelter"), true);
    assert.equal(buildingProducesUnits("armory"), true);
    assert.equal(buildingProducesUnits("dynamo"), false);
    assert.equal(buildingProducesUnits("core"), false);
    assert.equal(buildingProducesUnits("cottage"), false);
  });
});

describe("buildingAnimActive", () => {
  it("runs idle overlays on core and dynamo", () => {
    assert.equal(buildingAnimActive(view({ type: "core" })), true);
    assert.equal(buildingAnimActive(view({ type: "dynamo" })), true);
  });

  it("skips trainers that are not producing", () => {
    assert.equal(buildingAnimActive(view({ type: "muster" })), false);
    assert.equal(buildingAnimActive(view({ type: "smelter" })), false);
    assert.equal(buildingAnimActive(view({ type: "armory" })), false);
  });

  it("runs trainer overlays while a job has progress", () => {
    assert.equal(buildingAnimActive(view({ type: "muster", trainProgress: 0.2 })), true);
    assert.equal(buildingAnimActive(view({ type: "smelter", trainProgress: 0 })), true);
    assert.equal(buildingAnimActive(view({ type: "armory", trainProgress: 0.9 })), true);
  });

  it("stops a friendly trainer whose head job is paused", () => {
    assert.equal(
      buildingAnimActive(
        view({
          type: "muster",
          trainProgress: 0.4,
          trainQueue: [{ id: 8, type: "rifleman", progress: 0.4, paused: true }],
        }),
      ),
      false,
    );
  });

  it("keeps running an unpaused friendly queue", () => {
    assert.equal(
      buildingAnimActive(
        view({
          type: "armory",
          trainProgress: 0.1,
          trainQueue: [{ id: 3, type: "warden", progress: 0.1, paused: false }],
        }),
      ),
      true,
    );
  });

  it("animates an enemy trainer from trainProgress alone", () => {
    assert.equal(buildingAnimActive(view({ type: "smelter", trainProgress: 0.5 })), true);
  });

  it("never animates wrecks, dead buildings, or civilians", () => {
    assert.equal(buildingAnimActive(view({ type: "dynamo", wreck: true })), false);
    assert.equal(buildingAnimActive(view({ type: "core", hp: 0 })), false);
    assert.equal(buildingAnimActive(view({ type: "cottage" })), false);
    assert.equal(buildingAnimActive(view({ type: "muster", hp: 0, trainProgress: 0.5 })), false);
  });
});
