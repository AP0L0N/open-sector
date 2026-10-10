#!/usr/bin/env python3
"""Siphon: mid-weight Xenite drain walker, between the Ravager and the Stalker. Three 16-face layers.

A low hunched four-legged hull (head hung low in front, a drooping abdomen
behind, high mantis knees) under a bulbous glowing nanite reservoir, the
"heart", held in a chitin cradle and caged by ribs. The gun is a forked drain
emitter: two long curved prongs with a green arc between the tips, fed by
two pulsing veins that run back from the emitter into the heart. Cold
grey-green alloy, dark chitin, the Seed's glow (xeno_walker.py). The
Apocalypse's layout: hull / turret / gun are passes of one locked camera, one
scale, one origin, composed by the client with composeAligned (TIGER_OPTS:
cell 128, contactY 0.92). The turret and the emitter turn on the model origin.
bw.bake() then writes siphon-legs.png (8 trot frames x 16), siphon-turret.png
and siphon-gun.png (1 x 16) at 128 px with the runtime's one transform.

  hull    hunched body, low head, abdomen, four high-kneed legs, empty ring.
  turret  the heart: glowing reservoir in a chitin cradle, rib cage, veins.
  gun     the drain emitter: socket, two curved prongs, the arc, the feed veins.

0001 = nose screen-south, then clockwise 22.5° through 0016.

  python3 tools/sprites/render_siphon.py \\
      --out gridlock/packages/client/src/assets/units/siphon
"""

from __future__ import annotations

import argparse
import math
from pathlib import Path

import numpy as np
from render_procedural import Mesh, render_turntable
from render_seed import arch

import xeno_walker as bw
from xeno_walker import dome, ellipsoid, knob, leg, shell, tube, tube_x

# Meters. +x nose, +y left, +z up. Feet on z = 0. Origin = turret ring centre.
BODY = (-0.3, 0.0, 1.3)
BODY_R = (2.15, 1.2, 0.58)
RING_Z = 1.82
RING_R = 0.82
HEART = (-0.2, 0.0, 2.6)
HEART_R = (0.98, 0.86, 0.78)
GUN_Z = 2.3
GUN_X0 = 0.55
MUZZLE_X = 3.55  # the arc between the prong tips

SCALE_FRAC = 0.082  # the prongs and abdomen set the fit, like the Ravager's tail and nozzle
Z_MID = 1.4
CY_FRAC = 0.6
LAYERS = ("hull", "turret", "gun")


STRIDE = 0.6  # half the foot's travel along the nose, m
LIFT = 0.5  # foot clearance at mid-swing, m


def build_hull(frame: int | None = None) -> Mesh:
    m = Mesh()
    ellipsoid(m, (BODY[0], 0, BODY[2] - 0.2), (BODY_R[0] * 0.9, BODY_R[1] * 0.82, 0.4), "chitin", rings=10, seg=14)
    shell(m, BODY, BODY_R, 3, team=(0, 0), seg=16)
    # Hunched: a heavy shoulder ridge, the neck dropping to a low head.
    shell(m, (1.15, 0, 1.55), (0.75, 1.0, 0.45), 2, seg=14)
    tube(m, (1.6, 0, 1.4), (2.2, 0, 0.95), 0.5, 0.4, "chitin", n=10)
    shell(m, (2.55, 0, 0.82), (0.62, 0.6, 0.38), 2, seg=14)
    for s in (-1, 1):
        knob(m, (2.98, s * 0.28, 0.98), 0.12, "eye")
        knob(m, (2.78, s * 0.45, 1.06), 0.09, "eye")
        # Short hooked mandibles under the head.
        tube(m, (2.9, s * 0.3, 0.6), (3.25, s * 0.12, 0.4), 0.11, 0.03, "claw", n=6)
    # Drooping abdomen behind, three glowing spiracles along each side.
    ellipsoid(m, (-2.75, 0, 1.0), (0.95, 0.8, 0.55), "chitin", rings=8, seg=12)
    for k in (-2.4, -2.05):
        arch(m, k - 0.35, 0, 1.0, 0.82, 0.58, 0.1, 0.12, "alloy")
    knob(m, (-3.68, 0, 0.88), 0.17, "seam")
    for s in (-1, 1):
        for x in (-1.6, -1.0, -0.4):
            knob(m, (x, s * 1.13, 1.38), 0.09, "seam")
    # Four legs with high mantis knees. Walk: a trot, diagonal pairs together.
    # frame None = the static turntable pose.
    for s in (-1, 1):
        for i, hx in enumerate((0.9, -1.45)):
            hip = (hx, s * 0.95, 1.25)
            knee = (hx + 0.35, s * 1.95, 2.35)
            ankle = (hx - 0.1, s * 2.35, 0.55)
            foot = (hx + 0.1, s * 2.45, 0.0)
            if frame is None:
                leg(m, hip, knee, ankle, foot, r=0.28)
            else:
                fx, fz = bw.gait(frame, (i + (s > 0)) % 2, STRIDE, LIFT)
                bw.posed_leg(m, hip, knee, ankle, foot, fx, fz, LIFT, r=0.28)
    bw.cylinder_z(m, 0.0, 0.0, RING_R + 0.07, RING_Z - 0.05, RING_Z, "seam", 20)
    bw.cylinder_z(m, 0.0, 0.0, RING_R, RING_Z - 0.04, RING_Z + 0.04, "chitin", 20)
    return m


