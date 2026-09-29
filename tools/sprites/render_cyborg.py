#!/usr/bin/env python3
"""
Cyborg unit sheets — a primitive-built 3D miniature under one locked camera.

No Blender and no image model: the cyborg is a set of capsules, ellipsoids,
boxes, and cylinders in body space (+x forward, +y left, +z up, feet on z=0).
Each pose is splatted as dense surface points, z-buffered, shaded in three flat
tones, and outlined in #1a1410. The camera never moves; the miniature yaws.

Every row is a unique render (no mirroring): row 0 = south (screen down), then
clockwise 22.5° through row 15 (SSE). The ground contact is pinned to
(cell / 2, contactY · cell) on every facing and frame, with one model scale per
sheet, so nothing pops between rows or frames.

  python tools/sprites/render_cyborg.py            # every sheet + cameo + previews

Writes gridlock/packages/client/src/assets/units/cyborg-*.png, the east lock
at tools/sprites/src/cyborg-east.png, and previews/manifests in
tools/sprites/preview/.
"""

from __future__ import annotations

import json
import math
import sys
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.dont_write_bytecode = True  # the compositor's .pyc is tracked; do not rewrite it
from compose_unit_sheet import (  # noqa: E402
    ENGINE_ORDER,
    compose_sheet,
    diagnostics,
    opaque_bbox,
    preview_strip,
    preview_turntable,
)

ROOT = HERE.parent.parent
UNITS = ROOT / "gridlock/packages/client/src/assets/units"
SRC = HERE / "src"
PREVIEW = HERE / "preview"

CELL = 96
# Camera elevation. Matches the Rifleman / Gunner high three-quarter lock.
PITCH = math.radians(33)
SIN_P, COS_P = math.sin(PITCH), math.cos(PITCH)
# Light from the upper left, toward the viewer. Camera space: X right, Y toward viewer, Z up.
LIGHT = np.array([-0.55, 0.55, 0.75])
LIGHT = LIGHT / np.linalg.norm(LIGHT)
SPACING = 0.32  # surface sample step, in output pixels
OUTLINE = (26, 20, 16)  # #1a1410

# Standing model scale (body units → pixels). The prone sheets use the brief's
# larger prone draw size, so they render smaller in the cell by 22/28 and read
# the same size on the map.
STAND_SCALE = 1.2
PRONE_SCALE = STAND_SCALE * 22 / 28

# name: (shadow, mid, highlight), or a single colour for emissive.
MATERIALS: dict[str, tuple] = {
    "metal": ((74, 74, 70), (110, 110, 104), (146, 146, 138)),  # team-tint chassis gray
    "dark": ((34, 34, 32), (56, 56, 53), (84, 84, 79)),  # gun, pistons, joints
    "helmet": ((52, 55, 56), (74, 78, 80), (100, 105, 106)),
    "olive": ((61, 74, 40), (90, 107, 61), (116, 132, 82)),
    "skin": ((140, 96, 70), (190, 140, 104), (216, 168, 128)),
    "leather": ((62, 42, 30), (92, 64, 48), (118, 86, 64)),
    "brass": ((125, 97, 40), (176, 138, 58), (212, 160, 23)),
    "rust": ((100, 40, 30), (139, 58, 42), (168, 82, 60)),
    "eye": (235, 64, 40),
    "spark": (255, 196, 64),
    "flash_core": (255, 244, 190),
    "flash": (255, 176, 40),
    "pupil": (26, 20, 16),
}
EMISSIVE = {"eye", "spark", "flash_core", "flash", "pupil"}
MAT_IDS = {name: i for i, name in enumerate(MATERIALS)}


# ---------------------------------------------------------------- primitives


@dataclass
class Cloud:
    pts: list[np.ndarray] = field(default_factory=list)
    nrm: list[np.ndarray] = field(default_factory=list)
    mat: list[np.ndarray] = field(default_factory=list)
    part: list[np.ndarray] = field(default_factory=list)
    _next_part: int = 0

    def add(self, p: np.ndarray, n: np.ndarray, mat, keep=None) -> None:
        p = np.asarray(p, float)
        n = np.asarray(n, float)
        if keep is not None:
            m = keep(p)
            p, n = p[m], n[m]
        if len(p) == 0:
            return
        if callable(mat):
            names = mat(p)
        else:
            names = np.full(len(p), mat, dtype=object)
        ids = np.array([MAT_IDS[str(x)] for x in names], dtype=np.int16)
        nl = np.linalg.norm(n, axis=1, keepdims=True)
        self.pts.append(p)
        self.nrm.append(n / np.maximum(nl, 1e-9))
        self.mat.append(ids)
        self.part.append(np.full(len(p), self._next_part, dtype=np.int32))
        self._next_part += 1

    def arrays(self):
        return (
            np.concatenate(self.pts),
            np.concatenate(self.nrm),
            np.concatenate(self.mat),
            np.concatenate(self.part),
        )


