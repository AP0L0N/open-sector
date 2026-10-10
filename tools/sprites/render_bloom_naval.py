#!/usr/bin/env python3
"""Bloom sea (Deep Brood): Drift Jelly, Spineback, Abyss Ray, Leviathan, Brood Barge. One 16-face hull each.

A fork of render_borg_naval.py under the naval lock (render_naval.py): same numpy
rasterizer, camera, light, outline, meters -> px (NAVAL_SCALE x a per-unit share),
z mid, centring (cy_frac 0.56), waterline cut (clip_z 0) over a wake, 256 source
cell composed to 128 at runtime with NAVAL_OPTS (contactY 0.74, padding 2).
The look is the Bloom palette lock (gridlock/docs/factions/bloom.md): wet flesh,
ivory chitin, dark membrane, amber glow, a gray team plate on each. No metal.

  driftjelly  a floating jellyfish bell on the surface: translucent flesh with
              ivory ribs, an amber core glowing through it, a gray carapace cap
              on the crown, a scalloped rim with three amber sensor spots at the
              front (the heading), tentacles and two frilled oral arms trailing
              aft on the water, more of them dark under the surface.
  spineback   a finned fish-hull skimming the surface: ribbed flesh with ivory
              back plates, an ivory skull and underslung jaw, amber eyes and a
              glowing lateral line, a dorsal quill battery on a hump (baked in),
              a membrane sail aft, pectoral fins on the water, a forked tail.
  abyssray    a wide manta at the surface: dark flesh wings with ivory leading
              edges and rows of amber spots, a plated back with the team plate,
              two curled head lobes, amber eyes, a long whip tail.
  leviathan   a turtle-whale: a domed shell of ivory scutes crusted with dark
              growth, a gray team scute aft, a gland cannon rising from the shell
              (flesh stalk, glowing acid sac, ivory muzzle), a blunt whale head with
              amber eyes, turtle flippers, a whale fluke astern.
  broodbarge  a broad floating lily-raft of flesh with amber veins and a notch at
              the stern, a ribbed pouch hold in the middle with a glowing slit,
              a gray team plate on its front, eye stalks at the bow, tendrils trailing.

Row 0 = bow screen-south, then clockwise 22.5 deg through row 15.

  python3 tools/sprites/render_bloom_naval.py driftjelly
  python3 tools/sprites/render_bloom_naval.py spineback
  python3 tools/sprites/render_bloom_naval.py abyssray
  python3 tools/sprites/render_bloom_naval.py leviathan
  python3 tools/sprites/render_bloom_naval.py broodbarge

Writes gridlock/packages/client/src/assets/units/<id>/hull/0001..0016.png,
<id>/<id>-hull.json, <id>-cameo.png (72 px), and previews in
tools/sprites/preview/<id>-*.png. Prints the fit numbers and a drawSize base that
keeps the EU reference's px per meter.
"""

from __future__ import annotations

import argparse
import math
import random

import numpy as np

import bloom_seaair_common as bc
from bloom_seaair_common import (UNITS, cameo72, chain, check, disc, dome_z, ellipsoid, eye, knob, loft_body, paddle,
                                 quills, ribbed_mat, ribbed_stations, strip_surface, tube, wavy)
from render_procedural import Mesh, render_turntable
from render_naval import NAVAL_SCALE, NAVAL_Z_MID, ellipse, ring
import render_seed as rs


# ---------------------------------------------------------------- wake


def bloom_wake(length: float, beam: float, glow=None, cx: float = 0.0, foam=None) -> Mesh:
    """Dark water, an amber glow under the body, a foam ring. glow = (cx, rx, ry); foam = (cx, rx, ry)."""
    m = Mesh()
    ellipse(m, 0.02, cx, 0.0, length, beam, "water")
    if glow:
        gx, gr, gb = glow
        ellipse(m, 0.03, gx, 0.0, gr, gb, "uamber")
    fx, fr, fb = foam or (cx, length * 0.92, beam * 0.86)
    ring(m, 0.05, fx, 0.0, fr, fb, fr * 1.1, fb * 1.12, "foam")
    return m


# ---------------------------------------------------------------- Drift Jelly

