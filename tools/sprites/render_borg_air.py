#!/usr/bin/env python3
"""Borg aircraft: the Wasp (fighter), the Scourge (dive bomber), and the Gnat (spy drone). One 16-face hull each.

The Borg answer to the Fw 190 and the Stuka (render_procedural.py), under
their lock: same numpy rasterizer, camera, light, outline, 0.062 px-per-meter
share of the 256 source cell (the Stuka's), face order, composed to the 128
cell at runtime with STUKA_OPTS (contactY 0.8, padding 2). The look is the
Borg walkers' (borg_walker.py): cold grey-green alloy plates, dark chitin,
sickly green glow, gray team plate on the back; the wings are a pale green
membrane, translucent, with chitin spars and glowing veins.

  wasp     fighter: an insect on two pairs of veined wings, compound eyes and
           mandibles on the head, a plated thorax with the team plate, a
           ribbed abdomen ending in a sting, and one pulse cannon slung under
           each forewing (glowing coils, hot muzzle). Legs folded under the
           thorax are the lowest point (the plane's wheels).
  scourge  dive bomber: a heavy beetle. Split elytra domed over the back with
           a glow seam down the join, a plated pronotum and a horned head,
           long veined wings from under the elytra, and a glowing plasma bomb
           pod slung in chitin claws under the belly.
  gnat     spy drone: a tiny fat fly, one big glowing sensor eye over the face,
           two sensor whiskers, short broad wings, no weapon. Kept at true
           scale beside the Wasp, so it draws small (drawSize 41).

0001 = nose screen-south, then clockwise 22.5 deg through 0016. No insignia.

  python3 tools/sprites/render_borg_air.py wasp
  python3 tools/sprites/render_borg_air.py scourge
  python3 tools/sprites/render_borg_air.py gnat
  python3 tools/sprites/render_borg_air.py all

Writes gridlock/packages/client/src/assets/units/<id>/hull/0001..0016.png,
<id>/<id>-hull.json, <id>-cameo.png (72 px), and previews in
tools/sprites/preview/<id>-*.png.
"""

from __future__ import annotations

import argparse
import math
from pathlib import Path

import numpy as np

import render_procedural as rp
from render_procedural import Mesh, render_turntable

import borg_walker as bw
from borg_walker import ellipsoid, knob, shell, tube, tube_x
from render_borg_naval import UNITS, cameo72, check

# Wing membrane: pale green, see-through; its own edge gets the outline (alpha > 0.5).
rp.MAT.update(
    {
        "membrane": (rp.hex_rgb("#a8e6c4"), 0.0, 0.56),
        "vein": (rp.hex_rgb("#46e69a"), 0.0, 1.0),
    }
)
import render_seed as rs  # noqa: E402

rs.EMISSIVE.add("vein")

SCALE_FRAC = 0.062  # the Stuka's and the Fw 190's meters -> px


