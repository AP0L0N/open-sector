/**
 * Mothership layout on screen. The hull and the four mount layers come from
 * tools/sprites/render_mothership.py on one camera and scale (the Hive Ark's), each with the
 * model origin at the same cell point. Each mount is drawn with its pivot where its barbette
 * projects on the hull face shown, turned to its own bearing. The whole ship rides at its
 * height (MapView.airLift); its dome is drawn round it in the air (render/energy-shield.ts).
 */

import { MOTHERSHIP_HULL_RADIUS, MOTHERSHIP_MOUNT_AT, MOTHERSHIP_MOUNTS, isoScale, type MothershipMount } from "@gridlock/shared";
import { rowYaw, shipRow } from "./battleship.js";

/** The render script's numbers (render_mothership.py). Model units are 10 m. */
export const MOTHERSHIP_MODEL = {
  hullR: 4.9,
  scaleFrac: (0.0325 * 384) / 256,
  cyFrac: 0.5,
  cell: 256,
  /** Barbette tops, model units: where each mount's pivot sits (render_mothership.py prints them). */
  mountZ: { spine: 1.1438, pulse: 1.1969, maw: 1.2293, flak: 1.2293 } as Record<MothershipMount, number>,
};

const COS_CAM = Math.cos(Math.PI / 6);

/** World px per model unit: the sim's hull radius over the model's. */
const WORLD_PER_UNIT = MOTHERSHIP_HULL_RADIUS / MOTHERSHIP_MODEL.hullR;

/** On-map size of a cell, screen px, so the art is as wide as the sim's hull. */
export function mothershipDrawSize(tileSize: number): number {
  const screenPerUnit = WORLD_PER_UNIT * Math.SQRT2 * isoScale(tileSize).hw;
  return screenPerUnit / MOTHERSHIP_MODEL.scaleFrac;
}

/** Screen offset of model point (x fore, y to port, z up) on hull row `row`. `far` grows away from the viewer. */
function modelPoint(row: number, x: number, y: number, z: number, drawSize: number): { dx: number; dy: number; far: number } {
  const yaw = rowYaw(row);
  const k = MOTHERSHIP_MODEL.scaleFrac * drawSize;
  const gx = x * Math.cos(yaw) - y * Math.sin(yaw);
  const gy = x * Math.sin(yaw) + y * Math.cos(yaw);
  return { dx: gx * k, dy: -(gy * Math.sin(Math.PI / 6) + z * COS_CAM) * k, far: gy };
}

export interface MothershipLayer {
  mount: MothershipMount;
  /** Index into MOTHERSHIP_MOUNTS (and the snapshot's mounts). */
  index: number;
  /** Sheet row: the mount's own bearing. */
  row: number;
  /** Pivot offset from the ship's screen point, screen px. */
  dx: number;
  dy: number;
}

/** The four mounts over the hull, farthest first. */
export function mothershipLayers(hullFacing: number, mountFacings: readonly number[], drawSize: number, tileSize: number): MothershipLayer[] {
  const hullRow = shipRow(hullFacing, tileSize);
  const R = MOTHERSHIP_MODEL.hullR;
  const items = MOTHERSHIP_MOUNTS.map((mount, index) => {
    const at = MOTHERSHIP_MOUNT_AT[mount];
    // The catalog's `across` is to starboard; the model's +y is to port.
    const o = modelPoint(hullRow, at.along * R, -at.across * R, MOTHERSHIP_MODEL.mountZ[mount], drawSize);
    return { mount, index, row: shipRow(mountFacings[index] ?? hullFacing, tileSize), dx: o.dx, dy: o.dy, far: o.far };
  });
  items.sort((a, b) => b.far - a.far);
  return items.map(({ far: _far, ...l }) => l);
}
