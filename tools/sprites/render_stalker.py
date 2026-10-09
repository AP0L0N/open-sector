#!/usr/bin/env python3
"""Stalker: Borg turreted walker, Tiger class. Three 16-face layers from one camera.

A low four-legged spider hull under an armoured dome turret that carries one
long disruptor barrel with a green emitter at the muzzle. Cold grey-green
alloy, dark chitin, the Seed's glow (borg_walker.py). The Apocalypse's layout:
hull / turret / gun are passes of one locked camera with one scale and one
origin, so the client composes them with one transform (composeAligned,
TIGER_OPTS: cell 128, contactY 0.92). The turret and gun turn on the model
origin. Legs are static (one frame, like every tank layer).

  hull    spider body, sensor head, four legs, an empty turret ring.
  turret  the dome with its mantlet socket. No barrel.
  gun     the disruptor: sleeve, glowing coils, prongs, and the emitter.

0001 = nose screen-south, then clockwise 22.5° through 0016.

  python3 tools/sprites/render_stalker.py \\
      --out gridlock/packages/client/src/assets/units/stalker
"""

from __future__ import annotations

import argparse
from pathlib import Path

from render_procedural import Mesh, render_turntable

import borg_walker as bw
from borg_walker import dome, ellipsoid, knob, leg, shell, tube, tube_x

# Meters. +x nose, +y left, +z up. Feet on z = 0. Origin = turret ring centre.
BODY = (-0.2, 0.0, 1.25)
BODY_R = (2.5, 1.45, 0.62)
RING_Z = 1.8
RING_R = 1.05
TURRET_X = -0.15
GUN_Z = 2.32
GUN_X0 = 0.95
MUZZLE_X = 5.85

SCALE_FRAC = 0.068  # px per meter / cell px: the barrel tip at east fits the 256 source cell
Z_MID = 1.4
CY_FRAC = 0.6
LAYERS = ("hull", "turret", "gun")


def build_hull() -> Mesh:
    m = Mesh()
    # Chitin belly, then the ribbed alloy shell over it; gray team plate on the rear rib.
    ellipsoid(m, (BODY[0], 0, BODY[2] - 0.22), (BODY_R[0] * 0.9, BODY_R[1] * 0.82, 0.42), "chitin", rings=10, seg=14)
    shell(m, BODY, BODY_R, 4, team=(0, 0))
    # Sensor head at the nose: eyes and two forward mandible blades so the front reads.
    shell(m, (2.35, 0, 1.12), (0.72, 0.82, 0.45), 2, seg=14)
    for s in (-1, 1):
        knob(m, (2.88, s * 0.32, 1.3), 0.15, "eye")
        knob(m, (2.62, s * 0.58, 1.38), 0.11, "eye")
        tube(m, (2.75, s * 0.5, 0.95), (3.45, s * 0.2, 0.7), 0.14, 0.03, "claw", n=6)
    # Rear pod with a glowing vent at the back.
    shell(m, (-3.05, 0, 1.28), (0.95, 0.9, 0.52), 2, seg=14)
    knob(m, (-4.0, 0, 1.25), 0.2, "seam")
    # Side vents on the flanks.
    for s in (-1, 1):
        tube_x(m, -1.4, -0.4, s * 1.36, 1.35, 0.1, "seam", n=6)
    # Four legs splayed at the corners, low and wide.
    for s in (-1, 1):
        leg(m, (1.0, s * 1.15, 1.2), (1.55, s * 2.3, 2.4), (2.0, s * 2.75, 0.6), (2.1, s * 2.85, 0.0), r=0.34)
        leg(m, (-1.35, s * 1.15, 1.2), (-1.85, s * 2.3, 2.4), (-2.3, s * 2.75, 0.6), (-2.4, s * 2.85, 0.0), r=0.34)
    # Turret ring, left empty for the turret sheet; a glow seam round it.
    bw.cylinder_z(m, 0.0, 0.0, RING_R + 0.08, RING_Z - 0.06, RING_Z, "seam", 24)
    bw.cylinder_z(m, 0.0, 0.0, RING_R, RING_Z - 0.04, RING_Z + 0.05, "chitin", 24)
    return m


def build_turret() -> Mesh:
    m = Mesh()
    seg = 20
    dome(m, TURRET_X, 0.0, RING_Z + 0.02, 1.4, 1.22, 0.95, bw.banded_dome_mat(seg, (3,), team_seg=seg // 2, team_rings=(2,)), rings=6, seg=seg)
    # Mantlet socket at the front where the barrel enters.
    ellipsoid(m, (0.95, 0, GUN_Z), (0.45, 0.45, 0.4), "chitin", rings=6, seg=12)
    # Sensor eyes on the dome's front, a low crest along the top.
    for s in (-1, 1):
        knob(m, (0.7, s * 0.6, 2.4), 0.13, "eye")
    m.box((TURRET_X - 0.9, -0.08, 2.7), (TURRET_X + 0.3, 0.08, 2.88), "chitin")
    # Rear power cell glowing out of the back of the dome.
    knob(m, (TURRET_X - 1.22, 0, 2.15), 0.26, "core")
    return m


def build_gun() -> Mesh:
    m = Mesh()
    z = GUN_Z
    tube_x(m, GUN_X0, 2.1, 0, z, 0.24, "barrel")  # breech sleeve
    tube_x(m, 2.1, 5.25, 0, z, 0.15, "barrel")
    for x in (2.6, 3.3, 4.0, 4.7):  # glowing coils down the barrel
        tube_x(m, x, x + 0.14, 0, z, 0.22, "seam", n=10)
        tube_x(m, x + 0.14, x + 0.22, 0, z, 0.2, "chitin", n=10)
    tube_x(m, 5.1, 5.4, 0, z, 0.24, "chitin")  # emitter collar
    for s in (-1, 1):
        tube(m, (5.3, s * 0.22, z), (5.85, s * 0.1, z + 0.02), 0.08, 0.03, "claw", n=5)
    ellipsoid(m, (5.62, 0, z), (0.24, 0.17, 0.17), "core", rings=6, seg=10)
    return m


MODEL = {"boreZ": GUN_Z, "muzzleReach": MUZZLE_X, "turretRingZ": RING_Z}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True, help="unit folder; writes hull/ turret/ gun/ inside it")
    ap.add_argument("--ss", type=int, default=4)
    ap.add_argument("--check-only", action="store_true")
    args = ap.parse_args()
    out = Path(args.out)
    if not args.check_only:
        common = dict(scale_frac=SCALE_FRAC, z_mid=Z_MID, cy_frac=CY_FRAC, ss=args.ss)
        for name, build in zip(LAYERS, (build_hull, build_turret, build_gun)):
            render_turntable(build(), out / name, f"stalker_{name}", f"stalker-{name}.json", **common)
    bw.check("stalker", out, list(LAYERS), SCALE_FRAC, Z_MID, CY_FRAC, model=MODEL)
    bw.cameo("stalker", out, list(LAYERS))


if __name__ == "__main__":
    main()
