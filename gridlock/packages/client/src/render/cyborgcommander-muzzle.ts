/**
 * Where the Cyborg Commander's laser lens is on screen, for each sheet row and posture.
 * Measured from the procedural model by tools/sprites/render_cyborgcommander.py; do not edit by hand.
 */

export interface LensTip {
  /** Screen offset of the lens from his contact point, pixels. */
  x: number;
  y: number;
  /** Screen offset of the ground point straight under the lens, pixels. */
  gx: number;
  gy: number;
}

/**
 * Per row (0 = screen south, clockwise): lens x, y and the ground point under it,
 * as a share of the cell from the cell centre and the contact line.
 */
const TIPS: Record<"stand" | "crawl", [number, number, number, number][]> = {
  stand: [
    [-0.1624, -0.336, -0.1624, 0.183],
    [-0.2786, -0.3837, -0.2786, 0.1352],
    [-0.3524, -0.4521, -0.3524, 0.0669],
    [-0.3726, -0.5307, -0.3726, -0.0117],
    [-0.336, -0.6074, -0.336, -0.0884],
    [-0.2483, -0.6707, -0.2483, -0.1517],
    [-0.1228, -0.7109, -0.1228, -0.1919],
    [0.0215, -0.7219, 0.0215, -0.2029],
    [0.1624, -0.702, 0.1624, -0.183],
    [0.2786, -0.6542, 0.2786, -0.1352],
    [0.3524, -0.5858, 0.3524, -0.0669],
    [0.3726, -0.5073, 0.3726, 0.0117],
    [0.336, -0.4305, 0.336, 0.0884],
    [0.2483, -0.3672, 0.2483, 0.1517],
    [0.1228, -0.327, 0.1228, 0.1919],
    [-0.0215, -0.3161, -0.0215, 0.2029],
  ],
  crawl: [
    [-0.1188, 0.1481, -0.1188, 0.1905],
    [-0.2436, 0.1088, -0.2436, 0.1513],
    [-0.3314, 0.0465, -0.3314, 0.089],
    [-0.3686, -0.0293, -0.3686, 0.0131],
    [-0.3498, -0.1071, -0.3498, -0.0647],
    [-0.2777, -0.1751, -0.2777, -0.1327],
    [-0.1633, -0.2229, -0.1633, -0.1805],
    [-0.0241, -0.2432, -0.0241, -0.2008],
    [0.1188, -0.233, 0.1188, -0.1905],
    [0.2436, -0.1937, 0.2436, -0.1513],
    [0.3314, -0.1314, 0.3314, -0.089],
    [0.3686, -0.0556, 0.3686, -0.0131],
    [0.3498, 0.0223, 0.3498, 0.0647],
    [0.2777, 0.0902, 0.2777, 0.1327],
    [0.1633, 0.138, 0.1633, 0.1805],
    [0.0241, 0.1583, 0.0241, 0.2008],
  ],
};

/**
 * Lens tip for a sheet row, with the sheet drawn `drawSize` pixels across its cell
 * (the standing sheets use UNIT_SPRITE_DRAW_SIZE, the legless ones the prone size).
 */
export function cyborgCommanderLens(row: number, legless: boolean, drawSize: number): LensTip {
  const r = ((Math.round(row) % 16) + 16) % 16;
  const [x, y, gx, gy] = TIPS[legless ? "crawl" : "stand"][r]!;
  return { x: x * drawSize, y: y * drawSize, gx: gx * drawSize, gy: gy * drawSize };
}
