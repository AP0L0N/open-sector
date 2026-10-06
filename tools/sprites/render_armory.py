#!/usr/bin/env python3
"""Machine Shop building art: one structure image, a cameo, and light spots.

A tank assembly plant on a t(3) × t(3) pad. A long riveted olive assembly
hall under a north-light sawtooth roof, a rolled-up door on the south-west
face with a hull on the line halfway out of it, a stack rising through the
roof, and a yellow gantry crane in the east yard lowering a turret onto a
second hull on stands. Track links, drums, crates, and the shop's red tool
cabinets dress the yard. The client pulses the window bands and the door
glow, blinks the stack lamp, and throws welding sparks from the door, from
the spots written to armory.json (source px, same frame as the image).

Look: the inked structure style of render_airfield.py (same mesh, raster,
ink, silhouette, key light, and cast shadow), at the 3× source zoom of the
Research Facility and the Radar, on the Research Facility's olive plate and
poured slab.

  python tools/sprites/render_armory.py --out gridlock/packages/client/src/assets/buildings
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image

import render_airfield as ra

# Footprint, world px: t(3) × t(3) gameplay tiles. Must match catalog.ts.
W = H = 96.0
ra.ZOOM = 3.0  # source px per world px, like the Research / Radar sheets
SS = ra.SS
TOP_MARGIN = 42.0
SIDE_MARGIN = 6.0

# Assembly hall.
HALL = (10.0, 8.0, 62.0, 56.0)
EAVE = 22.0
WALL = 1.4
TEETH = 4
RISE = 8.0
WIN_Z = (11.5, 16.5)
# Rolling door on the south-west face (y = y1), hull on the line through it.
DOOR_X = (20.0, 40.0)
DOOR_TOP = 17.0
LINE_HULL = (22.0, 47.0, 38.0, 66.0)
# Stack through the roof at the hall's north end.
STACK = (20.0, 17.0)
STACK_TOP = 52.0
# Gantry crane in the south yard, east of the door: girder along x at y = GANTRY_Y.
GANTRY_Y = 70.0
GANTRY_X = (54.0, 90.0)
GANTRY_TOP = 19.0
TROLLEY_X = 72.0
YARD_HULL = (63.0, 65.0, 81.0, 75.0)
YARD_HULL_Z = 3.2


def rgb(h: str) -> np.ndarray:
    return ra.rgb(h)


_base_tex = ra.tex


def tex(mat: str, P: np.ndarray, n: np.ndarray) -> np.ndarray:
    X, Y, Z = P[:, 0], P[:, 1], P[:, 2]
    nf = ra.vnoise(X / 1.1 + Z * 0.7, Y / 1.1 - Z * 0.5, 7)
    nm = ra.fbm(X / 6 + Z * 0.2, Y / 6 + Z * 0.3, 9, 3)
    wall = abs(n[2]) < 0.3
    along = X if abs(n[1]) >= abs(n[0]) else Y

    def base(h):
        return np.broadcast_to(rgb(h), (len(X), 3)).copy()

    if mat == "slab":
        # Poured pad in 2×2 panels, the Research Facility's pale concrete, with oil in the yard.
        c = base("#aeb5a6") * (0.9 + 0.12 * nm[:, None]) * (0.96 + 0.06 * nf[:, None])
        joint = (np.abs(np.mod(X, 16.0) - 8.0) > 7.7) | (np.abs(np.mod(Y, 16.0) - 8.0) > 7.7)
        if abs(n[2]) > 0.7:
            c[joint] *= 0.74
            stain = ra.smooth(0.7, 0.88, ra.fbm(X / 8, Y / 8, 31))
            c = ra.mix(c, base("#5a5a50"), stain * 0.4)
        return c
    if mat == "olive":
        c = base("#4d5a3a") * (0.9 + 0.14 * nm[:, None]) * (0.95 + 0.08 * nf[:, None])
        if wall:
            # Plate seams along the wall, a rivet row under the eave and one at the window sill.
            c[np.mod(along, 7.0) < 0.3] *= 0.72
            rivet = (np.mod(along, 1.75) < 0.4) & ((np.abs(Z - (EAVE - 1.2)) < 0.25) | (np.abs(Z - (WIN_Z[0] - 1.0)) < 0.25))
            c[rivet] *= 1.3
        rust = ra.smooth(0.7, 0.9, ra.fbm(X / 3, Y / 3 + Z, 21))
        return ra.mix(c, base("#6b4a30"), rust * 0.3)
    if mat == "olive_dark":
        return base("#3a4430") * (0.9 + 0.14 * nm[:, None])
    if mat == "roof":
        return base("#5c6350") * (0.9 + 0.12 * nm[:, None]) * (0.96 + 0.06 * nf[:, None])
    if mat == "slope":
        # Tarred sheet on the sawtooth slopes, seamed along the fall.
        c = base("#4f564a") * (0.9 + 0.12 * nm[:, None])
        c[np.mod(Y, 4.0) < 0.3] *= 0.78
        return c
    if mat == "glazing":
        # North-light panes: cool glass behind a mullion grid.
        c = base("#6f8c8a") * (0.9 + 0.14 * nf[:, None])
        grid = (np.mod(Y, 3.0) < 0.35) | (np.mod(Z, 2.6) < 0.35)
        c[grid] = rgb("#2a3330")
        return c
    if mat == "glass":
        # Lit shop windows: warm amber behind mullions.
        c = base("#f0bc66") * (0.9 + 0.12 * nf[:, None])
        c[np.mod(along, 3.2) < 0.45] = rgb("#2e2a20")
        return c
    if mat == "floor":
        return base("#2b2a24") * (0.9 + 0.2 * nm[:, None])
    if mat == "glow":
        # Light spilling across the shop floor from the welding bays.
        return base("#f2b86a") * (0.92 + 0.1 * nf[:, None])
    if mat == "interior":
        return base("#1a1813") * (0.8 + 0.4 * nm[:, None])
    if mat == "hazard":
        stripe = np.floor((X + Y + Z) / 1.4) % 2 == 0
        c = base("#1d1a14")
        c[stripe] = rgb("#d4a017")
        return c
    if mat == "door":
        c = base("#3f4637") * (0.9 + 0.1 * nf[:, None])
        c[np.mod(Z, 1.6) < 0.25] *= 0.7
        return c
    if mat == "crane":
        # Safety-yellow girder, a dark lattice line along the web.
        c = base("#c9a227") * (0.9 + 0.14 * nf[:, None])
        if wall:
            c[np.abs(Z - (GANTRY_TOP - 1.5)) < 0.25] *= 0.6
        return c
    if mat == "hull":
        c = base("#66744c") * (0.9 + 0.14 * nm[:, None]) * (0.95 + 0.08 * nf[:, None])
        if wall:
            c[np.mod(along, 5.0) < 0.3] *= 0.75
        return c
    if mat == "track":
        c = base("#45423a") * (0.9 + 0.2 * nf[:, None])
        c[np.mod(along, 1.1) < 0.3] *= 0.6
        return c
    if mat == "hull_top":
        c = base("#7a8858") * (0.92 + 0.12 * nm[:, None])
        c[np.mod(X, 5.0) < 0.3] *= 0.8
        return c
    if mat == "stack":
        c = base("#4a4c46") * (0.9 + 0.14 * nm[:, None])
        c[np.mod(Z, 6.0) < 0.5] *= 0.72
        return c
    if mat == "soot":
        return base("#1f1d1a") * (0.9 + 0.2 * nf[:, None])
    if mat == "cabinet":
        # The shop's red tool cabinets: a drawer line every so often.
        c = base("#a83a2c") * (0.9 + 0.12 * nf[:, None])
        if wall:
            c[np.mod(Z, 1.5) < 0.3] *= 0.7
        return c
    if mat == "pipe":
        return base("#6d6e66") * (0.9 + 0.16 * nf[:, None])
    if mat == "wheel":
        return base("#3b3a35") * (0.9 + 0.2 * nf[:, None])
    return _base_tex(mat, P, n)


ra.tex = tex


# ---------------------------------------------------------------- pieces


def hull(m: ra.Mesh, x0: float, y0: float, x1: float, y1: float, z: float, turret: bool, along_y: bool) -> None:
    """A tank hull on tracks, nose toward +y (along_y) or +x, optionally with its turret seated."""
    tw = 2.2
    if along_y:
        m.box((x0, y0, z), (x0 + tw, y1, z + 3.6), "track")
        m.box((x1 - tw, y0, z), (x1, y1, z + 3.6), "track")
        m.box((x0 + tw, y0 + 0.6, z + 1.2), (x1 - tw, y1 - 0.6, z + 5.2), "hull", top="hull_top")
        m.box((x0 + 0.4, y0 + 2.0, z + 3.6), (x1 - 0.4, y1 - 2.0, z + 4.4), "hull", top="hull_top", part=False)
    else:
        m.box((x0, y0, z), (x1, y0 + tw, z + 3.6), "track")
        m.box((x0, y1 - tw, z), (x1, y1, z + 3.6), "track")
        m.box((x0 + 0.6, y0 + tw, z + 1.2), (x1 - 0.6, y1 - tw, z + 5.2), "hull", top="hull_top")
        m.box((x0 + 2.0, y0 + 0.4, z + 3.6), (x1 - 2.0, y1 - 0.4, z + 4.4), "hull", top="hull_top", part=False)
    if turret:
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2 - (2.0 if along_y else 0.0)
        m.cyl((cx, cy, z + 4.6), (cx, cy, z + 8.2), 3.6, 3.2, "hull", n=14)
        if along_y:
            m.cyl((cx, cy + 3.0, z + 7.0), (cx, cy + 14.0, z + 7.0), 0.55, 0.45, "pipe", n=8)
        else:
            m.cyl((cx + 3.0, cy, z + 7.0), (cx + 14.0, cy, z + 7.0), 0.55, 0.45, "pipe", n=8)


def track_links(m: ra.Mesh, x: float, y: float, n: int) -> None:
    for i in range(n):
        m.box((x, y + i * 1.4, 1.0), (x + 7.0, y + i * 1.4 + 1.1, 2.2 + (i % 2) * 0.3), "track")


def drums(m: ra.Mesh, x: float, y: float, cols: int, rows: int) -> None:
    for i in range(cols):
        for j in range(rows):
            cx, cy = x + i * 2.6, y + j * 2.6
            m.cyl((cx, cy, 1.0), (cx, cy, 4.4), 1.15, 1.15, "drum_r" if (i + j) % 3 else "drum_g", n=10)


def gantry(m: ra.Mesh) -> None:
    gy = GANTRY_Y
    x0, x1 = GANTRY_X
    top = GANTRY_TOP
    # Two A-frame legs with hazard feet, a girder along x, a trolley, and the hook load.
    for x in (x0, x1):
        for dy in (-5.0, 5.0):
            m.cyl((x, gy + dy, 1.0), (x, gy + dy * 0.25, top - 2.5), 0.8, 0.6, "steel", n=8)
            m.box((x - 1.3, gy + dy - 1.3, 1.0), (x + 1.3, gy + dy + 1.3, 2.0), "hazard")
        m.box((x - 0.4, gy - 3.6, top - 9.0), (x + 0.4, gy + 3.6, top - 8.4), "steel")
        m.box((x - 1.0, gy - 1.6, top - 2.5), (x + 1.0, gy + 1.6, top), "crane")
    m.box((x0 - 1.5, gy - 1.8, top - 2.5), (x1 + 1.5, gy + 1.8, top + 0.5), "crane")
    m.box((x0 - 1.5, gy - 2.4, top + 0.5), (x1 + 1.5, gy + 2.4, top + 1.1), "crane", part=False)
    # Trolley on the girder, cable down to a turret held over the hull.
    tx = TROLLEY_X
    m.box((tx - 2.5, gy - 2.2, top + 1.1), (tx + 2.5, gy + 2.2, top + 2.6), "steel")
    hook_z = YARD_HULL_Z + 8.6
    m.cyl((tx, gy, top + 1.1), (tx, gy, hook_z + 3.4), 0.3, 0.3, "metal", n=6)
    m.cyl((tx, gy, hook_z), (tx, gy, hook_z + 3.4), 3.8, 3.4, "hull", n=14, cap_mat="hull_top")
    m.cyl((tx - 0.6, gy - 0.4, hook_z + 3.4), (tx - 0.6, gy - 0.4, hook_z + 4.1), 1.3, 1.3, "olive_dark", n=10, part=False)
    m.cyl((tx + 3.2, gy, hook_z + 2.2), (tx + 15.0, gy, hook_z + 2.2), 0.6, 0.5, "pipe", n=8)


def build_mesh(slab: bool = True) -> ra.Mesh:
    m = ra.Mesh()
    if slab:
        m.box((0.6, 0.6, 0), (W - 0.6, H - 0.6, 1.0), "slab")
    x0, y0, x1, y1 = HALL
    dx0, dx1 = DOOR_X
    # Hall: a dark plinth with the shop floor on top, four plate walls (the south-west one
    # split round the door, with a lintel over it), and a roof slab with a lip.
    m.box((x0 - 0.5, y0 - 0.5, 1.0), (x1 + 0.5, y1 + 0.5, 2.6), "olive_dark", top="floor")
    m.box((x0 + WALL, 28.0, 2.6), (dx1 + 2.0, y1 - WALL, 2.7), "glow", part=False)
    m.box((x0, y0, 2.6), (x1, y0 + WALL, EAVE), "olive")
    m.box((x0, y0, 2.6), (x0 + WALL, y1, EAVE), "olive")
    m.box((x1 - WALL, y0, 2.6), (x1, y1, EAVE), "olive")
    m.box((x0, y1 - WALL, 2.6), (dx0, y1, EAVE), "olive")
    m.box((dx1, y1 - WALL, 2.6), (x1, y1, EAVE), "olive")
    m.box((dx0, y1 - WALL, DOOR_TOP), (dx1, y1, EAVE), "olive")
    # Door frame in hazard paint and the rolled-up door drum under the lintel.
    m.box((dx0 - 1.2, y1, 2.6), (dx0, y1 + 0.9, DOOR_TOP + 1.6), "hazard")
    m.box((dx1, y1, 2.6), (dx1 + 1.2, y1 + 0.9, DOOR_TOP + 1.6), "hazard")
    m.box((dx0 - 1.2, y1, DOOR_TOP), (dx1 + 1.2, y1 + 1.0, DOOR_TOP + 1.6), "hazard")
    m.cyl((dx0 + 0.3, y1 - 2.4, DOOR_TOP - 1.4), (dx1 - 0.3, y1 - 2.4, DOOR_TOP - 1.4), 1.3, 1.3, "steel", n=10)
    m.box((x0 - 0.6, y0 - 0.6, EAVE), (x1 + 0.6, y1 + 0.6, EAVE + 1.0), "olive_dark", top="roof")
    # Sawtooth roof: glazing looks south-east (+x), the slope falls back north-west.
    tw = (x1 - x0 - 2.0) / TEETH
    ry0, ry1 = y0 + 1.0, y1 - 1.0
    z = EAVE + 1.0
    for i in range(TEETH):
        a = x0 + 1.0 + i * tw
        b = a + tw
        m.new_part()
        m.poly([(b, ry0, z), (b, ry1, z), (b, ry1, z + RISE), (b, ry0, z + RISE)], "glazing")
        m.new_part()
        m.poly([(a, ry0, z), (a, ry1, z), (b, ry1, z + RISE), (b, ry0, z + RISE)], "slope")
        m.new_part()
        m.poly([(a, ry0, z), (b, ry0, z), (b, ry0, z + RISE)], "olive")
        m.poly([(a, ry1, z), (b, ry1, z), (b, ry1, z + RISE)], "olive")
    # Roof vents on the second and fourth slopes.
    for i in (1, 3):
        vx = x0 + 1.0 + i * tw + tw * 0.55
        vz = z + RISE * 0.55
        m.cyl((vx, 30.0, vz), (vx, 30.0, vz + 3.2), 1.3, 1.3, "pipe", n=10)
        m.cyl((vx, 30.0, vz + 3.2), (vx, 30.0, vz + 4.0), 1.8, 0.4, "olive_dark", n=10, part=False)
    # Window bands on the two faces the camera sees, and a crew door on the south-east face.
    wz0, wz1 = WIN_Z
    m.box((x1, y0 + 4.0, wz0), (x1 + 0.35, y1 - 12.0, wz1), "glass")
    m.box((x0 + 3.0, y1, wz0), (dx0 - 3.0, y1 + 0.35, wz1), "glass")
    m.box((dx1 + 3.0, y1, wz0), (x1 - 3.0, y1 + 0.35, wz1), "glass")
    m.box((x1, y1 - 9.5, 2.6), (x1 + 0.4, y1 - 5.5, 8.6), "door")
    # Stack through the roof: a square base, the banded shaft, a sooty crown and the lamp.
    sx, sy = STACK
    m.box((sx - 4.0, sy - 4.0, EAVE + 1.0), (sx + 4.0, sy + 4.0, EAVE + 7.0), "olive_dark", top="roof")
    m.cyl((sx, sy, EAVE + 7.0), (sx, sy, STACK_TOP), 3.2, 2.4, "stack", n=16)
    m.cyl((sx, sy, STACK_TOP), (sx, sy, STACK_TOP + 2.0), 2.9, 2.9, "soot", n=16)
    m.cyl((sx + 2.6, sy, STACK_TOP + 2.0), (sx + 2.6, sy, STACK_TOP + 3.2), 0.6, 0.6, "lamp", n=8)
    # Steam pipe from the stack base along the roof to the first vent.
    m.cyl((sx + 4.0, sy, EAVE + 4.0), (x0 + 1.0 + tw * 1.55, sy, EAVE + 4.0), 0.6, 0.6, "pipe", n=8)

    # The hull on the line, halfway out of the door, turret not yet seated.
    hx0, hy0, hx1, hy1 = LINE_HULL
    hull(m, hx0, hy0, hx1, hy1, 2.6, turret=False, along_y=True)
    # Red tool cabinets and a gas bottle beside the door, a bench under the right-hand windows.
    m.box((x0 + 1.0, y1 + 2.0, 1.0), (x0 + 5.0, y1 + 5.0, 6.0), "cabinet")
    m.box((x0 + 5.6, y1 + 2.0, 1.0), (x0 + 9.6, y1 + 5.0, 6.0), "cabinet")
    m.cyl((dx0 - 3.5, y1 + 7.0, 1.0), (dx0 - 3.5, y1 + 7.0, 5.0), 1.0, 1.0, "drum_g", n=10)
    m.box((dx1 + 3.0, y1 + 1.5, 1.0), (dx1 + 11.0, y1 + 4.5, 3.6), "steel")
    m.box((dx1 + 3.5, y1 + 2.0, 3.6), (dx1 + 10.5, y1 + 4.0, 4.0), "wood", part=False)

    # South yard: the gantry and the hull on stands under the hook. East yard: spares in the hall's shade.
    gantry(m)
    yx0, yy0, yx1, yy1 = YARD_HULL
    for bx in (yx0 + 3.0, yx1 - 5.0):
        m.box((bx, yy0 + 2.0, 1.0), (bx + 2.0, yy1 - 2.0, YARD_HULL_Z), "steel")
    hull(m, yx0, yy0, yx1, yy1, YARD_HULL_Z, turret=False, along_y=False)
    track_links(m, 70.0, 12.0, 6)
    track_links(m, 79.0, 12.5, 5)
    for i in range(3):
        wx = 90.0
        wy = 14.0 + i * 3.4
        m.cyl((wx, wy, 1.0), (wx, wy, 2.4), 2.2, 2.2, "wheel", n=12)
        m.cyl((wx, wy, 2.4), (wx, wy, 3.0), 1.2, 1.2, "steel", n=10, part=False)
    drums(m, 84.0, 36.0, 3, 2)
    m.box((W - 12.0, H - 38.0, 1.0), (W - 6.5, H - 32.5, 5.4), "crate")
    m.box((W - 18.0, H - 37.0, 1.0), (W - 13.0, H - 32.0, 4.2), "crate")
    m.box((4.0, H - 12.0, 1.0), (10.0, H - 6.0, 4.6), "crate")
    m.box((4.5, H - 11.5, 4.6), (9.5, H - 6.5, 7.6), "crate")
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
    img.save(out_dir / "armory.png", optimize=True)

    south = screen(cv, W, H, 0.0)
    wz = (WIN_Z[0] + WIN_Z[1]) / 2
    x0, y0, x1, y1 = HALL
    dx0, dx1 = DOOR_X
    windows_se = [screen(cv, x1 + 0.4, y, wz) for y in np.linspace(y0 + 9.0, y1 - 17.0, 3)]
    windows_sw = [screen(cv, x, y1 + 0.4, wz) for x in (x0 + 7.0, (dx1 + x1) / 2)]
    info = {
        "padWidth": round((W + H) * ra.ZOOM, 1),
        "padSouthX": south[0],
        "padSouthY": south[1],
        "size": list(img.size),
        "stack": screen(cv, 38.0, 20.0, EAVE + RISE + 6.0),
        "windows": windows_se + windows_sw,
        "door": screen(cv, (dx0 + dx1) / 2, y1 - 1.0, 9.0),
        "sparks": screen(cv, (dx0 + dx1) / 2 - 3.0, y1 - 2.0, 7.0),
        "stackLamp": screen(cv, STACK[0] + 2.6, STACK[1], STACK_TOP + 3.6),
    }
    (out_dir / "armory.json").write_text(json.dumps(info, indent=2) + "\n")
    print("wrote", out_dir / "armory.png", info)

    cam = Image.new("RGBA", (96, 96), (0, 0, 0, 0))
    bb = img.getbbox()
    if bb:
        crop = img.crop(bb)
        f = min(92 / crop.width, 92 / crop.height)
        crop = crop.resize((max(1, round(crop.width * f)), max(1, round(crop.height * f))), Image.Resampling.LANCZOS)
        cam.alpha_composite(crop, ((96 - crop.width) // 2, (96 - crop.height) // 2))
    cam.save(out_dir / "armory-cameo.png")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True, help="buildings asset folder")
    args = ap.parse_args()
    render(Path(args.out))


if __name__ == "__main__":
    main()
