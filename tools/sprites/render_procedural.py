#!/usr/bin/env python3
"""Procedural 3D turntable renders for units with no Blender source.

A small numpy rasterizer stands in for Blender: one mesh, one locked
camera, the subject yaws in place. It writes the same drop-in files the
Blender path does, so the engine and compose tools treat them alike.

  stuka     16 unique faces, 0001 = nose screen-south, clockwise 22.5°.
            gridlock/packages/client/src/assets/units/stuka/hull/0001.png … 0016.png
  fw190     the Fw 190 fighter, same camera, face order, and meters-to-px as the Stuka.
            gridlock/packages/client/src/assets/units/fw190/hull/0001.png … 0016.png
  bv222     the BV 222 transport flying boat, same camera and face order; its wingspan sets the scale.
            gridlock/packages/client/src/assets/units/bv222/hull/0001.png … 0016.png
  he111     the He 111 torpedo bomber, same camera and face order; its wingspan sets the scale.
            gridlock/packages/client/src/assets/units/he111/hull/0001.png … 0016.png
  horten    the Horten VII flying wing, same camera and face order; its wingspan sets the scale.
            gridlock/packages/client/src/assets/units/horten/hull/0001.png … 0016.png
  drone     the Drone Op's quadcopter, same camera and face order.
            gridlock/packages/client/src/assets/units/drone/hull/0001.png … 0016.png
  aswheli   the Destroyer's ASW helicopter, same camera and face order.
            gridlock/packages/client/src/assets/units/aswheli/hull/0001.png … 0016.png

The Airfield building lives in render_airfield.py.

Camera: orthographic, 30° down, so the ground foreshortens 2:1 like the map.
Each face yaws the model so its nose lands on the exact on-screen bearing of
that sheet row (engineRowFromScreen), not a raw 22.5° ground step.

No national insignia. The rear-fuselage band and the spinner stay neutral gray
so the game can tint them.

  python tools/sprites/render_procedural.py stuka \\
      --out gridlock/packages/client/src/assets/units/stuka/hull
  python tools/sprites/render_procedural.py fw190 \\
      --out gridlock/packages/client/src/assets/units/fw190/hull
  python tools/sprites/render_procedural.py drone \\
      --out gridlock/packages/client/src/assets/units/drone/hull
  python tools/sprites/render_procedural.py aswheli \\
      --out gridlock/packages/client/src/assets/units/aswheli/hull
"""

from __future__ import annotations

import argparse
import json
import math
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
from PIL import Image

OUTLINE = np.array([0x1A, 0x14, 0x10], dtype=np.float64) / 255
CAM_ELEV = math.radians(30.0)
LIGHT = np.array([-0.55, 0.45, 0.85])
LIGHT = LIGHT / np.linalg.norm(LIGHT)


def hex_rgb(h: str) -> np.ndarray:
    h = h.lstrip("#")
    return np.array([int(h[i : i + 2], 16) for i in (0, 2, 4)], dtype=np.float64) / 255


# Materials: name -> (base rgb, specular, alpha)
MAT = {
    "camo": (hex_rgb("#4a5a38"), 0.10, 1.0),
    "under": (hex_rgb("#8ea3ae"), 0.08, 1.0),
    "glass": (hex_rgb("#8fb0b8"), 0.45, 1.0),
    "frame": (hex_rgb("#34402c"), 0.05, 1.0),
    "metal": (hex_rgb("#3a3a36"), 0.20, 1.0),
    "tire": (hex_rgb("#1f1d1a"), 0.02, 1.0),
    "team": (hex_rgb("#7a7a74"), 0.10, 1.0),
    "bomb": (hex_rgb("#4b4f3e"), 0.18, 1.0),
    "prop": (hex_rgb("#b8b4a8"), 0.00, 0.22),
    "rotor": (hex_rgb("#c8c4b8"), 0.00, 0.42),
    "hazard": (hex_rgb("#d4a017"), 0.05, 1.0),
    "grass": (hex_rgb("#4a6b32"), 0.0, 1.0),
    "strip": (hex_rgb("#6f8a45"), 0.0, 1.0),
    "dirt": (hex_rgb("#8a6e52"), 0.0, 1.0),
    "concrete": (hex_rgb("#7a7a74"), 0.03, 1.0),
    "roof": (hex_rgb("#5a6b3d"), 0.06, 1.0),
    "wall": (hex_rgb("#6b5340"), 0.02, 1.0),
    "door": (hex_rgb("#2e2a24"), 0.0, 1.0),
    "rust": (hex_rgb("#8b3a2a"), 0.05, 1.0),
    "sock": (hex_rgb("#c45a12"), 0.0, 1.0),
    "white": (hex_rgb("#d8d4c4"), 0.0, 1.0),
    # Wade pool. Close to the map's water tile, with a pale lip of foam.
    "water": (hex_rgb("#1e5564"), 0.04, 1.0),
    "foam": (hex_rgb("#d5e4e0"), 0.02, 1.0),
}
CAMO_B = hex_rgb("#35432c")


@dataclass
class Mesh:
    verts: list[np.ndarray] = field(default_factory=list)
    tris: list[tuple[int, int, int, str]] = field(default_factory=list)

    def v(self, p) -> int:
        self.verts.append(np.asarray(p, dtype=np.float64))
        return len(self.verts) - 1

    def tri(self, a: int, b: int, c: int, mat: str) -> None:
        self.tris.append((a, b, c, mat))

    def quad(self, a: int, b: int, c: int, d: int, mat: str) -> None:
        self.tri(a, b, c, mat)
        self.tri(a, c, d, mat)

    def box(self, lo, hi, mat: str, top_mat: str | None = None) -> None:
        x0, y0, z0 = lo
        x1, y1, z1 = hi
        p = [self.v((x, y, z)) for z in (z0, z1) for y in (y0, y1) for x in (x0, x1)]
        # 0..3 bottom (x0y0,x1y0,x0y1,x1y1), 4..7 top
        self.quad(p[4], p[5], p[7], p[6], top_mat or mat)
        self.quad(p[0], p[2], p[3], p[1], mat)
        self.quad(p[0], p[1], p[5], p[4], mat)
        self.quad(p[2], p[6], p[7], p[3], mat)
        self.quad(p[0], p[4], p[6], p[2], mat)
        self.quad(p[1], p[3], p[7], p[5], mat)

    def loft(self, rings: list[list[np.ndarray]], mat, cap0: bool = True, cap1: bool = True) -> None:
        """Rings of equal length along the body. `mat` is a name or fn(ring_index, seg_index)."""
        ids = [[self.v(p) for p in ring] for ring in rings]
        n = len(rings[0])
        for r in range(len(ids) - 1):
            for s in range(n):
                a, b = ids[r][s], ids[r][(s + 1) % n]
                c, d = ids[r + 1][(s + 1) % n], ids[r + 1][s]
                m = mat(r, s) if callable(mat) else mat
                self.quad(a, b, c, d, m)
        for cap, ring in ((cap0, ids[0]), (cap1, ids[-1])):
            if not cap:
                continue
            ctr = self.v(np.mean([self.verts[i] for i in ring], axis=0))
            m = mat(0, 0) if callable(mat) else mat
            for s in range(n):
                self.tri(ctr, ring[s], ring[(s + 1) % n], m)


def ellipse_ring(x: float, cy: float, cz: float, hw: float, hh: float, n: int = 18) -> list[np.ndarray]:
    return [
        np.array([x, cy + hw * math.cos(2 * math.pi * k / n), cz + hh * math.sin(2 * math.pi * k / n)])
        for k in range(n)
    ]


