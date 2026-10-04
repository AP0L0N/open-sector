#!/usr/bin/env python3
"""
Titan (heavy assault walker) — 16-dir engine sheets from a small 3D model.

No Blender in this pipeline: the mech is built from boxes / prisms and
rendered with a locked orthographic camera (the subject yaws, the camera does
not). Every layer shares one camera, one scale, and one ground origin, so the
torso-turret and gun composite on the legs at any aim, like the Tiger.

Rows are south-first, clockwise (engine order). Row k is solved so the nose
projects to screen angle south + k·22.5° — `engineRowFromScreen` picks rows by
screen angle, so this keeps the drawn nose on the path the unit walks.

Outputs (gridlock/packages/client/src/assets/units/):
  titan-legs.png          8 walk frames × 16 dirs (hull sheet)
  titan-torso.png         1 × 16 (turret sheet)
  titan-gun.png           1 × 16 (recoiling barrel)
  titan-braced-legs.png   1 × 16 (deployed: stance wide, outriggers down)
  titan-braced-torso.png  1 × 16 (torso lowered onto the braced hips)
  titan-braced-gun.png    1 × 16
  titan-wade-legs.png     8 wade frames × 16 dirs (sunk to the waterline, pool baked in)
  titan-wade-torso.png    1 × 16 (torso lowered with the legs)
  titan-wade-gun.png      1 × 16
  titan-cameo.png         128 × 128
Previews (tools/sprites/preview/): titan-strip.png (labeled 16 rows, legs +
torso + gun), titan-walk.png (E walk frames), titan-braced-strip.png,
titan-wade-strip.png, titan.json manifest.

  python tools/sprites/render_titan.py
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "gridlock/packages/client/src/assets/units"
PREVIEW = ROOT / "tools/sprites/preview"

CELL = 192
CONTACT_Y = 0.84  # feet and outrigger pads reach ~20 px toward the camera
PADDING = 4
SCALE = 1.9  # px per model unit at CELL
ELEV = math.radians(40.0)  # camera pitch, same high 3/4 as the Walker
DIRS = 16
WALK_FRAMES = 8
ENGINE_ORDER = ["S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW", "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE"]

OUTLINE = (0x1A, 0x14, 0x10)


def hexc(s: str) -> tuple[int, int, int]:
    s = s.lstrip("#")
    return (int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16))


# Flat ramps, dark → light. Olive armor, dark steel, team-tint gray, accents.
RAMPS: dict[str, list[tuple[int, int, int]]] = {
    # The Walker's brown-olive plate, taken a step darker: a gunmetal war machine.
    "armor": [hexc(c) for c in ("#1c1c14", "#2e2e1e", "#424228", "#565232", "#6a6440")],
    "steel": [hexc(c) for c in ("#141414", "#242422", "#363634", "#4e4e48")],
    "team": [hexc(c) for c in ("#4a4a46", "#6e6e68", "#8a8a83")],
    # Eye slits glow: no dark tone, so they read lit from every facing.
    "visor": [hexc(c) for c in ("#d42a12", "#ff4a22", "#ff7a3a")],
    "rust": [hexc(c) for c in ("#4a1e14", "#6b2a1a", "#8b3a2a")],
    "hazard": [hexc(c) for c in ("#6b5212", "#a37c14", "#d4a017")],
    "tube": [hexc(c) for c in ("#0e0c0a", "#1a1410")],
    # Flat water, locked to the infantry swim pool (infantry-swim.png).
    "water": [hexc("#284c50")],
    "foam": [hexc("#4c7c7c")],
}

LIGHT = np.array([-0.45, -0.55, 0.70])
LIGHT = LIGHT / np.linalg.norm(LIGHT)


# ---------------------------------------------------------------- geometry

class Mesh:
    def __init__(self) -> None:
        self.tris: list[tuple[np.ndarray, str]] = []  # (3×3 verts, material)

    def quad(self, a, b, c, d, mat: str) -> None:
        self.tris.append((np.array([a, b, c]), mat))
        self.tris.append((np.array([a, c, d]), mat))

    def hexa(self, p: list, mat: str) -> None:
        """8 corners: bottom 0-3 then top 4-7, each ring CCW seen from above."""
        p = [np.asarray(v, float) for v in p]
        self.quad(p[3], p[2], p[1], p[0], mat)  # bottom
        self.quad(p[4], p[5], p[6], p[7], mat)  # top
        for i in range(4):
            j = (i + 1) % 4
            self.quad(p[i], p[j], p[4 + j], p[4 + i], mat)

    def box(self, x0, x1, y0, y1, z0, z1, mat: str) -> None:
        self.hexa(
            [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
             (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)],
            mat,
        )

    def taper(self, bot: tuple, top: tuple, z0: float, z1: float, mat: str) -> None:
        """bot/top = (x0, x1, y0, y1) rectangles at z0 / z1."""
        bx0, bx1, by0, by1 = bot
        tx0, tx1, ty0, ty1 = top
        self.hexa(
            [(bx0, by0, z0), (bx1, by0, z0), (bx1, by1, z0), (bx0, by1, z0),
             (tx0, ty0, z1), (tx1, ty0, z1), (tx1, ty1, z1), (tx0, ty1, z1)],
            mat,
        )

    def beam(self, a, b, half_w: float, half_d: float, mat: str, side=(0.0, 1.0, 0.0)) -> None:
        """Box from a to b. half_w along `side`, half_d along the third axis."""
        a = np.asarray(a, float)
        b = np.asarray(b, float)
        u = b - a
        u /= np.linalg.norm(u)
        s = np.asarray(side, float)
        s = s - u * np.dot(s, u)
        s /= np.linalg.norm(s)
        w = np.cross(u, s)
        c = []
        for base in (a, b):
            for sx, wx in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
                c.append(base + s * sx * half_w + w * wx * half_d)
        # ring order: along u = bottom/top
        self.hexa([c[0], c[1], c[2], c[3], c[4], c[5], c[6], c[7]], mat)

    def spike(self, a, b, half_w: float, half_d: float, mat: str, side=(0.0, 0.0, 1.0), tip: float = 0.12) -> None:
        """Beam from a to b that tapers to a point at b (claws, horns, fins)."""
        a = np.asarray(a, float)
        b = np.asarray(b, float)
        u = b - a
        u /= np.linalg.norm(u)
        s = np.asarray(side, float)
        s = s - u * np.dot(s, u)
        s /= np.linalg.norm(s)
        w = np.cross(u, s)
        c = []
        for base, k in ((a, 1.0), (b, tip)):
            for sx, wx in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
                c.append(base + (s * sx * half_w + w * wx * half_d) * k)
        self.hexa(c, mat)

    def prism_x(self, x0, x1, cy, cz, r, mat: str, sides: int = 8) -> None:
        """Cylinder along +x."""
        ring = [(cy + r * math.cos(2 * math.pi * i / sides + math.pi / sides),
                 cz + r * math.sin(2 * math.pi * i / sides + math.pi / sides)) for i in range(sides)]
        for i in range(sides):
            j = (i + 1) % sides
            y0, z0 = ring[i]
            y1, z1 = ring[j]
            self.quad((x0, y0, z0), (x0, y1, z1), (x1, y1, z1), (x1, y0, z0), mat)
        cap0 = [(x0, y, z) for y, z in ring]
        cap1 = [(x1, y, z) for y, z in ring]
        for i in range(1, sides - 1):
            self.tris.append((np.array([cap0[0], cap0[i + 1], cap0[i]]), mat))
            self.tris.append((np.array([cap1[0], cap1[i], cap1[i + 1]]), mat))

    def prism_z(self, cx, cy, z0, z1, r, mat: str, sides: int = 8) -> None:
        ring = [(cx + r * math.cos(2 * math.pi * i / sides + math.pi / sides),
                 cy + r * math.sin(2 * math.pi * i / sides + math.pi / sides)) for i in range(sides)]
        for i in range(sides):
            j = (i + 1) % sides
            x0, y0 = ring[i]
            x1, y1 = ring[j]
            self.quad((x0, y0, z0), (x1, y1, z0), (x1, y1, z1), (x0, y0, z1), mat)
        for i in range(1, sides - 1):
            self.tris.append((np.array([(ring[0][0], ring[0][1], z1), (ring[i][0], ring[i][1], z1), (ring[i + 1][0], ring[i + 1][1], z1)]), mat))
            self.tris.append((np.array([(ring[0][0], ring[0][1], z0), (ring[i + 1][0], ring[i + 1][1], z0), (ring[i][0], ring[i][1], z0)]), mat))


# Model axes: +x forward (nose), +y left, +z up. Ground contact at the origin.

HIP_Z = 27.0
THIGH = 13.5
SHIN = 13.5
ANKLE_Z = 2.6
HOCK = np.array([-4.5, 0.0, 9.5])  # reverse joint: up and behind the ankle
LEG_Y = 10.5
STRIDE = 7.0
LIFT = 4.5


def knee_of(hip: np.ndarray, hock: np.ndarray) -> np.ndarray:
    """Two-bone IK, knee thrown forward (+x). With the hock behind it the leg reads bird-like."""
    d = hock - hip
    dist = min(np.linalg.norm(d), THIGH + SHIN - 0.2)
    dn = d / np.linalg.norm(d)
    along = (THIGH ** 2 - SHIN ** 2 + dist ** 2) / (2 * dist)
    h = math.sqrt(max(0.0, THIGH ** 2 - along ** 2))
    perp = np.array([-dn[2], 0.0, dn[0]])
    if perp[0] < 0:
        perp = -perp
    return hip + dn * along + perp * h


def add_foot(m: Mesh, ankle: np.ndarray, out: float) -> None:
    """Three splayed talons and a rear spur around a heavy ankle pad."""
    fx, fy = ankle[0], ankle[1]
    fz = ankle[2] - ANKLE_Z
    m.taper((fx - 3.2, fx + 3.4, fy - 3.4, fy + 3.4), (fx - 2.4, fx + 2.2, fy - 2.6, fy + 2.6), fz, fz + 2.8, "steel")
    for ang in (-0.5, 0.0, 0.5):
        d = np.array([math.cos(ang), math.sin(ang), 0.0])
        base = np.array([fx, fy, fz + 1.3]) + d * 2.4
        tip = np.array([fx, fy, fz]) + d * 9.0
        m.spike(base, tip, 1.3, 1.5, "steel")
        m.spike(tip - d * 2.2 + np.array([0, 0, 0.7]), tip + d * 0.9 + np.array([0, 0, -0.1]), 0.8, 0.9, "rust")  # claw tip
    m.spike(np.array([fx - 1.5, fy, fz + 1.4]), np.array([fx - 6.5, fy + out * 0.6, fz]), 1.1, 1.2, "steel")


def add_leg(m: Mesh, y: float, foot_x: float, lift: float, hip_z: float, foot_y: float | None = None) -> None:
    fy = y if foot_y is None else foot_y
    out = 1.0 if y > 0 else -1.0
    hip = np.array([0.0, y, hip_z])
    ankle = np.array([foot_x, fy, ANKLE_Z + lift])
    hock = ankle + HOCK
    knee = knee_of(hip, hock)
    side = (0.0, 1.0, 0.0)
    m.prism_x(-3.2, 3.2, y, hip_z, 3.6, "steel")  # hip drum
    m.box(-5.0, 5.0, y + out * 4.4 - 0.9, y + out * 4.4 + 0.9, hip_z - 3.5, hip_z + 3.0, "armor")  # hip guard
    m.beam(hip, knee, 3.8, 4.6, "armor", side)  # thigh
    m.beam(hip + (knee - hip) * 0.3 + np.array([0, out * 3.2, 0]), knee + np.array([0, out * 3.2, 0]) - (knee - hip) * 0.1,
           1.0, 2.6, "armor", side)  # outer thigh plate
    m.beam(knee + np.array([0, -4.0, 0]), knee + np.array([0, 4.0, 0]), 3.2, 3.2, "steel", side=(1.0, 0.0, 0.0))  # knee pin
    m.spike(knee + np.array([-0.5, 0, 0.5]), knee + np.array([7.0, 0, 3.8]), 2.6, 2.2, "armor", side=(0.0, 1.0, 0.0))  # knee spur
    m.beam(knee, hock, 2.9, 3.4, "armor", side)  # shin, running back to the hock
    # hydraulic ram on the outside, thigh to shin
    m.beam(hip + (knee - hip) * 0.45 + np.array([0, out * 4.6, 0]), knee + (hock - knee) * 0.65 + np.array([0, out * 3.8, 0]),
           0.9, 0.9, "steel", side)
    m.beam(hock + np.array([0, -3.2, 0]), hock + np.array([0, 3.2, 0]), 2.4, 2.4, "steel", side=(1.0, 0.0, 0.0))  # hock pin
    m.spike(hock + np.array([0.5, 0, 0]), hock + np.array([-3.8, 0, 1.2]), 1.8, 1.8, "steel", side=(0.0, 1.0, 0.0))  # heel spur
    m.beam(hock, ankle + np.array([0, 0, 0.6]), 2.0, 2.2, "steel", side)  # metatarsal
    add_foot(m, ankle, out)


def pelvis(m: Mesh, hz: float) -> None:
    m.box(-8, 7, -8.5, 8.5, hz - 3.5, hz + 4, "steel")
    m.taper((6, 9.5, -6, 6), (6, 8, -5, 5), hz - 6.5, hz + 3, "armor")  # groin plate
    m.taper((-10, -7, -6, 6), (-8.5, -7, -5, 5), hz - 5.5, hz + 3, "armor")


def legs_mesh(phase: float) -> Mesh:
    m = Mesh()
    pelvis(m, HIP_Z)
    for sign, ph in ((1, phase), (-1, phase + math.pi)):
        fx = STRIDE * math.sin(ph)
        lift = LIFT * max(0.0, math.cos(ph)) ** 1.5
        add_leg(m, sign * LEG_Y, fx, lift, HIP_Z)
    return m


BRACE_DROP = 8.0


def braced_legs_mesh() -> Mesh:
    """Deployed: crouched low, feet wide, four stabilizer claws driven into the ground."""
    m = Mesh()
    hz = HIP_Z - BRACE_DROP
    pelvis(m, hz)
    for sign in (1, -1):
        add_leg(m, sign * LEG_Y, 3.5, 0.0, hz, foot_y=sign * 15.0)
    for sx in (1, -1):
        for sy in (1, -1):
            a = np.array([sx * 6.0, sy * 6.5, hz])
            b = np.array([sx * 14.5, sy * 13.0, 3.2])
            m.beam(a, b, 1.8, 1.8, "steel", side=(0.0, 0.0, 1.0))
            m.beam(a + (b - a) * 0.15 + np.array([0, 0, 1.6]), a + (b - a) * 0.75 + np.array([0, 0, 1.6]),
                   0.7, 0.7, "steel", side=(0.0, 0.0, 1.0))  # ram along the strut
            m.box(b[0] - 2.6, b[0] + 2.6, b[1] - 2.6, b[1] + 2.6, 0.0, 1.6, "hazard")  # pad
            m.spike(b, b + np.array([sx * 1.6, sy * 1.6, -3.2]), 1.4, 1.4, "steel")  # spade biting in
    return m


# Wading: the whole mech sinks until the water reaches just under the pelvis.
WADE_SINK = 22.0
POOL_R = 21.0


def sunk(m: Mesh, dz: float) -> Mesh:
    out = Mesh()
    off = np.array([0.0, 0.0, dz])
    out.tris = [(tri + off, mat) for tri, mat in m.tris]
    return out


def ring(m: Mesh, r0: float, r1: float, z: float, mat: str, sides: int = 28, sx: float = 1.0) -> None:
    """Flat annulus facing up. `sx` stretches it along the nose (a wake)."""
    for i in range(sides):
        a0 = 2 * math.pi * i / sides
        a1 = 2 * math.pi * (i + 1) / sides
        p = lambda r, a: (r * math.cos(a) * sx, r * math.sin(a), z)  # noqa: E731
        m.quad(p(r1, a0), p(r1, a1), p(r0, a1), p(r0, a0), mat)


def wade_legs_mesh(phase: float, frame: int) -> Mesh:
    m = sunk(legs_mesh(phase), -WADE_SINK)
    ring(m, 0.0, POOL_R, 0.0, "water", sx=1.1)
    # two ripples walk outward over the loop; a bow wave sits on the nose
    u = frame / WALK_FRAMES
    for k in (0.0, 0.5):
        r = 9.0 + ((u + k) % 1.0) * 10.0
        ring(m, r, r + 0.9, 0.05, "foam", sx=1.1)
    ring(m, 10.0, 11.0, 0.08, "foam", sides=10, sx=1.3) if frame % 2 == 0 else None
    return m


def torso_mesh(dz: float = 0.0) -> Mesh:
    """Hunched: the head sits low between the shoulders, pods ride above it."""
    m = Mesh()
    z = lambda v: v + dz  # noqa: E731
    m.prism_z(0, 0, z(HIP_Z + 3), z(HIP_Z + 7), 7.5, "steel")  # waist ring
    m.taper((-9, 8, -9, 9), (-11, 11, -12, 12), z(HIP_Z + 6), z(37), "armor")  # abdomen flares up
    m.taper((-11, 12.5, -12.5, 12.5), (-13, 7, -11, 11), z(37), z(50), "armor")  # chest, leaning forward
    # ribbed vents on the lower chest
    for k in range(3):
        zz = 38.0 + k * 1.6
        xf = 12.5 - (zz - 37) * 5.5 / 13
        m.box(xf - 0.6, xf + 0.5, -10.0, -6.0, z(zz), z(zz + 0.8), "steel")
        m.box(xf - 0.6, xf + 0.5, 6.0, 10.0, z(zz), z(zz + 0.8), "steel")
    # head: low armored wedge, narrowing to the brow
    m.taper((4, 15.5, -5, 5), (4, 12.5, -3.6, 3.6), z(44.5), z(50.5), "armor")
    m.taper((7, 14, -5.2, 5.2), (8, 13.2, -5.0, 5.0), z(50.0), z(51.4), "armor")  # brow ridge
    for yy in (-2.3, 2.3):  # two eye slits
        m.box(13.2, 14.6, yy - 1.4, yy + 1.4, z(47.4), z(48.6), "visor")
    m.box(14.2, 15.4, -1.0, 1.0, z(45.0), z(46.6), "visor")  # third, lower sensor
    # mantlet (the barrel lives on the gun sheet)
    m.taper((10.5, 18, -6.5, 6.5), (10.5, 16.5, -5.5, 5.5), z(35), z(45), "steel")
    # pauldrons: heavy, with a horn swept back and out
    for sign in (1, -1):
        y0, y1 = sorted((sign * 11.0, sign * 20.0))
        m.taper((-9, 9, y0, y1), (-7, 7, y0 + (1.0 if sign < 0 else 0), y1 - (1.0 if sign > 0 else 0)), z(39), z(52), "armor")
        m.spike((1.0, sign * 18.0, z(50.5)), (-6.0, sign * 25.0, z(58.5)), 2.4, 2.0, "armor", side=(1.0, 0.0, 0.0))
        m.box(6.5, 9.2, y0 + 0.5, y1 - 0.5, z(39.5), z(40.6), "rust")  # trim
    # rocket pods: six tubes a side, red warheads in the mouths
    for sign in (1, -1):
        y0, y1 = sorted((sign * 10.5, sign * 19.5))
        m.box(-3.0, 3.0, y0 + 2.0, y1 - 2.0, z(51.5), z(53.0), "steel")  # pylon
        m.taper((-8, 8, y0, y1), (-7, 7, y0 + 0.4, y1 - 0.4), z(53), z(61), "armor")
        m.box(7.8, 8.9, y0 + 0.2, y1 - 0.2, z(53.2), z(60.8), "steel")  # face plate
        for zz in (55.2, 58.8):
            for yy in (sign * 12.6, sign * 15.0, sign * 17.4):
                m.prism_x(8.6, 9.6, yy, z(zz), 1.1, "tube", sides=6)
                m.prism_x(8.5, 9.2, yy, z(zz), 0.6, "rust", sides=6)
        m.box(-6.0, 5.0, y0 + 1.2, y0 + 2.2, z(61), z(61.6), "steel")  # top rails
        m.box(-6.0, 5.0, y1 - 2.2, y1 - 1.2, z(61), z(61.6), "steel")
        py0, py1 = (sign * 19.5, sign * 20.2) if sign > 0 else (sign * 20.2, sign * 19.5)
        m.box(-6, 6, py0, py1, z(55.6), z(58.4), "team")  # team panel, outer face
    # reactor hump, dorsal fins, swept exhausts
    m.taper((-21, -10, -9.5, 9.5), (-19.5, -11, -8, 8), z(35), z(52), "armor")
    m.box(-21.8, -21.0, -6, 6, z(38), z(48), "steel")
    for k, xx in enumerate((-11.5, -15.0, -18.5)):
        m.spike((xx, 0.0, z(51.0)), (xx - 4.0, 0.0, z(58.5 - k * 1.2)), 0.7, 2.2, "armor", side=(0.0, 1.0, 0.0))
    for yy in (-6.0, 6.0):
        m.beam((-17.0, yy, z(50.0)), (-21.0, yy * 1.15, z(58.5)), 1.9, 1.9, "steel")
        m.beam((-20.8, yy * 1.15, z(58.0)), (-21.2, yy * 1.15, z(59.0)), 1.4, 1.4, "tube")
    return m


GUN_Z = 41.0
MUZZLE_X = 44.0


def gun_mesh(dz: float = 0.0) -> Mesh:
    m = Mesh()
    zc = GUN_Z + dz
    m.prism_x(16.0, 24.0, 0.0, zc, 3.6, "steel")  # recoil housing
    for x0 in (17.0, 22.2):
        m.prism_x(x0, x0 + 1.2, 0.0, zc, 4.1, "steel")  # collars
    m.prism_x(24.0, MUZZLE_X - 5.0, 0.0, zc, 2.3, "steel")  # long barrel
    m.prism_x(29.0, 34.0, 0.0, zc, 3.0, "steel")  # fume extractor
    m.prism_x(29.6, 30.4, 0.0, zc, 3.2, "rust")  # band
    # slotted brake: two baffles with the bore between
    m.box(MUZZLE_X - 5.0, MUZZLE_X - 3.0, -3.4, 3.4, zc - 2.4, zc + 2.4, "steel")
    m.prism_x(MUZZLE_X - 3.0, MUZZLE_X - 2.0, 0.0, zc, 2.0, "steel")
    m.box(MUZZLE_X - 2.0, MUZZLE_X, -3.4, 3.4, zc - 2.4, zc + 2.4, "steel")
    return m


# ---------------------------------------------------------------- render

def yaw_for_row(row: int) -> float:
    """Ground yaw (0 = screen east, CCW seen from above) whose nose projects to row's screen angle."""
    theta = math.radians(90.0 + 22.5 * row)  # y-down screen angle; 90° = south, then clockwise
    return math.atan2(-math.sin(theta) / math.sin(ELEV), math.cos(theta))


