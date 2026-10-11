#!/usr/bin/env python3
"""Battle Ship: a modern heavy gun ship, two triple turrets forward.

Same numpy rasterizer, camera (orthographic, 30° down, 2:1 ground), light, and
outline as render_naval.py. Modern paint: navy below the sheer line, haze gray
above, dark gray decks.

The ship is four layers that share one camera, scale, and anchor, so the
client can lay them over each other (render/battleship.ts):

  hull    long flush-decked hull cut at the waterline over its wake, the two
          forward faceted barbettes (B superfiring over A), a forward cell
          block, and the fantail with its helicopter pad and the stern CIWS
          pedestal. No turrets.
  super   the island: the faceted bridge tower and fire-control tower with its
          director (the searchlight's base), an enclosed pyramid foremast with
          radar panels, two boxed exhaust stacks, an enclosed mainmast, the aft
          director, vertical launch cell blocks down both sides, remote weapon
          stations in tubs, and the tower the middle CIWS stands on. Drawn on
          its own so a turret can pass in front of it or behind it.
  turret  one triple heavy turret, an angular wedge, on its own pivot (the
          model origin), roof in the gray team tint. Both forward turrets use it.
  ciws    one radar-laid 20mm mount on its own pivot. Both mounts use it.

Model units are 10 m. +x bow, +y port, +z up; waterline at z = 0; the origin
is amidships. Mount positions below are shares of HALF_LENGTH, the same shares
as BATTLESHIP_TURRET_AT / BATTLESHIP_CIWS_AT in the catalog; the client adds
the deck heights below to lift each pivot onto the ship.

Row 0 = bow screen-south, then clockwise 22.5° through row 15.

  python tools/sprites/render_battleship.py \\
      --out gridlock/packages/client/src/assets/units/battleship
"""

from __future__ import annotations

import argparse
import math
from pathlib import Path

import numpy as np
from PIL import Image

from render_naval import build_wake, cyl
from render_procedural import MAT, Mesh, hex_rgb, render_turntable

MAT.update(
    {
        # Navy blue below the sheer line, haze gray above, dark gray decks.
        "navy": (hex_rgb("#3e4a57"), 0.06, 1.0),
        "haze": (hex_rgb("#8a949a"), 0.08, 1.0),
        "deckgray": (hex_rgb("#5f6664"), 0.04, 1.0),
        "sensor": (hex_rgb("#1f3a40"), 0.55, 1.0),
    }
)

HALF_LENGTH = 13.6
TURRET_AT = (0.6, 0.38)
CIWS_AT = (-0.04, -0.8)
# Pivot heights the client lifts each mount to (model units). Turret B superfires over A.
TURRET_Z = (1.02, 1.6)
CIWS_Z = (2.58, 1.02)
# The mount is a few meters across; drawn this much bigger so it reads beside the funnels.
CIWS_SIZE = 1.3

SCALE_FRAC = 0.0325
CY_FRAC = 0.56
CELL = 384

# Sheer: deck height along the hull. High at the bow, low aft.
STATIONS = [
    (13.6, 0.05, 1.32),
    (12.9, 0.42, 1.24),
    (11.4, 0.95, 1.12),
    (9.0, 1.45, 1.0),
    (5.5, 1.74, 0.88),
    (1.0, 1.8, 0.8),
    (-4.0, 1.8, 0.76),
    (-8.5, 1.6, 0.72),
    (-11.6, 1.2, 0.7),
    (-13.0, 0.7, 0.69),
    (-13.6, 0.3, 0.68),
]
SHEER_LOW = 0.74


def deck_z(x: float) -> float:
    """Deck height at x, from the stations."""
    xs = [s[0] for s in STATIONS][::-1]
    zs = [s[2] for s in STATIONS][::-1]
    return float(np.interp(x, xs, zs))


def section(x: float, hb: float, dz: float) -> list[np.ndarray]:
    """Round-bilged section: deck camber over the top, sheer line, topsides, keel."""
    line = min(SHEER_LOW, dz - 0.05)
    return [
        np.array([x, hb * 0.97, dz]),
        np.array([x, 0.0, dz + 0.05]),
        np.array([x, -hb * 0.97, dz]),
        np.array([x, -hb, dz - 0.03]),
        np.array([x, -hb, line]),
        np.array([x, -hb * 0.92, -0.5]),
        np.array([x, 0.0, -1.0]),
        np.array([x, hb * 0.92, -0.5]),
        np.array([x, hb, line]),
        np.array([x, hb, dz - 0.03]),
    ]


