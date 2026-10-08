#!/usr/bin/env python3
"""Feuerwirbel: flame tank with a twin-gatling turret, two 16-face layers from one camera.

Same numpy rasterizer, camera, and outline as render_apocalypse.py and
render_jagdtiger.py. Both layers are passes of one locked camera with one scale
and one origin, so the client composes them with one transform (like the
Tiger's hull / turret) and the turret aims on its own facing.

The turret turns on the model origin, so it lands on the ring at every hull yaw.
0001 = nose screen-south, then clockwise 22.5° through 0016.

  hull     medium tracked hull, sloped glacis, side skirts. The flame projector
           sits fixed in a ball mount on the glacis and only fires where the
           nose points. Two armored fuel tanks with hazard bands ride the
           engine deck, a feed pipe runs forward. Empty turret ring.
  turret   low faceted turret, a cradle in front carrying two six-barrel
           gatling clusters side by side, an ammo box on each cheek.

Chassis is the neutral gray the game tints (like the Tiger). No insignia.

  python tools/sprites/render_feuerwirbel.py \\
      --out gridlock/packages/client/src/assets/units/feuerwirbel
"""

from __future__ import annotations

import argparse
import math
from pathlib import Path

import numpy as np
from PIL import Image

import render_procedural as rp
from render_procedural import Mesh, render_turntable
from render_apocalypse import cylinder_y, cylinder_z, slab, tube_x

rp.MAT["armor"] = (rp.hex_rgb("#6e6e68"), 0.12, 1.0)
rp.MAT["plate"] = (rp.hex_rgb("#4a4a46"), 0.08, 1.0)
rp.MAT["track"] = (rp.hex_rgb("#26241f"), 0.03, 1.0)
rp.MAT["wheel"] = (rp.hex_rgb("#3c3b36"), 0.15, 1.0)
rp.MAT["barrel"] = (rp.hex_rgb("#55554f"), 0.30, 1.0)
rp.MAT["fuel"] = (rp.hex_rgb("#5a6b3d"), 0.10, 1.0)

# Meters. +x nose, +y left, +z up. Tracks on z = 0. Origin = turret ring centre.
HULL_X0, HULL_X1 = -3.7, 3.0  # rear, nose: the ring sits forward of the hull middle, the tanks need the deck
TRACK_Y0, TRACK_Y1 = 1.1, 1.8  # inner / outer face of each track
DECK_Z = 1.7  # hull roof and turret ring height
TURRET_X = 0.0  # the turret turns on the model origin
TURRET_TOP = 2.55
GUN_Z = 2.2
GUN_Y = 0.42  # each gatling cluster's offset off the centre line
NOZZLE_Z = 1.45
SCALE_FRAC = 0.075  # px per meter / cell px
Z_MID = 1.4
CY_FRAC = 0.6


def track(m: Mesh, s: int) -> None:
    """One track run: stadium profile in x/z lofted across the track width, six road wheels outboard."""
    r = 0.5
    zc = r
    xf, xr = HULL_X1 - 0.5, HULL_X0 + 0.45
    prof: list[tuple[float, float]] = []
    for k in range(9):
        a = -math.pi / 2 + math.pi * k / 8
        prof.append((xf + r * math.cos(a), zc + r * math.sin(a) + (0.2 if a > 0 else 0) * math.sin(a)))
    for k in range(9):
        a = math.pi / 2 + math.pi * k / 8
        prof.append((xr + r * math.cos(a), zc + r * math.sin(a) + (0.2 if a < math.pi else 0) * math.sin(a)))
    rings = [[np.array([x, s * yy, z]) for x, z in prof] for yy in (TRACK_Y0, TRACK_Y1)]
    m.loft(rings, "track")
    out = s * (TRACK_Y1 + 0.02)
    for i in range(6):
        x = xr + 0.25 + i * (xf - xr - 0.5) / 5
        cylinder_y(m, x, 0.45, 0.38, out - 0.06 * s, out, "wheel")
    cylinder_y(m, xf + 0.1, 0.66, 0.4, out - 0.08 * s, out + 0.02 * s, "plate")


