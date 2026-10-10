import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { HIVE_GUN_RECOIL_MS, hiveRecoilColumn, noteHiveGunShots } from "./hive-gun-recoil.js";

describe("hive gun recoil", () => {
  it("kicks the twin barrels one after the other", () => {
    let r = noteHiveGunShots(undefined, 1, 1000, 2);
    assert.equal(hiveRecoilColumn(r, 1000), 1);
    r = noteHiveGunShots(r, 1, 1400, 2);
    assert.equal(hiveRecoilColumn(r, 1400), 2);
    r = noteHiveGunShots(r, 1, 1800, 2);
    assert.equal(hiveRecoilColumn(r, 1800), 1);
  });

  it("slides back home once the kick is over", () => {
    const r = noteHiveGunShots(undefined, 1, 1000, 1);
    assert.equal(hiveRecoilColumn(r, 1000 + HIVE_GUN_RECOIL_MS / 2), 1);
    assert.equal(hiveRecoilColumn(r, 1000 + HIVE_GUN_RECOIL_MS), 0);
    assert.equal(hiveRecoilColumn(undefined, 1000), 0);
  });
});
