#!/usr/bin/env python3
"""
Juggernaut unit sheets: a giant of the hive with a two-handed hammer.

The Cyborg's camera, outline, and point-cloud rasterizer (render_cyborg.py), the
Xenite Drone's palette (cold grey-green alloy, dark chitin, lit green conduits), on
the Titan's 192 cell. One model, 16 unique yaws, no mirroring, one scale on every
sheet so nothing pops when the client swaps sheets. Team tint lands on the grey
pauldron caps.

  python3 tools/sprites/render_juggernaut.py            # every sheet
  python3 tools/sprites/render_juggernaut.py swing walk # some

Sheets (frames, what the client does with them):
  walk        8  hammer on the right shoulder, both hands on the haft; a stride every frame
  swing       8  one blow, looped in time with the hits: frame 0 is the hammer on the
                 ground (the hit), then up, held high and drawn back, frame 7 coming down
  fists       8  the hammer gone: a stride with the fists swinging
  punch       8  two blows: the right fist lands on frame 0, the left on frame 4
  throw       4  wound back, the release, empty hands forward, back on guard
  ram         8  the charge: a long low run, the haft levelled in front, head leading
  ram-fists   8  the same run without the hammer: forearms locked, left shoulder leading
  ramhit      4  the slam (flash and dust at the hammer head), rocked back, settling, on guard
  ramhit-fists 4 the same with the fists
  *-wade      the same five, sunk to mid-thigh in the shared swim pool (derive_swim.py's
              water, foam, and ripple rings); the swing's hit throws up a splash
Plus the wreck (1 frame, the live cell, contact and scale) at
assets/units/wrecks/juggernaut.png: face down, the hammer beside it.

Writes gridlock/packages/client/src/assets/units/juggernaut-*.png, the east lock at
tools/sprites/src/juggernaut-east.png, the cameo, and previews/manifests in
tools/sprites/preview/. Exits 2 if a row is empty or clipped.
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.dont_write_bytecode = True
import render_cyborg as R  # noqa: E402
from compose_unit_sheet import ENGINE_ORDER, compose_sheet, diagnostics, preview_strip, preview_turntable  # noqa: E402
from derive_swim import DEEP, FOAM, RIPPLE, WATER  # noqa: E402

UNITS = R.UNITS
SRC = R.SRC
PREVIEW = R.PREVIEW
WRECKS = UNITS / "wrecks"

CELL = 192
SCALE = 1.6
CONTACT_Y = 0.82
# Wreck on the ground: the body's footprint centre, like the infantry corpses.
WRECK_CONTACT_Y = 0.62

XENO_MATS = {
    "alloy": ((60, 72, 64), (92, 106, 96), (124, 140, 128)),  # cold grey-green alloy, a step under the Drone's
    "chitin": ((20, 24, 22), (36, 42, 38), (58, 66, 60)),  # dark chitin plates
    "cable": ((30, 32, 32), (48, 52, 50), (70, 76, 72)),  # exposed cabling
    "gplate": ((76, 84, 80), (110, 118, 112), (140, 148, 142)),  # pale steel edge
    "optic": (160, 255, 96),  # green optic
    "conduit": (96, 204, 72),  # lit conduits on the back and the hammer head
    "dead_glow": ((32, 44, 32), (46, 62, 44), (62, 82, 58)),  # dark conduit on the wreck
    # Surface detail (see `plating`): panel seams, rivet heads, scuffed and grimed plate.
    "seam": ((22, 26, 24), (34, 40, 36), (48, 56, 50)),
    "bolt": ((44, 50, 46), (76, 84, 78), (112, 120, 114)),
    "alloy_worn": ((48, 58, 52), (74, 86, 78), (100, 114, 104)),
    "gplate_worn": ((62, 70, 66), (90, 98, 92), (116, 124, 118)),
    "chitin_worn": ((30, 34, 30), (50, 56, 50), (74, 82, 74)),
}
for _name, _spec in XENO_MATS.items():
    R.MATERIALS[_name] = _spec
    if _name not in R.MAT_IDS:
        R.MAT_IDS[_name] = len(R.MAT_IDS)
for _name in ("optic", "conduit"):
    R.EMISSIVE.add(_name)
R.MATERIALS["flash"] = (130, 255, 96)
R.MATERIALS["flash_core"] = (232, 255, 214)
# Wading: a foam collar where the body meets the water, and the hammer's splash.
for _name, _spec in {
    "foam": ((96, 140, 136), (128, 172, 166), (168, 204, 198)),
    "splash": ((120, 168, 162), (170, 210, 204), (214, 238, 232)),
    # The ram's slam: dirt thrown up where it strikes.
    "dust": ((88, 76, 60), (124, 110, 86), (158, 142, 114)),
}.items():
    R.MATERIALS[_name] = _spec
    if _name not in R.MAT_IDS:
        R.MAT_IDS[_name] = len(R.MAT_IDS)

Cloud = R.Cloud
ellipsoid, capsule, cylinder, box = R.ellipsoid, R.capsule, R.cylinder, R.box
rot_x, rot_y, rot_z = R.rot_x, R.rot_y, R.rot_z

HIP_Z = 29.0
THIGH, SHIN = 15.0, 13.6
UPPER, FORE = 13.5, 13.0
HAFT = 30.0  # grip to the middle of the head
BUTT = 7.0  # grip to the butt end


# ---------------------------------------------------------------- helpers


def _along(fwd) -> np.ndarray:
    """Rotation taking +x onto `fwd`."""
    fwd = np.asarray(fwd, float)
    fwd = fwd / np.linalg.norm(fwd)
    yaw = math.atan2(fwd[1], fwd[0])
    pitch = -math.asin(max(-1.0, min(1.0, fwd[2])))
    return rot_z(yaw) @ rot_y(pitch)


def two_bone(a, b, l1: float, l2: float, pole) -> np.ndarray:
    """Middle joint between a and b, bending toward `pole`."""
    a = np.asarray(a, float)
    b = np.asarray(b, float)
    d = b - a
    dist = min(float(np.linalg.norm(d)), l1 + l2 - 1e-3)
    dirv = d / max(1e-6, np.linalg.norm(d))
    x = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist)
    h = math.sqrt(max(0.0, l1 * l1 - x * x))
    pole = np.asarray(pole, float)
    perp = pole - dirv * float(pole @ dirv)
    n = np.linalg.norm(perp)
    perp = perp / n if n > 1e-6 else np.array([0, 0, -1.0])
    return a + dirv * x + perp * h


def sag(phi: float) -> np.ndarray:
    """Unit vector in the body's sagittal plane: 0 is forward, 90° is straight up."""
    return np.array([math.cos(phi), 0.0, math.sin(phi)])


