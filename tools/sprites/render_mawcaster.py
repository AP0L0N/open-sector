#!/usr/bin/env python3
"""Mawcaster: Borg spore-pod rocket artillery, the Borg answer to the Nebelwerfer. Three 16-face layers.

A long, narrow hull on four thin stilt legs (light armour: bare limbs, no
shin plates), carrying a ribbed launcher carapace with a cluster of six
organic launch tubes in front of it, a lotus-seed head angled up steeply,
each maw glowing green inside. Cold grey-green alloy, dark chitin, the Seed's
glow (borg_walker.py). The Apocalypse's layout: hull / turret / gun are passes
of one locked camera, one scale, one origin, composed by the client with
composeAligned (TIGER_OPTS: cell 128, contactY 0.92). The carapace and the pod
cluster turn on the model origin. bw.bake() then writes mawcaster-legs.png
(8 trot frames x 16), mawcaster-turret.png and mawcaster-gun.png (1 x 16).

  hull    long narrow body, small head, short tail, four stilt legs, empty ring.
  turret  ribbed launcher carapace with the cradle the pods sit in. No pods.
  gun     the six launch tubes round a fleshy boss, tilted up, lit maws.

0001 = nose screen-south, then clockwise 22.5° through 0016.

  python3 tools/sprites/render_mawcaster.py \\
      --out gridlock/packages/client/src/assets/units/mawcaster
"""

from __future__ import annotations

import argparse
import math
from pathlib import Path

import numpy as np
from render_procedural import Mesh, render_turntable

import borg_walker as bw
from borg_walker import ellipsoid, knob, leg, shell, tube, tube_x

# Meters. +x nose, +y left, +z up. Feet on z = 0. Origin = turret ring centre.
BODY = (-0.35, 0.0, 1.5)
BODY_R = (2.85, 0.9, 0.46)
RING_Z = 1.92
RING_R = 0.78
CARAPACE = (-0.55, 0.0, 2.2)
CARAPACE_R = (1.35, 0.82, 0.42)
POD_BASE = (0.55, 0.0, 2.3)  # centre of the cluster's root
POD_ELEV = math.radians(58)  # tubes tilted up from the nose
POD_LEN = 1.4
POD_RING = 0.37  # tube centres round the axis
GUN_Z = POD_BASE[2]
MUZZLE_X = POD_BASE[0] + POD_LEN * math.cos(POD_ELEV)
MUZZLE_Z = POD_BASE[2] + POD_LEN * math.sin(POD_ELEV)

SCALE_FRAC = 0.08
Z_MID = 1.5
CY_FRAC = 0.6
LAYERS = ("hull", "turret", "gun")


STRIDE = 0.65  # long thin legs, long steps
LIFT = 0.55


def build_hull(frame: int | None = None) -> Mesh:
    m = Mesh()
    ellipsoid(m, (BODY[0], 0, BODY[2] - 0.18), (BODY_R[0] * 0.92, BODY_R[1] * 0.8, 0.32), "chitin", rings=12, seg=12)
    shell(m, BODY, BODY_R, 5, team=(1, 1), seg=14)
    # Small wedge head with a ring of eyes.
    shell(m, (2.85, 0, 1.38), (0.55, 0.5, 0.32), 2, seg=12)
    for s in (-1, 1):
        knob(m, (3.28, s * 0.2, 1.5), 0.1, "eye")
        knob(m, (3.08, s * 0.38, 1.55), 0.08, "eye")
    # Short tapering tail with a glow vent.
    tube(m, (-3.05, 0, 1.5), (-3.75, 0, 1.38), 0.36, 0.14, "chitin", n=10)
    knob(m, (-3.78, 0, 1.38), 0.12, "seam")
    # Four thin stilt legs, long and splayed, no shin plates. Walk: a trot.
    # frame None = the static turntable pose.
    for s in (-1, 1):
        for i, hx in enumerate((1.45, -1.95)):
            hip = (hx, s * 0.78, 1.42)
            knee = (hx + 0.45, s * 1.75, 2.45)
            ankle = (hx - 0.15, s * 2.1, 0.6)
            foot = (hx + 0.05, s * 2.2, 0.0)
            if frame is None:
                leg(m, hip, knee, ankle, foot, r=0.2, plate=False)
            else:
                fx, fz = bw.gait(frame, (i + (s > 0)) % 2, STRIDE, LIFT)
                bw.posed_leg(m, hip, knee, ankle, foot, fx, fz, LIFT, r=0.2, plate=False)
    bw.cylinder_z(m, 0.0, 0.0, RING_R + 0.06, RING_Z - 0.05, RING_Z, "seam", 20)
    bw.cylinder_z(m, 0.0, 0.0, RING_R, RING_Z - 0.04, RING_Z + 0.04, "chitin", 20)
    return m


