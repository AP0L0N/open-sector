#!/usr/bin/env python3
"""Naval hulls: the Destroyer and the Landing Ship, and the shared boat helpers.

Same numpy rasterizer, camera (orthographic, 30° down, 2:1 ground), light,
and outline as render_procedural.py and render_mammoth.py. The small boats
(gunboat, supplyboat, submarine) are built in render_naval_small.py on these
helpers; this script's main() hands those ids over to it.

  destroyer  a modern destroyer: haze gray over a dark boot stripe, a gun in
             a faceted shield forward, a cell block of launch tubes, one
             faceted deckhouse with an enclosed radar mast, a hangar with a
             CIWS radome, a flat helicopter pad aft, and mine rails down each
             quarter. Cut at the waterline over a small foam wake.
  lst        the Landing Ship: a long slab-sided amphibious ship in haze gray,
             a flat bow ramp door, a flat weather deck with a gray team-tint
             hatch, a faceted bridge aft under a team-tint roof with an
             enclosed radar mast and two boxed stacks, two MG tubs
             (LST_BOW_TUB_AT / LST_AFT_TUB_AT), and rigid inflatables in
             davits. Same waterline cut.

Row 0 = bow screen-south, then clockwise 22.5° through row 15. No insignia.

  python tools/sprites/render_naval.py destroyer \\
      --out gridlock/packages/client/src/assets/units/destroyer/hull
  python tools/sprites/render_naval.py lst \\
      --out gridlock/packages/client/src/assets/units/lst/hull
  python tools/sprites/render_naval.py gunboat|supplyboat|submarine --out …   (render_naval_small.py)
"""

from __future__ import annotations

import argparse
import math
from pathlib import Path

import numpy as np
from PIL import Image

import render_alliance_kit as kit
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


