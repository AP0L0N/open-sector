#!/usr/bin/env python3
"""Behemoth: Xenite heavy assault walker, Jagdtiger / Apocalypse class. Three 16-face layers.

A big six-legged carapace under a wide turret with twin disruptor barrels.
Cold grey-green alloy, dark chitin, the Seed's glow (xeno_walker.py). The
Apocalypse's layout and twin-gun convention: hull / turret / gun are passes of
one locked camera, one scale, one origin; both barrels sit in the gun layer
(side by side, GUN_Y off the centre line) so they recoil together. The client
composes them with composeAligned (TIGER_OPTS: cell 128, contactY 0.92), as it
does the Apocalypse. The turret and gun turn on the model origin.

  hull    segmented carapace, prow head, glowing sacs under ribs, six legs, empty ring.
  turret  wide low dome with two mantlet sockets and a rear power cell. No barrels.
  gun     the two barrels: sleeves, glowing coils, prongs, emitters.

0001 = nose screen-south, then clockwise 22.5° through 0016.

  python3 tools/sprites/render_behemoth.py \\
      --out gridlock/packages/client/src/assets/units/behemoth
"""

from __future__ import annotations

import argparse
import math
from pathlib import Path

from render_procedural import Mesh, render_turntable
from render_seed import arch

import xeno_walker as bw
from xeno_walker import dome, ellipsoid, knob, leg, shell, tube, tube_x

# Meters. +x nose, +y left, +z up. Feet on z = 0. Origin = turret ring centre.
BODY = (-0.4, 0.0, 1.85)
BODY_R = (3.7, 2.15, 0.92)
RING_Z = 2.68
RING_R = 1.6
TURRET_X = -0.35
GUN_Z = 3.32
GUN_Y = 0.78
GUN_X0 = 1.55
MUZZLE_X = 6.5

SCALE_FRAC = 0.07  # the Apocalypse's: the twin barrel tips at east fit the 256 source cell
Z_MID = 1.8
CY_FRAC = 0.6
LAYERS = ("hull", "turret", "gun")


STRIDE = 0.7  # half the foot's travel along the nose, m
LIFT = 0.75  # foot clearance at mid-swing, m


def build_hull(frame: int | None = None) -> Mesh:
    m = Mesh()
    ellipsoid(m, (BODY[0], 0, BODY[2] - 0.35), (BODY_R[0] * 0.9, BODY_R[1] * 0.85, 0.6), "chitin", rings=12, seg=16)
    shell(m, BODY, BODY_R, 5, team=(0, 0), seg=20)
    # Prow head: a broad armoured wedge with two rows of eyes and tusks.
    shell(m, (3.45, 0, 1.6), (1.0, 1.3, 0.62), 2, seg=16)
    for s in (-1, 1):
        for k, (dx, dy, dz) in enumerate(((0.75, 0.35, 0.22), (0.55, 0.7, 0.3), (0.3, 0.98, 0.32))):
            knob(m, (3.45 + dx, s * dy, 1.6 + dz), 0.15 - 0.02 * k, "eye")
        tube(m, (4.1, s * 0.75, 1.3), (5.0, s * 0.45, 0.85), 0.2, 0.04, "claw", n=6)
    # Glowing sacs on the rear flanks, armour ribs arched over them.
    for s in (-1, 1):
        sac = (-2.75, s * 1.15, 2.45)
        sac_r = (0.95, 0.62, 0.55)
        ellipsoid(m, sac, sac_r, "core", rings=8, seg=12)
        for ax in (-3.25, -2.3):
            k = math.sqrt(max(0.0, 1 - ((ax - sac[0]) / sac_r[0]) ** 2))
            arch(m, ax, sac[1], sac[2] - 0.08, sac_r[1] * k + 0.05, sac_r[2] * k + 0.05, 0.12, 0.14, "chitin")
    # Tail: a spiked vent.
    tube(m, (-3.9, 0, 1.9), (-4.6, 0, 1.6), 0.55, 0.25, "chitin")
    knob(m, (-4.65, 0, 1.6), 0.24, "seam")
    # Six heavy legs, splayed wide. Walk: alternating tripods (left front + right middle +
    # left rear, then the other three). frame None = the static turntable pose.
    for s in (-1, 1):
        for i, (hip_x, dx) in enumerate(((1.9, 0.9), (-0.3, 0.0), (-2.4, -0.9))):
            hip = (hip_x, s * 1.8, 1.7)
            knee = (hip_x + dx * 0.6, s * 3.25, 3.15)
            ankle = (hip_x + dx * 1.05, s * 3.85, 0.75)
            foot = (hip_x + dx * 1.15, s * 3.95, 0.0)
            if frame is None:
                leg(m, hip, knee, ankle, foot, r=0.44)
            else:
                fx, fz = bw.gait(frame, (i + (s > 0)) % 2, STRIDE, LIFT)
                bw.posed_leg(m, hip, knee, ankle, foot, fx, fz, LIFT, r=0.44)
    # Turret ring, left empty.
    bw.cylinder_z(m, 0.0, 0.0, RING_R + 0.1, RING_Z - 0.08, RING_Z, "seam", 28)
    bw.cylinder_z(m, 0.0, 0.0, RING_R, RING_Z - 0.06, RING_Z + 0.06, "chitin", 28)
    return m


