#!/usr/bin/env python3
"""WW2 German crewed guns: MG 42 nest, 3.7 cm Pak 36, 8.8 cm Pak 43, 3.7 cm Flak 37, and the Spotlight post.

Each gun is a static base (pit, parapet, sandbags, crates) and a traversing gun sheet:
  <id>.png            the unturned base, with its cast shadow
  <id>.json           pad metrics + rows, crewCols, order, gunZ, muzzleReach, pivotX/pivotY
  <id>-cameo.png      base + gun laid row 14 (south-east), full crew
  <id>/00..23.png     the base turned in 15 degree steps, <id>/faces.json (turn_faces.py)
  <id>-gun.png        16 rows x crewCols columns; column c = the gun with c crew figures
                      (column 0 empty). Every cell is the same size and anchor as <id>.png.

Rows are south-first, clockwise (engine order), solved with render_ciws.yaw_for_row's rule so
row k points the barrel at screen south + k * 22.5 degrees. The pivot is the footprint centre.
Crew turn with the gun, so they live in the gun sheet. The gun cells carry the gun's own soft
cast shadow (translucent) so it sits on whatever base facing is under it.

Shared kit (materials, crew figure, local-frame mesh, canvas and turn helpers) is in
render_ww2_fort.py.

  cd tools/sprites && python3 render_ww2_guns.py --out ../../gridlock/packages/client/src/assets/buildings [--only mgnest pak36 ...]
"""

from __future__ import annotations

import argparse
import json
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

import numpy as np
from PIL import Image, ImageDraw

import render_ww2_fort as wf

ra = wf.ra
SS = ra.SS
LM = wf.LM
DIRS = 16
ENGINE_ORDER = ["S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW", "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE"]


def yaw_for_row(row: int) -> float:
    """render_ciws.yaw_for_row: world yaw whose 2:1 projection points at screen south + row * 22.5 deg."""
    phi = math.radians(90.0 + row * 22.5)
    u, v = math.cos(phi), math.sin(phi)
    return math.atan2(v - u / 2, v + u / 2)


def beam(L: LM, a, b, w: float, h: float, mat: str, part: bool = True) -> None:
    """A box of width w (horizontal) and depth h (vertical) from a to b."""
    ax, ay, az = a
    bx, by, bz = b
    dx, dy = bx - ax, by - ay
    ln = math.hypot(dx, dy) or 1.0
    px, py = -dy / ln * w / 2, dx / ln * w / 2
    pts = []
    for dz in (0.0, h):
        for s in (-1, 1):
            for (x, y, z) in (a, b):
                pts.append((x + s * px, y + s * py, z + dz))
    # Order to Mesh.box: z0 (y0: x0 x1, y1: x0 x1), z1 ...
    L.hexa([pts[0], pts[1], pts[2], pts[3], pts[4], pts[5], pts[6], pts[7]], mat, part=part)


def obox(L: LM, o, d, u, t0: float, t1: float, hw: float, u0: float, u1: float, mat: str, part: bool = True) -> None:
    """An oriented box along unit direction d (in the x-z plane) from t0 to t1, side half-width hw, from u0 to u1 along u."""
    pts = []
    for uu in (u0, u1):
        for y in (-hw, hw):
            for t in (t0, t1):
                pts.append((o[0] + d[0] * t + u[0] * uu, o[1] + y, o[2] + d[2] * t + u[2] * uu))
    L.hexa(pts, mat, part=part)


# ---------------------------------------------------------------- MG 42 nest, t(1) x t(1)


def mgnest_base(ground: bool = True) -> ra.Mesh:
    m = ra.Mesh()
    L = LM(m, cx=16.0, cy=16.0)
    if ground:
        L.cyl((0, 0, 0), (0, 0, 0.12), 9.0, 9.0, "pit", n=18)
        wf.annulus(L, 10.6, 14.0, 10.8, 12.0, 0.0, 1.2, "bank", -math.pi + 0.5, math.pi - 0.5, 14, per_seg_part=False)
    wf.bag_ring(L, 8.2, 11.0, 3, 1.25, -math.pi + 0.55, math.pi - 0.55, 3.2)
    # Ammo boxes and a spare barrel case by the entrance.
    L.box((-7.2, 2.0, 0.0), (-5.4, 4.6, 1.4), "ammo")
    L.box((-7.0, 2.2, 1.4), (-5.6, 4.4, 2.6), "ammo")
    L.box((-6.8, -5.2, 0.0), (-3.0, -4.2, 0.9), "feldgrau_dark")
    return m


MG_Z = 5.3


