#!/usr/bin/env python3
"""Apocalypse: super-heavy twin-gun tank, four 16-face layers from one camera.

Same numpy rasterizer, camera, and outline as render_procedural.py and
render_nebelwerfer.py. Every layer is a separate pass of one locked camera
with one scale and one origin, so the client composes them with one transform
(like the Tiger's hull / turret / gun) and each traversing layer aims on its own.

The turret ring and the roof mount both turn on the model origin (the turret's
vertical axis), so they land on the same screen point at every hull yaw.
0001 = nose screen-south, then clockwise 22.5° through 0016.

  hull     long tracked hull, sloped glacis, side skirts, engine deck, an empty
           turret ring. No gun on the hull.
  turret   wide faceted turret with a bustle and the twin mantlet. No barrels.
  gun      the two long barrels side by side, so they can recoil together.
  ciws     the roof mount: pedestal, gun house, a six-barrel 20mm cluster, and
           the pale radome on top. Points +x, traverses on its own facing.

Chassis is the neutral gray the game tints (like the Tiger). No insignia.

  python tools/sprites/render_apocalypse.py \\
      --out gridlock/packages/client/src/assets/units/apocalypse
"""

from __future__ import annotations

import argparse
import math
from pathlib import Path

import numpy as np
from PIL import Image

import render_procedural as rp
from render_procedural import Mesh, render_turntable

# Gray chassis for the team tint (brief palette), a darker plate, running gear.
rp.MAT["armor"] = (rp.hex_rgb("#6e6e68"), 0.12, 1.0)
rp.MAT["plate"] = (rp.hex_rgb("#4a4a46"), 0.08, 1.0)
rp.MAT["track"] = (rp.hex_rgb("#26241f"), 0.03, 1.0)
rp.MAT["wheel"] = (rp.hex_rgb("#3c3b36"), 0.15, 1.0)
rp.MAT["barrel"] = (rp.hex_rgb("#55554f"), 0.30, 1.0)
rp.MAT["radome"] = (rp.hex_rgb("#d8d4c4"), 0.25, 1.0)

# Meters. +x nose, +y left, +z up. Tracks on z = 0. Origin = turret ring centre.
HULL_X0, HULL_X1 = -4.2, 4.6  # rear, nose
TRACK_Y0, TRACK_Y1 = 1.5, 2.35  # inner / outer face of each track
DECK_Z = 1.95  # hull roof and turret ring height
TURRET_TOP = 2.95
GUN_Z = 2.5
GUN_Y = 0.58  # each barrel's offset off the centre line
CIWS_Z = TURRET_TOP
SCALE_FRAC = 0.07  # px per meter / cell px: gun tip at east fits the cell
Z_MID = 1.6
CY_FRAC = 0.6


def slab(m: Mesh, bottom: list[tuple[float, float]], z0: float, z1: float, top: list[tuple[float, float]], mat: str, top_mat: str | None = None) -> None:
    """Prism from an x/y outline at z0 to a (possibly smaller) outline at z1: sloped armor. Outlines convex."""
    b = [m.v((x, y, z0)) for x, y in bottom]
    t = [m.v((x, y, z1)) for x, y in top]
    n = len(b)
    for i in range(n):
        j = (i + 1) % n
        m.quad(b[i], b[j], t[j], t[i], mat)
    for i in range(1, n - 1):
        m.tri(t[0], t[i], t[i + 1], top_mat or mat)
        m.tri(b[0], b[i + 1], b[i], mat)


def cylinder_y(m: Mesh, x: float, z: float, r: float, y0: float, y1: float, mat: str, n: int = 12) -> None:
    """Short cylinder whose axis runs along y (a road wheel)."""
    rings = [[np.array([x + r * math.cos(2 * math.pi * k / n), yy, z + r * math.sin(2 * math.pi * k / n)]) for k in range(n)] for yy in (y0, y1)]
    m.loft(rings, mat)


def cylinder_z(m: Mesh, cx: float, cy: float, r: float, z0: float, z1: float, mat: str, n: int = 16) -> None:
    rings = [[np.array([cx + r * math.cos(2 * math.pi * k / n), cy + r * math.sin(2 * math.pi * k / n), zz]) for k in range(n)] for zz in (z0, z1)]
    m.loft(rings, mat)


def tube_x(m: Mesh, x0: float, x1: float, y: float, z: float, r: float, mat: str, n: int = 10) -> None:
    """Barrel along +x from x0 to x1."""
    rings = [[np.array([xx, y + r * math.cos(2 * math.pi * k / n), z + r * math.sin(2 * math.pi * k / n)]) for k in range(n)] for xx in (x0, x1)]
    m.loft(rings, mat)