def project(v: np.ndarray, yaw: float, scale: float, ox: float, oy: float):
    """Model verts (N×3) → screen x, y (y down) and depth (bigger = nearer)."""
    c, s = math.cos(yaw), math.sin(yaw)
    X = v[:, 0] * c - v[:, 1] * s
    Y = v[:, 0] * s + v[:, 1] * c
    Z = v[:, 2]
    sx = ox + X * scale
    sy = oy - (Y * math.sin(ELEV) + Z * math.cos(ELEV)) * scale
    depth = -Y * math.cos(ELEV) + Z * math.sin(ELEV)
    return sx, sy, depth


def world_normal(n: np.ndarray, yaw: float) -> np.ndarray:
    c, s = math.cos(yaw), math.sin(yaw)
    return np.array([n[0] * c - n[1] * s, n[0] * s + n[1] * c, n[2]])


VIEW = np.array([0.0, -math.cos(ELEV), math.sin(ELEV)])


def render(mesh: Mesh, yaw: float, size: int = CELL, scale: float = SCALE, contact_y: float = CONTACT_Y,
           origin: tuple[float, float] | None = None, clip_z: float | None = None) -> np.ndarray:
    """`clip_z` drops every surface pixel below that model height (the waterline)."""
    ox, oy = origin if origin else (size / 2.0, size * contact_y)
    zbuf = np.full((size, size), -1e9)
    col = np.zeros((size, size, 3), np.uint8)
    alpha = np.zeros((size, size), bool)
    ys, xs = np.mgrid[0:size, 0:size]
    px = xs + 0.5
    py = ys + 0.5
    for tri, mat in mesh.tris:
        n = np.cross(tri[1] - tri[0], tri[2] - tri[0])
        ln = np.linalg.norm(n)
        if ln < 1e-9:
            continue
        nw = world_normal(n / ln, yaw)
        if np.dot(nw, VIEW) <= 1e-6:
            continue
        sx, sy, dp = project(tri, yaw, scale, ox, oy)
        x0 = max(0, int(math.floor(sx.min())))
        x1 = min(size - 1, int(math.ceil(sx.max())))
        y0 = max(0, int(math.floor(sy.min())))
        y1 = min(size - 1, int(math.ceil(sy.max())))
        if x0 > x1 or y0 > y1:
            continue
        area = (sx[1] - sx[0]) * (sy[2] - sy[0]) - (sx[2] - sx[0]) * (sy[1] - sy[0])
        if abs(area) < 1e-9:
            continue
        qx = px[y0:y1 + 1, x0:x1 + 1]
        qy = py[y0:y1 + 1, x0:x1 + 1]
        w0 = ((sx[1] - qx) * (sy[2] - qy) - (sx[2] - qx) * (sy[1] - qy)) / area
        w1 = ((sx[2] - qx) * (sy[0] - qy) - (sx[0] - qx) * (sy[2] - qy)) / area
        w2 = 1 - w0 - w1
        inside = (w0 >= -1e-6) & (w1 >= -1e-6) & (w2 >= -1e-6)
        if not inside.any():
            continue
        d = w0 * dp[0] + w1 * dp[1] + w2 * dp[2]
        if clip_z is not None:
            mz = w0 * tri[0, 2] + w1 * tri[1, 2] + w2 * tri[2, 2]
            inside &= mz >= clip_z - 1e-6
        zb = zbuf[y0:y1 + 1, x0:x1 + 1]
        win = inside & (d > zb)
        if not win.any():
            continue
        ramp = RAMPS[mat]
        lam = max(0.0, float(np.dot(nw, LIGHT)))
        val = 0.12 + 0.88 * lam
        tone = ramp[min(len(ramp) - 1, int(val * len(ramp)))]
        zb[win] = d[win]
        col[y0:y1 + 1, x0:x1 + 1][win] = tone
        alpha[y0:y1 + 1, x0:x1 + 1][win] = True
    return outline(col, alpha, zbuf)


