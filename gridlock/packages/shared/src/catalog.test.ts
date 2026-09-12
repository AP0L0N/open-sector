import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { specialLabel, specialOf, specialReady } from "./catalog.js";

describe("special actions", () => {
  it("marks Rig and Core as deploy specials", () => {
    assert.equal(specialOf("rig"), "deploy");
    assert.equal(specialOf("core"), "deploy");
    assert.equal(specialOf("trooper"), undefined);
    assert.equal(specialLabel("rig"), "Deploy");
    assert.equal(specialLabel("core"), "Pack");
    assert.equal(specialLabel("hauler"), null);
  });

  it("is not ready while transforming", () => {
    assert.equal(specialReady("rig", "idle"), true);
    assert.equal(specialReady("rig", "move"), true);
    assert.equal(specialReady("rig", "deploy"), false);
    assert.equal(specialReady("core", "undeploy"), false);
    assert.equal(specialReady("trooper", "idle"), false);
  });
});
