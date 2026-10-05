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
  supplyboat an unarmed cargo launch: a beamy, blunt hull, the wheelhouse
             aft under a gray team-tint roof, an open well forward stacked
             with banded ammunition crates and drums, a small derrick, and
             fenders along the topsides. Same waterline cut.
  lst        the Transport LST: a long slab-sided landing ship in Western
             Approaches dazzle, bow doors, a flat weather deck with a gray
             team-tint hatch, the bridge aft under a team-tint roof, a single
             funnel, two MG tubs (LST_BOW_TUB_AT / LST_AFT_TUB_AT), and LCVPs
             in davits. Same waterline cut.

Row 0 = bow screen-south, then clockwise 22.5° through row 15. No insignia.

  python tools/sprites/render_naval.py gunboat \\
      --out gridlock/packages/client/src/assets/units/gunboat/hull
  python tools/sprites/render_naval.py submarine \\
      --out gridlock/packages/client/src/assets/units/submarine/hull
  python tools/sprites/render_naval.py supplyboat \\
      --out gridlock/packages/client/src/assets/units/supplyboat/hull
  python tools/sprites/render_naval.py destroyer \\
      --out gridlock/packages/client/src/assets/units/destroyer/hull
  python tools/sprites/render_naval.py lst \\
      --out gridlock/packages/client/src/assets/units/lst/hull