def mgnest_gun(L: LM, crew: int) -> None:
    z = MG_Z
    # Lafette 34 tripod: hub, front leg, two rear legs, the cradle.
    L.box((-0.8, -0.6, z - 1.5), (1.2, 0.6, z - 0.7), "gunsteel")
    L.rod((0.8, 0, z - 1.3), (4.8, 0, 0.0), 0.28, "gunsteel")
    for s in (-1, 1):
        L.rod((-0.4, s * 0.4, z - 1.3), (-3.6, s * 3.4, 0.0), 0.28, "gunsteel")
        L.box((-3.9, s * 3.4 - 0.5, 0.0), (-3.0, s * 3.4 + 0.5, 0.3), "gunsteel", part=False)
    L.box((-0.4, -0.25, z - 0.8), (0.6, 0.25, z - 0.35), "gunsteel")
    # MG 42: receiver, perforated jacket, muzzle booster, stock and grip, belt box and belt.
    L.box((-1.6, -0.38, z - 0.35), (1.9, 0.38, z + 0.4), "gunsteel")
    L.rod((1.9, 0, z), (6.6, 0, z), 0.42, "gunsteel", n=8)
    for x in (2.6, 3.6, 4.6, 5.6):
        L.rod((x, 0, z), (x + 0.45, 0, z), 0.46, "bore", n=8, part=False)
    L.rod((6.6, 0, z), (7.6, 0, z), 0.3, "gunsteel", n=8)
    L.rod((7.6, 0, z), (7.7, 0, z), 0.2, "bore", n=8, part=False)
    L.hexa(
        [(-4.2, -0.3, z - 0.9), (-1.6, -0.3, z - 0.35), (-4.2, 0.3, z - 0.9), (-1.6, 0.3, z - 0.35),
         (-4.2, -0.3, z + 0.1), (-1.6, -0.3, z + 0.4), (-4.2, 0.3, z + 0.1), (-1.6, 0.3, z + 0.4)],
        "gunsteel",
    )
    L.box((-1.3, -0.2, z - 1.2), (-0.8, 0.2, z - 0.35), "gunsteel", part=False)
    L.box((0.0, -2.0, z - 1.6), (1.3, -0.9, z - 0.4), "ammo")
    L.box((0.2, -0.95, z - 0.4), (0.9, -0.38, z - 0.15), "brass")
    if crew >= 1:
        wf.soldier(crew_at(L, -5.9, 0.0, 0.0), "stand", "aim")


# ---------------------------------------------------------------- 3.7 cm Pak 36, t(1) x t(1)


def pak36_base(ground: bool = True) -> ra.Mesh:
    m = ra.Mesh()
    L = LM(m, cx=16.0, cy=16.0)
    if ground:
        L.cyl((0, 0, 0), (0, 0, 0.12), 12.5, 12.5, "pit", n=18)
        # Spoil thrown up round the pit, highest at the front.
        wf.annulus(L, 12.0, 15.2, 12.4, 13.6, 0.0, 1.8, "bank", -1.3, 1.3, 8, per_seg_part=False)
        wf.annulus(L, 12.0, 14.6, 12.4, 13.4, 0.0, 0.9, "bank", 1.3, 2.6, 5, per_seg_part=False)
        wf.annulus(L, 12.0, 14.6, 12.4, 13.4, 0.0, 0.9, "bank", -2.6, -1.3, 5, per_seg_part=False)
    wf.bag_ring(L, 12.2, 14.4, 1, 1.15, -0.95, 0.95, 3.0, z0=1.8)
    # Ammo crates, and spent casings on the pit floor.
    L.box((-12.0, 5.0, 0.0), (-9.4, 8.6, 1.6), "crate")
    L.box((-11.6, 5.4, 1.6), (-9.8, 8.2, 2.6), "ammo")
    L.box((-9.6, -9.0, 0.0), (-7.0, -6.0, 1.5), "crate")
    for x, y, a in ((-6.0, 6.5, 0.4), (-5.0, 8.4, 1.6), (-7.4, 3.0, 2.4), (-3.6, 9.6, 0.9), (-8.0, 10.0, 2.0)):
        L.rod((x, y, 0.3), (x + 1.3 * math.cos(a), y + 1.3 * math.sin(a), 0.3), 0.28, "brass", n=6)
    return m


P36_Z = 3.5