def build_turret() -> Mesh:
    m = Mesh()
    seg = 24
    dome(m, TURRET_X, 0.0, RING_Z + 0.02, 2.05, 1.85, 0.95, bw.banded_dome_mat(seg, (3,), team_seg=seg // 2, team_rings=(2,)), rings=6, seg=seg, skirt=0.2)
    # Twin mantlet sockets across the front.
    for s in (-1, 1):
        ellipsoid(m, (1.45, s * GUN_Y, GUN_Z), (0.55, 0.48, 0.45), "chitin", rings=6, seg=12)
    # Eyes between the sockets, a crest, the rear power cell.
    knob(m, (1.55, 0, 3.55), 0.16, "eye")
    m.box((TURRET_X - 1.3, -0.1, 3.72), (TURRET_X + 0.6, 0.1, 3.92), "chitin")
    for s in (-1, 1):
        m.box((TURRET_X - 1.0, s * 1.05 - 0.2, 3.4), (TURRET_X + 0.2, s * 1.05 + 0.2, 3.52), "chitin")
    knob(m, (TURRET_X - 1.95, 0, 3.15), 0.36, "core")
    return m


def build_gun() -> Mesh:
    m = Mesh()
    z = GUN_Z
    for s in (-1, 1):
        y = s * GUN_Y
        tube_x(m, GUN_X0, 2.9, y, z, 0.3, "barrel")
        tube_x(m, 2.9, 5.9, y, z, 0.19, "barrel")
        for x in (3.3, 4.0, 4.7, 5.35):
            tube_x(m, x, x + 0.15, y, z, 0.27, "seam", n=10)
            tube_x(m, x + 0.15, x + 0.24, y, z, 0.25, "chitin", n=10)
        tube_x(m, 5.8, 6.1, y, z, 0.3, "chitin")
        for p in (-1, 1):
            tube(m, (6.0, y + p * 0.24, z), (6.5, y + p * 0.12, z + 0.02), 0.09, 0.03, "claw", n=5)
        ellipsoid(m, (6.28, y, z), (0.27, 0.2, 0.2), "core", rings=6, seg=10)
    return m


MODEL = {"boreZ": GUN_Z, "muzzleReach": MUZZLE_X, "gunY": GUN_Y, "turretRingZ": RING_Z}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True, help="unit folder; writes hull/ turret/ gun/ inside it")
    ap.add_argument("--ss", type=int, default=4)
    ap.add_argument("--check-only", action="store_true")
    ap.add_argument("--walk-only", action="store_true", help="keep the turntable folders; bake only the walk sheets")
    ap.add_argument("--jobs", type=int, default=8)
    args = ap.parse_args()
    out = Path(args.out)
    if not args.walk_only:
        if not args.check_only:
            common = dict(scale_frac=SCALE_FRAC, z_mid=Z_MID, cy_frac=CY_FRAC, ss=args.ss)
            for name, build in zip(LAYERS, (build_hull, build_turret, build_gun)):
                render_turntable(build(), out / name, f"behemoth_{name}", f"behemoth-{name}.json", **common)
        bw.check("behemoth", out, list(LAYERS), SCALE_FRAC, Z_MID, CY_FRAC, model=MODEL, ref_draw_px_per_m=6.0)
        bw.cameo("behemoth", out, list(LAYERS))
        if args.check_only:
            return
    bw.bake("behemoth", out, build_hull, SCALE_FRAC, Z_MID, CY_FRAC, ss=args.ss, jobs=args.jobs)


if __name__ == "__main__":
    main()