def _frame(axis: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    a = axis / np.linalg.norm(axis)
    ref = np.array([0.0, 0.0, 1.0]) if abs(a[2]) < 0.9 else np.array([1.0, 0.0, 0.0])
    u = np.cross(a, ref)
    u /= np.linalg.norm(u)
    v = np.cross(a, u)
    return u, v


def ellipsoid(c: Cloud, center, radii, mat, rot=None, keep=None) -> None:
    center = np.asarray(center, float)
    radii = np.asarray(radii, float)
    r = radii.max()
    nt = max(6, math.ceil(math.pi * r / SPACING))
    npf = max(8, math.ceil(2 * math.pi * r / SPACING))
    th = (np.arange(nt) + 0.5) / nt * math.pi
    ph = np.arange(npf) / npf * 2 * math.pi
    T, P = np.meshgrid(th, ph, indexing="ij")
    unit = np.stack([np.sin(T) * np.cos(P), np.sin(T) * np.sin(P), np.cos(T)], -1).reshape(-1, 3)
    local = unit * radii
    nrm = unit / radii
    if rot is not None:
        local = local @ rot.T
        nrm = nrm @ rot.T
    c.add(center + local, nrm, mat, keep)


def capsule(c: Cloud, p0, p1, r0, r1=None, mat="metal", keep=None, caps=True) -> None:
    p0 = np.asarray(p0, float)
    p1 = np.asarray(p1, float)
    r1 = r0 if r1 is None else r1
    axis = p1 - p0
    length = float(np.linalg.norm(axis))
    if length < 1e-6:
        ellipsoid(c, p0, (r0, r0, r0), mat, keep=keep)
        return
    u, v = _frame(axis)
    rm = max(r0, r1)
    nl = max(2, math.ceil(length / SPACING))
    na = max(8, math.ceil(2 * math.pi * rm / SPACING))
    t = np.linspace(0, 1, nl)
    a = np.arange(na) / na * 2 * math.pi
    Tt, A = np.meshgrid(t, a, indexing="ij")
    rad = (r0 + (r1 - r0) * Tt)[..., None]
    ring = np.cos(A)[..., None] * u + np.sin(A)[..., None] * v
    pts = p0 + Tt[..., None] * axis + rad * ring
    c.add(pts.reshape(-1, 3), ring.reshape(-1, 3), mat, keep)
    if caps:
        ellipsoid(c, p0, (r0, r0, r0), mat, keep=keep)
        ellipsoid(c, p1, (r1, r1, r1), mat, keep=keep)


def cylinder(c: Cloud, p0, p1, r, mat, keep=None) -> None:
    p0 = np.asarray(p0, float)
    p1 = np.asarray(p1, float)
    capsule(c, p0, p1, r, r, mat, keep, caps=False)
    axis = p1 - p0
    a = axis / np.linalg.norm(axis)
    u, v = _frame(axis)
    nr = max(2, math.ceil(r / SPACING))
    na = max(8, math.ceil(2 * math.pi * r / SPACING))
    rr = np.linspace(0, r, nr)
    aa = np.arange(na) / na * 2 * math.pi
    R, A = np.meshgrid(rr, aa, indexing="ij")
    disk = (R[..., None] * (np.cos(A)[..., None] * u + np.sin(A)[..., None] * v)).reshape(-1, 3)
    c.add(p0 + disk, np.tile(-a, (len(disk), 1)), mat, keep)
    c.add(p1 + disk, np.tile(a, (len(disk), 1)), mat, keep)


def box(c: Cloud, center, half, mat, rot=None, keep=None) -> None:
    center = np.asarray(center, float)
    half = np.asarray(half, float)
    R = np.eye(3) if rot is None else rot
    for ax in range(3):
        o1, o2 = [i for i in range(3) if i != ax]
        n1 = max(2, math.ceil(2 * half[o1] / SPACING))
        n2 = max(2, math.ceil(2 * half[o2] / SPACING))
        g1, g2 = np.meshgrid(np.linspace(-half[o1], half[o1], n1), np.linspace(-half[o2], half[o2], n2), indexing="ij")
        for sgn in (-1, 1):
            loc = np.zeros((g1.size, 3))
            loc[:, o1] = g1.ravel()
            loc[:, o2] = g2.ravel()
            loc[:, ax] = sgn * half[ax]
            nrm = np.zeros_like(loc)
            nrm[:, ax] = sgn
            c.add(center + loc @ R.T, nrm @ R.T, mat, keep)


def rot_y(a: float) -> np.ndarray:
    ca, sa = math.cos(a), math.sin(a)
    return np.array([[ca, 0, sa], [0, 1, 0], [-sa, 0, ca]])


def rot_z(a: float) -> np.ndarray:
    ca, sa = math.cos(a), math.sin(a)
    return np.array([[ca, -sa, 0], [sa, ca, 0], [0, 0, 1]])


def rot_x(a: float) -> np.ndarray:
    ca, sa = math.cos(a), math.sin(a)
    return np.array([[1, 0, 0], [0, ca, -sa], [0, sa, ca]])


# ---------------------------------------------------------------- parts


def half_body(p: np.ndarray) -> np.ndarray:
    """Left half (+y) is the soldier, right half (−y) is plating."""
    return np.where(p[:, 1] >= 0.4, "olive", "metal")


def half_face(p: np.ndarray) -> np.ndarray:
    return np.where(p[:, 1] >= 0.3, "skin", "metal")


def gatling(c: Cloud, base, spin: float, length: float = 15.0, flash: int = 0, tilt=None) -> np.ndarray:
    """Housing from `base` forward along +x (or `tilt`). Returns the muzzle point."""
    base = np.asarray(base, float)
    R = np.eye(3) if tilt is None else tilt
    fwd = R @ np.array([1.0, 0, 0])
    side = R @ np.array([0, 1.0, 0])
    up = R @ np.array([0, 0, 1.0])
    # Motor housing and the drum feed chute.
    box(c, base + fwd * 3.2, (4.4, 3.3, 3.4), "metal", rot=R)
    box(c, base + fwd * 2.0 + up * 3.6, (2.6, 1.6, 0.8), "rust", rot=R)
    cylinder(c, base + fwd * 7.4, base + fwd * 8.8, 2.9, "dark")
    # Six barrels around the spindle, a clamp, and the muzzle ring.
    b0 = base + fwd * 8.6
    b1 = base + fwd * (8.6 + length)
    for i in range(6):
        a = spin + i * math.pi / 3
        off = (math.cos(a) * side + math.sin(a) * up) * 1.75
        capsule(c, b0 + off, b1 + off, 0.8, mat="metal" if i % 2 else "dark", caps=False)
    cylinder(c, b0 + fwd * length * 0.45, b0 + fwd * (length * 0.45 + 1.4), 2.35, "metal")
    cylinder(c, b1 - fwd * 1.0, b1 - fwd * 0.2, 2.2, "dark")
    muzzle = b1 + fwd * 0.3
    if flash:
        s = {1: 1.6, 2: 0.9, 3: 1.4, 4: 0.5}[flash]
        # Star: a long spike down the bore, four short spikes across it, a hot core.
        ellipsoid(c, muzzle + fwd * 4.6 * s, (5.6 * s, 1.1 * s, 1.1 * s), "flash", rot=R)
        for k in range(4):
            d = rot_x(k * math.pi / 2 + spin) @ np.array([0.0, 1.0, 0.0])
            d = R @ d
            ellipsoid(c, muzzle + fwd * 1.6 * s + d * 2.4 * s, (1.0 * s, 2.6 * s, 0.9 * s), "flash", rot=R @ rot_x(k * math.pi / 2 + spin))
        ellipsoid(c, muzzle + fwd * 1.8 * s, (2.2 * s, 1.8 * s, 1.8 * s), "flash_core", rot=R)
    return muzzle


def feed_belt(c: Cloud, a, b, ctrl, n: int = 9) -> None:
    a, b, ctrl = (np.asarray(v, float) for v in (a, b, ctrl))
    for i in range(n):
        t = (i + 0.5) / n
        p = (1 - t) ** 2 * a + 2 * (1 - t) * t * ctrl + t**2 * b
        ellipsoid(c, p, (0.95, 0.95, 0.95), "brass")


def leg_ik(hip, foot, l1: float, l2: float) -> np.ndarray:
    """Knee in the sagittal plane, bending forward (+x)."""
    hip = np.asarray(hip, float)
    foot = np.asarray(foot, float)
    d = foot - hip
    dist = min(float(np.linalg.norm(d)), l1 + l2 - 1e-3)
    dirv = d / max(1e-6, np.linalg.norm(d))
    a = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist)
    h = math.sqrt(max(0.0, l1 * l1 - a * a))
    fwd = np.array([1.0, 0, 0])
    perp = fwd - dirv * float(fwd @ dirv)
    perp = perp / max(1e-6, np.linalg.norm(perp))
    return hip + dirv * a + perp * h


