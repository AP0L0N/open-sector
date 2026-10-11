#!/usr/bin/env python3
"""Warden: the Alliance main battle tank, three 16-face layers from one camera.

Modern line (render_alliance_kit.py): a low flat hull with a long shallow glacis,
full side skirts over the road wheels, a wedge-nosed turret with a flat roof, a
boxed thermal sight, a panoramic sight, a remote weapon station, smoke
dischargers on both cheeks, a slat bustle rack, and reactive-armor tiles on the
turret flanks. The 120mm smoothbore has a thermal sleeve and a fume extractor,
no muzzle brake. The reference look for the line: lock the others to this.

All three layers are passes of one locked camera with one scale and one origin
(the turret ring), so the client composes them with one transform and the gun
recoils in place. 0001 = nose screen-south, then clockwise 22.5° through 0016.

Chassis is the neutral gray the game tints. No insignia.

  python tools/sprites/render_warden.py \\
      --out gridlock/packages/client/src/assets/units/warden
"""

from __future__ import annotations

import argparse
from pathlib import Path

import render_alliance_kit as kit
from render_alliance_kit import Mesh, cylinder_z, slab

# Meters. +x nose, +y left, +z up. Tracks on z = 0. Origin = turret ring centre.
HULL_X0, HULL_X1 = -3.6, 3.9  # rear, nose
TRACK_Y0, TRACK_Y1 = 1.15, 1.8
DECK_Z = 1.55  # hull roof and turret ring
TURRET_TOP = 2.35
GUN_Z = 2.0
SCALE_FRAC = 0.065
Z_MID = 1.3
CY_FRAC = 0.6


def build_hull() -> Mesh:
    m = Mesh()
    kit.tracks(m, HULL_X0, HULL_X1, TRACK_Y0, TRACK_Y1, wheel_r=0.4, wheels=7, skirt_z=(0.45, 1.2))
    w = TRACK_Y1 + 0.15
    # Lower tub and a short sloped lower nose.
    m.box((HULL_X0 + 0.1, -TRACK_Y0, 0.3), (HULL_X1 - 0.9, TRACK_Y0, 1.1), "plate")
    slab(m, [(HULL_X1 - 0.9, -TRACK_Y0), (HULL_X1 - 0.2, -TRACK_Y0), (HULL_X1 - 0.2, TRACK_Y0), (HULL_X1 - 0.9, TRACK_Y0)], 0.3, 1.1,
         [(HULL_X1 - 0.9, -TRACK_Y0), (HULL_X1 + 0.1, -TRACK_Y0), (HULL_X1 + 0.1, TRACK_Y0), (HULL_X1 - 0.9, TRACK_Y0)], "plate")
    # Upper hull: a long shallow glacis that runs almost to the turret ring.
    slab(m, [(HULL_X0, -w), (HULL_X1 + 0.1, -w), (HULL_X1 + 0.1, w), (HULL_X0, w)], 1.1, DECK_Z,
         [(HULL_X0 + 0.05, -w + 0.12), (HULL_X1 - 1.9, -w + 0.12), (HULL_X1 - 1.9, w - 0.12), (HULL_X0 + 0.05, w - 0.12)], "armor")
    # Driver's periscope block and the glacis tool stowage ridge.
    m.box((HULL_X1 - 2.0, 0.35, DECK_Z), (HULL_X1 - 1.6, 0.95, DECK_Z + 0.12), "plate")
    m.box((HULL_X1 - 2.0, 0.45, DECK_Z + 0.12), (HULL_X1 - 1.62, 0.85, DECK_Z + 0.15), "sensor")
    # Engine deck louvres and twin rear exhausts.
    kit.louvres(m, HULL_X0 + 0.3, HULL_X0 + 1.5, -1.3, 1.3, DECK_Z, n=5, along="x")
    for s in (-1, 1):
        m.box((HULL_X0 - 0.12, s * 1.1 - 0.2, 0.95), (HULL_X0 + 0.05, s * 1.1 + 0.2, 1.35), "wheel")
    # Rear slat cage over the engine bay doors.
    kit.slat_cage(m, HULL_X0 - 0.35, HULL_X0 - 0.05, -w + 0.3, w - 0.3, 0.55, 1.4, bars=7, faces="x")
    # Team strip across the rear deck edge, and the hazard headlight covers up front.
    m.box((HULL_X0 + 0.1, -w + 0.3, DECK_Z), (HULL_X0 + 0.25, w - 0.3, DECK_Z + 0.05), "team")
    kit.headlights(m, HULL_X1 - 0.85, w - 0.4, DECK_Z - 0.05)
    # Turret ring at the origin, left for the turret layer.
    cylinder_z(m, 0.0, 0.0, 1.25, DECK_Z, DECK_Z + 0.06, "wheel", 24)
    return m