def wing_panel(m: Mesh, root, tip, mat_top: str, mat_bot: str, thick_root: float, thick_tip: float) -> None:
    """root/tip: (x_lead, x_trail, y, z). A thin wedge airfoil panel."""
    (xl0, xt0, y0, z0), (xl1, xt1, y1, z1) = root, tip
    t0, t1 = thick_root / 2, thick_tip / 2
    rl_top = m.v((xl0, y0, z0 + t0 * 0.6))
    rt_top = m.v((xt0, y0, z0 + t0 * 0.2))
    tl_top = m.v((xl1, y1, z1 + t1 * 0.6))
    tt_top = m.v((xt1, y1, z1 + t1 * 0.2))
    rl_bot = m.v((xl0, y0, z0 - t0))
    rt_bot = m.v((xt0, y0, z0 - t0 * 0.2))
    tl_bot = m.v((xl1, y1, z1 - t1))
    tt_bot = m.v((xt1, y1, z1 - t1 * 0.2))
    rle = m.v((xl0 + 0.12, y0, z0))
    tle = m.v((xl1 + 0.08, y1, z1))
    m.quad(rl_top, rt_top, tt_top, tl_top, mat_top)
    m.quad(rl_bot, tl_bot, tt_bot, rt_bot, mat_bot)
    m.quad(rle, rl_top, tl_top, tle, mat_top)
    m.quad(rle, tle, tl_bot, rl_bot, mat_bot)
    m.quad(rt_top, rt_bot, tt_bot, tt_top, mat_bot)
    m.quad(tl_top, tt_top, tt_bot, tl_bot, mat_top)
    m.tri(tle, tl_top, tl_bot, mat_top)
    m.tri(rle, rl_bot, rl_top, mat_top)


def build_stuka() -> Mesh:
    """Ju 87 B in meters. +x nose, +y left wing, +z up. Wheels at z=0."""
    m = Mesh()
    zc = 2.35  # fuselage centerline height over the wheels
    # Fuselage loft: (x, half-width, half-height, center z offset)
    stations = [
        (5.05, 0.30, 0.34, 0.02),
        (4.70, 0.52, 0.62, 0.00),
        (3.60, 0.58, 0.74, -0.02),
        (2.30, 0.60, 0.78, 0.00),
        (0.60, 0.60, 0.80, 0.02),
        (-1.20, 0.54, 0.72, 0.06),
        (-3.00, 0.40, 0.56, 0.14),
        (-4.80, 0.22, 0.38, 0.24),
        (-6.00, 0.08, 0.20, 0.34),
    ]
    rings = [ellipse_ring(x, 0.0, zc + oz, hw, hh) for x, hw, hh, oz in stations]

    n_ring = len(rings[0])

    def fus_mat(r: int, s: int) -> str:
        if r == 6:
            return "team"  # neutral band ahead of the tail
        if r == 0:
            return "metal"
        # Lower third of the ring is the pale underside.
        if math.sin(2 * math.pi * (s + 0.5) / n_ring) < -0.45:
            return "under"
        return "camo"

    m.loft(rings, fus_mat)
    # Chin radiator
    m.box((3.1, -0.36, zc - 1.05), (4.4, 0.36, zc - 0.55), "metal")
    # Canopy greenhouse
    can = [
        (2.30, 0.20, 0.10),
        (1.90, 0.38, 0.38),
        (0.60, 0.42, 0.46),
        (-0.60, 0.40, 0.42),
        (-1.50, 0.26, 0.22),
    ]
    can_rings = [ellipse_ring(x, 0.0, zc + 0.55, hw, hh, 14) for x, hw, hh in can]

    def can_mat(r: int, s: int) -> str:
        return "frame" if s % 4 == 0 or r == 1 else "glass"

    m.loft(can_rings, can_mat)
    # Inverted gull wing: inner panels droop, outer panels rise.
    wz = zc - 0.55
    kink_y, kink_z = 2.45, zc - 1.25
    tip_y, tip_z = 6.9, zc - 0.55
    for side in (1, -1):
        wing_panel(
            m,
            (1.25, -1.35, 0.45 * side, wz),
            (1.05, -1.25, kink_y * side, kink_z),
            "camo",
            "under",
            0.42,
            0.34,
        )
        wing_panel(
            m,
            (1.05, -1.25, kink_y * side, kink_z),
            (0.55, -0.55, tip_y * side, tip_z),
            "camo",
            "under",
            0.34,
            0.14,
        )
        # Neutral panel near the wing tip for team tint.
        wing_panel(
            m,
            (0.62, -0.62, (tip_y - 1.1) * side, tip_z - 0.05 + 0.02),
            (0.56, -0.56, (tip_y - 0.3) * side, tip_z + 0.02),
            "team",
            "under",
            0.2,
            0.16,
        )
        # Trousered undercarriage from the kink down to the wheel spat.
        gy = kink_y * side
        leg = [
            ellipse_ring(0.25, gy, kink_z - 0.05, 0.22, 0.34, 10),
            ellipse_ring(0.25, gy, 0.95, 0.20, 0.30, 10),
        ]
        leg_rings = [[p + np.array([0.0, 0.0, 0.0]) for p in ring] for ring in leg]
        # Rotate the leg ring to be horizontal slices (loft goes down in z).
        leg_rings = [
            [np.array([0.25 + 0.45 * math.cos(2 * math.pi * k / 10), gy + 0.2 * math.sin(2 * math.pi * k / 10), z]) for k in range(10)]
            for z in (kink_z - 0.1, 0.9)
        ]
        m.loft(leg_rings, "camo")
        spat = [
            ellipse_ring(x, gy, 0.55, hw, hh, 10)
            for x, hw, hh in ((1.05, 0.06, 0.10), (0.75, 0.22, 0.42), (0.1, 0.24, 0.50), (-0.55, 0.12, 0.28))
        ]
        m.loft(spat, "camo")
        m.box((-0.05, gy - 0.07, 0.0), (0.55, gy + 0.07, 0.18), "tire")
    # Tailplane and fin
    for side in (1, -1):
        wing_panel(m, (-4.70, -5.85, 0.2 * side, zc + 0.40), (-5.05, -5.85, 2.75 * side, zc + 0.46), "camo", "under", 0.16, 0.08)
    m.box((-5.95, -0.06, zc + 0.35), (-4.95, 0.06, zc + 1.85), "camo")
    m.box((-6.05, -0.05, zc + 0.9), (-5.6, 0.05, zc + 1.9), "camo")
    # SC 250 under the belly on the crutch
    bomb = [ellipse_ring(x, 0.0, zc - 1.05, r, r, 12) for x, r in ((1.55, 0.05), (1.25, 0.24), (0.1, 0.25), (-0.75, 0.12))]
    m.loft(bomb, "bomb")
    for side in (1, -1):
        m.box((-1.05, 0.02 * side - 0.03, zc - 1.35), (-0.75, 0.02 * side + 0.03, zc - 0.75), "bomb")
    # Spinner (neutral) and a translucent prop disc
    spin = [ellipse_ring(x, 0.0, zc + 0.02, r, r, 12) for x, r in ((5.0, 0.26), (5.35, 0.18), (5.62, 0.02))]
    m.loft(spin, "team")
    ctr = m.v((5.18, 0.0, zc + 0.02))
    n = 28
    rim = [m.v((5.18, 1.7 * math.cos(2 * math.pi * k / n), zc + 0.02 + 1.7 * math.sin(2 * math.pi * k / n))) for k in range(n)]
    for k in range(n):
        m.tri(ctr, rim[k], rim[(k + 1) % n], "prop")
    return m