def mech_leg(c: Cloud, hip, foot, side: float) -> None:
    knee = leg_ik(hip, foot + np.array([0, 0, 2.6]), 14.0, 13.5)
    ankle = foot + np.array([0, 0, 2.6])
    capsule(c, hip, knee, 3.4, 2.9, "metal")
    # Hydraulic ram along the back of the thigh.
    capsule(c, hip + np.array([-2.6, 0, -1]), knee + np.array([-2.4, 0, 0.5]), 1.0, mat="dark")
    capsule(c, knee, ankle, 2.5, 2.1, "dark")
    ellipsoid(c, knee + np.array([0.9, 0, 0]), (3.0, 3.3, 3.0), "metal")
    box(c, foot + np.array([2.0, 0, 1.4]), (4.6, 2.7, 1.4), "dark")
    box(c, foot + np.array([4.4, 0, 1.9]), (1.6, 2.5, 1.2), "metal")


def stumps(c: Cloud, pelvis, back: np.ndarray, t: float) -> None:
    """Torn hips: short ragged struts, cut cables, and a spark that flickers with `t`."""
    for s in (1, -1):
        hip = pelvis + np.array([0, s * 5.0, 0])
        capsule(c, hip, hip + back * 3.2, 3.0, 2.4, "metal")
        tip = hip + back * 3.8
        cylinder(c, tip - back * 0.6, tip + back * 0.8, 1.6, "rust")
        for k, ang in enumerate((0.6, -0.5, 1.8)):
            d = back * 2.4 + np.array([0, math.cos(ang + s) * 1.6, math.sin(ang) * 1.6])
            capsule(c, tip, tip + d, 0.5, mat="dark" if k else "brass", caps=False)
        if (int(t * 4) + (s > 0)) % 2 == 0:
            ellipsoid(c, tip + back * 2.8 + np.array([0, 0, 0.8]), (1.2, 1.2, 1.2), "spark")