def build_turret() -> Mesh:
    m = Mesh()
    z0 = DECK_Z + 0.05
    # Wedge nose, flat flanks, a squared-off bustle. Roof a little smaller: the sides tumble in.
    bottom = [(2.2, 0.0), (1.4, -1.35), (-1.6, -1.45), (-2.2, -1.1), (-2.2, 1.1), (-1.6, 1.45), (1.4, 1.35)]
    top = [(1.9, 0.0), (1.15, -1.15), (-1.5, -1.25), (-2.05, -0.95), (-2.05, 0.95), (-1.5, 1.25), (1.15, 1.15)]
    slab(m, bottom, z0, TURRET_TOP, top, "armor")
    # Mantlet: a low box in the nose notch the gun layer grows out of.
    m.box((1.55, -0.4, GUN_Z - 0.32), (2.3, 0.4, GUN_Z + 0.3), "plate")
    # Reactive-armor tiles on both flanks.
    for s in (-1, 1):
        kit.era_tiles(m, "y", s, s * 1.4, -1.3, 1.0, z0 + 0.12, TURRET_TOP - 0.2, nu=5, nv=2, depth=0.1)
        kit.dischargers(m, 1.0, s * 0.9, TURRET_TOP - 0.15, s)
    # Gunner's thermal sight box, right front of the roof; commander's panoramic sight, left rear.
    kit.sight_box(m, 0.55, 1.15, -0.95, -0.4, TURRET_TOP, TURRET_TOP + 0.38)
    kit.panoramic_sight(m, -0.9, 0.75, TURRET_TOP)
    # Remote weapon station on the roof centre, a hatch beside it, and a sensor mast at the back.
    kit.rws(m, -0.4, -0.55, TURRET_TOP, k=0.85)
    cylinder_z(m, -0.5, 0.6, 0.32, TURRET_TOP, TURRET_TOP + 0.07, "plate", 14)
    kit.mast(m, -1.7, -0.6, TURRET_TOP, TURRET_TOP + 0.55)
    # Slat bustle rack with a neutral team panel on its back.
    kit.slat_cage(m, -3.0, -2.2, -1.0, 1.0, z0 + 0.15, TURRET_TOP - 0.1, bars=5, faces="xy")
    m.box((-3.03, -0.7, z0 + 0.3), (-2.98, 0.7, TURRET_TOP - 0.3), "team")
    return m


def build_gun() -> Mesh:
    m = Mesh()
    kit.smoothbore(m, 1.9, 6.4, 0.0, GUN_Z, r=0.13, sleeve=1.1, extractor=(3.9, 4.5))
    return m


LAYERS = (("hull", build_hull), ("turret", build_turret), ("gun", build_gun))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True, help="unit folder; writes hull/ turret/ gun/ inside it")
    ap.add_argument("--ss", type=int, default=4)
    ap.add_argument("--preview", help="write a contact sheet here")
    args = ap.parse_args()
    out = Path(args.out)
    kit.render_unit("warden", out, LAYERS, SCALE_FRAC, Z_MID, CY_FRAC, ss=args.ss)
    if args.preview:
        kit.contact_sheet(out, [n for n, _ in LAYERS], Path(args.preview))


if __name__ == "__main__":
    main()