def build_fw190() -> Mesh:
    """Fw 190 in meters. +x nose, +y left wing, +z up. Wheels at z=0.

    Blunt radial cowl, bubble canopy, a straight low wing, wide-track gear, and
    one long 30 mm cannon slung in a gondola under each wing so the pair reads
    at gameplay size. No bomb. Neutral band ahead of the tail, neutral wingtip
    panels, and a neutral spinner for the team tint.
    """
    m = Mesh()
    zc = 1.9  # fuselage centerline height over the wheels
    stations = [
        (4.30, 0.50, 0.50, 0.00),
        (4.05, 0.66, 0.66, 0.00),
        (3.00, 0.66, 0.68, 0.02),
        (2.00, 0.56, 0.66, 0.05),
        (0.80, 0.50, 0.62, 0.08),
        (-1.00, 0.42, 0.52, 0.12),
        (-2.60, 0.30, 0.40, 0.18),
        (-4.00, 0.14, 0.26, 0.26),
        (-4.60, 0.05, 0.14, 0.30),
    ]
    rings = [ellipse_ring(x, 0.0, zc + oz, hw, hh) for x, hw, hh, oz in stations]
    n_ring = len(rings[0])

    def fus_mat(r: int, s: int) -> str:
        if r == 0:
            return "metal"  # cowl ring round the engine face
        if r == 6:
            return "team"
        if math.sin(2 * math.pi * (s + 0.5) / n_ring) < -0.45:
            return "under"
        return "camo"

    m.loft(rings, fus_mat)
    # Bubble canopy
    can = [
        (1.30, 0.18, 0.10),
        (0.90, 0.34, 0.36),
        (0.10, 0.36, 0.44),
        (-0.60, 0.30, 0.34),
        (-1.05, 0.12, 0.10),
    ]
    can_rings = [ellipse_ring(x, 0.0, zc + 0.52, hw, hh, 14) for x, hw, hh in can]

    def can_mat(r: int, s: int) -> str:
        return "frame" if r == 0 or s % 7 == 0 else "glass"

    m.loft(can_rings, can_mat)
    # Straight low wing, a little dihedral, rounded-off tips.
    wz = zc - 0.45
    tip_y, tip_z = 5.25, wz + 0.35
    gun_y = 2.35
    for side in (1, -1):
        wing_panel(m, (1.55, -0.95, 0.45 * side, wz), (0.60, -0.40, tip_y * side, tip_z), "camo", "under", 0.40, 0.14)
        wing_panel(
            m,
            (0.68, -0.45, (tip_y - 0.9) * side, tip_z - 0.06 + 0.02),
            (0.60, -0.40, (tip_y - 0.2) * side, tip_z + 0.02),
            "team",
            "under",
            0.2,
            0.14,
        )
        # Cannon gondola under the wing and its long barrel out past the leading edge.
        gy = gun_y * side
        gz = wz + (tip_z - wz) * (gun_y / tip_y) - 0.30
        pod = [ellipse_ring(x, gy, gz, r, r, 10) for x, r in ((1.55, 0.08), (1.30, 0.17), (-0.30, 0.17), (-0.70, 0.06))]
        m.loft(pod, "metal")
        m.box((1.50, gy - 0.07, gz - 0.07), (3.05, gy + 0.07, gz + 0.07), "metal")
        m.box((3.05, gy - 0.10, gz - 0.10), (3.30, gy + 0.10, gz + 0.10), "metal")  # muzzle brake
        # Wide-track main gear: leg, cover plate, and wheel.
        ly = 1.75 * side
        m.box((0.30, ly - 0.06, 0.30), (0.44, ly + 0.06, wz - 0.12), "metal")
        m.box((0.46, ly - 0.03, 0.40), (0.95, ly + 0.03, wz - 0.18), "camo")
        m.box((0.05, ly - 0.10, 0.0), (0.69, ly + 0.10, 0.64), "tire")
    # Tailplane and fin. The sheet flies level, so no tailwheel strut hangs under it.
    for side in (1, -1):
        wing_panel(m, (-3.70, -4.50, 0.15 * side, zc + 0.18), (-4.05, -4.50, 1.85 * side, zc + 0.20), "camo", "under", 0.14, 0.06)
    m.box((-4.60, -0.05, zc + 0.20), (-3.75, 0.05, zc + 1.05), "camo")
    m.box((-4.65, -0.04, zc + 0.60), (-4.20, 0.04, zc + 1.25), "camo")
    # Spinner (neutral) and a translucent prop disc
    spin = [ellipse_ring(x, 0.0, zc, r, r, 12) for x, r in ((4.28, 0.34), (4.60, 0.24), (4.88, 0.03))]
    m.loft(spin, "team")
    ctr = m.v((4.45, 0.0, zc))
    n = 28
    rim = [m.v((4.45, 1.65 * math.cos(2 * math.pi * k / n), zc + 1.65 * math.sin(2 * math.pi * k / n))) for k in range(n)]
    for k in range(n):
        m.tri(ctr, rim[k], rim[(k + 1) % n], "prop")
    return m


