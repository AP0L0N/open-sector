#!/usr/bin/env python3
"""Xenite aircraft: the Wasp (fighter), the Scourge (dive bomber), the Gnat (spy drone), and the Overseer (hover craft). One 16-face hull each.

The Xenite answer to the Fw 190 and the Stuka (render_procedural.py), under
their lock: same numpy rasterizer, camera, light, outline, 0.062 px-per-meter
share of the 256 source cell (the Stuka's), face order, composed to the 128
cell at runtime with STUKA_OPTS (contactY 0.8, padding 2). The look is the
Xenite walkers' (xeno_walker.py): cold grey-green alloy plates, dark chitin,
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
  overseer hover craft: a floating hive eye, nothing like a plane. A ribbed
           chitin bell with glow seams and the gray team band, a skirt of
           glowing membrane round its rim, four humming membrane vanes out to
           the sides, a chitin prow with one great green eye on the nose (the
           heading), a cluster of emitters round a hot core under the belly,
           and six tendrils trailing down and back: their tips are the lowest
           point (the plane's wheels).
  gnat     spy drone: a tiny fat fly, one big glowing sensor eye over the face,
           two sensor whiskers, short broad wings, no weapon. Kept at true
           scale beside the Wasp, so it draws small (drawSize 41).

0001 = nose screen-south, then clockwise 22.5 deg through 0016. No insignia.

  python3 tools/sprites/render_xeno_air.py wasp
  python3 tools/sprites/render_xeno_air.py scourge
  python3 tools/sprites/render_xeno_air.py overseer
  python3 tools/sprites/render_xeno_air.py gnat
  python3 tools/sprites/render_xeno_air.py all

  python3 tools/sprites/render_xeno_air.py wasp --stroke wingup   # one stroke only
  python3 tools/sprites/render_xeno_air.py all --check-only        # re-check what is on disk

Writes gridlock/packages/client/src/assets/units/<id>/hull/0001..0016.png,
<id>/<id>-hull.json, <id>-cameo.png (72 px), and previews in
tools/sprites/preview/<id>-*.png.

Wing strokes. The Wasp, Scourge and Gnat hover and beat their wings all the
time, so each also gets <id>/wingup/ (upstroke: wings swung up about the root,
tips well over the body) and <id>/wingdown/ (downstroke: swept down under the
body), 0001..0016 each, plus <id>-wingup.json / <id>-wingdown.json; `hull/` is
the mid stroke. One command renders all three strokes (`--stroke` picks one).
The angles are FLAPPERS (dihedral about the body's long axis at the wing root,
fore/hind): Wasp and Scourge +55/+48 up, -40/-34 down; Gnat +62/+55, -55/-48.
Only the wings move (the Scourge's elytra stay raised), on the same camera,
light, outline, ss, scale and 256 canvas, so the body sits on the same pixels in
every stroke and the client can compose the three as layers of one union box.
tools/sprites/preview_xeno_strokes.py draws the side-by-side boards and checks
that (body-only renders identical across strokes, shipped hull = fresh render).
"""

from __future__ import annotations

import argparse
import math
from pathlib import Path

import numpy as np

import render_procedural as rp
from render_procedural import Mesh, render_turntable

import xeno_walker as bw
from xeno_walker import dome, ellipsoid, knob, shell, tube, tube_x
from render_xeno_naval import UNITS, cameo72, check

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
         tip_lead: float, tip_trail: float, z0: float, z1: float, veins: int = 3, n: int = 10,
         dihedral: float = 0.0) -> None:
    """A flat membrane wing: rounded tip, a chitin spar on the leading edge, glowing veins root to tip.

    `dihedral` (degrees, + up) swings the whole wing, spar and veins with it, about
    the body's long axis through the wing root (y = side * root_y, z = z0): one
    flap stroke. 0 builds the mid stroke exactly as before (the hull art).
    """
    if dihedral:
        ca, sa = math.cos(math.radians(dihedral)), math.sin(math.radians(dihedral))

        def rot(p) -> np.ndarray:
            p = np.asarray(p, dtype=float)
            sp, h = side * p[1] - root_y, p[2] - z0  # outward span, height above the root
            return np.array([p[0], side * (root_y + sp * ca - h * sa), z0 + sp * sa + h * ca])
    else:
        def rot(p) -> np.ndarray:
            return p

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
        a, b = m.v(rot(pts_lead[i])), m.v(rot(pts_lead[i + 1]))
        c, d = m.v(rot(pts_trail[i + 1])), m.v(rot(pts_trail[i]))
        m.quad(a, b, c, d, "membrane")
    # Leading-edge spar.
    for i in range(n - 1):
        r = 0.09 * (1 - i / n) + 0.03
        tube(m, rot(pts_lead[i] + np.array([0, 0, 0.02])), rot(pts_lead[i + 1] + np.array([0, 0, 0.02])), r, r * 0.9, "chitin", n=5)
    # Veins fan from the root to the trailing edge, lying on the membrane.
    for k in range(veins):
        f = (k + 1) / (veins + 1)
        root = pts_lead[0] * (1 - f) + pts_trail[0] * f + np.array([0, 0, 0.03])
        j = min(n, int(round(n * (0.55 + 0.4 * (1 - f)))))
        tip = pts_lead[j] * (1 - f * 0.9) + pts_trail[j] * (f * 0.9) + np.array([0, 0, 0.03])
        tube(m, rot(root), rot(tip), 0.05, 0.03, "vein", n=4)


