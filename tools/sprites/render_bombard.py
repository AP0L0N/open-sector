#!/usr/bin/env python3
"""
Xenite Bombard unit sheets — a heavy taken body hauling a long plasma cannon.

Built on render_thrall.py (and through it the Drone's lock in render_xenodrone.py):
the Cyborg's camera, cell, contact points and row order, the Thrall's heavy frame,
blue-steel palette and armoured fists, at the Thrall's scale. So the client reuses
the Cyborg's sprite defs with new file names, and the Bombard that has dropped its
cannon fights in the very poses the Thrall does.

What makes it a Bombard: a plasma cell drum on its back, ringed in the hive's
green plasma glow, and a long plasma cannon carried at the hip in both fists, fed
from the drum by a thick cable. The cannon is a chitin-caged breech chamber full
of green plasma, a long barrel with emitter rings, and a forked muzzle. Fire
frames brace, kick the cannon back, and throw a big green plasma flash at the
muzzle (big / small / big / tiny), the chamber flaring on the hard shots.

Without the cannon (the "fists-" sheets) the drum stays on its back and the feed
cable hangs torn from it; the poses are the Thrall's own: sprint, pummel, crawl,
wade, fall.

  python tools/sprites/render_bombard.py               # every sheet
  python tools/sprites/render_bombard.py walk fire     # some sheets

Sheets (16 rows each): walk (8), fire (4), crawl (8, legs torn off, dragging the
cannon), crawl-fire (4), die (4, the cannon falls beside him), swim (8), and
fists-walk (8), fists-fire (4), fists-crawl (8), fists-crawl-fire (4), fists-die (4),
fists-swim (8); cannon (1, the dropped cannon lying on the ground). Writes
gridlock/packages/client/src/assets/units/bombard-*.png (plus bombard-cameo.png),
the east lock at tools/sprites/src/bombard-east.png, and previews/manifests in
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
import render_thrall as T  # noqa: E402  (the Thrall's palette and frame, on the Drone's lock)

B = T.B
R = T.R
CELL = T.CELL
WL_Y = T.WL_Y
Cloud = R.Cloud
ellipsoid, capsule, cylinder, box = R.ellipsoid, R.capsule, R.cylinder, R.box
rot_x, rot_y, rot_z = R.rot_x, R.rot_y, R.rot_z
along, cable, ring = B.along, B.cable, B.ring

# The hive's plasma: the green of the plasma orbs in flight (energy-fx.ts). This process only.
PLASMA_MATS = {
    "plasma": (150, 255, 200),  # lit plasma, emissive
    "plasma_deep": ((40, 150, 100), (70, 205, 140), (120, 240, 180)),  # the chamber's glass, shaded
    "plasma_dead": ((24, 46, 40), (34, 64, 54), (48, 84, 70)),
}
for _name, _spec in PLASMA_MATS.items():
    R.MATERIALS[_name] = _spec
    if _name not in R.MAT_IDS:
        R.MAT_IDS[_name] = len(R.MAT_IDS)
R.EMISSIVE.add("plasma")
# The un-outlined FX pair is the cannon's plasma flash.
R.MATERIALS["flash"] = (150, 255, 200)
R.MATERIALS["flash_core"] = (246, 255, 250)

STAND_SCALE = T.STAND_SCALE
PRONE_SCALE = T.PRONE_SCALE
HIP_Z = T.HIP_Z
WATER_Z = T.WATER_Z
GUN_LEN = 36.0
GUN_R = 3.2

# ---------------------------------------------------------------- parts


def drum(c: Cloud, at, Rt, lit: bool = True) -> dict:
    """The plasma cell on the back: an upright drum in a chitin cradle, lit rings. Returns the feed port."""
    at = np.asarray(at, float)
    Q = lambda *v: at + Rt @ np.array(v, float)  # noqa: E731
    zax = Rt @ np.array([0, 0, 1.0])
    glow = "plasma" if lit else "plasma_dead"
    cylinder(c, Q(0, 0, -6.0), Q(0, 0, 6.0), 4.4, "plasma_deep" if lit else "plasma_dead")
    for dz in (-6.4, 0.0, 6.4):
        cylinder(c, Q(0, 0, dz - 0.8), Q(0, 0, dz + 0.8), 4.9, "chitin")
    for dz in (-3.2, 3.2):
        ring(c, Q(0, 0, dz), zax, 4.6, 0.5, glow, n=22)
    for s in (1, -1):
        capsule(c, Q(1.6, s * 4.6, -6.6), Q(1.6, s * 4.6, 6.6), 0.8, mat="alloy")  # cradle
    cylinder(c, Q(0, 0, 7.0), Q(0, 0, 8.4), 2.4, "alloy")  # cap
    return {"port": Q(-0.6, -4.6, -4.0)}


def torn_cable(c: Cloud, port, lit: bool = True) -> None:
    """The cannon's feed, torn: a short slack length hanging off the drum, a spark at the end."""
    port = np.asarray(port, float)
    end = port + np.array([2.0, -2.6, -9.0])
    cable(c, port, end, port + np.array([-1.4, -3.4, -4.0]), 0.9, mat="cable", n=6)
    if lit:
        ellipsoid(c, end + np.array([0, 0, -0.6]), (0.8, 0.8, 0.8), "plasma")