JX, JR, JH = 1.4, 2.3, 1.9  # bell centre x, radius, height


def build_driftjelly() -> Mesh:
    m = Mesh()
    # Amber core and four gonad lobes inside the bell.
    ellipsoid(m, (JX, 0.0, 0.75), (1.0, 1.0, 0.75), "glow", rings=8, seg=12)
    knob(m, (JX, 0.0, 1.05), 0.5, "glow_h")
    for k in range(4):
        a = math.pi / 4 + k * math.pi / 2
        knob(m, (JX + 0.95 * math.cos(a), 0.95 * math.sin(a), 0.55), 0.38, "glow_d")
    # The translucent bell, banded.
    dome_z(m, JX, 0.0, 0.05, JR, JR, JH, lambda r, s: "jelly_d" if s % 3 == 0 else "jelly", rings=7, seg=24)
    # Ivory ribs down the bell from the crown to the rim.
    for k in range(8):
        a = 2 * math.pi * (k + 0.5) / 8
        pts = []
        for i in range(7):
            t = (math.pi / 2) * (0.2 + 0.8 * i / 6)
            rr = 1.03
            pts.append((JX + JR * rr * math.cos(t) * math.cos(a), JR * rr * math.cos(t) * math.sin(a), 0.05 + JH * rr * math.sin(t)))
        chain(m, pts[::-1], 0.07, 0.1, "bone", n=5)
    # Gray carapace cap on the crown, ivory rim.
    dome_z(m, JX, 0.0, JH - 0.18, 0.95, 0.95, 0.42, lambda r, s: "bone_l" if r <= 1 else ("bteam" if r < 5 else "bteam_d"), rings=6, seg=16)
    # Scalloped rim.
    for k in range(22):
        a = 2 * math.pi * k / 22
        knob(m, (JX + JR * 1.02 * math.cos(a), JR * 1.02 * math.sin(a), 0.14), 0.26, "flesh" if k % 2 else "flesh_d")
    # Three amber sensor spots on the front rim: the heading.
    for a in (-0.42, 0.0, 0.42):
        eye(m, (JX + JR * 1.0 * math.cos(a), JR * 1.0 * math.sin(a), 0.48), 0.2)
    # Tentacles trailing aft on the surface.
    for j, y0 in enumerate((-1.75, -1.1, 1.1, 1.75)):
        x0 = JX - math.sqrt(max(0.0, JR * JR - y0 * y0)) * 0.9
        pts = wavy((x0, y0, 0.14), (-6.0 + 0.4 * (j % 2), y0 * 1.25, 0.06), 0.35, 1.6, n=9, phase=j * 1.3,
                   z_fn=lambda t: 0.16 - 0.1 * t)
        chain(m, pts, 0.15, 0.05, ["flesh_l", "flesh"], n=6)
        knob(m, pts[-1], 0.1, "glow_d")
    # Two frilled oral arms in the middle, thicker, amber nodes.
    for s in (-1, 1):
        pts = wavy((JX - 1.0, s * 0.45, 0.2), (-5.0, s * 0.7, 0.08), 0.3, 1.1, n=9, phase=1.0 + s,
                   z_fn=lambda t: 0.22 - 0.12 * t)
        chain(m, pts, 0.3, 0.1, ["flesh_d", "flesh"], n=7)
        for p in pts[2:-1:2]:
            knob(m, np.asarray(p) + np.array([0, 0, 0.18]), 0.12, "glow")
    return m


def driftjelly_wake() -> Mesh:
    m = Mesh()
    ellipse(m, 0.02, -1.6, 0.0, 6.4, 3.0, "water")
    ellipse(m, 0.03, JX, 0.0, JR * 1.2, JR * 1.2, "uamber")
    # Tentacles under the surface, further aft: dark streaks.
    for j, y0 in enumerate((-1.4, -0.5, 0.5, 1.4)):
        for i in range(9):
            t = i / 8
            x = -1.0 - 6.0 * t
            y = y0 * (1 + 0.4 * t) + 0.3 * math.sin(2 * math.pi * 1.4 * t + j)
            disc(m, (x, y, 0.035), 0.42, 0.1, "uink", n=10)
    ring(m, 0.05, JX, 0.0, JR * 1.08, JR * 1.08, JR * 1.28, JR * 1.28, "foam")
    return m


