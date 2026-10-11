#!/usr/bin/env python3
"""Breaker (type id jagdtiger): heavy casemate tank destroyer, two 16-face layers from one camera.

Modern line (render_alliance_kit.py), locked to the Warden: a long heavy hull, a
long shallow glacis, full side skirts, and a big low casemate set well back with a
thick hard-raked front plate and reactive-armor tiles down both flanks. A box
mantlet at the casemate foot carries the fixed 128mm smoothbore: thermal sleeve,
fume extractor, no muzzle brake. On the roof a boxed thermal sight, a panoramic
sight, a remote weapon station and a sensor mast; a slat cage over the engine
doors. Visibly bigger and heavier than the Vanguard.

Both layers are passes of one locked camera with one scale and one origin, so the
client composes them with one transform. The gun does not traverse on its own;
it is a separate layer only so it can recoil.
0001 = nose screen-south, then clockwise 22.5° through 0016.

Chassis is the neutral gray the game tints. No insignia.

  python tools/sprites/render_jagdtiger.py \\
      --out gridlock/packages/client/src/assets/units/jagdtiger
"""

from __future__ import annotations

import argparse
from pathlib import Path

import render_alliance_kit as kit
from render_alliance_kit import Mesh, cylinder_z, slab

# Meters. +x nose, +y left, +z up. Tracks on z = 0. Origin = hull centre.
HULL_X0, HULL_X1 = -3.9, 3.9  # rear, nose
TRACK_Y0, TRACK_Y1 = 1.15, 1.9
DECK_Z = 1.65  # hull roof
CASE_X0, CASE_X1 = -3.5, 1.3  # casemate rear, foot of its front plate
CASE_TOP = 2.7
GUN_X0 = 1.15  # barrel root, inside the mantlet
GUN_Z = 2.15
SCALE_FRAC = 0.06  # px per meter / cell px: the long barrel at east fits the cell
Z_MID = 1.4
CY_FRAC = 0.6


