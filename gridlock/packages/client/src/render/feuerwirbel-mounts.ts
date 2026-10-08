/**
 * Feuerwirbel layout on screen. The hull and the CIWS mount come from
 * tools/sprites/render_feuerwirbel.py on one camera and one composed fit, the
 * mount rendered with its pivot on the model origin. Each of the two mounts is
 * drawn from that one sheet, on its own facing row, shifted to the screen point
 * its pivot (FEUERWIRBEL_MOUNT_AT along the keel) projects to on the hull row
 * being shown, like the Battle Ship's CIWS, so it stays on its ring at every yaw.
 */
import { FEUERWIRBEL_HALF_LENGTH_M, FEUERWIRBEL_MOUNT_AT } from "@gridlock/shared";
import { rowYaw, shipRow } from "./battleship.js";
import type { GatlingMuzzle } from "./gatling-flash.js";

/** Numbers of the composed sheet (render_feuerwirbel.py through composeAligned), as shares of the drawn cell. */
export const FEUERWIRBEL_MODEL = {
  /** Drawn cell per model meter. */
  cellPerMeter: 0.1139,
  /** The model origin's ground point sits this far above the sprite's contact point. */
  originLift: 0.1847,
  /** Barrel bore height over the ground and the muzzle's reach off the mount pivot, meters. */
  boreZ: 2.66,
  muzzleReach: 1.92,
  /** The bow flame projector's tip, meters. */
  nozzleX: 3.95,
  nozzleZ: 1.45,
};

const SIN_CAM = Math.sin(Math.PI / 6);
const COS_CAM = Math.cos(Math.PI / 6);

/** Screen offset of model point (x along the yaw of `row`, z up) from the model origin's screen point. */
function offset(row: number, x: number, z: number, size: number): { dx: number; dy: number; far: number } {
  const yaw = rowYaw(row);
  const k = FEUERWIRBEL_MODEL.cellPerMeter * size;
  const gx = x * Math.cos(yaw);
  const gy = x * Math.sin(yaw);
  return { dx: gx * k, dy: -(gy * SIN_CAM + z * COS_CAM) * k, far: gy };
}

export interface MountLayer {
  /** Index into FEUERWIRBEL_MOUNT_AT: 0 fore, 1 aft. */
  i: number;
  /** Mount sheet row to draw. */
  row: number;
  /** Shift of the whole cell from the hull's, screen px. */
  dx: number;
  dy: number;
}

/** Both mounts, the far one first, so the near one's barrels pass over it. */
export function feuerwirbelMountLayers(hullFacing: number, mountFacings: readonly number[], size: number, tileSize: number): MountLayer[] {
  const hullRow = shipRow(hullFacing, tileSize);
  return FEUERWIRBEL_MOUNT_AT.map((at, i) => {
    const o = offset(hullRow, at, 0, size);
    return { i, row: shipRow(mountFacings[i] ?? hullFacing, tileSize), dx: o.dx, dy: o.dy, far: o.far };
  })
    .sort((a, b) => b.far - a.far)
    .map(({ i, row, dx, dy }) => ({ i, row, dx, dy }));
}

/** Screen muzzle of mount `i` laid on world `mountFacing`. `contactY` is the sprite's ground point after its sink. */
export function feuerwirbelMountMuzzle(
  contactX: number,
  contactY: number,
  i: number,
  hullFacing: number,
  mountFacing: number,
  size: number,
  tileSize: number,
): GatlingMuzzle {
  const pivot = offset(shipRow(hullFacing, tileSize), FEUERWIRBEL_MOUNT_AT[i] ?? 0, 0, size);
  const tip = offset(shipRow(mountFacing, tileSize), FEUERWIRBEL_MODEL.muzzleReach, FEUERWIRBEL_MODEL.boreZ, size);
  const along = offset(shipRow(mountFacing, tileSize), 1, 0, size);
  const len = Math.hypot(along.dx, along.dy) || 1;
  return {
    x: contactX + pivot.dx + tip.dx,
    y: contactY - FEUERWIRBEL_MODEL.originLift * size + pivot.dy + tip.dy,
    dirX: along.dx / len,
    dirY: along.dy / len,
  };
}

/** Screen point of the bow projector's tip for a hull on world `facing`. */
export function feuerwirbelNozzle(contactX: number, contactY: number, facing: number, size: number, tileSize: number): { x: number; y: number } {
  const o = offset(shipRow(facing, tileSize), FEUERWIRBEL_MODEL.nozzleX, FEUERWIRBEL_MODEL.nozzleZ, size);
  return { x: contactX + o.dx, y: contactY - FEUERWIRBEL_MODEL.originLift * size + o.dy };
}

/** World reach from a mount's pivot to its muzzle, for tracers: the muzzle's meters at the sim's scale. */
export function feuerwirbelMuzzleReachWorld(radius: number): number {
  return (FEUERWIRBEL_MODEL.muzzleReach / FEUERWIRBEL_HALF_LENGTH_M) * radius;
}

/** Barrel height on screen over the contact point, as a share of the drawn cell, for tracers. */
export const FEUERWIRBEL_BORE_LIFT = FEUERWIRBEL_MODEL.originLift + FEUERWIRBEL_MODEL.boreZ * COS_CAM * FEUERWIRBEL_MODEL.cellPerMeter;
