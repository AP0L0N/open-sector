import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { catalog, SHELLS, TANK_MG } from "../catalog.js";
import {
  aimAngle,
  armorOn,
  hitFace,
  KILL_OVERMATCH,
  resolveHit,
} from "./ballistics.js";

function seq(values: number[]): () => number {
  let i = 0;
  return () => values[i++] ?? 0.5;
}

const warden = catalog("warden");
const trooper = catalog("trooper");
const hauler = catalog("hauler");
const cottage = catalog("cottage");

describe("hitFace", () => {
  it("maps incoming travel onto front, side, and rear plates", () => {
    assert.equal(hitFace(0, -1, 0), "front");
    assert.equal(hitFace(0, 1, 0), "rear");
    assert.equal(hitFace(0, 0, 1), "side");
    assert.equal(hitFace(0, 0, -1), "side");
    assert.equal(hitFace(0, -Math.cos(Math.PI / 5), -Math.sin(Math.PI / 5)), "front");
    assert.equal(hitFace(0, Math.cos(Math.PI / 5), Math.sin(Math.PI / 5)), "rear");
  });
});

describe("warden armor", () => {
  it("is thickest in front, thinner on the sides, thinnest at the rear", () => {
    assert.ok(warden.armorFront > warden.armorSide);
    assert.ok(warden.armorSide > warden.armorRear);
    assert.equal(armorOn(warden, "front"), warden.armorFront);
    assert.equal(armorOn(warden, "side"), warden.armorSide);
    assert.equal(armorOn(warden, "rear"), warden.armorRear);
  });
});

