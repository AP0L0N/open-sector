import { TILE_CACTUS, TILE_PALM, TILE_TREE } from "@gridlock/shared";

/**
 * A tree a flamethrower force-attack set alight. The trunk chars, flames
 * climb it, then it slumps. Wall-clock, same reason as the burned soldier:
 * the default match speed would skip a sim-timed fall.
 * The seed picks one of three slumps so a row of trees does not fall as one.
 */

export const TREE_BURN_MS = 1800;
export const TREE_DRAW_SCALE = 1.3;

export interface TreeStamp {
  pine: boolean;
  /** Grove tile this stamp was chosen for. Woods keep the oak/pine hash. */
  tile: number;
  drawH: number;
  face: number;
}

/** Same choice `collectTrees` uses, so the burning trunk is the one that stood there. */
export function treeStamp(tx: number, ty: number, kind: "lone" | "grove", tile = TILE_TREE): TreeStamp {
  const h = Math.imul(tx * 374761393 + ty * 668265263 + 9, 1103515245) >>> 0;
  const pine = tile === TILE_TREE && (kind === "lone" ? h % 3 !== 1 : h % 5 === 0);
  const faces = tile === TILE_TREE ? 3 : 2;
  let base: number;
  if (tile === TILE_PALM) base = kind === "lone" ? 58 + (h % 5) * 2 : 42 + (h % 4);
  else if (tile === TILE_CACTUS) base = kind === "lone" ? 38 + (h % 4) * 2 : 30 + (h % 3);
  else base = kind === "lone" ? (pine ? 54 : 46) + (h % 5) * 2 : (pine ? 40 : 34) + (h % 4);
  return { pine, tile, drawH: TREE_DRAW_SCALE * base, face: h % faces };
}

export interface TreeBurnPose {
  /** 0 right, 1 left, 2 a short crumple. */
  variant: 0 | 1 | 2;
  rot: number;
  drop: number;
  alpha: number;
  brightness: number;
  sepia: number;
  heat: number;
  flame: number;
}

export function treeBurnPose(t: number, seed: number): TreeBurnPose {
  const u = Math.min(1, Math.max(0, t));
  const variant = ((seed >>> 0) % 3) as 0 | 1 | 2;
  const sign = variant === 1 ? -1 : variant === 0 ? 1 : 0;
  const leanStart = 0.42;
  const fall = u < leanStart ? 0 : (u - leanStart) / (1 - leanStart);
  const ease = fall * fall;
  const heat = u < 0.12 ? u / 0.12 : u > 0.78 ? Math.max(0, 1 - (u - 0.78) / 0.22) : 1;
  const lean = variant === 2 ? 0.2 : 0.95;
  return {
    variant,
    rot: ease === 0 || sign === 0 ? 0 : sign * ease * lean,
    drop: ease * (variant === 2 ? 20 : 8),
    alpha: u < 0.84 ? 1 : 1 - (u - 0.84) / 0.16,
    brightness: 0.92 - u * 0.8,
    sepia: 0.15 + u * 0.7,
    heat,
    flame: variant === 2 ? 1.15 : 0.9,
  };
}