"""

from __future__ import annotations

import argparse
import math
from pathlib import Path

import numpy as np
from PIL import Image

from render_procedural import MAT, Mesh, ellipse_ring, hex_rgb, render_turntable


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


def flat_ring(cx: float, cy: float, z: float, rx: float, ry: float, n: int = 14) -> list[np.ndarray]:
    """Horizontal ellipse at height z: one level of a funnel or a ball stacked up the z axis."""
    return [np.array([cx + rx * math.cos(2 * math.pi * k / n), cy + ry * math.sin(2 * math.pi * k / n), z]) for k in range(n)]


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


def build_supplyboat() -> Mesh:
    """Cargo launch in meters, beamier and blunter than the gunboat. +x bow, +y port, +z up. Waterline at z=0."""
    m = Mesh()
    keel = -0.6
    stations = [
        (5.6, 0.35, 1.25, keel + 0.9),
        (5.0, 1.25, 1.15, keel + 0.35),
        (3.6, 1.85, 1.0, keel + 0.05),
        (0.5, 2.0, 0.95, keel),
        (-3.5, 2.0, 0.95, keel),
        (-5.4, 1.8, 1.0, keel + 0.1),
    ]
    rings = [hull_ring(x, hb, dz, kz, chine=0.6) for x, hb, dz, kz in stations]

    def hull_mat(r: int, s: int) -> str:
        return "frame" if s in (0, 1) else "camo"

    m.loft(rings, hull_mat)
    deck = 0.95
    # Wheelhouse aft: a plain box, a strip of glazing forward, gray team-tint roof.
    m.box((-4.6, -1.15, deck), (-2.6, 1.15, deck + 1.15), "camo")
    m.box((-2.62, -1.0, deck + 0.62), (-2.56, 1.0, deck + 0.95), "glass")
    m.box((-4.7, -1.22, deck + 1.15), (-2.5, 1.22, deck + 1.3), "team")
    cyl(m, (-3.9, 0.0, deck + 1.8), 2, 0.05, 1.0, "metal", 6)  # mast
    m.box((-3.95, -0.4, deck + 2.1), (-3.85, 0.4, deck + 2.17), "metal")  # yard
    # Open cargo well forward: a low coaming, then the load.
    for oy in (-1.55, 1.55):
        m.box((-2.2, oy - 0.07, deck), (4.2, oy + 0.07, deck + 0.3), "frame")
    m.box((4.1, -1.55, deck), (4.24, 1.55, deck + 0.3), "frame")
    # Ammunition crates, wood with a hazard band, two tiers.
    crates = [
        (2.4, -0.75, 0), (2.4, 0.75, 0), (0.9, -0.75, 0), (0.9, 0.75, 0), (3.5, 0.0, 0),
        (2.4, -0.4, 1), (1.0, 0.45, 1),
    ]
    for cx, cy, tier in crates:
        z0 = deck + tier * 0.6
        m.box((cx - 0.6, cy - 0.55, z0), (cx + 0.6, cy + 0.55, z0 + 0.58), "wall")
        m.box((cx - 0.62, cy - 0.57, z0 + 0.22), (cx + 0.62, cy + 0.57, z0 + 0.32), "hazard")
    # Fuel and shell drums behind the crates.
    for k, oy in enumerate((-1.0, -0.35, 0.35, 1.0)):
        cyl(m, (-0.6, oy, deck + 0.4), 2, 0.28, 0.8, "rust" if k % 2 else "bomb", 12)
    # A small derrick to sling the load across.
    cyl(m, (-1.8, 0.0, deck + 1.2), 2, 0.08, 2.4, "metal", 8)
    boom = [(-1.8, 0.0, deck + 2.3), (1.6, 0.0, deck + 1.6)]
    (x0, y0, z0), (x1, y1, z1) = boom
    length = math.hypot(x1 - x0, z1 - z0)
    steps = 6
    for k in range(steps):
        t = (k + 0.5) / steps
        cyl(m, (x0 + (x1 - x0) * t, 0.0, z0 + (z1 - z0) * t), 0, 0.06, length / steps + 0.02, "metal", 6)
    # Fenders along the topsides.
    for oy in (-2.02, 2.02):
        for x in (-3.0, -0.5, 2.0):
            cyl(m, (x, oy, 0.55), 0, 0.16, 0.6, "tire", 8)
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

def build_destroyer() -> Mesh:
    """Destroyer in meters, about twice the submarine's beam and longer. +x bow, +y port, +z up. Waterline at z=0.

    A long flush-decked hull with a raised, flared bow; a twin 40mm under a gray
    team-tint shield on the foredeck; the bridge block with its own team-tint
    roof and a pole mast; two raked funnels; a hangar box and a flat helicopter
    deck aft with a pale landing ring; and a rail of spiked contact mines down
    each quarter beside the pad.
    """
    m = Mesh()
    keel = -0.9
    stations = [
        (14.2, 0.06, 2.05, keel + 1.6),
        (13.2, 0.75, 1.9, keel + 0.7),
        (11.0, 1.35, 1.65, keel + 0.15),
        (7.0, 1.7, 1.4, keel),
        (-4.0, 1.75, 1.25, keel),
        (-10.5, 1.6, 1.2, keel + 0.05),
        (-13.6, 1.25, 1.2, keel + 0.25),
    ]
    rings = [hull_ring(x, hb, dz, kz, chine=0.6) for x, hb, dz, kz in stations]

    def hull_mat(r: int, s: int) -> str:
        return "frame" if s in (0, 1) else "camo"

    m.loft(rings, hull_mat)
    deck = 1.3
    # Twin 40mm on the foredeck: a round base, a boxy shield with a team-tint roof, two barrels.
    gx = 8.6
    cyl(m, (gx, 0.0, deck + 0.2), 2, 0.75, 0.4, "metal", 14)
    m.box((gx - 0.6, -0.65, deck + 0.35), (gx + 0.45, 0.65, deck + 1.0), "camo")
    m.box((gx - 0.65, -0.7, deck + 1.0), (gx + 0.5, 0.7, deck + 1.1), "team")
    for oy in (-0.28, 0.28):
        cyl(m, (gx + 1.4, oy, deck + 0.72), 0, 0.08, 2.0, "metal", 8)
    # Bridge block, stepped, with glazing forward and a team-tint roof.
    m.box((2.6, -1.25, deck), (6.2, 1.25, deck + 1.3), "camo")
    m.box((3.4, -1.0, deck + 1.3), (6.0, 1.0, deck + 2.3), "camo")
    m.box((5.98, -0.92, deck + 1.75), (6.06, 0.92, deck + 2.15), "glass")
    m.box((3.3, -1.08, deck + 2.3), (6.1, 1.08, deck + 2.44), "team")
    cyl(m, (3.9, 0.0, deck + 3.6), 2, 0.07, 2.4, "metal", 6)  # mast
    m.box((3.85, -0.75, deck + 4.2), (3.95, 0.75, deck + 4.28), "metal")  # yard
    # Two raked funnels amidships, dark caps.
    for fx in (0.6, -2.4):
        stack = [flat_ring(fx - dz * 0.25, 0.0, deck + dz, 0.75, 0.55) for dz in (0.0, 1.6, 2.2)]
        m.loft(stack, lambda r, s: "tire" if r == 2 else "camo")
    # Hangar box forward of the pad.
    m.box((-7.6, -1.15, deck), (-4.4, 1.15, deck + 1.35), "camo")
    m.box((-7.65, -1.2, deck + 1.35), (-4.35, 1.2, deck + 1.45), "frame")
    # Helicopter deck: flat pad over the stern, a pale landing ring and a centre bar.
    m.box((-13.3, -1.2, deck), (-7.6, 1.2, deck + 0.08), "frame")
    ring(m, deck + 0.1, -10.4, 0.0, 0.85, 0.85, 1.05, 1.05, "white", 28)
    m.box((-10.5, -0.5, deck + 0.1), (-10.3, 0.5, deck + 0.11), "white")
    # Mine rails down each quarter: dark spiked spheres on a low rail.
    for oy in (-1.42, 1.42):
        m.box((-13.4, oy - 0.1, deck), (-8.0, oy + 0.1, deck + 0.12), "metal")
        for k in range(3):
            mx = -12.6 + k * 1.6
            sphere = [flat_ring(mx, oy, deck + 0.35 + dz, rr, rr, 10) for dz, rr in ((-0.25, 0.12), (-0.12, 0.27), (0.08, 0.29), (0.25, 0.14))]
            m.loft(sphere, "bomb")
            cyl(m, (mx, oy, deck + 0.68), 2, 0.04, 0.16, "metal", 5)  # horn
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


def render_supplyboat(out: Path, cell: int = 256, ss: int = 4) -> None:
    render_turntable(
        build_supplyboat(), out, "supplyboat_hull", "supplyboat-hull.json", NAVAL_SCALE, NAVAL_Z_MID,
        cy_frac=0.56, cell=cell, ss=ss, clip_z=0.0, underlay=build_wake(7.0, 2.7, 0.1),
    )
    write_cameo(out, out.parent.parent / "supplyboat-cameo.png")


def render_submarine(out: Path, cell: int = 256, ss: int = 4) -> None:
    render_turntable(
        build_submarine(), out, "submarine_hull", "submarine-hull.json", NAVAL_SCALE, NAVAL_Z_MID,
        cy_frac=0.56, cell=cell, ss=ss, clip_z=0.0, underlay=build_wake(12.6, 1.9),
    )
    write_cameo(out, out.parent.parent / "submarine-cameo.png")


def render_destroyer(out: Path, cell: int = 256, ss: int = 4) -> None:
    # Half the small boats' scale so the long hull fits the same cell; the client fits every
    # sheet to its own draw size, so only the cell fit changes, not the look.
    render_turntable(
        build_destroyer(), out, "destroyer_hull", "destroyer-hull.json", NAVAL_SCALE * 0.55, NAVAL_Z_MID,
        cy_frac=0.56, cell=cell, ss=ss, clip_z=0.0, underlay=build_wake(15.2, 2.4),
    )
    write_cameo(out, out.parent.parent / "destroyer-cameo.png")


# Transport LST palette: Western Approaches, a pale grey hull broken by pale
# blue and sea-green dazzle panels, a dark steel deck. Own keys, so no other
# hull changes colour.
MAT.update(
    {
        "lstpale": (hex_rgb("#c6d0cd"), 0.08, 1.0),
        "lstblue": (hex_rgb("#86a3b2"), 0.08, 1.0),
        "lstgreen": (hex_rgb("#8fb4a5"), 0.08, 1.0),
        "lstdeck": (hex_rgb("#6c7371"), 0.04, 1.0),
        "lstdoor": (hex_rgb("#949f9e"), 0.10, 1.0),
        "lstboat": (hex_rgb("#7d8a74"), 0.06, 1.0),
    }
)

# Transport LST half-length (model meters). The sim radius is 30 against the
# Destroyer's 22, so the hull is the Destroyer's half-length (13.9 m) x 30/22.
LST_HALF_LENGTH = 19.0
# MG tubs as a share of LST_HALF_LENGTH forward of amidships (+ = forward, bow = +1.0):
# the client puts the muzzle flashes here. Both sit on the keel line (y = 0).
LST_BOW_TUB_AT = 0.72  # forecastle tub, just aft of the bow doors
LST_AFT_TUB_AT = -0.45  # tub on the bridge front, between the bridge wings


def lst_ring(x: float, hb: float, dz: float, keel: float) -> list[np.ndarray]:
    """Slab-sided, flat-bottomed section, port deck edge round to starboard and back under the keel.

    Each topside is split at half freeboard so the dazzle can step between an upper and a lower band.
    Segments: 0-1 deck, 2 starboard upper, 3 starboard lower, 4-6 bottom, 7 port lower, 8 port upper.
    """
    mid = dz * 0.5
    return [
        np.array([x, hb, dz]),
        np.array([x, 0.0, dz + 0.04]),
        np.array([x, -hb, dz]),
        np.array([x, -hb, mid]),
        np.array([x, -hb, keel + 0.35]),
        np.array([x, -hb * 0.82, keel]),
        np.array([x, hb * 0.82, keel]),
        np.array([x, hb, keel + 0.35]),
        np.array([x, hb, mid]),
    ]


def lst_dazzle(x: float, band: int, side: int) -> str:
    """Western Approaches dazzle: long panels, different on each side, stepped between bands."""
    k = math.floor(x * 0.21 + band * 0.55 + (0.9 if side > 0 else 0.0))
    return ("lstpale", "lstblue", "lstpale", "lstgreen")[k % 4]


def lcvp(m: Mesh, cx: float, cy: float, z: float) -> None:
    """LCVP landing craft hung in its davits: a blunt box hull, an open well, a ramp bow."""
    m.box((cx - 1.75, cy - 0.58, z), (cx + 1.6, cy + 0.58, z + 0.7), "lstboat", top_mat="metal")
    m.box((cx - 1.75, cy - 0.58, z + 0.55), (cx - 0.9, cy + 0.58, z + 0.85), "lstboat")  # coxswain's flat aft
    m.box((cx + 1.55, cy - 0.55, z + 0.05), (cx + 1.8, cy + 0.55, z + 0.78), "metal")  # bow ramp


def build_lst() -> Mesh:
    """Transport LST in meters, about 6:1 length to beam. +x bow, +y port, +z up. Waterline at z=0.

    A long, slab-sided, flat-bottomed hull with a high freeboard, painted in a
    Western Approaches dazzle; a blunt bow closed by two bow doors over the
    ramp, and a raised forecastle carrying an open MG tub. The long flat weather
    deck over the tank deck has the big loading hatch (gray team-tint cover)
    and the vehicle-lift plate. Aft, the stepped superstructure: a bridge with
    glazing and its own team-tint roof, bridge wings, a second MG tub on the
    bridge front, a pole mast with struts and a yard, and a single raked funnel.
    Two LCVPs hang in davits down each side ahead of the superstructure.
    """
    m = Mesh()
    H = LST_HALF_LENGTH
    hb = 3.15
    keel = -1.0
    deck = 2.0
    fc = 2.38  # forecastle deck
    stations = [
        (19.2, 1.05, fc + 0.05),
        (18.7, 2.2, fc + 0.02),
        (17.6, 2.9, fc),
        (16.0, hb, fc),
        (12.45, hb, fc),
        (12.3, hb, deck),
        (9.0, hb, deck),
        (5.0, hb, deck),
        (1.0, hb, deck),
        (-3.0, hb, deck),
        (-7.0, hb, deck),
        (-11.0, hb, deck),
        (-14.5, hb, deck),
        (-16.8, 3.08, deck),
        (-18.4, 2.85, deck),
        (-19.0, 2.55, deck),
    ]
    rings = [lst_ring(x, b, dz, keel) for x, b, dz in stations]
    xs = [x for x, _, _ in stations]

    def hull_mat(r: int, s: int) -> str:
        if s in (0, 1):
            return "lstdeck"
        xm = (xs[r] + xs[r + 1]) / 2
        if s == 2:
            return lst_dazzle(xm, 0, -1)
        if s == 3:
            return lst_dazzle(xm, 1, -1)
        if s == 8:
            return lst_dazzle(xm, 0, 1)
        if s == 7:
            return lst_dazzle(xm, 1, 1)
        return "lstpale"

    m.loft(rings, hull_mat, cap0=False, cap1=False)
    # Bow doors over the ramp: the blunt bow face, split down the middle by a dark seam.
    bow = [m.v(p) for p in rings[0]]
    ctr = m.v(np.mean(rings[0], axis=0))
    for s in range(len(bow)):
        m.tri(ctr, bow[s], bow[(s + 1) % len(bow)], "lstdoor")
    m.box((19.18, -0.05, 0.0), (19.3, 0.05, fc + 0.05), "tire")
    m.box((19.0, -1.1, fc - 0.05), (19.32, 1.1, fc + 0.12), "metal")  # door hinge beam
    # Square stern.
    stern = [m.v(p) for p in rings[-1]]
    ctr = m.v(np.mean(rings[-1], axis=0))
    for s in range(len(stern)):
        m.tri(ctr, stern[s], stern[(s + 1) % len(stern)], "lstpale")
    # Low bulwark round the forecastle.
    for oy in (-1, 1):
        m.box((12.45, oy * hb - 0.06, fc), (17.4, oy * hb + 0.06, fc + 0.3), "lstpale")
    # Bow MG tub on the forecastle: an open round tub, a dark well, the gun pointing forward.
    bx = LST_BOW_TUB_AT * H
    cyl(m, (bx, 0.0, fc + 0.3), 2, 0.85, 0.6, "lstpale", 16)
    ellipse(m, fc + 0.61, bx, 0.0, 0.68, 0.68, "tire", 16)
    cyl(m, (bx, 0.0, fc + 0.7), 2, 0.22, 0.3, "metal", 8)
    cyl(m, (bx + 1.0, 0.0, fc + 0.85), 0, 0.07, 1.6, "metal", 6)
    # Weather deck over the tank deck: the big loading hatch (team cover) and the vehicle-lift plate.
    m.box((2.5, -1.75, deck), (9.5, 1.75, deck + 0.3), "metal")
    m.box((2.65, -1.6, deck + 0.3), (9.35, 1.6, deck + 0.36), "team")
    for hx in (4.3, 6.0, 7.7):
        m.box((hx - 0.05, -1.6, deck + 0.36), (hx + 0.05, 1.6, deck + 0.4), "metal")  # cover battens
    m.box((-3.8, -1.35, deck), (0.6, 1.35, deck + 0.08), "metal")
    m.box((-3.8, -1.35, deck + 0.08), (-3.55, 1.35, deck + 0.1), "hazard")
    m.box((0.35, -1.35, deck + 0.08), (0.6, 1.35, deck + 0.1), "hazard")
    for vx, vy in ((10.6, 2.1), (10.6, -2.1), (-5.5, 1.0), (-5.5, -1.0)):  # ventilators
        cyl(m, (vx, vy, deck + 0.35), 2, 0.22, 0.7, "lstpale", 8)
        ellipse(m, deck + 0.71, vx, vy, 0.16, 0.16, "tire", 8)
    # Davits and their LCVPs, two down each side ahead of the superstructure.
    for oy in (-1, 1):
        for bx_ in (-1.4, -5.3):
            for dx in (-1.25, 1.25):
                m.box((bx_ + dx - 0.08, oy * hb - 0.08, deck), (bx_ + dx + 0.08, oy * hb + 0.08, deck + 1.25), "metal")
                y0, y1 = sorted((oy * hb, oy * (hb + 0.85)))
                m.box((bx_ + dx - 0.08, y0, deck + 1.15), (bx_ + dx + 0.08, y1, deck + 1.3), "metal")
            lcvp(m, bx_, oy * (hb + 0.75), deck - 0.35)
    # Superstructure aft: a long deckhouse, then the bridge with its glazing and team roof.
    s0, s1 = -17.6, -7.8
    m.box((s0, -2.9, deck), (s1, 2.9, deck + 1.4), "lstblue", top_mat="lstdeck")
    m.box((s0 + 0.2, -2.95, deck + 0.95), (s1 + 0.2, 2.95, deck + 1.4), "lstpale", top_mat="lstdeck")
    b0, b1 = -12.6, -8.2
    m.box((b0, -2.2, deck + 1.4), (b1, 2.2, deck + 2.8), "lstpale")
    m.box((b1 - 0.02, -2.0, deck + 2.1), (b1 + 0.05, 2.0, deck + 2.55), "glass")
    m.box((b0 - 0.1, -2.3, deck + 2.8), (b1 + 0.1, 2.3, deck + 2.94), "team")
    # Bridge wings, out to the ship's side.
    m.box((b1 - 0.9, -3.25, deck + 2.6), (b1 + 0.1, 3.25, deck + 2.75), "lstpale")
    # Aft MG tub on the bridge front, between the wings.
    ax = LST_AFT_TUB_AT * H
    cyl(m, (ax, 0.0, deck + 3.2), 2, 0.7, 0.55, "lstpale", 16)
    ellipse(m, deck + 3.48, ax, 0.0, 0.55, 0.55, "tire", 16)
    cyl(m, (ax, 0.0, deck + 3.55), 2, 0.2, 0.25, "metal", 8)
    cyl(m, (ax + 0.95, 0.0, deck + 3.7), 0, 0.06, 1.4, "metal", 6)
    # Pole mast with two struts, a yard, and a crow's nest.
    mx = -10.9
    cyl(m, (mx, 0.0, deck + 5.0), 2, 0.09, 4.4, "metal", 6)
    for oy in (-0.9, 0.9):
        steps = 5
        for k in range(steps):
            t = (k + 0.5) / steps
            cyl(m, (mx - 0.8 * (1 - t), oy * (1 - t), deck + 2.94 + t * 2.6), 2, 0.05, 2.6 / steps + 0.05, "metal", 5)
    m.box((mx - 0.06, -1.3, deck + 6.3), (mx + 0.06, 1.3, deck + 6.4), "metal")
    cyl(m, (mx, 0.0, deck + 5.6), 2, 0.3, 0.3, "lstpale", 10)
    # Single raked funnel aft of the bridge, a dark cap.
    fx = -14.6
    stack = [flat_ring(fx - dz * 0.22, 0.0, deck + 1.4 + dz, 1.15, 0.9, 14) for dz in (0.0, 2.9, 3.5)]
    m.loft(stack, lambda r, s: "tire" if r == 1 else "lstpale")
    ellipse(m, deck + 4.92, fx - 3.5 * 0.22, 0.0, 1.0, 0.78, "tire", 14)  # open funnel top
    # A pair of liferafts on the deckhouse roof aft.
    for oy in (-1.6, 1.6):
        m.box((-17.2, oy - 0.4, deck + 1.4), (-16.0, oy + 0.4, deck + 1.65), "hazard")
    return m


def render_lst(out: Path, cell: int = 384, ss: int = 4) -> None:
    # The Destroyer's meters -> px (NAVAL_SCALE * 0.55 on a 256 cell), on a 384 cell so the
    # longer hull fits; the client fits the sheet to its own draw size, so only the cell grows.
    render_turntable(
        build_lst(), out, "lst_hull", "lst-hull.json", NAVAL_SCALE * 0.55 * 256 / cell, NAVAL_Z_MID,
        cy_frac=0.56, cell=cell, ss=ss, clip_z=0.0, underlay=build_wake(20.9, 4.6),
    )
    write_cameo(out, out.parent.parent / "lst-cameo.png")


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
    ap.add_argument("what", choices=["gunboat", "submarine", "supplyboat", "destroyer", "lst"])
    ap.add_argument("--out", required=True)
    args = ap.parse_args()
    if args.what == "gunboat":
        render_gunboat(Path(args.out))
    elif args.what == "supplyboat":
        render_supplyboat(Path(args.out))
    elif args.what == "destroyer":
        render_destroyer(Path(args.out))
    elif args.what == "lst":
        render_lst(Path(args.out))
    else:
        render_submarine(Path(args.out))


if __name__ == "__main__":
    main()
