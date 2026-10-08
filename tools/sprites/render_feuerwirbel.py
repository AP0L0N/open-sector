#!/usr/bin/env python3
"""Feuerwirbel: flame tank with two CIWS mounts, two 16-face layers from one camera.

Same numpy rasterizer, camera, and outline as render_apocalypse.py and
render_jagdtiger.py. Both layers are passes of one locked camera with one scale
and one origin, so the client composes them with one transform.

The mount layer is rendered with its pivot on the model origin. The client
draws it twice, each with its own facing row, at the screen point its pivot
(MOUNT_X along the keel) projects to on the hull row being shown, like the
Battle Ship's CIWS (render/feuerwirbel-mounts.ts mirrors these numbers).
0001 = nose screen-south, then clockwise 22.5° through 0016.

  hull     medium tracked hull, sloped glacis, side skirts. The flame projector
           sits fixed in a ball mount on the glacis and only fires where the
           nose points. Two armored fuel tanks with hazard bands ride the
           engine deck, a feed pipe runs forward. A low armored deckhouse
           carries two empty mount rings, one fore and one aft.
  ciws     one close-in weapon mount, the CIWS pad's gun at tank size: ring,
           yoke, gun body with a drum behind, a six-barrel cluster, and the
           white radome can on top. Points +x, traverses on its own facing.

Chassis is the neutral gray the game tints (like the Tiger). No insignia.

  python tools/sprites/render_feuerwirbel.py \\
      --out gridlock/packages/client/src/assets/units/feuerwirbel
"""

from __future__ import annotations

import argparse
import math
import tempfile
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
rp.MAT["radome"] = (rp.hex_rgb("#d8d4c4"), 0.25, 1.0)

# Meters. +x nose, +y left, +z up. Tracks on z = 0. Origin = the unit's centre point.
HULL_X0, HULL_X1 = -3.7, 3.0  # rear, nose
TRACK_Y0, TRACK_Y1 = 1.1, 1.8  # inner / outer face of each track
DECK_Z = 1.7  # hull roof
HOUSE_X0, HOUSE_X1 = -1.75, 1.65  # the deckhouse under the mounts
HOUSE_Z = 2.0  # deckhouse roof: both mount rings sit on it
MOUNT_X = (0.9, -1.0)  # fore mount, aft mount, along the keel
MOUNT_K = 1.3  # the mount is drawn a size up so the radome and the barrels read at game zoom
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
    x0, x1 = HULL_X0 + 0.2, HULL_X0 + 1.85
    tube_x(m, x0, x1, y, z, r, "fuel", 12)
    for xb in (x0 + 0.3, x1 - 0.3):
        tube_x(m, xb - 0.09, xb + 0.09, y, z, r + 0.03, "sock", 12)
    # Saddle straps down to the deck.
    for xb in (x0 + 0.65, x1 - 0.65):
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
        fuel_tank(m, s * 0.8)
    tube_x(m, HULL_X0 + 1.8, HULL_X1 - 1.3, 1.45, DECK_Z + 0.08, 0.07, "wheel", 6)
    # The deckhouse: a low armored box with sloped sides; a hatch on its flank.
    hw = 1.2
    slab(m, [(HOUSE_X0, -hw), (HOUSE_X1, -hw), (HOUSE_X1, hw), (HOUSE_X0, hw)], DECK_Z, HOUSE_Z,
         [(HOUSE_X0 + 0.12, -hw + 0.15), (HOUSE_X1 - 0.3, -hw + 0.15), (HOUSE_X1 - 0.3, hw - 0.15), (HOUSE_X0 + 0.12, hw - 0.15)], "armor")
    m.box((-0.35, hw - 0.18, HOUSE_Z), (0.25, hw - 0.02, HOUSE_Z + 0.08), "plate")
    # Two empty mount rings on the roof, left for the mount sheet.
    for x in MOUNT_X:
        cylinder_z(m, x, 0.0, 0.62 * MOUNT_K, HOUSE_Z, HOUSE_Z + 0.06, "wheel", 20)
    # Exhausts at the tail.
    for s in (-1, 1):
        cylinder_y(m, HULL_X0 - 0.05, 1.4, 0.14, s * 1.15 - 0.2, s * 1.15 + 0.2, "wheel", 8)
    # Neutral team stripe across the tail, headlight covers on the front corners.
    m.box((HULL_X0 + 0.05, -w + 0.25, DECK_Z - 0.02), (HULL_X0 + 0.18, w - 0.25, DECK_Z + 0.05), "team")
    for s in (-1, 1):
        m.box((HULL_X1 - 0.95, s * (w - 0.4) - 0.13, DECK_Z - 0.2), (HULL_X1 - 0.72, s * (w - 0.4) + 0.13, DECK_Z - 0.03), "hazard")
    return m


