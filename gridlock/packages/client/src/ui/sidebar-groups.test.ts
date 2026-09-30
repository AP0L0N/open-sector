import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BUILDING_TYPES, TRAIN_TYPES } from "@gridlock/shared";
import { groupEntries, groupState, sidebarGroupOf, type CameoFlags } from "./sidebar-groups.js";

const idle: CameoFlags = { disabled: false, ready: false, working: false, paused: false };

describe("sidebarGroupOf", () => {
  it("files every buildable and trainable type into exactly one group", () => {
    const g = groupEntries();
    const all = Object.values(g).flat();
    assert.equal(all.length, BUILDING_TYPES.length + TRAIN_TYPES.length);
    assert.equal(new Set(all.map((e) => e.id)).size, all.length);
  });

  it("puts the gun building under defences and the rest under structures", () => {
    assert.equal(sidebarGroupOf("ciws"), "defences");
    assert.equal(sidebarGroupOf("bunker"), "defences");
    assert.equal(sidebarGroupOf("tower"), "defences");
    assert.equal(sidebarGroupOf("ram"), "defences");
    for (const t of ["dynamo", "smelter", "muster", "armory", "airfield", "research"] as const) assert.equal(sidebarGroupOf(t), "structures");
  });

  it("splits trainables into infantry, tanks, and aircraft", () => {
    for (const t of ["rifleman", "gunner", "sniper", "engineer", "medic", "cyborg", "droneop"] as const) {
      assert.equal(sidebarGroupOf(t), "infantry", t);
    }
    for (const t of ["hauler", "warden", "ss3", "walker", "titan", "mammoth", "supply"] as const) assert.equal(sidebarGroupOf(t), "tanks", t);
    assert.equal(sidebarGroupOf("stuka"), "aircraft");
    assert.equal(sidebarGroupOf("fw190"), "aircraft");
    assert.equal(sidebarGroupOf("bv222"), "aircraft");
  });
});

describe("groupState", () => {
  it("ranks ready over working over paused", () => {
    assert.equal(groupState([{ ...idle, paused: true, working: true }, { ...idle, working: true }, { ...idle, ready: true }]), "ready");
    assert.equal(groupState([{ ...idle, paused: true, working: true }, { ...idle, working: true }]), "working");
    assert.equal(groupState([{ ...idle, paused: true, working: true }]), "paused");
  });

  it("is locked when nothing in the group can be pressed", () => {
    assert.equal(groupState([{ ...idle, disabled: true }, { ...idle, disabled: true }]), "locked");
    assert.equal(groupState([]), "locked");
    assert.equal(groupState([{ ...idle, disabled: true }, idle]), "idle");
  });
});
