#!/usr/bin/env python3
"""The Bloom base buildings: grown, not built.

Each writes <id>.png, <id>-cameo.png (96 px), and <id>.json (pad metrics plus
glow spots, source px in the image frame) into the buildings asset folder,
the render_xeno_base.py contract, at the same camera and pad scale (a t(3)
footprint at zoom 2 and a t(2) or t(2.5) at zoom 3 both give a 384 px pad).

  broodheart  t(3)    HQ (Hive Core): a beating heart-mound half sunk in the
                      ground, bone ribs arching over it, glowing ventricles,
                      veins running out into the soil
  lumenbulb   t(2)    power (Fusion Node): three translucent amber bulbs on
                      stalks over a knot of roots
  gorger      t(3)    scrap (Assimilator): a wide toothed maw over a glowing
                      gullet pit, scrap heaped by it, a gullet sac swelling
                      behind
  broodnest   t(2.5)  infantry (Cyborg Central): a mound of leathery egg-sacs
                      under a chitin awning, one sac split open and glowing
  gestator    t(3)    beasts (Forge): a long ribbed womb-hall, a huge
                      translucent sac with a curled shape inside, a glowing
                      birthing slit at the front
  braincoral  t(2)    tech + radar (Nexus): a folded brain-coral dome crowned
                      with feeler stalks lit at the tips

Palette lock from gridlock/docs/factions/bloom.md; shared shapes, materials
and the render step in bloom_base_geo.py. Every building carries a
chassis-gray team plate.

  python3 tools/sprites/render_bloom_base.py --out gridlock/packages/client/src/assets/buildings
  python3 tools/sprites/render_bloom_base.py --out ... --only broodheart
"""

from __future__ import annotations

import argparse
import math
from pathlib import Path

import numpy as np

import bloom_base_geo as g

ra = g.ra


# ---------------------------------------------------------------- Brood Heart, t(3) x t(3)

BH = 96.0
BH_C = (46.0, 46.0)
BH_HEART_C = (46.0, 44.0, -3.0)
BH_HEART_R = (26.0, 23.0, 36.0)
BH_RV_C = (40.0, 60.0, -2.0)      # right ventricle, the lesser lobe on the screen-left flank
BH_RV_R = (17.0, 15.0, 27.0)
BH_ATRIA = [((33.0, 35.0, 25.0), (11.0, 10.0, 10.0)), ((53.0, 31.0, 23.0), (9.0, 9.0, 9.0))]
BH_RIBS = 7
# Glowing ventricle windows: direction from the heart centre and angular radius.
BH_WINDOWS = [((1.0, 0.75, 0.55), 0.36), ((0.55, 1.0, 0.25), 0.3)]
BH_RV_WINDOW = ((0.3, 1.0, 0.35), 0.38)


def bh_rib(i: int) -> list[np.ndarray]:
    """A rib springing from the ground ring and hooking in over the heart, the front left open."""
    cx, cy = BH_C
    a = math.radians(45.0 + 72.0 + 216.0 * i / (BH_RIBS - 1))
    top = 47.0 + 5.0 * math.sin(i * 1.9)
    out = []
    for rr, z in ((42.0, 0.6), (43.0, 17.0), (38.0, 33.0), (27.0, top), (16.0, top + 1.0), (10.0, top - 6.0)):
        out.append(np.array([cx + rr * math.cos(a), cy + rr * math.sin(a), z]))
    return out


def bh_aorta() -> list[np.ndarray]:
    return [np.array(p) for p in ((45.0, 45.0, 26.0), (47.0, 43.0, 45.0), (56.0, 32.0, 54.0), (68.0, 21.0, 46.0), (76.0, 14.0, 24.0),
                                  (79.0, 11.0, 0.5))]


def bh_vents() -> list[tuple[np.ndarray, np.ndarray]]:
    """Base and glowing mouth of the vessels: two off the aortic arch, the pulmonary trunk to the west."""
    out = []
    arch = g.catmull(bh_aorta(), 4)
    for k, idx in enumerate((6, 9)):
        b = arch[idx]
        out.append((b, b + np.array([-2.0 + 1.0 * k, -2.0 - 1.0 * k, 10.0 - 2.0 * k])))
    out.append((np.array([37.0, 50.0, 24.0]), np.array([28.0, 56.0, 41.0])))
    return out


def bh_ventricles() -> list[np.ndarray]:
    out = [g.ellip_surface(BH_HEART_C, BH_HEART_R, d)[0] for d, _ in BH_WINDOWS]
    out.append(g.ellip_surface(BH_RV_C, BH_RV_R, BH_RV_WINDOW[0])[0])
    return out