def wing(m: Mesh, side: int, root_lead: float, root_trail: float, root_y: float, tip_y: float,
         tip_lead: float, tip_trail: float, z0: float, z1: float, veins: int = 3, n: int = 10) -> None:
    """A flat membrane wing: rounded tip, a chitin spar on the leading edge, glowing veins root to tip."""
    pts_lead = []
    pts_trail = []
    for i in range(n + 1):
        t = i / n
        y = root_y + (tip_y - root_y) * t
        z = z0 + (z1 - z0) * t
        # Rounded tip: the chord closes in over the last 30 % of the span.
        round_ = math.sqrt(max(0.0, 1 - max(0.0, (t - 0.7) / 0.3) ** 2)) if t > 0.7 else 1.0
        lead = root_lead + (tip_lead - root_lead) * t
        trail = root_trail + (tip_trail - root_trail) * t
        mid = (lead + trail) / 2
        half = (lead - trail) / 2 * max(round_, 0.08)
        pts_lead.append(np.array([mid + half, side * y, z]))
        pts_trail.append(np.array([mid - half, side * y, z]))
    for i in range(n):
        a, b = m.v(pts_lead[i]), m.v(pts_lead[i + 1])
        c, d = m.v(pts_trail[i + 1]), m.v(pts_trail[i])
        m.quad(a, b, c, d, "membrane")
    # Leading-edge spar.
    for i in range(n - 1):
        r = 0.09 * (1 - i / n) + 0.03
        tube(m, pts_lead[i] + np.array([0, 0, 0.02]), pts_lead[i + 1] + np.array([0, 0, 0.02]), r, r * 0.9, "chitin", n=5)
    # Veins fan from the root to the trailing edge, lying on the membrane.
    for k in range(veins):
        f = (k + 1) / (veins + 1)
        root = pts_lead[0] * (1 - f) + pts_trail[0] * f + np.array([0, 0, 0.03])
        j = min(n, int(round(n * (0.55 + 0.4 * (1 - f)))))
        tip = pts_lead[j] * (1 - f * 0.9) + pts_trail[j] * (f * 0.9) + np.array([0, 0, 0.03])
        tube(m, root, tip, 0.05, 0.03, "vein", n=4)


def build_wasp() -> Mesh:
    """Insect fighter in meters. +x nose, +y left wing, +z up. Folded legs at z = 0."""
    m = Mesh()
    zc = 1.55
    # Head: compound eyes, mandibles.
    shell(m, (3.35, 0.0, zc + 0.05), (0.7, 0.62, 0.55), 2, seg=14)
    for s in (-1, 1):
        ellipsoid(m, (3.55, s * 0.42, zc + 0.2), (0.36, 0.24, 0.3), "eye", rings=5, seg=10)
        tube(m, (3.85, s * 0.25, zc - 0.25), (4.45, s * 0.08, zc - 0.35), 0.11, 0.03, "claw", n=5)
    # Thorax with the team plate on top.
    shell(m, (1.75, 0.0, zc + 0.05), (1.25, 0.78, 0.72), 2, team=(0, 1), seg=16)
    # Waist and the ribbed abdomen, a sting at the tail.
    tube(m, (0.6, 0.0, zc), (0.1, 0.0, zc + 0.05), 0.32, 0.26, "chitin", n=8)
    shell(m, (-1.95, 0.0, zc + 0.12), (2.15, 0.62, 0.58), 4, seg=14)
    tube(m, (-4.0, 0.0, zc + 0.15), (-4.85, 0.0, zc + 0.05), 0.2, 0.02, "claw", n=6)
    knob(m, (-4.05, 0.0, zc + 0.15), 0.14, "seam")
    # Forewings and hindwings, a little dihedral.
    wz = zc + 0.45
    for s in (-1, 1):
        wing(m, s, 2.45, 1.0, 0.6, 5.2, 1.25, 0.15, wz, wz + 0.4, veins=3)
        wing(m, s, 0.85, -0.45, 0.55, 3.7, -0.3, -1.0, wz - 0.1, wz + 0.15, veins=2, n=8)
    # Twin pulse cannons, one slung under each forewing.
    for s in (-1, 1):
        y, z = s * 1.75, wz - 0.42
        tube(m, (1.2, s * 1.0, wz - 0.05), (1.4, y, z + 0.1), 0.1, 0.08, "chitin", n=5)  # pylon
        tube_x(m, -0.5, 1.6, y, z, 0.2, "chitin", n=10)
        tube_x(m, 1.6, 3.15, y, z, 0.11, "barrel", n=8)
        for x in (1.85, 2.35):
            tube_x(m, x, x + 0.14, y, z, 0.17, "seam", n=8)
        knob(m, (3.25, y, z), 0.15, "core")
    # Three pairs of legs folded under the thorax: the lowest point.
    for s in (-1, 1):
        for hx, fx in ((2.4, 3.0), (1.75, 1.6), (1.1, 0.2)):
            knee = (hx + (fx - hx) * 0.4, s * 0.95, zc - 0.45)
            tube(m, (hx, s * 0.45, zc - 0.45), knee, 0.09, 0.07, "limb", n=5)
            tube(m, knee, (fx, s * 0.55, 0.05), 0.07, 0.03, "claw", n=5)
    return m


