#!/usr/bin/env python3
"""Industrial map buildings and street lamps for the Map Builder.

Four large civilian lots, each on its own yard, in four door faces (east,
south, west, north, the order `CIV_FACES` reads them):

  factory    t(5)  brick hall under a north-light sawtooth roof, office wing, tall stack
  warehouse  t(4)  long gabled brick store, loading dock, rail spur, stacked crates
  foundry    t(5)  corrugated casting shed with a monitor roof, cupola furnace, two stacks, ore heap
  granary    t(4)  three concrete silos, an elevator head house, conveyor gallery, brick shed

and four long lots that are not squares. A long lot keeps its tile box when the
builder turns it (a house never turns its ground), so its four faces are the
east-door lot, that lot mirrored across its long axis, the west-door lot, and that
one mirrored: every face fills the same W x H box.

  hall       t(8) x t(3)  aircraft assembly hall: long clerestory roof, rail doors on the gable, office annex
  works      t(6) x t(5)  L-shaped machine works: two wings round a concrete apron, water tower, stack
  shed       t(7) x t(2)  engine shed: two tracks run the length of it, a smoke-stained roof, a water crane
  boiler     t(3) x t(6)  boiler house: coal bunker, conveyor, boiler hall, tall stack

and street lamps. The ones that light all round are one image each (props, no facings):

  gaslamp     short cast-iron post with a glazed lantern
  streetlamp  tall post with a swan-neck arm and a bell shade
  floodlight  yard mast with two flood heads
  twinlamp    boulevard post with two scroll arms and two globes
  sodium      concrete post with a long outreach arm and a cobra head

The aimed ones throw a beam one way, so the builder turns them before placing.
Each is modelled looking east and turned through AIM_FACES faces, 15 degrees apart,
clockwise on screen (east toward south), the steps `tool.turn` takes:

  spotpole    steel pole with a drum searchlight on a yoke, tipped down
  yardflood   tripod work light with a square flood head and a generator box

Look: the inked structure style of render_airfield.py (same mesh, raster,
ink, silhouette, key light, and cast shadow), so the lots read as the same
world as the Research Facility and the Radar. Each building is modelled once
with its doors looking east and turned in 90° steps for the other faces, so
every face shares one palette, one scale, and one yard.

  python tools/sprites/render_industry.py --out gridlock/packages/client/src/assets
  python tools/sprites/render_industry.py --out ... --only factory,gaslamp
  python tools/sprites/render_industry.py --out ... --preview   # also a contact sheet in preview/

Buildings land in <out>/buildings/<type>{,-s,-w,-n}.png with industry.json
(pad metrics per face, for `building()` in render/sprites.ts). Lamps land in
<out>/terrain/lamp-<type>.png (an aimed lamp: lamp-<type>-<NN>.png, NN = face)
with their contact and bulb pixels in lamps.json (for `LAMP_SPRITES`). Every face
of an aimed lamp shares one canvas and one crop, so it draws at one scale.
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

import render_airfield as ra
from turn_faces import turn_mesh

HERE = Path(__file__).resolve().parent
PREVIEW = HERE / "preview"

SS = ra.SS
MARGIN = 6.0  # world px round the drawn bounds
FACES = ("", "-s", "-w", "-n")  # east, south, west, north


def rgb(h: str) -> np.ndarray:
    return ra.rgb(h)


# ---------------------------------------------------------------- materials

_base_tex = ra.tex


def tex(mat: str, P: np.ndarray, n: np.ndarray) -> np.ndarray:
    X, Y, Z = P[:, 0], P[:, 1], P[:, 2]
    nf = ra.vnoise(X / 1.1 + Z * 0.7, Y / 1.1 - Z * 0.5, 7)
    nm = ra.fbm(X / 6 + Z * 0.2, Y / 6 + Z * 0.3, 9, 3)
    wall = abs(n[2]) < 0.3
    along = X if abs(n[1]) >= abs(n[0]) else Y

    def base(h):
        return np.broadcast_to(rgb(h), (len(X), 3)).copy()

    if mat == "yard":
        # Worn concrete apron in big slabs, oil stains, grass in the joints at the edge.
        c = base("#9d9a8c") * (0.88 + 0.14 * nm[:, None]) * (0.95 + 0.07 * nf[:, None])
        joint = (np.abs(np.mod(X, 20.0) - 10.0) > 9.7) | (np.abs(np.mod(Y, 20.0) - 10.0) > 9.7)
        c[joint] *= 0.72
        stain = ra.smooth(0.68, 0.86, ra.fbm(X / 9, Y / 9, 31))
        c = ra.mix(c, base("#4b4a43"), stain * 0.45)
        return c
    if mat == "cobble":
        # Setts in the yard round the door: small offset blocks.
        row = np.floor(Y / 2.2)
        off = (row % 2) * 1.6
        cx_ = np.floor((X + off) / 3.2)
        tone = ra.cell_rand(cx_, row, 41)
        c = ra.mix(base("#77736a"), base("#928d80"), tone)
        gap = (np.mod(Y, 2.2) < 0.3) | (np.mod(X + off, 3.2) < 0.3)
        c[gap] *= 0.62
        return c * (0.94 + 0.08 * nf[:, None])
    if mat in ("brick", "brick_dark"):
        if not wall:
            return base("#6e3a2a") * (0.9 + 0.12 * nm[:, None])
        course = 0.9
        row = np.floor(Z / course)
        off = (row % 2) * 1.0
        bi = np.floor((along + off) / 2.0)
        tone = ra.cell_rand(bi, row, 17 if mat == "brick" else 23)
        lo, hi = ("#8a3f2b", "#a85a3c") if mat == "brick" else ("#5a2a20", "#6f3627")
        c = ra.mix(base(lo), base(hi), tone * 0.8 + nf * 0.2)
        mortar = (np.mod(Z, course) < 0.16) | (np.mod(along + off, 2.0) < 0.16)
        c[mortar] = c[mortar] * 0.55 + rgb("#b9ae98") * 0.45
        soot = ra.smooth(0.55, 0.85, ra.fbm(along / 6, Z / 10, 51)) * 0.35
        return c * (1 - soot)[:, None]
    if mat == "concrete_wall":
        c = base("#b4ae9d") * (0.9 + 0.12 * nm[:, None]) * (0.95 + 0.08 * nf[:, None])
        c[np.mod(Z, 6.0) < 0.25] *= 0.78  # lift lines
        streak = ra.smooth(0.65, 0.9, ra.vnoise(along / 1.4, Z / 9, 19)) * 0.2
        return c * (1 - streak)[:, None]
    if mat == "silo":
        # Slipformed concrete: faint horizontal lifts, rain streaks running down.
        ang = np.arctan2(Y - P[:, 1].mean(), X - P[:, 0].mean())
        c = base("#c3bcaa") * (0.9 + 0.1 * nm[:, None])
        c[np.mod(Z, 4.0) < 0.22] *= 0.8
        streak = ra.smooth(0.6, 0.9, ra.vnoise(ang * 9, Z / 14, 61)) * 0.22
        grime = ra.smooth(8, 0, Z) * 0.2
        return c * (1 - streak - grime)[:, None]
    if mat == "tar":
        c = base("#34332f") * (0.85 + 0.25 * nm[:, None])
        c[np.mod(along if wall else X + Y, 5.0) < 0.25] *= 0.75
        return c
    if mat == "slate":
        # Roof slates in courses down the slope.
        c = ra.mix(base("#3f4448"), base("#525960"), nm * 0.7 + nf * 0.3)
        c[np.mod(Z * 2.2, 1.0) < 0.14] *= 0.7
        return c
    if mat == "glazing":
        # North-light glazing: grimy wired glass in a steel grid.
        c = ra.mix(base("#4f6b6d"), base("#7d9c98"), nf * 0.6 + nm * 0.4)
        bar = (np.mod(along, 2.4) < 0.35) | (np.mod(Z, 3.0) < 0.3)
        c[bar] = rgb("#2a2c28")
        return c
    if mat == "window":
        c = ra.mix(base("#1f2a2e"), base("#3d5157"), nf * 0.5 + nm * 0.3)
        bar = (np.mod(along, 1.5) < 0.28) | (np.mod(Z, 1.8) < 0.28)
        c[bar] = rgb("#bdb39a")
        return c
    if mat == "sill":
        return base("#bdb39a") * (0.9 + 0.12 * nf[:, None])
    if mat == "door_wood":
        c = base("#5a4128") * (0.88 + 0.2 * nf[:, None])
        c[np.mod(along, 1.4) < 0.22] *= 0.7
        return c
    if mat == "door_steel":
        c = base("#4e5a52") * (0.9 + 0.12 * nm[:, None])
        c[np.mod(Z, 1.2) < 0.2] *= 0.72  # roller slats
        rust = ra.smooth(0.65, 0.9, ra.fbm(along / 3, Z / 2, 15))
        return ra.mix(c, base("#7a4b2c"), rust * 0.5)
    if mat == "iron":
        return base("#2f312e") * (0.9 + 0.18 * nf[:, None])
    if mat == "rust":
        c = ra.mix(base("#6c4a34"), base("#8a5a36"), nm)
        return c * (0.88 + 0.2 * nf[:, None])
    if mat == "shed":
        # Corrugated cladding, ribs running up the wall.
        rib = 0.5 + 0.5 * np.sin(along * 2 * np.pi / 1.2) if wall else 0.5 + 0.5 * np.sin((X - Y) * 2 * np.pi / 1.4)
        c = ra.mix(base("#5d625c"), base("#737a72"), rib * 0.8)
        rust = ra.smooth(0.6, 0.85, ra.fbm(along / 5, Z / 2 + X / 9, 13))
        c = ra.mix(c, base("#7a5134"), rust * 0.5)
        return c * (0.93 + 0.1 * nf[:, None])
    if mat == "stack":
        # Riveted steel stack with soot at the lip.
        c = base("#45443f") * (0.9 + 0.16 * nm[:, None])
        c[np.mod(Z, 5.0) < 0.4] *= 0.7
        return c * (1 - 0.4 * ra.smooth(0.0, 1.0, (Z - (Z.max() - 5)) / 5))[:, None]
    if mat == "soot":
        return base("#1c1b19") * (0.9 + 0.2 * nf[:, None])
    if mat == "ore":
        c = ra.mix(base("#3b302a"), base("#5a4636"), nf * 0.6 + nm * 0.4)
        return c
    if mat == "coal":
        return ra.mix(base("#2a2a2d"), base("#46474c"), nf)
    if mat == "sleeper":
        c = base("#4a3a2a") * (0.85 + 0.25 * nf[:, None])
        return c
    if mat == "rail":
        return base("#6b6b66") * (0.95 + 0.1 * nf[:, None])
    if mat == "pallet":
        c = base("#9a7a52") * (0.88 + 0.2 * nf[:, None])
        c[np.mod(X + Y, 1.3) < 0.3] *= 0.7
        return c
    if mat == "sack":
        return ra.mix(base("#b3a27a"), base("#c8b88e"), nf) * (0.92 + 0.1 * nm[:, None])
    if mat == "grain":
        return ra.mix(base("#c9a54e"), base("#dfc070"), nf)
    if mat == "sign":
        c = base("#e2d8bc") * (0.94 + 0.06 * nf[:, None])
        return c
    if mat == "lens":
        return base("#fff2c8")
    if mat == "lens_cool":
        return base("#f0f6ff")
    if mat == "lens_sodium":
        return base("#ffc772")
    if mat == "glass_globe":
        return base("#fbe6b8")
    if mat == "glass_lamp":
        return base("#f6dc9a")
    if mat == "post":
        return base("#2b2f2c") * (0.9 + 0.2 * nf[:, None])
    if mat == "post_green":
        return base("#2f4436") * (0.9 + 0.2 * nf[:, None])
    if mat == "galv":
        return base("#7f847f") * (0.9 + 0.16 * nf[:, None])
    return _base_tex(mat, P, n)


ra.tex = tex

# ---------------------------------------------------------------- turned mesh


class Turned:
    """A mesh built facing east and turned `face` quarter turns clockwise about the lot centre.

    A long lot (w != h) cannot turn a quarter and keep its box, so its faces are the four
    box-keeping transforms instead: east, east mirrored across x, west (a half turn), and
    west mirrored. The doors land east, east, west, west; the yards differ on every face.
    """

    def __init__(self, size: float | tuple[float, float], face: int) -> None:
        self.m = ra.Mesh()
        w, h = (size, size) if isinstance(size, (int, float)) else size
        self.w, self.h = float(w), float(h)
        self.c = self.w / 2
        self.cy = self.h / 2
        self.long = self.w != self.h
        self.face = face & 3

    def p(self, x: float, y: float, z: float) -> tuple[float, float, float]:
        dx, dy = x - self.c, y - self.cy
        if self.long:
            if self.face in (1, 3):
                dy = -dy
            if self.face in (2, 3):
                dx, dy = -dx, -dy
            return (self.c + dx, self.cy + dy, z)
        for _ in range(self.face):
            dx, dy = -dy, dx  # east (1, 0) -> south (0, 1)
        return (self.c + dx, self.cy + dy, z)

    def new_part(self) -> int:
        return self.m.new_part()

    def box(self, lo, hi, mat, top=None, part=True) -> None:
        a = self.p(*lo)
        b = self.p(hi[0], hi[1], lo[2])
        x0, x1 = sorted((a[0], b[0]))
        y0, y1 = sorted((a[1], b[1]))
        self.m.box((x0, y0, lo[2]), (x1, y1, hi[2]), mat, top=top, part=part)

    def cyl(self, c0, c1, r0, r1, mat, n=14, caps=True, cap_mat=None, part=True) -> None:
        self.m.cyl(self.p(*c0), self.p(*c1), r0, r1, mat, n=n, caps=caps, cap_mat=cap_mat, part=part)

    def poly(self, pts, mat) -> None:
        self.m.poly([self.p(*q) for q in pts], mat)

    def quad(self, a, b, c, d, mat) -> None:
        self.poly([a, b, c, d], mat)


def gable(t: Turned, x0, y0, x1, y1, eave, ridge, wall, roof, ridge_along_x=True, over=1.2) -> None:
    """Walls to `eave`, gable ends in `wall`, and a pitched roof with an overhang."""
    t.box((x0, y0, 1.0), (x1, y1, eave), wall)
    t.new_part()
    if ridge_along_x:
        ym = (y0 + y1) / 2
        t.poly([(x0, y0, eave), (x0, y1, eave), (x0, ym, ridge)], wall)
        t.poly([(x1, y0, eave), (x1, y1, eave), (x1, ym, ridge)], wall)
        drop = (ridge - eave) * over / ((y1 - y0) / 2)
        t.new_part()
        t.quad((x0 - over, y0 - over, eave - drop), (x1 + over, y0 - over, eave - drop), (x1 + over, ym, ridge), (x0 - over, ym, ridge), roof)
        t.new_part()
        t.quad((x0 - over, y1 + over, eave - drop), (x1 + over, y1 + over, eave - drop), (x1 + over, ym, ridge), (x0 - over, ym, ridge), roof)
    else:
        xm = (x0 + x1) / 2
        t.poly([(x0, y0, eave), (x1, y0, eave), (xm, y0, ridge)], wall)
        t.poly([(x0, y1, eave), (x1, y1, eave), (xm, y1, ridge)], wall)
        drop = (ridge - eave) * over / ((x1 - x0) / 2)
        t.new_part()
        t.quad((x0 - over, y0 - over, eave - drop), (x0 - over, y1 + over, eave - drop), (xm, y1 + over, ridge), (xm, y0 - over, ridge), roof)
        t.new_part()
        t.quad((x1 + over, y0 - over, eave - drop), (x1 + over, y1 + over, eave - drop), (xm, y1 + over, ridge), (xm, y0 - over, ridge), roof)


def windows_x(t: Turned, x: float, ys, z0: float, z1: float, w: float, out: float) -> None:
    """Window boxes on a wall that looks along x (`out` = +1 east, -1 west)."""
    for y in ys:
        t.box((x, y - w / 2, z0), (x + 0.35 * out, y + w / 2, z1), "window")
        t.box((x, y - w / 2 - 0.3, z0 - 0.5), (x + 0.6 * out, y + w / 2 + 0.3, z0), "sill", part=False)


def windows_y(t: Turned, y: float, xs, z0: float, z1: float, w: float, out: float) -> None:
    for x in xs:
        t.box((x - w / 2, y, z0), (x + w / 2, y + 0.35 * out, z1), "window")
        t.box((x - w / 2 - 0.3, y, z0 - 0.5), (x + w / 2 + 0.3, y + 0.6 * out, z0), "sill", part=False)


def crates(t: Turned, x: float, y: float, n: int = 3) -> None:
    for i in range(n):
        dx = (i % 2) * 5.2
        dy = (i // 2) * 5.2
        t.box((x + dx, y + dy, 1.0), (x + dx + 4.6, y + dy + 4.6, 5.0), "crate")
    if n >= 3:
        t.box((x + 0.4, y + 0.4, 5.0), (x + 4.2, y + 4.2, 8.6), "crate")


def drums(t: Turned, x: float, y: float, cols: int, rows: int) -> None:
    for i in range(cols):
        for j in range(rows):
            t.cyl((x + i * 2.6, y + j * 2.6, 1.0), (x + i * 2.6, y + j * 2.6, 4.4), 1.15, 1.15, "drum_r" if (i + j) % 3 else "drum_g", n=10)


def rail_spur(t: Turned, x0: float, x1: float, y: float) -> None:
    """Sleepers and two rails along x at `y`."""
    t.new_part()
    x = x0
    while x < x1:
        t.box((x, y - 3.2, 1.0), (x + 1.1, y + 3.2, 1.35), "sleeper", part=False)
        x += 2.6
    for s in (-1.8, 1.8):
        t.box((x0, y + s - 0.3, 1.35), (x1, y + s + 0.3, 1.9), "rail", part=False)


def heap(t: Turned, cx: float, cy: float, r: float, h: float, mat: str) -> None:
    t.cyl((cx, cy, 1.0), (cx, cy, 1.0 + h), r, 0.6, mat, n=18)


# ---------------------------------------------------------------- buildings


def factory(t: Turned, S: float) -> dict:
    # Yard: concrete apron, setts before the loading door.
    t.box((0.6, 0.6, 0), (S - 0.6, S - 0.6, 1.0), "yard")
    t.box((S - 30, 50, 1.0), (S - 2, 112, 1.08), "cobble", part=False)
    # Main hall: brick to the eaves, a plinth course, and a sawtooth roof in five teeth.
    x0, y0, x1, y1 = 14.0, 22.0, 122.0, 140.0
    eave = 24.0
    t.box((x0 - 0.6, y0 - 0.6, 1.0), (x1 + 0.6, y1 + 0.6, 3.4), "brick_dark")
    t.box((x0, y0, 3.4), (x1, y1, eave), "brick", top="tar")
    t.box((x0 - 0.6, y0 - 0.6, eave), (x1 + 0.6, y1 + 0.6, eave + 1.2), "brick_dark", top="tar")
    teeth = 5
    tw = (x1 - x0) / teeth
    rise = 11.0
    for i in range(teeth):
        a = x0 + i * tw
        b = a + tw
        z = eave + 1.2
        t.new_part()
        # Glazed vertical face looks east; the slate slope falls back west.
        t.quad((b, y0, z), (b, y1, z), (b, y1, z + rise), (b, y0, z + rise), "glazing")
        t.new_part()
        t.quad((a, y0, z), (a, y1, z), (b, y1, z + rise), (b, y0, z + rise), "slate")
        t.new_part()
        t.poly([(a, y0, z), (b, y0, z), (b, y0, z + rise)], "brick")
        t.poly([(a, y1, z), (b, y1, z), (b, y1, z + rise)], "brick")
    # Tall windows down both long sides and on the gable ends.
    xs = [x0 + 9 + k * 14.5 for k in range(7)]
    windows_y(t, y1, xs, 7.0, 19.0, 6.0, 1)
    windows_y(t, y0, xs, 7.0, 19.0, 6.0, -1)
    windows_x(t, x0, [y0 + 14 + k * 15 for k in range(7)], 7.0, 19.0, 6.0, -1)
    # East gable: a big loading door between two windows, a canopy, and a name board.
    windows_x(t, x1, [y0 + 12, y0 + 26, y1 - 26, y1 - 12], 7.0, 19.0, 6.0, 1)
    t.box((x1, 64.0, 3.4), (x1 + 0.6, 98.0, 18.0), "door_steel")
    t.box((x1, 61.0, 18.0), (x1 + 6.0, 101.0, 19.4), "iron")
    t.box((x1 + 0.2, 70.0, 20.5), (x1 + 0.8, 92.0, 23.5), "sign")
    # Office wing at the south-east corner: two storeys, flat roof, a door.
    ox0, oy0, ox1, oy1 = 96.0, 112.0, 146.0, 150.0
    t.box((ox0, oy0, 1.0), (ox1, oy1, 26.0), "brick", top="tar")
    t.box((ox0 - 0.6, oy0 - 0.6, 26.0), (ox1 + 0.6, oy1 + 0.6, 27.4), "brick_dark", top="tar")
    windows_x(t, ox1, [oy0 + 7, oy0 + 15, oy0 + 23, oy0 + 31], 5.0, 11.0, 4.0, 1)
    windows_x(t, ox1, [oy0 + 7, oy0 + 15, oy0 + 23, oy0 + 31], 15.0, 22.0, 4.0, 1)
    windows_y(t, oy1, [ox0 + 6 + k * 8 for k in range(6)], 15.0, 22.0, 4.0, 1)
    windows_y(t, oy1, [ox0 + 6, ox0 + 14, ox0 + 30, ox0 + 38], 5.0, 11.0, 4.0, 1)
    t.box((ox0 + 19, oy1, 1.0), (ox0 + 25, oy1 + 0.6, 10.0), "door_wood")
    # Chimney stack: square brick base, round shaft with bands, sooty crown.
    cx, cy = 30.0, 36.0
    t.box((cx - 7, cy - 7, 1.0), (cx + 7, cy + 7, eave + 8), "brick_dark", top="tar")
    t.cyl((cx, cy, eave + 8), (cx, cy, 104.0), 5.6, 3.8, "brick", n=18)
    for z in (60.0, 84.0):
        t.cyl((cx, cy, z), (cx, cy, z + 1.2), 5.6 - (z - eave - 8) * 0.024 + 0.5, 5.6 - (z - eave - 8) * 0.024 + 0.5, "iron", n=18)
    t.cyl((cx, cy, 104.0), (cx, cy, 107.0), 4.6, 4.6, "soot", n=18)
    # Yard dress: crates, drums, a pallet stack.
    crates(t, S - 22, 10.0)
    drums(t, S - 34, 8.0, 3, 2)
    t.box((4.0, S - 14, 1.0), (14.0, S - 6, 2.2), "pallet")
    t.box((4.5, S - 13.5, 2.2), (13.5, S - 6.5, 7.0), "sack")
    return {"top": (cx, cy, 107.0)}


def warehouse(t: Turned, S: float) -> dict:
    t.box((0.6, 0.6, 0), (S - 0.6, S - 0.6, 1.0), "yard")
    # Long store, ridge east-west so the gable and its doors look east.
    x0, y0, x1, y1 = 16.0, 24.0, 104.0, 82.0
    eave, ridge = 22.0, 38.0
    t.box((x0 - 0.6, y0 - 0.6, 1.0), (x1 + 0.6, y1 + 0.6, 3.2), "brick_dark")
    gable(t, x0, y0, x1, y1, eave, ridge, "brick", "slate", ridge_along_x=True)
    # Pilasters down the long walls.
    for k in range(8):
        x = x0 + 4 + k * 11.5
        t.box((x, y1, 3.2), (x + 2.0, y1 + 0.9, eave), "brick_dark")
        t.box((x, y0 - 0.9, 3.2), (x + 2.0, y0, eave), "brick_dark")
    windows_y(t, y1, [x0 + 10.5 + k * 11.5 for k in range(7)], 13.0, 19.0, 5.0, 1)
    windows_y(t, y0, [x0 + 10.5 + k * 11.5 for k in range(7)], 13.0, 19.0, 5.0, -1)
    # Roller doors on the south side at dock height.
    for x in (x0 + 18, x0 + 52):
        t.box((x, y1, 4.6), (x + 12, y1 + 0.6, 12.5), "door_steel")
    # Loading dock along the south wall.
    t.box((x0 + 6, y1, 1.0), (x1 - 6, y1 + 8, 4.6), "concrete_wall", top="concrete")
    # East gable: hoist door, beam, and big double doors.
    ym = (y0 + y1) / 2
    t.box((x1, ym - 9, 1.0), (x1 + 0.6, ym + 9, 16.0), "door_wood")
    t.box((x1, ym - 4, 24.0), (x1 + 0.6, ym + 4, 31.0), "door_wood")
    t.box((x1, ym - 0.6, 32.0), (x1 + 7.0, ym + 0.6, 33.2), "iron")
    t.cyl((x1 + 6.4, ym, 33.0), (x1 + 6.4, ym, 26.0), 0.25, 0.25, "iron", n=6)
    t.box((x1 + 0.2, ym - 12, 17.5), (x1 + 0.8, ym + 12, 20.5), "sign")
    # Rail spur along the dock, and a goods wagon on it.
    rail_spur(t, 2.0, S - 2.0, y1 + 16)
    t.box((30.0, y1 + 12.6, 2.6), (62.0, y1 + 19.4, 4.0), "iron")
    t.box((30.5, y1 + 12.2, 4.0), (61.5, y1 + 19.8, 14.0), "rust", top="tar")
    t.box((43.0, y1 + 19.8, 5.0), (49.0, y1 + 20.2, 13.0), "door_wood")
    # Yard: crates and pallets stacked by the doors, a lamp-lit corner office.
    crates(t, S - 18, 8.0)
    crates(t, S - 18, 96.0, 4)
    for k in range(3):
        t.box((6.0 + k * 9, S - 14, 1.0), (13.0 + k * 9, S - 6, 2.0), "pallet")
        t.box((6.4 + k * 9, S - 13.6, 2.0), (12.6 + k * 9, S - 6.4, 5.4 + (k % 2) * 2.4), "sack" if k != 1 else "crate")
    drums(t, 4.0, 6.0, 4, 2)
    return {"top": ((x0 + x1) / 2, ym, ridge)}


def foundry(t: Turned, S: float) -> dict:
    t.box((0.6, 0.6, 0), (S - 0.6, S - 0.6, 1.0), "yard")
    # Casting shed: corrugated walls on a brick plinth, a raised monitor along the ridge.
    x0, y0, x1, y1 = 24.0, 20.0, 128.0, 92.0
    eave, ridge = 28.0, 40.0
    t.box((x0 - 0.6, y0 - 0.6, 1.0), (x1 + 0.6, y1 + 0.6, 7.0), "brick_dark")
    gable(t, x0, y0, x1, y1, eave, ridge, "shed", "shed", ridge_along_x=True, over=1.0)
    ym = (y0 + y1) / 2
    t.box((x0 + 6, ym - 8, ridge - 2.0), (x1 - 6, ym + 8, ridge + 6.0), "glazing", top="shed")
    t.box((x0 + 5, ym - 9.2, ridge + 6.0), (x1 - 5, ym + 9.2, ridge + 7.2), "iron", top="shed")
    # Big door at the east end glowing faintly from the furnace inside.
    t.box((x1, ym - 12, 1.0), (x1 + 0.6, ym + 12, 22.0), "interior")
    t.box((x1 + 0.6, ym - 13, 1.0), (x1 + 1.6, ym - 9, 22.0), "door_steel")
    t.box((x1 + 0.6, ym + 9, 1.0), (x1 + 1.6, ym + 13, 22.0), "door_steel")
    t.box((x1, ym - 14, 22.0), (x1 + 2.2, ym + 14, 24.0), "iron")
    windows_y(t, y1, [x0 + 12 + k * 13 for k in range(7)], 10.0, 18.0, 6.0, 1)
    windows_y(t, y0, [x0 + 12 + k * 13 for k in range(7)], 10.0, 18.0, 6.0, -1)
    # Two steel stacks through the roof.
    for sx, sy, top in ((48.0, ym + 14, 96.0), (78.0, ym + 14, 86.0)):
        t.cyl((sx, sy, 20.0), (sx, sy, top), 3.2, 3.0, "stack", n=14)
        t.cyl((sx, sy, top), (sx, sy, top + 1.2), 3.8, 3.8, "soot", n=14)
    # Cupola furnace on the yard to the south, a charging gantry up to its mouth.
    fx, fy = 54.0, 124.0
    t.box((fx - 10, fy - 10, 1.0), (fx + 10, fy + 10, 4.0), "brick_dark")
    t.cyl((fx, fy, 4.0), (fx, fy, 34.0), 7.5, 6.5, "rust", n=18)
    for z in (12.0, 22.0, 30.0):
        t.cyl((fx, fy, z), (fx, fy, z + 1.0), 7.8 - (z - 4) * 0.033, 7.8 - (z - 4) * 0.033, "iron", n=18)
    t.cyl((fx, fy, 34.0), (fx, fy, 60.0), 3.0, 2.6, "stack", n=14)
    t.box((fx - 8, fy - 8, 34.0), (fx + 8, fy + 8, 35.4), "iron")
    for dx in (-7.5, 7.5):
        for dy in (-7.5, 7.5):
            t.box((fx + dx - 0.5, fy + dy - 0.5, 4.0), (fx + dx + 0.5, fy + dy + 0.5, 34.0), "iron", part=False)
    # Inclined skip hoist from the ore heap to the platform.
    t.new_part()
    bx0, bx1 = fx + 9, fx + 40
    for side in (-2.0, 2.0):
        t.quad((bx1, fy + side - 0.5, 1.0), (bx1, fy + side + 0.5, 1.0), (bx0, fy + side + 0.5, 34.0), (bx0, fy + side - 0.5, 34.0), "iron")
    heap(t, fx + 50, fy + 4, 12.0, 15.0, "ore")
    heap(t, 18.0, 128.0, 10.0, 12.0, "coal")
    # Ladle car on a short track and a pile of pig iron.
    rail_spur(t, x1 - 26, S - 2, 106.0)
    t.box((x1 - 6, 102.0, 1.9), (x1 + 6, 110.0, 4.0), "iron")
    t.cyl((x1, 106.0, 4.0), (x1, 106.0, 10.0), 3.6, 4.2, "soot", n=14)
    for k in range(4):
        t.box((S - 20 + k * 1.5, 8.0 + k * 0.6, 1.0 + k * 1.1), (S - 8 - k * 1.5, 13.0 - k * 0.6, 2.1 + k * 1.1), "iron", part=k == 0)
    drums(t, 4.0, 6.0, 3, 3)
    return {"top": (48.0, ym + 14, 97.2)}


def granary(t: Turned, S: float) -> dict:
    t.box((0.6, 0.6, 0), (S - 0.6, S - 0.6, 1.0), "yard")
    # Three silos in a row along y on the west half.
    r = 11.0
    sx = 34.0
    ys = (26.0, 50.0, 74.0)
    top = 66.0
    for y in ys:
        t.cyl((sx, y, 1.0), (sx, y, top), r, r, "silo", n=24)
        t.cyl((sx, y, top), (sx, y, top + 3.2), r, 2.0, "concrete", n=24, part=False)
    # Head house astride the silo tops, the tallest block on the lot.
    t.box((sx - 7, 38.0, top - 2.0), (sx + 7, 62.0, top + 14.0), "concrete_wall", top="tar")
    t.box((sx - 7.6, 37.4, top + 14.0), (sx + 7.6, 62.6, top + 15.2), "concrete", top="tar")
    windows_x(t, sx + 7, [44.0, 50.0, 56.0], top + 5.0, top + 10.0, 3.0, 1)
    t.box((sx + 7.2, 42.0, top + 15.2), (sx + 7.8, 58.0, top + 18.0), "sign")
    # Elevator leg down the east face of the middle silo to the intake pit.
    t.box((sx + r - 1, 48.0, 1.0), (sx + r + 3.5, 52.0, top), "galv")
    # Conveyor gallery from the head house out to the shed roof.
    gx0, gx1 = sx + 7, 92.0
    t.new_part()
    t.box((gx0, 46.5, top - 1.0), (gx1, 53.5, top + 5.0), "shed")
    for gx in (60.0, 80.0):
        t.box((gx - 0.6, 49.4, 1.0), (gx + 0.6, 50.6, top - 1.0), "iron", part=False)
        t.box((gx - 2.4, 47.6, 1.0), (gx - 1.2, 48.8, top - 1.0), "iron", part=False)
        t.box((gx + 1.2, 51.2, 1.0), (gx + 2.4, 52.4, top - 1.0), "iron", part=False)
    # Brick shed with the weighbridge door on the east side.
    bx0, by0, bx1, by1 = 70.0, 20.0, 116.0, 92.0
    t.box((bx0 - 0.6, by0 - 0.6, 1.0), (bx1 + 0.6, by1 + 0.6, 3.2), "brick_dark")
    gable(t, bx0, by0, bx1, by1, 18.0, 32.0, "brick", "slate", ridge_along_x=False)
    t.box((bx1, 44.0, 1.0), (bx1 + 0.6, 60.0, 14.0), "door_wood")
    windows_x(t, bx1, [28.0, 36.0, 68.0, 76.0, 84.0], 6.0, 13.0, 4.0, 1)
    windows_y(t, by1, [bx0 + 8, bx0 + 18, bx0 + 28, bx0 + 38], 6.0, 13.0, 4.0, 1)
    windows_y(t, by0, [bx0 + 8, bx0 + 18, bx0 + 28, bx0 + 38], 6.0, 13.0, 4.0, -1)
    # Weighbridge plate, a farm cart of sacks, and grain spill.
    t.box((bx1 + 2, 42.0, 1.0), (S - 2, 62.0, 1.3), "iron")
    t.box((S - 12, 98.0, 3.0), (S - 2, 112.0, 4.0), "wood")
    t.box((S - 11.6, 98.4, 4.0), (S - 2.4, 111.6, 7.4), "sack")
    for wy in (99.0, 111.0):
        t.cyl((S - 7, wy - 0.4, 3.0), (S - 7, wy + 0.4, 3.0), 2.2, 2.2, "wood", n=12)
    heap(t, 100.0, 108.0, 6.0, 5.0, "grain")
    for k in range(3):
        t.box((60.0 + k * 9, S - 14, 1.0), (67.0 + k * 9, S - 6, 2.0), "pallet")
        t.box((60.4 + k * 9, S - 13.6, 2.0), (66.6 + k * 9, S - 6.4, 6.0), "sack")
    drums(t, 6.0, S - 12, 3, 2)
    return {"top": (sx, 50.0, top + 18.0)}


# ---------------------------------------------------------------- long lots


def apron(t: Turned, W: float, H: float) -> None:
    t.box((0.6, 0.6, 0), (W - 0.6, H - 0.6, 1.0), "yard")


def clerestory(t: Turned, x0: float, x1: float, ym: float, z: float, half: float, rise: float) -> None:
    """A glazed monitor along a ridge: two glass walls and a low shed roof over them."""
    t.new_part()
    t.box((x0, ym - half, z - 1.0), (x1, ym + half, z + rise), "glazing", top="shed")
    t.box((x0 - 0.8, ym - half - 1.0, z + rise), (x1 + 0.8, ym + half + 1.0, z + rise + 1.2), "iron", top="shed")


def stack(t: Turned, cx: float, cy: float, base_top: float, top: float, r: float = 5.2) -> None:
    t.box((cx - r - 1.6, cy - r - 1.6, 1.0), (cx + r + 1.6, cy + r + 1.6, base_top), "brick_dark", top="tar")
    t.cyl((cx, cy, base_top), (cx, cy, top), r, r * 0.68, "brick", n=18)
    for k in (0.45, 0.78):
        z = base_top + (top - base_top) * k
        rr = r - (r - r * 0.68) * k + 0.5
        t.cyl((cx, cy, z), (cx, cy, z + 1.2), rr, rr, "iron", n=18)
    t.cyl((cx, cy, top), (cx, cy, top + 3.0), r * 0.8, r * 0.8, "soot", n=18)


def hall(t: Turned, W: float, H: float) -> dict:
    """Aircraft assembly hall, t(8) x t(3): one long bay, a clerestory ridge, rail doors east."""
    apron(t, W, H)
    x0, y0, x1, y1 = 12.0, 12.0, 200.0, 80.0
    eave, ridge = 26.0, 38.0
    ym = (y0 + y1) / 2
    t.box((x0 - 0.6, y0 - 0.6, 1.0), (x1 + 0.6, y1 + 0.6, 3.4), "brick_dark")
    gable(t, x0, y0, x1, y1, eave, ridge, "brick", "slate", ridge_along_x=True, over=1.0)
    clerestory(t, x0 + 10, x1 - 10, ym, ridge, 7.0, 7.0)
    # Pilasters and tall windows down both long walls.
    for k in range(13):
        x = x0 + 6 + k * 14.5
        t.box((x, y1, 3.4), (x + 2.0, y1 + 0.9, eave), "brick_dark")
        t.box((x, y0 - 0.9, 3.4), (x + 2.0, y0, eave), "brick_dark")
    xs = [x0 + 13.5 + k * 14.5 for k in range(12)]
    windows_y(t, y1, xs, 9.0, 21.0, 6.0, 1)
    windows_y(t, y0, xs, 9.0, 21.0, 6.0, -1)
    # East gable: full-height sliding doors on a rail, a canopy, the works board.
    t.box((x1, ym - 22, 3.4), (x1 + 0.6, ym + 22, 24.0), "door_steel")
    t.box((x1 + 0.6, ym - 1.0, 3.4), (x1 + 1.0, ym + 1.0, 24.0), "iron", part=False)
    t.box((x1, ym - 25, 24.0), (x1 + 7.0, ym + 25, 25.4), "iron")
    t.box((x1 + 0.2, ym - 14, 27.0), (x1 + 0.8, ym + 14, 30.0), "sign")
    windows_x(t, x0, [y0 + 12, y0 + 24, y1 - 24, y1 - 12], 9.0, 21.0, 6.0, -1)
    # Rail spur out of the doors to the lot edge, a flat wagon on it.
    rail_spur(t, x1 + 1.0, W - 2.0, ym)
    t.box((x1 + 14, ym - 3.6, 2.6), (x1 + 44, ym + 3.6, 4.2), "iron")
    t.box((x1 + 14.5, ym - 3.2, 4.2), (x1 + 43.5, ym + 3.2, 5.0), "wood")
    crates(t, x1 + 20, ym - 2.5, 2)
    # Single-storey drawing office along the south wall at the west end, flat tar roof.
    ox0, ox1 = 30.0, 96.0
    t.box((ox0, y1 + 0.9, 1.0), (ox1, H - 6.0, 13.0), "brick", top="tar")
    t.box((ox0 - 0.6, y1 + 0.3, 13.0), (ox1 + 0.6, H - 5.4, 14.2), "brick_dark", top="tar")
    windows_y(t, H - 6.0, [ox0 + 7 + k * 9 for k in range(7)], 5.0, 11.0, 5.0, 1)
    t.box((ox1 - 10, H - 6.0, 1.0), (ox1 - 5, H - 5.4, 10.0), "door_wood")
    # Boiler stack at the north-west corner, a transformer yard and pallets on the apron.
    stack(t, 22.0, 22.0, eave + 6.0, 88.0)
    drums(t, W - 30, 6.0, 3, 2)
    for k in range(3):
        t.box((110.0 + k * 9, H - 14, 1.0), (117.0 + k * 9, H - 6, 2.0), "pallet")
        t.box((110.4 + k * 9, H - 13.6, 2.0), (116.6 + k * 9, H - 6.4, 5.0 + (k % 2) * 2.0), "crate")
    return {"top": (22.0, 22.0, 91.0)}


def works(t: Turned, W: float, H: float) -> dict:
    """L-shaped machine works, t(6) x t(5): a long shop along the north, a wing down the west, an apron in the angle."""
    apron(t, W, H)
    t.box((76.0, 72.0, 1.0), (W - 2.0, H - 2.0, 1.08), "cobble", part=False)
    # North shop: ridge along x, doors on the east end.
    ax0, ay0, ax1, ay1 = 10.0, 10.0, 182.0, 68.0
    eave, ridge = 24.0, 36.0
    aym = (ay0 + ay1) / 2
    t.box((ax0 - 0.6, ay0 - 0.6, 1.0), (ax1 + 0.6, ay1 + 0.6, 3.2), "brick_dark")
    gable(t, ax0, ay0, ax1, ay1, eave, ridge, "brick", "slate", ridge_along_x=True)
    clerestory(t, ax0 + 60, ax1 - 10, aym, ridge, 5.0, 5.0)
    xs = [ax0 + 12 + k * 13 for k in range(12)]
    windows_y(t, ay1, xs[4:], 8.0, 19.0, 6.0, 1)
    windows_y(t, ay0, xs, 8.0, 19.0, 6.0, -1)
    t.box((ax1, aym - 11, 3.2), (ax1 + 0.6, aym + 11, 18.0), "door_steel")
    t.box((ax1, aym - 13, 18.0), (ax1 + 5.0, aym + 13, 19.2), "iron")
    t.box((ax1 + 0.2, aym - 9, 21.0), (ax1 + 0.8, aym + 9, 24.0), "sign")
    # West wing: ridge along y, joins the shop's south wall, a door onto the apron.
    bx0, by0, bx1, by1 = 10.0, ay1, 70.0, 150.0
    t.box((bx0 - 0.6, by0, 1.0), (bx1 + 0.6, by1 + 0.6, 3.2), "brick_dark")
    gable(t, bx0, by0 + 0.4, bx1, by1, eave - 2.0, ridge - 4.0, "brick", "slate", ridge_along_x=False)
    ys = [by0 + 12 + k * 13 for k in range(6)]
    windows_x(t, bx1, ys[:2] + ys[3:], 8.0, 18.0, 6.0, 1)
    windows_x(t, bx0, ys, 8.0, 18.0, 6.0, -1)
    windows_y(t, by1, [bx0 + 10, bx0 + 22, bx0 + 38, bx0 + 50], 8.0, 18.0, 6.0, 1)
    t.box((bx1, by0 + 34, 3.2), (bx1 + 0.6, by0 + 50, 15.0), "door_steel")
    t.box((bx1, by0 + 32, 15.0), (bx1 + 4.0, by0 + 52, 16.2), "iron")
    # Stack on the shop, water tower on the apron, a scrap heap and drums by the wing.
    stack(t, 40.0, 24.0, eave + 6.0, 92.0, r=5.6)
    tx, ty = 150.0, 118.0
    for dx in (-7.0, 7.0):
        for dy in (-7.0, 7.0):
            t.box((tx + dx - 0.7, ty + dy - 0.7, 1.0), (tx + dx + 0.7, ty + dy + 0.7, 44.0), "iron", part=False)
    t.new_part()
    for z in (14.0, 28.0):
        t.box((tx - 7.7, ty - 0.5, z), (tx + 7.7, ty + 0.5, z + 1.0), "iron", part=False)
        t.box((tx - 0.5, ty - 7.7, z), (tx + 0.5, ty + 7.7, z + 1.0), "iron", part=False)
    t.box((tx - 8.5, ty - 8.5, 44.0), (tx + 8.5, ty + 8.5, 45.4), "iron")
    t.cyl((tx, ty, 45.4), (tx, ty, 62.0), 8.6, 8.6, "rust", n=20)
    t.cyl((tx, ty, 62.0), (tx, ty, 66.0), 8.8, 1.2, "iron", n=20)
    t.box((tx - 0.5, ty + 8.6, 1.0), (tx + 0.5, ty + 9.6, 50.0), "galv", part=False)
    heap(t, 110.0, 136.0, 10.0, 9.0, "ore")
    for k in range(4):
        t.box((W - 22 + k * 1.5, 80.0 + k * 0.6, 1.0 + k * 1.1), (W - 8 - k * 1.5, 86.0 - k * 0.6, 2.1 + k * 1.1), "iron", part=k == 0)
    drums(t, bx1 + 8, by1 - 8, 4, 2)
    crates(t, W - 24, H - 24, 4)
    return {"top": (40.0, 24.0, 95.0)}


def shed(t: Turned, W: float, H: float) -> dict:
    """Engine shed, t(7) x t(2): two roads run the length of it and out the east doors."""
    apron(t, W, H)
    x0, y0, x1, y1 = 6.0, 6.0, 168.0, 58.0
    eave, ridge = 20.0, 31.0
    t.box((x0 - 0.6, y0 - 0.6, 1.0), (x1 + 0.6, y1 + 0.6, 3.2), "brick_dark")
    gable(t, x0, y0, x1, y1, eave, ridge, "brick", "slate", ridge_along_x=True, over=1.0)
    # Smoke louvres along the ridge, blackened.
    for k in range(5):
        lx = x0 + 18 + k * 30
        t.box((lx, (y0 + y1) / 2 - 3.0, ridge - 1.0), (lx + 16, (y0 + y1) / 2 + 3.0, ridge + 3.2), "soot", top="iron")
    xs = [x0 + 11 + k * 14 for k in range(11)]
    windows_y(t, y1, xs, 8.0, 16.0, 6.0, 1)
    windows_y(t, y0, xs, 8.0, 16.0, 6.0, -1)
    # Two roads: sleepers and rails the whole lot, through arched doors in the east gable.
    for ry in (22.0, 42.0):
        rail_spur(t, 1.0, W - 1.0, ry)
        t.box((x1, ry - 6.5, 3.2), (x1 + 0.6, ry + 6.5, 16.0), "interior")
        t.box((x1 + 0.6, ry - 7.2, 3.2), (x1 + 1.6, ry - 5.4, 16.0), "door_wood")
        t.box((x1 + 0.6, ry + 5.4, 3.2), (x1 + 1.6, ry + 7.2, 16.0), "door_wood")
        t.box((x1, ry - 7.6, 16.0), (x1 + 0.9, ry + 7.6, 17.6), "brick_dark")
    # A water crane and a coal stage east of the doors.
    cx, cy = 198.0, 8.0
    t.cyl((cx, cy, 1.0), (cx, cy, 22.0), 1.6, 1.4, "iron", n=10)
    t.cyl((cx, cy, 22.0), (cx, cy + 9.0, 22.0), 1.1, 1.0, "iron", n=8)
    t.cyl((cx, cy + 9.0, 22.0), (cx, cy + 9.0, 17.0), 0.9, 0.9, "iron", n=8)
    t.box((W - 26, H - 16, 1.0), (W - 4, H - 2, 6.0), "concrete_wall", top="concrete")
    heap(t, W - 15, H - 9, 6.5, 6.0, "coal")
    t.box((x0 + 4, y1 + 1.0, 1.0), (x0 + 24, y1 + 4.4, 2.0), "pallet")
    drums(t, 10.0, 2.0, 2, 1)
    return {"top": (x0 + 26, (y0 + y1) / 2, ridge + 3.2)}


def boiler(t: Turned, W: float, H: float) -> dict:
    """Boiler house, t(3) x t(6): a coal bunker at the north end feeds a long hall; one tall stack."""
    apron(t, W, H)
    # Coal bunker: concrete walls open to the sky, a heap inside.
    kx0, ky0, kx1, ky1 = 14.0, 8.0, 82.0, 44.0
    for (a, b, c, d) in ((kx0, ky0, kx1, ky0 + 2.4), (kx0, ky1 - 2.4, kx1, ky1), (kx0, ky0, kx0 + 2.4, ky1)):
        t.box((a, b, 1.0), (c, d, 11.0), "concrete_wall", top="concrete")
    t.box((kx1 - 2.4, ky0, 1.0), (kx1, ky0 + 12.0, 11.0), "concrete_wall", top="concrete")
    t.box((kx1 - 2.4, ky1 - 12.0, 1.0), (kx1, ky1, 11.0), "concrete_wall", top="concrete")
    heap(t, 44.0, 26.0, 16.0, 9.0, "coal")
    heap(t, 62.0, 30.0, 9.0, 6.0, "coal")
    # Boiler hall: ridge along y, a clerestory, windows down both long walls, doors east.
    x0, y0, x1, y1 = 10.0, 62.0, 86.0, 182.0
    eave, ridge = 28.0, 42.0
    xm = (x0 + x1) / 2
    t.box((x0 - 0.6, y0 - 0.6, 1.0), (x1 + 0.6, y1 + 0.6, 3.4), "brick_dark")
    gable(t, x0, y0, x1, y1, eave, ridge, "brick", "slate", ridge_along_x=False)
    t.new_part()
    t.box((xm - 6.0, y0 + 12, ridge - 1.0), (xm + 6.0, y1 - 12, ridge + 6.0), "glazing", top="shed")
    t.box((xm - 7.0, y0 + 11, ridge + 6.0), (xm + 7.0, y1 - 11, ridge + 7.2), "iron", top="shed")
    ys = [y0 + 12 + k * 14 for k in range(8)]
    windows_x(t, x1, ys[:3] + ys[5:], 9.0, 22.0, 6.0, 1)
    windows_x(t, x0, ys, 9.0, 22.0, 6.0, -1)
    windows_y(t, y1, [x0 + 12, x0 + 24, x1 - 24, x1 - 12], 9.0, 22.0, 6.0, 1)
    t.box((x1, y0 + 54, 3.4), (x1 + 0.6, y0 + 72, 18.0), "door_steel")
    t.box((x1, y0 + 52, 18.0), (x1 + 5.0, y0 + 74, 19.2), "iron")
    t.box((x1 + 0.2, y0 + 56, 21.0), (x1 + 0.8, y0 + 70, 24.0), "sign")
    # Inclined conveyor from the bunker up through the hall's north gable.
    t.new_part()
    for side in (-3.0, 3.0):
        t.quad((48.0 + side - 0.6, ky1 - 6.0, 4.0), (48.0 + side + 0.6, ky1 - 6.0, 4.0), (48.0 + side + 0.6, y0 + 2.0, eave + 4.0), (48.0 + side - 0.6, y0 + 2.0, eave + 4.0), "galv")
    t.quad((44.4, ky1 - 6.0, 4.0), (51.6, ky1 - 6.0, 4.0), (51.6, y0 + 2.0, eave + 4.0), (44.4, y0 + 2.0, eave + 4.0), "shed")
    for gy in (50.0, 58.0):
        z = 4.0 + (gy - (ky1 - 6.0)) / (y0 + 2.0 - (ky1 - 6.0)) * eave
        t.box((47.4, gy - 0.6, 1.0), (48.6, gy + 0.6, z), "iron", part=False)
    # The stack: square base against the hall's east wall, tall brick shaft.
    stack(t, 74.0, 150.0, eave + 10.0, 118.0, r=6.4)
    # Ash skips on a short road, a transformer, drums.
    rail_spur(t, x1 + 2.0, W - 1.0, 170.0)
    t.box((x1 + 3.0, 166.6, 2.4), (x1 + 8.5, 173.4, 6.5), "rust")
    t.box((4.0, H - 18.0, 1.0), (12.0, H - 8.0, 8.0), "iron", top="galv")
    drums(t, kx1 + 3.0, 10.0, 2, 3)
    crates(t, 2.0, 48.0, 2)
    return {"top": (74.0, 150.0, 121.0)}


BUILDINGS = {
    # type: (footprint world px, or (w, h) for a long lot; builder)
    "factory": (160.0, factory),
    "warehouse": (128.0, warehouse),
    "foundry": (160.0, foundry),
    "granary": (128.0, granary),
    "hall": ((256.0, 96.0), hall),
    "works": ((192.0, 160.0), works),
    "shed": ((224.0, 64.0), shed),
    "boiler": ((96.0, 192.0), boiler),
}
ZOOM_BUILDING = 3.0


# ---------------------------------------------------------------- lamps


def gaslamp(m: ra.Mesh) -> dict:
    # Fluted cast-iron post, a ladder bar, and a four-pane lantern with a cap.
    m.cyl((0, 0, 0), (0, 0, 1.4), 1.3, 1.1, "post_green", n=12)
    m.cyl((0, 0, 1.4), (0, 0, 11.0), 0.55, 0.42, "post_green", n=10)
    m.box((-1.5, -0.18, 9.4), (1.5, 0.18, 9.8), "post_green")
    m.cyl((0, 0, 11.0), (0, 0, 11.8), 0.5, 1.1, "post_green", n=10)
    m.cyl((0, 0, 11.8), (0, 0, 14.2), 1.0, 1.35, "glass_lamp", n=4)
    m.cyl((0, 0, 14.2), (0, 0, 15.2), 1.7, 0.5, "post_green", n=4)
    m.cyl((0, 0, 15.2), (0, 0, 15.9), 0.25, 0.1, "post_green", n=6)
    return {"bulb": (0.0, 0.0, 13.0)}


def streetlamp(m: ra.Mesh) -> dict:
    # Tall tapered post, swan-neck arm reaching east, and a bell shade.
    m.cyl((0, 0, 0), (0, 0, 2.2), 1.5, 1.2, "post", n=12)
    m.cyl((0, 0, 2.2), (0, 0, 21.0), 0.6, 0.38, "post", n=10)
    m.new_part()
    pts = []
    for i in range(9):
        a = math.pi * i / 8
        pts.append((2.4 - 2.4 * math.cos(a), 0.0, 21.0 + 2.2 * math.sin(a)))
    for a, b in zip(pts, pts[1:]):
        m.cyl(a, b, 0.32, 0.32, "post", n=8, part=False)
    x = pts[-1][0]
    m.cyl((x, 0, pts[-1][2]), (x, 0, pts[-1][2] - 1.2), 0.3, 0.3, "post", n=8, part=False)
    zb = pts[-1][2] - 1.2
    m.cyl((x, 0, zb), (x, 0, zb - 1.6), 0.5, 2.0, "post", n=14, caps=False)
    m.cyl((x, 0, zb - 1.55), (x, 0, zb - 1.65), 1.75, 1.75, "lens", n=14)
    return {"bulb": (x, 0.0, zb - 1.9)}


def floodlight(m: ra.Mesh) -> dict:
    # Galvanised mast on a concrete foot, a cross bar, two flood heads tipped down.
    m.box((-1.8, -1.8, 0), (1.8, 1.8, 1.4), "concrete")
    m.cyl((0, 0, 1.4), (0, 0, 27.0), 0.62, 0.48, "galv", n=10)
    for z in (6.0, 12.0, 18.0, 24.0):
        m.box((-0.15, -0.9, z), (0.15, 0.9, z + 0.3), "galv", part=False)
    m.box((-0.3, -3.6, 26.6), (0.3, 3.6, 27.4), "galv")
    for y in (-2.8, 2.8):
        m.box((0.2, y - 1.3, 25.2), (1.5, y + 1.3, 27.8), "iron")
        m.box((1.5, y - 1.1, 25.4), (1.7, y + 1.1, 27.6), "lens_cool", part=False)
    m.box((-0.9, -0.7, 2.0), (-0.6, 0.7, 4.6), "iron")  # switch box
    return {"bulb": (1.8, 0.0, 26.5)}


def twinlamp(m: ra.Mesh) -> dict:
    # Boulevard post: stepped plinth, fluted shaft, a scroll arm each way, two globes.
    m.cyl((0, 0, 0), (0, 0, 1.0), 1.6, 1.4, "post_green", n=12)
    m.cyl((0, 0, 1.0), (0, 0, 2.6), 1.1, 0.8, "post_green", n=12)
    m.cyl((0, 0, 2.6), (0, 0, 17.5), 0.5, 0.36, "post_green", n=10)
    m.cyl((0, 0, 17.5), (0, 0, 18.3), 0.75, 0.75, "post_green", n=10)
    bulbs = []
    for side in (-1, 1):
        m.new_part()
        pts = []
        for i in range(7):
            a = math.pi / 2 * i / 6
            pts.append((0.0, side * (0.4 + 3.0 * math.sin(a)), 17.9 + 1.6 * (1 - math.cos(a))))
        for a, b in zip(pts, pts[1:]):
            m.cyl(a, b, 0.24, 0.24, "post_green", n=8, part=False)
        y = pts[-1][1]
        z = pts[-1][2]
        m.cyl((0, y, z), (0, y, z + 0.5), 0.55, 0.55, "post_green", n=10)
        m.cyl((0, y, z + 0.5), (0, y, z + 1.6), 0.9, 1.25, "glass_globe", n=12)
        m.cyl((0, y, z + 1.6), (0, y, z + 2.6), 1.25, 0.6, "glass_globe", n=12)
        m.cyl((0, y, z + 2.6), (0, y, z + 3.1), 0.45, 0.2, "post_green", n=8)
        bulbs.append((0.0, y, z + 1.6))
    m.cyl((0, 0, 18.3), (0, 0, 20.2), 0.3, 0.08, "post_green", n=8)
    return {"bulbs": bulbs}


def sodium(m: ra.Mesh) -> dict:
    # Square concrete post, a straight outreach arm rising a little, a cobra head with a sodium lens.
    m.box((-1.1, -1.1, 0), (1.1, 1.1, 1.2), "concrete")
    m.cyl((0, 0, 1.2), (0, 0, 24.0), 0.75, 0.5, "concrete", n=4)
    m.cyl((0, 0, 22.6), (6.2, 0, 23.8), 0.22, 0.22, "galv", n=8)
    m.cyl((0, 0, 21.2), (2.4, 0, 22.9), 0.16, 0.16, "galv", n=6, part=False)
    m.new_part()
    m.cyl((5.4, 0.0, 24.1), (9.6, 0.0, 23.5), 0.75, 1.15, "galv", n=10)
    m.cyl((9.6, 0, 23.5), (10.3, 0, 23.35), 1.15, 0.4, "galv", n=10, part=False)
    m.cyl((7.0, 0, 23.0), (9.8, 0, 22.7), 0.8, 0.8, "lens_sodium", n=10, part=False)
    return {"bulbs": [(8.6, 0.0, 22.4)]}


def tilted_box(m: ra.Mesh, c, fwd, up, w: float, h: float, d: float, mat: str, front: str | None = None) -> None:
    """A box centred on c, `d` deep along fwd, `h` tall along up, `w` wide across. The front face may take its own material."""
    c, f, u = np.asarray(c, float), np.asarray(fwd, float), np.asarray(up, float)
    f = f / np.linalg.norm(f)
    u = u - f * np.dot(u, f)
    u = u / np.linalg.norm(u)
    r = np.cross(f, u)
    m.new_part()
    P = {}
    for i in (-1, 1):
        for j in (-1, 1):
            for k in (-1, 1):
                P[i, j, k] = m.v(c + f * i * d / 2 + r * j * w / 2 + u * k * h / 2)
    m.quad(P[1, -1, -1], P[1, 1, -1], P[1, 1, 1], P[1, -1, 1], front or mat)
    m.quad(P[-1, -1, -1], P[-1, 1, -1], P[-1, 1, 1], P[-1, -1, 1], mat)
    m.quad(P[-1, -1, 1], P[1, -1, 1], P[1, 1, 1], P[-1, 1, 1], mat)
    m.quad(P[-1, -1, -1], P[1, -1, -1], P[1, 1, -1], P[-1, 1, -1], mat)
    m.quad(P[-1, -1, -1], P[1, -1, -1], P[1, -1, 1], P[-1, -1, 1], mat)
    m.quad(P[-1, 1, -1], P[1, 1, -1], P[1, 1, 1], P[-1, 1, 1], mat)


def spotpole(m: ra.Mesh) -> dict:
    # Steel pole on a footing, rungs up the back, a cradle, a drum light on a yoke looking east and down.
    m.box((-1.6, -1.6, 0), (1.6, 1.6, 1.0), "concrete")
    m.cyl((0, 0, 1.0), (0, 0, 20.0), 0.6, 0.45, "galv", n=10)
    for z in range(3, 19, 2):
        m.box((-1.15, -0.5, z), (-1.0, 0.5, z + 0.18), "galv", part=False)
    m.cyl((0, 0, 20.0), (0, 0, 20.5), 2.4, 2.4, "iron", n=12)
    m.cyl((0, 0, 20.5), (0, 0, 22.4), 0.35, 0.35, "iron", n=8)
    for y in (-1.5, 1.5):
        m.box((-0.3, y - 0.18, 21.4), (0.3, y + 0.18, 23.6), "iron", part=False)
    tilt = math.radians(22)
    ax = np.array([math.cos(tilt), 0.0, -math.sin(tilt)])
    mid = np.array([0.3, 0.0, 23.2])
    back = mid - ax * 1.7
    nose = mid + ax * 1.8
    m.cyl(back, nose, 1.15, 1.45, "iron", n=16)
    lens = nose + ax * 0.12
    m.cyl(nose, lens, 1.32, 1.32, "lens_cool", n=16)
    m.cyl(back - ax * 0.7, back, 0.6, 0.95, "iron", n=12)
    return {"bulbs": [tuple(lens + ax * 0.3)]}


def yardflood(m: ra.Mesh) -> dict:
    # Tripod work light: three splayed legs, a short mast, a square flood head tipped down, a generator behind.
    top = (0.0, 0.0, 9.0)
    for k in range(3):
        a = math.pi + (k - 1) * 2 * math.pi / 3
        m.cyl((3.0 * math.cos(a), 3.0 * math.sin(a), 0.0), top, 0.22, 0.22, "iron", n=6)
    m.cyl(top, (0, 0, 11.2), 0.3, 0.3, "galv", n=8)
    m.box((-0.2, -1.6, 10.9), (0.2, 1.6, 11.3), "galv")
    tilt = math.radians(28)
    f = np.array([math.cos(tilt), 0.0, -math.sin(tilt)])
    c = np.array([0.9, 0.0, 11.9])
    tilted_box(m, c, f, (0, 0, 1), 3.4, 2.8, 1.2, "iron")
    tilted_box(m, c + f * 0.62, f, (0, 0, 1), 2.9, 2.3, 0.06, "iron", front="lens")
    m.box((-6.6, -1.6, 0), (-3.6, 1.6, 2.4), "iron", top="galv")
    m.box((-6.2, -1.2, 2.4), (-5.4, -0.4, 3.0), "galv", part=False)
    return {"bulbs": [tuple(c + f * 0.75)]}


LAMPS = {
    # type: (builder, zoom)
    "gaslamp": (gaslamp, 9.0),
    "streetlamp": (streetlamp, 7.0),
    "floodlight": (floodlight, 6.0),
    "twinlamp": (twinlamp, 7.0),
    "sodium": (sodium, 6.4),
}

# Lamps that throw their light one way: turned through AIM_FACES faces before placing.
AIMED = {
    "spotpole": (spotpole, 6.6),
    "yardflood": (yardflood, 8.0),
}
AIM_FACES = 24


# ---------------------------------------------------------------- render


def canvas_for(mesh: ra.Mesh, ground: list[tuple[float, float]]) -> ra.Canvas:
    """A canvas that holds every vertex and the ground corners, with a margin."""
    k = ra.ZOOM * SS
    P = np.array(mesh.verts)
    G = np.array([(x, y, 0.0) for x, y in ground])
    allp = np.vstack([P, G])
    sx = (allp[:, 0] - allp[:, 1]) * k
    sy = (allp[:, 0] + allp[:, 1]) * 0.5 * k - allp[:, 2] * k
    m = MARGIN * k
    left, right = sx.min() - m, sx.max() + m
    top, bottom = sy.min() - m, sy.max() + m
    w = int(math.ceil((right - left) / SS)) * SS
    h = int(math.ceil((bottom - top) / SS)) * SS
    return ra.Canvas(w, h, -left, -top)


def screen(cv: ra.Canvas, x: float, y: float, z: float) -> tuple[float, float]:
    sx, sy, _ = cv.to_screen(np.array([[x, y, z]]))
    return round(float(sx[0]) / SS, 1), round(float(sy[0]) / SS, 1)


def shade_frame(mesh: ra.Mesh, props: ra.Mesh | None, cv: ra.Canvas, near) -> Image.Image:
    caster = props if props is not None else mesh
    sh = ra.shadow_mask(caster, cv)
    ao = ra.contact_ao(caster, cv)
    fr = ra.rasterize(mesh, cv)
    ra.ink(fr, SS)
    ra.silhouette(fr, SS)
    ys, xs = np.mgrid[0 : cv.h, 0 : cv.w].astype(np.float64) + 0.5
    gx, gy = cv.to_world_ground(xs, ys)
    shadow = np.clip(sh * 0.42 + ao * 0.12, 0, 0.6) * near(gx, gy)
    solid = fr.alpha > 0.5
    # Only ground-level faces take the cast shadow: height from depth = X + Y + Z against the ground hit.
    zw = (fr.depth - gx - gy) / 3.0
    up = solid & (fr.normal[..., 2] > 0.7) & (zw < 2.5)
    color = fr.color.copy()
    color[up] *= (1 - shadow[up])[:, None]
    alpha = fr.alpha.copy()
    out = ~solid & (shadow > 0.02)
    color[out] = ra.OUTLINE * 0.4
    alpha[out] = shadow[out]
    return ra.downsample(color, alpha, SS)


def render_building(name: str, out_dir: Path) -> list[dict]:
    size, build = BUILDINGS[name]
    W, H = (size, size) if isinstance(size, (int, float)) else size
    ra.ZOOM = ZOOM_BUILDING
    faces = []
    for face, suffix in enumerate(FACES):
        full = Turned(size, face)
        info = build(full, W, H) if W != H else build(full, W)
        # Props only (no apron) cast the shadow, so the slab does not darken itself.
        bare = Turned(size, face)
        build(bare, W, H) if W != H else build(bare, W)
        bare.m.tris = [tr for tr in bare.m.tris if tr[3] not in ("yard",)]
        cv = canvas_for(full.m, [(0, 0), (W, 0), (0, H), (W, H)])
        img = shade_frame(full.m, bare.m, cv, lambda gx, gy: (gx > -3) & (gx < W + 3) & (gy > -3) & (gy < H + 3))
        file = f"{name}{suffix}.png"
        img.save(out_dir / file, optimize=True)
        south = screen(cv, W, H, 0.0)
        top = full.p(*info["top"])
        stack = screen(cv, *top)
        faces.append(
            {
                "file": file,
                "size": list(img.size),
                "padWidth": round((W + H) * ra.ZOOM, 1),
                "padSouthX": south[0],
                "padSouthY": south[1],
                "stackX": round(screen(cv, W / 2, H / 2, 0)[0], 1),
                "stackY": round(max(4.0, stack[1] - 6), 1),
            }
        )
        print("wrote", out_dir / file, faces[-1])
    return faces


def bulb_list(info: dict) -> list:
    return info["bulbs"] if "bulbs" in info else [info["bulb"]]


def render_lamp(name: str, out_dir: Path) -> dict:
    build, zoom = LAMPS[name]
    ra.ZOOM = zoom
    m = ra.Mesh()
    info = build(m)
    cv = canvas_for(m, [(-4, -4), (4, -4), (-4, 4), (4, 4)])
    img = shade_frame(m, None, cv, lambda gx, gy: ra.smooth(16.0, 6.0, np.hypot(gx, gy)))
    # Trim to the drawn pixels so the contact and bulb stay in the trimmed frame.
    bb = img.getbbox() or (0, 0, img.width, img.height)
    img = img.crop(bb)
    file = f"lamp-{name}.png"
    img.save(out_dir / file, optimize=True)
    c = screen(cv, 0, 0, 0)
    meta = {
        "file": file,
        "size": list(img.size),
        "contactX": round(c[0] - bb[0], 1),
        "contactY": round(c[1] - bb[1], 1),
        "bulbs": [[round(x - bb[0], 1), round(y - bb[1], 1)] for x, y in (screen(cv, *q) for q in bulb_list(info))],
    }
    print("wrote", out_dir / file, meta)
    return meta


def render_aimed(name: str, out_dir: Path) -> dict:
    """Every face of an aimed lamp on one canvas, cropped to the union of their pixels, so all draw at one scale."""
    build, zoom = AIMED[name]
    ra.ZOOM = zoom
    meshes, bulbs = [], []
    for k in range(AIM_FACES):
        m = ra.Mesh()
        info = build(m)
        a = 2 * math.pi * k / AIM_FACES
        turn_mesh(m, a, 0.0, 0.0)
        cs, sn = math.cos(a), math.sin(a)
        bulbs.append([(x * cs - y * sn, x * sn + y * cs, z) for x, y, z in bulb_list(info)])
        meshes.append(m)
    union = ra.Mesh()
    union.verts = [v for m in meshes for v in m.verts]
    cv = canvas_for(union, [(-8, -8), (8, -8), (-8, 8), (8, 8)])
    imgs = [shade_frame(m, None, cv, lambda gx, gy: ra.smooth(16.0, 6.0, np.hypot(gx, gy))) for m in meshes]
    boxes = [im.getbbox() or (0, 0, im.width, im.height) for im in imgs]
    bb = (min(q[0] for q in boxes), min(q[1] for q in boxes), max(q[2] for q in boxes), max(q[3] for q in boxes))
    c = screen(cv, 0, 0, 0)
    faces = []
    for k, (im, bs) in enumerate(zip(imgs, bulbs)):
        file = f"lamp-{name}-{k:02d}.png"
        im.crop(bb).save(out_dir / file, optimize=True)
        faces.append({"file": file, "bulbs": [[round(x - bb[0], 1), round(y - bb[1], 1)] for x, y in (screen(cv, *q) for q in bs)]})
    meta = {
        "size": [bb[2] - bb[0], bb[3] - bb[1]],
        "contactX": round(c[0] - bb[0], 1),
        "contactY": round(c[1] - bb[1], 1),
        "faces": faces,
    }
    print("wrote", out_dir / f"lamp-{name}-NN.png", meta["size"], meta["contactX"], meta["contactY"])
    return meta


def preview(asset_dir: Path, names: list[str]) -> None:
    PREVIEW.mkdir(exist_ok=True)
    tiles = []
    for n in names:
        if n in BUILDINGS:
            for s in FACES:
                tiles.append(Image.open(asset_dir / "buildings" / f"{n}{s}.png"))
        elif n in AIMED:
            for k in range(0, AIM_FACES, 3):
                tiles.append(Image.open(asset_dir / "terrain" / f"lamp-{n}-{k:02d}.png"))
        else:
            tiles.append(Image.open(asset_dir / "terrain" / f"lamp-{n}.png"))
    h = 300
    tiles = [t.resize((max(1, int(t.width * h / t.height)), h), Image.Resampling.LANCZOS) for t in tiles]
    per = 4
    rows = [tiles[i : i + per] for i in range(0, len(tiles), per)]
    W = max(sum(t.width for t in r) for r in rows) + 10 * per
    sheet = Image.new("RGBA", (W, len(rows) * (h + 10)), (96, 112, 78, 255))
    d = ImageDraw.Draw(sheet)
    for j, r in enumerate(rows):
        x = 5
        for t in r:
            sheet.alpha_composite(t, (x, j * (h + 10) + 5))
            x += t.width + 10
    del d
    sheet.save(PREVIEW / "industry.png")
    print("preview", PREVIEW / "industry.png")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True, help="client assets folder (holds buildings/ and terrain/)")
    ap.add_argument("--only", default="", help="comma list of building or lamp types")
    ap.add_argument("--preview", action="store_true")
    args = ap.parse_args()
    out = Path(args.out)
    names = [n for n in args.only.split(",") if n] or [*BUILDINGS, *LAMPS, *AIMED]
    bdir = out / "buildings"
    ldir = out / "terrain"
    bjson = bdir / "industry.json"
    ljson = ldir / "lamps.json"
    bdir.mkdir(parents=True, exist_ok=True)
    ldir.mkdir(parents=True, exist_ok=True)
    bman = json.loads(bjson.read_text()) if bjson.exists() else {}
    lman = json.loads(ljson.read_text()) if ljson.exists() else {}
    for n in names:
        if n in BUILDINGS:
            bman[n] = render_building(n, bdir)
        elif n in LAMPS:
            lman[n] = render_lamp(n, ldir)
        elif n in AIMED:
            lman[n] = render_aimed(n, ldir)
        else:
            raise SystemExit(f"unknown type {n}")
    if bman:
        bjson.write_text(json.dumps(bman, indent=2) + "\n")
    if lman:
        ljson.write_text(json.dumps(lman, indent=2) + "\n")
    if args.preview:
        preview(out, names)


if __name__ == "__main__":
    main()
