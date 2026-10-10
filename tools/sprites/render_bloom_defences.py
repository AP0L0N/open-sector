#!/usr/bin/env python3
"""The Bloom's defences: Thorn Spitter, Bile Lance, Puffcap (crewless guns), Eye Stalk, Husk Burrow.

The guns use render_ww2_guns.py's file set and JSON schema (as render_borg_guns.py does), so the
client draws them through FORT_TYPES:
  <id>.png            the static pad (creep, roots, stem), with its cast shadow
  <id>.json           pad metrics + rows, crewCols, order, gunZ, muzzleReach, pivotX/pivotY, cell
  <id>-cameo.png      pad + head laid row 14 (south-east)
  <id>-gun.png        16 rows x 1 column, south-first clockwise: the head that turns to aim

The garrisons use render_ww2_fort.render_building (like the Hochstand and the Bunker): <id>.png,
<id>.json (pad metrics + roofZ), <id>-cameo.png.

None of these turn before placing: no <id>/ faces folder.

  thornspitter  t(1)  anti-infantry: a bulb on a knotted root; a quill fan round a puckered mouth
  bilelance     t(1)  anti-armour: a root crown; a tall curled stalk, acid gland and sting at the tip
  puffcap       t(1)  anti-air: a squat mushroom stem; the spore-vented cap tilted at the sky
  eyestalk      t(1)  watch post: a tall fleshy stalk, one huge amber eye, a hollow pouch under it
  husk          t(2)  bunker: a giant beetle's hollow carapace, half buried, slits between plates

Materials and helpers: bloom_def_kit.py (palette lock from gridlock/docs/factions/bloom.md).

  cd tools/sprites && python3 render_bloom_defences.py --out ../../gridlock/packages/client/src/assets/buildings [--only thornspitter ...]
"""

from __future__ import annotations

import argparse
import math
from pathlib import Path

import numpy as np

import bloom_def_kit as bk

wg = bk.wg
wf = bk.wf
ra = bk.ra
LM = bk.LM

C = 16.0  # footprint centre, t(1)


def plate(L: LM, a: float, z0: float, z1: float, r0: float, r1: float, half: float, mat: str = "team") -> None:
    """A curved carapace plate standing proud of a round body at azimuth a, from z0 to z1."""
    L.m.new_part()
    segs = 4
    for k in range(segs):
        b0 = a - half + 2 * half * k / segs
        b1 = a - half + 2 * half * (k + 1) / segs
        pts = []
        for z, r in ((z0, r0), (z1, r1)):
            for rr in (r, r + 0.45):
                for b in (b0, b1):
                    pts.append((rr * math.cos(b), rr * math.sin(b), z))
        # hexa order: z0 (y0: x0 x1, y1: x0 x1): here inner/outer act as y, b0/b1 as x.
        L.hexa(pts, mat, part=False)


# ---------------------------------------------------------------- Thorn Spitter, t(1)

TS_Z = 12.0  # mouth height
TS_MUZZLE = 7.4


def thornspitter_base(ground: bool = True) -> ra.Mesh:
    m = ra.Mesh()
    L = LM(m, cx=C, cy=C)
    if ground:
        bk.creep_pad(L, 14.0, 3)
    # Thick knotted roots splaying into the creep.
    for k in range(5):
        bk.knot_root(L, 2 * math.pi * k / 5 + 0.4, 3.2, 4.4, 12.6, 1.8, 10 + k)
    # The gnarled trunk: two stacked knots.
    bk.tube(L, [(0, 0, 0.5), (0.4, -0.3, 3.0), (-0.3, 0.3, 5.4), (0, 0, 6.6)], [4.2, 3.4, 3.0, 3.2], "flesh_dk", n=14)
    bk.lball(L, (0.6, 0.2, 3.2), 3.7, "flesh_dk", rings=5, n=14, squash=0.7, part=False)
    # The bulb: a fat flesh sac with glowing seams, bone ribs over it.
    bk.lball(L, (0, 0, 7.6), 6.0, "flesh", rings=7, n=22, squash=0.62)
    for k in range(6):
        a = 2 * math.pi * k / 6 + 0.25
        c, s = math.cos(a), math.sin(a)
        pts = [(5.4 * c, 5.4 * s, 5.6), (5.9 * c, 5.9 * s, 7.6), (4.6 * c, 4.6 * s, 9.7), (2.6 * c, 2.6 * s, 10.8)]
        bk.tube(L, pts, [0.55, 0.6, 0.5, 0.35], "bone", n=6)
    bk.amber_beads(L, [(5.8 * math.cos(a), 5.8 * math.sin(a), 7.0) for a in (1.3 + 1.05 * k for k in range(6))], 0.75)
    # Team plate on the bulb's face to the viewer.
    plate(L, math.pi / 4, 6.0, 9.4, 5.75, 5.2, 0.45)
    # The collar the head turns on.
    L.cyl((0, 0, 10.2), (0, 0, 11.0), 3.4, 3.0, "bone_dk", n=16)
    return m


