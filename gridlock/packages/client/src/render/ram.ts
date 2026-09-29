/**
 * RAM launcher on its pad. It shares the CIWS pad, canvas, and anchor
 * (tools/sprites/render_ram.py, ram.json), so the row helpers in ciws.ts
 * pick its rows too. This file holds what differs: where an interceptor leaves
 * and where its trail ends.
 */
import { ISO_ELEVATION } from "@gridlock/shared";
import { CIWS_INTERCEPT_LIFT } from "./ciws.js";

/** World px from the plinth centre to the cell face, and the cells' height (ram.json faceReach, launchZ). */
export const RAM_FACE_REACH = 6.24;
export const RAM_LAUNCH_Z = 9.96;
/** Screen size of the puff when a RAM interceptor goes off beside a rocket without bursting it. */
export const RAM_MISS_BURST_SIZE = 16;
/** Screen size of a rocket burst in the air by an interceptor or a CIWS burst. */
export const INTERCEPT_BURST_SIZE = 26;

/**
 * An interceptor's smoke line, world space with elevation: from the cell face
 * laid on the burst, to the burst drawn CIWS_INTERCEPT_LIFT screen px up.
 */
export function interceptorTrail(
  launcher: { x: number; y: number },
  burst: { x: number; y: number },
  launcherGround: number,
  burstGround: number,
): { from: { x: number; y: number; z: number }; to: { x: number; y: number; z: number } } {
  const a = Math.atan2(burst.y - launcher.y, burst.x - launcher.x);
  return {
    from: {
      x: launcher.x + Math.cos(a) * RAM_FACE_REACH,
      y: launcher.y + Math.sin(a) * RAM_FACE_REACH,
      // The pad draws at one screen px per mesh unit (64 px diamond over a 192 px source at 3× zoom).
      z: launcherGround + RAM_LAUNCH_Z / ISO_ELEVATION,
    },
    to: { x: burst.x, y: burst.y, z: burstGround + CIWS_INTERCEPT_LIFT / ISO_ELEVATION },
  };
}