def cannon(c: Cloud, rear, fwd, flash: int = 0, recoil: float = 0.0, lit: bool = True) -> dict:
    """The plasma cannon from `rear` along `fwd`. Returns the grips, the feed port and the muzzle."""
    Rm = along(fwd)
    f = Rm @ np.array([1.0, 0, 0])
    up = Rm @ np.array([0, 0, 1.0])
    side = Rm @ np.array([0, 1.0, 0])
    base = np.asarray(rear, float) - f * recoil
    bright = lit and flash in (1, 3)
    glow = "plasma" if lit else "plasma_dead"
    # Breech chamber: a glass of plasma in a chitin cage.
    ch = base + f * 5.0
    ellipsoid(c, ch, (6.6, 5.2, 5.2) if not bright else (7.0, 5.6, 5.6), "plasma_deep" if lit else "plasma_dead", rot=Rm)
    for t in (-2.6, 0.0, 2.6):
        k = math.sqrt(max(0.0, 1 - (t / 6.6) ** 2))
        ring(c, ch + f * t, f, 5.2 * k + 0.3, 0.5, "chitin", n=24)
    for k in range(4):
        a = k * math.pi / 2 + math.pi / 4
        o = (math.cos(a) * side + math.sin(a) * up) * 4.3
        capsule(c, ch - f * 5.0 + o * 0.7, ch + f * 5.0 + o * 0.7, 0.5, mat="alloy")
    if lit:
        ellipsoid(c, ch + up * 2.0, (2.2, 1.2, 1.2 if not bright else 2.0), "plasma", rot=Rm)
    cylinder(c, base - f * 1.2, base + f * 0.6, 3.4, "chitin")  # back cap
    # Barrel: thick, with emitter rings out to a forked muzzle.
    b0 = base + f * 10.6
    tip = base + f * GUN_LEN
    cylinder(c, b0, tip, GUN_R, "alloy")
    for t in (0.42, 0.6, 0.78):
        p = base + f * GUN_LEN * t
        cylinder(c, p, p + f * 1.4, GUN_R + 0.7, "chitin")
        ring(c, p + f * 1.6, f, GUN_R + 0.2, 0.35, glow, n=16)
    box(c, base + f * (GUN_LEN * 0.6) + up * (GUN_R + 0.3), (GUN_LEN * 0.22, 0.4, 0.25), glow, rot=Rm)  # top conduit
    capsule(c, base + f * 8.0 + up * 5.0, base + f * 15.0 + up * 3.4, 0.7, mat="alloy")  # carry handle
    capsule(c, base + f * 6.4 + up * 3.4, base + f * 8.0 + up * 5.0, 0.7, mat="alloy")
    cylinder(c, tip - f * 2.6, tip, GUN_R + 1.0, "chitin")  # muzzle collar
    for k in range(3):
        a = k * 2 * math.pi / 3 + math.pi / 2
        o = (math.cos(a) * side + math.sin(a) * up) * (GUN_R + 0.2)
        capsule(c, tip + o, tip + o * 1.25 + f * 3.0, 0.75, 0.5, "alloy")
    ellipsoid(c, tip + f * 0.6, (0.9, 1.7, 1.7), glow, rot=Rm)
    muzzle = tip + f * 3.2
    if flash:
        s = {1: 1.1, 2: 0.75, 3: 1.0, 4: 0.45}[flash]
        B.flash_star(c, muzzle, f, s, spin=flash * 0.5)
        ellipsoid(c, muzzle + f * 1.2 * s, (3.8 * s, 3.4 * s, 3.4 * s), "flash", rot=Rm)
        ellipsoid(c, muzzle + f * 1.2 * s, (2.2 * s, 2.0 * s, 2.0 * s), "flash_core", rot=Rm)
    return {
        "grip_r": base + f * 7.0 - up * 3.6 - side * 0.6,
        "grip_l": base + f * 17.0 - up * (GUN_R + 1.2),
        "port": base + f * 1.0 - side * 3.2,
        "muzzle": muzzle,
        "f": f,
    }