def pak36_gun(L: LM, crew: int) -> None:
    z = P36_Z
    # Split trails spread back to their spades.
    for s in (-1, 1):
        beam(L, (-0.4, s * 0.8, 1.3), (-11.0, s * 4.4, 0.15), 0.8, 0.9, "dgelb")
        L.box((-11.8, s * 4.4 - 0.9, 0.0), (-10.8, s * 4.4 + 0.9, 1.3), "dgelb_dark", part=False)
    # Axle, carriage body, and the two wheels (dark tyre, camouflaged disc, hub).
    L.rod((0.6, -4.0, 2.0), (0.6, 4.0, 2.0), 0.35, "gunsteel")
    L.box((-1.4, -1.1, 1.5), (1.8, 1.1, 2.7), "dgelb")
    for s in (-1, 1):
        L.cyl((0.6, s * 3.7, 2.0), (0.6, s * 4.7, 2.0), 2.0, 2.0, "boots", n=16)
        L.cyl((0.6, s * 4.7, 2.0), (0.6, s * 4.85, 2.0), 1.45, 1.45, "dgelb", n=16, part=False)
        L.cyl((0.6, s * 4.85, 2.0), (0.6, s * 5.1, 2.0), 0.55, 0.55, "gunsteel", n=8, part=False)
    # Breech, recoil cylinder, and the thin barrel.
    L.box((-2.7, -0.75, z - 0.6), (-0.4, 0.75, z + 0.65), "gunsteel")
    L.rod((-0.8, 0, z - 0.75), (3.6, 0, z - 0.75), 0.45, "dgelb_dark", n=8)
    L.cyl((-0.4, 0, z), (2.0, 0, z), 0.55, 0.5, "dgelb", n=10)
    L.cyl((2.0, 0, z), (10.4, 0, z), 0.42, 0.34, "dgelb", n=10)
    L.cyl((10.4, 0, z), (10.6, 0, z), 0.34, 0.2, "bore", n=10, part=False)
    # Double-layered shield: the main plate, angled top corners, and the spaced plate ahead of it.
    for dx, inset, mat in ((1.6, 0.0, "dgelb"), (2.1, 0.5, "dgelb")):
        L.hexa(
            [(dx, -3.8 + inset, 0.9), (dx + 0.3, -3.8 + inset, 0.9), (dx, 3.8 - inset, 0.9), (dx + 0.3, 3.8 - inset, 0.9),
             (dx - 0.3, -3.8 + inset, 4.0), (dx, -3.8 + inset, 4.0), (dx - 0.3, 3.8 - inset, 4.0), (dx, 3.8 - inset, 4.0)],
            mat,
        )
        L.hexa(
            [(dx - 0.3, -3.4 + inset, 4.0), (dx, -3.4 + inset, 4.0), (dx - 0.3, 3.4 - inset, 4.0), (dx, 3.4 - inset, 4.0),
             (dx - 0.55, -2.2 + inset, 5.0), (dx - 0.25, -2.2 + inset, 5.0), (dx - 0.55, 2.2 - inset, 5.0), (dx - 0.25, 2.2 - inset, 5.0)],
            mat,
            part=False,
        )
    # Sight on the left of the breech.
    L.box((-0.6, -1.4, z + 0.3), (0.6, -0.9, z + 1.0), "gunsteel")
    if crew >= 1:
        wf.soldier(crew_at(L, -2.4, -2.5, 0.0), "kneel", "aim")


# ---------------------------------------------------------------- 8.8 cm Pak 43, t(2) x t(2)


