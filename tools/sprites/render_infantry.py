#!/usr/bin/env python3
"""
Human infantry sheets — one locked camera, 16 unique yaws, real gaits.

Same rasterizer as the Cyborg (tools/sprites/render_cyborg.py): lofted
torsos, capsules, and boxes, flat three-tone fills, outline #1a1410. The
camera never moves. Row 0 is south (screen down), then clockwise 22.5°
through row 15. No mirroring, so a weapon stays in the hand that holds it.

The look is a WW2 German rifle section: field-grey tunic over a lofted torso,
coal-scuttle helmet, marching boots, Y-straps, pouches, gas-mask can. Each
role changes the silhouette, not just the hat (see ROLES).

Every moving sheet is an 8-frame loop (frame 0 is also the idle pose):

  walk    upright stride
  crouch  duck-walk, shorter step, knees high
  crawl   prone, knees and a free arm, weapon kept forward

Fire, death, swim, the engineer's work loops, and the Jump Jet's hover are
the same body. Replacing a PNG in place keeps the existing cell, frame count,
and contactY.

  python tools/sprites/render_infantry.py --roster          # one east stand each
  python tools/sprites/render_infantry.py --only rifleman --draft
  python tools/sprites/render_infantry.py                    # every sheet
  python tools/sprites/render_infantry.py --only pyro,medic
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.dont_write_bytecode = True
import render_cyborg as R  # noqa: E402
from compose_unit_sheet import (  # noqa: E402
    ENGINE_ORDER,
    compose_sheet,
    diagnostics,
    opaque_bbox,
    preview_strip,
    preview_turntable,
)
from derive_swim import WL_Y, bob_of, in_water, waist_half  # noqa: E402

ROOT = HERE.parent.parent
UNITS = ROOT / "gridlock/packages/client/src/assets/units"
SRC = HERE / "src"
PREVIEW = HERE / "preview"
NOZZLE_TS = ROOT / "gridlock/packages/client/src/render/pyro-nozzle.ts"

# Fine enough that straps and rifle bands survive at 96. Read at call time.
R.SPACING = 0.36

# Body units. +x forward, +y left, +z up, soles near z = 0. About 2.8 cm each:
# a 62-unit man, 7.5 heads tall, legs half his height.
THIGH, SHIN = 15.0, 14.4
HIP_Y = 3.5
STAND_HIP = 31.0
CROUCH_HIP = 19.5
ANKLE = 2.9
STAND_SCALE = 1.18
# Crawl cells are drawn at 28/22 of the stand size, so the model is smaller
# in the cell and the man does not grow when he goes prone.
PRONE_SCALE = STAND_SCALE * 22 / 28
WATER_Z = 37.0  # belt. Chest and head stay above the pool.

# Landmarks in hip space, before the lean.
SH_X, SH_Y, SH_Z = 0.2, 6.6, 18.6
HEAD_Z = 25.4
BELT_Z = 6.2
UPPER_ARM, FORE_ARM = 8.4, 8.2

# Stride is long on purpose: at the 20px stand draw a shorter step is a blur.
STRIDE = 8.0
LIFT = 7.0
CROUCH_STRIDE = 5.4
CROUCH_LIFT = 3.8

EXTRA_MATS: dict[str, tuple] = {
    # Field grey: a grey-green, not olive. The whole section wears it.
    "feldgrau": ((58, 64, 54), (88, 96, 80), (120, 128, 106)),
    "coat": ((46, 52, 46), (70, 78, 68), (98, 106, 92)),
    "stahl": ((38, 42, 40), (60, 66, 62), (92, 98, 92)),
    "belt": ((20, 18, 16), (38, 34, 30), (64, 58, 50)),
    "boot": ((16, 14, 12), (34, 30, 26), (64, 58, 50)),
    "steel": ((78, 80, 80), (132, 134, 130), (190, 190, 182)),
    "gun": ((26, 28, 30), (48, 50, 54), (82, 86, 90)),
    "canvas": ((92, 86, 62), (128, 120, 88), (160, 152, 116)),
    "drill": ((96, 100, 74), (134, 136, 102), (166, 166, 130)),
    "lwblue": ((50, 58, 72), (78, 88, 106), (108, 120, 138)),
    "khaki": ((112, 92, 58), (164, 136, 86), (198, 172, 116)),
    "rubber": ((22, 24, 22), (40, 44, 40), (66, 70, 64)),
    "wood": ((78, 44, 26), (116, 70, 40), (150, 98, 58)),
    "cloth": ((78, 86, 56), (112, 122, 80), (142, 150, 104)),
    "cane": ((54, 68, 36), (74, 92, 48), (98, 118, 64)),
    "leaf": ((40, 62, 28), (62, 90, 38), (90, 120, 52)),
    "camo_g": ((52, 70, 40), (76, 98, 56), (102, 124, 74)),
    "camo_b": ((70, 52, 34), (102, 76, 50), (130, 100, 68)),
    "camo_t": ((112, 106, 76), (150, 142, 104), (178, 170, 130)),
    "glass": ((36, 78, 86), (110, 176, 180), (214, 238, 230)),
    "white": ((170, 168, 160), (222, 220, 210), (246, 244, 236)),
    "red": (178, 34, 28),
    "plume": ((150, 54, 16), (214, 102, 24), (255, 176, 48)),
}
for _name, _spec in EXTRA_MATS.items():
    R.MATERIALS[_name] = _spec
    if _name not in R.MAT_IDS:
        R.MAT_IDS[_name] = len(R.MAT_IDS)
R.EMISSIVE.add("red")


def v3(*a) -> np.ndarray:
    return np.array(a, float)


def unit(v) -> np.ndarray:
    v = np.asarray(v, float)
    return v / max(float(np.linalg.norm(v)), 1e-9)


def knee_of(hip, ankle) -> np.ndarray:
    """Knee in front of the hip–ankle line, rising when the leg is bent."""
    hip = np.asarray(hip, float)
    ankle = np.asarray(ankle, float)
    delta = ankle - hip
    reach = float(np.linalg.norm(delta))
    dist = min(max(reach, 6.0), THIGH + SHIN - 0.35)
    dirv = delta / max(reach, 1e-6)
    a = (THIGH * THIGH - SHIN * SHIN + dist * dist) / (2 * dist)
    h = math.sqrt(max(0.0, THIGH * THIGH - a * a))
    # Up, with a little forward so a planted leg keeps the knee ahead of the shin.
    pole = v3(0.45, 0.0, 1.0)
    perp = pole - dirv * float(np.dot(pole, dirv))
    n = float(np.linalg.norm(perp))
    perp = v3(1.0, 0.0, 0.0) if n < 1e-4 else perp / n
    return hip + dirv * a + perp * h


def elbow_of(shoulder, hand, side: float) -> np.ndarray:
    """Two-bone arm. The elbow drops, swings out, and goes a little back."""
    shoulder = np.asarray(shoulder, float)
    hand = np.asarray(hand, float)
    d = hand - shoulder
    reach = float(np.linalg.norm(d))
    dist = min(max(reach, 4.0), UPPER_ARM + FORE_ARM - 0.25)
    dirv = d / max(reach, 1e-6)
    a = (UPPER_ARM**2 - FORE_ARM**2 + dist * dist) / (2 * dist)
    h = math.sqrt(max(0.0, UPPER_ARM**2 - a * a))
    pole = v3(-0.35, side * 0.7, -1.0)
    perp = pole - dirv * float(np.dot(pole, dirv))
    n = float(np.linalg.norm(perp))
    perp = v3(0.0, side, 0.0) if n < 1e-4 else perp / n
    return shoulder + dirv * a + perp * h


def lean_pt(hip, local, angle: float) -> np.ndarray:
    return np.asarray(hip, float) + R.rot_y(angle) @ np.asarray(local, float)


def foot_xz(phase: float, stride: float, lift: float) -> tuple[float, float]:
    """Stance on 0–0.5 (front to back, on the ground), swing on 0.5–1."""
    p = phase % 1.0
    if p < 0.5:
        t = p / 0.5
        return stride * math.cos(math.pi * t), 0.0
    t = (p - 0.5) / 0.5
    return -stride * math.cos(math.pi * t), lift * math.sin(math.pi * t)


def hop_of(phase: float) -> float:
    return 1.15 * abs(math.sin(2 * math.pi * phase))


def _along(a, b, t: float) -> np.ndarray:
    a, b = np.asarray(a, float), np.asarray(b, float)
    return a + (b - a) * t


# ---------------------------------------------------------------- materials


def camo(names: tuple[str, ...], size: float = 3.4, seed: int = 0):
    """Splinter camo in hip space: big angular patches that survive the map scale."""
    pal = np.array(names, dtype=object)
    rot = np.array([[0.80, 0.60, 0.0], [-0.52, 0.70, 0.49], [0.30, -0.40, 0.87]])

    def pick(p: np.ndarray) -> np.ndarray:
        q = np.floor((np.asarray(p, float) @ rot.T) / size).astype(np.int64)
        h = (q[:, 0] * 73856093) ^ (q[:, 1] * 19349663) ^ (q[:, 2] * 83492791) ^ seed
        return pal[np.abs(h) % len(pal)]

    return pick


def cloth_at(spec, hip):
    """A material name, or a camo picker anchored to the hip so it rides the body."""
    if isinstance(spec, str):
        return spec
    hip = np.asarray(hip, float)
    return lambda p: spec(np.asarray(p, float) - hip)


# ---------------------------------------------------------------- primitives


def loft(c: R.Cloud, hip, lean: float, profile, mat, keep=None, caps: bool = True) -> None:
    """Rings of ellipses up a z axis in hip space: rows of (z, cx, rx, ry).

    The torso is one of these, so the shoulders are square and the waist pinches,
    instead of an egg. `mat` is a name or a picker over hip-space points.
    """
    prof = np.asarray(profile, float)
    sp = R.SPACING
    z0, z1 = float(prof[0, 0]), float(prof[-1, 0])
    nz = max(2, math.ceil((z1 - z0) / sp))
    zs = np.linspace(z0, z1, nz)
    cx = np.interp(zs, prof[:, 0], prof[:, 1])
    rx = np.interp(zs, prof[:, 0], prof[:, 2])
    ry = np.interp(zs, prof[:, 0], prof[:, 3])
    drx = np.gradient(rx, zs)
    dry = np.gradient(ry, zs)
    na = max(12, math.ceil(2 * math.pi * float(max(rx.max(), ry.max())) / sp))
    a = np.arange(na) / na * 2 * math.pi
    Z = np.repeat(zs, na)
    A = np.tile(a, nz)
    CX, RX, RY = np.repeat(cx, na), np.repeat(rx, na), np.repeat(ry, na)
    DRX, DRY = np.repeat(drx, na), np.repeat(dry, na)
    ca, sa = np.cos(A), np.sin(A)
    local = np.stack([CX + RX * ca, RY * sa, Z], -1)
    nrm = np.stack([ca / RX, sa / RY, -(DRX * ca * ca / RX + DRY * sa * sa / RY)], -1)
    parts = [(local, nrm)]
    if caps:
        for zi, sgn in ((0, -1.0), (-1, 1.0)):
            nr = max(2, math.ceil(float(max(rx[zi], ry[zi])) / sp))
            rr = np.repeat(np.linspace(0, 1, nr), na)
            aa = np.tile(a, nr)
            disk = np.stack([cx[zi] + rr * rx[zi] * np.cos(aa), rr * ry[zi] * np.sin(aa), np.full(len(rr), zs[zi])], -1)
            parts.append((disk, np.tile(v3(0, 0, sgn), (len(disk), 1))))
    rot = R.rot_y(lean)
    hip = np.asarray(hip, float)
    for loc, n in parts:
        if keep is not None:
            m = keep(loc)
            loc, n = loc[m], n[m]
        if len(loc) == 0:
            continue
        names = mat(loc) if callable(mat) else None
        world = hip + loc @ rot.T
        c.add(world, n @ rot.T, (lambda _p, nm=names: nm) if names is not None else mat)


def frame_of(d) -> np.ndarray:
    """Columns: along the weapon, its right-hand side, its up."""
    d = unit(d)
    up = v3(0, 0, 1)
    side = np.cross(up, d)
    if np.linalg.norm(side) < 1e-4:
        side = v3(0, -1, 0)
    side = unit(side)
    top = np.cross(d, side)
    return np.stack([d, side, top], axis=1)


def wbox(c, center, half, mat, F) -> None:
    R.box(c, center, half, mat, rot=F)


# ---------------------------------------------------------------- body


def add_boot(c: R.Cloud, ankle, mat: str = "boot") -> None:
    ankle = np.asarray(ankle, float)
    R.capsule(c, ankle + v3(-0.9, 0, -1.4), ankle + v3(3.0, 0, -1.75), 1.55, 1.3, mat)
    R.box(c, ankle + v3(0.9, 0, -2.6), (2.9, 1.45, 0.4), "belt")


def add_leg(c: R.Cloud, hip, ankle, role: "Role") -> None:
    hip = np.asarray(hip, float)
    ankle = np.asarray(ankle, float)
    knee = knee_of(hip, ankle)
    legs = cloth_at(role.legs, hip)
    # Breeches: full at the thigh, gathered at the knee.
    R.capsule(c, hip, knee, 3.15, 2.3, legs)
    R.ellipsoid(c, knee + v3(0.5, 0, 0), (2.35, 2.25, 2.3), legs)
    if role.boots == "jack":
        # Marching boots to just under the knee: the black shin is the read.
        top = _along(knee, ankle, 0.14)
        R.capsule(c, top, ankle, 2.15, 1.7, "boot")
        R.cylinder(c, top, _along(knee, ankle, 0.22), 2.35, "boot")
    else:
        # Ankle boots under canvas gaiters.
        R.capsule(c, knee, _along(knee, ankle, 0.62), 2.1, 1.85, legs)
        R.capsule(c, _along(knee, ankle, 0.6), ankle, 1.9, 1.75, "canvas" if role.boots == "gaiter" else legs)
        R.capsule(c, _along(knee, ankle, 0.86), ankle, 1.8, 1.7, "boot")
    add_boot(c, ankle)


def add_arm(c: R.Cloud, shoulder, hand, sleeve, glove: str = "skin") -> None:
    shoulder = np.asarray(shoulder, float)
    hand = np.asarray(hand, float)
    side = 1.0 if shoulder[1] >= 0 else -1.0
    elbow = elbow_of(shoulder, hand, side)
    wrist = hand - unit(hand - elbow) * 1.0
    R.ellipsoid(c, shoulder, (2.45, 2.35, 2.4), sleeve)
    R.capsule(c, shoulder, elbow, 2.15, 1.8, sleeve)
    R.capsule(c, elbow, wrist, 1.8, 1.45, sleeve)
    R.ellipsoid(c, hand, (1.35, 1.15, 1.25), glove)


def add_face(c: R.Cloud, head, mat: str = "skin") -> None:
    head = np.asarray(head, float)
    R.capsule(c, head + v3(-0.5, 0, -5.4), head + v3(0.0, 0, -2.0), 1.95, mat=mat)
    R.ellipsoid(c, head, (3.8, 3.4, 4.1), mat)
    R.ellipsoid(c, head + v3(1.0, 0, -2.0), (2.8, 2.7, 2.1), mat)
    R.ellipsoid(c, head + v3(3.75, 0, -0.4), (0.75, 0.6, 0.95), mat)
    for s in (1, -1):
        R.ellipsoid(c, head + v3(-0.2, s * 3.35, -0.1), (0.8, 0.5, 1.1), mat)
        R.ellipsoid(c, head + v3(3.3, s * 1.3, 0.45), (0.5, 0.6, 0.55), "pupil")


def helmet_shell(c: R.Cloud, head, mat, rimless: bool = False) -> None:
    """Coal-scuttle helmet: dome, short visor, skirt that drops and flares at the
    sides and back. `rimless` is the paratrooper bowl."""
    head = np.asarray(head, float)
    ctr = head + v3(-0.25, 0, 1.0)
    rx, ry, rz = 4.6, 4.3, 3.9
    sp = R.SPACING
    nth = math.ceil(2 * math.pi * rx / sp)
    th = np.arange(nth) / nth * 2 * math.pi
    ct = np.cos(th)
    rim = np.full(nth, 1.66) if rimless else 1.62 - 0.30 * ct
    nphi = math.ceil(2.1 * rz / sp)
    u = (np.arange(nphi) + 0.5) / nphi
    T, U = np.meshgrid(th, u, indexing="ij")
    PHI = U * rim[:, None]
    unit_s = np.stack([np.sin(PHI) * np.cos(T), np.sin(PHI) * np.sin(T), np.cos(PHI)], -1).reshape(-1, 3)
    pts = ctr + unit_s * (rx, ry, rz)
    nrm = unit_s / (rx, ry, rz)
    pick = mat if callable(mat) else None
    c.add(pts, nrm, mat if pick is None else (lambda p: pick(p - head)))
    if rimless:
        return
    # Flared skirt below the rim: wide at the back and sides, short at the brow.
    nf = 9
    phi = rim
    base = ctr + np.stack([np.sin(phi) * ct * rx, np.sin(phi) * np.sin(th) * ry, np.cos(phi) * rz], -1)
    out = np.stack([ct, np.sin(th), np.zeros(nth)], -1)
    # Visor juts at the brow; the skirt drops and kicks out over the ears and neck.
    flare = 0.9 + 1.0 * np.clip(-ct, 0, 1) + 0.9 * (1 - np.abs(ct))
    drop = 0.3 + 1.9 * np.clip(-ct, 0, 1) + 1.6 * (1 - np.abs(ct))
    for k in range(nf):
        t = (k + 0.5) / nf
        p = base + out * (flare * t)[:, None] + np.stack([np.zeros(nth), np.zeros(nth), -drop * t], -1)
        n = out * 0.9 + v3(0, 0, -0.35)
        c.add(p, n, mat if pick is None else (lambda q: pick(q - head)))


def field_cap(c: R.Cloud, head, mat: str) -> None:
    """Peaked field cap: crown, folded flap, short bill."""
    head = np.asarray(head, float)
    R.ellipsoid(c, head + v3(-0.1, 0, 2.2), (4.2, 3.9, 3.0), mat, keep=lambda p, z=head[2]: p[:, 2] >= z + 1.3)
    R.ellipsoid(c, head + v3(-0.1, 0, 1.7), (4.25, 3.95, 1.1), mat)
    R.box(c, head + v3(-0.2, 0, 4.6), (3.0, 2.8, 0.45), mat)
    R.box(c, head + v3(4.3, 0, 1.5), (1.3, 2.7, 0.3), mat, rot=R.rot_y(0.28))


def add_head(c: R.Cloud, head, role: "Role") -> None:
    """Headgear is part of the role read: helmet, cap, mask, cover, visor."""
    head = np.asarray(head, float)
    kind = role.head
    if kind == "mask":
        # Gas mask under the helmet: two big lenses and the filter snout.
        R.capsule(c, head + v3(-0.5, 0, -5.4), head + v3(0.0, 0, -2.0), 2.1, mat="rubber")
        R.ellipsoid(c, head + v3(0.4, 0, -0.4), (4.2, 3.7, 4.4), "rubber")
        for s in (1, -1):
            R.cylinder(c, head + v3(3.4, s * 1.5, 0.6), head + v3(4.3, s * 1.6, 0.7), 1.15, "glass")
        R.cylinder(c, head + v3(3.6, 0, -2.4), head + v3(5.6, 0, -3.2), 1.4, "gun")
        R.cylinder(c, head + v3(5.4, 0, -3.1), head + v3(6.0, 0, -3.35), 1.65, "steel")
        helmet_shell(c, head, "stahl")
        return
    add_face(c, head)
    if kind == "cap":
        field_cap(c, head, role.cap_mat)
        return
    if kind == "phones":
        field_cap(c, head, role.cap_mat)
        R.capsule(c, head + v3(-0.2, 3.9, 1.5), head + v3(-0.2, -3.9, 1.5), 0.45, mat="gun", caps=False)
        for s in (1, -1):
            R.cylinder(c, head + v3(-0.2, s * 3.4, 0.0), head + v3(-0.2, s * 4.4, 0.0), 1.55, "gun")
        R.capsule(c, head + v3(0.2, -4.0, -0.6), head + v3(3.6, -1.8, -2.4), 0.35, mat="gun")
        return
    if kind == "para":
        helmet_shell(c, head, "stahl", rimless=True)
        R.capsule(c, head + v3(1.8, 3.6, -0.2), head + v3(2.6, 2.0, -3.6), 0.35, mat="belt")
        R.capsule(c, head + v3(1.8, -3.6, -0.2), head + v3(2.6, -2.0, -3.6), 0.35, mat="belt")
        # Goggles up on the brow.
        R.capsule(c, head + v3(3.9, 1.5, 2.6), head + v3(3.9, -1.5, 2.6), 0.85, mat="glass")
        return
    if kind == "cover":
        # Camo helmet cover with foliage tufts: the sniper's lumpy head.
        helmet_shell(c, head, camo(("camo_g", "camo_b", "camo_t"), 2.4, 7))
        for dx, dy, dz in ((-1.0, 2.2, 5.0), (1.4, -2.0, 4.8), (-3.0, -0.6, 4.0), (0.4, 0.4, 5.4), (-2.2, 3.4, 2.4), (-1.6, -3.6, 2.6)):
            R.ellipsoid(c, head + v3(dx, dy, dz), (1.5, 1.4, 1.2), "leaf")
        return
    helmet_shell(c, head, "stahl")
    if kind == "medic":
        for s in (1, -1):
            disc = head + v3(-0.4, s * 4.75, 1.9)
            R.cylinder(c, disc, disc + v3(0, s * 0.3, 0), 1.7, "white")
            R.box(c, disc + v3(0, s * 0.4, 0), (1.15, 0.1, 0.32), "red")
            R.box(c, disc + v3(0, s * 0.4, 0), (0.32, 0.1, 1.15), "red")


# Torso profiles: (z above the hip, centre x, half depth, half width).
TUNIC = [
    (-1.6, 0.0, 3.5, 5.0),
    (1.6, 0.25, 4.1, 5.8),
    (BELT_Z, 0.45, 3.75, 5.35),
    (10.0, 0.6, 3.9, 5.8),
    (14.0, 0.8, 4.3, 6.5),
    (17.0, 0.6, 4.2, 6.9),
    (19.2, 0.3, 3.5, 6.4),
    (20.6, 0.5, 2.2, 2.6),
]
COAT_SKIRT = [
    (-12.5, -0.4, 5.0, 6.6),
    (-6.0, -0.1, 4.6, 6.4),
    (-1.0, 0.1, 4.2, 6.0),
    (2.0, 0.25, 4.1, 5.85),
]


def front_x(z: float, prof=TUNIC) -> float:
    p = np.asarray(prof, float)
    return float(np.interp(z, p[:, 0], p[:, 1] + p[:, 2]))


def back_x(z: float, prof=TUNIC) -> float:
    p = np.asarray(prof, float)
    return float(np.interp(z, p[:, 0], p[:, 1] - p[:, 2]))


def add_torso(c: R.Cloud, hip, lean: float, role: "Role") -> None:
    hip = np.asarray(hip, float)
    b = role.bulk
    prof = [(z, cx, rx * (0.5 + 0.5 * b), ry * b) for z, cx, rx, ry in TUNIC]
    loft(c, hip, lean, prof, role.cloth)
    L = lambda *p: lean_pt(hip, p, lean)  # noqa: E731
    mat = cloth_at(role.cloth, hip)
    # Square shoulder line.
    R.capsule(c, L(0.2, 5.4 * b, 18.4), L(0.2, -5.4 * b, 18.4), 2.6, mat=mat)
    if role.coat:
        loft(c, hip, lean, COAT_SKIRT, role.cloth, caps=False)
        for z in (2.0, 6.5, 11.0, 15.0):
            for s in (1, -1):
                R.ellipsoid(c, L(front_x(z) + 0.2, s * 2.0, z), (0.45, 0.45, 0.45), "steel")
        R.ellipsoid(c, L(0.6, 0, 20.2), (3.2, 4.6, 1.4), role.cloth)  # turned-down collar
    else:
        for z in (8.6, 11.4, 14.2, 17.0):
            R.ellipsoid(c, L(front_x(z) + 0.05, 0, z), (0.4, 0.42, 0.42), "steel")
    if role.tabard:
        tab = [(z, cx, rx + 0.3, ry + 0.3) for z, cx, rx, ry in prof if 4.0 < z < 20.0]
        loft(c, hip, lean, tab, "white", keep=lambda p: np.abs(p[:, 1]) < 4.4, caps=False)
        for x_of in (front_x, back_x):
            sgn = 1 if x_of is front_x else -1
            at = L(x_of(13.6) + sgn * 0.45, 0, 13.6)
            R.box(c, at, (0.15, 2.0, 0.6), "red", rot=R.rot_y(lean))
            R.box(c, at, (0.15, 0.6, 2.0), "red", rot=R.rot_y(lean))
    # Belt and buckle.
    loft(c, hip, lean, [(BELT_Z - 0.75, 0.45, 3.95 * (0.5 + 0.5 * b), 5.55 * b), (BELT_Z + 0.75, 0.45, 3.95 * (0.5 + 0.5 * b), 5.55 * b)], "belt", caps=False)
    R.box(c, L(front_x(BELT_Z) + 0.35, 0, BELT_Z), (0.3, 1.0, 0.75), "steel", rot=R.rot_y(lean))


def add_ystraps(c: R.Cloud, L, front: bool = True) -> None:
    for s in (1, -1):
        pts = [L(4.0, s * 2.6, BELT_Z + 0.4), L(4.2, s * 3.4, 14.0), L(2.4, s * 3.8, 19.8),
               L(-1.8, s * 3.4, 20.2), L(-3.9, s * 1.4, 14.5), L(-3.7, 0, BELT_Z + 0.4)]
        if not front:
            pts = pts[2:]
        for a, b in zip(pts, pts[1:]):
            R.capsule(c, a, b, 0.42, mat="belt")


def add_kit(c: R.Cloud, hip, lean: float, role: "Role", pose: str) -> None:
    """Webbing and the role's load. Everything hangs off the hip frame."""
    hip = np.asarray(hip, float)
    L = lambda *p: lean_pt(hip, p, lean)  # noqa: E731
    rot = R.rot_y(lean)
    kit = set(role.kit)
    if "ystraps" in kit:
        add_ystraps(c, L)
    if "pouches" in kit:
        # Three-cell rifle pouches either side of the buckle.
        for s in (1, -1):
            R.box(c, L(front_x(BELT_Z) + 0.4, s * 3.1, BELT_Z + 1.0), (0.9, 1.55, 1.25), "belt", rot=rot @ R.rot_z(s * 0.38))
    if "breadbag" in kit:
        R.box(c, L(-1.6, -5.1, 3.0), (1.9, 1.0, 2.3), "canvas", rot=rot)
        R.ellipsoid(c, L(-3.7, -4.5, 3.2), (1.1, 0.95, 1.7), "leather")
        R.cylinder(c, L(-3.7, -4.5, 4.7), L(-3.7, -4.5, 5.4), 0.9, "belt")
    if "gasmask" in kit:
        # The fluted can across the back of the hips: the section's tell.
        a, b = L(back_x(4.0) - 1.3, 3.6, 0.6), L(back_x(10.0) - 1.4, 1.4, 8.6)
        R.cylinder(c, a, b, 1.55, "stahl")
        for t in (0.2, 0.5, 0.8):
            R.cylinder(c, _along(a, b, t), _along(a, b, t + 0.05), 1.7, "stahl")
        R.cylinder(c, b, _along(a, b, 1.07), 1.7, "stahl")
    if "shovel" in kit:
        R.box(c, L(-2.2, 5.3, 1.6), (1.7, 0.55, 2.1), "belt", rot=rot)
        R.capsule(c, L(-2.2, 5.5, 3.8), L(-2.0, 5.6, 8.4), 0.45, mat="wood")
    if "holster" in kit:
        R.box(c, L(1.6, 5.3, BELT_Z - 1.2), (1.4, 0.7, 1.5), "belt", rot=rot)
    if "belts" in kit:
        # MG belts slung round the neck and crossed on the chest.
        for s in (1, -1):
            a = L(2.4, s * 4.6, 19.6)
            m = L(front_x(13) + 0.6, -s * 0.5, 12.0)
            e = L(1.8, -s * 5.6, 4.0)
            for i in range(14):
                t = (i + 0.5) / 14
                p = (1 - t) ** 2 * a + 2 * (1 - t) * t * m + t * t * e
                R.ellipsoid(c, p, (0.75, 0.75, 0.75), "brass")
        R.box(c, L(back_x(10) - 1.6, 0, 9.5), (1.4, 3.4, 2.6), "stahl", rot=rot)
        R.capsule(c, L(back_x(12) - 1.6, -2.0, 12.6), L(back_x(12) - 1.6, 2.0, 12.6), 0.35, mat="gun")
    if "ammocase" in kit:
        # MG ammo can and a spare-barrel tube on the back.
        R.box(c, L(back_x(10) - 1.6, -1.6, 9.5), (1.4, 2.0, 2.6), "stahl", rot=rot)
        R.cylinder(c, L(back_x(14) - 1.2, 3.6, 4.0), L(back_x(14) - 1.6, 1.6, 17.0), 0.9, "gun")
    if "atpouch" in kit:
        for s in (1, -1):
            R.box(c, L(front_x(BELT_Z) + 0.8, s * 3.0, BELT_Z + 1.4), (1.2, 1.7, 1.7), "leather", rot=rot @ R.rot_z(s * 0.35))
    if "rockets" in kit:
        # Carrying frame with two rockets, warheads up.
        R.box(c, L(back_x(12) - 0.6, 0, 11.0), (0.5, 3.6, 7.0), "belt", rot=rot)
        for s in (1, -1):
            lo, hi = L(back_x(12) - 2.2, s * 2.0, 3.0), L(back_x(12) - 2.4, s * 2.0, 19.0)
            R.cylinder(c, lo, _along(lo, hi, 0.55), 0.85, "gun")
            R.capsule(c, _along(lo, hi, 0.55), hi, 1.75, 0.9, "stahl")
            R.box(c, lo + v3(0, 0, 0.8), (1.5, 0.2, 1.0), "gun", rot=rot)
    if "tanks" in kit:
        # Flamethrower: a big fuel bottle and a small pressure bottle.
        for s, r, top in ((1, 2.8, 20.0), (-1, 2.0, 17.0)):
            lo, hi = L(back_x(10) - r - 0.2, s * 2.9, 3.0), L(back_x(15) - r - 0.4, s * 2.9, top)
            R.cylinder(c, lo, hi, r, "stahl")
            R.ellipsoid(c, hi, (r, r, r * 0.55), "stahl")
            R.cylinder(c, _along(lo, hi, 0.45), _along(lo, hi, 0.53), r + 0.25, "rust")
        R.capsule(c, L(back_x(12) - 1.0, -4.6, 4.0), L(2.0, -5.6, 8.0), 0.55, mat="rubber")
    if "mortarpack" in kit:
        # Tube upright on the back, baseplate behind it.
        lo, hi = L(back_x(10) - 2.0, -0.6, 2.0), L(back_x(16) - 2.2, -1.0, 27.0)
        R.cylinder(c, lo, hi, 1.85, "gun")
        R.cylinder(c, hi - unit(hi - lo) * 0.6, hi, 2.15, "gun")
        R.box(c, L(back_x(12) - 0.9, 0.6, 11.0), (0.45, 4.2, 4.2), "stahl", rot=rot)
    if "medbags" in kit:
        for s in (1, -1):
            R.box(c, L(front_x(BELT_Z) + 0.6, s * 3.0, BELT_Z + 0.2), (1.1, 1.4, 1.6), "canvas", rot=rot @ R.rot_z(s * 0.35))
        R.box(c, L(back_x(11) - 1.4, 0, 10.0), (1.4, 3.6, 3.2), "canvas", rot=rot)
        R.box(c, L(back_x(11) - 2.85, 0, 10.0), (0.1, 0.9, 0.3), "red", rot=rot)
        R.box(c, L(back_x(11) - 2.85, 0, 10.0), (0.1, 0.3, 0.9), "red", rot=rot)
    if "tools" in kit:
        R.box(c, L(-1.4, -5.2, 2.4), (1.9, 1.1, 2.0), "leather", rot=rot)
        R.capsule(c, L(-2.6, -5.6, 3.6), L(-2.8, -5.8, 9.8), 0.45, mat="steel")
        # Satchel charge on the left hip.
        R.box(c, L(0.2, 5.6, 3.4), (2.2, 1.2, 1.7), "canvas", rot=rot)
        R.capsule(c, L(-1.4, 5.8, 5.4), L(1.8, 5.8, 5.4), 0.3, mat="belt")
        add_ystraps(c, L)
    if "radio" in kit:
        # Backpack set, dial face out, and a tall whip antenna.
        bx = back_x(13) - 2.6
        R.box(c, L(bx, 0, 12.0), (2.6, 4.4, 5.6), "stahl", rot=rot)
        R.box(c, L(bx - 2.7, 0, 13.0), (0.15, 3.0, 2.4), "gun", rot=rot)
        R.ellipsoid(c, L(bx - 2.9, 1.4, 14.0), (0.3, 0.6, 0.6), "brass")
        R.capsule(c, L(bx - 1.0, -3.0, 17.6), L(bx - 3.2, -3.4, 40.0), 0.36, mat="gun", caps=False)
        R.ellipsoid(c, L(bx - 3.3, -3.4, 40.6), (0.7, 0.7, 0.7), "gun")
        # Controller on the chest.
        R.box(c, L(front_x(12) + 1.4, 0, 11.6), (1.1, 3.0, 2.0), "gun", rot=rot)
        R.box(c, L(front_x(12) + 2.55, 0, 12.0), (0.12, 2.0, 1.1), "glass", rot=rot)
        add_ystraps(c, L)
    if "jet" in kit:
        bx = back_x(13) - 2.4
        R.box(c, L(bx + 0.6, 0, 12.0), (1.2, 4.8, 5.0), "gun", rot=rot)
        for s in (1, -1):
            lo, hi = L(bx - 1.0, s * 2.7, 4.6), L(bx - 1.2, s * 2.7, 19.0)
            R.cylinder(c, lo, hi, 2.05, "steel")
            R.ellipsoid(c, hi, (2.05, 2.05, 1.1), "steel")
            R.cylinder(c, lo + v3(0, 0, -1.8), lo, 1.45, "gun")
            R.cylinder(c, lo + v3(0, 0, -2.1), lo + v3(0, 0, -1.6), 1.7, "rust")
        add_ystraps(c, L)