def shift(a: np.ndarray, dy: int, dx: int, fill) -> np.ndarray:
    """Neighbor lookup without wrap-around (np.roll would bleed the feet onto the top row)."""
    out = np.full_like(a, fill)
    h, w = a.shape
    out[max(0, dy):h + min(0, dy), max(0, dx):w + min(0, dx)] = a[max(0, -dy):h - max(0, dy), max(0, -dx):w - max(0, dx)]
    return out


def outline(col: np.ndarray, alpha: np.ndarray, zbuf: np.ndarray, crease: float = 2.2) -> np.ndarray:
    h, w = alpha.shape
    rgba = np.zeros((h, w, 4), np.uint8)
    rgba[..., :3] = col
    rgba[..., 3] = np.where(alpha, 255, 0)
    # inner creases: the farther pixel of a depth step turns to outline
    inner = np.zeros_like(alpha)
    for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
        nb_a = shift(alpha, dy, dx, False)
        nb_z = shift(zbuf, dy, dx, -1e9)
        inner |= alpha & nb_a & (nb_z - zbuf > crease)
    rgba[inner, :3] = OUTLINE
    # outer 1 px ring
    grow = np.zeros_like(alpha)
    for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
        grow |= shift(alpha, dy, dx, False)
    ring = grow & ~alpha
    rgba[ring, :3] = OUTLINE
    rgba[ring, 3] = 255
    return rgba