def fuel_tank(m: Mesh, y: float) -> None:
    """One armored fuel cylinder lying fore and aft on the engine deck, banded in hazard orange."""
    r = 0.36
    z = DECK_Z + r + 0.04
    x0, x1 = HULL_X0 + 0.2, HULL_X0 + 2.15
    tube_x(m, x0, x1, y, z, r, "fuel", 12)
    for xb in (x0 + 0.35, x1 - 0.35):
        tube_x(m, xb - 0.09, xb + 0.09, y, z, r + 0.03, "sock", 12)
    # Saddle straps down to the deck.
    for xb in (x0 + 0.75, x1 - 0.75):
        m.box((xb - 0.05, y - r - 0.05, DECK_Z), (xb + 0.05, y + r + 0.05, z + r + 0.02), "plate")


def build_hull() -> Mesh:
    m = Mesh()
    w = TRACK_Y1 + 0.1
    for s in (-1, 1):
        track(m, s)
        lo = TRACK_Y1 + 0.03
        m.box((HULL_X0 + 0.2, min(s * lo, s * (lo + 0.1)), 0.68), (HULL_X1 - 0.4, max(s * lo, s * (lo + 0.1)), 1.15), "armor")
    # Lower tub and the sloped lower nose.
    m.box((HULL_X0 + 0.1, -TRACK_Y0, 0.35), (HULL_X1 - 0.8, TRACK_Y0, 1.1), "plate")
    slab(m, [(HULL_X1 - 0.8, -TRACK_Y0), (HULL_X1 - 0.35, -TRACK_Y0), (HULL_X1 - 0.35, TRACK_Y0), (HULL_X1 - 0.8, TRACK_Y0)], 0.35, 1.1,
         [(HULL_X1 - 0.8, -TRACK_Y0), (HULL_X1 + 0.05, -TRACK_Y0), (HULL_X1 + 0.05, TRACK_Y0), (HULL_X1 - 0.8, TRACK_Y0)], "plate")
    # Upper hull, a long glacis to the front.
    slab(m, [(HULL_X0, -w), (HULL_X1 + 0.05, -w), (HULL_X1 + 0.05, w), (HULL_X0, w)], 1.1, DECK_Z,
         [(HULL_X0 + 0.05, -w + 0.15), (HULL_X1 - 1.1, -w + 0.15), (HULL_X1 - 1.1, w - 0.15), (HULL_X0 + 0.05, w - 0.15)], "armor")
    # The flame projector: a ball mount in the glacis, a stubby armored tube, an orange igniter at the tip.
    bx = HULL_X1 - 0.55
    cylinder_y(m, bx, NOZZLE_Z, 0.42, -0.42, 0.42, "plate", 12)
    tube_x(m, bx, HULL_X1 + 0.6, 0.0, NOZZLE_Z, 0.22, "barrel", 10)
    tube_x(m, HULL_X1 + 0.4, HULL_X1 + 0.8, 0.0, NOZZLE_Z, 0.28, "plate", 10)
    tube_x(m, HULL_X1 + 0.8, HULL_X1 + 0.95, 0.0, NOZZLE_Z, 0.17, "sock", 10)
    # Fuel tanks on the engine deck and the feed pipe forward along the left of the deck.
    for s in (-1, 1):
        fuel_tank(m, s * 0.72)
    tube_x(m, HULL_X0 + 2.1, HULL_X1 - 1.3, 1.25, DECK_Z + 0.08, 0.07, "wheel", 6)
    # Exhausts at the tail.
    for s in (-1, 1):
        cylinder_y(m, HULL_X0 - 0.05, 1.4, 0.14, s * 1.15 - 0.2, s * 1.15 + 0.2, "wheel", 8)
    # Neutral team stripe across the tail, headlight covers on the front corners.
    m.box((HULL_X0 + 0.05, -w + 0.25, DECK_Z - 0.02), (HULL_X0 + 0.18, w - 0.25, DECK_Z + 0.05), "team")
    for s in (-1, 1):
        m.box((HULL_X1 - 0.95, s * (w - 0.4) - 0.13, DECK_Z - 0.2), (HULL_X1 - 0.72, s * (w - 0.4) + 0.13, DECK_Z - 0.03), "hazard")
    # Turret ring, left empty for the turret sheet.
    cylinder_z(m, TURRET_X, 0.0, 1.2, DECK_Z, DECK_Z + 0.07, "wheel", 24)
    return m


