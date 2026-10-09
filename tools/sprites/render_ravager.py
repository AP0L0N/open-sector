#!/usr/bin/env python3
"""Ravager: fast Borg anti-infantry walker, Feuerwirbel class. Three 16-face layers.

A low raptor-like hull on four back-bent legs with a flame nozzle under the
jaw (the hull flamer) fed from two glowing fuel pods, and a small turret
carrying a six-barrel gatling. Cold grey-green alloy, dark chitin, the Seed's
glow (borg_walker.py). The Apocalypse's layout: hull / turret / gun are
passes of one locked camera, one scale, one origin, composed by the client
with composeAligned (TIGER_OPTS: cell 128, contactY 0.92). The turret and the
gatling turn on the model origin. One frame per layer (the barrels do not
spin in the sheet; gatling-flash.ts draws the fire).

  hull    raptor body, head, jaw nozzle, fuel pods, tail spike, four legs, empty ring.
  turret  small dome with the gatling housing and its ammo drum. No barrels.
  gun     the gatling cluster: six barrels between two clamps.

0001 = nose screen-south, then clockwise 22.5° through 0016.

  python3 tools/sprites/render_ravager.py \\
      --out gridlock/packages/client/src/assets/units/ravager
"""

from __future__ import annotations

import argparse
import math
from pathlib import Path

from render_procedural import Mesh, render_turntable

import borg_walker as bw
from borg_walker import dome, ellipsoid, knob, leg, shell, tube, tube_x

# Meters. +x nose, +y left, +z up. Feet on z = 0. Origin = turret ring centre.
BODY = (-0.35, 0.0, 1.35)
BODY_R = (1.95, 1.05, 0.55)
RING_Z = 1.86
RING_R = 0.72
TURRET_X = -0.1
GUN_Z = 2.15
GUN_X0 = 0.65
MUZZLE_X = 2.75
NOZZLE = (3.35, 0.0, 0.92)

SCALE_FRAC = 0.09  # no long barrel: the hull and tail set the fit, like the Feuerwirbel
Z_MID = 1.2
CY_FRAC = 0.6
LAYERS = ("hull", "turret", "gun")


def build_hull() -> Mesh:
    m = Mesh()
    ellipsoid(m, (BODY[0], 0, BODY[2] - 0.2), (BODY_R[0] * 0.9, BODY_R[1] * 0.8, 0.38), "chitin", rings=10, seg=14)
    shell(m, BODY, BODY_R, 3, team=(0, 0), seg=16)
    # Neck and the long low head.
    tube(m, (1.3, 0, 1.3), (1.8, 0, 1.2), 0.45, 0.4, "chitin", n=10)
    shell(m, (2.25, 0, 1.18), (0.8, 0.6, 0.4), 2, seg=14)
    for s in (-1, 1):
        knob(m, (2.75, s * 0.33, 1.36), 0.13, "eye")
        knob(m, (2.45, s * 0.48, 1.42), 0.1, "eye")
    # Hull flamer: the nozzle under the jaw, a pilot glow at the tip.
    tube(m, (2.1, 0, 0.92), (3.25, 0, NOZZLE[2]), 0.2, 0.14, "barrel")
    tube_x(m, 3.15, 3.35, 0, NOZZLE[2], 0.19, "chitin", n=10)
    knob(m, (NOZZLE[0] + 0.02, 0, NOZZLE[2]), 0.11, "seam")
    # Fuel pods on the flanks, banded, glowing; a feed hose to the jaw.
    for s in (-1, 1):
        pod = (-0.75, s * 1.05, 1.42)
        ellipsoid(m, pod, (0.75, 0.32, 0.32), "core", rings=8, seg=10)
        for x in (-1.15, -0.75, -0.35):
            tube_x(m, x - 0.05, x + 0.05, s * 1.05, 1.42, 0.35, "chitin", n=10)
        tube(m, (-0.05, s * 0.95, 1.3), (2.0, s * 0.25, 0.95), 0.07, 0.07, "limb", n=5)
    # Tail spike, for balance, reads as the back.
    tube(m, (-2.1, 0, 1.45), (-3.25, 0, 1.7), 0.36, 0.06, "chitin", n=10)
    knob(m, (-2.55, 0, 1.68), 0.1, "seam")
    # Four back-bent raptor legs.
    for s in (-1, 1):
        for hx in (0.75, -1.25):
            hip = (hx, s * 0.9, 1.2)
            knee = (hx + 0.55, s * 1.75, 1.7)
            ankle = (hx - 0.35, s * 1.95, 0.55)
            foot = (hx + 0.15, s * 2.05, 0.0)
            leg(m, hip, knee, ankle, foot, r=0.24)
    bw.cylinder_z(m, 0.0, 0.0, RING_R + 0.07, RING_Z - 0.05, RING_Z, "seam", 20)
    bw.cylinder_z(m, 0.0, 0.0, RING_R, RING_Z - 0.04, RING_Z + 0.04, "chitin", 20)
    return m


def build_turret() -> Mesh:
    m = Mesh()
    seg = 16
    dome(m, TURRET_X, 0.0, RING_Z + 0.02, 0.85, 0.78, 0.55, bw.banded_dome_mat(seg, (3,), team_seg=seg // 2, team_rings=(2,)), rings=5, seg=seg, skirt=0.08)
    # Gatling housing at the front, ammo drum on the left.
    m.box((0.2, -0.32, 1.92), (0.75, 0.32, 2.4), "chitin")
    ellipsoid(m, (-0.1, 0.78, 2.12), (0.36, 0.2, 0.3), "alloy_hi", rings=6, seg=10)
    knob(m, (-0.1, 0.96, 2.12), 0.1, "seam")
    knob(m, (0.35, -0.42, 2.3), 0.1, "eye")
    return m


def build_gun() -> Mesh:
    m = Mesh()
    z = GUN_Z
    tube_x(m, GUN_X0, 0.95, 0, z, 0.25, "barrel")  # motor collar
    for k in range(6):
        a = 2 * math.pi * k / 6
        tube_x(m, 0.9, 2.65, 0.14 * math.cos(a), z + 0.14 * math.sin(a), 0.06, "barrel", n=6)
    tube_x(m, 1.45, 1.6, 0, z, 0.24, "chitin")  # mid clamp
    tube_x(m, 2.5, 2.7, 0, z, 0.24, "chitin")  # muzzle clamp
    tube_x(m, 2.68, 2.75, 0, z, 0.2, "seam")
    return m


MODEL = {"boreZ": GUN_Z, "muzzleReach": MUZZLE_X, "turretRingZ": RING_Z, "nozzleX": NOZZLE[0], "nozzleZ": NOZZLE[2]}


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
            render_turntable(build(), out / name, f"ravager_{name}", f"ravager-{name}.json", **common)
    bw.check("ravager", out, list(LAYERS), SCALE_FRAC, Z_MID, CY_FRAC, model=MODEL)
    bw.cameo("ravager", out, list(LAYERS))


if __name__ == "__main__":
    main()