# ---------------------------------------------------------------- surface detail

WORN = {"alloy": "alloy_worn", "gplate": "gplate_worn", "chitin": "chitin_worn"}


def _hash01(q: np.ndarray, salt: int) -> np.ndarray:
    """Stable per-cell noise in [0, 1) for integer cells `q` (n, 3)."""
    q = q.astype(np.int64)
    h = (q[:, 0] * 73856093) ^ (q[:, 1] * 19349663) ^ (q[:, 2] * 83492791) ^ (salt * 2654435761)
    h = (h ^ (h >> 13)) * 1274126177
    return ((h ^ (h >> 16)) & 0xFFFF) / 65536.0


def plating(base: str, origin, rot=None, step=(6.0, 6.0, 6.0), seam: float = 0.45, wear: float = 0.18,
            bolts: bool = True, salt: int = 0):
    """Material for one part: `base` cut into panels by seams every `step` along its own axes
    (None skips an axis), rivets beside the seams, and blotches of scuffed plate. Worked out in
    the part's frame (`origin`, `rot` as passed to the primitive), so it rides with the pose."""
    origin = np.asarray(origin, float)
    rot = np.eye(3) if rot is None else np.asarray(rot, float)
    worn = WORN.get(base, base)

    def mat(p: np.ndarray) -> np.ndarray:
        q = (p - origin) @ rot
        names = np.full(len(p), base, dtype=object)
        names[_hash01(np.floor(q / 2.6), salt) < wear] = worn
        on_seam = np.zeros(len(p), bool)
        near = np.full(len(p), np.inf)
        for ax, s in enumerate(step):
            if not s:
                continue
            f = (q[:, ax] / s) % 1.0
            d = np.minimum(f, 1.0 - f) * s
            on_seam |= d < seam
            near = np.minimum(near, d)
        if bolts:
            # A rivet row just off each seam, one every couple of units along the other axes.
            pitch = _hash01(np.floor(q / 2.4), salt + 3) < 0.35
            ring = (near > seam + 0.35) & (near < seam + 0.85)
            dots = np.zeros(len(p), bool)
            for ax, s in enumerate(step):
                if s:
                    f = (q[:, ax] / 2.4) % 1.0
                    dots |= np.minimum(f, 1.0 - f) < 0.16
            names[ring & dots & pitch] = "bolt"
        names[on_seam] = "seam"
        return names

    return mat


def limb_frame(a, b) -> np.ndarray:
    """Rotation whose columns are the a→b axis and two normals: a capsule's own frame."""
    d = np.asarray(b, float) - np.asarray(a, float)
    d = d / max(1e-6, np.linalg.norm(d))
    u, v = R._frame(d)
    return np.stack([d, u, v], axis=1)


def limb_plating(base: str, a, b, band: float, **kw):
    """Plating for a capsule a→b: hoops every `band` along it and one seam down its length."""
    return plating(base, a, limb_frame(a, b), step=(band, None, kw.pop("split", None)), **kw)


# ---------------------------------------------------------------- parts