def prism(m: Mesh, bottom: list[tuple[float, float]], z0: float, top: list[tuple[float, float]], z1: float, side: str, roof: str) -> None:
    """Plan outline `bottom` at z0 lofted to `top` at z1, sides one material, roof another."""
    lo = [m.v((x, y, z0)) for x, y in bottom]
    hi = [m.v((x, y, z1)) for x, y in top]
    n = len(lo)
    for k in range(n):
        j = (k + 1) % n
        m.quad(lo[k], lo[j], hi[j], hi[k], side)
    c = m.v((float(np.mean([p[0] for p in top])), float(np.mean([p[1] for p in top])), z1))
    for k in range(n):
        m.tri(c, hi[k], hi[(k + 1) % n], roof)


def funnel(m: Mesh, x: float, z0: float, z1: float, rx: float, ry: float, rake: float) -> None:
    """Oval funnel raked aft, a black cap."""
    n = 16
    rings = []
    for z, k in ((z0, 1.0), (z1 - 0.18, 0.96), (z1, 0.96)):
        dx = -(z - z0) * rake
        rings.append([np.array([x + dx + rx * k * math.cos(2 * math.pi * i / n), ry * k * math.sin(2 * math.pi * i / n), z]) for i in range(n)])
    m.loft(rings, lambda r, s: "metal" if r == 1 else "haze")


def tube(m: Mesh, x0: float, x1: float, y: float, z: float, r0: float, r1: float, mat: str, n: int = 8) -> None:
    rings = [
        [np.array([x, y + r * math.cos(2 * math.pi * k / n), z + r * math.sin(2 * math.pi * k / n)]) for k in range(n)]
        for x, r in ((x0, r0), (x1, r1))
    ]
    m.loft(rings, mat)


def build_hull() -> Mesh:
    m = Mesh()
    rings = [section(x, hb, dz) for x, hb, dz in STATIONS]

    def mat(r: int, s: int) -> str:
        if s in (0, 1):
            return "deckgray"
        if s in (4, 5, 6, 7):
            return "navy"
        return "haze"

    m.loft(rings, mat)
    # Barbettes. B stands tall enough to fire over A. Faceted, not round.
    for at, z in zip(TURRET_AT, TURRET_Z):
        x = at * HALF_LENGTH
        prism(m, [(x + 0.8, -0.55), (x + 0.5, -0.8), (x - 0.5, -0.8), (x - 0.8, -0.55), (x - 0.8, 0.55), (x - 0.5, 0.8), (x + 0.5, 0.8), (x + 0.8, 0.55)], deck_z(x) - 0.05,
              [(x + 0.75, -0.5), (x + 0.45, -0.75), (x - 0.45, -0.75), (x - 0.75, -0.5), (x - 0.75, 0.5), (x - 0.45, 0.75), (x + 0.45, 0.75), (x + 0.75, 0.5)], z + 0.05, "haze", "haze")
    # Breakwater ahead of A.
    bx = 9.6
    prism(m, [(bx, 0.0), (bx - 0.35, 1.1), (bx - 0.5, 1.1), (bx - 0.15, 0.0), (bx - 0.5, -1.1), (bx - 0.35, -1.1)], deck_z(bx), [(bx, 0.0), (bx - 0.35, 1.1), (bx - 0.5, 1.1), (bx - 0.15, 0.0), (bx - 0.5, -1.1), (bx - 0.35, -1.1)], deck_z(bx) + 0.12, "haze", "haze")
    # Anchor windlass on the forecastle, and a forward cell block of launch tubes between it and A.
    for y in (-0.35, 0.35):
        cyl(m, (11.5, y, deck_z(11.5) + 0.07), 2, 0.12, 0.14, "metal", 8)
    m.box((10.0, -0.6, deck_z(10.0)), (11.0, 0.6, deck_z(10.0) + 0.1), "haze")
    for i in range(3):
        for j in range(3):
            m.box((10.1 + i * 0.3, -0.5 + j * 0.37, deck_z(10.0) + 0.1), (10.32 + i * 0.3, -0.25 + j * 0.37, deck_z(10.0) + 0.12), "metal")
    # Stern CIWS pedestal: a small faceted deckhouse the mount stands on.
    sx = CIWS_AT[1] * HALF_LENGTH
    prism(m, [(sx + 0.6, -0.55), (sx + 0.6, 0.55), (sx - 0.6, 0.55), (sx - 0.6, -0.55)], deck_z(sx) - 0.02, [(sx + 0.5, -0.5), (sx + 0.5, 0.5), (sx - 0.5, 0.5), (sx - 0.5, -0.5)], CIWS_Z[1], "haze", "deckgray")
    # Fantail: a flat helicopter pad with a pale landing ring behind the stern mount.
    m.box((-13.0, -0.62, deck_z(-12.2) - 0.02), (-11.3, 0.62, deck_z(-12.2) + 0.04), "deckgray")
    n = 20
    cx, cz = -12.15, deck_z(-12.2) + 0.05
    inner = [m.v((cx + 0.38 * math.cos(2 * math.pi * k / n), 0.38 * math.sin(2 * math.pi * k / n), cz)) for k in range(n)]
    outer = [m.v((cx + 0.48 * math.cos(2 * math.pi * k / n), 0.48 * math.sin(2 * math.pi * k / n), cz)) for k in range(n)]
    for k in range(n):
        j = (k + 1) % n
        m.quad(inner[k], outer[k], outer[j], inner[j], "white")
    return m


