/**
 * Open ends of laid lines: wall and sandbag sections, bridge bricks. A new line of the same
 * kind can start at one and carry the old line on (`fieldPath` / `bridgePath` with a lead).
 * Pure geometry, shared by the sim's tests, the Map Builder, and the match's placement ghost.
 */

/** A laid piece as a rectangle: centre, unit vector along its run, length along it, width across. */
export interface LinePieceBox {
  x: number;
  y: number;
  ux: number;
  uy: number;
  length: number;
  width: number;
  /** A new line may carry on from this piece: the armed kind, and yours. Every piece still closes the ends it touches. */
  kin: boolean;
}

/** An open end found near a point. */
export interface OpenEnd {
  /** World point of the end. */
  x: number;
  y: number;
  /** Unit direction from the piece's middle out through that end: how the old line runs into the new one. */
  lead: { x: number; y: number };
  /** Index of the piece in the list given. */
  piece: number;
}

/** Distance from a point to a piece's rectangle, 0 inside. */
function boxDist(p: LinePieceBox, x: number, y: number): number {
  const dx = x - p.x;
  const dy = y - p.y;
  const along = Math.max(0, Math.abs(dx * p.ux + dy * p.uy) - p.length / 2);
  const across = Math.max(0, Math.abs(-dx * p.uy + dy * p.ux) - p.width / 2);
  return Math.hypot(along, across);
}

/**
 * The open end of a kin piece nearest (px, py), within about one piece of it, or null. The
 * pick is generous: the end piece itself, the piece behind it, or open ground just past the
 * end all find it, so a click near the end of a line carries it on rather than starting a
 * new line beside it. An end is open when no other piece touches it; the middle of a line,
 * joined at both ends, has none.
 */
export function openEndAt(pieces: readonly LinePieceBox[], px: number, py: number): OpenEnd | null {
  let best: OpenEnd | null = null;
  let bestD = Infinity;
  for (let i = 0; i < pieces.length; i++) {
    const p = pieces[i]!;
    if (!p.kin) continue;
    // The whole end piece and half the one behind it.
    const reach = p.length * 1.5 + p.width / 2;
    if (Math.hypot(px - p.x, py - p.y) > reach + p.length / 2) continue;
    for (const s of [-1, 1]) {
      const ex = p.x + p.ux * s * (p.length / 2);
      const ey = p.y + p.uy * s * (p.length / 2);
      const d = Math.hypot(px - ex, py - ey);
      if (d > reach || d >= bestD) continue;
      // Anything lying across the end closes it: the next piece straight on, or the first of a turned leg.
      let shut = false;
      for (let j = 0; j < pieces.length && !shut; j++) {
        if (j === i) continue;
        const o = pieces[j]!;
        if (Math.abs(o.x - ex) > o.length + o.width || Math.abs(o.y - ey) > o.length + o.width) continue;
        shut = boxDist(o, ex, ey) <= Math.max(p.width, o.width) * 0.6 + 1.5;
      }
      if (shut) continue;
      best = { x: ex, y: ey, lead: { x: p.ux * s, y: p.uy * s }, piece: i };
      bestD = d;
    }
  }
  return best;
}