def build_ciws(x0: float = 0.0) -> Mesh:
    """One mount with its pivot at (x0, 0), standing on the deckhouse roof, barrels along +x."""
    m = Mesh()
    k = MOUNT_K
    z = HOUSE_Z + 0.04

    def X(x: float) -> float:
        return x0 + x * k

    cylinder_z(m, x0, 0.0, 0.5 * k, z, z + 0.12 * k, "team", 16)  # traverse ring, team-tint gray
    for s in (-1, 1):  # yoke arms
        m.box((X(-0.22), s * 0.27 * k - 0.07 * k, z + 0.12 * k), (X(0.22), s * 0.27 * k + 0.07 * k, z + 0.75 * k), "plate")
    gz = z + 0.48 * k
    m.box((X(-0.38), -0.22 * k, z + 0.3 * k), (X(0.32), 0.22 * k, z + 0.66 * k), "armor")  # gun body
    tube_x(m, X(-0.64), X(-0.36), 0.0, z + 0.4 * k, 0.24 * k, "fuel", 12)  # ammo drum behind
    tube_x(m, X(0.32), X(0.58), 0.0, gz, 0.19 * k, "plate", 10)  # barrel shroud
    for i in range(6):  # six barrels round the spindle
        a = 2 * math.pi * i / 6
        tube_x(m, X(0.56), X(1.45), 0.1 * k * math.cos(a), gz + 0.1 * k * math.sin(a), 0.055 * k, "barrel", 6)
    tube_x(m, X(1.36), X(1.48), 0.0, gz, 0.15 * k, "plate", 10)  # muzzle clamp
    # The radome can on top, a tapered cap, and the fire-control box behind it.
    cylinder_z(m, x0 - 0.05 * k, 0.0, 0.33 * k, z + 0.66 * k, z + 1.18 * k, "radome", 14)
    cylinder_z(m, x0 - 0.05 * k, 0.0, 0.24 * k, z + 1.18 * k, z + 1.3 * k, "radome", 14)
    m.box((X(-0.46), -0.12 * k, z + 0.72 * k), (X(-0.36), 0.12 * k, z + 0.98 * k), "plate")
    return m


def build_assembled() -> Mesh:
    """Hull with both mounts laid forward: the cameo."""
    m = build_hull()
    for x in MOUNT_X:
        part = build_ciws(x)
        base = len(m.verts)
        m.verts.extend(part.verts)
        m.tris.extend((a + base, b + base, c + base, mat) for a, b, c, mat in part.tris)
    return m


# Cameo: 3/4 front (nose right, a little down) shows both mounts and the projector.
CAMEO_FACE = "0014"
CAMEO_GAIN = 1.3
CAMEO_LIFT = 0.03
LAYERS = ("hull", "ciws")


def cameo(src: Path, path: Path, face: str = CAMEO_FACE) -> None:
    img = Image.open(src / f"{face}.png").convert("RGBA")
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
    canvas.save(path)
    print("wrote", path)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True, help="unit folder; writes hull/ and ciws/ inside it")
    ap.add_argument("--ss", type=int, default=4)
    args = ap.parse_args()
    out = Path(args.out)
    common = dict(scale_frac=SCALE_FRAC, z_mid=Z_MID, cy_frac=CY_FRAC, ss=args.ss)
    for name, build in zip(LAYERS, (build_hull, build_ciws)):
        render_turntable(build(), out / name, f"feuerwirbel_{name}", f"feuerwirbel-{name}.json", **common)
    with tempfile.TemporaryDirectory() as tmp:
        render_turntable(build_assembled(), Path(tmp) / "faces", "feuerwirbel_cameo", "cameo.json", **common)
        cameo(Path(tmp) / "faces", out.parent / "feuerwirbel-cameo.png")


if __name__ == "__main__":
    main()