def pak43_base(ground: bool = True) -> ra.Mesh:
    m = ra.Mesh()
    L = LM(m, cx=32.0, cy=32.0)
    gap = 0.38
    if ground:
        L.cyl((0, 0, 0), (0, 0, 0.12), 22.5, 22.5, "pit", n=28)
        wf.annulus(L, 22.0, 30.0, 23.2, 26.6, 0.0, 3.4, "bank", -math.pi + gap, math.pi - gap, 22, per_seg_part=False)
    # Sandbags on the parapet crest round the front half.
    wf.bag_ring(L, 22.6, 25.6, 1, 1.2, -1.7, 1.7, 3.4, z0=3.3)
    # The cruciform platform: two crossed beams, jacks at the ends, the centre pivot.
    for a in (0.0, math.pi / 2):
        c, s = math.cos(a), math.sin(a)
        beam(L, (-15.0 * c, -15.0 * s, 0.1), (15.0 * c, 15.0 * s, 0.1), 2.2, 1.0, "dgelb")
        for e in (-15.0, 15.0):
            L.cyl((e * c, e * s, 0.0), (e * c, e * s, 0.6), 1.7, 1.5, "dgelb_dark", n=10)
            L.rod((e * c, e * s, 0.6), (e * c, e * s, 2.0), 0.35, "gunsteel")
    L.cyl((0, 0, 0.0), (0, 0, 1.8), 3.6, 3.2, "dgelb_dark", n=14)
    # Ammo crates and a round or two laid on them, rear left.
    for x, y in ((-17.0, 7.0), (-14.0, 10.5), (-17.5, 10.8)):
        L.box((x, y, 0.0), (x + 2.8, y + 3.0, 1.6), "ammo")
    L.box((-16.0, -12.0, 0.0), (-12.0, -9.6, 1.4), "crate")
    for k in range(3):
        L.rod((-15.6, -11.6 + k * 0.75, 1.75), (-12.2, -11.6 + k * 0.75, 1.75), 0.32, "brass", n=6)
    # A camouflage net slung from a pole over the north-west corner.
    px, py = -24.0, -24.0
    L.rod((px, py, 0.0), (px, py, 6.5), 0.35, "timber")
    m.new_part()
    top = m.v(L.w((px, py, 6.5)))
    rim = [(-31.0, -8.0, 0.3), (-29.0, -18.0, 2.2), (-30.5, -30.5, 0.2), (-18.0, -29.0, 2.2), (-8.0, -31.0, 0.3), (-17.0, -17.0, 3.4)]
    ids = [m.v(L.w(p)) for p in rim]
    for i in range(len(ids)):
        m.tri(top, ids[i], ids[(i + 1) % len(ids)], "camonet")
    return m


P43_Z = 6.6
P43_MUZZLE = 41.0


def pak43_gun(L: LM, crew: int) -> None:
    z = P43_Z
    # Turntable and the upper carriage cheeks.
    L.cyl((0, 0, 1.8), (0, 0, 2.6), 3.4, 3.4, "gunsteel", n=14)
    L.box((-3.4, -3.0, 2.6), (3.4, 3.0, 3.6), "dgelb")
    for s in (-1, 1):
        L.hexa(
            [(-3.0, s * 1.4, 3.6), (3.2, s * 1.4, 3.6), (-3.0, s * 2.3, 3.6), (3.2, s * 2.3, 3.6),
             (-1.6, s * 1.4, z + 0.8), (1.6, s * 1.4, z + 0.8), (-1.6, s * 2.3, z + 0.8), (1.6, s * 2.3, z + 0.8)],
            "dgelb",
        )
    # Cradle, the recoil cylinders over the barrel, the breech.
    L.box((-2.6, -1.3, z - 1.1), (6.0, 1.3, z + 0.9), "dgelb")
    for s in (-0.7, 0.7):
        L.rod((-3.6, s, z + 1.5), (6.0, s, z + 1.5), 0.6, "dgelb_dark", n=8)
    L.box((-6.6, -1.3, z - 1.2), (-2.6, 1.3, z + 1.0), "gunsteel")
    # The very long barrel, stepped thinner, and the double-baffle muzzle brake.
    L.cyl((6.0, 0, z), (16.0, 0, z), 0.9, 0.78, "dgelb", n=12)
    L.cyl((16.0, 0, z), (37.6, 0, z), 0.7, 0.58, "dgelb", n=12)
    L.cyl((37.6, 0, z), (38.8, 0, z), 1.2, 1.2, "gunsteel", n=12)
    L.cyl((38.8, 0, z), (39.3, 0, z), 0.7, 0.7, "bore", n=12, part=False)
    L.cyl((39.3, 0, z), (40.8, 0, z), 1.2, 1.2, "gunsteel", n=12, part=False)
    L.cyl((40.8, 0, z), (P43_MUZZLE, 0, z), 0.6, 0.6, "bore", n=12, part=False)
    # Low, wide, sloped shield: centre plates and swept-back wings.
    def plate(y0, y1, x0b, x1b, xt_off, z0, z1, part=True):
        L.hexa(
            [(x0b, y0, z0), (x0b + 0.35, y0, z0), (x1b, y1, z0), (x1b + 0.35, y1, z0),
             (x0b - xt_off, y0, z1), (x0b - xt_off + 0.35, y0, z1), (x1b - xt_off, y1, z1), (x1b - xt_off + 0.35, y1, z1)],
            "dgelb",
            part=part,
        )

    for s in (-1, 1):
        plate(0.0, s * 7.0, 4.2, 4.2, 2.6, 2.4, z + 2.4)
        plate(s * 7.0, s * 9.4, 4.2, 2.4, 2.0, 2.4, z + 1.6, part=False)
    # Sight periscope on the left.
    L.box((0.4, -3.2, z + 0.4), (1.4, -2.4, z + 2.8), "gunsteel")
    if crew >= 1:
        wf.soldier(crew_at(L, -2.6, -4.6, 0.0, 0.0), "kneel", "aim")
    if crew >= 2:
        wf.soldier(crew_at(L, -10.5, 2.0, 0.25), "stand", "shell")