def build_broodheart(with_pad: bool) -> ra.Mesh:
    g.reset_frames()
    m = ra.Mesh()
    if with_pad:
        g.creep_pad(m, BH, BH, seed=1.0)
    cx, cy = BH_C
    # Roots and veins running out into the soil, some lit.
    for k in range(14):
        a = 2 * math.pi * k / 14 + 0.2
        r1 = 44.0 - 3.0 * (k % 3)
        mat = "bl_glow_d" if k % 3 == 1 else "bl_flesh_d"
        rad = 1.0 if mat == "bl_glow_d" else 2.0
        g.root(m, (cx + 22.0 * math.cos(a), cy + 22.0 * math.sin(a), 1.2), (cx + r1 * math.cos(a), cy + r1 * math.sin(a), 0.8),
               rad * 1.6, rad * 0.4, mat, seed=k * 1.3, lift=1.0, wig=2.5)
    # A fleshy skirt where the heart meets the ground.
    g.lathe(m, BH_C, [(34.0, 0.8), (32.0, 3.0), (29.0, 5.0), (25.0, 6.5)], "bl_flesh_d", seg=40, wob=0.07, seed=2.0)
    # The heart: two ventricles half sunk, glowing through windows in the muscle; the atria on its back.
    g.HEARTS.append({"c": np.array(BH_HEART_C), "r": BH_HEART_R, "win": BH_WINDOWS})
    g.HEARTS.append({"c": np.array(BH_RV_C), "r": BH_RV_R, "win": [BH_RV_WINDOW]})
    g.ellip(m, BH_HEART_C, BH_HEART_R, "bl_heart", rings=18, seg=44, wob=0.04, seed=0.7, zmin=1.0)
    g.ellip(m, BH_RV_C, BH_RV_R, "bl_heart", rings=14, seg=32, wob=0.05, seed=1.9, zmin=1.0)
    for k, (c, r) in enumerate(BH_ATRIA):
        g.ellip(m, c, r, "bl_flesh_d", rings=9, seg=20, wob=0.1, seed=2.2 + k)
    # The sulcus between the ventricles: a fat glowing coronary vein, and lesser veins over the skin.
    sul = []
    for t in np.linspace(0.0, 1.0, 7):
        d = (0.35 - 0.1 * t, 1.0, 0.05 + 1.3 * t)
        p, nrm = g.ellip_surface(BH_HEART_C, BH_HEART_R, d)
        sul.append(p + nrm * 0.4)
    g.tube(m, sul, [2.2, 1.8, 1.2], "bl_glow_d", n=8, sub=3)
    for k, (a0, a1) in enumerate(((0.1, 0.9), (-0.9, -0.2), (2.6, 3.4), (4.0, 4.8))):
        pts = []
        for t in np.linspace(0.0, 1.0, 6):
            a = a0 + (a1 - a0) * t
            el = 0.1 + 0.85 * t
            d = (math.cos(a) * math.cos(el), math.sin(a) * math.cos(el), math.sin(el) * 1.3)
            p, nrm = g.ellip_surface(BH_HEART_C, BH_HEART_R, d)
            pts.append(p + nrm * 0.5)
        g.tube(m, pts, [1.4, 1.0, 0.5], "bl_flesh_d", n=6, sub=3)
    # The aorta: a great arch out of the crown, plunging into the soil behind.
    arch = bh_aorta()
    g.tube(m, arch, [6.5, 6.0, 5.6, 5.2, 5.4, 6.4], "bl_flesh", n=14, sub=4)
    for t in (0.3, 0.55):
        p = g.catmull(arch, 4)[int(t * 20)]
        g.ellip(m, p, (6.4, 6.4, 6.4), "bl_bone_d", rings=5, seg=14, wob=0.08, seed=t * 9)
    # Vessels off the arch and the pulmonary trunk: glowing mouths on bone collars.
    for k, (b, mouth) in enumerate(bh_vents()):
        r0 = 3.4 if k < 2 else 5.0
        mid = (b + mouth) / 2 + np.array([0.0, 0.0, 1.5])
        g.tube(m, [b - (mouth - b) * 0.15, mid, mouth], [r0, r0 * 0.9, r0 * 0.85], "bl_flesh", n=10, sub=4, cap_mat="bl_glow")
        d = (mouth - mid) / np.linalg.norm(mouth - mid)
        g.tube(m, [mouth - d * 0.6, mouth + d * 0.7], [r0 * 1.05, r0 * 0.95], "bl_bone", n=10, sub=1, cap_mat="bl_hot")
    # Ribs hooking over it.
    for i in range(BH_RIBS):
        pts = bh_rib(i)
        g.tube(m, pts, [3.6, 3.2, 2.6, 2.0, 1.2, 0.2], "bl_bone", n=8, sub=4)
        g.ellip(m, pts[0] + np.array([0, 0, 0.6]), (4.6, 4.6, 3.0), "bl_bone_d", rings=5, seg=12, wob=0.12, seed=i)
    # The team plate: a gray carapace shield on the heart's crown, toward the camera.
    p, nrm = g.ellip_surface(BH_HEART_C, BH_HEART_R, (0.2, 0.75, 1.4))
    g.plate(m, p + nrm * 0.6, nrm, 9.0, 6.5, thick=2.4, spin=0.8)
    return m


def broodheart_spots() -> dict:
    cx, cy = BH_C
    top = 52.0
    return {
        "heart": tuple(bh_ventricles()[0]),
        "ventricles": [tuple(p) for p in bh_ventricles()],
        "vents": [tuple(mouth) for _, mouth in bh_vents()],
        "beacon": (40.0, 35.0, 58.0),
        "stack": (cx, cy, top + 14.0),
    }


# ---------------------------------------------------------------- Lumen Bulb, t(2) x t(2)

LB = 64.0
LB_C = (31.0, 31.0)
# Bulb centre (x, y, z) and radius: one tall at the back, two lower in front left and right.
LB_BULBS = [((26.0, 26.0, 44.0), 9.6), ((44.0, 26.0, 31.0), 8.4), ((26.0, 44.0, 26.0), 8.0)]