def merge_turned(c: Cloud, sub: Cloud, pivot, Rm) -> None:
    """Add `sub` to `c`, turned by `Rm` about `pivot` (normals too), each part kept apart."""
    pivot = np.asarray(pivot, float)
    for pts, nrm, mat, part in zip(sub.pts, sub.nrm, sub.mat, sub.part):
        c.pts.append((pts - pivot) @ Rm.T + pivot)
        c.nrm.append(nrm @ Rm.T)
        c.mat.append(mat)
        c.part.append(part + c._next_part)
    c._next_part += sub._next_part


def axis_rot(axis, ang: float) -> np.ndarray:
    """Rotation by `ang` about the unit `axis` (Rodrigues)."""
    k = np.asarray(axis, float) / np.linalg.norm(axis)
    K = np.array([[0, -k[2], k[1]], [k[2], 0, -k[0]], [-k[1], k[0], 0]])
    return np.eye(3) + math.sin(ang) * K + (1 - math.cos(ang)) * (K @ K)


# ---------------------------------------------------------------- the drum on every torso

_th_torso = T.th_torso
# "armed": the feed runs on to the cannon (drawn by the pose); "torn": a stub hangs off the drum.
PACK = {"style": "torn"}


def bombard_torso(c: Cloud, hip0, Rt, lit: bool = True) -> dict:
    a = _th_torso(c, hip0, Rt, lit)
    hip0 = np.asarray(hip0, float)
    d = drum(c, hip0 + Rt @ np.array([-11.2, 0, 18.4]), Rt, lit)
    a["port"] = d["port"]
    if PACK["style"] == "torn":
        torn_cable(c, d["port"], lit)
    return a


# Every Thrall pose builds its torso through this name, so the drum rides on all of them.
T.th_torso = bombard_torso


def feed(c: Cloud, port, gun_port) -> None:
    """The fat feed cable from the drum round the hip to the cannon's breech."""
    port = np.asarray(port, float)
    gun_port = np.asarray(gun_port, float)
    ctrl = (port + gun_port) / 2 + np.array([-3.0, -7.0, -6.0])
    cable(c, port, gun_port, ctrl, 1.0, mat="cable", n=9)


def hold(c: Cloud, a: dict, g: dict, Rt) -> None:
    """Both arms on the cannon: the right fist on the rear grip, the left under the barrel."""
    for s, key, grip in ((1, "sh_l", g["grip_l"]), (-1, "sh_r", g["grip_r"])):
        sh = a[key]
        wr = np.asarray(grip, float) - g["f"] * 2.6
        el = (sh + wr) / 2 + np.array([-2.4, s * 3.6, -4.0])
        T.arm(c, sh, el, wr, s, Rt)


