#!/usr/bin/env python3
"""Borg crewless emplacements: Spine Turret and Pulse Spire.

Same file set and JSON schema as render_ww2_guns.py, so the client draws them as forts (FORT_TYPES):
  <id>.png            the static base (pad, roots / spire), with its cast shadow
  <id>.json           pad metrics + rows, crewCols, order, gunZ, muzzleReach, pivotX/pivotY, cell
  <id>-cameo.png      base + head laid row 14 (south-east)
  <id>-gun.png        16 rows x 1 column: the traversing head. Crewless, so crewCols is 1 and
                      column 0 (nobody at the gun) is the only one. Every cell is the size and
                      anchor of <id>.png.
  <id>/00..23.png     the base turned in 15 degree steps, <id>/faces.json (turn_faces.py), so the
                      player can turn it before placing, as the WW2 guns.

  spineturret  t(1)  anti-infantry: a squat chitin bulb on clawed roots, a twin needle gatling head
  pulsespire   t(1)  anti-armour: a tall tapered spire, a long emitter barrel through green energy rings

Look and materials: render_borg_base.py (the Hive Core / Fusion Node / Assimilator kit: gunmetal and
chitin, cyan-green emissive glow, the same concrete pad), on render_ww2_guns.py's rows, canvas and
shading at the WW2 guns' 3x source zoom.

  cd tools/sprites && python3 render_borg_guns.py --out ../../gridlock/packages/client/src/assets/buildings [--only spineturret pulsespire]
"""

from __future__ import annotations

import argparse
import math
from pathlib import Path

import numpy as np

import render_ww2_guns as wg  # noqa: E402  (sets up the WW2 kit, ra.ZOOM = 3)
import render_borg_base as bb  # noqa: E402  (chains the Borg materials over it)

wf = wg.wf
ra = wg.ra
LM = wf.LM
ra.ZOOM = 3.0

C = 16.0  # footprint centre, t(1)


def lball(L: LM, c, r: float, mat: str, rings: int = 6, n: int = 14, squash: float = 1.0) -> None:
    """A sphere in a local frame, one part."""
    L.m.new_part()
    cx, cy, cz = c
    for i in range(rings):
        a0 = -math.pi / 2 + math.pi * i / rings
        a1 = -math.pi / 2 + math.pi * (i + 1) / rings
        z0, z1 = cz + r * squash * math.sin(a0), cz + r * squash * math.sin(a1)
        r0, r1 = max(r * math.cos(a0), 0.05), max(r * math.cos(a1), 0.05)
        L.cyl((cx, cy, z0), (cx, cy, z1), r0, r1, mat, n=n, caps=False, part=False)


def ltorus(L: LM, x: float, z: float, R: float, r: float, mat: str, segs: int = 14) -> None:
    """A ring round the local x axis (a barrel) at x, centre height z."""
    L.m.new_part()
    pts = [(x, R * math.cos(2 * math.pi * k / segs), z + R * math.sin(2 * math.pi * k / segs)) for k in range(segs)]
    for k in range(segs):
        L.cyl(pts[k], pts[(k + 1) % segs], r, r, mat, n=6, part=False)


def slab(L: LM) -> None:
    L.box((-C + 0.6, -C + 0.6, 0.0), (C - 0.6, C - 0.6, 1.0), "slab")


def claw_root(L: LM, a: float, r0: float, z0: float, r1: float, r2: float, rad: float) -> None:
    """A root arching out from (r0, z0) over a knee to a hooked claw dug in at r2."""
    c, s = math.cos(a), math.sin(a)
    hip = (r0 * c, r0 * s, z0)
    knee = (r1 * c, r1 * s, z0 + 1.6)
    foot = (r2 * c, r2 * s, 1.0)
    L.cyl(hip, knee, rad, rad * 0.8, "spine", n=6)
    L.cyl(knee, foot, rad * 0.8, rad * 0.3, "spine", n=6)
    # The claw hook, turned back in.
    tip = ((r2 - 1.4) * c, (r2 - 1.4) * s, 0.9)
    L.cyl(foot, tip, rad * 0.35, 0.1, "spine", n=5, part=False)


# ---------------------------------------------------------------- Spine Turret, t(1) x t(1)

ST_Z = 11.0  # bore height
ST_MUZZLE = 14.2


