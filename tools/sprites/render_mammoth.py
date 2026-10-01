#!/usr/bin/env python3
"""Mammoth: slow armored battle platform that carries infantry. One 16-face hull sheet.

Same numpy rasterizer, camera, splinter camo, and outline as
render_procedural.py (Stuka, drone) and render_nebelwerfer.py. No turret: the
only gun is a small ball-mounted machine gun in the bow plate.

  hull      a long, wide, low hull on two broad tracks; a raised boat bow so it
            can wade; a tall stepped fighting casemate over the rear two-thirds
            with firing slits on every face, and a gray team-tint roof hatch.
  wade      the same hull sunk to the deck. Tracks and the belly are below the
            pool; the casemate is what looks out. Same camera as the dry faces
            so the client can share one scale and contact.

0001 = nose screen-south, then clockwise 22.5° through 0016. No national insignia.

  python tools/sprites/render_mammoth.py \\
      --out gridlock/packages/client/src/assets/units/mammoth
  python tools/sprites/render_mammoth.py --wade \\
      --out gridlock/packages/client/src/assets/units/mammoth
"""

from __future__ import annotations

import argparse
import math
from pathlib import Path

import numpy as np
from PIL import Image

from render_procedural import Mesh, render_turntable

# Meters. +x nose, +y left, +z up. Tracks on z = 0.
SCALE_FRAC = 0.082  # px per meter / cell px
Z_MID = 1.5
CY_FRAC = 0.6

HULL_L0, HULL_L1 = -3.6, 3.2  # stern / bow of the upper hull
HW = 1.55  # hull half width between the tracks
TRACK_Y = 1.9  # track centre line
TRACK_HALF = 0.5  # track half width
TRACK_R = 0.62  # track end radius
DECK_Z = 1.45


def slab(m: Mesh, bottom: list[tuple[float, float]], z0: float, z1: float, top: list[tuple[float, float]], mat: str, top_mat: str | None = None) -> None:
    """Prism from an x/y outline at z0 to a (smaller) outline at z1: sloped armor. Outlines are convex."""
    bot = [m.v((x, y, z0)) for x, y in bottom]
    tp = [m.v((x, y, z1)) for x, y in top]
    n = len(bot)
    for i in range(n):
        j = (i + 1) % n
        m.quad(bot[i], bot[j], tp[j], tp[i], mat)
    for i in range(1, n - 1):
        m.tri(tp[0], tp[i], tp[i + 1], top_mat or mat)
        m.tri(bot[0], bot[i + 1], bot[i], mat)


def track(m: Mesh, y: float) -> None:
    """A track run as a stadium in the x/z plane, lofted across its width, with a skirt over the top run."""
    x0, x1 = HULL_L0 + 0.2, HULL_L1 - 0.1
    n = 10
    prof: list[np.ndarray] = []
    for k in range(n + 1):  # front wheel, bottom-front to top-front
        a = -math.pi / 2 + math.pi * k / n
        prof.append(np.array([x1 - TRACK_R + TRACK_R * math.cos(a) + 0.25 * max(0.0, math.sin(a)), 0.0, TRACK_R + TRACK_R * math.sin(a)]))
    for k in range(n + 1):  # rear wheel, top-rear to bottom-rear
        a = math.pi / 2 + math.pi * k / n
        prof.append(np.array([x0 + TRACK_R + TRACK_R * math.cos(a), 0.0, TRACK_R + TRACK_R * math.sin(a)]))
    rings = [[p + np.array([0.0, yy, 0.0]) for p in prof] for yy in (y - TRACK_HALF, y + TRACK_HALF)]
    m.loft(rings, "tire")
    # Road wheels showing on the outer face.
    side = y + (TRACK_HALF + 0.02) * (1 if y > 0 else -1)
    for i in range(6):
        cx = x0 + 0.95 + i * (x1 - x0 - 1.9) / 5
        hub = [np.array([cx + 0.34 * math.cos(2 * math.pi * k / 10), side, 0.5 + 0.34 * math.sin(2 * math.pi * k / 10)]) for k in range(10)]
        m.loft([hub, [p + np.array([0, 0.03 * (1 if y > 0 else -1), 0]) for p in hub]], "metal")
    # Armored skirt along the top run.
    o = 1 if y > 0 else -1
    m.box((x0 + 0.1, min(y - TRACK_HALF - 0.08 * (o < 0), y + TRACK_HALF), 0.95), (x1 - 0.05, max(y + TRACK_HALF + 0.08 * (o > 0), y - TRACK_HALF), 1.38), "camo")