# ---------------------------------------------------------------- armed poses

RECOIL = {0: 0.0, 1: 3.0, 2: 1.4, 3: 2.6, 4: 0.6}


def pose_stand(phase: float | None, flash: int = 0) -> Cloud:
    """Heavy walk with the cannon at the hip; on a shot, braced, the cannon raised to lob."""
    PACK["style"] = "armed"
    c = Cloud()
    stride = 0.0 if phase is None else 1.0
    w = 0.0 if phase is None else 2 * math.pi * phase
    bob = 0.0 if phase is None else 0.9 * abs(math.sin(w))
    hz = HIP_Z - 0.6 - bob
    if flash:
        T.stance_legs(c, hz, stagger=0.9)
    else:
        for s, off in ((1, 0.0), (-1, 0.5)):
            p = 0.0 if phase is None else 2 * math.pi * ((phase + off) % 1.0)
            fx = -5.6 * math.cos(p) * stride
            lift = 3.4 * max(0.0, math.sin(p)) * stride
            T.th_leg(c, np.array([-0.6, s * 5.6, hz]), np.array([fx, s * 6.2, lift]))
    lean = 0.14 if not flash else 0.04 - 0.02 * RECOIL[flash]
    Rt = rot_z(0.05 * math.cos(w) * stride) @ rot_y(lean)
    a = bombard_torso(c, (-0.6, 0, hz), Rt)
    T.head_neck(c, a, tilt=-0.2)
    pitch = 0.12 if not flash else 0.2
    fwd = np.array([math.cos(pitch), 0.0, math.sin(pitch)])
    rear = np.array([-9.0, -6.4, hz + 13.0 + (0.8 if flash else 0.0)])
    g = cannon(c, rear, fwd, flash=flash, recoil=RECOIL[flash])
    feed(c, a["port"], g["port"])
    hold(c, a, g, Rt)
    PACK["style"] = "torn"
    return c


def pose_crawl(t: float, flash: int = 0) -> Cloud:
    """Legless, dragging himself on the left arm, the cannon under the right; raised on the dirt to fire."""
    c = T.pose_crawl(t)
    pull = math.sin(2 * math.pi * t)
    z0 = 0.6 * max(0.0, pull)
    d = drum(c, (-4.0, 0, 15.4 + z0), rot_y(math.pi / 2 - 0.2))
    pitch = 0.04 if not flash else 0.22
    fwd = np.array([math.cos(pitch), -0.05, math.sin(pitch)])
    rear = np.array([-3.0, -13.6, 4.6 + z0 + (1.6 if flash else 0.0)])
    g = cannon(c, rear, fwd, flash=flash, recoil=RECOIL[flash])
    feed(c, d["port"], g["port"])
    return c


def pose_swim(frame: int) -> Cloud:
    """Chest-deep, the cannon held up across the chest, clear of the water."""
    PACK["style"] = "armed"
    c = Cloud()
    hz = HIP_Z
    for s in (1, -1):
        T.th_leg(c, np.array([-0.6, s * 5.6, hz]), np.array([0.0, s * 6.0, 0.0]))
    Rt = rot_y(-0.04)
    a = bombard_torso(c, (-0.6, 0, hz), Rt)
    T.head_neck(c, a, tilt=0.0)
    fwd = np.array([math.cos(0.2), 0.0, math.sin(0.2)])
    g = cannon(c, np.array([-6.4, -4.6, hz + 16.0]), fwd)
    feed(c, a["port"], g["port"])
    hold(c, a, g, Rt)
    PACK["style"] = "torn"
    return B.sink(c, WATER_Z, STAND_SCALE, frame)


# Die: the cannon slips from his hands as he falls. (rear point, pitch, roll about its axis)
DIE_GUN = {
    0: ((-6.0, -6.0, 26.0), 0.0, 0.0),
    1: ((-2.0, -11.0, 15.0), -0.35, 0.4),
    2: ((2.0, -14.0, 6.0), -0.1, 0.9),
    3: ((2.0, -15.0, 2.6), 0.0, 1.2),
}


