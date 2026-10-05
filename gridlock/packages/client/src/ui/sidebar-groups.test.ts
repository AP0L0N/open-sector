import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BUILDING_TYPES, TRAIN_TYPES, YARD_FIELD_TYPES, catalog, isHiddenField } from "@gridlock/shared";
import { groupEntries, groupState, sidebarGroupOf, type CameoFlags } from "./sidebar-groups.js";

const idle: CameoFlags = { disabled: false, ready: false, working: false, paused: false };

describe("sidebarGroupOf", () => {
  it("files every buildable and trainable type into exactly one group", () => {
    const g = groupEntries();
    const all = Object.values(g).flat();
    const shownYard = YARD_FIELD_TYPES.filter((t) => !isHiddenField(t));
    assert.equal(all.length, BUILDING_TYPES.length + TRAIN_TYPES.length + shownYard.length);
    assert.equal(new Set(all.map((e) => e.id)).size, all.length);
    const defenceTypes = g.defences.map((e) => e.type);
    assert.ok(defenceTypes.includes("sandbags"));
    assert.ok(defenceTypes.includes("wall"));
    assert.ok(defenceTypes.includes("gate"), "the gate is built from the Defences tab");
    assert.equal(defenceTypes.includes("greatwall"), false, "Large wall is hidden for now");
    assert.equal(all.some((e) => e.id === "build-teeth" || e.id === "build-trench"), false);
  });

  it("puts the gun building under defences and the rest under structures", () => {
    assert.equal(sidebarGroupOf("ciws"), "defences");
    assert.equal(sidebarGroupOf("bunker"), "defences");
    assert.equal(sidebarGroupOf("tower"), "defences");
    assert.equal(sidebarGroupOf("ram"), "defences");
    for (const t of ["dynamo", "smelter", "muster", "armory", "airfield", "dock", "research", "radar"] as const) assert.equal(sidebarGroupOf(t), "structures");
  });

  it("splits trainables into infantry, tanks, boats, and aircraft", () => {
    for (const t of ["rifleman", "gunner", "sniper", "engineer", "medic", "cyborg", "droneop", "jumpjet"] as const) {
      assert.equal(sidebarGroupOf(t), "infantry", t);
    }
    for (const t of ["hauler", "warden", "ss3", "jagdtiger", "walker", "titan", "mammoth", "supply"] as const) assert.equal(sidebarGroupOf(t), "tanks", t);
    assert.equal(sidebarGroupOf("stuka"), "aircraft");
    assert.equal(sidebarGroupOf("fw190"), "aircraft");
    assert.equal(sidebarGroupOf("bv222"), "aircraft");
    assert.equal(sidebarGroupOf("he111"), "aircraft");
    assert.equal(sidebarGroupOf("gunboat"), "naval");
    assert.equal(sidebarGroupOf("supplyboat"), "naval");
    assert.equal(sidebarGroupOf("submarine"), "naval");
    assert.equal(sidebarGroupOf("battleship"), "naval");
    assert.equal(sidebarGroupOf("destroyer"), "naval");
    assert.equal(sidebarGroupOf("lst"), "naval");
  });

  it("lists defences, infantry, tanks, boats, and aircraft cheapest first", () => {
    const g = groupEntries();
    for (const id of ["defences", "infantry", "tanks", "naval", "aircraft"] as const) {
      const costs = g[id].map((e) => catalog(e.type).cost);
      assert.deepEqual(costs, [...costs].sort((a, b) => a - b), id);
    }
    assert.deepEqual(g.aircraft.map((e) => e.type), ["fw190", "stuka", "he111", "bv222"]);
    assert.deepEqual(g.naval.map((e) => e.type), ["gunboat", "supplyboat", "submarine", "destroyer", "lst", "battleship"]);
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
