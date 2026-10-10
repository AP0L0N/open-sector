#!/usr/bin/env python3
"""The Bloom harbour and airfield: the Tide Womb (shipyard) and the Roost (airfield).

  tidewomb  t(2.5) x t(2.5), on open water, like the Spawning Pool
            (render_xeno_harbour.py) and the Marine Base: a ring of fleshy
            lily-pads round a glowing amber pool, open to the south-east face
            (the slip the boats leave by), tendrils trailing in the water, two
            curled fronds with lit bulbs hanging from them, and a brood clutch
            with the team plate on the back pad. The water outside stays empty:
            the map's water shows through. Writes tidewomb.png, tidewomb.json,
            tidewomb-cameo.png (96 px) at the dock's 3x zoom (384 px pad).
  roost     t(7.5) x t(3.75), the Airfield/Aerie footprint, canvas and layout
            fractions (catalog.ts AIRFIELD_*). Two images on one canvas, like
            the Aerie: roost-ground.png (creep, a strip of fused vertebral bone
            with amber guide lights, sinew taxi paths, and four woven-sinew nests
            at AIRFIELD_PAD_X x AIRFIELD_PAD_Y, their cup rims round the side
            away from the strip) that the client paints under everything
            standing, and roost.png (the props in the back band: the long arching
            bone spine with its ribs, a brood clutch, glowing bulb stalks, and
            the team plate on the spine's crest). roost.json carries the pad
            metrics, the back depth, and glow spots. roost-cameo.png (96 px).

Look: bloom_base_geo.py (the inked structure pipeline, the Bloom palette lock).

  python3 tools/sprites/render_bloom_harbour.py --out gridlock/packages/client/src/assets/buildings
  python3 tools/sprites/render_bloom_harbour.py --out ... --only roost
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image

import bloom_base_geo as g

ra = g.ra
SS = ra.SS
rgb = g.rgb


# ---------------------------------------------------------------- Tide Womb, t(2.5) x t(2.5)

TW = 64.0
TW_C = (32.0, 32.0)
TW_POOL_R = 15.0
TW_MOUTH = math.radians(36.0)   # half-angle of the open slip toward +x (the south-east face)
TW_PADS = 9
TW_RING_R = 22.5
TW_FRONDS = [math.radians(a) for a in (120.0, 290.0)]
TW_POD = math.radians(205.0)


def tw_pad(k: int) -> tuple[float, float, float, float, float]:
    """Centre x, y, radius, height and spin of lily-pad k round the ring (skipping the slip)."""
    span = 2 * math.pi - 2 * TW_MOUTH
    a = TW_MOUTH + span * (k + 0.5) / TW_PADS
    r = 8.6 + 1.4 * math.sin(k * 2.3)
    rr = TW_RING_R + 1.5 * math.sin(k * 1.7)
    return TW_C[0] + rr * math.cos(a), TW_C[1] + rr * math.sin(a), r, 0.9 + 0.5 * (k % 3), a


def tw_frond(a: float) -> list[np.ndarray]:
    cx, cy = TW_C
    pts = []
    for rr, z in ((TW_RING_R + 2.0, 1.5), (TW_RING_R + 3.5, 14.0), (TW_RING_R + 1.0, 25.0), (TW_RING_R - 5.0, 29.0), (TW_RING_R - 9.0, 25.0)):
        pts.append(np.array([cx + rr * math.cos(a), cy + rr * math.sin(a), z]))
    return pts


def tw_bulb(a: float) -> np.ndarray:
    return tw_frond(a)[-1] + np.array([0.0, 0.0, -4.5])


def lily(m: ra.Mesh, x: float, y: float, r: float, z: float, spin: float, seed: float) -> None:
    """A floating lily-pad of flesh: a shallow cupped disc with a notch toward the pool, a rolled lip."""
    g.LILIES.append((x, y, r))
    notch = math.radians(18.0)
    R = np.array([[math.cos(spin + math.pi), -math.sin(spin + math.pi), 0], [math.sin(spin + math.pi), math.cos(spin + math.pi), 0], [0, 0, 1.0]])
    g.ellip(m, (x, y, z), (r, r * 0.96, 1.4), "bl_lily", rings=4, seg=26, wob=0.05, seed=seed, R=R, th=(notch, 2 * math.pi - notch),
            ph=(0.0, math.pi / 2))
    g.ellip(m, (x, y, z - 0.6), (r * 0.98, r * 0.94, 0.9), "bl_flesh_d", rings=2, seg=26, R=R, th=(notch, 2 * math.pi - notch),
            ph=(-math.pi / 2, 0.0))
    lip = []
    for t in np.linspace(notch, 2 * math.pi - notch, 14):
        lp = R @ np.array([math.cos(t) * r, math.sin(t) * r * 0.96, 0.0])
        lip.append(np.array([x, y, z + 0.5]) + lp)
    g.tube(m, lip, [0.6, 0.9, 0.6], "bl_flesh", n=6, sub=2)


def build_tidewomb(with_pad: bool) -> ra.Mesh:
    g.reset_frames()
    m = ra.Mesh()
    cx, cy = TW_C
    g.POOLS.append({"x": cx, "y": cy, "r": TW_POOL_R})
    if with_pad:
        m.new_part()
        g.lathe(m, TW_C, [(TW_POOL_R + 0.5, 0.6), (0.1, 0.6)], "bl_pool", seg=40, cap=False, part=False)
    # Tendrils trailing out into the water, some lit.
    for k in range(13):
        a = 2 * math.pi * k / 13 + 0.15
        if abs(math.atan2(math.sin(a), math.cos(a))) < TW_MOUTH * 0.6:
            continue
        b = (cx + 25.0 * math.cos(a), cy + 25.0 * math.sin(a), 0.5)
        e = (cx + (33.0 + 3 * (k % 3)) * math.cos(a + 0.12), cy + (33.0 + 3 * (k % 3)) * math.sin(a + 0.12), 0.2)
        g.root(m, b, e, 0.9, 0.15, "bl_glow_d" if k % 3 == 0 else "bl_flesh_d", seed=k * 1.3, lift=0.3, wig=2.0, n=6)
    # The pool's lip: a membranous rim, faintly lit on its inner edge.
    span = (TW_MOUTH * 0.55, 2 * math.pi - TW_MOUTH * 0.55)
    g.lathe(m, TW_C, [(TW_POOL_R - 0.5, 0.4), (TW_POOL_R, 1.5), (TW_POOL_R + 2.5, 2.0), (TW_POOL_R + 5.0, 0.6)], "bl_flesh_d", seg=36,
            wob=0.04, seed=1.0, th=span)
    g.lathe(m, TW_C, [(TW_POOL_R - 0.7, 0.5), (TW_POOL_R - 0.2, 1.6)], "bl_glow_d", seg=36, th=span, cap=False)
    # The lily-pads.
    for k in range(TW_PADS):
        x, y, r, z, a = tw_pad(k)
        lily(m, x, y, r, z, a, seed=k * 1.7)
    # Jaws either side of the slip: hooked bone tusks reaching out over the water.
    for s in (-1, 1):
        a = s * TW_MOUTH
        base = np.array([cx + (TW_RING_R - 2.0) * math.cos(a), cy + (TW_RING_R - 2.0) * math.sin(a), 1.5])
        mid = np.array([cx + (TW_RING_R + 5.0) * math.cos(a * 0.6), cy + (TW_RING_R + 5.0) * math.sin(a * 0.6), 6.0])
        tip = np.array([cx + (TW_RING_R + 9.0) * math.cos(a * 0.15), cy + (TW_RING_R + 9.0) * math.sin(a * 0.15), 3.0])
        g.tube(m, [base, mid, tip], [2.4, 1.6, 0.2], "bl_bone", n=8, sub=4)
    # Curled fronds with a glowing bulb hanging from each.
    for a in TW_FRONDS:
        pts = tw_frond(a)
        g.tube(m, pts, [2.2, 1.8, 1.4, 1.0, 0.5], "bl_flesh", n=8, sub=4)
        b = tw_bulb(a)
        g.tube(m, [pts[-1], b + np.array([0.0, 0.0, 2.0])], [0.35, 0.35], "bl_flesh_d", n=5, sub=1)
        g.ellip(m, b, (2.4, 2.4, 2.8), "bl_bulb", rings=6, seg=12)
        g.ellip(m, pts[0], (3.2, 3.2, 1.8), "bl_flesh_d", rings=4, seg=12, wob=0.1)
    # A brood clutch on the back pad, the team plate on it, a lit vent toward the pool.
    px, py = cx + 22.0 * math.cos(TW_POD), cy + 22.0 * math.sin(TW_POD)
    g.lathe(m, (px, py), [(9.5, 0.8), (9.0, 2.5), (7.0, 4.0)], "bl_flesh_d", seg=24, wob=0.08, seed=3.0)
    for k, (dx, dy, dz, r) in enumerate(((-2.0, -1.0, 6.0, 5.0), (3.0, -3.0, 5.5, 4.4), (-3.0, 4.0, 5.0, 4.2), (1.0, 1.0, 11.0, 4.0))):
        g.ellip(m, (px + dx, py + dy, dz), (r, r, r * 1.25), "bl_egg", rings=8, seg=16, wob=0.06, seed=k * 2.0, zmin=2.5)
    g.plate(m, (px - 4.5, py - 4.5, 10.5), (-0.5, -0.5, 0.8), 5.0, 3.6, thick=1.2, spin=math.radians(45))
    vx, vy = cx + 15.5 * math.cos(TW_POD), cy + 15.5 * math.sin(TW_POD)
    g.ellip(m, (vx, vy, 3.0), (2.6, 2.6, 2.0), "bl_hot", rings=5, seg=10)
    return m


def tidewomb_spots() -> dict:
    cx, cy = TW_C
    px, py = cx + 22.0 * math.cos(TW_POD), cy + 22.0 * math.sin(TW_POD)
    vx, vy = cx + 15.5 * math.cos(TW_POD), cy + 15.5 * math.sin(TW_POD)
    return {
        "pool": (cx, cy, 0.6),
        "bulbs": [tuple(tw_bulb(a)) for a in TW_FRONDS],
        "pads": [(tw_pad(k)[0], tw_pad(k)[1], tw_pad(k)[3] + 1.4) for k in (1, 4, 7)],
        "vent": (vx, vy, 3.0),
        "stack": (px, py, 22.0),
    }


def render_tidewomb(out_dir: Path) -> None:
    g.render_building(out_dir, "tidewomb", TW, TW, 3.0, build_tidewomb, tidewomb_spots(), bg=(44, 74, 98))


# ---------------------------------------------------------------- Roost, t(7.5) x t(3.75)

AW, AH = ra.W, ra.H  # 320 x 160 world px, the Airfield's
BACK_DEPTH = ra.BACK_DEPTH
NEST_R = 24.0
SPINE_Y = 22.0
SPINE_X = (12.0, 308.0)
SPINE_PEAK = 46.0
CLUTCH = (40.0, 18.0)
STALKS = [(232.0, 14.0, 30.0), (252.0, 28.0, 24.0), (290.0, 16.0, 34.0)]


def spine_pt(t: float) -> np.ndarray:
    """Point on the arching spine, t in [0, 1] from west to east; it rises from the ground at both ends."""
    x = SPINE_X[0] + (SPINE_X[1] - SPINE_X[0]) * t
    y = SPINE_Y + 3.0 * math.sin(t * math.pi * 2.0)
    z = SPINE_PEAK * math.sin(math.pi * t) ** 0.75 - 2.0
    return np.array([x, y, z])


def roost_ground(X: np.ndarray, Y: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """World ground point -> (rgb, alpha): creep, the bone strip, sinew taxi paths, woven nests."""
    rw = ra.runway()
    n_big = ra.fbm(X / 26, Y / 26, 3)
    n_mid = ra.fbm(X / 7, Y / 7, 5)
    n_fine = ra.vnoise(X / 0.9, Y / 0.9, 11)

    def c(h):
        return np.broadcast_to(rgb(h), X.shape + (3,)).copy()

    # Creep: membrane and dark flesh, mottled, an amber vein web.
    col = ra.mix(c(g.MEMBRANE), c("#4a2538"), ra.smooth(0.3, 0.75, n_big))
    col = col * (0.88 + 0.22 * n_mid[..., None]) * (0.93 + 0.14 * n_fine[..., None])
    vein = np.abs(np.sin(ra.fbm(X / 18, Y / 18, 47, 3) * 26.0))
    vmask = ra.smooth(0.08, 0.0, vein) * ra.smooth(0.35, 0.6, ra.fbm(X / 30 + 4, Y / 30, 53))
    col = ra.mix(col, c(g.GLOW_D), vmask * 0.7)

    # The strip: fused vertebral plates of ivory bone, rounded, sinew showing between them.
    shoulder = ra.rect_sdf(X, Y, rw["x0"], rw["y0"], rw["x1"], rw["y1"])
    col = ra.mix(col, c("#1e1218"), ra.smooth(3.5, 0.5, shoulder) * 0.85)
    plate_w = 18.0
    u = X - rw["x0"]
    i = np.floor(u / plate_w)
    f = (u - i * plate_w) / plate_w
    tone = ra.cell_rand(i, i * 0 + 41, 41)
    half_h = (rw["y1"] - rw["y0"]) / 2
    vy = np.abs(Y - rw["cy"]) / half_h
    # Each plate is a rounded lozenge, narrow at its ends; the sinew between is dark flesh.
    lozenge = (np.abs(f - 0.5) * 2) ** 2.2 + vy ** 3.0
    bone = ra.mix(c(g.BONE_M), c(g.BONE_L), ra.smooth(0.25, 0.75, n_mid)) * (0.9 + 0.12 * tone)[..., None]
    bone *= (0.94 + 0.08 * n_fine)[..., None]
    growth = np.mod(lozenge * 6.0 + n_mid * 1.5, 1.0) < 0.12
    bone[growth] *= 0.85
    sinew = c(g.FLESH_D) * (0.85 + 0.25 * np.abs(np.sin(Y * 2.2 + n_mid * 4))[..., None])
    strip = np.where((lozenge < 0.92)[..., None], bone, sinew)
    edge = (lozenge > 0.82) & (lozenge < 0.92)
    strip[edge] = c(g.BONE_D)[edge]
    strip_in = shoulder <= 0
    col[strip_in] = strip[strip_in]

    for k, (px, py) in enumerate(ra.pads()):
        # Taxi path: a braided band of sinew.
        taxi = ra.rect_sdf(X, Y, px - ra.TAXI_HALF, rw["y1"] - 1, px + ra.TAXI_HALF, py - NEST_R + 2) <= 0
        strand = np.abs(np.sin((X - px) * 0.9 + np.sin(Y * 0.45) * 2.2))
        t = ra.mix(c(g.FLESH_D), c(g.FLESH_M), ra.smooth(0.2, 0.9, strand)) * (0.88 + 0.2 * n_mid[..., None])
        col[taxi] = t[taxi]
        r = np.hypot(X - px, Y - py)
        nest = r <= NEST_R
        ang = np.arctan2(Y - py, X - px)
        # Nest floor: woven sinew, spokes and rings over and under, darker toward the middle.
        spokes = np.mod(ang * 16 / (2 * np.pi), 1.0)
        rings = np.mod(r / 2.6, 1.0)
        over = (np.floor(ang * 16 / (2 * np.pi)) + np.floor(r / 2.6)) % 2 == 0
        wv = np.where(over, np.sin(np.pi * rings), np.sin(np.pi * spokes))
        fl = ra.mix(c(g.FLESH_D), c(g.FLESH_L), wv * 0.75) * (0.88 + 0.16 * n_mid[..., None])
        fl = ra.mix(fl, c(g.MEMBRANE), ra.smooth(NEST_R * 0.75, 0.0, r) * 0.45)
        col[nest] = fl[nest]
        ring = nest & (np.abs(r - (NEST_R - 3.5)) < 0.9)
        col[ring] = (c(g.GLOW) * (0.9 + 0.12 * n_fine[..., None]))[ring]
        hub = r < 3.0
        col[hub] = c(g.HOT)[hub]
        rim = nest & (r > NEST_R - 0.8)
        col[rim] *= 0.5

    # Amber centre dashes and threshold chevrons on the strip.
    paint = np.zeros(X.shape, dtype=bool)
    cl = (X > rw["thr0"] + 6) & (X < rw["thr1"] - 6) & (np.abs(Y - rw["cy"]) < 1.0)
    cl &= ((X - rw["thr0"]) % 18.0) < 8.0
    paint |= cl
    for x_start, dirn in ((rw["thr0"], 1), (rw["thr1"], -1)):
        for j in range(3):
            u2 = (X - (x_start + dirn * (2.0 + j * 6.0))) * dirn
            chev = (u2 > np.abs(Y - rw["cy"]) * 0.45) & (u2 < np.abs(Y - rw["cy"]) * 0.45 + 2.2) & (np.abs(Y - rw["cy"]) < 12)
            paint |= chev
    col[paint] = (c(g.GLOW) * (0.92 + 0.1 * n_fine[..., None]))[paint]

    d_edge = -ra.rect_sdf(X, Y, 0, 0, AW, AH)
    alpha = np.clip((d_edge + (n_mid - 0.5) * 6 + 1.0) / 3.0, 0, 1)
    return np.clip(col, 0, 1), alpha


def roost_lights() -> list[tuple[float, float, float]]:
    rw = ra.runway()
    out = []
    x = rw["x0"] + 6
    while x < rw["x1"] - 4:
        for y in (rw["y0"] - 2.4, rw["y1"] + 2.4):
            out.append((x, y, 2.4))
        x += 24
    return out


def build_roost_ground_props() -> ra.Mesh:
    """Low things in the ground layer: the woven cup rims of the nests (away from the strip) and the guide bulbs."""
    m = ra.Mesh()
    for k, (px, py) in enumerate(ra.pads()):
        a0, a1 = math.radians(-20.0), math.radians(200.0)
        # Three interlaced sinew strands, weaving up and down round the rim.
        for s in range(3):
            pts = []
            for t in np.linspace(0.0, 1.0, 19):
                a = a0 + (a1 - a0) * t
                rr = NEST_R + 1.2 + 0.8 * math.sin(t * 24 + s * 2.1)
                z = 1.0 + s * 1.6 + 1.0 * math.sin(t * 18 + s * 2.1)
                pts.append(np.array([px + rr * math.cos(a), py + rr * math.sin(a), max(z, 0.4)]))
            pts[0][2] = 0.3
            pts[-1][2] = 0.3
            g.tube(m, pts, [1.0, 1.3, 1.0], "bl_flesh" if s != 1 else "bl_flesh_d", n=6, sub=2)
        # Bone stakes holding the weave, hooked inward.
        for j in range(6):
            a = a0 + (a1 - a0) * (j + 0.5) / 6
            b = np.array([px + (NEST_R + 1.4) * math.cos(a), py + (NEST_R + 1.4) * math.sin(a), 0.0])
            tip = np.array([px + (NEST_R - 1.5) * math.cos(a), py + (NEST_R - 1.5) * math.sin(a), 7.5])
            g.spike(m, b, tip, 1.5, "bl_bone", bend=(math.cos(a) * 1.5, math.sin(a) * 1.5, 1.0))
    for x, y, z in roost_lights():
        g.tube(m, [(x, y, 0.0), (x, y, 1.6)], [0.8, 0.5], "bl_flesh_d", n=6, sub=1)
        g.ellip(m, (x, y, z), (1.2, 1.2, 1.2), "bl_bulb", rings=4, seg=8)
    return m


def build_roost_props() -> ra.Mesh:
    m = ra.Mesh()
    # The long arching spine: vertebrae on a bone cord, spurs up, ribs arching down to the ground either side.
    n_v = 30
    ts = np.linspace(0.0, 1.0, n_v)
    cord = [spine_pt(t) for t in np.linspace(0.0, 1.0, 16)]
    g.tube(m, cord, [3.0, 2.6, 2.6, 3.0], "bl_bone_d", n=8, sub=4)
    for i, t in enumerate(ts[1:-1], start=1):
        p = spine_pt(t)
        if p[2] < 0.5:
            continue
        d = spine_pt(min(t + 0.01, 1.0)) - spine_pt(max(t - 0.01, 0.0))
        d /= np.linalg.norm(d)
        size = 0.75 + 0.45 * math.sin(math.pi * t)
        R = g.frame(d)
        g.ellip(m, p, (4.2 * size, 4.2 * size, 3.0 * size), "bl_bone", rings=6, seg=14, wob=0.08, seed=i, R=R)
        up = np.cross(d, np.array([0.0, 1.0, 0.0]))
        if up[2] < 0:
            up = -up
        up /= np.linalg.norm(up)
        g.spike(m, p + up * 2.5 * size, p + up * (7.0 + 3.0 * size) * size - d * 3.0, 1.6 * size, "bl_bone", bend=-d * 1.0)
        if i % 2 == 0 and p[2] > 6.0:
            for s in (-1, 1):
                side = np.array([0.0, float(s), 0.0])
                foot_y = SPINE_Y + s * (13.0 + 3.0 * size)
                foot_y = min(foot_y, AH * BACK_DEPTH - 3.0)
                mid = p + side * (9.0 * size) + np.array([0.0, 0.0, 2.0])
                foot = np.array([p[0] + 1.5, foot_y, 0.2])
                g.tube(m, [p + side * 2.5, mid, (mid + foot) / 2 + side * 1.5, foot], [1.8 * size, 1.5 * size, 1.1 * size, 0.6], "bl_bone",
                       n=6, sub=3)
    # The team plate: a gray carapace saddle on the crest of the spine.
    top = spine_pt(0.5)
    g.plate(m, top + np.array([0.0, 0.0, 3.4]), (0.0, 0.25, 1.0), 9.0, 5.0, thick=1.8, spin=0.0)
    # A glowing node hung under the crest: the beacon.
    g.tube(m, [top - np.array([0.0, 0.0, 3.0]), top - np.array([0.0, -1.0, 9.0])], [0.5, 0.4], "bl_flesh_d", n=5, sub=1)
    g.ellip(m, top - np.array([0.0, -1.0, 12.0]), (3.0, 3.0, 3.4), "bl_bulb", rings=6, seg=12)
    # A brood clutch at the west end: egg-sacs heaped on a fleshy mound.
    cx, cy = CLUTCH
    g.lathe(m, CLUTCH, [(15.0, 0.0), (14.0, 2.0), (11.0, 4.0), (6.0, 5.5)], "bl_flesh_d", seg=28, wob=0.08, seed=1.0)
    for k, (dx, dy, dz, r) in enumerate(((-4.0, -3.0, 6.0, 6.5), (5.0, -4.0, 6.0, 6.0), (-5.0, 5.0, 5.0, 5.5), (5.0, 5.0, 4.5, 5.0),
                                          (0.0, 0.0, 13.0, 5.5))):
        g.ellip(m, (cx + dx, cy + dy, dz), (r, r, r * 1.25), "bl_egg", rings=8, seg=16, wob=0.06, seed=k * 1.3, zmin=1.0)
    g.ellip(m, (cx + 6.0, cy + 9.0, 4.5), (3.0, 3.0, 2.2), "bl_hot", rings=5, seg=10)
    # Bulb stalks at the east end (the windsock's place).
    for k, (x, y, h) in enumerate(STALKS):
        g.ellip(m, (x, y, 0.5), (4.0, 4.0, 2.4), "bl_flesh_d", rings=4, seg=12, wob=0.1, seed=k)
        pts = [np.array([x, y, 0.5]), np.array([x + 1.5, y - 1.0, h * 0.5]), np.array([x - 1.0, y + 1.0, h])]
        g.tube(m, pts, [1.6, 1.1, 0.7], "bl_flesh", n=7, sub=4)
        g.ellip(m, pts[-1] + np.array([0.0, 0.0, 2.6]), (3.0, 3.0, 3.6), "bl_bulb", rings=6, seg=12)
    return m


def roost_spots() -> dict:
    top = spine_pt(0.5)
    return {
        "nests": [(px, py, 0.8) for px, py in ra.pads()],
        "lights": roost_lights(),
        "beacon": tuple(top - np.array([0.0, -1.0, 12.0])),
        "clutch": (CLUTCH[0] + 6.0, CLUTCH[1] + 9.0, 4.5),
        "stalks": [(x - 1.0, y + 1.0, h + 2.6) for x, y, h in STALKS],
        "stack": (top[0], top[1], top[2] + 14.0),
    }


def render_roost(out_dir: Path) -> None:
    ra.ZOOM = 2.0
    g.reset_frames()
    cv = ra.make_canvas()
    print("roost canvas", cv.w // SS, "x", cv.h // SS)
    ys, xs = np.mgrid[0: cv.h, 0: cv.w].astype(np.float64) + 0.5
    X, Y = cv.to_world_ground(xs, ys)
    inside = (X > -8) & (X < AW + 8) & (Y > -8) & (Y < AH + 8)
    g_col = np.zeros((cv.h, cv.w, 3))
    g_a = np.zeros((cv.h, cv.w))
    c, a = roost_ground(X[inside], Y[inside])
    g_col[inside] = c
    g_a[inside] = a

    low = build_roost_ground_props()
    props = build_roost_props()
    v = np.array(props.verts)
    over = float(np.max(v[:, 2] - (v[:, 0] + v[:, 1]) * 0.5))
    print("roost headroom used", round(over, 1), "of", ra.TOP_MARGIN, "deepest prop y", round(float(np.max(v[:, 1])), 1), "of",
          round(AH * BACK_DEPTH, 1))
    if over > ra.TOP_MARGIN - 1:
        raise SystemExit("roost props clip the canvas top")

    sh = np.clip(ra.shadow_mask(low, cv) + ra.shadow_mask(props, cv), 0, 1)
    ao = np.clip(ra.contact_ao(low, cv) + ra.contact_ao(props, cv), 0, 1)
    g_col *= (1 - 0.42 * sh - 0.12 * ao)[..., None]
    low_fr = ra.rasterize(low, cv)
    ra.ink(low_fr, SS)
    g_col, g_a = ra.over(g_col, g_a, low_fr.color, low_fr.alpha)
    ground = ra.downsample(g_col, g_a, SS)
    pr = ra.rasterize(props, cv)
    ra.ink(pr, SS)
    ra.silhouette(pr, SS)
    props_img = ra.downsample(pr.color, pr.alpha, SS)

    out_dir.mkdir(parents=True, exist_ok=True)
    ground.save(out_dir / "roost-ground.png", optimize=True)
    props_img.save(out_dir / "roost.png", optimize=True)

    south = g.screen(cv, AW, AH, 0.0)
    info = {
        "padWidth": round((AW + AH) * ra.ZOOM, 1),
        "padSouthX": south[0],
        "padSouthY": south[1],
        "backDepth": BACK_DEPTH,
        "size": list(ground.size),
    }
    for key, pts in roost_spots().items():
        if key == "stack":
            info["stackX"], info["stackY"] = g.screen(cv, *pts)
        elif isinstance(pts, tuple):
            info[key] = g.screen(cv, *pts)
        else:
            info[key] = [g.screen(cv, *p) for p in pts]
    (out_dir / "roost.json").write_text(json.dumps(info, indent=2) + "\n")
    print("wrote", out_dir / "roost.png", {k: info[k] for k in ("padWidth", "padSouthX", "padSouthY", "stackX", "stackY", "size")})

    both = ground.copy()
    both.alpha_composite(props_img)
    g.cameo(both, out_dir / "roost-cameo.png")
    g.PREVIEW.mkdir(exist_ok=True)
    bg = Image.new("RGBA", both.size, (74, 107, 50, 255))
    bg.alpha_composite(both)
    bg.save(g.PREVIEW / "bloom-roost.png")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True, help="buildings asset folder")
    ap.add_argument("--only", nargs="*", choices=["tidewomb", "roost"])
    args = ap.parse_args()
    for bid in args.only or ["tidewomb", "roost"]:
        if bid == "tidewomb":
            render_tidewomb(Path(args.out))
        else:
            render_roost(Path(args.out))


if __name__ == "__main__":
    main()
