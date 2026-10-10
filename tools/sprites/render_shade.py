#!/usr/bin/env python3
"""
Xenomorph Shade unit sheets — a lean spine-sniper on the Cyborg's lock.

Same camera, cell, contact points, and row order as render_cyborg.py (and the
Xenomorph Drone in render_xenodrone.py, whose palette, helpers and runner it
shares), so the client reuses the Cyborg's sprite defs with new file names.
Lean and long-limbed at the Drone's scale, so it reads taller and thinner.
Smooth dark chitin skin with a faint grey-teal sheen on the lit side (the hive
palette, pushed darker), only a few alloy joints. A narrow, eyeless, elongated
head with a single green slit. A long, thin spine-rifle grown along the right
forearm, far longer than the Drone's carbine, ridged with small spines and a
lit seam, carried low and slanted on the walk.

Fire frames brace the legs wide, raise the right arm level at the shoulder
with the left hand under the spine, and throw a small green flash at the tip
(big / small / big / tiny) with a short recoil.

  python tools/sprites/render_shade.py            # every sheet
  python tools/sprites/render_shade.py walk fire  # some sheets

Sheets: walk (8), fire (4), crawl (8, legs torn off, spine along the ground),
crawl-fire (4), die (4), swim (8). Writes
gridlock/packages/client/src/assets/units/shade-*.png (plus shade-cameo.png),
the east lock at tools/sprites/src/shade-east.png, and previews/manifests in
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
import render_xenodrone as B  # noqa: E402  (registers the Xenomorph palette on render_cyborg)

R = B.R
CELL = B.CELL
WL_Y = B.WL_Y
Cloud = R.Cloud
ellipsoid, capsule, cylinder, box = R.ellipsoid, R.capsule, R.cylinder, R.box
rot_x, rot_y, rot_z = R.rot_x, R.rot_y, R.rot_z
along, cable, flash_star = B.along, B.cable, B.flash_star

# Shade skin: the Xenomorph chitin pushed darker, with a grey-teal sheen for the lit
# tone (the "chameleon" glint). Registered in this process only.
SHADE_MATS = {
    "shskin": ((14, 17, 18), (26, 32, 33), (58, 82, 80)),
    "shplate": ((22, 26, 28), (40, 48, 50), (84, 108, 104)),
}
for _name, _spec in SHADE_MATS.items():
    R.MATERIALS[_name] = _spec
    if _name not in R.MAT_IDS:
        R.MAT_IDS[_name] = len(R.MAT_IDS)

STAND_SCALE = B.STAND_SCALE
PRONE_SCALE = STAND_SCALE * 22 / 28
HIP_Z = 34.0
THIGH, SHIN = 16.6, 16.0
LEAN = 0.2
WATER_Z = 40.0
SPINE_LEN = 30.0


# ---------------------------------------------------------------- parts


def sh_head(c: Cloud, at, Rm=None, lit: bool = True) -> None:
    """Narrow, eyeless, elongated skull; a single slit glow across the front."""
    at = np.asarray(at, float)
    Rm = np.eye(3) if Rm is None else Rm
    P = lambda *v: at + Rm @ np.array(v, float)  # noqa: E731
    ellipsoid(c, P(0.6, 0, 0), (4.2, 2.3, 2.8), "shskin", rot=Rm)
    ellipsoid(c, P(-3.4, 0, 1.2), (3.2, 1.6, 2.0), "shskin", rot=Rm @ rot_y(0.35))  # long back skull
    box(c, P(3.9, 0, 0.3), (0.5, 1.9, 0.32), "optic" if lit else "dead_glow", rot=Rm)  # the slit
    box(c, P(2.4, 0, -2.0), (1.6, 1.2, 0.6), "shplate", rot=Rm)  # jaw
    for s in (1, -1):
        capsule(c, P(-2.4, s * 1.0, -1.6), P(-3.6, s * 1.4, -4.4), 0.4, mat="cable")


def sh_leg(c: Cloud, hip, foot) -> None:
    hip = np.asarray(hip, float)
    foot = np.asarray(foot, float)
    ankle = foot + np.array([0, 0, 2.4])
    knee = R.leg_ik(hip, ankle, THIGH, SHIN)
    capsule(c, hip, knee, 2.0, 1.4, "shskin")
    ellipsoid(c, knee + np.array([0.6, 0, 0.3]), (1.5, 1.6, 1.7), "shplate")
    capsule(c, knee, ankle, 1.3, 0.9, "shskin")
    capsule(c, knee + np.array([0.6, 0, -1.2]), ankle + np.array([0.6, 0, 3.0]), 0.6, 0.5, "shplate")
    ellipsoid(c, ankle, (1.2, 1.3, 1.2), "alloy")
    box(c, foot + np.array([1.6, 0, 0.8]), (3.2, 1.3, 0.8), "shskin")
    capsule(c, foot + np.array([3.6, 0, 0.8]), foot + np.array([5.6, 0, 0.3]), 0.5, 0.3, "shplate")  # toe claw


def spine_rifle(c: Cloud, elbow, fwd, flash: int = 0, recoil: float = 0.0, length: float = SPINE_LEN, lit: bool = True) -> dict:
    """Forearm grown into a long thin spine-rifle from `elbow` along `fwd`."""
    elbow = np.asarray(elbow, float)
    Rm = along(fwd)
    f = Rm @ np.array([1.0, 0, 0])
    up = Rm @ np.array([0, 0, 1.0])
    side = Rm @ np.array([0, 1.0, 0])
    base = elbow - f * recoil
    glow = "conduit" if lit else "dead_glow"
    ellipsoid(c, elbow, (1.7, 1.7, 1.7), "shplate")
    capsule(c, base, base + f * 8.0, 1.8, 1.4, "shskin")  # forearm
    capsule(c, base + f * 6.0, base + f * length, 1.0, 0.45, "shplate")  # the spine
    box(c, base + f * length * 0.45 + up * 0.9, (length * 0.3, 0.25, 0.22), glow, rot=Rm)  # lit seam
    for k in range(5):
        t = 7.0 + k * 3.6
        p = base + f * t + up * 0.8
        capsule(c, p, p + up * 1.4 - f * 1.0, 0.35, 0.15, "shskin")  # small spines
    # A nub of a scope near the wrist.
    capsule(c, base + f * 6.0 + up * 1.8 - side * 0.4, base + f * 9.0 + up * 1.8 - side * 0.4, 0.55, mat="alloy")
    tip = base + f * length
    ellipsoid(c, tip, (0.4, 0.6, 0.6), "optic" if lit else "dead_glow", rot=Rm)
    if flash:
        s = {1: 0.75, 2: 0.5, 3: 0.7, 4: 0.3}[flash]
        flash_star(c, tip + f * 0.4, f, s, spin=flash * 0.4)
    return {"tip": tip, "grip": base + f * 11.0 - up * 1.2}


def thin_hand(c: Cloud, at, fwd) -> None:
    B.thin_claw(c, at, fwd)


def sh_torso(c: Cloud, hip0, Rt) -> dict:
    hip0 = np.asarray(hip0, float)
    T = lambda *v: hip0 + Rt @ np.array(v, float)  # noqa: E731
    box(c, T(0, 0, 0.8), (2.0, 3.4, 1.8), "shskin", rot=Rt)
    for s in (1, -1):
        ellipsoid(c, T(0, s * 3.4, 0), (1.8, 1.6, 1.8), "alloy", rot=Rt)
    # Narrow waist, a ribbed spine.
    capsule(c, T(0, 0, 2.0), T(0.2, 0, 10.0), 2.0, 2.4, "shskin")
    for i in range(4):
        box(c, T(-2.4, 0, 3.0 + i * 2.0), (0.8, 1.6, 0.5), "shplate", rot=Rt)
    # Chest: lean, long, a keel of plate down the front.
    ellipsoid(c, T(0, 0, 15.2), (3.6, 4.8, 6.4), "shskin", rot=Rt)
    box(c, T(3.0, 0, 15.4), (0.8, 1.2, 4.4), "shplate", rot=Rt @ rot_y(-0.08))
    box(c, T(3.6, 0, 13.0), (0.12, 0.3, 1.4), "conduit", rot=Rt @ rot_y(-0.08))
    # Back: a row of short dorsal blades.
    for k in range(4):
        box(c, T(-3.8, 0, 11.0 + k * 2.6), (1.4, 0.4, 0.8), "shplate", rot=Rt @ rot_y(0.5))
    box(c, T(0.2, 0, 20.6), (2.0, 3.0, 0.8), "shplate", rot=Rt)  # collar
    for s in (1, -1):
        cable(c, T(-3.2, s * 2.4, 18.0), T(-1.6, s * 3.2, 2.0), T(-6.0, s * 3.6, 9.0), 0.45, n=6)
    return {
        "sh_r": T(0.4, -5.6, 19.0),
        "sh_l": T(0.4, 5.6, 19.0),
        "neck0": T(1.0, 0, 21.0),
        "neck1": T(2.4, 0, 24.4),
        "head": T(3.4, 0, 27.0),
    }


def shoulder(c: Cloud, at) -> None:
    at = np.asarray(at, float)
    ellipsoid(c, at, (2.2, 2.0, 2.2), "shplate")
    capsule(c, at + np.array([-0.6, 0, 1.6]), at + np.array([-2.4, 0, 3.2]), 0.5, 0.2, "shplate")  # a shoulder spike


# ---------------------------------------------------------------- poses

RECOIL = {0: 0.0, 1: 1.4, 2: 0.6, 3: 1.2, 4: 0.3}


def pose_stand(phase: float | None, flash: int = 0, lean: float = LEAN) -> Cloud:
    c = Cloud()
    stride = 0.0 if phase is None else 1.0
    bob = 0.0 if phase is None else 0.7 * abs(math.sin(2 * math.pi * phase))
    hz = HIP_Z - bob - (1.6 if flash else 0.0)
    for s, off in ((1, 0.0), (-1, 0.5)):
        p = 0.0 if phase is None else (phase + off) % 1.0
        fx = -6.8 * math.cos(2 * math.pi * p) * stride
        lift = 3.2 * max(0.0, math.sin(2 * math.pi * p)) * stride
        if flash:  # braced: left foot forward, right back, wide
            fx = 4.6 if s > 0 else -5.0
        sh_leg(c, np.array([-0.4, s * 3.2, hz]), np.array([fx, s * (4.0 + (1.6 if flash else 0.0)), lift]))
    a = sh_torso(c, (-0.4, 0, hz), rot_y(lean if not flash else 0.12))
    capsule(c, a["neck0"], a["neck1"], 1.2, mat="shskin")
    sh_head(c, a["head"], rot_y(-0.1 if not flash else 0.05))
    swing = 0.0 if phase is None else 2.2 * math.sin(2 * math.pi * phase)
    rec = RECOIL[flash]
    # Right arm: the spine-rifle. Low and slanted on the walk; level at the shoulder to fire.
    sh = a["sh_r"]
    shoulder(c, sh)
    if flash:
        el = sh + np.array([0.8 - rec * 0.4, 1.2, -2.2])
        fwd = (1.0, 0.07, 0.0)
    else:
        el = sh + np.array([-0.6 - swing * 0.3, -1.2, -8.4])
        fwd = (1.0, 0.05, -0.32)
    capsule(c, sh, el, 1.8, 1.4, "shskin")
    g = spine_rifle(c, el, fwd, flash=flash, recoil=rec)
    # Left arm: thin, swinging on the walk; under the spine to fire.
    sh = a["sh_l"]
    shoulder(c, sh)
    if flash:
        el = sh + np.array([4.6, -2.4, -6.0])
        wr = g["grip"]
        capsule(c, sh, el, 1.6, 1.3, "shskin")
        ellipsoid(c, el, (1.4, 1.4, 1.4), "shplate")
        capsule(c, el, wr, 1.2, 1.0, "shskin")
        thin_hand(c, wr, (0.4, -0.2, 0.6))
    else:
        el = sh + np.array([-1.0 - swing, 1.0, -8.6])
        wr = el + np.array([3.2 - swing * 0.5, -0.2, -7.4])
        capsule(c, sh, el, 1.6, 1.3, "shskin")
        ellipsoid(c, el, (1.4, 1.4, 1.4), "shplate")
        capsule(c, el, wr, 1.2, 1.0, "shskin")
        thin_hand(c, wr, (0.5, -0.1, -0.9))
    return c


def pose_crawl(t: float, flash: int = 0) -> Cloud:
    """Legless. Chest on the dirt, the spine along the ground on the right, dragging on the left."""
    c = Cloud()
    pull = math.sin(2 * math.pi * t)
    z0 = 0.5 * max(0.0, pull)
    ellipsoid(c, (0, 0, 4.6 + z0), (9.0, 5.2, 4.0), "shskin")
    box(c, (1.6, 0, 8.2 + z0), (4.6, 1.0, 0.6), "shplate")
    for k in range(4):
        box(c, (-6.0 + k * 2.6, 0, 8.4 + z0), (1.2, 0.4, 0.9), "shplate", rot=rot_y(0.5))
    capsule(c, (-8.0, 0, 4.2 + z0), (-11.0, 0, 4.0 + z0), 2.2, 1.8, "shskin")
    B.xeno_stumps(c, np.array([-11.6, 0, 3.8 + z0]), np.array([-1.0, 0, -0.1]), t, half=3.0)
    capsule(c, (7.6, 0, 7.0 + z0), (10.2, 0, 8.8 + z0), 1.2, mat="shskin")
    sh_head(c, (13.0, 0, 9.6 + z0 + (0.8 if flash else 0.0)), rot_y(0.05))
    # Right arm: the spine along the ground, lifted a touch to fire.
    sh_r = np.array([5.4, -5.6, 6.8 + z0])
    shoulder(c, sh_r)
    rec = RECOIL[flash] * 0.8
    el = np.array([8.6 - rec * 0.4, -7.6, 3.2 + z0 + (0.8 if flash else 0.0)])
    capsule(c, sh_r, el, 1.7, 1.4, "shskin")
    spine_rifle(c, el, (1.0, 0.05, 0.02 if flash else 0.0), flash=flash, recoil=rec, length=26.0)
    # Left arm reaching and dragging.
    reach = 3.8 * pull
    sh_l = np.array([5.4, 5.6, 6.8 + z0])
    shoulder(c, sh_l)
    el = np.array([11.0 + reach * 0.5, 9.0, 2.2])
    wr = np.array([17.4 + reach, 7.4, 1.6])
    capsule(c, sh_l, el, 1.6, 1.3, "shskin")
    ellipsoid(c, el, (1.4, 1.4, 1.4), "shplate")
    capsule(c, el, wr, 1.2, 1.0, "shskin")
    thin_hand(c, wr, (1.0, -0.1, -0.3))
    return c


def pose_swim(frame: int) -> Cloud:
    return B.sink(pose_stand(None, lean=0.06), WATER_Z, STAND_SCALE, frame)


def pose_dead() -> Cloud:
    """Face down, slit dark, the spine arm flung out, one long leg torn off beside it."""
    c = Cloud()
    ellipsoid(c, (0, 0, 3.4), (9.0, 5.2, 3.2), "shskin")
    for k in range(4):
        box(c, (-6.0 + k * 2.6, 0, 6.6), (1.2, 0.4, 0.8), "shplate")
    capsule(c, (-8.0, 0, 3.0), (-11.0, 0, 2.8), 2.2, 1.8, "shskin")
    B.xeno_stumps(c, np.array([-11.4, 0, 2.6]), np.array([-1.0, 0, -0.05]), 0.5, half=3.0)
    sh_head(c, (12.6, 1.0, 3.2), rot_x(math.radians(-25)), lit=False)
    sh = np.array([5.0, -5.6, 3.6])
    el = np.array([8.0, -10.0, 2.0])
    capsule(c, sh, el, 1.7, 1.4, "shskin")
    spine_rifle(c, el, (0.75, -0.66, 0.0), length=26.0, lit=False)
    el = np.array([10.4, 9.4, 1.8])
    wr = np.array([16.4, 8.8, 1.4])
    capsule(c, (5.0, 5.6, 3.6), el, 1.6, 1.3, "shskin")
    capsule(c, el, wr, 1.2, 1.0, "shskin")
    thin_hand(c, wr, (1.0, -0.2, 0.0))
    lr = rot_z(math.radians(95)) @ rot_x(math.radians(90))
    base = np.array([0.0, 12.0, 2.2])
    capsule(c, base, base + lr @ np.array([0, 0, -11.0]), 2.0, 1.4, "shskin")
    ellipsoid(c, base + lr @ np.array([0.6, 0, -11.0]), (1.5, 1.6, 1.5), "shplate")
    capsule(c, base + lr @ np.array([0, 0, -11.0]), base + lr @ np.array([-1.4, 0, -21.0]), 1.3, 0.9, "shskin")
    box(c, base + lr @ np.array([0.0, 0, -23.0]), (3.0, 1.3, 0.8), "shskin", rot=lr)
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
    return B.run("shade", SHEETS, "render_shade.py", sys.argv[1:])


if __name__ == "__main__":
    raise SystemExit(main())
