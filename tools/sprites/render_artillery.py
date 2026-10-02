#!/usr/bin/env python3
"""Artillery: towed field gun, one 16-face hull sheet.

Same numpy rasterizer, camera, splinter camo, scale, and outline as
render_nebelwerfer.py, so it sits in the vehicle class at the same meters per
pixel. The barrel is the facing: 0001 = muzzle screen-south, then clockwise
22.5° through 0016. The crew is drawn by the client, not baked in.

  hull  two spoked wheels on an axle, a gun shield with a gray team stripe,
        the elevated barrel with recoil cylinder and muzzle brake, and the
        split trail with its spades on the ground behind.

  python tools/sprites/render_artillery.py \\
      --out gridlock/packages/client/src/assets/units/artillery
"""

from __future__ import annotations

import argparse
import math
from pathlib import Path

import numpy as np
from PIL import Image

from render_procedural import Mesh, render_turntable

# Meters. +x muzzle, +y left, +z up. Wheels on z = 0. Origin under the axle.
WHEEL_R = 0.62
AXLE_Z = WHEEL_R
TRUNNION_Z = 1.1
ELEV = math.radians(45)  # barrel elevation: high-angle fire
BARREL_LEN = 3.3
SCALE_FRAC = 0.1  # px per meter / cell px, locked to the Nebelwerfer
Z_MID = 1.0
CY_FRAC = 0.6


def tube(m: Mesh, p0: np.ndarray, p1: np.ndarray, r: float, mat: str, n: int = 10, bore: bool = False) -> None:
    """Cylinder from p0 to p1. `bore` darkens the far end like a muzzle."""
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
    if bore:
        m.loft([ring(p1 + axis * 0.01, r * 0.6), ring(p1 + axis * 0.012, r * 0.6)], "tire")


def wheel(m: Mesh, y: float, n: int = 16) -> None:
    """Tire as a short cylinder along y, a hub, and six spokes on the outer face."""
    half = 0.09
    side = 1 if y > 0 else -1
    rings = []
    for yy in (y - half, y + half):
        rings.append([np.array([WHEEL_R * math.cos(2 * math.pi * k / n), yy, AXLE_Z + WHEEL_R * math.sin(2 * math.pi * k / n)]) for k in range(n)])
    m.loft(rings, "tire")
    face = y + side * (half + 0.01)
    rim = [np.array([0.5 * math.cos(2 * math.pi * k / n), face, AXLE_Z + 0.5 * math.sin(2 * math.pi * k / n)]) for k in range(n)]
    m.loft([rim, [p + np.array([0, side * 0.015, 0]) for p in rim]], "frame")
    for k in range(6):
        a = 2 * math.pi * k / 6
        p0 = np.array([0.0, face + side * 0.03, AXLE_Z])
        p1 = np.array([0.48 * math.cos(a), face + side * 0.03, AXLE_Z + 0.48 * math.sin(a)])
        tube(m, p0, p1, 0.035, "camo", n=6)
    hub = [np.array([0.13 * math.cos(2 * math.pi * k / 8), face + side * 0.04, AXLE_Z + 0.13 * math.sin(2 * math.pi * k / 8)]) for k in range(8)]
    m.loft([hub, [p + np.array([0, side * 0.06, 0]) for p in hub]], "metal")


