#!/usr/bin/env python3
"""Nebelwerfer: armored rocket truck, hull and launcher as two 16-face sheets.

Same numpy rasterizer, camera, splinter camo, and outline as
render_procedural.py (Stuka, drone). Hull and launcher are separate passes of
one locked camera with one scale, like the Tiger's hull and turret, so the
client composes them with one transform and the launcher aims on its own.

The launcher's traverse pivot sits at the model origin, so it lands on the
same screen point at every hull yaw. 0001 = nose screen-south, then clockwise
22.5° through 0016.

  hull      armored cab and engine hood, a low armored bed with the turntable
            ring, three axles. No gun on the hull.
  launcher  cradle and twelve tubes (two rows of six), elevated, pointing +x.

No national insignia. A neutral gray cab roof and launcher side plate take the
team tint.

  python tools/sprites/render_nebelwerfer.py \\
      --out gridlock/packages/client/src/assets/units/nebelwerfer
"""

from __future__ import annotations

import argparse
import math
from pathlib import Path

import numpy as np
from PIL import Image

from render_procedural import Mesh, render_turntable

# Meters. +x nose, +y left, +z up. Wheels on z = 0.
WHEEL_R = 0.52
DECK_Z = 1.25  # bed floor / launcher ring height
ELEV = math.radians(34)  # launcher tube elevation
SCALE_FRAC = 0.1  # px per meter / cell px
Z_MID = 1.3
CY_FRAC = 0.6


def wheel(m: Mesh, x: float, y: float, n: int = 12) -> None:
    """A tire as a short cylinder along y, with a darker hub face outward."""
    half = 0.2
    rings = []
    for yy in (y - half, y + half):
        rings.append([np.array([x + WHEEL_R * math.cos(2 * math.pi * k / n), yy, WHEEL_R + WHEEL_R * math.sin(2 * math.pi * k / n)]) for k in range(n)])
    m.loft(rings, "tire")
    side = y + (half + 0.01) * (1 if y > 0 else -1)
    hub = [np.array([x + 0.24 * math.cos(2 * math.pi * k / 8), side, WHEEL_R + 0.24 * math.sin(2 * math.pi * k / 8)]) for k in range(8)]
    m.loft([hub, [p + np.array([0, 0.02 * (1 if y > 0 else -1), 0]) for p in hub]], "metal")


def slab(m: Mesh, pts_bottom: list[tuple[float, float]], z0: float, z1: float, top_pts: list[tuple[float, float]], mat: str, top_mat: str | None = None) -> None:
    """Prism from an x/y outline at z0 to a (possibly smaller) outline at z1: sloped armor."""
    bot = [m.v((x, y, z0)) for x, y in pts_bottom]
    top = [m.v((x, y, z1)) for x, y in top_pts]
    n = len(bot)
    for i in range(n):
        j = (i + 1) % n
        m.quad(bot[i], bot[j], top[j], top[i], mat)
    # caps (fan; outlines are convex)
    for i in range(1, n - 1):
        m.tri(top[0], top[i], top[i + 1], top_mat or mat)
        m.tri(bot[0], bot[i + 1], bot[i], mat)


def build_hull() -> Mesh:
    m = Mesh()
    hw = 1.1  # half width of the body
    # Chassis rails and mudguards
    m.box((-2.3, -0.75, 0.55), (3.3, 0.75, 0.85), "metal")
    # Armored engine hood, sloped front and sides.
    slab(m, [(1.9, -hw), (3.55, -0.95), (3.55, 0.95), (1.9, hw)], 0.85, 1.55,
         [(1.9, -0.95), (3.2, -0.75), (3.2, 0.75), (1.9, 0.95)], "camo")
    # Grille slot
    m.box((3.5, -0.55, 0.95), (3.58, 0.55, 1.25), "frame")
    # Armored cab: angled windscreen plate, vision slits, gray team roof.
    slab(m, [(0.9, -hw), (1.95, -hw), (1.95, hw), (0.9, hw)], 0.85, 2.15,
         [(0.95, -1.0), (1.55, -1.0), (1.55, 1.0), (0.95, 1.0)], "camo", "team")
    m.box((1.72, -0.8, 1.72), (1.86, 0.8, 1.84), "frame")  # windscreen slit
    for s in (-1, 1):
        m.box((1.15, s * 1.09 - 0.02, 1.62), (1.6, s * 1.09 + 0.02, 1.7), "frame")  # side slits
    # Low armored bed around the launcher ring.
    slab(m, [(-2.45, -hw), (0.9, -hw), (0.9, hw), (-2.45, hw)], 0.85, DECK_Z,
         [(-2.4, -1.05), (0.9, -1.05), (0.9, 1.05), (-2.4, 1.05)], "camo")
    # Side skirts on the bed and a rear stowage box
    for s in (-1, 1):
        m.box((-2.4, s * 1.1 - 0.06 * (s < 0), DECK_Z), (0.85, s * 1.1 + 0.06 * (s > 0), DECK_Z + 0.35), "camo")
    m.box((-2.5, -0.8, 0.9), (-2.3, 0.8, 1.35), "frame")
    # Turntable ring at the origin (the launcher pivot); left empty for the launcher sheet.
    n = 20
    rings = [[np.array([0.95 * math.cos(2 * math.pi * k / n), 0.95 * math.sin(2 * math.pi * k / n), z]) for k in range(n)] for z in (DECK_Z, DECK_Z + 0.12)]
    m.loft(rings, "metal")
    # Headlights: hazard-yellow covers so the nose reads at any yaw.
    for s in (-1, 1):
        m.box((3.45, s * 0.85 - 0.12, 1.35), (3.62, s * 0.85 + 0.12, 1.5), "hazard")
    # Three axles, the rear two close together.
    for x in (2.55, -0.95, -2.0):
        for s in (-1, 1):
            wheel(m, x, s * 1.02)
    return m