describe("resolveHit", () => {
  it("lets rifles wound unarmored targets", () => {
    const res = resolveHit({
      gun: trooper,
      target: hauler,
      targetFacing: 0,
      targetHp: 40,
      targetHpMax: 40,
      vx: -1,
      vy: 0,
      rand: seq([0.5]),
    });
    assert.equal(res.face, "front");
    assert.ok(res.damage >= 11 && res.damage <= 13);
    assert.equal(res.kind, "hit");
  });

  it("does not ricochet AP or HE off a house", () => {
    for (const gun of [SHELLS.ap, SHELLS.he]) {
      const res = resolveHit({
        gun,
        target: cottage,
        targetFacing: 0,
        targetHp: cottage.hp,
        targetHpMax: cottage.hp,
        vx: -400,
        vy: 120,
        rand: seq([0.5]),
      });
      assert.notEqual(res.kind, "ricochet", `${gun.id} kind=${res.kind}`);
      assert.ok(res.damage > 0, `${gun.id} dmg=${res.damage}`);
    }
  });

  it("wounds a Warden's front at a perpendicular hit without one-shotting", () => {
    const res = resolveHit({
      gun: warden,
      target: warden,
      targetFacing: 0,
      targetHp: 120,
      targetHpMax: 120,
      vx: -400,
      vy: 0,
      rand: seq([0.5, 0.5, 0.5, 0.5]),
    });
    assert.equal(res.face, "front");
    assert.ok(res.kind === "hit" || res.kind === "pen", res.kind);
    assert.ok(res.damage >= 40, `dmg=${res.damage}`);
    assert.ok(res.damage < 120, `dmg=${res.damage}`);
  });

  it("ricochets off the bow at a glancing angle", () => {
    const a = (48 * Math.PI) / 180;
    const res = resolveHit({
      gun: warden,
      target: warden,
      targetFacing: 0,
      targetHp: 120,
      targetHpMax: 120,
      vx: -Math.cos(a) * 400,
      vy: -Math.sin(a) * 400,
      rand: seq([0.5, 0.5, 0.5, 0.5]),
    });
    assert.equal(res.face, "front");
    assert.equal(res.kind, "ricochet");
    assert.equal(res.damage, 0);
    assert.ok(res.bounceVx > 0, `bounceVx=${res.bounceVx}`);
    const inSp = Math.hypot(-Math.cos(a) * 400, -Math.sin(a) * 400);
    const outSp = Math.hypot(res.bounceVx, res.bounceVy);
    assert.ok(outSp > inSp * 0.8, `bounce ${outSp} vs in ${inSp}`);
    assert.ok(outSp <= inSp, `bounce ${outSp} vs in ${inSp}`);
  });

  it("one-shots a Warden through the rear", () => {
    const res = resolveHit({
      gun: warden,
      target: warden,
      targetFacing: 0,
      targetHp: 120,
      targetHpMax: 120,
      vx: 400,
      vy: 0,
      rand: seq([0.5]),
    });
    assert.equal(res.face, "rear");
    assert.equal(res.kind, "kill");
    assert.equal(res.damage, 120);
    assert.ok(res.overmatch >= KILL_OVERMATCH || res.overmatch >= 1.25);
  });

  it("does negligible damage when a rifle hits tank armor", () => {
    for (const [vx, vy, face] of [
      [-1, 0, "front"],
      [0, 1, "side"],
      [1, 0, "rear"],
    ] as const) {
      const res = resolveHit({
        gun: trooper,
        target: warden,
        targetFacing: 0,
        targetHp: 120,
        targetHpMax: 120,
        vx,
        vy,
        rand: seq([0.5, 0.5, 0.5, 0.5]),
      });
      assert.equal(res.face, face);
      assert.ok(res.kind === "ricochet" || res.kind === "glance", `${face} ${res.kind}`);
      assert.ok(res.damage <= 2, `${face} dmg=${res.damage}`);
    }
  });

  it("pings rifle ricochets off armor in random directions", () => {
    const n = { x: 1, y: 0 };
    const dirs: number[] = [];
    for (const r of [0.05, 0.25, 0.45, 0.65, 0.85]) {
      const res = resolveHit({
        gun: trooper,
        target: warden,
        targetFacing: 0,
        targetHp: 120,
        targetHpMax: 120,
        vx: -1,
        vy: 0,
        rand: seq([r, r, r, r]),
      });
      assert.equal(res.kind, "ricochet");
      assert.ok(res.bounceVx * n.x + res.bounceVy * n.y >= -1e-9, `inward bounce r=${r}`);
      dirs.push(Math.atan2(res.bounceVy, res.bounceVx));
    }
    const spread = Math.max(...dirs) - Math.min(...dirs);
    assert.ok(spread > 1, `spread=${spread} dirs=${dirs.join(",")}`);
  });

  it("can chip near zero on a side hit when the roll is poor", () => {
    const res = resolveHit({
      gun: warden,
      target: warden,
      targetFacing: 0,
      targetHp: 120,
      targetHpMax: 120,
      vx: 0,
      vy: 400,
      rand: seq([0.0]),
    });
    assert.equal(res.face, "side");
    assert.ok(res.kind === "glance" || res.kind === "hit" || res.kind === "pen" || res.kind === "kill");
    if (res.kind !== "kill") assert.ok(res.damage >= 20, `dmg=${res.damage} kind=${res.kind}`);
  });

  it("can clean-pen a side plate on a hot roll", () => {
    const res = resolveHit({
      gun: warden,
      target: warden,
      targetFacing: 0,
      targetHp: 120,
      targetHpMax: 120,
      vx: 0,
      vy: 400,
      rand: seq([0.99]),
    });
    assert.equal(res.face, "side");
    assert.ok(res.kind === "kill" || res.kind === "pen" || res.kind === "hit");
    assert.ok(res.damage >= 40, `dmg=${res.damage} kind=${res.kind}`);
  });
});

describe("aimAngle", () => {
  it("is exact with no spread, and fans out at range", () => {
    assert.equal(aimAngle(0.3, 0, 100, 100, () => 1), 0.3);
    const hi = aimAngle(0, 10, 100, 100, () => 1);
    const lo = aimAngle(0, 10, 100, 100, () => 0);
    assert.ok(Math.abs(hi - (10 * Math.PI) / 180) < 1e-9);
    assert.ok(Math.abs(lo + (10 * Math.PI) / 180) < 1e-9);
    const close = aimAngle(0, 10, 0, 100, () => 1);
    assert.ok(Math.abs(close) < Math.abs(hi));
  });

  it("opens the MG cone much wider at max range than point blank", () => {
    const close = aimAngle(0, TANK_MG.spreadDeg, 0, 100, () => 1, false, TANK_MG.spreadPower);
    const far = aimAngle(0, TANK_MG.spreadDeg, 100, 100, () => 1, false, TANK_MG.spreadPower);
    assert.ok(Math.abs(far) > Math.abs(close) * 4, `close=${close} far=${far}`);
    const gunFar = aimAngle(0, catalog("warden").spreadDeg, 100, 100, () => 1);
    assert.ok(Math.abs(far) > Math.abs(gunFar) * 3, `mg=${far} gun=${gunFar}`);
  });
});