# ---------------------------------------------------------------- weapons


def add_kar98(c: R.Cloud, stock, muzzle, scope: bool = False, short: bool = False) -> np.ndarray:
    """Bolt rifle: dropped butt, long wooden fore-end, a thin barrel past it."""
    stock, muzzle = np.asarray(stock, float), np.asarray(muzzle, float)
    d = muzzle - stock
    n = float(np.linalg.norm(d))
    F = frame_of(d)
    ax, side, top = F[:, 0], F[:, 1], F[:, 2]
    wbox(c, stock + ax * 2.9 - top * 0.45, (2.9, 0.75, 1.55), "wood", F)
    R.capsule(c, stock + ax * 5.4, stock + ax * 9.6, 0.95, 0.85, "wood")
    R.capsule(c, stock + ax * 9.0, stock + ax * n * 0.80, 1.0, 0.82, "wood")
    wbox(c, stock + ax * 10.6 + top * 0.5, (2.0, 0.62, 0.7), "gun", F)
    R.capsule(c, stock + ax * 9.4 + top * 0.6, stock + ax * 9.4 + side * 1.6 + top * 0.2, 0.3, mat="gun")
    R.ellipsoid(c, stock + ax * 9.4 + side * 1.75 + top * 0.2, (0.5, 0.5, 0.5), "gun")
    R.capsule(c, stock + ax * n * 0.72, muzzle, 0.45, 0.4, "gun")
    for t in (0.6, 0.76):
        R.cylinder(c, stock + ax * (n * t), stock + ax * (n * t + 0.5), 1.05, "steel")
    if short:
        # Paratrooper rifle: side magazine on the left.
        wbox(c, stock + ax * 11.6 - side * 1.6, (1.0, 1.2, 0.55), "gun", F)
    if scope:
        R.capsule(c, stock + ax * 8.2 + top * 2.0, stock + ax * 14.6 + top * 2.0, 0.95, mat="gun")
        R.cylinder(c, stock + ax * 14.2 + top * 2.0, stock + ax * 15.0 + top * 2.0, 1.25, "gun")
        R.ellipsoid(c, stock + ax * 15.05 + top * 2.0, (0.3, 0.9, 0.9), "glass", rot=F)
    return muzzle