def facet_mast(m: Mesh, x: float, z0: float, z1: float, hw: float, hl: float, top: float) -> None:
    """Enclosed pyramid mast: a tapering faceted tower with a flat radar panel on each face."""
    prism(m, [(x + hl, -hw), (x + hl, hw), (x - hl, hw), (x - hl, -hw)], z0, [(x + hl * top, -hw * top), (x + hl * top, hw * top), (x - hl * top, hw * top), (x - hl * top, -hw * top)], z1, "haze", "metal")
    zm0, zm1 = z0 + (z1 - z0) * 0.3, z0 + (z1 - z0) * 0.7
    k = 1 - (zm1 - z0) / (z1 - z0) * (1 - top) + 0.02
    m.box((x + hl * k, -hw * 0.6, zm0), (x + hl * k + 0.05, hw * 0.6, zm1), "sensor")
    m.box((x - hl * k - 0.05, -hw * 0.6, zm0), (x - hl * k, hw * 0.6, zm1), "sensor")
    for side in (-1, 1):
        y0, y1 = sorted((side * hw * k, side * (hw * k + 0.05)))
        m.box((x - hl * 0.6, y0, zm0), (x + hl * 0.6, y1, zm1), "sensor")


def build_super() -> Mesh:
    m = Mesh()
    d = 0.74
    lvl1 = 1.36
    # 01 level deckhouse along the middle of the ship, sides tumbled in.
    prism(m, [(3.6, -1.2), (3.6, 1.2), (-6.2, 1.2), (-6.2, -1.2)], d, [(3.5, -1.1), (3.5, 1.1), (-6.1, 1.1), (-6.1, -1.1)], lvl1, "haze", "deckgray")
    # Forward superstructure: two faceted levels, then the bridge with a slit window.
    prism(m, [(3.1, -0.95), (3.1, 0.95), (-0.3, 0.95), (-0.3, -0.95)], lvl1, [(2.9, -0.82), (2.9, 0.82), (-0.3, 0.82), (-0.3, -0.82)], 1.95, "haze", "deckgray")
    prism(m, [(2.7, -0.78), (2.7, 0.78), (0.2, 0.78), (0.2, -0.78)], 1.95, [(2.5, -0.66), (2.5, 0.66), (0.2, 0.66), (0.2, -0.66)], 2.45, "haze", "deckgray")
    m.box((2.48, -0.55, 2.22), (2.6, 0.55, 2.36), "glass")
    # Forward RWS / small gun house ahead of the bridge, on the 02 level.
    m.box((2.95, -0.3, 1.95), (3.35, 0.3, 2.25), "haze")
    tube(m, 3.35, 3.9, 0.0, 2.12, 0.04, 0.035, "metal", 6)
    # The fire-control tower: faceted, a lookout level, and the director on top (the searchlight's base).
    prism(m, [(1.9, -0.5), (1.9, 0.5), (0.6, 0.5), (0.6, -0.5)], 2.45, [(1.8, -0.4), (1.8, 0.4), (0.7, 0.4), (0.7, -0.4)], 3.75, "haze", "deckgray")
    prism(m, [(1.95, -0.6), (1.95, 0.6), (0.55, 0.6), (0.55, -0.6)], 3.2, [(1.95, -0.6), (1.95, 0.6), (0.55, 0.6), (0.55, -0.6)], 3.32, "haze", "deckgray")
    m.box((1.85, -0.5, 3.0), (1.92, 0.5, 3.12), "glass")
    m.box((0.75, -0.5, 3.75), (1.75, 0.5, 4.12), "haze", "team")
    m.box((1.72, -0.3, 3.85), (1.78, 0.3, 4.05), "sensor")
    # Enclosed foremast with its radar panels, and a short pole above it.
    facet_mast(m, 0.45, 2.45, 5.1, 0.45, 0.38, 0.45)
    cyl(m, (0.45, 0.0, 5.5), 2, 0.05, 0.8, "metal", 6)
    m.box((0.4, -0.5, 5.7), (0.5, 0.5, 5.78), "metal")
    # The tower the middle CIWS stands on, between the bridge and the forward stack.
    cx = CIWS_AT[0] * HALF_LENGTH
    prism(m, [(cx + 0.5, -0.55), (cx + 0.5, 0.55), (cx - 0.5, 0.55), (cx - 0.5, -0.55)], lvl1, [(cx + 0.42, -0.47), (cx + 0.42, 0.47), (cx - 0.42, 0.47), (cx - 0.42, -0.47)], CIWS_Z[0], "haze", "deckgray")
    # Two boxed exhaust stacks, raked aft, dark tops.
    for fx, zt in ((-1.8, 3.55), (-3.7, 3.3)):
        prism(m, [(fx + 0.6, -0.5), (fx + 0.6, 0.5), (fx - 0.6, 0.5), (fx - 0.6, -0.5)], lvl1 - 0.02, [(fx + 0.2, -0.4), (fx + 0.2, 0.4), (fx - 0.75, 0.4), (fx - 0.75, -0.4)], zt, "haze", "tire")
    # Enclosed mainmast abaft the second stack.
    facet_mast(m, -4.6, lvl1, 3.9, 0.4, 0.32, 0.45)
    # Aft superstructure and the aft director.
    prism(m, [(-4.6, -0.85), (-4.6, 0.85), (-6.1, 0.85), (-6.1, -0.85)], lvl1, [(-4.6, -0.75), (-4.6, 0.75), (-6.0, 0.75), (-6.0, -0.75)], 1.9, "haze", "deckgray")
    m.box((-5.75, -0.42, 1.9), (-4.95, 0.42, 2.32), "haze", "team")
    # Vertical launch cell blocks down both sides on the 01 level, flat with hatch grids.
    for x in (2.3, -2.9):
        for side in (-1, 1):
            y = side * 0.98
            y0, y1 = sorted((y - 0.3, y + 0.3))
            m.box((x - 0.9, y0, lvl1), (x + 0.9, y1, lvl1 + 0.14), "haze")
            for i in range(4):
                m.box((x - 0.8 + i * 0.42, y0 + 0.08, lvl1 + 0.14), (x - 0.5 + i * 0.42, y1 - 0.08, lvl1 + 0.16), "metal")
    # Remote weapon stations in tubs, fore and aft of the island.
    for x, y in ((3.9, 0.9), (3.9, -0.9), (-6.6, 0.9), (-6.6, -0.9)):
        cyl(m, (x, y, d + 0.16), 2, 0.3, 0.32, "haze", 12)
        m.box((x - 0.15, y - 0.12, d + 0.32), (x + 0.12, y + 0.12, d + 0.55), "metal")
        tube(m, x + 0.12, x + 0.5, y, d + 0.46, 0.025, 0.025, "metal", 5)
    return m


