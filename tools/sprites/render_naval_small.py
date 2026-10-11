#!/usr/bin/env python3
"""Modern Alliance small craft: the Attack Boat, the Supply Boat, and the Submarine.

NOTE FOR render_naval.py: these three builders replace build_gunboat /
build_supplyboat / build_submarine and their render_* entry points there.
render_naval.py keeps the shared helpers (cyl, ellipse, ring, hull_ring,
build_wake, write_cameo, NAVAL_SCALE, NAVAL_Z_MID) and the Destroyer and the
Landing Ship; its main() should dispatch gunboat / supplyboat / submarine here.

Same camera, waterline cut, wake underlay, cell, scale, and cameo as the old
builders, so the client fit (NAVAL_OPTS) and the sunk wrecks are unchanged.
Look is the modern Alliance line (render_alliance_kit.py): faceted haze-gray
superstructures, remote guns, sensor masts, neutral gray team panels. No insignia.

  gunboat     a fast patrol boat: hard-chined planing hull, a faceted deckhouse
              with a glazing band and a gray team roof, a pylon mast with a
              radar bar, a shielded 20mm remote gun forward, a RHIB in a cradle
              aft, fenders along the topsides.
  supplyboat  a cargo launch: blunt landing-craft bow with a ramp face, a faceted
              wheelhouse aft under a team roof, a well deck of banded crates
              and drums, a knuckle crane, fenders.
  submarine   running awash: a teardrop hull with only its back clear of the
              water, a tall faired sail with horizontal planes, a team band,
              a periscope and a sensor mast. No deck gun.

Row 0 = bow screen-south, then clockwise 22.5° through row 15.

  python tools/sprites/render_naval_small.py gunboat \\
      --out gridlock/packages/client/src/assets/units/gunboat/hull
"""

from __future__ import annotations

import argparse
import math
from pathlib import Path

import numpy as np

import render_alliance_kit as kit
from render_alliance_kit import Mesh, cylinder_z, slab, tube
from render_naval import NAVAL_SCALE, NAVAL_Z_MID, build_wake, cyl, hull_ring, write_cameo
from render_procedural import MAT, ellipse_ring, hex_rgb, render_turntable

MAT.update(
    {
        # Haze gray topsides and a darker boot-top band at the waterline.
        "haze": (hex_rgb("#8a949a"), 0.08, 1.0),
        "boot": (hex_rgb("#3e4a57"), 0.06, 1.0),
        "deckgray": (hex_rgb("#5e6468"), 0.04, 1.0),
        "rhib": (hex_rgb("#2f3a3a"), 0.10, 1.0),
    }
)


def hull_mat(r: int, s: int) -> str:
    """Deck dark, topsides haze gray, the chine and below in boot-top blue."""
    if s in (0, 1):
        return "deckgray"
    if s in (2, 7):
        return "haze"
    return "boot"


def facet_house(m: Mesh, x0: float, x1: float, hw: float, z0: float, z1: float, tumble: float = 0.22, mat: str = "haze") -> None:
    """A deckhouse whose every face leans in: the stealth look. Roof is the top outline."""
    bottom = [(x1, -hw), (x1, hw), (x0, hw), (x0, -hw)]
    top = [(x1 - tumble, -hw + tumble), (x1 - tumble, hw - tumble), (x0 + tumble * 0.6, hw - tumble), (x0 + tumble * 0.6, -hw + tumble)]
    slab(m, bottom, z0, z1, top, mat, "plate")


def pylon_mast(m: Mesh, x: float, z0: float, h: float, hw: float = 0.22) -> None:
    """A faired pylon mast with a radar bar across its head and a small dome."""
    slab(m, [(x + 0.35, -hw), (x + 0.35, hw), (x - 0.35, hw), (x - 0.35, -hw)], z0, z0 + h, [(x + 0.15, -hw * 0.5), (x + 0.15, hw * 0.5), (x - 0.15, hw * 0.5), (x - 0.15, -hw * 0.5)], "haze")
    m.box((x - 0.07, -0.9, z0 + h), (x + 0.07, 0.9, z0 + h + 0.12), "slat")
    m.box((x - 0.12, -0.12, z0 + h + 0.12), (x + 0.12, 0.12, z0 + h + 0.34), "radome")