# ---------------------------------------------------------------- Spineback


def _fish(t: float) -> float:
    if t < 0.62:
        return math.sqrt(max(0.0, 1 - ((t - 0.62) / 0.62) ** 2))
    return math.sqrt(max(0.0, 1 - ((t - 0.62) / 0.42) ** 2))


def build_spineback() -> Mesh:
    m = Mesh()
    x0, x1, ry, rz, cz = -5.2, 5.2, 1.2, 1.0, 0.3
    st = ribbed_stations(x0, x1, 6, _fish, cz=cz, ry=ry, rz=rz, per=3, groove=0.93)
    loft_body(m, st, ribbed_mat(18, len(st), 6, plate_every=2, team_band=4, plate_width=1), seg=18)

    def top(x: float) -> float:
        return cz + rz * _fish((x - x0) / (x1 - x0))

    # Ivory skull plate, underslung jaw with teeth, amber eyes.
    ellipsoid(m, (4.0, 0.0, 0.9), (1.25, 0.9, 0.45), "bone_l", rings=8, seg=12)
    tube(m, (3.4, 0.0, 0.25), (5.7, 0.0, 0.35), 0.62, 0.22, "bone", n=10)
    for k in range(5):
        x = 4.2 + 0.32 * k
        for s in (-1, 1):
            tube(m, (x, s * (0.5 - 0.06 * k), 0.55), (x + 0.05, s * (0.45 - 0.06 * k), 0.85), 0.07, 0.01, "bone_l", n=4)
    for s in (-1, 1):
        eye(m, (4.5, s * 0.78, 0.78), 0.22)
    # Glowing lateral line down each flank.
    for s in (-1, 1):
        for k in range(9):
            x = -3.4 + 0.8 * k
            r = ry * _fish((x - x0) / (x1 - x0))
            knob(m, (x, s * r * 0.97, cz + 0.12), 0.11, "glow")
    # Dorsal quill battery on a fleshy hump.
    hz = top(1.5)
    ellipsoid(m, (1.5, 0.0, hz - 0.1), (1.5, 0.85, 0.62), lambda r, s: "flesh_d" if r % 3 else "glow_d", rings=9, seg=14)
    quills(m, (2.3, 0.0, hz + 0.32), 3, 5, 0.55, 0.3, 1.9, 34, r=0.12, splay=0.07)
    # Membrane sail aft with ivory spines.
    lead, trail = [], []
    for k in range(6):
        x = -0.4 - 0.55 * k
        h = 1.15 * math.sin(math.pi * (k + 0.6) / 6.6)
        b = np.array([x, 0.0, top(x) - 0.05])
        tp = b + np.array([-0.45, 0.0, h])
        tube(m, b, tp, 0.08, 0.02, "bone_l", n=4)
        lead.append(tp)
        trail.append(b)
    strip_surface(m, lead, trail, "wingm")
    # Pectoral fins skimming the water.
    for s in (-1, 1):
        paddle(m, (2.4, s * 1.0, 0.35), (1.0, s * 2.9, 0.12), 0.7, 0.4, 0.06, 0.04,
               lambda r, q: "bone" if q in (0, 1, 11) else "wingm", n_st=6, seg=12)
    # Forked tail: an upper lobe and a lower lobe spread aft at the surface.
    for lob in ((-6.7, 0.0, 1.6), (-6.9, 0.0, 0.35)):
        paddle(m, (-4.9, 0.0, 0.55), lob, 0.08, 0.04, 0.45, 0.2,
               lambda r, q: "flesh_d" if r < 2 else "wingm", n_st=6, seg=10, up=(0.0, 1.0, 0.0))
    return m


# ---------------------------------------------------------------- Abyss Ray


def _ray_le(u: float) -> float:
    return 3.0 - 4.8 * abs(u) ** 1.3


def _ray_te(u: float) -> float:
    return -3.2 + 1.4 * abs(u) ** 2


def _ray_z(u: float, v: float, top: bool = True) -> float:
    thick = 0.85 * (1 - abs(u) ** 1.5) + 0.06
    curl = 0.45 * abs(u) ** 3
    s = math.sin(math.pi * v) ** 0.7
    return 0.06 + curl + (thick * s if top else -thick * 0.7 * s)


