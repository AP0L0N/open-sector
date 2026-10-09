#!/usr/bin/env python3
"""Borg harbour and airfield: the Spawning Pool (shipyard) and the Aerie (airfield).

  spawnpool  t(2.5) x t(2.5), on water, like the Marine Base (render_dock.py):
             a floating ribbed chitin ring round a glowing birthing pool, open
             to the south-east face (the slip the boats leave by), pontoons
             under it, four hooked pylons bending in over the pool with a lit
             bulb hanging from each hook, and a ribbed brood pod on the back of
             the ring. The water outside the ring stays empty: the map's water
             shows through. Writes spawnpool.png, spawnpool.json (pad metrics
             and glow spots, source px), spawnpool-cameo.png (96 px), the
             render_borg_base.py format, at the dock's 3x zoom (384 px pad).
  aerie      t(7.5) x t(3.75), the Airfield's footprint and layout fractions
             (catalog.ts AIRFIELD_*), not rotatable. Like render_airfield.py it
             is two images on one canvas: aerie-ground.png (Borg creep, the
             fused-chitin launch spine with glowing guide lights, taxi paths,
             and four cradle nests at AIRFIELD_PAD_X x AIRFIELD_PAD_Y with low
             claw ribs round their south side, open to the strip) that the
             client paints under everything standing, and aerie.png (the props
             in the back band: a ribbed brood dome with a lit maw, a pod, the
             control spire with its crown and beacon, plasma vats, hooked
             pylons, a sensor stalk). aerie.json carries the pad metrics, the
             back depth, and glow spots. aerie-cameo.png (96 px).

Look: render_borg_base.py's (the inked structure pipeline of
render_airfield.py, the Borg gunmetal and chitin, the green glow).

  python3 tools/sprites/render_borg_harbour.py --out gridlock/packages/client/src/assets/buildings
  python3 tools/sprites/render_borg_harbour.py --out ... --only aerie
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image

import render_borg_base as rbb

ra = rbb.ra
SS = ra.SS
PREVIEW = Path(__file__).resolve().parent / "preview"

_tex_v2 = ra.tex
POOL: dict[str, float] = {}


def tex_v3(mat: str, P: np.ndarray, n: np.ndarray) -> np.ndarray:
    X, Y, Z = P[:, 0], P[:, 1], P[:, 2]
    if mat == "pool":
        # The birthing pool: bright at the heart, swirling, dark shapes of hulls growing in it.
        r = np.hypot(X - POOL["x"], Y - POOL["y"]) / POOL["r"]
        a = np.arctan2(Y - POOL["y"], X - POOL["x"])
        swirl = 0.5 + 0.5 * np.sin(a * 4 - r * 10)
        c = ra.mix(np.broadcast_to(rbb.rgb("#1f9c72"), (len(X), 3)), np.broadcast_to(rbb.rgb("#d8fff0"), (len(X), 3)),
                   np.clip((1 - r) * 0.85 + swirl * 0.2, 0, 1))
        egg = ra.smooth(0.66, 0.74, ra.fbm(X / 3.0, Y / 3.0, 91)) * ra.smooth(0.25, 0.55, r)
        c = ra.mix(c, np.broadcast_to(rbb.rgb("#16352b"), (len(X), 3)), egg * 0.8)
        return c / rbb._flat(n)
    return _tex_v2(mat, P, n)


ra.tex = tex_v3


# ---------------------------------------------------------------- Spawning Pool, t(2.5) x t(2.5)

SP = 64.0
SP_C = (32.0, 32.0)
SP_R_IN = 16.5
SP_R_OUT = 27.0
SP_DECK = 3.2
SP_MOUTH = math.radians(34.0)  # half-angle of the opening toward +x (the south-east face)
SP_PYLONS = [math.radians(a) for a in (100.0, 145.0, 245.0, 298.0)]
SP_POD = math.radians(195.0)
SP_PYLON_TOP = 30.0


def ring_angles(n: int = 28) -> list[tuple[float, float]]:
    """Ring segments, skipping the mouth."""
    span = 2 * math.pi - 2 * SP_MOUTH
    return [(SP_MOUTH + span * i / n, SP_MOUTH + span * (i + 1) / n) for i in range(n)]


def polar(r: float, a: float, z: float) -> tuple[float, float, float]:
    return (SP_C[0] + r * math.cos(a), SP_C[1] + r * math.sin(a), z)


def ring_seg(m: ra.Mesh, a0: float, a1: float, r0: float, r1: float, z0: float, z1: float, top: str, side: str) -> None:
    m.new_part()
    p = [m.v(polar(r, a, z)) for z in (z0, z1) for r in (r0, r1) for a in (a0, a1)]
    # index: z0 r0 a0, z0 r0 a1, z0 r1 a0, z0 r1 a1, z1 r0 a0, z1 r0 a1, z1 r1 a0, z1 r1 a1
    m.quad(p[4], p[5], p[7], p[6], top)
    m.quad(p[2], p[3], p[7], p[6], side)  # outer wall
    m.quad(p[0], p[1], p[5], p[4], side)  # inner wall
    m.quad(p[0], p[2], p[6], p[4], side)
    m.quad(p[1], p[3], p[7], p[5], side)


def sp_pylon(a: float) -> list[np.ndarray]:
    """Base, knee, crown, hook tip of a hooked pylon."""
    return [np.array(polar(22.5, a, SP_DECK)), np.array(polar(24.0, a, 17.0)), np.array(polar(19.0, a, SP_PYLON_TOP)),
            np.array(polar(12.5, a, SP_PYLON_TOP - 3.0)), np.array(polar(10.5, a, SP_PYLON_TOP - 8.0))]


def build_spawnpool(with_pad: bool) -> ra.Mesh:
    rbb.RIB_C = SP_C
    m = ra.Mesh()
    cx, cy = SP_C
    POOL.update({"x": cx, "y": cy, "r": SP_R_IN})
    if with_pad:
        # The pool itself, a touch above the water, and its dark lip.
        m.new_part()
        m.cyl((cx, cy, 0.4), (cx, cy, 0.9), SP_R_IN + 0.5, SP_R_IN + 0.5, "pool", n=40)
    segs = ring_angles()
    # Pontoons under the ring, then the chitin deck plates with glow seams between them, and a ridge per plate.
    for i, (a0, a1) in enumerate(segs):
        gap = 0.012
        ring_seg(m, a0, a1, SP_R_IN + 1.0, SP_R_OUT + 0.8, 0.0, 1.2, "steel_dark", "steel_dark")
        if i % 2 == 0:
            ring_seg(m, a0 + gap, a1 - gap, SP_R_IN, SP_R_OUT, 1.2, SP_DECK, "chitin", "chitin_dark")
        else:
            ring_seg(m, a0 + gap, a1 - gap, SP_R_IN, SP_R_OUT, 1.2, SP_DECK, "chitin", "chitin_dark")
        ring_seg(m, a0, a1, SP_R_IN + 2.0, SP_R_OUT - 2.0, 1.2, SP_DECK - 0.15, "glow", "glow")
        am = (a0 + a1) / 2
        # Rib: a raised arch across each plate, inner to outer edge.
        m.cyl(polar(SP_R_IN + 0.6, am, SP_DECK), polar(SP_R_OUT - 0.5, am, SP_DECK + 0.4), 0.9, 1.1, "spine", n=6)
    # Inner lip glow round the pool.
    for a0, a1 in segs:
        ring_seg(m, a0, a1, SP_R_IN - 0.6, SP_R_IN, 0.9, 2.0, "glow", "glow")
    # Jaws either side of the mouth, reaching out over the slip.
    for s in (-1, 1):
        a = s * SP_MOUTH
        base = np.array(polar((SP_R_IN + SP_R_OUT) / 2, a, SP_DECK))
        mid = np.array(polar(SP_R_OUT + 3.0, a * 0.55, SP_DECK + 4.0))
        tip = np.array(polar(SP_R_OUT + 5.0, a * 0.2, SP_DECK + 1.0))
        m.cyl(base, mid, 2.4, 1.6, "spine", n=8)
        m.cyl(mid, tip, 1.6, 0.25, "spine", n=8)
        rbb.collar(m, base, mid, 0.5, 2.3, 0.4, "glow")
    # Hooked pylons with a lit bulb hanging from each hook.
    for a in SP_PYLONS:
        pts = sp_pylon(a)
        m.box((pts[0][0] - 3.0, pts[0][1] - 3.0, SP_DECK - 0.5), (pts[0][0] + 3.0, pts[0][1] + 3.0, SP_DECK + 1.8), "steel_dark", top="roof")
        rr = [2.2, 1.8, 1.4, 1.0, 0.3]
        for k in range(len(pts) - 1):
            m.cyl(pts[k], pts[k + 1], rr[k], rr[k + 1], "spine", n=8)
        rbb.ball(m, pts[1], 2.1, "steel", rings=4, n=10)
        rbb.collar(m, pts[0], pts[1], 0.45, 2.3, 0.45, "glow")
        rbb.collar(m, pts[1], pts[2], 0.5, 1.9, 0.4, "glow")
        bulb = pts[3] + np.array([0.0, 0.0, -5.0])
        m.cyl(pts[3], bulb + np.array([0, 0, 1.2]), 0.25, 0.25, "pipe", n=5)
        rbb.ball(m, bulb, 1.5, "core", rings=4, n=10)
    # Brood pod on the back of the ring: a ribbed dome with glow seams and a lit vent toward the pool.
    px, py, _ = polar(22.0, SP_POD, 0.0)
    rbb.RIB_C = (px, py)
    m.cyl((px, py, SP_DECK - 0.5), (px, py, SP_DECK + 1.5), 8.5, 8.0, "steel_dark", n=18)
    rbb.dome(m, px, py, SP_DECK + 1.5, 7.5, 13.0, 3, "ribbed", "glow", n=20)
    vx, vy, _ = polar(15.6, SP_POD, 0.0)
    m.cyl((vx - 1.2, vy, SP_DECK + 5.0), (vx + 0.4, vy, SP_DECK + 5.0), 2.4, 2.4, "core", n=12)
    m.cyl((px, py, SP_DECK + 14.0), (px, py, SP_DECK + 19.0), 1.4, 0.3, "spine", n=8)
    rbb.RIB_C = SP_C
    return m


def spawnpool_spots() -> dict:
    cx, cy = SP_C
    px, py, _ = polar(22.0, SP_POD, 0.0)
    vx, vy, _ = polar(15.6, SP_POD, 0.0)
    return {
        "pool": (cx, cy, 0.9),
        "bulbs": [tuple(sp_pylon(a)[3] + np.array([0.0, 0.0, -5.0])) for a in SP_PYLONS],
        "seams": [polar((SP_R_IN + SP_R_OUT) / 2, a, SP_DECK) for a in (math.radians(100), math.radians(180), math.radians(260))],
        "vent": (vx + 0.4, vy, SP_DECK + 5.0),
        "stack": (px, py, SP_DECK + 22.0),
    }


# ---------------------------------------------------------------- Aerie, t(7.5) x t(3.75)

AW, AH = ra.W, ra.H  # 320 x 160 world px, the Airfield's
BACK_DEPTH = ra.BACK_DEPTH
SPIRE = (150.0, 22.0)
SPIRE_TOP = 64.0
VATS = [(196.0, 18.0), (213.0, 26.0), (230.0, 16.0)]
VAT_TOP = 17.0
DOME_C = (50.0, 22.0)
DOME_R = 21.0
DOME_H = 30.0
POD_C = (92.0, 20.0)
STALK = (304.0, 30.0)
HOOKS = [(262.0, 14.0), (282.0, 26.0)]
NEST_R = 24.0


def aerie_ground(X: np.ndarray, Y: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """World ground point -> (rgb, alpha): creep, launch spine, taxi paths, nests."""
    rw = ra.runway()
    n_big = ra.fbm(X / 26, Y / 26, 3)
    n_mid = ra.fbm(X / 7, Y / 7, 5)
    n_fine = ra.vnoise(X / 0.9, Y / 0.9, 11)

    def c(h):
        return np.broadcast_to(rbb.rgb(h), X.shape + (3,)).copy()

    # Creep: dark green-grey biomass, mottled, with a faint glowing vein network.
    col = ra.mix(c("#29312c"), c("#3b463d"), ra.smooth(0.3, 0.7, n_big))
    col = col * (0.88 + 0.22 * n_mid[..., None]) * (0.93 + 0.14 * n_fine[..., None])
    vein = np.abs(np.sin(ra.fbm(X / 18, Y / 18, 47, 3) * 26.0))
    vmask = ra.smooth(0.08, 0.0, vein) * ra.smooth(0.35, 0.6, ra.fbm(X / 30 + 4, Y / 30, 53))
    col = ra.mix(col, c("#2fbf87"), vmask * 0.75)

    # Fused chitin: plates with seams, a darker groove pattern.
    def chitin(base: str, plate_w: float, ox: float, seed: int, along_x: bool = True):
        k = c(base)
        u = (X - ox) if along_x else (Y - ox)
        i = np.floor(u / plate_w)
        tone = ra.cell_rand(i, i * 0 + seed, seed)
        k *= (0.9 + 0.14 * tone)[..., None]
        k *= (0.9 + 0.14 * n_mid)[..., None] * (0.95 + 0.08 * n_fine[..., None])
        f = u - i * plate_w
        lip = f > plate_w - 1.6  # the raised back lip of each plate, lit
        k[lip] *= 1.18
        seam = f < 0.5
        k[seam] = rbb.rgb("#1a201c")
        return k

    shoulder = ra.rect_sdf(X, Y, rw["x0"], rw["y0"], rw["x1"], rw["y1"])
    edge_dark = ra.smooth(3.5, 0.5, shoulder)
    col = ra.mix(col, c("#1c231f"), edge_dark * 0.85)
    strip_in = shoulder <= 0
    strip = chitin("#56645c", 18.0, rw["x0"], 41)
    # Dark chitin curbs along both edges.
    curb = (np.abs(Y - rw["y0"]) < 1.6) | (np.abs(Y - rw["y1"]) < 1.6)
    strip[curb] = (c("#262d29") * (0.9 + 0.2 * n_fine[..., None]))[curb]
    col[strip_in] = strip[strip_in]

    for k, (px, py) in enumerate(ra.pads()):
        taxi = ra.rect_sdf(X, Y, px - ra.TAXI_HALF, rw["y1"] - 1, px + ra.TAXI_HALF, py - NEST_R + 2) <= 0
        t = chitin("#525e58", 9.0, rw["y1"], 50 + k, along_x=False)
        col[taxi] = t[taxi]
        r = np.hypot(X - px, Y - py)
        nest = r <= NEST_R
        ang = np.arctan2(Y - py, X - px)
        # Nest floor: radial chitin petals, darker toward the middle, a glowing ring.
        petal = np.mod(ang * 10 / (2 * np.pi), 1.0)
        f = c("#4a5650") * (0.82 + 0.25 * np.sin(np.pi * petal)[..., None]) * (0.9 + 0.14 * n_mid[..., None])
        f = ra.mix(f, c("#2a322e"), ra.smooth(NEST_R * 0.7, 0.0, r) * 0.55)
        f[(petal < 0.06)] = rbb.rgb("#1a201c")
        col[nest] = f[nest]
        ring = nest & (np.abs(r - (NEST_R - 3.5)) < 0.9)
        col[ring] = (c("#46e69a") * (0.9 + 0.12 * n_fine[..., None]))[ring]
        hub = r < 3.0
        col[hub] = c("#7dffc0")[hub]
        rim = nest & (r > NEST_R - 0.8)
        col[rim] *= 0.5

    # Glowing centre dashes and threshold chevrons on the spine.
    paint = np.zeros(X.shape, dtype=bool)
    cl = (X > rw["thr0"] + 6) & (X < rw["thr1"] - 6) & (np.abs(Y - rw["cy"]) < 1.0)
    cl &= ((X - rw["thr0"]) % 18.0) < 8.0
    paint |= cl
    for x_start, dirn in ((rw["thr0"], 1), (rw["thr1"], -1)):
        for j in range(3):
            u = (X - (x_start + dirn * (2.0 + j * 6.0))) * dirn
            chev = (u > np.abs(Y - rw["cy"]) * 0.45) & (u < np.abs(Y - rw["cy"]) * 0.45 + 2.2) & (np.abs(Y - rw["cy"]) < 12)
            paint |= chev
    col[paint] = (c("#5ff0a8") * (0.92 + 0.1 * n_fine[..., None]))[paint]

    d_edge = -ra.rect_sdf(X, Y, 0, 0, AW, AH)
    alpha = np.clip((d_edge + (n_mid - 0.5) * 6 + 1.0) / 3.0, 0, 1)
    return np.clip(col, 0, 1), alpha


def nest_rib(px: float, py: float, a: float) -> list[np.ndarray]:
    r0 = NEST_R + 2.5
    return [np.array([px + r0 * math.cos(a), py + r0 * math.sin(a), 0.0]),
            np.array([px + (r0 + 2.0) * math.cos(a), py + (r0 + 2.0) * math.sin(a), 6.0]),
            np.array([px + (r0 - 3.5) * math.cos(a), py + (r0 - 3.5) * math.sin(a), 9.5])]


def aerie_lights() -> list[tuple[float, float, float]]:
    rw = ra.runway()
    out = []
    x = rw["x0"] + 6
    while x < rw["x1"] - 4:
        for y in (rw["y0"] - 2.4, rw["y1"] + 2.4):
            out.append((x, y, 2.6))
        x += 24
    return out


def build_aerie_ground_props() -> ra.Mesh:
    """Low things in the ground layer: nest claw ribs (south half, open to the strip) and guide lights."""
    m = ra.Mesh()
    for px, py in ra.pads():
        m.cyl((px, py, 0.0), (px, py, 0.6), NEST_R + 1.2, NEST_R + 0.6, "chitin_dark", n=32, caps=False)
        for k in range(7):
            a = math.radians(-10 + k * 200 / 6)  # from east round the south to west
            pts = nest_rib(px, py, a)
            m.cyl(pts[0], pts[1], 2.4, 1.8, "spine", n=6)
            m.cyl(pts[1], pts[2], 1.8, 0.3, "spine", n=6)
            if k % 2 == 0:
                rbb.collar(m, pts[0], pts[1], 0.5, 1.8, 0.35, "glow")
    for x, y, z in aerie_lights():
        m.cyl((x, y, 0.0), (x, y, 1.6), 0.7, 0.55, "steel_dark", n=6)
        rbb.ball(m, (x, y, z), 1.3, "core", rings=3, n=8)
    return m


def build_aerie_props() -> ra.Mesh:
    m = ra.Mesh()
    # Brood dome: a ribbed shell, a lit maw on its south face, a skirt.
    rbb.RIB_C = DOME_C
    cx, cy = DOME_C
    m.cyl((cx, cy, 0.0), (cx, cy, 3.0), DOME_R + 3.0, DOME_R + 2.0, "steel_dark", n=28)
    m.cyl((cx, cy, 3.0), (cx, cy, 3.6), DOME_R + 1.6, DOME_R + 1.6, "glow", n=28, caps=False)
    rbb.dome(m, cx, cy, 3.6, DOME_R, DOME_H, 4, "ribbed", "glow", n=28)
    m.new_part()
    mw, mh = 9.0, 16.0
    prof = [(cx - mw * math.cos(math.pi * i / 12), 3.6 + mh * math.sin(math.pi * i / 12) ** 0.8) for i in range(13)]
    yf = cy + math.sqrt(max(0.0, DOME_R**2 - 0.0)) * 0.96
    m.poly([(x, yf, z) for x, z in prof], "core")
    for i in range(1, 12):
        x, z = prof[i]
        m.cyl((x, yf - 0.5, z), (cx + (x - cx) * 0.8, yf + 1.6, 3.6 + (z - 3.6) * 0.82), 1.0, 0.15, "spine", n=5)
    m.cyl((cx, cy, 3.6 + DOME_H - 1.0), (cx, cy, 3.6 + DOME_H + 6.0), 2.4, 0.4, "spine", n=8)
    # A smaller pod beside it.
    px, py = POD_C
    rbb.RIB_C = POD_C
    m.cyl((px, py, 0.0), (px, py, 2.0), 11.0, 10.5, "steel_dark", n=18)
    rbb.dome(m, px, py, 2.0, 9.5, 15.0, 3, "ribbed", "glow", n=20)
    rbb.ball(m, (px, py + 9.0, 6.0), 2.2, "core", rings=4, n=10)
    # Control spire: plinth, a tapered ribbed shaft with glow collars, the crown of prongs and the beacon.
    sx, sy = SPIRE
    rbb.RIB_C = SPIRE
    m.box((sx - 9.0, sy - 9.0, 0.0), (sx + 9.0, sy + 9.0, 4.0), "steel_dark", top="roof")
    m.cyl((sx, sy, 4.0), (sx, sy, SPIRE_TOP - 10.0), 6.0, 2.6, "ribbed", n=12)
    for z in (14.0, 24.0, 34.0, 44.0):
        r = 6.0 + (2.6 - 6.0) * (z - 4.0) / (SPIRE_TOP - 14.0)
        m.cyl((sx, sy, z), (sx, sy, z + 1.0), r + 0.8, r + 0.8, "glow", n=12, caps=False)
    # Sensor bulb (the "cab") near the top, its eye toward the strip.
    rbb.ball(m, (sx, sy, SPIRE_TOP - 8.0), 5.2, "steel", rings=6, n=14, squash=0.8)
    m.cyl((sx, sy + 3.6, SPIRE_TOP - 8.0), (sx, sy + 5.2, SPIRE_TOP - 8.0), 2.4, 2.0, "core", n=12)
    for k in range(5):
        a = 2 * math.pi * k / 5 + 0.3
        b = (sx + 2.0 * math.cos(a), sy + 2.0 * math.sin(a), SPIRE_TOP - 4.0)
        t = (sx + 7.5 * math.cos(a), sy + 7.5 * math.sin(a), SPIRE_TOP + 2.0)
        m.cyl(b, t, 0.9, 0.25, "spine", n=5)
    m.cyl((sx, sy, SPIRE_TOP - 4.0), (sx, sy, SPIRE_TOP + 1.0), 1.4, 0.8, "spine", n=8)
    rbb.ball(m, (sx, sy, SPIRE_TOP + 2.0), 1.8, "core", rings=4, n=10)
    # Plasma vats.
    for vx, vy in VATS:
        m.cyl((vx, vy, 0.0), (vx, vy, 3.0), 7.4, 6.8, "steel_dark", n=16)
        m.cyl((vx, vy, 3.0), (vx, vy, VAT_TOP - 3.0), 5.6, 5.6, "vat", n=16)
        for k in range(6):
            a = 2 * math.pi * k / 6 + 0.3
            qx, qy = vx + 5.9 * math.cos(a), vy + 5.9 * math.sin(a)
            m.cyl((qx, qy, 3.0), (qx, qy, VAT_TOP - 3.0), 0.5, 0.5, "spine", n=5)
        m.cyl((vx, vy, VAT_TOP - 3.0), (vx, vy, VAT_TOP), 6.4, 2.8, "steel_dark", n=16)
        m.cyl((vx, vy, VAT_TOP), (vx, vy, VAT_TOP + 1.4), 1.4, 1.0, "core", n=10)
    m.cyl((VATS[0][0], VATS[0][1], 8.0), (sx + 6.0, sy, 8.0), 1.2, 1.2, "pipe", n=8)
    # Hooked pylons, a lit bulb on each hook.
    for hx, hy in HOOKS:
        base = np.array([hx, hy, 0.0])
        knee = np.array([hx, hy + 2.0, 22.0])
        crown = np.array([hx + 3.0, hy + 6.0, 30.0])
        tip = np.array([hx + 6.0, hy + 9.0, 25.0])
        m.box((hx - 3.5, hy - 3.5, 0.0), (hx + 3.5, hy + 3.5, 2.5), "steel_dark", top="roof")
        m.cyl(base, knee, 2.0, 1.5, "spine", n=8)
        m.cyl(knee, crown, 1.5, 1.0, "spine", n=8)
        m.cyl(crown, tip, 1.0, 0.25, "spine", n=8)
        rbb.collar(m, base, knee, 0.5, 2.0, 0.4, "glow")
        rbb.ball(m, tip + np.array([0.0, 0.0, -3.0]), 1.3, "core", rings=4, n=8)
    # Sensor stalk at the east end (the windsock's place): a thin whip, a pulsing bulb.
    tx, ty = STALK
    m.cyl((tx, ty, 0.0), (tx, ty, 2.0), 2.4, 2.0, "steel_dark", n=8)
    m.cyl((tx, ty, 2.0), (tx - 1.0, ty, 34.0), 0.9, 0.4, "spine", n=6)
    rbb.ball(m, (tx - 1.0, ty, 36.0), 2.0, "core", rings=4, n=10)
    rbb.RIB_C = SP_C
    return m


def aerie_spots() -> dict:
    sx, sy = SPIRE
    return {
        "nests": [(px, py, 0.8) for px, py in ra.pads()],
        "lights": aerie_lights(),
        "beacon": (sx, sy, SPIRE_TOP + 2.0),
        "eye": (sx, sy + 5.2, SPIRE_TOP - 8.0),
        "maw": (DOME_C[0], DOME_C[1] + DOME_R * 0.96, 10.0),
        "vats": [(vx, vy + 5.6, 10.0) for vx, vy in VATS],
        "hooks": [(hx + 6.0, hy + 9.0, 22.0) for hx, hy in HOOKS],
        "stalk": (STALK[0] - 1.0, STALK[1], 36.0),
        "stack": (sx, sy, SPIRE_TOP + 8.0),
    }


def render_aerie(out_dir: Path) -> None:
    ra.ZOOM = 2.0
    cv = ra.make_canvas()
    print("aerie canvas", cv.w // SS, "x", cv.h // SS)
    ys, xs = np.mgrid[0 : cv.h, 0 : cv.w].astype(np.float64) + 0.5
    X, Y = cv.to_world_ground(xs, ys)
    inside = (X > -8) & (X < AW + 8) & (Y > -8) & (Y < AH + 8)
    g_col = np.zeros((cv.h, cv.w, 3))
    g_a = np.zeros((cv.h, cv.w))
    c, a = aerie_ground(X[inside], Y[inside])
    g_col[inside] = c
    g_a[inside] = a

    low = build_aerie_ground_props()
    props = build_aerie_props()
    # Headroom check: nothing may rise past the canvas top (the Airfield's TOP_MARGIN over the north corner).
    v = np.array(props.verts)
    over = float(np.max(v[:, 2] - (v[:, 0] + v[:, 1]) * 0.5))
    print("aerie headroom used", round(over, 1), "of", ra.TOP_MARGIN)
    if over > ra.TOP_MARGIN - 1:
        raise SystemExit("aerie props clip the canvas top")

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
    ground.save(out_dir / "aerie-ground.png", optimize=True)
    props_img.save(out_dir / "aerie.png", optimize=True)

    south = rbb.screen(cv, AW, AH, 0.0)
    info = {
        "padWidth": round((AW + AH) * ra.ZOOM, 1),
        "padSouthX": south[0],
        "padSouthY": south[1],
        "backDepth": BACK_DEPTH,
        "size": list(ground.size),
    }
    for key, pts in aerie_spots().items():
        if key == "stack":
            info["stackX"], info["stackY"] = rbb.screen(cv, *pts)
        elif isinstance(pts, tuple):
            info[key] = rbb.screen(cv, *pts)
        else:
            info[key] = [rbb.screen(cv, *p) for p in pts]
    (out_dir / "aerie.json").write_text(json.dumps(info, indent=2) + "\n")
    print("wrote", out_dir / "aerie.png", {k: info[k] for k in ("padWidth", "padSouthX", "padSouthY", "stackX", "stackY", "size")})

    both = ground.copy()
    both.alpha_composite(props_img)
    cam = Image.new("RGBA", (96, 96), (0, 0, 0, 0))
    bb = both.getbbox()
    if bb:
        crop = both.crop(bb)
        f = min(92 / crop.width, 92 / crop.height)
        crop = crop.resize((max(1, round(crop.width * f)), max(1, round(crop.height * f))), Image.Resampling.LANCZOS)
        cam.alpha_composite(crop, ((96 - crop.width) // 2, (96 - crop.height) // 2))
    cam.save(out_dir / "aerie-cameo.png")
    PREVIEW.mkdir(exist_ok=True)
    bg = Image.new("RGBA", both.size, (74, 107, 50, 255))
    bg.alpha_composite(both)
    bg.save(PREVIEW / "aerie-composite.png")


def render_spawnpool(out_dir: Path) -> None:
    build_spawnpool(True)
    rbb.render_building(out_dir, "spawnpool", SP, SP, 3.0, build_spawnpool, spawnpool_spots())
    img = Image.open(out_dir / "spawnpool.png").convert("RGBA")
    bg = Image.new("RGBA", img.size, (44, 74, 98, 255))
    bg.alpha_composite(img)
    PREVIEW.mkdir(exist_ok=True)
    bg.save(PREVIEW / "spawnpool.png")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True, help="buildings asset folder")
    ap.add_argument("--only", nargs="*", choices=["spawnpool", "aerie"])
    args = ap.parse_args()
    for bid in args.only or ["spawnpool", "aerie"]:
        if bid == "spawnpool":
            render_spawnpool(Path(args.out))
        else:
            render_aerie(Path(args.out))


if __name__ == "__main__":
    main()
