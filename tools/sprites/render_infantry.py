#!/usr/bin/env python3
"""
Human infantry sheets — one locked camera, 16 unique yaws, real gaits.

Same rasterizer as the Cyborg (tools/sprites/render_cyborg.py): capsules and
boxes, flat three-tone fills, outline #1a1410. The camera never moves. Row 0
is south (screen down), then clockwise 22.5° through row 15. No mirroring, so
a weapon stays in the hand that holds it.

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

# A little finer than a blob, a little coarser than the Cyborg, so a full
# roster of loops finishes in one run. Read at call time.
R.SPACING = 0.40

# Body units. +x forward, +y left, +z up, soles near z = 0.
THIGH, SHIN = 14.2, 13.6
HIP_Y = 4.15
STAND_HIP = 29.2
CROUCH_HIP = 18.4
ANKLE = 3.05
STAND_SCALE = 1.22
# Crawl cells are drawn at 28/22 of the stand size, so the model is smaller
# in the cell and the man does not grow when he goes prone.
PRONE_SCALE = STAND_SCALE * 22 / 28
WATER_Z = 36.0  # belt. Chest and head stay above the pool.

# Stride is long on purpose: at the 20px stand draw a shorter step is a blur.
STRIDE = 8.0
LIFT = 7.6
CROUCH_STRIDE = 5.6
CROUCH_LIFT = 4.0

EXTRA_MATS: dict[str, tuple] = {
    "khaki": ((112, 92, 58), (164, 136, 86), (198, 172, 116)),
    "rubber": ((26, 28, 26), (44, 48, 44), (68, 72, 66)),
    "wood": ((86, 54, 32), (118, 78, 46), (148, 104, 62)),
    "cloth": ((78, 86, 56), (112, 122, 80), (142, 150, 104)),
    "cane": ((54, 68, 36), (74, 92, 48), (98, 118, 64)),
    "glass": ((36, 78, 86), (110, 176, 180), (214, 238, 230)),
    "white": ((176, 174, 166), (222, 220, 210), (246, 244, 236)),
    "plume": ((150, 54, 16), (214, 102, 24), (255, 176, 48)),
}
for _name, _spec in EXTRA_MATS.items():
    if _name not in R.MATERIALS:
        R.MATERIALS[_name] = _spec
        R.MAT_IDS[_name] = len(R.MAT_IDS)


def v3(*a) -> np.ndarray:
    return np.array(a, float)


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


def bend_elbow(shoulder, hand, drop: float) -> np.ndarray:
    mid = (np.asarray(shoulder, float) + np.asarray(hand, float)) / 2
    side = 1.0 if shoulder[1] >= 0 else -1.0
    elbow = mid + v3(0.3, side * 1.1, -drop)
    elbow[2] = max(float(elbow[2]), 1.6)
    return elbow


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
    return 1.25 * abs(math.sin(2 * math.pi * phase))


# ---------------------------------------------------------------- flesh


def add_boot(c: R.Cloud, ankle) -> None:
    ankle = np.asarray(ankle, float)
    toe = ankle + v3(2.7, 0.0, -1.15)
    heel = ankle + v3(-1.3, 0.0, -1.25)
    R.capsule(c, ankle, toe, 1.85, 1.4, "leather")
    R.ellipsoid(c, heel, (1.7, 1.55, 1.25), "dark")


def add_leg(c: R.Cloud, hip, ankle, cloth: str) -> None:
    knee = knee_of(hip, ankle)
    R.capsule(c, hip, knee, 2.75, 2.25, cloth)
    R.ellipsoid(c, knee + v3(0.6, 0, 0), (2.5, 2.45, 2.35), cloth)
    R.capsule(c, knee, ankle, 2.15, 1.65, "dark")
    add_boot(c, ankle)


def add_arm(c: R.Cloud, shoulder, hand, sleeve: str, glove: str, drop: float = 4.2) -> None:
    shoulder = np.asarray(shoulder, float)
    hand = np.asarray(hand, float)
    elbow = bend_elbow(shoulder, hand, drop)
    R.ellipsoid(c, shoulder, (2.7, 2.55, 2.5), sleeve)
    R.capsule(c, shoulder, elbow, 2.3, 1.9, sleeve)
    R.capsule(c, elbow, hand, 1.65, 1.4, glove)
    R.ellipsoid(c, hand, (1.75, 1.55, 1.4), glove)


def add_eyes(c: R.Cloud, head) -> None:
    for s in (1, -1):
        R.ellipsoid(c, head + v3(4.15, s * 1.55, 0.45), (0.7, 0.85, 0.75), "pupil")
    R.ellipsoid(c, head + v3(4.5, 0.0, -0.7), (0.9, 0.7, 0.7), "skin")


def add_head(c: R.Cloud, head, kind: str, cloth: str) -> None:
    """Headgear is the role read: helmet, cap, mask, hood, visor."""
    head = np.asarray(head, float)
    if kind == "mask":
        R.capsule(c, head + v3(-1.2, 0, -4.5), head + v3(0.2, 0, -1.5), 2.3, 2.5, "rubber")
        R.ellipsoid(c, head + v3(1.2, 0, -0.3), (5.3, 4.7, 5.0), "rubber")
        for s in (1, -1):
            R.ellipsoid(c, head + v3(5.5, s * 1.75, 0.55), (1.35, 1.85, 1.8), "glass")
        # Filter can on the right cheek, hose leaves toward the tanks.
        R.cylinder(c, head + v3(2.2, -4.6, -1.6), head + v3(2.2, -6.4, -1.6), 1.7, "dark")
        R.ellipsoid(c, head + v3(2.2, -7.0, -1.6), (1.9, 1.5, 1.9), "rubber")
        return
    R.capsule(c, head + v3(-0.6, 0, -5.2), head + v3(0.4, 0, -1.6), 2.15, 2.3, "skin")
    R.ellipsoid(c, head, (5.15, 4.7, 5.35), "skin")
    if kind == "visor":
        R.ellipsoid(c, head + v3(0.2, 0, 2.2), (6.3, 6.0, 5.4), "helmet", keep=lambda p, z0=head[2]: p[:, 2] >= z0 - 0.2)
        R.ellipsoid(c, head + v3(0.4, 0, 0.2), (6.6, 6.5, 1.5), "helmet")
        R.box(c, head + v3(4.7, 0, 0.15), (0.7, 3.7, 1.7), "glass")
        return
    if kind == "cap":
        add_eyes(c, head)
        R.box(c, head + v3(0.2, 0.4, 4.3), (4.8, 4.0, 1.45), "leather", rot=R.rot_z(0.18))
        R.box(c, head + v3(1.6, 0.2, 3.3), (3.2, 3.6, 0.55), "dark", rot=R.rot_z(0.18))
        return
    if kind == "hood":
        add_eyes(c, head)
        R.ellipsoid(c, head + v3(3.4, 0, 0.5), (1.2, 4.6, 1.25), "dark")
        # A wrapped hood, wider than a helmet, with scraps past the shoulders.
        R.ellipsoid(
            c, head + v3(-0.6, 0, 1.2), (8.2, 8.4, 7.2), "cane",
            keep=lambda p, z0=head[2]: p[:, 2] >= z0 - 2.2,
        )
        for s, dx in ((1, 0.6), (-1, -0.4)):
            R.capsule(c, head + v3(-2.0, s * 6.2, -1.5), head + v3(-3.2, s * 8.4, -10.5), 1.7, 1.0, "cane")
            R.capsule(c, head + v3(dx, s * 7.2, -2.4), head + v3(dx - 1.2, s * 9.0, -9.5), 1.3, 0.7, "cloth")
        return
    if kind == "phones":
        add_eyes(c, head)
        R.ellipsoid(c, head + v3(0.2, 0, 3.6), (4.6, 4.4, 2.6), "cloth")
        for s in (1, -1):
            R.ellipsoid(c, head + v3(0.4, s * 5.0, 0.2), (1.5, 1.3, 2.0), "dark")
        R.capsule(c, head + v3(2.0, -4.6, -0.4), head + v3(6.2, -2.2, -2.2), 0.45, 0.35, "dark")
        return
    # Stahlhelm.
    add_eyes(c, head)
    R.ellipsoid(
        c, head + v3(0.1, 0, 1.6), (6.15, 6.0, 4.5), "helmet",
        keep=lambda p, z0=head[2]: p[:, 2] >= z0 + 0.4,
    )
    R.ellipsoid(c, head + v3(0.6, 0, -0.2), (6.7, 6.9, 1.35), "helmet")
    if kind == "medic":
        R.ellipsoid(c, head + v3(0.4, 0, 0.15), (6.9, 7.1, 0.7), "white")


def add_torso(c: R.Cloud, hip, lean: float, cloth: str, bulk: float = 1.0) -> None:
    chest = lean_pt(hip, (1.4, 0, 11.5), lean)
    R.ellipsoid(c, chest, (6.0 * bulk, 7.4 * bulk, 8.0), cloth)
    # Belt and a shoulder strap, so the torso is not one egg.
    waist = lean_pt(hip, (0.8, 0, 5.2), lean)
    R.ellipsoid(c, waist, (5.4 * bulk, 6.6 * bulk, 1.7), "dark")
    R.capsule(c, lean_pt(hip, (3.5, 5.5, 15.5), lean), lean_pt(hip, (2.2, -4.5, 4.5), lean), 0.7, mat="leather")


def add_blobs(c: R.Cloud, hip, lean: float) -> None:
    """Sniper camo: big patches, not noise. They have to survive the map scale."""
    spots = [
        ((2.5, 3.5, 13.0), (3.2, 2.4, 2.6), "cane"),
        ((1.0, -4.0, 12.0), (2.6, 2.8, 3.0), "cloth"),
        ((3.0, 1.0, 8.5), (2.4, 3.0, 2.2), "leather"),
        ((-1.0, -2.0, 15.5), (2.2, 2.2, 2.4), "dark"),
        ((2.0, 5.5, 9.5), (2.0, 2.2, 2.6), "cane"),
    ]
    for local, rad, mat in spots:
        R.ellipsoid(c, lean_pt(hip, local, lean), rad, mat)


# ---------------------------------------------------------------- weapons


def _along(a, b, t: float) -> np.ndarray:
    a, b = np.asarray(a, float), np.asarray(b, float)
    return a + (b - a) * t


def add_rifle(c: R.Cloud, stock, muzzle, scope: bool = False, heavy: bool = False) -> np.ndarray:
    stock, muzzle = np.asarray(stock, float), np.asarray(muzzle, float)
    d = muzzle - stock
    n = float(np.linalg.norm(d))
    direction = d / max(n, 1e-6)
    wood_end = stock + direction * n * (0.46 if not heavy else 0.34)
    R.capsule(c, stock, wood_end, 1.7 if not heavy else 2.3, 1.25, "wood")
    R.capsule(c, wood_end - direction * 1.2, muzzle, 0.95 if not heavy else 1.45, 0.7 if not heavy else 1.05, "dark")
    R.ellipsoid(c, _along(stock, muzzle, 0.42), (1.5, 1.2, 1.6), "dark")
    if scope:
        top = v3(0, 0, 2.4)
        R.capsule(c, _along(stock, muzzle, 0.42) + top, _along(stock, muzzle, 0.74) + top, 1.15, mat="dark")
        R.ellipsoid(c, _along(stock, muzzle, 0.74) + top, (0.9, 1.35, 1.35), "glass")
    if heavy:
        # Muzzle brake and a thick breech. The length is the read.
        R.cylinder(c, muzzle - direction * 2.2, muzzle + direction * 0.4, 1.7, "dark")
        R.box(c, _along(stock, muzzle, 0.30), (2.2, 1.8, 1.8), "dark")
    return muzzle


def add_mg(c: R.Cloud, stock, muzzle, planted: bool) -> np.ndarray:
    stock, muzzle = np.asarray(stock, float), np.asarray(muzzle, float)
    d = muzzle - stock
    n = float(np.linalg.norm(d))
    direction = d / max(n, 1e-6)
    R.capsule(c, stock, _along(stock, muzzle, 0.28), 2.2, 1.8, "wood")
    R.box(c, _along(stock, muzzle, 0.34), (2.6, 2.2, 2.3), "dark")
    R.capsule(c, _along(stock, muzzle, 0.32), muzzle, 1.35, 1.05, "dark")
    # Side magazine, the lump that separates him from a rifleman.
    R.box(c, _along(stock, muzzle, 0.38) + v3(0, 3.2, -0.4), (1.6, 2.4, 2.6), "dark")
    R.capsule(c, _along(stock, muzzle, 0.22) + v3(0, 2.4, 1.2), _along(stock, muzzle, 0.55) + v3(0, 3.4, 0.2), 0.7, mat="brass")
    # Bipod: down into the dirt when he fires, folded along the barrel while he crawls.
    fork = _along(stock, muzzle, 0.78)
    if planted:
        for s in (1, -1):
            R.capsule(c, fork, fork + v3(1.5, s * 3.2, -fork[2] + 0.6), 0.45, 0.35, "dark")
    else:
        R.capsule(c, fork, fork + direction * 4.0 + v3(0, 0, 1.6), 0.4, mat="dark")
    return muzzle


def add_tube(c: R.Cloud, back, front, radius: float = 2.35) -> np.ndarray:
    back, front = np.asarray(back, float), np.asarray(front, float)
    R.cylinder(c, back, front, radius, "metal")
    d = front - back
    d = d / max(float(np.linalg.norm(d)), 1e-6)
    R.cylinder(c, front - d * 1.4, front + d * 0.3, radius + 0.55, "dark")
    R.cylinder(c, back, back + d * 1.6, radius + 0.4, "dark")
    return front


def add_lance(c: R.Cloud, stock, muzzle) -> np.ndarray:
    stock, muzzle = np.asarray(stock, float), np.asarray(muzzle, float)
    d = muzzle - stock
    n = float(np.linalg.norm(d))
    direction = d / max(n, 1e-6)
    R.capsule(c, stock, stock + direction * 3.2, 1.5, 1.2, "wood")
    R.capsule(c, stock + direction * 2.4, muzzle - direction * 2.2, 0.7, 0.55, "dark")
    R.cylinder(c, muzzle - direction * 2.4, muzzle, 1.45, "brass")
    return muzzle


def add_mortar(c: R.Cloud, base, mouth) -> np.ndarray:
    base, mouth = np.asarray(base, float), np.asarray(mouth, float)
    R.cylinder(c, base, mouth, 2.15, "dark")
    R.cylinder(c, _along(base, mouth, 0.55), _along(base, mouth, 0.7), 2.55, "brass")
    R.box(c, base + v3(0, 0, 0.4), (3.2, 3.2, 0.6), "metal")
    return mouth


def add_pistol(c: R.Cloud, hand) -> np.ndarray:
    hand = np.asarray(hand, float)
    muzzle = hand + v3(6.5, -0.4, 0.6)
    R.box(c, hand + v3(1.2, -0.2, -0.2), (1.5, 0.7, 1.5), "dark")
    R.capsule(c, hand + v3(1.5, 0, 0.6), muzzle, 0.7, 0.55, "dark")
    return muzzle


def add_wrench(c: R.Cloud, hand, angle: float) -> None:
    hand = np.asarray(hand, float)
    d = v3(math.cos(angle), -0.25, math.sin(angle))
    tip = hand + d * 7.5
    R.capsule(c, hand, tip, 0.55, 0.45, "metal")
    jaw = v3(-d[2], 0, d[0])
    R.capsule(c, tip, tip + jaw * 2.2, 0.55, mat="metal")
    R.capsule(c, tip, tip - jaw * 2.2, 0.55, mat="metal")


def add_hammer(c: R.Cloud, hand, angle: float) -> None:
    hand = np.asarray(hand, float)
    d = v3(math.cos(angle), -0.2, math.sin(angle))
    tip = hand + d * 8.5
    R.capsule(c, hand, tip, 0.55, 0.45, "wood")
    R.box(c, tip, (1.1, 2.4, 1.5), "dark")


def add_flash(c: R.Cloud, tip, direction, scale: float) -> None:
    """Short burst. A long barrel already sits near the cell edge."""
    tip = np.asarray(tip, float)
    direction = np.asarray(direction, float)
    direction = direction / max(float(np.linalg.norm(direction)), 1e-6)
    R.ellipsoid(c, tip + direction * 1.5 * scale, (1.7 * scale, 1.15 * scale, 1.15 * scale), "flash")
    R.ellipsoid(c, tip + direction * 0.6 * scale, (1.05 * scale, 1.2 * scale, 1.2 * scale), "flash_core")


def grip_pair(stock, muzzle) -> tuple[np.ndarray, np.ndarray]:
    return _along(stock, muzzle, 0.30), _along(stock, muzzle, 0.56)


# ---------------------------------------------------------------- packs


def add_pack(c: R.Cloud, hip, kind: str, lean: float) -> None:
    if kind == "bread":
        R.box(c, lean_pt(hip, (-4.5, 0.4, 10.5), lean), (2.2, 4.2, 4.6), "leather")
        R.box(c, lean_pt(hip, (-3.6, 4.6, 6.5), lean), (1.6, 2.2, 2.4), "khaki")
        # Shovel on the pack: handle and a blade.
        R.capsule(c, lean_pt(hip, (-5.5, -2.5, 6.0), lean), lean_pt(hip, (-6.2, -3.2, 16.5), lean), 0.45, mat="wood")
        R.box(c, lean_pt(hip, (-6.4, -3.4, 17.6), lean), (0.4, 1.8, 2.2), "metal")
    elif kind == "ammo":
        R.box(c, lean_pt(hip, (-4.2, -3.6, 9.5), lean), (2.4, 3.2, 3.4), "dark")
        R.box(c, lean_pt(hip, (-3.8, 4.2, 8.0), lean), (1.8, 2.4, 2.6), "leather")
        R.capsule(c, lean_pt(hip, (2.0, 5.5, 10.0), lean), lean_pt(hip, (3.5, -2.0, 12.5), lean), 0.65, mat="brass")
    elif kind == "tanks":
        for s in (1, -1):
            R.cylinder(
                c,
                lean_pt(hip, (-6.2, s * 3.2, 6.5), lean),
                lean_pt(hip, (-6.6, s * 3.2, 18.5), lean),
                2.5,
                "metal",
            )
            R.cylinder(
                c,
                lean_pt(hip, (-6.2, s * 3.2, 11.5), lean),
                lean_pt(hip, (-6.6, s * 3.2, 13.2), lean),
                2.75,
                "rust",
            )
    elif kind == "tube":
        # Carried mortar, upright on the back. The planted tube is a weapon.
        R.cylinder(c, lean_pt(hip, (-5.5, 0.2, 8.0), lean), lean_pt(hip, (-6.2, 0.6, 26.0), lean), 2.15, "dark")
        R.box(c, lean_pt(hip, (-5.2, 0.2, 7.2), lean), (1.2, 3.4, 3.4), "metal")
    elif kind == "rocket":
        R.cylinder(c, lean_pt(hip, (-5.8, 1.5, 8.0), lean), lean_pt(hip, (-6.4, 1.8, 22.0), lean), 1.7, "metal")
        R.ellipsoid(c, lean_pt(hip, (-6.6, 1.9, 23.2), lean), (1.5, 1.7, 2.2), "khaki")
        R.box(c, lean_pt(hip, (-4.4, -4.0, 9.0), lean), (1.8, 2.6, 2.8), "leather")
    elif kind == "medic":
        R.box(c, lean_pt(hip, (1.5, 6.4, 7.5), lean), (2.2, 1.6, 3.6), "white")
        R.box(c, lean_pt(hip, (1.6, 7.6, 8.6), lean), (1.6, 0.45, 2.2), "white")
        R.box(c, lean_pt(hip, (-4.6, -0.4, 10.0), lean), (2.0, 3.6, 4.0), "khaki")
    elif kind == "radio":
        R.box(c, lean_pt(hip, (-4.8, 0.2, 11.0), lean), (2.2, 3.8, 4.4), "dark")
        R.capsule(c, lean_pt(hip, (-5.4, 0.2, 15.2), lean), lean_pt(hip, (-6.0, 0.4, 28.5), lean), 0.45, mat="metal")
        R.ellipsoid(c, lean_pt(hip, (-6.0, 0.4, 29.2), lean), (1.1, 1.1, 1.1), "brass")
        R.box(c, lean_pt(hip, (4.2, 0.4, 10.5), lean), (1.3, 3.4, 2.6), "metal")
        R.box(c, lean_pt(hip, (5.2, 0.4, 10.6), lean), (0.35, 2.2, 1.5), "glass")
    elif kind == "jet":
        for s in (1, -1):
            R.cylinder(
                c,
                lean_pt(hip, (-5.6, s * 2.8, 7.0), lean),
                lean_pt(hip, (-6.2, s * 2.8, 17.5), lean),
                2.15,
                "metal",
            )
            R.cylinder(
                c,
                lean_pt(hip, (-5.6, s * 2.8, 5.4), lean),
                lean_pt(hip, (-5.8, s * 2.8, 7.2), lean),
                1.5,
                "dark",
            )
        R.box(c, lean_pt(hip, (-4.6, 0, 12.0), lean), (1.6, 5.4, 2.2), "dark")
    elif kind == "tools":
        R.box(c, lean_pt(hip, (-4.2, 0.2, 8.5), lean), (2.0, 4.4, 2.6), "leather")
        R.capsule(c, lean_pt(hip, (-4.8, -3.6, 6.5), lean), lean_pt(hip, (-5.2, -3.8, 13.5), lean), 0.45, mat="metal")
        R.box(c, lean_pt(hip, (2.4, 6.2, 6.4), lean), (1.4, 1.8, 1.8), "khaki")


def add_plumes(c: R.Cloud, hip, scale: float) -> None:
    for s in (1, -1):
        base = hip + v3(-5.6, s * 2.8, 5.2)
        R.ellipsoid(c, base + v3(0, 0, -2.2 * scale), (1.1, 1.1, 2.4 * scale), "flash_core")
        R.ellipsoid(c, base + v3(0, 0, -4.6 * scale), (1.6, 1.6, 2.8 * scale), "plume")


# ---------------------------------------------------------------- poses


@dataclass
class Role:
    id: str
    cloth: str = "olive"
    head: str = "helm"  # helm, medic, cap, hood, mask, phones, visor
    weapon: str = "rifle"  # rifle, mg, sniper, atr, tube, lance, mortar, pistol, none
    pack: str = "bread"
    bulk: float = 1.0
    glove: str = "skin"
    fire_from: str = "stand"  # stand, crouch, crawl
    files: dict = field(default_factory=dict)


def arm_mats(role: Role) -> tuple[str, str]:
    sleeve = "white" if role.id == "medic" else role.cloth
    # The medic's left arm is the white one; the right stays tunic-coloured.
    return sleeve, role.glove


def weapon_line(role: Role, hip, lean: float, pose: str) -> tuple[np.ndarray, np.ndarray] | None:
    """Stock and muzzle in body space. None when the hands are empty."""
    if role.weapon in ("pistol", "none"):
        return None
    if pose == "crawl":
        z = 4.4
        if role.weapon == "mg":
            return v3(2.0, -2.4, z + 0.6), v3(26.0, -1.2, z + 1.4)
        if role.weapon == "atr":
            return v3(-4.0, -1.6, z), v3(30.0, -0.4, z + 1.6)
        if role.weapon == "tube":
            return v3(-1.0, -2.0, z + 2.0), v3(16.0, -1.0, z + 3.4)
        if role.weapon == "lance":
            return v3(2.0, -1.6, z + 0.4), v3(22.0, -0.6, z + 1.2)
        if role.weapon == "mortar":
            return v3(-6.0, 1.2, z + 1.0), v3(12.0, 0.4, z + 2.2)
        if role.weapon == "sniper":
            return v3(-2.0, -1.4, z + 0.6), v3(28.0, -0.3, z + 1.8)
        length = 20.0 if role.id == "jumpjet" else 23.0
        return v3(1.0, -1.5, z), v3(length, -0.4, z + 1.2)
    # Low enough that a south-facing barrel clears the chest and points at the camera.
    z0 = 9.0 if pose == "stand" else 8.2
    reach = 22.0
    if role.weapon == "mg":
        reach = 25.0
    elif role.weapon == "atr":
        # Longer than the rifle, short of the east cell edge once the brake is on.
        reach = 28.0
    elif role.weapon == "sniper":
        reach = 27.0
    elif role.weapon == "tube":
        stock = lean_pt(hip, (-2.5, -5.5, 18.5), lean)
        muzzle = lean_pt(hip, (15.5, -3.6, 22.0), lean)
        return stock, muzzle
    elif role.weapon == "lance":
        stock = lean_pt(hip, (3.5, -2.2, 12.5), lean)
        muzzle = lean_pt(hip, (23.0, -0.6, 14.6), lean)
        return stock, muzzle
    elif role.weapon == "mortar" and pose == "crouch":
        # Planted in front of the kneel. Mouth high, so the bomb leaves upward.
        return v3(7.5, 0.4, 1.2), v3(12.5, 0.2, 24.0)
    elif role.weapon == "mortar":
        # On his feet the tube is the pack, not a second gun in his hands.
        return None
    elif role.id == "jumpjet":
        reach = 18.0
    stock = lean_pt(hip, (4.0, -2.4, z0), lean)
    muzzle = lean_pt(hip, (3.2 + reach, -0.6, z0 + 2.4), lean)
    return stock, muzzle


def place_weapon(c: R.Cloud, role: Role, stock, muzzle, planted: bool = False) -> np.ndarray:
    if role.weapon == "mg":
        return add_mg(c, stock, muzzle, planted)
    if role.weapon == "tube":
        return add_tube(c, stock, muzzle, 2.45)
    if role.weapon == "lance":
        return add_lance(c, stock, muzzle)
    if role.weapon == "mortar":
        return add_mortar(c, stock, muzzle)
    if role.weapon == "sniper":
        return add_rifle(c, stock, muzzle, scope=True)
    if role.weapon == "atr":
        return add_rifle(c, stock, muzzle, heavy=True)
    return add_rifle(c, stock, muzzle)


def free_hand(shoulder, phase: float, side: float, hang: float) -> np.ndarray:
    x, z = foot_xz(phase + 0.5, 7.2, 2.8)
    return np.asarray(shoulder, float) + v3(x * 0.9, side * 1.4, -hang + z * 0.25)


def flesh_upright(role: Role, pose: str, phase: float, tool: str | None = None, tool_angle: float = 0.8) -> tuple[R.Cloud, np.ndarray | None]:
    """Stand or crouch. `phase` is the gait. A tool replaces the weapon."""
    c = R.Cloud()
    stand = pose == "stand"
    base = STAND_HIP if stand else CROUCH_HIP
    stride = STRIDE if stand else CROUCH_STRIDE
    lift = LIFT if stand else CROUCH_LIFT
    lean = 0.14 if stand else 0.42
    if role.weapon == "mortar" and pose == "crouch":
        # Knee-shuffle around a planted tube. One foot stays back.
        stride, lift, lean = 3.2, 2.2, 0.48
    hip_z = base + (hop_of(phase) if tool is None else 0.0)
    hip = v3(0.0, 0.0, hip_z)
    for s, off in ((1.0, 0.0), (-1.0, 0.5)):
        fx, fz = foot_xz(phase + off, stride, lift)
        if role.weapon == "mortar" and pose == "crouch" and s < 0:
            fx, fz = -2.0, 0.0
        ankle = v3(fx, s * HIP_Y, ANKLE + fz)
        add_leg(c, hip + v3(0, s * HIP_Y * 0.92, 0), ankle, role.cloth)
    add_torso(c, hip, lean, role.cloth, role.bulk)
    if role.head == "hood":
        add_blobs(c, hip, lean)
    head = lean_pt(hip, (1.0, 0.0, 23.6), lean)
    add_head(c, head, role.head, role.cloth)
    pack = role.pack
    if role.weapon == "mortar":
        pack = "bread" if pose == "crouch" else "tube"
    add_pack(c, hip, pack, lean)
    sh_l = lean_pt(hip, (0.4, 7.8, 16.2), lean)
    sh_r = lean_pt(hip, (0.4, -7.8, 16.2), lean)
    sleeve_l = "white" if role.id == "medic" else role.cloth
    sleeve_r = role.cloth
    tip = None
    if tool == "hammer":
        d = v3(math.cos(tool_angle), -0.15, math.sin(tool_angle))
        hand_r = sh_r + d * 9.5
        add_arm(c, sh_r, hand_r, sleeve_r, role.glove, drop=2.2)
        add_hammer(c, hand_r, tool_angle)
        add_arm(c, sh_l, free_hand(sh_l, 0.15, 1, 11.5), sleeve_l, role.glove)
    elif tool == "wrench":
        d = v3(math.cos(tool_angle) * 0.6 + 0.6, -0.4, math.sin(tool_angle) * 0.5 - 0.4)
        hand_r = sh_r + d * 8.0
        add_arm(c, sh_r, hand_r, sleeve_r, role.glove, drop=2.4)
        add_wrench(c, hand_r, tool_angle)
        add_arm(c, sh_l, sh_l + v3(6.0, 1.5, -6.0), sleeve_l, role.glove)
    elif role.weapon == "pistol" or (role.weapon == "none" and role.id == "engineer"):
        hand_r = sh_r + v3(11.5, -1.2, -2.5)
        add_arm(c, sh_r, hand_r, sleeve_r, role.glove, drop=2.0)
        if role.id == "engineer":
            add_wrench(c, hand_r, 0.15)
        else:
            tip = add_pistol(c, hand_r)
        add_arm(c, sh_l, free_hand(sh_l, phase, 1, 12.0), sleeve_l, role.glove)
    elif role.weapon == "none" or (role.weapon == "mortar" and pose == "stand"):
        # Mortarman on his feet holds the sling. The tube is the pack.
        if role.weapon == "mortar":
            add_arm(c, sh_l, sh_l + v3(2.5, -2.0, -8.0), sleeve_l, role.glove, drop=2.0)
            add_arm(c, sh_r, sh_r + v3(1.5, 3.0, -7.0), sleeve_r, role.glove, drop=2.0)
        else:
            add_arm(c, sh_l, free_hand(sh_l, phase, 1, 12.0), sleeve_l, role.glove)
            add_arm(c, sh_r, free_hand(sh_r, phase + 0.5, -1, 12.0), sleeve_r, role.glove)
    else:
        line = weapon_line(role, hip, lean, pose)
        assert line is not None
        stock, muzzle = line
        planted = role.weapon == "mg" and pose == "crawl"
        tip = place_weapon(c, role, stock, muzzle, planted)
        rear, fore = grip_pair(stock, muzzle)
        # Right hand on the stock, left on the fore-end. Drop is small: the
        # hands are already out in front, and a deep elbow fights the gun.
        add_arm(c, sh_r, rear, sleeve_r, role.glove, drop=2.6)
        add_arm(c, sh_l, fore, sleeve_l, role.glove, drop=2.8)
    if role.weapon == "lance":
        # Hose from the right-hand tank down to the lance grip.
        R.capsule(c, lean_pt(hip, (-6.2, -3.2, 8.0), lean), lean_pt(hip, (6.0, -2.0, 12.0), lean), 0.55, mat="rubber")
    return c, tip


def flesh_crawl(role: Role, phase: float, planted: bool = False) -> tuple[R.Cloud, np.ndarray | None]:
    c = R.Cloud()
    heave = 0.7 * abs(math.sin(2 * math.pi * phase))
    sway = 2.2 * math.sin(2 * math.pi * phase)
    hip = v3(-2.0, sway, 6.2 + heave)
    # Chest along +x, low.
    R.ellipsoid(c, hip + v3(8.5, 0, 1.4), (10.5, 6.6 * role.bulk, 4.3), role.cloth)
    R.ellipsoid(c, hip + v3(2.0, 0, 0.4), (4.6, 6.2, 2.2), "dark")
    if role.head == "hood":
        for local, rad, mat in (
            ((10, 3.2, 3.4), (2.6, 2.2, 1.6), "cane"),
            ((8, -3.4, 3.6), (2.4, 2.4, 1.5), "cloth"),
            ((12, 0.5, 4.2), (2.2, 2.0, 1.4), "leather"),
        ):
            R.ellipsoid(c, hip + v3(*local), rad, mat)
    head = hip + v3(18.5, 0.2, 4.6)
    add_head(c, head, role.head, role.cloth)
    # Pack stays on the back, flattened by the pose (call with no lean).
    pack = "bread" if role.weapon == "mortar" else role.pack
    add_pack(c, hip + v3(2.0, 0, -1.0), pack, 0.0)
    # Knees drive the crawl. Opposite phase, feet trail behind.
    for s, off in ((1.0, 0.0), (-1.0, 0.5)):
        p = (phase + off) % 1.0
        kx = -1.5 + 9.0 * math.cos(2 * math.pi * p)
        kz = 3.6 + 3.2 * max(0.0, math.sin(2 * math.pi * p))
        knee = v3(kx, s * 5.2, kz)
        ankle = v3(kx - 7.2, s * 4.6, 2.4 + 1.6 * max(0.0, -math.sin(2 * math.pi * p)))
        R.capsule(c, hip + v3(0, s * 3.4, 0.4), knee, 2.4, 2.0, role.cloth)
        R.capsule(c, knee, ankle, 1.9, 1.5, "dark")
        add_boot(c, ankle)
    sleeve_l = "white" if role.id == "medic" else role.cloth
    sh_l = hip + v3(12.5, 6.2, 3.6)
    sh_r = hip + v3(12.5, -6.2, 3.6)
    tip = None
    armed = role.weapon not in ("none", "pistol")
    if not armed:
        for shoulder, side, off in ((sh_l, 1.0, 0.0), (sh_r, -1.0, 0.5)):
            p = (phase + off) % 1.0
            reach = 9.0 * math.cos(2 * math.pi * p)
            lift = 2.2 * max(0.0, math.sin(2 * math.pi * p))
            hand = shoulder + v3(8.0 + reach, side * 1.2, -2.2 + lift)
            sleeve = sleeve_l if side > 0 else role.cloth
            add_arm(c, shoulder, hand, sleeve, role.glove, drop=1.4)
        if role.id == "engineer":
            add_wrench(c, sh_r + v3(8.0, -1.2, -1.5), 0.2)
    else:
        line = weapon_line(role, hip, 0.0, "crawl")
        assert line is not None
        stock, muzzle = line
        stock = stock + v3(0, 0, heave)
        muzzle = muzzle + v3(0, 0, heave)
        tip = place_weapon(c, role, stock, muzzle, planted=planted and role.weapon == "mg")
        rear, fore = grip_pair(stock, muzzle)
        add_arm(c, sh_r, rear, role.cloth, role.glove, drop=1.2)
        # The free arm reaches, then comes back to the foregrip area.
        p = (phase + 0.5) % 1.0
        reach = 8.0 * math.cos(2 * math.pi * p)
        hand_l = fore + v3(reach * 0.35, 1.5, 0.8 * max(0.0, math.sin(2 * math.pi * p)))
        add_arm(c, sh_l, hand_l, sleeve_l, role.glove, drop=1.2)
    if role.weapon == "lance":
        R.capsule(c, hip + v3(-4.0, -3.2, 6.0), v3(6.0, -2.0, 5.0 + heave), 0.5, mat="rubber")
    return c, tip


def flesh_death(role: Role, frame: int) -> R.Cloud:
    """Four-frame collapse. The last frame is the one the corpse holds."""
    t = frame / 3
    c = R.Cloud()
    lean = 0.35 + 1.15 * t
    hip = v3(0.0, 0.0, 28.0 * (1 - t) + 4.6 * t)
    # Legs fold under, then stick out behind on the ground.
    for s, off in ((1.0, 0.0), (-1.0, 0.4)):
        fx = -3.0 - 8.0 * t + off
        ankle = v3(fx, s * HIP_Y, ANKLE * (1 - t) + 1.4 * t)
        add_leg(c, hip + v3(-1.5 * t, s * HIP_Y * 0.8, 0), ankle, role.cloth)
    add_torso(c, hip, lean, role.cloth, role.bulk)
    if role.head == "hood":
        add_blobs(c, hip, lean)
    add_head(c, lean_pt(hip, (0.8, 0.4 * (1 - t), 23.0), lean), role.head, role.cloth)
    add_pack(c, hip, "tube" if role.weapon == "mortar" else role.pack, lean)
    sh_l = lean_pt(hip, (0.2, 7.6, 15.5), lean)
    sh_r = lean_pt(hip, (0.2, -7.6, 15.5), lean)
    sleeve_l = "white" if role.id == "medic" else role.cloth
    if t < 0.45 and role.weapon == "mortar":
        # The tube stays on his back until he hits the ground.
        add_arm(c, sh_l, sh_l + v3(2.0, -1.5, -6.0), sleeve_l, role.glove, drop=1.6)
        add_arm(c, sh_r, sh_r + v3(1.2, 2.4, -5.5), role.cloth, role.glove, drop=1.6)
    elif t < 0.45 and role.weapon not in ("none", "pistol"):
        line = weapon_line(role, hip, lean, "stand")
        if line:
            stock, muzzle = line
            place_weapon(c, role, stock, muzzle, False)
            rear, fore = grip_pair(stock, muzzle)
            add_arm(c, sh_r, rear, role.cloth, role.glove, drop=2.2)
            add_arm(c, sh_l, fore, sleeve_l, role.glove, drop=2.2)
    else:
        # Weapon dropped beside him, not past his head, so the south row stays in the cell.
        add_arm(c, sh_l, sh_l + v3(5.0 * t + 1.5, 2.2, -4), sleeve_l, role.glove, drop=1.5)
        add_arm(c, sh_r, sh_r + v3(4.0 * t + 1.5, -2.6, -3), role.cloth, role.glove, drop=1.5)
        if role.weapon not in ("none", "pistol"):
            drop_s = v3(1.5, -11.0, 1.6)
            drop_m = drop_s + v3(11.0, -1.2, 0.3)
            if role.weapon == "tube":
                add_tube(c, drop_s, drop_m, 2.1)
            elif role.weapon == "lance":
                add_lance(c, drop_s, drop_m)
            elif role.weapon == "mortar":
                add_mortar(c, drop_s, drop_s + v3(9.0, -0.8, 0.3))
            elif role.weapon == "mg":
                add_mg(c, drop_s, drop_m, False)
            elif role.weapon == "sniper":
                add_rifle(c, drop_s, drop_m + v3(3, 0, 0), scope=True)
            elif role.weapon == "atr":
                add_rifle(c, drop_s, drop_m + v3(4, 0, 0), heavy=True)
            else:
                add_rifle(c, drop_s, drop_m)
        elif role.id == "engineer":
            add_wrench(c, v3(3.0, -10.0, 1.5), 0.4)
    # Nothing sinks through the ground. A buried sample projects off the south edge.
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
    # py must stay below cell-2. contact 0.82 leaves about 15px under the anchor.
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
    # Build at stand height, then drop the belt to z = 0.
    hip = v3(0.0, 0.0, STAND_HIP - WATER_Z + bob_of(frame) / (STAND_SCALE * R.COS_P))
    lean = 0.1
    add_torso(c, hip, lean, role.cloth, role.bulk)
    if role.head == "hood":
        add_blobs(c, hip, lean)
    add_head(c, lean_pt(hip, (1.0, 0, 23.6), lean), role.head, role.cloth)
    add_pack(c, hip, "tube" if role.weapon == "mortar" else role.pack, lean)
    sh_l = lean_pt(hip, (0.4, 7.8, 16.2), lean)
    sh_r = lean_pt(hip, (0.4, -7.8, 16.2), lean)
    sleeve_l = "white" if role.id == "medic" else role.cloth
    # Keep the paddle above the water plane.
    for shoulder, side, sleeve, off in ((sh_l, 1.0, sleeve_l, 0.0), (sh_r, -1.0, role.cloth, 0.5)):
        ang = 2 * math.pi * (phase + off)
        hand = shoulder + v3(7.5 * math.sin(ang), side * 2.2, -1.5 + 3.2 * math.cos(ang))
        hand = hand.copy()
        hand[2] = max(float(hand[2]), 3.5)
        add_arm(c, shoulder, hand, sleeve, role.glove, drop=1.6)
    if role.weapon == "lance":
        R.capsule(c, hip + v3(-4, -3, 4), hip + v3(8, -2, 6), 0.5, mat="rubber")
    return c


def flesh_fly(role: Role, frame: int) -> R.Cloud:
    """Hanging under the pack. The plumes are the only thing that changes."""
    c = R.Cloud()
    hip = v3(0.0, 0.0, 24.0)
    lean = 0.18
    # Knees up, boots clear of the nozzles.
    for s in (1.0, -1.0):
        knee = hip + v3(6.5, s * HIP_Y, -6.0)
        ankle = hip + v3(2.0, s * HIP_Y, -2.5)
        R.capsule(c, hip + v3(0, s * 3.6, 0), knee, 2.6, 2.15, role.cloth)
        R.capsule(c, knee, ankle, 2.0, 1.6, "dark")
        add_boot(c, ankle)
    add_torso(c, hip, lean, role.cloth, role.bulk)
    add_head(c, lean_pt(hip, (1.0, 0, 23.6), lean), role.head, role.cloth)
    add_pack(c, hip, "jet", lean)
    scales = (1.15, 0.62, 1.0, 0.45)
    add_plumes(c, hip, scales[frame])
    sh_l = lean_pt(hip, (0.4, 7.8, 16.2), lean)
    sh_r = lean_pt(hip, (0.4, -7.8, 16.2), lean)
    line = weapon_line(role, hip, lean, "stand")
    assert line is not None
    stock, muzzle = line
    place_weapon(c, role, stock, muzzle, False)
    rear, fore = grip_pair(stock, muzzle)
    add_arm(c, sh_r, rear, role.cloth, role.glove, drop=2.4)
    add_arm(c, sh_l, fore, role.cloth, role.glove, drop=2.4)
    return c


def flesh_fire(role: Role, frame: int) -> R.Cloud:
    scales = (1.1, 0.55, 0.95, 0.75)
    if role.fire_from == "crawl":
        c, tip = flesh_crawl(role, 0.0, planted=True)
        line = weapon_line(role, v3(-2, 0, 6.2), 0.0, "crawl")
    elif role.fire_from == "crouch":
        c, tip = flesh_upright(role, "crouch", 0.0)
        line = weapon_line(role, v3(0, 0, CROUCH_HIP), 0.48, "crouch")
    else:
        c, tip = flesh_upright(role, "stand", 0.0)
        line = weapon_line(role, v3(0, 0, STAND_HIP), 0.14, "stand")
    if tip is not None and line is not None:
        direction = np.asarray(line[1], float) - np.asarray(line[0], float)
        add_flash(c, tip, direction, scales[frame])
        if role.weapon == "tube":
            # Backblast behind the shoulder tube.
            back = np.asarray(line[0], float)
            add_flash(c, back, -direction, scales[frame] * 0.85)
    return c


def build_cloud(role: Role, sheet: str, frame: int) -> tuple[R.Cloud, np.ndarray | None]:
    if sheet == "walk":
        return flesh_upright(role, "stand", frame / 8)
    if sheet == "crouch":
        return flesh_upright(role, "crouch", frame / 8)
    if sheet == "crawl":
        return flesh_crawl(role, frame / 8)
    if sheet == "handgun":
        pistol = Role(role.id, role.cloth, role.head, "pistol", role.pack, role.bulk, role.glove)
        return flesh_upright(pistol, "stand", frame / 8)
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
        return flesh_upright(role, "crouch", 0.0, tool="hammer", tool_angle=angles[frame])
    if sheet == "fix":
        angles = (0.2, 1.15, 2.1, 2.9)
        return flesh_upright(role, "crouch", 0.05, tool="wrench", tool_angle=angles[frame])
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


ROLES: list[Role] = [
    Role("rifleman", pack="bread", files=role_files(
        "trooper", fire="trooper-rifle-fire.png", handgun="trooper-handgun.png", swim="infantry-swim.png",
    )),
    Role("gunner", weapon="mg", pack="ammo", bulk=1.08, fire_from="crawl", files=role_files("gunner", fire="gunner-fire.png")),
    Role("sniper", cloth="cane", head="hood", weapon="sniper", pack="bread", files=role_files("sniper", fire="sniper-fire.png")),
    Role("atinfantry", weapon="atr", pack="ammo", files=role_files("atinfantry", fire="atinfantry-fire.png")),
    Role("rocketer", weapon="tube", pack="rocket", files=role_files("rocketer", fire="rocketer-fire.png")),
    Role("pyro", cloth="rubber", head="mask", weapon="lance", pack="tanks", glove="rubber", bulk=1.06,
         files=role_files("pyro", fire="pyro-fire.png")),
    Role("mortarman", weapon="mortar", pack="tube", fire_from="crouch", files=role_files("mortarman", fire="mortarman-fire.png")),
    Role("medic", cloth="khaki", head="medic", weapon="none", pack="medic", files=role_files("medic")),
    Role("engineer", cloth="khaki", head="cap", weapon="none", pack="tools", files=role_files(
        "engineer", build="engineer-build.png", fix="engineer-fix.png",
    )),
    Role("droneop", head="phones", weapon="none", pack="radio", files=role_files("droneop")),
    Role("jumpjet", head="visor", weapon="rifle", pack="jet", files=role_files(
        "jumpjet", fire="jumpjet-fire.png", fly="jumpjet-fly.png",
    )),
]


def sheets_of(role: Role) -> list[str]:
    names = ["walk", "crouch", "crawl", "die", "swim"]
    if "fire" in role.files:
        names.append("fire")
    if "handgun" in role.files:
        names.append("handgun")
    if "build" in role.files:
        names.append("build")
    if "fix" in role.files:
        names.append("fix")
    if "fly" in role.files:
        names.append("fly")
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