# ---------------------------------------------------------------- sheets

def sheet(meshes_by_frame: list[Mesh], clip_z: float | None = None) -> tuple[Image.Image, list[dict]]:
    frames = len(meshes_by_frame)
    img = np.zeros((DIRS * CELL, frames * CELL, 4), np.uint8)
    stats = []
    for row in range(DIRS):
        yaw = yaw_for_row(row)
        for f, mesh in enumerate(meshes_by_frame):
            cell = render(mesh, yaw, clip_z=clip_z)
            img[row * CELL:(row + 1) * CELL, f * CELL:(f + 1) * CELL] = cell
            if f == 0:
                a = cell[..., 3] > 0
                ys, xs = np.nonzero(a)
                stats.append({
                    "dir": ENGINE_ORDER[row],
                    "bbox": [int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1] if len(xs) else None,
                    "edge_clip": bool(len(xs) and (xs.min() < 1 or ys.min() < 1 or xs.max() >= CELL - 1 or ys.max() >= CELL - 1)),
                })
    return Image.fromarray(img, "RGBA"), stats


def composite_rows(layers: list[Image.Image], frame: int = 0) -> list[Image.Image]:
    """Engine layer order for a turret facing its hull: gun behind when aiming up-screen."""
    out = []
    for row in range(DIRS):
        theta = math.radians(90.0 + 22.5 * row)
        gun_behind = math.sin(theta) < -1e-6
        cells = [l.crop((frame * CELL if l.width > CELL else 0, row * CELL,
                         (frame + 1) * CELL if l.width > CELL else CELL, (row + 1) * CELL)) for l in layers]
        hull, torso, gun = cells
        c = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
        if gun_behind:
            c.alpha_composite(gun)
        c.alpha_composite(hull)
        c.alpha_composite(torso)
        if not gun_behind:
            c.alpha_composite(gun)
        out.append(c)
    return out


