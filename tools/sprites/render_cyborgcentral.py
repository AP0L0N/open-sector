#!/usr/bin/env python3
"""Cyborg Central building art: one structure image, a cameo, and light spots.

A gunmetal assembly hall with a hazard-framed bay door and a band of red sensor
windows, a lattice uplink mast on its roof carrying three emitter rings, and an
east annex around a glowing reactor core in copper coils. The client pulses the
window band, the core, and the emitter rings, and blinks the mast lamp, from the
spots written to cyborgcentral.json (source px, same frame as the image).

Look: the inked structure style of render_airfield.py (same mesh, raster, ink,
silhouette, key light, and cast shadow), at the 3x source zoom of the Research
Facility, which shares its t(2) x t(2) footprint.

  python tools/sprites/render_cyborgcentral.py --out gridlock/packages/client/src/assets/buildings
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image

import render_airfield as ra

# Footprint, world px: t(2) x t(2) gameplay tiles. Must match catalog.ts.
W = H = 64.0
ra.ZOOM = 3.0
SS = ra.SS
TOP_MARGIN = 52.0
SIDE_MARGIN = 6.0

# Assembly hall, long along y.
HALL = (6.0, 8.0, 38.0, 56.0)
HALL_TOP = 16.0
WIN_Z = (10.0, 12.8)
# Bay door on the south-west face (y = HALL[3]).
BAY = (12.0, 30.0)
BAY_TOP = 11.5
# Uplink mast on the hall roof.
MAST = (20.0, 22.0)
MAST_BASE = 4.0
MAST_TOP = 50.0
RINGS = (32.0, 38.0, 44.0)
# Reactor annex on the east side.
ANNEX = (38.0, 10.0, 58.0, 36.0)
ANNEX_TOP = 7.0
CORE = (48.0, 23.0)
CORE_TOP = 19.0


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
        c = base("#a9aea4") * (0.9 + 0.12 * nm[:, None]) * (0.96 + 0.06 * nf[:, None])
        joint = (np.abs(np.mod(X, 16.0) - 8.0) > 7.7) | (np.abs(np.mod(Y, 16.0) - 8.0) > 7.7)
        if abs(n[2]) > 0.7:
            c[joint] *= 0.74
        return c
    if mat == "steel":
        c = base("#4c5258") * (0.9 + 0.14 * nm[:, None]) * (0.95 + 0.08 * nf[:, None])
        if abs(n[2]) < 0.3:
            # Ribbed cladding, and a rivet row under the eave.
            c[np.mod(along, 4.0) < 0.35] *= 0.7
            rivet = (np.mod(along, 1.6) < 0.4) & (np.abs(Z - (HALL_TOP - 1.3)) < 0.25)
            c[rivet] *= 1.35
        grime = ra.smooth(0.65, 0.9, ra.fbm(X / 3, Y / 3 + Z, 23))
        return ra.mix(c, base("#3a3330"), grime * 0.35)
    if mat == "steel_dark":
        return base("#2e3236") * (0.9 + 0.14 * nm[:, None])
    if mat == "roof":
        return base("#5a5f63") * (0.9 + 0.12 * nm[:, None]) * (0.96 + 0.06 * nf[:, None])
    if mat == "sensor":
        # Red sensor windows behind dark mullions.
        c = base("#c8463c") * (0.88 + 0.16 * nf[:, None])
        c[np.mod(along, 3.0) < 0.5] = rgb("#1c1416")
        return c
    if mat == "core":
        # The reactor glass: cold cyan, brightest at mid height.
        glow = 1 - np.abs((Z - (ANNEX_TOP + CORE_TOP) / 2) / ((CORE_TOP - ANNEX_TOP) / 2))
        c = base("#58d8f0") * (0.75 + 0.35 * np.clip(glow, 0, 1)[:, None])
        c[np.mod(Z, 2.2) < 0.3] = rgb("#1f4c5a")
        return c
    if mat == "ring":
        c = base("#7fe3ff") * (0.9 + 0.1 * nf[:, None])
        return c
    if mat == "hazard":
        stripe = np.floor((X + Y + Z) / 1.4) % 2 == 0
        c = base("#1d1a14")
        c[stripe] = rgb("#d4a017")
        return c
    if mat == "door":
        c = base("#3b4045") * (0.9 + 0.1 * nf[:, None])
        c[np.mod(Z, 1.5) < 0.25] *= 0.65
        return c
    if mat == "copper":
        return base("#b0703a") * (0.88 + 0.2 * nf[:, None])
    if mat == "pipe":
        return base("#6a6c68") * (0.9 + 0.16 * nf[:, None])
    return _base_tex(mat, P, n)


ra.tex = tex


# ---------------------------------------------------------------- meshes


def build_mesh(slab: bool = True) -> ra.Mesh:
    m = ra.Mesh()
    if slab:
        m.box((0.6, 0.6, 0), (W - 0.6, H - 0.6, 1.0), "slab")
    x0, y0, x1, y1 = HALL
    # Hall: plinth, ribbed walls, and a roof slab with a lip.
    m.box((x0 - 0.5, y0 - 0.5, 1.0), (x1 + 0.5, y1 + 0.5, 2.4), "steel_dark")
    m.box((x0, y0, 2.4), (x1, y1, HALL_TOP), "steel", top="roof")
    m.box((x0 - 0.6, y0 - 0.6, HALL_TOP), (x1 + 0.6, y1 + 0.6, HALL_TOP + 0.9), "steel_dark", top="roof")
    # Sensor window band on the south-east face (x = x1), south of the annex.
    wz0, wz1 = WIN_Z
    m.box((x1, ANNEX[3] + 2.0, wz0), (x1 + 0.35, y1 - 3.0, wz1), "sensor")
    # And on the south-west face beside the bay.
    m.box((BAY[1] + 2.0, y1, wz0), (x1 - 2.0, y1 + 0.35, wz1), "sensor")
    # Bay door in a hazard frame.
    bx0, bx1 = BAY
    m.box((bx0 - 1.0, y1, 2.4), (bx1 + 1.0, y1 + 0.5, BAY_TOP + 1.0), "hazard")
    m.box((bx0, y1 + 0.5, 2.4), (bx1, y1 + 0.8, BAY_TOP), "door", part=False)
    # Roof vents along the north end.
    for vx in (x0 + 5.0, x0 + 12.0):
        m.box((vx, y0 + 3.0, HALL_TOP + 0.9), (vx + 4.0, y0 + 7.0, HALL_TOP + 3.0), "pipe")

    # Uplink mast: four legs leaning in to a spine, cross braces, emitter rings, lamp.
    mx, my = MAST
    zb = HALL_TOP + 0.9
    m.box((mx - MAST_BASE - 1.0, my - MAST_BASE - 1.0, zb), (mx + MAST_BASE + 1.0, my + MAST_BASE + 1.0, zb + 1.2), "steel_dark")
    for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
        m.cyl((mx + sx * MAST_BASE, my + sy * MAST_BASE, zb + 1.2), (mx + sx * 0.7, my + sy * 0.7, MAST_TOP - 2.0), 0.45, 0.3, "pipe", n=6)
    for zz in (zb + 9.0, zb + 18.0):
        half = MAST_BASE * (1 - (zz - zb) / (MAST_TOP - zb)) + 0.6
        m.box((mx - half, my - 0.2, zz), (mx + half, my + 0.2, zz + 0.45), "pipe")
        m.box((mx - 0.2, my - half, zz + 0.6), (mx + 0.2, my + half, zz + 1.05), "pipe")
    m.cyl((mx, my, zb + 1.2), (mx, my, MAST_TOP), 0.5, 0.35, "pipe", n=8)
    for rz in RINGS:
        m.cyl((mx, my, rz), (mx, my, rz + 0.9), 3.0, 3.0, "ring", n=16)
    m.cyl((mx, my, MAST_TOP), (mx, my, MAST_TOP + 1.3), 0.85, 0.85, "lamp", n=8)

    # Reactor annex: a low block, the core in its copper coils, pipes into the hall.
    ax0, ay0, ax1, ay1 = ANNEX
    m.box((ax0, ay0, 1.0), (ax1, ay1, ANNEX_TOP), "steel", top="roof")
    m.box((ax0 - 0.4, ay0 - 0.4, ANNEX_TOP), (ax1 + 0.4, ay1 + 0.4, ANNEX_TOP + 0.6), "steel_dark", top="roof")
    kx, ky = CORE
    m.box((kx - 5.0, ky - 5.0, ANNEX_TOP + 0.6), (kx + 5.0, ky + 5.0, ANNEX_TOP + 1.8), "hazard")
    m.cyl((kx, ky, ANNEX_TOP + 1.8), (kx, ky, CORE_TOP), 3.0, 3.0, "core", n=16)
    for cz in (ANNEX_TOP + 3.5, ANNEX_TOP + 7.0, ANNEX_TOP + 10.5):
        m.cyl((kx, ky, cz), (kx, ky, cz + 1.0), 3.6, 3.6, "copper", n=16)
    m.cyl((kx, ky, CORE_TOP), (kx, ky, CORE_TOP + 1.4), 3.6, 1.2, "copper", n=16)
    for py, pz in ((ky - 2.5, ANNEX_TOP + 4.5), (ky + 2.5, ANNEX_TOP + 8.0)):
        m.cyl((kx - 3.6, py, pz), (HALL[2] - 0.2, py, pz), 0.6, 0.6, "pipe", n=8)

    # Spare frames crated by the bay.
    m.box((W - 18.0, H - 9.0, 1.0), (W - 12.0, H - 4.0, 4.4), "crate")
    m.box((W - 11.0, H - 8.5, 1.0), (W - 6.5, H - 4.5, 3.4), "crate")
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
    img.save(out_dir / "cyborgcentral.png", optimize=True)

    south = screen(cv, W, H, 0.0)
    wz = (WIN_Z[0] + WIN_Z[1]) / 2
    x0, y0, x1, y1 = HALL
    windows_se = [screen(cv, x1 + 0.4, y, wz) for y in np.linspace(ANNEX[3] + 5.0, y1 - 6.0, 3)]
    windows_sw = [screen(cv, x, y1 + 0.4, wz) for x in np.linspace(BAY[1] + 3.5, x1 - 3.5, 2)]
    info = {
        "padWidth": round((W + H) * ra.ZOOM, 1),
        "padSouthX": south[0],
        "padSouthY": south[1],
        "size": list(img.size),
        "windows": windows_se + windows_sw,
        "core": screen(cv, CORE[0] + 3.0, CORE[1] + 3.0, (ANNEX_TOP + CORE_TOP) / 2),
        "rings": [screen(cv, MAST[0], MAST[1], rz + 0.45) for rz in RINGS],
        "mastLamp": screen(cv, MAST[0], MAST[1], MAST_TOP + 0.6),
        "stack": screen(cv, MAST[0], MAST[1], MAST_TOP + 2.0),
    }
    (out_dir / "cyborgcentral.json").write_text(json.dumps(info, indent=2) + "\n")
    print("wrote", out_dir / "cyborgcentral.png", info)

    cam = Image.new("RGBA", (96, 96), (0, 0, 0, 0))
    bb = img.getbbox()
    if bb:
        crop = img.crop(bb)
        f = min(92 / crop.width, 92 / crop.height)
        crop = crop.resize((max(1, round(crop.width * f)), max(1, round(crop.height * f))), Image.Resampling.LANCZOS)
        cam.alpha_composite(crop, ((96 - crop.width) // 2, (96 - crop.height) // 2))
    cam.save(out_dir / "cyborgcentral-cameo.png")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True, help="buildings asset folder")
    args = ap.parse_args()
    render(Path(args.out))


if __name__ == "__main__":
    main()