def add_mg42(c: R.Cloud, stock, muzzle, planted: bool) -> np.ndarray:
    """Square perforated barrel jacket, boxy receiver, pistol grip, bipod."""
    stock, muzzle = np.asarray(stock, float), np.asarray(muzzle, float)
    d = muzzle - stock
    n = float(np.linalg.norm(d))
    F = frame_of(d)
    ax, side, top = F[:, 0], F[:, 1], F[:, 2]
    wbox(c, stock + ax * 2.6 - top * 0.3, (2.6, 0.75, 1.4), "gun", F)
    wbox(c, stock + ax * 8.4, (3.4, 1.05, 1.35), "gun", F)
    wbox(c, stock + ax * 8.0 + top * 1.4, (2.6, 1.15, 0.3), "steel", F)
    wbox(c, stock + ax * 6.2 - top * 2.1, (0.7, 0.6, 1.3), "gun", F)
    j0, j1 = 11.8, n - 1.6
    seg = (j1 - j0) / 9
    for k in range(9):
        mat = "gun" if k % 2 == 0 else "belt"
        wbox(c, stock + ax * (j0 + seg * (k + 0.5)), (seg / 2, 1.0, 1.0), mat, F)
    R.cylinder(c, stock + ax * j1, muzzle, 0.8, "gun")
    R.cylinder(c, muzzle - ax * 0.6, muzzle, 1.05, "gun")
    # Belt hanging out of the left side of the feed.
    for i in range(7):
        t = i / 6
        p = stock + ax * (8.6 - t * 1.5) - side * (1.4 + 0.3 * t) - top * (0.4 + t * 3.6)
        R.box(c, p, (0.75, 0.25, 0.4), "brass", rot=F)
    fork = stock + ax * (n - 3.0)
    if planted:
        for s in (1, -1):
            R.capsule(c, fork, fork + side * s * 3.0 - top * 0.0 + v3(0.6, 0, -fork[2] + 0.5), 0.4, mat="gun")
    else:
        R.capsule(c, fork - top * 1.0, fork - top * 1.0 - ax * 5.0, 0.36, mat="gun")
    return muzzle