def labeled_strip(cells: list[Image.Image], labels: list[str], bg=(74, 107, 50, 255)) -> Image.Image:
    n = len(cells)
    strip = Image.new("RGBA", (CELL * 8, (CELL + 14) * ((n + 7) // 8)), bg)
    d = ImageDraw.Draw(strip)
    for i, (c, lab) in enumerate(zip(cells, labels)):
        x = (i % 8) * CELL
        y = (i // 8) * (CELL + 14)
        strip.alpha_composite(c, (x, y + 14))
        d.text((x + 4, y + 1), lab, fill=(255, 255, 255, 255))
        cy = y + 14 + int(CELL * CONTACT_Y)
        d.line([(x + CELL / 2 - 6, cy), (x + CELL / 2 + 6, cy)], fill=(0, 255, 255, 255))
    return strip


def cameo(layers_meshes: tuple[Mesh, Mesh, Mesh], size: int = 128) -> Image.Image:
    yaw = yaw_for_row(13)  # ESE, a 3/4 front
    big = 4
    s = size * big
    hull, torso, gun = (render(m, yaw, size=s, scale=SCALE * big * 1.05, origin=(s * 0.46, s * 0.93)) for m in layers_meshes)
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    for layer in (hull, torso, gun):
        img.alpha_composite(Image.fromarray(layer, "RGBA"))
    bbox = img.getbbox()
    img = img.crop(bbox)
    k = (size - 8) / max(img.width, img.height)
    img = img.resize((max(1, round(img.width * k)), max(1, round(img.height * k))), Image.NEAREST)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.alpha_composite(img, ((size - img.width) // 2, size - 4 - img.height))
    return out


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    PREVIEW.mkdir(parents=True, exist_ok=True)
    walk = [legs_mesh(math.pi / 2 + 2 * math.pi * f / WALK_FRAMES) for f in range(WALK_FRAMES)]
    legs, legs_stats = sheet(walk)
    torso, torso_stats = sheet([torso_mesh()])
    gun, gun_stats = sheet([gun_mesh()])
    blegs, blegs_stats = sheet([braced_legs_mesh()])
    btorso, _ = sheet([torso_mesh(-BRACE_DROP)])
    bgun, _ = sheet([gun_mesh(-BRACE_DROP)])
    wlegs, wlegs_stats = sheet([wade_legs_mesh(math.pi / 2 + 2 * math.pi * f / WALK_FRAMES, f) for f in range(WALK_FRAMES)],
                               clip_z=-1e-3)
    wtorso, _ = sheet([torso_mesh(-WADE_SINK)])
    wgun, _ = sheet([gun_mesh(-WADE_SINK)])

    legs.save(OUT / "titan-legs.png")
    torso.save(OUT / "titan-torso.png")
    gun.save(OUT / "titan-gun.png")
    blegs.save(OUT / "titan-braced-legs.png")
    btorso.save(OUT / "titan-braced-torso.png")
    bgun.save(OUT / "titan-braced-gun.png")
    wlegs.save(OUT / "titan-wade-legs.png")
    wtorso.save(OUT / "titan-wade-torso.png")
    wgun.save(OUT / "titan-wade-gun.png")
    cameo((walk[0], torso_mesh(), gun_mesh())).save(OUT / "titan-cameo.png")

    labeled_strip(composite_rows([legs, torso, gun]), ENGINE_ORDER).save(PREVIEW / "titan-strip.png")
    labeled_strip(composite_rows([blegs, btorso, bgun]), ENGINE_ORDER).save(PREVIEW / "titan-braced-strip.png")
    labeled_strip(composite_rows([wlegs, wtorso, wgun]), ENGINE_ORDER, bg=(44, 74, 98, 255)).save(PREVIEW / "titan-wade-strip.png")
    e_row = ENGINE_ORDER.index("E")
    walk_cells = [legs.crop((f * CELL, e_row * CELL, (f + 1) * CELL, (e_row + 1) * CELL)) for f in range(WALK_FRAMES)]
    labeled_strip(walk_cells, [f"E f{f}" for f in range(WALK_FRAMES)]).save(PREVIEW / "titan-walk.png")

    heights = [s["bbox"][3] - s["bbox"][1] for s in legs_stats if s["bbox"]]
    med = float(np.median(heights))
    manifest = {
        "id": "titan",
        "cell": CELL,
        "contact_y": CONTACT_Y,
        "facing": DIRS,
        "order": ENGINE_ORDER,
        "sheets": {
            "titan-legs.png": {"cols": WALK_FRAMES, "rows": DIRS},
            "titan-torso.png": {"cols": 1, "rows": DIRS},
            "titan-gun.png": {"cols": 1, "rows": DIRS},
            "titan-braced-legs.png": {"cols": 1, "rows": DIRS},
            "titan-braced-torso.png": {"cols": 1, "rows": DIRS},
            "titan-braced-gun.png": {"cols": 1, "rows": DIRS},
            "titan-wade-legs.png": {"cols": WALK_FRAMES, "rows": DIRS},
            "titan-wade-torso.png": {"cols": 1, "rows": DIRS},
            "titan-wade-gun.png": {"cols": 1, "rows": DIRS},
        },
        "empty_dirs": [s["dir"] for s in legs_stats + torso_stats + gun_stats + blegs_stats + wlegs_stats if s["bbox"] is None],
        "size_pop_dirs": [s["dir"] for s in legs_stats if s["bbox"] and abs((s["bbox"][3] - s["bbox"][1]) - med) / med > 0.12],
        "edge_clip_dirs": [s["dir"] for s in legs_stats + torso_stats + gun_stats + blegs_stats + wlegs_stats if s["edge_clip"]],
    }
    (PREVIEW / "titan.json").write_text(json.dumps(manifest, indent=2))
    print(json.dumps({k: manifest[k] for k in ("empty_dirs", "size_pop_dirs", "edge_clip_dirs")}))


if __name__ == "__main__":
    main()