def leg(c: Cloud, hip, foot) -> None:
    hip = np.asarray(hip, float)
    foot = np.asarray(foot, float)
    ankle = foot + np.array([0, 0, 3.6])
    knee = two_bone(hip, ankle, THIGH, SHIN, (1, 0, 0))
    capsule(c, hip, knee, 6.2, 5.0, limb_plating("alloy", hip, knee, 7.5, salt=11))
    # Armour slab down the front of the thigh.
    d = (knee - hip) / np.linalg.norm(knee - hip)
    side = np.cross(d, [1.0, 0, 0])
    side = side / max(1e-6, np.linalg.norm(side))
    fwd = np.cross(side, d)
    slab = np.stack([d, side, fwd], axis=1)
    mid = hip + (knee - hip) * 0.5 + fwd * 4.8
    box(c, mid, (5.4, 3.4, 0.9), plating("chitin", mid, slab, step=(5.4, 40.0, None), salt=12), rot=slab)
    ellipsoid(c, knee + np.array([2.2, 0, 0.4]), (3.8, 4.0, 4.2), plating("gplate", knee, step=(None, 40.0, 2.6), salt=13))
    capsule(c, knee, ankle, 4.2, 3.4, limb_plating("chitin", knee, ankle, 6.8, bolts=False, salt=14))
    s0, s1 = knee + np.array([1.4, 0, -2.0]), ankle + np.array([1.8, 0, 2.4])
    capsule(c, s0, s1, 3.0, 2.4, limb_plating("alloy", s0, s1, 5.5, salt=15))
    capsule(c, knee + np.array([-3.2, 0, -1.0]), ankle + np.array([-3.0, 0, 1.4]), 1.0, mat="cable")
    ellipsoid(c, ankle, (3.0, 3.2, 2.6), "chitin")
    box(c, foot + np.array([2.2, 0, 1.9]), (6.2, 4.0, 1.9), plating("alloy", foot, step=(None, None, None), salt=16))
    box(c, foot + np.array([7.0, 0, 1.5]), (1.6, 3.8, 1.5), plating("gplate", foot, step=(None, 2.6, None), bolts=False, salt=17))
    box(c, foot + np.array([-3.8, 0, 2.0]), (1.4, 3.4, 2.0), "chitin")


def torso(c: Cloud, hz: float, lean: float = 0.0) -> dict[str, np.ndarray]:
    """Pelvis to shoulders, hunched forward by `lean` (radians). Returns the shoulder and head points."""
    piv = np.array([0.0, 0.0, hz])
    Rm = rot_y(-lean)  # positive lean tips the chest forward (+x, down)
    P = lambda *v: piv + Rm @ np.array(v, float)  # noqa: E731
    box(c, P(-0.6, 0, 1.6), (5.6, 8.4, 3.6), plating("chitin", P(-0.6, 0, 1.6), Rm, step=(None, 8.4, None), salt=21), rot=Rm)  # pelvis
    box(c, P(4.6, 0, 1.0), (1.2, 4.0, 3.0), plating("gplate", P(4.6, 0, 1.0), Rm, step=(None, None, 2.0), salt=22), rot=Rm)  # codpiece plate
    for i in range(3):
        cylinder(c, P(-0.6, 0, 6.0 + i * 2.6), P(-0.6, 0, 7.6 + i * 2.6), 6.4 - 0.3 * i, "cable")  # ribbed waist
    ellipsoid(c, P(1.0, 0, 20.0), (9.4, 13.6, 10.4), plating("alloy", P(1.0, 0, 20.0), Rm, step=(None, 13.6, 7.0), salt=23), rot=Rm)  # chest
    bp = Rm @ rot_y(-0.15)
    box(c, P(8.6, 0, 20.4), (1.6, 8.6, 6.4), plating("gplate", P(8.6, 0, 20.4), bp, step=(None, 8.6, None), salt=24), rot=bp)  # breastplate
    for i in range(3):  # belly lames under the breastplate, overlapping downward
        ab = Rm @ rot_y(-0.3)
        at = P(7.6 - 0.5 * i, 0, 12.6 - 2.5 * i)
        box(c, at, (1.2, 6.4 - 0.7 * i, 1.1), plating("chitin", at, ab, step=(None, 3.2, None), salt=25 + i), rot=ab)
    gorget = P(3.4, 0, 27.6)
    ellipsoid(c, gorget, (6.4, 9.0, 2.2), plating("chitin", gorget, Rm, step=(None, 3.0, None), bolts=False, salt=28), rot=Rm)
    for s in (1, -1):
        box(c, P(9.6, s * 4.4, 16.0), (0.4, 0.9, 3.0), "conduit", rot=Rm)  # chest vents
    # Back: a hump of chitin with lit conduits running down it.
    ellipsoid(c, P(-7.0, 0, 23.0), (6.0, 10.0, 7.4), plating("chitin", P(-7.0, 0, 23.0), Rm, step=(None, 10.0, 7.4), salt=29), rot=Rm)
    for s in (1, -1):
        capsule(c, P(-11.2, s * 3.6, 28.0), P(-9.6, s * 4.2, 14.0), 0.9, mat="conduit")
        capsule(c, P(-10.0, s * 7.6, 26.0), P(-6.0, s * 10.6, 30.6), 1.4, mat="cable")
    head = P(6.6, 0, 30.4)
    shoulders = {s: P(0.6, s * 13.6, 27.0) for s in (1, -1)}
    return {"head": head, "R": shoulders[-1], "L": shoulders[1], "Rm": Rm}


