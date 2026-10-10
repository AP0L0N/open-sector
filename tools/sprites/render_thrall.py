#!/usr/bin/env python3
"""
Xenite Thrall unit sheets — melee brute cyborg on the Cyborg's lock.

A fork of render_simunit2.py by way of render_xenodrone.py: the Cyborg's camera,
cell, contact points, and row order, so the client reuses the Cyborg's sprite
defs with new file names, and the Xenite helpers from the Drone. The Drone's
materials are recoloured here (this process only) to the Xenite's blue-ish
in-game look of the Seed / Cyborg Central / Fusion Node: blue-steel plating,
a dark blue under-structure, cyan optic and seams with a darker cyan edge.
A hulking assimilated body: a barrel chest, a chitin hump on the
back with slack cables, a small head sunk between heavy layered chitin
pauldrons rimmed in pale steel, thick plated forearms ending in big armoured
fists with steel knuckle plates. No gun, no blades. Bulkier than the Drone,
drawn at 0.96 of the Cyborg's scale, inside the 96 cell on every row.

  python tools/sprites/render_thrall.py            # every sheet
  python tools/sprites/render_thrall.py walk hit   # some sheets

Sheets: walk (8, a sprint: torso well forward, long strides, arms pumping, every
frame a step), fire (4, the pummel: left fist out / recover / right fist out /
recover), hit (4, a bullet in the LEFT shoulder on every facing: jerked back
and twisted with a spark on the pauldron, staggering, coming back, nearly
upright), crawl (8, legs torn off, dragging on the left arm, the right fist
forward), crawl-fire (4, the right fist raised and slammed into the ground in
front), die (4, knees buckle, falls forward, face down; frame 3 is the corpse),
swim (8, chest-deep in the shared pool). Writes
gridlock/packages/client/src/assets/units/thrall-*.png (plus thrall-cameo.png),
the east lock at tools/sprites/src/thrall-east.png, and previews/manifests in
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
along, cable = B.along, B.cable

# The Thrall wears the Xenite's blue-ish in-game look (the Seed / Cyborg Central /
# Fusion Node): cool blue-steel plating on a dark blue under-structure, cyan
# optic and seams. Recoloured in this process only; the Drone and the Lancer
# keep their own sheets.
R.MATERIALS.update(
    {
        "alloy": ((52, 72, 94), (90, 117, 144), (127, 159, 184)),  # blue-steel plating #34485e / #5a7590 / #7f9fb8
        "chitin": ((30, 42, 58), (46, 64, 86), (70, 94, 120)),  # deep blue plates
        "cable": ((18, 26, 34), (30, 42, 54), (46, 62, 78)),  # under-structure #1e2a36
        "gplate": ((96, 122, 146), (146, 172, 196), (196, 216, 232)),  # pale steel rims
        "optic": (95, 232, 240),  # #5fe8f0
        "conduit": (63, 216, 224),  # #3fd8e0 seams
        "glow_edge": (42, 168, 192),  # #2aa8c0
        "gspark": (190, 250, 255),
        "dead_glow": ((22, 32, 42), (32, 46, 58), (44, 62, 76)),
    }
)
if "glow_edge" not in R.MAT_IDS:
    R.MAT_IDS["glow_edge"] = len(R.MAT_IDS)
R.EMISSIVE.add("glow_edge")
# The Thrall carries no gun, so in this process the un-outlined FX pair is the
# warm white of a bullet striking plate (the hit spark).
R.MATERIALS["flash"] = (255, 214, 120)
R.MATERIALS["flash_core"] = (255, 252, 232)

STAND_SCALE = 1.2 * 0.96  # just under the Cyborg / Lancer; the Drone is 0.94 of it
PRONE_SCALE = STAND_SCALE * 22 / 28
HIP_Z = 30.0
WATER_Z = 38.0
THIGH, SHIN = 15.0, 14.6
SPRINT_LEAN = 0.42  # torso forward, radians
FIGHT_LEAN = 0.16


# ---------------------------------------------------------------- parts


def th_head(c: Cloud, at, Rm=None, lit: bool = True) -> None:
    """Small chitin skull, heavy alloy jaw, one green optic on the right."""
    at = np.asarray(at, float)
    Rm = np.eye(3) if Rm is None else Rm
    P = lambda *v: at + Rm @ np.array(v, float)  # noqa: E731
    glow = "optic" if lit else "dead_glow"
    ellipsoid(c, at, (3.8, 3.6, 3.8), "chitin", rot=Rm)
    box(c, P(2.6, 0, -1.8), (1.6, 2.8, 1.9), "alloy", rot=Rm)  # jaw
    box(c, P(3.9, 0, -2.2), (0.5, 1.8, 0.9), "cable", rot=Rm)  # grille
    box(c, P(3.2, 0, 0.9), (0.5, 2.4, 0.4), glow, rot=Rm)  # brow slit
    ellipsoid(c, P(3.4, -1.7, 0.6), (0.6, 1.0, 1.0), glow, rot=Rm)  # optic
    box(c, P(-0.4, 0, 3.4), (2.6, 0.6, 0.8), "alloy", rot=Rm)  # ridge


def th_leg(c: Cloud, hip, foot, knee=None) -> None:
    hip = np.asarray(hip, float)
    foot = np.asarray(foot, float)
    ankle = foot + np.array([0, 0, 3.0])
    knee = R.leg_ik(hip, ankle, THIGH, SHIN) if knee is None else np.asarray(knee, float)
    capsule(c, hip, knee, 4.0, 3.2, "alloy")
    ellipsoid(c, knee + np.array([1.3, 0, 0.4]), (2.8, 3.0, 3.0), "chitin")
    capsule(c, knee, ankle, 2.4, 2.0, "cable")
    capsule(c, knee + np.array([0.9, 0, -1.8]), ankle + np.array([1.4, 0, 2.4]), 2.0, 1.6, "chitin")
    cable(c, hip + np.array([-2.6, 0, -1.0]), ankle + np.array([-1.6, 0, 0.6]), knee + np.array([-4.4, 0, 0]), 0.5, n=5)
    ellipsoid(c, ankle, (2.1, 2.3, 1.9), "chitin")
    box(c, foot + np.array([1.6, 0, 1.5]), (4.4, 2.8, 1.5), "chitin")
    box(c, foot + np.array([4.8, 0, 1.3]), (1.4, 2.6, 1.2), "alloy")
    box(c, foot + np.array([-2.4, 0, 1.6]), (1.0, 2.2, 1.6), "cable")


def th_torso(c: Cloud, hip0, Rt, lit: bool = True) -> dict:
    """Pelvis to collar under `Rt`. Returns shoulder, neck and head anchors."""
    hip0 = np.asarray(hip0, float)
    T = lambda *v: hip0 + Rt @ np.array(v, float)  # noqa: E731
    glow = "conduit" if lit else "dead_glow"
    box(c, T(0, 0, 1.2), (3.6, 6.2, 2.8), "chitin", rot=Rt)
    for s in (1, -1):
        cylinder(c, T(0, s * 4.8, 0), T(0, s * 7.2, 0), 2.9, "cable")
    for i in range(3):
        zz = 4.6 + i * 2.0
        cylinder(c, T(-0.4, 0, zz), T(-0.4, 0, zz + 1.3), 4.4 - 0.1 * i, "cable")
    for s in (1, -1):
        capsule(c, T(2.2, s * 3.0, 3.6), T(2.8, s * 4.0, 10.6), 0.6, mat=glow)
    # Barrel chest, a chitin breastplate with a lit seam.
    ellipsoid(c, T(0.4, 0, 17.0), (7.2, 10.2, 8.2), "alloy", rot=Rt)
    box(c, T(6.0, 0, 17.4), (1.4, 6.8, 5.4), "chitin", rot=Rt @ rot_y(-0.12))
    for s in (1, -1):
        if lit:
            box(c, T(7.3, s * 2.2, 15.6), (0.2, 1.1, 3.5), "glow_edge", rot=Rt @ rot_y(-0.12))
        box(c, T(7.5, s * 2.2, 15.6), (0.15, 0.6, 3.0), glow, rot=Rt @ rot_y(-0.12))
    box(c, T(1.0, 0, 24.4), (4.6, 5.6, 1.6), "chitin", rot=Rt)  # collar
    # Hump on the back: chitin fins over a conduit, cables slack to the hips.
    ellipsoid(c, T(-5.4, 0, 20.0), (4.4, 6.6, 6.0), "chitin", rot=Rt)
    if lit:
        capsule(c, T(-9.0, 0, 14.0), T(-8.6, 0, 24.0), 1.0, mat="glow_edge")
    capsule(c, T(-9.5, 0, 14.0), T(-9.1, 0, 24.0), 0.65, mat=glow)
    for k in range(4):
        box(c, T(-9.6, 0, 14.0 + k * 3.0), (1.4, 0.6, 1.2), "gplate", rot=Rt @ rot_y(0.4))
    for s in (1, -1):
        cable(c, T(-7.0, s * 4.4, 17.0), T(-2.6, s * 5.6, 1.6), T(-10.6, s * 7.0, 8.0), 0.7)
        cable(c, T(-6.0, s * 2.2, 24.0), T(-1.8, s * 3.4, 3.0), T(-10.0, s * 3.0, 12.0), 0.5, n=6)
    return {
        "sh_r": T(0.6, -10.4, 21.4),
        "sh_l": T(0.6, 10.4, 21.4),
        "neck0": T(2.0, 0, 23.6),
        "neck1": T(5.4, 0, 26.0),
        "head": T(7.0, 0, 27.4),
        "R": Rt,
    }


def th_pauldron(c: Cloud, at, side: float, Rt=None, lit: bool = True) -> None:
    """Two layered chitin plates rimmed in pale steel, a ridge on top."""
    at = np.asarray(at, float)
    Rt = np.eye(3) if Rt is None else Rt
    P = lambda *v: at + Rt @ np.array(v, float)  # noqa: E731
    up = Rt @ np.array([0, 0, 1.0])
    ellipsoid(c, at, (6.6, 5.6, 5.0), "chitin", rot=Rt, keep=lambda p, a=at, u=up: (p - a) @ u >= -1.4)
    ellipsoid(c, P(0, side * 0.6, -1.4), (6.8, 5.8, 0.8), "gplate", rot=Rt)
    ellipsoid(c, P(0.1, side * 1.2, -2.5), (6.5, 5.5, 0.3), "conduit" if lit else "dead_glow", rot=Rt)  # lit seam
    ellipsoid(c, P(0.2, side * 1.6, -3.6), (5.6, 4.6, 0.7), "chitin", rot=Rt)  # lower plate
    ellipsoid(c, P(0.2, side * 1.9, -4.4), (5.7, 4.7, 0.4), "gplate", rot=Rt)
    box(c, P(0, side * 0.6, 4.6), (4.4, 0.8, 1.0), "gplate", rot=Rt)  # ridge


def fist(c: Cloud, wrist, fwd, lit: bool = True) -> None:
    """A big armoured fist at the end of `fwd`: chitin block, steel knuckle plate."""
    wrist = np.asarray(wrist, float)
    Rm = along(fwd)
    f = Rm @ np.array([1.0, 0, 0])
    ctr = wrist + f * 2.6
    box(c, ctr, (2.7, 2.6, 2.5), "alloy", rot=Rm)
    box(c, ctr + f * 2.6, (0.7, 2.7, 2.4), "gplate", rot=Rm)  # knuckle plate
    for k in (-1.3, 0.0, 1.3):
        box(c, ctr + f * 3.2 + Rm @ np.array([0, k, 0.9]), (0.4, 0.5, 0.5), "alloy", rot=Rm)
    box(c, ctr + Rm @ np.array([0.4, 0, 2.6]), (1.8, 2.0, 0.3), "chitin", rot=Rm)  # back plate
    if lit:
        box(c, ctr + Rm @ np.array([-1.6, 0, 2.6]), (0.5, 1.2, 0.2), "conduit", rot=Rm)


def arm(c: Cloud, sh, el, wr, side: float, Rt=None, lit: bool = True, pauldron: bool = True) -> None:
    sh, el, wr = (np.asarray(v, float) for v in (sh, el, wr))
    Rt = np.eye(3) if Rt is None else Rt
    if pauldron:
        th_pauldron(c, sh + Rt @ np.array([-0.2, side * 0.8, 2.6]), side, Rt, lit)
    capsule(c, sh, el, 3.4, 3.0, "alloy")
    ellipsoid(c, el, (3.0, 3.0, 3.0), "chitin")
    # Thick gauntlet forearm, swelling toward the fist, a chitin plate on top.
    capsule(c, el, wr, 3.2, 3.7, "alloy")
    d = wr - el
    n = np.linalg.norm(d)
    if n > 1e-6:
        Rm = along(d)
        box(c, (el + wr) / 2 + Rm @ np.array([0, 0, 2.6]), (n * 0.42, 2.2, 0.9), "chitin", rot=Rm)
        cable(c, el + Rm @ np.array([0, -side * 2.6, -1.0]), sh + np.array([-2.0, 0, -1.0]), el + Rm @ np.array([-4.0, -side * 3.6, -3.0]), 0.45, n=5)
    fist(c, wr, wr - el if n > 1e-6 else np.array([1.0, 0, 0]), lit=lit)


def head_neck(c: Cloud, a: dict, tilt: float = 0.0, lit: bool = True) -> None:
    capsule(c, a["neck0"], a["neck1"], 2.4, mat="cable")
    # Keep the head near level while the torso leans (looking where he runs).
    th_head(c, a["head"], a["R"] @ rot_y(tilt), lit=lit)


def spark(c: Cloud, at, normal, s: float) -> None:
    """Bullet strike on plate: a hot core and short rays fanning off `normal`."""
    at = np.asarray(at, float)
    n = np.asarray(normal, float)
    n = n / np.linalg.norm(n)
    u, v = R._frame(n)
    ellipsoid(c, at + n * 0.6 * s, (2.2 * s, 2.2 * s, 2.2 * s), "flash")
    for k in range(6):
        a = k * math.pi / 3 + 0.3
        d = n * 0.8 + (math.cos(a) * u + math.sin(a) * v)
        d = d / np.linalg.norm(d)
        ellipsoid(c, at + d * 3.0 * s, (3.0 * s, 0.5 * s, 0.5 * s), "flash", rot=along(d))
    ellipsoid(c, at + n * 0.8 * s, (1.3 * s, 1.3 * s, 1.3 * s), "flash_core")


# ---------------------------------------------------------------- poses


def pose_sprint(phase: float) -> Cloud:
    """Torso well forward, long strides, fists pumping against the legs."""
    c = Cloud()
    w = 2 * math.pi * phase
    bob = 1.4 * abs(math.sin(w))
    hz = HIP_Z - 1.4 + bob * 0.8
    for s, off in ((1, 0.0), (-1, 0.5)):
        p = 2 * math.pi * ((phase + off) % 1.0)
        fx = -8.2 * math.cos(p) - 0.4
        lift = 6.0 * max(0.0, math.sin(p))
        th_leg(c, np.array([-0.6, s * 5.6, hz]), np.array([fx, s * 5.8, lift]))
    Rt = rot_z(0.10 * math.cos(w)) @ rot_y(SPRINT_LEAN)
    a = th_torso(c, (-0.6, 0, hz), Rt)
    head_neck(c, a, tilt=-0.5)
    for s, key in ((1, "sh_l"), (-1, "sh_r")):
        # Arm forward when the same-side leg is back.
        k = math.cos(w) if s > 0 else -math.cos(w)
        sh = a[key]
        th = 0.85 * k  # upper-arm swing, + forward
        el = sh + np.array([10.0 * math.sin(th) + 1.0, s * 1.4, -10.0 * math.cos(th) + 1.0])
        fa = th + 1.25  # forearm bent ~70 deg up from the upper arm
        wr = el + np.array([8.6 * math.sin(fa), -s * 1.2, -8.6 * math.cos(fa)])
        arm(c, sh, el, wr, s, Rt)
    return c


def stance_legs(c: Cloud, hz: float, stagger: float = 1.0, lift_r: float = 0.0, back_r: float = 0.0) -> None:
    """Planted fighting stance, left foot forward."""
    th_leg(c, np.array([-0.6, 5.6, hz]), np.array([4.6 * stagger + 1.0, 7.0, 0.0]))
    th_leg(c, np.array([-0.6, -5.6, hz]), np.array([-5.6 * stagger - back_r, -7.0, lift_r]))


def guard(sh, side: float):
    """Fist up in front of the chest."""
    el = sh + np.array([2.4, side * 0.8, -9.6])
    wr = el + np.array([7.0, -side * 2.6, 5.6])
    return el, wr


def pose_punch(frame: int) -> Cloud:
    """0: left fist out, 1: recover, 2: right fist out, 3: recover."""
    c = Cloud()
    hz = HIP_Z - 1.6
    stance_legs(c, hz)
    lead = {0: 1, 2: -1}.get(frame, 0)
    twist = {0: -0.36, 1: -0.08, 2: 0.36, 3: 0.08}[frame]  # -: left shoulder forward
    Rt = rot_z(twist) @ rot_y(FIGHT_LEAN + (0.08 if lead else 0.0))
    a = th_torso(c, (-0.6, 0, hz), Rt)
    head_neck(c, a, tilt=-0.28)
    for s, key in ((1, "sh_l"), (-1, "sh_r")):
        sh = a[key]
        if s == lead:
            # Straight thrust from the shoulder to chest height, in front of the centre line.
            tgt = np.array([25.0, s * 4.0, sh[2] + 0.5])
            d = tgt - sh
            d = d / np.linalg.norm(d)
            el = sh + d * 10.4 + np.array([0, s * 0.8, -1.2])
            wr = el + d * 9.0
        else:
            el, wr = guard(sh, s)
            if lead:
                # The other fist pulls back toward the ribs.
                el = el + np.array([-3.0, s * 1.0, 0.4])
                wr = wr + np.array([-3.4, s * 0.6, -0.6])
        arm(c, sh, el, wr, s, Rt)
    return c


HIT = {  # twist (+ = left shoulder back), lean, hip drop, right foot back, right foot lift, spark scale
    0: (0.62, -0.10, 0.8, 0.0, 0.0, 1.15),
    1: (0.80, -0.04, 2.0, 3.6, 2.6, 0.45),
    2: (0.42, 0.14, 1.6, 2.0, 0.0, 0.0),
    3: (0.14, 0.28, 1.0, 0.6, 0.0, 0.0),
}


def pose_hit(frame: int) -> Cloud:
    """A bullet in the LEFT shoulder: twisted back hard, staggers, recovers."""
    c = Cloud()
    twist, lean, drop, back_r, lift_r, sp = HIT[frame]
    hz = HIP_Z - 1.6 - drop
    stance_legs(c, hz, stagger=0.8, lift_r=lift_r, back_r=back_r)
    Rt = rot_z(twist) @ rot_y(lean) @ rot_x(-0.12 * (twist / 0.8))  # rolls toward the hit side
    a = th_torso(c, (-0.6, 0, hz), Rt)
    head_neck(c, a, tilt=0.10 if frame < 2 else -0.15)
    # Left arm flung back and out from the hit, right fist still up.
    kick = twist / 0.8
    sh = a["sh_l"] + Rt @ np.array([-1.2 * kick, 0.6 * kick, 0.8 * kick])
    el = sh + np.array([-5.0 * kick, 4.0 + 2.0 * kick, -8.4])
    wr = el + np.array([1.6 - 3.6 * kick, 2.6 * kick, -7.6 + 2.0 * kick])
    arm(c, sh, el, wr, 1, Rt)
    sh_r = a["sh_r"]
    el, wr = guard(sh_r, -1)
    arm(c, sh_r, el, wr - np.array([0, 0, 2.0 * kick]), -1, Rt)
    if sp:
        # On the front of the left pauldron.
        at = sh + Rt @ np.array([4.6, 1.8, 5.2])
        spark(c, at, Rt @ np.array([1.0, 0.3, 0.5]), sp)
    return c


def pose_crawl(t: float, flash: int = 0) -> Cloud:
    """Legless. Chest on the dirt, dragging on the left arm, the right fist forward."""
    c = Cloud()
    pull = math.sin(2 * math.pi * t)
    z0 = 0.6 * max(0.0, pull)
    ellipsoid(c, (0, 0, 6.6 + z0), (11.6, 9.6, 6.0), "alloy")
    box(c, (2.4, 0, 11.8 + z0), (6.6, 4.6, 1.0), "chitin")
    for k in range(4):
        box(c, (-7.0 + k * 3.0, 0, 12.8 + z0), (1.2, 0.6, 1.2), "gplate")
    capsule(c, (-8.0, 0, 12.0 + z0), (5.0, 0, 12.2 + z0), 0.6, mat="conduit")
    ellipsoid(c, (-3.0, 0, 12.0 + z0), (5.6, 6.0, 3.2), "chitin")  # hump
    for i in range(3):
        cylinder(c, (-7.4 - i * 1.6, 0, 5.4 + z0), (-8.4 - i * 1.6, 0, 5.4 + z0), 4.2 - 0.3 * i, "cable")
    B.xeno_stumps(c, np.array([-13.0, 0, 5.0 + z0]), np.array([-1.0, 0, -0.1]), t, half=5.2)
    box(c, (-12.0, 0, 5.2 + z0), (2.2, 6.8, 2.6), "chitin")
    for s in (1, -1):
        cable(c, (-4.0, s * 4.0, 10.6 + z0), (-11.4, s * 5.0, 6.0 + z0), (-9.0, s * 8.0, 11.0 + z0), 0.65, n=6)
    capsule(c, (9.4, 0, 8.6 + z0), (11.8, 0, 10.6 + z0), 2.4, mat="cable")
    th_head(c, (13.6, 0, 11.6 + z0), rot_y(-0.15))
    # Right fist: forward along the ground, or raised and slammed into the dirt.
    sh_r = np.array([6.8, -10.2, 9.0 + z0])
    if flash in (1, 3):
        el = np.array([9.6, -12.6, 15.6 + z0])
        wr = np.array([15.0, -10.6, 19.0 + z0])
    elif flash in (2, 4):
        el = np.array([13.6, -12.4, 6.8 + z0])
        wr = np.array([21.0, -10.2, 2.4])
    else:
        el = np.array([12.4, -12.6, 4.6 + z0])
        wr = np.array([19.6, -10.8, 2.8 + z0])
    arm(c, sh_r, el, wr, -1, pauldron=True)
    if flash in (2, 4):
        # Grit kicked up where the fist lands.
        for k, (dx, dy) in enumerate(((3.0, 2.4), (4.6, -1.6), (2.0, -3.6))):
            ellipsoid(c, (wr[0] + 3.0 + dx, wr[1] + dy, 1.6 + k * 0.6), (1.0, 1.0, 1.0), "cable")
    # Left arm reaching and dragging, the fist dug into the dirt.
    reach = 4.0 * pull
    sh_l = np.array([6.8, 10.2, 9.0 + z0])
    el = np.array([12.6 + reach * 0.5, 12.8, 3.0])
    wr = np.array([19.4 + reach, 10.2, 2.6])
    arm(c, sh_l, el, wr, 1)
    return c


def pose_swim(frame: int) -> Cloud:
    c = Cloud()
    hz = HIP_Z
    for s in (1, -1):
        th_leg(c, np.array([-0.6, s * 5.6, hz]), np.array([0.0, s * 6.0, 0.0]))
    # Wading straightens him, so the head and pauldrons stay over the pool on every yaw.
    Rt = rot_y(-0.04)
    a = th_torso(c, (-0.6, 0, hz), Rt)
    head_neck(c, a, tilt=0.0)
    for s, key in ((1, "sh_l"), (-1, "sh_r")):
        sh = a[key]
        el = sh + np.array([3.0, s * 2.0, -8.6])
        wr = el + np.array([7.4, -s * 1.4, 1.6])
        arm(c, sh, el, wr, s, Rt)
    return B.sink(c, WATER_Z, STAND_SCALE, frame)


# Die: knees buckle, falls forward, face down. (hip height, torso lean,
# knee x, foot x, head tilt, arm reach 0..1)
DIE = {
    0: (17.0, 0.55, 2.0, -12.0, -0.35, 0.0),
    1: (13.0, 1.05, 0.5, -14.0, -0.55, 0.5),
    2: (9.2, 1.38, -3.0, -18.0, -0.30, 0.9),
    3: (6.2, math.pi / 2, -8.0, -24.0, 0.0, 1.0),
}


def pose_die_raw(frame: int) -> Cloud:
    c = Cloud()
    hz, lean, kx, fx, tilt, reach = DIE[frame]
    lit = frame < 3
    for s in (1, -1):
        hip = np.array([0.0, s * 5.6, hz])
        knee = np.array([kx, s * 6.4, 3.2 if frame < 3 else 3.0])
        foot = np.array([fx, s * (7.0 + 1.0 * frame), 0.0])
        # Knee resolved by hand: the leg folds under him, then lies out flat.
        hip_k = knee if frame < 3 else (hip + foot) / 2 + np.array([0, 0, 0.6])
        th_leg(c, hip, foot, knee=hip_k)
    Rt = rot_y(lean)
    a = th_torso(c, (0.0, 0, hz), Rt, lit=lit)
    if frame == 3:
        # Face down, the head turned to the side on the dirt.
        capsule(c, a["neck0"], a["neck1"], 2.4, mat="cable")
        th_head(c, a["head"] + np.array([0.6, 1.0, -0.6]), rot_y(math.pi / 2 - 0.2) @ rot_x(math.radians(-70)), lit=False)
    else:
        head_neck(c, a, tilt=tilt, lit=lit)
    # Arms: hanging, then thrown forward to break the fall, then sprawled.
    for s, key in ((1, "sh_l"), (-1, "sh_r")):
        sh = a[key]
        if frame == 3:
            if s > 0:
                el = sh + np.array([6.0, 4.0, 0.0])
                wr = el + np.array([8.4, -1.0, 0.0])
            else:
                el = sh + np.array([-7.6, -3.6, 0.0])
                wr = el + np.array([-8.0, 1.2, 0.0])
            el[2] = 3.0
            wr[2] = 2.6
        else:
            el = sh + np.array([2.0 + 4.0 * reach, s * 1.6, -9.4 + 2.0 * reach])
            wr = el + np.array([1.0 + 7.0 * reach, s * 0.4, -8.0 + 3.0 * reach])
            wr[2] = max(wr[2], 2.6)
        arm(c, sh, el, wr, s, Rt, lit=lit)
    return c


def _footprint_offset() -> np.ndarray:
    c = pose_die_raw(3)
    allp = np.concatenate(c.pts)
    return np.array([(allp[:, 0].min() + allp[:, 0].max()) / 2, (allp[:, 1].min() + allp[:, 1].max()) / 2, 0.0])


def pose_die(frame: int) -> Cloud:
    """Every frame shares the corpse's footprint centre, so the body does not slide."""
    c = pose_die_raw(frame)
    off = _DIE_OFF
    for p in c.pts:
        p[:, 2] = np.maximum(p[:, 2], 0.35)
    c.pts = [p - off for p in c.pts]
    return c


_DIE_OFF = _footprint_offset()


# ---------------------------------------------------------------- sheets

SHEETS = [
    R.SheetSpec("walk", 8, 0.88, STAND_SCALE, lambda i: pose_sprint(i / 8)),
    R.SheetSpec("fire", 4, 0.88, STAND_SCALE, lambda i: pose_punch(i)),
    R.SheetSpec("hit", 4, 0.88, STAND_SCALE, lambda i: pose_hit(i)),
    R.SheetSpec("crawl", 8, 0.72, PRONE_SCALE, lambda i: pose_crawl(i / 8)),
    R.SheetSpec("crawl-fire", 4, 0.72, PRONE_SCALE, lambda i: pose_crawl(0.0, flash=i + 1)),
    R.SheetSpec("die", 4, 0.72, STAND_SCALE, lambda i: pose_die(i)),
    R.SheetSpec("swim", 8, WL_Y / CELL, STAND_SCALE, lambda i: pose_swim(i), R.swim_post),
]


def main() -> int:
    return B.run("thrall", SHEETS, "render_thrall.py", sys.argv[1:])


if __name__ == "__main__":
    raise SystemExit(main())