def build_turret() -> Mesh:
    m = Mesh()
    # Ribbed launcher carapace, longer than wide, the gray team plate on its middle rib.
    shell(m, CARAPACE, CARAPACE_R, 5, team=(2, 2), seg=16, seam=0.06)
    # A dorsal fin of short ribs down the top.
    for k in range(5):
        x = CARAPACE[0] - 0.9 + 0.42 * k
        tube(m, (x, 0, 2.55), (x - 0.18, 0, 2.82), 0.07, 0.02, "claw", n=5)
    # The cradle the pod cluster sits in: two cheek plates and a chitin cup.
    ellipsoid(m, (0.42, 0, 2.12), (0.5, 0.52, 0.3), "chitin", rings=6, seg=12)
    for s in (-1, 1):
        tube(m, (0.0, s * 0.55, 2.05), (0.75, s * 0.62, 2.4), 0.12, 0.08, "alloy_hi", n=6)
    knob(m, (CARAPACE[0] - CARAPACE_R[0] - 0.02, 0, 2.2), 0.16, "seam")
    return m


def build_gun() -> Mesh:
    m = Mesh()
    base = np.array(POD_BASE)
    ax = np.array([math.cos(POD_ELEV), 0.0, math.sin(POD_ELEV)])
    u = np.array([0.0, 1.0, 0.0])
    w = np.cross(ax, u)
    # Fleshy boss the tubes grow from.
    knob(m, base + ax * 0.15, 0.5, "limb")
    for k in range(6):
        a = 2 * math.pi * (k + 0.5) / 6
        off = (u * math.cos(a) + w * math.sin(a)) * POD_RING
        root = base + off * 0.8
        mouth = base + ax * POD_LEN + off * 1.12  # splayed a little, like a seed head
        mid = root + (mouth - root) * 0.55
        tube(m, root, mid, 0.2, 0.23, "alloy", n=10)
        tube(m, mid, mouth, 0.23, 0.21, "alloy_hi", n=10)
        d = (mouth - root) / np.linalg.norm(mouth - root)
        tube(m, mid - d * 0.06, mid + d * 0.06, 0.26, 0.26, "chitin", n=10)  # rib band
        tube(m, mouth - d * 0.04, mouth + d * 0.05, 0.24, 0.24, "chitin", n=10)  # lip
        knob(m, mouth + d * 0.03, 0.16, "core")  # the lit maw
    # A dark centre stalk between the six.
    tube(m, base + ax * 0.2, base + ax * (POD_LEN - 0.1), 0.12, 0.08, "chitin", n=6)
    knob(m, base + ax * (POD_LEN - 0.05), 0.09, "seam")
    return m


MODEL = {"boreZ": GUN_Z, "muzzleReach": round(MUZZLE_X, 3), "muzzleZ": round(MUZZLE_Z, 3), "podElevDeg": 58, "turretRingZ": RING_Z}


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
                render_turntable(build(), out / name, f"mawcaster_{name}", f"mawcaster-{name}.json", **common)
        bw.check("mawcaster", out, list(LAYERS), SCALE_FRAC, Z_MID, CY_FRAC, model=MODEL)
        bw.cameo("mawcaster", out, list(LAYERS))
        if args.check_only:
            return
    bw.bake("mawcaster", out, build_hull, SCALE_FRAC, Z_MID, CY_FRAC, ss=args.ss, jobs=args.jobs)


if __name__ == "__main__":
    main()
