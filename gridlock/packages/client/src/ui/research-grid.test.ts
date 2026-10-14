import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { researchArtKey, visibleResearch } from "./research-grid.js";

const ids = (type: string, mine: Parameters<typeof visibleResearch>[1]) => visibleResearch(type, mine).map((r) => r.id);

describe("visibleResearch", () => {
  it("shows a chain's next level only, and the last one once done", () => {
    assert.deepEqual(ids("fusionnode", [{ type: "fusionnode" }]), ["advancedfusion"]);
    assert.deepEqual(ids("fusionnode", [{ type: "fusionnode", level: 1 }]), ["ultrafusion"]);
    assert.deepEqual(ids("fusionnode", [{ type: "fusionnode", level: 2 }]), ["ultrafusion"]);
  });

  it("keeps the level running in its slot", () => {
    assert.deepEqual(ids("fusionnode", [{ type: "fusionnode", research: { id: "advancedfusion" } }]), ["advancedfusion"]);
  });

  it("follows the least upgraded of a mixed selection", () => {
    assert.deepEqual(ids("conversion", [{ type: "conversion", level: 1 }, { type: "conversion" }]), ["advancedassembly", "shieldwall"]);
  });

  it("always shows upgrades outside a chain", () => {
    assert.deepEqual(ids("fusioncore", [{ type: "fusioncore" }]), ["fusionreactor", "forceshield", "flakmaw"]);
    assert.deepEqual(ids("spineturret", [{ type: "spineturret" }]).sort(), ["forceshield", "skyspines"]);
  });

  it("gives the Force Shield the art of the structure it is on", () => {
    assert.equal(researchArtKey("forceshield", "pulsespire"), "forceshield-pulsespire");
    assert.equal(researchArtKey("flakmaw", "fusioncore"), "flakmaw");
  });
});
