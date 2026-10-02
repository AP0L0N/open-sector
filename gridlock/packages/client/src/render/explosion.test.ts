import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  APOCALYPSE_SHELLS,
  ARTILLERY_SHELL,
  BOMB_CALIBER,
  BOMB_DAMAGE,
  MORTAR,
  NEBELWERFER_ROCKET,
  SHELLS,
  STUG_SHELLS,
  TITAN_ROCKET,
} from "@gridlock/shared";
import { burstFamily, burstLifeMs, burstPower, burstSpec, puffField } from "./explosion.js";

const tigerHe = { caliber: SHELLS.he.caliber, damage: SHELLS.he.damage, shell: "he" };
const stugHe = { caliber: STUG_SHELLS.he.caliber, damage: STUG_SHELLS.he.damage, shell: "he" };
const apocHe = { caliber: APOCALYPSE_SHELLS.he.caliber, damage: APOCALYPSE_SHELLS.he.damage, shell: "he" };
const mortar = { caliber: MORTAR.caliber, damage: MORTAR.damage, mortar: true };
const artillery = { caliber: ARTILLERY_SHELL.caliber, damage: ARTILLERY_SHELL.damage, mortar: true, bomb: true };
const bomb = { caliber: BOMB_CALIBER, damage: BOMB_DAMAGE, mortar: true, bomb: true };
const titan = { caliber: TITAN_ROCKET.caliber, damage: TITAN_ROCKET.damage, rocket: true };
const nebel = { caliber: NEBELWERFER_ROCKET.caliber, damage: NEBELWERFER_ROCKET.damage, rocket: true };

describe("burstPower", () => {
  it("is 1 for a Tiger's 75mm HE", () => {
    assert.equal(burstPower(tigerHe), 1);
  });

  it("grows with firepower across the arsenal", () => {
    const order = [mortar, titan, stugHe, tigerHe, apocHe, artillery, bomb].map(burstPower);
    for (let i = 1; i < order.length; i++) {
      assert.ok(order[i]! > order[i - 1]!, `step ${i}: ${order.join(", ")}`);
    }
  });

  it("separates rounds of one caliber by their damage", () => {
    assert.ok(burstPower(stugHe) < burstPower(tigerHe));
    assert.ok(burstPower(artillery) > burstPower(apocHe));
  });

  it("falls back to caliber when the damage is missing", () => {
    assert.equal(burstPower({ caliber: 75 }), 1);
    assert.ok(burstPower({ caliber: 40 }) < burstPower({ caliber: 90 }));
  });
});

describe("burstFamily", () => {
  it("tells a plane's bomb from a field gun's shell on the same arc", () => {
    assert.equal(burstFamily(bomb), "bomb");
    assert.equal(burstFamily(artillery), "lob");
    assert.equal(burstFamily(mortar), "lob");
    assert.equal(burstFamily(nebel), "rocket");
    assert.equal(burstFamily({ caliber: 75, shell: "ap" }), "ap");
    assert.equal(burstFamily(tigerHe), "shell");
  });
});

describe("burstLifeMs", () => {
  it("lets a bigger burst hang longer, and solid shot clear quickest", () => {
    assert.ok(burstLifeMs(burstSpec(bomb)) > burstLifeMs(burstSpec(tigerHe)));
    assert.ok(burstLifeMs(burstSpec({ caliber: 75, damage: 55, shell: "ap" })) < burstLifeMs(burstSpec(tigerHe)));
  });
});

describe("puffField", () => {
  it("is opaque in the middle, clear at the corners, and lit from the upper left", () => {
    const n = 32;
    const { lum, alpha } = puffField(n, 7);
    assert.ok(alpha[(n / 2) * n + n / 2]! > 0.8);
    assert.equal(alpha[0], 0);
    assert.equal(alpha[n * n - 1], 0);
    let upperLeft = 0;
    let lowerRight = 0;
    for (let y = 0; y < n / 2; y++) {
      for (let x = 0; x < n / 2; x++) {
        upperLeft += lum[y * n + x]! * alpha[y * n + x]!;
        lowerRight += lum[(n - 1 - y) * n + (n - 1 - x)]! * alpha[(n - 1 - y) * n + (n - 1 - x)]!;
      }
    }
    assert.ok(upperLeft > lowerRight, `${upperLeft} vs ${lowerRight}`);
  });
});