def build_hull() -> Mesh:
    m = Mesh()
    kit.tracks(m, HULL_X0, HULL_X1, TRACK_Y0, TRACK_Y1, wheel_r=0.44, wheels=8, skirt_z=(0.5, 1.3))
    w = TRACK_Y1 + 0.15
    # Lower tub and the sloped lower nose.
    m.box((HULL_X0 + 0.1, -TRACK_Y0, 0.35), (HULL_X1 - 0.9, TRACK_Y0, 1.2), "plate")
    slab(m, [(HULL_X1 - 0.9, -TRACK_Y0), (HULL_X1 - 0.25, -TRACK_Y0), (HULL_X1 - 0.25, TRACK_Y0), (HULL_X1 - 0.9, TRACK_Y0)], 0.35, 1.2,
         [(HULL_X1 - 0.9, -TRACK_Y0), (HULL_X1 + 0.1, -TRACK_Y0), (HULL_X1 + 0.1, TRACK_Y0), (HULL_X1 - 0.9, TRACK_Y0)], "plate")
    # Upper hull, a long shallow glacis to the casemate foot.
    slab(m, [(HULL_X0, -w), (HULL_X1 + 0.1, -w), (HULL_X1 + 0.1, w), (HULL_X0, w)], 1.2, DECK_Z,
         [(HULL_X0 + 0.05, -w + 0.12), (CASE_X1 + 0.5, -w + 0.12), (CASE_X1 + 0.5, w - 0.12), (HULL_X0 + 0.05, w - 0.12)], "armor")
    # The casemate: full hull width, a hard-raked thick front, sides tumbled in a little.
    cw = w - 0.12
    slab(m, [(CASE_X0, -cw), (CASE_X1, -cw), (CASE_X1, cw), (CASE_X0, cw)], DECK_Z, CASE_TOP,
         [(CASE_X0 + 0.1, -cw + 0.22), (CASE_X1 - 0.9, -cw + 0.22), (CASE_X1 - 0.9, cw - 0.22), (CASE_X0 + 0.1, cw - 0.22)], "armor")
    # Box mantlet at the casemate foot: the barrel root sits in it.
    m.box((CASE_X1 - 0.45, -0.6, GUN_Z - 0.45), (CASE_X1 + 0.3, 0.6, GUN_Z + 0.42), "plate")
    # Reactive-armor tiles down both casemate flanks, smoke dischargers on the cheeks.
    for s in (-1, 1):
        kit.era_tiles(m, "y", s, s * (cw - 0.04), CASE_X0 + 0.35, CASE_X1 - 0.7, DECK_Z + 0.12, CASE_TOP - 0.2, nu=6, nv=2, depth=0.1)
        kit.dischargers(m, CASE_X1 - 1.1, s * 0.95, CASE_TOP - 0.15, s)
    # Roof: boxed thermal sight right-front, panoramic sight left-rear, a remote weapon station, a hatch, a mast.
    kit.sight_box(m, CASE_X1 - 1.7, CASE_X1 - 1.05, -0.95, -0.4, CASE_TOP, CASE_TOP + 0.38)
    kit.panoramic_sight(m, CASE_X0 + 1.1, 0.85, CASE_TOP)
    kit.rws(m, CASE_X0 + 2.2, 0.55, CASE_TOP, k=0.85)
    cylinder_z(m, CASE_X0 + 1.2, -0.65, 0.32, CASE_TOP, CASE_TOP + 0.07, "plate", 14)
    kit.mast(m, CASE_X0 + 0.35, -0.3, CASE_TOP, CASE_TOP + 0.55)
    # Driver's periscope block on the glacis, hazard headlight covers on the nose corners.
    m.box((CASE_X1 + 0.6, 0.4, DECK_Z), (CASE_X1 + 1.0, 1.0, DECK_Z + 0.12), "plate")
    m.box((CASE_X1 + 0.6, 0.5, DECK_Z + 0.12), (CASE_X1 + 0.98, 0.9, DECK_Z + 0.15), "sensor")
    kit.headlights(m, HULL_X1 - 0.85, w - 0.45, DECK_Z - 0.03)
    # Engine deck: louvres beside the casemate tail, twin exhausts, a slat cage, the team strip.
    kit.louvres(m, HULL_X0 + 0.15, CASE_X0 - 0.1, -1.3, 1.3, DECK_Z, n=5, along="x")
    for s in (-1, 1):
        m.box((HULL_X0 - 0.12, s * 1.15 - 0.2, 1.0), (HULL_X0 + 0.05, s * 1.15 + 0.2, 1.4), "wheel")
    kit.slat_cage(m, HULL_X0 - 0.35, HULL_X0 - 0.05, -w + 0.3, w - 0.3, 0.55, 1.5, bars=7, faces="x")
    m.box((CASE_X0 + 0.15, -cw + 0.4, CASE_TOP), (CASE_X0 + 0.38, cw - 0.4, CASE_TOP + 0.06), "team")
    return m


def build_gun() -> Mesh:
    m = Mesh()
    kit.smoothbore(m, GUN_X0, 7.4, 0.0, GUN_Z, r=0.16, sleeve=1.4, extractor=(4.3, 5.0))
    return m


LAYERS = (("hull", build_hull), ("gun", build_gun))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True, help="unit folder; writes hull/ and gun/ inside it")
    ap.add_argument("--ss", type=int, default=4)
    ap.add_argument("--preview", help="write a contact sheet here")
    args = ap.parse_args()
    out = Path(args.out)
    kit.render_unit("jagdtiger", out, LAYERS, SCALE_FRAC, Z_MID, CY_FRAC, ss=args.ss)
    if args.preview:
        kit.contact_sheet(out, [n for n, _ in LAYERS], Path(args.preview))


if __name__ == "__main__":
    main()
