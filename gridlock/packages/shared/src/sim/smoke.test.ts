import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { smokeCloudPuffs } from "./smoke.js";

describe("smokeCloudPuffs", () => {
  it("pins the first puff on the impact", () => {
    const puffs = smokeCloudPuffs(7);
    assert.equal(puffs.length, 18);
    assert.equal(puffs[0]?.u, 0);
    assert.equal(puffs[0]?.v, 0);
  });

  it("keeps puffs inside the unit disk", () => {
    for (const seed of [1, 9, 42, 99, 1001]) {
      for (const p of smokeCloudPuffs(seed)) {
        assert.ok(Math.hypot(p.u, p.v) <= 1.01, `seed ${seed} u=${p.u} v=${p.v}`);
      }
    }
  });

  it("scatters later puffs instead of lining them up", () => {
    const puffs = smokeCloudPuffs(3);
    const off = puffs.filter((p) => Math.hypot(p.u, p.v) > 0.2);
    assert.ok(off.length >= 8, `spread ${off.length}`);
    const vs = off.map((p) => p.v);
    const spreadV = Math.max(...vs) - Math.min(...vs);
    assert.ok(spreadV > 0.4, `across ${spreadV}`);
  });

  it("changes layout with the seed", () => {
    const a = smokeCloudPuffs(4);
    const b = smokeCloudPuffs(5);
    assert.notEqual(a[1]?.u, b[1]?.u);
  });
});