def build_scourge() -> Mesh:
    """Beetle dive bomber in meters. +x nose, +y left wing, +z up. Folded legs at z = 0."""
    m = Mesh()
    zc = 2.05
    # Elytra: two domed wing cases over the back, a glow seam down the join, team plate at the shoulders.
    for s in (-1, 1):
        ellipsoid(m, (-0.55, s * 0.62, zc + 0.1), (2.75, 0.78, 0.92), lambda r, k: "alloy_hi" if r % 3 else "alloy", rings=12, seg=16)
    m.box((-3.1, -0.05, zc + 0.6), (2.0, 0.05, zc + 1.06), "seam")
    m.box((1.0, -1.1, zc + 0.7), (1.7, 1.1, zc + 0.8), "team")
    # Belly under the elytra.
    ellipsoid(m, (-0.4, 0.0, zc - 0.25), (2.9, 1.15, 0.65), "chitin", rings=10, seg=14)
    # Pronotum shield and the horned head.
    shell(m, (2.55, 0.0, zc + 0.1), (0.95, 1.12, 0.72), 2, seg=16)
    shell(m, (3.65, 0.0, zc - 0.05), (0.55, 0.62, 0.48), 2, seg=14)
    tube(m, (3.9, 0.0, zc + 0.25), (4.75, 0.0, zc + 1.15), 0.26, 0.04, "claw", n=7)
    for s in (-1, 1):
        knob(m, (4.0, s * 0.42, zc + 0.05), 0.16, "eye")
        tube(m, (4.05, s * 0.32, zc - 0.3), (4.6, s * 0.12, zc - 0.45), 0.12, 0.03, "claw", n=5)
    # Long wings out from under the elytra.
    wz = zc + 0.2
    for s in (-1, 1):
        wing(m, s, 1.6, 0.0, 1.1, 7.0, 0.5, -0.9, wz, wz + 0.55, veins=3, n=12)
        wing(m, s, -0.4, -2.0, 1.0, 4.6, -1.2, -2.4, wz - 0.15, wz + 0.15, veins=2, n=8)
    # Plasma bomb pod slung under the belly in four chitin claws, nose and tail caps, fins.
    pz = 0.68
    ellipsoid(m, (-0.3, 0.0, pz), (1.75, 0.62, 0.62), "core", rings=10, seg=12)
    for x in (-1.0, 0.25):
        tube_x(m, x, x + 0.18, 0.0, pz, 0.62, "chitin", n=12)
    ellipsoid(m, (1.4, 0.0, pz), (0.36, 0.44, 0.44), "chitin", rings=5, seg=10)
    ellipsoid(m, (-2.0, 0.0, pz), (0.34, 0.4, 0.4), "chitin", rings=5, seg=10)
    for s in (-1, 1):
        tube(m, (-2.2, 0.0, pz), (-2.65, s * 0.5, pz + 0.05), 0.08, 0.03, "claw", n=4)
        for x in (-0.7, 0.4):
            tube(m, (x, s * 0.75, zc - 0.65), (x + 0.1, s * 0.55, pz + 0.1), 0.11, 0.05, "claw", n=5)
    # Legs folded under the pronotum: the lowest point.
    for s in (-1, 1):
        for hx, fx in ((2.7, 3.2), (1.9, 2.0)):
            knee = (hx, s * 1.15, zc - 0.85)
            tube(m, (hx, s * 0.7, zc - 0.55), knee, 0.12, 0.09, "limb", n=5)
            tube(m, knee, (fx, s * 0.95, 0.05), 0.09, 0.03, "claw", n=5)
    return m


