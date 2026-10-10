#!/usr/bin/env python3
"""Bloom aircraft (Skybrood): Watcher Moth, Razorwing, Gasbag, Drifter, Harpy. One 16-face hull each.

A fork of render_xeno_air.py under the air lock (render_procedural.py): same numpy
rasterizer, camera, light, outline, face order, 256 source cell composed to the
128 cell at runtime with STUKA_OPTS (contactY 0.8, padding 2), the lowest point
(legs, sac, tendril tips, the clutched eel) at z = 0 as the plane's wheels. Meters
-> px is the Stuka's 0.062 share of the cell, except the Harpy, whose wingspan sets
its scale the way the He 111's does (0.042, the Horten's). The look is the Bloom
palette lock (gridlock/docs/factions/bloom.md): wet flesh, ivory chitin, dark
membrane, amber glow, a gray team plate on the back of each. No metal.

  moth       Watcher Moth (recon): a huge pale moth, broad ivory wings with dark
             rings round eye-spots that are real amber eyes with dark pupils,
             feathered antennae, a furred thorax with the team plate. True scale
             beside the Razorwing, like the Gnat, so it draws small.
  razorwing  fighter: a swift. Crescent membrane wings with ivory blade leading
             edges and serrations, a bone beak and amber eyes, a plated body,
             forked tail streamers, a quill gun bundle under each wing root.
  gasbag     bomber: a floating bladder ribbed with ivory hoops, a gray carapace
             plate and spine on top, small membrane fins out to the sides and aft,
             a small face at the front, a glowing amber bomb sac dangling below
             in ivory claws (the lowest point).
  drifter    hover: a sky-jelly laid out like the Overseer (bell up top, tendrils
             to z = 0): a translucent bell with ivory ribs and an amber core, a
             gray crown plate, a scalloped rim with three amber eyes at the front
             (the heading), long stinging tendrils hanging down and trailing back
             with amber stinger nodes, two frilled oral arms.
  harpy      torpedo bomber: a long-necked sea-bird-wyrm, broad membrane wings on
             ivory arm and finger bones, a beaked ivory skull, a wyrm tail with a
             fin, a living eel (amber spots) clutched in its talons underneath.

0001 = nose screen-south, then clockwise 22.5 deg through 0016.

  python3 tools/sprites/render_bloom_air.py moth
  python3 tools/sprites/render_bloom_air.py razorwing
  python3 tools/sprites/render_bloom_air.py gasbag
  python3 tools/sprites/render_bloom_air.py drifter
  python3 tools/sprites/render_bloom_air.py harpy

Writes gridlock/packages/client/src/assets/units/<id>/hull/0001..0016.png,
<id>/<id>-hull.json, <id>-cameo.png (72 px), and previews in
tools/sprites/preview/<id>-*.png.
"""

from __future__ import annotations

import argparse
import math

import numpy as np

from bloom_seaair_common import (UNITS, cameo72, chain, check, disc, dome_z, ellipsoid, eye, knob, loft_body, paddle,
                                 quills, ribbed_mat, ribbed_stations, tube, wavy)
from render_procedural import Mesh, render_turntable

SCALE_FRAC = 0.062  # the Stuka's and the Fw 190's meters -> px


# ---------------------------------------------------------------- wings


def bwing(m: Mesh, side: int, lead_fn, trail_fn, root_y: float, tip_y: float, z0: float, z1: float, mat,
          spar: str | None = "bone_l", spar_r: float = 0.09, veins: int = 3, vein_mat: str = "bone", n: int = 12):
    """A flat wing sheet. lead_fn / trail_fn(t) give x along the span (t 0 root .. 1 tip).

    Returns (lead points, trail points, z(y)) so callers can lay discs and bones on it.
    """
    lead, trail = [], []
    for i in range(n + 1):
        t = i / n
        y = root_y + (tip_y - root_y) * t
        z = z0 + (z1 - z0) * t
        lead.append(np.array([lead_fn(t), side * y, z]))
        trail.append(np.array([trail_fn(t), side * y, z]))
    for i in range(n):
        a, b = m.v(lead[i]), m.v(lead[i + 1])
        c, d = m.v(trail[i + 1]), m.v(trail[i])
        mt = mat(i) if callable(mat) else mat
        m.quad(a, b, c, d, mt)
    if spar:
        for i in range(n):
            r = spar_r * (1 - 0.7 * i / n)
            tube(m, lead[i] + np.array([0, 0, 0.02]), lead[i + 1] + np.array([0, 0, 0.02]), r, r * 0.92, spar, n=5)
    for k in range(veins):
        f = (k + 1) / (veins + 1)
        root = lead[0] * (1 - f) + trail[0] * f + np.array([0, 0, 0.025])
        j = min(n, int(round(n * (0.55 + 0.4 * (1 - f)))))
        tip = lead[j] * (1 - f * 0.9) + trail[j] * (f * 0.9) + np.array([0, 0, 0.025])
        tube(m, root, tip, 0.045, 0.025, vein_mat, n=4)

    def zf(y: float) -> float:
        t = (abs(y) - root_y) / (tip_y - root_y)
        return z0 + (z1 - z0) * min(max(t, 0.0), 1.0)

    return lead, trail, zf


