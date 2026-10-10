import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BUILDING_TYPES, SHARED_TYPES, TRAIN_TYPES, YARD_FIELD_TYPES, catalog, costFor, factionOf, isHiddenField } from "@gridlock/shared";
import { groupEntries, groupState, sidebarGroupOf, type CameoFlags } from "./sidebar-groups.js";

const idle: CameoFlags = { disabled: false, ready: false, working: false, paused: false };

describe("sidebarGroupOf", () => {
  it("files every buildable and trainable type into exactly one group of one faction, shared ones into both", () => {
    const g = groupEntries();
    const xeno = Object.values(groupEntries("xeno")).flat();
    const bloom = Object.values(groupEntries("bloom")).flat();
    const all = Object.values(g).flat();
    const shownYard = YARD_FIELD_TYPES.filter((t) => !isHiddenField(t));
    assert.equal(all.length + xeno.length + bloom.length, BUILDING_TYPES.length + TRAIN_TYPES.length + shownYard.length + SHARED_TYPES.size);
    for (const e of all) assert.equal(factionOf(e.type), "alliance", e.type);
    for (const e of xeno) if (!SHARED_TYPES.has(e.type)) assert.equal(factionOf(e.type), "xeno", e.type);
    for (const e of bloom) assert.equal(factionOf(e.type), "bloom", e.type);
    assert.equal(new Set(all.map((e) => e.id)).size, all.length);
    const defenceTypes = g.defences.map((e) => e.type);
    assert.ok(defenceTypes.includes("sandbags"));
    assert.ok(defenceTypes.includes("wall"));
    assert.ok(defenceTypes.includes("gate"), "the gate is built from the Defences tab");
    assert.equal(defenceTypes.includes("greatwall"), false, "Large wall is hidden for now");
    assert.equal(all.some((e) => e.id === "build-teeth" || e.id === "build-trench"), false);
  });

  it("gives the Xenomorphs their base, defences, cyborgs, and heavy assimilators, and nothing of the Alliance's but the Central", () => {
    const g = groupEntries("xeno");
    assert.deepEqual(g.structures.map((e) => e.type).sort(), ["aerie", "assimilator", "cyborgcentral", "forge", "fusionnode", "nexus", "spawnpool"]);
    assert.deepEqual(g.defences.map((e) => e.type).sort(), ["laserfence", "pulsespire", "spineturret"]);
    assert.deepEqual(g.infantry.map((e) => e.type).sort(), ["lancer", "shade", "simunit2", "spitter", "thrall", "weaver", "xenodrone"]);
    assert.deepEqual(g.tanks.map((e) => e.type).sort(), ["behemoth", "broodmother", "juggernaut", "mawcaster", "ravager", "siphon", "stalker"]);
    assert.deepEqual(g.naval.map((e) => e.type).sort(), ["leech", "lurker"]);
    assert.deepEqual(g.aircraft.map((e) => e.type).sort(), ["gnat", "overseer", "scourge", "wasp"]);
    const alliance = groupEntries("alliance");
    assert.deepEqual(alliance.infantry.map((e) => e.type).filter((t) => t.startsWith("cyborg")).sort(), ["cyborg", "cyborgcommander"]);
    assert.ok(alliance.structures.some((e) => e.type === "cyborgcentral"));
    assert.equal(Object.values(alliance).flat().some((e) => e.type === "xenodrone" || e.type === "simunit2"), false);
  });

  it("gives the Bloom at least five of everything, and nothing of anyone else's", () => {
    const g = groupEntries("bloom");
    assert.deepEqual(g.structures.map((e) => e.type).sort(), ["braincoral", "broodnest", "gestator", "gorger", "lumenbulb", "roost", "tidewomb"]);
    assert.deepEqual(g.defences.map((e) => e.type).sort(), ["bilelance", "eyestalk", "husk", "puffcap", "thornspitter"]);
    assert.deepEqual(g.infantry.map((e) => e.type).sort(), ["bloater", "gobber", "longspine", "mender", "quillback", "spawnling"]);
    assert.deepEqual(g.tanks.map((e) => e.type).sort(), ["bileworm", "goretusk", "mantis", "matriarch", "skitter", "sporemaw"]);
    assert.deepEqual(g.naval.map((e) => e.type).sort(), ["abyssray", "broodbarge", "driftjelly", "leviathan", "spineback"]);
    assert.deepEqual(g.aircraft.map((e) => e.type).sort(), ["drifter", "gasbag", "harpy", "moth", "razorwing"]);
  });

  it("puts the gun building under defences and the rest under structures", () => {
    assert.equal(sidebarGroupOf("ciws"), "defences");
    assert.equal(sidebarGroupOf("bunker"), "defences");
    assert.equal(sidebarGroupOf("tower"), "defences");
    assert.equal(sidebarGroupOf("ram"), "defences");
    for (const t of ["dynamo", "smelter", "muster", "armory", "airfield", "dock", "research", "radar", "cyborgcentral"] as const) assert.equal(sidebarGroupOf(t), "structures");
  });

  it("splits trainables into infantry, tanks, boats, and aircraft", () => {
    for (const t of ["rifleman", "gunner", "sniper", "engineer", "medic", "cyborg", "droneop", "jumpjet"] as const) {
      assert.equal(sidebarGroupOf(t), "infantry", t);
    }
    for (const t of ["hauler", "warden", "ss3", "jagdtiger", "feuerwirbel", "walker", "titan", "mammoth", "supply"] as const) assert.equal(sidebarGroupOf(t), "tanks", t);
    assert.equal(sidebarGroupOf("stuka"), "aircraft");
    assert.equal(sidebarGroupOf("fw190"), "aircraft");
    assert.equal(sidebarGroupOf("bv222"), "aircraft");
    assert.equal(sidebarGroupOf("he111"), "aircraft");
    assert.equal(sidebarGroupOf("horten"), "aircraft");
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
    assert.deepEqual(g.aircraft.map((e) => e.type), ["fw190", "stuka", "horten", "he111", "bv222"]);
    assert.deepEqual(g.naval.map((e) => e.type), ["gunboat", "supplyboat", "submarine", "destroyer", "lst", "battleship"]);
  });

  it("lays the Xenomorph base out as the Alliance's: power, scrap, barracks, factory, air, sea, tech", () => {
    const xeno = groupEntries("xeno").structures.map((e) => e.type);
    assert.deepEqual(xeno, ["fusionnode", "assimilator", "cyborgcentral", "forge", "aerie", "spawnpool", "nexus"]);
    const alliance = groupEntries().structures.map((e) => e.type);
    assert.deepEqual(alliance.slice(0, 4), ["dynamo", "smelter", "muster", "armory"]);
  });

  it("prices each Xenomorph structure as its Alliance counterpart", () => {
    const pairs = [
      ["fusionnode", "dynamo"],
      ["assimilator", "smelter"],
      ["forge", "armory"],
      ["aerie", "airfield"],
      ["spawnpool", "dock"],
      ["nexus", "research"],
    ] as const;
    for (const [x, a] of pairs) assert.equal(catalog(x).cost, catalog(a).cost, x);
    assert.equal(costFor("cyborgcentral", "xeno"), catalog("muster").cost);
    assert.equal(costFor("cyborgcentral", "alliance"), catalog("cyborgcentral").cost);
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
