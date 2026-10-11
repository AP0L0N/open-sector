import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FACTIONS, FUSION_CORE_ENERGY, catalog, factionDamage, type Faction } from "@gridlock/shared";
import { cameoCard, fmtNum } from "./cameo-card.js";
import { groupEntries } from "./sidebar-groups.js";

const stat = (stats: { label: string; value: string }[], label: string) => stats.find((s) => s.label === label)?.value;

describe("cameoCard", () => {
  it("has a role line, a price, and HP for every card in every faction's sidebar, and reads its type from the id", () => {
    for (const faction of FACTIONS) {
      for (const { id, type } of Object.values(groupEntries(faction as Faction)).flat()) {
        assert.equal(id.replace(/^(build|train)-/, ""), type, id);
        const card = cameoCard(type, faction);
        assert.ok(card.role.length > 0, `${type} has no role line`);
        assert.ok(card.price.value.length > 0, type);
        assert.equal(stat(card.body, "HP"), fmtNum(catalog(type).hp), type);
      }
    }
  });

  it("prices the Alliance in scrap with power, and the Xenite in hive energy", () => {
    const smelter = cameoCard("smelter", "alliance");
    assert.deepEqual([smelter.price.value, smelter.price.unit], ["1,600", "SCRAP"]);
    assert.equal(stat(smelter.meta, "Power"), "−40");
    const core = cameoCard("fusioncore", "xeno");
    assert.equal(core.price.tone, "supply");
    assert.equal(core.price.value, `+${fmtNum(FUSION_CORE_ENERGY)}`);
    assert.deepEqual(core.needs, ["Neural Nexus"]);
    const drone = cameoCard("xenodrone", "xeno");
    assert.equal(drone.price.tone, "energy");
    assert.equal(stat(drone.meta, "Power"), undefined);
  });

  it("shows the weapon as it lands: infantry guns, shell racks, Xenite damage cut, endless hive ammo", () => {
    const rifle = cameoCard("rifleman", "alliance").weapon!;
    assert.equal(rifle.name, "Rifle");
    assert.equal(stat(rifle.stats, "Range"), "9");
    assert.equal(stat(rifle.stats, "Magazine"), "8");
    const tank = cameoCard("warden", "alliance").weapon!;
    assert.equal(stat(tank.stats, "Ammo"), "AP 12 · HE 6");
    const stalker = cameoCard("stalker", "xeno").weapon!;
    assert.equal(stat(stalker.stats, "Damage"), String(factionDamage("stalker", catalog("stalker").damage)));
    assert.equal(stat(stalker.stats, "Ammo"), "Endless");
    assert.equal(cameoCard("medic", "alliance").weapon, null);
  });

  it("names where a unit is trained and what it waits on", () => {
    const titan = cameoCard("titan", "alliance");
    assert.equal(titan.from, catalog("armory").name);
    assert.deepEqual(titan.needs, [catalog("research").name]);
    assert.ok(titan.traits.includes("Braces in place"));
    assert.ok(cameoCard("submarine", "alliance").traits.includes("Dives"));
  });
});