def head(c: Cloud, at, Rm) -> None:
    """Small skull sunk between the shoulders, a green optic band, a jaw plate."""
    at = np.asarray(at, float)
    P = lambda *v: at + Rm @ np.array(v, float)  # noqa: E731
    ellipsoid(c, at, (4.4, 4.4, 4.6), plating("chitin", at, Rm, step=(None, 40.0, 3.0), bolts=False, salt=31), rot=Rm)
    box(c, P(3.4, 0, -2.2), (1.6, 3.2, 1.8), "gplate", rot=Rm)
    box(c, P(4.3, 0, 0.9), (0.6, 3.4, 0.7), "optic", rot=Rm)
    box(c, P(-0.6, 0, 4.2), (3.6, 0.8, 0.9), "alloy", rot=Rm)  # crest


def pauldron(c: Cloud, at, side: float) -> None:
    at = np.asarray(at, float)
    ellipsoid(c, at + np.array([0, side * 1.0, 2.6]), (7.0, 6.2, 5.0), plating("gplate", at, step=(None, None, 2.6), bolts=False, salt=41),
              keep=lambda p, z=at[2]: p[:, 2] >= z + 0.6)  # stacked lames
    ellipsoid(c, at + np.array([0, side * 1.4, 4.0]), (5.0, 4.4, 3.6), "metal", keep=lambda p, z=at[2]: p[:, 2] >= z + 4.6)  # team tint
    ellipsoid(c, at + np.array([0, side * 2.2, 1.0]), (7.2, 5.0, 0.8), "chitin")


def arm(c: Cloud, shoulder, hand, side: float, pole=(-0.6, 0.0, -1.0), fist: bool = True) -> None:
    shoulder = np.asarray(shoulder, float)
    hand = np.asarray(hand, float)
    p = np.asarray(pole, float) + np.array([0, side * 0.7, 0])
    elbow = two_bone(shoulder, hand, UPPER, FORE, p)
    pauldron(c, shoulder, side)
    capsule(c, shoulder, elbow, 4.6, 4.0, limb_plating("alloy", shoulder, elbow, 6.8, salt=51))
    ellipsoid(c, elbow, (3.8, 3.8, 3.8), "chitin")
    capsule(c, elbow, hand, 5.0, 4.4, limb_plating("alloy", elbow, hand, 6.5, salt=52))  # heavy forearm
    g0, g1 = elbow + (hand - elbow) * 0.2, elbow + (hand - elbow) * 0.75
    capsule(c, g0, g1, 5.3, 5.0, limb_plating("chitin", g0, g1, 3.6, salt=53),  # dark gauntlet plates
            keep=lambda q, e=elbow, h=hand: ((q - e) @ np.cross(h - e, [0, 0, 1.0])) * side >= -0.5)
    if fist:
        ellipsoid(c, hand, (4.4, 4.2, 4.0), plating("chitin", hand, step=(None, 2.4, None), bolts=False, salt=54))
        k = hand + (hand - elbow) / max(1e-6, np.linalg.norm(hand - elbow)) * 2.6
        ellipsoid(c, k, (2.6, 3.6, 3.0), limb_plating("gplate", elbow, hand, 1.8, bolts=False, salt=55))  # knuckle ridges


def hammer(c: Cloud, grip, axis, glow: bool = True) -> None:
    """Haft along `axis` from the grip; the head across it at HAFT; the butt BUTT behind."""
    grip = np.asarray(grip, float)
    a = np.asarray(axis, float)
    a = a / np.linalg.norm(a)
    butt = grip - a * BUTT
    top = grip + a * HAFT
    capsule(c, butt, top, 1.5, 1.5, "chitin")
    for k in (0.15, 0.45):
        cylinder(c, grip + a * (HAFT * k), grip + a * (HAFT * k + 1.2), 1.9, "gplate")
    ellipsoid(c, butt, (2.0, 2.0, 2.0), "alloy")
    # The head: a long block across the haft, striking faces either end.
    Rm = _along(a) @ rot_x(math.pi / 2)  # head's long axis across the haft, in the body plane
    side = np.cross(a, np.array([0.0, 1.0, 0.0]))
    if np.linalg.norm(side) < 1e-6:
        side = np.array([1.0, 0, 0])
    side = side / np.linalg.norm(side)
    head_rot = _along(side)
    box(c, top, (8.6, 4.8, 5.4), plating("alloy", top, head_rot, step=(4.3, None, None), salt=61), rot=head_rot)
    for s in (1, -1):
        box(c, top + side * s * 8.9, (0.8, 5.4, 6.0), plating("gplate", top, head_rot, step=(None, None, None), salt=62), rot=head_rot)
    for s in (1, -1):
        box(c, top + side * s * 4.0, (0.6, 4.95, 5.55), "conduit" if glow else "dead_glow", rot=head_rot)
    del Rm


# ---------------------------------------------------------------- poses


def legs(c: Cloud, phase: float | None, hz: float, spread: float = 6.4, stride: float = 7.6, step: float = 4.2) -> None:
    for s, off in ((1, 0.0), (-1, 0.5)):
        if phase is None:
            fx, lift = (2.0 if s == 1 else -2.0), 0.0
        else:
            p = (phase + off) % 1.0
            fx = -stride * math.cos(2 * math.pi * p)
            lift = step * max(0.0, math.sin(2 * math.pi * p))
        leg(c, np.array([-0.4, s * spread, hz]), np.array([fx, s * (spread + 1.6), lift]))


