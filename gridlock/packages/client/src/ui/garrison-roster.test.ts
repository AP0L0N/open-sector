import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { primaryInfantryGun } from "@gridlock/shared";
import { garrisonRoster, rosterAmmoRatios, rosterHpTone } from "./garrison-roster.js";

describe("garrison roster", () => {
  it("lists living occupants of the selected hosts, by id", () => {
    const seats = garrisonRoster(
      [
        { id: 9, type: "rifleman", hp: 40, hpMax: 50, garrisonedIn: 1, clip: 4 },
        { id: 3, type: "pyro", hp: 20, hpMax: 40, garrisonedIn: 1, clip: 12 },
        { id: 4, type: "medic", hp: 30, hpMax: 40, garrisonedIn: 2 },
        { id: 5, type: "rifleman", hp: 0, hpMax: 50, garrisonedIn: 1, clip: 8 },
        { id: 6, type: "engineer", hp: 10, hpMax: 40, garrisonedIn: 1, wreck: true },
        { id: 7, type: "sniper", hp: 40, hpMax: 40, garrisonedIn: 8, clip: 5 },
      ],
      new Set([1, 2]),
    );
    assert.deepEqual(
      seats.map((s) => s.id),
      [3, 4, 9],
    );
    assert.equal(seats[2]?.type, "rifleman");
    assert.equal(seats[2]?.hp, 0.8);
    assert.equal(seats[2]?.tone, "ok");
  });

  it("is empty when nothing selected is occupied", () => {
    assert.deepEqual(garrisonRoster([{ id: 1, type: "rifleman", hp: 10, hpMax: 10, garrisonedIn: 4 }], new Set()), []);
  });

  it("shows a reloading magazine, the Rocketer's missile, and Pyro fuel once", () => {
    const rifle = primaryInfantryGun("rifleman")!;
    assert.deepEqual(rosterAmmoRatios({ type: "rifleman", clip: rifle.clip / 2 }), [0.5]);
    assert.deepEqual(rosterAmmoRatios({ type: "rocketer", clip: 0, heavy: 1 }), [0, 1]);
    assert.deepEqual(rosterAmmoRatios({ type: "rocketer", clip: 1 }), [1]);
    const pyro = primaryInfantryGun("pyro")!;
    assert.deepEqual(rosterAmmoRatios({ type: "pyro", clip: pyro.clip / 2 }), [0.5]);
    assert.deepEqual(rosterAmmoRatios({ type: "medic" }), []);
    assert.equal(rosterAmmoRatios({ type: "cyborg", clip: 0 }).length, 1);
  });

  it("bands health the way the map bar does", () => {
    assert.equal(rosterHpTone(50, 100), "ok");
    assert.equal(rosterHpTone(45, 100), "mid");
    assert.equal(rosterHpTone(30, 100), "mid");
    assert.equal(rosterHpTone(20, 100), "low");
    assert.equal(rosterHpTone(0, 0), "low");
  });
});