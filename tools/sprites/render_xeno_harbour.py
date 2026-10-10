#!/usr/bin/env python3
"""Xenite harbour: the Spawning Pool (shipyard).

  spawnpool  t(2.5) x t(2.5), on water, like the Marine Base (render_dock.py):
             a floating ribbed chitin ring round a glowing birthing pool, open
             to the south-east face (the slip the boats leave by), pontoons
             under it, four hooked pylons bending in over the pool with a lit
             bulb hanging from each hook, and a ribbed brood pod on the back of
             the ring. The water outside the ring stays empty: the map's water
             shows through. Writes spawnpool.png, spawnpool.json (pad metrics
             and glow spots, source px), spawnpool-cameo.png (96 px), the
             render_xeno_base.py format, at the dock's 3x zoom (384 px pad).

The Aerie (Xenite air) used to be drawn here as an airfield. Its fliers now
hover and never land, so it is a compact t(3) x t(3) building rendered with the
other base buildings: render_xeno_base.py --only aerie.

Look: render_xeno_base.py's (the inked structure pipeline of
render_airfield.py, the Xenite gunmetal and chitin, the green glow).

  python3 tools/sprites/render_xeno_harbour.py --out gridlock/packages/client/src/assets/buildings
"""

from __future__ import annotations

import argparse
import math
from pathlib import Path

import numpy as np
from PIL import Image

import render_xeno_base as rbb

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
    args = ap.parse_args()
    render_spawnpool(Path(args.out))


if __name__ == "__main__":
    main()
