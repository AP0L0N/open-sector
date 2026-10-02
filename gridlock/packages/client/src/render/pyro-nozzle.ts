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
    [-0.0076, -0.2594, 90.0],
    [-0.1277, -0.274, 127.3],
    [-0.2284, -0.3126, 151.4],
    [-0.2942, -0.3692, 167.3],
    [-0.3153, -0.4352, 180.0],
    [-0.2884, -0.5007, -167.3],
    [-0.2176, -0.5555, -151.4],
    [-0.1136, -0.5913, -127.3],
    [0.0076, -0.6028, -90.0],
    [0.1277, -0.5882, -52.7],
    [0.2284, -0.5496, -28.6],
    [0.2942, -0.493, -12.7],
    [0.3153, -0.4269, -0.0],
    [0.2884, -0.3615, 12.7],
    [0.2176, -0.3067, 28.6],
    [0.1136, -0.2708, 52.7],
  ],
  crouch: [
    [-0.0076, -0.0517, 90.0],
    [-0.1381, -0.0675, 127.3],
    [-0.2476, -0.1093, 151.4],
    [-0.3194, -0.1707, 167.3],
    [-0.3425, -0.2424, 180.0],
    [-0.3136, -0.3135, -167.3],
    [-0.2368, -0.3731, -151.4],
    [-0.124, -0.4122, -127.3],
    [0.0076, -0.4248, -90.0],
    [0.1381, -0.409, -52.7],
    [0.2476, -0.3672, -28.6],
    [0.3194, -0.3058, -12.7],
    [0.3425, -0.2341, -0.0],
    [0.3136, -0.163, 12.7],
    [0.2368, -0.1034, 28.6],
    [0.124, -0.0643, 52.7],
  ],
  crawl: [
    [-0.006, 0.0727, 90.0],
    [-0.0896, 0.0624, 127.3],
    [-0.1596, 0.0354, 151.4],
    [-0.2052, -0.0041, 167.3],
    [-0.2197, -0.0502, 180.0],
    [-0.2007, -0.0957, -167.3],
    [-0.1511, -0.1338, -151.4],
    [-0.0785, -0.1587, -127.3],
    [0.006, -0.1665, -90.0],
    [0.0896, -0.1562, -52.7],
    [0.1596, -0.1292, -28.6],
    [0.2052, -0.0897, -12.7],
    [0.2197, -0.0436, -0.0],
    [0.2007, 0.0019, 12.7],
    [0.1511, 0.04, 28.6],
    [0.0785, 0.0649, 52.7],
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