def build_destroyer() -> Mesh:
    """Destroyer in meters, about twice the submarine's beam and longer. +x bow, +y port, +z up. Waterline at z=0.

    A modern hull: haze-gray topsides over a dark boot stripe, a flush deck with a
    flared bow, a single-barrel gun forward in an angular faceted shield, a
    flat cell block of vertical launch tubes behind it, one faceted deckhouse
    with a slit bridge window and a gray team-tint roof, an enclosed pyramid
    mast with flat radar panels, a boxed exhaust stack, a hangar with a CIWS
    radome on its roof, a flat helicopter pad aft with a pale landing circle,
    and a rail of spiked contact mines down each quarter beside the pad.
    """
    m = Mesh()
    keel = -0.9
    stations = [
        (14.2, 0.06, 2.15, keel + 1.6),
        (13.2, 0.8, 2.0, keel + 0.7),
        (11.0, 1.4, 1.7, keel + 0.15),
        (7.0, 1.75, 1.45, keel),
        (-4.0, 1.8, 1.3, keel),
        (-10.5, 1.65, 1.25, keel + 0.05),
        (-13.6, 1.35, 1.25, keel + 0.25),
    ]
    rings = [hull_ring(x, hb, dz, kz, chine=0.6) for x, hb, dz, kz in stations]

    def hull_mat(r: int, s: int) -> str:
        if s in (0, 1):
            return "deckgray"
        if s in (3, 6):
            return "boot"
        return "haze"

    m.loft(rings, hull_mat)
    deck = 1.35
    # Main gun forward: a round base, an angular faceted shield that tumbles in, one long barrel.
    gx = 8.8
    cyl(m, (gx, 0.0, deck + 0.15), 2, 0.8, 0.3, "metal", 14)
    kit.slab(m, [(gx + 0.9, -0.45), (gx + 0.3, -0.8), (gx - 0.8, -0.8), (gx - 0.8, 0.8), (gx + 0.3, 0.8), (gx + 0.9, 0.45)], deck + 0.3,
             deck + 1.05, [(gx + 0.6, -0.3), (gx + 0.1, -0.55), (gx - 0.6, -0.55), (gx - 0.6, 0.55), (gx + 0.1, 0.55), (gx + 0.6, 0.3)], "haze", "team")
    cyl(m, (gx + 2.0, 0.0, deck + 0.75), 0, 0.09, 2.6, "metal", 8)
    # Vertical launch cells: a flat raised block with a grid of hatches.
    m.box((5.0, -1.1, deck), (7.2, 1.1, deck + 0.22), "haze")
    for i in range(4):
        for j in range(3):
            m.box((5.2 + i * 0.5, -0.85 + j * 0.6, deck + 0.22), (5.55 + i * 0.5, -0.45 + j * 0.6, deck + 0.26), "metal")
    # One faceted deckhouse: sides tumble in, a slit bridge window across the front, team roof.
    kit.slab(m, [(4.6, -1.35), (-1.2, -1.35), (-1.2, 1.35), (4.6, 1.35)], deck, deck + 1.35,
             [(4.3, -1.2), (-1.2, -1.2), (-1.2, 1.2), (4.3, 1.2)], "haze", "deckgray")
    kit.slab(m, [(4.0, -1.15), (0.2, -1.15), (0.2, 1.15), (4.0, 1.15)], deck + 1.35, deck + 2.5,
             [(3.6, -1.0), (0.2, -1.0), (0.2, 1.0), (3.6, 1.0)], "haze", "team")
    m.box((3.55, -0.9, deck + 2.0), (3.75, 0.9, deck + 2.3), "glass")
    # Enclosed pyramid mast with flat radar panels on each face.
    kit.slab(m, [(1.6, -0.7), (0.3, -0.7), (0.3, 0.7), (1.6, 0.7)], deck + 2.5, deck + 4.4,
             [(1.3, -0.3), (0.5, -0.3), (0.5, 0.3), (1.3, 0.3)], "haze", "metal")
    m.box((1.42, -0.42, deck + 3.0), (1.6, 0.42, deck + 3.8), "sensor")
    m.box((0.32, -0.42, deck + 3.0), (0.5, 0.42, deck + 3.8), "sensor")
    for s in (-1, 1):
        y0, y1 = sorted((s * 0.58, s * 0.72))
        m.box((0.55, y0, deck + 3.0), (1.35, y1, deck + 3.8), "sensor")
    cyl(m, (0.9, 0.0, deck + 5.0), 2, 0.06, 1.2, "metal", 6)
    m.box((0.84, -0.6, deck + 5.3), (0.96, 0.6, deck + 5.38), "metal")
    # Boxed exhaust stack amidships, raked, with a dark top.
    kit.slab(m, [(-2.0, -0.8), (-3.8, -0.8), (-3.8, 0.8), (-2.0, 0.8)], deck + 1.35, deck + 2.9,
             [(-2.4, -0.65), (-3.9, -0.65), (-3.9, 0.65), (-2.4, 0.65)], "haze", "tire")
    # Hangar box forward of the pad, a CIWS radome on its roof.
    m.box((-7.6, -1.25, deck), (-4.4, 1.25, deck + 1.5), "haze")
    m.box((-7.65, -1.3, deck + 1.5), (-4.35, 1.3, deck + 1.6), "deckgray")
    cyl(m, (-6.0, 0.0, deck + 1.8), 2, 0.4, 0.4, "haze", 12)
    cyl(m, (-6.0, 0.0, deck + 2.3), 2, 0.3, 0.6, "white", 14)
    cyl(m, (-5.3, 0.0, deck + 2.0), 0, 0.07, 1.0, "metal", 6)
    # Helicopter deck: flat pad over the stern, a pale landing ring and a centre bar.
    m.box((-13.3, -1.25, deck), (-7.6, 1.25, deck + 0.08), "deckgray")
    ring(m, deck + 0.1, -10.4, 0.0, 0.85, 0.85, 1.05, 1.05, "white", 28)
    m.box((-10.5, -0.5, deck + 0.1), (-10.3, 0.5, deck + 0.11), "white")
    # Mine rails down each quarter: dark spiked spheres on a low rail.
    for oy in (-1.47, 1.47):
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


