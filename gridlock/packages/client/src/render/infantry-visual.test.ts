import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  gunnerSheet,
  heldFrame,
  MG_FIRE_MS,
  MORTAR_FIRE_MS,
  medicSheet,
  mortarmanSheet,
  RIFLE_FIRE_MS,
  AT_FIRE_MS,
  SNIPER_FIRE_MS,
  atInfantrySheet,
  sniperSheet,
  trooperSheet,
} from "./infantry-visual.js";

describe("trooperSheet", () => {
  it("uses the walk sheet for a standing rifleman", () => {
    assert.equal(trooperSheet({}), "walk");
    assert.equal(trooperSheet({ weapon: "rifle", stance: "stand" }), "walk");
  });

  it("keeps crouch and crawl on their stance sheets while a shot is live", () => {
    assert.equal(trooperSheet({ stance: "crouch", shotAgeMs: 80 }), "crouch");
    assert.equal(trooperSheet({ stance: "crawl", weapon: "handgun" }), "crawl");
  });

  it("shows the pistol while a standing trooper has the handgun out", () => {
    assert.equal(trooperSheet({ weapon: "handgun" }), "handgun");
    assert.equal(trooperSheet({ weapon: "handgun", shotAgeMs: 40 }), "handgun");
  });

  it("plays the rifle recoil only during the fire window", () => {
    assert.equal(trooperSheet({ weapon: "rifle", shotAgeMs: 100 }), "rifle-fire");
    assert.equal(trooperSheet({ shotAgeMs: RIFLE_FIRE_MS }), "walk");
  });

  it("uses the corpse sheet after death, including in water", () => {
    assert.equal(trooperSheet({ wreck: true, swimming: true, stance: "crouch" }), "die");
  });

  it("shows the MG only while a gunner is prone and the burst is live", () => {
    assert.equal(gunnerSheet({}), "walk");
    assert.equal(gunnerSheet({ stance: "crouch", shotAgeMs: 40 }), "crouch");
    assert.equal(gunnerSheet({ stance: "crawl" }), "crawl");
    assert.equal(gunnerSheet({ stance: "crawl", shotAgeMs: 40 }), "mg-fire");
    assert.equal(gunnerSheet({ stance: "crawl", shotAgeMs: MG_FIRE_MS }), "crawl");
    assert.equal(gunnerSheet({ wreck: true, stance: "crawl" }), "die");
  });

  it("shows the scoped shot only while a standing sniper is in the fire window", () => {
    assert.equal(sniperSheet({}), "walk");
    assert.equal(sniperSheet({ stance: "crouch", shotAgeMs: 40 }), "crouch");
    assert.equal(sniperSheet({ stance: "crawl", shotAgeMs: 40 }), "crawl");
    assert.equal(sniperSheet({ shotAgeMs: 40 }), "fire");
    assert.equal(sniperSheet({ shotAgeMs: SNIPER_FIRE_MS }), "walk");
    assert.equal(sniperSheet({ wreck: true, swimming: true }), "die");
  });

  it("shows the PTRD shot only while a standing AT infantry is in the fire window", () => {
    assert.equal(atInfantrySheet({}), "walk");
    assert.equal(atInfantrySheet({ stance: "crouch", shotAgeMs: 40 }), "crouch");
    assert.equal(atInfantrySheet({ stance: "crawl", shotAgeMs: 40 }), "crawl");
    assert.equal(atInfantrySheet({ shotAgeMs: 40 }), "fire");
    assert.equal(atInfantrySheet({ shotAgeMs: AT_FIRE_MS }), "walk");
    assert.equal(atInfantrySheet({ wreck: true, swimming: true }), "die");
    assert.equal(atInfantrySheet({ swimming: true, shotAgeMs: 40 }), "swim");
  });

  it("shows the mortar flash only while a kneeling mortarman is in the fire window", () => {
    assert.equal(mortarmanSheet({}), "walk");
    assert.equal(mortarmanSheet({ stance: "crouch" }), "crouch");
    assert.equal(mortarmanSheet({ stance: "crouch", shotAgeMs: 40 }), "fire");
    assert.equal(mortarmanSheet({ stance: "crouch", shotAgeMs: MORTAR_FIRE_MS }), "crouch");
    assert.equal(mortarmanSheet({ stance: "crawl", shotAgeMs: 40 }), "crawl");
    assert.equal(mortarmanSheet({ swimming: true, shotAgeMs: 40 }), "swim");
    assert.equal(mortarmanSheet({ wreck: true, stance: "crouch" }), "die");
  });

  it("kneels while a medic is bandaging and stays prone if he was already crawling", () => {
    assert.equal(medicSheet({}), "walk");
    assert.equal(medicSheet({ tending: true }), "crouch");
    assert.equal(medicSheet({ stance: "crouch" }), "crouch");
    assert.equal(medicSheet({ stance: "crawl", tending: true }), "crawl");
    assert.equal(medicSheet({ swimming: true, tending: true }), "swim");
    assert.equal(medicSheet({ wreck: true, tending: true }), "die");
  });

  it("holds the last frame of a one-shot", () => {
    assert.equal(heldFrame(0, 12, 4), 0);
    assert.equal(heldFrame(200, 12, 4), 2);
    assert.equal(heldFrame(5000, 12, 4), 3);
  });
});