def build_wasp(fore: float = 0.0, hind: float = 0.0) -> Mesh:
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
        wing(m, s, 2.45, 1.0, 0.6, 5.2, 1.25, 0.15, wz, wz + 0.4, veins=3, dihedral=fore)
        wing(m, s, 0.85, -0.45, 0.55, 3.7, -0.3, -1.0, wz - 0.1, wz + 0.15, veins=2, n=8, dihedral=hind)
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


def build_scourge(fore: float = 0.0, hind: float = 0.0) -> Mesh:
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
        wing(m, s, 1.6, 0.0, 1.1, 7.0, 0.5, -0.9, wz, wz + 0.55, veins=3, n=12, dihedral=fore)
        wing(m, s, -0.4, -2.0, 1.0, 4.6, -1.2, -2.4, wz - 0.15, wz + 0.15, veins=2, n=8, dihedral=hind)
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


def build_overseer() -> Mesh:
    """Hover craft in meters. +x nose, +y left, +z up. Tendril tips at z = 0."""
    m = Mesh()
    zb = 1.9  # rim of the bell
    seg = 20
    # The bell: ribbed chitin over alloy, glow seams, the team band near the crown.
    dome(m, 0.0, 0.0, zb, 1.9, 1.9, 1.35, bw.banded_dome_mat(seg, (3,), team_seg=None, team_rings=(5,)), rings=7, seg=seg)
    # Membrane skirt round the rim, flaring down and out.
    top = [np.array([1.9 * math.cos(2 * math.pi * s / seg), 1.9 * math.sin(2 * math.pi * s / seg), zb + 0.02]) for s in range(seg)]
    low = [np.array([2.35 * math.cos(2 * math.pi * s / seg), 2.35 * math.sin(2 * math.pi * s / seg), zb - 0.45]) for s in range(seg)]
    m.loft([top, low], "membrane")
    for s in range(0, seg, 2):
        a = 2 * math.pi * s / seg
        tube(m, (1.9 * math.cos(a), 1.9 * math.sin(a), zb + 0.02), (2.33 * math.cos(a), 2.33 * math.sin(a), zb - 0.43), 0.05, 0.03, "vein", n=4)
    # Four humming vanes out to the sides, a little swept: chitin spar, membrane blade, glowing vein.
    for ang in (math.radians(55), math.radians(125), math.radians(-55), math.radians(-125)):
        ux, uy = math.cos(ang), math.sin(ang)
        r0, r1 = 1.75, 3.6
        z0, z1 = zb + 0.35, zb + 0.55
        px, py = -uy, ux
        a = m.v((ux * r0 + px * 0.45, uy * r0 + py * 0.45, z0))
        b = m.v((ux * r1 + px * 0.2, uy * r1 + py * 0.2, z1))
        c = m.v((ux * r1 - px * 0.2, uy * r1 - py * 0.2, z1))
        d = m.v((ux * r0 - px * 0.45, uy * r0 - py * 0.45, z0))
        m.quad(a, b, c, d, "membrane")
        tube(m, (ux * r0, uy * r0, z0 + 0.03), (ux * r1, uy * r1, z1 + 0.03), 0.09, 0.04, "chitin", n=5)
        tube(m, (ux * (r0 + 0.3) + px * 0.2, uy * (r0 + 0.3) + py * 0.2, z0 + 0.05), (ux * (r1 - 0.2), uy * (r1 - 0.2), z1 + 0.05), 0.04, 0.03, "vein", n=4)
        knob(m, (ux * r0, uy * r0, z0), 0.2, "seam")
    # Prow and the great eye on the nose: the heading.
    tube(m, (1.4, 0.0, zb + 0.55), (2.75, 0.0, zb + 0.25), 0.55, 0.12, "chitin", n=9)
    ellipsoid(m, (2.05, 0.0, zb + 0.62), (0.42, 0.44, 0.4), "eye", rings=6, seg=12)
    for s in (-1, 1):
        knob(m, (1.75, s * 0.62, zb + 0.48), 0.15, "eye")
    # Crest down the crown, front to back.
    tube(m, (0.9, 0.0, zb + 1.3), (-1.3, 0.0, zb + 1.55), 0.16, 0.05, "claw", n=5)
    for x in (0.4, -0.4):
        tube(m, (x, 0.0, zb + 1.4), (x - 0.4, 0.0, zb + 1.9), 0.11, 0.02, "claw", n=5)
    # Emitter cluster round a hot core under the belly.
    ellipsoid(m, (0.0, 0.0, zb - 0.15), (1.5, 1.5, 0.35), "chitin", rings=6, seg=16)
    knob(m, (0.0, 0.0, zb - 0.55), 0.5, "core")
    for k in range(6):
        a = 2 * math.pi * (k + 0.5) / 6
        ex, ey = 0.85 * math.cos(a), 0.85 * math.sin(a)
        tube(m, (ex, ey, zb - 0.25), (ex * 0.8, ey * 0.8, zb - 0.95), 0.13, 0.09, "barrel", n=6)
        knob(m, (ex * 0.8, ey * 0.8, zb - 0.98), 0.1, "seam")
    # Six tendrils trailing down and back: the lowest point.
    for k in range(6):
        a = 2 * math.pi * k / 6 + math.pi / 6
        rx, ry = 1.45 * math.cos(a), 1.45 * math.sin(a)
        mid = (rx * 0.95 - 0.35, ry * 0.95, zb - 1.0)
        tube(m, (rx, ry, zb - 0.3), mid, 0.11, 0.08, "limb", n=5)
        tube(m, mid, (rx * 0.85 - 0.75, ry * 0.85, 0.05), 0.08, 0.03, "limb", n=5)
        knob(m, (rx * 0.85 - 0.75, ry * 0.85, 0.08), 0.07, "vein")
    return m