def build_turret() -> Mesh:
    """Triple heavy gun turret: an angular stealth wedge. Pivot at the origin, base on z = 0, barrels along +x."""
    m = Mesh()
    plan = [(1.0, -0.45), (0.6, -0.78), (-1.05, -0.82), (-1.05, 0.82), (0.6, 0.78), (1.0, 0.45)]
    roof = [(0.65, -0.3), (0.35, -0.6), (-0.95, -0.66), (-0.95, 0.66), (0.35, 0.6), (0.65, 0.3)]
    prism(m, plan, 0.0, roof, 0.56, "haze", "team")
    # Flat mantlet plate across the wedge nose.
    m.box((0.7, -0.5, 0.14), (0.92, 0.5, 0.46), "metal")
    # Sensor head at the back of the roof.
    m.box((-0.9, -0.2, 0.56), (-0.5, 0.2, 0.74), "haze")
    m.box((-0.5, -0.14, 0.6), (-0.46, 0.14, 0.7), "sensor")
    # Three barrels with their sleeves.
    for y in (-0.28, 0.0, 0.28):
        tube(m, 0.75, 1.1, y, 0.3, 0.11, 0.11, "metal", 8)
        tube(m, 1.1, 3.0, y, 0.3, 0.08, 0.06, "metal", 8)
    return m