# ---------------------------------------------------------------- poses


def pose_stand(phase: float | None, spin: float = 0.0, flash: int = 0) -> tuple[Cloud, float]:
    c = Cloud()
    stride = 0.0 if phase is None else 1.0
    bob = 0.0 if phase is None else 0.7 * abs(math.sin(2 * math.pi * phase))
    feet = []
    for s, off in ((1, 0.0), (-1, 0.5)):
        p = 0.0 if phase is None else (phase + off) % 1.0
        fx = -5.5 * math.cos(2 * math.pi * p) * stride
        lift = 2.6 * max(0.0, math.sin(2 * math.pi * p)) * stride
        feet.append((s, np.array([fx, s * 5.4, lift])))
    hz = 29.5 - bob
    for s, foot in feet:
        mech_leg(c, np.array([-0.5, s * 5.0, hz]), foot, s)
    # Pelvis block and hip actuators.
    box(c, (-0.5, 0, hz + 1.4), (3.6, 6.4, 3.0), "dark")
    for s in (1, -1):
        cylinder(c, (-0.5, s * 5.2, hz), (-0.5, s * 7.6, hz), 2.8, "metal")
    z = hz - 29.5
    # Torso: soldier on the left, plating on the right.
    ellipsoid(c, (0.2, 0, 43.5 + z), (6.0, 8.8, 10.2), half_body)
    box(c, (4.8, -4.4, 45 + z), (1.6, 4.0, 5.4), "metal")  # chest plate
    box(c, (4.2, 4.6, 40.5 + z), (1.7, 2.6, 2.2), "leather")  # pouch
    capsule(c, (4.9, 7.0, 51 + z), (5.4, -2.0, 37 + z), 0.8, mat="leather")  # strap
    # Drum magazine on the back, fed to the gun around the right hip.
    cylinder(c, (-8.8, -6.2, 45 + z), (-8.8, 6.2, 45 + z), 6.0, "dark")
    cylinder(c, (-8.8, -6.6, 45 + z), (-8.8, -6.0, 45 + z), 6.4, "brass")
    cylinder(c, (-8.8, 6.0, 45 + z), (-8.8, 6.6, 45 + z), 6.4, "metal")
    box(c, (-9.6, 0, 45 + z), (2.2, 6.3, 1.2), "rust")
    feed_belt(c, (-6.0, -7.5, 40 + z), (0.6, -12.2, 39.6 + z), (-3.6, -14.5, 36 + z))
    # Neck cables, face half flesh half machine, helmet.
    capsule(c, (0, 0, 53.5 + z), (0.6, 0, 57 + z), 2.9, mat="dark")
    ellipsoid(c, (1.0, 0, 60.5 + z), (5.8, 5.8, 6.2), half_face)
    box(c, (5.4, -2.6, 57.8 + z), (1.3, 2.4, 1.5), "metal")  # jaw plate
    ellipsoid(c, (6.4, -2.3, 61.2 + z), (1.1, 1.35, 1.2), "eye")
    ellipsoid(c, (6.6, 2.3, 61.2 + z), (0.6, 0.7, 0.7), "pupil")
    ellipsoid(c, (0.4, 0, 63.6 + z), (7.2, 7.4, 5.2), "helmet", keep=lambda p: p[:, 2] >= 62.4 + z)
    ellipsoid(c, (0.0, 0, 62.6 + z), (8.2, 8.2, 1.0), "helmet")
    # Right shoulder pauldron and the gun arm.
    ellipsoid(c, (0, -10.2, 51.5 + z), (4.8, 4.2, 3.6), "metal")
    capsule(c, (0, -10.6, 50 + z), (1.4, -11.0, 42.5 + z), 2.8, mat="dark")
    muzzle = gatling(c, (0.8, -11.0, 41.2 + z), spin, flash=flash)
    # Left arm, human: sleeve, forearm across to the top handle.
    ellipsoid(c, (0, 9.4, 51 + z), (3.6, 3.4, 3.4), "olive")
    capsule(c, (0, 9.8, 50 + z), (2.6, 10.4, 42.5 + z), 2.6, mat="olive")
    capsule(c, (2.6, 10.4, 42.5 + z), (7.8, -5.6, 44.5 + z), 2.1, 2.0, "skin")
    ellipsoid(c, (8.2, -7.0, 44.8 + z), (2.2, 2.0, 2.0), "skin")
    capsule(c, (6.4, -11.0, 44.4 + z), (9.8, -11.0, 44.4 + z), 0.9, mat="dark")  # carry handle
    return c, 0.0


