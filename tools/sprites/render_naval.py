#!/usr/bin/env python3
"""Naval hulls: the Attack Boat and the Submarine, and the Marine Base they come from.

Same numpy rasterizer, camera (orthographic, 30° down, 2:1 ground), light,
splinter camo, and outline as render_procedural.py and render_mammoth.py.

  gunboat    a fast motor gunboat: a hard-chined planing hull with a raised
             bow, a low wheelhouse with a gray team-tint roof, a shielded
             20mm cannon on the foredeck, and a twin MG ring aft. Cut at the
             waterline over a small foam wake.
  submarine  a small coastal boat running awash: only the deck casing, the
             conning tower with its gray team-tint band, the periscope and
             the deck gun stand clear of the water. Same waterline cut.

Row 0 = bow screen-south, then clockwise 22.5° through row 15. No insignia.

  python tools/sprites/render_naval.py gunboat \\
      --out gridlock/packages/client/src/assets/units/gunboat/hull
  python tools/sprites/render_naval.py submarine \\
      --out gridlock/packages/client/src/assets/units/submarine/hull
"""

from __future__ import annotations

import argparse
import math
from pathlib import Path

import numpy as np
from PIL import Image

from render_procedural import Mesh, ellipse_ring, render_turntable


def cyl(m: Mesh, c: tuple[float, float, float], axis: int, r: float, h: float, mat: str, n: int = 12) -> None:
    """Capped cylinder centred on `c`, running `h` along model axis 0 (x), 1 (y) or 2 (z)."""
    u, w = [i for i in range(3) if i != axis]
    rings = []
    for t in (-h / 2, h / 2):
        ring_ = []
        for k in range(n):
            p = np.array(c, dtype=np.float64)
            p[axis] += t
            p[u] += r * math.cos(2 * math.pi * k / n)
            p[w] += r * math.sin(2 * math.pi * k / n)
            ring_.append(p)
        rings.append(ring_)
    m.loft(rings, mat)


def ellipse(m: Mesh, z: float, cx: float, cy: float, rx: float, ry: float, mat: str, n: int = 40) -> None:
    center = m.v((cx, cy, z))
    rim = [m.v((cx + rx * math.cos(2 * math.pi * k / n), cy + ry * math.sin(2 * math.pi * k / n), z)) for k in range(n)]
    for k in range(n):
        m.tri(center, rim[k], rim[(k + 1) % n], mat)


def ring(m: Mesh, z: float, cx: float, cy: float, rx0: float, ry0: float, rx1: float, ry1: float, mat: str, n: int = 40) -> None:
    inner = [m.v((cx + rx0 * math.cos(2 * math.pi * k / n), cy + ry0 * math.sin(2 * math.pi * k / n), z)) for k in range(n)]
    outer = [m.v((cx + rx1 * math.cos(2 * math.pi * k / n), cy + ry1 * math.sin(2 * math.pi * k / n), z)) for k in range(n)]
    for k in range(n):
        j = (k + 1) % n
        m.quad(inner[k], outer[k], outer[j], inner[j], mat)


def hull_ring(x: float, half_beam: float, deck_z: float, keel_z: float, chine: float = 0.55) -> list[np.ndarray]:
    """Hard-chined boat section, port to starboard over the deck and back under the keel."""
    cz = keel_z + (deck_z - keel_z) * chine
    hb = half_beam
    return [
        np.array([x, hb * 0.86, deck_z]),
        np.array([x, 0.0, deck_z + 0.06]),
        np.array([x, -hb * 0.86, deck_z]),
        np.array([x, -hb, cz]),
        np.array([x, -hb * 0.45, keel_z + (cz - keel_z) * 0.35]),
        np.array([x, 0.0, keel_z]),
        np.array([x, hb * 0.45, keel_z + (cz - keel_z) * 0.35]),
        np.array([x, hb, cz]),
    ]


def build_wake(length: float, beam: float, cx: float = 0.0) -> Mesh:
    """Dark water patch with a foam lip round the hull at the waterline."""
    m = Mesh()
    ellipse(m, 0.02, cx, 0.0, length, beam, "water")
    ring(m, 0.05, cx, 0.0, length * 0.86, beam * 0.78, length * 0.98, beam * 0.95, "foam")
    return m


def build_gunboat() -> Mesh:
    """Motor gunboat in meters. +x bow, +y port, +z up. Waterline at z=0."""
    m = Mesh()
    keel = -0.7
    stations = [
        (6.2, 0.08, 1.35, keel + 1.2),
        (5.4, 0.85, 1.25, keel + 0.5),
        (3.8, 1.45, 1.05, keel + 0.1),
        (1.0, 1.65, 0.95, keel),
        (-3.0, 1.65, 0.9, keel),
        (-5.6, 1.5, 0.9, keel + 0.05),
    ]
    rings = [hull_ring(x, hb, dz, kz) for x, hb, dz, kz in stations]

    def hull_mat(r: int, s: int) -> str:
        if s in (0, 1):
            return "frame"  # deck planking reads darker than the topsides
        return "camo"

    m.loft(rings, hull_mat)
    deck = 0.92
    # Wheelhouse: sloped front, gray team-tint roof, a strip of glazing.
    m.box((-1.6, -0.95, deck), (0.9, 0.95, deck + 1.0), "camo")
    m.box((0.9, -0.85, deck), (1.25, 0.85, deck + 0.8), "camo")
    m.box((0.92, -0.78, deck + 0.55), (1.27, 0.78, deck + 0.8), "glass")
    m.box((-1.7, -1.02, deck + 1.0), (1.0, 1.02, deck + 1.14), "team")
    cyl(m, (-0.9, 0.0, deck + 1.55), 2, 0.05, 0.85, "metal", 6)  # mast
    m.box((-0.95, -0.35, deck + 1.75), (-0.85, 0.35, deck + 1.82), "metal")  # yard
    # Foredeck 20mm: pedestal, curved shield, long barrel.
    gx = 3.0
    cyl(m, (gx, 0.0, deck + 0.25), 2, 0.38, 0.5, "metal", 12)
    m.box((gx - 0.15, -0.55, deck + 0.4), (gx + 0.2, 0.55, deck + 1.0), "camo")
    cyl(m, (gx + 1.05, 0.0, deck + 0.75), 0, 0.07, 1.8, "metal", 8)
    # Aft twin MG on a ring mount.
    ax = -3.6
    cyl(m, (ax, 0.0, deck + 0.18), 2, 0.5, 0.36, "metal", 14)
    for oy in (-0.12, 0.12):
        cyl(m, (ax + 0.55, oy, deck + 0.5), 0, 0.045, 1.0, "metal", 6)
    # Rail of depth charges on the stern, hazard caps.
    for oy in (-1.1, 1.1):
        for k in range(3):
            cyl(m, (-5.0 + k * 0.42, oy, deck + 0.22), 1, 0.18, 0.32, "bomb", 10)
    return m


