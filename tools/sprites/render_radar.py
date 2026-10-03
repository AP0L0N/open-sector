#!/usr/bin/env python3
"""Radar Station building art: one structure image, a cameo, and light spots.

A riveted olive ops hut with a lit window band and a blast door, a lattice
steel mast at the back of the pad carrying a tilted white dish on a yoke, a
red lamp on the mast head, a low generator shed with an exhaust stack, and
a cable trench from the shed to the mast. The client pulses the window band
and blinks the mast lamp from the spots written to radar.json (source px,
same frame as the image), so the overlay lands on the art.

Look: the Research Facility's materials (render_research.py) on the inked
structure pipeline of render_airfield.py (mesh, raster, ink, silhouette, key
light, cast shadow), at the same 3x source zoom, so its t(2) footprint is
the same 384 px pad.

  python tools/sprites/render_radar.py --out gridlock/packages/client/src/assets/buildings
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

# Ops hut: front-right of the pad, so the mast behind it stays in view.
HUT = (28.0, 22.0, 58.0, 54.0)
HUT_TOP = 12.0
WIN_Z = (6.5, 9.0)
# Lattice mast at the back-left corner.
MAST = (15.0, 13.0)
MAST_FOOT = 3.6
MAST_HEAD = 2.1
MAST_TOP = 33.0
# Dish on its yoke above the mast head.
DISH_R = 8.0
DISH_DEPTH = 3.2
DISH_ELEV_DEG = 38.0
# Generator shed, front-left.
SHED = (7.0, 36.0, 22.0, 50.0)
SHED_TOP = 7.0

_rr_tex = rr.tex


def rgb(h: str) -> np.ndarray:
    return ra.rgb(h)


def tex(mat: str, P: np.ndarray, n: np.ndarray) -> np.ndarray:
    X, Y, Z = P[:, 0], P[:, 1], P[:, 2]
    nf = ra.vnoise(X / 1.1 + Z * 0.7, Y / 1.1 - Z * 0.5, 7)
    nm = ra.fbm(X / 6 + Z * 0.2, Y / 6 + Z * 0.3, 9, 3)

    def base(h):
        return np.broadcast_to(rgb(h), (len(X), 3)).copy()

    if mat == "dish":
        # Pressed aluminium panels: pale, with radial seams darkening toward the rim.
        c = base("#d9d6c6") * (0.94 + 0.08 * nm[:, None]) * (0.97 + 0.05 * nf[:, None])
        return c
    if mat == "dish_back":
        return base("#9ea297") * (0.92 + 0.1 * nm[:, None])
    if mat == "lattice":
        return base("#4b4e46") * (0.88 + 0.2 * nf[:, None])
    if mat == "red":
        return base("#b8382c") * (0.9 + 0.12 * nf[:, None])
    if mat == "trench":
        c = base("#3a3528") * (0.9 + 0.12 * nm[:, None])
        return c
    if mat == "glass":
        # Scope-green behind the mullions, where the lab's band was cyan.
        c = base("#78c890") * (0.9 + 0.12 * nf[:, None])
        along = X if abs(n[1]) >= abs(n[0]) else Y
        c[np.mod(along, 3.5) < 0.45] = rgb("#23302a")
        return c
    return _rr_tex(mat, P, n)


ra.tex = tex


# ---------------------------------------------------------------- meshes


def lattice_mast(m: ra.Mesh, cx: float, cy: float, z0: float, z1: float, foot: float, head: float) -> None:
    """Four tapering legs with horizontal ties every few units and a head plate."""
    def half(z: float) -> float:
        t = (z - z0) / (z1 - z0)
        return foot + (head - foot) * t

    for sx in (-1, 1):
        for sy in (-1, 1):
            m.cyl((cx + sx * foot, cy + sy * foot, z0), (cx + sx * head, cy + sy * head, z1), 0.45, 0.32, "lattice", n=6)
    z = z0 + 4.0
    while z < z1 - 1.0:
        h = half(z)
        m.box((cx - h - 0.2, cy - h - 0.2, z), (cx + h + 0.2, cy - h + 0.2, z + 0.4), "lattice")
        m.box((cx - h - 0.2, cy + h - 0.2, z), (cx + h + 0.2, cy + h + 0.2, z + 0.4), "lattice")
        m.box((cx - h - 0.2, cy - h - 0.2, z), (cx - h + 0.2, cy + h + 0.2, z + 0.4), "lattice")
        m.box((cx + h - 0.2, cy - h - 0.2, z), (cx + h + 0.2, cy + h + 0.2, z + 0.4), "lattice")
        # One diagonal per bay on the two faces the camera sees.
        zz = min(z1 - 1.0, z + 6.0)
        hh = half(zz)
        m.cyl((cx + h, cy - h, z), (cx + hh, cy + hh, zz), 0.22, 0.22, "lattice", n=5)
        m.cyl((cx - h, cy + h, z), (cx + hh, cy + hh, zz), 0.22, 0.22, "lattice", n=5)
        z += 6.0
    hz = half(z1)
    m.box((cx - hz - 0.6, cy - hz - 0.6, z1), (cx + hz + 0.6, cy + hz + 0.6, z1 + 0.8), "steel")


def dish(m: ra.Mesh, cx: float, cy: float, z: float) -> tuple[float, float, float]:
    """Pedestal, yoke, and the tilted dish. Returns the dish centre."""
    m.cyl((cx, cy, z), (cx, cy, z + 3.4), 1.5, 1.2, "steel", n=10)
    m.box((cx - 2.2, cy - 0.7, z + 3.4), (cx + 2.2, cy + 0.7, z + 5.4), "steel")
    el = math.radians(DISH_ELEV_DEG)
    d = np.array([math.cos(el) / math.sqrt(2), math.cos(el) / math.sqrt(2), math.sin(el)])
    centre = np.array([cx, cy, z + 5.6])
    back = centre - d * DISH_DEPTH
    # Bowl: apex at the back, rim at the centre plane, open toward the camera.
    m.new_part()
    m.cyl(back, centre, 0.8, DISH_R, "dish", n=24, caps=False, part=False)
    # Back shell, a touch behind the bowl so the rim reads as a lip.
    m.cyl(back - d * 0.5, centre - d * 0.3, 0.8, DISH_R + 0.3, "dish_back", n=24, caps=False)
    m.cyl(centre - d * 0.3, centre + d * 0.25, DISH_R + 0.3, DISH_R + 0.3, "steel", n=24, caps=False, part=False)
    # Feed horn on a boom from the apex.
    m.cyl(back, centre + d * 6.0, 0.35, 0.35, "steel", n=6)
    m.cyl(centre + d * 6.0, centre + d * 7.4, 0.9, 0.5, "red", n=8)
    # Two struts from the rim to the horn.
    u = np.cross(d, np.array([0.0, 0.0, 1.0]))
    u /= np.linalg.norm(u)
    for s in (-1, 1):
        m.cyl(centre + u * s * DISH_R * 0.8, centre + d * 6.0, 0.2, 0.2, "steel", n=5)
    return float(centre[0]), float(centre[1]), float(centre[2])


def build_mesh(slab: bool = True) -> tuple[ra.Mesh, dict]:
    m = ra.Mesh()
    if slab:
        m.box((0.6, 0.6, 0), (W - 0.6, H - 0.6, 1.0), "slab")
    x0, y0, x1, y1 = HUT
    # Ops hut: plinth course, block, roof slab with a lip.
    m.box((x0 - 0.5, y0 - 0.5, 1.0), (x1 + 0.5, y1 + 0.5, 2.4), "olive_dark")
    m.box((x0, y0, 2.4), (x1, y1, HUT_TOP), "olive", top="roof")
    m.box((x0 - 0.6, y0 - 0.6, HUT_TOP), (x1 + 0.6, y1 + 0.6, HUT_TOP + 0.9), "olive_dark", top="roof")
    # Window band on the two faces the camera sees (south-east x = x1, south-west y = y1).
    wz0, wz1 = WIN_Z
    m.box((x1, y0 + 3.0, wz0), (x1 + 0.35, y1 - 3.0, wz1), "glass")
    m.box((x0 + 3.0, y1, wz0), (x1 - 12.0, y1 + 0.35, wz1), "glass")
    # Blast door with a hazard frame on the south-west face.
    m.box((x1 - 10.5, y1, 2.4), (x1 - 3.0, y1 + 0.5, 8.4), "hazard")
    m.box((x1 - 9.7, y1 + 0.5, 2.4), (x1 - 3.8, y1 + 0.8, 7.8), "door", part=False)
    # Roof gear: a cooler box, a whip antenna, and a cable duct to the mast.
    m.box((x0 + 4.0, y0 + 4.0, HUT_TOP + 0.9), (x0 + 10.0, y0 + 10.0, HUT_TOP + 3.2), "pipe")
    m.box((x0 + 4.4, y0 + 4.4, HUT_TOP + 3.2), (x0 + 9.6, y0 + 9.6, HUT_TOP + 3.6), "olive_dark", part=False)
    m.cyl((x1 - 4.0, y0 + 4.0, HUT_TOP + 0.9), (x1 - 4.0, y0 + 4.0, HUT_TOP + 14.0), 0.35, 0.2, "pipe", n=6)
    m.cyl((x1 - 4.0, y0 + 4.0, HUT_TOP + 14.0), (x1 - 4.0, y0 + 4.0, HUT_TOP + 15.0), 0.6, 0.6, "lamp", n=8)
    m.cyl((x0 + 2.0, y0 + 12.0, HUT_TOP + 0.9), (x0 + 2.0, y0 + 12.0, HUT_TOP + 5.0), 1.0, 1.0, "pipe", n=8)

    # Lattice mast and the dish.
    mx, my = MAST
    m.box((mx - MAST_FOOT - 1.6, my - MAST_FOOT - 1.6, 1.0), (mx + MAST_FOOT + 1.6, my + MAST_FOOT + 1.6, 2.2), "concrete")
    lattice_mast(m, mx, my, 2.2, MAST_TOP, MAST_FOOT, MAST_HEAD)
    dc = dish(m, mx, my, MAST_TOP + 0.8)
    # Lamp on the mast head's near corner.
    lamp = (mx + MAST_HEAD + 0.6, my + MAST_HEAD + 0.6, MAST_TOP + 0.8)
    m.cyl((lamp[0], lamp[1], lamp[2]), (lamp[0], lamp[1], lamp[2] + 2.4), 0.3, 0.3, "pipe", n=6)
    m.cyl((lamp[0], lamp[1], lamp[2] + 2.4), (lamp[0], lamp[1], lamp[2] + 3.4), 0.8, 0.8, "lamp", n=8)

    # Generator shed with an exhaust stack and a fuel drum.
    sx0, sy0, sx1, sy1 = SHED
    m.box((sx0, sy0, 1.0), (sx1, sy1, SHED_TOP), "olive_dark", top="roof")
    m.box((sx0 - 0.4, sy0 - 0.4, SHED_TOP), (sx1 + 0.4, sy1 + 0.4, SHED_TOP + 0.6), "olive_dark", top="roof")
    m.cyl((sx0 + 3.0, sy0 + 3.0, SHED_TOP + 0.6), (sx0 + 3.0, sy0 + 3.0, SHED_TOP + 6.0), 0.9, 0.9, "pipe", n=8)
    m.box((sx1 - 6.0, sy1, 1.0), (sx1 - 1.0, sy1 + 0.5, 5.0), "door")
    m.cyl((sx1 + 3.2, sy1 - 3.0, 1.0), (sx1 + 3.2, sy1 - 3.0, 5.2), 1.9, 1.9, "tank", n=12)
    # Cable trench: shed to mast foot, mast foot to hut.
    m.box((sx0 + 6.0, my + MAST_FOOT + 1.6, 1.0), (sx0 + 7.4, sy0, 1.3), "trench")
    m.box((mx + MAST_FOOT + 1.6, my - 0.7, 1.0), (x0, my + 0.7, 1.3), "trench")

    # Crates and a cable drum by the door.
    m.box((W - 20.0, H - 8.5, 1.0), (W - 14.5, H - 4.0, 4.2), "crate")
    m.box((W - 13.5, H - 8.0, 1.0), (W - 9.5, H - 4.5, 3.2), "crate")
    m.cyl((5.0, H - 7.0, 1.0), (5.0, H - 7.0, 4.0), 2.4, 2.4, "wood", n=12)

    meta = {
        "lamp": (lamp[0], lamp[1], lamp[2] + 3.6),
        "whip": (x1 - 4.0, y0 + 4.0, HUT_TOP + 15.2),
        "dish": dc,
        "stack": ((x0 + x1) / 2, (y0 + y1) / 2, HUT_TOP + 1.0),
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

    props, meta = build_mesh(slab=False)
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
    img.save(out_dir / "radar.png", optimize=True)

    south = screen(cv, W, H, 0.0)
    wz = (WIN_Z[0] + WIN_Z[1]) / 2
    x0, y0, x1, y1 = HUT
    windows_se = [screen(cv, x1 + 0.4, y, wz) for y in np.linspace(y0 + 7.0, y1 - 7.0, 3)]
    windows_sw = [screen(cv, x, y1 + 0.4, wz) for x in np.linspace(x0 + 6.0, x1 - 15.0, 2)]
    info = {
        "padWidth": round((W + H) * ra.ZOOM, 1),
        "padSouthX": south[0],
        "padSouthY": south[1],
        "size": list(img.size),
        "stack": screen(cv, *meta["stack"]),
        "windows": windows_se + windows_sw,
        "mastLamp": screen(cv, *meta["lamp"]),
        "whipLamp": screen(cv, *meta["whip"]),
        "dish": screen(cv, *meta["dish"]),
    }
    (out_dir / "radar.json").write_text(json.dumps(info, indent=2) + "\n")
    print("wrote", out_dir / "radar.png", info)

    cam = Image.new("RGBA", (96, 96), (0, 0, 0, 0))
    bb = img.getbbox()
    if bb:
        crop = img.crop(bb)
        f = min(92 / crop.width, 92 / crop.height)
        crop = crop.resize((max(1, round(crop.width * f)), max(1, round(crop.height * f))), Image.Resampling.LANCZOS)
        cam.alpha_composite(crop, ((96 - crop.width) // 2, (96 - crop.height) // 2))
    cam.save(out_dir / "radar-cameo.png")
    preview = Path(__file__).parent / "preview"
    preview.mkdir(exist_ok=True)
    img.save(preview / "radar.png")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True, help="buildings asset folder")
    args = ap.parse_args()
    render(Path(args.out))


if __name__ == "__main__":
    main()