def rounded(lead0: float, lead1: float, trail0: float, trail1: float, start: float = 0.65, p: float = 1.0):
    """lead / trail fns closing to a rounded tip over the last (1 - start) of the span."""

    def k(t: float) -> float:
        return math.sqrt(max(0.0, 1 - ((t - start) / (1 - start)) ** 2)) if t > start else 1.0

    def mid(t: float) -> float:
        return (lead0 + (lead1 - lead0) * t ** p + trail0 + (trail1 - trail0) * t ** p) / 2

    def half(t: float) -> float:
        return ((lead0 + (lead1 - lead0) * t ** p) - (trail0 + (trail1 - trail0) * t ** p)) / 2 * max(k(t), 0.05)

    return (lambda t: mid(t) + half(t)), (lambda t: mid(t) - half(t))


def eyespot(m: Mesh, cx: float, cy: float, zf, r: float) -> None:
    """A moth eye-spot that is a real eye: dark ring, ivory ring, an amber eye with a dark pupil."""
    disc(m, (cx, cy, 0.0), r, r * 0.95, "flesh_d", z_fn=lambda x, y: zf(y) + 0.03)
    disc(m, (cx, cy, 0.0), r * 0.76, r * 0.72, "bone_l", z_fn=lambda x, y: zf(y) + 0.05)
    z = zf(cy) + 0.06
    ellipsoid(m, (cx, cy, z), (r * 0.55, r * 0.55, r * 0.3), "glow", rings=5, seg=12)
    ellipsoid(m, (cx + r * 0.05, cy, z + r * 0.2), (r * 0.24, r * 0.22, r * 0.14), "memb", rings=4, seg=10)
    knob(m, (cx + r * 0.25, cy + r * 0.12, z + r * 0.26), r * 0.08, "glow_h")


# ---------------------------------------------------------------- Watcher Moth


def build_moth() -> Mesh:
    """+x nose, +y left wing, +z up. Dangling legs at z = 0."""
    m = Mesh()
    zc = 0.85
    # Furred thorax with the team plate, head with big amber eyes, feathered antennae.
    ellipsoid(m, (0.3, 0.0, zc), (0.58, 0.48, 0.45), lambda r, s: "bone_l" if (r + s) % 3 else "flesh_l", rings=8, seg=12)
    ellipsoid(m, (0.28, 0.0, zc + 0.38), (0.34, 0.26, 0.1), "bteam", rings=5, seg=10)
    knob(m, (0.95, 0.0, zc - 0.02), 0.32, "flesh_l")
    for s in (-1, 1):
        eye(m, (1.07, s * 0.22, zc + 0.04), 0.16)
        pts = [(1.12, s * 0.1, zc + 0.2), (1.45, s * 0.38, zc + 0.48), (1.72, s * 0.7, zc + 0.6)]
        chain(m, pts, 0.04, 0.03, "bone", n=4)
        for k in range(5):
            t = 0.15 + 0.17 * k
            p = np.asarray(pts[0]) * (1 - t) + np.asarray(pts[2]) * t
            tube(m, p, p + np.array([-0.18, s * 0.12, 0.06]), 0.025, 0.01, "bone_l", n=3)
    # Ribbed abdomen.
    st = ribbed_stations(-1.85, -0.15, 5, lambda t: math.sin(math.pi * (0.1 + 0.85 * t)) ** 0.6, cz=zc + 0.02, ry=0.38, rz=0.36, per=2)
    loft_body(m, st, ribbed_mat(12, len(st), 5, plate_every=2, plate_width=1, side_mat=("bone_l", "flesh_l"), belly="flesh", plate_mat="bone"), seg=12)
    # Broad pale wings, eye-spots that are eyes.
    wz = zc + 0.3
    for s in (-1, 1):
        fl, ft = rounded(0.75, 0.55, -0.15, -1.05, start=0.6, p=1.2)
        _, _, zf = bwing(m, s, fl, ft, 0.32, 2.45, wz, wz + 0.25, lambda i: "bone_l" if i < 10 else "bone", spar="bone", spar_r=0.06, veins=3)
        eyespot(m, -0.05, s * 1.55, zf, 0.42)
        hl, ht = rounded(-0.1, -0.7, -0.9, -1.9, start=0.5)
        _, _, zh = bwing(m, s, hl, ht, 0.28, 1.75, wz - 0.06, wz + 0.06, "bone_l", spar=None, veins=2)
        eyespot(m, -1.05, s * 1.1, zh, 0.26)
    # Three pairs of thin legs hanging under the thorax: the lowest point.
    for s in (-1, 1):
        for hx, fx in ((0.6, 0.85), (0.3, 0.25), (0.0, -0.35)):
            knee = (hx + (fx - hx) * 0.4, s * 0.5, zc - 0.32)
            tube(m, (hx, s * 0.25, zc - 0.3), knee, 0.05, 0.04, "flesh", n=4)
            tube(m, knee, (fx, s * 0.35, 0.03), 0.04, 0.02, "bone_d", n=4)
    return m