def build_lumenbulb(with_pad: bool) -> ra.Mesh:
    g.reset_frames()
    m = ra.Mesh()
    if with_pad:
        g.creep_pad(m, LB, LB, seed=2.0)
    cx, cy = LB_C
    # Roots knotted at the base, then spreading over the pad.
    for k in range(11):
        a = 2 * math.pi * k / 11 + 0.4
        g.root(m, (cx + 6.0 * math.cos(a), cy + 6.0 * math.sin(a), 3.0), (cx + (25.0 - 3 * (k % 2)) * math.cos(a), cy + (25.0 - 3 * (k % 2)) * math.sin(a), 0.8),
               2.0, 0.5, "bl_glow_d" if k % 4 == 2 else "bl_flesh_d", seed=k * 2.1, lift=1.4, wig=2.2)
    g.lathe(m, LB_C, [(18.0, 0.8), (16.5, 3.5), (13.0, 6.5), (8.0, 8.5), (3.0, 9.5)], "bl_flesh_d", seg=28, wob=0.12, seed=4.0)
    # A knot of twisted root coils round the stalk feet.
    for k in range(5):
        a = 2 * math.pi * k / 5
        pts = [(cx + 9.0 * math.cos(a), cy + 9.0 * math.sin(a), 2.0), (cx + 6.0 * math.cos(a + 0.9), cy + 6.0 * math.sin(a + 0.9), 7.0),
               (cx + 3.0 * math.cos(a + 1.9), cy + 3.0 * math.sin(a + 1.9), 10.0), (cx + 1.0 * math.cos(a + 2.8), cy + math.sin(a + 2.8), 12.0)]
        g.tube(m, pts, [2.6, 2.0, 1.4, 0.8], "bl_flesh", n=8, sub=3)
    # Stalks, each curving up to its bulb, a bone calyx under the bulb.
    for k, (c, r) in enumerate(LB_BULBS):
        c = np.array(c)
        foot = np.array([cx + (c[0] - cx) * 0.25, cy + (c[1] - cy) * 0.25, 8.0])
        mid = np.array([cx + (c[0] - cx) * 0.8 + 1.5, cy + (c[1] - cy) * 0.8 - 1.5, (8.0 + c[2] - r) * 0.55])
        neck = c - np.array([0.0, 0.0, r * 0.9])
        g.tube(m, [foot, mid, neck], [2.6, 1.9, 1.5], "bl_flesh", n=8, sub=5)
        for j in range(5):
            a = 2 * math.pi * j / 5 + k
            b0 = neck + np.array([math.cos(a) * 1.2, math.sin(a) * 1.2, 0.2])
            tip = neck + np.array([math.cos(a) * r * 0.75, math.sin(a) * r * 0.75, r * 0.65])
            g.spike(m, b0, tip, 1.2, "bl_bone", bend=(math.cos(a) * 1.4, math.sin(a) * 1.4, -0.6))
        # The bulb: a teardrop, translucent amber.
        g.lathe(m, c, [(0.6, c[2] - r * 1.05), (r * 0.62, c[2] - r * 0.75), (r * 0.95, c[2] - r * 0.2), (r, c[2] + r * 0.2),
                       (r * 0.82, c[2] + r * 0.65), (r * 0.42, c[2] + r * 0.95), (0.3, c[2] + r * 1.1)], "bl_bulb", seg=22, wob=0.04,
                seed=k)
        g.ellip(m, c + np.array([0, 0, r * 1.05]), (1.3, 1.3, 1.0), "bl_hot", rings=4, seg=8)
    # Team plate on the root mound, facing the camera.
    p = np.array([cx + 10.5, cy + 10.5, 5.2])
    g.plate(m, p, (0.55, 0.55, 0.62), 5.0, 3.6, thick=1.1, spin=0.0)
    return m


def lumenbulb_spots() -> dict:
    cx, cy = LB_C
    return {
        "bulbs": [c for c, _ in LB_BULBS],
        "core": tuple(np.mean([c for c, _ in LB_BULBS], axis=0)),
        "tips": [(c[0], c[1], c[2] + r * 1.05) for c, r in LB_BULBS],
        "stack": (LB_BULBS[0][0][0], LB_BULBS[0][0][1], LB_BULBS[0][0][2] + 11.0),
    }


# ---------------------------------------------------------------- Gorger, t(3) x t(3)

GG = 96.0
GG_PIT = (56.0, 56.0)
GG_PIT_R = 17.0
GG_LIP_Z = 9.0
GG_SAC_C = (28.0, 28.0, 14.0)
GG_SAC_R = (19.0, 18.0, 20.0)