def sink(m: Mesh, dz: float) -> None:
    m.verts = [np.asarray(v, dtype=np.float64) + np.array([0.0, 0.0, dz]) for v in m.verts]


def ellipse(m: Mesh, z: float, cx: float, cy: float, rx: float, ry: float, mat: str, n: int = 40) -> list[int]:
    """Flat disc facing up. Returns the rim vertex ids."""
    center = m.v((cx, cy, z))
    rim = [m.v((cx + rx * math.cos(2 * math.pi * k / n), cy + ry * math.sin(2 * math.pi * k / n), z)) for k in range(n)]
    for k in range(n):
        m.tri(center, rim[k], rim[(k + 1) % n], mat)
    return rim


def ring(m: Mesh, z: float, cx: float, cy: float, rx0: float, ry0: float, rx1: float, ry1: float, mat: str, n: int = 40) -> None:
    inner = [m.v((cx + rx0 * math.cos(2 * math.pi * k / n), cy + ry0 * math.sin(2 * math.pi * k / n), z)) for k in range(n)]
    outer = [m.v((cx + rx1 * math.cos(2 * math.pi * k / n), cy + ry1 * math.sin(2 * math.pi * k / n), z)) for k in range(n)]
    for k in range(n):
        j = (k + 1) % n
        m.quad(inner[k], outer[k], outer[j], inner[j], mat)


# Half under. The cut runs through the lower casemate, about halfway up the
# dry side view. Tracks, the belly, and the bow stay in the pool. The roof,
# the upper walls, and the firing slits are what look out.
WADE_Z = DECK_Z + 0.8


def build_pool() -> Mesh:
    """Pool on the contact plane, a little wider than the tracks, with one foam lip."""
    m = Mesh()
    cx, cy = 0.15, 0.0
    rx, ry = 4.05, 2.7
    ellipse(m, 0.03, cx, cy, rx, ry, "water")
    ring(m, 0.08, cx, cy, rx * 0.78, ry * 0.78, rx * 0.92, ry * 0.92, "foam")
    return m


