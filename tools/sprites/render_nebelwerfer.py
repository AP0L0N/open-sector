#!/usr/bin/env python3
"""Hailstorm (type id `nebelwerfer`): rocket artillery on an armored 6x6 truck, hull and
launcher as two 16-face sheets.

Modern line (render_alliance_kit.py): same camera, palette, and outline as
render_warden.py. Hull and launcher are separate passes of one locked camera
with one scale, like the Warden's hull and turret, so the client composes them
with one transform and the launcher aims on its own.

The launcher's traverse pivot sits at the model origin, so it lands on the
same screen point at every hull yaw. 0001 = nose screen-south, then clockwise
22.5° through 0016.

  hull      angular armored cab with slit windows and a gray team roof, a short
            sloped hood, three axles on big rubber wheels, a low armored bed
            with the turntable ring. No launcher on the hull.
  launcher  pedestal and a boxed twelve-tube pod (two rows of six), elevated,
            pointing +x, with a gray team plate on each flank.

The truck chassis (`truck_chassis`, `armored_cab`) is shared with the Supply
Truck (render_supply.py) so the two read as one family.

No insignia.

  python tools/sprites/render_nebelwerfer.py \\
      --out gridlock/packages/client/src/assets/units/nebelwerfer
"""

from __future__ import annotations

import argparse
import math
from pathlib import Path

import numpy as np

import render_alliance_kit as kit
from render_alliance_kit import Mesh, cylinder_z, slab, tube

# Meters. +x nose, +y left, +z up. Wheels on z = 0.
WHEEL_R = 0.55
WHEEL_Y = 1.05
FRAME_Z = (0.6, 0.9)  # chassis rails
DECK_Z = 1.25  # bed floor / launcher ring height
ELEV = math.radians(34)  # launcher pod elevation
SCALE_FRAC = 0.1  # px per meter / cell px
Z_MID = 1.3
CY_FRAC = 0.6
HW = 1.1  # half width of the body


def truck_chassis(m: Mesh, x0: float, x1: float, axles: tuple[float, ...] = (2.6, -0.95, -2.05)) -> None:
    """Rails, three axles on big rubber wheels, and mudguards over the front pair."""
    m.box((x0, -0.75, FRAME_Z[0]), (x1, 0.75, FRAME_Z[1]), "wheel")
    for x in axles:
        tube(m, (x, -WHEEL_Y, WHEEL_R), (x, WHEEL_Y, WHEEL_R), 0.07, "wheel", 6)
        for s in (-1, 1):
            kit.road_wheel(m, x, s * WHEEL_Y, WHEEL_R, 0.42)
    # Front mudguards: a flat plate over the steering wheels.
    for s in (-1, 1):
        kit.ybox(m, axles[0] - 0.7, axles[0] + 0.7, s, 0.8, WHEEL_Y + 0.25, WHEEL_R + 0.62, WHEEL_R + 0.7, "plate")


def armored_cab(m: Mesh, x0: float, x1: float, roof_z: float) -> None:
    """Angular armored cab from x0 (back wall) to x1 (foot of the windscreen): tumbled-in sides,
    a raked windscreen plate with a slit window, side slits, a gray team roof, a sensor mast."""
    base_z = FRAME_Z[1]
    slab(m, [(x0, -HW), (x1, -HW), (x1, HW), (x0, HW)], base_z, roof_z,
         [(x0 + 0.05, -0.98), (x1 - 0.5, -0.98), (x1 - 0.5, 0.98), (x0 + 0.05, 0.98)], "armor", "team")
    # Windscreen slit on the raked front plate, vision slits on the flanks.
    m.box((x1 - 0.3, -0.75, roof_z - 0.5), (x1 - 0.22, 0.75, roof_z - 0.36), "sensor")
    for s in (-1, 1):
        kit.ybox(m, x0 + 0.35, x1 - 0.6, s, HW - 0.04, HW + 0.02, roof_z - 0.5, roof_z - 0.4, "sensor")
        # Armored door edge line.
        kit.ybox(m, x0 + 0.3, x0 + 0.36, s, HW - 0.02, HW + 0.04, base_z + 0.1, roof_z - 0.2, "plate")
    # Roof: a low hatch ring and a sensor mast at the back corner.
    cylinder_z(m, (x0 + x1) / 2 - 0.1, 0.3, 0.28, roof_z, roof_z + 0.06, "plate", 12)
    kit.mast(m, x0 + 0.2, -0.7, roof_z, roof_z + 0.45, r=0.04, head=0.14)


