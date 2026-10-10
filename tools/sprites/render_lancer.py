#!/usr/bin/env python3
"""
Xenite Lancer unit sheets — anti-armour cyborg on the Cyborg's lock.

Same camera, cell, contact points, and row order as render_cyborg.py (and the
Xenite Drone in render_xenodrone.py, whose palette and helpers it shares), so the
client reuses the Cyborg's sprite defs with new file names. Upright and broad:
big chitin pauldrons rimmed in pale steel, grey-green alloy limbs, a narrow
green visor slit and a targeting monocle on the right, a sickly green capacitor
ring standing on a hub on the back, and a long lance tube (plasma launcher)
carried on the right shoulder pointing forward, a green conduit along its top
and a forked emitter at the front. Fire frames kick the tube back and throw a
green plasma flash at the emitter (big / small / big / tiny) with a small vent
puff out of the rear; the ring burns bright on the hard shots.

  python tools/sprites/render_lancer.py            # every sheet
  python tools/sprites/render_lancer.py walk fire  # some sheets

Sheets: walk (8), fire (4), crawl (8, legs torn off, tube along the ground),
crawl-fire (4), die (4), swim (8). Writes
gridlock/packages/client/src/assets/units/lancer-*.png (plus lancer-cameo.png),
the east lock at tools/sprites/src/lancer-east.png, and previews/manifests in
tools/sprites/preview/. Exits 2 if a row is empty or clipped.
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.dont_write_bytecode = True
import render_xenodrone as B  # noqa: E402  (registers the Xenite palette on render_cyborg)

R = B.R
CELL = B.CELL
WL_Y = B.WL_Y
Cloud = R.Cloud
ellipsoid, capsule, cylinder, box = R.ellipsoid, R.capsule, R.cylinder, R.box
rot_x, rot_y, rot_z = R.rot_x, R.rot_y, R.rot_z
along, cable, ring, flash_star = B.along, B.cable, B.ring, B.flash_star

STAND_SCALE = 1.2  # the Cyborg's own: a heavy frame
PRONE_SCALE = STAND_SCALE * 22 / 28
HIP_Z = 33.0
WATER_Z = 41.0
TUBE_LEN = 29.0
TUBE_DIP = -0.07  # the tube noses down a touch


# ---------------------------------------------------------------- parts


def lc_head(c: Cloud, at, Rm=None, lit: bool = True) -> None:
    """Broad chitin skull, alloy face, a green visor slit, a monocle on the right."""
    at = np.asarray(at, float)
    Rm = np.eye(3) if Rm is None else Rm
    P = lambda *v: at + Rm @ np.array(v, float)  # noqa: E731
    glow = "optic" if lit else "dead_glow"
    ellipsoid(c, at, (4.6, 4.2, 4.8), "chitin", rot=Rm)
    box(c, P(3.2, 0, -1.4), (1.5, 3.0, 2.4), "alloy", rot=Rm)  # face
    box(c, P(4.5, 0, 0.6), (0.5, 2.8, 0.45), glow, rot=Rm)  # visor slit
    box(c, P(-0.4, 0, 4.4), (3.4, 1.0, 0.9), "chitin", rot=Rm)  # crest
    box(c, P(3.6, 0, -3.4), (1.0, 2.0, 0.8), "cable", rot=Rm)  # grille
    # Targeting monocle, on the tube's side.
    cylinder(c, P(1.6, -4.0, 0.9), P(4.6, -4.4, 0.9), 1.2, "alloy")
    ellipsoid(c, P(4.7, -4.4, 0.9), (0.4, 0.9, 0.9), glow, rot=Rm)
    for s in (1, -1):
        capsule(c, P(-3.4, s * 1.6, -1.6), P(-5.4, s * 2.6, -5.6), 0.6, mat="cable")


def lc_leg(c: Cloud, hip, foot) -> None:
    hip = np.asarray(hip, float)
    foot = np.asarray(foot, float)
    ankle = foot + np.array([0, 0, 3.2])
    knee = R.leg_ik(hip, ankle, R.THIGH_L, R.SHIN_L)
    capsule(c, hip, knee, 3.8, 3.0, "alloy")
    mid = (hip + knee) / 2
    d = (knee - hip) / np.linalg.norm(knee - hip)
    capsule(c, mid + np.array([2.5, 0, 0]) - d * 4.0, mid + np.array([2.3, 0, 0]) + d * 4.0, 1.6, mat="chitin")
    ellipsoid(c, knee + np.array([1.4, 0, 0.4]), (2.8, 2.9, 3.0), "chitin")
    capsule(c, knee, ankle, 2.3, 2.0, "cable")
    capsule(c, knee + np.array([-2.3, 0, -1.0]), ankle + np.array([-2.5, 0, 1.2]), 0.9, mat="metal")
    capsule(c, knee + np.array([0.9, 0, -2.0]), ankle + np.array([1.4, 0, 2.6]), 1.9, 1.6, "chitin")
    ellipsoid(c, ankle, (2.1, 2.3, 1.9), "chitin")
    box(c, foot + np.array([1.6, 0, 1.5]), (4.6, 2.8, 1.5), "chitin")
    box(c, foot + np.array([5.0, 0, 1.3]), (1.4, 2.6, 1.2), "alloy")
    box(c, foot + np.array([-2.6, 0, 1.6]), (1.0, 2.2, 1.6), "cable")


def capacitor(c: Cloud, center, axis, ring_mat: str, radius: float = 5.8) -> None:
    """The back capacitor: a hub, four spokes, a lit ring."""
    center = np.asarray(center, float)
    axis = np.asarray(axis, float) / np.linalg.norm(axis)
    u, v = R._frame(axis)
    for k in range(4):
        a = k * math.pi / 2 + math.pi / 4
        capsule(c, center, center + radius * (math.cos(a) * u + math.sin(a) * v), 0.55, mat="cable")
    ring(c, center, axis, radius, 1.15, ring_mat)
    cylinder(c, center - axis * 0.6, center + axis * 0.6, 1.9, "chitin")
    ellipsoid(c, center + axis * 0.7, (1.0, 1.0, 1.0), ring_mat if ring_mat != "conduit" else "optic")


def lc_torso(c: Cloud, z: float, ring_mat: str) -> None:
    P = lambda *v: np.array(v, float)  # noqa: E731
    box(c, P(-0.4, 0, z + 1.2), (3.8, 6.6, 3.0), "chitin")
    box(c, P(3.2, 0, z + 0.6), (0.9, 3.0, 2.6), "alloy")
    for s in (1, -1):
        cylinder(c, P(-0.4, s * 5.2, z), P(-0.4, s * 7.8, z), 3.0, "cable")
    for i in range(3):
        zz = z + 5.0 + i * 2.2
        cylinder(c, P(-0.4, 0, zz), P(-0.4, 0, zz + 1.4), 4.3 - 0.2 * i, "cable")
    for s in (1, -1):
        capsule(c, P(1.8, s * 3.4, z + 3.8), P(2.4, s * 4.4, z + 11.0), 0.6, mat="conduit")
        cable(c, P(-3.0, s * 4.0, z + 12.0), P(-2.6, s * 5.6, z + 2.0), P(-6.4, s * 6.4, z + 7.0), 0.6, n=6)
    ellipsoid(c, P(0.0, 0, z + 17.4), (6.6, 9.6, 7.8), "alloy")
    box(c, P(5.4, 0, z + 17.8), (1.3, 6.2, 5.0), "chitin", rot=rot_y(-0.12))
    box(c, P(6.75, 0, z + 18.2), (0.15, 0.9, 4.0), "conduit", rot=rot_y(-0.12))
    box(c, P(0.4, 0, z + 24.6), (4.2, 5.0, 1.4), "chitin")  # collar
    # Back hub and the capacitor ring standing behind the shoulders.
    box(c, P(-7.6, 0, z + 18.0), (2.2, 4.8, 5.0), "chitin")
    capacitor(c, P(-10.4, 0, z + 19.0), (1.0, 0, 0), ring_mat)
    # Feed from the hub round to the tube's breech.
    cable(c, P(-8.4, -3.6, z + 22.6), P(-6.6, -8.6, z + 29.0), P(-10.2, -8.4, z + 27.6), 0.7, mat="conduit", n=6)


def lc_pauldron(c: Cloud, at, side: float) -> None:
    at = np.asarray(at, float)
    ellipsoid(c, at, (6.2, 5.4, 5.0), "chitin", keep=lambda p, z=at[2]: p[:, 2] >= z - 1.4)
    ellipsoid(c, at + np.array([0, side * 0.4, -1.4]), (6.4, 5.6, 0.8), "gplate")
    for k in (-1, 1):
        box(c, at + np.array([k * 2.4, side * 1.2, 3.8]), (0.9, 2.4, 0.9), "chitin")


def lance(c: Cloud, rear, fwd, flash: int = 0, recoil: float = 0.0, length: float = TUBE_LEN, lit: bool = True) -> dict:
    """The lance tube from `rear` along `fwd`. Returns muzzle and grip points."""
    Rm = along(fwd)
    f = Rm @ np.array([1.0, 0, 0])
    up = Rm @ np.array([0, 0, 1.0])
    side = Rm @ np.array([0, 1.0, 0])
    base = np.asarray(rear, float) - f * recoil
    glow = "conduit" if lit else "dead_glow"
    cylinder(c, base, base + f * length, 2.2, "alloy")
    for t in (0.18, 0.52):
        cylinder(c, base + f * length * t, base + f * (length * t + 1.6), 2.6, "chitin")
    cylinder(c, base - f * 1.2, base + f * 0.4, 2.7, "chitin")  # breech
    cylinder(c, base - f * 1.5, base - f * 1.1, 1.6, "cable")  # vent
    box(c, base + f * length * 0.42 + up * 2.25, (length * 0.32, 0.45, 0.25), glow, rot=Rm)  # top conduit
    box(c, base + f * length * 0.36 + up * 3.0 - side * 1.0, (1.4, 0.6, 0.8), "chitin", rot=Rm)  # sight
    head0 = base + f * (length - 3.2)
    cylinder(c, head0, base + f * length, 2.9, "chitin")  # emitter collar
    tip = base + f * length
    for k in range(3):
        a = k * 2 * math.pi / 3 + math.pi / 2
        o = (math.cos(a) * side + math.sin(a) * up) * 2.0
        capsule(c, tip + o, tip + o * 1.15 + f * 2.6, 0.6, 0.4, "alloy")  # fork prongs
    ellipsoid(c, tip + f * 0.4, (0.7, 1.4, 1.4), "optic" if lit else "dead_glow", rot=Rm)
    grip_r = base + f * length * 0.38 - up * 2.4
    grip_l = base + f * length * 0.66 - up * 2.4
    for g in (grip_r, grip_l):
        capsule(c, g + up * 1.0, g - up * 1.6, 0.8, mat="cable")
    muzzle = tip + f * 2.4
    if flash:
        s = {1: 1.35, 2: 0.95, 3: 1.25, 4: 0.5}[flash]
        flash_star(c, muzzle, f, s, spin=flash * 0.5)
        ellipsoid(c, muzzle + f * 1.2 * s, (3.0 * s, 3.0 * s, 3.0 * s), "flash")
        ellipsoid(c, muzzle + f * 1.2 * s, (1.8 * s, 1.8 * s, 1.8 * s), "flash_core")
        if flash in (1, 3):
            ellipsoid(c, base - f * (2.2 * s), (1.6 * s, 1.3 * s, 1.3 * s), "flash", rot=Rm)
    return {"muzzle": muzzle, "grip_r": grip_r - up * 1.6, "grip_l": grip_l - up * 1.6}


def hand(c: Cloud, at) -> None:
    ellipsoid(c, at, (1.9, 1.9, 1.9), "chitin")


# ---------------------------------------------------------------- poses

RECOIL = {0: 0.0, 1: 2.2, 2: 1.0, 3: 1.8, 4: 0.4}


def pose_stand(phase: float | None, flash: int = 0) -> Cloud:
    c = Cloud()
    stride = 0.0 if phase is None else 1.0
    bob = 0.0 if phase is None else 0.8 * abs(math.sin(2 * math.pi * phase))
    hz = HIP_Z - bob
    for s, off in ((1, 0.0), (-1, 0.5)):
        p = 0.0 if phase is None else (phase + off) % 1.0
        fx = -5.6 * math.cos(2 * math.pi * p) * stride
        lift = 3.0 * max(0.0, math.sin(2 * math.pi * p)) * stride
        lc_leg(c, np.array([-0.4, s * 5.4, hz]), np.array([fx, s * 5.8, lift]))
    ring_mat = "optic" if flash in (1, 3) else "conduit"
    lc_torso(c, hz, ring_mat)
    z = hz - HIP_Z
    lc_head(c, (1.6, 0, 64.4 + z))
    capsule(c, (0.2, 0, 57.0 + z), (0.8, 0, 60.6 + z), 2.6, mat="cable")
    lc_pauldron(c, (0.0, -11.0, 55.6 + z), -1)
    lc_pauldron(c, (0.0, 11.0, 55.6 + z), 1)
    # The tube rides on top of the right pauldron.
    rec = RECOIL[flash]
    t = lance(c, (-10.0, -11.0, 63.0 + z), (1.0, 0.0, TUBE_DIP), flash=flash, recoil=rec)
    # Right arm: down to the elbow, up to the rear grip.
    sh = np.array([0.2, -11.4, 53.0 + z])
    el = np.array([-0.6 - rec * 0.3, -13.0, 45.0 + z])
    capsule(c, sh, el, 3.1, 2.7, "alloy")
    ellipsoid(c, el, (2.6, 2.6, 2.6), "chitin")
    capsule(c, el, t["grip_r"], 2.5, 2.1, "alloy")
    capsule(c, el + np.array([0.6, -1.8, 0.4]), t["grip_r"] + np.array([0.0, -1.6, -0.6]), 1.2, 1.0, "chitin")
    hand(c, t["grip_r"])
    # Left arm across the chest to the front grip.
    sh = np.array([0.2, 11.4, 53.0 + z])
    swing = 0.0 if phase is None else 0.8 * math.sin(2 * math.pi * phase)
    el = np.array([5.6 + swing, 4.6, 46.2 + z])
    capsule(c, sh, el, 3.0, 2.6, "alloy")
    ellipsoid(c, el, (2.5, 2.5, 2.5), "chitin")
    capsule(c, el, t["grip_l"], 2.3, 2.0, "alloy")
    hand(c, t["grip_l"])
    return c


def pose_crawl(tt: float, flash: int = 0) -> Cloud:
    """Legless. Chest on the dirt, the tube along the ground on the right, dragging on the left."""
    c = Cloud()
    pull = math.sin(2 * math.pi * tt)
    z0 = 0.6 * max(0.0, pull)
    ring_mat = "optic" if flash in (1, 3) else "conduit"
    ellipsoid(c, (0, 0, 6.4 + z0), (11.0, 9.0, 5.8), "alloy")
    box(c, (2.0, 0, 11.4 + z0), (6.6, 4.4, 1.0), "chitin")
    box(c, (2.0, 0, 12.5 + z0), (5.0, 0.7, 0.2), "conduit")
    for i in range(3):
        cylinder(c, (-7.0 - i * 1.6, 0, 5.4 + z0), (-8.0 - i * 1.6, 0, 5.4 + z0), 4.2 - 0.3 * i, "cable")
    B.xeno_stumps(c, np.array([-12.6, 0, 5.0 + z0]), np.array([-1.0, 0, -0.1]), tt, half=5.0)
    box(c, (-11.6, 0, 5.2 + z0), (2.2, 6.6, 2.6), "chitin")
    # Capacitor lying flat on the back.
    box(c, (-1.6, 0, 13.6 + z0), (4.6, 4.4, 1.6), "chitin")
    capacitor(c, (-1.6, 0, 16.0 + z0), (0, 0, 1.0), ring_mat, radius=5.2)
    capsule(c, (9.0, 0, 9.0 + z0), (11.6, 0, 11.6 + z0), 2.6, mat="cable")
    lc_head(c, (14.0, 0, 13.4 + z0))
    lc_pauldron(c, (7.0, -9.8, 9.6 + z0), -1)
    lc_pauldron(c, (7.0, 9.8, 9.6 + z0), 1)
    # The tube along the ground, cradled under the right arm; raised a touch to fire.
    rec = RECOIL[flash] * 0.8
    lift = 1.2 if flash else 0.0
    t = lance(c, (-3.0, -14.4, 3.4 + z0 + lift), (1.0, 0.0, 0.03 if flash else 0.0), flash=flash, recoil=rec, length=25.0)
    el = np.array([5.0 - rec * 0.3, -14.6, 3.4 + z0])
    capsule(c, (7.0, -10.4, 8.0 + z0), el, 2.7, mat="alloy")
    capsule(c, el, t["grip_r"], 2.2, mat="alloy")
    hand(c, t["grip_r"])
    # Left arm reaching and dragging.
    reach = 4.0 * pull
    elbow = np.array([12.5 + reach * 0.5, 11.6, 2.4])
    wr = np.array([19.0 + reach, 9.6, 1.8])
    capsule(c, (7.0, 9.6, 8.0 + z0), elbow, 2.7, mat="alloy")
    ellipsoid(c, elbow, (2.3, 2.3, 2.3), "chitin")
    capsule(c, elbow, wr, 2.2, 1.9, "alloy")
    B.thin_claw(c, wr, (1.0, -0.1, -0.2))
    return c


def pose_swim(frame: int) -> Cloud:
    return B.sink(pose_stand(None), WATER_Z, STAND_SCALE, frame)


def pose_dead() -> Cloud:
    """Face down, ring and visor dark, the tube flung aside, one leg torn off beside him."""
    c = Cloud()
    ellipsoid(c, (0, 0, 4.6), (11.0, 9.0, 4.8), "alloy")
    box(c, (1.0, 0, 9.0), (6.6, 4.4, 1.0), "chitin")
    B.xeno_stumps(c, np.array([-12.0, 0, 3.6]), np.array([-1.0, 0, -0.05]), 0.5, half=5.0)
    box(c, (-11.0, 0, 3.8), (2.2, 6.6, 2.2), "chitin")
    box(c, (-3.0, 0, 10.4), (4.4, 4.4, 1.6), "chitin")
    capacitor(c, (-3.0, 0, 12.6), (0.15, 0.3, 1.0), "dead_glow", radius=5.2)
    lc_head(c, (14.0, 1.0, 4.8), rot_x(math.radians(-25)), lit=False)
    lc_pauldron(c, (6.0, -9.8, 6.0), -1)
    lc_pauldron(c, (6.0, 9.8, 6.0), 1)
    # Tube flung out to the right, nose forward.
    lance(c, (-2.0, -16.0, 2.9), (math.cos(math.radians(-20)), math.sin(math.radians(-20)), 0.0), length=24.0, lit=False)
    # Arms limp forward.
    capsule(c, (6.0, -9.0, 5.0), (12.0, -11.6, 2.0), 2.6, mat="alloy")
    capsule(c, (12.0, -11.6, 2.0), (17.0, -10.4, 1.8), 2.2, mat="alloy")
    hand(c, (17.6, -10.2, 1.8))
    capsule(c, (6.0, 9.0, 5.0), (12.0, 12.0, 2.0), 2.6, mat="alloy")
    capsule(c, (12.0, 12.0, 2.0), (18.0, 11.0, 1.6), 2.2, mat="alloy")
    B.thin_claw(c, (18.6, 10.8, 1.6), (1.0, -0.2, 0.0))
    # A torn leg beside him, on its side, foot toward his hips.
    lr = rot_z(math.radians(95)) @ rot_x(math.radians(90))
    base = np.array([0.0, 16.0, 3.4])
    capsule(c, base, base + lr @ np.array([0, 0, -12.0]), 3.4, 2.8, "alloy")
    ellipsoid(c, base + lr @ np.array([1.2, 0, -12.0]), (2.8, 2.9, 2.8), "chitin")
    capsule(c, base + lr @ np.array([0, 0, -12.0]), base + lr @ np.array([-2.0, 0, -23.0]), 2.3, 2.0, "cable")
    box(c, base + lr @ np.array([0.0, 0, -25.0]), (4.4, 2.6, 1.4), "chitin", rot=lr)
    return B.centre_footprint(c)


# ---------------------------------------------------------------- sheets

SHEETS = [
    R.SheetSpec("walk", 8, 0.88, STAND_SCALE, lambda i: pose_stand(None if i == 0 else i / 8)),
    R.SheetSpec("fire", 4, 0.88, STAND_SCALE, lambda i: pose_stand(None, flash=i + 1)),
    R.SheetSpec("crawl", 8, 0.72, PRONE_SCALE, lambda i: pose_crawl(i / 8)),
    R.SheetSpec("crawl-fire", 4, 0.72, PRONE_SCALE, lambda i: pose_crawl(0.0, flash=i + 1)),
    R.SheetSpec("die", 4, 0.72, STAND_SCALE, lambda i: pose_dead()),
    R.SheetSpec("swim", 8, WL_Y / CELL, STAND_SCALE, lambda i: pose_swim(i), R.swim_post),
]


def main() -> int:
    return B.run("lancer", SHEETS, "render_lancer.py", sys.argv[1:])


if __name__ == "__main__":
    raise SystemExit(main())