def build_bv222() -> Mesh:
    """BV 222 Wiking flying boat in meters. +x nose, +y left wing, +z up. Keel at z=0.

    A deep two-step boat hull, a long high wing on the hull's back carrying six
    engines on its leading edge, wing floats on struts outboard, and a single
    fin with the tailplane set on the hull. Pale boat bottom, splinter camo on
    top. Neutral band ahead of the tail, neutral wingtip panels, and neutral
    spinners for the team tint.
    """
    m = Mesh()
    zc = 2.8  # hull centerline height over the keel
    stations = [
        (18.0, 0.30, 0.60, 0.70),
        (17.2, 1.05, 1.55, 0.40),
        (15.4, 1.45, 2.25, 0.18),
        (12.0, 1.60, 2.60, 0.00),
        (5.0, 1.60, 2.60, 0.00),
        (0.0, 1.50, 2.40, 0.22),
        (-5.0, 1.20, 2.00, 0.62),
        (-10.0, 0.82, 1.50, 1.20),
        (-13.5, 0.62, 1.20, 1.60),
        (-15.5, 0.46, 0.96, 1.90),
        (-18.0, 0.14, 0.46, 2.30),
    ]
    rings = [ellipse_ring(x, 0.0, zc + oz, hw, hh, 20) for x, hw, hh, oz in stations]
    n_ring = len(rings[0])

    def hull_mat(r: int, s: int) -> str:
        if r == 0:
            return "metal"
        if r == 8:
            return "team"
        # The boat bottom is pale up to the chines.
        if math.sin(2 * math.pi * (s + 0.5) / n_ring) < -0.35:
            return "under"
        return "camo"

    m.loft(rings, hull_mat)
    # Flight-deck glazing high on the nose, and a row of cabin windows.
    can = [
        (15.2, 0.40, 0.10),
        (14.6, 0.95, 0.42),
        (13.2, 1.05, 0.52),
        (12.2, 0.90, 0.30),
    ]
    can_rings = [ellipse_ring(x, 0.0, zc + 2.1, hw, hh, 14) for x, hw, hh in can]

    def can_mat(r: int, s: int) -> str:
        return "frame" if r == 0 or s % 5 == 0 else "glass"

    m.loft(can_rings, can_mat)
    for side in (1, -1):
        for x in (9.0, 6.5, 4.0, 1.5, -1.0):
            m.box((x - 0.35, side * 1.52 - 0.06, zc + 0.55), (x + 0.35, side * 1.52 + 0.06, zc + 1.05), "glass")
    # Long high wing on a shallow fairing along the hull's back.
    wz = zc + 2.55
    m.box((-2.6, -0.9, zc + 1.9), (3.6, 0.9, wz), "camo")
    tip_y, tip_z = 23.0, wz + 0.45
    for side in (1, -1):
        wing_panel(m, (3.8, -2.6, 0.6 * side, wz), (1.6, -1.1, tip_y * side, tip_z), "camo", "under", 0.95, 0.30)
        wing_panel(
            m,
            (1.85, -1.25, (tip_y - 2.6) * side, tip_z - 0.05 + 0.03),
            (1.6, -1.1, (tip_y - 0.4) * side, tip_z + 0.03),
            "team",
            "under",
            0.34,
            0.28,
        )
        # Three engines a side on the leading edge.
        for ey in (4.6, 9.4, 14.2):
            y = ey * side
            u = ey / tip_y
            lead = 3.8 + (1.6 - 3.8) * u
            ez = wz + (tip_z - wz) * u - 0.05
            nac = [
                ellipse_ring(x, y, ez, r, r * 1.05, 12)
                for x, r in ((lead + 2.6, 0.42), (lead + 2.3, 0.66), (lead + 0.6, 0.70), (lead - 1.6, 0.46), (lead - 2.6, 0.12))
            ]
            m.loft(nac, lambda r, s: "metal" if r == 0 else "camo")
            spin = [ellipse_ring(x, y, ez, r, r, 10) for x, r in ((lead + 2.6, 0.30), (lead + 2.95, 0.18), (lead + 3.2, 0.02))]
            m.loft(spin, "team")
            ctr = m.v((lead + 2.8, y, ez))
            n = 24
            rim = [m.v((lead + 2.8, y + 1.75 * math.cos(2 * math.pi * k / n), ez + 1.75 * math.sin(2 * math.pi * k / n))) for k in range(n)]
            for k in range(n):
                m.tri(ctr, rim[k], rim[(k + 1) % n], "prop")
        # Wing float on a pair of struts, lowered.
        fy = 16.8 * side
        fz = wz - 2.7
        flt = [ellipse_ring(x, fy, fz, hw, hh, 10) for x, hw, hh in ((3.2, 0.08, 0.10), (2.4, 0.42, 0.40), (-0.4, 0.44, 0.42), (-2.2, 0.10, 0.14))]
        m.loft(flt, lambda r, s: "under" if math.sin(2 * math.pi * (s + 0.5) / 10) < -0.3 else "camo")
        for sx in (1.4, -0.6):
            m.box((sx - 0.12, fy - 0.08, fz + 0.2), (sx + 0.12, fy + 0.08, wz + 0.25), "metal")
    # Tailplane on the hull, and the tall single fin.
    tz = zc + 2.35
    for side in (1, -1):
        wing_panel(m, (-13.6, -17.4, 0.4 * side, tz), (-15.4, -17.6, 7.4 * side, tz + 0.35), "camo", "under", 0.36, 0.14)
    fin = [
        [np.array([-13.4, -0.14, tz]), np.array([-18.0, -0.14, tz]), np.array([-18.2, 0.14, tz]), np.array([-13.4, 0.14, tz])],
        [np.array([-16.2, -0.08, tz + 5.2]), np.array([-18.3, -0.08, tz + 5.2]), np.array([-18.4, 0.08, tz + 5.2]), np.array([-16.2, 0.08, tz + 5.2])],
    ]
    m.loft(fin, "camo")
    return m


def build_he111() -> Mesh:
    """He 111 H-6 torpedo bomber in meters. +x nose, +y left wing, +z up. Torpedo's belly lowest.

    The fully glazed stepless nose, a long slim fuselage, the elliptical wing with
    a Jumo 211 nacelle on each side (annular radiator ring round the engine face),
    the ventral Bola gondola, the dorsal gun position, an elliptical tailplane and
    single fin, and one LT F5b torpedo on a rack beside the gondola. The sheet
    flies level, so no gear hangs down. Neutral band ahead of the tail, neutral
    wingtip panels, and neutral spinners for the team tint.
    """
    m = Mesh()
    zc = 1.75  # fuselage centerline over the torpedo's belly
    stations = [
        (8.25, 0.10, 0.10, 0.06),
        (8.00, 0.52, 0.52, 0.05),
        (7.40, 0.80, 0.82, 0.03),
        (6.50, 0.88, 0.92, 0.00),
        (5.50, 0.90, 0.95, 0.00),
        (3.00, 0.88, 0.95, 0.00),
        (0.00, 0.80, 0.90, 0.05),
        (-3.00, 0.62, 0.72, 0.15),
        (-4.40, 0.52, 0.62, 0.22),
        (-5.10, 0.46, 0.56, 0.26),
        (-7.20, 0.22, 0.32, 0.38),
        (-8.20, 0.06, 0.12, 0.45),
    ]
    rings = [ellipse_ring(x, 0.0, zc + oz, hw, hh, 20) for x, hw, hh, oz in stations]
    n_ring = len(rings[0])

    def fus_mat(r: int, s: int) -> str:
        if r <= 2:
            # Stepless greenhouse: glass panes in a frame lattice, nose to cockpit.
            return "frame" if s % 5 == 0 or (r == 2 and s % 5 == 2) else "glass"
        if r == 8:
            return "team"
        if math.sin(2 * math.pi * (s + 0.5) / n_ring) < -0.45:
            return "under"
        return "camo"

    m.loft(rings, fus_mat)
    # Dorsal gun position: a low glazed hood behind the wing.
    dors = [ellipse_ring(x, 0.0, zc + 0.78, hw, hh, 12) for x, hw, hh in ((-0.4, 0.10, 0.06), (-0.9, 0.36, 0.26), (-1.9, 0.34, 0.22), (-2.4, 0.08, 0.05))]
    m.loft(dors, lambda r, s: "frame" if s % 4 == 0 else "glass")
    # Ventral Bola gondola under the forward fuselage, glazed at its back.
    bola = [
        ellipse_ring(x, 0.0, zc - 0.82 + oz, hw, hh, 12)
        for x, hw, hh, oz in ((3.2, 0.10, 0.08, 0.10), (2.8, 0.44, 0.34, 0.0), (0.6, 0.46, 0.36, 0.0), (-0.6, 0.30, 0.22, 0.08))
    ]
    m.loft(bola, lambda r, s: "glass" if r == 2 else "camo" if math.sin(2 * math.pi * (s + 0.5) / 12) > 0.3 else "under")
    # Elliptical wing, a little dihedral: root, two outer panels, and a rounded tip.
    wz = zc - 0.40
    panels = [
        (2.80, -2.50, 0.85, 0.00),
        (2.30, -2.00, 4.40, 0.20),
        (1.70, -1.55, 7.80, 0.42),
        (0.95, -1.05, 10.30, 0.58),
        (0.15, -0.45, 11.30, 0.64),
    ]
    thick = [0.70, 0.55, 0.38, 0.22, 0.10]
    eng_y = 3.6
    for side in (1, -1):
        for i in range(len(panels) - 1):
            (l0, t0, y0, z0), (l1, t1, y1, z1) = panels[i], panels[i + 1]
            wing_panel(m, (l0, t0, y0 * side, wz + z0), (l1, t1, y1 * side, wz + z1), "camo", "under", thick[i], thick[i + 1])
        wing_panel(m, (1.10, -1.15, 9.70 * side, wz + 0.56 + 0.03), (0.95, -1.05, 10.30 * side, wz + 0.58 + 0.03), "team", "under", 0.24, 0.22)
        # Jumo 211 nacelle on the leading edge, running back past the trailing edge.
        y = eng_y * side
        ez = wz + 0.14 - 0.05
        lead = 2.32
        nac = [
            ellipse_ring(x, y, ez, r, r * 1.08, 14)
            for x, r in ((lead + 2.25, 0.50), (lead + 2.05, 0.66), (lead + 1.20, 0.70), (lead - 1.50, 0.62), (lead - 3.60, 0.40), (lead - 5.10, 0.10))
        ]
        m.loft(nac, lambda r, s: "metal" if r == 0 else "under" if math.sin(2 * math.pi * (s + 0.5) / 14) < -0.5 else "camo")
        # Oil cooler scoop under the nacelle.
        m.box((lead + 0.4, y - 0.22, ez - 0.92), (lead + 1.6, y + 0.22, ez - 0.55), "metal")
        spin = [ellipse_ring(x, y, ez, r, r, 10) for x, r in ((lead + 2.25, 0.32), (lead + 2.60, 0.20), (lead + 2.85, 0.02))]
        m.loft(spin, "team")
        ctr = m.v((lead + 2.45, y, ez))
        n = 28
        rim = [m.v((lead + 2.45, y + 1.75 * math.cos(2 * math.pi * k / n), ez + 1.75 * math.sin(2 * math.pi * k / n))) for k in range(n)]
        for k in range(n):
            m.tri(ctr, rim[k], rim[(k + 1) % n], "prop")
    # Elliptical tailplane on the tail cone, and the single rounded fin.
    tz = zc + 0.32
    for side in (1, -1):
        wing_panel(m, (-6.10, -8.00, 0.25 * side, tz), (-6.55, -7.95, 2.60 * side, tz + 0.04), "camo", "under", 0.20, 0.14)
        wing_panel(m, (-6.55, -7.95, 2.60 * side, tz + 0.04), (-7.20, -7.80, 4.10 * side, tz + 0.06), "camo", "under", 0.14, 0.06)
    fin = [
        [np.array([-6.30, -0.10, tz]), np.array([-8.25, -0.10, tz]), np.array([-8.25, 0.10, tz]), np.array([-6.30, 0.10, tz])],
        [np.array([-7.00, -0.08, tz + 1.50]), np.array([-8.45, -0.08, tz + 1.50]), np.array([-8.45, 0.08, tz + 1.50]), np.array([-7.00, 0.08, tz + 1.50])],
        [np.array([-7.60, -0.05, tz + 2.30]), np.array([-8.30, -0.05, tz + 2.30]), np.array([-8.30, 0.05, tz + 2.30]), np.array([-7.60, 0.05, tz + 2.30])],
    ]
    m.loft(fin, "camo")
    # LT F5b torpedo on the rack to starboard of the gondola: blunt nose, long body, boxed tail.
    ty_, tzc, tr = -1.02, zc - 1.05, 0.25
    torp = [ellipse_ring(x, ty_, tzc, r, r, 12) for x, r in ((2.75, 0.04), (2.60, 0.18), (2.30, tr), (-1.70, tr), (-2.30, 0.12), (-2.45, 0.04))]
    m.loft(torp, "bomb")
    m.box((-2.55, ty_ - 0.34, tzc - 0.34), (-2.05, ty_ + 0.34, tzc + 0.34), "metal")  # tail box
    for rx in (1.2, -0.8):
        m.box((rx - 0.12, ty_ - 0.06, tzc + tr - 0.02), (rx + 0.12, ty_ + 0.30, zc - 0.55), "metal")  # rack crutch
    return m