# ---------------------------------------------------------------- 3.7 cm Flak 37, t(2) x t(2)


def flak_base(ground: bool = True) -> ra.Mesh:
    m = ra.Mesh()
    L = LM(m, cx=32.0, cy=32.0)
    gap = 0.42
    if ground:
        L.cyl((0, 0, 0), (0, 0, 0.12), 18.5, 18.5, "pit", n=26)
        wf.annulus(L, 18.0, 27.0, 19.6, 22.6, 0.0, 3.0, "bank", -math.pi + gap, math.pi - gap, 20, per_seg_part=False)
    wf.bag_ring(L, 17.6, 20.2, 2, 1.15, -math.pi + gap + 0.05, math.pi - gap - 0.05, 3.2, z0=2.9)
    # The gun's round platform with its four outrigger feet.
    L.cyl((0, 0, 0.0), (0, 0, 0.9), 8.6, 8.4, "dgelb_dark", n=22)
    for a in (math.pi / 4, 3 * math.pi / 4, 5 * math.pi / 4, 7 * math.pi / 4):
        c, s = math.cos(a), math.sin(a)
        beam(L, (7.0 * c, 7.0 * s, 0.05), (12.0 * c, 12.0 * s, 0.05), 1.4, 0.6, "dgelb")
        L.cyl((12.0 * c, 12.0 * s, 0.0), (12.0 * c, 12.0 * s, 0.5), 1.3, 1.2, "gunsteel", n=8)
    # Racks of clips and ammo boxes round the inside of the wall.
    for a in (1.75, -1.75, 2.45, -2.45):
        rx, ry = 15.2 * math.cos(a), 15.2 * math.sin(a)
        R = L.sub(rx, ry, a + math.pi)
        R.box((-0.6, -2.6, 0.0), (0.6, 2.6, 0.5), "timber")
        R.box((-0.6, -2.6, 2.6), (0.6, 2.6, 2.9), "timber", part=False)
        for e in (-2.6, 2.4):
            R.box((-0.6, e, 0.0), (0.6, e + 0.2, 2.9), "timber", part=False)
        for k in range(5):
            y = -2.1 + k * 0.95
            R.box((-0.35, y, 0.5), (0.35, y + 0.6, 2.4), "brass")
    for a in (0.6, -0.6, 1.15):
        bx, by = 14.8 * math.cos(a), 14.8 * math.sin(a)
        B = L.sub(bx, by, a)
        B.box((-1.0, -1.6, 0.0), (1.0, 1.6, 1.4), "ammo")
    L.box((-15.0, -3.0, 0.0), (-12.6, 0.0, 1.6), "crate")
    return m


FL_T = 5.4  # trunnion height
FL_EL = math.radians(57.0)
FL_LEN = 15.6  # trunnion to muzzle along the bore