def body(c: Cloud, phase: float | None, lean: float = 0.25, drop: float = 0.0, stride: float = 7.6, step: float = 4.2):
    bob = 0.0 if phase is None else 0.9 * abs(math.sin(2 * math.pi * phase))
    hz = HIP_Z - bob - drop
    legs(c, phase, hz, stride=stride, step=step)
    t = torso(c, hz, lean)
    head(c, t["head"], t["Rm"])
    return t


def pose_walk(phase: float | None) -> Cloud:
    """Hammer on the right shoulder, the head behind it, both hands on the haft."""
    c = Cloud()
    t = body(c, phase)
    sh_r, sh_l = t["R"], t["L"]
    # Haft across the body from the left hip, up over the right shoulder; the head rides behind it.
    sway = 0.0 if phase is None else 1.2 * math.sin(2 * math.pi * phase)
    low = np.array([11.0 + sway, 3.0, sh_r[2] - 22.0])
    axis = np.array([-0.12, -0.55, 0.83])
    axis = axis / np.linalg.norm(axis)
    hammer(c, low, axis)
    arm(c, sh_l, low + np.array([0.0, 1.0, 0.0]), 1, pole=(-0.4, 0.6, -1))
    arm(c, sh_r, low + axis * 13.0 + np.array([2.4, 0.0, 0.0]), -1, pole=(-0.4, 0, -1))
    return c


def swing_angle(u: float) -> tuple[float, float]:
    """Haft angle and chest lean through one blow. u = 0 is the hammer on the ground."""
    down, high, back = -58.0, 110.0, 140.0
    if u < 0.35:  # lift
        k = u / 0.35
        k = 1 - (1 - k) ** 2
        phi = down + (high - down) * k
        lean = 0.45 - 0.43 * k
    elif u < 0.85:  # held high, drawn back
        k = (u - 0.35) / 0.5
        phi = high + (back - high) * k
        lean = 0.02 - 0.16 * k
    else:  # coming down
        k = (u - 0.85) / 0.15
        phi = back + (down + 360 - back) * k * 0.55
        lean = -0.14 + 0.5 * k
    return math.radians(phi), lean


def pose_swing(u: float, wet: bool = False) -> Cloud:
    c = Cloud()
    phi, lean = swing_angle(u)
    drop = 3.0 * max(0.0, lean)
    t = body(c, None, lean=lean, drop=drop)
    sh_r, sh_l = t["R"], t["L"]
    mid = (sh_r + sh_l) / 2
    a = sag(phi)
    grip = mid + a * 17.0 + np.array([0, 0, -4.0])
    hammer(c, grip, a)
    arm(c, sh_r, grip + np.array([0, -1.6, 0]), -1, pole=(-0.5, 0, -1))
    arm(c, sh_l, grip - a * 5.5 + np.array([0, 1.6, 0]), 1, pole=(-0.5, 0, -1))
    if u == 0.0 and wet:
        # The hit in water: the head is under, and spray goes up where it went in.
        top = grip + a * HAFT
        at = np.array([top[0], top[1], WADE_Z])
        ellipsoid(c, at + np.array([0, 0, 0.8]), (9.0, 10.0, 1.6), "splash")
        for dx, dy, h, r in ((1.0, 0.0, 9.0, 2.6), (-2.6, 4.4, 6.4, 1.9), (-1.6, -4.8, 7.2, 2.0), (4.4, 2.6, 5.0, 1.6), (3.6, -3.4, 4.6, 1.5)):
            capsule(c, at + np.array([dx * 0.5, dy * 0.5, 1.0]), at + np.array([dx, dy, h]), r, r * 0.6, "splash")
    elif u == 0.0:
        # The hit: a green flash off the head where it meets the ground.
        top = grip + a * HAFT
        for k, r in enumerate((6.0, 4.0)):
            ellipsoid(c, top + np.array([2.0, 0, -2.0 + k]), (r, r * 1.3, 1.6), "flash" if k == 0 else "flash_core")
    return c


def fist_guard(sh, side: float, phase: float | None) -> np.ndarray:
    swing = 0.0 if phase is None else 3.2 * math.sin(2 * math.pi * phase) * side
    return np.array([9.0 + swing, side * 10.0, sh[2] - 12.0])


def pose_fists(phase: float | None) -> Cloud:
    """No hammer: a stride with the fists up and swinging."""
    c = Cloud()
    t = body(c, phase, lean=0.3)
    for key, s in (("R", -1), ("L", 1)):
        arm(c, t[key], fist_guard(t[key], s, phase), s, pole=(-0.5, 0, -1))
    return c


def pose_punch(frame: int) -> Cloud:
    """Right fist lands on frame 0, left on frame 4; between, the arm pulls back and the other winds."""
    c = Cloud()
    k = frame % 4
    lead = -1 if frame < 4 else 1  # right first
    reach = {0: 1.0, 1: 0.55, 2: 0.15, 3: 0.0}[k]
    twist = 0.22 * reach * (-lead)
    t = body(c, None, lean=0.34 + 0.08 * reach)
    hz_chest = t["R"][2]
    for key, s in (("R", -1), ("L", 1)):
        sh = rot_z(twist) @ t[key] if False else t[key]
        if s == lead:
            hand = np.array([10.0 + 16.0 * reach, s * (9.0 - 6.0 * reach), hz_chest - 10.0 + 4.0 * reach])
        else:
            back = 1.0 - reach
            hand = np.array([7.0 - 4.0 * reach + 2.0 * back, s * 10.4, hz_chest - 11.0])
        arm(c, sh, hand, s, pole=(-0.5, 0, -1))
        if s == lead and k == 0:
            ellipsoid(c, hand + np.array([4.6, 0, 0]), (2.6, 5.0, 4.0), "flash")
            ellipsoid(c, hand + np.array([5.4, 0, 0]), (1.4, 2.6, 2.0), "flash_core")
    return c