def build_horten() -> Mesh:
    """Horten H.VII flying wing in meters. +x nose, +y left wing, +z up. Belly lowest.

    No fuselage and no tail: a thick centre section with a glazed two-seat
    canopy faired into the leading edge, a swept wing tapering to narrow tips,
    and two Argus engines buried in the wing either side of the centre, each
    turning a pusher propeller behind the trailing edge on an extension shaft.
    Splinter camo on top, pale underneath. A neutral band across the centre
    section's back, neutral wingtip panels, and neutral spinners for the team
    tint. The sheet flies level, so no gear hangs down.
    """
    m = Mesh()
    zc = 1.15  # centre-section chord line over the belly
    # Centre section: a short, deep lifting body, blunt in front, thinning to the trailing edge.
    stations = [
        (2.75, 0.10, 0.10, 0.00),
        (2.45, 0.62, 0.46, 0.02),
        (1.60, 0.90, 0.66, 0.04),
        (0.20, 0.95, 0.70, 0.04),
        (-1.40, 0.92, 0.56, 0.02),
        (-2.60, 0.80, 0.36, 0.00),
        (-3.50, 0.66, 0.12, 0.00),
    ]
    rings = [ellipse_ring(x, 0.0, zc + oz, hw, hh, 18) for x, hw, hh, oz in stations]
    n_ring = len(rings[0])

    def body_mat(r: int, s: int) -> str:
        if r == 0:
            return "metal"
        if math.sin(2 * math.pi * (s + 0.5) / n_ring) < -0.4:
            return "under"
        if r == 4 and math.sin(2 * math.pi * (s + 0.5) / n_ring) > 0.3:
            return "team"  # band across the back, where the others carry it ahead of the tail
        return "camo"

    m.loft(rings, body_mat)
    # Tandem canopy: a long low glazed hood on the centre section, framed.
    can = [(2.25, 0.16, 0.08), (1.85, 0.40, 0.34), (0.70, 0.44, 0.42), (-0.30, 0.38, 0.32), (-0.95, 0.12, 0.08)]
    can_rings = [ellipse_ring(x, 0.0, zc + 0.52, hw, hh, 14) for x, hw, hh in can]
    m.loft(can_rings, lambda r, s: "frame" if r == 0 or s % 4 == 0 or r == 2 else "glass")
    # Swept wing: root, engine bay, outer panel, and a narrow tip. A little dihedral.
    wz = zc - 0.05
    panels = [
        (2.05, -3.30, 0.80, 0.00),
        (1.45, -3.05, 2.40, 0.10),
        (-0.30, -2.90, 5.50, 0.28),
        (-2.10, -3.40, 8.90, 0.48),
        (-2.75, -3.45, 9.95, 0.55),
    ]
    thick = [0.80, 0.66, 0.42, 0.18, 0.10]
    eng_y = 2.40
    for side in (1, -1):
        for i in range(len(panels) - 1):
            (l0, t0, y0, z0), (l1, t1, y1, z1) = panels[i], panels[i + 1]
            top = "team" if i == len(panels) - 2 else "camo"
            wing_panel(m, (l0, t0, y0 * side, wz + z0), (l1, t1, y1 * side, wz + z1), top, "under", thick[i], thick[i + 1])
        # Engine bay: a low hump over the buried Argus, a cooling intake in the leading edge.
        y = eng_y * side
        ez = wz + 0.10
        hump = [
            ellipse_ring(x, y, ez, hw, hh, 12)
            for x, hw, hh in ((1.35, 0.12, 0.10), (0.90, 0.40, 0.42), (-1.40, 0.42, 0.40), (-2.80, 0.26, 0.22), (-3.15, 0.16, 0.14))
        ]
        m.loft(hump, lambda r, s: "metal" if r == 0 else "under" if math.sin(2 * math.pi * (s + 0.5) / 12) < -0.5 else "camo")
        # Extension shaft fairing, the spinner, and a translucent pusher disc behind the trailing edge.
        shaft = [ellipse_ring(x, y, ez, r, r, 10) for x, r in ((-3.10, 0.16), (-3.45, 0.10))]
        m.loft(shaft, "metal")
        spin = [ellipse_ring(x, y, ez, r, r, 10) for x, r in ((-3.45, 0.20), (-3.75, 0.14), (-3.95, 0.02))]
        m.loft(spin, "team")
        ctr = m.v((-3.55, y, ez))
        n = 28
        rim = [m.v((-3.55, y + 1.15 * math.cos(2 * math.pi * k / n), ez + 1.15 * math.sin(2 * math.pi * k / n))) for k in range(n)]
        for k in range(n):
            m.tri(ctr, rim[k], rim[(k + 1) % n], "prop")
    return m

