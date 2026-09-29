/**
 * Where the Pyro's lance tip is on screen, for each sheet row and posture.
 * Measured from the sprite stills by tools/sprites/derive_pyro.py; do not edit by hand.
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
    [-0.1081, -0.0809, 90],
    [-0.1072, -0.0795, 112.5],
    [-0.2281, -0.0803, 135.0],
    [-0.3068, -0.1408, 157.5],
    [-0.349, -0.263, 180.0],
    [-0.3425, -0.3763, 202.5],
    [-0.3024, -0.5013, 225.0],
    [-0.2369, -0.6032, 247.5],
    [0.06, -0.6787, -90],
    [0.2369, -0.6032, -67.5],
    [0.3024, -0.5013, -45],
    [0.3425, -0.3763, -22.5],
    [0.349, -0.263, 0],
    [0.3068, -0.1408, 22.5],
    [0.2281, -0.0803, 45],
    [0.1072, -0.0795, 67.5],
  ],
  crouch: [
    [0.1167, -0.1669, 90],
    [-0.1771, -0.1636, 112.5],
    [-0.2366, -0.1752, 135.0],
    [-0.3117, -0.195, 157.5],
    [-0.3572, -0.2257, 180.0],
    [-0.315, -0.3877, 202.5],
    [-0.2359, -0.4484, 225.0],
    [-0.2195, -0.6107, 247.5],
    [0.0842, -0.6456, -90],
    [0.2195, -0.6107, -67.5],
    [0.2359, -0.4484, -45],
    [0.315, -0.3877, -22.5],
    [0.3572, -0.2257, 0],
    [0.3117, -0.195, 22.5],
    [0.2366, -0.1752, 45],
    [0.1771, -0.1636, 67.5],
  ],
  crawl: [
    [-0.0922, -0.0507, 90],
    [-0.0173, -0.056, 112.5],
    [-0.1547, -0.0576, 135.0],
    [-0.2711, -0.0448, 157.5],
    [-0.3765, -0.0514, 180.0],
    [-0.4146, -0.2835, 202.5],
    [-0.3871, -0.4205, 225.0],
    [-0.2307, -0.5102, 247.5],
    [0.0945, -0.5886, -90],
    [0.2307, -0.5102, -67.5],
    [0.3871, -0.4205, -45],
    [0.4146, -0.2835, -22.5],
    [0.3765, -0.0514, 0],
    [0.2711, -0.0448, 22.5],
    [0.1547, -0.0576, 45],
    [0.0173, -0.056, 67.5],
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
