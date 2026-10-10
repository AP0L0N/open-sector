#!/usr/bin/env python3
"""Broodmother: slow Borg living hatchery, between the Stalker and the Behemoth. Three 16-face layers.

A low six-legged hull on short legs carrying a huge brood sac on its back: a
translucent green egg skin over a glowing yolk with dark curled embryos
inside, held in a chitin cradle and a few ribs. No weapon. Cold grey-green
alloy, dark chitin, the Seed's glow (borg_walker.py). The Apocalypse's
layout: hull / turret / gun are passes of one locked camera, one scale, one
origin, composed by the client with composeAligned (TIGER_OPTS: cell 128,
contactY 0.92). The sac and the crown turn on the model origin (the client
need hardly turn them). bw.bake() then writes broodmother-legs.png (8 trot
frames x 16), broodmother-turret.png and broodmother-gun.png (1 x 16).

  hull    low wide body, small head with feelers, six short legs, empty ring.
  turret  the brood sac: cradle, yolk, embryos, translucent skin, ribs, veins.
  gun     a small crown of spines on the sac's front crest round a short birth
          chute leaning forward, a glowing lip at its mouth. On the front crest
          (not the rear) so the client's gun-behind draw order is the true one.

0001 = nose screen-south, then clockwise 22.5° through 0016.

  python3 tools/sprites/render_broodmother.py \\
      --out gridlock/packages/client/src/assets/units/broodmother
"""

from __future__ import annotations

import argparse
import math
from pathlib import Path

import numpy as np
import render_procedural as rp
import render_seed as rs
from render_procedural import Mesh, render_turntable
from render_seed import arch

import borg_walker as bw
from borg_walker import dome, ellipsoid, knob, leg, shell, tube, tube_x

# The brood sac: a lit translucent egg skin, a glowing yolk, dark embryos.
rp.MAT.update(
    {
        "sac": (rp.hex_rgb("#b8ffc4"), 0.0, 0.4),
        "yolk": (rp.hex_rgb("#2c9150"), 0.0, 1.0),
        "embryo": (rp.hex_rgb("#101a12"), 0.1, 1.0),
    }
)
rs.EMISSIVE.update({"sac", "yolk"})

# Meters. +x nose, +y left, +z up. Feet on z = 0. Origin = turret ring centre.
BODY = (-0.2, 0.0, 1.2)
BODY_R = (3.1, 1.9, 0.62)
RING_Z = 1.72
RING_R = 1.45
SAC = (-0.35, 0.0, 3.0)
SAC_R = (2.55, 1.85, 1.32)
CREST = (0.95, 0.0, 4.12)  # front crest of the sac, where the gun layer sits
CHUTE_TIP = (1.75, 0.0, 4.75)

SCALE_FRAC = 0.07  # the Behemoth's: the six legs and the sac set the fit
Z_MID = 1.9
CY_FRAC = 0.62
LAYERS = ("hull", "turret", "gun")


STRIDE = 0.45  # half the foot's travel along the nose, m (short legs, short steps)
LIFT = 0.45  # foot clearance at mid-swing, m


def build_hull(frame: int | None = None) -> Mesh:
    m = Mesh()
    ellipsoid(m, (BODY[0], 0, BODY[2] - 0.25), (BODY_R[0] * 0.92, BODY_R[1] * 0.85, 0.45), "chitin", rings=12, seg=16)
    shell(m, BODY, BODY_R, 4, team=(0, 0), seg=20)
    # Small low head with eyes and two long feelers.
    shell(m, (3.15, 0, 0.95), (0.6, 0.85, 0.42), 2, seg=14)
    for s in (-1, 1):
        knob(m, (3.62, s * 0.3, 1.1), 0.12, "eye")
        knob(m, (3.4, s * 0.58, 1.18), 0.1, "eye")
        tube(m, (3.55, s * 0.4, 1.2), (4.25, s * 0.95, 1.55), 0.07, 0.03, "claw", n=5)
        tube(m, (3.7, s * 0.25, 0.75), (4.05, s * 0.12, 0.5), 0.1, 0.03, "claw", n=6)
    # Rear: a ribbed cloaca vent, glowing.
    tube(m, (-3.2, 0, 1.15), (-3.75, 0, 0.95), 0.6, 0.38, "chitin", n=12)
    knob(m, (-3.8, 0, 0.95), 0.3, "seam")
    # Spiracles along the flanks.
    for s in (-1, 1):
        for x in (-2.2, -1.4, -0.6, 0.2, 1.0, 1.8):
            knob(m, (x, s * 1.78, 1.2), 0.1, "seam")
    # Six short legs, splayed. Walk: alternating tripods. frame None = the static turntable pose.
    for s in (-1, 1):
        for i, (hx, dx) in enumerate(((1.9, 0.45), (-0.2, 0.0), (-2.3, -0.45))):
            hip = (hx, s * 1.6, 1.05)
            knee = (hx + dx * 0.5, s * 2.5, 1.85)
            ankle = (hx + dx * 0.9, s * 2.85, 0.45)
            foot = (hx + dx, s * 2.95, 0.0)
            if frame is None:
                leg(m, hip, knee, ankle, foot, r=0.36)
            else:
                fx, fz = bw.gait(frame, (i + (s > 0)) % 2, STRIDE, LIFT)
                bw.posed_leg(m, hip, knee, ankle, foot, fx, fz, LIFT, r=0.36)
    bw.cylinder_z(m, 0.0, 0.0, RING_R + 0.09, RING_Z - 0.07, RING_Z, "seam", 28)
    bw.cylinder_z(m, 0.0, 0.0, RING_R, RING_Z - 0.05, RING_Z + 0.05, "chitin", 28)
    return m