def trail_leg(m: Mesh, root: np.ndarray, end: np.ndarray, w: float, h: float) -> None:
    """Box-section trail leg from the carriage back to the spade."""
    axis = end - root
    axis = axis / np.linalg.norm(axis)
    side = np.cross(np.array([0.0, 0.0, 1.0]), axis)
    side /= np.linalg.norm(side)
    up = np.cross(axis, side)
    corners = lambda c: [c + side * sy * w + up * sz * h for sy, sz in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    m.loft([corners(root), corners(end)], "camo")


def build_hull() -> Mesh:
    m = Mesh()
    # Axle and the two wheels.
    tube(m, np.array([0.0, -0.82, AXLE_Z]), np.array([0.0, 0.82, AXLE_Z]), 0.07, "metal")
    for s in (-1, 1):
        wheel(m, s * 0.82)
    # Carriage saddle on the axle, the cradle above it.
    m.box((-0.45, -0.32, AXLE_Z - 0.05), (0.55, 0.32, AXLE_Z + 0.25), "camo")
    m.box((-0.2, -0.2, AXLE_Z + 0.25), (0.35, 0.2, TRUNNION_Z - 0.05), "frame")
    # Split trail: two legs spread back to the spades on the ground.
    for s in (-1, 1):
        root = np.array([-0.35, s * 0.24, AXLE_Z + 0.05])
        end = np.array([-2.55, s * 0.62, 0.16])
        trail_leg(m, root, end, 0.08, 0.1)
        m.box((-2.78, s * 0.62 - 0.17, 0.0), (-2.58, s * 0.62 + 0.17, 0.34), "metal")
        m.box((-2.5, s * 0.62 - 0.05, 0.16), (-2.3, s * 0.62 + 0.05, 0.3), "frame")  # handspike bracket
    # Gun shield: a wide plate in front of the axle, its top stripe takes the team tint.
    m.box((0.52, -0.98, 0.42), (0.6, 0.98, 1.38), "camo")
    m.box((0.6, -0.96, 1.22), (0.63, 0.96, 1.36), "team")
    for s in (-1, 1):
        m.box((0.4, s * 0.98 - 0.04, 0.5), (0.56, s * 0.98 + 0.04, 1.3), "camo")  # folded side wings
    # Barrel: breech behind the trunnion, recoil cylinder under it, muzzle brake on the end.
    pivot = np.array([0.0, 0.0, TRUNNION_Z])
    fwd = np.array([math.cos(ELEV), 0.0, math.sin(ELEV)])
    upn = np.array([-math.sin(ELEV), 0.0, math.cos(ELEV)])
    breech = pivot - fwd * 0.7
    muzzle = pivot + fwd * BARREL_LEN
    m.box(tuple(breech - np.array([0.28, 0.17, 0.15])), tuple(breech + np.array([0.12, 0.17, 0.15])), "metal")
    tube(m, breech, pivot + fwd * 1.0, 0.13, "camo")
    tube(m, pivot + fwd * 1.0, muzzle, 0.085, "metal", bore=True)
    tube(m, pivot - fwd * 0.4 - upn * 0.17, pivot + fwd * 1.15 - upn * 0.17, 0.09, "frame")
    tube(m, muzzle - fwd * 0.3, muzzle + fwd * 0.04, 0.14, "metal", bore=True)
    # Elevating arc beside the cradle.
    for s in (-1, 1):
        m.box((-0.3, s * 0.22 - 0.02, AXLE_Z + 0.25), (0.2, s * 0.22 + 0.02, TRUNNION_Z + 0.08), "metal")
    return m


CAMEO_FACE = "0014"  # ESE: wheel, shield, barrel, and trail all read on the train button
CAMEO_GAIN = 1.55
CAMEO_LIFT = 0.04


def cameo(out: Path, face: str = CAMEO_FACE) -> None:
    """Static cameo, brightened for the dark sidebar and filling the 128 frame."""
    hull = Image.open(out / "hull" / f"{face}.png").convert("RGBA")
    crop = hull.crop(hull.getbbox())
    px = np.asarray(crop).astype(np.float64) / 255
    rgb = px[..., :3]
    dark = rgb.max(axis=-1, keepdims=True) < 0.12
    lifted = np.clip(rgb * CAMEO_GAIN + CAMEO_LIFT, 0, 1)
    px[..., :3] = np.where(dark, rgb, lifted)
    crop = Image.fromarray((px * 255 + 0.5).astype(np.uint8), "RGBA")
    size, pad = 128, 3
    fit = (size - 2 * pad) / max(crop.width, crop.height)
    small = crop.resize((max(1, round(crop.width * fit)), max(1, round(crop.height * fit))), Image.Resampling.LANCZOS)
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    img.alpha_composite(small, ((size - small.width) // 2, size - pad - small.height))
    path = out.parent / "artillery-cameo.png"
    img.save(path)
    print("wrote", path)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True, help="unit folder; writes hull/ inside it")
    ap.add_argument("--ss", type=int, default=4)
    ap.add_argument("--cameo-only", action="store_true")
    args = ap.parse_args()
    out = Path(args.out)
    if args.cameo_only:
        cameo(out)
        return
    render_turntable(build_hull(), out / "hull", "artillery_hull", "artillery-hull.json",
                     scale_frac=SCALE_FRAC, z_mid=Z_MID, cy_frac=CY_FRAC, ss=args.ss)
    cameo(out)


if __name__ == "__main__":
    main()