def add_atr(c: R.Cloud, stock, muzzle) -> np.ndarray:
    """Anti-tank rifle: folding skeleton stock, big breech, very long barrel, brake."""
    stock, muzzle = np.asarray(stock, float), np.asarray(muzzle, float)
    d = muzzle - stock
    n = float(np.linalg.norm(d))
    F = frame_of(d)
    ax, side, top = F[:, 0], F[:, 1], F[:, 2]
    R.capsule(c, stock - top * 0.8, stock + ax * 5.0, 0.55, mat="gun")
    R.capsule(c, stock + top * 0.8, stock + ax * 5.0 + top * 0.4, 0.55, mat="gun")
    wbox(c, stock, (0.5, 0.8, 1.6), "rubber", F)
    wbox(c, stock + ax * 8.0, (3.2, 1.25, 1.55), "gun", F)
    wbox(c, stock + ax * 7.2 - top * 2.2, (0.8, 0.6, 1.2), "wood", F)
    wbox(c, stock + ax * 9.0 + side * 1.9, (1.0, 0.7, 1.2), "gun", F)
    R.capsule(c, stock + ax * 9.0 + top * 2.4, stock + ax * 13.0 + top * 2.4, 0.4, mat="gun")
    R.cylinder(c, stock + ax * 11.0, muzzle - ax * 2.6, 0.62, "gun")
    wbox(c, muzzle - ax * 1.4, (1.4, 1.4, 1.0), "gun", F)
    fork = stock + ax * (n * 0.62)
    R.capsule(c, fork - top * 0.8, fork - top * 0.8 - ax * 5.0, 0.32, mat="gun")
    return muzzle


def add_schreck(c: R.Cloud, back, front) -> np.ndarray:
    """Shoulder rocket tube with the blast shield the gunner looks through."""
    back, front = np.asarray(back, float), np.asarray(front, float)
    d = front - back
    n = float(np.linalg.norm(d))
    F = frame_of(d)
    ax, side, top = F[:, 0], F[:, 1], F[:, 2]
    R.cylinder(c, back, front, 1.8, "stahl")
    R.cylinder(c, back, back + ax * 0.8, 2.1, "gun")
    R.cylinder(c, front - ax * 0.8, front, 2.05, "gun")
    R.cylinder(c, back + ax * (n * 0.5), back + ax * (n * 0.5 + 0.5), 2.0, "gun")
    # Shield: wide to the left of the tube, where the face is, with a window.
    sh = back + ax * (n * 0.68)
    wbox(c, sh - side * 2.4 + top * 0.6, (0.22, 4.4, 3.6), "stahl", F)
    wbox(c, sh - side * 3.4 + top * 1.6 - ax * 0.25, (0.05, 1.0, 0.7), "glass", F)
    wbox(c, back + ax * (n * 0.42) - top * 2.6, (0.6, 0.5, 1.2), "gun", F)
    wbox(c, back + ax * (n * 0.56) - top * 2.4, (0.5, 0.5, 1.0), "gun", F)
    return front


def add_lance(c: R.Cloud, stock, muzzle) -> np.ndarray:
    stock, muzzle = np.asarray(stock, float), np.asarray(muzzle, float)
    d = muzzle - stock
    n = float(np.linalg.norm(d))
    F = frame_of(d)
    ax, top = F[:, 0], F[:, 2]
    R.cylinder(c, stock, stock + ax * 7.0, 1.25, "gun")
    wbox(c, stock + ax * 2.5 - top * 1.8, (0.6, 0.55, 1.3), "wood", F)
    wbox(c, stock + ax * 7.5 - top * 1.8, (0.6, 0.55, 1.3), "wood", F)
    R.capsule(c, stock + ax * 6.5, muzzle - ax * 2.2, 0.7, 0.6, "gun")
    R.cylinder(c, muzzle - ax * 2.6, muzzle, 1.25, "brass")
    R.ellipsoid(c, muzzle - ax * 1.4 - top * 1.4, (0.6, 0.6, 0.6), "flash_core")
    return muzzle


def add_mortar(c: R.Cloud, base, mouth) -> np.ndarray:
    base, mouth = np.asarray(base, float), np.asarray(mouth, float)
    R.cylinder(c, base, mouth, 1.85, "gun")
    R.cylinder(c, mouth - unit(mouth - base) * 0.7, mouth, 2.15, "gun")
    mid = _along(base, mouth, 0.62)
    R.cylinder(c, mid, mid + unit(mouth - base) * 0.8, 2.3, "steel")
    for s in (1, -1):
        R.capsule(c, mid, v3(mid[0] + 2.4, mid[1] + s * 4.0, 0.6), 0.4, mat="gun")
    R.box(c, base + v3(-0.6, 0, 0.3), (3.0, 3.4, 0.45), "stahl")
    return mouth