def embryo(m: Mesh, c, along: float, up: float) -> None:
    """A curled dark grub: body, head knob, a tail hooked under."""
    c = np.asarray(c, float)
    ca, sa = math.cos(along), math.sin(along)
    ax = np.array([ca, sa, 0.0])
    ellipsoid_rot(m, c, (0.55, 0.34, 0.3), ax)
    knob(m, c + ax * 0.55 + np.array([0, 0, 0.1 * up]), 0.27, "embryo")
    tube(m, c - ax * 0.45, c - ax * 0.75 + np.array([0, 0, -0.28 * up]), 0.2, 0.07, "embryo", n=6)


def ellipsoid_rot(m: Mesh, c, r, ax) -> None:
    """ellipsoid() with its long axis along the ground direction `ax` (dark embryo body)."""
    rx, ry, rz = r
    side = np.array([-ax[1], ax[0], 0.0])
    rings = []
    for i in range(9):
        t = -1 + 2 * i / 8
        k = max(math.sqrt(max(0.0, 1 - t * t)), 0.06)
        rings.append([c + ax * rx * t + side * ry * k * math.cos(2 * math.pi * s / 10) + np.array([0, 0, rz * k * math.sin(2 * math.pi * s / 10)]) for s in range(10)])
    m.loft(rings, "embryo")


def build_turret() -> Mesh:
    m = Mesh()
    seg = 24
    # Chitin cradle the sac sits in, gray team plate at the front.
    dome(m, SAC[0], 0.0, RING_Z + 0.02, SAC_R[0] * 0.78, SAC_R[1] * 0.85, 0.55, bw.banded_dome_mat(seg, (3,), team_seg=0, team_rings=(2,)), rings=4, seg=seg, skirt=0.12)
    # Glowing yolk inside the skin.
    ellipsoid(m, SAC, (SAC_R[0] * 0.8, SAC_R[1] * 0.8, SAC_R[2] * 0.8), "yolk", rings=14, seg=20)
    # Embryos pressed against the skin (they break the yolk; the skin lies over them).
    for (u, v, w, along) in ((0.45, 0.55, 0.35, 0.4), (-0.35, 0.6, 0.4, 2.6), (0.1, -0.62, 0.38, -0.5),
                             (-0.55, -0.45, 0.35, 3.6), (0.0, 0.0, 0.85, 1.2), (0.62, -0.1, 0.6, 0.0),
                             (-0.7, 0.1, 0.55, 3.0)):
        d = np.array([u, v, w])
        d /= np.linalg.norm(d)
        p = np.array(SAC) + d * np.array(SAC_R) * 0.62
        embryo(m, p, along, 1.0)
    # The translucent egg skin.
    ellipsoid(m, SAC, SAC_R, "sac", rings=16, seg=22)
    # A ring of small eggs laid round the cradle rim.
    for k in range(9):
        a = 2 * math.pi * (k + 0.5) / 9
        c = (SAC[0] + SAC_R[0] * 0.86 * math.cos(a), SAC_R[1] * 0.92 * math.sin(a), RING_Z + 0.45)
        knob(m, c, 0.17, "yolk")
        ellipsoid(m, c, (0.3, 0.26, 0.26), "sac", rings=6, seg=10)
    # Ribs holding the sac, and dark veins over it.
    for x in (-1.6, 0.9):
        t = (x - SAC[0]) / SAC_R[0]
        k = math.sqrt(max(0.0, 1 - t * t))
        arch(m, x, 0.0, SAC[2] - 0.35, SAC_R[1] * k + 0.08, SAC_R[2] * k + 0.38, 0.12, 0.13, "chitin")
    return m


def build_gun() -> Mesh:
    """On the sac's front crest, so the client's gun-behind order (rows 5-11) is the true occlusion."""
    m = Mesh()
    top = np.array(CREST)
    tip = np.array(CHUTE_TIP)
    ax = (tip - top) / np.linalg.norm(tip - top)
    knob(m, top, 0.34, "chitin")
    # Crown of short spines round the chute's root.
    for k in range(7):
        a = 2 * math.pi * k / 7
        base = top + np.array([0.3 * math.cos(a), 0.3 * math.sin(a), 0.05])
        sp = top + np.array([0.62 * math.cos(a), 0.62 * math.sin(a), 0.55])
        tube(m, base, sp, 0.1, 0.02, "claw", n=5)
    # Short ribbed birth chute leaning forward, a glowing lip at its mouth.
    for i in range(3):
        p0 = top + (tip - top) * i / 3
        p1 = top + (tip - top) * (i + 1) / 3
        tube(m, p0, p1, 0.3 - 0.03 * i, 0.28 - 0.03 * (i + 1), "chitin" if i % 2 == 0 else "alloy", n=10)
    tube(m, tip - ax * 0.05, tip + ax * 0.08, 0.26, 0.26, "seam", n=10)
    knob(m, tip + ax * 0.05, 0.17, "core")
    return m


MODEL = {"turretRingZ": RING_Z, "chuteX": CHUTE_TIP[0], "chuteZ": CHUTE_TIP[2], "sacTopZ": SAC[2] + SAC_R[2]}


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
                render_turntable(build(), out / name, f"broodmother_{name}", f"broodmother-{name}.json", **common)
        bw.check("broodmother", out, list(LAYERS), SCALE_FRAC, Z_MID, CY_FRAC, model=MODEL, ref_draw_px_per_m=5.4)
        bw.cameo("broodmother", out, list(LAYERS))
        if args.check_only:
            return
    bw.bake("broodmother", out, build_hull, SCALE_FRAC, Z_MID, CY_FRAC, ss=args.ss, jobs=args.jobs)


if __name__ == "__main__":
    main()