def thornspitter_gun(L: LM, crew: int) -> None:
    z = TS_Z
    # The head: a round flesh sac, a hooded bone crest behind, the snout forward.
    bk.lball(L, (-0.6, 0, z - 0.2), 3.9, "flesh", rings=6, n=16, squash=0.82)
    bk.lball(L, (-1.6, 0, z + 0.9), 3.0, "bone", rings=5, n=12, squash=0.75)
    L.cyl((1.0, 0, z), (5.4, 0, z), 2.8, 2.1, "flesh", n=14)
    # Puckered lips, the dark mouth, the glowing throat.
    bk.ltorus(L, (5.6, 0, z), "x", 1.75, 0.7, "flesh_lt", segs=14)
    for k in range(8):
        a = 2 * math.pi * k / 8
        L.cyl((5.3, 1.4 * math.cos(a), z + 1.4 * math.sin(a)), (6.6, 0.8 * math.cos(a), z + 0.8 * math.sin(a)), 0.45, 0.22, "flesh_lt", n=5, part=False)
    L.cyl((5.7, 0, z), (5.9, 0, z), 1.3, 1.3, "membrane", n=12)
    L.cyl((5.9, 0, z), (6.0, 0, z), 0.6, 0.6, "hot", n=10, part=False)
    # The fan of quills: a crown round the snout, raking forward and out; longer ones up the back.
    L.m.new_part()
    n_q = 9
    for k in range(n_q):
        a = -0.15 * math.pi + 1.3 * math.pi * k / (n_q - 1)  # over the top, not under the chin
        ca, sa = math.cos(a), math.sin(a)
        base = (1.6, 2.6 * ca, z + 2.6 * sa)
        tip = (TS_MUZZLE - 0.6 - 0.8 * abs(sa - 0.6), 5.6 * ca, z + 5.0 * sa + 0.6)
        L.cyl(base, tip, 0.8, 0.1, "bone_lt", n=6, part=False)
    for s in (-1, 0, 1):
        L.cyl((-2.0, s * 1.3, z + 2.6), (-6.0, s * 2.6, z + 5.2), 0.8, 0.1, "bone_lt", n=6, part=False)
    # Small team plate on the crown.
    L.box((-2.6, -1.2, z + 3.3), (0.0, 1.2, z + 3.8), "team")
    # Glowing glands on the cheeks.
    bk.amber_beads(L, [(1.6, s * 2.9, z - 0.9) for s in (-1, 1)], 0.7)


# ---------------------------------------------------------------- Bile Lance, t(1)

BL_TIP = (12.4, 0.0, 22.6)  # sting tip


def bilelance_base(ground: bool = True) -> ra.Mesh:
    m = ra.Mesh()
    L = LM(m, cx=C, cy=C)
    if ground:
        bk.creep_pad(L, 14.0, 5)
    for k in range(6):
        bk.knot_root(L, 2 * math.pi * k / 6 + 0.1, 3.6, 4.0, 13.0, 1.7, 20 + k)
    # A low flesh mound gripping the socket, glowing pores, a bone collar.
    bk.lball(L, (0, 0, 2.6), 6.4, "flesh_dk", rings=6, n=20, squash=0.5)
    bk.amber_beads(L, [(4.9 * math.cos(a), 4.9 * math.sin(a), 3.2) for a in (0.4 + 1.25 * k for k in range(5))], 0.65)
    plate(L, math.pi / 4, 1.6, 4.4, 6.1, 5.0, 0.4)
    L.cyl((0, 0, 4.6), (0, 0, 6.0), 3.6, 3.2, "bone_dk", n=16)
    return m