def build_gorger(with_pad: bool) -> ra.Mesh:
    g.reset_frames()
    m = ra.Mesh()
    if with_pad:
        g.creep_pad(m, GG, GG, seed=3.0)
    px, py = GG_PIT
    g.POOLS.append({"x": px, "y": py, "r": GG_PIT_R, "rim": GG_LIP_Z, "depth": GG_LIP_Z + 1.0, "chunk": "#2c2622", "chunk_amt": 0.95})
    # The gullet: acid at the bottom with scrap sinking, throat walls lit from below.
    if with_pad:
        m.new_part()
        g.lathe(m, GG_PIT, [(GG_PIT_R - 3.5, 1.2), (0.1, 1.2)], "bl_pool", seg=36, cap=False, part=False)
    g.lathe(m, GG_PIT, [(GG_PIT_R - 3.5, 1.2), (GG_PIT_R - 2.0, 4.0), (GG_PIT_R - 0.8, 7.0), (GG_PIT_R, GG_LIP_Z - 0.5)],
            "bl_gullet", seg=36, cap=False, wob=0.03)
    # The lips: a fat ring of flesh round the maw, its outside sloping down to the pad.
    g.lathe(m, GG_PIT, [(GG_PIT_R + 13.0, 0.8), (GG_PIT_R + 11.0, 4.0), (GG_PIT_R + 7.5, GG_LIP_Z), (GG_PIT_R + 3.5, GG_LIP_Z + 1.6),
                        (GG_PIT_R + 0.3, GG_LIP_Z), (GG_PIT_R, GG_LIP_Z - 0.6)], "bl_flesh", seg=40, wob=0.05, seed=1.5, cap=False)
    # Gum ridges and two rings of teeth, raked inward over the pit.
    for ring, (rr, n_, h, rad) in enumerate(((GG_PIT_R + 4.0, 14, 7.5, 2.0), (GG_PIT_R + 1.2, 18, 5.0, 1.3))):
        for k in range(n_):
            a = 2 * math.pi * (k + 0.5 * ring) / n_
            b = np.array([px + rr * math.cos(a), py + rr * math.sin(a), GG_LIP_Z + 0.8])
            tip = np.array([px + (rr - h * 0.75) * math.cos(a), py + (rr - h * 0.75) * math.sin(a), GG_LIP_Z + h * 0.8])
            g.spike(m, b, tip, rad * (0.85 + 0.3 * ((k * 7) % 3) / 2), "bl_bone", bend=(0, 0, 1.2))
    # The throat: a thick ribbed neck from the maw back to the gullet sac.
    sc = np.array(GG_SAC_C)
    neck = [np.array([px - 14.0, py - 14.0, 5.0]), np.array([px - 22.0, py - 22.0, 8.0]), sc + np.array([9.0, 9.0, -4.0])]
    g.tube(m, neck, [7.5, 7.0, 7.5], "bl_flesh_d", n=14, sub=4)
    for t in (0.25, 0.5, 0.75):
        p = neck[0] + (neck[2] - neck[0]) * t + np.array([0, 0, 1.6 * math.sin(t * math.pi)])
        g.ellip(m, p, (5.0, 5.0, 8.4), "bl_bone_d", rings=5, seg=16, R=g.frame((1, 1, 0.2)) @ np.array([[0, 0, 1.0], [0, 1.0, 0], [1.0, 0, 0]]))
    # The gullet sac, swelling, veined with light.
    g.lathe(m, (sc[0], sc[1]), [(22.0, 0.8), (21.0, 3.0)], "bl_flesh_d", seg=32, wob=0.07, seed=0.5)
    g.ellip(m, sc, GG_SAC_R, "bl_flesh", rings=14, seg=32, wob=0.07, seed=3.3, zmin=2.0)
    for k in range(6):
        a = 2 * math.pi * k / 6 + 0.5
        pts = []
        for t in np.linspace(0, 1, 6):
            el = -0.2 + 1.2 * t
            d = (math.cos(a + 0.5 * t) * math.cos(el), math.sin(a + 0.5 * t) * math.cos(el), math.sin(el))
            p, nrm = g.ellip_surface(sc, GG_SAC_R, d)
            pts.append(p + nrm * 0.5)
        g.tube(m, pts, [1.4, 1.0, 0.4], "bl_glow_d", n=6, sub=3)
    # A glowing vent on top of the sac (where the stack hangs) and two pores.
    top = sc + np.array([0, 0, GG_SAC_R[2]])
    g.tube(m, [top - np.array([0, 0, 1.5]), top + np.array([0.0, 0.0, 3.0])], [4.0, 3.0], "bl_flesh_d", n=12, sub=1, cap_mat="bl_glow")
    g.ellip(m, top + np.array([0, 0, 3.0]), (2.4, 2.4, 0.8), "bl_hot", rings=4, seg=10)
    # Scrap heaped by the maw, waiting to be eaten (scrap stays straight-edged: it is ours, not theirs).
    for (x0, y0, w, d, h) in ((14, 76, 9, 6, 4), (24, 84, 6, 5, 3), (8, 64, 5, 7, 3), (84, 40, 6, 5, 3), (78, 28, 5, 6, 3)):
        m.box((x0, y0, 1.0), (x0 + w, y0 + d, 1.0 + h), "scrap")
    # Feelers that rake the scrap in.
    for k, (a, l) in enumerate(((2.35, 26.0), (0.8, 24.0))):
        b = np.array([px + (GG_PIT_R + 9.0) * math.cos(a), py + (GG_PIT_R + 9.0) * math.sin(a), 5.0])
        e = np.array([px + (GG_PIT_R + 9.0 + l * 0.5) * math.cos(a + 0.3), py + (GG_PIT_R + 9.0 + l * 0.5) * math.sin(a + 0.3), 6.0])
        f = np.array([px + (GG_PIT_R + 9.0 + l) * math.cos(a + 0.15), py + (GG_PIT_R + 9.0 + l) * math.sin(a + 0.15), 1.2])
        g.tube(m, [b, e, f], [2.2, 1.6, 0.4], "bl_flesh", n=8, sub=4)
    # Team plate on the sac's flank toward the camera.
    p, nrm = g.ellip_surface(sc, GG_SAC_R, (0.3, 1.0, 0.45))
    g.plate(m, p + nrm * 0.3, nrm, 7.5, 5.5, thick=1.5, spin=0.3)
    return m


def gorger_spots() -> dict:
    px, py = GG_PIT
    sc = GG_SAC_C
    return {
        "pit": (px, py, 1.2),
        "teeth": [(px + (GG_PIT_R + 4.0) * math.cos(a), py + (GG_PIT_R + 4.0) * math.sin(a), GG_LIP_Z + 3.0) for a in (0.3, 0.8, 1.3)],
        "sac": (sc[0] + 6.0, sc[1] + 6.0, sc[2] + 6.0),
        "smoke": (px, py, 4.0),
        "vent": (sc[0], sc[1], sc[2] + GG_SAC_R[2] + 3.0),
        "stack": (sc[0], sc[1], sc[2] + GG_SAC_R[2] + 5.5),
    }


# ---------------------------------------------------------------- Brood Nest, t(2.5) x t(2.5)