def pose_crawl(t: float, spin: float = 0.0, flash: int = 0) -> tuple[Cloud, float]:
    """Legless. Chest on the dirt, propped on the left arm, gatling along the ground."""
    c = Cloud()
    pull = math.sin(2 * math.pi * t)
    heave = 0.6 * max(0.0, pull)
    z0 = heave
    # Torso lying along +x.
    ellipsoid(c, (0, 0, 6.2 + z0), (10.5, 8.6, 5.6), half_body)
    box(c, (1.0, -4.2, 11.0 + z0), (6.0, 3.6, 1.2), "metal")  # back plating
    box(c, (-4.0, 4.6, 10.4 + z0), (2.4, 2.4, 1.4), "leather")
    stumps(c, np.array([-10.0, 0, 5.0 + z0]), np.array([-1.0, 0, -0.1]), t)
    box(c, (-9.2, 0, 5.2 + z0), (2.2, 6.4, 2.6), "dark")  # pelvis stub
    # Drum on the back.
    cylinder(c, (-2.0, -5.6, 14.2 + z0), (-2.0, 5.6, 14.2 + z0), 5.0, "dark")
    cylinder(c, (-2.0, -6.0, 14.2 + z0), (-2.0, -5.4, 14.2 + z0), 5.4, "metal")
    cylinder(c, (-2.0, 5.4, 14.2 + z0), (-2.0, 6.0, 14.2 + z0), 5.4, "metal")
    feed_belt(c, (0.0, -6.6, 12.0 + z0), (7.6, -11.0, 7.0 + z0), (3.6, -11.8, 12.0 + z0), n=7)
    # Head raised, looking along the gun.
    capsule(c, (9.0, 0, 9.0 + z0), (11.6, 0, 11.6 + z0), 2.8, mat="dark")
    ellipsoid(c, (13.0, 0, 13.4 + z0), (5.6, 5.8, 5.8), half_face)
    box(c, (17.2, -2.6, 11.2 + z0), (1.2, 2.3, 1.4), "metal")
    ellipsoid(c, (18.3, -2.3, 14.0 + z0), (1.1, 1.3, 1.2), "eye")
    ellipsoid(c, (18.5, 2.3, 14.0 + z0), (0.6, 0.7, 0.7), "pupil")
    ellipsoid(c, (12.6, 0, 16.4 + z0), (7.0, 7.2, 4.8), "helmet", keep=lambda p: p[:, 2] >= 15.4 + z0)
    ellipsoid(c, (12.2, 0, 15.5 + z0), (7.8, 7.8, 0.9), "helmet")
    # Gun arm forward along the ground.
    ellipsoid(c, (7.0, -9.6, 8.4 + z0), (4.2, 4.0, 3.4), "metal")
    capsule(c, (7.0, -10.2, 7.4 + z0), (9.0, -10.8, 5.0 + z0), 2.6, mat="dark")
    muzzle = gatling(c, (9.6, -10.8, 4.6 + z0), spin, length=14.0, flash=flash)
    # Left arm reaching forward and dragging: elbow plants, hand claws the dirt.
    reach = 4.0 * pull
    ellipsoid(c, (7.0, 9.0, 8.6 + z0), (3.4, 3.2, 3.2), "olive")
    elbow = np.array([12.5 + reach * 0.5, 11.4, 2.2])
    hand = np.array([19.0 + reach, 9.4, 1.4])
    capsule(c, (7.0, 9.4, 8.0 + z0), elbow, 2.5, mat="olive")
    capsule(c, elbow, hand, 2.1, 1.9, "skin")
    ellipsoid(c, hand + np.array([0.8, 0, 0]), (2.2, 2.0, 1.5), "skin")
    return c, 0.0