def build_turret() -> Mesh:
    m = Mesh()
    seg = 16
    # Chitin cradle with the gray team plate at the back.
    dome(m, HEART[0], 0.0, RING_Z + 0.02, 0.92, 0.84, 0.32, bw.banded_dome_mat(seg, (), team_seg=seg // 2, team_rings=(1, 2)), rings=3, seg=seg, skirt=0.1)
    # The heart: a big glowing reservoir.
    ellipsoid(m, HEART, HEART_R, "core", rings=12, seg=16)
    # Rib cage over it, front to back.
    for x in (-0.75, -0.2, 0.35):
        t = (x - HEART[0]) / HEART_R[0]
        k = math.sqrt(max(0.0, 1 - t * t))
        arch(m, x, 0.0, HEART[2] - 0.15, HEART_R[1] * k + 0.06, HEART_R[2] * k + 0.18, 0.09, 0.1, "chitin")
    # A dark spine along the top, veins over the flanks.
    tube(m, (HEART[0] - 0.95, 0, HEART[2] + 0.45), (HEART[0] + 0.7, 0, HEART[2] + 0.62), 0.1, 0.07, "chitin", n=6)
    for s in (-1, 1):
        pts = [(0.55, s * 0.35, 2.3), (0.15, s * 0.75, 2.55), (-0.45, s * 0.85, 2.75), (-1.0, s * 0.45, 2.85)]
        for a, b in zip(pts, pts[1:]):
            tube(m, a, b, 0.07, 0.07, "limb", n=5)
            knob(m, b, 0.09, "seam")
    # Front socket the emitter plugs into.
    ellipsoid(m, (0.6, 0, GUN_Z), (0.32, 0.36, 0.3), "chitin", rings=6, seg=10)
    return m


def curve(p0, p1, p2, n: int) -> list[np.ndarray]:
    p0, p1, p2 = (np.asarray(p, float) for p in (p0, p1, p2))
    return [(1 - t) ** 2 * p0 + 2 * (1 - t) * t * p1 + t * t * p2 for t in np.linspace(0, 1, n)]


def build_gun() -> Mesh:
    m = Mesh()
    z = GUN_Z
    tube_x(m, GUN_X0, 1.25, 0, z, 0.22, "barrel")  # emitter root
    tube_x(m, 1.1, 1.3, 0, z, 0.26, "chitin")
    knob(m, (1.32, 0, z), 0.16, "core")
    for s in (-1, 1):
        # A long prong bowing out and curling back in, tapering to a claw tip.
        pts = curve((1.2, s * 0.18, z), (2.4, s * 0.95, z + 0.12), (3.6, s * 0.3, z + 0.02), 7)
        n = len(pts) - 1
        for i, (a, b) in enumerate(zip(pts, pts[1:])):
            r0 = 0.21 - 0.14 * i / n
            r1 = 0.21 - 0.14 * (i + 1) / n
            tube(m, a, b, r0, r1, "claw" if i >= n - 1 else "barrel", n=6)
        for i in (2, 4):
            knob(m, pts[i] + np.array([0, 0, 0.07]), 0.08, "seam")
        knob(m, pts[-1], 0.08, "eye")
        # Pulsing veins from the emitter root back into the heart: glow beads on a dark tube.
        vein = curve((1.25, s * 0.2, z - 0.05), (0.75, s * 0.45, z - 0.18), (0.15, s * 0.5, z - 0.05), 5)
        for a, b in zip(vein, vein[1:]):
            tube(m, a, b, 0.065, 0.065, "limb", n=5)
        for p in vein[1:]:
            knob(m, p, 0.09, "seam")
    # The drain arc between the tips: a jagged bolt.
    arc = [(3.5, -0.27, z), (3.62, -0.12, z + 0.1), (3.45, 0.0, z - 0.04), (3.6, 0.13, z + 0.09), (3.5, 0.27, z)]
    for a, b in zip(arc, arc[1:]):
        tube(m, a, b, 0.075, 0.075, "seam", n=6)
    for p in arc[1:-1]:
        knob(m, p, 0.1, "core")
    knob(m, (3.52, 0, z + 0.02), 0.15, "core")
    return m


MODEL = {"boreZ": GUN_Z, "muzzleReach": MUZZLE_X, "turretRingZ": RING_Z}


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
                render_turntable(build(), out / name, f"siphon_{name}", f"siphon-{name}.json", **common)
        bw.check("siphon", out, list(LAYERS), SCALE_FRAC, Z_MID, CY_FRAC, model=MODEL)
        bw.cameo("siphon", out, list(LAYERS))
        if args.check_only:
            return
    bw.bake("siphon", out, build_hull, SCALE_FRAC, Z_MID, CY_FRAC, ss=args.ss, jobs=args.jobs)


if __name__ == "__main__":
    main()