BN = 64.0
BN_C = (30.0, 30.0)
# Egg-sacs: centre, radius, height scale.
BN_EGGS = [((20.0, 24.0, 8.0), 7.5, 1.3), ((29.0, 17.0, 8.0), 7.2, 1.3), ((33.0, 29.0, 8.0), 7.6, 1.25), ((22.0, 34.0, 7.0), 6.8, 1.25),
           ((14.0, 15.0, 7.0), 6.2, 1.3), ((38.0, 18.0, 6.0), 5.8, 1.25), ((14.0, 32.0, 6.0), 5.6, 1.25), ((24.0, 24.0, 18.0), 7.0, 1.3),
           ((31.0, 39.0, 4.0), 5.0, 1.2), ((40.0, 30.0, 4.0), 5.0, 1.2)]
BN_SPLIT = (43.0, 43.0, 5.0)
BN_AWN_C = (25.0, 25.0, 0.0)
BN_AWN_R = (27.0, 27.0, 33.0)


def build_broodnest(with_pad: bool) -> ra.Mesh:
    g.reset_frames()
    m = ra.Mesh()
    if with_pad:
        g.creep_pad(m, BN, BN, seed=5.0)
    cx, cy = BN_C
    for k in range(9):
        a = 2 * math.pi * k / 9 + 0.1
        g.root(m, (cx + 16.0 * math.cos(a), cy + 16.0 * math.sin(a), 1.4), (cx + 27.0 * math.cos(a), cy + 27.0 * math.sin(a), 0.9),
               1.6, 0.4, "bl_glow_d" if k % 3 == 0 else "bl_flesh_d", seed=k * 1.7, lift=0.8, wig=1.6)
    # The mound the eggs sit in.
    g.lathe(m, BN_C, [(22.0, 0.8), (20.5, 3.0), (17.0, 5.5), (11.0, 7.5), (4.0, 8.5)], "bl_flesh_d", seg=32, wob=0.1, seed=1.0)
    # The hood: a ribbed chitin awning arching over the back of the clutch, open to the front.
    ac = np.array(BN_AWN_C)
    th0, th1 = math.radians(45.0 + 62.0), math.radians(45.0 + 298.0)
    g.ellip(m, ac, BN_AWN_R, "bl_bone", rings=10, seg=30, wob=0.035, seed=2.0, th=(th0, th1), ph=(math.radians(-8), math.radians(82)))
    # Ribs over the hood, and a thick rolled rim along its open edge.
    for k in range(8):
        t_ = th0 + (th1 - th0) * (k + 0.5) / 8
        pts = []
        for ph in np.linspace(math.radians(-8), math.radians(80), 7):
            pts.append(ac + np.array([math.cos(ph) * math.cos(t_) * (BN_AWN_R[0] + 0.7), math.cos(ph) * math.sin(t_) * (BN_AWN_R[1] + 0.7),
                                      math.sin(ph) * (BN_AWN_R[2] + 0.7)]))
        g.tube(m, pts, [1.7, 1.4, 0.9], "bl_bone_d", n=6, sub=3)
    rim = []
    for ph in np.linspace(math.radians(-8), math.radians(82), 6):
        rim.append((th0, ph))
    rim = rim + [(th0 + (th1 - th0) * t, math.radians(82)) for t in (0.25, 0.5, 0.75)] + [(th1, ph) for ph in np.linspace(math.radians(82), math.radians(-8), 6)]
    rim_pts = [ac + np.array([math.cos(ph) * math.cos(t_) * BN_AWN_R[0], math.cos(ph) * math.sin(t_) * BN_AWN_R[1], math.sin(ph) * BN_AWN_R[2]])
               for t_, ph in rim]
    g.tube(m, rim_pts, [2.4, 1.8, 2.4], "bl_bone", n=8, sub=3)
    # Hooked spurs on the rim's feet.
    for t_ in (th0, th1):
        b = ac + np.array([math.cos(t_) * BN_AWN_R[0], math.sin(t_) * BN_AWN_R[1], 1.0])
        g.spike(m, b, b + np.array([math.cos(t_) * 4.0 + 3.0, math.sin(t_) * 4.0 + 3.0, 7.0]), 1.8, "bl_bone", bend=(0, 0, 1.5))
    # The eggs, heaped in the hood's mouth.
    for k, (c, r, hz) in enumerate(BN_EGGS):
        g.ellip(m, c, (r, r * 0.95, r * hz), "bl_egg", rings=10, seg=18, wob=0.06, seed=k * 1.9, zmin=1.0)
    # Team plate: a gray carapace on the hood's crest.
    t_, ph = math.radians(225.0), math.radians(55.0)
    nrm = np.array([math.cos(ph) * math.cos(t_) / BN_AWN_R[0], math.cos(ph) * math.sin(t_) / BN_AWN_R[1], math.sin(ph) / BN_AWN_R[2]])
    crest = ac + np.array([math.cos(ph) * math.cos(t_) * BN_AWN_R[0], math.cos(ph) * math.sin(t_) * BN_AWN_R[1], math.sin(ph) * BN_AWN_R[2]])
    g.plate(m, crest + nrm / np.linalg.norm(nrm) * 1.2, nrm, 9.0, 6.0, thick=1.8, spin=math.radians(45))
    # The split sac at the front: a torn cup, petals curling out, amber goo welling inside.
    s = np.array(BN_SPLIT)
    g.lathe(m, s, [(1.0, s[2] - 5.0), (6.5, s[2] - 4.0), (8.4, s[2] - 0.6), (8.2, s[2] + 3.0), (7.0, s[2] + 5.0)], "bl_egg", seg=22,
            wob=0.07, seed=3.0, cap=False)
    g.ellip(m, s + np.array([0, 0, 2.6]), (6.4, 6.4, 3.8), "bl_bulb", rings=7, seg=16, wob=0.05)
    g.ellip(m, s + np.array([0.8, 0.8, 5.4]), (2.8, 2.8, 2.0), "bl_hot", rings=5, seg=10)
    for k in range(5):
        a = 2 * math.pi * k / 5 + 0.3
        b0 = s + np.array([6.8 * math.cos(a), 6.8 * math.sin(a), 4.6])
        mid = s + np.array([10.0 * math.cos(a), 10.0 * math.sin(a), 8.0])
        tip = s + np.array([12.5 * math.cos(a), 12.5 * math.sin(a), 6.0])
        g.tube(m, [b0, mid, tip], [2.4, 1.7, 0.3], "bl_egg", n=6, sub=3, flat=0.45)
    # Strands of goo on the pad in front of it.
    for k in range(3):
        a = 0.785 + (k - 1) * 0.5
        g.root(m, s + np.array([5.0 * math.cos(a), 5.0 * math.sin(a), -3.0]), s + np.array([13.0 * math.cos(a), 13.0 * math.sin(a), -3.6]),
               0.9, 0.3, "bl_glow", seed=k, lift=0.3, wig=1.0)
    return m