def bl_path() -> tuple[list[tuple[float, float, float]], list[float]]:
    pts = [(0.0, 0, 6.0), (-1.2, 0, 10.0), (-2.4, 0, 14.0), (-2.8, 0, 18.0), (-2.0, 0, 22.0), (-0.3, 0, 25.4),
           (2.3, 0, 27.6), (5.2, 0, 28.4), (7.8, 0, 27.4), (9.4, 0, 25.6)]
    radii = [2.6, 2.4, 2.2, 2.0, 1.85, 1.7, 1.6, 1.5, 1.45, 1.4]
    return pts, radii


def bilelance_gun(L: LM, crew: int) -> None:
    pts, radii = bl_path()
    # Segmented tail: a bone plate per segment, a dark membrane joint between.
    for i in range(len(pts) - 1):
        a, b = np.array(pts[i]), np.array(pts[i + 1])
        d = b - a
        j0 = a + d * 0.12
        j1 = b - d * 0.04
        L.cyl(tuple(j0), tuple(j1), radii[i] * 1.12, radii[i + 1] * 0.98, "bone", n=12)
        L.cyl(tuple(a), tuple(j0), radii[i] * 0.86, radii[i] * 0.86, "membrane", n=10, part=False)
        # A dorsal amber pore on the outer curve.
        mid = (a + b) / 2
        nx, nz = -d[2], d[0]
        ln = math.hypot(nx, nz) or 1.0
        if i % 2 == 0:
            bk.lball(L, (mid[0] - nx / ln * radii[i] * 1.05, 0.0, mid[2] - nz / ln * radii[i] * 1.05), 0.55, "glow", rings=3, n=8, part=False)
    # The team plate: a gray saddle on the first segment's back.
    L.hexa([(-2.4, -1.5, 8.2), (-1.0, -1.5, 8.8), (-2.4, 1.5, 8.2), (-1.0, 1.5, 8.8),
            (-3.4, -1.4, 12.4), (-2.2, -1.4, 12.8), (-3.4, 1.4, 12.4), (-2.2, 1.4, 12.8)], "team")
    # The acid gland: a swollen glowing sac in bone ribs, and the sting hooked down at the target.
    g = (10.2, 0.0, 24.8)
    bk.lball(L, g, 2.5, "acid", rings=6, n=14, squash=0.9)
    for k in range(4):
        a = 2 * math.pi * k / 4 + 0.4
        L.cyl((g[0] - 2.0, 1.4 * math.cos(a), g[2] + 1.4 * math.sin(a)), (g[0] + 1.6, 1.6 * math.cos(a), g[2] + 1.6 * math.sin(a)), 0.36, 0.3, "bone_dk", n=5, part=False)
    tip = BL_TIP
    L.cyl((g[0] + 1.8, 0, g[2] - 0.8), (tip[0] - 0.4, 0, tip[2] + 0.3), 0.9, 0.25, "bone_lt", n=8)
    bk.lball(L, tip, 0.45, "hot", rings=3, n=8)


# ---------------------------------------------------------------- Puffcap, t(1)

PC_O = 10.8  # cap pivot height
PC_EL = math.radians(52.0)
PC_H = 4.4  # dome height along its axis
PC_R = 7.0
PC_VENT = PC_H + 1.3  # centre vent mouth, along the axis