def remote_gun(m: Mesh, x: float, z: float, barrel: float = 1.7) -> None:
    """A shielded 20mm remote weapon station on a pedestal, looking +x."""
    cylinder_z(m, x, 0.0, 0.42, z, z + 0.22, "wheel", 14)
    m.box((x - 0.35, -0.3, z + 0.22), (x + 0.3, 0.3, z + 0.75), "plate")
    # Angled shield across the front.
    slab(m, [(x + 0.3, -0.6), (x + 0.3, 0.6), (x + 0.05, 0.6), (x + 0.05, -0.6)], z + 0.22, z + 0.95,
         [(x + 0.42, -0.5), (x + 0.42, 0.5), (x + 0.2, 0.5), (x + 0.2, -0.5)], "haze")
    tube(m, (x + 0.35, 0.0, z + 0.6), (x + 0.35 + barrel, 0.0, z + 0.6), 0.07, "barrel", 8)
    m.box((x - 0.2, 0.3, z + 0.4), (x + 0.05, 0.48, z + 0.7), "sensor")


def rhib(m: Mesh, cx: float, cy: float, z: float, length: float = 2.6, beam: float = 1.0) -> None:
    """A rigid inflatable in a cradle: a dark tube ring round a shallow hull."""
    rings = []
    for t in (-1.0, -0.6, 0.0, 0.6, 1.0):
        x = cx + t * length / 2
        hw = beam / 2 * (1 - 0.35 * abs(t) ** 2) * (0.55 if t == 1.0 else 1.0)
        rings.append(ellipse_ring(x, cy, z + 0.22, hw, 0.2, 10))
    m.loft(rings, "rhib")
    for s in (-1, 1):
        m.box((cx - length * 0.3, cy + s * beam * 0.38 - 0.06, z), (cx + length * 0.3, cy + s * beam * 0.38 + 0.06, z + 0.1), "slat")


def fenders(m: Mesh, hw: float, xs, z: float = 0.5) -> None:
    for s in (-1, 1):
        for x in xs:
            cyl(m, (x, s * hw, z), 0, 0.15, 0.55, "tire", 8)


# --------------------------------------------------------------------------- gunboat


def build_gunboat() -> Mesh:
    """Fast patrol boat in meters. +x bow, +y port, +z up. Waterline at z=0."""
    m = Mesh()
    keel = -0.7
    stations = [
        (6.4, 0.08, 1.4, keel + 1.25),
        (5.5, 0.8, 1.3, keel + 0.55),
        (3.8, 1.45, 1.1, keel + 0.12),
        (1.0, 1.65, 1.0, keel),
        (-3.0, 1.65, 0.95, keel),
        (-5.8, 1.5, 0.95, keel + 0.05),
    ]
    m.loft([hull_ring(x, hb, dz, kz) for x, hb, dz, kz in stations], hull_mat)
    deck = 0.98
    # Faceted deckhouse amidships with a glazing band and a gray team roof.
    facet_house(m, -2.0, 1.3, 1.1, deck, deck + 1.15, tumble=0.25)
    m.box((1.06, -0.72, deck + 0.62), (1.14, 0.72, deck + 0.92), "sensor")
    for s in (-1, 1):
        m.box((-0.2, s * 0.92 - 0.04, deck + 0.62), (0.8, s * 0.92 + 0.04, deck + 0.9), "sensor")
    m.box((-1.75, -0.8, deck + 1.15), (0.95, 0.8, deck + 1.26), "team")
    pylon_mast(m, -1.1, deck + 1.26, 1.1)
    # Shielded 20mm remote gun on the foredeck.
    remote_gun(m, 3.1, deck)
    # RHIB in its cradle on the afterdeck, a stern bollard, exhausts low on the quarters.
    rhib(m, -4.0, 0.0, deck)
    for s in (-1, 1):
        m.box((-5.9, s * 0.95 - 0.15, 0.55), (-5.55, s * 0.95 + 0.15, 0.85), "wheel")
    fenders(m, 1.68, (-3.0, -0.5, 2.0))
    return m