def broodnest_spots() -> dict:
    s = BN_SPLIT
    return {
        "split": (s[0], s[1], s[2] + 3.0),
        "eggs": [c for c, _, _ in BN_EGGS[:4]],
        "door": (s[0] + 4.0, s[1] + 4.0, 1.0),
        "stack": (BN_AWN_C[0] + 8.0, BN_AWN_C[1] + 8.0, 40.0),
    }


# ---------------------------------------------------------------- Gestator, t(3) x t(3)

GS = 96.0
GS_CX = 34.0
GS_Y0, GS_Y1 = 12.0, 72.0
GS_RIBS = 6
GS_HW = (19.0, 25.0)
GS_HT = (22.0, 31.0)
GS_Z0 = 1.0
GS_SAC_C = (73.0, 44.0, 17.0)
GS_SAC_R = 15.5
GS_SLIT_HW = 6.5
GS_SLIT_H = 21.0


def gs_prof(y: float) -> tuple[float, float]:
    f = (y - GS_Y0) / (GS_Y1 - GS_Y0)
    hw = GS_HW[0] + (GS_HW[1] - GS_HW[0]) * f
    ht = GS_HT[0] + (GS_HT[1] - GS_HT[0]) * f
    # Bulge between ribs.
    seg = (GS_Y1 - GS_Y0) / GS_RIBS
    ph = (y - GS_Y0) / seg
    bulge = 0.5 - 0.5 * math.cos(2 * math.pi * ph)
    return hw * (0.93 + 0.07 * bulge), ht * (0.94 + 0.06 * bulge)


def gs_arch(y: float, scale: float = 1.0, n: int = 18, cx: float = GS_CX) -> list[tuple[float, float]]:
    hw, ht = gs_prof(y)
    hw *= scale
    ht *= scale
    return [(cx - hw * math.cos(math.pi * i / n), GS_Z0 + ht * max(0.0, math.sin(math.pi * i / n)) ** 0.85) for i in range(n + 1)]