def build_submarine() -> Mesh:
    """Small coastal submarine running awash, meters. +x bow, +y port, +z up. Waterline at z=0."""
    m = Mesh()
    zc = -0.55  # pressure-hull axis sits just under the water
    stations = [(11.5, 0.05), (10.6, 0.65), (8.5, 1.15), (4.0, 1.35), (-4.0, 1.35), (-8.5, 0.95), (-10.8, 0.45), (-11.6, 0.08)]
    hull = [ellipse_ring(x, 0.0, zc, r, r, 18) for x, r in stations]
    m.loft(hull, "camo")
    # Flat deck casing along the top, just clear of the water.
    casing = [
        [np.array([x, hw, 0.95]), np.array([x, -hw, 0.95]), np.array([x, -hw * 1.1, 0.35]), np.array([x, hw * 1.1, 0.35])]
        for x, hw in ((10.2, 0.12), (8.6, 0.55), (-7.5, 0.55), (-9.8, 0.12))
    ]
    m.loft(casing, lambda r, s: "frame" if s == 0 else "camo")
    # Conning tower: a stack of plan-view outlines rising from the casing, a gray
    # team band near the top, an open bridge.
    sail = []
    plan =[(2.4, 0.0), (1.8, 0.75), (0.0, 0.95), (-1.8, 0.9), (-2.6, 0.0), (-1.8, -0.9), (0.0, -0.95), (1.8, -0.75)]
    levels = [(0.9, 1.0), (1.9, 0.92), (2.05, 0.9), (2.35, 0.88)]
    for z, k in levels:
        sail.append([np.array([x * k, y * k, z]) for x, y in plan])

    def sail_mat(r: int, s: int) -> str:
        return "team" if r == 1 else "camo"

    m.loft(sail, sail_mat)
    m.box((-1.4, -0.55, 2.3), (1.2, 0.55, 2.34), "frame")  # bridge floor
    cyl(m, (-0.6, 0.0, 3.1), 2, 0.07, 1.6, "metal", 6)  # periscope
    cyl(m, (-1.2, 0.0, 2.85), 2, 0.05, 1.1, "metal", 6)  # snorkel / mast
    # Deck gun forward of the tower.
    cyl(m, (4.4, 0.0, 1.15), 2, 0.3, 0.4, "metal", 10)
    m.box((4.25, -0.32, 1.25), (4.6, 0.32, 1.65), "camo")
    cyl(m, (5.25, 0.0, 1.5), 0, 0.07, 1.5, "metal", 8)
    return m


# One meters -> px rule for both hulls, so the boat and the sub keep their relative size.
NAVAL_SCALE = 0.054
NAVAL_Z_MID = 0.6


def render_gunboat(out: Path, cell: int = 256, ss: int = 4) -> None:
    render_turntable(
        build_gunboat(), out, "gunboat_hull", "gunboat-hull.json", NAVAL_SCALE, NAVAL_Z_MID,
        cy_frac=0.56, cell=cell, ss=ss, clip_z=0.0, underlay=build_wake(7.6, 2.4, -0.4),
    )
    write_cameo(out, out.parent.parent / "gunboat-cameo.png")


def render_submarine(out: Path, cell: int = 256, ss: int = 4) -> None:
    render_turntable(
        build_submarine(), out, "submarine_hull", "submarine-hull.json", NAVAL_SCALE, NAVAL_Z_MID,
        cy_frac=0.56, cell=cell, ss=ss, clip_z=0.0, underlay=build_wake(12.6, 1.9),
    )
    write_cameo(out, out.parent.parent / "submarine-cameo.png")


def write_cameo(faces: Path, path: Path) -> None:
    """72x72 cameo from the south-east face."""
    face = Image.open(faces / "0015.png").convert("RGBA")
    crop = face.crop(face.getbbox())
    fit = min(66 / crop.width, 66 / crop.height)
    small = crop.resize((max(1, round(crop.width * fit)), max(1, round(crop.height * fit))), Image.Resampling.LANCZOS)
    cameo = Image.new("RGBA", (72, 72), (0, 0, 0, 0))
    cameo.alpha_composite(small, ((72 - small.width) // 2, (72 - small.height) // 2))
    cameo.save(path)
    print("wrote", path)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("what", choices=["gunboat", "submarine"])
    ap.add_argument("--out", required=True)
    args = ap.parse_args()
    if args.what == "gunboat":
        render_gunboat(Path(args.out))
    else:
        render_submarine(Path(args.out))


if __name__ == "__main__":
    main()