def render_destroyer(out: Path, cell: int = 256, ss: int = 4) -> None:
    # Half the small boats' scale so the long hull fits the same cell; the client fits every
    # sheet to its own draw size, so only the cell fit changes, not the look.
    render_turntable(
        build_destroyer(), out, "destroyer_hull", "destroyer-hull.json", NAVAL_SCALE * 0.55, NAVAL_Z_MID,
        cy_frac=0.56, cell=cell, ss=ss, clip_z=0.0, underlay=build_wake(15.2, 2.4),
    )
    write_cameo(out, out.parent.parent / "destroyer-cameo.png")


# Modern naval paint: haze gray topsides over a dark boot stripe, a dark gray
# deck, a flat gray ramp door. Own keys, so no other hull changes colour.
MAT.update(
    {
        "haze": (hex_rgb("#8a949a"), 0.08, 1.0),
        "boot": (hex_rgb("#3e4a57"), 0.06, 1.0),
        "deckgray": (hex_rgb("#5f6664"), 0.04, 1.0),
        "lstdoor": (hex_rgb("#949f9e"), 0.10, 1.0),
    }
)

# Landing Ship half-length (model meters). The sim radius is 30 against the
# Destroyer's 22, so the hull is the Destroyer's half-length (13.9 m) x 30/22.
LST_HALF_LENGTH = 19.0
# MG tubs as a share of LST_HALF_LENGTH forward of amidships (+ = forward, bow = +1.0):
# the client puts the muzzle flashes here (LST_MG_AT in the catalog). Both sit on the keel line (y = 0).
LST_BOW_TUB_AT = 0.72  # forecastle tub, just aft of the bow ramp
LST_AFT_TUB_AT = -0.45  # tub on the bridge front, between the bridge wings


def lst_ring(x: float, hb: float, dz: float, keel: float) -> list[np.ndarray]:
    """Slab-sided, flat-bottomed section, port deck edge round to starboard and back under the keel.

    Each topside is split at the boot line so the dark stripe can run along the waterline.
    Segments: 0-1 deck, 2 starboard upper, 3 starboard boot, 4-6 bottom, 7 port boot, 8 port upper.
    """
    boot = 0.55
    return [
        np.array([x, hb, dz]),
        np.array([x, 0.0, dz + 0.04]),
        np.array([x, -hb, dz]),
        np.array([x, -hb, boot]),
        np.array([x, -hb, keel + 0.35]),
        np.array([x, -hb * 0.82, keel]),
        np.array([x, hb * 0.82, keel]),
        np.array([x, hb, keel + 0.35]),
        np.array([x, hb, boot]),
    ]


def mg_tub(m: Mesh, x: float, z: float, r: float, mat: str) -> None:
    """An open shielded gun tub on the keel line: a round tub, a dark well, a pintle gun pointing forward."""
    cyl(m, (x, 0.0, z + 0.3), 2, r, 0.6, mat, 16)
    ellipse(m, z + 0.61, x, 0.0, r * 0.8, r * 0.8, "tire", 16)
    cyl(m, (x, 0.0, z + 0.7), 2, 0.22, 0.3, "metal", 8)
    cyl(m, (x + 1.0, 0.0, z + 0.85), 0, 0.07, 1.6, "metal", 6)


def rhib(m: Mesh, cx: float, cy: float, z: float) -> None:
    """A rigid inflatable in its cradle: a dark tube collar round a gray hull, a console amidships."""
    m.box((cx - 1.3, cy - 0.45, z), (cx + 1.3, cy + 0.45, z + 0.4), "haze")
    m.box((cx - 1.35, cy - 0.5, z + 0.4), (cx + 1.2, cy + 0.5, z + 0.62), "tire")
    m.box((cx - 0.2, cy - 0.2, z + 0.62), (cx + 0.3, cy + 0.2, z + 0.95), "metal")