def spineturret_base(ground: bool = True) -> ra.Mesh:
    bb.RIB_C = (C, C)
    m = ra.Mesh()
    L = LM(m, cx=C, cy=C)
    if ground:
        slab(L)
    # A dark footing ring with a glow seam.
    L.cyl((0, 0, 1.0), (0, 0, 2.2), 9.0, 8.4, "steel_dark", n=16)
    L.cyl((0, 0, 2.2), (0, 0, 2.6), 8.3, 8.3, "glow", n=16, caps=False)
    # Clawed roots gripping the pad.
    for k in range(5):
        a = 2 * math.pi * k / 5 + 0.35
        claw_root(L, a, 6.0, 4.4, 10.5, 13.6, 1.5)
    # The squat ribbed bulb with a glowing girdle, and the collar the head turns on.
    lball(L, (0, 0, 5.2), 7.6, "ribbed", rings=7, n=24, squash=0.62)
    L.cyl((0, 0, 4.6), (0, 0, 5.4), 7.75, 7.75, "glow", n=24, caps=False)
    L.cyl((0, 0, 8.6), (0, 0, 9.4), 4.6, 4.2, "steel_dark", n=16)
    return m


def spineturret_gun(L: LM, crew: int) -> None:
    z = ST_Z
    # Turret ring and the domed beetle head.
    L.cyl((0, 0, 9.2), (0, 0, 9.9), 4.4, 4.4, "steel_dark", n=16)
    lball(L, (-0.6, 0, 10.2), 4.2, "steel", rings=6, n=16, squash=0.78)
    # A carapace hood over the back, ridged, and two spines raking back off it.
    lball(L, (-1.6, 0, 11.0), 3.4, "chitin_dark", rings=5, n=12, squash=0.9)
    for s in (-1, 1):
        L.cyl((-2.2, s * 1.4, 12.6), (-6.2, s * 2.4, 15.2), 0.9, 0.1, "spine", n=5)
    # The sensor eye on the face, under the guns.
    L.cyl((2.6, 0, z - 1.8), (3.6, 0, z - 1.8), 1.3, 1.1, "steel_dark", n=10)
    L.cyl((3.6, 0, z - 1.8), (3.9, 0, z - 1.8), 0.9, 0.9, "core", n=10, part=False)
    # Twin needle gatlings: a housing, a glow collar, a cluster of three needles, a muzzle ring.
    for s in (-1, 1):
        y = s * 2.1
        L.cyl((0.4, y, z), (4.4, y, z), 1.5, 1.35, "steel_dark", n=10)
        L.cyl((4.4, y, z), (5.2, y, z), 1.45, 1.45, "glow", n=10)
        for k in range(3):
            a = 2 * math.pi * k / 3 + 0.5
            dy, dz = 0.62 * math.cos(a), 0.62 * math.sin(a)
            L.cyl((5.2, y + dy, z + dz), (ST_MUZZLE - 0.6, y + dy, z + dz), 0.4, 0.32, "spine", n=5)
        L.cyl((ST_MUZZLE - 1.3, y, z), (ST_MUZZLE - 0.6, y, z), 1.05, 1.05, "steel_dark", n=10)
        L.cyl((ST_MUZZLE - 0.6, y, z), (ST_MUZZLE, y, z), 0.8, 0.8, "core", n=10, part=False)


# ---------------------------------------------------------------- Pulse Spire, t(1) x t(1)

PS_TOP = 22.0  # the spire's head plate
PS_Z = 25.2  # bore height
PS_MUZZLE = 17.5


def pulsespire_base(ground: bool = True) -> ra.Mesh:
    bb.RIB_C = (C, C)
    m = ra.Mesh()
    L = LM(m, cx=C, cy=C)
    if ground:
        slab(L)
    # Octagonal footing, a glow seam, the ribbed tapering spire with glowing bands.
    L.cyl((0, 0, 1.0), (0, 0, 3.0), 10.4, 9.6, "steel_dark", n=8)
    L.cyl((0, 0, 3.0), (0, 0, 3.5), 9.4, 9.4, "glow", n=8, caps=False)
    L.cyl((0, 0, 3.5), (0, 0, 5.0), 9.0, 7.6, "steel", n=8)
    L.cyl((0, 0, 5.0), (0, 0, PS_TOP), 5.2, 2.6, "ribbed", n=16)
    for zb in (9.0, 13.5, 18.0):
        r = 5.2 + (2.6 - 5.2) * (zb - 5.0) / (PS_TOP - 5.0)
        L.cyl((0, 0, zb), (0, 0, zb + 0.8), r + 0.5, r + 0.45, "glow", n=16, caps=False)
    # Three clawed buttress fins leaning on the spire.
    for k in range(3):
        a = 2 * math.pi * k / 3 + 0.5
        c, s = math.cos(a), math.sin(a)
        L.cyl((9.6 * c, 9.6 * s, 1.0), (3.6 * c, 3.6 * s, 15.0), 1.5, 0.5, "spine", n=6)
        L.cyl((9.6 * c, 9.6 * s, 1.0), (12.0 * c, 12.0 * s, 0.9), 1.2, 0.15, "spine", n=5)
    # The head plate the emitter turns on.
    L.cyl((0, 0, PS_TOP - 0.4), (0, 0, PS_TOP + 0.6), 3.6, 3.6, "steel_dark", n=14)
    return m


