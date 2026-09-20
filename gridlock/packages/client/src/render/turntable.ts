/**
 * Unit turntable drop-ins: 0001.png … 0016.png at 22.5° world yaw.
 *
 * 0001 faces world south (screen down). Each next file is clockwise.
 * 0016 is the last unique yaw (south + 337.5°). A 17th file would equal
 * 0001 (full turn); do not ship 0017. 8 steps is a true reverse.
 * This mapping is the standard for every unit sprite.
 */

import { TANK_FACE_DIRS, TANK_FACE_START_YAW, facingToIso, isoDirIndex } from "@gridlock/shared";

export const TURNTABLE_DIRS = TANK_FACE_DIRS;
/** Files on disk. 0001–0016, one unique face each. 0017 is ignored. */
export const TURNTABLE_UNIQUE = TANK_FACE_DIRS;

export function parseFrameIndex(path: string): number | null {
  const base = path.replace(/\\/g, "/").split("/").pop() ?? path;
  const m = base.match(/(\d+)\.png$/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

/** 1-based file index → sheet row. Frame 1 is row 0 (south). Frame 16 is row 15. */
export function engineRowFromFrame(frame1Based: number): number {
  const i = Math.floor(frame1Based) - 1;
  return ((i % TURNTABLE_DIRS) + TURNTABLE_DIRS) % TURNTABLE_DIRS;
}

/** Sheet row for a world facing. Row 0 = 0001 = world south. */
export function engineRowFromFacing(facing: number): number {
  const step = (Math.PI * 2) / TURNTABLE_DIRS;
  const i = Math.round((facing - TANK_FACE_START_YAW) / step);
  return ((i % TURNTABLE_DIRS) + TURNTABLE_DIRS) % TURNTABLE_DIRS;
}

/**
 * Drop-in row from a screen-space direction. 0001 = screen south (down),
 * then clockwise. isoDirIndex is east-first; south is that table's row 4.
 */
export function engineRowFromScreen(dx: number, dy: number): number {
  const eastFirst = isoDirIndex(dx, dy, TURNTABLE_DIRS);
  return ((eastFirst - 4) % TURNTABLE_DIRS + TURNTABLE_DIRS) % TURNTABLE_DIRS;
}

/** Drop-in row from world facing after the 2:1 iso projection. */
export function engineRowFromProjectedFacing(facing: number, tileSize: number): number {
  const p = facingToIso(facing, tileSize);
  return engineRowFromScreen(p.x, p.y);
}

/** Keep 0001–0016 in order. Extra blender loop frames (0017+) are dropped. */
export function pickTurntableUrls(glob: Record<string, string>): string[] {
  const byFrame = new Map<number, string>();
  for (const [path, url] of Object.entries(glob)) {
    const n = parseFrameIndex(path);
    if (n == null || n < 1 || n > TURNTABLE_UNIQUE) continue;
    byFrame.set(n, url);
  }
  const out: string[] = [];
  for (let n = 1; n <= TURNTABLE_UNIQUE; n++) {
    const url = byFrame.get(n);
    if (!url) throw new Error(`turntable missing ${String(n).padStart(4, "0")}.png`);
    out.push(url);
  }
  return out;
}