def build_aswheli() -> Mesh:
    """The Destroyer's ASW helicopter in meters. +x nose, +y left, +z up. Skids at z=0.

    A small single-rotor machine: a glazed bubble cabin, an engine hump with a
    gray team-tint cowling, a slim tail boom with a team band, a fin and a
    blurred tail-rotor disc, twin skids, a blurred main-rotor disc with three
    blades over it, and three torpedoes slung under the cabin (one on the belly,
    one on each side pylon) with hazard noses.
    """
    m = Mesh()
    zc = 1.45
    # Cabin: glazed nose bubble running back into the body.
    cabin = [
        (2.35, 0.08, 0.08, "glass"),
        (2.05, 0.62, 0.62, "glass"),
        (1.35, 0.85, 0.82, "glass"),
        (0.4, 0.9, 0.85, "camo"),
        (-0.9, 0.78, 0.74, "camo"),
        (-1.6, 0.42, 0.45, "camo"),
    ]
    rings = [ellipse_ring(x, 0.0, zc, hw, hh, 16) for x, hw, hh, _ in cabin]
    mats = [mat for *_, mat in cabin]
    m.loft(rings, lambda r, s_: mats[min(r, len(mats) - 1)])
    # Engine hump behind the rotor mast, gray team-tint cowling.
    m.box((-1.2, -0.5, zc + 0.55), (0.5, 0.5, zc + 1.05), "team")
    # Tail boom, rising slightly, with a team band.
    boom = [ellipse_ring(x, 0.0, z, r, r, 10) for x, z, r in ((-1.5, zc + 0.15, 0.36), (-3.5, zc + 0.3, 0.22), (-6.4, zc + 0.5, 0.13))]
    m.loft(boom, lambda r, s_: "team" if r == 0 else "camo")
    # Fin and the tail-rotor disc on its right side.
    m.box((-6.8, -0.05, zc + 0.4), (-6.1, 0.05, zc + 1.4), "camo")
    n = 20
    ctr = m.v((-6.5, -0.22, zc + 0.85))
    rim = [m.v((-6.5 + 0.75 * math.cos(2 * math.pi * k / n), -0.22, zc + 0.85 + 0.75 * math.sin(2 * math.pi * k / n))) for k in range(n)]
    for k in range(n):
        m.tri(ctr, rim[k], rim[(k + 1) % n], "rotor")
    # Twin skids on struts.
    for oy in (-0.95, 0.95):
        rails = [ellipse_ring(x, oy, z, 0.07, 0.07, 6) for x, z in ((2.0, 0.22), (1.6, 0.08), (-1.6, 0.08))]
        m.loft(rails, "metal")
        for sx in (1.0, -1.0):
            m.box((sx - 0.05, oy * 0.55 - 0.05, 0.08), (sx + 0.05, oy + 0.05, zc - 0.5), "metal")
    # Three torpedoes: one under the belly, one on each side pylon.
    for oy, z in ((0.0, zc - 0.95), (-1.25, zc - 0.55), (1.25, zc - 0.55)):
        body = [ellipse_ring(x, oy, z, r, r, 10) for x, r in ((1.55, 0.05), (1.35, 0.18), (-1.0, 0.18), (-1.25, 0.1))]
        m.loft(body, "bomb")
        nose = [ellipse_ring(x, oy, z, r, r, 10) for x, r in ((1.56, 0.06), (1.3, 0.19))]
        m.loft(nose, "hazard")
        if oy:
            m.box((-0.1, min(oy, oy * 0.6), z + 0.1), (0.3, max(oy, oy * 0.6), zc - 0.35), "metal")
    # Rotor mast, hub, a blurred disc, and three blades over it.
    zr = zc + 1.55
    m.box((-0.12, -0.12, zc + 1.0), (0.12, 0.12, zr), "metal")
    rr = 5.2
    n = 40
    ctr = m.v((0.0, 0.0, zr))
    rim = [m.v((rr * math.cos(2 * math.pi * k / n), rr * math.sin(2 * math.pi * k / n), zr)) for k in range(n)]
    for k in range(n):
        m.tri(ctr, rim[k], rim[(k + 1) % n], "rotor")
    for k in range(3):
        a = 2 * math.pi * k / 3 + 0.3
        ca, sa = math.cos(a), math.sin(a)
        w = 0.14
        p = [
            m.v((-sa * w, ca * w, zr + 0.03)),
            m.v((rr * ca - sa * w, rr * sa + ca * w, zr + 0.03)),
            m.v((rr * ca + sa * w, rr * sa - ca * w, zr + 0.03)),
            m.v((sa * w, -ca * w, zr + 0.03)),
        ]
        m.quad(p[0], p[1], p[2], p[3], "metal")
    return m


def build_drone() -> Mesh:
    """Small X-frame quadcopter in decimeters. +x nose, +y left, +z up. Skids at z=0.

    Four arms on the diagonals, a motor and a blurred rotor disc (with a thin
    guard ring so the disc reads at gameplay size) at each tip, a neutral team
    panel on the deck, and a charge / camera pod slung under the body. The two
    front motor caps are hazard orange so the nose reads at any yaw.
    """
    m = Mesh()
    zb = 1.08  # body centerline; the pod's belly is the lowest point (contact)
    # Body: a flattened octagonal hull, longer than wide.
    body = [ellipse_ring(x, 0.0, zb, hw, hh, 8) for x, hw, hh in ((1.5, 0.42, 0.20), (1.1, 0.80, 0.34), (-0.8, 0.80, 0.34), (-1.4, 0.50, 0.22))]
    m.loft(body, "frame")
    m.box((-0.6, -0.45, zb + 0.26), (0.7, 0.45, zb + 0.40), "team")  # battery lid / team panel
    arm_len = 2.45
    rotor_r = 1.1
    for sx, sy in ((1, 1), (1, -1), (-1, 1), (-1, -1)):
        ax, ay = sx * arm_len * math.cos(math.pi / 4), sy * arm_len * math.sin(math.pi / 4)
        # Arm: a thin box along the diagonal (built from a loft of square rings).
        rings = []
        for t in (0.25, 1.0):
            cx, cy = ax * t, ay * t
            px, py = -sy * 0.12, sx * 0.12  # perpendicular half-width
            rings.append([
                np.array([cx + px, cy + py, zb + 0.10]),
                np.array([cx - px, cy - py, zb + 0.10]),
                np.array([cx - px, cy - py, zb - 0.06]),
                np.array([cx + px, cy + py, zb - 0.06]),
            ])
        m.loft(rings, "frame")
        # Motor can
        motor = [
            [np.array([ax + 0.26 * math.cos(2 * math.pi * k / 10), ay + 0.26 * math.sin(2 * math.pi * k / 10), z]) for k in range(10)]
            for z in (zb - 0.12, zb + 0.36)
        ]
        m.loft(motor, "sock" if sx > 0 else "metal")
        # Blurred rotor disc and a thin guard ring just above the motor
        zr = zb + 0.42
        n = 28
        ctr = m.v((ax, ay, zr))
        rim = [m.v((ax + rotor_r * math.cos(2 * math.pi * k / n), ay + rotor_r * math.sin(2 * math.pi * k / n), zr)) for k in range(n)]
        for k in range(n):
            m.tri(ctr, rim[k], rim[(k + 1) % n], "rotor")
        inner = [m.v((ax + (rotor_r - 0.07) * math.cos(2 * math.pi * k / n), ay + (rotor_r - 0.07) * math.sin(2 * math.pi * k / n), zr + 0.01)) for k in range(n)]
        outer = [m.v((ax + (rotor_r + 0.03) * math.cos(2 * math.pi * k / n), ay + (rotor_r + 0.03) * math.sin(2 * math.pi * k / n), zr + 0.01)) for k in range(n)]
        for k in range(n):
            m.quad(inner[k], outer[k], outer[(k + 1) % n], inner[(k + 1) % n], "metal")
    # Charge / camera pod slung under the body, lens forward, hazard band on the charge.
    zp = zb - 0.62
    pod = [ellipse_ring(x, 0.0, zp, r, r, 12) for x, r in ((1.05, 0.12), (0.85, 0.42), (-0.45, 0.44), (-0.95, 0.18))]
    m.loft(pod, "bomb")
    band = [ellipse_ring(x, 0.0, zp, 0.46, 0.46, 12) for x in (-0.05, -0.30)]
    m.loft(band, "hazard")
    m.box((-0.2, -0.1, zb - 0.3), (0.3, 0.1, zb - 0.1), "metal")  # pylon
    lens = [ellipse_ring(x, 0.0, zp, r, r, 10) for x, r in ((1.08, 0.22), (1.2, 0.14))]
    m.loft(lens, "glass")
    return m