# --------------------------------------------------------------------------- supply boat


def build_supplyboat() -> Mesh:
    """Cargo launch in meters, beamy and blunt. +x bow, +y port, +z up. Waterline at z=0."""
    m = Mesh()
    keel = -0.6
    stations = [
        (5.4, 1.5, 1.3, keel + 0.75),
        (4.8, 1.85, 1.15, keel + 0.3),
        (3.4, 2.0, 1.0, keel + 0.05),
        (0.5, 2.05, 0.95, keel),
        (-3.5, 2.05, 0.95, keel),
        (-5.4, 1.85, 1.0, keel + 0.1),
    ]
    m.loft([hull_ring(x, hb, dz, kz, chine=0.6) for x, hb, dz, kz in stations], hull_mat)
    deck = 0.95
    # Bow ramp face: a sloped plate closing the blunt bow, with a hazard stripe.
    slab(m, [(5.35, -1.45), (5.35, 1.45), (5.1, 1.45), (5.1, -1.45)], deck, deck + 0.9,
         [(5.75, -1.3), (5.75, 1.3), (5.55, 1.3), (5.55, -1.3)], "haze")
    m.box((5.6, -1.2, deck + 0.7), (5.78, 1.2, deck + 0.82), "hazard")
    # Faceted wheelhouse aft with a forward glazing band and a gray team roof.
    facet_house(m, -4.7, -2.5, 1.3, deck, deck + 1.25, tumble=0.25)
    m.box((-2.72, -0.9, deck + 0.7), (-2.64, 0.9, deck + 1.0), "sensor")
    m.box((-4.45, -1.0, deck + 1.25), (-2.85, 1.0, deck + 1.36), "team")
    pylon_mast(m, -3.9, deck + 1.36, 0.9, hw=0.18)
    # Open cargo well: a low coaming, then the load.
    for s in (-1, 1):
        m.box((-2.2, s * 1.6 - 0.07, deck), (4.6, s * 1.6 + 0.07, deck + 0.3), "plate")
    m.box((4.5, -1.6, deck), (4.64, 1.6, deck + 0.3), "plate")
    crates = [
        (2.6, -0.75, 0), (2.6, 0.75, 0), (1.1, -0.75, 0), (1.1, 0.75, 0), (3.8, 0.0, 0),
        (2.6, -0.4, 1), (1.2, 0.45, 1),
    ]
    for cx, cy, tier in crates:
        z0 = deck + tier * 0.6
        m.box((cx - 0.6, cy - 0.55, z0), (cx + 0.6, cy + 0.55, z0 + 0.58), "crate")
        m.box((cx - 0.62, cy - 0.57, z0 + 0.22), (cx + 0.62, cy + 0.57, z0 + 0.32), "hazard")
    for k, oy in enumerate((-1.0, -0.35, 0.35, 1.0)):
        cyl(m, (-0.6, oy, deck + 0.4), 2, 0.28, 0.8, "wheel" if k % 2 else "plate", 12)
    # Knuckle crane on the well's after edge: a pedestal, a raised boom, a folded jib.
    cylinder_z(m, -1.8, 0.9, 0.22, deck, deck + 0.5, "plate", 10)
    tube(m, (-1.8, 0.9, deck + 0.5), (-0.6, 0.9, deck + 2.3), 0.09, "hazard", 8)
    tube(m, (-0.6, 0.9, deck + 2.3), (1.4, 0.9, deck + 1.7), 0.07, "hazard", 8)
    fenders(m, 2.07, (-3.0, -0.5, 2.0))
    return m


# --------------------------------------------------------------------------- submarine