def gatling(m: Mesh, y: float) -> None:
    """Six barrels round a spindle, a breech housing behind and two clamps along them."""
    x0, x1 = TURRET_X + 1.25, TURRET_X + 3.65
    m.box((TURRET_X + 0.8, y - 0.22, GUN_Z - 0.22), (x0 + 0.1, y + 0.22, GUN_Z + 0.22), "plate")
    for k in range(6):
        a = 2 * math.pi * k / 6
        tube_x(m, x0, x1, y + 0.13 * math.cos(a), GUN_Z + 0.13 * math.sin(a), 0.065, "barrel", 6)
    for xc in (x0 + 0.5, x1 - 0.18):
        tube_x(m, xc - 0.07, xc + 0.07, y, GUN_Z, 0.22, "plate", 10)


def build_turret() -> Mesh:
    m = Mesh()
    z0 = DECK_Z + 0.05
    tx = TURRET_X
    bottom = [(tx + 1.25, -0.8), (tx + 1.25, 0.8), (tx + 0.75, 1.3), (tx - 1.15, 1.3), (tx - 1.6, 0.85), (tx - 1.6, -0.85), (tx - 1.15, -1.3), (tx + 0.75, -1.3)]
    top = [(tx + 0.9, -0.62), (tx + 0.9, 0.62), (tx + 0.5, 1.05), (tx - 1.0, 1.05), (tx - 1.35, 0.68), (tx - 1.35, -0.68), (tx - 1.0, -1.05), (tx + 0.5, -1.05)]
    slab(m, bottom, z0, TURRET_TOP, top, "armor")
    # Gun cradle across the face carries both clusters.
    m.box((tx + 0.95, -0.78, GUN_Z - 0.3), (tx + 1.4, 0.78, GUN_Z + 0.3), "plate")
    for s in (-1, 1):
        gatling(m, s * GUN_Y)
        # Ammo box on each cheek, belts feeding in.
        m.box((tx - 0.7, s * 1.3 - 0.2 * (s > 0) - 0.0, z0 + 0.15), (tx + 0.55, s * 1.3 + 0.2 * (s < 0) + 0.0, TURRET_TOP - 0.2), "plate")
    # Commander's cupola on the left rear, a periscope on the right, team plate on the back face.
    cylinder_z(m, tx - 0.75, 0.5, 0.32, TURRET_TOP, TURRET_TOP + 0.22, "plate", 12)
    m.box((tx - 0.5, -0.75, TURRET_TOP), (tx - 0.25, -0.5, TURRET_TOP + 0.18), "plate")
    m.box((tx - 1.66, -0.6, 2.0), (tx - 1.6, 0.6, 2.3), "team")
    return m


# Cameo: 3/4 front (nose right, a little down) shows the twin gatlings and the projector.
CAMEO_FACE = "0014"
CAMEO_GAIN = 1.3
CAMEO_LIFT = 0.03
LAYERS = ("hull", "turret")


def cameo(out: Path, face: str = CAMEO_FACE) -> None:
    img = Image.open(out / "hull" / f"{face}.png").convert("RGBA")
    img.alpha_composite(Image.open(out / "turret" / f"{face}.png").convert("RGBA"))
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
    path = out.parent / "feuerwirbel-cameo.png"
    canvas.save(path)
    print("wrote", path)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True, help="unit folder; writes hull/ and turret/ inside it")
    ap.add_argument("--ss", type=int, default=4)
    args = ap.parse_args()
    out = Path(args.out)
    common = dict(scale_frac=SCALE_FRAC, z_mid=Z_MID, cy_frac=CY_FRAC, ss=args.ss)
    for name, build in zip(LAYERS, (build_hull, build_turret)):
        render_turntable(build(), out / name, f"feuerwirbel_{name}", f"feuerwirbel-{name}.json", **common)
    cameo(out)


if __name__ == "__main__":
    main()