def pose_dead() -> tuple[Cloud, float]:
    """Torso face down, gatling fallen aside, one leg torn off beside him."""
    c = Cloud()
    ellipsoid(c, (0, 0, 4.4), (10.5, 8.8, 4.6), half_body)
    box(c, (1.0, -4.0, 8.6), (6.0, 3.6, 1.0), "metal")
    stumps(c, np.array([-10.0, 0, 3.6]), np.array([-1.0, 0, -0.05]), 0.0)
    box(c, (-9.4, 0, 3.8), (2.2, 6.4, 2.2), "dark")
    cylinder(c, (-5.0, -5.4, 9.0), (-5.0, 5.4, 9.0), 4.6, "dark")
    cylinder(c, (-5.0, -5.8, 9.0), (-5.0, -5.2, 9.0), 5.0, "metal")
    cylinder(c, (-5.0, 5.2, 9.0), (-5.0, 5.8, 9.0), 5.0, "metal")
    # Head down on the dirt.
    ellipsoid(c, (13.0, 1.0, 4.6), (5.6, 5.8, 4.8), half_face)
    ellipsoid(c, (12.2, 1.0, 6.8), (7.0, 7.2, 4.2), "helmet", keep=lambda p: p[:, 2] >= 6.0)
    ellipsoid(c, (12.0, 1.0, 6.4), (7.6, 7.6, 0.9), "helmet")
    ellipsoid(c, (18.0, -1.3, 4.6), (0.9, 1.1, 1.0), "rust")  # dead optic
    # Gun arm flung out to the right.
    tilt = rot_z(math.radians(-38))
    ellipsoid(c, (6.0, -9.6, 5.6), (4.2, 4.0, 3.2), "metal")
    gatling(c, (7.6, -11.4, 3.4), 0.3, length=13.0, tilt=tilt)
    # Left arm limp forward.
    capsule(c, (6.0, 9.0, 5.0), (12.0, 12.0, 2.0), 2.4, mat="olive")
    capsule(c, (12.0, 12.0, 2.0), (18.0, 11.0, 1.6), 2.0, mat="skin")
    # A torn leg behind him, on its side.
    lr = rot_z(math.radians(70)) @ rot_x(math.radians(90))
    base = np.array([-20.0, -8.0, 3.2])
    capsule(c, base, base + lr @ np.array([0, 0, -12.0]), 3.0, 2.6, "metal")
    ellipsoid(c, base + lr @ np.array([0.8, 0, -12.0]), (2.9, 3.0, 2.9), "metal")
    capsule(c, base + lr @ np.array([0, 0, -12.0]), base + lr @ np.array([-2.0, 0, -23.0]), 2.3, 2.0, "dark")
    box(c, base + lr @ np.array([0.0, 0, -25.0]), (4.0, 2.4, 1.3), "dark", rot=lr)
    return c, 0.0