def add_pistol(c: R.Cloud, hand) -> np.ndarray:
    hand = np.asarray(hand, float)
    muzzle = hand + v3(5.0, -0.2, 1.2)
    R.box(c, hand + v3(0.4, 0, -0.6), (0.9, 0.6, 1.4), "gun", rot=R.rot_y(-0.25))
    R.box(c, hand + v3(2.6, -0.1, 0.9), (2.6, 0.55, 0.65), "gun")
    return muzzle


def add_wrench(c: R.Cloud, hand, angle: float) -> None:
    hand = np.asarray(hand, float)
    d = v3(math.cos(angle), -0.25, math.sin(angle))
    tip = hand + d * 7.5
    R.capsule(c, hand, tip, 0.6, 0.5, "steel")
    jaw = v3(-d[2], 0, d[0])
    R.capsule(c, tip, tip + jaw * 2.2, 0.6, mat="steel")
    R.capsule(c, tip, tip - jaw * 2.2, 0.6, mat="steel")


def add_hammer(c: R.Cloud, hand, angle: float) -> None:
    hand = np.asarray(hand, float)
    d = v3(math.cos(angle), -0.2, math.sin(angle))
    tip = hand + d * 8.5
    R.capsule(c, hand, tip, 0.55, 0.45, "wood")
    R.box(c, tip, (1.1, 2.4, 1.5), "gun")


def add_flash(c: R.Cloud, tip, direction, scale: float) -> None:
    """Short burst. A long barrel already sits near the cell edge."""
    tip = np.asarray(tip, float)
    direction = unit(direction)
    F = frame_of(direction)
    R.ellipsoid(c, tip + direction * 1.9 * scale, (2.4 * scale, 1.1 * scale, 1.1 * scale), "flash", rot=F)
    for k in range(4):
        a = k * math.pi / 2 + 0.6
        off = (math.cos(a) * F[:, 1] + math.sin(a) * F[:, 2]) * 1.5 * scale
        R.ellipsoid(c, tip + direction * 0.9 * scale + off, (0.6 * scale, 0.6 * scale, 0.6 * scale), "flash")
    R.ellipsoid(c, tip + direction * 0.8 * scale, (1.1 * scale, 1.1 * scale, 1.1 * scale), "flash_core")


def grip_pair(stock, muzzle) -> tuple[np.ndarray, np.ndarray]:
    return _along(stock, muzzle, 0.30), _along(stock, muzzle, 0.52)


# ---------------------------------------------------------------- poses


@dataclass
class Role:
    id: str
    cloth: object = "feldgrau"  # tunic: a name or a camo picker
    legs: object = "feldgrau"
    head: str = "helm"  # helm, medic, cap, cover, mask, phones, para
    cap_mat: str = "feldgrau"
    weapon: str = "rifle"  # rifle, mg, sniper, atr, tube, lance, mortar, pistol, none
    kit: tuple = ("ystraps", "pouches", "breadbag", "gasmask", "shovel")
    boots: str = "jack"  # jack, ankle, gaiter
    bulk: float = 1.0
    glove: str = "skin"
    coat: bool = False
    tabard: bool = False
    fire_from: str = "stand"  # stand, crouch, crawl
    files: dict = field(default_factory=dict)


def sleeve_of(role: Role, hip):
    return cloth_at(role.cloth, hip)


def weapon_line(role: Role, hip, lean: float, pose: str) -> tuple[np.ndarray, np.ndarray] | None:
    """Stock and muzzle in body space. None when the hands are empty."""
    if role.weapon in ("pistol", "none"):
        return None
    if pose == "crawl":
        z = 3.6
        if role.weapon == "mg":
            return v3(5.0, -3.4, z + 0.6), v3(33.0, -2.0, z + 1.4)
        if role.weapon == "atr":
            return v3(4.0, -3.0, z + 0.4), v3(37.0, -1.4, z + 1.6)
        if role.weapon == "tube":
            return v3(-6.0, -3.6, z + 4.6), v3(26.0, -2.4, z + 5.4)
        if role.weapon == "lance":
            return v3(6.0, -3.0, z + 0.6), v3(28.0, -1.6, z + 1.4)
        if role.weapon == "mortar":
            return v3(-2.0, 5.4, z + 0.4), v3(16.0, 5.0, z + 1.6)
        length = 30.0 if role.id == "jumpjet" else 35.0
        return v3(6.0, -3.2, z + 0.4), v3(length, -1.6, z + 1.4)
    if role.weapon == "tube":
        # On the right shoulder, the back end well behind him.
        stock = lean_pt(hip, (-13.0, -4.6, 21.4), lean)
        muzzle = lean_pt(hip, (19.0, -3.4, 22.6), lean)
        return stock, muzzle
    if role.weapon == "lance":
        return lean_pt(hip, (3.0, -3.6, 11.4), lean), lean_pt(hip, (25.0, -1.4, 14.0), lean)
    if role.weapon == "mortar" and pose == "crouch":
        # Planted in front of the kneel. Mouth high, so the bomb leaves upward.
        return v3(6.0, 0.6, 1.0), v3(11.0, 0.2, 25.0)
    if role.weapon == "mortar":
        return None
    if role.weapon == "mg":
        # From the hip, sling-supported. Long and level.
        return lean_pt(hip, (-3.0, -4.6, 9.4), lean), lean_pt(hip, (29.0, -1.8, 12.8), lean)
    if role.weapon == "atr":
        return lean_pt(hip, (-4.0, -4.6, 10.2), lean), lean_pt(hip, (32.0, -1.4, 14.2), lean)
    length = 23.0 if role.id == "jumpjet" else 29.0
    # At the ready, butt under the right arm, muzzle a little up.
    return lean_pt(hip, (-2.5, -4.6, 11.6), lean), lean_pt(hip, (length - 2.5, -1.4, 16.2), lean)


def place_weapon(c: R.Cloud, role: Role, stock, muzzle, planted: bool = False) -> np.ndarray:
    if role.weapon == "mg":
        return add_mg42(c, stock, muzzle, planted)
    if role.weapon == "tube":
        return add_schreck(c, stock, muzzle)
    if role.weapon == "lance":
        return add_lance(c, stock, muzzle)
    if role.weapon == "mortar":
        return add_mortar(c, stock, muzzle)
    if role.weapon == "sniper":
        return add_kar98(c, stock, muzzle, scope=True)
    if role.weapon == "atr":
        return add_atr(c, stock, muzzle)
    return add_kar98(c, stock, muzzle, short=role.id == "jumpjet")


def weapon_grips(role: Role, stock, muzzle) -> tuple[np.ndarray, np.ndarray]:
    """Right hand, left hand."""
    stock, muzzle = np.asarray(stock, float), np.asarray(muzzle, float)
    F = frame_of(muzzle - stock)
    down = -F[:, 2]
    n = float(np.linalg.norm(muzzle - stock))
    ax = F[:, 0]
    if role.weapon == "tube":
        return stock + ax * (n * 0.42) + down * 2.8, stock + ax * (n * 0.56) + down * 2.6
    if role.weapon == "mg":
        return stock + ax * 6.2 + down * 2.4, stock + ax * 13.5 + down * 1.0
    if role.weapon == "lance":
        return stock + ax * 2.5 + down * 2.4, stock + ax * 7.5 + down * 2.4
    if role.weapon == "atr":
        return stock + ax * 7.2 + down * 2.4, stock + ax * 13.5 + down * 0.6
    return stock + ax * 7.6 + down * 0.6, stock + ax * (n * 0.5) + down * 0.9


def free_hand(shoulder, phase: float, side: float, hang: float) -> np.ndarray:
    x, z = foot_xz(phase + 0.5, 6.4, 2.6)
    return np.asarray(shoulder, float) + v3(x * 0.9, side * 1.5, -hang + z * 0.25)


Built = tuple[R.Cloud, "np.ndarray | None", "tuple[np.ndarray, np.ndarray] | None"]


def flesh_upright(role: Role, pose: str, phase: float, tool: str | None = None, tool_angle: float = 0.8) -> Built:
    """Stand or crouch. `phase` is the gait. A tool replaces the weapon."""
    c = R.Cloud()
    stand = pose == "stand"
    base = STAND_HIP if stand else CROUCH_HIP
    stride = STRIDE if stand else CROUCH_STRIDE
    lift = LIFT if stand else CROUCH_LIFT
    lean = 0.10 if stand else 0.40
    if role.weapon in ("mg", "atr", "tube") and stand:
        lean = 0.06
    if role.weapon == "mortar" and pose == "crouch":
        # Knee-shuffle around a planted tube. One foot stays back.
        stride, lift, lean = 3.2, 2.2, 0.46
    hip_z = base + (hop_of(phase) if tool is None else 0.0)
    hip = v3(0.0, 0.0, hip_z)
    for s, off in ((1.0, 0.0), (-1.0, 0.5)):
        fx, fz = foot_xz(phase + off, stride, lift)
        if role.weapon == "mortar" and pose == "crouch" and s < 0:
            fx, fz = -2.0, 0.0
        ankle = v3(fx, s * (HIP_Y + 0.3), ANKLE + fz)
        add_leg(c, hip + v3(0, s * HIP_Y, 0), ankle, role)
    add_torso(c, hip, lean, role)
    head = lean_pt(hip, (0.9, 0.0, HEAD_Z), lean)
    if not stand:
        head = head + v3(-0.6, 0, 0.6)
    add_head(c, head, role)
    add_kit(c, hip, lean, role, pose)
    sh_l = lean_pt(hip, (SH_X, SH_Y * role.bulk, SH_Z), lean)
    sh_r = lean_pt(hip, (SH_X, -SH_Y * role.bulk, SH_Z), lean)
    sleeve = sleeve_of(role, hip)
    sleeve_l = "white" if role.tabard else sleeve
    tip = None
    line = None
    if tool == "hammer":
        d = v3(math.cos(tool_angle), -0.15, math.sin(tool_angle))
        hand_r = sh_r + d * 10.0
        add_arm(c, sh_r, hand_r, sleeve, role.glove)
        add_hammer(c, hand_r, tool_angle)
        add_arm(c, sh_l, free_hand(sh_l, 0.15, 1, 13.0), sleeve_l, role.glove)
    elif tool == "wrench":
        d = v3(math.cos(tool_angle) * 0.6 + 0.6, -0.4, math.sin(tool_angle) * 0.5 - 0.4)
        hand_r = sh_r + d * 9.0
        add_arm(c, sh_r, hand_r, sleeve, role.glove)
        add_wrench(c, hand_r, tool_angle)
        add_arm(c, sh_l, sh_l + v3(7.0, 1.0, -8.0), sleeve_l, role.glove)
    elif role.weapon == "pistol" or (role.weapon == "none" and role.id == "engineer"):
        hand_r = sh_r + v3(12.0, 1.4, -5.0)
        add_arm(c, sh_r, hand_r, sleeve, role.glove)
        if role.id == "engineer":
            add_wrench(c, hand_r, 0.15)
        else:
            tip = add_pistol(c, hand_r)
            line = (hand_r, tip)
        add_arm(c, sh_l, free_hand(sh_l, phase, 1, 15.2), sleeve_l, role.glove)
    elif role.weapon == "none" or (role.weapon == "mortar" and pose == "stand"):
        if role.weapon == "mortar":
            # Right hand on the pack strap, left carries a three-round case.
            add_arm(c, sh_r, sh_r + v3(3.0, 3.0, -8.5), sleeve, role.glove)
            hand_l = free_hand(sh_l, phase, 1, 15.2)
            add_arm(c, sh_l, hand_l, sleeve, role.glove)
            R.box(c, hand_l + v3(0, 0.6, -3.4), (1.4, 1.0, 3.0), "stahl")
            R.capsule(c, hand_l + v3(-0.8, 0.6, -0.2), hand_l + v3(0.8, 0.6, -0.2), 0.3, mat="gun")
        elif role.id == "droneop":
            # Both hands on the chest controller.
            for sh, s in ((sh_l, 1), (sh_r, -1)):
                hand = lean_pt(hip, (front_x(12) + 2.4, s * 2.6, 12.4), lean)
                add_arm(c, sh, hand, sleeve, role.glove)
        else:
            add_arm(c, sh_l, free_hand(sh_l, phase, 1, 15.2), sleeve_l, role.glove)
            add_arm(c, sh_r, free_hand(sh_r, phase + 0.5, -1, 15.2), sleeve, role.glove)
    else:
        line = weapon_line(role, hip, lean, pose)
        assert line is not None
        stock, muzzle = line
        tip = place_weapon(c, role, stock, muzzle, False)
        rear, fore = weapon_grips(role, stock, muzzle)
        if role.weapon == "mortar":
            rear, fore = _along(stock, muzzle, 0.55) + v3(-1.5, -1.6, 0), muzzle + v3(-1.0, 1.4, 0.8)
        add_arm(c, sh_r, rear, sleeve, role.glove)
        add_arm(c, sh_l, fore, sleeve_l, role.glove)
    if role.weapon == "lance" and line is not None:
        a = lean_pt(hip, (back_x(10) - 2.0, -4.6, 6.0), lean)
        b = _along(line[0], line[1], 0.08)
        R.capsule(c, a, _along(a, b, 0.5) + v3(0, -1.0, -3.0), 0.55, mat="rubber")
        R.capsule(c, _along(a, b, 0.5) + v3(0, -1.0, -3.0), b, 0.55, mat="rubber")
    return c, tip, line


