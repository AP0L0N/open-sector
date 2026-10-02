/**
 * Where the Pyro's lance tip is on screen, for each sheet row and posture.
 * Measured from the procedural stills by tools/sprites/render_infantry.py; do not edit by hand.
 */
import type { Stance } from "@gridlock/shared";

export interface NozzleTip {
  /** Screen offset from his feet of the ground point under the tip. */
  gx: number;
  gy: number;
  /** Tip height above that ground, screen pixels. */
  h: number;
}

/**
 * Per row (0 = screen south, clockwise): tip x and y as a share of the cell
 * from the cell centre and the contact line, and the screen bearing he faces.
 */
const TIPS: Record<Stance, [number, number, number][]> = {
  stand: [
    [-0.0172, -0.2616, 90.0],
    [-0.1395, -0.2785, 127.3],
    [-0.2405, -0.3197, 151.4],
    [-0.3049, -0.3788, 167.3],
    [-0.3229, -0.4468, 180.0],
    [-0.2918, -0.5134, -167.3],
    [-0.2162, -0.5684, -151.4],
    [-0.1077, -0.6035, -127.3],
    [0.0172, -0.6133, -90.0],
    [0.1395, -0.5963, -52.7],
    [0.2405, -0.5552, -28.6],
    [0.3049, -0.4961, -12.7],
    [0.3229, -0.4281, -0.0],
    [0.2918, -0.3615, 12.7],
    [0.2162, -0.3064, 28.6],
    [0.1077, -0.2714, 52.7],
  ],
  crouch: [
    [-0.0172, -0.0429, 90.0],
    [-0.1499, -0.061, 127.3],
    [-0.2597, -0.1054, 151.4],
    [-0.33, -0.1693, 167.3],
    [-0.35, -0.243, 180.0],
    [-0.3168, -0.3152, -167.3],
    [-0.2354, -0.375, -151.4],
    [-0.1181, -0.4133, -127.3],
    [0.0172, -0.4242, -90.0],
    [0.1499, -0.4061, -52.7],
    [0.2597, -0.3618, -28.6],
    [0.33, -0.2979, -12.7],
    [0.35, -0.2242, -0.0],
    [0.3168, -0.152, 12.7],
    [0.2354, -0.0922, 28.6],
    [0.1181, -0.0539, 52.7],
  ],
  crawl: [
    [-0.0155, 0.1068, 90.0],
    [-0.1178, 0.0923, 127.3],
    [-0.2021, 0.0577, 151.4],
    [-0.2557, 0.0081, 167.3],
    [-0.2704, -0.0489, 180.0],
    [-0.2439, -0.1046, -167.3],
    [-0.1803, -0.1506, -151.4],
    [-0.0892, -0.1798, -127.3],
    [0.0155, -0.1878, -90.0],
    [0.1178, -0.1733, -52.7],
    [0.2021, -0.1387, -28.6],
    [0.2557, -0.0891, -12.7],
    [0.2704, -0.0321, -0.0],
    [0.2439, 0.0236, 12.7],
    [0.1803, 0.0696, 28.6],
    [0.0892, 0.0988, 52.7],
  ],
};

/**
 * Lance tip for a sheet row and posture, drawn `drawSize` pixels tall with
 * the feet `sink` pixels into the ground. The tip is split into the ground
 * point under it (along his facing) and a height above that point, so the
 * jet can arc down onto the ground from the right place.
 */
export function pyroNozzleScreen(row: number, stance: Stance, drawSize = 20, sink = 0): NozzleTip {
  const r = ((Math.round(row) % 16) + 16) % 16;
  const [fx, fy, deg] = (TIPS[stance] ?? TIPS.stand)[r]!;
  const tx = fx * drawSize;
  const ty = fy * drawSize + sink;
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const rest = stance === "crawl" ? 2 : stance === "crouch" ? 5 : 7;
  let h = rest;
  if (Math.abs(c) > 0.35) {
    // Ground point on his bearing straight under the tip.
    const along = tx / c;
    h = along * s - ty;
  }
  h = Math.max(1, Math.min(rest * 1.8, h));
  return { gx: tx, gy: ty + h, h };
}