def track(m: Mesh, s: int) -> None:
    """One track run: a stadium profile in x/z lofted across the track width, road wheels outboard."""
    r = 0.55
    zc = r
    xf, xr = HULL_X1 - 0.55, HULL_X0 + 0.45
    prof: list[tuple[float, float]] = []
    for k in range(9):  # front arc, bottom to top
        a = -math.pi / 2 + math.pi * k / 8
        prof.append((xf + r * math.cos(a), zc + r * math.sin(a) + (0.25 if a > 0 else 0) * math.sin(a)))
    for k in range(9):  # rear arc, top to bottom
        a = math.pi / 2 + math.pi * k / 8
        prof.append((xr + r * math.cos(a), zc + r * math.sin(a) + (0.25 if a < math.pi else 0) * math.sin(a)))
    rings = [[np.array([x, s * yy, z]) for x, z in prof] for yy in (TRACK_Y0, TRACK_Y1)]
    m.loft(rings, "track")
    # Road wheels: seven big ones, peeking under the skirt.
    out = s * (TRACK_Y1 + 0.02)
    for i in range(7):
        x = xr + 0.25 + i * (xf - xr - 0.5) / 6
        cylinder_y(m, x, 0.48, 0.4, out - 0.06 * s, out, "wheel")
    # Drive sprocket up front
    cylinder_y(m, xf + 0.1, 0.72, 0.42, out - 0.08 * s, out + 0.02 * s, "plate")


def build_hull() -> Mesh:
    m = Mesh()
    for s in (-1, 1):
        track(m, s)
        # Side skirt over the upper run, the long side plate that reads as heavy.
        lo = TRACK_Y1 + 0.03
        m.box((HULL_X0 + 0.15, min(s * lo, s * (lo + 0.12)), 0.72), (HULL_X1 - 0.35, max(s * lo, s * (lo + 0.12)), 1.3), "armor")
    # Lower hull tub between the tracks, and a sloped lower nose plate.
    m.box((HULL_X0 + 0.1, -TRACK_Y0, 0.35), (HULL_X1 - 0.8, TRACK_Y0, 1.2), "plate")
    slab(m, [(HULL_X1 - 0.8, -TRACK_Y0), (HULL_X1 - 0.35, -TRACK_Y0), (HULL_X1 - 0.35, TRACK_Y0), (HULL_X1 - 0.8, TRACK_Y0)], 0.35, 1.2,
         [(HULL_X1 - 0.8, -TRACK_Y0), (HULL_X1 + 0.05, -TRACK_Y0), (HULL_X1 + 0.05, TRACK_Y0), (HULL_X1 - 0.8, TRACK_Y0)], "plate")
    # Upper hull over the tracks, a long sloped glacis to the front.
    w = TRACK_Y1 + 0.12
    slab(m, [(HULL_X0, -w), (HULL_X1 + 0.05, -w), (HULL_X1 + 0.05, w), (HULL_X0, w)], 1.2, DECK_Z,
         [(HULL_X0 + 0.1, -w + 0.2), (HULL_X1 - 1.25, -w + 0.2), (HULL_X1 - 1.25, w - 0.2), (HULL_X0 + 0.1, w - 0.2)], "armor")
    # Engine deck: two grille blocks and a pair of exhausts at the tail.
    for s in (-1, 1):
        m.box((HULL_X0 + 0.35, s * 0.35 - 0.6 * (s < 0), DECK_Z), (HULL_X0 + 1.9, s * 0.35 + 0.6 * (s > 0), DECK_Z + 0.1), "plate")
        cylinder_y(m, HULL_X0 - 0.05, 1.55, 0.16, s * 1.2 - 0.25, s * 1.2 + 0.25, "wheel", 8)
    # Neutral team stripe across the rear deck.
    m.box((HULL_X0 + 0.15, -w + 0.3, DECK_Z), (HULL_X0 + 0.32, w - 0.3, DECK_Z + 0.06), "team")
    # Headlights: hazard covers on the front corners so the nose reads at any yaw.
    for s in (-1, 1):
        m.box((HULL_X1 - 1.05, s * (w - 0.45) - 0.14, DECK_Z - 0.2), (HULL_X1 - 0.8, s * (w - 0.45) + 0.14, DECK_Z - 0.02), "hazard")
    # Tow hooks / spare track links on the glacis.
    m.box((HULL_X1 - 0.95, -0.9, 1.55), (HULL_X1 - 0.55, 0.9, 1.65), "track")
    # Turret ring at the origin, left empty for the turret sheet.
    cylinder_z(m, 0.0, 0.0, 1.45, DECK_Z, DECK_Z + 0.08, "wheel", 24)
    return m