def build_hull() -> Mesh:
    m = Mesh()
    truck_chassis(m, -2.4, 3.4)
    # Short armored hood, sloped to the nose, with a grille slot and hazard headlight covers.
    slab(m, [(2.1, -HW), (3.6, -0.95), (3.6, 0.95), (2.1, HW)], FRAME_Z[1], 1.6,
         [(2.1, -0.98), (3.35, -0.8), (3.35, 0.8), (2.1, 0.98)], "armor")
    m.box((3.55, -0.6, 1.0), (3.64, 0.6, 1.3), "slat")
    kit.headlights(m, 3.75, 0.82, 1.5, size=0.12)
    # Armored cab.
    armored_cab(m, 0.95, 2.15, 2.2)
    # Low armored bed around the launcher ring, side skirts over the rear wheels.
    slab(m, [(-2.45, -HW), (0.95, -HW), (0.95, HW), (-2.45, HW)], FRAME_Z[1], DECK_Z,
         [(-2.4, -1.05), (0.95, -1.05), (0.95, 1.05), (-2.4, 1.05)], "armor")
    for s in (-1, 1):
        kit.ybox(m, -2.4, 0.9, s, 1.05, 1.14, DECK_Z, DECK_Z + 0.3, "armor")
        kit.ybox(m, -2.4, 0.9, s, 1.14, 1.22, WHEEL_R + 0.55, DECK_Z, "plate")  # skirt over the rear bogie
    # Rear stowage box and the hydraulic stabiliser feet at the tail corners.
    m.box((-2.55, -0.8, 0.9), (-2.4, 0.8, DECK_Z + 0.2), "plate")
    for s in (-1, 1):
        m.box((-2.3, s * 1.0 - 0.1, 0.05), (-2.05, s * 1.0 + 0.1, FRAME_Z[0] + 0.05), "slat")
        m.box((-2.35, s * 1.0 - 0.18, 0.0), (-2.0, s * 1.0 + 0.18, 0.06), "plate")
    # Turntable ring at the origin (the launcher pivot); left empty for the launcher sheet.
    cylinder_z(m, 0.0, 0.0, 0.95, DECK_Z, DECK_Z + 0.12, "wheel", 20)
    return m


def build_launcher() -> Mesh:
    m = Mesh()
    z = DECK_Z + 0.12
    # Traversing turntable and a pedestal with the elevation trunnion.
    cylinder_z(m, 0.0, 0.0, 0.85, z, z + 0.14, "wheel", 18)
    m.box((-0.35, -0.5, z + 0.14), (0.35, 0.5, z + 0.55), "plate")
    pivot = np.array([0.0, 0.0, z + 0.62])
    fwd = np.array([math.cos(ELEV), 0.0, math.sin(ELEV)])
    upn = np.array([-math.sin(ELEV), 0.0, math.cos(ELEV)])
    left = np.array([0.0, 1.0, 0.0])
    # Boxed pod: a rectangular launcher box, 2 rows x 6 tubes, open at both ends.
    r = 0.13
    hwid = 6 * r * 1.05 + 0.08
    hh = 2 * r * 1.08 + 0.08
    back, front = -1.0, 1.2
    c = pivot + upn * 0.2
    corners = lambda t: [c + fwd * t + left * sy * hwid + upn * sz * hh for sy, sz in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    m.loft([corners(back), corners(front)], "armor")
    # Tube mouths proud of the front face, each with a dark bore; the rear face shows the vents.
    for row in range(2):
        for col in range(6):
            off = left * ((col - 2.5) * 2 * r * 1.05) + upn * ((row - 0.5) * 2 * r * 1.08)
            p0 = c + fwd * front + off
            tube(m, p0 - fwd * 0.02, p0 + fwd * 0.07, r, "plate", 8)
            tube(m, p0 + fwd * 0.07, p0 + fwd * 0.085, r * 0.7, "tire", 8)
            q = c + fwd * back + off
            tube(m, q - fwd * 0.015, q, r * 0.6, "tire", 8)
    # Frame bands front and rear, and a gray team plate on each flank.
    for t in (back + 0.2, front - 0.2):
        cc = [p + fwd * 0 for p in corners(t)]
        d = fwd * 0.05
        grown = [c + fwd * t + left * sy * (hwid + 0.04) + upn * sz * (hh + 0.04) for sy, sz in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
        m.loft([[p - d for p in grown], [p + d for p in grown]], "plate")
    for s in (-1, 1):
        cs = c + fwd * 0.1 + left * s * (hwid + 0.02)
        pts = [cs + fwd * a + upn * b for a, b in ((-0.55, -0.2), (0.55, -0.2), (0.55, 0.2), (-0.55, 0.2))]
        m.loft([pts, [p + left * s * 0.03 for p in pts]], "team")
    # Hydraulic elevation ram from the pedestal to the pod's belly, and the trunnion arms.
    tube(m, (0.3, 0.0, z + 0.2), tuple(c + fwd * 0.45 - upn * hh), 0.07, "wheel", 8)
    for s in (-1, 1):
        m.box((-0.3, s * 0.52 - 0.04, z + 0.2), (0.2, s * 0.52 + 0.04, z + 0.75), "plate")
    return m


LAYERS = (("hull", build_hull), ("launcher", build_launcher))
CAMEO_FACE = "0014"  # ESE: cab, bed, and the whole pod survive the wide train button crop
CAMEO_GAIN = 1.4
CAMEO_LIFT = 0.04


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True, help="unit folder; writes hull/ and launcher/ inside it")
    ap.add_argument("--ss", type=int, default=4)
    ap.add_argument("--cameo-only", action="store_true", help="rebuild the cameo from the sheets already in --out")
    ap.add_argument("--preview", help="write a contact sheet here")
    args = ap.parse_args()
    out = Path(args.out)
    if args.cameo_only:
        kit.cameo(out, [n for n, _ in LAYERS], out.parent / "nebelwerfer-cameo.png", CAMEO_FACE, CAMEO_GAIN, CAMEO_LIFT)
        return
    kit.render_unit("nebelwerfer", out, LAYERS, SCALE_FRAC, Z_MID, CY_FRAC, ss=args.ss, cameo_face=CAMEO_FACE, cameo_gain=CAMEO_GAIN, cameo_lift=CAMEO_LIFT)
    if args.preview:
        kit.contact_sheet(out, [n for n, _ in LAYERS], Path(args.preview))


if __name__ == "__main__":
    main()