def build_gnat() -> Mesh:
    """Tiny spy fly in meters. +x nose, +y left wing, +z up. Dangling legs at z = 0.

    Kept a little larger than a real fly would be beside the Wasp so it still reads
    at its small draw size: the one big glowing sensor eye on the head is the tell.
    """
    m = Mesh()
    zc = 0.7
    # Head: one big sensor eye over the face, a compound eye each side.
    shell(m, (0.95, 0.0, zc), (0.42, 0.44, 0.38), 1, seg=12)
    ellipsoid(m, (1.22, 0.0, zc + 0.08), (0.3, 0.32, 0.3), "core", rings=6, seg=12)
    for s in (-1, 1):
        ellipsoid(m, (0.98, s * 0.36, zc + 0.04), (0.2, 0.15, 0.2), "eye", rings=4, seg=8)
    # Antenna whiskers swept back off the crown.
    for s in (-1, 1):
        tube(m, (1.05, s * 0.1, zc + 0.32), (0.7, s * 0.36, zc + 0.7), 0.04, 0.018, "claw", n=4)
        knob(m, (0.7, s * 0.36, zc + 0.7), 0.06, "seam")
    # Thorax with the team plate on top, a fat ribbed abdomen with a glow tip.
    shell(m, (0.22, 0.0, zc + 0.04), (0.55, 0.5, 0.44), 1, team=(0, 1), seg=12)
    shell(m, (-0.78, 0.0, zc + 0.06), (0.7, 0.42, 0.38), 3, seg=12)
    knob(m, (-1.48, 0.0, zc + 0.08), 0.1, "seam")
    # Two pairs of short, broad wings, swept back a little.
    wz = zc + 0.4
    for s in (-1, 1):
        wing(m, s, 0.6, -0.3, 0.3, 1.75, -0.2, -1.05, wz, wz + 0.16, veins=2, n=8)
        wing(m, s, -0.1, -0.75, 0.28, 1.2, -0.75, -1.3, wz - 0.06, wz + 0.04, veins=1, n=6)
    # Three pairs of thin legs hanging under the thorax: the lowest point.
    for s in (-1, 1):
        for hx, fx in ((0.5, 0.72), (0.22, 0.16), (-0.06, -0.4)):
            knee = (hx + (fx - hx) * 0.4, s * 0.52, zc - 0.28)
            tube(m, (hx, s * 0.24, zc - 0.26), knee, 0.05, 0.04, "limb", n=4)
            tube(m, knee, (fx, s * 0.36, 0.03), 0.04, 0.02, "claw", n=4)
    return m


UNITS_SPEC = {
    # id: (builder, z_mid, EU ref, EU ref drawSize base (before UNIT_VISUAL_SCALE))
    "wasp": (build_wasp, 1.0, "fw190", 56.0),
    "scourge": (build_scourge, 1.2, "stuka", 63.0),
    "gnat": (build_gnat, 0.6, "fw190", 56.0),
}


def render(unit: str, ss: int = 4, check_only: bool = False) -> None:
    build, z_mid, ref, ref_draw = UNITS_SPEC[unit]
    out = UNITS / unit / "hull"
    if not check_only:
        render_turntable(build(), out, f"{unit}_hull", f"{unit}-hull.json", SCALE_FRAC, z_mid, cell=256, ss=ss)
    cameo72(out, UNITS / f"{unit}-cameo.png")
    check(unit, out, 0.8, 2, ref, ref_draw, "STUKA_OPTS")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("what", choices=["wasp", "scourge", "gnat", "all"])
    ap.add_argument("--ss", type=int, default=4)
    ap.add_argument("--check-only", action="store_true")
    args = ap.parse_args()
    for u in (UNITS_SPEC if args.what == "all" else [args.what]):
        render(u, args.ss, args.check_only)


if __name__ == "__main__":
    main()
