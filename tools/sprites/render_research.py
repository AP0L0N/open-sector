#!/usr/bin/env python3
"""Research Facility building art: one structure image, a cameo, and light spots.

A riveted olive lab block with a lit window band, a white observatory dome on
the roof, an antenna mast, and a low annex carrying two coolant tanks and an
insulator-stack coil. The client pulses the window band and the coil, and
blinks the mast lamp, from the spots written to research.json (source px,
same frame as the image), so the overlay lands on the art.

Look: the inked structure style of render_airfield.py (same mesh, raster,
ink, silhouette, key light, and cast shadow), at the 3× source zoom of the
Armory, Dynamo, and CIWS.

  python tools/sprites/render_research.py --out gridlock/packages/client/src/assets/buildings
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image

import render_airfield as ra

# Footprint, world px: t(2) × t(2) gameplay tiles. Must match catalog.ts.
W = H = 64.0
ra.ZOOM = 3.0  # source px per world px, like the Armory / Dynamo sheets
SS = ra.SS
TOP_MARGIN = 44.0
SIDE_MARGIN = 6.0

# Lab block.
LAB = (7.0, 7.0, 42.0, 46.0)
LAB_TOP = 17.0
WIN_Z = (9.5, 12.5)
# Observatory dome on the lab roof.
DOME_C = (22.0, 24.0)
DOME_R = 10.0
# Annex on the east side.
ANNEX = (42.0, 7.0, 58.0, 29.0)
ANNEX_TOP = 8.0
COIL = (50.5, 12.0)
TANKS = ((53.0, 19.5), (53.0, 25.5))
# Antenna mast on the lab's north corner.
MAST = (10.5, 10.5)
MAST_TOP = 40.0


def rgb(h: str) -> np.ndarray:
    return ra.rgb(h)


_base_tex = ra.tex


def tex(mat: str, P: np.ndarray, n: np.ndarray) -> np.ndarray:
    X, Y, Z = P[:, 0], P[:, 1], P[:, 2]
    nf = ra.vnoise(X / 1.1 + Z * 0.7, Y / 1.1 - Z * 0.5, 7)
    nm = ra.fbm(X / 6 + Z * 0.2, Y / 6 + Z * 0.3, 9, 3)
    along = X if abs(n[1]) >= abs(n[0]) else Y

    def base(h):
        return np.broadcast_to(rgb(h), (len(X), 3)).copy()

    if mat == "slab":
        # Poured pad in 2×2 panels, the Armory's pale concrete.
        c = base("#aeb5a6") * (0.9 + 0.12 * nm[:, None]) * (0.96 + 0.06 * nf[:, None])
        joint = (np.abs(np.mod(X, 16.0) - 8.0) > 7.7) | (np.abs(np.mod(Y, 16.0) - 8.0) > 7.7)
        if abs(n[2]) > 0.7:
            c[joint] *= 0.74
        return c
    if mat == "olive":
        c = base("#4d5a3a") * (0.9 + 0.14 * nm[:, None]) * (0.95 + 0.08 * nf[:, None])
        # Plate seams every few px along the wall, rivet rows under the eave.
        if abs(n[2]) < 0.3:
            c[np.mod(along, 7.0) < 0.3] *= 0.72
            rivet = (np.mod(along, 1.75) < 0.4) & (np.abs(Z - (LAB_TOP - 1.2)) < 0.25)
            c[rivet] *= 1.3
        rust = ra.smooth(0.7, 0.9, ra.fbm(X / 3, Y / 3 + Z, 21))
        return ra.mix(c, base("#6b4a30"), rust * 0.3)
    if mat == "olive_dark":
        return base("#3a4430") * (0.9 + 0.14 * nm[:, None])
    if mat == "roof":
        c = base("#5c6350") * (0.9 + 0.12 * nm[:, None]) * (0.96 + 0.06 * nf[:, None])
        return c
    if mat == "glass":
        # Lit lab windows: warm cyan behind mullions.
        c = base("#6fb8b0") * (0.9 + 0.12 * nf[:, None])
        c[np.mod(along, 3.5) < 0.45] = rgb("#23302a")
        return c
    if mat == "dome":
        c = base("#d2cdb8") * (0.93 + 0.08 * nm[:, None])
        return c * (1 - 0.14 * ra.smooth(LAB_TOP + 4, LAB_TOP, Z))[:, None]
    if mat == "hazard":
        stripe = np.floor((X + Y + Z) / 1.4) % 2 == 0
        c = base("#1d1a14")
        c[stripe] = rgb("#d4a017")
        return c
    if mat == "door":
        c = base("#3f4637") * (0.9 + 0.1 * nf[:, None])
        c[np.mod(Z, 1.6) < 0.25] *= 0.7
        return c
    if mat == "tank":
        c = base("#c9c3ad") * (0.9 + 0.1 * nm[:, None])
        c[np.abs(Z - 5.5) < 0.5] = rgb("#3f6b8a")
        return c
    if mat == "insulator":
        c = base("#e2dccb") * (0.94 + 0.06 * nf[:, None])
        c[np.mod(Z, 1.4) < 0.35] *= 0.72
        return c
    if mat == "copper":
        return base("#b0703a") * (0.88 + 0.2 * nf[:, None])
    if mat == "pipe":
        return base("#6d6e66") * (0.9 + 0.16 * nf[:, None])
    return _base_tex(mat, P, n)


ra.tex = tex


# ---------------------------------------------------------------- meshes


def build_mesh(slab: bool = True) -> ra.Mesh:
    m = ra.Mesh()
    if slab:
        m.box((0.6, 0.6, 0), (W - 0.6, H - 0.6, 1.0), "slab")
    x0, y0, x1, y1 = LAB
    # Lab block, a dark plinth course, and a roof slab with a lip.
    m.box((x0 - 0.5, y0 - 0.5, 1.0), (x1 + 0.5, y1 + 0.5, 2.6), "olive_dark")
    m.box((x0, y0, 2.6), (x1, y1, LAB_TOP), "olive", top="roof")
    m.box((x0 - 0.6, y0 - 0.6, LAB_TOP), (x1 + 0.6, y1 + 0.6, LAB_TOP + 0.9), "olive_dark", top="roof")
    # Window band on the two faces the camera sees (south-east x = x1, south-west y = y1).
    wz0, wz1 = WIN_Z
    m.box((x1, ANNEX[3] + 2.0, wz0), (x1 + 0.35, y1 - 3.0, wz1), "glass")
    m.box((x0 + 4.0, y1, wz0), (x1 - 13.0, y1 + 0.35, wz1), "glass")
    # Blast door with a hazard frame on the south-west face.
    m.box((x1 - 11.0, y1, 2.6), (x1 - 3.0, y1 + 0.5, 9.0), "hazard")
    m.box((x1 - 10.2, y1 + 0.5, 2.6), (x1 - 3.8, y1 + 0.8, 8.3), "door", part=False)
    # Observatory dome: a drum and stacked cones for the cap, with a dark slit.
    cx, cy = DOME_C
    z = LAB_TOP + 0.9
    m.cyl((cx, cy, z), (cx, cy, z + 2.4), DOME_R, DOME_R, "dome", n=20)
    rings = 6
    m.new_part()
    for i in range(rings):
        a0 = (i / rings) * math.pi / 2
        a1 = ((i + 1) / rings) * math.pi / 2
        r0, r1 = DOME_R * math.cos(a0), max(0.05, DOME_R * math.cos(a1))
        h0, h1 = DOME_R * math.sin(a0) * 0.9, DOME_R * math.sin(a1) * 0.9
        m.cyl((cx, cy, z + 2.4 + h0), (cx, cy, z + 2.4 + h1), r0, r1, "dome", n=20, caps=False, part=False)
    # Roof vents.
    m.box((x0 + 25.0, y0 + 26.0, LAB_TOP + 0.9), (x0 + 30.0, y0 + 31.0, LAB_TOP + 3.0), "pipe")
    m.box((x0 + 25.5, y0 + 26.5, LAB_TOP + 3.0), (x0 + 29.5, y0 + 30.5, LAB_TOP + 3.4), "olive_dark", part=False)
    # Antenna mast, crossbars, and the lamp at the top.
    mx, my = MAST
    m.cyl((mx, my, LAB_TOP + 0.9), (mx, my, MAST_TOP), 0.55, 0.35, "pipe", n=8)
    for zz, half in ((MAST_TOP - 12.0, 3.2), (MAST_TOP - 6.0, 2.2)):
        m.box((mx - half, my - 0.25, zz), (mx + half, my + 0.25, zz + 0.5), "pipe")
        m.box((mx - 0.25, my - half, zz + 1.0), (mx + 0.25, my + half, zz + 1.5), "pipe")
    m.cyl((mx, my, MAST_TOP), (mx, my, MAST_TOP + 1.2), 0.8, 0.8, "lamp", n=8)

    # Annex: a low block, roof pipes, the coolant tanks, and the coil.
    ax0, ay0, ax1, ay1 = ANNEX
    m.box((ax0, ay0, 1.0), (ax1, ay1, ANNEX_TOP), "olive", top="roof")
    m.box((ax0 - 0.4, ay0 - 0.4, ANNEX_TOP), (ax1 + 0.4, ay1 + 0.4, ANNEX_TOP + 0.6), "olive_dark", top="roof")
    for tx, ty in TANKS:
        m.cyl((tx, ty, ANNEX_TOP + 0.6), (tx, ty, ANNEX_TOP + 9.0), 2.8, 2.8, "tank", n=14)
        m.cyl((tx, ty, ANNEX_TOP + 9.0), (tx, ty, ANNEX_TOP + 10.2), 2.8, 1.2, "tank", n=14, part=False)
    # Pipe run from the tanks into the lab wall.
    m.cyl((TANKS[0][0] - 2.8, TANKS[0][1], ANNEX_TOP + 4.0), (LAB[2] - 0.2, TANKS[0][1], ANNEX_TOP + 4.0), 0.6, 0.6, "pipe", n=8)
    m.cyl((TANKS[1][0] - 2.8, TANKS[1][1], ANNEX_TOP + 6.5), (LAB[2] - 0.2, TANKS[1][1], ANNEX_TOP + 6.5), 0.6, 0.6, "pipe", n=8)
    kx, ky = COIL
    m.box((kx - 3.0, ky - 3.0, ANNEX_TOP + 0.6), (kx + 3.0, ky + 3.0, ANNEX_TOP + 2.0), "hazard")
    m.cyl((kx, ky, ANNEX_TOP + 2.0), (kx, ky, ANNEX_TOP + 9.0), 1.5, 1.1, "insulator", n=12)
    m.cyl((kx, ky, ANNEX_TOP + 9.0), (kx, ky, ANNEX_TOP + 10.0), 2.6, 2.6, "copper", n=14)
    m.cyl((kx, ky, ANNEX_TOP + 10.0), (kx, ky, ANNEX_TOP + 11.2), 2.6, 0.9, "copper", n=14, part=False)

    # Crates and a cable drum by the door.
    m.box((W - 18.0, H - 9.0, 1.0), (W - 12.0, H - 4.0, 4.4), "crate")
    m.box((W - 11.0, H - 8.5, 1.0), (W - 6.5, H - 4.5, 3.4), "crate")
    m.box((4.0, H - 10.0, 1.0), (9.0, H - 4.5, 4.0), "crate")
    return m


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

    props = build_mesh(slab=False)
    sh = ra.shadow_mask(props, cv)
    ao = ra.contact_ao(props, cv)
    fr = ra.rasterize(build_mesh(), cv)
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
    img.save(out_dir / "research.png", optimize=True)

    south = screen(cv, W, H, 0.0)
    wz = (WIN_Z[0] + WIN_Z[1]) / 2
    x0, y0, x1, y1 = LAB
    windows_se = [screen(cv, x1 + 0.4, y, wz) for y in np.linspace(ANNEX[3] + 4.5, y1 - 5.5, 2)]
    windows_sw = [screen(cv, x, y1 + 0.4, wz) for x in np.linspace(x0 + 7.0, x1 - 17.0, 2)]
    info = {
        "padWidth": round((W + H) * ra.ZOOM, 1),
        "padSouthX": south[0],
        "padSouthY": south[1],
        "size": list(img.size),
        "windows": windows_se + windows_sw,
        "coil": screen(cv, COIL[0], COIL[1], ANNEX_TOP + 11.6),
        "mastLamp": screen(cv, MAST[0], MAST[1], MAST_TOP + 0.6),
    }
    (out_dir / "research.json").write_text(json.dumps(info, indent=2) + "\n")
    print("wrote", out_dir / "research.png", info)

    cam = Image.new("RGBA", (96, 96), (0, 0, 0, 0))
    bb = img.getbbox()
    if bb:
        crop = img.crop(bb)
        f = min(92 / crop.width, 92 / crop.height)
        crop = crop.resize((max(1, round(crop.width * f)), max(1, round(crop.height * f))), Image.Resampling.LANCZOS)
        cam.alpha_composite(crop, ((96 - crop.width) // 2, (96 - crop.height) // 2))
    cam.save(out_dir / "research-cameo.png")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True, help="buildings asset folder")
    args = ap.parse_args()
    render(Path(args.out))


if __name__ == "__main__":
    main()