def pose_throw(frame: int) -> Cloud:
    """Wound back, the release (the hammer leaving forward and up), empty hands forward, on guard."""
    c = Cloud()
    if frame == 3:
        return pose_fists(None)
    lean = {0: -0.18, 1: 0.35, 2: 0.55}[frame]
    t = body(c, None, lean=lean, drop=2.0 * max(0.0, lean))
    sh_r, sh_l = t["R"], t["L"]
    mid = (sh_r + sh_l) / 2
    if frame < 2:
        phi = math.radians(150 if frame == 0 else 58)
        a = sag(phi)
        grip = mid + a * 15.0 + np.array([0, 0, -3.0])
        hammer(c, grip, a)
        arm(c, sh_r, grip + np.array([0, -1.6, 0]), -1, pole=(-0.5, 0, -1))
        arm(c, sh_l, grip - a * 5.5 + np.array([0, 1.6, 0]), 1, pole=(-0.5, 0, -1))
    else:
        for key, s in (("R", -1), ("L", 1)):
            arm(c, t[key], np.array([21.0, s * 4.0, t[key][2] - 6.0]), s, pole=(-0.5, 0, -1))
    return c


# The ram: a long, low running stride, the chest thrown far forward over the knees.
RAM_LEAN = 0.72
RAM_DROP = 3.4
RAM_STRIDE = 10.4
RAM_STEP = 5.6
# The haft levelled like a battering ram: forward, a touch down and in.
RAM_AXIS = np.array([1.0, 0.16, -0.12])


def ram_arms(c: Cloud, t: dict, reach: float, fists: bool) -> np.ndarray:
    """Hammer: the haft levelled at the front, head leading, right hand at the hip, left forward on
    the haft. Fists: both forearms locked in front of the chest, the left shoulder leading. Returns
    the leading point (the hammer head, or the fists) for the impact flash."""
    sh_r, sh_l = t["R"], t["L"]
    if not fists:
        a = RAM_AXIS / np.linalg.norm(RAM_AXIS)
        grip = np.array([4.0 + reach, -8.0, sh_r[2] - 15.0])
        hammer(c, grip, a)
        arm(c, sh_r, grip + np.array([0, -1.4, 0]), -1, pole=(-0.6, -0.3, -1))
        arm(c, sh_l, grip + a * 11.0 + np.array([0, 1.4, 0]), 1, pole=(-0.4, 0.5, -1))
        return grip + a * (HAFT + 4.5)
    lead = np.array([17.0 + reach, 1.0, sh_l[2] - 7.0])
    arm(c, sh_l, lead + np.array([0, 3.2, 0]), 1, pole=(-0.4, 0.8, -1))
    arm(c, sh_r, lead + np.array([-2.0, -3.4, -1.0]), -1, pole=(-0.4, -0.8, -1))
    return lead + np.array([4.0, 0, 0])


def pose_ram(phase: float | None, fists: bool = False) -> Cloud:
    """Charging: the run, hammer levelled (or fists locked) out in front."""
    c = Cloud()
    t = body(c, phase, lean=RAM_LEAN, drop=RAM_DROP, stride=RAM_STRIDE, step=RAM_STEP)
    ram_arms(c, t, 0.0, fists)
    return c


def pose_ramhit(frame: int, fists: bool = False) -> Cloud:
    """The slam: 0 the contact (thrown in, a green flash and a burst of dust at the leading point),
    1 rocked back off it, 2 settling, 3 upright again on guard."""
    if frame == 3:
        return pose_fists(None) if fists else pose_walk(None)
    c = Cloud()
    lean, reach, drop = {0: (0.86, -1.0, 4.4), 1: (0.38, -4.0, 2.0), 2: (0.3, -2.5, 1.0)}[frame]
    t = body(c, None, lean=lean, drop=drop)
    tip = ram_arms(c, t, reach, fists)
    if frame == 0:
        ellipsoid(c, tip + np.array([0.6, 0, 0]), (2.4, 8.4, 7.4), "flash")
        ellipsoid(c, tip + np.array([1.2, 0, 0]), (1.4, 4.4, 4.0), "flash_core")
        # Dust kicked up under the blow.
        for dy, h, r in ((0.0, 3.4, 4.4), (6.0, 2.6, 3.4), (-6.0, 2.6, 3.4), (3.0, 4.6, 2.6), (-3.4, 4.2, 2.6)):
            ellipsoid(c, np.array([tip[0] - 5.0, dy, h]), (r, r, r * 0.8), "dust")
    return c