# ---------------------------------------------------------------- renderer


def facing_vectors(row: int) -> tuple[np.ndarray, np.ndarray]:
    """Row 0 = screen south (toward the viewer), clockwise 22.5° per row."""
    a = row * math.pi / 8
    f = np.array([-math.sin(a), math.cos(a), 0.0])
    left = np.array([f[1], -f[0], 0.0])
    return f, left


def render(cloud: Cloud, row: int, scale: float, contact_y: float, cell: int = CELL) -> Image.Image:
    pts, nrm, mat, part = cloud.arrays()
    f, left = facing_vectors(row)
    up = np.array([0.0, 0.0, 1.0])
    B = np.stack([f, left, up])  # body → camera
    cam = pts @ B * scale
    ncam = nrm @ B
    sx = cam[:, 0]
    sy = cam[:, 1] * SIN_P - cam[:, 2] * COS_P
    depth = cam[:, 1] * COS_P + cam[:, 2] * SIN_P
    cx, cy = cell / 2, cell * contact_y
    px = np.floor(cx + sx).astype(int)
    py = np.floor(cy + sy).astype(int)
    ok = (px >= 1) & (px < cell - 1) & (py >= 1) & (py < cell - 1)
    px, py, depth, ncam, mat, part = px[ok], py[ok], depth[ok], ncam[ok], mat[ok], part[ok]
    lin = py * cell + px
    order = np.lexsort((depth, lin))
    lin_s = lin[order]
    last = np.r_[lin_s[1:] != lin_s[:-1], True]
    win = order[last]
    lin_w = lin[win]

    zbuf = np.full(cell * cell, -np.inf)
    zbuf[lin_w] = depth[win]
    mbuf = np.full(cell * cell, -1, dtype=np.int16)
    mbuf[lin_w] = mat[win]
    shade = ncam[win] @ LIGHT
    tone = np.where(shade > 0.5, 2, np.where(shade > 0.0, 1, 0))
    tbuf = np.zeros(cell * cell, dtype=np.int8)
    tbuf[lin_w] = tone
    zbuf = zbuf.reshape(cell, cell)
    mbuf = mbuf.reshape(cell, cell)
    tbuf = tbuf.reshape(cell, cell)

    # Fill single-pixel pinholes the splat missed (surrounded on 3+ sides).
    filled = mbuf >= 0
    for _ in range(2):
        nb = np.zeros_like(mbuf, dtype=int)
        for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            nb += np.roll(np.roll(filled, dy, 0), dx, 1)
        hole = (~filled) & (nb >= 3)
        if not hole.any():
            break
        for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            src_m = np.roll(np.roll(mbuf, dy, 0), dx, 1)
            src_t = np.roll(np.roll(tbuf, dy, 0), dx, 1)
            src_z = np.roll(np.roll(zbuf, dy, 0), dx, 1)
            take = hole & (src_m >= 0) & (mbuf < 0)
            mbuf[take], tbuf[take], zbuf[take] = src_m[take], src_t[take], src_z[take]
        filled = mbuf >= 0

    rgba = np.zeros((cell, cell, 4), dtype=np.uint8)
    names = list(MATERIALS)
    for mid, name in enumerate(names):
        sel = mbuf == mid
        if not sel.any():
            continue
        spec = MATERIALS[name]
        if name in EMISSIVE:
            rgba[sel, :3] = spec
        else:
            for t in range(3):
                s2 = sel & (tbuf == t)
                rgba[s2, :3] = spec[t]
        rgba[sel, 3] = 255

    fx = np.isin(mbuf, [MAT_IDS["flash"], MAT_IDS["flash_core"]])
    solid = mbuf >= 0
    # Interior lines where the surface jumps in depth: darken the far side.
    line = np.zeros_like(solid)
    jump = 2.6 * scale
    for dy, dx in ((0, 1), (1, 0), (0, -1), (-1, 0)):
        zn = np.roll(np.roll(zbuf, dy, 0), dx, 1)
        sn = np.roll(np.roll(solid, dy, 0), dx, 1)
        line |= solid & sn & (np.nan_to_num(zn - zbuf, nan=0.0, neginf=0.0, posinf=0.0) > jump)
    rgba[line & ~fx, :3] = OUTLINE
    solid = solid & ~fx
    # 1 px silhouette outline outside the shape (8-neighbour).
    grow = np.zeros_like(solid)
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            if dy or dx:
                grow |= np.roll(np.roll(solid, dy, 0), dx, 1)
    edge = grow & ~solid & ~fx
    rgba[edge, :3] = OUTLINE
    rgba[edge, 3] = 255
    return Image.fromarray(rgba, "RGBA")