def build_ciws() -> Mesh:
    """Radar-laid 20mm on its pedestal, drawn a size up so it reads. Pivot at the origin, gun along +x."""
    m = Mesh()
    cyl(m, (0.0, 0.0, 0.12), 2, 0.34, 0.24, "haze", 12)
    prism(m, [(0.3, -0.3), (0.3, 0.3), (-0.3, 0.3), (-0.3, -0.3)], 0.24, [(0.25, -0.25), (0.25, 0.25), (-0.3, 0.25), (-0.3, -0.25)], 0.5, "haze", "haze")
    # Radome.
    cyl(m, (-0.05, 0.0, 0.72), 2, 0.26, 0.44, "white", 14)
    cyl(m, (-0.05, 0.0, 0.96), 2, 0.2, 0.06, "white", 14)
    # Barrel cluster.
    tube(m, 0.2, 0.95, 0.0, 0.38, 0.09, 0.07, "metal", 8)
    m.verts = [p * CIWS_SIZE for p in m.verts]
    return m


def layer(mesh: Mesh, out: Path, name: str, **kw) -> None:
    render_turntable(
        mesh, out / name, f"battleship_{name}", f"battleship-{name}.json", SCALE_FRAC, 0.0,
        cy_frac=CY_FRAC, cell=CELL, ss=4, **kw,
    )


def placed(mesh: Mesh, x: float, z: float) -> Mesh:
    m = Mesh()
    m.verts = [p + np.array([x, 0.0, z]) for p in mesh.verts]
    m.tris = list(mesh.tris)
    return m


def merge(*meshes: Mesh) -> Mesh:
    m = Mesh()
    for part in meshes:
        base = len(m.verts)
        m.verts.extend(part.verts)
        m.tris.extend((a + base, b + base, c + base, mat) for a, b, c, mat in part.tris)
    return m


def write_cameo(out: Path, path: Path) -> None:
    """72x72 cameo of the whole ship from the south-east face."""
    tmp = out / "_cameo"
    whole = merge(
        build_hull(),
        build_super(),
        *(placed(build_turret(), at * HALF_LENGTH, z) for at, z in zip(TURRET_AT, TURRET_Z)),
        *(placed(build_ciws(), at * HALF_LENGTH, z) for at, z in zip(CIWS_AT, CIWS_Z)),
    )
    render_turntable(
        whole, tmp, "battleship_whole", "battleship-whole.json", SCALE_FRAC, 0.0,
        cy_frac=CY_FRAC, cell=CELL, ss=4, clip_z=0.0, underlay=build_wake(14.6, 2.4),
    )
    face = Image.open(tmp / "0015.png").convert("RGBA")
    crop = face.crop(face.getbbox())
    fit = min(68 / crop.width, 68 / crop.height)
    small = crop.resize((max(1, round(crop.width * fit)), max(1, round(crop.height * fit))), Image.Resampling.LANCZOS)
    cameo = Image.new("RGBA", (72, 72), (0, 0, 0, 0))
    cameo.alpha_composite(small, ((72 - small.width) // 2, (72 - small.height) // 2))
    cameo.save(path)
    print("wrote", path)
    for f in tmp.iterdir():
        f.unlink()
    tmp.rmdir()
    (out / "battleship-whole.json").unlink(missing_ok=True)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True, help="unit folder; writes hull/ super/ turret/ ciws/ inside it")
    args = ap.parse_args()
    out = Path(args.out)
    layer(build_hull(), out, "hull", clip_z=0.0, underlay=build_wake(14.6, 2.4))
    layer(build_super(), out, "super")
    layer(build_turret(), out, "turret")
    layer(build_ciws(), out, "ciws")
    write_cameo(out, out.parent / "battleship-cameo.png")


if __name__ == "__main__":
    main()