def flesh_crawl(role: Role, phase: float, planted: bool = False) -> Built:
    c = R.Cloud()
    heave = 0.6 * abs(math.sin(2 * math.pi * phase))
    sway = 1.6 * math.sin(2 * math.pi * phase)
    lean = 1.40
    hip = v3(-10.5, sway, 4.6 + heave)
    add_torso(c, hip, lean, role)
    # Head up, looking along the weapon.
    head = lean_pt(hip, (0.9, 0, HEAD_Z - 1.4), lean) + v3(-0.8, 0, 3.4)
    add_head(c, head, role)
    add_kit(c, hip, lean, role, "crawl")
    legs_hip = hip
    for s, off in ((1.0, 0.0), (-1.0, 0.5)):
        p = (phase + off) % 1.0
        cs, sn = math.cos(2 * math.pi * p), math.sin(2 * math.pi * p)
        root = legs_hip + v3(0.6, s * HIP_Y, -0.4)
        knee = legs_hip + v3(-11.0 + 4.0 * cs, s * (5.2 + 2.0 * max(0.0, cs)), -1.6 + 1.2 * max(0.0, sn))
        knee[2] = max(knee[2], 2.6)
        ankle = knee + v3(-11.6 + 2.6 * cs, s * 0.6, 0.0)
        ankle[2] = 2.2 + 1.8 * max(0.0, -sn)
        legs = cloth_at(role.legs, hip)
        R.capsule(c, root, knee, 3.1, 2.4, legs)
        lower = "boot" if role.boots == "jack" else legs
        R.capsule(c, knee, _along(knee, ankle, 0.2), 2.3, 2.1, legs)
        R.capsule(c, _along(knee, ankle, 0.2), ankle, 2.1, 1.75, lower)
        R.capsule(c, ankle, ankle + v3(-0.6, 0, -1.8), 1.5, 1.3, "boot")
    sleeve = sleeve_of(role, hip)
    sleeve_l = "white" if role.tabard else sleeve
    sh_l = lean_pt(hip, (SH_X, SH_Y, SH_Z), lean)
    sh_r = lean_pt(hip, (SH_X, -SH_Y, SH_Z), lean)
    tip = None
    line = None
    armed = role.weapon not in ("none", "pistol")
    if not armed:
        for shoulder, side, off in ((sh_l, 1.0, 0.0), (sh_r, -1.0, 0.5)):
            p = (phase + off) % 1.0
            reach = 5.0 * math.cos(2 * math.pi * p)
            up = 2.0 * max(0.0, math.sin(2 * math.pi * p))
            hand = shoulder + v3(8.5 + reach, side * 1.4, -shoulder[2] + 1.6 + up)
            add_arm(c, shoulder, hand, sleeve_l if side > 0 else sleeve, role.glove)
        if role.id == "engineer":
            add_wrench(c, sh_r + v3(10.0, -1.2, -sh_r[2] + 1.6), 0.2)
    else:
        line = weapon_line(role, hip, 0.0, "crawl")
        assert line is not None
        stock, muzzle = line
        stock = stock + v3(0, 0, heave)
        muzzle = muzzle + v3(0, 0, heave)
        line = (stock, muzzle)
        tip = place_weapon(c, role, stock, muzzle, planted=planted and role.weapon == "mg")
        rear, fore = weapon_grips(role, stock, muzzle)
        if role.weapon == "mortar":
            rear, fore = _along(stock, muzzle, 0.3), _along(stock, muzzle, 0.6)
        add_arm(c, sh_r, rear, sleeve, role.glove)
        # The free arm reaches, then comes back to the fore-end.
        p = (phase + 0.5) % 1.0
        reach = 6.0 * math.cos(2 * math.pi * p)
        hand_l = fore + v3(reach * 0.35, 1.2, 0.6 * max(0.0, math.sin(2 * math.pi * p)))
        add_arm(c, sh_l, hand_l, sleeve_l, role.glove)
    # Nothing sinks through the ground.
    for p in c.pts:
        p[:, 2] = np.maximum(p[:, 2], 0.35)
    return c, tip, line


def drop_weapon(c: R.Cloud, role: Role) -> None:
    if role.weapon in ("none", "pistol"):
        if role.id == "engineer":
            add_wrench(c, v3(3.0, -11.0, 1.5), 0.4)
        return
    a = v3(-4.0, -12.0, 1.6)
    b = a + v3(24.0, -1.5, 0.3)
    if role.weapon == "tube":
        add_schreck(c, a + v3(-4, -1, 1.2), b + v3(2, 0, 1.2))
    elif role.weapon == "lance":
        add_lance(c, a + v3(4, 0, 0), b)
    elif role.weapon == "mortar":
        R.cylinder(c, a + v3(2, 0, 0.4), a + v3(16, -1, 0.4), 1.85, "gun")
    elif role.weapon == "mg":
        add_mg42(c, a, b + v3(4, 0, 0), False)
    elif role.weapon == "atr":
        add_atr(c, a, b + v3(8, 0, 0))
    else:
        add_kar98(c, a, b + v3(3, 0, 0), scope=role.weapon == "sniper", short=role.id == "jumpjet")


def flesh_death(role: Role, frame: int) -> R.Cloud:
    """Four-frame collapse. The last frame is the one the corpse holds."""
    t = frame / 3
    c = R.Cloud()
    lean = 0.25 + 1.22 * t
    hip = v3(-6.0 * t, 0.0, 30.0 * (1 - t) + 4.4 * t)
    for s, off in ((1.0, 0.0), (-1.0, 0.4)):
        root = hip + v3(0, s * HIP_Y, 0)
        if t < 0.5:
            # Knees buckle first.
            ankle = v3(-3.0 - 6.0 * t + off * 3, s * HIP_Y, ANKLE)
            add_leg(c, root, ankle, role)
            continue
        # Then the legs lie flat behind him, one a little bent.
        legs = cloth_at(role.legs, hip)
        knee = root + v3(-14.6, s * (1.2 + 1.6 * off), -root[2] + 2.8)
        ankle = knee + v3(-13.6 + 2.0 * off, s * (0.6 + 3.0 * off), -0.4)
        R.capsule(c, root, knee, 3.1, 2.4, legs)
        lower = "boot" if role.boots == "jack" else legs
        R.capsule(c, knee, _along(knee, ankle, 0.15), 2.3, 2.1, legs)
        R.capsule(c, _along(knee, ankle, 0.15), ankle, 2.15, 1.75, lower)
        R.capsule(c, ankle + v3(0, 0, 0.2), ankle + v3(-0.8, 0, 2.6), 1.5, 1.3, "boot")
    add_torso(c, hip, lean, role)
    head = lean_pt(hip, (0.9, 0.0, HEAD_Z), lean) + v3(0, 0.6 * t, -1.2 * t)
    add_head(c, head, role)
    add_kit(c, hip, lean, role, "die")
    sh_l = lean_pt(hip, (SH_X, SH_Y, SH_Z), lean)
    sh_r = lean_pt(hip, (SH_X, -SH_Y, SH_Z), lean)
    sleeve = sleeve_of(role, hip)
    sleeve_l = "white" if role.tabard else sleeve
    if t < 0.45 and role.weapon not in ("none", "pistol", "mortar"):
        line = weapon_line(role, hip, lean, "stand")
        if line:
            stock, muzzle = line
            place_weapon(c, role, stock, muzzle, False)
            rear, fore = weapon_grips(role, stock, muzzle)
            add_arm(c, sh_r, rear, sleeve, role.glove)
            add_arm(c, sh_l, fore, sleeve_l, role.glove)
    else:
        # Arms flung forward of the shoulders, weapon beside him.
        add_arm(c, sh_l, sh_l + v3(6.0 + 3.0 * t, 3.0, -9.0 * (1 - t) - 2.0 * t), sleeve_l, role.glove)
        add_arm(c, sh_r, sh_r + v3(5.0 + 3.0 * t, -3.0, -9.0 * (1 - t) - 2.0 * t), sleeve, role.glove)
        if t > 0.45:
            drop_weapon(c, role)
    for p in c.pts:
        p[:, 2] = np.maximum(p[:, 2], 0.35)
    fit_corpse(c, 0.82)
    return c