def build_submarine() -> Mesh:
    """Modern teardrop boat running awash, meters. +x bow, +y port, +z up. Waterline at z=0."""
    m = Mesh()
    zc = -0.75  # hull axis under the water: only the back of the hull shows
    stations = [(8.4, 0.08), (7.8, 0.7), (6.5, 1.3), (4.2, 1.62), (0.0, 1.68), (-4.2, 1.5), (-6.5, 1.0), (-8.0, 0.45), (-8.5, 0.1)]
    m.loft([ellipse_ring(x, 0.0, zc, r, r, 18) for x, r in stations], "boot")
    # Flat walkway along the back, a shade darker.
    casing = [
        [np.array([x, hw, 0.95]), np.array([x, -hw, 0.95]), np.array([x, -hw * 1.15, 0.72]), np.array([x, hw * 1.15, 0.72])]
        for x, hw in ((6.6, 0.15), (5.4, 0.5), (-5.4, 0.5), (-7.0, 0.15))
    ]
    m.loft(casing, lambda r, s: "deckgray" if s == 0 else "boot")
    # Faired sail: a tall slab leaning in, rounded leading edge, a gray team band, a flat top.
    plan = [(2.6, 0.0), (2.0, 0.7), (0.4, 0.95), (-1.8, 0.95), (-2.6, 0.55), (-2.6, -0.55), (-1.8, -0.95), (0.4, -0.95), (2.0, -0.7)]
    levels = [(0.9, 1.0), (2.5, 0.96), (2.75, 0.94), (3.4, 0.9)]
    sail = [[np.array([x * k, y * k, z]) for x, y in plan] for z, k in levels]
    m.loft(sail, lambda r, s: "team" if r == 1 else "haze")
    # Horizontal sail planes.
    for s in (-1, 1):
        m.box((-0.6, min(s * 0.9, s * 2.6), 2.2), (0.9, max(s * 0.9, s * 2.6), 2.32), "haze")
    # Periscope, sensor mast, and a small snorkel head behind them.
    cylinder_z(m, 0.4, 0.0, 0.08, 3.4, 5.0, "slat", 8)
    m.box((0.3, -0.1, 5.0), (0.65, 0.1, 5.2), "sensor")
    kit.mast(m, -0.6, 0.0, 3.4, 4.6, r=0.06, head=0.2)
    cylinder_z(m, -1.4, 0.0, 0.1, 3.4, 4.1, "plate", 8)
    # Stern planes and the rudder tip just breaking the surface.
    m.box((-7.6, -0.1, 0.1), (-6.4, 0.1, 1.1), "boot")
    return m


# --------------------------------------------------------------------------- entry points


def render_gunboat(out: Path, cell: int = 256, ss: int = 4) -> None:
    render_turntable(
        build_gunboat(), out, "gunboat_hull", "gunboat-hull.json", NAVAL_SCALE, NAVAL_Z_MID,
        cy_frac=0.56, cell=cell, ss=ss, clip_z=0.0, underlay=build_wake(7.8, 2.4, -0.4),
    )
    write_cameo(out, out.parent.parent / "gunboat-cameo.png")


def render_supplyboat(out: Path, cell: int = 256, ss: int = 4) -> None:
    render_turntable(
        build_supplyboat(), out, "supplyboat_hull", "supplyboat-hull.json", NAVAL_SCALE, NAVAL_Z_MID,
        cy_frac=0.56, cell=cell, ss=ss, clip_z=0.0, underlay=build_wake(7.2, 2.7, 0.1),
    )
    write_cameo(out, out.parent.parent / "supplyboat-cameo.png")


def render_submarine(out: Path, cell: int = 256, ss: int = 4) -> None:
    render_turntable(
        build_submarine(), out, "submarine_hull", "submarine-hull.json", NAVAL_SCALE, NAVAL_Z_MID,
        cy_frac=0.56, cell=cell, ss=ss, clip_z=0.0, underlay=build_wake(8.5, 2.1),
    )
    write_cameo(out, out.parent.parent / "submarine-cameo.png")


RENDER = {"gunboat": render_gunboat, "supplyboat": render_supplyboat, "submarine": render_submarine}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("what", choices=sorted(RENDER))
    ap.add_argument("--out", required=True)
    ap.add_argument("--preview", help="write a contact sheet here")
    args = ap.parse_args()
    out = Path(args.out)
    RENDER[args.what](out)
    if args.preview:
        kit.contact_sheet(out.parent, ["hull"], Path(args.preview))


if __name__ == "__main__":
    main()