# ---------------------------------------------------------------- Razorwing


def build_razorwing() -> Mesh:
    m = Mesh()
    zc = 1.15
    st = ribbed_stations(-1.7, 2.0, 5, lambda t: math.sin(math.pi * (0.04 + 0.86 * t ** 0.8)) ** 0.7, cz=zc, ry=0.48, rz=0.44, per=3)
    loft_body(m, st, ribbed_mat(14, len(st), 5, plate_every=2, team_band=3, plate_width=1, side_mat=("flesh_d", "flesh")), seg=14)
    # Bone beak, amber eyes, swept crest.
    tube(m, (1.85, 0.0, zc + 0.02), (2.95, 0.0, zc - 0.1), 0.3, 0.03, "bone_l", n=8)
    for s in (-1, 1):
        eye(m, (1.75, s * 0.27, zc + 0.16), 0.13)
    for k, x in enumerate((1.4, 1.0, 0.6)):
        tube(m, (x, 0.0, zc + 0.36), (x - 0.6, 0.0, zc + 0.75 - 0.1 * k), 0.07, 0.01, "bone_l", n=4)
    # Crescent blade wings.
    wz = zc + 0.18

    def lead(t: float) -> float:
        return 0.9 - 3.1 * t ** 1.6

    def trail(t: float) -> float:
        return -0.15 - 2.45 * t ** 0.9 if t < 0.999 else lead(t) - 0.02

    for s in (-1, 1):
        ld, _, zf = bwing(m, s, lead, trail, 0.4, 5.0, wz, wz + 0.35, "wingm", spar="bone_l", spar_r=0.13, veins=2, vein_mat="glow_d", n=14)
        for i in range(2, 13, 2):
            p = ld[i] + np.array([0.0, 0.0, 0.02])
            tube(m, p, p + np.array([0.32, s * 0.06, 0.0]), 0.05, 0.005, "bone_l", n=3)
    # Quill gun bundles under the wing roots.
    for s in (-1, 1):
        quills(m, (0.55, s * 0.72, zc - 0.32), 1, 3, 0.0, 0.12, 1.15, 0, r=0.07, splay=0.0)
        ellipsoid(m, (0.35, s * 0.72, zc - 0.3), (0.42, 0.22, 0.18), "flesh_d", rings=5, seg=8)
    # Forked tail streamers.
    for s in (-1, 1):
        paddle(m, (-1.55, s * 0.1, zc + 0.05), (-3.6, s * 0.95, zc + 0.12), 0.32, 0.08, 0.04, 0.03,
               lambda r, q: "bone" if q in (0, 6) else "wingm", n_st=6, seg=12)
    # Tucked claws: the lowest point.
    for s in (-1, 1):
        tube(m, (0.4, s * 0.25, zc - 0.35), (0.15, s * 0.3, 0.45), 0.08, 0.06, "flesh_d", n=5)
        tube(m, (0.15, s * 0.3, 0.45), (0.35, s * 0.3, 0.04), 0.06, 0.02, "bone_d", n=5)
    return m


# ---------------------------------------------------------------- Gasbag