def fit_corpse(c: R.Cloud, contact: float) -> None:
    """Centre the body on the cell anchor, then shrink the footprint if a facing would clip.

    contactY 0.82 sits low in the cell. A south-facing corpse points at the camera,
    so the half of the body below that anchor is only about 14 pixels.
    """
    if not c.pts:
        return
    pts = np.concatenate(c.pts)
    ctr = np.array([(pts[:, 0].min() + pts[:, 0].max()) / 2, (pts[:, 1].min() + pts[:, 1].max()) / 2, 0.0])
    c.pts = [p - ctr for p in c.pts]
    pts = np.concatenate(c.pts)
    radius = np.hypot(pts[:, 0], pts[:, 1])
    sy = radius * STAND_SCALE * R.SIN_P - pts[:, 2] * STAND_SCALE * R.COS_P
    limit = R.CELL * (1.0 - contact) - 6.0
    worst_i = int(np.argmax(sy))
    worst = float(sy[worst_i])
    if worst <= limit:
        return
    r = float(radius[worst_i])
    zt = float(pts[worst_i, 2] * STAND_SCALE * R.COS_P)
    shrink = (limit + zt) / max(r * STAND_SCALE * R.SIN_P, 1e-3)
    shrink = min(1.0, max(0.45, shrink))
    for p in c.pts:
        p[:, 0] *= shrink
        p[:, 1] *= shrink


def flesh_swim(role: Role, frame: int) -> R.Cloud:
    """Chest-deep. Legs are under the plane and not built. The arms paddle."""
    c = R.Cloud()
    phase = frame / 8
    hip = v3(0.0, 0.0, STAND_HIP - WATER_Z + bob_of(frame) / (STAND_SCALE * R.COS_P))
    lean = 0.1
    add_torso(c, hip, lean, role)
    add_head(c, lean_pt(hip, (0.9, 0, HEAD_Z), lean), role)
    add_kit(c, hip, lean, role, "swim")
    sh_l = lean_pt(hip, (SH_X, SH_Y, SH_Z), lean)
    sh_r = lean_pt(hip, (SH_X, -SH_Y, SH_Z), lean)
    sleeve = sleeve_of(role, hip)
    sleeve_l = "white" if role.tabard else sleeve
    for shoulder, side, slv, off in ((sh_l, 1.0, sleeve_l, 0.0), (sh_r, -1.0, sleeve, 0.5)):
        ang = 2 * math.pi * (phase + off)
        hand = shoulder + v3(8.0 * math.sin(ang), side * 3.0, -4.0 + 3.0 * math.cos(ang))
        hand[2] = max(float(hand[2]), 3.5)
        add_arm(c, shoulder, hand, slv, role.glove)
    # Cut at the water plane so nothing below it pokes through the pool.
    out = R.Cloud()
    for p, n, m, k in zip(c.pts, c.nrm, c.mat, c.part):
        keep = p[:, 2] >= -1.0
        if keep.any():
            out.pts.append(p[keep])
            out.nrm.append(n[keep])
            out.mat.append(m[keep])
            out.part.append(k[keep])
    return out


def flesh_fly(role: Role, frame: int) -> R.Cloud:
    """Hanging under the pack. The plumes are the only thing that changes."""
    c = R.Cloud()
    hip = v3(0.0, 0.0, 25.0)
    lean = 0.16
    for s in (1.0, -1.0):
        knee = hip + v3(7.5, s * HIP_Y, -6.0)
        ankle = hip + v3(2.0, s * HIP_Y, -14.0)
        legs = cloth_at(role.legs, hip)
        R.capsule(c, hip + v3(0, s * HIP_Y, 0), knee, 3.1, 2.4, legs)
        R.capsule(c, knee, ankle, 2.2, 1.8, legs)
        add_boot(c, ankle)
    add_torso(c, hip, lean, role)
    add_head(c, lean_pt(hip, (0.9, 0, HEAD_Z), lean), role)
    add_kit(c, hip, lean, role, "fly")
    scales = (1.15, 0.62, 1.0, 0.45)
    bx = back_x(13) - 2.4
    for s in (1, -1):
        base = lean_pt(hip, (bx - 1.0, s * 2.7, 2.4), lean)
        k = scales[frame]
        R.ellipsoid(c, base + v3(0, 0, -2.0 * k), (1.2, 1.2, 2.4 * k), "flash_core")
        R.ellipsoid(c, base + v3(0, 0, -4.8 * k), (1.7, 1.7, 3.0 * k), "plume")
    sh_l = lean_pt(hip, (SH_X, SH_Y, SH_Z), lean)
    sh_r = lean_pt(hip, (SH_X, -SH_Y, SH_Z), lean)
    line = weapon_line(role, hip, lean, "stand")
    assert line is not None
    stock, muzzle = line
    place_weapon(c, role, stock, muzzle, False)
    rear, fore = weapon_grips(role, stock, muzzle)
    sleeve = sleeve_of(role, hip)
    add_arm(c, sh_r, rear, sleeve, role.glove)
    add_arm(c, sh_l, fore, sleeve, role.glove)
    return c


def flesh_fire(role: Role, frame: int) -> R.Cloud:
    scales = (1.1, 0.55, 0.95, 0.75)
    if role.fire_from == "crawl":
        c, tip, line = flesh_crawl(role, 0.0, planted=True)
    elif role.fire_from == "crouch":
        c, tip, line = flesh_upright(role, "crouch", 0.0)
    else:
        c, tip, line = flesh_upright(role, "stand", 0.0)
    if tip is not None and line is not None:
        direction = np.asarray(line[1], float) - np.asarray(line[0], float)
        add_flash(c, tip, direction, scales[frame])
        if role.weapon == "tube":
            # Backblast behind the shoulder tube.
            add_flash(c, np.asarray(line[0], float), -direction, scales[frame] * 0.85)
    return c


def build_cloud(role: Role, sheet: str, frame: int) -> tuple[R.Cloud, np.ndarray | None]:
    if sheet == "walk":
        return flesh_upright(role, "stand", frame / 8)[:2]
    if sheet == "crouch":
        return flesh_upright(role, "crouch", frame / 8)[:2]
    if sheet == "crawl":
        return flesh_crawl(role, frame / 8)[:2]
    if sheet == "handgun":
        pistol = Role(**{**role.__dict__, "weapon": "pistol", "kit": tuple(role.kit) + ("holster",)})
        return flesh_upright(pistol, "stand", frame / 8)[:2]
    if sheet == "fire":
        return flesh_fire(role, frame), None
    if sheet == "die":
        return flesh_death(role, frame), None
    if sheet == "swim":
        return flesh_swim(role, frame), None
    if sheet == "fly":
        return flesh_fly(role, frame), None
    if sheet == "build":
        # Kneeling work. Frame swings the hammer; the legs stay.
        angles = (1.15, 0.35, -0.5, 0.6)
        return flesh_upright(role, "crouch", 0.0, tool="hammer", tool_angle=angles[frame])[:2]
    if sheet == "fix":
        angles = (0.2, 1.15, 2.1, 2.9)
        return flesh_upright(role, "crouch", 0.05, tool="wrench", tool_angle=angles[frame])[:2]
    raise SystemExit(f"unknown sheet {sheet}")


# ---------------------------------------------------------------- roster


def role_files(prefix: str, **extra: str) -> dict:
    base = {
        "walk": f"{prefix}-walk.png",
        "crouch": f"{prefix}-crouch.png",
        "crawl": f"{prefix}-crawl.png",
        "die": f"{prefix}-die.png",
        "swim": f"{prefix}-swim.png",
        "cameo": f"{prefix}-cameo.png",
    }
    base.update(extra)
    return base


SMOCK = camo(("camo_g", "camo_b", "camo_t", "camo_g"), 3.4, 3)
PARA_SMOCK = camo(("camo_g", "feldgrau", "camo_b", "camo_g"), 3.0, 11)
RIFLE_KIT = ("ystraps", "pouches", "breadbag", "gasmask", "shovel")

ROLES: list[Role] = [
    # Field grey, helmet, Kar98k, the full belt kit. The baseline every other role departs from.
    Role("rifleman", files=role_files(
        "trooper", fire="trooper-rifle-fire.png", handgun="trooper-handgun.png", swim="infantry-swim.png",
    )),
    # MG42 at the hip, brass belts crossed on the chest, ammo can on the back.
    Role("gunner", weapon="mg", kit=("belts", "holster", "breadbag", "gasmask"), bulk=1.06, fire_from="crawl",
         files=role_files("gunner", fire="gunner-fire.png")),
    # Camo smock and leafy helmet cover over the field grey, scoped rifle.
    Role("sniper", cloth=SMOCK, head="cover", weapon="sniper", kit=("pouches", "breadbag", "canteen"),
         files=role_files("sniper", fire="sniper-fire.png")),
    # Long greatcoat and the long anti-tank rifle.
    Role("atinfantry", cloth="coat", legs="coat", weapon="atr", coat=True, kit=("atpouch", "breadbag", "gasmask"),
         files=role_files("atinfantry", fire="atinfantry-fire.png")),
    # Shoulder rocket tube with the shield, two spare rockets on a frame.
    Role("rocketer", weapon="tube", kit=("ystraps", "rockets", "breadbag"),
         files=role_files("rocketer", fire="rocketer-fire.png")),
    # Black rubber suit, gas mask under the helmet, two bottles, lance.
    Role("pyro", cloth="rubber", legs="rubber", head="mask", weapon="lance", kit=("tanks",), glove="rubber", bulk=1.05,
         files=role_files("pyro", fire="pyro-fire.png")),
    # Tube and baseplate on his back, a round case in his hand.
    Role("mortarman", weapon="mortar", kit=("ystraps", "mortarpack", "breadbag"), fire_from="crouch",
         files=role_files("mortarman", fire="mortarman-fire.png")),
    # White tabard with a red cross, marked helmet, aid bags. No weapon.
    Role("medic", head="medic", weapon="none", kit=("medbags",), tabard=True, files=role_files("medic")),
    # Reed-green drill fatigues, field cap, gaiters, tool bag and a satchel charge.
    Role("engineer", cloth="drill", legs="drill", head="cap", cap_mat="drill", weapon="none", kit=("tools",), boots="gaiter",
         files=role_files("engineer", build="engineer-build.png", fix="engineer-fix.png")),
    # Field cap and headset, backpack radio with a tall whip, controller on the chest.
    Role("droneop", head="phones", weapon="none", kit=("radio",), boots="ankle", files=role_files("droneop")),
    # Paratrooper: rimless helmet, camo smock, blue-grey trousers, jet pack, short rifle.
    Role("jumpjet", cloth=PARA_SMOCK, legs="lwblue", head="para", weapon="rifle", kit=("jet",), boots="ankle",
         files=role_files("jumpjet", fire="jumpjet-fire.png", fly="jumpjet-fly.png")),
]


def sheets_of(role: Role) -> list[str]:
    names = ["walk", "crouch", "crawl", "die", "swim"]
    for extra in ("fire", "handgun", "build", "fix", "fly"):
        if extra in role.files:
            names.append(extra)
    return names