def pose_wreck() -> Cloud:
    """Face down, arms flung forward, the hammer dark on the dirt beside it."""
    c = Cloud()
    # Torso along +x, lying on its front.
    ellipsoid(c, (2.0, 0, 9.4), (14.0, 13.0, 8.6), "alloy")
    ellipsoid(c, (-1.0, 0, 15.6), (9.0, 9.0, 4.6), "chitin")  # back hump, up
    for s in (1, -1):
        capsule(c, (-6.0, s * 3.6, 18.0), (6.0, s * 4.2, 17.6), 0.9, mat="dead_glow")
    box(c, (-14.0, 0, 6.0), (4.0, 8.0, 5.0), "chitin")  # pelvis
    head(c, np.array([17.6, 0.6, 5.0]), rot_y(math.radians(80)) @ rot_x(math.radians(18)))
    for s in (1, -1):
        sh = np.array([9.0, s * 13.0, 9.0])
        pauldron(c, sh + np.array([0, 0, -2.0]), s)
        el = np.array([20.0, s * 17.0, 4.6])
        hand = np.array([30.0, s * 14.0, 4.2])
        capsule(c, sh, el, 4.6, 4.0, "alloy")
        capsule(c, el, hand, 5.0, 4.4, "gplate")
        ellipsoid(c, hand, (4.4, 4.2, 3.8), "chitin")
    # Legs out behind.
    for s in (1, -1):
        hip = np.array([-16.0, s * 6.0, 6.0])
        knee = np.array([-31.0, s * 8.0, 5.4])
        ank = np.array([-44.0, s * 8.6, 4.6])
        capsule(c, hip, knee, 6.0, 5.0, "alloy")
        capsule(c, knee, ank, 4.2, 3.4, "chitin")
        box(c, ank + np.array([-2.0, 0, 1.0]), (2.0, 4.0, 5.6), "alloy")
    hammer(c, np.array([-4.0, 26.0, 2.2]), np.array([1.0, 0.12, 0.0]), glow=False)
    for p in c.pts:
        p[:, 2] = np.maximum(p[:, 2], 0.35)
    allp = np.concatenate(c.pts)
    ctr = np.array([(allp[:, 0].min() + allp[:, 0].max()) / 2, (allp[:, 1].min() + allp[:, 1].max()) / 2, 0.0])
    c.pts = [p - ctr for p in c.pts]
    return c


# ---------------------------------------------------------------- wading

# Water plane, body units above the soles: mid-thigh, just under the belly lames.
# The whole model sinks by it, so the contact (the soles) stays put and nothing pops.
WADE_Z = 22.0
# Pool half-axis around the contact, body units (the Titan's pool, a little wider for the stride).
POOL_RX = 27.0
COLLAR = 0.7  # foam band just above the cut, body units
SS = 4
OUTLINE_RGB = np.array(R.OUTLINE, dtype=np.uint8)


def sunk(c: Cloud) -> Cloud:
    """The pose dropped by WADE_Z and cut at the water plane; a foam collar where it goes in."""
    out = Cloud()
    foam = R.MAT_IDS["foam"]
    splash = R.MAT_IDS["splash"]
    for p, n, m, k in zip(c.pts, c.nrm, c.mat, c.part):
        p = p - np.array([0.0, 0.0, WADE_Z])
        keep = p[:, 2] >= 0.0
        if not keep.any():
            continue
        m = m[keep].copy()
        m[(p[keep][:, 2] < COLLAR) & (m != splash)] = foam
        out.pts.append(p[keep])
        out.nrm.append(n[keep])
        out.mat.append(m)
        out.part.append(k[keep])
    return out


def pool_layer(frame: int, frames: int) -> Image.Image:
    """derive_swim's pool at this cell and scale: flat teal, two ripple rings growing
    out from the legs over the loop, a few still dark streaks."""
    big = Image.new("RGBA", (CELL * SS, CELL * SS), (0, 0, 0, 0))
    d = ImageDraw.Draw(big)
    cx, cy = CELL / 2 * SS, CELL * CONTACT_Y * SS
    rx = POOL_RX * SCALE * SS
    ry = rx * R.SIN_P
    d.ellipse((cx - rx, cy - ry, cx + rx, cy + ry), fill=WATER + (255,))
    a0, a1 = 12.0 * SCALE * SS, rx - 4 * SS
    for k in range(2):
        t = ((frame / frames) + k * 0.5) % 1.0
        a = a0 + (a1 - a0) * t
        b = a * R.SIN_P
        fade = 0.85 * (1.0 - t)
        col = tuple(round(w + (r - w) * fade) for w, r in zip(WATER, RIPPLE)) + (255,)
        # Front arc only; the back half sits behind the legs.
        d.arc((cx - a, cy - b, cx + a, cy + b), 10, 170, fill=col, width=2 * SS)
    for x0, x1, y in ((-0.66, -0.44, 0.62), (0.4, 0.62, 0.66), (-0.14, 0.12, 0.84)):
        d.line((cx + x0 * rx, cy + y * ry, cx + x1 * rx, cy + y * ry), fill=DEEP + (255,), width=2 * SS)
    return big.resize((CELL, CELL), Image.Resampling.LANCZOS)