def build_hull() -> Mesh:
    m = Mesh()
    # Lower hull between the tracks, with the raised boat bow for wading.
    m.box((HULL_L0 + 0.2, -HW, 0.35), (HULL_L1 - 0.4, HW, DECK_Z), "metal")
    slab(m, [(HULL_L1 - 0.4, -HW), (HULL_L1 + 0.75, -1.2), (HULL_L1 + 0.75, 1.2), (HULL_L1 - 0.4, HW)], 0.55, DECK_Z + 0.1,
         [(HULL_L1 - 0.4, -HW), (HULL_L1 + 0.35, -1.25), (HULL_L1 + 0.35, 1.25), (HULL_L1 - 0.4, HW)], "camo")
    # Deck plate spanning both tracks.
    m.box((HULL_L0, -(TRACK_Y + TRACK_HALF + 0.1), DECK_Z - 0.08), (HULL_L1 - 0.2, TRACK_Y + TRACK_HALF + 0.1, DECK_Z + 0.08), "camo")
    # Glacis in front of the casemate, sloping down to the bow; the ball MG sits in it.
    slab(m, [(0.4, -1.9), (HULL_L1 - 0.2, -1.9), (HULL_L1 - 0.2, 1.9), (0.4, 1.9)], DECK_Z + 0.08, DECK_Z + 0.55,
         [(0.4, -1.8), (1.4, -1.8), (1.4, 1.8), (0.4, 1.8)], "camo")
    # Stepped fighting casemate over the rear two-thirds: sloped walls, flat roof.
    slab(m, [(-3.45, -2.25), (1.05, -2.25), (1.05, 2.25), (-3.45, 2.25)], DECK_Z + 0.08, DECK_Z + 1.25,
         [(-3.2, -2.0), (0.7, -2.0), (0.7, 2.0), (-3.2, 2.0)], "camo")
    slab(m, [(-3.0, -1.75), (0.45, -1.75), (0.45, 1.75), (-3.0, 1.75)], DECK_Z + 1.25, DECK_Z + 1.6,
         [(-2.85, -1.6), (0.3, -1.6), (0.3, 1.6), (-2.85, 1.6)], "camo", "team")
    # Firing slits: three a side, two front, two rear, dark bars on the sloped walls.
    wall_z = DECK_Z + 0.78
    for s in (-1, 1):
        for i in range(3):
            x = -2.7 + i * 1.25
            m.box((x - 0.3, s * 2.13 - 0.04, wall_z - 0.07), (x + 0.3, s * 2.13 + 0.04, wall_z + 0.07), "tire")
    for s in (-1, 1):
        m.box((0.88, s * 0.9 - 0.35, wall_z - 0.07), (0.96, s * 0.9 + 0.35, wall_z + 0.07), "tire")
        m.box((-3.36, s * 0.9 - 0.35, wall_z - 0.07), (-3.28, s * 0.9 + 0.35, wall_z + 0.07), "tire")
    # Roof hatch rim and vision block.
    m.box((-1.9, -0.55, DECK_Z + 1.6), (-0.8, 0.55, DECK_Z + 1.72), "frame")
    m.box((-0.1, -0.35, DECK_Z + 1.6), (0.25, 0.35, DECK_Z + 1.82), "frame")
    # Bow machine gun: a ball in the glacis and a short barrel.
    ball = [np.array([1.95 + 0.26 * math.cos(2 * math.pi * k / 10), 0.55, DECK_Z + 0.42 + 0.26 * math.sin(2 * math.pi * k / 10)]) for k in range(10)]
    m.loft([[p + np.array([0, -0.25, 0]) for p in ball], [p + np.array([0, -0.85, 0]) for p in ball]], "metal")
    m.box((2.1, -0.36, DECK_Z + 0.38), (2.95, -0.26, DECK_Z + 0.48), "tire")
    # Headlights: hazard-yellow covers so the nose reads at any yaw.
    for s in (-1, 1):
        m.box((HULL_L1 + 0.3, s * 0.95 - 0.16, DECK_Z - 0.12), (HULL_L1 + 0.52, s * 0.95 + 0.16, DECK_Z + 0.05), "hazard")
    # Stern: engine deck grille and exhausts.
    m.box((HULL_L0 - 0.1, -1.2, DECK_Z - 0.4), (HULL_L0 + 0.1, 1.2, DECK_Z + 0.4), "frame")
    for s in (-1, 1):
        m.box((HULL_L0 - 0.2, s * 1.55 - 0.12, DECK_Z + 0.1), (HULL_L0 + 0.05, s * 1.55 + 0.12, DECK_Z + 0.55), "metal")
    for s in (-1, 1):
        track(m, s * TRACK_Y)
    return m


# A 3/4 front view reads the bow, one track, and the slitted casemate.
CAMEO_FACE = "0014"
CAMEO_GAIN = 1.55
CAMEO_LIFT = 0.04


def cameo(out: Path, face: str = CAMEO_FACE, path: Path | None = None) -> None:
    """Static cameo, brightened for the dark sidebar and filling the 128 frame, like the Nebelwerfer's."""
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
    path = path or out.parent / "mammoth-cameo.png"
    img.save(path)
    print("wrote", path)


def render_wade(out: Path, ss: int) -> None:
    """Same camera as the dry hull. The mesh is dropped so the deck sits on the contact plane."""
    hull = build_hull()
    sink(hull, -WADE_Z)
    render_turntable(
        hull,
        out / "wade",
        "mammoth_wade",
        "mammoth-wade.json",
        scale_frac=SCALE_FRAC,
        z_mid=Z_MID,
        cy_frac=CY_FRAC,
        ss=ss,
        clip_z=0.0,
        underlay=build_pool(),
    )


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True, help="unit folder; writes hull/ inside it")
    ap.add_argument("--ss", type=int, default=4)
    ap.add_argument("--cameo-only", action="store_true")
    ap.add_argument("--wade", action="store_true", help="half-sunk water faces only (wade/)")
    args = ap.parse_args()
    out = Path(args.out)
    if args.wade:
        render_wade(out, args.ss)
        return
    if not args.cameo_only:
        render_turntable(build_hull(), out / "hull", "mammoth_hull", "mammoth-hull.json",
                         scale_frac=SCALE_FRAC, z_mid=Z_MID, cy_frac=CY_FRAC, ss=args.ss)
    cameo(out)


if __name__ == "__main__":
    main()