def flak_gun(L: LM, crew: int) -> None:
    T = FL_T
    d = (math.cos(FL_EL), 0.0, math.sin(FL_EL))
    u = (-math.sin(FL_EL), 0.0, math.cos(FL_EL))
    o = (0.0, 0.0, T)
    # Turntable, pedestal, and the side frames carrying the trunnions.
    L.cyl((0, 0, 0.62), (0, 0, 1.4), 5.4, 5.2, "dgelb", n=20)
    L.cyl((0, 0, 1.4), (0, 0, 3.6), 1.6, 1.3, "dgelb_dark", n=12)
    for s in (-1, 1):
        L.hexa(
            [(-2.0, s * 1.3, 1.4), (2.0, s * 1.3, 1.4), (-2.0, s * 2.0, 1.4), (2.0, s * 2.0, 1.4),
             (-0.9, s * 1.3, T + 0.9), (0.9, s * 1.3, T + 0.9), (-0.9, s * 2.0, T + 0.9), (0.9, s * 2.0, T + 0.9)],
            "dgelb",
        )
    # Receiver and breech casing, the clip standing in its feed on top, recoil housing, barrel, flash hider.
    obox(L, o, d, u, -4.0, 2.4, 1.0, -1.1, 0.9, "dgelb")
    obox(L, o, d, u, -2.8, -0.6, 0.65, 0.9, 3.2, "brass")
    obox(L, o, d, u, 2.4, 5.6, 0.75, -0.75, 0.75, "dgelb_dark")
    L.cyl((o[0] + d[0] * 5.6, 0, o[2] + d[2] * 5.6), (o[0] + d[0] * (FL_LEN - 1.4), 0, o[2] + d[2] * (FL_LEN - 1.4)), 0.42, 0.36, "dgelb", n=10)
    L.cyl((o[0] + d[0] * (FL_LEN - 1.4), 0, o[2] + d[2] * (FL_LEN - 1.4)), (o[0] + d[0] * FL_LEN, 0, o[2] + d[2] * FL_LEN), 0.62, 0.62, "gunsteel", n=10)
    L.cyl((o[0] + d[0] * FL_LEN, 0, o[2] + d[2] * FL_LEN), (o[0] + d[0] * (FL_LEN + 0.1), 0, o[2] + d[2] * (FL_LEN + 0.1)), 0.4, 0.4, "bore", n=10, part=False)
    # Small curved shield in two leaves.
    for s in (-1, 1):
        L.hexa(
            [(2.6, s * 0.4, 2.2), (2.9, s * 0.4, 2.2), (2.2, s * 4.0, 2.2), (2.5, s * 4.0, 2.2),
             (2.3, s * 0.4, 6.8), (2.6, s * 0.4, 6.8), (1.9, s * 4.0, 6.3), (2.2, s * 4.0, 6.3)],
            "dgelb",
        )
    # Two seats on posts; the left one has the reflector sight on an arm in front of it.
    for s in (-1, 1):
        L.rod((-2.2, s * 2.9, 1.4), (-2.2, s * 2.9, 3.4), 0.25, "gunsteel")
        L.box((-3.0, s * 2.9 - 0.8, 3.4), (-1.6, s * 2.9 + 0.8, 3.8), "gunsteel", part=False)
    L.rod((0.4, -2.0, 4.6), (0.9, -2.9, 6.6), 0.2, "gunsteel")
    L.box((0.4, -3.4, 6.4), (1.2, -2.4, 7.4), "gunsteel")
    L.rod((1.25, -2.9, 7.6), (1.25, -2.9, 7.65), 0.6, "steel", n=10, part=False)
    if crew >= 1:
        wf.soldier(crew_at(L, -2.6, -2.9, 0.0, 1.4), "sit", "aim")
    if crew >= 2:
        wf.soldier(crew_at(L, -4.8, 3.4, 0.5, 1.4), "stand", "clip")


# ---------------------------------------------------------------- Spotlight post, t(1) x t(1)
#
# The Watch Tower's searchlight on a steel pole. The base is the sandbagged foot; the pole, the
# training column, and the man at it turn with the lamp, so they live in the gun sheet (column 0
# empty, column 1 manned). The lamp head itself is drawn by the client on the pole top (lampZ in
# spotlight.json), lit at night and turned with the beam, as on the tower.

SPOT_POLE_TOP = 34.0


def spotlight_base(ground: bool = True) -> ra.Mesh:
    m = ra.Mesh()
    L = LM(m, cx=16.0, cy=16.0)
    if ground:
        L.cyl((0, 0, 0), (0, 0, 0.12), 8.8, 8.8, "pit", n=18)
        wf.annulus(L, 9.4, 12.4, 9.6, 10.8, 0.0, 1.0, "bank", -math.pi + 0.7, math.pi - 0.7, 14, per_seg_part=False)
    # Two low courses of bags round the front, open behind where the man comes and goes.
    wf.bag_ring(L, 7.4, 9.8, 2, 1.15, -math.pi + 0.75, math.pi - 0.75, 3.0)
    # The concrete footing the pole is bolted to.
    L.box((-2.6, -2.6, 0.0), (2.6, 2.6, 0.7), "acon", top="slab")
    # Spare carbons and a cable drum by the way in.
    L.box((-7.4, 2.4, 0.0), (-5.8, 4.6, 1.2), "ammo")
    L.cyl((-6.4, -3.6, 0.0), (-6.4, -3.6, 1.6), 1.4, 1.4, "timber", n=12)
    L.cyl((-6.4, -3.6, 1.6), (-6.4, -3.6, 1.7), 0.9, 0.9, "gunsteel", n=12, part=False)
    return m


