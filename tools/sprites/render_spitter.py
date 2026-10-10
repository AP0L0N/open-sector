#!/usr/bin/env python3
"""
Borg Spitter unit sheets — an acid-spitting taken body on the Cyborg's lock.

Same camera, cell, contact points, and row order as render_cyborg.py (and the
Borg Drone in render_borgdrone.py, whose palette, helpers and runner it
shares), so the client reuses the Cyborg's sprite defs with new file names.
The Drone's height class and frame: a deeply hunched taken body in grey-green
alloy over dark chitin, no gun, two thin claw arms hanging forward. The head
carries an elongated, swollen throat and jaw sac glowing a sickly acid green
(yellower than the hive glow), ribbed in chitin. A ribbed acid bladder rides
the back as a hump, fed to the jaw by two lit tubes over the shoulders.

Fire frames rear the head up and thrust it forward with the jaw thrown open,
a glob of acid leaving the mouth (big / small / big / tiny); the bladder
flares on the hard spits.

  python tools/sprites/render_spitter.py            # every sheet
  python tools/sprites/render_spitter.py walk fire  # some sheets

Sheets: walk (8), fire (4), crawl (8, legs torn off, dragging on both claws),
crawl-fire (4, head up, spitting), die (4), swim (8). Writes
gridlock/packages/client/src/assets/units/spitter-*.png (plus spitter-cameo.png),
the east lock at tools/sprites/src/spitter-east.png, and previews/manifests in
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
import render_borgdrone as B  # noqa: E402  (registers the Borg palette on render_cyborg)

R = B.R
CELL = B.CELL
WL_Y = B.WL_Y
Cloud = R.Cloud
ellipsoid, capsule, cylinder, box = R.ellipsoid, R.capsule, R.cylinder, R.box
rot_x, rot_y, rot_z = R.rot_x, R.rot_y, R.rot_z
along, cable, ring = B.along, B.cable, B.ring

# Acid: a yellower green than the hive glow. Registered in this process only.
SPIT_MATS = {
    "acidsac": ((96, 122, 22), (146, 182, 34), (196, 228, 74)),  # swollen sac, shaded
    "acid": (204, 240, 60),  # lit acid, emissive
    "dead_sac": ((46, 54, 24), (64, 76, 32), (84, 98, 44)),  # burst / dark sac
}
for _name, _spec in SPIT_MATS.items():
    R.MATERIALS[_name] = _spec
    if _name not in R.MAT_IDS:
        R.MAT_IDS[_name] = len(R.MAT_IDS)
R.EMISSIVE.add("acid")
# The spit "flash" is the acid glob: same un-outlined FX names, acid colours.
R.MATERIALS["flash"] = (196, 240, 64)
R.MATERIALS["flash_core"] = (240, 255, 176)

STAND_SCALE = B.STAND_SCALE  # the Drone's height class
PRONE_SCALE = STAND_SCALE * 22 / 28
HIP_Z = 28.0
HUNCH = 0.5  # deeper than the Drone's 0.32
WATER_Z = 35.0


# ---------------------------------------------------------------- parts


def sp_head(c: Cloud, at, Rm=None, jaw: float = 0.0, lit: bool = True, sac_mat: str = "acidsac") -> dict:
    """Small skull over a long, swollen, ribbed jaw sac. `jaw` opens the mandible (radians)."""
    at = np.asarray(at, float)
    Rm = np.eye(3) if Rm is None else Rm
    P = lambda *v: at + Rm @ np.array(v, float)  # noqa: E731
    glow = "optic" if lit else "dead_glow"
    ellipsoid(c, at, (3.6, 3.0, 3.4), "chitin", rot=Rm)
    box(c, P(-0.4, 0, 3.0), (2.4, 0.5, 0.8), "alloy", rot=Rm)  # skull ridge
    # Two small optics set wide, low on the skull.
    for s in (1, -1):
        ellipsoid(c, P(3.0, s * 1.6, 0.6), (0.6, 0.7, 0.6), glow, rot=Rm)
    # Upper snout: a long chitin beak over the sac.
    box(c, P(4.6, 0, -0.8), (3.0, 1.5, 1.0), "chitin", rot=Rm)
    box(c, P(4.4, 0, 0.3), (2.2, 0.4, 0.3), "alloy", rot=Rm)
    # The swollen throat sac, long and low, hanging under the jaw.
    sac_c = np.array([3.0, 0.0, -5.0])
    sr = (6.2, 4.4, 4.4)
    ellipsoid(c, P(*sac_c), sr, sac_mat, rot=Rm)
    xs = Rm @ np.array([1.0, 0, 0])
    for dx in (-2.6, 0.0, 2.6):
        k = math.sqrt(max(0.0, 1 - (dx / sr[0]) ** 2))
        ring(c, P(sac_c[0] + dx, 0, sac_c[2]), xs, sr[1] * k + 0.1, 0.32, "chitin", n=22)
    # Lower mandible, hinged under the skull, swinging down with `jaw`.
    hinge = np.array([1.2, 0, -2.2])
    Rj = Rm @ rot_y(jaw)
    J = lambda *v: at + Rm @ hinge + Rj @ np.array(v, float)  # noqa: E731
    for s in (1, -1):
        capsule(c, J(0, s * 1.6, 0), J(6.4, s * 1.0, -0.6), 0.75, 0.55, "alloy")
    box(c, J(6.4, 0, -0.6), (0.8, 1.4, 0.6), "chitin", rot=Rj)
    mouth = at + Rm @ np.array([6.8, 0, -1.6]) + Rj @ np.array([0.4, 0, -0.2]) * jaw * 2
    if lit and jaw > 0.1:
        ellipsoid(c, P(5.2, 0, -1.6 - jaw * 2.0), (1.6, 1.0, 0.9 + jaw * 1.4), "acid", rot=Rm)
    return {"mouth": mouth, "sac_rear": P(-1.6, 0, -3.6), "fwd": Rm @ np.array([1.0, 0, 0])}


def bladder(c: Cloud, center, Rt, lit: bool = True, bright: bool = False, sac_mat: str = "acidsac") -> dict:
    """Ribbed acid bladder on the back: a lit sac in a chitin cage. Returns tube ports."""
    center = np.asarray(center, float)
    Q = lambda *v: center + Rt @ np.array(v, float)  # noqa: E731
    radii = (4.6, 5.0, 6.4) if not bright else (4.9, 5.3, 6.7)
    ellipsoid(c, center, radii, sac_mat, rot=Rt)
    zax = Rt @ np.array([0, 0, 1.0])
    for dz in (-3.4, 0.0, 3.4):
        k = math.sqrt(max(0.0, 1 - (dz / radii[2]) ** 2))
        ring(c, Q(0, 0, dz), zax, max(radii[0], radii[1]) * k * 0.98 + 0.1, 0.36, "chitin", n=24)
    if lit:
        ellipsoid(c, Q(-radii[0] * 0.8, 0, 0.8), (0.9, 1.6, 2.4 if bright else 1.6), "acid", rot=Rt)
    # Cage spine and cap.
    capsule(c, Q(-radii[0] - 0.2, 0, -5.4), Q(-radii[0] - 0.2, 0, 5.4), 0.6, mat="chitin")
    cylinder(c, Q(0, 0, radii[2] - 0.6), Q(0, 0, radii[2] + 0.8), 1.8, "chitin")
    return {"l": Q(1.2, 3.0, radii[2] - 0.4), "r": Q(1.2, -3.0, radii[2] - 0.4)}


def arm(c: Cloud, sh, el, wr, claw_dir) -> None:
    B.shoulder_joint(c, sh)
    capsule(c, sh, el, 1.8, 1.5, "alloy")
    ellipsoid(c, el, (1.6, 1.6, 1.6), "chitin")
    capsule(c, el, wr, 1.3, 1.1, "cable")
    capsule(c, el + np.array([0.6, 0, 0.5]), wr + np.array([0.3, 0, 0.6]), 0.7, 0.6, "alloy")
    B.thin_claw(c, wr, claw_dir)


def glob(c: Cloud, mouth, fwd, flash: int) -> None:
    """The acid glob leaving the mouth (big / small / big / tiny)."""
    s = {1: 1.0, 2: 0.7, 3: 0.95, 4: 0.4}[flash]
    off = {1: 2.6, 2: 6.0, 3: 2.8, 4: 7.0}[flash]
    f = np.asarray(fwd, float) / np.linalg.norm(fwd)
    p = np.asarray(mouth, float) + f * off
    Rm = along(f)
    ellipsoid(c, p, (2.6 * s, 2.0 * s, 2.0 * s), "flash", rot=Rm)
    ellipsoid(c, p, (1.4 * s, 1.1 * s, 1.1 * s), "flash_core", rot=Rm)
    # A trailing string back to the mouth, droplets beside it.
    ellipsoid(c, p - f * 2.6 * s, (2.0 * s, 0.8 * s, 0.8 * s), "flash", rot=Rm)
    if flash in (1, 3):
        up = Rm @ np.array([0, 0, 1.0])
        side = Rm @ np.array([0, 1.0, 0])
        for k, (a, b) in enumerate(((0.6, 1.0), (-0.8, 0.4), (0.2, -1.2))):
            ellipsoid(c, p + f * (1.0 + k) * s + side * a * 2.4 * s + up * b * 2.0 * s, (0.6, 0.6, 0.6), "flash")


# ---------------------------------------------------------------- poses

THRUST = {0: 0.0, 1: 3.2, 2: 1.6, 3: 3.0, 4: 0.8}
JAW = {0: 0.12, 1: 0.85, 2: 0.55, 3: 0.8, 4: 0.3}


def pose_stand(phase: float | None, flash: int = 0, hunch: float = HUNCH) -> Cloud:
    c = Cloud()
    stride = 0.0 if phase is None else 1.0
    bob = 0.0 if phase is None else 0.7 * abs(math.sin(2 * math.pi * phase))
    hz = HIP_Z - bob
    for s, off in ((1, 0.0), (-1, 0.5)):
        p = 0.0 if phase is None else (phase + off) % 1.0
        fx = -5.4 * math.cos(2 * math.pi * p) * stride
        lift = 2.8 * max(0.0, math.sin(2 * math.pi * p)) * stride
        brace = -1.6 if (flash and s < 0) else (1.4 if flash else 0.0)
        B.dr_leg(c, np.array([-0.6, s * 4.4, hz]), np.array([fx + brace, s * 5.4, lift]))
    Rt = rot_y(hunch)
    hip0 = np.array([-0.6, 0, hz])
    a = B.dr_torso(c, hip0, Rt)
    T = lambda *v: hip0 + Rt @ np.array(v, float)  # noqa: E731
    bright = flash in (1, 3)
    ports = bladder(c, T(-8.6, 0, 12.4), Rt @ rot_y(-0.15), bright=bright)
    # Head: low and forward; on a spit it rears and thrusts out, the jaw thrown open.
    th = THRUST[flash]
    neck1 = a["neck1"] + np.array([1.4 + th * 0.6, 0, -1.6 + th * 0.6])
    head_at = a["head"] + np.array([2.8 + th, 0, -3.6 + th * 1.0])
    pitch = 0.18 if not flash else -0.12 - 0.05 * th  # nose down at rest, up and out to spit
    Rh = rot_y(pitch)
    capsule(c, a["neck0"], neck1, 1.8, 1.5, "cable")
    capsule(c, neck1, head_at + np.array([-2.0, 0, -0.6]), 1.5, mat="cable")
    h = sp_head(c, head_at, Rh, jaw=JAW[flash])
    # Feed tubes from the bladder over the shoulders to the back of the sac.
    for s, port in ((1, ports["l"]), (-1, ports["r"])):
        ctrl = (port + h["sac_rear"]) / 2 + np.array([0, s * 4.6, 1.0])
        cable(c, port, h["sac_rear"] + np.array([0, s * 1.8, 0]), ctrl, 0.5, mat="acidsac", n=8)
    if flash:
        glob(c, h["mouth"], h["fwd"], flash)
    # Arms: thin, claws hanging forward; spread to brace on a spit.
    swing = 0.0 if phase is None else 2.2 * math.sin(2 * math.pi * phase)
    for s, sw in ((1, swing), (-1, -swing)):
        sh = a["sh_l"] if s > 0 else a["sh_r"]
        spread = 1.6 if flash else 0.0
        el = sh + np.array([1.4 - sw, s * (1.2 + spread), -7.6])
        wr = el + np.array([4.2 - sw * 0.5, s * (-0.2 + spread * 0.5), -5.6])
        arm(c, sh, el, wr, (0.7, 0.0, -0.8))
    return c


def pose_crawl(t: float, flash: int = 0) -> Cloud:
    """Legless. Belly on the dirt, the bladder on the back, dragging on both claws."""
    c = Cloud()
    pull = math.sin(2 * math.pi * t)
    z0 = 0.5 * max(0.0, pull)
    ellipsoid(c, (0, 0, 5.4 + z0), (9.0, 6.6, 4.6), "alloy")
    box(c, (1.6, 0, 9.0 + z0), (5.0, 3.2, 0.8), "chitin")
    for i in range(3):
        cylinder(c, (-6.0 - i * 1.4, 0, 4.6 + z0), (-6.8 - i * 1.4, 0, 4.6 + z0), 3.0 - 0.3 * i, "cable")
    B.borg_stumps(c, np.array([-10.6, 0, 4.2 + z0]), np.array([-1.0, 0, -0.1]), t, half=3.8)
    box(c, (-9.6, 0, 4.4 + z0), (1.8, 4.8, 2.0), "chitin")
    bright = flash in (1, 3)
    ports = bladder(c, (-2.0, 0, 12.6 + z0), rot_y(math.pi / 2 - 0.15), bright=bright)
    # Head: low on the dirt; raised and thrust to spit.
    th = THRUST[flash]
    lift = 3.6 if flash else 0.0
    head_at = np.array([12.0 + th * 0.8, 0, 9.4 + z0 + lift])
    capsule(c, (7.0, 0, 7.4 + z0), head_at + np.array([-2.6, 0, -0.4]), 1.7, mat="cable")
    h = sp_head(c, head_at, rot_y(0.05 if not flash else -0.2), jaw=JAW[flash])
    for s, port in ((1, ports["l"]), (-1, ports["r"])):
        ctrl = (port + h["sac_rear"]) / 2 + np.array([0, s * 4.0, 1.0])
        cable(c, port, h["sac_rear"] + np.array([0, s * 1.8, 0]), ctrl, 0.5, mat="acidsac", n=7)
    if flash:
        glob(c, h["mouth"], h["fwd"], flash)
    # Both arms reaching and dragging, alternating.
    for s in (1, -1):
        reach = 3.6 * pull * s
        sh = np.array([5.6, s * 7.0, 7.4 + z0])
        el = np.array([9.6 + reach * 0.5, s * 9.6, 2.4])
        wr = np.array([15.0 + reach, s * 8.4, 1.6])
        arm(c, sh, el, wr, (1.0, -0.1 * s, -0.3))
    return c


def pose_swim(frame: int) -> Cloud:
    # Wading straightens him, so the head and sac stay over the pool on every yaw.
    return B.sink(pose_stand(None, hunch=0.12), WATER_Z, STAND_SCALE, frame)


def pose_dead() -> Cloud:
    """Face down, the bladder burst and dark, the sac slack, one leg torn off beside him."""
    c = Cloud()
    ellipsoid(c, (0, 0, 3.8), (9.0, 6.8, 3.8), "alloy")
    box(c, (1.0, 0, 7.2), (5.0, 3.2, 0.8), "chitin")
    B.borg_stumps(c, np.array([-10.2, 0, 3.0]), np.array([-1.0, 0, -0.05]), 0.5, half=3.8)
    box(c, (-9.2, 0, 3.2), (1.8, 4.8, 1.8), "chitin")
    bladder(c, (-2.4, 1.6, 9.0), rot_y(math.pi / 2 - 0.1) @ rot_x(0.3), lit=False, sac_mat="dead_sac")
    sp_head(c, (12.4, -1.0, 3.6), rot_z(math.radians(-15)) @ rot_x(math.radians(-70)), jaw=0.5, lit=False, sac_mat="dead_sac")
    capsule(c, (7.0, 0, 4.4), (10.0, -0.8, 3.6), 1.6, mat="cable")
    # A spilled acid puddle by the mouth.
    ellipsoid(c, (17.0, -2.0, 0.4), (3.6, 2.6, 0.4), "acidsac")
    for s in (1, -1):
        el = np.array([9.6, s * 10.0, 2.0])
        wr = np.array([14.6, s * 9.8, 1.6])
        capsule(c, (5.0, s * 7.0, 4.2), el, 1.8, 1.5, "alloy")
        capsule(c, el, wr, 1.3, 1.1, "cable")
        B.thin_claw(c, wr, (1.0, -0.2 * s, 0.0))
    # A torn leg on its side, foot toward the hips.
    lr = rot_z(math.radians(95)) @ rot_x(math.radians(90))
    base = np.array([0.0, 12.6, 2.6])
    capsule(c, base, base + lr @ np.array([0, 0, -10.0]), 2.6, 2.0, "alloy")
    ellipsoid(c, base + lr @ np.array([0.9, 0, -10.0]), (2.0, 2.1, 2.0), "chitin")
    capsule(c, base + lr @ np.array([0, 0, -10.0]), base + lr @ np.array([-1.6, 0, -19.0]), 1.5, 1.3, "cable")
    box(c, base + lr @ np.array([0.0, 0, -21.0]), (3.2, 1.8, 1.0), "chitin", rot=lr)
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
    return B.run("spitter", SHEETS, "render_spitter.py", sys.argv[1:])


if __name__ == "__main__":
    raise SystemExit(main())