def build_gestator(with_pad: bool) -> ra.Mesh:
    g.reset_frames()
    m = ra.Mesh()
    if with_pad:
        g.creep_pad(m, GS, GS, seed=4.0)
    cx = GS_CX
    # The womb-hall skin, swept along y, bulging between the ribs.
    m.new_part()
    ys = np.linspace(GS_Y0, GS_Y1, 49)
    prev = None
    for y in ys:
        row = [m.v((x, y, z)) for x, z in gs_arch(y)]
        if prev is not None:
            for i in range(len(row) - 1):
                m.quad(prev[i], prev[i + 1], row[i + 1], row[i], "bl_flesh")
        prev = row
    # Back wall: a puckered dome cap.
    m.new_part()
    m.poly([(x, GS_Y0, z) for x, z in gs_arch(GS_Y0)], "bl_flesh_d")
    # Bone ribs hooped over the hall, with knuckled feet.
    for i in range(GS_RIBS + 1):
        y = GS_Y0 + (GS_Y1 - GS_Y0) * i / GS_RIBS
        y = min(max(y, GS_Y0 + 1.5), GS_Y1 - 1.5)
        pts = [(x + (x - cx) * 0.06, y, z + 1.0) for x, z in gs_arch(y, n=10)]
        pts = [np.array(p) for p in pts]
        pts[0][2] = 0.8
        pts[-1][2] = 0.8
        g.tube(m, pts, [2.6, 2.2, 2.0, 2.2, 2.6], "bl_bone", n=8, sub=3)
        for e in (pts[0], pts[-1]):
            g.ellip(m, e + np.array([0, 0, 0.8]), (3.4, 3.4, 2.4), "bl_bone_d", rings=5, seg=12, wob=0.1, seed=i)
    # Team plates down the spine of the hall.
    for i in range(GS_RIBS):
        y = GS_Y0 + (GS_Y1 - GS_Y0) * (i + 0.5) / GS_RIBS
        hw, ht = gs_prof(y)
        if i in (1, 3):
            g.plate(m, (cx, y, GS_Z0 + ht + 0.3), (0.0, 0.0, 1.0), 4.5, 3.6, thick=1.2, spin=0.0, seed=i)
        else:
            g.ellip(m, (cx, y, GS_Z0 + ht + 0.2), (2.6, 3.4, 1.4), "bl_bone_d", rings=4, seg=12, seed=i)
    # The front: membrane wall, a puckered rim, the glowing birthing slit.
    yf = GS_Y1
    m.new_part()
    m.poly([(x, yf + 0.05, z) for x, z in gs_arch(yf, 0.97)], "bl_membrane")
    g.SLITS.append({"x": cx, "y": yf, "z0": GS_Z0, "hw": GS_SLIT_HW, "h": GS_SLIT_H})
    lens = []
    for i in range(17):
        t = i / 16
        z = GS_Z0 + GS_SLIT_H * t
        lens.append((cx - GS_SLIT_HW * math.sin(math.pi * t) ** 0.9, z))
    for i in range(16, -1, -1):
        t = i / 16
        z = GS_Z0 + GS_SLIT_H * t
        lens.append((cx + GS_SLIT_HW * math.sin(math.pi * t) ** 0.9, z))
    m.new_part()
    m.poly([(cx, yf + 0.4, GS_Z0 + GS_SLIT_H * 0.5)] + [(x, yf + 0.4, z) for x, z in lens] , "bl_slit")
    # The lips round the slit.
    for s in (-1, 1):
        pts = []
        for t in np.linspace(0, 1, 7):
            z = GS_Z0 + GS_SLIT_H * t
            pts.append(np.array([cx + s * (GS_SLIT_HW + 1.0) * math.sin(math.pi * t) ** 0.9, yf + 1.2, z]))
        pts[0][1] += 1.0
        pts[-1][1] -= 0.4
        g.tube(m, pts, [1.4, 2.6, 3.0, 2.6, 1.4], "bl_flesh_d", n=8, sub=3)
    # Rim fold round the whole front arch.
    g.tube(m, [np.array((x + (x - cx) * 0.02, yf + 0.8, z)) for x, z in gs_arch(yf, 1.0, n=12)], [2.4, 2.4], "bl_flesh_d", n=8, sub=2)
    # A tongue of flesh out over the pad, glowing slime on it.
    g.ellip(m, (cx, yf + 11.0, 0.8), (9.0, 12.0, 1.8), "bl_flesh", rings=6, seg=20, wob=0.06, seed=1.0, zmin=0.8)
    for k in range(3):
        g.root(m, (cx - 2.0 + k * 2.0, yf + 2.0, 2.2), (cx - 4.0 + k * 4.0, yf + 19.0, 1.4), 0.7, 0.3, "bl_glow", seed=k * 2, lift=0.3, wig=0.8)
    # The great womb sac on the east side, a curled shape inside, and its umbilical cords.
    sc = np.array(GS_SAC_C)
    g.SACS.append((sc, GS_SAC_R))
    g.lathe(m, (sc[0], sc[1]), [(GS_SAC_R + 2.0, 0.8), (GS_SAC_R - 1.0, 3.0), (GS_SAC_R - 6.0, 4.5)], "bl_flesh_d", seg=32, wob=0.08, seed=2.0)
    g.ellip(m, sc, (GS_SAC_R, GS_SAC_R * 1.12, GS_SAC_R * 1.02), "bl_sac", rings=14, seg=30, wob=0.03, seed=1.2, zmin=2.0)
    for k in range(5):
        a = 2 * math.pi * k / 5 + 0.2
        pts = []
        for t in np.linspace(-0.25, 1.35, 6):
            d = (math.cos(a) * math.cos(t), math.sin(a) * math.cos(t), math.sin(t))
            p, nrm = g.ellip_surface(sc, (GS_SAC_R, GS_SAC_R * 1.12, GS_SAC_R * 1.02), d)
            pts.append(p + nrm * 0.4)
        g.tube(m, pts, [1.2, 0.9, 0.4], "bl_flesh_d", n=6, sub=3)
    hall_x = cx + GS_HW[1] * 0.85
    for k, (dy, dz) in enumerate(((-8.0, 9.0), (6.0, 6.0))):
        a = sc + np.array([-GS_SAC_R * 0.85, dy * 0.6, dz - 8.0])
        b = np.array([hall_x - 2.0, sc[1] + dy, dz + 4.0])
        mid = (a + b) / 2 + np.array([0, 0, 4.0])
        g.tube(m, [a, mid, b], [2.4, 2.0, 2.4], "bl_flesh", n=8, sub=4)
    # A smaller ripening sac at the back.
    g.ellip(m, (76.0, 18.0, 7.0), (7.0, 7.0, 8.0), "bl_egg", rings=8, seg=16, wob=0.07, seed=4.0, zmin=1.0)
    g.ellip(m, (84.0, 70.0, 5.0), (5.0, 5.0, 6.0), "bl_egg", rings=8, seg=16, wob=0.07, seed=5.0, zmin=1.0)
    # Dorsal spines along the hall ridge, raked back.
    for i in range(GS_RIBS):
        y = GS_Y0 + (GS_Y1 - GS_Y0) * (i + 1) / GS_RIBS - 1.5
        hw, ht = gs_prof(y)
        b = np.array([cx, y, GS_Z0 + ht + 1.0])
        g.spike(m, b, b + np.array([0.0, -5.0, 6.0 + i * 0.5]), 1.6, "bl_bone", bend=(0, 0.8, 0.5))
    return m


def gestator_spots() -> dict:
    cx = GS_CX
    sc = GS_SAC_C
    return {
        "slit": (cx, GS_Y1 + 0.4, GS_Z0 + GS_SLIT_H * 0.4),
        "sac": (sc[0] + 4.0, sc[1] + 4.0, sc[2]),
        "apron": [(cx, GS_Y1 + y, 2.6) for y in (5.0, 10.0, 15.0)],
        "smoke": (sc[0], sc[1], sc[2] + GS_SAC_R),
        "stack": (cx, (GS_Y0 + GS_Y1) / 2, GS_Z0 + GS_HT[1] + 12.0),
    }


# ---------------------------------------------------------------- Brain Coral, t(2) x t(2)

BC = 64.0
BC_C = (31.0, 31.0)
BC_DOME_Z = 5.0
BC_DOME_R = (19.0, 19.0, 21.0)
BC_FEELERS = 7


