#!/usr/bin/env python3
"""Jagdtiger: heavy casemate tank destroyer, two 16-face layers from one camera.

Same numpy rasterizer, camera, and outline as render_apocalypse.py. Both layers
are passes of one locked camera with one scale and one origin, so the client
composes them with one transform (like the StuG's hull / gun). The gun does not
traverse on its own; it is a separate layer only so it can recoil.
0001 = nose screen-south, then clockwise 22.5° through 0016.

  hull   long tracked hull, sloped glacis, a tall boxed casemate set well back
         with a thick sloped face and the box mantlet. No barrel on the hull.
  gun    the long 128mm barrel, no muzzle brake, out past the nose.

Chassis is the neutral gray the game tints (like the Tiger). No insignia.

  python tools/sprites/render_jagdtiger.py \\
      --out gridlock/packages/client/src/assets/units/jagdtiger
"""

from __future__ import annotations

import argparse
import math
from pathlib import Path

import numpy as np
from PIL import Image

import render_procedural as rp
from render_procedural import Mesh, render_turntable
from render_apocalypse import cylinder_y, slab, tube_x

rp.MAT["armor"] = (rp.hex_rgb("#6e6e68"), 0.12, 1.0)
rp.MAT["plate"] = (rp.hex_rgb("#4a4a46"), 0.08, 1.0)
rp.MAT["track"] = (rp.hex_rgb("#26241f"), 0.03, 1.0)
rp.MAT["wheel"] = (rp.hex_rgb("#3c3b36"), 0.15, 1.0)
rp.MAT["barrel"] = (rp.hex_rgb("#55554f"), 0.30, 1.0)

# Meters. +x nose, +y left, +z up. Tracks on z = 0. Origin = hull centre.
HULL_X0, HULL_X1 = -3.7, 3.7  # rear, nose
TRACK_Y0, TRACK_Y1 = 1.05, 1.8  # inner / outer face of each track
DECK_Z = 1.75  # hull roof
CASE_X0, CASE_X1 = -3.55, 0.95  # casemate rear, foot of its front plate
CASE_TOP = 2.95
GUN_X0 = 1.15  # barrel root, inside the mantlet
GUN_Z = 2.25
SCALE_FRAC = 0.06  # px per meter / cell px: the long barrel at east fits the cell
Z_MID = 1.5
CY_FRAC = 0.6


def track(m: Mesh, s: int) -> None:
    """One track run: stadium profile in x/z lofted across the track width, nine interleaved road wheels."""
    r = 0.5
    zc = r
    xf, xr = HULL_X1 - 0.5, HULL_X0 + 0.45
    prof: list[tuple[float, float]] = []
    for k in range(9):
        a = -math.pi / 2 + math.pi * k / 8
        prof.append((xf + r * math.cos(a), zc + r * math.sin(a) + (0.22 if a > 0 else 0) * math.sin(a)))
    for k in range(9):
        a = math.pi / 2 + math.pi * k / 8
        prof.append((xr + r * math.cos(a), zc + r * math.sin(a) + (0.22 if a < math.pi else 0) * math.sin(a)))
    rings = [[np.array([x, s * yy, z]) for x, z in prof] for yy in (TRACK_Y0, TRACK_Y1)]
    m.loft(rings, "track")
    out = s * (TRACK_Y1 + 0.02)
    for i in range(9):
        x = xr + 0.2 + i * (xf - xr - 0.4) / 8
        cylinder_y(m, x, 0.45, 0.36, out - 0.06 * s, out, "wheel")
    cylinder_y(m, xf + 0.1, 0.68, 0.4, out - 0.08 * s, out + 0.02 * s, "plate")


