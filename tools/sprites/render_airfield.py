#!/usr/bin/env python3
"""Airfield structure art in the game's 2:1 iso projection.

Matches the other player structures (Armory, Smelter, Muster): a concrete
slab base with tile seams and a thick edge, riveted olive metal, rust,
crates, ink outlines on silhouettes and creases, soft light from the upper
left with cast shadows.

Deferred renderer: rasterize triangle ids, then shade per pixel with
procedural textures (world-space), a light-space shadow map, and an ink pass
that draws lines where parts or face normals change.

  python tools/sprites/render_airfield.py \\
      --out gridlock/packages/client/src/assets/buildings/airfield.png

Writes airfield.png, airfield.json (pad metrics for BuildingSpriteDef), and
airfield-cameo.png. Pad fractions match airfieldPadWorld in shared/src/sim/air.ts.
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image

INK = np.array([0x1A, 0x14, 0x10]) / 255
LIGHT = np.array([-0.42, 0.32, 0.85])
LIGHT = LIGHT / np.linalg.norm(LIGHT)


def rgb(h: str) -> np.ndarray:
    h = h.lstrip("#")
    return np.array([int(h[i : i + 2], 16) for i in (0, 2, 4)], dtype=np.float64) / 255


# ---------------------------------------------------------------- noise


def _hash(ix: np.ndarray, iy: np.ndarray, seed: float) -> np.ndarray:
    v = np.sin(ix * 127.1 + iy * 311.7 + seed * 74.7) * 43758.5453
    return v - np.floor(v)


def vnoise(x: np.ndarray, y: np.ndarray, seed: float = 0.0) -> np.ndarray:
    ix, iy = np.floor(x), np.floor(y)
    fx, fy = x - ix, y - iy
    fx = fx * fx * (3 - 2 * fx)
    fy = fy * fy * (3 - 2 * fy)
    a = _hash(ix, iy, seed)
    b = _hash(ix + 1, iy, seed)
    c = _hash(ix, iy + 1, seed)
    d = _hash(ix + 1, iy + 1, seed)
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy


def fbm(x: np.ndarray, y: np.ndarray, seed: float = 0.0, octaves: int = 4) -> np.ndarray:
    s, amp, tot = 0.0, 1.0, 0.0
    for o in range(octaves):
        s = s + vnoise(x * (2**o), y * (2**o), seed + o * 13.1) * amp
        tot += amp
        amp *= 0.5
    return s / tot


# ---------------------------------------------------------------- mesh


class Mesh:
    def __init__(self) -> None:
        self.v: list[tuple[float, float, float]] = []
        self.t: list[tuple[int, int, int]] = []
        self.mat: list[str] = []
        self.part: list[int] = []
        self._part = 0

    def new_part(self) -> int:
        self._part += 1
        return self._part

    def vert(self, p) -> int:
        self.v.append((float(p[0]), float(p[1]), float(p[2])))
        return len(self.v) - 1

    def tri(self, a, b, c, mat, part) -> None:
        self.t.append((a, b, c))
        self.mat.append(mat)
        self.part.append(part)

    def quad(self, pts, mat, part=None) -> None:
        part = self.new_part() if part is None else part
        i = [self.vert(p) for p in pts]
        self.tri(i[0], i[1], i[2], mat, part)
        self.tri(i[0], i[2], i[3], mat, part)

    def box(self, x0, y0, z0, x1, y1, z1, mat, top=None, sides=None, part=None) -> int:
        part = self.new_part() if part is None else part
        top = top or mat
        s = sides or {}
        self.quad([(x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)], top, part)
        self.quad([(x0, y1, z0), (x1, y1, z0), (x1, y1, z1), (x0, y1, z1)], s.get("+y", mat), part)
        self.quad([(x1, y0, z0), (x1, y1, z0), (x1, y1, z1), (x1, y0, z1)], s.get("+x", mat), part)
        self.quad([(x0, y0, z0), (x0, y0, z1), (x1, y0, z1), (x1, y0, z0)], s.get("-y", mat), part)
        self.quad([(x0, y0, z0), (x0, y1, z0), (x0, y1, z1), (x0, y0, z1)], s.get("-x", mat), part)
        return part

    def cylinder(self, cx, cy, z0, z1, r, mat, top=None, n=14) -> int:
        part = self.new_part()
        ring0 = [self.vert((cx + r * math.cos(2 * math.pi * k / n), cy + r * math.sin(2 * math.pi * k / n), z0)) for k in range(n)]
        ring1 = [self.vert((cx + r * math.cos(2 * math.pi * k / n), cy + r * math.sin(2 * math.pi * k / n), z1)) for k in range(n)]
        c1 = self.vert((cx, cy, z1))
        for k in range(n):
            a, b = k, (k + 1) % n
            self.tri(ring0[a], ring0[b], ring1[b], mat, part)
            self.tri(ring0[a], ring1[b], ring1[a], mat, part)
            self.tri(c1, ring1[a], ring1[b], top or mat, part)
        return part


# ---------------------------------------------------------------- scene

PAD_FRAC = [(0.14 + 0.22 * i, 0.42 if i % 2 == 0 else 0.62) for i in range(4)]


def build(W: float, H: float) -> Mesh:
    m = Mesh()
    slab = m.new_part()
    th = 3.0
    # Concrete slab, full footprint, with a thick edge like the other structures.
    m.quad([(0, 0, 0), (W, 0, 0), (W, H, 0), (0, H, 0)], "slab", slab)
    m.quad([(0, H, -th), (W, H, -th), (W, H, 0), (0, H, 0)], "slab_edge", slab)
    m.quad([(W, 0, -th), (W, H, -th), (W, H, 0), (W, 0, 0)], "slab_edge", slab)
    # Runway: a darker poured strip across the slab.
    run = m.new_part()
    y0, y1 = H * 0.30, H * 0.74
    m.quad([(W * 0.0, y0, 0.25), (W, y0, 0.25), (W, y1, 0.25), (0, y1, 0.25)], "runway", run)
    m.quad([(0, y1, 0.0), (W, y1, 0.0), (W, y1, 0.25), (0, y1, 0.25)], "runway", run)
    m.quad([(W, y0, 0.0), (W, y1, 0.0), (W, y1, 0.25), (W, y0, 0.25)], "runway", run)
    # Hardstands under each pad.
    for fx, fy in PAD_FRAC:
        cx, cy = W * fx, H * fy
        m.box(cx - W * 0.078, cy - H * 0.09, 0.25, cx + W * 0.078, cy + H * 0.09, 0.5, "hardstand")

    # Quonset hangar, axis along y, doors facing the strip (+y).
    hx0, hx1 = W * 0.03, W * 0.33
    hy0, hy1 = H * 0.015, H * 0.27
    hang = m.new_part()
    cx = (hx0 + hx1) / 2
    r = (hx1 - hx0) / 2
    base = 4.0  # short knee wall
    n = 22
    arc = [(cx - r * math.cos(math.pi * k / n), base + r * 0.82 * math.sin(math.pi * k / n)) for k in range(n + 1)]
    for k in range(n):
        (xa, za), (xb, zb) = arc[k], arc[k + 1]
        m.quad([(xa, hy0, za), (xa, hy1, za), (xb, hy1, zb), (xb, hy0, zb)], "roof", hang)
    m.box(hx0, hy0, 0.5, hx1, hy1, base, "wall", part=hang)
    # Front gable: fan of the arc, split around a door opening.
    front = m.new_part()
    ctr = m.vert((cx, hy1, base))
    ring = [m.vert((x, hy1, z)) for x, z in arc]
    for k in range(n):
        m.tri(ctr, ring[k + 1], ring[k], "gable", front)
    m.box(hx0, hy1 - 0.01, 0.5, hx1, hy1 + 0.01, base, "gable", part=front)
    # Sliding doors, the left leaf open on a dark hangar mouth.
    dw = (hx1 - hx0) * 0.34
    m.quad([(cx - dw, hy1 + 0.2, 0.5), (cx + dw, hy1 + 0.2, 0.5), (cx + dw, hy1 + 0.2, 16), (cx - dw, hy1 + 0.2, 16)], "mouth")
    m.box(cx + 0.5, hy1 + 0.2, 0.5, cx + dw, hy1 + 0.9, 16, "door")
    m.box(cx - dw - 7, hy1 + 0.9, 0.5, cx - dw + 2, hy1 + 1.6, 16, "door")
    # Roof vent and lamp.
    m.cylinder(cx + 4, (hy0 + hy1) / 2, base + r * 0.8, base + r * 0.8 + 4, 1.6, "metal_dark")

    # Control hut with lit windows, antenna, sandbags.
    ux0, ux1, uy0, uy1, uh = W * 0.40, W * 0.51, H * 0.04, H * 0.19, 13.0
    m.box(ux0, uy0, 0.5, ux1, uy1, uh, "wall", top="hut_roof")
    for k in range(2):
        wx = ux0 + (ux1 - ux0) * (0.22 + 0.42 * k)
        m.quad([(wx, uy1 + 0.1, 6), (wx + 3.2, uy1 + 0.1, 6), (wx + 3.2, uy1 + 0.1, 9.5), (wx, uy1 + 0.1, 9.5)], "window")
    wy = uy0 + (uy1 - uy0) * 0.35
    m.quad([(ux1 + 0.1, wy, 6), (ux1 + 0.1, wy + 3.5, 6), (ux1 + 0.1, wy + 3.5, 9.5), (ux1 + 0.1, wy, 9.5)], "window")
    m.box(ux0 + 2, uy0 + 2, uh, ux1 - 2, uy1 - 2, uh + 1.2, "metal_dark")
    m.box(ux1 - 3, uy0 + 2, uh, ux1 - 2.4, uy0 + 2.6, uh + 16, "metal_dark")
    m.box(ux1 - 6, uy0 + 1.9, uh + 14, ux1 + 0.6, uy0 + 2.7, uh + 14.6, "metal_dark")
    for k in range(5):
        sx = ux0 - 1 + k * 3.2
        m.box(sx, uy1 + 3, 0.5, sx + 3, uy1 + 5, 2.4, "sandbag")
    # Flag stub with a neutral panel the game can tint.
    m.box(ux0 - 4, uy0 + 1, 0.5, ux0 - 3.4, uy0 + 1.6, 22, "metal_dark")
    m.box(ux0 - 3.4, uy0 + 1.1, 16, ux0 + 4.5, uy0 + 1.5, 21.5, "team")

    # Fuel drums in two ranks and a rack of crates.
    for j in range(4):
        for k in range(2):
            m.cylinder(W * 0.60 + j * 4.3, H * 0.07 + k * 4.4, 0.5, 5.8, 1.9, "drum", top="drum_top")
    for j in range(2):
        m.box(W * 0.74 + j * 6.5, H * 0.05, 0.5, W * 0.74 + j * 6.5 + 5.5, H * 0.05 + 5.5, 5.5, "crate")
    m.box(W * 0.74 + 3, H * 0.05 + 1, 5.5, W * 0.74 + 8.5, H * 0.05 + 6, 10.5, "crate")

    # Bomb trolley with two SC 250s by the south hardstands.
    bx, by = W * 0.47, H * 0.83
    m.box(bx, by, 1.5, bx + 12, by + 5, 2.4, "metal_dark")
    for k in range(4):
        m.cylinder(bx + 1.5 + k * 3.0, by + (0 if k % 2 == 0 else 5), 0.3, 1.8, 1.2, "tire")
    for k in range(2):
        m.cylinder(bx + 6, by + 1.3 + k * 2.5, 0, 0, 0.01, "bomb")  # placeholder keeps part ids stable
        bomb = m.new_part()
        yy = by + 1.3 + k * 2.4
        segs = 12
        pts = []
        for s in range(segs):
            a = 2 * math.pi * s / segs
            pts.append((math.cos(a), math.sin(a)))
        rings = []
        for x, rr in ((bx + 0.5, 0.2), (bx + 2.0, 1.1), (bx + 8.5, 1.15), (bx + 11.5, 0.5)):
            rings.append([m.vert((x, yy + rr * c, 3.6 + rr * s)) for c, s in pts])
        for a in range(len(rings) - 1):
            for s in range(segs):
                i0, i1 = rings[a][s], rings[a][(s + 1) % segs]
                j0, j1 = rings[a + 1][s], rings[a + 1][(s + 1) % segs]
                m.tri(i0, i1, j1, "bomb", bomb)
                m.tri(i0, j1, j0, "bomb", bomb)

    # Windsock mast at the east end.
    m.box(W * 0.92, H * 0.14, 0.5, W * 0.925, H * 0.145, 24, "metal_dark")
    sock = m.new_part()
    for k in range(5):
        x0 = W * 0.925 + k * 2.2
        rr = 1.9 - k * 0.25
        mat = "sock_a" if k % 2 == 0 else "sock_b"
        m.box(x0, H * 0.14 - rr * 0.5, 21 - rr, x0 + 2.2, H * 0.14 + rr * 0.5 + 0.6, 21 + rr * 0.3, mat, part=sock)
    return m


# ---------------------------------------------------------------- shading


def shade(mat: str, P: np.ndarray, N: np.ndarray, W: float, H: float) -> tuple[np.ndarray, np.ndarray]:
    """Base albedo (n,3) and emission (n,3) for pixels of one material."""
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    n = len(x)
    emit = np.zeros((n, 3))
    grime = fbm(x * 0.09, y * 0.09, 3.0)[:, None]
    fine = fbm(x * 0.6 + z * 0.5, y * 0.6 - z * 0.3, 7.0)[:, None]

    if mat in ("slab", "slab_edge"):
        base = rgb("#a4ab9c") * (0.9 + 0.12 * fine) * (0.93 + 0.1 * grime)
        # Per-slab tone and seams every 2 tiles.
        tx, ty = np.floor(x / 16), np.floor(y / 16)
        base = base * (0.96 + 0.07 * _hash(tx, ty, 2.0))[:, None]
        seam = (np.minimum(np.abs(x - np.round(x / 16) * 16), np.abs(y - np.round(y / 16) * 16)) < 0.45) & (z > -0.1)
        base[seam] = base[seam] * 0.72
        stain = fbm(x * 0.12, y * 0.12, 11.0)
        base = base * (1 - 0.08 * np.clip((stain - 0.55) * 4, 0, 1))[:, None]
        if mat == "slab_edge":
            base = base * 0.82
        return base, emit
    if mat == "runway":
        base = rgb("#7b8175") * (0.9 + 0.15 * fine) * (0.9 + 0.14 * grime)
        seam = np.abs(x - np.round(x / 24) * 24) < 0.4
        base[seam] = base[seam] * 0.78
        # Tyre smears along the centerline.
        mid = H * 0.52
        smear = (np.abs(y - mid) < H * 0.12) & (fbm(x * 0.03, y * 0.8, 5.0) > 0.58)
        base[smear] = base[smear] * 0.8
        # Faded centerline dashes and threshold bars.
        dash = (np.abs(y - mid) < 0.7) & ((np.floor(x / 9) % 2) == 0) & (x > W * 0.12) & (x < W * 0.9)
        thr = ((x < W * 0.07) | (x > W * 0.93)) & ((np.floor((y - H * 0.33) / 3.4) % 2) == 0) & (y > H * 0.33) & (y < H * 0.71)
        paint = (dash | thr) & (fbm(x * 0.4, y * 0.4, 9.0) > 0.28)
        base[paint] = rgb("#cfcab5") * 0.95
        return base, emit
    if mat == "hardstand":
        base = rgb("#949b8d") * (0.9 + 0.14 * fine) * (0.93 + 0.1 * grime)
        oil = fbm(x * 0.3, y * 0.3, 21.0)
        base = base * (1 - 0.14 * np.clip((oil - 0.55) * 4, 0, 1))[:, None]
        return base, emit
    if mat in ("roof", "wall", "gable", "door"):
        olive = rgb("#4f5b3b") if mat != "door" else rgb("#46513a")
        base = np.tile(olive, (n, 1)) * (0.88 + 0.18 * fine)
        if mat == "roof":
            # Corrugation runs around the arc; ribs along the axis every few px.
            rib = 0.5 + 0.5 * np.cos(y * 2.4)
            base = base * (0.9 + 0.14 * rib[:, None])
            seam = np.abs(y - np.round(y / 9) * 9) < 0.35
            base[seam] = base[seam] * 0.7
            rivet = seam & ((np.floor((x + z) * 1.1) % 3) == 0)
            base[rivet] = rgb("#8d9270")
        elif mat in ("gable", "door"):
            rib = 0.5 + 0.5 * np.cos(x * 2.2)
            base = base * (0.9 + 0.13 * rib[:, None])
            panel = np.abs(z - np.round(z / 8) * 8) < 0.3
            base[panel] = base[panel] * 0.72
        else:
            panel = (np.abs(x - np.round(x / 8) * 8) < 0.3) | (np.abs(y - np.round(y / 8) * 8) < 0.3)
            base[panel] = base[panel] * 0.72
        # Rust streaks running down from seams, heavier near the ground.
        rust = (fbm(x * 0.25 + y * 0.25, z * 0.12, 4.0) > 0.62) & (z < 14)
        base[rust] = base[rust] * 0.5 + rgb("#8b4a2a") * 0.5
        return base, emit
    if mat == "mouth":
        base = np.tile(rgb("#15130f"), (n, 1)) * (0.9 + 0.2 * fine)
        return base, emit
    if mat == "hut_roof":
        base = np.tile(rgb("#5b6547"), (n, 1)) * (0.88 + 0.16 * fine)
        return base, emit
    if mat == "window":
        base = np.tile(rgb("#3a2a10"), (n, 1))
        emit = np.tile(rgb("#f0a23a"), (n, 1)) * 0.95
        return base, emit
    if mat == "drum":
        base = np.tile(rgb("#8f3324"), (n, 1)) * (0.85 + 0.2 * fine)
        hoop = (np.abs(z - 1.9) < 0.35) | (np.abs(z - 4.0) < 0.35)
        base[hoop] = base[hoop] * 0.62
        return base, emit
    if mat == "drum_top":
        return np.tile(rgb("#7a2b1f"), (n, 1)) * (0.9 + 0.15 * fine), emit
    if mat == "crate":
        base = np.tile(rgb("#a8743e"), (n, 1)) * (0.86 + 0.2 * fine)
        slat = (np.abs(z - np.round(z / 1.8) * 1.8) < 0.18) | (np.abs(x - np.round(x / 5.5) * 5.5) < 0.35)
        base[slat] = base[slat] * 0.68
        return base, emit
    if mat == "sandbag":
        base = np.tile(rgb("#a6906a"), (n, 1)) * (0.85 + 0.2 * fine)
        return base, emit
    if mat == "team":
        return np.tile(rgb("#8a8a84"), (n, 1)) * (0.92 + 0.1 * fine), emit
    if mat == "bomb":
        return np.tile(rgb("#4b4f3e"), (n, 1)) * (0.9 + 0.12 * fine), emit
    if mat == "tire":
        return np.tile(rgb("#1f1d1a"), (n, 1)), emit
    if mat == "sock_a":
        return np.tile(rgb("#c4561a"), (n, 1)), emit
    if mat == "sock_b":
        return np.tile(rgb("#ddd6c2"), (n, 1)), emit
    return np.tile(rgb("#34362f"), (n, 1)) * (0.9 + 0.15 * fine), emit  # metal_dark


# ---------------------------------------------------------------- raster


def raster(V2: np.ndarray, D: np.ndarray, tris: np.ndarray, w: int, h: int):
    """V2 (nv,2) screen xy, D (nv,) depth (bigger = nearer). Returns tri id, barycentrics."""
    zb = np.full((h, w), -np.inf)
    tid = np.full((h, w), -1, dtype=np.int32)
    b0 = np.zeros((h, w))
    b1 = np.zeros((h, w))
    for i, (a, b, c) in enumerate(tris):
        x0, y0 = V2[a]
        x1, y1 = V2[b]
        x2, y2 = V2[c]
        area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0)
        if abs(area) < 1e-9:
            continue
        mnx = max(0, int(math.floor(min(x0, x1, x2))))
        mxx = min(w - 1, int(math.ceil(max(x0, x1, x2))))
        mny = max(0, int(math.floor(min(y0, y1, y2))))
        mxy = min(h - 1, int(math.ceil(max(y0, y1, y2))))
        if mnx > mxx or mny > mxy:
            continue
        xs, ys = np.meshgrid(np.arange(mnx, mxx + 1) + 0.5, np.arange(mny, mxy + 1) + 0.5)
        w0 = ((x1 - xs) * (y2 - ys) - (x2 - xs) * (y1 - ys)) / area
        w1 = ((x2 - xs) * (y0 - ys) - (x0 - xs) * (y2 - ys)) / area
        w2 = 1 - w0 - w1
        ins = (w0 >= -1e-6) & (w1 >= -1e-6) & (w2 >= -1e-6)
        if not ins.any():
            continue
        d = w0 * D[a] + w1 * D[b] + w2 * D[c]
        z = zb[mny : mxy + 1, mnx : mxx + 1]
        vis = ins & (d > z)
        if not vis.any():
            continue
        z[vis] = d[vis]
        tid[mny : mxy + 1, mnx : mxx + 1][vis] = i
        b0[mny : mxy + 1, mnx : mxx + 1][vis] = w0[vis]
        b1[mny : mxy + 1, mnx : mxx + 1][vis] = w1[vis]
    return tid, b0, b1, zb


def render(out: Path, tile_w: int, tile_h: int, tile_px: int = 8, ss: int = 3) -> None:
    W, H = tile_w * tile_px, tile_h * tile_px
    mesh = build(W, H)
    V = np.array(mesh.v)
    T = np.array(mesh.t)
    mats = np.array(mesh.mat)
    parts = np.array(mesh.part)
    zoom = 3.0  # source px per screen px
    hw = 16 / 2 / tile_px * zoom * ss
    hh = 8 / 2 / tile_px * zoom * ss
    lift = hh * 1.0  # HEIGHT_WORLD 4 world px -> ISO_ELEVATION 4 screen px
    pad_w = (tile_w + tile_h) * 8 * zoom
    top_room = 46 * zoom
    wpx = int(pad_w * ss + 16 * ss)
    hpx = int(((tile_w + tile_h) * 4 * zoom + top_room + 10 * zoom) * ss)
    ox = tile_h * 8 * zoom * ss + 8 * ss
    oy = top_room * ss
    SX = ox + (V[:, 0] - V[:, 1]) * hw
    SY = oy + (V[:, 0] + V[:, 1]) * hh - V[:, 2] * lift
    Dp = (V[:, 0] + V[:, 1]) + V[:, 2] * 0.02
    tid, b0, b1, _ = raster(np.stack([SX, SY], 1), Dp, T, wpx, hpx)

    # Face normals, flipped toward the camera.
    e1 = V[T[:, 1]] - V[T[:, 0]]
    e2 = V[T[:, 2]] - V[T[:, 0]]
    FN = np.cross(e1, e2)
    FN /= np.maximum(np.linalg.norm(FN, axis=1, keepdims=True), 1e-9)
    view = np.array([1.0, 1.0, 1.4])
    view /= np.linalg.norm(view)
    flip = (FN @ view) < 0
    FN[flip] *= -1

    # Shadow map along LIGHT.
    up = np.array([0.0, 0.0, 1.0])
    lu = np.cross(up, LIGHT)
    lu /= np.linalg.norm(lu)
    lv = np.cross(LIGHT, lu)
    sres = 4.0
    LU, LV = V @ lu, V @ lv
    umin, vmin = LU.min() - 2, LV.min() - 2
    lw = int((LU.max() - umin + 4) * sres)
    lh = int((LV.max() - vmin + 4) * sres)
    L2 = np.stack([(LU - umin) * sres, (LV - vmin) * sres], 1)
    ltid, _, _, lz = raster(L2, V @ LIGHT, T, lw, lh)

    mask = tid >= 0
    ids = tid[mask]
    w0, w1 = b0[mask], b1[mask]
    P = V[T[ids, 0]] * w0[:, None] + V[T[ids, 1]] * w1[:, None] + V[T[ids, 2]] * (1 - w0 - w1)[:, None]
    N = FN[ids]
    # Shadow test with a small bias.
    pu = ((P @ lu) - umin) * sres
    pv = ((P @ lv) - vmin) * sres
    iu = np.clip(pu.astype(int), 0, lw - 1)
    iv = np.clip(pv.astype(int), 0, lh - 1)
    lit_depth = lz[iv, iu]
    shadow = (P @ LIGHT) < lit_depth - 0.6
    # Soften: sample a small cross and average.
    acc = shadow.astype(float)
    for du, dv in ((2, 0), (-2, 0), (0, 2), (0, -2)):
        ju = np.clip(iu + du, 0, lw - 1)
        jv = np.clip(iv + dv, 0, lh - 1)
        acc += ((P @ LIGHT) < lz[jv, ju] - 0.6).astype(float)
    shade_amt = acc / 5.0

    col = np.zeros((len(ids), 3))
    for mname in np.unique(mats[ids]):
        sel = mats[ids] == mname
        base, emit = shade(str(mname), P[sel], N[sel], W, H)
        lam = np.clip(N[sel] @ LIGHT, 0, 1)
        light = 0.46 + 0.62 * lam * (1 - 0.62 * shade_amt[sel])
        # Warm key, cool fill, like the reference structures.
        c = base * light[:, None] * np.array([1.03, 1.0, 0.95]) + emit
        col[sel] = c

    img = np.zeros((hpx, wpx, 3))
    alpha = np.zeros((hpx, wpx))
    img[mask] = col
    alpha[mask] = 1

    # Ink: silhouette plus lines where the part or the face normal changes.
    part_px = np.full((hpx, wpx), -1)
    part_px[mask] = parts[ids]
    nrm = np.zeros((hpx, wpx, 3))
    nrm[mask] = N
    edge = np.zeros((hpx, wpx), bool)
    for dy, dx in ((0, 1), (1, 0)):
        a_part = part_px
        b_part = np.roll(np.roll(part_px, -dy, 0), -dx, 1)
        a_n, b_n = nrm, np.roll(np.roll(nrm, -dy, 0), -dx, 1)
        diff = (a_part != b_part) & ((a_part >= 0) | (b_part >= 0))
        crease = (a_part == b_part) & (a_part >= 0) & ((a_n * b_n).sum(-1) < 0.75)
        edge |= diff | crease
    # Flat decals on the slab (runway, hardstands) get a thinner, lighter line.
    grown = edge.copy()
    for k in range(1, ss):
        grown |= np.roll(edge, k, 0) | np.roll(edge, k, 1)
    ink_alpha = np.where(grown, 0.92, 0)
    sil = grown & ~mask
    img[grown] = img[grown] * (1 - ink_alpha[grown][:, None]) + INK * ink_alpha[grown][:, None]
    alpha[sil] = 1

    # Downsample.
    k = ss
    hh2, ww2 = hpx // k, wpx // k
    a = alpha[: hh2 * k, : ww2 * k].reshape(hh2, k, ww2, k).mean(axis=(1, 3))
    pre = (img * alpha[..., None])[: hh2 * k, : ww2 * k].reshape(hh2, k, ww2, k, 3).mean(axis=(1, 3))
    c = np.where(a[..., None] > 1e-6, pre / np.maximum(a[..., None], 1e-6), 0)
    out_img = Image.fromarray((np.dstack([np.clip(c, 0, 1), a]) * 255 + 0.5).astype(np.uint8), "RGBA")
    bb = out_img.getbbox()
    top = max(0, (bb[1] if bb else 0) - 6)
    out_img = out_img.crop((0, top, out_img.width, out_img.height))
    out.parent.mkdir(parents=True, exist_ok=True)
    out_img.save(out)
    south = (ox / ss + (W - H) * hw / ss, oy / ss + (W + H) * hh / ss - top)
    rx, ry = W * 0.18, H * 0.14
    rz = 4 + (W * 0.15) * 0.82
    stack = (ox / ss + (rx - ry) * hw / ss, oy / ss + (rx + ry) * hh / ss - rz * lift / ss - top - 14)
    meta = {
        "padWidth": round(pad_w, 1),
        "padSouthX": round(south[0], 1),
        "padSouthY": round(south[1], 1),
        "stackX": round(stack[0], 1),
        "stackY": round(max(4.0, stack[1]), 1),
        "size": out_img.size,
    }
    out.with_suffix(".json").write_text(json.dumps(meta, indent=2) + "\n")
    print("wrote", out, meta)
    cam = Image.new("RGBA", (96, 96), (0, 0, 0, 0))
    crop = out_img.crop(out_img.getbbox())
    f = min(90 / crop.width, 90 / crop.height)
    crop = crop.resize((max(1, round(crop.width * f)), max(1, round(crop.height * f))), Image.Resampling.LANCZOS)
    cam.alpha_composite(crop, ((96 - crop.width) // 2, (96 - crop.height) // 2))
    cam.save(out.with_name(out.stem + "-cameo.png"))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--tiles", default="20x16", help="footprint in gameplay tiles, WxH")
    args = ap.parse_args()
    tw, th = (int(v) for v in args.tiles.split("x"))
    render(Path(args.out), tw, th)


if __name__ == "__main__":
    main()