def bc_feeler(i: int) -> list[np.ndarray]:
    cx, cy = BC_C
    a = 2 * math.pi * i / BC_FEELERS + 0.4
    el = 1.15 if i % 2 == 0 else 0.95
    p, nrm = g.ellip_surface((cx, cy, BC_DOME_Z), BC_DOME_R, (math.cos(a) * math.cos(el), math.sin(a) * math.cos(el), math.sin(el)))
    h = 18.0 + 6.0 * ((i * 3) % 4) / 3
    out = [p - nrm * 1.0, p + nrm * 5.0 + np.array([0, 0, 4.0])]
    out.append(out[-1] + np.array([math.cos(a + 0.6) * 4.0, math.sin(a + 0.6) * 4.0, h * 0.5]))
    out.append(out[-1] + np.array([math.cos(a + 1.4) * 4.5, math.sin(a + 1.4) * 4.5, h * 0.5]))
    return out


def build_braincoral(with_pad: bool) -> ra.Mesh:
    g.reset_frames()
    m = ra.Mesh()
    if with_pad:
        g.creep_pad(m, BC, BC, seed=6.0)
    cx, cy = BC_C
    for k in range(10):
        a = 2 * math.pi * k / 10 + 0.25
        g.root(m, (cx + 18.0 * math.cos(a), cy + 18.0 * math.sin(a), 1.4), (cx + 27.0 * math.cos(a), cy + 27.0 * math.sin(a), 0.9),
               1.6, 0.4, "bl_glow_d" if k % 3 == 0 else "bl_flesh_d", seed=k * 1.1, lift=0.7, wig=1.4)
    # A fleshy foot the coral grows from.
    g.lathe(m, BC_C, [(24.0, 0.8), (23.0, 2.5), (21.0, 4.5), (19.0, BC_DOME_Z + 1.0)], "bl_flesh_d", seg=36, wob=0.07, seed=1.5)
    # The folded dome.
    g.ellip(m, (cx, cy, BC_DOME_Z), BC_DOME_R, "bl_coral", rings=16, seg=40, wob=0.05, seed=2.5, ph=(0.0, math.pi / 2))
    # Two lesser coral lobes on the flanks.
    g.ellip(m, (cx + 14.0, cy - 9.0, 4.0), (8.0, 8.0, 7.5), "bl_coral", rings=8, seg=20, wob=0.08, seed=4.0, ph=(0.0, math.pi / 2))
    g.ellip(m, (cx - 9.0, cy + 15.0, 4.0), (7.0, 7.0, 6.5), "bl_coral", rings=8, seg=20, wob=0.08, seed=5.0, ph=(0.0, math.pi / 2))
    # Feeler stalks, each curling, a glowing node at the tip.
    for i in range(BC_FEELERS):
        pts = bc_feeler(i)
        g.tube(m, pts, [1.6, 1.2, 0.8, 0.45], "bl_flesh", n=7, sub=4)
        g.ellip(m, pts[-1], (1.6, 1.6, 1.9), "bl_bulb", rings=5, seg=10)
        g.ellip(m, pts[-1] + np.array([0, 0, 0.8]), (0.8, 0.8, 0.8), "bl_hot", rings=4, seg=8)
    # The crown feeler: tallest, the radar's beacon.
    top = np.array([cx, cy, BC_DOME_Z + BC_DOME_R[2]])
    crown = [top - np.array([0, 0, 1.0]), top + np.array([0.5, -0.5, 10.0]), top + np.array([-1.5, 1.0, 20.0]), top + np.array([0.5, 0.5, 29.0])]
    g.tube(m, crown, [2.2, 1.6, 1.0, 0.6], "bl_flesh", n=8, sub=4)
    g.ellip(m, crown[-1], (2.4, 2.4, 2.8), "bl_bulb", rings=6, seg=12)
    g.ellip(m, crown[-1] + np.array([0, 0, 1.2]), (1.1, 1.1, 1.1), "bl_hot", rings=4, seg=8)
    # Team plate: a gray carapace collar on the foot, facing the camera.
    p = np.array([cx + 14.0, cy + 14.0, 3.2])
    g.plate(m, p, (0.6, 0.6, 0.5), 5.6, 3.4, thick=1.2, spin=0.0)
    return m


def braincoral_spots() -> dict:
    cx, cy = BC_C
    top = BC_DOME_Z + BC_DOME_R[2]
    return {
        "dome": (cx + 8.0, cy + 8.0, BC_DOME_Z + 14.0),
        "tips": [tuple(bc_feeler(i)[-1]) for i in range(BC_FEELERS)],
        "beacon": (cx + 0.5, cy + 0.5, top + 29.0),
        "stack": (cx, cy, top + 34.0),
    }


BUILDINGS = {
    "broodheart": (BH, BH, 2.0, build_broodheart, broodheart_spots),
    "lumenbulb": (LB, LB, 3.0, build_lumenbulb, lumenbulb_spots),
    "gorger": (GG, GG, 2.0, build_gorger, gorger_spots),
    "broodnest": (BN, BN, 3.0, build_broodnest, broodnest_spots),
    "gestator": (GS, GS, 2.0, build_gestator, gestator_spots),
    "braincoral": (BC, BC, 3.0, build_braincoral, braincoral_spots),
}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True, help="buildings asset folder")
    ap.add_argument("--only", nargs="*", choices=sorted(BUILDINGS))
    args = ap.parse_args()
    for bid in args.only or list(BUILDINGS):
        W, H, zoom, build, spots = BUILDINGS[bid]
        g.render_building(Path(args.out), bid, W, H, zoom, build, spots())


if __name__ == "__main__":
    main()