def pose_die(frame: int, armed: bool) -> Cloud:
    PACK["style"] = "armed" if armed else "torn"
    c = T.pose_die_raw(frame)
    PACK["style"] = "torn"
    if armed:
        rear, pitch, roll = DIE_GUN[frame]
        fwd = np.array([math.cos(pitch), 0.25 * frame, math.sin(pitch)])
        sub = Cloud()
        cannon(sub, np.array(rear, float), fwd, lit=frame < 2)
        # Rolled onto its side as it lands.
        merge_turned(c, sub, rear, axis_rot(fwd, roll))
    off = T._DIE_OFF
    for p in c.pts:
        p[:, 2] = np.maximum(p[:, 2], 0.35)
    c.pts = [p - off for p in c.pts]
    return c


# ---------------------------------------------------------------- without the cannon


def fists_crawl(t: float, flash: int = 0) -> Cloud:
    c = T.pose_crawl(t, flash=flash)
    pull = math.sin(2 * math.pi * t)
    z0 = 0.6 * max(0.0, pull)
    d = drum(c, (-4.0, 0, 15.4 + z0), rot_y(math.pi / 2 - 0.2))
    torn_cable(c, d["port"])
    return c


def pose_cannon() -> Cloud:
    """The dropped cannon on its side in the dirt, dark, the torn feed beside it."""
    c = Cloud()
    fwd = np.array([1.0, 0.0, 0.0])
    sub = Cloud()
    r0 = np.array([-15.0, 0.0, 4.0])
    cannon(sub, r0, fwd, lit=False)
    merge_turned(c, sub, r0, rot_x(0.9))
    port = r0 + np.array([1.0, 3.0, -1.0])
    cable(c, port, port + np.array([-6.0, 6.0, -3.0]), port + np.array([-1.0, 7.0, 0.0]), 0.9, mat="cable", n=6)
    for p in c.pts:
        p[:, 2] = np.maximum(p[:, 2], 0.35)
    return B.centre_footprint(c)


# ---------------------------------------------------------------- sheets

SHEETS = [
    R.SheetSpec("walk", 8, 0.88, STAND_SCALE, lambda i: pose_stand(None if i == 0 else i / 8)),
    R.SheetSpec("fire", 4, 0.88, STAND_SCALE, lambda i: pose_stand(None, flash=i + 1)),
    R.SheetSpec("crawl", 8, 0.72, PRONE_SCALE, lambda i: pose_crawl(i / 8)),
    R.SheetSpec("crawl-fire", 4, 0.72, PRONE_SCALE, lambda i: pose_crawl(0.0, flash=i + 1)),
    R.SheetSpec("die", 4, 0.72, STAND_SCALE, lambda i: pose_die(i, True)),
    R.SheetSpec("swim", 8, WL_Y / CELL, STAND_SCALE, lambda i: pose_swim(i), R.swim_post),
    R.SheetSpec("fists-walk", 8, 0.88, STAND_SCALE, lambda i: T.pose_sprint(i / 8)),
    R.SheetSpec("fists-fire", 4, 0.88, STAND_SCALE, lambda i: T.pose_punch(i)),
    R.SheetSpec("fists-crawl", 8, 0.72, PRONE_SCALE, lambda i: fists_crawl(i / 8)),
    R.SheetSpec("fists-crawl-fire", 4, 0.72, PRONE_SCALE, lambda i: fists_crawl(0.0, flash=i + 1)),
    R.SheetSpec("fists-die", 4, 0.72, STAND_SCALE, lambda i: pose_die(i, False)),
    R.SheetSpec("fists-swim", 8, WL_Y / CELL, STAND_SCALE, lambda i: T.pose_swim(i), R.swim_post),
    R.SheetSpec("cannon", 1, 0.72, STAND_SCALE, lambda i: pose_cannon()),
]


def main() -> int:
    return B.run("bombard", SHEETS, "render_bombard.py", sys.argv[1:])


if __name__ == "__main__":
    raise SystemExit(main())
