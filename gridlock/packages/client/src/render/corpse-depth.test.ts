import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isoDepth } from "@gridlock/shared";
import { compareDrawOrder, CORPSE_DRAW_LAYER, HOLE_DRAW_LAYER } from "./corpse-depth.js";

/** Units, track dirt, and muzzle smoke. Matches `MapView.drawLayer` for a unit. */
const UNIT_LAYER = 1;
const PROP_LAYER = 0;

describe("corpse draw order", () => {
  it("paints a tank over a body even when the body is further south", () => {
    const body = { layer: CORPSE_DRAW_LAYER, z: isoDepth(80, 120) };
    const tank = { layer: UNIT_LAYER, z: isoDepth(80, 80) };
    const items = [tank, body].sort(compareDrawOrder);
    assert.deepEqual(items, [body, tank]);
  });

  it("paints the tank over the body when the hull is on the same ground point", () => {
    const z = isoDepth(40, 40);
    const items = [
      { name: "tank", layer: UNIT_LAYER, z },
      { name: "body", layer: CORPSE_DRAW_LAYER, z },
      { name: "blood", layer: CORPSE_DRAW_LAYER, z: z - 0.35 },
    ].sort(compareDrawOrder);
    assert.deepEqual(
      items.map((item) => item.name),
      ["blood", "body", "tank"],
    );
  });

  it("keeps a body above props and craters", () => {
    const body = { layer: CORPSE_DRAW_LAYER, z: isoDepth(10, 10) };
    const building = { layer: PROP_LAYER, z: isoDepth(200, 200) };
    const hole = { layer: PROP_LAYER, z: isoDepth(10, 10) - 0.6 };
    const items = [body, building, hole].sort(compareDrawOrder);
    assert.equal(items[2], body);
    assert.ok(CORPSE_DRAW_LAYER > PROP_LAYER);
    assert.ok(CORPSE_DRAW_LAYER < UNIT_LAYER);
  });

  it("paints a tree over a crater even when the crater is further south", () => {
    const hole = { layer: HOLE_DRAW_LAYER, z: isoDepth(80, 200) };
    const tree = { layer: PROP_LAYER, z: isoDepth(80, 40) };
    const items = [tree, hole].sort(compareDrawOrder);
    assert.equal(items[0], hole);
    assert.equal(items[1], tree);
    assert.ok(HOLE_DRAW_LAYER < PROP_LAYER);
  });
});