def camo_color(p: np.ndarray) -> np.ndarray:
    """Straight-edged splinter pattern in model space."""
    a = math.floor(p[0] * 0.55 + p[1] * 0.95 + 0.3)
    b = math.floor(p[0] * -0.8 + p[1] * 0.45 + 0.7)
    return MAT["camo"][0] if (a + b) % 2 == 0 else CAMO_B


@dataclass
class Frame:
    color: np.ndarray
    alpha: np.ndarray


def rasterize(
    mesh: Mesh,
    to_screen,
    size: tuple[int, int],
    model_normal_fn=None,
    clip_z: float | None = None,
) -> Frame:
    """to_screen(pts[N,3] world) -> (sx, sy, depth) arrays; bigger depth is closer.

    `clip_z` drops every surface pixel whose model height is below that plane
    (a waterline). Yaw is about Z, so model Z is the height.
    """
    w, h = size
    verts = np.array(mesh.verts)
    sx, sy, dep = to_screen(verts)
    zbuf = np.full((h, w), -np.inf)
    col = np.zeros((h, w, 3))
    alpha = np.zeros((h, w))
    translucent: list[int] = []
    for ti, (a, b, c, mat) in enumerate(mesh.tris):
        if MAT[mat][2] < 1:
            translucent.append(ti)
            continue
        _draw_tri(mesh, verts, sx, sy, dep, a, b, c, mat, zbuf, col, alpha, model_normal_fn, blend=False, clip_z=clip_z)
    for ti in translucent:
        a, b, c, mat = mesh.tris[ti]
        _draw_tri(mesh, verts, sx, sy, dep, a, b, c, mat, zbuf, col, alpha, model_normal_fn, blend=True, clip_z=clip_z)
    return Frame(col, alpha)


def _shade(mat: str, n_world: np.ndarray, base: np.ndarray) -> np.ndarray:
    spec = MAT[mat][1]
    lam = max(0.0, float(np.dot(n_world, LIGHT)))
    view = np.array([0.0, -math.cos(CAM_ELEV), math.sin(CAM_ELEV)])
    half = LIGHT + view
    half /= np.linalg.norm(half)
    s = max(0.0, float(np.dot(n_world, half))) ** 24 * spec * 1.6
    rim = 0.0
    return np.clip(base * (0.42 + 0.72 * lam) + s + rim, 0, 1)


def _draw_tri(mesh, verts, sx, sy, dep, a, b, c, mat, zbuf, col, alpha, model_normal_fn, blend, clip_z=None):
    h, w = zbuf.shape
    x0, y0, x1, y1, x2, y2 = sx[a], sy[a], sx[b], sy[b], sx[c], sy[c]
    area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0)
    if abs(area) < 1e-9:
        return
    minx = max(0, int(math.floor(min(x0, x1, x2))))
    maxx = min(w - 1, int(math.ceil(max(x0, x1, x2))))
    miny = max(0, int(math.floor(min(y0, y1, y2))))
    maxy = min(h - 1, int(math.ceil(max(y0, y1, y2))))
    if minx > maxx or miny > maxy:
        return
    xs, ys = np.meshgrid(np.arange(minx, maxx + 1) + 0.5, np.arange(miny, maxy + 1) + 0.5)
    w0 = ((x1 - xs) * (y2 - ys) - (x2 - xs) * (y1 - ys)) / area
    w1 = ((x2 - xs) * (y0 - ys) - (x0 - xs) * (y2 - ys)) / area
    w2 = 1 - w0 - w1
    inside = (w0 >= 0) & (w1 >= 0) & (w2 >= 0)
    if clip_z is not None:
        mz = w0 * float(verts[a, 2]) + w1 * float(verts[b, 2]) + w2 * float(verts[c, 2])
        inside = inside & (mz >= clip_z)
    if not inside.any():
        return
    d = w0 * dep[a] + w1 * dep[b] + w2 * dep[c]
    zb = zbuf[miny : maxy + 1, minx : maxx + 1]
    vis = inside & (d > zb + (1e-6 if not blend else -1e-3))
    if not vis.any():
        return
    # World-space normal, oriented toward the camera.
    pa, pb, pc = model_normal_fn(verts[a], verts[b], verts[c]) if model_normal_fn else (verts[a], verts[b], verts[c])
    n = np.cross(pb - pa, pc - pa)
    ln = np.linalg.norm(n)
    if ln < 1e-12:
        return
    n /= ln
    view = np.array([0.0, -math.cos(CAM_ELEV), math.sin(CAM_ELEV)])
    if np.dot(n, view) < 0:
        n = -n
    base, _, a_mat = MAT[mat]
    if mat == "camo":
        base = camo_color((mesh.verts[a] + mesh.verts[b] + mesh.verts[c]) / 3)
    shaded = _shade(mat, n, base)
    region_c = col[miny : maxy + 1, minx : maxx + 1]
    region_a = alpha[miny : maxy + 1, minx : maxx + 1]
    if blend:
        region_c[vis] = region_c[vis] * (1 - a_mat) + shaded * a_mat
        region_a[vis] = region_a[vis] + (1 - region_a[vis]) * a_mat
        return
    zb[vis] = d[vis]
    region_c[vis] = shaded
    region_a[vis] = 1.0


def add_outline(frame: Frame, px: int) -> Frame:
    a = frame.alpha > 0.5
    grown = a.copy()
    for dy in range(-px, px + 1):
        for dx in range(-px, px + 1):
            if dx * dx + dy * dy > px * px:
                continue
            grown |= np.roll(np.roll(a, dy, axis=0), dx, axis=1)
    ring = grown & ~a
    col = frame.color.copy()
    alpha = frame.alpha.copy()
    col[ring] = OUTLINE
    alpha[ring] = 1.0
    # Soft parts (prop disc) keep their own alpha over the outline.
    return Frame(col, alpha)


