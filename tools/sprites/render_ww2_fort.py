#!/usr/bin/env python3
"""WW2 German field fortifications: Tobruk pit, Regelbau casemate, timber Hochstand, concrete Leitturm.

Garrison buildings the player turns before placing, so each one writes, like the Bunker:
<id>.png (unturned face, front to the east, door to the west), <id>.json (pad metrics plus
roofZ, the world height of its top surface), <id>-cameo.png (96x96), and <id>/00.png .. 23.png
with <id>/faces.json (24 faces 15 degrees apart, see turn_faces.py).

This module also holds the shared WW2 kit used by render_ww2_guns.py: the materials
(dunkelgelb camouflage, feldgrau, timber, camouflage net, ...), a local-frame mesh helper,
the crew figure with the M35 helmet, and footprint-generic canvas / turn / cameo helpers.

Look: the Bunker's inked structure style (render_bunker.py materials on the render_airfield.py
mesh, raster, ink, silhouette, key light, and cast shadow) at the same 3x source zoom.

  cd tools/sprites && python3 render_ww2_fort.py --out ../../gridlock/packages/client/src/assets/buildings [--only tobruk casemate ...]
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image

import render_bunker as rb
import turn_faces as tf

ra = rb.ra
ra.ZOOM = 3.0
SS = ra.SS
PREVIEW = Path(__file__).parent / "preview"


def rgb(h: str) -> np.ndarray:
    return ra.rgb(h)


# ---------------------------------------------------------------- materials

# The traversing gun's frame: camouflage is read in the gun's own frame so blotches stay put as it turns.
GUN_FRAME = {"yaw": 0.0, "cx": 0.0, "cy": 0.0}

_prev_tex = ra.tex


def _gun_local(X: np.ndarray, Y: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    a, cx, cy = GUN_FRAME["yaw"], GUN_FRAME["cx"], GUN_FRAME["cy"]
    c, s = math.cos(a), math.sin(a)
    dx, dy = X - cx, Y - cy
    return dx * c + dy * s, -dx * s + dy * c


def tex(mat: str, P: np.ndarray, n: np.ndarray) -> np.ndarray:
    X, Y, Z = P[:, 0], P[:, 1], P[:, 2]
    nf = ra.vnoise(X / 1.1 + Z * 0.7, Y / 1.1 - Z * 0.5, 7)
    nm = ra.fbm(X / 6 + Z * 0.2, Y / 6 + Z * 0.3, 9, 3)
    side_u = X if abs(n[1]) >= abs(n[0]) else Y

    def base(h):
        return np.broadcast_to(rgb(h), (len(X), 3)).copy()

    if mat in ("dgelb", "dgelb_dark"):
        lx, ly = _gun_local(X, Y)
        c = base("#b59a5a" if mat == "dgelb" else "#9a8048") * (0.92 + 0.1 * nm[:, None]) * (0.95 + 0.08 * nf[:, None])
        olive = ra.smooth(0.56, 0.62, ra.fbm(lx / 2.6 + Z * 0.3, ly / 2.6 - Z * 0.2, 41, 3))
        brown = ra.smooth(0.6, 0.66, ra.fbm(lx / 2.2 - Z * 0.25, ly / 2.2 + Z * 0.3, 43, 3))
        c = ra.mix(c, base("#5a5f3a") * (0.95 + 0.1 * nf[:, None]), olive)
        return ra.mix(c, base("#6b4a30") * (0.95 + 0.1 * nf[:, None]), brown * (1 - olive))
    if mat == "gunsteel":
        return base("#3a3b35") * (0.9 + 0.18 * nf[:, None])
    if mat == "bore":
        return base("#121110")
    if mat == "feldgrau":
        return base("#687059") * (0.9 + 0.16 * nf[:, None])
    if mat == "feldgrau_dark":
        return base("#565c48") * (0.9 + 0.14 * nf[:, None])
    if mat == "helmet":
        return base("#5f6656") * (0.92 + 0.12 * nf[:, None])
    if mat == "skin":
        return base("#d6a37c")
    if mat == "boots":
        return base("#221f1a")
    if mat == "belt":
        return base("#2b2720")
    if mat == "brass":
        return base("#c9a24a") * (0.9 + 0.18 * nf[:, None])
    if mat == "ammo":
        c = base("#4f5436") * (0.88 + 0.2 * nf[:, None])
        if abs(n[2]) < 0.7:
            c[np.mod(Z, 1.4) < 0.2] *= 0.72
        return c
    if mat == "timber":
        # Rough sawn posts: grain along the length, darker knots.
        c = base("#6e5234") * (0.86 + 0.24 * ra.vnoise(X * 3 + Y * 3, Z / 3, 51)[:, None])
        return c * (0.92 + 0.12 * nf[:, None])
    if mat == "plank":
        # Horizontal boards on walls, boards along X on floors.
        if abs(n[2]) < 0.7:
            b = np.floor(Z / 0.9)
            c = ra.mix(base("#7a5c3a"), base("#8c6c45"), ra.cell_rand(b, np.floor(side_u / 5), 53))
            c[np.mod(Z, 0.9) < 0.14] *= 0.62
        else:
            b = np.floor(Y / 0.9)
            c = ra.mix(base("#7a5c3a"), base("#8c6c45"), ra.cell_rand(b, np.floor(X / 5), 53))
            c[np.mod(Y, 0.9) < 0.14] *= 0.62
        return c * (0.9 + 0.14 * nf[:, None])
    if mat == "tarpaper":
        c = base("#3c3a33") * (0.9 + 0.14 * nm[:, None])
        c[np.mod(X + 0.0 * Y, 3.0) < 0.2] *= 0.75
        return c
    if mat == "cupola":
        c = base("#4d504c") * (0.88 + 0.16 * nm[:, None]) * (0.95 + 0.08 * nf[:, None])
        rust = ra.smooth(0.66, 0.86, ra.fbm(X / 2, Y / 2 + Z, 55))
        return ra.mix(c, base("#6b4a30"), rust * 0.35)
    if mat == "camonet":
        t = ra.fbm(X / 1.6, Y / 1.6 + Z * 0.3, 57, 3)
        c = ra.mix(base("#4a5530"), base("#77703f"), ra.smooth(0.4, 0.7, t))
        c = ra.mix(c, base("#5c4a30"), ra.smooth(0.62, 0.75, ra.fbm(X / 2.4 + 9, Y / 2.4, 59)) * 0.7)
        hole = ra.smooth(0.55, 0.75, ra.vnoise(X * 2.2 + Y * 0.4, Y * 2.2 - X * 0.4, 61))
        return c * (1 - 0.45 * hole)[:, None]
    if mat == "pit":
        c = ra.mix(base("#5a4630"), base("#6b5638"), nm)
        return c * (0.88 + 0.18 * nf[:, None])
    if mat == "bank":
        # Earth banks with sod on the gentle faces, bare earth on the steep ones.
        g = ra.smooth(0.45, 0.85, np.full(len(X), abs(n[2])))
        grass = ra.mix(base("#56683a"), base("#6f7f44"), nm)
        dirt = base("#6c5a3b") * (0.9 + 0.15 * nf[:, None])
        c = ra.mix(dirt, grass, g * (0.7 + 0.3 * ra.smooth(0.3, 0.6, ra.fbm(X / 4, Y / 4, 63))))
        return c * (0.92 + 0.12 * nf[:, None])
    if mat == "acon":
        # Atlantic Wall concrete: darker, board-formed, rain streaked.
        c = base("#8f8d82") * (0.9 + 0.12 * nm[:, None]) * (0.95 + 0.07 * nf[:, None])
        if abs(n[2]) < 0.7:
            c[np.mod(Z, 1.2) < 0.14] *= 0.84
            streak = ra.smooth(0.64, 0.9, ra.vnoise(side_u / 1.3, Z / 9, 65)) * 0.18
            c *= (1 - streak)[:, None]
        grime = ra.smooth(4.0, 0.0, Z) * 0.2
        return c * (1 - grime)[:, None]
    if mat.startswith("emb"):
        # Inside the embrasure: each step back is in deeper shade.
        k = (0.78, 0.6, 0.46, 0.34)[int(mat[3])]
        return tex("acon", P, n) * k
    if mat == "acon_lit":
        # Edges of the embrasure steps, a touch paler so the layering reads.
        return base("#a8a698") * (0.92 + 0.1 * nm[:, None]) * (0.95 + 0.07 * nf[:, None])
    if mat == "jerry":
        c = base("#4d5235") * (0.9 + 0.16 * nf[:, None])
        return c
    return _prev_tex(mat, P, n)


ra.tex = tex


# ---------------------------------------------------------------- local-frame mesh


class LM:
    """Builds into a Mesh in a local frame: x forward, turned by yaw about (cx, cy), z up from z0, scaled by k."""

    def __init__(self, m: ra.Mesh, yaw: float = 0.0, cx: float = 0.0, cy: float = 0.0, z0: float = 0.0, k: float = 1.0, fn=None):
        self.m = m
        self.k = k
        if fn is None:
            c, s = math.cos(yaw), math.sin(yaw)

            def fn(p):
                x, y, z = p
                return (cx + (x * c - y * s) * k, cy + (x * s + y * c) * k, z0 + z * k)

        self.fn = fn

    def w(self, p):
        return self.fn(p)

    def sub(self, x: float, y: float, yaw: float = 0.0, z: float = 0.0, k: float = 1.0) -> "LM":
        """A child frame at (x, y, z) in this one, turned by yaw and scaled by k."""
        c, s = math.cos(yaw), math.sin(yaw)
        parent = self.fn

        def fn(p):
            px, py, pz = p
            return parent((x + (px * c - py * s) * k, y + (px * s + py * c) * k, z + pz * k))

        return LM(self.m, fn=fn, k=self.k * k)

    def hexa(self, p8, mat, top=None, part=True, skip=()):
        """Eight corners in Mesh.box order: z0 (y0: x0 x1, y1: x0 x1), then z1 the same."""
        m = self.m
        if part:
            m.new_part()
        p = [m.v(self.w(q)) for q in p8]
        faces = {
            "bottom": (p[0], p[1], p[3], p[2]),
            "top": (p[4], p[5], p[7], p[6]),
            "y0": (p[0], p[1], p[5], p[4]),
            "y1": (p[2], p[3], p[7], p[6]),
            "x0": (p[0], p[2], p[6], p[4]),
            "x1": (p[1], p[3], p[7], p[5]),
        }
        for key, q in faces.items():
            if key in skip:
                continue
            m.quad(*q, (top or mat) if key == "top" else mat)

    def box(self, lo, hi, mat, top=None, part=True, skip=()):
        x0, y0, z0 = lo
        x1, y1, z1 = hi
        self.hexa([(x, y, z) for z in (z0, z1) for y in (y0, y1) for x in (x0, x1)], mat, top, part, skip)

    def cyl(self, a, b, r0, r1, mat, n=12, part=True, caps=True, cap_mat=None):
        self.m.cyl(self.w(a), self.w(b), r0 * self.k, r1 * self.k, mat, n=n, part=part, caps=caps, cap_mat=cap_mat)

    def rod(self, a, b, r, mat, n=6, part=True):
        self.cyl(a, b, r, r, mat, n=n, part=part)

    def quad(self, pts, mat, part=True):
        if part:
            self.m.new_part()
        ids = [self.m.v(self.w(p)) for p in pts]
        for i in range(1, len(ids) - 1):
            self.m.tri(ids[0], ids[i], ids[i + 1], mat)

    def ring(self, pts_lo, pts_hi, z0, z1, mat, top=None, part=True, closed=True):
        """A prism between a ring at z0 and one at z1 (local points), capped on top."""
        if part:
            self.m.new_part()
        a = [self.m.v(self.w((x, y, z0))) for x, y in pts_lo]
        b = [self.m.v(self.w((x, y, z1))) for x, y in pts_hi]
        n = len(a)
        for i in range(n if closed else n - 1):
            j = (i + 1) % n
            self.m.quad(a[i], a[j], b[j], b[i], mat)
        for i in range(1, n - 1):
            self.m.tri(b[0], b[i], b[i + 1], top or mat)


def circle(r: float, n: int = 16, cx: float = 0.0, cy: float = 0.0, a0: float = 0.0) -> list[tuple[float, float]]:
    return [(cx + r * math.cos(a0 + 2 * math.pi * i / n), cy + r * math.sin(a0 + 2 * math.pi * i / n)) for i in range(n)]


def annulus(L: LM, r_in0, r_out0, r_in1, r_out1, z0, z1, mat, a0, a1, segs, top=None, per_seg_part=True):
    """A ring wall from angle a0 to a1: inner/outer radii at the foot (r*0) and at the top (r*1)."""
    m = L.m
    if not per_seg_part:
        m.new_part()
    for i in range(segs):
        t0 = a0 + (a1 - a0) * i / segs
        t1 = a0 + (a1 - a0) * (i + 1) / segs
        if per_seg_part:
            m.new_part()
        c0, s0, c1, s1 = math.cos(t0), math.sin(t0), math.cos(t1), math.sin(t1)
        lo = [L.w((r_in0 * c0, r_in0 * s0, z0)), L.w((r_out0 * c0, r_out0 * s0, z0)), L.w((r_out0 * c1, r_out0 * s1, z0)), L.w((r_in0 * c1, r_in0 * s1, z0))]
        hi = [L.w((r_in1 * c0, r_in1 * s0, z1)), L.w((r_out1 * c0, r_out1 * s0, z1)), L.w((r_out1 * c1, r_out1 * s1, z1)), L.w((r_in1 * c1, r_in1 * s1, z1))]
        lo = [m.v(p) for p in lo]
        hi = [m.v(p) for p in hi]
        m.quad(hi[0], hi[1], hi[2], hi[3], top or mat)
        m.quad(lo[1], lo[2], hi[2], hi[1], mat)
        m.quad(lo[0], lo[3], hi[3], hi[0], mat)
        if i == 0:
            m.quad(lo[0], lo[1], hi[1], hi[0], mat)
        if i == segs - 1:
            m.quad(lo[3], lo[2], hi[2], hi[3], mat)


def bag_ring(L: LM, r_in: float, r_out: float, courses: int, course_h: float, a0: float, a1: float, bag_len: float = 3.4, z0: float = 0.0):
    """Stacked sandbag courses round an arc, each bag its own part so the ink draws the bag seams."""
    for c in range(courses):
        inset = 0.25 * c
        ri, ro = r_in + inset, r_out - inset
        rm = (ri + ro) / 2
        n = max(1, int(round(abs(a1 - a0) * rm / bag_len)))
        za, zb = z0 + c * course_h, z0 + (c + 1) * course_h
        for i in range(n):
            t0 = a0 + (a1 - a0) * i / n + (a1 - a0) / n * 0.5 * (c % 2)
            t1 = min(a1, t0 + (a1 - a0) / n) if a1 > a0 else max(a1, t0 + (a1 - a0) / n)
            if abs(t1 - t0) < 1e-3:
                continue
            g = 0.02
            annulus(L, ri, ro, ri + 0.12, ro - 0.12, za, zb - 0.05, "sandbag", t0 + g / rm, t1 - g / rm, 2, per_seg_part=False)


def bags(L: LM, x0, y0, x1, y1, z0, courses, course_h=1.2, bag_len=3.2):
    """A straight stack of sandbags, bag by bag."""
    along_x = (x1 - x0) >= (y1 - y0)
    length = (x1 - x0) if along_x else (y1 - y0)
    for c in range(courses):
        n = max(1, int(round(length / bag_len)))
        step = length / n
        sh = 0.5 * step * (c % 2)
        ins = 0.2 * c
        za = z0 + c * course_h
        for i in range(n - (c % 2)):
            a = (x0 if along_x else y0) + sh + i * step + 0.04
            b = a + step - 0.08
            if along_x:
                L.box((a, y0 + ins, za), (b, y1 - ins, za + course_h - 0.04), "sandbag")
            else:
                L.box((x0 + ins, a, za), (x1 - ins, b, za + course_h - 0.04), "sandbag")


# ---------------------------------------------------------------- crew figure


def soldier(L: LM, pose: str = "kneel", hold: str | None = None) -> None:
    """A German soldier facing +x on the local ground, feet at the origin: feldgrau, belt, boots, M35 helmet.

    Poses: stand, kneel, sit (on a seat ~2.2 high), crouch. hold: None, "shell" (a brass round across the arms),
    "clip" (a brass Flak clip held up), "aim" (arms forward to a gun).
    """
    L.m.new_part()
    if pose == "stand":
        hip, sh, legs = 3.8, 6.6, "stand"
    elif pose == "sit":
        hip, sh, legs = 2.4, 5.2, "sit"
    elif pose == "crouch":
        hip, sh, legs = 2.6, 5.1, "crouch"
    else:
        hip, sh, legs = 2.6, 5.4, "kneel"
    lean = 0.35 if pose in ("kneel", "crouch") else 0.0
    # Legs.
    if legs == "stand":
        for sy in (-0.6, 0.6):
            L.box((-0.45, sy - 0.38, 0.9), (0.45, sy + 0.38, hip), "feldgrau", part=False)
            L.box((-0.5, sy - 0.42, 0.0), (0.75, sy + 0.42, 1.1), "boots", part=False)
    elif legs == "sit":
        for sy in (-0.6, 0.6):
            L.box((-0.4, sy - 0.4, hip - 0.9), (1.7, sy + 0.4, hip), "feldgrau", part=False)
            L.box((1.2, sy - 0.38, 0.9), (2.0, sy + 0.38, hip - 0.6), "feldgrau", part=False)
            L.box((1.1, sy - 0.42, 0.0), (2.3, sy + 0.42, 1.0), "boots", part=False)
    elif legs == "crouch":
        for sy in (-0.65, 0.65):
            L.box((-0.3, sy - 0.4, 1.6), (1.4, sy + 0.4, hip), "feldgrau", part=False)
            L.box((0.9, sy - 0.38, 0.6), (1.6, sy + 0.38, 1.9), "feldgrau", part=False)
            L.box((0.6, sy - 0.42, 0.0), (1.9, sy + 0.42, 0.8), "boots", part=False)
    else:
        # Right knee up, left knee on the ground with the boot behind.
        L.box((-0.3, 0.25, hip - 0.9), (1.5, 1.05, hip), "feldgrau", part=False)
        L.box((1.0, 0.28, 0.9), (1.8, 1.02, hip - 0.5), "feldgrau", part=False)
        L.box((0.8, 0.22, 0.0), (2.1, 1.08, 1.0), "boots", part=False)
        L.box((-0.4, -1.05, 0.7), (0.4, -0.25, hip), "feldgrau", part=False)
        L.box((-2.0, -1.0, 0.0), (0.2, -0.3, 0.8), "feldgrau", part=False)
        L.box((-2.6, -0.95, 0.0), (-1.7, -0.35, 1.0), "boots", part=False)
    # Torso, a little leaned in when kneeling, and the belt with its pouches.
    t = lean
    L.hexa(
        [
            (-0.65, -1.0, hip), (0.65, -1.0, hip), (-0.65, 1.0, hip), (0.65, 1.0, hip),
            (-0.75 + t, -1.25, sh), (0.7 + t, -1.25, sh), (-0.75 + t, 1.25, sh), (0.7 + t, 1.25, sh),
        ],
        "feldgrau",
        part=False,
    )
    L.box((-0.72, -1.08, hip + 0.05), (0.72, 1.08, hip + 0.45), "belt", part=False)
    L.box((0.6, -0.9, hip + 0.1), (0.95, -0.3, hip + 0.7), "belt", part=False)
    L.box((0.6, 0.3, hip + 0.1), (0.95, 0.9, hip + 0.7), "belt", part=False)
    # Arms.
    if hold in ("shell", "aim", "clip"):
        for sy in (-1.15, 1.15):
            L.box((-0.2 + t, sy - 0.32, sh - 1.5), (1.9 + t, sy + 0.32, sh - 0.7), "feldgrau_dark", part=False)
        if hold == "shell":
            L.cyl((1.5 + t, -1.8, sh - 1.3), (1.5 + t, 2.2, sh - 1.3), 0.45, 0.45, "brass", n=8, part=False)
            L.cyl((1.5 + t, 2.2, sh - 1.3), (1.5 + t, 2.9, sh - 1.3), 0.45, 0.18, "gunsteel", n=8, part=False)
        if hold == "clip":
            L.box((1.6 + t, -0.9, sh - 1.6), (2.3 + t, 0.9, sh + 0.6), "brass", part=False)
    else:
        for sy in (-1.15, 1.15):
            L.box((-0.3 + t, sy - 0.32 + 0.15 * (sy > 0) - 0.15 * (sy < 0), hip + 0.2), (0.4 + t, sy + 0.32, sh - 0.1), "feldgrau_dark", part=False)
    # Head, then the coal-scuttle helmet: flared skirt low at the sides and back, short visor.
    hx = t
    L.box((hx - 0.5, -0.5, sh - 0.1), (hx + 0.55, 0.5, sh + 1.05), "skin", part=False)
    hz = sh + 0.55
    L.cyl((hx - 0.12, 0, hz), (hx - 0.12, 0, hz + 0.45), 1.12, 0.92, "helmet", n=12)  # its own part: the helmet outline
    L.cyl((hx - 0.12, 0, hz + 0.45), (hx - 0.12, 0, hz + 1.15), 0.92, 0.62, "helmet", n=12, part=False)
    L.cyl((hx - 0.12, 0, hz + 1.15), (hx - 0.12, 0, hz + 1.45), 0.62, 0.15, "helmet", n=12, part=False)


# ---------------------------------------------------------------- canvas / shade / turn / cameo


def make_canvas(W: float, H: float, top: float, side: float) -> ra.Canvas:
    k = ra.ZOOM * SS
    left = -(H + side) * k
    right = (W + side) * k
    upper = -top * k
    bottom = ((W + H) * 0.5 + side) * k
    w = int(math.ceil((right - left) / SS)) * SS
    h = int(math.ceil((bottom - upper) / SS)) * SS
    return ra.Canvas(w, h, -left, -upper)


def shade_mesh(mesh_fn, cv: ra.Canvas, W: float, H: float, reach: float, floor_top: float) -> Image.Image:
    props = mesh_fn(ground=False)
    fr = ra.rasterize(mesh_fn(), cv)
    return rb.shade(fr, cv, ra.shadow_mask(props, cv), ra.contact_ao(props, cv), reach, floor_top, W / 2, H / 2, math.hypot(W, H) / 2)


def pad_info(cv: ra.Canvas, W: float, H: float, stack_z: float) -> dict:
    south = cv.to_screen(np.array([[W, H, 0.0]]))
    stack = cv.to_screen(np.array([[W / 2, H / 2, stack_z]]))
    return {
        "padWidth": round((W + H) * ra.ZOOM, 1),
        "padSouthX": round(float(south[0][0]) / SS, 1),
        "padSouthY": round(float(south[1][0]) / SS, 1),
        "stackX": round(float(stack[0][0]) / SS, 1),
        "stackY": round(float(stack[1][0]) / SS, 1),
    }


def cameo(img: Image.Image, path: Path, crop: tuple[int, int, int, int] | None = None) -> None:
    cam = Image.new("RGBA", (96, 96), (0, 0, 0, 0))
    bb = crop or img.getbbox()
    if bb:
        c = img.crop(bb)
        f = min(92 / c.width, 92 / c.height)
        c = c.resize((max(1, round(c.width * f)), max(1, round(c.height * f))), Image.Resampling.LANCZOS)
        cam.alpha_composite(c, ((96 - c.width) // 2, (96 - c.height) // 2))
    cam.save(path)


def solid_box(img: Image.Image) -> tuple[int, int, int, int] | None:
    """Bounding box of the opaque model, leaving the soft shadow out."""
    return Image.fromarray(((np.asarray(img)[..., 3] > 200) * 255).astype(np.uint8)).getbbox()


def on_grass(img: Image.Image) -> Image.Image:
    bg = Image.new("RGBA", img.size, (74, 107, 50, 255))
    bg.alpha_composite(img)
    return bg


def edge_clear(img: Image.Image, name: str) -> None:
    """Warn when the art touches the canvas edge (it was clipped)."""
    a = np.asarray(img)[..., 3]
    hits = [k for k, e in (("top", a[0]), ("bottom", a[-1]), ("left", a[:, 0]), ("right", a[:, -1])) if (e > 8).any()]
    if hits:
        print(f"WARNING {name}: touches canvas edge {hits}")


def render_turned(out_dir: Path, name: str, mesh_fn, W: float, H: float, tiles, top, margin, reach, floor_top, stack_z) -> None:
    """render_bunker.render_turned for any footprint: <out>/<name>/NN.png and <name>/faces.json."""
    tf.install_texture_frame()
    CX, CY = W / 2, H / 2
    tile_px = W / tiles[0]
    radius = math.hypot(W, H) / 2
    cv = tf.disc_canvas(CX, CY, radius, top, margin)
    folder = out_dir / name
    folder.mkdir(parents=True, exist_ok=True)
    preview = PREVIEW / name
    preview.mkdir(parents=True, exist_ok=True)
    faces, sheet = [], []
    for k in range(tf.FACES):
        a = tf.face_angle(k)
        tf.set_turn(a, CX, CY)
        props = tf.turn_mesh(mesh_fn(ground=False), a, CX, CY)
        fr = ra.rasterize(tf.turn_mesh(mesh_fn(), a, CX, CY), cv)
        img = rb.shade(fr, cv, ra.shadow_mask(props, cv), ra.contact_ao(props, cv), reach, floor_top, CX, CY, radius)
        edge_clear(img, f"{name}/{k:02d}")
        box = tf.crop_box(img)
        img = img.crop(box)
        bw, bh = tf.box_tiles(tiles[0], tiles[1], a)
        info = tf.face_metrics(cv, CX, CY, bw * tile_px, bh * tile_px, (CX, CY, stack_z), (box[0], box[1]))
        info["file"] = f"{k:02d}.png"
        info["box"] = [bw, bh]
        faces.append(info)
        img.save(folder / info["file"], optimize=True)
        sheet.append(img)
    tf.set_turn(0.0, CX, CY)
    tf.write_manifest(folder / "faces.json", name, faces)
    cw = max(im.width for im in sheet)
    ch = max(im.height for im in sheet)
    grid = Image.new("RGBA", (cw * 6, ch * 4), (74, 107, 50, 255))
    for i, im in enumerate(sheet):
        grid.alpha_composite(im, ((i % 6) * cw + (cw - im.width) // 2, (i // 6) * ch + (ch - im.height) // 2))
    grid.save(preview / "faces.png")
    print("wrote", tf.FACES, "faces to", folder)


def render_building(out_dir: Path, name: str, mesh_fn, W, H, tiles, top, side, reach, floor_top, roof_z, stack_z, turned=True, cameo_crop=None) -> dict:
    cv = make_canvas(W, H, top, side)
    out_dir.mkdir(parents=True, exist_ok=True)
    PREVIEW.mkdir(exist_ok=True)
    img = shade_mesh(mesh_fn, cv, W, H, reach, floor_top)
    edge_clear(img, name)
    img.save(out_dir / f"{name}.png", optimize=True)
    on_grass(img).save(PREVIEW / f"{name}.png")
    info = pad_info(cv, W, H, stack_z)
    info["cell"] = list(img.size)
    info["roofZ"] = round(roof_z, 2)
    (out_dir / f"{name}.json").write_text(json.dumps(info, indent=2) + "\n")
    print(name, "metrics", info)
    cameo(img, out_dir / f"{name}-cameo.png", cameo_crop(img, cv) if cameo_crop else solid_box(img))
    if turned:
        render_turned(out_dir, name, mesh_fn, W, H, tiles, top, side, reach, floor_top, stack_z)
    return info


# ---------------------------------------------------------------- Tobruk pit (Ringstand 58c), t(1) x t(1)

TOB_W = TOB_H = 32.0
TOB_TOP = 4.2  # concrete cap


def tobruk_mesh(ground: bool = True) -> ra.Mesh:
    m = ra.Mesh()
    L = LM(m, cx=TOB_W / 2, cy=TOB_H / 2)
    if ground:
        # Earth mound with sod over it, the concrete just proud of it.
        L.ring(circle(13.5, 16, a0=math.pi / 16), circle(9.0, 16, a0=math.pi / 16), 0.0, 2.6, "bank", top="sod")
    # The buried block, its cap, and a chamfered collar round the ring hatch.
    L.box((-6.5, -6.5, 0.0), (6.5, 6.5, TOB_TOP - 0.7), "acon", top="slab")
    L.ring(
        [(-6.8, -6.8), (6.8, -6.8), (6.8, 6.8), (-6.8, 6.8)],
        [(-6.2, -6.2), (6.2, -6.2), (6.2, 6.2), (-6.2, 6.2)],
        TOB_TOP - 0.7, TOB_TOP, "slab", top="roof", part=False,
    )
    L.ring(circle(4.2, 16), circle(3.7, 16), TOB_TOP, TOB_TOP + 0.5, "slab")
    # The open ring: a dark shaft, and the steel rail round it on short posts.
    L.cyl((0.6, 0, TOB_TOP + 0.5), (0.6, 0, TOB_TOP + 0.56), 3.0, 3.0, "slit", n=16)
    pts = circle(3.4, 18, cx=0.6)
    for i in range(len(pts)):
        x0, y0 = pts[i]
        x1, y1 = pts[(i + 1) % len(pts)]
        L.rod((x0, y0, TOB_TOP + 1.2), (x1, y1, TOB_TOP + 1.2), 0.22, "steel", n=5, part=(i == 0))
    for x, y in circle(3.4, 4, cx=0.6, a0=math.pi / 4):
        L.rod((x, y, TOB_TOP + 0.4), (x, y, TOB_TOP + 1.25), 0.2, "steel", n=5)
    # The steel lid swung back on the rear of the cap.
    L.box((-6.0, -2.2, TOB_TOP), (-3.2, 2.2, TOB_TOP + 0.5), "cupola")
    # A lip of sandbags round the front and south side, and a couple at the rear entrance.
    for x0, y0, x1, y1 in ((7.2, -6.5, 9.6, 6.5), (-6.5, 7.2, 6.5, 9.6)):
        bags(L, x0, y0, x1, y1, 1.0, 2, 1.0, 3.2)
    bags(L, -12.0, -5.0, -9.6, 1.5, 0.0, 2, 1.0, 3.2)
    # An ammo box and a jerrycan by the entrance trench.
    L.box((-13.0, 3.0, 0.0), (-10.6, 5.2, 1.5), "ammo")
    L.box((-9.0, -10.5, 0.0), (-7.6, -8.4, 2.0), "jerry")
    return m


def net_patch(L: LM, x: float, y: float, rx: float, ry: float, z: float, seed: int, sag: float = 0.0) -> None:
    """A ragged blob of camouflage net lying on a surface, its centre lifted by `sag`."""
    rng = np.random.default_rng(seed)
    n = 14
    pts = []
    for i in range(n):
        a = 2 * math.pi * i / n
        f = 0.75 + 0.35 * rng.random()
        pts.append((x + rx * f * math.cos(a), y + ry * f * math.sin(a), z))
    L.m.new_part()
    c = L.m.v(L.w((x, y, z + sag)))
    ids = [L.m.v(L.w(p)) for p in pts]
    for i in range(n):
        L.m.tri(c, ids[i], ids[(i + 1) % n], "camonet")


# ---------------------------------------------------------------- Regelbau casemate, t(3) x t(2)

CAS_W, CAS_H = 96.0, 64.0
CAS_WALL = 13.0
CAS_ROOF = 16.5


def casemate_mesh(ground: bool = True) -> ra.Mesh:
    m = ra.Mesh()
    L = LM(m, cx=CAS_W / 2, cy=CAS_H / 2)
    xb, xf, hy = -34.0, 26.0, 19.0
    if ground:
        # Earth banked up both sides and round the back, sod on the slopes.
        bt = 8.5
        for s in (-1, 1):
            L.hexa(
                [
                    (xb - 2, s * hy, 0), (xf - 3, s * hy, 0), (xb - 2, s * (hy + 12), 0), (xf - 9, s * (hy + 12), 0),
                    (xb - 2, s * hy, bt), (xf - 5, s * hy, bt), (xb - 2, s * (hy + 2), bt), (xf - 7, s * (hy + 2), bt),
                ],
                "bank",
            )
        for y0, y1 in ((-hy - 12, -6.0), (6.0, hy + 12)):
            ya, yb = max(y0, -hy - 2), min(y1, hy + 2)
            L.hexa(
                [
                    (xb - 11, y0, 0), (xb, y0, 0), (xb - 11, y1, 0), (xb, y1, 0),
                    (xb - 2, ya, bt), (xb, ya, bt), (xb - 2, yb, bt), (xb, yb, bt),
                ],
                "bank",
            )
    # The body, its front face built round the embrasure.
    L.box((xb, -hy, 0.0), (xf, hy, CAS_WALL), "acon", skip=("x1",))
    ey, ez0, ez1 = 10.5, 2.4, 10.4
    face = [
        [(xf, -hy, 0), (xf, -ey, 0), (xf, -ey, CAS_WALL), (xf, -hy, CAS_WALL)],
        [(xf, ey, 0), (xf, hy, 0), (xf, hy, CAS_WALL), (xf, ey, CAS_WALL)],
        [(xf, -ey, 0), (xf, ey, 0), (xf, ey, ez0), (xf, -ey, ez0)],
        [(xf, -ey, ez1), (xf, ey, ez1), (xf, ey, CAS_WALL), (xf, -ey, CAS_WALL)],
    ]
    m.new_part()
    for q in face:
        L.quad(q, "acon", part=False)
    # Stepped embrasure: four receding frames, each smaller, ending in the dark gun port.
    steps = 4
    ry, rz0, rz1, x = ey, ez0, ez1, xf
    for i in range(steps):
        nx = x - 1.6
        mat = f"emb{i}"
        m.new_part()
        # Tunnel sides of this step.
        L.quad([(x, -ry, rz0), (nx, -ry, rz0), (nx, ry, rz0), (x, ry, rz0)], mat, part=False)
        L.quad([(x, -ry, rz1), (nx, -ry, rz1), (nx, ry, rz1), (x, ry, rz1)], mat, part=False)
        L.quad([(x, -ry, rz0), (nx, -ry, rz0), (nx, -ry, rz1), (x, -ry, rz1)], mat, part=False)
        L.quad([(x, ry, rz0), (nx, ry, rz0), (nx, ry, rz1), (x, ry, rz1)], mat, part=False)
        sy, sz = 1.9, 0.95
        if i < steps - 1:
            ny, nz0, nz1 = ry - sy, rz0 + sz, rz1 - sz
            # The riser between this frame and the next, facing out.
            rise = "acon_lit" if i == 0 else f"emb{i}"
            m.new_part()
            L.quad([(nx, -ry, rz0), (nx, ry, rz0), (nx, ry, nz0), (nx, -ry, nz0)], rise, part=False)
            L.quad([(nx, -ry, nz1), (nx, ry, nz1), (nx, ry, rz1), (nx, -ry, rz1)], rise, part=False)
            L.quad([(nx, -ry, nz0), (nx, -ny, nz0), (nx, -ny, nz1), (nx, -ry, nz1)], rise, part=False)
            L.quad([(nx, ny, nz0), (nx, ry, nz0), (nx, ry, nz1), (nx, ny, nz1)], rise, part=False)
            ry, rz0, rz1 = ny, nz0, nz1
        x = nx
    L.quad([(x, -ry, rz0), (x, ry, rz0), (x, ry, rz1), (x, -ry, rz1)], "slit")
    # A gun barrel stub in the port.
    L.rod((x, 0.0, (rz0 + rz1) / 2), (xf + 1.0, 0.0, (rz0 + rz1) / 2), 0.55, "gunsteel", n=8)
    # Two MG loopholes, each in a small stepped frame.
    for s in (-1, 1):
        y = s * 14.8
        L.box((xf, y - 2.6, 5.0), (xf + 0.6, y + 2.6, 9.2), "acon_lit")
        L.quad([(xf + 0.62, y - 1.5, 6.3), (xf + 0.62, y + 1.5, 6.3), (xf + 0.62, y + 1.5, 7.7), (xf + 0.62, y - 1.5, 7.7)], "slit")
    # Short wing walls flanking the front.
    for s in (-1, 1):
        L.hexa(
            [
                (xf - 1, s * (hy - 2.5), 0), (xf + 10, s * (hy + 3.5), 0), (xf - 1, s * hy, 0), (xf + 10, s * (hy + 6.0), 0),
                (xf - 1, s * (hy - 2.5), CAS_WALL - 1.5), (xf + 10, s * (hy + 3.5), 3.5), (xf - 1, s * hy, CAS_WALL - 1.5), (xf + 10, s * (hy + 6.0), 3.5),
            ],
            "acon",
        )
    # The thick roof slab with a sloped visor over the embrasure.
    L.box((xb - 1.0, -hy - 1.0, CAS_WALL), (xf - 3.0, hy + 1.0, CAS_ROOF), "slab", top="roof")
    L.hexa(
        [
            (xf - 3.0, -hy - 1.0, CAS_WALL), (xf + 0.8, -hy - 1.0, CAS_WALL), (xf - 3.0, hy + 1.0, CAS_WALL), (xf + 0.8, hy + 1.0, CAS_WALL),
            (xf - 3.0, -hy - 1.0, CAS_ROOF), (xf + 0.8, -hy - 1.0, CAS_WALL + 0.8), (xf - 3.0, hy + 1.0, CAS_ROOF), (xf + 0.8, hy + 1.0, CAS_WALL + 0.8),
        ],
        "slab",
        part=False,
    )
    # Sod heaped on the rear of the roof and camouflage net patches over it.
    L.ring([(xb + 1, -hy + 1), (xb + 18, -hy + 1), (xb + 18, hy - 1), (xb + 1, hy - 1)],
           [(xb + 3, -hy + 3), (xb + 14, -hy + 3), (xb + 14, hy - 3), (xb + 3, hy - 3)], CAS_ROOF, CAS_ROOF + 1.6, "sod")
    for (nx, ny, rx, ry, seed), z in (
        ((4.0, -12.0, 9.0, 6.0, 1), CAS_ROOF + 0.15),
        ((9.0, 11.0, 8.0, 6.5, 2), CAS_ROOF + 0.15),
        ((xb + 9.0, 7.0, 6.0, 7.0, 3), CAS_ROOF + 1.75),
    ):
        net_patch(L, nx, ny, rx, ry, z, seed)
    # Observation cupola: cast steel dome with vision slots, on a concrete collar.
    cx, cy = -6.0, -2.0
    L.cyl((cx, cy, CAS_ROOF), (cx, cy, CAS_ROOF + 1.0), 5.4, 5.0, "slab", n=18)
    L.cyl((cx, cy, CAS_ROOF + 1.0), (cx, cy, CAS_ROOF + 2.6), 4.3, 4.1, "cupola", n=18)
    L.cyl((cx, cy, CAS_ROOF + 2.6), (cx, cy, CAS_ROOF + 4.0), 4.1, 3.2, "cupola", n=18, part=False)
    L.cyl((cx, cy, CAS_ROOF + 4.0), (cx, cy, CAS_ROOF + 4.8), 3.2, 1.6, "cupola", n=18, part=False)
    L.cyl((cx, cy, CAS_ROOF + 4.8), (cx, cy, CAS_ROOF + 5.05), 1.6, 0.4, "cupola", n=18, part=False)
    for i in range(6):
        a = i * math.pi / 3 + math.pi / 6
        c, s = math.cos(a), math.sin(a)
        r = 4.28
        p = [(cx + r * c - 0.8 * s, cy + r * s + 0.8 * c), (cx + r * c + 0.8 * s, cy + r * s - 0.8 * c)]
        L.quad([(p[0][0], p[0][1], CAS_ROOF + 1.6), (p[1][0], p[1][1], CAS_ROOF + 1.6), (p[1][0], p[1][1], CAS_ROOF + 2.2), (p[0][0], p[0][1], CAS_ROOF + 2.2)], "slit")
    # Ventilation stack.
    L.rod((xb + 8, 12, CAS_ROOF), (xb + 8, 12, CAS_ROOF + 3.5), 0.8, "steel", n=8)
    # Rear entrance: a steel door in a recess wall, sandbags beside it.
    L.box((xb - 4.0, -9.0, 0.0), (xb + 0.3, -6.5, CAS_WALL - 2.0), "acon")
    L.box((xb - 4.0, 6.5, 0.0), (xb + 0.3, 9.0, CAS_WALL - 2.0), "acon")
    L.box((xb - 0.8, -6.5, 0.0), (xb + 0.2, 6.5, CAS_WALL - 3.0), "door")
    bags(L, xb - 9.0, 10.0, xb - 6.0, 18.0, 0.0, 3, 1.1, 3.0)
    bags(L, xb - 9.0, -18.0, xb - 6.0, -10.0, 0.0, 3, 1.1, 3.0)
    # Ammo boxes and a jerrycan stacked by the south wing wall.
    L.box((xf + 2.0, hy + 7.5, 0.0), (xf + 5.5, hy + 10.0, 2.0), "ammo")
    L.box((xf + 2.4, hy + 7.8, 2.0), (xf + 5.0, hy + 9.7, 3.6), "ammo")
    L.box((xf + 7.0, hy + 7.0, 0.0), (xf + 8.6, hy + 9.0, 2.2), "jerry")
    return m


# ---------------------------------------------------------------- Hochstand timber tower, t(1) x t(1)

HOC_W = HOC_H = 32.0
HOC_FLOOR = 38.0
HOC_ROOF = 48.8


def hochstand_mesh(ground: bool = True) -> ra.Mesh:
    m = ra.Mesh()
    L = LM(m, cx=HOC_W / 2, cy=HOC_H / 2)
    f = HOC_FLOOR
    foot, head = 11.5, 6.0
    if ground:
        L.cyl((0, 0, 0), (0, 0, 0.3), 15.0, 14.0, "pit", n=16)

    def leg(sx, sy, z):
        t = z / f
        r = foot + (head - foot) * t
        return (sx * r, sy * r, z)

    corners = ((1, 1), (1, -1), (-1, -1), (-1, 1))
    for sx, sy in corners:
        L.rod(leg(sx, sy, 0.0), leg(sx, sy, f + 0.2), 0.75, "timber", n=6)
        # Footing block.
        x, y, _ = leg(sx, sy, 0)
        L.box((x - 1.2, y - 1.2, 0.0), (x + 1.2, y + 1.2, 0.8), "acon")
    # Girts and X bracing on every side, in two bays.
    levels = (1.0, 19.0, f - 0.5)
    for i in range(4):
        a, b = corners[i], corners[(i + 1) % 4]
        for z in levels:
            L.rod(leg(*a, z), leg(*b, z), 0.4, "timber", n=5)
        for z0, z1 in ((levels[0], levels[1]), (levels[1], levels[2])):
            L.rod(leg(*a, z0), leg(*b, z1), 0.32, "timber", n=5)
            L.rod(leg(*b, z0), leg(*a, z1), 0.32, "timber", n=5)
    # Ladder up the east side, through a hatch in the floor.
    for y in (-1.3, 1.3):
        L.rod((13.0, y, 0.0), (5.8, y, f + 2.5), 0.3, "timber", n=5)
    for k in range(13):
        t = (k + 0.6) / 13.5
        x, z = 13.0 + (5.8 - 13.0) * t, (f + 2.5) * t
        L.rod((x, -1.3, z), (x, 1.3, z), 0.18, "timber", n=4, part=False)
    # Platform: joists and the plank floor overhanging the legs.
    p = 8.0
    L.box((-p - 0.6, -p - 0.6, f), (p + 0.6, p + 0.6, f + 1.0), "plank")
    for s in (-1, 1):
        L.box((-p - 1.0, s * 3.0 - 0.4, f - 0.8), (p + 1.0, s * 3.0 + 0.4, f), "timber")
    # Chest-high plank walls, open behind the ladder hatch on the east, with sandbags on the rim.
    wt, wh = 0.7, 4.2
    z0, z1 = f + 1.0, f + 1.0 + wh
    L.box((-p, -p, z0), (p, -p + wt, z1), "plank")
    L.box((-p, p - wt, z0), (p, p, z1), "plank")
    L.box((-p, -p + wt, z0), (-p + wt, p - wt, z1), "plank")
    L.box((p - wt, -p + wt, z0), (p, -3.0, z1), "plank")
    L.box((p - wt, 3.0, z0), (p, p - wt, z1), "plank")
    for x0, y0, x1, y1 in ((p - 1.6, -p + 0.2, p + 0.3, -3.2), (p - 1.6, 3.2, p + 0.3, p - 0.2), (-p + 0.4, p - 1.6, p - 0.4, p + 0.3)):
        bags(L, x0, y0, x1, y1, z1, 1, 1.1, 2.6)
    # Interior floor shade, and a sentry looking out over the front wall.
    L.box((-p + wt, -p + wt, z0), (p - wt, p - wt, z0 + 0.05), "interior")
    soldier(L.sub(5.0, 4.6, 0.6, z0), "stand")
    # Corner posts and the flat tar-paper roof with a board fascia.
    for sx, sy in corners:
        L.box((sx * (p - 0.4) - 0.4, sy * (p - 0.4) - 0.4, z1), (sx * (p - 0.4) + 0.4, sy * (p - 0.4) + 0.4, HOC_ROOF - 0.8), "timber")
    r = p + 1.8
    L.box((-r, -r, HOC_ROOF - 0.8), (r, r, HOC_ROOF - 0.2), "plank")
    L.box((-r + 0.4, -r + 0.4, HOC_ROOF - 0.2), (r - 0.4, r - 0.4, HOC_ROOF), "tarpaper", part=False)
    return m


# ---------------------------------------------------------------- Leitturm concrete fire-control tower, t(2) x t(2)

LEI_W = LEI_H = 64.0
LEI_ROOF = 50.0


def chamfer_sq(r: float, c: float) -> list[tuple[float, float]]:
    return [(r, -r + c), (r, r - c), (r - c, r), (-r + c, r), (-r, r - c), (-r, -r + c), (-r + c, -r), (r - c, -r)]


def leitturm_mesh(ground: bool = True) -> ra.Mesh:
    m = ra.Mesh()
    L = LM(m, cx=LEI_W / 2, cy=LEI_H / 2)
    R, C = 21.0, 5.5
    if ground:
        L.ring(chamfer_sq(29.0, 8.0), chamfer_sq(25.0, 7.0), 0.0, 3.0, "bank", top="sod")
    # Battered plinth, then the shaft in floors with proud string courses.
    L.ring(chamfer_sq(24.5, 6.5), chamfer_sq(22.5, 6.0), 0.0, 6.0, "acon", top="slab")
    floors = (6.0, 17.0, 28.0, 39.0, LEI_ROOF - 3.0)
    L.ring(chamfer_sq(R, C), chamfer_sq(R, C), floors[0], floors[-1], "acon")
    for z in floors[1:-1]:
        L.ring(chamfer_sq(R + 0.6, C + 0.2), chamfer_sq(R + 0.6, C + 0.2), z - 0.6, z, "slab", part=False)
    # Rows of window slits on the four faces.
    for zi in range(len(floors) - 1):
        za = floors[zi] + 4.0
        zb = za + 2.6 if zi < len(floors) - 2 else za + 1.6
        for k in range(4):
            a = k * math.pi / 2
            c, s = math.cos(a), math.sin(a)
            for t in (-9.0, 0.0, 9.0):
                if zi == 0 and t == 0.0 and k == 2:
                    continue
                w = 1.4
                o = R + 0.08
                pts = [(o, t - w, za), (o, t + w, za), (o, t + w, zb), (o, t - w, zb)]
                L.quad([(x * c - y * s, x * s + y * c, z) for x, y, z in pts], "slit")
                sill = [(o, t - w - 0.4, za - 0.5), (o + 0.6, t + w + 0.4, za)]
                (x0, y0, zz0), (x1, y1, zz1) = sill
                q = [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]
                q = [(x * c - y * s, x * s + y * c) for x, y in q]
                L.ring(q, q, zz0, zz1, "slab")
    # Top: a heavier crown with an overhanging parapet.
    top0 = floors[-1]
    L.ring(chamfer_sq(R, C), chamfer_sq(R + 1.6, C + 0.6), top0, top0 + 1.4, "slab")
    L.ring(chamfer_sq(R + 1.6, C + 0.6), chamfer_sq(R + 1.6, C + 0.6), top0 + 1.4, LEI_ROOF, "slab", top="roof", part=False)
    pr_o, pr_i = R + 1.6, R + 0.4
    for i in range(8):
        a, b = chamfer_sq(pr_o, C + 0.6)[i], chamfer_sq(pr_o, C + 0.6)[(i + 1) % 8]
        ai, bi = chamfer_sq(pr_i, C + 0.2)[i], chamfer_sq(pr_i, C + 0.2)[(i + 1) % 8]
        L.ring([a, b, bi, ai], [a, b, bi, ai], LEI_ROOF, LEI_ROOF + 2.6, "slab", top="slab")
    # Corner balcony galleries, cantilevered out on brackets, each with its own parapet.
    for sx, sy in ((1, 1), (1, -1), (-1, -1), (-1, 1)):
        bx, by = sx * (R - 1.5), sy * (R - 1.5)
        L.cyl((bx, by, top0 - 4.5), (bx, by, top0 - 2.0), 3.0, 5.6, "slab", n=12)
        L.cyl((bx, by, top0 - 2.0), (bx, by, top0 - 1.2), 5.6, 5.6, "slab", n=12, part=False)
        annulus(L.sub(bx, by), 4.8, 5.6, 4.8, 5.6, top0 - 1.2, top0 + 1.0, "slab",
                math.atan2(sy, sx) - 1.9, math.atan2(sy, sx) + 1.9, 8, per_seg_part=False)
        L.cyl((bx, by, top0 - 1.15), (bx, by, top0 - 1.1), 4.8, 4.8, "roof", n=12)
    # Rangefinder post toward the rear: pedestal, housing, and the long arm across.
    rx, ry = -10.0, -4.0
    L.cyl((rx, ry, LEI_ROOF), (rx, ry, LEI_ROOF + 3.4), 2.4, 2.0, "cupola", n=12)
    L.box((rx - 2.0, ry - 2.4, LEI_ROOF + 3.4), (rx + 2.2, ry + 2.4, LEI_ROOF + 5.6), "cupola")
    L.rod((rx + 0.4, ry - 9.0, LEI_ROOF + 4.6), (rx + 0.4, ry + 9.0, LEI_ROOF + 4.6), 0.9, "gunsteel", n=10)
    for e in (-9.4, 9.4):
        L.box((rx - 0.6, ry + e - 0.6, LEI_ROOF + 3.6), (rx + 1.4, ry + e + 0.6, LEI_ROOF + 5.6), "cupola")
    # Hatch housing and a vent, kept off the roof centre (the client's searchlight goes there).
    L.box((6.0, -15.0, LEI_ROOF), (12.0, -10.0, LEI_ROOF + 2.6), "slab", top="cupola")
    L.rod((-14.0, 13.0, LEI_ROOF), (-14.0, 13.0, LEI_ROOF + 3.0), 0.8, "steel", n=8)
    bags(L, 9.0, 12.0, 15.0, 15.0, LEI_ROOF, 2, 1.0, 3.0)
    # Rear entrance: blast wall, steel door, sandbags; crates at the foot.
    L.box((-R - 0.6, -6.0, 6.0), (-R + 0.2, 6.0, 14.5), "door")
    L.box((-R - 7.0, -10.0, 0.0), (-R - 4.5, 10.0, 9.0), "acon", top="slab")
    bags(L, -R - 7.5, 11.0, -R - 4.0, 20.0, 0.0, 3, 1.1, 3.0)
    L.box((R + 4.5, 14.0, 0.0), (R + 7.5, 17.0, 2.2), "ammo")
    L.box((R + 4.8, 18.0, 0.0), (R + 6.6, 20.0, 2.4), "jerry")
    return m


# ---------------------------------------------------------------- main

BUILDINGS = {
    # name: (mesh, W, H, tiles, top margin, side margin, shadow reach, floor top, roofZ, stack z)
    "tobruk": (tobruk_mesh, TOB_W, TOB_H, (4, 4), 14.0, 8.0, 4.0, 2.6, TOB_TOP, TOB_TOP + 8.0),
    "casemate": (casemate_mesh, CAS_W, CAS_H, (12, 8), 30.0, 12.0, 8.0, 3.0, CAS_ROOF, CAS_ROOF + 10.0),
    "hochstand": (hochstand_mesh, HOC_W, HOC_H, (4, 4), 60.0, 46.0, 40.0, 0.4, HOC_ROOF, HOC_ROOF + 6.0),
    "leitturm": (leitturm_mesh, LEI_W, LEI_H, (8, 8), 64.0, 56.0, 44.0, 6.0, LEI_ROOF, LEI_ROOF + 10.0),
}


def tall_cameo(top_z: float, mid_z: float, W: float, H: float):
    """Centre the cameo on the upper body of a tall building, like the Watch Tower's."""

    def crop(img: Image.Image, cv: ra.Canvas):
        body = solid_box(img)
        side = body[2] - body[0]
        mid = cv.to_screen(np.array([[W / 2, H / 2, mid_z]]))
        cy = int(float(mid[1][0]) / SS)
        top = max(0, cy - side // 2)
        return (body[0], top, body[2], top + side)

    return crop


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True, help="buildings asset folder")
    ap.add_argument("--only", nargs="*", help="building ids to render")
    ap.add_argument("--no-turned", action="store_true", help="skip the 24 turned faces (quick look)")
    args = ap.parse_args()
    for name, (fn, W, H, tiles, top, side, reach, floor, roof, stack) in BUILDINGS.items():
        if args.only and name not in args.only:
            continue
        crop = None
        if name == "hochstand":
            crop = tall_cameo(HOC_ROOF, HOC_FLOOR - 2.0, W, H)
        elif name == "leitturm":
            crop = tall_cameo(LEI_ROOF, LEI_ROOF - 22.0, W, H)
        render_building(Path(args.out), name, fn, W, H, tiles, top, side, reach, floor, roof, stack, not args.no_turned, crop)


if __name__ == "__main__":
    main()