def build_gasbag() -> Mesh:
    m = Mesh()
    cz = 4.3
    rx, ry, rz = 4.2, 2.8, 2.15

    def skin(r: int, s: int) -> str:
        if r % 6 == 0 and 0 < r < 24:
            return "bone_l"
        if 10 <= s <= 14:
            return "flesh_d"
        if s in (3, 6) or s == 9 or s == 15:
            return "flesh_d" if r % 2 else "flesh"
        return "flesh" if s in (2, 7, 8, 16, 17) else "flesh_l"

    ellipsoid(m, (0.0, 0.0, cz), (rx, ry, rz), skin, rings=24, seg=18)
    # Amber pustules along the flanks.
    for s in (-1, 1):
        for k in range(5):
            x = -2.4 + 1.2 * k
            yy = ry * math.sqrt(max(0.0, 1 - (x / rx) ** 2)) * 0.93
            knob(m, (x, s * yy * 0.92, cz + 0.55), 0.2, "glow")
    # Gray carapace plate and an ivory spine on top.
    ellipsoid(m, (-0.3, 0.0, cz + rz - 0.05), (1.4, 1.05, 0.22), "bteam", rings=6, seg=12)
    ellipsoid(m, (-0.3, 0.0, cz + rz - 0.1), (1.6, 1.25, 0.2), "bteam_d", rings=6, seg=12)
    for k in range(6):
        x = 2.4 - 0.95 * k
        h = rz * math.sqrt(max(0.0, 1 - (x / rx) ** 2))
        tube(m, (x, 0.0, cz + h - 0.05), (x - 0.35, 0.0, cz + h + 0.5), 0.16, 0.02, "bone_l", n=5)
    # A small face at the front: amber eyes, a hooked beak.
    knob(m, (rx - 0.15, 0.0, cz - 0.3), 0.85, "flesh_d")
    for s in (-1, 1):
        eye(m, (rx + 0.35, s * 0.42, cz - 0.05), 0.22)
    tube(m, (rx + 0.5, 0.0, cz - 0.5), (rx + 1.05, 0.0, cz - 0.85), 0.24, 0.03, "bone_l", n=6)
    # Small flapping fins: two pairs out to the sides, a tail fin on top.
    fin = lambda r, q: "bone" if q in (0, 1, 11) else "wingm"  # noqa: E731
    for s in (-1, 1):
        paddle(m, (0.8, s * (ry - 0.15), cz + 0.2), (-0.1, s * (ry + 2.0), cz + 0.85), 1.1, 0.6, 0.05, 0.04, fin, n_st=6, seg=12)
        paddle(m, (-3.0, s * 1.5, cz + 0.2), (-4.4, s * 2.7, cz + 0.5), 0.8, 0.4, 0.05, 0.04, fin, n_st=6, seg=12)
    paddle(m, (-3.3, 0.0, cz + 1.3), (-4.7, 0.0, cz + 2.5), 0.75, 0.4, 0.05, 0.04, fin, n_st=6, seg=12, up=(0.0, 1.0, 0.0))
    # Dangling bomb sac: a stalk, three ivory claws, a glowing sac. The lowest point.
    bz = cz - rz + 0.1
    chain(m, [(0.3, 0.0, bz + 0.2), (0.35, 0.0, bz - 0.4), (0.4, 0.0, 1.35)], 0.32, 0.22, "flesh_d", n=7)
    ellipsoid(m, (0.4, 0.0, 0.72), (1.05, 0.8, 0.72), "glow", rings=8, seg=12)
    knob(m, (0.6, 0.0, 0.98), 0.42, "glow_h")
    for k in range(3):
        a = 2 * math.pi * k / 3 + 0.5
        y, x = 0.7 * math.sin(a), 0.4 + 0.75 * math.cos(a)
        chain(m, [(0.4, 0.0, 1.35), (x, y, 0.95), (0.4 + 0.6 * math.cos(a), 0.5 * math.sin(a), 0.25)], 0.1, 0.03, "bone_l", n=5)
    knob(m, (0.4, 0.0, 0.06), 0.12, "glow_d")
    return m


# ---------------------------------------------------------------- Drifter