def spotlight_gun(L: LM, crew: int) -> None:
    top = SPOT_POLE_TOP
    # Base plate, the tapered steel pole, a collar halfway, and the head plate the lamp sits on.
    L.cyl((0, 0, 0.7), (0, 0, 1.3), 1.9, 1.7, "gunsteel", n=12)
    L.cyl((0, 0, 1.3), (0, 0, top - 0.6), 0.95, 0.65, "steel", n=12)
    L.cyl((0, 0, top * 0.5 - 0.4), (0, 0, top * 0.5 + 0.4), 1.05, 1.0, "gunsteel", n=12)
    L.cyl((0, 0, top - 0.6), (0, 0, top), 2.1, 2.1, "gunsteel", n=14)
    # Training column behind the pole: the handwheel the man turns the lamp with, cable up the pole.
    L.cyl((-2.6, 0, 0.7), (-2.6, 0, 4.6), 0.55, 0.45, "gunsteel", n=8)
    L.box((-3.2, -0.8, 4.6), (-2.0, 0.8, 5.6), "gunsteel")
    L.cyl((-3.25, 0, 5.1), (-3.45, 0, 5.1), 1.3, 1.3, "steel", n=14, part=False)
    L.rod((-2.6, 0.3, 1.0), (-0.7, 0.3, 2.0), 0.18, "bore", n=4)
    if crew >= 1:
        wf.soldier(crew_at(L, -5.2, 0.0, 0.0), "stand", "aim")
    if crew >= 2:
        # Cameo only (no sheet column): the drum lamp the client otherwise draws on the head plate.
        L.cyl((0, 0, top), (0, 0, top + 1.6), 1.6, 1.4, "gunsteel", n=10)
        L.cyl((-3.0, 0, top + 5.6), (3.4, 0, top + 5.1), 2.7, 2.7, "steel", n=16)
        L.cyl((3.4, 0, top + 5.1), (3.6, 0, top + 5.1), 2.35, 2.35, "brass", n=16, part=False)
        for s in (-1, 1):
            L.rod((0, s * 3.2, top + 1.6), (0, s * 3.2, top + 5.4), 0.4, "gunsteel")


# ---------------------------------------------------------------- render


@dataclass
class Gun:
    name: str
    W: float
    tiles: tuple[int, int]
    top: float
    side: float
    crew: int
    base: Callable
    gun: Callable
    gun_z: float
    reach: float
    k: float = 1.0
    extra: dict | None = None
    # Column baked into the cameo. Default the last (the full crew). A crewless gun whose columns
    # are recoil frames (render_xeno_guns.py) shows its column 0, at rest.
    cameo_col: int | None = None


# Crew figures are the same world size on every gun, whatever the gun's own scale.
CREW_K = 1.2


def crew_at(L: LM, x: float, y: float, yaw: float = 0.0, z: float = 0.0) -> LM:
    """A crew figure's frame in gun-local units, scaled so the figure is CREW_K in world terms."""
    return L.sub(x, y, yaw, z, CREW_K / L.k)


GUNS = {
    "mgnest": Gun("mgnest", 32.0, (4, 4), 18.0, 10.0, 1, mgnest_base, mgnest_gun, MG_Z, 7.7, 1.25),
    "pak36": Gun("pak36", 32.0, (4, 4), 16.0, 12.0, 1, pak36_base, pak36_gun, P36_Z, 10.6, 1.25),
    "pak43": Gun("pak43", 64.0, (8, 8), 16.0, 14.0, 2, pak43_base, pak43_gun, P43_Z, P43_MUZZLE),
    "flak": Gun(
        "flak", 64.0, (8, 8), 22.0, 10.0, 2, flak_base, flak_gun, FL_T, FL_LEN * math.cos(FL_EL), 1.45,
        extra={"muzzleZ": round((FL_T + FL_LEN * math.sin(FL_EL)) * 1.45, 2), "elevationDeg": 57},
    ),
    "spotlight": Gun(
        "spotlight", 32.0, (4, 4), 32.0, 20.0, 1, spotlight_base, spotlight_gun, SPOT_POLE_TOP, 2.0,
        extra={"lampZ": SPOT_POLE_TOP},
    ),
}


def gun_mesh(g: Gun, yaw: float, crew: int) -> ra.Mesh:
    m = ra.Mesh()
    c = g.W / 2
    wf.GUN_FRAME.update(yaw=yaw, cx=c, cy=c)
    g.gun(LM(m, yaw, c, c, 0.0, g.k), crew)
    return m


def gun_layer(g: Gun, mesh: ra.Mesh, cv: ra.Canvas) -> Image.Image:
    """The gun inked and silhouetted, with its own soft cast shadow on the ground round it."""
    fr = ra.rasterize(mesh, cv)
    ra.ink(fr, SS)
    ra.silhouette(fr, SS)
    sh = ra.shadow_mask(mesh, cv)
    ys, xs = np.mgrid[0 : cv.h, 0 : cv.w].astype(np.float64) + 0.5
    gx, gy = cv.to_world_ground(xs, ys)
    c = g.W / 2
    near = np.hypot(gx - c, gy - c) < g.W * 0.75 + 6
    shadow = np.clip(sh * 0.36, 0, 0.5) * near
    solid = fr.alpha > 0.5
    color = fr.color.copy()
    alpha = fr.alpha.copy()
    out = ~solid & (shadow > 0.02)
    color[out] = ra.OUTLINE * 0.4
    alpha[out] = shadow[out]
    return ra.downsample(color, alpha, SS)


