#!/usr/bin/env python3
"""
Xenomorph Drone unit sheets — a fork of render_simunit2.py under the Cyborg's lock.

The cheap Xenomorph line cyborg: the Cyborg's camera, cell, contact points, and row
order, so the client reuses the Cyborg's sprite defs with new file names. A
slim, hunched frame in cold grey-green alloy over dark chitin plates, no
pauldrons, exposed cabling down the back and round the hips, a single sickly
green optic on the right of the face, green conduits at the waist, and a short
pulse carbine in place of the right forearm (three green coils, green flash).
The left hand is a thin three-finger claw. About 6% lighter than the Cyborg and
hunched, so it stands roughly four fifths of his height.

  python tools/sprites/render_xenodrone.py            # every sheet
  python tools/sprites/render_xenodrone.py walk fire  # some sheets

Sheets: walk (8, a stride every frame), fire (4, carbine flash big / small /
big / tiny with a short recoil), crawl (8, legs torn off, dragging on the left
claw, carbine forward), crawl-fire (4), die (4), swim (8, chest-deep in the
shared pool). Writes gridlock/packages/client/src/assets/units/xenodrone-*.png
(plus xenodrone-cameo.png), the east lock at tools/sprites/src/xenodrone-east.png,
and previews/manifests in tools/sprites/preview/. Exits 2 if a row is empty or
clipped.

The shared Xenomorph parts (materials, green flash, cables, rings, torn hips) and the
sheet runner live here; render_lancer.py imports them.
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.dont_write_bytecode = True
import render_cyborg as R  # noqa: E402
from compose_unit_sheet import ENGINE_ORDER, compose_sheet, diagnostics, preview_strip, preview_turntable  # noqa: E402
from derive_swim import WL_Y, bob_of  # noqa: E402

UNITS = R.UNITS
SRC = R.SRC
PREVIEW = R.PREVIEW
CELL = R.CELL

# ---------------------------------------------------------------- Xenomorph palette

XENO_MATS = {
    "alloy": ((64, 76, 68), (98, 112, 102), (138, 154, 142)),  # cold grey-green alloy
    "chitin": ((20, 24, 22), (36, 42, 38), (58, 66, 60)),  # dark chitin plates
    "cable": ((30, 32, 32), (48, 52, 50), (70, 76, 72)),  # exposed cabling
    "gplate": ((84, 92, 88), (122, 130, 124), (162, 170, 164)),  # pale steel edge
    "optic": (160, 255, 96),  # sickly green optic
    "conduit": (96, 204, 72),  # lit conduits, coils
    "gspark": (190, 255, 120),  # torn-cable spark
    "dead_glow": ((32, 44, 32), (46, 62, 44), (62, 82, 58)),  # dark optic / ring
}
for _name, _spec in XENO_MATS.items():
    R.MATERIALS[_name] = _spec
    if _name not in R.MAT_IDS:
        R.MAT_IDS[_name] = len(R.MAT_IDS)
for _name in ("optic", "conduit", "gspark"):
    R.EMISSIVE.add(_name)
# Xenomorph weapons flash green. The renderer treats these two names as un-outlined FX,
# so recolouring them (in this process only) keeps that behaviour.
R.MATERIALS["flash"] = (130, 255, 96)
R.MATERIALS["flash_core"] = (232, 255, 214)

Cloud = R.Cloud
ellipsoid, capsule, cylinder, box = R.ellipsoid, R.capsule, R.cylinder, R.box
rot_x, rot_y, rot_z = R.rot_x, R.rot_y, R.rot_z


# ---------------------------------------------------------------- shared parts


def along(fwd) -> np.ndarray:
    """Rotation taking +x onto `fwd`."""
    fwd = np.asarray(fwd, float)
    fwd = fwd / np.linalg.norm(fwd)
    yaw = math.atan2(fwd[1], fwd[0])
    pitch = -math.asin(max(-1.0, min(1.0, fwd[2])))
    return rot_z(yaw) @ rot_y(pitch)


def cable(c: Cloud, a, b, ctrl, r: float = 0.6, mat: str = "cable", n: int = 8) -> None:
    """A slack cable: capsules chained along a quadratic Bezier."""
    a, b, ctrl = (np.asarray(v, float) for v in (a, b, ctrl))
    pts = [(1 - t) ** 2 * a + 2 * (1 - t) * t * ctrl + t**2 * b for t in np.linspace(0, 1, n + 1)]
    for p0, p1 in zip(pts[:-1], pts[1:]):
        capsule(c, p0, p1, r, mat=mat)


def ring(c: Cloud, center, axis, radius: float, r: float, mat: str, n: int = 28) -> None:
    """A torus of capsule segments around `axis`."""
    center = np.asarray(center, float)
    u, v = R._frame(np.asarray(axis, float))
    pts = [center + radius * (math.cos(a) * u + math.sin(a) * v) for a in np.arange(n + 1) / n * 2 * math.pi]
    for p0, p1 in zip(pts[:-1], pts[1:]):
        capsule(c, p0, p1, r, mat=mat)


def xeno_stumps(c: Cloud, pelvis, back: np.ndarray, t: float, half: float = 4.4) -> None:
    """Torn hips: ragged alloy struts, cut cables, a green spark that flickers with `t`."""
    pelvis = np.asarray(pelvis, float)
    for s in (1, -1):
        hip = pelvis + np.array([0, s * half, 0])
        capsule(c, hip, hip + back * 3.0, 2.8, 2.2, "alloy")
        tip = hip + back * 3.6
        cylinder(c, tip - back * 0.6, tip + back * 0.7, 1.4, "chitin")
        for k, ang in enumerate((0.6, -0.5, 1.8)):
            d = back * 2.4 + np.array([0, math.cos(ang + s) * 1.6, math.sin(ang) * 1.6])
            capsule(c, tip, tip + d, 0.5, mat="conduit" if k == 0 else "cable", caps=False)
        if (int(t * 4) + (s > 0)) % 2 == 0:
            ellipsoid(c, tip + back * 2.6 + np.array([0, 0, 0.8]), (1.1, 1.1, 1.1), "gspark")


def flash_star(c: Cloud, muzzle, fwd, s: float, spin: float = 0.0) -> None:
    """Green muzzle flash along `fwd`, scaled by `s`."""
    muzzle = np.asarray(muzzle, float)
    Rm = along(fwd)
    f = Rm @ np.array([1.0, 0, 0])
    ellipsoid(c, muzzle + f * 3.8 * s, (4.6 * s, 1.0 * s, 1.0 * s), "flash", rot=Rm)
    for k in range(4):
        rk = Rm @ rot_x(k * math.pi / 2 + spin + math.pi / 4)
        d = rk @ np.array([0.0, 1.0, 0.0])
        ellipsoid(c, muzzle + f * 1.4 * s + d * 2.0 * s, (0.9 * s, 2.2 * s, 0.8 * s), "flash", rot=rk)
    ellipsoid(c, muzzle + f * 1.6 * s, (1.9 * s, 1.6 * s, 1.6 * s), "flash_core", rot=Rm)


def sink(c: Cloud, water_z: float, scale: float, frame: int) -> Cloud:
    """Sink a stand cloud to the swim plane (z = 0 is the water); drop what is under."""
    dz = -water_z + bob_of(frame) / (scale * R.COS_P)
    out = Cloud()
    for p, n, m, k in zip(c.pts, c.nrm, c.mat, c.part):
        p = p + np.array([0.0, 0.0, dz])
        keep = p[:, 2] >= 0.0
        if keep.any():
            out.pts.append(p[keep])
            out.nrm.append(n[keep])
            out.mat.append(m[keep])
            out.part.append(k[keep])
    return out


def centre_footprint(c: Cloud) -> Cloud:
    """Flatten onto the dirt and put the footprint centre on the pivot (corpses)."""
    for p in c.pts:
        p[:, 2] = np.maximum(p[:, 2], 0.35)
    allp = np.concatenate(c.pts)
    ctr = np.array([(allp[:, 0].min() + allp[:, 0].max()) / 2, (allp[:, 1].min() + allp[:, 1].max()) / 2, 0.0])
    c.pts = [p - ctr for p in c.pts]
    return c


# ---------------------------------------------------------------- drone parts

STAND_SCALE = 1.2 * 0.94
PRONE_SCALE = STAND_SCALE * 22 / 28
HIP_Z = 29.0
HUNCH = 0.32  # forward lean of the torso, radians
WATER_Z = 36.0


def dr_head(c: Cloud, at, Rm=None, lit: bool = True) -> None:
    """Narrow chitin skull, an alloy face plate, one green optic on the right."""
    at = np.asarray(at, float)
    Rm = np.eye(3) if Rm is None else Rm
    P = lambda *v: at + Rm @ np.array(v, float)  # noqa: E731
    ellipsoid(c, at, (4.0, 3.4, 4.2), "chitin", rot=Rm)
    box(c, P(2.6, 0.6, -0.6), (1.4, 2.4, 2.6), "alloy", rot=Rm)  # face plate
    box(c, P(2.8, 0, -3.0), (1.2, 1.8, 1.0), "cable", rot=Rm)  # jaw grille
    # The optic: a short barrel out of the right of the face, lens lit green.
    cylinder(c, P(3.0, -1.6, 0.6), P(4.6, -1.6, 0.6), 1.5, "alloy")
    ellipsoid(c, P(4.7, -1.6, 0.6), (0.5, 1.15, 1.15), "optic" if lit else "dead_glow", rot=Rm)
    box(c, P(-0.6, 0, 3.6), (2.6, 0.5, 0.9), "alloy", rot=Rm)  # skull ridge
    # Cables out of the back of the skull.
    for s in (1, -1):
        capsule(c, P(-3.0, s * 1.4, -1.0), P(-4.6, s * 2.0, -4.2), 0.55, mat="cable")


def carbine(c: Cloud, elbow, fwd, flash: int = 0, recoil: float = 0.0, lit: bool = True) -> np.ndarray:
    """Pulse carbine for a forearm, from the elbow along `fwd`. Returns the muzzle."""
    elbow = np.asarray(elbow, float)
    Rm = along(fwd)
    f = Rm @ np.array([1.0, 0, 0])
    up = Rm @ np.array([0, 0, 1.0])
    base = elbow - f * recoil
    ellipsoid(c, elbow, (2.0, 2.0, 2.0), "chitin")
    box(c, base + f * 3.8, (3.8, 1.9, 2.1), "chitin", rot=Rm)  # receiver
    box(c, base + f * 3.6 + up * 2.2, (3.0, 1.1, 0.35), "gplate", rot=Rm)  # top rail
    box(c, base + f * 4.0 + Rm @ np.array([0, -2.0, 0]), (2.4, 0.2, 0.6), "conduit" if lit else "dead_glow", rot=Rm)  # lit seam
    box(c, base + f * 2.6 - up * 2.3, (1.0, 1.0, 0.7), "cable", rot=Rm)  # cell
    b0 = base + f * 7.4
    b1 = base + f * 13.4
    capsule(c, b0, b1, 1.05, 0.95, "cable", caps=False)
    for k in (8.4, 10.0, 11.6):
        cylinder(c, base + f * k, base + f * (k + 0.6), 1.5, "conduit" if lit else "dead_glow")
    cylinder(c, b1, b1 + f * 0.6, 1.3, "chitin")
    muzzle = b1 + f * 0.7
    ellipsoid(c, muzzle, (0.4, 0.8, 0.8), "optic" if lit else "dead_glow", rot=Rm)
    if flash:
        s = {1: 1.0, 2: 0.7, 3: 0.95, 4: 0.4}[flash]
        flash_star(c, muzzle, f, s, spin=flash * 0.4)
    return muzzle


def thin_claw(c: Cloud, wrist, fwd) -> None:
    wrist = np.asarray(wrist, float)
    fwd = np.asarray(fwd, float) / np.linalg.norm(fwd)
    ellipsoid(c, wrist, (1.5, 1.5, 1.5), "chitin")
    side = np.cross(np.array([0, 0, 1.0]), fwd)
    side = side / max(1e-6, np.linalg.norm(side))
    for k in (-1, 0, 1):
        a = wrist + fwd * 1.0 + side * k * 0.8
        capsule(c, a, a + fwd * 2.4 + np.array([0, 0, -1.4]) + side * k * 0.5, 0.42, mat="alloy")


def dr_leg(c: Cloud, hip, foot) -> None:
    hip = np.asarray(hip, float)
    foot = np.asarray(foot, float)
    ankle = foot + np.array([0, 0, 2.6])
    knee = R.leg_ik(hip, ankle, 14.0, 13.6)
    capsule(c, hip, knee, 2.6, 2.0, "alloy")
    ellipsoid(c, knee + np.array([0.9, 0, 0.3]), (2.0, 2.1, 2.2), "chitin")
    capsule(c, knee, ankle, 1.5, 1.3, "cable")  # bare strut
    capsule(c, knee + np.array([0.7, 0, -1.6]), ankle + np.array([0.9, 0, 2.6]), 1.2, 1.0, "chitin")  # shin plate
    # Exposed cable down the back of the leg.
    cable(c, hip + np.array([-2.0, 0, -1.0]), ankle + np.array([-1.4, 0, 0.6]), knee + np.array([-3.6, 0, 0]), 0.45, n=5)
    ellipsoid(c, ankle, (1.6, 1.7, 1.5), "chitin")
    box(c, foot + np.array([1.4, 0, 1.1]), (3.4, 1.9, 1.1), "chitin")
    box(c, foot + np.array([4.2, 0, 0.9]), (1.0, 1.7, 0.8), "alloy")
    box(c, foot + np.array([-1.8, 0, 1.2]), (0.8, 1.6, 1.2), "cable")


def dr_torso(c: Cloud, hip0, Rt) -> dict:
    """Pelvis to collar, leaning by `Rt`. Returns the shoulder, neck and head anchors."""
    hip0 = np.asarray(hip0, float)
    T = lambda *v: hip0 + Rt @ np.array(v, float)  # noqa: E731
    box(c, T(0, 0, 1.0), (2.6, 4.4, 2.2), "chitin", rot=Rt)
    for s in (1, -1):
        cylinder(c, T(0, s * 3.6, 0), T(0, s * 5.4, 0), 2.1, "cable")
    # Exposed spine stack with lit conduits either side.
    for i in range(3):
        zz = 3.8 + i * 2.0
        cylinder(c, T(-0.6, 0, zz), T(-0.6, 0, zz + 1.1), 2.7 - 0.15 * i, "cable")
    for s in (1, -1):
        capsule(c, T(1.0, s * 2.2, 3.4), T(1.4, s * 3.0, 9.8), 0.45, mat="conduit")
    # Chest: a narrow alloy barrel, a chitin plate on the front.
    ellipsoid(c, T(0, 0, 14.8), (4.6, 6.4, 5.8), "alloy", rot=Rt)
    box(c, T(3.8, 0, 15.2), (1.0, 4.0, 3.8), "chitin", rot=Rt @ rot_y(-0.1))
    box(c, T(4.85, -1.6, 14.0), (0.12, 0.5, 2.0), "conduit", rot=Rt @ rot_y(-0.1))
    box(c, T(0.2, 0, 20.2), (2.8, 3.6, 1.0), "chitin", rot=Rt)  # collar
    # Back: chitin spine fins over a lit conduit, slack cables down to the hips.
    capsule(c, T(-4.6, 0, 9.0), T(-5.0, 0, 19.0), 0.6, mat="conduit")
    for k in range(4):
        box(c, T(-5.6, 0, 9.6 + k * 3.0), (1.4, 0.5, 1.1), "chitin", rot=Rt @ rot_y(0.35))
    for s in (1, -1):
        cable(c, T(-4.0, s * 3.4, 18.0), T(-2.4, s * 4.4, 1.4), T(-8.2, s * 5.0, 9.0), 0.6)
        cable(c, T(-3.4, s * 1.8, 19.6), T(-1.4, s * 3.0, 3.0), T(-7.0, s * 2.6, 10.0), 0.45, mat="cable", n=6)
    return {
        "sh_r": T(0.6, -7.2, 18.6),
        "sh_l": T(0.6, 7.2, 18.6),
        "neck0": T(1.2, 0, 20.8),
        "neck1": T(3.0, 0, 23.6),
        "head": T(3.6, 0, 26.0),
    }


def shoulder_joint(c: Cloud, at) -> None:
    at = np.asarray(at, float)
    ellipsoid(c, at, (2.7, 2.5, 2.4), "chitin")
    box(c, at + np.array([0, 0, 2.0]), (1.8, 1.4, 0.4), "alloy")


# ---------------------------------------------------------------- drone poses


def pose_stand(phase: float | None, flash: int = 0, hunch: float = HUNCH) -> Cloud:
    c = Cloud()
    stride = 0.0 if phase is None else 1.0
    bob = 0.0 if phase is None else 0.7 * abs(math.sin(2 * math.pi * phase))
    hz = HIP_Z - bob
    for s, off in ((1, 0.0), (-1, 0.5)):
        p = 0.0 if phase is None else (phase + off) % 1.0
        fx = -6.0 * math.cos(2 * math.pi * p) * stride
        lift = 3.0 * max(0.0, math.sin(2 * math.pi * p)) * stride
        dr_leg(c, np.array([-0.6, s * 4.0, hz]), np.array([fx, s * 4.6, lift]))
    a = dr_torso(c, (-0.6, 0, hz), rot_y(hunch))
    capsule(c, a["neck0"], a["neck1"], 1.6, mat="cable")
    dr_head(c, a["head"], rot_y(-0.08))
    swing = 0.0 if phase is None else 2.2 * math.sin(2 * math.pi * phase)
    # Right: bare upper arm, the carbine for a forearm, held forward at the hip.
    sh = a["sh_r"]
    shoulder_joint(c, sh)
    recoil = {0: 0.0, 1: 1.2, 2: 0.5, 3: 1.0, 4: 0.2}[flash]
    el = sh + np.array([-0.4 - swing * 0.3 - recoil * 0.4, -1.4, -8.2])
    capsule(c, sh, el, 2.0, 1.7, "alloy")
    capsule(c, sh + np.array([-1.2, 0, -0.6]), el + np.array([-1.4, 0, 0.2]), 0.5, mat="cable")
    carbine(c, el, (1.0, 0.04, -0.06 if flash == 0 else 0.0), flash=flash, recoil=recoil)
    cable(c, a["sh_r"] + np.array([-3.0, 1.6, -2.0]), el + np.array([0.0, -0.6, -1.6]), el + np.array([-5.0, -2.4, -4.0]), 0.5, n=6)
    # Left: thin arm swinging, claw hand.
    sh = a["sh_l"]
    shoulder_joint(c, sh)
    el = sh + np.array([-1.0 - swing, 1.0, -7.4])
    wr = el + np.array([3.6 - swing * 0.5, -0.4, -5.4])
    capsule(c, sh, el, 1.9, 1.6, "alloy")
    ellipsoid(c, el, (1.7, 1.7, 1.7), "chitin")
    capsule(c, el, wr, 1.4, 1.2, "cable")
    capsule(c, el + np.array([0.8, 0.9, 0]), wr + np.array([0.4, 0.9, 0.6]), 0.8, 0.7, "alloy")
    thin_claw(c, wr, (0.6, -0.1, -0.8))
    return c


def pose_crawl(t: float, flash: int = 0) -> Cloud:
    """Legless. Chest on the dirt, dragging on the left claw, carbine forward."""
    c = Cloud()
    pull = math.sin(2 * math.pi * t)
    z0 = 0.5 * max(0.0, pull)
    ellipsoid(c, (0, 0, 5.4 + z0), (9.0, 6.6, 4.6), "alloy")
    box(c, (1.6, 0, 9.4 + z0), (5.0, 3.2, 0.8), "chitin")
    for k in range(4):
        box(c, (-6.0 + k * 2.8, 0, 10.4 + z0), (1.0, 0.5, 1.2), "chitin", rot=rot_y(0.35 - math.pi / 2 * 0.0))
    capsule(c, (-7.0, 0, 9.4 + z0), (4.0, 0, 9.6 + z0), 0.55, mat="conduit")
    for i in range(3):
        cylinder(c, (-6.0 - i * 1.4, 0, 4.6 + z0), (-6.8 - i * 1.4, 0, 4.6 + z0), 3.0 - 0.3 * i, "cable")
    xeno_stumps(c, np.array([-10.6, 0, 4.2 + z0]), np.array([-1.0, 0, -0.1]), t, half=3.8)
    box(c, (-9.6, 0, 4.4 + z0), (1.8, 4.8, 2.0), "chitin")
    for s in (1, -1):
        cable(c, (-4.0, s * 3.0, 9.0 + z0), (-10.0, s * 4.0, 5.2 + z0), (-8.0, s * 6.4, 9.0 + z0), 0.55, n=6)
    capsule(c, (7.4, 0, 7.6 + z0), (9.6, 0, 9.6 + z0), 1.6, mat="cable")
    dr_head(c, (11.8, 0, 10.8 + z0))
    # Right arm: carbine forward along the ground, lifted a touch to fire.
    sh_r = np.array([5.6, -7.4, 7.6 + z0])
    shoulder_joint(c, sh_r)
    recoil = {0: 0.0, 1: 1.0, 2: 0.4, 3: 0.8, 4: 0.2}[flash]
    el = np.array([8.4 - recoil * 0.4, -8.6, 3.6 + z0 + (0.8 if flash else 0.0)])
    capsule(c, sh_r, el, 1.9, 1.6, "alloy")
    carbine(c, el, (1.0, 0.05, 0.0), flash=flash, recoil=recoil)
    # Left arm reaching and dragging, the claw dug into the dirt.
    reach = 3.6 * pull
    sh_l = np.array([5.6, 7.4, 7.6 + z0])
    shoulder_joint(c, sh_l)
    el = np.array([10.6 + reach * 0.5, 9.4, 2.2])
    wr = np.array([16.0 + reach, 7.8, 1.6])
    capsule(c, sh_l, el, 1.9, 1.6, "alloy")
    ellipsoid(c, el, (1.7, 1.7, 1.7), "chitin")
    capsule(c, el, wr, 1.4, 1.2, "cable")
    thin_claw(c, wr, (1.0, -0.1, -0.3))
    return c


def pose_swim(frame: int) -> Cloud:
    # Wading straightens him, so the head stays over the pool on every yaw.
    return sink(pose_stand(None, hunch=0.08), WATER_Z, STAND_SCALE, frame)


def pose_dead() -> Cloud:
    """Face down, optic dark, carbine arm flung out, one leg torn off beside him."""
    c = Cloud()
    ellipsoid(c, (0, 0, 3.8), (9.0, 6.8, 3.8), "alloy")
    box(c, (1.0, 0, 7.2), (5.0, 3.2, 0.8), "chitin")
    for k in range(4):
        box(c, (-6.0 + k * 2.8, 0, 8.0), (1.0, 0.5, 1.0), "chitin")
    capsule(c, (-7.0, 0, 7.4), (4.0, 0, 7.6), 0.5, mat="dead_glow")
    xeno_stumps(c, np.array([-10.2, 0, 3.0]), np.array([-1.0, 0, -0.05]), 0.5, half=3.8)
    box(c, (-9.2, 0, 3.2), (1.8, 4.8, 1.8), "chitin")
    dr_head(c, (11.6, 1.0, 4.0), rot_x(math.radians(-25)), lit=False)
    # Carbine arm flung out to the right.
    sh = np.array([5.0, -7.2, 4.2])
    el = np.array([8.6, -11.0, 2.4])
    capsule(c, sh, el, 1.9, 1.6, "alloy")
    carbine(c, el, (0.6, -0.8, 0.0), lit=False)
    # Left arm limp forward.
    el = np.array([10.0, 10.0, 2.0])
    wr = np.array([15.4, 9.4, 1.6])
    capsule(c, (5.0, 7.2, 4.2), el, 1.9, 1.6, "alloy")
    capsule(c, el, wr, 1.4, 1.2, "cable")
    thin_claw(c, wr, (1.0, -0.2, 0.0))
    # A torn leg on its side, foot toward the hips.
    lr = rot_z(math.radians(95)) @ rot_x(math.radians(90))
    base = np.array([0.0, 12.6, 2.6])
    capsule(c, base, base + lr @ np.array([0, 0, -10.0]), 2.6, 2.0, "alloy")
    ellipsoid(c, base + lr @ np.array([0.9, 0, -10.0]), (2.0, 2.1, 2.0), "chitin")
    capsule(c, base + lr @ np.array([0, 0, -10.0]), base + lr @ np.array([-1.6, 0, -19.0]), 1.5, 1.3, "cable")
    box(c, base + lr @ np.array([0.0, 0, -21.0]), (3.2, 1.8, 1.0), "chitin", rot=lr)
    return centre_footprint(c)


# ---------------------------------------------------------------- runner

SHEETS = [
    R.SheetSpec("walk", 8, 0.88, STAND_SCALE, lambda i: pose_stand(None if i == 0 else i / 8)),
    R.SheetSpec("fire", 4, 0.88, STAND_SCALE, lambda i: pose_stand(None, flash=i + 1)),
    R.SheetSpec("crawl", 8, 0.72, PRONE_SCALE, lambda i: pose_crawl(i / 8)),
    R.SheetSpec("crawl-fire", 4, 0.72, PRONE_SCALE, lambda i: pose_crawl(0.0, flash=i + 1)),
    R.SheetSpec("die", 4, 0.72, STAND_SCALE, lambda i: pose_dead()),
    R.SheetSpec("swim", 8, WL_Y / CELL, STAND_SCALE, lambda i: pose_swim(i), R.swim_post),
]


def render_sheet(spec):
    clouds = [spec.pose(i) for i in range(spec.frames)]
    rows = []
    for r in range(16):
        cells = [R.render(cl, r, spec.scale, spec.contact_y) for cl in clouds]
        if spec.post:
            cells = [spec.post(im, i) for i, im in enumerate(cells)]
        rows.append(cells)
    sheet = compose_sheet(rows, CELL)
    placed = {ENGINE_ORDER[r]: rows[r][0] for r in range(16)}
    return sheet, placed


def run(uid: str, sheets, source: str, argv: list[str]) -> int:
    PREVIEW.mkdir(parents=True, exist_ok=True)
    SRC.mkdir(parents=True, exist_ok=True)
    status = 0
    only = argv or None
    for spec in sheets:
        if only and spec.name not in only:
            continue
        R.CLIPPED.clear()
        sheet, placed = render_sheet(spec)
        clipped = sorted({ENGINE_ORDER[r] for r in R.CLIPPED}, key=ENGINE_ORDER.index)
        out = UNITS / f"{uid}-{spec.name}.png"
        sheet.save(out)
        diag = diagnostics(placed, CELL)
        pops = [d["dir"] for d in diag if d.get("pop")]
        empties = [d["dir"] for d in diag if d.get("empty")]
        stem = out.stem
        preview_turntable(placed, CELL).save(PREVIEW / f"{stem}-turntable.png")
        draw = 26 if spec.contact_y < 0.8 else 20
        preview_strip(sheet, CELL, spec.frames, draw).save(PREVIEW / f"{stem}-strip.png")
        manifest = {
            "id": stem,
            "cell": CELL,
            "cols": spec.frames,
            "rows": 16,
            "facing": 16,
            "order": ENGINE_ORDER,
            "contactY": spec.contact_y,
            "scale": round(spec.scale, 4),
            "out": str(out.relative_to(R.ROOT)),
            "size_pop_dirs": pops,
            "empty_dirs": empties,
            "clipped_dirs": clipped,
            "diag": diag,
            "source": f"{source} (16 unique yaws, no mirror)",
        }
        (PREVIEW / f"{stem}-manifest.json").write_text(json.dumps(manifest, indent=2))
        print(f"{stem}: {sheet.size} frames={spec.frames} pops={pops} empty={empties} clipped={clipped}")
        if empties or clipped:
            status = 2
        if spec.name == "walk":
            east = placed["E"]
            R.on_magenta(east).save(SRC / f"{uid}-east.png")
            R.cameo(east).save(UNITS / f"{uid}-cameo.png")
    return status


def main() -> int:
    return run("xenodrone", SHEETS, "render_xenodrone.py", sys.argv[1:])


if __name__ == "__main__":
    raise SystemExit(main())