def build_drifter() -> Mesh:
    m = Mesh()
    zb, R, Hh = 2.6, 1.9, 1.5
    ellipsoid(m, (0.0, 0.0, zb + 0.45), (1.0, 1.0, 0.7), "glow", rings=8, seg=12)
    knob(m, (0.0, 0.0, zb + 0.7), 0.5, "glow_h")
    dome_z(m, 0.0, 0.0, zb, R, R, Hh, lambda r, s: "jelly_d" if s % 3 == 0 else "jelly", rings=7, seg=24)
    for k in range(8):
        a = 2 * math.pi * (k + 0.5) / 8
        pts = []
        for i in range(7):
            t = (math.pi / 2) * (0.2 + 0.8 * i / 6)
            pts.append((R * 1.03 * math.cos(t) * math.cos(a), R * 1.03 * math.cos(t) * math.sin(a), zb + Hh * 1.03 * math.sin(t)))
        chain(m, pts[::-1], 0.06, 0.09, "bone", n=5)
    dome_z(m, 0.0, 0.0, zb + Hh - 0.16, 0.8, 0.8, 0.34, lambda r, s: "bone_l" if r <= 1 else ("bteam" if r < 5 else "bteam_d"), rings=6, seg=16)
    for k in range(20):
        a = 2 * math.pi * k / 20
        knob(m, (R * 1.02 * math.cos(a), R * 1.02 * math.sin(a), zb + 0.05), 0.22, "flesh" if k % 2 else "flesh_d")
    for a in (-0.42, 0.0, 0.42):
        eye(m, (R * math.cos(a), R * math.sin(a), zb + 0.38), 0.18)
    # Long stinging tendrils hanging down and back; amber stinger nodes. Tips at z = 0.
    for k in range(8):
        a = 2 * math.pi * (k + 0.5) / 8
        x0, y0 = R * 0.9 * math.cos(a), R * 0.9 * math.sin(a)
        pts = wavy((x0, y0, zb - 0.05), (x0 * 0.6 - 0.45, y0 * 0.75, 0.05), 0.18, 1.2, n=8, axis=(0.0, 1.0, 0.0), phase=k,
                   z_fn=lambda t, zb=zb: (zb - 0.05) * (1 - t) + 0.05 * t)
        chain(m, pts, 0.1, 0.035, ["flesh_l", "flesh"], n=5)
        for p in pts[3::2]:
            knob(m, p, 0.075, "glow")
    # Two frilled oral arms in the middle.
    for s in (-1, 1):
        pts = wavy((0.2, s * 0.35, zb - 0.1), (-0.2, s * 0.5, 0.7), 0.2, 1.0, n=7, phase=s,
                   z_fn=lambda t, zb=zb: (zb - 0.1) * (1 - t) + 0.7 * t)
        chain(m, pts, 0.24, 0.1, ["flesh_d", "flesh"], n=6)
    return m


# ---------------------------------------------------------------- Harpy