def wade_post(frames: int):
    def post(im: Image.Image, frame: int) -> Image.Image:
        """The pool under the cut body; foam on the water just under its outline."""
        a = np.array(im)
        pool = np.array(pool_layer(frame, frames))
        collar = np.zeros(a.shape[:2], bool)
        for tone in R.MATERIALS["foam"]:
            collar |= (a[..., :3] == np.array(tone, dtype=np.uint8)).all(-1)
        # The outline under the collar is the waterline; anything else overhangs the pool.
        edge = (a[..., 3] > 40) & (a[..., :3] == OUTLINE_RGB).all(-1) & np.roll(collar, 1, 0)
        below = np.roll(edge, 1, 0) & (a[..., 3] <= 40) & (pool[..., 3] > 128)
        pool[below, :3] = FOAM
        out = Image.fromarray(pool)
        out.alpha_composite(Image.fromarray(a))
        return out

    return post


def wade(fn):
    return lambda i: sunk(fn(i))


# ---------------------------------------------------------------- sheets

SHEETS = [
    R.SheetSpec("walk", 8, CONTACT_Y, SCALE, lambda i: pose_walk(None if i == 0 else i / 8)),
    R.SheetSpec("swing", 8, CONTACT_Y, SCALE, lambda i: pose_swing(i / 8)),
    R.SheetSpec("fists", 8, CONTACT_Y, SCALE, lambda i: pose_fists(None if i == 0 else i / 8)),
    R.SheetSpec("punch", 8, CONTACT_Y, SCALE, lambda i: pose_punch(i)),
    R.SheetSpec("throw", 4, CONTACT_Y, SCALE, lambda i: pose_throw(i)),
    R.SheetSpec("wreck", 1, WRECK_CONTACT_Y, SCALE, lambda i: pose_wreck()),
]
# The ram never runs in water, so it has no wading twins.
RAM_SHEETS = [
    R.SheetSpec("ram", 8, CONTACT_Y, SCALE, lambda i: pose_ram(i / 8)),
    R.SheetSpec("ram-fists", 8, CONTACT_Y, SCALE, lambda i: pose_ram(i / 8, fists=True)),
    R.SheetSpec("ramhit", 4, CONTACT_Y, SCALE, lambda i: pose_ramhit(i)),
    R.SheetSpec("ramhit-fists", 4, CONTACT_Y, SCALE, lambda i: pose_ramhit(i, fists=True)),
]
# In water: the same poses sunk into the pool, one fit with the dry sheets.
SHEETS += [
    R.SheetSpec(f"{spec.name}-wade", spec.frames, CONTACT_Y, SCALE, wade(fn), wade_post(spec.frames))
    for spec, fn in (
        (SHEETS[0], SHEETS[0].pose),
        (SHEETS[1], lambda i: pose_swing(i / 8, wet=True)),
        (SHEETS[2], SHEETS[2].pose),
        (SHEETS[3], SHEETS[3].pose),
        (SHEETS[4], SHEETS[4].pose),
    )
]
SHEETS += RAM_SHEETS


def render_sheet(spec):
    clouds = [spec.pose(i) for i in range(spec.frames)]
    rows = []
    for r in range(16):
        cells = [R.render(cl, r, spec.scale, spec.contact_y, CELL) for cl in clouds]
        if spec.post:
            cells = [spec.post(im, i) for i, im in enumerate(cells)]
        rows.append(cells)
    sheet = compose_sheet(rows, CELL)
    placed = {ENGINE_ORDER[r]: rows[r][0] for r in range(16)}
    return sheet, placed


def main() -> int:
    PREVIEW.mkdir(parents=True, exist_ok=True)
    SRC.mkdir(parents=True, exist_ok=True)
    status = 0
    only = sys.argv[1:] or None
    for spec in SHEETS:
        if only and spec.name not in only:
            continue
        R.CLIPPED.clear()
        sheet, placed = render_sheet(spec)
        clipped = sorted({ENGINE_ORDER[r] for r in R.CLIPPED}, key=ENGINE_ORDER.index)
        out = WRECKS / "juggernaut.png" if spec.name == "wreck" else UNITS / f"juggernaut-{spec.name}.png"
        sheet.save(out)
        diag = diagnostics(placed, CELL)
        pops = [d["dir"] for d in diag if d.get("pop")]
        empties = [d["dir"] for d in diag if d.get("empty")]
        stem = f"juggernaut-{spec.name}"
        preview_turntable(placed, CELL).save(PREVIEW / f"{stem}-turntable.png")
        preview_strip(sheet, CELL, spec.frames, 70).save(PREVIEW / f"{stem}-strip.png")
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
            "source": "render_juggernaut.py (16 unique yaws, no mirror)",
        }
        (PREVIEW / f"{stem}-manifest.json").write_text(json.dumps(manifest, indent=2))
        print(f"{stem}: {sheet.size} frames={spec.frames} pops={pops} empty={empties} clipped={clipped}")
        if empties or clipped:
            status = 2
        if spec.name == "walk":
            east = placed["E"]
            R.on_magenta(east).save(SRC / "juggernaut-east.png")
            R.cameo(east, 128).save(UNITS / "juggernaut-cameo.png")
    return status


if __name__ == "__main__":
    raise SystemExit(main())
