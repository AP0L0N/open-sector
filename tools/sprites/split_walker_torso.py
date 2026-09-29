#!/usr/bin/env python3
"""Split the Walker move sheet into a legs sheet and a torso sheet.

The Walker was harvested as one 16-dir x 8-frame walk cycle
(`walker-move.png`, 128 cells). The client now draws the legs as the hull and
the torso as a turret, so the torso can aim apart from the stride.

Both outputs keep the source cell, scale, and contact point, so the torso
lands on the hips at any aim. The cut is one hip line for every facing (the
camera is fixed and the mech yaws in place). Below it, any blob that does not
reach the bottom of the hip band is a hanging gatling, not a leg, and goes to
the torso. The torso keeps all 8 frames: frame i of the aim row rides on
frame i of the legs row, so the stride bob stays in step.

  python3 tools/sprites/split_walker_torso.py
"""

from __future__ import annotations

from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
UNITS = ROOT / "gridlock/packages/client/src/assets/units"
PREVIEW = ROOT / "tools/sprites/preview"
CELL = 128
DIRS = 16
FRAMES = 8
# Bottom of the pelvis in the cell. Legs start here.
HIP_Y = 69
# Rows under the hip searched for hanging gatlings.
BAND = 16
ALPHA = 24


def components(mask: np.ndarray) -> list[np.ndarray]:
    h, w = mask.shape
    seen = np.zeros_like(mask, dtype=bool)
    out: list[np.ndarray] = []
    for y0 in range(h):
        for x0 in range(w):
            if not mask[y0, x0] or seen[y0, x0]:
                continue
            comp = np.zeros_like(mask, dtype=bool)
            q = deque([(y0, x0)])
            seen[y0, x0] = True
            while q:
                y, x = q.popleft()
                comp[y, x] = True
                for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        q.append((ny, nx))
            out.append(comp)
    return out


def barrel(cell: np.ndarray) -> np.ndarray:
    """Gatling steel: dark and neutral. Leg plate is olive, outlines lean purple."""
    rgb = cell[..., :3].astype(np.int16)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    hi = rgb.max(axis=-1)
    lo = rgb.min(axis=-1)
    return (cell[..., 3] > ALPHA) & (hi < 80) & (hi - lo < 16) & (g + 4 >= r)


def erode(mask: np.ndarray) -> np.ndarray:
    out = mask.copy()
    out[1:] &= mask[:-1]
    out[:-1] &= mask[1:]
    out[:, 1:] &= mask[:, :-1]
    out[:, :-1] &= mask[:, 1:]
    return out


def grow(mask: np.ndarray, within: np.ndarray, steps: int) -> np.ndarray:
    out = mask.copy()
    for _ in range(steps):
        n = out.copy()
        n[1:] |= out[:-1]
        n[:-1] |= out[1:]
        n[:, 1:] |= out[:, :-1]
        n[:, :-1] |= out[:, 1:]
        out = n & within
    return out


def torso_mask(cell: np.ndarray) -> np.ndarray:
    solid = cell[..., 3] > ALPHA
    mask = np.zeros(solid.shape, dtype=bool)
    mask[:HIP_Y] = True
    lo, hi = HIP_Y, HIP_Y + BAND
    # Whole blobs under the hip that never reach down the band: a hanging arm.
    for comp in components(solid[lo:hi]):
        if comp[-1].any() or not (comp[0] & solid[lo - 1]).any():
            continue
        mask[lo:hi] |= comp
    # Barrels that touch a thigh: thick steel hung from the hip. One pixel of
    # erosion drops the thin leg outlines that would chain a muzzle to the feet.
    steel = barrel(cell)
    steel[:lo] = False
    steel[hi:] = False
    core = erode(steel)
    for comp in components(core):
        ys = np.nonzero(comp.any(axis=1))[0]
        if comp.sum() < 6 or ys[0] > lo + 2 or ys[-1] >= hi - 2:
            continue
        mask |= grow(comp, steel | outline(cell), 2)
    # Overhang: a hip-level pixel with nothing under it is barrel or forearm, not thigh.
    # Bottom-up, so a two-pixel barrel peels a row at a time.
    for y in range(lo + 5, lo - 1, -1):
        under = (solid & ~mask)[y + 1 : y + 4].any(axis=0)
        mask[y] |= solid[y] & ~under
    # Specks cut loose from the legs ride with the torso.
    for comp in components(solid & ~mask):
        if comp.sum() < 8:
            mask |= comp
    return mask & solid


def outline(cell: np.ndarray) -> np.ndarray:
    return (cell[..., 3] > ALPHA) & (cell[..., :3].max(axis=-1) < 56)


def main() -> None:
    src = np.asarray(Image.open(UNITS / "walker-move.png").convert("RGBA"))
    legs = np.zeros_like(src)
    torso = np.zeros_like(src)
    for r in range(DIRS):
        for f in range(FRAMES):
            ys, xs = slice(r * CELL, (r + 1) * CELL), slice(f * CELL, (f + 1) * CELL)
            cell = src[ys, xs]
            m = torso_mask(cell)
            torso[ys, xs][m] = cell[m]
            keep = ~m & (cell[..., 3] > 0)
            legs[ys, xs][keep] = cell[keep]
    Image.fromarray(legs).save(UNITS / "walker-legs.png", optimize=True)
    Image.fromarray(torso).save(UNITS / "walker-torso.png", optimize=True)

    # Mixed-aim check: legs walking south-east, torso on every facing.
    legs_row = 14
    out = Image.new("RGBA", (DIRS * CELL, 2 * CELL), (96, 112, 88, 255))
    L = Image.fromarray(legs)
    T = Image.fromarray(torso)
    for d in range(DIRS):
        for i, f in enumerate((0, 4)):
            box = (f * CELL, legs_row * CELL, (f + 1) * CELL, (legs_row + 1) * CELL)
            tbox = (f * CELL, d * CELL, (f + 1) * CELL, (d + 1) * CELL)
            out.alpha_composite(L.crop(box), (d * CELL, i * CELL))
            out.alpha_composite(T.crop(tbox), (d * CELL, i * CELL))
    out.save(PREVIEW / "walker-torso-aim.png")
    print("wrote walker-legs.png, walker-torso.png, preview/walker-torso-aim.png")


if __name__ == "__main__":
    main()