def build_harpy() -> Mesh:
    m = Mesh()
    zc = 1.55
    st = ribbed_stations(-1.9, 1.6, 5, lambda t: math.sin(math.pi * (0.06 + 0.88 * t)) ** 0.7, cz=zc, ry=0.8, rz=0.72, per=3)
    loft_body(m, st, ribbed_mat(16, len(st), 5, plate_every=2, team_band=3, plate_width=2, side_mat=("flesh", "flesh_d")), seg=16)
    # Long neck, ivory ridge knobs, beaked skull, amber eyes, crest.
    neck = [(1.3, 0.0, zc + 0.2), (2.4, 0.0, zc + 0.75), (3.5, 0.0, zc + 0.75), (4.4, 0.0, zc + 0.4)]
    chain(m, neck, 0.42, 0.26, ["flesh", "flesh_d"], n=10)
    for p in neck[1:]:
        knob(m, np.asarray(p) + np.array([0, 0, 0.3]), 0.13, "bone_l")
    ellipsoid(m, (4.75, 0.0, zc + 0.38), (0.55, 0.32, 0.3), "bone_l", rings=6, seg=10)
    tube(m, (5.1, 0.0, zc + 0.3), (6.4, 0.0, zc + 0.08), 0.2, 0.02, "bone", n=6)
    for s in (-1, 1):
        eye(m, (4.85, s * 0.27, zc + 0.5), 0.12)
    tube(m, (4.5, 0.0, zc + 0.6), (3.8, 0.0, zc + 1.1), 0.1, 0.01, "bone_l", n=4)
    # Broad membrane wings on ivory arm and finger bones.
    wz = zc + 0.35
    for s in (-1, 1):
        def lead(t: float) -> float:
            return 1.0 + 0.5 * math.sin(math.pi * min(t / 0.55, 1.0)) - 2.2 * max(0.0, t - 0.55) / 0.45

        def trail(t: float) -> float:
            # Scalloped trailing edge between the finger bones.
            return -1.1 - 0.45 * t - 0.35 * abs(math.sin(math.pi * 4 * t)) if t < 0.999 else lead(t) - 0.05

        ld, tr, zf = bwing(m, s, lead, trail, 0.65, 8.4, wz, wz + 0.7, "wingm", spar="bone_l", spar_r=0.16, veins=0, n=16)
        for j in (4, 8, 12):
            tube(m, ld[j] + np.array([0, 0, 0.03]), tr[j + 1] + np.array([0, 0, 0.03]), 0.07, 0.02, "bone_l", n=4)
        knob(m, ld[9] + np.array([0, 0, 0.05]), 0.18, "bone_l")
    # Wyrm tail with a fin.
    tail = wavy((-1.8, 0.0, zc + 0.05), (-5.6, 0.0, zc + 0.3), 0.35, 0.8, n=8, z_fn=lambda t: zc + 0.05 + 0.25 * t)
    chain(m, tail, 0.45, 0.08, ["flesh_d", "flesh"], n=7)
    paddle(m, tail[-2], np.asarray(tail[-1]) + np.array([-0.8, 0.0, 0.0]), 0.55, 0.25, 0.04, 0.03,
           lambda r, q: "bone" if q in (0, 6) else "wingm", n_st=5, seg=12, up=(0.0, 0.0, 1.0))
    # The living eel clutched underneath: the lowest point.
    eel = wavy((3.6, 0.0, 0.42), (-3.6, 0.0, 0.3), 0.4, 1.0, n=12)
    chain(m, eel, 0.42, 0.1, ["flesh_l", "flesh"], n=8)
    for p in eel[1:-1]:
        knob(m, np.asarray(p) + np.array([0.0, 0.0, 0.3]), 0.14, "glow")
    knob(m, (3.75, 0.0, 0.45), 0.3, "flesh_d")
    for s in (-1, 1):
        eye(m, (3.85, s * 0.2, 0.6), 0.1)
    # Talons gripping the eel.
    for s in (-1, 1):
        for hx in (0.8, -0.4):
            gy = float(np.interp(hx, [p[0] for p in eel[::-1]], [p[1] for p in eel[::-1]]))
            tube(m, (hx, s * 0.45, zc - 0.5), (hx + 0.1, gy + s * 0.5, 0.75), 0.13, 0.09, "flesh_d", n=5)
            for k in (-1, 0, 1):
                tube(m, (hx + 0.1, gy + s * 0.5, 0.75), (hx + 0.1 + 0.18 * k, gy + s * 0.05, 0.25), 0.06, 0.015, "bone_l", n=4)
    return m


# ---------------------------------------------------------------- render

UNITS_SPEC = {
    # id: (builder, meters -> px share, z_mid, EU ref, ref drawSize base, ref's meters -> px share)
    "moth": (build_moth, SCALE_FRAC, 0.6, "fw190", 56.0, SCALE_FRAC),
    "razorwing": (build_razorwing, SCALE_FRAC, 1.0, "fw190", 56.0, SCALE_FRAC),
    "gasbag": (build_gasbag, SCALE_FRAC, 2.6, "stuka", 63.0, SCALE_FRAC),
    "drifter": (build_drifter, SCALE_FRAC, 1.9, "fw190", 56.0, SCALE_FRAC),
    "harpy": (build_harpy, 0.042, 1.4, "he111", 74.0, 0.038),
}


def render(unit: str, ss: int = 4, check_only: bool = False) -> None:
    build, frac, z_mid, ref, ref_draw, ref_frac = UNITS_SPEC[unit]
    out = UNITS / unit / "hull"
    if not check_only:
        render_turntable(build(), out, f"{unit}_hull", f"{unit}-hull.json", frac, z_mid, cell=256, ss=ss)
    cameo72(out, UNITS / f"{unit}-cameo.png")
    check(unit, out, 0.8, 2, ref, ref_draw, "STUKA_OPTS", scale_mul=frac / ref_frac)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("what", choices=list(UNITS_SPEC) + ["all"])
    ap.add_argument("--ss", type=int, default=4)
    ap.add_argument("--check-only", action="store_true")
    args = ap.parse_args()
    for u in (UNITS_SPEC if args.what == "all" else [args.what]):
        render(u, args.ss, args.check_only)


if __name__ == "__main__":
    main()