def puffcap_base(ground: bool = True) -> ra.Mesh:
    m = ra.Mesh()
    L = LM(m, cx=C, cy=C)
    if ground:
        bk.creep_pad(L, 14.0, 7)
    for k in range(4):
        bk.knot_root(L, 2 * math.pi * k / 4 + 0.8, 4.0, 2.4, 11.5, 1.4, 30 + k, mat="bone_dk")
    # The squat ivory stem: a bulbous foot, a torn ring skirt, a narrower neck.
    bk.lball(L, (0, 0, 2.4), 5.6, "bone", rings=6, n=20, squash=0.55)
    L.cyl((0, 0, 2.4), (0, 0, 8.6), 4.4, 3.4, "bone", n=18)
    L.cyl((0, 0, 6.0), (0, 0, 6.8), 3.9, 5.4, "flesh_lt", n=18, caps=False)
    L.cyl((0, 0, 6.8), (0, 0, 7.2), 5.4, 3.7, "flesh", n=18, caps=False, part=False)
    plate(L, math.pi / 4, 2.8, 5.6, 4.35, 4.0, 0.5)
    # Baby caps sprouting from the creep.
    for (x, y, h, r) in ((8.6, 3.8, 2.4, 1.7), (4.2, 9.2, 1.8, 1.3), (-9.0, 4.0, 2.0, 1.5)):
        L.cyl((x, y, 0.5), (x, y, h), 0.6, 0.5, "bone", n=8)
        bk.lball(L, (x, y, h), r, "flesh", rings=4, n=10, squash=0.6, part=False)
    L.cyl((0, 0, 8.4), (0, 0, 9.2), 3.0, 2.8, "bone_dk", n=16)
    return m


def puffcap_gun(L: LM, crew: int) -> None:
    d = np.array([math.cos(PC_EL), 0.0, math.sin(PC_EL)])
    u = np.array([-math.sin(PC_EL), 0.0, math.cos(PC_EL)])
    y = np.array([0.0, 1.0, 0.0])
    o = np.array([0.0, 0.0, PC_O])

    def P(v):
        return tuple(float(t) for t in v)

    # The neck from the collar to the cap's underside.
    L.cyl((0, 0, 9.2), P(o - d * 0.4), 2.6, 2.2, "bone", n=14)
    # Gills underneath: a dark disc with bone ridges, lipped by the cap rim.
    L.cyl(P(o - d * 0.5), P(o), PC_R - 0.6, PC_R, "membrane", n=24)
    L.m.new_part()
    for k in range(18):
        a = 2 * math.pi * k / 18
        r = u * math.cos(a) + y * math.sin(a)
        L.cyl(P(o - d * 0.55 + r * 2.0), P(o - d * 0.55 + r * (PC_R - 0.9)), 0.18, 0.18, "bone_dk", n=4, part=False)
    # The cap: a domed flesh shell along d, in rings.
    L.m.new_part()
    rings = 7
    for i in range(rings):
        a0 = math.pi / 2 * i / rings
        a1 = math.pi / 2 * (i + 1) / rings
        L.cyl(P(o + d * PC_H * math.sin(a0)), P(o + d * PC_H * math.sin(a1)), max(PC_R * math.cos(a0), 0.05), max(PC_R * math.cos(a1), 0.05), "flesh", n=26, caps=False, part=False)
    # Pale warts on the cap.
    L.m.new_part()
    for (ph, th) in ((0.35, 0.3), (0.35, 2.2), (0.35, 4.1), (0.6, 1.2), (0.6, 3.3), (0.6, 5.2), (0.25, 5.6)):
        rr = PC_R * math.cos(ph * math.pi / 2 * 1.0)
        hh = PC_H * math.sin(ph * math.pi / 2)
        r = u * math.cos(th) + y * math.sin(th)
        bk.lball(L, P(o + d * (hh + 0.2) + r * rr * 0.92), 0.75, "bone_lt", rings=3, n=8, squash=0.6, part=False)
    # Spore vents: a ring of short puckered stacks round the crown, a big one at the top.
    L.m.new_part()
    for k in range(5):
        th = 2 * math.pi * k / 5 + 0.3
        r = u * math.cos(th) + y * math.sin(th)
        b = o + d * (PC_H * 0.78) + r * 3.4
        t = b + d * 1.4 + r * 0.35
        L.cyl(P(b), P(t), 0.85, 0.7, "flesh_lt", n=8, part=False)
        L.cyl(P(t), P(t + d * 0.15), 0.5, 0.5, "glow", n=8, part=False)
    top = o + d * PC_H
    L.cyl(P(top - d * 0.3), P(o + d * PC_VENT), 1.5, 1.25, "flesh_lt", n=12)
    L.cyl(P(o + d * PC_VENT), P(o + d * (PC_VENT + 0.12)), 0.95, 0.95, "hot", n=12, part=False)
    # Team plate: a gray scale on the cap's back slope.
    r = -u
    c0 = o + d * (PC_H * 0.55) + r * (PC_R * 0.72)
    L.m.new_part()
    bk.lball(L, P(c0 + d * 0.3), 1.6, "team", rings=4, n=10, squash=0.45, part=False)