def build_lst() -> Mesh:
    """Landing Ship in meters, about 6:1 length to beam. +x bow, +y port, +z up. Waterline at z=0.

    A modern amphibious ship: a long, slab-sided, flat-bottomed hull with a high
    freeboard in haze gray over a dark boot stripe; a blunt bow closed by a flat
    ramp door with a dark seam, and a raised forecastle carrying an open MG tub.
    The long flat weather deck over the tank deck has the big loading hatch (gray
    team-tint cover) and the vehicle-lift plate. Aft, a tall faceted
    superstructure that tumbles in: the bridge with a slit window and its own
    team-tint roof, bridge wings, a second MG tub on the bridge front, an
    enclosed pyramid mast with radar panels, and two boxed exhaust stacks.
    Two rigid inflatables sit in cradles on davits down each side ahead of the
    superstructure, and a CIWS radome stands on the hangar roof aft.
    """
    m = Mesh()
    H = LST_HALF_LENGTH
    hb = 3.15
    keel = -1.0
    deck = 2.0
    fc = 2.38  # forecastle deck
    stations = [
        (19.2, 1.4, fc + 0.05),
        (18.7, 2.4, fc + 0.02),
        (17.6, 2.95, fc),
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

    def hull_mat(r: int, s: int) -> str:
        if s in (0, 1):
            return "deckgray"
        if s in (3, 7):
            return "boot"
        return "haze"

    m.loft(rings, hull_mat, cap0=False, cap1=False)
    # Bow ramp door: the blunt bow face, a flat gray door split by a dark seam.
    bow = [m.v(p) for p in rings[0]]
    ctr = m.v(np.mean(rings[0], axis=0))
    for s in range(len(bow)):
        m.tri(ctr, bow[s], bow[(s + 1) % len(bow)], "lstdoor")
    m.box((19.18, -0.05, 0.0), (19.3, 0.05, fc + 0.05), "tire")
    m.box((19.0, -1.3, fc - 0.05), (19.32, 1.3, fc + 0.12), "metal")  # door hinge beam
    # Square stern.
    stern = [m.v(p) for p in rings[-1]]
    ctr = m.v(np.mean(rings[-1], axis=0))
    for s in range(len(stern)):
        m.tri(ctr, stern[s], stern[(s + 1) % len(stern)], "haze")
    # Low bulwark round the forecastle.
    for oy in (-1, 1):
        m.box((12.45, oy * hb - 0.06, fc), (17.4, oy * hb + 0.06, fc + 0.3), "haze")
    # Bow MG tub on the forecastle.
    mg_tub(m, LST_BOW_TUB_AT * H, fc, 0.85, "haze")
    # Weather deck over the tank deck: the big loading hatch (team cover) and the vehicle-lift plate.
    m.box((2.5, -1.75, deck), (9.5, 1.75, deck + 0.3), "metal")
    m.box((2.65, -1.6, deck + 0.3), (9.35, 1.6, deck + 0.36), "team")
    for hx in (4.3, 6.0, 7.7):
        m.box((hx - 0.05, -1.6, deck + 0.36), (hx + 0.05, 1.6, deck + 0.4), "metal")  # cover battens
    m.box((-3.8, -1.35, deck), (0.6, 1.35, deck + 0.08), "metal")
    m.box((-3.8, -1.35, deck + 0.08), (-3.55, 1.35, deck + 0.1), "hazard")
    m.box((0.35, -1.35, deck + 0.08), (0.6, 1.35, deck + 0.1), "hazard")
    for vx, vy in ((10.6, 2.1), (10.6, -2.1)):  # intake boxes on the deck edge
        m.box((vx - 0.3, vy - 0.3, deck), (vx + 0.3, vy + 0.3, deck + 0.6), "haze")
        m.box((vx - 0.22, vy - 0.22, deck + 0.6), (vx + 0.22, vy + 0.22, deck + 0.64), "tire")
    # Davits and their rigid inflatables, two down each side ahead of the superstructure.
    for oy in (-1, 1):
        for bx_ in (-1.4, -5.3):
            for dx in (-1.0, 1.0):
                m.box((bx_ + dx - 0.08, oy * hb - 0.08, deck), (bx_ + dx + 0.08, oy * hb + 0.08, deck + 1.1), "metal")
                y0, y1 = sorted((oy * hb, oy * (hb + 0.75)))
                m.box((bx_ + dx - 0.08, y0, deck + 1.0), (bx_ + dx + 0.08, y1, deck + 1.12), "metal")
            rhib(m, bx_, oy * (hb + 0.6), deck - 0.2)
    # Superstructure aft: a long faceted deckhouse that tumbles in, then the bridge block.
    s0, s1 = -17.6, -7.8
    kit.slab(m, [(s1, -2.9), (s0, -2.9), (s0, 2.9), (s1, 2.9)], deck, deck + 1.5,
             [(s1 - 0.1, -2.7), (s0 + 0.1, -2.7), (s0 + 0.1, 2.7), (s1 - 0.1, 2.7)], "haze", "deckgray")
    b0, b1 = -12.6, -8.2
    kit.slab(m, [(b1, -2.4), (b0, -2.4), (b0, 2.4), (b1, 2.4)], deck + 1.5, deck + 2.9,
             [(b1 - 0.15, -2.1), (b0 + 0.15, -2.1), (b0 + 0.15, 2.1), (b1 - 0.15, 2.1)], "haze", "team")
    m.box((b1 - 0.22, -1.9, deck + 2.35), (b1 - 0.05, 1.9, deck + 2.7), "glass")
    # Bridge wings, out to the ship's side.
    m.box((b1 - 0.9, -3.25, deck + 2.7), (b1 + 0.1, 3.25, deck + 2.85), "haze")
    # Aft MG tub on the bridge front, between the wings.
    mg_tub(m, LST_AFT_TUB_AT * H, deck + 2.9, 0.7, "haze")
    # Enclosed pyramid mast with flat radar panels, a short pole above.
    mx = -10.9
    kit.slab(m, [(mx + 0.9, -0.9), (mx - 0.9, -0.9), (mx - 0.9, 0.9), (mx + 0.9, 0.9)], deck + 2.9, deck + 5.4,
             [(mx + 0.45, -0.4), (mx - 0.45, -0.4), (mx - 0.45, 0.4), (mx + 0.45, 0.4)], "haze", "metal")
    m.box((mx + 0.66, -0.5, deck + 3.6), (mx + 0.9, 0.5, deck + 4.6), "sensor")
    m.box((mx - 0.9, -0.5, deck + 3.6), (mx - 0.66, 0.5, deck + 4.6), "sensor")
    for s in (-1, 1):
        y0, y1 = sorted((s * 0.66, s * 0.9))
        m.box((mx - 0.5, y0, deck + 3.6), (mx + 0.5, y1, deck + 4.6), "sensor")
    cyl(m, (mx, 0.0, deck + 6.0), 2, 0.07, 1.2, "metal", 6)
    m.box((mx - 0.06, -1.0, deck + 6.3), (mx + 0.06, 1.0, deck + 6.4), "metal")
    # Two boxed exhaust stacks aft of the bridge, raked, dark tops.
    for fx in (-14.2, -16.2):
        kit.slab(m, [(fx + 0.7, -0.75), (fx - 0.7, -0.75), (fx - 0.7, 0.75), (fx + 0.7, 0.75)], deck + 1.5, deck + 4.4,
                 [(fx + 0.3, -0.6), (fx - 0.9, -0.6), (fx - 0.9, 0.6), (fx + 0.3, 0.6)], "haze", "tire")
    # CIWS radome on the deckhouse roof aft, and a pair of liferafts beside it.
    cyl(m, (-17.0, 0.0, deck + 1.7), 2, 0.45, 0.4, "haze", 12)
    cyl(m, (-17.0, 0.0, deck + 2.2), 2, 0.32, 0.6, "white", 14)
    cyl(m, (-16.3, 0.0, deck + 1.95), 0, 0.07, 1.0, "metal", 6)
    for oy in (-1.9, 1.9):
        m.box((-17.3, oy - 0.4, deck + 1.5), (-16.1, oy + 0.4, deck + 1.75), "hazard")
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
    if args.what == "destroyer":
        render_destroyer(Path(args.out))
    elif args.what == "lst":
        render_lst(Path(args.out))
    else:
        # The small boats live in render_naval_small.py; it imports this module's helpers, so load it late.
        import render_naval_small as small

        small.RENDER[args.what](Path(args.out))


if __name__ == "__main__":
    main()
