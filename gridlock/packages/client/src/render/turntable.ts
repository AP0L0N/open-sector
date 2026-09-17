/**
 * Locked-camera unit turntable: 16 unique yaws, 22.5° apart.
 *
 * Drop files named 0001.png … 0016.png (0017.png is ignored — Blender often
 * writes a loop duplicate of 0001). Frame 0001 faces the camera (screen south),
 * then each next file is clockwise.
 *
 * Engine sheets still store row 0 as screen east. Use engineRowFromFrame()
 * to remap.
 */

export const TURNTABLE_DIRS = 16;

/** Engine row order: isoDirIndex, clockwise from screen-east. */
export const ENGINE_SPRITE_DIRS = [
  "E",
  "ESE",
  "SE",
  "SSE",
  "S",
  "SSW",
  "SW",
  "WSW",
  "W",
  "WNW",
  "NW",
  "NNW",
  "N",
  "NNE",
  "NE",
  "ENE",
] as const;

export type SpriteDir = (typeof ENGINE_SPRITE_DIRS)[number];

/** Frame 0001.png faces the camera. */
export const TURNTABLE_START_DIR: SpriteDir = "S";

const START_ROW = ENGINE_SPRITE_DIRS.indexOf(TURNTABLE_START_DIR);

/** 0001.png → S, 0002.png → SSW, … 0013.png → E, clockwise. */
export const TURNTABLE_DIRS_FROM_SOUTH: readonly SpriteDir[] = ENGINE_SPRITE_DIRS.map(
  (_, i) => ENGINE_SPRITE_DIRS[(START_ROW + i) % TURNTABLE_DIRS]!,
);

export function parseFrameIndex(path: string): number | null {
  const base = path.replace(/\\/g, "/").split("/").pop() ?? path;
  const m = base.match(/(\d+)\.png$/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

/** 1-based Blender frame → engine sheet row. 0001 and 0017 both map to south. */
export function engineRowFromFrame(frame1Based: number): number {
  const i = Math.floor(frame1Based) - 1;
  const wrapped = ((i % TURNTABLE_DIRS) + TURNTABLE_DIRS) % TURNTABLE_DIRS;
  return (START_ROW + wrapped) % TURNTABLE_DIRS;
}

export function dirFromFrame(frame1Based: number): SpriteDir {
  return ENGINE_SPRITE_DIRS[engineRowFromFrame(frame1Based)]!;
}

/** Keep 0001–0016; a 0017 loop frame is dropped. */
export function pickTurntableUrls(glob: Record<string, string>): string[] {
  const byFrame = new Map<number, string>();
  for (const [path, url] of Object.entries(glob)) {
    const n = parseFrameIndex(path);
    if (n == null || n < 1 || n > TURNTABLE_DIRS) continue;
    byFrame.set(n, url);
  }
  const out: string[] = [];
  for (let n = 1; n <= TURNTABLE_DIRS; n++) {
    const url = byFrame.get(n);
    if (!url) throw new Error(`turntable missing ${String(n).padStart(4, "0")}.png`);
    out.push(url);
  }
  return out;
}