def tube(m: Mesh, p0: np.ndarray, p1: np.ndarray, r: float, mat: str, n: int = 8) -> None:
    """Open launch tube from p0 (breech) to p1 (muzzle); the muzzle face shows a dark bore."""
    axis = p1 - p0
    axis = axis / np.linalg.norm(axis)
    up = np.array([0.0, 0.0, 1.0])
    u = np.cross(axis, up)
    if np.linalg.norm(u) < 1e-6:
        u = np.array([0.0, 1.0, 0.0])
    u /= np.linalg.norm(u)
    v = np.cross(u, axis)
    ring = lambda c, rr: [c + rr * (math.cos(2 * math.pi * k / n) * u + math.sin(2 * math.pi * k / n) * v) for k in range(n)]
    m.loft([ring(p0, r), ring(p1, r)], mat)
    m.loft([ring(p1 + axis * 0.01, r * 0.72), ring(p1 + axis * 0.012, r * 0.72)], "tire")


def build_launcher() -> Mesh:
    m = Mesh()
    z = DECK_Z + 0.12
    # Traversing turntable and a pedestal
    n = 18
    base = [[np.array([0.85 * math.cos(2 * math.pi * k / n), 0.85 * math.sin(2 * math.pi * k / n), zz]) for k in range(n)] for zz in (z, z + 0.14)]
    m.loft(base, "metal")
    m.box((-0.35, -0.5, z + 0.14), (0.35, 0.5, z + 0.55), "frame")
    # Tube bundle: two rows of six, pivoting on a trunnion above the pedestal.
    pivot = np.array([0.0, 0.0, z + 0.62])
    fwd = np.array([math.cos(ELEV), 0.0, math.sin(ELEV)])
    upn = np.array([-math.sin(ELEV), 0.0, math.cos(ELEV)])
    left = np.array([0.0, 1.0, 0.0])
    r = 0.13
    back, front = -0.95, 1.15
    for row in range(2):
        for col in range(6):
            off = left * ((col - 2.5) * 2 * r * 1.05) + upn * ((row - 0.5) * 2 * r * 1.08 + 0.16)
            tube(m, pivot + fwd * back + off, pivot + fwd * front + off, r, "camo")
    # Frame bands around the bundle, front and rear, and a gray team plate on each side.
    for t in (back + 0.25, front - 0.25):
        c = pivot + fwd * t + upn * 0.16
        hwid = 6 * r * 1.05 + 0.05
        hh = 2 * r * 1.08 + 0.05
        corners = [c + left * sy * hwid + upn * sz * hh for sy, sz in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
        d = fwd * 0.06
        m.loft([[p - d for p in corners], [p + d for p in corners]], "frame")
    for s in (-1, 1):
        c = pivot + fwd * 0.1 + upn * 0.1 + left * s * (6 * r * 1.05 + 0.08)
        pts = [c + fwd * a + upn * b for a, b in ((-0.55, -0.22), (0.55, -0.22), (0.55, 0.22), (-0.55, 0.22))]
        m.loft([pts, [p + left * s * 0.03 for p in pts]], "team")
    # Elevation strut from the pedestal to the bundle's belly
    m.box((0.15, -0.08, z + 0.2), (0.55, 0.08, z + 0.72), "metal")
    return m


def cameo(out: Path) -> None:
    """Static fallback cameo (east, hull + launcher). The client also composes --nebelwerfer-cameo."""
    hull = Image.open(out / "hull" / "0013.png").convert("RGBA")
    hull.alpha_composite(Image.open(out / "launcher" / "0013.png").convert("RGBA"))
    crop = hull.crop(hull.getbbox())
    size, pad = 128, 8
    fit = min((size - 2 * pad) / crop.width, (size - 2 * pad) / crop.height)
    small = crop.resize((max(1, round(crop.width * fit)), max(1, round(crop.height * fit))), Image.Resampling.LANCZOS)
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    img.alpha_composite(small, ((size - small.width) // 2, (size - small.height) // 2))
    path = out.parent / "nebelwerfer-cameo.png"
    img.save(path)
    print("wrote", path)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True, help="unit folder; writes hull/ and launcher/ inside it")
    ap.add_argument("--ss", type=int, default=4)
    args = ap.parse_args()
    out = Path(args.out)
    common = dict(scale_frac=SCALE_FRAC, z_mid=Z_MID, cy_frac=CY_FRAC, ss=args.ss)
    render_turntable(build_hull(), out / "hull", "nebelwerfer_hull", "nebelwerfer-hull.json", **common)
    render_turntable(build_launcher(), out / "launcher", "nebelwerfer_launcher", "nebelwerfer-launcher.json", **common)
    cameo(out)


if __name__ == "__main__":
    main()
