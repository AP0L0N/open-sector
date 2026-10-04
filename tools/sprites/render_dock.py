#!/usr/bin/env python3
"""Marine Base building art: one structure image, a cameo, and its pad metrics.

A concrete U-shaped pier on the water around an open slip that runs out to the
south-east face, a slipway ramp at the head of the slip, an olive boathouse
with a gray team-tint roof on the north arm, a hazard-yellow gantry crane
straddling the slip, two fuel tanks and a crate stack on the south arm,
bollards along the slip edges, and a lamp mast on the pier end.

The slip itself is left empty: the map's water shows through it, so the base
sits in its pond instead of on a painted one.

Look: the Research Facility's materials (render_research.py) on the inked
structure pipeline of render_airfield.py (mesh, raster, ink, silhouette, key
light, cast shadow), at the same 3x source zoom as the Radar Station, so its
t(2) footprint is the same 384 px pad.

  python tools/sprites/render_dock.py --out gridlock/packages/client/src/assets/buildings
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image

import render_research as rr

ra = rr.ra

# Footprint, world px: t(2) x t(2) gameplay tiles. Must match catalog.ts.
W = H = 64.0
SS = ra.SS
TOP_MARGIN = 54.0
SIDE_MARGIN = 6.0

DECK = 3.0  # pier deck height over the water
# The slip: open water from the slipway out to the south-east (x = W) face.
SLIP = (24.0, 25.0, W, 41.0)
# Boathouse on the north arm.
HOUSE = (5.0, 5.0, 38.0, 21.0)
HOUSE_WALL = 13.0
HOUSE_RIDGE = 19.0
# Gantry crane legs straddle the slip.
CRANE_X = (44.0, 56.0)
CRANE_TOP = 30.0

_rr_tex = rr.tex


def rgb(h: str) -> np.ndarray:
    return ra.rgb(h)


def tex(mat: str, P: np.ndarray, n: np.ndarray) -> np.ndarray:
    X, Y, Z = P[:, 0], P[:, 1], P[:, 2]
    nf = ra.vnoise(X / 1.1 + Z * 0.7, Y / 1.1 - Z * 0.5, 7)
    nm = ra.fbm(X / 6 + Z * 0.2, Y / 6 + Z * 0.3, 9, 3)

    def base(h):
        return np.broadcast_to(rgb(h), (len(X), 3)).copy()

    if mat == "pier":
        # Poured deck in bays, weathered toward the edges.
        c = base("#8a877c") * (0.9 + 0.12 * nm[:, None]) * (0.96 + 0.06 * nf[:, None])
        c[(np.mod(X, 10.0) < 0.35) | (np.mod(Y, 10.0) < 0.35)] *= 0.78
        return c
    if mat == "pier_side":
        # Wet concrete face with a dark tide line at the foot.
        c = base("#5d5b52") * (0.9 + 0.12 * nf[:, None])
        c[Z < 1.0] = rgb("#2f3a36")
        return c
    if mat == "fender":
        return base("#2a2622") * (0.9 + 0.1 * nf[:, None])
    if mat == "gantry":
        c = base("#d4a017") * (0.9 + 0.1 * nf[:, None])
        along = Z if abs(n[2]) < 0.5 else X
        c[np.mod(along, 4.0) < 1.2] = rgb("#2a2622")
        return c
    if mat == "hull":
        return base("#5a6b3d") * (0.9 + 0.12 * nm[:, None])
    return _rr_tex(mat, P, n)


ra.tex = tex


# ---------------------------------------------------------------- meshes


def gable(m: ra.Mesh, x0: float, y0: float, x1: float, y1: float, z0: float, z1: float, mat: str) -> None:
    """Pitched roof, ridge running along x, eaves overhanging a little."""
    ym = (y0 + y1) / 2
    a = m.v((x0 - 0.8, y0 - 0.8, z0))
    b = m.v((x1 + 0.8, y0 - 0.8, z0))
    c = m.v((x1 + 0.8, ym, z1))
    d = m.v((x0 - 0.8, ym, z1))
    e = m.v((x0 - 0.8, y1 + 0.8, z0))
    f = m.v((x1 + 0.8, y1 + 0.8, z0))
    m.quad(a, b, c, d, mat)
    m.quad(d, c, f, e, mat)
    # Gable ends in the wall colour.
    g0 = m.v((x0, y0, z0))
    g1 = m.v((x0, y1, z0))
    g2 = m.v((x0, ym, z1 - 0.4))
    m.tri(g0, g1, g2, "olive")
    h0 = m.v((x1, y0, z0))
    h1 = m.v((x1, y1, z0))
    h2 = m.v((x1, ym, z1 - 0.4))
    m.tri(h0, h2, h1, "olive")


def build_mesh(deck: bool = True) -> tuple[ra.Mesh, dict]:
    m = ra.Mesh()
    sx0, sy0, sx1, sy1 = SLIP
    if deck:
        # U-pier: north arm, south arm, and the head of the slip.
        m.box((1.0, 1.0, 0), (W - 1.0, sy0, DECK), "pier_side", top="pier")
        m.box((1.0, sy1, 0), (W - 1.0, H - 1.0, DECK), "pier_side", top="pier")
        m.box((1.0, sy0, 0), (sx0, sy1, DECK), "pier_side", top="pier")
        # Slipway ramp from the deck down into the slip.
        r0 = m.v((sx0, sy0 + 1.0, DECK))
        r1 = m.v((sx0, sy1 - 1.0, DECK))
        r2 = m.v((sx0 + 11.0, sy1 - 1.0, 0.0))
        r3 = m.v((sx0 + 11.0, sy0 + 1.0, 0.0))
        m.quad(r0, r1, r2, r3, "concrete")
        # Rubber fenders hung on the slip walls.
        for x in np.arange(sx0 + 14.0, W - 2.0, 6.0):
            m.box((x, sy0 - 0.5, 0.6), (x + 1.6, sy0, DECK - 0.4), "fender")
            m.box((x, sy1, 0.6), (x + 1.6, sy1 + 0.5, DECK - 0.4), "fender")

    # Boathouse: block, team-tint pitched roof, a wide door onto the slip.
    hx0, hy0, hx1, hy1 = HOUSE
    m.box((hx0, hy0, DECK), (hx1, hy1, DECK + HOUSE_WALL), "olive", top="roof")
    gable(m, hx0, hy0, hx1, hy1, DECK + HOUSE_WALL, DECK + HOUSE_RIDGE, "team")
    m.box((hx1 - 16.0, hy1, DECK), (hx1 - 4.0, hy1 + 0.5, DECK + 9.5), "hazard")
    m.box((hx1 - 15.2, hy1 + 0.5, DECK), (hx1 - 4.8, hy1 + 0.8, DECK + 8.9), "door", part=False)
    for x in (hx0 + 4.0, hx0 + 10.0):
        m.box((x, hy1, DECK + 7.0), (x + 3.5, hy1 + 0.35, DECK + 9.5), "glass")

    # A hull up on the slipway, half out of the water.
    m.new_part()
    m.box((sx0 + 2.0, sy0 + 5.0, DECK - 0.8), (sx0 + 14.0, sy1 - 5.0, DECK + 2.2), "hull")
    m.box((sx0 + 6.0, sy0 + 6.0, DECK + 2.2), (sx0 + 10.0, sy1 - 6.0, DECK + 4.4), "hull", top="team")

    # Gantry crane: four legs on the arms, two girders, a trolley over the slip.
    for x in CRANE_X:
        for y in (sy0 - 3.0, sy1 + 3.0):
            m.box((x - 1.0, y - 1.0, DECK), (x + 1.0, y + 1.0, CRANE_TOP), "gantry")
    for y in (sy0 - 3.0, sy1 + 3.0):
        m.box((CRANE_X[0] - 1.6, y - 1.2, CRANE_TOP), (CRANE_X[1] + 1.6, y + 1.2, CRANE_TOP + 2.4), "gantry")
    for x in CRANE_X:
        m.box((x - 1.2, sy0 - 4.2, CRANE_TOP + 2.4), (x + 1.2, sy1 + 4.2, CRANE_TOP + 4.0), "gantry")
    tx = (CRANE_X[0] + CRANE_X[1]) / 2
    ty = (sy0 + sy1) / 2
    m.box((tx - 3.0, ty - 2.5, CRANE_TOP + 4.0), (tx + 3.0, ty + 2.5, CRANE_TOP + 7.0), "olive_dark")
    m.cyl((tx, ty, CRANE_TOP + 4.0), (tx, ty, DECK + 6.0), 0.25, 0.25, "steel", n=5)
    m.box((tx - 1.4, ty - 1.4, DECK + 4.0), (tx + 1.4, ty + 1.4, DECK + 6.0), "steel")

    # South arm: two fuel tanks on cradles, crates, a lamp mast at the pier end.
    for cx in (9.0, 20.0):
        m.cyl((cx, H - 12.0, DECK), (cx, H - 12.0, DECK + 9.0), 4.2, 4.2, "tank", n=14)
    m.box((28.0, H - 10.0, DECK), (33.5, H - 4.5, DECK + 4.0), "crate")
    m.box((34.5, H - 9.5, DECK), (38.5, H - 5.5, DECK + 3.0), "crate")
    lamp = (W - 5.0, H - 5.0, DECK + 22.0)
    m.cyl((lamp[0], lamp[1], DECK), (lamp[0], lamp[1], lamp[2]), 0.5, 0.35, "pipe", n=6)
    m.cyl((lamp[0], lamp[1], lamp[2]), (lamp[0], lamp[1], lamp[2] + 1.2), 1.0, 1.0, "lamp", n=8)

    # Bollards along both slip edges.
    for x in np.arange(sx0 + 12.0, W - 2.0, 8.0):
        for y in (sy0 - 1.6, sy1 + 1.6):
            m.cyl((x, y, DECK), (x, y, DECK + 1.6), 0.8, 0.7, "steel", n=8)

    meta = {
        "stack": (tx, ty, CRANE_TOP + 9.0),
        "lamp": (lamp[0], lamp[1], lamp[2] + 1.0),
    }
    return m, meta


# ---------------------------------------------------------------- render


def make_canvas() -> ra.Canvas:
    k = ra.ZOOM * SS
    left = -(H + SIDE_MARGIN) * k
    right = (W + SIDE_MARGIN) * k
    top = -TOP_MARGIN * k
    bottom = ((W + H) * 0.5 + SIDE_MARGIN) * k
    w = int(math.ceil((right - left) / SS)) * SS
    h = int(math.ceil((bottom - top) / SS)) * SS
    return ra.Canvas(w, h, -left, -top)


def screen(cv: ra.Canvas, x: float, y: float, z: float) -> tuple[float, float]:
    sx, sy, _ = cv.to_screen(np.array([[x, y, z]]))
    return round(float(sx[0]) / SS, 1), round(float(sy[0]) / SS, 1)


def render(out_dir: Path) -> None:
    cv = make_canvas()
    print("canvas", cv.w // SS, "x", cv.h // SS)

    props, meta = build_mesh(deck=False)
    sh = ra.shadow_mask(props, cv)
    ao = ra.contact_ao(props, cv)
    full, _ = build_mesh()
    fr = ra.rasterize(full, cv)
    ra.ink(fr, SS)
    ra.silhouette(fr, SS)
    ys, xs = np.mgrid[0 : cv.h, 0 : cv.w].astype(np.float64) + 0.5
    gx, gy = cv.to_world_ground(xs, ys)
    near = (gx > -3) & (gx < W + 3) & (gy > -3) & (gy < H + 3)
    shadow = np.clip(sh * 0.42 + ao * 0.12, 0, 0.6) * near
    solid = fr.alpha > 0.5
    up = solid & (fr.normal[..., 2] > 0.7)
    color = fr.color.copy()
    color[up] *= (1 - shadow[up])[:, None]
    alpha = fr.alpha.copy()
    out = ~solid & (shadow > 0.02)
    color[out] = ra.OUTLINE * 0.4
    alpha[out] = shadow[out]
    img = ra.downsample(color, alpha, SS)

    out_dir.mkdir(parents=True, exist_ok=True)
    img.save(out_dir / "dock.png", optimize=True)

    south = screen(cv, W, H, 0.0)
    info = {
        "padWidth": round((W + H) * ra.ZOOM, 1),
        "padSouthX": south[0],
        "padSouthY": south[1],
        "size": list(img.size),
        "stack": screen(cv, *meta["stack"]),
        "lamp": screen(cv, *meta["lamp"]),
    }
    (out_dir / "dock.json").write_text(json.dumps(info, indent=2) + "\n")
    print("wrote", out_dir / "dock.png", info)

    cam = Image.new("RGBA", (96, 96), (0, 0, 0, 0))
    bb = img.getbbox()
    if bb:
        crop = img.crop(bb)
        f = min(92 / crop.width, 92 / crop.height)
        crop = crop.resize((max(1, round(crop.width * f)), max(1, round(crop.height * f))), Image.Resampling.LANCZOS)
        cam.alpha_composite(crop, ((96 - crop.width) // 2, (96 - crop.height) // 2))
    cam.save(out_dir / "dock-cameo.png")
    preview = Path(__file__).parent / "preview"
    preview.mkdir(exist_ok=True)
    img.save(preview / "dock.png")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True, help="buildings asset folder")
    args = ap.parse_args()
    render(Path(args.out))


if __name__ == "__main__":
    main()