def build_turret() -> Mesh:
    m = Mesh()
    z0 = DECK_Z + 0.06
    bottom = [(2.0, -0.95), (2.0, 0.95), (1.45, 1.75), (-1.9, 1.75), (-2.65, 1.25), (-2.65, -1.25), (-1.9, -1.75), (1.45, -1.75)]
    top = [(1.55, -0.8), (1.55, 0.8), (1.05, 1.45), (-1.75, 1.45), (-2.4, 1.05), (-2.4, -1.05), (-1.75, -1.45), (1.05, -1.45)]
    slab(m, bottom, z0, TURRET_TOP, top, "armor")
    # Twin mantlet across the front.
    m.box((1.85, -1.08, 2.12), (2.35, 1.08, 2.88), "plate")
    for s in (-1, 1):
        tube_x(m, 2.3, 2.75, s * GUN_Y, GUN_Z, 0.26, "plate")
    # Rear bustle stowage bin and a neutral team plate on its back face.
    m.box((-2.75, -1.1, 2.15), (-2.55, 1.1, 2.75), "plate")
    m.box((-2.8, -0.8, 2.3), (-2.74, 0.8, 2.62), "team")
    # Commander's vision block on the left rear, loader's hatch on the right.
    m.box((-1.4, 0.75, TURRET_TOP), (-0.8, 1.25, TURRET_TOP + 0.18), "plate")
    m.box((-1.45, -1.25, TURRET_TOP), (-0.85, -0.7, TURRET_TOP + 0.08), "plate")
    return m


def build_gun() -> Mesh:
    m = Mesh()
    for s in (-1, 1):
        y = s * GUN_Y
        tube_x(m, 2.6, 3.6, y, GUN_Z, 0.2, "barrel")  # thick breech sleeve
        tube_x(m, 3.6, 6.1, y, GUN_Z, 0.14, "barrel")
        tube_x(m, 4.5, 4.95, y, GUN_Z, 0.19, "barrel")  # fume extractor
        tube_x(m, 6.05, 6.5, y, GUN_Z, 0.21, "plate")  # muzzle brake
    return m


def build_ciws() -> Mesh:
    """Roof mount, drawn a size up so the white radome and the barrel cluster read at game zoom."""
    m = Mesh()
    k = 1.3
    z = CIWS_Z
    cylinder_z(m, 0.0, 0.0, 0.5 * k, z, z + 0.18 * k, "wheel")  # traverse ring
    m.box((-0.55 * k, -0.42 * k, z + 0.18 * k), (0.35 * k, 0.42 * k, z + 0.72 * k), "plate")  # gun house
    m.box((-0.45 * k, 0.42 * k, z + 0.25 * k), (0.05 * k, 0.62 * k, z + 0.6 * k), "armor")  # ammo drum box
    cylinder_z(m, -0.15 * k, 0.0, 0.33 * k, z + 0.72 * k, z + 1.0 * k, "radome")  # radome skirt
    cylinder_z(m, -0.15 * k, 0.0, 0.24 * k, z + 1.0 * k, z + 1.18 * k, "radome", 14)  # dome cap
    gz = z + 0.45 * k
    tube_x(m, 0.35 * k, 0.6 * k, 0.0, gz, 0.2 * k, "plate")  # barrel clamp at the house
    tube_x(m, 0.6 * k, 1.75 * k, 0.0, gz, 0.13 * k, "barrel", 8)  # six-barrel cluster, one chunky tube
    tube_x(m, 1.6 * k, 1.8 * k, 0.0, gz, 0.17 * k, "plate", 8)  # muzzle clamp
    return m


# Cameo: 3/4 front (nose right, a little down) shows both barrels and the roof mount.
CAMEO_FACE = "0014"
CAMEO_GAIN = 1.3
CAMEO_LIFT = 0.03
LAYERS = ("hull", "turret", "gun", "ciws")


def cameo(out: Path, face: str = CAMEO_FACE, path: Path | None = None) -> None:
    img = Image.open(out / "hull" / f"{face}.png").convert("RGBA")
    for layer in LAYERS[1:]:
        img.alpha_composite(Image.open(out / layer / f"{face}.png").convert("RGBA"))
    crop = img.crop(img.getbbox())
    px = np.asarray(crop).astype(np.float64) / 255
    rgb = px[..., :3]
    dark = rgb.max(axis=-1, keepdims=True) < 0.12
    px[..., :3] = np.where(dark, rgb, np.clip(rgb * CAMEO_GAIN + CAMEO_LIFT, 0, 1))
    crop = Image.fromarray((px * 255 + 0.5).astype(np.uint8), "RGBA")
    size, pad = 128, 3
    fit = (size - 2 * pad) / max(crop.width, crop.height)
    small = crop.resize((max(1, round(crop.width * fit)), max(1, round(crop.height * fit))), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    canvas.alpha_composite(small, ((size - small.width) // 2, size - pad - small.height))
    path = path or out.parent / "apocalypse-cameo.png"
    canvas.save(path)
    print("wrote", path)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True, help="unit folder; writes hull/ turret/ gun/ ciws/ inside it")
    ap.add_argument("--ss", type=int, default=4)
    ap.add_argument("--cameo-only", action="store_true")
    args = ap.parse_args()
    out = Path(args.out)
    if not args.cameo_only:
        common = dict(scale_frac=SCALE_FRAC, z_mid=Z_MID, cy_frac=CY_FRAC, ss=args.ss)
        for name, build in zip(LAYERS, (build_hull, build_turret, build_gun, build_ciws)):
            render_turntable(build(), out / name, f"apocalypse_{name}", f"apocalypse-{name}.json", **common)
    cameo(out)


if __name__ == "__main__":
    main()
