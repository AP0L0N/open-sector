#!/usr/bin/env python3
"""Artillery: lightweight towed howitzer, one 16-face hull sheet.

Modern line (render_alliance_kit.py): same camera, palette, scale, and outline
as render_nebelwerfer.py (the Hailstorm), so it sits in the vehicle class at the
same meters per pixel. The barrel is the facing: 0001 = muzzle screen-south,
then clockwise 22.5° through 0016. The crew is drawn by the client, not baked in.

  hull  two rubber road wheels on a cranked axle, a low cradle with twin
        recuperators over the breech, a long elevated barrel with a baffled
        muzzle brake, a small splinter shield carrying the gray team stripe,
        and long split box trails spread back to their spades.

  python tools/sprites/render_artillery.py \\
      --out gridlock/packages/client/src/assets/units/artillery
"""

from __future__ import annotations

import argparse
import math
from pathlib import Path

import numpy as np

import render_alliance_kit as kit
from render_alliance_kit import Mesh, tube

# Meters. +x muzzle, +y left, +z up. Wheels on z = 0. Origin under the axle.
WHEEL_R = 0.5
AXLE_Z = WHEEL_R
TRUNNION_Z = 1.05
ELEV = math.radians(45)  # barrel elevation: high-angle fire
BARREL_LEN = 3.7
SCALE_FRAC = 0.1  # px per meter / cell px, locked to the Hailstorm
Z_MID = 1.0
CY_FRAC = 0.6


def trail_leg(m: Mesh, root: np.ndarray, end: np.ndarray, w: float, h: float, mat: str = "armor") -> None:
    """Box-section trail leg from the carriage back to the spade."""
    axis = end - root
    axis = axis / np.linalg.norm(axis)
    side = np.cross(np.array([0.0, 0.0, 1.0]), axis)
    side /= np.linalg.norm(side)
    up = np.cross(axis, side)
    corners = lambda c: [c + side * sy * w + up * sz * h for sy, sz in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    m.loft([corners(root), corners(end)], mat)


def build_hull() -> Mesh:
    m = Mesh()
    # Cranked axle and the two rubber wheels.
    tube(m, (0.0, -0.85, AXLE_Z), (0.0, 0.85, AXLE_Z), 0.07, "wheel", 8)
    for s in (-1, 1):
        kit.road_wheel(m, 0.0, s * 0.9, WHEEL_R, 0.26)
    # Carriage saddle on the axle, the cradle above it.
    m.box((-0.5, -0.34, AXLE_Z - 0.05), (0.55, 0.34, AXLE_Z + 0.22), "armor")
    m.box((-0.25, -0.22, AXLE_Z + 0.22), (0.4, 0.22, TRUNNION_Z - 0.05), "plate")
    # Split box trails, long and spread, with spades and a towing eye bar between them.
    for s in (-1, 1):
        root = np.array([-0.4, s * 0.26, AXLE_Z + 0.02])
        end = np.array([-3.1, s * 0.75, 0.14])
        trail_leg(m, root, end, 0.09, 0.09)
        m.box((-3.3, s * 0.75 - 0.18, 0.0), (-3.1, s * 0.75 + 0.18, 0.3), "plate")  # spade
        m.box((-2.0, s * 0.56 - 0.05, 0.12), (-1.8, s * 0.56 + 0.05, 0.3), "slat")  # lifting handle bracket
    # Small splinter shield in front of the axle; its top edge takes the team tint.
    m.box((0.55, -0.9, 0.5), (0.62, 0.9, 1.25), "armor")
    m.box((0.62, -0.88, 1.12), (0.65, 0.88, 1.24), "team")
    for s in (-1, 1):
        m.box((0.42, s * 0.9 - 0.04, 0.55), (0.58, s * 0.9 + 0.04, 1.2), "armor")  # folded wings
    # Barrel: breech block behind the trunnion, twin recuperators above the cradle,
    # a long tube and a two-baffle muzzle brake on the end.
    pivot = np.array([0.0, 0.0, TRUNNION_Z])
    fwd = np.array([math.cos(ELEV), 0.0, math.sin(ELEV)])
    upn = np.array([-math.sin(ELEV), 0.0, math.cos(ELEV)])
    breech = pivot - fwd * 0.75
    muzzle = pivot + fwd * BARREL_LEN
    m.box(tuple(breech - np.array([0.3, 0.18, 0.16])), tuple(breech + np.array([0.12, 0.18, 0.16])), "plate")
    tube(m, breech, pivot + fwd * 1.1, 0.15, "barrel")
    tube(m, pivot + fwd * 1.1, muzzle, 0.1, "barrel")
    for s in (-1, 1):
        tube(m, pivot - fwd * 0.45 + upn * 0.2 + np.array([0, s * 0.1, 0]), pivot + fwd * 1.2 + upn * 0.2 + np.array([0, s * 0.1, 0]), 0.07, "plate")
    tube(m, muzzle - fwd * 0.42, muzzle - fwd * 0.3, 0.17, "plate", 10)
    tube(m, muzzle - fwd * 0.2, muzzle - fwd * 0.08, 0.17, "plate", 10)
    tube(m, muzzle - fwd * 0.42, muzzle, 0.1, "barrel")
    tube(m, muzzle, muzzle + fwd * 0.012, 0.06, "tire", 8)
    # Elevating arc beside the cradle, and a sighting box on the left.
    for s in (-1, 1):
        m.box((-0.3, s * 0.24 - 0.02, AXLE_Z + 0.22), (0.2, s * 0.24 + 0.02, TRUNNION_Z + 0.06), "plate")
    kit.sight_box(m, -0.25, 0.05, 0.3, 0.48, TRUNNION_Z + 0.05, TRUNNION_Z + 0.3)
    return m


LAYERS = (("hull", build_hull),)
CAMEO_FACE = "0014"  # ESE: wheel, shield, barrel, and trail all read on the train button
CAMEO_GAIN = 1.5
CAMEO_LIFT = 0.04


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True, help="unit folder; writes hull/ inside it")
    ap.add_argument("--ss", type=int, default=4)
    ap.add_argument("--cameo-only", action="store_true")
    ap.add_argument("--preview", help="write a contact sheet here")
    args = ap.parse_args()
    out = Path(args.out)
    if args.cameo_only:
        kit.cameo(out, ["hull"], out.parent / "artillery-cameo.png", CAMEO_FACE, CAMEO_GAIN, CAMEO_LIFT)
        return
    kit.render_unit("artillery", out, LAYERS, SCALE_FRAC, Z_MID, CY_FRAC, ss=args.ss, cameo_face=CAMEO_FACE, cameo_gain=CAMEO_GAIN, cameo_lift=CAMEO_LIFT)
    if args.preview:
        kit.contact_sheet(out, ["hull"], Path(args.preview))


if __name__ == "__main__":
    main()