# ---------------------------------------------------------------- Eye Stalk, t(1), garrison

ES_W = 32.0
ES_EYE = (1.4, 1.4, 47.0)
ES_EYE_R = 6.8
ES_POUCH = (2.4, 2.4, 30.5)
ES_ROOF = ES_EYE[2] + ES_EYE_R + 1.6
ES_FLOOR = 29.0


def eyestalk_mesh(ground: bool = True) -> ra.Mesh:
    m = ra.Mesh()
    L = LM(m, cx=ES_W / 2, cy=ES_W / 2)
    if ground:
        bk.creep_pad(L, 14.2, 11)
    for k in range(6):
        bk.knot_root(L, 2 * math.pi * k / 6 + 0.5, 2.8, 5.0, 13.0, 1.6, 40 + k)
    # The stalk: a long tapering flesh column with a slight lean, banded with bone rings.
    pts = [(0, 0, 0.4), (-0.4, 0.2, 7.0), (-0.6, -0.2, 14.0), (-0.2, -0.4, 21.0), (0.3, 0.0, 28.0), (0.8, 0.6, 34.0), (1.1, 1.0, 39.5)]
    radii = [3.9, 3.3, 2.9, 2.6, 2.4, 2.3, 2.6]
    bk.tube(L, pts, radii, "flesh", n=16)
    bk.lball(L, (0.2, 0.0, 2.6), 4.4, "flesh_dk", rings=5, n=16, squash=0.7, part=False)
    for i in (1, 2, 3, 4):
        x, y, z = pts[i]
        L.cyl((x, y, z - 0.5), (x, y, z + 0.5), radii[i] + 0.35, radii[i] + 0.25, "bone", n=16)
    bk.amber_beads(L, [(pts[i][0] + radii[i] * 0.72, pts[i][1] + radii[i] * 0.72, pts[i][2] + 3.2) for i in (2, 3, 4)], 0.6)
    # Team plate low on the stalk, facing the viewer.
    TL = L.sub(-0.5, 0.0, 0.0, 9.0)
    plate(TL, math.pi / 4, 0.0, 3.6, 3.2, 3.0, 0.55)
    # The pouch: a hanging sac under the eye, its mouth open to the front (the brood sit in it).
    px, py, pz = ES_POUCH
    bk.lball(L, (px, py, pz), 4.0, "flesh_lt", rings=6, n=16, squash=1.15)
    a = math.pi / 4
    c, s = math.cos(a), math.sin(a)
    mouth = (px + 3.2 * c, py + 3.2 * s, pz + 0.8)
    mouth_in = (px + 2.0 * c, py + 2.0 * s, pz + 0.6)
    L.cyl(mouth_in, mouth, 2.5, 2.7, "membrane", n=14, cap_mat="slit")
    PL = L.sub(mouth[0], mouth[1], a, mouth[2])
    bk.ltorus(PL, (0.1, 0, 0), "x", 2.7, 0.55, "flesh", segs=14)
    # Lid hood and the eye.
    ex, ey, ez = ES_EYE
    bk.lball(L, (ex - 2.4, ey - 2.4, ez + 1.4), ES_EYE_R + 0.2, "flesh", rings=6, n=18, squash=0.86)
    ax = np.array([1.0, 1.0, -0.12])
    ax /= np.linalg.norm(ax)
    w = np.array(L.w((ex, ey, ez)))
    bk.EYE.update(c=w, a=ax, r=ES_EYE_R * 0.72)
    bk.lball(L, (ex, ey, ez), ES_EYE_R, "iris", rings=8, n=22)
    # Upper lid lip and a few bone lashes over the brow.
    LL = L.sub(ex, ey, a, ez)
    L.m.new_part()
    for k in range(7):
        t = -1.0 + 2.0 * k / 6
        base = (-0.6, t * 5.0, 6.2 - abs(t) * 1.8)
        tip = (1.8, t * 6.8, 9.0 - abs(t) * 2.6)
        LL.cyl(base, tip, 0.35, 0.06, "bone_lt", n=5, part=False)
    return m


