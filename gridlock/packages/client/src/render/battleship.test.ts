import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BATTLESHIP_HALF_LENGTH, TILE_SIZE, catalog, isoToWorld, worldToIso } from "@gridlock/shared";
import {
  BATTLESHIP_MODEL,
  BATTLESHIP_WORLD_PER_UNIT,
  battleshipDrawSize,
  battleshipLayers,
  modelOffset,
  shipBarrelMuzzle,
  shipLampMount,
  shipRow,
} from "./battleship.js";

/** The world facing that points straight along sheet row `row` on screen. */
function rowFacing(row: number): number {
  const phi = Math.PI / 2 + (row * Math.PI) / 8;
  const w = isoToWorld(Math.cos(phi), Math.sin(phi), TILE_SIZE);
  return Math.atan2(w.y, w.x);
}

describe("Battle Ship layout", () => {
  const size = battleshipDrawSize(TILE_SIZE);

  it("puts a point on the keel where the sim's hull puts it, on every face", () => {
    for (let row = 0; row < 16; row++) {
      const f = rowFacing(row);
      assert.equal(shipRow(f, TILE_SIZE), row);
      for (const at of [1, 0.6, -0.8]) {
        const x = at * BATTLESHIP_MODEL.halfLength;
        const art = modelOffset(row, x, 0, size);
        const d = at * BATTLESHIP_HALF_LENGTH;
        const sim = worldToIso(Math.cos(f) * d, Math.sin(f) * d, TILE_SIZE);
        assert.ok(Math.abs(art.dx - sim.x) < 1e-6, `row ${row} at ${at}: dx ${art.dx} vs ${sim.x}`);
        assert.ok(Math.abs(art.dy - sim.y) < 1e-6, `row ${row} at ${at}: dy ${art.dy} vs ${sim.y}`);
      }
    }
  });

  it("draws turret A before B, and the island mount last, at every heading", () => {
    for (let row = 0; row < 16; row++) {
      const f = rowFacing(row);
      const layers = battleshipLayers(f, [f, f], [f, f + Math.PI], size, TILE_SIZE);
      assert.equal(layers.length, 5);
      const turrets = layers.flatMap((l, i) => (l.layer === "turret" ? [{ l, i }] : []));
      assert.equal(turrets.length, 2);
      const a = modelOffset(row, 0.6 * BATTLESHIP_MODEL.halfLength, BATTLESHIP_MODEL.turretZ[0], size);
      assert.ok(Math.abs(turrets[0]!.l.dx - a.dx) < 1e-9 && Math.abs(turrets[0]!.l.dy - a.dy) < 1e-9, `row ${row}: A first`);
      assert.ok(turrets[0]!.i < turrets[1]!.i);
      assert.equal(layers[4]!.layer, "ciws");
      assert.ok(layers.some((l) => l.layer === "super"));
    }
  });

  it("puts the middle barrel's tip straight out along the turret", () => {
    const ship = { x: 500, y: 300, facing: 0.4 };
    const m = shipBarrelMuzzle(ship, 0, 1, 1.1, size);
    const pivotX = ship.x + Math.cos(0.4) * 0.6 * BATTLESHIP_HALF_LENGTH;
    const pivotY = ship.y + Math.sin(0.4) * 0.6 * BATTLESHIP_HALF_LENGTH;
    const reach = BATTLESHIP_MODEL.muzzleReach * BATTLESHIP_WORLD_PER_UNIT;
    assert.ok(Math.abs(m.x - (pivotX + Math.cos(1.1) * reach)) < 1e-9);
    assert.ok(Math.abs(m.y - (pivotY + Math.sin(1.1) * reach)) < 1e-9);
    assert.ok(m.lift > 0);
  });
});

describe("Battle Ship size and lamp", () => {
  it("is 2.4 times its first length, and the hull reaches as far as the art", () => {
    assert.equal(BATTLESHIP_HALF_LENGTH, 110.4);
    assert.equal(catalog("battleship").radius, 48);
  });

  it("carries its searchlight high on the island, above the hull's waterline point", () => {
    const size = battleshipDrawSize(TILE_SIZE);
    for (let row = 0; row < 16; row++) {
      const facing = (row * Math.PI) / 8;
      const m = shipLampMount(facing, size, TILE_SIZE);
      assert.ok(m.dy < -size * 0.08, `row ${row}: up on the director`);
      assert.ok(m.u > 0.5 && m.u < 3, `row ${row}: a big lamp, not a speck`);
    }
  });
});
