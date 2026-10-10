#!/usr/bin/env python3
"""
Xenomorph Weaver unit sheets — an unarmed nanite mender on the Cyborg's lock.

Same camera, cell, contact points, and row order as render_cyborg.py (and the
Xenomorph Drone in render_xenodrone.py, whose palette, helpers and runner it
shares), so the client reuses the Cyborg's sprite defs with new file names.
Slender and upright on long thin legs, so it reads taller than the Drone at the
Drone's scale. Grey-green alloy over dark chitin, a long crested skull with
three small green optics. Four thin manipulator arms end in pale needle tips:
two working arms at the shoulders, two spare arms folded up over the back. A
glowing green nanite spindle stands on the back: a chitin core wound with lit
coils, a bright cap.

It carries no gun. The "fire" sheets are the mending pose: working arms raised
and spread forward, the spare arms unfolded up and out, the spindle flaring
and a spray of nanite sparks between the needle tips (frames vary the sparks).

  python tools/sprites/render_weaver.py            # every sheet
  python tools/sprites/render_weaver.py walk fire  # some sheets

Sheets: walk (8), fire (4, mending), crawl (8, legs torn off, dragging on the
working arms), crawl-fire (4, mending from the dirt), die (4), swim (8). Writes
gridlock/packages/client/src/assets/units/weaver-*.png (plus weaver-cameo.png),
the east lock at tools/sprites/src/weaver-east.png, and previews/manifests in
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
along, cable, ring = B.along, B.cable, B.ring

STAND_SCALE = B.STAND_SCALE  # the Drone's scale; long legs make the height
PRONE_SCALE = STAND_SCALE * 22 / 28
HIP_Z = 34.0
THIGH, SHIN = 16.4, 16.0
LEAN = 0.1
WATER_Z = 40.0


# ---------------------------------------------------------------- parts


def wv_head(c: Cloud, at, Rm=None, lit: bool = True) -> None:
    """Long crested skull swept back, a narrow alloy face, three small optics."""
    at = np.asarray(at, float)
    Rm = np.eye(3) if Rm is None else Rm
    P = lambda *v: at + Rm @ np.array(v, float)  # noqa: E731
    glow = "optic" if lit else "dead_glow"
    ellipsoid(c, at, (3.4, 2.8, 3.6), "chitin", rot=Rm)
    ellipsoid(c, P(-3.2, 0, 2.4), (3.4, 1.6, 2.0), "chitin", rot=Rm @ rot_y(0.5))  # swept crest
    box(c, P(-0.8, 0, 3.6), (2.6, 0.4, 0.8), "gplate", rot=Rm)
    box(c, P(2.6, 0, -0.8), (1.2, 1.9, 2.2), "alloy", rot=Rm)  # face
    for y, z in ((-1.1, 0.5), (1.1, 0.5), (0.0, -0.6)):
        ellipsoid(c, P(3.7, y, z), (0.4, 0.6, 0.6), glow, rot=Rm)
    box(c, P(2.8, 0, -2.8), (0.8, 1.0, 0.8), "cable", rot=Rm)
    for s in (1, -1):
        capsule(c, P(-2.6, s * 1.2, -1.4), P(-4.0, s * 1.6, -4.6), 0.45, mat="cable")


def wv_leg(c: Cloud, hip, foot) -> None:
    """Long, thin leg: bare struts, a slim shin plate, a narrow foot."""
    hip = np.asarray(hip, float)
    foot = np.asarray(foot, float)
    ankle = foot + np.array([0, 0, 2.4])
    knee = R.leg_ik(hip, ankle, THIGH, SHIN)
    capsule(c, hip, knee, 2.0, 1.5, "alloy")
    ellipsoid(c, knee + np.array([0.7, 0, 0.3]), (1.6, 1.7, 1.8), "chitin")
    capsule(c, knee, ankle, 1.1, 1.0, "cable")
    capsule(c, knee + np.array([0.6, 0, -1.4]), ankle + np.array([0.7, 0, 2.6]), 0.9, 0.7, "chitin")
    cable(c, hip + np.array([-1.6, 0, -1.0]), ankle + np.array([-1.0, 0, 0.6]), knee + np.array([-3.0, 0, 0]), 0.35, n=5)
    ellipsoid(c, ankle, (1.3, 1.4, 1.3), "chitin")
    box(c, foot + np.array([1.4, 0, 0.9]), (3.0, 1.5, 0.9), "chitin")
    box(c, foot + np.array([4.0, 0, 0.8]), (0.9, 1.3, 0.7), "alloy")


def needle_arm(c: Cloud, sh, el, wr, tip, lit: bool = True) -> None:
    """A thin manipulator: alloy upper, cable forearm, a long pale needle tip."""
    sh, el, wr, tip = (np.asarray(v, float) for v in (sh, el, wr, tip))
    capsule(c, sh, el, 1.3, 1.1, "alloy")
    ellipsoid(c, el, (1.3, 1.3, 1.3), "chitin")
    capsule(c, el, wr, 0.9, 0.8, "cable")
    ellipsoid(c, wr, (1.1, 1.1, 1.1), "chitin")
    capsule(c, wr, tip, 0.65, 0.18, "gplate")
    if lit:
        ellipsoid(c, wr + (tip - wr) * 0.35, (0.5, 0.5, 0.5), "conduit")


def spindle(c: Cloud, base, axis, bright: bool = False, lit: bool = True, length: float = 13.0) -> np.ndarray:
    """The nanite spindle: chitin core, lit coils, a bright cap. Returns the cap."""
    base = np.asarray(base, float)
    axis = np.asarray(axis, float) / np.linalg.norm(axis)
    top = base + axis * length
    cylinder(c, base + axis * length * 0.08, top - axis * length * 0.1, 1.3, "chitin")
    coil = "optic" if bright else "conduit"
    if not lit:
        coil = "dead_glow"
    cylinder(c, base, top, 1.1, "cable")
    for k, t in enumerate((0.16, 0.3, 0.44, 0.58, 0.72)):
        rr = 2.3 - 0.15 * k + (0.4 if bright else 0.0)
        ring(c, base + axis * length * t, axis, rr, 0.42, coil, n=20)
    ellipsoid(c, top, (1.8, 1.8, 1.8) if bright else (1.3, 1.3, 1.3), "optic" if lit else "dead_glow")
    cylinder(c, top - axis * 1.6, top - axis * 0.9, 2.0, "chitin")
    cylinder(c, base - axis * 0.4, base + axis * 0.6, 2.4, "chitin")
    return top


def sparks(c: Cloud, centre, n: int, spread: float, seed: int) -> None:
    rng = np.random.default_rng(seed)
    centre = np.asarray(centre, float)
    for _ in range(n):
        d = rng.normal(size=3)
        d /= np.linalg.norm(d)
        r = spread * (0.4 + 0.6 * rng.random())
        ellipsoid(c, centre + d * r, (0.55, 0.55, 0.55), "gspark")


def wv_torso(c: Cloud, hip0, Rt, bright: bool = False) -> dict:
    """Narrow pelvis to collar, the spindle on the back. Returns anchors."""
    hip0 = np.asarray(hip0, float)
    T = lambda *v: hip0 + Rt @ np.array(v, float)  # noqa: E731
    box(c, T(0, 0, 0.8), (2.2, 3.6, 1.8), "chitin", rot=Rt)
    for s in (1, -1):
        cylinder(c, T(0, s * 2.8, 0), T(0, s * 4.4, 0), 1.7, "cable")
    for i in range(4):
        zz = 3.2 + i * 1.9
        cylinder(c, T(-0.4, 0, zz), T(-0.4, 0, zz + 1.0), 2.1 - 0.1 * i, "cable")
    for s in (1, -1):
        capsule(c, T(0.8, s * 1.8, 3.0), T(1.2, s * 2.4, 10.4), 0.4, mat="conduit")
    ellipsoid(c, T(0, 0, 15.6), (3.8, 5.2, 5.6), "alloy", rot=Rt)
    box(c, T(3.0, 0, 16.0), (0.9, 3.2, 3.6), "chitin", rot=Rt @ rot_y(-0.1))
    box(c, T(3.95, 0, 15.4), (0.12, 0.4, 2.4), "conduit", rot=Rt @ rot_y(-0.1))
    box(c, T(0.2, 0, 20.8), (2.4, 3.2, 0.9), "chitin", rot=Rt)  # collar
    # Back plate and the spindle standing on it, leaning back a touch.
    box(c, T(-4.2, 0, 15.0), (1.2, 3.4, 4.6), "chitin", rot=Rt)
    cap = spindle(c, T(-6.0, 0, 9.0), Rt @ np.array([-0.12, 0, 1.0]), bright=bright, length=20.0)
    for s in (1, -1):
        cable(c, T(-4.6, s * 2.4, 11.0), T(-1.6, s * 3.2, 2.4), T(-6.6, s * 4.4, 6.0), 0.5, n=6)
    return {
        "sh_r": T(0.4, -6.0, 19.0),
        "sh_l": T(0.4, 6.0, 19.0),
        "bk_r": T(-3.6, -3.4, 18.6),
        "bk_l": T(-3.6, 3.4, 18.6),
        "neck0": T(1.0, 0, 21.4),
        "neck1": T(2.2, 0, 24.4),
        "head": T(2.8, 0, 27.4),
        "cap": cap,
    }


# ---------------------------------------------------------------- poses


def arms(c: Cloud, a: dict, phase: float | None, mend: int, lit: bool = True) -> None:
    swing = 0.0 if phase is None else 2.0 * math.sin(2 * math.pi * phase)
    for s in (1, -1):
        sh = a["sh_l"] if s > 0 else a["sh_r"]
        B.shoulder_joint(c, sh)
        if mend:
            # Working arms raised and spread forward, needles converging ahead.
            wob = 0.8 * math.sin(mend * 1.7 + s)
            el = sh + np.array([4.6, s * 4.2, 2.0 + wob])
            wr = el + np.array([6.4, -s * 1.6, 1.6 - wob * 0.5])
            tip = wr + np.array([5.0, -s * 2.0, -1.6])
        else:
            sw = swing * s
            el = sh + np.array([0.6 - sw, s * 1.0, -7.4])
            wr = el + np.array([3.6 - sw * 0.5, s * 0.2, -5.6])
            tip = wr + np.array([2.6, -s * 0.4, -3.6])
        needle_arm(c, sh, el, wr, tip, lit)
        # Spare arms off the upper back.
        bk = a["bk_l"] if s > 0 else a["bk_r"]
        ellipsoid(c, bk, (1.6, 1.6, 1.6), "chitin")
        if mend:
            el = bk + np.array([-1.6, s * 5.6, 5.4])
            wr = el + np.array([3.6, s * 2.6, 3.6])
            tip = wr + np.array([4.2, -s * 1.0, 0.4])
        else:
            # Folded: up over the shoulder, forearm folded back down, needle up.
            el = bk + np.array([-1.2, s * 3.2, 9.4])
            wr = el + np.array([-2.4, s * 1.0, -3.4])
            tip = wr + np.array([-0.4, s * 1.6, 7.6])
        needle_arm(c, bk, el, wr, tip, lit)


def pose_stand(phase: float | None, mend: int = 0, lean: float = LEAN) -> Cloud:
    c = Cloud()
    stride = 0.0 if phase is None else 1.0
    bob = 0.0 if phase is None else 0.7 * abs(math.sin(2 * math.pi * phase))
    hz = HIP_Z - bob
    for s, off in ((1, 0.0), (-1, 0.5)):
        p = 0.0 if phase is None else (phase + off) % 1.0
        fx = -6.4 * math.cos(2 * math.pi * p) * stride
        lift = 3.0 * max(0.0, math.sin(2 * math.pi * p)) * stride
        wv_leg(c, np.array([-0.4, s * 3.4, hz]), np.array([fx, s * 4.0, lift]))
    a = wv_torso(c, (-0.4, 0, hz), rot_y(lean), bright=bool(mend))
    capsule(c, a["neck0"], a["neck1"], 1.3, mat="cable")
    wv_head(c, a["head"], rot_y(-0.12 if not mend else 0.15))
    arms(c, a, phase, mend)
    if mend:
        # Nanite spray between the needles, a halo about the spindle cap.
        focus = np.array([a["sh_r"][0] + 15.0, 0.0, a["sh_r"][2] + 2.4])
        n = {1: 9, 2: 6, 3: 9, 4: 4}[mend]
        sparks(c, focus, n, {1: 3.4, 2: 2.6, 3: 3.8, 4: 2.0}[mend], seed=mend)
        sparks(c, a["cap"], n // 2, 2.8, seed=10 + mend)
    return c


def pose_crawl(t: float, mend: int = 0) -> Cloud:
    """Legless. Chest on the dirt, the spindle lying back, dragging on the working arms."""
    c = Cloud()
    pull = math.sin(2 * math.pi * t)
    z0 = 0.5 * max(0.0, pull)
    ellipsoid(c, (0, 0, 4.8 + z0), (8.4, 5.6, 4.0), "alloy")
    box(c, (1.6, 0, 8.4 + z0), (4.6, 2.8, 0.7), "chitin")
    for i in range(4):
        cylinder(c, (-5.6 - i * 1.3, 0, 4.2 + z0), (-6.4 - i * 1.3, 0, 4.2 + z0), 2.3 - 0.2 * i, "cable")
    B.xeno_stumps(c, np.array([-10.6, 0, 3.8 + z0]), np.array([-1.0, 0, -0.1]), t, half=3.2)
    box(c, (-9.6, 0, 4.0 + z0), (1.6, 4.0, 1.8), "chitin")
    box(c, (-1.6, 0, 9.0 + z0), (3.6, 3.0, 1.0), "chitin")
    cap = spindle(c, (-1.0, 0, 9.4 + z0), (-0.85, 0, 0.55), bright=bool(mend), length=13.0)
    capsule(c, (7.0, 0, 7.0 + z0), (9.6, 0, 9.4 + z0), 1.3, mat="cable")
    wv_head(c, (11.6, 0, 10.6 + z0 + (1.4 if mend else 0.0)), rot_y(0.1 if mend else 0.0))
    for s in (1, -1):
        sh = np.array([5.2, s * 6.2, 7.0 + z0])
        B.shoulder_joint(c, sh)
        if mend:
            el = sh + np.array([4.6, s * 3.2, 4.0])
            wr = el + np.array([5.6, -s * 1.6, 1.0])
            tip = wr + np.array([4.4, -s * 2.0, -1.4])
        else:
            reach = 3.6 * pull * s
            el = np.array([10.2 + reach * 0.5, s * 8.6, 3.0])
            wr = np.array([15.0 + reach, s * 7.6, 2.0])
            tip = wr + np.array([3.0, -s * 0.4, -1.8])
        needle_arm(c, sh, el, wr, tip)
        # Spare arms folded flat along the back.
        bk = np.array([0.0, s * 3.0, 9.0 + z0])
        ellipsoid(c, bk, (1.4, 1.4, 1.4), "chitin")
        if mend:
            el = bk + np.array([1.0, s * 5.4, 4.6])
            wr = el + np.array([4.0, s * 1.4, 2.4])
            tip = wr + np.array([3.6, -s * 1.0, 0.0])
        else:
            el = bk + np.array([-5.0, s * 2.4, 1.6])
            wr = el + np.array([-4.6, s * 0.6, -0.6])
            tip = wr + np.array([-3.0, s * 0.4, 1.4])
        needle_arm(c, bk, el, wr, tip)
    if mend:
        n = {1: 8, 2: 5, 3: 8, 4: 3}[mend]
        sparks(c, (23.0, 0, 8.0 + z0), n, {1: 3.0, 2: 2.4, 3: 3.4, 4: 1.8}[mend], seed=mend)
        sparks(c, cap, n // 2, 2.6, seed=20 + mend)
    return c


def pose_swim(frame: int) -> Cloud:
    return B.sink(pose_stand(None, lean=0.04), WATER_Z, STAND_SCALE, frame)


def pose_dead() -> Cloud:
    """Face down, optics dark, the spindle snapped off beside it, arms splayed, one leg torn off."""
    c = Cloud()
    ellipsoid(c, (0, 0, 3.4), (8.4, 5.8, 3.4), "alloy")
    box(c, (1.0, 0, 6.6), (4.6, 2.8, 0.7), "chitin")
    B.xeno_stumps(c, np.array([-10.2, 0, 2.8]), np.array([-1.0, 0, -0.05]), 0.5, half=3.2)
    box(c, (-9.2, 0, 3.0), (1.6, 4.0, 1.6), "chitin")
    box(c, (-1.6, 0, 7.4), (3.6, 3.0, 1.0), "chitin")
    spindle(c, (-3.0, -7.0, 2.4), (-0.6, -0.8, 0.0), lit=False, length=12.0)
    wv_head(c, (11.2, 1.0, 3.6), rot_x(math.radians(-25)), lit=False)
    for s in (1, -1):
        sh = np.array([5.0, s * 6.0, 3.6])
        el = np.array([9.0, s * 11.0, 1.8])
        wr = np.array([14.0, s * 12.0, 1.4])
        needle_arm(c, sh, el, wr, wr + np.array([3.6, s * 1.0, -0.4]), lit=False)
        bk = np.array([-1.0, s * 3.0, 6.4])
        el = np.array([-4.0, s * 9.0, 1.8])
        wr = np.array([-8.0, s * 11.6, 1.4])
        needle_arm(c, bk, el, wr, wr + np.array([-3.0, s * 1.6, -0.2]), lit=False)
    lr = rot_z(math.radians(95)) @ rot_x(math.radians(90))
    base = np.array([1.0, 14.0, 2.2])
    capsule(c, base, base + lr @ np.array([0, 0, -11.0]), 2.0, 1.5, "alloy")
    ellipsoid(c, base + lr @ np.array([0.7, 0, -11.0]), (1.6, 1.7, 1.6), "chitin")
    capsule(c, base + lr @ np.array([0, 0, -11.0]), base + lr @ np.array([-1.4, 0, -21.0]), 1.1, 1.0, "cable")
    box(c, base + lr @ np.array([0.0, 0, -23.0]), (2.8, 1.5, 0.9), "chitin", rot=lr)
    return B.centre_footprint(c)


# ---------------------------------------------------------------- sheets

SHEETS = [
    R.SheetSpec("walk", 8, 0.88, STAND_SCALE, lambda i: pose_stand(None if i == 0 else i / 8)),
    R.SheetSpec("fire", 4, 0.88, STAND_SCALE, lambda i: pose_stand(None, mend=i + 1)),
    R.SheetSpec("crawl", 8, 0.72, PRONE_SCALE, lambda i: pose_crawl(i / 8)),
    R.SheetSpec("crawl-fire", 4, 0.72, PRONE_SCALE, lambda i: pose_crawl(0.0, mend=i + 1)),
    R.SheetSpec("die", 4, 0.72, STAND_SCALE, lambda i: pose_dead()),
    R.SheetSpec("swim", 8, WL_Y / CELL, STAND_SCALE, lambda i: pose_swim(i), R.swim_post),
]


def main() -> int:
    return B.run("weaver", SHEETS, "render_weaver.py", sys.argv[1:])


if __name__ == "__main__":
    raise SystemExit(main())
