import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AIRFIELD_BACK_DEPTH, AIRFIELD_PADS, airfieldPadWorld, airfieldRunway, catalog, isoDepth } from "@gridlock/shared";
import {
  axisFootprint,
  compareDrawOrder,
  CORPSE_DRAW_LAYER,
  type DrawKey,
  GROUND_DECAL_DRAW_LAYER,
  HOLE_DRAW_LAYER,
  STANDING_DRAW_LAYER,
} from "./corpse-depth.js";

const PROP_LAYER = 0;

const unitAt = (x: number, y: number): DrawKey => ({ layer: STANDING_DRAW_LAYER, z: isoDepth(x, y), at: { x, y } });

/** Wall centred at x, y. Facing 0 looks east, so the wall runs north-south. */
const wallAt = (x: number, y: number, facing: number): DrawKey => ({
  layer: STANDING_DRAW_LAYER,
  z: isoDepth(x, y),
  foot: { cx: x, cy: y, ax: -Math.sin(facing), ay: Math.cos(facing), halfAlong: 24, halfAcross: 7 },
});

const house = (): DrawKey => {
  const foot = axisFootprint(100, 100, 64, 64);
  return { layer: STANDING_DRAW_LAYER, z: isoDepth(foot.cx, foot.cy), foot };
};

describe("corpse draw order", () => {
  it("paints a tank over a body even when the body is further south", () => {
    const body = { layer: CORPSE_DRAW_LAYER, z: isoDepth(80, 120) };
    const tank = unitAt(80, 80);
    const items = [tank, body].sort(compareDrawOrder);
    assert.deepEqual(items, [body, tank]);
  });

  it("paints the tank over the body when the hull is on the same ground point", () => {
    const z = isoDepth(40, 40);
    const items = [
      { name: "tank", layer: STANDING_DRAW_LAYER, z },
      { name: "body", layer: CORPSE_DRAW_LAYER, z },
      { name: "blood", layer: CORPSE_DRAW_LAYER, z: z - 0.35 },
    ].sort(compareDrawOrder);
    assert.deepEqual(
      items.map((item) => item.name),
      ["blood", "body", "tank"],
    );
  });

  it("keeps a body above move clicks and craters", () => {
    const body = { layer: CORPSE_DRAW_LAYER, z: isoDepth(10, 10) };
    const click = { layer: PROP_LAYER, z: isoDepth(200, 200) };
    const hole = { layer: HOLE_DRAW_LAYER, z: isoDepth(10, 10) - 0.6 };
    const items = [body, click, hole].sort(compareDrawOrder);
    assert.deepEqual(items, [hole, click, body]);
  });

  it("paints a tree over a crater even when the crater is further south", () => {
    const hole = { layer: HOLE_DRAW_LAYER, z: isoDepth(80, 200) };
    const tree = unitAt(80, 40);
    const items = [tree, hole].sort(compareDrawOrder);
    assert.deepEqual(items, [hole, tree]);
  });
});

describe("standing draw order", () => {
  it("covers a unit behind a tree and uncovers it in front", () => {
    const tree = unitAt(100, 100);
    assert.deepEqual([tree, unitAt(90, 95)].sort(compareDrawOrder)[1], tree);
    assert.deepEqual([unitAt(110, 105), tree].sort(compareDrawOrder)[0], tree);
  });

  it("covers a unit on the north-west side of a building", () => {
    const b = house();
    const behindWest = unitAt(90, 140);
    const behindNorth = unitAt(150, 90);
    assert.ok(compareDrawOrder(behindWest, b) < 0);
    assert.ok(compareDrawOrder(behindNorth, b) < 0);
  });

  it("paints a unit on the south-east side over a building, even near its far corner", () => {
    const b = house();
    const eastFace = unitAt(170, 104);
    const southFace = unitAt(104, 170);
    assert.ok(compareDrawOrder(eastFace, b) > 0);
    assert.ok(compareDrawOrder(southFace, b) > 0);
    assert.ok(compareDrawOrder(b, eastFace) < 0);
  });

  it("covers a soldier behind a sandbag wall and not one in front", () => {
    const wall = wallAt(100, 100, 0);
    const behindEnd = unitAt(90, 120);
    const inFrontEnd = unitAt(110, 80);
    assert.ok(compareDrawOrder(behindEnd, wall) < 0);
    assert.ok(compareDrawOrder(inFrontEnd, wall) > 0);
  });

  it("uses the wall facing for diagonal walls", () => {
    const wall = wallAt(100, 100, Math.PI / 4);
    assert.ok(compareDrawOrder(unitAt(90, 90), wall) < 0);
    assert.ok(compareDrawOrder(unitAt(110, 110), wall) > 0);
  });
});

describe("airfield draw order", () => {
  const ts = 8;
  const field = { tileX: 20, tileY: 20, tileW: catalog("airfield").tileW, tileH: catalog("airfield").tileH };
  const x = field.tileX * ts;
  const y = field.tileY * ts;
  // The keys MapView.drawKey and its ground pass build for an Airfield.
  const foot = axisFootprint(x, y, field.tileW * ts, field.tileH * AIRFIELD_BACK_DEPTH * ts);
  const props: DrawKey = { layer: STANDING_DRAW_LAYER, z: isoDepth(foot.cx, foot.cy), foot };
  const strip: DrawKey = { layer: GROUND_DECAL_DRAW_LAYER, z: 0 };

  it("planes on every hardstand paint over the hangar band and the strip", () => {
    for (let i = 0; i < AIRFIELD_PADS; i++) {
      const p = airfieldPadWorld(field, i, ts);
      assert.ok(compareDrawOrder(unitAt(p.x, p.y), props) > 0, `pad ${i}`);
      assert.ok(compareDrawOrder(unitAt(p.x, p.y), strip) > 0, `pad ${i}`);
    }
  });

  it("a plane rolling along the strip, even off either end, paints over the field", () => {
    const rw = airfieldRunway(field, ts);
    for (const px of [x - 12, rw.x0, rw.cx, rw.x1, x + field.tileW * ts + 12]) {
      assert.ok(compareDrawOrder(unitAt(px, rw.y), props) > 0, `x ${px}`);
      assert.ok(compareDrawOrder(unitAt(px, rw.y), strip) > 0, `x ${px}`);
    }
  });

  it("craters and shadows land on the strip, not under it", () => {
    assert.ok(compareDrawOrder({ layer: HOLE_DRAW_LAYER, z: -1e9 }, strip) > 0);
  });
});