# ---------------------------------------------------------------- Husk Burrow, t(2), garrison

HU_W = 64.0
HU_C = (-3.0, 0.0, 0.0)  # carapace centre, local (front to the east)
HU_ABC = (24.0, 17.5, 15.0)
HU_ROOF = 15.6


def husk_mesh(ground: bool = True) -> ra.Mesh:
    m = ra.Mesh()
    L = LM(m, cx=HU_W / 2, cy=HU_W / 2)
    if ground:
        bk.creep_pad(L, 29.5, 13, z1=0.8, n=28)
    # A mounded berm of soil-creep the shell is sunk into.
    wf.annulus(L, 17.5, 26.5, 18.2, 22.0, 0.0, 2.6, "creep", -math.pi, math.pi, 22, per_seg_part=False)
    c = HU_C
    abc = HU_ABC
    # Inner shell (lit slits show it between the plates).
    bk.ell_patch(L, c, abc, 0.0, 2 * math.pi, 0.08, math.pi / 2, "slit", nt=28, npf=5, s=0.95)
    # Skirt plates round the foot, one part each, alternately proud.
    nsk = 10
    for k in range(nsk):
        th0 = 2 * math.pi * k / nsk + 0.015
        th1 = 2 * math.pi * (k + 1) / nsk - 0.015
        bk.ell_patch(L, c, abc, th0, th1, 0.0, 0.16, "bone_dk", nt=4, npf=2, s=1.03 + 0.012 * (k % 2))
    # Ribs crossing the slit band: the slits between them.
    for k in range(14):
        th = 2 * math.pi * k / 14
        bk.ell_patch(L, c, abc, th - 0.07, th + 0.07, 0.12, 0.34, "bone", nt=2, npf=2, s=1.0)
    # The two elytra, split down the back, each in three plates along the body.
    for side in (0, 1):
        t0 = 0.0 if side == 0 else math.pi
        # One wing case per side, the seam open down the spine (the inner shell glows through).
        bk.ell_patch(L, c, abc, t0 + 0.035, t0 + math.pi - 0.035, 0.33, math.pi / 2 - 0.04, "elytra", nt=20, npf=7, s=1.02)
    # The pronotum shield over the front, and the head sunk low before it.
    bk.ell_patch(L, (14.0, 0.0, 0.0), (9.0, 13.5, 13.0), -math.pi * 0.62, math.pi * 0.62, 0.2, math.pi / 2, "bone_dk", nt=14, npf=5, s=1.0)
    bk.ell_patch(L, (14.0, 0.0, 0.0), (9.0, 13.5, 13.0), -math.pi * 0.62, math.pi * 0.62, 0.0, 0.2, "slit", nt=14, npf=1, s=0.96)
    bk.ell_patch(L, (22.0, 0.0, 0.0), (5.4, 7.0, 6.2), -math.pi * 0.7, math.pi * 0.7, 0.0, math.pi / 2, "bone_dk", nt=10, npf=4, s=1.0)
    # A short broken horn and two mandibles in the dirt.
    bk.tube(L, [(23.0, 0.0, 5.2), (25.6, 0.0, 8.4), (27.0, 0.0, 10.0)], [1.6, 1.0, 0.4], "bone", n=8)
    for s in (-1, 1):
        bk.tube(L, [(25.0, s * 4.4, 1.6), (28.4, s * 5.4, 1.2), (30.4, s * 3.4, 0.9), (30.6, s * 1.6, 0.8)], [1.3, 1.0, 0.6, 0.25], "bone_dk", n=7)
    bk.amber_beads(L, [(25.2, s * 4.6, 4.0) for s in (-1, 1)], 0.95)
    # Glowing seams along the elytra split and a row of pores.
    bk.amber_beads(L, [(c[0] + x, 0.0, abc[2] * 1.02 * math.sqrt(1 - (x / abc[0]) ** 2) + 0.2) for x in (-14.0, -6.0, 2.0)], 0.6)
    # Broken leg stubs poking out of the soil.
    for (x, s) in ((-12.0, 1), (0.0, 1), (-12.0, -1), (0.0, -1)):
        bk.tube(L, [(x, s * 17.2, 1.4), (x + 1.4, s * 21.4, 4.4), (x + 3.0, s * 24.0, 2.2), (x + 3.6, s * 25.4, 0.6)], [1.4, 1.1, 0.8, 0.3], "bone_dk", n=7)
    # Team plate: a gray scute on the elytron facing the viewer.
    bk.ell_patch(L, c, abc, 0.55, 1.02, 0.55, 0.88, "team", nt=5, npf=3, s=1.045)
    # The way in at the rear (west): a dark hole under a lip.
    L.cyl((-28.6, 0.0, 3.0), (-27.0, 0.0, 3.0), 4.6, 4.4, "membrane", n=16, cap_mat="membrane")
    BL = L.sub(-28.6, 0.0, math.pi, 3.0)
    bk.ltorus(BL, (0.0, 0.0, 0.0), "x", 4.6, 0.9, "bone_dk", segs=16)
    return m