def build_gnat(fore: float = 0.0, hind: float = 0.0) -> Mesh:
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
        wing(m, s, 0.6, -0.3, 0.3, 1.75, -0.2, -1.05, wz, wz + 0.16, veins=2, n=8, dihedral=fore)
        wing(m, s, -0.1, -0.75, 0.28, 1.2, -0.75, -1.3, wz - 0.06, wz + 0.04, veins=1, n=6, dihedral=hind)
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
    "overseer": (build_overseer, 1.9, "fw190", 56.0),
    "gnat": (build_gnat, 0.6, "fw190", 56.0),
}


# Wing strokes of the fliers: folder -> (forewing, hindwing) dihedral in degrees about the
# wing root. `hull` is the mid stroke (the plain hull art); the hindwings lag the forewings
# a little. Same mesh body, camera, scale and canvas in every stroke: only the wings move.
# The Gnat's short wings beat deeper so the stroke still reads at its 41 px.
STROKES = {
    "hull": (0.0, 0.0),
    "wingup": (55.0, 48.0),
    "wingdown": (-40.0, -34.0),
}
FLAPPERS = {
    "wasp": STROKES,
    "scourge": STROKES,
    "gnat": {"hull": (0.0, 0.0), "wingup": (62.0, 55.0), "wingdown": (-55.0, -48.0)},
}


def strokes_of(unit: str) -> list[str]:
    return list(FLAPPERS[unit]) if unit in FLAPPERS else ["hull"]


def render(unit: str, ss: int = 4, check_only: bool = False, only: str | None = None) -> None:
    build, z_mid, ref, ref_draw = UNITS_SPEC[unit]
    for stroke in strokes_of(unit):
        if only and stroke != only:
            continue
        out = UNITS / unit / stroke
        if not check_only:
            mesh = build(*FLAPPERS[unit][stroke]) if unit in FLAPPERS else build()
            render_turntable(mesh, out, f"{unit}_{stroke}", f"{unit}-{stroke}.json", SCALE_FRAC, z_mid, cell=256, ss=ss)
        if stroke == "hull":
            cameo72(out, UNITS / f"{unit}-cameo.png")
            check(unit, out, 0.8, 2, ref, ref_draw, "STUKA_OPTS")
        else:
            check(f"{unit}-{stroke}", out, 0.8, 2, ref, ref_draw, "STUKA_OPTS")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("what", choices=["wasp", "scourge", "gnat", "overseer", "all"])
    ap.add_argument("--ss", type=int, default=4)
    ap.add_argument("--check-only", action="store_true")
    ap.add_argument("--stroke", choices=list(STROKES), help="render only this wing stroke (default: all)")
    args = ap.parse_args()
    for u in (UNITS_SPEC if args.what == "all" else [args.what]):
        render(u, args.ss, args.check_only, args.stroke)


if __name__ == "__main__":
    main()
