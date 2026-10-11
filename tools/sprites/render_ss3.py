#!/usr/bin/env python3
"""Vanguard (type id ss3): the Alliance casemate assault gun, two 16-face layers from one camera.

Modern line (render_alliance_kit.py), locked to the Warden: a very low flat wedge
hull with no turret, the gun fixed in a mantlet at the foot of the casemate, full
side skirts, a small remote weapon station and a boxed sight on the roof, smoke
dischargers on the casemate cheeks, a slat cage over the engine doors. Reads as the
Warden's little brother with its turret planed off.

Both layers are passes of one locked camera with one scale and one origin (the
hull centre), so the client composes them with one transform and the gun recoils
in place. The gun does not traverse on its own; it is a separate layer only so it
can recoil. 0001 = nose screen-south, then clockwise 22.5° through 0016.

Chassis is the neutral gray the game tints. No insignia.

  python tools/sprites/render_ss3.py \\
      --out gridlock/packages/client/src/assets/units/ss3
"""

from __future__ import annotations

import argparse
from pathlib import Path

import render_alliance_kit as kit
from render_alliance_kit import Mesh, cylinder_z, slab

# Meters. +x nose, +y left, +z up. Tracks on z = 0. Origin = hull centre.
HULL_X0, HULL_X1 = -3.3, 3.5  # rear, nose
TRACK_Y0, TRACK_Y1 = 1.05, 1.7
DECK_Z = 1.3  # hull roof
CASE_X0, CASE_X1 = -2.8, 0.9  # casemate rear, foot of its front slope
CASE_TOP = 1.95
GUN_X0 = 0.75  # barrel root, inside the mantlet
GUN_Z = 1.6
SCALE_FRAC = 0.07
Z_MID = 1.1
CY_FRAC = 0.6


def build_hull() -> Mesh:
    m = Mesh()
    kit.tracks(m, HULL_X0, HULL_X1, TRACK_Y0, TRACK_Y1, wheel_r=0.38, wheels=6, skirt_z=(0.42, 1.0))
    w = TRACK_Y1 + 0.15
    # Lower tub and a short sloped lower nose.
    m.box((HULL_X0 + 0.1, -TRACK_Y0, 0.3), (HULL_X1 - 0.8, TRACK_Y0, 0.95), "plate")
    slab(m, [(HULL_X1 - 0.8, -TRACK_Y0), (HULL_X1 - 0.2, -TRACK_Y0), (HULL_X1 - 0.2, TRACK_Y0), (HULL_X1 - 0.8, TRACK_Y0)], 0.3, 0.95,
         [(HULL_X1 - 0.8, -TRACK_Y0), (HULL_X1 + 0.1, -TRACK_Y0), (HULL_X1 + 0.1, TRACK_Y0), (HULL_X1 - 0.8, TRACK_Y0)], "plate")
    # Upper hull: a long shallow glacis to the casemate foot.
    slab(m, [(HULL_X0, -w), (HULL_X1 + 0.1, -w), (HULL_X1 + 0.1, w), (HULL_X0, w)], 0.95, DECK_Z,
         [(HULL_X0 + 0.05, -w + 0.12), (CASE_X1 + 0.3, -w + 0.12), (CASE_X1 + 0.3, w - 0.12), (HULL_X0 + 0.05, w - 0.12)], "armor")
    # The casemate: a low wedge, its front plate sloped hard back, sides tumbled in.
    cw = w - 0.2
    slab(m, [(CASE_X0, -cw), (CASE_X1, -cw), (CASE_X1, cw), (CASE_X0, cw)], DECK_Z, CASE_TOP,
         [(CASE_X0 + 0.1, -cw + 0.25), (CASE_X1 - 0.75, -cw + 0.25), (CASE_X1 - 0.75, cw - 0.25), (CASE_X0 + 0.1, cw - 0.25)], "armor")
    # Mantlet at the casemate foot: the barrel root sits in it.
    m.box((CASE_X1 - 0.35, -0.5, GUN_Z - 0.35), (CASE_X1 + 0.2, 0.5, GUN_Z + 0.32), "plate")
    # Reactive tiles on the casemate cheeks, smoke dischargers above them.
    for s in (-1, 1):
        kit.era_tiles(m, "y", s, s * (cw - 0.05), CASE_X0 + 0.3, CASE_X1 - 0.5, DECK_Z + 0.1, CASE_TOP - 0.25, nu=4, nv=1, depth=0.08)
        kit.dischargers(m, CASE_X1 - 0.9, s * 0.75, CASE_TOP - 0.12, s, n=3)
    # Roof: boxed sight right-front, remote weapon station left-rear, a hatch, a short mast.
    kit.sight_box(m, CASE_X1 - 1.3, CASE_X1 - 0.8, -0.75, -0.3, CASE_TOP, CASE_TOP + 0.3)
    kit.rws(m, CASE_X0 + 0.9, 0.55, CASE_TOP, k=0.75)
    cylinder_z(m, CASE_X0 + 0.9, -0.55, 0.28, CASE_TOP, CASE_TOP + 0.06, "plate", 14)
    kit.mast(m, CASE_X0 + 0.3, -0.2, CASE_TOP, CASE_TOP + 0.45)
    # Driver's periscope block on the glacis, hazard headlight covers on the nose corners.
    m.box((CASE_X1 + 0.45, 0.3, DECK_Z), (CASE_X1 + 0.8, 0.85, DECK_Z + 0.1), "plate")
    m.box((CASE_X1 + 0.45, 0.4, DECK_Z + 0.1), (CASE_X1 + 0.78, 0.75, DECK_Z + 0.13), "sensor")
    kit.headlights(m, HULL_X1 - 0.75, w - 0.4, DECK_Z - 0.03)
    # Engine deck behind the casemate: louvres, twin exhausts, a slat cage over the doors, the team strip.
    kit.louvres(m, HULL_X0 + 0.15, CASE_X0 - 0.1, -1.1, 1.1, DECK_Z, n=4, along="x")
    for s in (-1, 1):
        m.box((HULL_X0 - 0.1, s * 1.0 - 0.18, 0.8), (HULL_X0 + 0.05, s * 1.0 + 0.18, 1.12), "wheel")
    kit.slat_cage(m, HULL_X0 - 0.32, HULL_X0 - 0.04, -w + 0.3, w - 0.3, 0.45, 1.2, bars=6, faces="x")
    m.box((CASE_X0 + 0.12, -cw + 0.35, CASE_TOP), (CASE_X0 + 0.3, cw - 0.35, CASE_TOP + 0.05), "team")
    return m


def build_gun() -> Mesh:
    m = Mesh()
    kit.smoothbore(m, GUN_X0, 5.5, 0.0, GUN_Z, r=0.11, sleeve=0.9, extractor=(3.1, 3.6))
    return m


LAYERS = (("hull", build_hull), ("gun", build_gun))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True, help="unit folder; writes hull/ and gun/ inside it")
    ap.add_argument("--ss", type=int, default=4)
    ap.add_argument("--preview", help="write a contact sheet here")
    args = ap.parse_args()
    out = Path(args.out)
    kit.render_unit("ss3", out, LAYERS, SCALE_FRAC, Z_MID, CY_FRAC, ss=args.ss)
    if args.preview:
        kit.contact_sheet(out, [n for n, _ in LAYERS], Path(args.preview))


if __name__ == "__main__":
    main()