# ---------------------------------------------------------------- sheets


@dataclass
class SheetSpec:
    name: str
    frames: int
    contact_y: float
    scale: float
    pose: callable  # (frame) -> Cloud


def spin_of(frame: int) -> float:
    return frame * math.pi / 6 * 0.5


SHEETS = [
    SheetSpec("walk", 8, 0.90, STAND_SCALE, lambda i: pose_stand(None if i == 0 else i / 8)[0]),
    SheetSpec("fire", 4, 0.90, STAND_SCALE, lambda i: pose_stand(None, spin_of(i), flash=i + 1)[0]),
    SheetSpec("crawl", 8, 0.72, PRONE_SCALE, lambda i: pose_crawl(i / 8)[0]),
    SheetSpec("crawl-fire", 4, 0.72, PRONE_SCALE, lambda i: pose_crawl(0.0, spin_of(i), flash=i + 1)[0]),
    SheetSpec("die", 4, 0.82, STAND_SCALE, lambda i: pose_dead()[0]),
]


def render_sheet(spec: SheetSpec) -> tuple[Image.Image, dict[str, Image.Image]]:
    clouds = [spec.pose(i) for i in range(spec.frames)]
    rows: list[list[Image.Image]] = []
    for r in range(16):
        rows.append([render(cl, r, spec.scale, spec.contact_y) for cl in clouds])
    sheet = compose_sheet(rows, CELL)
    placed = {ENGINE_ORDER[r]: rows[r][0] for r in range(16)}
    return sheet, placed


def on_magenta(im: Image.Image) -> Image.Image:
    bg = Image.new("RGBA", im.size, (255, 0, 255, 255))
    bg.alpha_composite(im)
    return bg.convert("RGB")


def cameo(east: Image.Image, size: int = 72) -> Image.Image:
    bb = opaque_bbox(east)
    crop = east.crop(bb)
    s = min((size - 4) / crop.width, (size - 2) / crop.height)
    crop = crop.resize((max(1, round(crop.width * s)), max(1, round(crop.height * s))), Image.Resampling.NEAREST)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.alpha_composite(crop, ((size - crop.width) // 2, size - crop.height - 1))
    return out


def main() -> int:
    PREVIEW.mkdir(parents=True, exist_ok=True)
    SRC.mkdir(parents=True, exist_ok=True)
    status = 0
    for spec in SHEETS:
        sheet, placed = render_sheet(spec)
        out = UNITS / f"cyborg-{spec.name}.png"
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
            "out": str(out.relative_to(ROOT)),
            "size_pop_dirs": pops,
            "empty_dirs": empties,
            "diag": diag,
            "source": "render_cyborg.py (16 unique yaws, no mirror)",
        }
        (PREVIEW / f"{stem}-manifest.json").write_text(json.dumps(manifest, indent=2))
        print(f"{stem}: {sheet.size} frames={spec.frames} pops={pops} empty={empties}")
        if empties:
            status = 2
        if spec.name == "walk":
            east = placed["E"]
            on_magenta(east).save(SRC / "cyborg-east.png")
            cameo(east).save(UNITS / "cyborg-cameo.png")
    return status


if __name__ == "__main__":
    raise SystemExit(main())