def build_hull() -> Mesh:
    m = Mesh()
    w = TRACK_Y1 + 0.1
    for s in (-1, 1):
        track(m, s)
        # Side skirt over the upper run.
        lo = TRACK_Y1 + 0.03
        m.box((HULL_X0 + 0.2, min(s * lo, s * (lo + 0.1)), 0.7), (HULL_X1 - 0.4, max(s * lo, s * (lo + 0.1)), 1.2), "armor")
    # Lower tub and the sloped lower nose.
    m.box((HULL_X0 + 0.1, -TRACK_Y0, 0.35), (HULL_X1 - 0.8, TRACK_Y0, 1.15), "plate")
    slab(m, [(HULL_X1 - 0.8, -TRACK_Y0), (HULL_X1 - 0.35, -TRACK_Y0), (HULL_X1 - 0.35, TRACK_Y0), (HULL_X1 - 0.8, TRACK_Y0)], 0.35, 1.15,
         [(HULL_X1 - 0.8, -TRACK_Y0), (HULL_X1 + 0.05, -TRACK_Y0), (HULL_X1 + 0.05, TRACK_Y0), (HULL_X1 - 0.8, TRACK_Y0)], "plate")
    # Upper hull over the tracks, a steep glacis to the front.
    slab(m, [(HULL_X0, -w), (HULL_X1 + 0.05, -w), (HULL_X1 + 0.05, w), (HULL_X0, w)], 1.15, DECK_Z,
         [(HULL_X0 + 0.05, -w + 0.1), (HULL_X1 - 0.7, -w + 0.1), (HULL_X1 - 0.7, w - 0.1), (HULL_X0 + 0.05, w - 0.1)], "armor")
    # The casemate: full hull width, slightly tumbled-in sides, a sloped thick face.
    cw = w - 0.1
    slab(m, [(CASE_X0, -cw), (CASE_X1, -cw), (CASE_X1, cw), (CASE_X0, cw)], DECK_Z, CASE_TOP,
         [(CASE_X0 + 0.1, -cw + 0.2), (CASE_X1 - 0.55, -cw + 0.2), (CASE_X1 - 0.55, cw - 0.2), (CASE_X0 + 0.1, cw - 0.2)], "armor")
    # Box mantlet on the casemate face, the barrel root sits in it.
    m.box((CASE_X1 - 0.4, -0.55, GUN_Z - 0.42), (CASE_X1 + 0.25, 0.55, GUN_Z + 0.42), "plate")
    # Roof: commander's hatch block and a periscope, engine grilles behind the casemate.
    m.box((CASE_X0 + 0.7, 0.55, CASE_TOP), (CASE_X0 + 1.4, 1.2, CASE_TOP + 0.14), "plate")
    m.box((CASE_X0 + 2.4, -1.0, CASE_TOP), (CASE_X0 + 2.7, -0.7, CASE_TOP + 0.22), "plate")
    m.box((CASE_X0 + 0.5, -1.15, CASE_TOP), (CASE_X0 + 1.3, -0.45, CASE_TOP + 0.07), "plate")
    # Neutral team stripe across the casemate roof, rear edge.
    m.box((CASE_X0 + 0.15, -cw + 0.35, CASE_TOP), (CASE_X0 + 0.38, cw - 0.35, CASE_TOP + 0.06), "team")
    # Exhausts on the tail, spare track links and a travel lock on the glacis.
    for s in (-1, 1):
        cylinder_y(m, HULL_X0 - 0.05, 1.45, 0.15, s * 0.9 - 0.22, s * 0.9 + 0.22, "wheel", 8)
        m.box((HULL_X1 - 0.95, s * (w - 0.4) - 0.13, DECK_Z - 0.2), (HULL_X1 - 0.72, s * (w - 0.4) + 0.13, DECK_Z - 0.03), "hazard")
    m.box((HULL_X1 - 0.6, -0.25, 1.62), (HULL_X1 - 0.4, 0.25, 2.05), "plate")
    return m


def build_gun() -> Mesh:
    m = Mesh()
    tube_x(m, GUN_X0, 2.6, 0.0, GUN_Z, 0.22, "barrel")  # thick recoil sleeve
    tube_x(m, 2.6, 7.4, 0.0, GUN_Z, 0.15, "barrel")
    tube_x(m, 7.25, 7.5, 0.0, GUN_Z, 0.18, "barrel")  # muzzle swell
    return m


# Cameo: 3/4 front (nose right, a little down) shows the casemate face and the long barrel.
CAMEO_FACE = "0014"
CAMEO_GAIN = 1.3
CAMEO_LIFT = 0.03
LAYERS = ("hull", "gun")


def cameo(out: Path, face: str = CAMEO_FACE) -> None:
    img = Image.open(out / "hull" / f"{face}.png").convert("RGBA")
    img.alpha_composite(Image.open(out / "gun" / f"{face}.png").convert("RGBA"))
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
    path = out.parent / "jagdtiger-cameo.png"
    canvas.save(path)
    print("wrote", path)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True, help="unit folder; writes hull/ and gun/ inside it")
    ap.add_argument("--ss", type=int, default=4)
    args = ap.parse_args()
    out = Path(args.out)
    common = dict(scale_frac=SCALE_FRAC, z_mid=Z_MID, cy_frac=CY_FRAC, ss=args.ss)
    for name, build in zip(LAYERS, (build_hull, build_gun)):
        render_turntable(build(), out / name, f"jagdtiger_{name}", f"jagdtiger-{name}.json", **common)
    cameo(out)


if __name__ == "__main__":
    main()