# ---------------------------------------------------------------- render

GUNS = {
    "thornspitter": wg.Gun("thornspitter", 32.0, (4, 4), 18.0, 10.0, 0, thornspitter_base, thornspitter_gun, TS_Z, TS_MUZZLE),
    "bilelance": wg.Gun("bilelance", 32.0, (4, 4), 28.0, 12.0, 0, bilelance_base, bilelance_gun, BL_TIP[2], BL_TIP[0]),
    "puffcap": wg.Gun(
        "puffcap", 32.0, (4, 4), 18.0, 10.0, 0, puffcap_base, puffcap_gun, PC_O, round(PC_VENT * math.cos(PC_EL), 2),
        extra={"muzzleZ": round(PC_O + PC_VENT * math.sin(PC_EL), 2), "elevationDeg": round(math.degrees(PC_EL))},
    ),
}

GARRISONS = {
    # name: (mesh, W, H, tiles, top margin, side margin, shadow reach, floor top, roofZ, stack z, cameo crop)
    "eyestalk": (eyestalk_mesh, ES_W, ES_W, (4, 4), 56.0, 44.0, 40.0, 0.8, ES_ROOF, ES_ROOF + 6.0,
                 wf.tall_cameo(ES_ROOF, ES_FLOOR + 6.0, ES_W, ES_W)),
    "husk": (husk_mesh, HU_W, HU_W, (8, 8), 24.0, 12.0, 8.0, 3.0, HU_ROOF, HU_ROOF + 10.0, None),
}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True, help="buildings asset folder")
    ap.add_argument("--only", nargs="*", choices=sorted(list(GUNS) + list(GARRISONS)))
    args = ap.parse_args()
    out = Path(args.out)
    for name, g in GUNS.items():
        if args.only and name not in args.only:
            continue
        # Not turned before placing: the unturned pad only.
        wg.render_gun(out, g, turned=False)
    for name, (fn, W, H, tiles, top, side, reach, floor, roof, stack, crop) in GARRISONS.items():
        if args.only and name not in args.only:
            continue
        wf.GUN_FRAME.update(yaw=0.0, cx=W / 2, cy=H / 2)
        wf.render_building(out, name, fn, W, H, tiles, top, side, reach, floor, roof, stack, turned=False, cameo_crop=crop)


if __name__ == "__main__":
    main()