def pulsespire_gun(L: LM, crew: int) -> None:
    z = PS_Z
    # The yoke: a turntable, two cheeks, and the capacitor pod slung between them.
    L.cyl((0, 0, PS_TOP + 0.6), (0, 0, PS_TOP + 1.4), 3.4, 3.2, "steel_dark", n=14)
    for s in (-1, 1):
        L.hexa(
            [(-2.0, s * 1.8, PS_TOP + 1.4), (2.0, s * 1.8, PS_TOP + 1.4), (-2.0, s * 2.6, PS_TOP + 1.4), (2.0, s * 2.6, PS_TOP + 1.4),
             (-1.2, s * 1.8, z + 1.2), (1.2, s * 1.8, z + 1.2), (-1.2, s * 2.6, z + 1.2), (1.2, s * 2.6, z + 1.2)],
            "steel",
        )
    L.cyl((-5.0, 0, z), (2.4, 0, z), 2.0, 2.4, "steel_dark", n=14)
    L.cyl((-6.2, 0, z), (-5.0, 0, z), 1.2, 2.0, "steel_dark", n=14, part=False)
    # A glowing capacitor core showing in the pod's flank.
    L.cyl((-3.8, 0, z), (-1.0, 0, z), 2.15, 2.15, "core", n=14)
    # Rear spines, swept back like a tail.
    for s in (-1, 1):
        L.cyl((-5.0, s * 1.0, z + 1.0), (-9.0, s * 2.0, z + 3.2), 0.7, 0.1, "spine", n=5)
    # The long emitter barrel, stepped thinner, a field ring round it, and the lit focusing tip.
    L.cyl((2.4, 0, z), (6.0, 0, z), 1.3, 1.1, "steel", n=12)
    L.cyl((6.0, 0, z), (PS_MUZZLE - 1.2, 0, z), 1.0, 0.85, "steel", n=12)
    for x in (7.4, 11.6):
        L.cyl((x - 0.4, 0, z), (x + 0.4, 0, z), 1.2, 1.2, "steel_dark", n=12)
    ltorus(L, 9.5, z, 2.6, 0.42, "glow", segs=16)
    ltorus(L, 13.6, z, 1.8, 0.34, "glow", segs=14)
    L.cyl((PS_MUZZLE - 1.2, 0, z), (PS_MUZZLE - 0.4, 0, z), 1.2, 1.0, "steel_dark", n=12)
    L.cyl((PS_MUZZLE - 0.4, 0, z), (PS_MUZZLE, 0, z), 0.75, 0.75, "core", n=12, part=False)


# ---------------------------------------------------------------- render

GUNS = {
    "spineturret": wg.Gun("spineturret", 32.0, (4, 4), 18.0, 10.0, 0, spineturret_base, spineturret_gun, ST_Z, ST_MUZZLE),
    "pulsespire": wg.Gun("pulsespire", 32.0, (4, 4), 26.0, 12.0, 0, pulsespire_base, pulsespire_gun, PS_Z, PS_MUZZLE),
}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True, help="buildings asset folder")
    ap.add_argument("--only", nargs="*", choices=sorted(GUNS))
    ap.add_argument("--no-turned", action="store_true", help="skip the 24 turned base faces (quick look)")
    args = ap.parse_args()
    for name, g in GUNS.items():
        if args.only and name not in args.only:
            continue
        # Rotatable before placing: <id>/00..23.png + faces.json, as the WW2 guns.
        wg.render_gun(Path(args.out), g, turned=not args.no_turned)


if __name__ == "__main__":
    main()