def downsample(frame: Frame, k: int) -> Image.Image:
    h, w = frame.alpha.shape
    a = frame.alpha.reshape(h // k, k, w // k, k).mean(axis=(1, 3))
    premul = (frame.color * frame.alpha[..., None]).reshape(h // k, k, w // k, k, 3).mean(axis=(1, 3))
    c = np.where(a[..., None] > 1e-6, premul / np.maximum(a[..., None], 1e-6), 0)
    rgba = np.dstack([np.clip(c, 0, 1), np.clip(a, 0, 1)])
    return Image.fromarray((rgba * 255 + 0.5).astype(np.uint8), "RGBA")


def screen_to_ground_yaw(phi: float) -> float:
    """Ground yaw whose 30° projection points the nose at screen angle phi (y down)."""
    return math.atan2(-math.sin(phi) / math.sin(CAM_ELEV), math.cos(phi))


def render_stuka(out: Path, cell: int = 256, ss: int = 4) -> None:
    # Meters -> px. Wingspan 13.8 m fits the cell with room for the outline.
    render_turntable(build_stuka(), out, "stuka_hull", "stuka-hull.json", 0.062, 1.2, cell=cell, ss=ss)


def render_fw190(out: Path, cell: int = 256, ss: int = 4) -> None:
    # Same meters -> px as the Stuka, so the smaller fighter reads smaller in the source cell.
    render_turntable(build_fw190(), out, "fw190_hull", "fw190-hull.json", 0.062, 1.0, cell=cell, ss=ss)


def render_bv222(out: Path, cell: int = 256, ss: int = 4) -> None:
    # A 46 m span cannot share the Stuka's meters -> px, so the wingspan sets the scale
    # (the aircraft rule): same camera, light, palette, and outline, drawn bigger in game.
    render_turntable(build_bv222(), out, "bv222_hull", "bv222-hull.json", 0.0195, 4.4, cell=cell, ss=ss)


def render_he111(out: Path, cell: int = 256, ss: int = 4) -> None:
    # A 22.6 m span: like the BV 222, the wingspan sets the scale and fills the cell
    # the way the Stuka's does (span x scale ~ 0.86 of the cell).
    render_turntable(build_he111(), out, "he111_hull", "he111-hull.json", 0.038, 1.6, cell=cell, ss=ss)


def render_horten(out: Path, cell: int = 256, ss: int = 4) -> None:
    # A 20 m span: like the He 111, the wingspan sets the scale and fills the cell
    # the way the Stuka's does (span x scale ~ 0.84 of the cell).
    render_turntable(build_horten(), out, "horten_hull", "horten-hull.json", 0.042, 1.2, cell=cell, ss=ss)


def render_drone(out: Path, cell: int = 256, ss: int = 4) -> None:
    # Decimeters -> px. Rotor tip to rotor tip is ~6 dm across the diagonal; the widest yaw fits the cell.
    render_turntable(build_drone(), out, "drone_hull", "drone-hull.json", 0.115, 0.9, cy_frac=0.56, cell=cell, ss=ss, outline_px=2)
    # Static 72x72 cameo from the east face (CSS fallback; the client also composes --drone-cameo at runtime).
    east = Image.open(out / "0013.png").convert("RGBA")
    crop = east.crop(east.getbbox())
    fit = min(64 / crop.width, 64 / crop.height)
    small = crop.resize((max(1, round(crop.width * fit)), max(1, round(crop.height * fit))), Image.Resampling.LANCZOS)
    cameo = Image.new("RGBA", (72, 72), (0, 0, 0, 0))
    cameo.alpha_composite(small, ((72 - small.width) // 2, (72 - small.height) // 2))
    cameo.save(out.parent.parent / "drone-cameo.png")
    print("wrote", out.parent.parent / "drone-cameo.png")


def render_aswheli(out: Path, cell: int = 256, ss: int = 4) -> None:
    # Meters -> px. The main-rotor disc (10.4 m) sets the scale, like a wingspan does for a plane.
    # The tail boom is long behind the mast: slide the model forward so the yawing boom stays in the cell.
    mesh = build_aswheli()
    mesh.verts = [v + np.array([1.0, 0.0, 0.0]) for v in mesh.verts]
    render_turntable(mesh, out, "aswheli_hull", "aswheli-hull.json", 0.068, 1.4, cy_frac=0.58, cell=cell, ss=ss)
    east = Image.open(out / "0015.png").convert("RGBA")
    crop = east.crop(east.getbbox())
    fit = min(66 / crop.width, 66 / crop.height)
    small = crop.resize((max(1, round(crop.width * fit)), max(1, round(crop.height * fit))), Image.Resampling.LANCZOS)
    cameo = Image.new("RGBA", (72, 72), (0, 0, 0, 0))
    cameo.alpha_composite(small, ((72 - small.width) // 2, (72 - small.height) // 2))
    cameo.save(out.parent.parent / "aswheli-cameo.png")
    print("wrote", out.parent.parent / "aswheli-cameo.png")


def paint_over(base: Frame, top: Frame) -> Frame:
    """`top` covers `base`. A clipped hull painted over a pool keeps the pool in the hole."""
    a = top.alpha[..., None]
    color = base.color * (1.0 - a) + top.color * a
    alpha = np.maximum(base.alpha, top.alpha)
    return Frame(np.clip(color, 0, 1), alpha)


def render_turntable(
    mesh: Mesh,
    out: Path,
    asset_id: str,
    manifest_name: str,
    scale_frac: float,
    z_mid: float,
    cy_frac: float = 0.58,
    cell: int = 256,
    ss: int = 4,
    outline_px: int = 1,
    clip_z: float | None = None,
    underlay: Mesh | None = None,
) -> None:
    """16 unique faces of one mesh, 0001 = nose screen-south, clockwise. `scale_frac` is px per model unit / cell px.

    `clip_z` cuts the mesh on a model-height plane. `underlay` (a pool) is drawn
    first, without an outline, and the outlined mesh is painted over it.
    """
    out.mkdir(parents=True, exist_ok=True)
    size = cell * ss
    scale = size * scale_frac
    ce, se = math.cos(CAM_ELEV), math.sin(CAM_ELEV)
    manifest = {"id": asset_id, "cell": cell, "rows": 16, "facing": 16, "order": [], "files": []}
    names = ["S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW", "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE"]
    for k in range(16):
        phi = math.pi / 2 + k * math.pi / 8  # screen angle: row 0 down, then clockwise on screen
        yaw = screen_to_ground_yaw(phi)
        cy, sy_ = math.cos(yaw), math.sin(yaw)

        def to_world(p: np.ndarray) -> np.ndarray:
            x, y, z = p[..., 0], p[..., 1], p[..., 2]
            # model +x (nose) -> ground (cos yaw, sin yaw); model +y (left wing) -> 90° counter-clockwise
            gx = x * cy - y * sy_
            gy = x * sy_ + y * cy
            return np.stack([gx, gy, z], axis=-1)

        def to_screen(verts: np.ndarray):
            wv = to_world(verts)
            X, Y, Z = wv[:, 0], wv[:, 1], wv[:, 2]
            sx = size / 2 + X * scale
            syy = size * cy_frac - (Y * se + (Z - z_mid) * ce) * scale
            depth = -Y * ce + Z * se
            return sx, syy, depth

        def normal_fn(a, b, c):
            return to_world(a), to_world(b), to_world(c)

        fr = rasterize(mesh, to_screen, (size, size), normal_fn, clip_z=clip_z)
        fr = add_outline(fr, max(1, ss * outline_px))
        if underlay is not None:
            pool = rasterize(underlay, to_screen, (size, size), normal_fn)
            fr = paint_over(pool, fr)
        img = downsample(fr, ss)
        name = f"{k + 1:04d}.png"
        img.save(out / name)
        manifest["order"].append(names[k])
        manifest["files"].append(name)
        print("wrote", out / name, img.getbbox())
    (out.parent / manifest_name).write_text(json.dumps(manifest, indent=2) + "\n")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("what", choices=["stuka", "fw190", "bv222", "he111", "horten", "drone", "aswheli"])
    ap.add_argument("--out", required=True)
    args = ap.parse_args()
    if args.what == "bv222":
        render_bv222(Path(args.out))
    elif args.what == "he111":
        render_he111(Path(args.out))
    elif args.what == "horten":
        render_horten(Path(args.out))
    elif args.what == "drone":
        render_drone(Path(args.out))
    elif args.what == "aswheli":
        render_aswheli(Path(args.out))
    elif args.what == "fw190":
        render_fw190(Path(args.out))
    else:
        render_stuka(Path(args.out))


if __name__ == "__main__":
    main()