def render_gun(out_dir: Path, g: Gun, turned: bool = True) -> dict:
    W = H = g.W
    c = W / 2
    cv = wf.make_canvas(W, H, g.top, g.side)
    out_dir.mkdir(parents=True, exist_ok=True)
    wf.PREVIEW.mkdir(exist_ok=True)
    wf.GUN_FRAME.update(yaw=0.0, cx=c, cy=c)
    base = wf.shade_mesh(g.base, cv, W, H, 5.0, 1.0)
    wf.edge_clear(base, g.name)
    base.save(out_dir / f"{g.name}.png", optimize=True)
    cw, ch = base.size
    cols = g.crew + 1
    cells: list[list[Image.Image]] = []
    for r in range(DIRS):
        yaw = yaw_for_row(r)
        row = []
        for col in range(cols):
            img = gun_layer(g, gun_mesh(g, yaw, col), cv)
            wf.edge_clear(img, f"{g.name}-gun r{r} c{col}")
            row.append(img)
        cells.append(row)
    sheet = Image.new("RGBA", (cw * cols, ch * DIRS), (0, 0, 0, 0))
    for r in range(DIRS):
        for col in range(cols):
            sheet.paste(cells[r][col], (col * cw, r * ch))
    sheet.save(out_dir / f"{g.name}-gun.png", optimize=True)

    info = wf.pad_info(cv, W, H, g.gun_z * g.k + 10.0)
    piv = cv.to_screen(np.array([[c, c, 0.0]]))
    info.update(
        {
            "cell": [cw, ch],
            "pivotX": round(float(piv[0][0]) / SS, 1),
            "pivotY": round(float(piv[1][0]) / SS, 1),
            "rows": DIRS,
            "crewCols": cols,
            "order": ENGINE_ORDER,
            "gunZ": round(g.gun_z * g.k, 2),
            "muzzleReach": round(g.reach * g.k, 2),
        }
    )
    if g.extra:
        info.update(g.extra)
    (out_dir / f"{g.name}.json").write_text(json.dumps(info, indent=2) + "\n")
    print(g.name, "metrics", info)

    both = base.copy()
    # The Spotlight's lamp is drawn by the client; its cameo gets one baked on (crew 2 is the lamp pass).
    lamp = gun_layer(g, gun_mesh(g, yaw_for_row(14), 2), cv) if g.name == "spotlight" else None
    both.alpha_composite(lamp or cells[14][cols - 1 if g.cameo_col is None else g.cameo_col])
    wf.cameo(both, out_dir / f"{g.name}-cameo.png", wf.solid_box(both))
    wf.on_grass(both).save(wf.PREVIEW / f"{g.name}.png")

    # Preview: for each crew column, the 16 rows over the base, 8 to a line.
    lab = 14
    strip = Image.new("RGBA", (cw * 8, (ch + lab) * 2 * cols), (74, 107, 50, 255))
    dr = ImageDraw.Draw(strip)
    for col in range(cols):
        for r in range(DIRS):
            cell = base.copy()
            cell.alpha_composite(cells[r][col])
            x = (r % 8) * cw
            y = (col * 2 + r // 8) * (ch + lab)
            strip.alpha_composite(cell, (x, y + lab))
            dr.text((x + 4, y + 1), f"{r} {ENGINE_ORDER[r]} crew {col}", fill=(240, 232, 210, 255))
    strip.save(wf.PREVIEW / f"{g.name}-strip.png")

    if turned:
        wf.GUN_FRAME.update(yaw=0.0, cx=c, cy=c)
        wf.render_turned(out_dir, g.name, g.base, W, H, g.tiles, g.top, g.side, 5.0, 1.0, g.gun_z * g.k + 10.0)
    return info


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True, help="buildings asset folder")
    ap.add_argument("--only", nargs="*", help="gun ids to render")
    ap.add_argument("--no-turned", action="store_true", help="skip the 24 turned base faces (quick look)")
    args = ap.parse_args()
    for name, g in GUNS.items():
        if args.only and name not in args.only:
            continue
        render_gun(Path(args.out), g, not args.no_turned)


if __name__ == "__main__":
    main()