RAY_SPAN = 6.5


def build_abyssray() -> Mesh:
    m = Mesh()
    nu, nv = 28, 8

    def P(i: int, j: int, top: bool) -> np.ndarray:
        u = -1 + 2 * i / nu
        v = j / nv
        x = _ray_te(u) + (_ray_le(u) - _ray_te(u)) * v
        return np.array([x, u * RAY_SPAN, _ray_z(u, v, top)])

    grid_t = [[m.v(P(i, j, True)) for j in range(nv + 1)] for i in range(nu + 1)]
    grid_b = [[m.v(P(i, j, False)) for j in range(nv + 1)] for i in range(nu + 1)]
    for i in range(nu):
        u = abs(-1 + 2 * (i + 0.5) / nu)
        for j in range(nv):
            mt = "memb" if j == 0 else ("flesh" if u < 0.2 else "flesh_d")
            m.quad(grid_t[i][j], grid_t[i + 1][j], grid_t[i + 1][j + 1], grid_t[i][j + 1], mt)
            m.quad(grid_b[i][j], grid_b[i][j + 1], grid_b[i + 1][j + 1], grid_b[i + 1][j], "memb")
    # Ivory leading edges.
    for s in (-1, 1):
        pts = [P(i, nv, True) + np.array([0.0, 0.0, 0.02]) for i in range(nu // 2, nu + 1)] if s > 0 else \
              [P(i, nv, True) + np.array([0.0, 0.0, 0.02]) for i in range(nu // 2, -1, -1)]
        chain(m, pts, 0.13, 0.04, "bone_l", n=5, joints=False)
    # Rows of amber spots along each wing.
    for s in (-1, 1):
        for row, v in enumerate((0.42, 0.68)):
            for k in range(4):
                u = 0.27 + 0.16 * k + 0.07 * row
                x = _ray_te(u) + (_ray_le(u) - _ray_te(u)) * v
                z = _ray_z(u, v)
                r = 0.44 - 0.07 * k
                ellipsoid(m, (x, s * u * RAY_SPAN, z), (r, r, r * 0.35), "glow", rings=4, seg=10)
                ellipsoid(m, (x, s * u * RAY_SPAN, z + r * 0.18), (r * 0.5, r * 0.5, r * 0.25), "glow_h", rings=3, seg=8)
    # Plated back, the team plate on it.
    st = ribbed_stations(-3.4, 3.2, 5, lambda t: math.sin(math.pi * (0.08 + 0.84 * t)) ** 0.7, cz=0.25, ry=1.35, rz=0.85,
                         per=3, groove=0.95)
    loft_body(m, st, ribbed_mat(16, len(st), 5, plate_every=2, team_band=1, plate_width=2), seg=16)
    # Curled head lobes and amber eyes.
    for s in (-1, 1):
        chain(m, [(2.7, s * 1.0, 0.45), (3.7, s * 1.25, 0.6), (4.45, s * 1.05, 0.62), (4.7, s * 0.65, 0.5)], 0.32, 0.12,
              ["flesh_d", "flesh"], n=7)
        eye(m, (3.0, s * 1.3, 0.72), 0.22)
    # Whip tail with an amber barb.
    pts = wavy((-3.2, 0.0, 0.3), (-10.2, 0.0, 0.1), 0.35, 0.8, n=8, z_fn=lambda t: 0.3 - 0.2 * t)
    chain(m, pts, 0.32, 0.06, ["flesh_d", "bone"], n=6)
    tube(m, (-3.9, 0.0, 0.45), (-4.9, 0.0, 0.85), 0.14, 0.02, "glow_d", n=5)
    return m


# ---------------------------------------------------------------- Leviathan

SHELL_X, SHELL_RX, SHELL_RY, SHELL_H = -0.6, 8.4, 5.4, 3.3


def _shell_mat(seg: int):
    def f(r: int, s: int) -> str:
        a = 2 * math.pi * (s + 0.5) / seg
        aft = abs(math.atan2(math.sin(a), math.cos(a))) > math.pi * 0.8
        if r in (1, 4, 7):
            return "bone_d"
        if aft and r in (3, 4, 5, 6):
            return "bteam" if r in (3, 5) else "bteam_d"
        if (s // 3) % 4 == 0:
            return "bone_d"
        return "bone_l" if (s // 3 + r // 3) % 2 else "bone"

    return f


def build_leviathan() -> Mesh:
    m = Mesh()
    seg = 30
    dome_z(m, SHELL_X, 0.0, -0.1, SHELL_RX, SHELL_RY, SHELL_H, _shell_mat(seg), rings=9, seg=seg, skirt=0.25)
    # Serrated marginal scutes round the rim.
    for k in range(32):
        a = 2 * math.pi * k / 32
        knob(m, (SHELL_X + SHELL_RX * 1.01 * math.cos(a), SHELL_RY * 1.01 * math.sin(a), 0.32), 0.42, "bone" if k % 2 else "bone_l")
    # Growth crust: lumps of dark membrane and dark flesh crowding the lower shell (the moss).
    rnd = random.Random(7)
    for _ in range(70):
        a = rnd.uniform(0, 2 * math.pi)
        e = rnd.uniform(0.15, 0.75)
        k = math.cos(e * math.pi / 2)
        x = SHELL_X + SHELL_RX * k * math.cos(a)
        y = SHELL_RY * k * math.sin(a)
        z = 0.15 + SHELL_H * math.sin(e * math.pi / 2)
        if abs(math.atan2(math.sin(a), math.cos(a))) > math.pi * 0.74 and e > 0.25:
            continue  # keep the team scute clear
        knob(m, (x, y, z), rnd.uniform(0.25, 0.5), rnd.choice(("memb", "flesh_d", "bone_d", "flesh_d")))
    # Gland cannon rising from the shell: collar, stalk, glowing acid sac, ivory muzzle.
    gx, gz = 0.6, SHELL_H
    ellipsoid(m, (gx, 0.0, gz), (2.4, 2.1, 0.85), "flesh_d", rings=8, seg=16)
    tube(m, (gx, 0.0, gz + 0.3), (gx + 2.5, 0.0, gz + 4.0), 1.2, 0.8, "flesh", n=14)
    for t in (0.18, 0.82):
        p = np.array([gx + 2.5 * t, 0.0, gz + 0.3 + 3.7 * t])
        tube(m, p - np.array([0.07, 0, 0.1]), p + np.array([0.07, 0, 0.1]), 1.32 - 0.4 * t, 1.32 - 0.4 * t, "bone", n=14)
    for s in (-1, 1):
        knob(m, (gx + 0.9, s * 1.25, gz + 1.0), 1.0, "glow")
        knob(m, (gx + 1.0, s * 1.35, gz + 1.35), 0.55, "glow_h")
        ellipsoid(m, (gx + 0.9, s * 1.25, gz + 1.0), (1.3, 1.25, 1.25), "jelly", rings=9, seg=16)
    tube(m, (gx + 2.5, 0.0, gz + 4.0), (gx + 3.1, 0.0, gz + 4.9), 0.9, 0.72, "bone_l", n=14)
    knob(m, (gx + 3.05, 0.0, gz + 4.82), 0.5, "glow_h")
    # Neck and the blunt whale head.
    tube(m, (6.0, 0.0, 0.3), (7.6, 0.0, 0.55), 2.3, 2.5, "flesh_d", n=14)
    hs = [(6.6 + 5.6 * t, 0.0, 0.5 + 0.4 * math.sin(math.pi * t), 3.2 * k, 1.9 * k)
          for t, k in ((0.0, 1.0), (0.25, 1.04), (0.5, 1.0), (0.72, 0.88), (0.88, 0.66), (0.97, 0.4), (1.0, 0.12))]
    loft_body(m, hs, lambda r, s: "memb" if 9 <= s <= 15 else ("flesh_d" if r % 2 else "flesh"), seg=18)
    for k, x in enumerate((7.5, 8.6, 9.7)):
        ellipsoid(m, (x, 0.0, 2.3 - 0.15 * k), (0.6, 1.6 - 0.3 * k, 0.32), "bone_l" if k % 2 == 0 else "bone", rings=5, seg=10)
    for s in (-1, 1):
        eye(m, (9.6, s * 2.55, 1.6), 0.45)
        tube(m, (7.9, s * 2.9, 0.6), (12.0, s * 1.0, 0.55), 0.14, 0.1, "memb", n=5)
        for x in (7.0, 8.0):
            knob(m, (x, s * 1.9, 2.05), 0.24, "bone_l")
    # Turtle flippers fore, smaller aft.
    fl = lambda r, q: "bone" if q in (2, 3, 4) else ("flesh_d" if r % 2 else "flesh")  # noqa: E731
    for s in (-1, 1):
        paddle(m, (4.0, s * 4.6, 0.35), (6.4, s * 9.6, 0.2), 1.6, 1.2, 0.28, 0.12, fl, n_st=7, seg=12)
        paddle(m, (-6.4, s * 3.8, 0.3), (-8.4, s * 6.3, 0.15), 1.1, 0.8, 0.22, 0.1, fl, n_st=6, seg=12)
    # Tail stock and the whale fluke.
    tube(m, (-8.2, 0.0, 0.25), (-11.2, 0.0, 0.3), 1.2, 0.5, "flesh_d", n=12)
    for s in (-1, 1):
        paddle(m, (-11.0, 0.0, 0.3), (-12.9, s * 3.2, 0.32), 1.5, 0.8, 0.18, 0.08,
               lambda r, q: "flesh" if r < 3 else "flesh_d", n_st=6, seg=12)
    return m


def leviathan_wake() -> Mesh:
    m = Mesh()
    ellipse(m, 0.02, -0.4, 0.0, 13.6, 10.4, "water")
    ellipse(m, 0.03, 1.0, 0.0, 9.0, 6.0, "uamber")
    ring(m, 0.05, SHELL_X, 0.0, SHELL_RX * 1.06, SHELL_RY * 1.08, SHELL_RX * 1.18, SHELL_RY * 1.22, "foam")
    ring(m, 0.05, 9.3, 0.0, 2.6, 2.9, 3.0, 3.3, "foam")
    return m


# ---------------------------------------------------------------- Brood Barge

PAD_RX, PAD_RY = 8.0, 6.0


def _pad_r(a: float) -> float:
    r = 1 + 0.05 * math.sin(5 * a)
    d = math.atan2(math.sin(a - math.pi), math.cos(a - math.pi))
    return r * (1 - 0.5 * math.exp(-((d / 0.2) ** 2)))


def build_broodbarge() -> Mesh:
    m = Mesh()
    seg = 48
    levels = [(0.0, 0.82), (0.35, 0.8), (0.65, 0.72), (0.86, 0.6), (0.96, 0.5), (1.0, 0.32), (1.0, -0.3)]
    rings = []
    for f, z in levels:
        ff = max(f, 0.02)
        rings.append([np.array([PAD_RX * ff * _pad_r(2 * math.pi * s / seg) * math.cos(2 * math.pi * s / seg),
                                PAD_RY * ff * _pad_r(2 * math.pi * s / seg) * math.sin(2 * math.pi * s / seg), z]) for s in range(seg)])

    def pad_mat(r: int, s: int) -> str:
        if r >= 4:
            return "flesh_d"
        if r == 3:
            return "flesh_l" if s % 2 else "flesh"
        if s % 6 == 0 and 1 <= r <= 2:
            return "glow_d"
        return "flesh_d" if (s // 6) % 2 else "flesh"

    m.loft(rings, pad_mat)
    # Ivory studs along the rim.
    for k in range(0, seg, 2):
        a = 2 * math.pi * k / seg
        rr = _pad_r(a) * 0.97
        knob(m, (PAD_RX * rr * math.cos(a), PAD_RY * rr * math.sin(a), 0.5), 0.34, "bone_l" if k % 4 else "bone")
    # The pouch hold: a big fleshy sac under ivory hoops, a glowing slit on top.
    ellipsoid(m, (-0.5, 0.0, 1.45), (4.0, 3.0, 1.75), lambda r, s: "flesh" if r % 3 else "flesh_d", rings=12, seg=18)
    for x in (-2.8, -0.6, 1.6):
        rs.arch(m, x, 0.0, 0.7, 2.75 - 0.12 * abs(x + 0.6), 2.25 - 0.1 * abs(x + 0.6), 0.32, 0.3, "bone_l", n=11)
    ellipsoid(m, (-0.5, 0.0, 3.1), (2.4, 0.42, 0.14), "memb", rings=8, seg=10)
    for s in (-1, 1):
        tube(m, (-2.7, s * 0.42, 3.08), (1.7, s * 0.42, 3.08), 0.13, 0.13, "glow", n=6)
    knob(m, (-0.5, 0.0, 3.12), 0.25, "glow_h")
    # Gray team plate on the sac's front, ivory border.
    ellipsoid(m, (2.85, 0.0, 1.95), (0.75, 1.55, 0.8), "bteam", rings=6, seg=12)
    ellipsoid(m, (2.75, 0.0, 1.95), (0.72, 1.75, 0.95), "bone", rings=6, seg=12, x_cut=(-1.0, 0.2))
    # Bow: eye stalks and feelers.
    for s in (-1, 1):
        tube(m, (6.2, s * 1.3, 0.7), (7.2, s * 1.6, 2.0), 0.3, 0.2, "flesh_d", n=6)
        eye(m, (7.25, s * 1.62, 2.1), 0.4)
        chain(m, [(7.3, s * 0.5, 0.65), (8.1, s * 0.7, 0.8), (8.7, s * 0.6, 0.55)], 0.11, 0.04, "flesh", n=5)
    # Tendrils trailing in the water.
    for j, y0 in enumerate((-4.6, -2.2, 2.2, 4.6)):
        x0 = -PAD_RX * 0.86 * math.sqrt(max(0.0, 1 - (y0 / PAD_RY) ** 2))
        pts = wavy((x0, y0, 0.2), (x0 - 3.6, y0 * 1.08, 0.08), 0.3, 1.2, n=7, phase=j, z_fn=lambda t: 0.22 - 0.12 * t)
        chain(m, pts, 0.16, 0.05, ["flesh_d", "flesh"], n=5)
    return m


def broodbarge_wake() -> Mesh:
    m = Mesh()
    ellipse(m, 0.02, -1.0, 0.0, 10.6, 7.6, "water")
    ellipse(m, 0.03, -0.5, 0.0, 5.2, 4.0, "uamber")
    ring(m, 0.05, 0.0, 0.0, PAD_RX * 1.04, PAD_RY * 1.05, PAD_RX * 1.16, PAD_RY * 1.18, "foam")
    return m


# ---------------------------------------------------------------- render

UNITS_SPEC = {
    # id: (builder, wake, EU ref, ref drawSize base, ref's NAVAL_SCALE share, this unit's NAVAL_SCALE share)
    "driftjelly": (build_driftjelly, driftjelly_wake, "gunboat", 48.0, 1.0, 1.0),
    "spineback": (build_spineback, lambda: bloom_wake(7.4, 2.8, glow=(0.0, 4.5, 1.4), cx=-0.6), "gunboat", 48.0, 1.0, 1.0),
    "abyssray": (build_abyssray, lambda: bloom_wake(9.6, 7.4, glow=(0.0, 3.6, 5.0), cx=-2.2, foam=(-0.1, 4.0, 6.6)),
                 "submarine", 64.0 * 1.2, 1.0, 0.66),
    "leviathan": (build_leviathan, leviathan_wake, "destroyer", 100.0, 0.55, 0.55),
    "broodbarge": (build_broodbarge, broodbarge_wake, "destroyer", 100.0, 0.55, 0.55),
}


def render(unit: str, ss: int = 4, check_only: bool = False) -> None:
    build, wake, ref, ref_draw, ref_mul, mul = UNITS_SPEC[unit]
    out = UNITS / unit / "hull"
    if not check_only:
        render_turntable(
            build(), out, f"{unit}_hull", f"{unit}-hull.json", NAVAL_SCALE * mul, NAVAL_Z_MID,
            cy_frac=0.56, cell=256, ss=ss, clip_z=0.0, underlay=wake(),
        )
    cameo72(out, UNITS / f"{unit}-cameo.png")
    check(unit, out, 0.74, 2, ref, ref_draw, "NAVAL_OPTS", scale_mul=mul / ref_mul)


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