def sheet_spec(role: Role, sheet: str) -> tuple[int, float, float]:
    """frames, contactY, scale. contactY matches sprites.ts."""
    if sheet in ("walk", "handgun"):
        return 8, 0.90, STAND_SCALE
    if sheet == "crouch":
        return 8, 0.88, STAND_SCALE
    if sheet == "crawl":
        return 8, 0.72, PRONE_SCALE
    if sheet == "fire":
        if role.fire_from == "crawl":
            return 4, 0.72, PRONE_SCALE
        if role.fire_from == "crouch":
            return 4, 0.88, STAND_SCALE
        return 4, 0.90, STAND_SCALE
    if sheet == "die":
        return 4, 0.82, STAND_SCALE
    if sheet == "swim":
        return 8, WL_Y / 96, STAND_SCALE
    if sheet in ("build", "fix"):
        return 4, 0.88, STAND_SCALE
    if sheet == "fly":
        return 4, 0.90, STAND_SCALE
    raise SystemExit(sheet)


def swim_post(im: Image.Image, frame: int) -> Image.Image:
    return in_water(im, frame, waist_half(np.array(im)), dip=R.SIN_P)


def screen_deg(row: int) -> float:
    """Degrees of the nose on screen. East is 0, south is +90, north is -90."""
    f, left = R.facing_vectors(row)
    sx = float(f[0])
    sy = float(left[0]) * R.SIN_P
    return math.degrees(math.atan2(sy, sx))


def project_tip(tip, row: int, scale: float, contact_y: float) -> tuple[float, float]:
    """Tip as a fraction of the cell, from centre (x) and from the contact line (y)."""
    f, left = R.facing_vectors(row)
    up = v3(0, 0, 1)
    cam = np.asarray(tip, float) @ np.stack([f, left, up]) * scale
    sx = float(cam[0])
    sy = float(cam[1]) * R.SIN_P - float(cam[2]) * R.COS_P
    return sx / R.CELL, (sy / R.CELL)


def render_rows(clouds: list[R.Cloud], scale: float, contact_y: float, rows: range | list[int], post=None) -> list[list[Image.Image]]:
    out: list[list[Image.Image]] = []
    for r in rows:
        cells = [R.render(cl, r, scale, contact_y) for cl in clouds]
        if post:
            cells = [post(im, i) for i, im in enumerate(cells)]
        out.append(cells)
    return out


def gait_contact(rows: list[list[Image.Image]], labels: list[str]) -> Image.Image:
    """Each entry is one facing's frames, labelled, on magenta."""
    frames = len(rows[0])
    cell = R.CELL
    pad = 16
    img = Image.new("RGB", (frames * cell, len(rows) * (cell + pad)), (255, 0, 255))
    draw = ImageDraw.Draw(img)
    for i, (cells, label) in enumerate(zip(rows, labels)):
        y = i * (cell + pad)
        for f, cell_im in enumerate(cells):
            img.paste(R.on_magenta(cell_im), (f * cell, y))
        draw.text((4, y + cell + 1), label, fill=(20, 16, 12))
    return img


def cameo_of(east: Image.Image) -> Image.Image:
    return R.cameo(east)


def save_sheet(role: Role, sheet: str, tips: dict) -> list[str]:
    frames, contact, scale = sheet_spec(role, sheet)
    clouds = []
    frame_tips = []
    for i in range(frames):
        cloud, tip = build_cloud(role, sheet, i)
        clouds.append(cloud)
        frame_tips.append(tip)
    R.CLIPPED.clear()
    post = swim_post if sheet == "swim" else None
    rendered = render_rows(clouds, scale, contact, range(16), post)
    clipped = sorted({ENGINE_ORDER[r] for r in R.CLIPPED}, key=ENGINE_ORDER.index)
    image = compose_sheet(rendered, R.CELL)
    out = UNITS / role.files[sheet]
    image.save(out)
    placed = {ENGINE_ORDER[r]: rendered[r][0] for r in range(16)}
    diag = diagnostics(placed, R.CELL)
    pops = [d["dir"] for d in diag if d.get("pop")]
    empties = [d["dir"] for d in diag if d.get("empty")]
    stem = out.stem
    preview_turntable(placed, R.CELL).save(PREVIEW / f"{stem}-turntable.png")
    draw_px = 25 if contact < 0.8 else 20
    preview_strip(image, R.CELL, frames, draw_px).save(PREVIEW / f"{stem}-strip.png")
    # East and south loops, so a walk can be checked without opening the sheet.
    gait_contact(
        [rendered[12], rendered[0]],
        ["E", "S"],
    ).save(PREVIEW / f"{stem}-gait.png")
    manifest = {
        "id": stem,
        "cell": R.CELL,
        "cols": frames,
        "rows": 16,
        "facing": 16,
        "order": list(ENGINE_ORDER),
        "contactY": contact,
        "scale": round(scale, 4),
        "out": str(out.relative_to(ROOT)),
        "size_pop_dirs": pops,
        "empty_dirs": empties,
        "clipped_dirs": clipped,
        "source": "render_infantry.py (16 unique yaws, real gait, no mirror)",
    }
    (PREVIEW / f"{stem}-manifest.json").write_text(json.dumps(manifest, indent=2))
    print(f"{stem}: {image.size[0]}x{image.size[1]} pop={pops or '-'} empty={empties or '-'} clipped={clipped or '-'}", flush=True)
    if role.id == "pyro" and sheet in ("walk", "crouch", "crawl") and frame_tips[0] is not None:
        stance = {"walk": "stand", "crouch": "crouch", "crawl": "crawl"}[sheet]
        per = []
        for r in range(16):
            fx, fy = project_tip(frame_tips[0], r, scale, contact)
            per.append([round(fx, 4), round(fy, 4), round(screen_deg(r), 1)])
        tips[stance] = per
    problems = []
    if empties:
        problems.append(f"{stem} empty {empties}")
    if clipped:
        problems.append(f"{stem} clipped {clipped}")
    if sheet == "walk" and not empties:
        east = placed["E"]
        R.on_magenta(east).save(SRC / f"{role.id}-east.png")
        cameo_of(east).save(UNITS / role.files["cameo"])
    return problems


def write_nozzle(tips: dict) -> None:
    if not all(k in tips for k in ("stand", "crouch", "crawl")):
        return
    body = ",\n".join(
        f"  {stance}: [\n" + "\n".join(f"    [{r[0]}, {r[1]}, {r[2]}]," for r in tips[stance]) + "\n  ]"
        for stance in ("stand", "crouch", "crawl")
    )
    # The function body stays the one flame-fx.test.ts calls. Only the table moves.
    NOZZLE_TS.write_text(
        f'''/**
 * Where the Pyro's lance tip is on screen, for each sheet row and posture.
 * Measured from the procedural stills by tools/sprites/render_infantry.py; do not edit by hand.
 */
import type {{ Stance }} from "@gridlock/shared";

export interface NozzleTip {{
  /** Screen offset from his feet of the ground point under the tip. */
  gx: number;
  gy: number;
  /** Tip height above that ground, screen pixels. */
  h: number;
}}

/**
 * Per row (0 = screen south, clockwise): tip x and y as a share of the cell
 * from the cell centre and the contact line, and the screen bearing he faces.
 */
const TIPS: Record<Stance, [number, number, number][]> = {{
{body},
}};

/**
 * Lance tip for a sheet row and posture, drawn `drawSize` pixels tall with
 * the feet `sink` pixels into the ground. The tip is split into the ground
 * point under it (along his facing) and a height above that point, so the
 * jet can arc down onto the ground from the right place.
 */
export function pyroNozzleScreen(row: number, stance: Stance, drawSize = 20, sink = 0): NozzleTip {{
  const r = ((Math.round(row) % 16) + 16) % 16;
  const [fx, fy, deg] = (TIPS[stance] ?? TIPS.stand)[r]!;
  const tx = fx * drawSize;
  const ty = fy * drawSize + sink;
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const rest = stance === "crawl" ? 2 : stance === "crouch" ? 5 : 7;
  let h = rest;
  if (Math.abs(c) > 0.35) {{
    // Ground point on his bearing straight under the tip.
    const along = tx / c;
    h = along * s - ty;
  }}
  h = Math.max(1, Math.min(rest * 1.8, h));
  return {{ gx: tx, gy: ty + h, h }};
}}
'''
    )
    print(f"nozzle table {NOZZLE_TS.relative_to(ROOT)}", flush=True)


def render_roster() -> Image.Image:
    """One east standing frame of every role, at cell size, plus a cameo row."""
    cells = []
    for role in ROLES:
        cloud, _ = build_cloud(role, "walk", 0)
        cells.append(R.render(cloud, 12, STAND_SCALE, 0.90))
    strip = Image.new("RGB", (len(cells) * R.CELL, R.CELL + 18), (255, 0, 255))
    draw = ImageDraw.Draw(strip)
    for i, (role, cell) in enumerate(zip(ROLES, cells)):
        strip.paste(R.on_magenta(cell), (i * R.CELL, 0))
        draw.text((i * R.CELL + 4, R.CELL + 2), role.id, fill=(20, 16, 12))
    return strip


def render_draft(role: Role) -> Image.Image:
    """East and south, all frames, for walk / crouch / crawl."""
    blocks = []
    labels = []
    for sheet, row, name in (("walk", 12, "walk E"), ("walk", 0, "walk S"),
                             ("crouch", 12, "crouch E"), ("crouch", 0, "crouch S"),
                             ("crawl", 12, "crawl E"), ("crawl", 0, "crawl S")):
        frames, contact, scale = sheet_spec(role, sheet)
        clouds = [build_cloud(role, sheet, i)[0] for i in range(frames)]
        rendered = render_rows(clouds, scale, contact, [row])
        blocks.append(rendered[0])
        labels.append(name)
    return gait_contact(blocks, labels)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--only", default="", help="Comma-separated role ids")
    parser.add_argument("--sheet", default="", help="One sheet name (walk, crouch, crawl, fire, die, swim, ...)")
    parser.add_argument("--roster", action="store_true", help="East stand of every role, no sheets")
    parser.add_argument("--draft", action="store_true", help="East/south gait contact, no engine sheets")
    args = parser.parse_args()
    PREVIEW.mkdir(parents=True, exist_ok=True)
    SRC.mkdir(parents=True, exist_ok=True)
    wanted = {s for s in args.only.split(",") if s}
    if args.roster:
        img = render_roster()
        dest = PREVIEW / "infantry-roster-east.png"
        img.save(dest)
        print(dest, flush=True)
        return 0
    roles = [r for r in ROLES if not wanted or r.id in wanted]
    if args.draft:
        if len(roles) != 1:
            raise SystemExit("--draft needs a single --only role")
        dest = PREVIEW / f"draft-{roles[0].id}.png"
        render_draft(roles[0]).save(dest)
        print(dest, flush=True)
        return 0
    problems: list[str] = []
    tips: dict = {}
    for role in roles:
        sheets = sheets_of(role)
        if args.sheet:
            if args.sheet not in sheets:
                raise SystemExit(f"{role.id} has no {args.sheet}")
            sheets = [args.sheet]
        for sheet in sheets:
            problems.extend(save_sheet(role, sheet, tips))
    write_nozzle(tips)
    if problems:
        print("PROBLEMS", *problems, sep="\n  ")
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
