#!/usr/bin/env python3
"""Airfield building art: a ground decal and a props layer on one canvas.

The strip, hardstands, taxiways, revetments, and grass are the *ground*
image. The client paints it under everything that stands, so a plane parked,
taxiing, or rolling on the field always draws on top of it. Hangar, tower,
dump, tents, flak pit, and windsock are the *props* image, drawn in the
standing layer against the back band of the footprint.

Both images share size and anchor, so one set of BuildingSpriteDef metrics
places either. Layout fractions match the Airfield constants in
gridlock/packages/shared/src/catalog.ts (AIRFIELD_*).

Look: the inked, weathered style of the other structures. Per-pixel
procedural textures (grass, concrete slabs, corrugated steel, sandbags,
canvas, planks), a flat key light from the upper left, cast shadows on the
ground, dark ink on every part edge and crease, and a dark silhouette.

  python tools/sprites/render_airfield.py \\
      --out gridlock/packages/client/src/assets/buildings
"""

from __future__ import annotations

import argparse
import json
import math
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

# Footprint, world px (8 per gameplay tile): t(10) x t(5) gameplay tiles.
W, H = 320.0, 160.0
# Must match catalog.ts.
BACK_DEPTH = 0.27
RUNWAY_Y = 0.44
RUNWAY_HALF = 0.1
THRESHOLD = 0.06
PAD_Y = 0.78
PAD_X = (0.16, 0.39, 0.61, 0.84)

ZOOM = 2.0  # source px per screen px at zoom 1 (matches the other building sheets)
SS = 3  # supersampling
TOP_MARGIN = 36.0  # world px of headroom above the north corner
TOWER_BASE = 26.0  # control tower: top of the brick storeys
TOWER_CAB = 40.0  # top of the glass cab
SIDE_MARGIN = 6.0

LIGHT = np.array([-0.55, 0.45, 0.85])
LIGHT = LIGHT / np.linalg.norm(LIGHT)
VIEW = np.array([1.0, 1.0, 1.0]) / math.sqrt(3.0)
OUTLINE = np.array([0x1A, 0x14, 0x10]) / 255.0


def rgb(h: str) -> np.ndarray:
    h = h.lstrip("#")
    return np.array([int(h[i : i + 2], 16) for i in (0, 2, 4)], dtype=np.float64) / 255.0


# ---------------------------------------------------------------- noise


def _hash(xi: np.ndarray, yi: np.ndarray, seed: int) -> np.ndarray:
    h = (xi.astype(np.int64) * 374761393 + yi.astype(np.int64) * 668265263 + seed * 982451653) & 0xFFFFFFFF
    h = ((h ^ (h >> 13)) * 1274126177) & 0xFFFFFFFF
    h = h ^ (h >> 16)
    return (h & 0xFFFFFF).astype(np.float64) / float(0xFFFFFF)


def vnoise(x: np.ndarray, y: np.ndarray, seed: int = 0) -> np.ndarray:
    xi = np.floor(x)
    yi = np.floor(y)
    fx = x - xi
    fy = y - yi
    ux = fx * fx * (3 - 2 * fx)
    uy = fy * fy * (3 - 2 * fy)
    a = _hash(xi, yi, seed)
    b = _hash(xi + 1, yi, seed)
    c = _hash(xi, yi + 1, seed)
    d = _hash(xi + 1, yi + 1, seed)
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy


def fbm(x: np.ndarray, y: np.ndarray, seed: int = 0, octaves: int = 4) -> np.ndarray:
    out = np.zeros_like(x)
    amp = 0.5
    f = 1.0
    norm = 0.0
    for o in range(octaves):
        out += amp * vnoise(x * f, y * f, seed + o * 17)
        norm += amp
        amp *= 0.5
        f *= 2.03
    return out / norm


def cell_rand(i: np.ndarray, j: np.ndarray, seed: int) -> np.ndarray:
    return _hash(i, j, seed)


def smooth(e0: float, e1: float, x: np.ndarray) -> np.ndarray:
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def mix(a: np.ndarray, b: np.ndarray, t: np.ndarray) -> np.ndarray:
    return a * (1 - t[..., None]) + b * t[..., None]


def rect_sdf(x, y, x0, y0, x1, y1):
    """Signed distance to an axis rectangle (negative inside)."""
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    hx, hy = (x1 - x0) / 2, (y1 - y0) / 2
    dx = np.abs(x - cx) - hx
    dy = np.abs(y - cy) - hy
    out = np.hypot(np.maximum(dx, 0), np.maximum(dy, 0))
    return out + np.minimum(np.maximum(dx, dy), 0)


# ---------------------------------------------------------------- layout


def runway():
    return dict(
        x0=W * 0.02,
        x1=W * 0.98,
        y0=H * (RUNWAY_Y - RUNWAY_HALF),
        y1=H * (RUNWAY_Y + RUNWAY_HALF),
        cy=H * RUNWAY_Y,
        thr0=W * THRESHOLD,
        thr1=W * (1 - THRESHOLD),
    )


def pads():
    return [(W * f, H * PAD_Y) for f in PAD_X]


HARD_R = 24.0  # hardstand radius
TAXI_HALF = 8.0


# ---------------------------------------------------------------- ground


def ground_color(X: np.ndarray, Y: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """World ground point -> (rgb, alpha)."""
    rw = runway()
    n_big = fbm(X / 26, Y / 26, 3)
    n_mid = fbm(X / 7, Y / 7, 5)
    n_fine = vnoise(X / 0.9, Y / 0.9, 11)

    # Grass: mottled, with dry patches and blade speckle.
    g_dark = rgb("#43592d")
    g_mid = rgb("#56703a")
    g_dry = rgb("#71793f")
    col = mix(g_dark, g_mid, smooth(0.3, 0.62, n_big))
    col = mix(col, g_dry, smooth(0.6, 0.82, fbm(X / 40 + 9, Y / 40, 21)) * 0.7)
    col = col * (0.9 + 0.2 * n_mid[..., None]) * (0.93 + 0.14 * n_fine[..., None])
    blades = vnoise(X / 0.55, Y / 1.6, 31) > 0.8
    col[blades] *= 0.78

    # Worn dirt: the hangar and dump tracks, around the tower, and ruts beside each taxiway.
    wear = np.full(X.shape, 1e9)
    wear = np.minimum(wear, rect_sdf(X, Y, 150, 30, 168, rw["y0"]))
    wear = np.minimum(wear, rect_sdf(X, Y, 184, 34, 238, rw["y0"]))
    wear = np.minimum(wear, rect_sdf(X, Y, 244, 30, 300, 40))
    wear = np.minimum(wear, rect_sdf(X, Y, 112, 30, 134, 44))
    for px, py in pads():
        wear = np.minimum(wear, rect_sdf(X, Y, px - TAXI_HALF - 3, rw["y1"], px + TAXI_HALF + 3, py - HARD_R + 4))
        wear = np.minimum(wear, np.hypot(X - px, Y - py) - HARD_R - 3)
    dirt_t = smooth(2.5, -1.0, wear + (n_mid - 0.5) * 7)
    dirt = mix(rgb("#6e5a3e"), rgb("#8a7250"), n_mid) * (0.92 + 0.16 * n_fine[..., None])
    col = mix(col, dirt, dirt_t * 0.9)

    # Concrete: strip, hangar apron, taxiways, hardstands.
    def concrete(base: str, slab_w: float, slab_h: float, ox: float, oy: float, seed: int):
        c = np.broadcast_to(rgb(base), X.shape + (3,)).copy()
        i = np.floor((X - ox) / slab_w)
        j = np.floor((Y - oy) / slab_h)
        tone = cell_rand(i, j, seed)
        c *= (0.93 + 0.1 * tone)[..., None]
        c *= (0.9 + 0.12 * n_mid)[..., None]
        c *= (0.95 + 0.07 * n_fine)[..., None]
        stain = smooth(0.6, 0.85, fbm(X / 9 + seed, Y / 9, seed + 1))
        c *= (1 - 0.18 * stain)[..., None]
        fx = (X - ox) - i * slab_w
        fy = (Y - oy) - j * slab_h
        seam = (np.minimum(fx, slab_w - fx) < 0.38) | (np.minimum(fy, slab_h - fy) < 0.38)
        c[seam] *= 0.8
        return c

    shoulder = rect_sdf(X, Y, rw["x0"], rw["y0"], rw["x1"], rw["y1"])
    gravel = mix(rgb("#7e725c"), rgb("#9a8e74"), n_fine) * (0.9 + 0.2 * n_mid[..., None])
    col = mix(col, gravel, smooth(3.2, 1.8, shoulder + (n_mid - 0.5) * 1.5))

    strip_in = shoulder <= 0
    strip = concrete("#8e8c80", 20.0, rw["y1"] - rw["y0"], rw["x0"], rw["y0"], 41)
    # Split the strip lengthwise into two lanes of slabs.
    lane_seam = np.abs(Y - rw["cy"]) < 0.4
    strip[lane_seam] *= 0.75
    col[strip_in] = strip[strip_in]

    apron_sdf = rect_sdf(X, Y, 8, 39, 96, rw["y0"] + 1)
    ap_in = apron_sdf <= 0
    apron = concrete("#85837a", 13.0, 8.0, 8, 39, 43)
    col[ap_in] = apron[ap_in]

    for k, (px, py) in enumerate(pads()):
        taxi = rect_sdf(X, Y, px - TAXI_HALF, rw["y1"] - 1, px + TAXI_HALF, py - HARD_R + 2) <= 0
        c = concrete("#807e74", 16.0, 10.0, px - TAXI_HALF, rw["y1"], 50 + k)
        col[taxi] = c[taxi]
        r = np.hypot(X - px, Y - py)
        hs = r <= HARD_R
        c = concrete("#86847a", 12.0, 12.0, px - HARD_R, py - HARD_R, 60 + k)
        # Oil and exhaust under the engine, scorch fanned behind the tail.
        oil = smooth(9, 2, np.hypot(X - px, (Y - (py + 12)) * 1.3)) * (0.6 + 0.4 * n_mid)
        c *= (1 - 0.45 * oil)[..., None]
        scorch = smooth(15, 3, np.hypot((X - px) * 1.4, Y - (py - 14))) * n_big
        c *= (1 - 0.25 * scorch)[..., None]
        ring = np.abs(r - HARD_R) < 0.6
        col[hs] = c[hs]
        col[ring & hs] *= 0.72

    # Tyre rubber in both touchdown zones.
    for x_start, dirn in ((rw["thr0"], 1), (rw["thr1"], -1)):
        u = (X - x_start) * dirn
        zone = (u > 0) & (u < 110) & (np.abs(Y - rw["cy"]) < 11)
        streak = smooth(0.55, 0.9, vnoise(X / 22, Y / 1.1, 70 + dirn)) * smooth(110, 10, u)
        streak *= smooth(11, 4, np.abs(Y - rw["cy"]))
        col[zone] *= (1 - 0.35 * streak[zone])[..., None]

    # Paint: threshold bars, touchdown blocks, centreline dashes, edge lines. Worn.
    paint = np.zeros(X.shape, dtype=bool)
    for xa, xb in ((rw["x0"] + 2.5, rw["thr0"] - 1), (rw["thr1"] + 1, rw["x1"] - 2.5)):
        inx = (X >= xa) & (X <= xb)
        span = rw["y1"] - rw["y0"] - 5
        rel = (Y - rw["y0"] - 2.5) / span * 8
        bar = (rel >= 0) & (rel <= 8) & ((rel % 1.0) < 0.62)
        paint |= inx & bar
    for xc in (rw["thr0"] + 26, rw["thr1"] - 26):
        for dy in (-7.5, 7.5):
            paint |= rect_sdf(X, Y, xc - 8, rw["cy"] + dy - 1.6, xc + 8, rw["cy"] + dy + 1.6) <= 0
    cl = (X > rw["thr0"] + 6) & (X < rw["thr1"] - 6) & (np.abs(Y - rw["cy"]) < 0.8)
    cl &= ((X - rw["thr0"]) % 16.0) < 9.0
    paint |= cl
    edge = (X > rw["x0"] + 1.5) & (X < rw["x1"] - 1.5)
    edge &= (np.abs(Y - rw["y0"] - 1.4) < 0.4) | (np.abs(Y - rw["y1"] + 1.4) < 0.4)
    paint |= edge
    wornp = vnoise(X / 1.3, Y / 1.3, 81) * 0.6 + n_mid * 0.4
    paint &= wornp > 0.28
    white = rgb("#d9d5c3") * (0.92 + 0.1 * n_fine[..., None])
    col[paint] = white[paint]

    # Soft edge into the map's own ground.
    d_edge = -rect_sdf(X, Y, 0, 0, W, H)
    alpha = np.clip((d_edge + (n_mid - 0.5) * 6 + 1.0) / 3.0, 0, 1)
    return np.clip(col, 0, 1), alpha


# ---------------------------------------------------------------- mesh


@dataclass
class Mesh:
    verts: list[np.ndarray] = field(default_factory=list)
    tris: list[tuple[int, int, int, str, int]] = field(default_factory=list)
    part: int = 1

    def new_part(self) -> int:
        self.part += 1
        return self.part

    def v(self, p) -> int:
        self.verts.append(np.asarray(p, dtype=np.float64))
        return len(self.verts) - 1

    def tri(self, a, b, c, mat) -> None:
        self.tris.append((a, b, c, mat, self.part))

    def quad(self, a, b, c, d, mat) -> None:
        self.tri(a, b, c, mat)
        self.tri(a, c, d, mat)

    def poly(self, pts, mat) -> None:
        ids = [self.v(p) for p in pts]
        for i in range(1, len(ids) - 1):
            self.tri(ids[0], ids[i], ids[i + 1], mat)

    def box(self, lo, hi, mat, top=None, part=True) -> None:
        if part:
            self.new_part()
        x0, y0, z0 = lo
        x1, y1, z1 = hi
        p = [self.v((x, y, z)) for z in (z0, z1) for y in (y0, y1) for x in (x0, x1)]
        self.quad(p[0], p[1], p[3], p[2], mat)  # bottom
        self.quad(p[4], p[5], p[7], p[6], top or mat)
        self.quad(p[0], p[1], p[5], p[4], mat)  # north
        self.quad(p[2], p[3], p[7], p[6], mat)  # south
        self.quad(p[0], p[2], p[6], p[4], mat)  # west
        self.quad(p[1], p[3], p[7], p[5], mat)  # east

    def cyl(self, c0, c1, r0, r1, mat, n=14, caps=True, cap_mat=None, part=True) -> None:
        """Cylinder or cone between two centres."""
        if part:
            self.new_part()
        c0 = np.asarray(c0, float)
        c1 = np.asarray(c1, float)
        ax = c1 - c0
        ax /= np.linalg.norm(ax)
        ref = np.array([0, 0, 1.0]) if abs(ax[2]) < 0.9 else np.array([1.0, 0, 0])
        u = np.cross(ax, ref)
        u /= np.linalg.norm(u)
        w = np.cross(ax, u)
        ring0 = [self.v(c0 + r0 * (math.cos(t) * u + math.sin(t) * w)) for t in np.linspace(0, 2 * math.pi, n, endpoint=False)]
        ring1 = [self.v(c1 + r1 * (math.cos(t) * u + math.sin(t) * w)) for t in np.linspace(0, 2 * math.pi, n, endpoint=False)]
        for i in range(n):
            j = (i + 1) % n
            self.quad(ring0[i], ring0[j], ring1[j], ring1[i], mat)
        if caps:
            m0 = self.v(c0)
            m1 = self.v(c1)
            for i in range(n):
                j = (i + 1) % n
                self.tri(m0, ring0[j], ring0[i], cap_mat or mat)
                self.tri(m1, ring1[i], ring1[j], cap_mat or mat)


# ---------------------------------------------------------------- materials


def tex(mat: str, P: np.ndarray, n: np.ndarray) -> np.ndarray:
    """Base colour for world points P[N,3] on a face with normal n."""
    X, Y, Z = P[:, 0], P[:, 1], P[:, 2]
    nf = vnoise(X / 1.1 + Z * 0.7, Y / 1.1 - Z * 0.5, 7)
    nm = fbm(X / 6 + Z * 0.2, Y / 6 + Z * 0.3, 9, 3)
    side_u = X if abs(n[1]) >= abs(n[0]) else Y  # along a vertical face

    def base(h):
        return np.broadcast_to(rgb(h), (len(X), 3)).copy()

    if mat == "sandbag":
        row_h = 1.55
        row = np.floor(Z / row_h) if abs(n[2]) < 0.7 else np.floor((X + Y) / 3.1)
        along = side_u if abs(n[2]) < 0.7 else (X - Y)
        bag_l = 4.2
        off = (row % 2) * bag_l / 2
        bi = np.floor((along + off) / bag_l)
        fu = ((along + off) / bag_l) - bi
        fv = (Z / row_h - row) if abs(n[2]) < 0.7 else (((X + Y) / 3.1) - row)
        puff = np.sin(np.pi * np.clip(fu, 0, 1)) ** 0.6 * np.sin(np.pi * np.clip(fv, 0, 1)) ** 0.5
        tone = cell_rand(bi, row, 5)
        c = mix(base("#8b7b55"), base("#a8966a"), tone * 0.7 + nf * 0.3)
        c *= (0.62 + 0.45 * puff)[:, None]
        return c
    if mat == "corrugated":
        rib = 0.5 + 0.5 * np.sin(Y * 2 * np.pi / 1.3)
        seam = (np.mod(Y, 7.0) < 0.35).astype(float)
        c = mix(base("#58644a"), base("#6c7858"), rib * 0.8)
        rust = smooth(0.62, 0.85, fbm(X / 5, Z / 1.5 + Y / 9, 13))
        c = mix(c, base("#7a5134"), rust * 0.55)
        c *= (1 - 0.35 * seam)[:, None] * (0.93 + 0.12 * nf[:, None])
        return c
    if mat == "endwall":
        plank = np.floor(X / 2.2)
        c = mix(base("#5c5642"), base("#6e674e"), cell_rand(plank, plank * 0 + 1, 3))
        c[np.mod(X, 2.2) < 0.3] *= 0.7
        return c * (0.92 + 0.14 * nf[:, None])
    if mat == "doorpanel":
        c = base("#4f5a43") * (0.9 + 0.15 * nm[:, None])
        c[np.mod(side_u, 3.0) < 0.4] *= 0.65
        c = mix(c, base("#6d4a30"), smooth(0.65, 0.9, fbm(side_u / 3, Z / 2, 15)) * 0.5)
        return c
    if mat == "interior":
        return base("#1a1813") * (0.8 + 0.4 * nm[:, None])
    if mat == "stucco":
        c = base("#b1a585") * (0.9 + 0.12 * nm[:, None]) * (0.95 + 0.08 * nf[:, None])
        grime = smooth(4, 0, Z) * 0.25
        c *= (1 - grime)[:, None]
        streak = smooth(0.7, 0.9, vnoise(side_u / 1.2, Z / 8, 19)) * 0.15
        return c * (1 - streak)[:, None]
    if mat == "cab":
        # Glass band with white frames.
        pane = np.mod(side_u, 4.0)
        frame = (pane < 0.6) | (np.abs(Z - TOWER_BASE - 1.2) < 0.6) | (np.abs(Z - TOWER_CAB + 0.7) < 0.6)
        c = mix(base("#2b3a42"), base("#56707a"), smooth(TOWER_BASE + 2, TOWER_CAB, Z) * 0.6 + nf * 0.2)
        c[frame] = rgb("#cfc8b0")
        return c
    if mat == "window":
        c = base("#27333a") * (0.85 + 0.3 * nf[:, None])
        return c
    if mat == "roof":
        return base("#3d3f36") * (0.9 + 0.16 * nm[:, None])
    if mat == "canvas":
        c = mix(base("#6a6843"), base("#7c7a52"), nm)
        c[np.mod(side_u if abs(n[2]) < 0.4 else Y, 6.0) < 0.3] *= 0.75
        return c * (0.93 + 0.12 * nf[:, None])
    if mat == "flap":
        return base("#2a2819") * (0.9 + 0.2 * nf[:, None])
    if mat == "drum_r":
        c = base("#6e3a26") * (0.85 + 0.25 * nm[:, None])
        c[(np.mod(Z, 2.4) < 0.35)] *= 0.7
        return c
    if mat == "drum_g":
        c = base("#4c5438") * (0.85 + 0.25 * nm[:, None])
        c[(np.mod(Z, 2.4) < 0.35)] *= 0.7
        return c
    if mat == "drum_side":
        c = base("#565b3c") * (0.85 + 0.25 * nm[:, None])
        c[np.mod(X, 2.2) < 0.35] *= 0.7
        return c
    if mat == "crate":
        c = mix(base("#7a5c3a"), base("#94704a"), nf * 0.6 + nm * 0.4)
        plank = np.mod(Z if abs(n[2]) < 0.7 else X, 1.6) < 0.25
        c[plank] *= 0.72
        return c
    if mat == "bomb":
        c = base("#4a4f40") * (0.9 + 0.2 * nm[:, None])
        return c
    if mat == "metal":
        return base("#3b3c38") * (0.9 + 0.2 * nf[:, None])
    if mat == "steel":
        return base("#56584f") * (0.9 + 0.2 * nf[:, None])
    if mat == "wood":
        c = base("#6d5337") * (0.88 + 0.22 * nf[:, None])
        return c
    if mat == "team":
        return base("#8a8a82") * (0.95 + 0.1 * nf[:, None])
    if mat == "sock":
        band = np.floor((X - 302) / 2.4) % 2 == 0
        c = base("#d8d0bc")
        c[band] = rgb("#c65a1c")
        return c * (0.92 + 0.12 * nf[:, None])
    if mat == "lamp":
        return base("#d8c890")
    if mat == "concrete":
        return base("#8a887c") * (0.9 + 0.15 * nm[:, None])
    raise KeyError(mat)


# ---------------------------------------------------------------- scene


def sandbag_wall(m: Mesh, x0, y0, x1, y1, h) -> None:
    """A sandbag wall with a slight batter: two stacked boxes, the top one narrower."""
    m.new_part()
    m.box((x0, y0, 0), (x1, y1, h * 0.55), "sandbag", part=False)
    ix = 0.35 if (x1 - x0) < (y1 - y0) else 0.0
    iy = 0.35 if (y1 - y0) <= (x1 - x0) else 0.0
    m.box((x0 + ix, y0 + iy, h * 0.55), (x1 - ix, y1 - iy, h), "sandbag", part=False)


def build_ground_props() -> Mesh:
    """Low things that live in the ground layer: revetments and strip lights."""
    m = Mesh()
    for px, py in pads():
        # U-shaped revetment open to the strip. Side walls taper toward the taxiway.
        for sx in (-1, 1):
            xa, xb = sorted((px + sx * 27.0, px + sx * 32.0))
            sandbag_wall(m, xa, py - 8, xb, py + 26, 6.0)
            sandbag_wall(m, xa, py - 17, xb, py - 8, 3.4)
        sandbag_wall(m, px - 32, py + 26, px + 32, py + 31, 4.2)
    rw = runway()
    x = rw["x0"] + 6
    while x < rw["x1"] - 4:
        for y in (rw["y0"] - 2.2, rw["y1"] + 2.2):
            m.box((x - 0.5, y - 0.5, 0), (x + 0.5, y + 0.5, 1.6), "metal")
            m.box((x - 0.7, y - 0.7, 1.6), (x + 0.7, y + 0.7, 2.4), "lamp")
        x += 24
    return m


def nissen_hangar(m: Mesh, cx: float, half: float, y0: float, y1: float, top: float) -> None:
    m.new_part()
    n = 22
    prof = []
    for i in range(n + 1):
        t = math.pi * i / n
        prof.append((cx - half * math.cos(t), top * math.sin(t) ** 0.85))
    back = [m.v((x, y0, z)) for x, z in prof]
    front = [m.v((x, y1, z)) for x, z in prof]
    for i in range(n):
        m.quad(back[i], back[i + 1], front[i + 1], front[i], "corrugated")
    # Rear wall, then the door wall with a dark opening and two sliding leaves.
    m.new_part()
    m.poly([(x, y0, z) for x, z in prof], "endwall")
    m.new_part()
    m.poly([(x, y1, z) for x, z in prof], "endwall")
    dw = half * 0.66
    dh = top * 0.72
    m.new_part()
    m.poly([(cx - dw, y1 + 0.15, 0), (cx + dw, y1 + 0.15, 0), (cx + dw, y1 + 0.15, dh), (cx - dw, y1 + 0.15, dh)], "interior")
    for s in (-1, 1):
        a = cx + s * dw * 0.55
        b = cx + s * (dw + half * 0.22)
        m.box((min(a, b), y1 + 0.3, 0), (max(a, b), y1 + 1.2, dh + 1.2), "doorpanel")
    # Door head beam, a lamp, and an air vent on the ridge.
    m.box((cx - dw - 1, y1 + 0.2, dh), (cx + dw + 1, y1 + 1.6, dh + 1.6), "steel")
    m.box((cx - 1, y1 + 1.6, dh + 2.2), (cx + 1, y1 + 3, dh + 3.2), "lamp")
    m.cyl((cx, (y0 + y1) / 2, top - 0.5), (cx, (y0 + y1) / 2, top + 3.5), 1.6, 1.6, "metal", n=10)
    m.cyl((cx, (y0 + y1) / 2, top + 3.5), (cx, (y0 + y1) / 2, top + 4.6), 2.6, 0.4, "metal", n=10)


def control_tower(m: Mesh, x0: float, y0: float) -> dict:
    # Two storeys of rendered brick with windows, a glass cab, flat roof, rail, mast.
    x1, y1 = x0 + 24, y0 + 20
    base, cab = TOWER_BASE, TOWER_CAB
    m.box((x0, y0, 0), (x1, y1, base), "stucco", top="roof")
    for zl, zh in ((4, 10), (15, 21)):
        for wx in (x0 + 3, x0 + 10, x0 + 17):
            if zl == 4 and wx == x0 + 17:
                continue  # the door is there
            m.box((wx, y1, zl), (wx + 4, y1 + 0.35, zh), "window")
        for wy in (y0 + 4, y0 + 12):
            m.box((x0 - 0.35, wy, zl), (x0, wy + 4, zh), "window")
    m.box((x1 - 7, y1, 0), (x1 - 3, y1 + 0.35, 11), "wood")  # door
    m.box((x1 - 8, y1, 11), (x1 - 2, y1 + 2.5, 11.8), "roof")  # porch hood
    m.box((x0 - 0.4, y0 - 0.4, base - 1.4), (x1 + 0.4, y1 + 0.4, base), "roof", part=False)  # coping
    cx0, cy0, cx1, cy1 = x0 + 4, y0 + 3, x1 - 4, y1 - 3
    m.box((cx0, cy0, base), (cx1, cy1, cab), "cab")
    m.box((cx0 - 1.5, cy0 - 1.5, cab), (cx1 + 1.5, cy1 + 1.5, cab + 1.6), "roof")
    # Walk-round rail on the base roof.
    for x in np.linspace(x0 + 0.5, x1 - 0.5, 7):
        m.box((x - 0.3, y1 - 0.8, base), (x + 0.3, y1 - 0.2, base + 3.5), "steel")
    m.box((x0 + 0.3, y1 - 0.8, base + 3), (x1 - 0.3, y1 - 0.2, base + 3.6), "steel", part=False)
    for y in np.linspace(y0 + 0.5, y1 - 0.5, 5):
        m.box((x0 + 0.2, y - 0.3, base), (x0 + 0.8, y + 0.3, base + 3.5), "steel")
    m.box((x0 + 0.2, y0 + 0.3, base + 3), (x0 + 0.8, y1 - 0.3, base + 3.6), "steel", part=False)
    # Outside stair up the east wall, with a landing.
    m.new_part()
    steps = 12
    rise = base / steps
    for k in range(steps):
        m.box((x1, y0 + 1 + k * 1.5, k * rise), (x1 + 3.2, y0 + 2.6 + k * 1.5, (k + 1) * rise), "wood", part=False)
    # Radio mast with two spreaders, and a flag.
    mx, my = x1 - 5, y0 + 5
    top = cab + 26
    m.box((mx - 0.4, my - 0.4, cab + 1.6), (mx + 0.4, my + 0.4, top), "steel")
    m.box((mx - 4, my - 0.2, top - 4), (mx + 4, my + 0.2, top - 3.4), "steel", part=False)
    m.box((mx - 2.6, my - 0.2, top - 10), (mx + 2.6, my + 0.2, top - 9.4), "steel", part=False)
    fx, fy = x0 - 5, y1 + 2
    m.box((fx - 0.35, fy - 0.35, 0), (fx + 0.35, fy + 0.35, 50), "steel")
    m.new_part()
    m.poly([(fx, fy, 49.5), (fx + 11, fy - 1.0, 48.6), (fx + 11.3, fy - 1.1, 42.6), (fx, fy, 43.4)], "team")
    return {"stack": ((cx0 + cx1) / 2, (cy0 + cy1) / 2, top + 2)}


def fuel_dump(m: Mesh, x0: float, y0: float, x1: float, y1: float) -> None:
    gap0, gap1 = (x0 + x1) / 2 - 5, (x0 + x1) / 2 + 5
    sandbag_wall(m, x0, y0, x1, y0 + 3, 4.2)
    sandbag_wall(m, x0, y0 + 3, x0 + 3, y1, 4.2)
    sandbag_wall(m, x1 - 3, y0 + 3, x1, y1, 4.2)
    sandbag_wall(m, x0 + 3, y1 - 3, gap0, y1, 3.6)
    sandbag_wall(m, gap1, y1 - 3, x1 - 3, y1, 3.6)
    # Standing drums, red and green, in a block.
    for i in range(5):
        for j in range(3):
            cx = x0 + 7 + i * 4.8
            cy = y0 + 7 + j * 4.8
            mat = "drum_r" if (i + j) % 3 else "drum_g"
            m.cyl((cx, cy, 0), (cx, cy, 5.2), 2.1, 2.1, mat, n=12)
    # Drums on their sides, a small pyramid.
    for k, (dx, dz) in enumerate(((0, 0), (4.4, 0), (8.8, 0), (2.2, 3.8), (6.6, 3.8))):
        cy = y0 + 21.5 + (k % 2) * 0.2
        m.cyl((x0 + 6 + dx, cy - 2.6, 2.1 + dz), (x0 + 6 + dx, cy + 2.6, 2.1 + dz), 2.1, 2.1, "drum_side", n=12)
    # Crates and a bomb trolley with four SC 250s.
    for bx, by, bz in ((x1 - 16, y0 + 5, 0), (x1 - 10, y0 + 5, 0), (x1 - 16, y0 + 5, 4), (x1 - 13, y0 + 11, 0)):
        m.box((bx, by, bz), (bx + 5.4, by + 5, bz + 4), "crate")
    tx, ty = x1 - 18, y1 - 11
    m.box((tx, ty, 1.2), (tx + 13, ty + 5, 1.8), "steel")
    for wx in (tx + 1.5, tx + 11.5):
        for wy in (ty - 0.2, ty + 5.2):
            m.cyl((wx, wy - 0.4, 1.0), (wx, wy + 0.4, 1.0), 1.0, 1.0, "metal", n=8)
    for k, (dy, dz) in enumerate(((1.4, 3.3), (3.6, 3.3), (2.5, 5.9))):
        m.cyl((tx + 1, ty + dy, dz), (tx + 10, ty + dy, dz), 1.35, 1.35, "bomb", n=10)
        m.cyl((tx + 10, ty + dy, dz), (tx + 12.2, ty + dy, dz), 1.35, 0.5, "bomb", n=10, part=False)


def ridge_tent(m: Mesh, x0: float, y0: float, w: float, d: float, wall: float, ridge: float) -> None:
    m.new_part()
    x1, y1 = x0 + w, y0 + d
    xm = x0 + w / 2
    a = [m.v(p) for p in ((x0, y0, 0), (x1, y0, 0), (x1, y1, 0), (x0, y1, 0))]
    b = [m.v(p) for p in ((x0, y0, wall), (x1, y0, wall), (x1, y1, wall), (x0, y1, wall))]
    r0 = m.v((xm, y0, ridge))
    r1 = m.v((xm, y1, ridge))
    m.quad(a[0], a[3], b[3], b[0], "canvas")
    m.quad(a[1], a[2], b[2], b[1], "canvas")
    m.quad(b[0], b[3], r1, r0, "canvas")
    m.quad(b[1], b[2], r1, r0, "canvas")
    m.poly([(x0, y0, 0), (x1, y0, 0), (x1, y0, wall), (xm, y0, ridge), (x0, y0, wall)], "canvas")
    m.poly([(x0, y1, 0), (x1, y1, 0), (x1, y1, wall), (xm, y1, ridge), (x0, y1, wall)], "canvas")
    m.new_part()
    m.poly([(xm - 2.4, y1 + 0.2, 0), (xm + 2.4, y1 + 0.2, 0), (xm, y1 + 0.2, ridge * 0.8)], "flap")
    # Guy lines' pegs as tiny posts at the corners.
    for px, py in ((x0 - 1.5, y0 + 1), (x1 + 1.5, y0 + 1), (x0 - 1.5, y1 - 1), (x1 + 1.5, y1 - 1)):
        m.box((px - 0.25, py - 0.25, 0), (px + 0.25, py + 0.25, 1.4), "wood")


def flak_pit(m: Mesh, cx: float, cy: float) -> None:
    n = 10
    r0, r1 = 6.0, 9.0
    for i in range(n):
        if i == 3:  # entrance on the south side
            continue
        t0 = 2 * math.pi * i / n
        t1 = 2 * math.pi * (i + 1) / n
        m.new_part()
        pts_lo = [
            (cx + r0 * math.cos(t0), cy + r0 * math.sin(t0)),
            (cx + r1 * math.cos(t0), cy + r1 * math.sin(t0)),
            (cx + r1 * math.cos(t1), cy + r1 * math.sin(t1)),
            (cx + r0 * math.cos(t1), cy + r0 * math.sin(t1)),
        ]
        lo = [m.v((x, y, 0)) for x, y in pts_lo]
        hi = [m.v((x, y, 4.0)) for x, y in pts_lo]
        m.quad(hi[0], hi[1], hi[2], hi[3], "sandbag")
        m.quad(lo[1], lo[2], hi[2], hi[1], "sandbag")
        m.quad(lo[0], lo[3], hi[3], hi[0], "sandbag")
        m.quad(lo[0], lo[1], hi[1], hi[0], "sandbag")
        m.quad(lo[3], lo[2], hi[2], hi[3], "sandbag")
    # 2 cm Flak on its cruciform mount: pedestal, cradle, shield, barrel up toward the south-east.
    m.cyl((cx, cy, 0), (cx, cy, 2.4), 1.6, 1.2, "steel", n=10)
    m.box((cx - 1.6, cy - 1.2, 2.4), (cx + 1.6, cy + 1.2, 3.8), "steel")
    m.box((cx - 2.2, cy + 1.4, 2.4), (cx + 2.2, cy + 1.8, 5.2), "steel")
    m.cyl((cx, cy, 3.4), (cx + 4.5, cy + 5.0, 8.0), 0.45, 0.35, "metal", n=8)
    for bx, by in ((cx - 3.8, cy - 3), (cx - 2.4, cy - 3.8)):
        m.box((bx, by, 0), (bx + 1.8, by + 1.2, 1.2), "crate")


def windsock(m: Mesh, x: float, y: float) -> None:
    h = 40.0
    m.box((x - 0.4, y - 0.4, 0), (x + 0.4, y + 0.4, h), "steel")
    m.box((x - 0.7, y - 0.7, h - 1.6), (x + 0.7, y + 0.7, h - 0.8), "steel", part=False)
    m.cyl((x + 0.5, y, h - 1.2), (x + 15, y + 1.5, h - 2.8), 2.4, 1.2, "sock", n=14, caps=False)


def build_props() -> tuple[Mesh, dict]:
    # Structures carry the exaggerated height the other building sheets use;
    # loose kit (drums, crates, bombs) stays at the planes' scale.
    m = Mesh()
    nissen_hangar(m, cx=52.0, half=40.0, y0=1.0, y1=40.0, top=46.0)
    # Drums and a bench beside the hangar.
    for k, (dx, dy) in enumerate(((0, 0), (4.4, 0.4), (2.2, 4.2))):
        m.cyl((97 + dx, 25 + dy, 0), (97 + dx, 25 + dy, 5.2), 2.1, 2.1, "drum_g", n=12)
    m.box((95, 33, 0), (105, 37, 3.6), "crate")
    flak_pit(m, 124.0, 20.0)
    meta = control_tower(m, 144.0, 10.0)
    fuel_dump(m, 186.0, 6.0, 238.0, 38.0)
    ridge_tent(m, 248.0, 8.0, 19.0, 26.0, 4.6, 15.5)
    ridge_tent(m, 273.0, 11.0, 17.0, 22.0, 4.2, 14.0)
    windsock(m, 304.0, 34.0)
    return m, meta


# ---------------------------------------------------------------- raster


@dataclass
class Canvas:
    w: int
    h: int
    ox: float
    oy: float

    def to_screen(self, P: np.ndarray):
        X, Y, Z = P[:, 0], P[:, 1], P[:, 2]
        k = ZOOM * SS
        sx = self.ox + (X - Y) * k
        sy = self.oy + (X + Y) * 0.5 * k - Z * k
        depth = X + Y + Z
        return sx, sy, depth

    def to_world_ground(self, sx: np.ndarray, sy: np.ndarray):
        k = ZOOM * SS
        a = (sx - self.ox) / k  # X - Y
        b = (sy - self.oy) * 2 / k  # X + Y
        return (a + b) / 2, (b - a) / 2


def make_canvas() -> Canvas:
    k = ZOOM * SS
    left = -(H + SIDE_MARGIN) * k
    right = (W + SIDE_MARGIN) * k
    top = -TOP_MARGIN * k
    bottom = ((W + H) * 0.5 + SIDE_MARGIN) * k
    w = int(math.ceil((right - left) / SS)) * SS
    h = int(math.ceil((bottom - top) / SS)) * SS
    return Canvas(w, h, -left, -top)


@dataclass
class Frame:
    color: np.ndarray
    alpha: np.ndarray
    depth: np.ndarray
    part: np.ndarray
    normal: np.ndarray


def rasterize(mesh: Mesh, cv: Canvas) -> Frame:
    verts = np.array(mesh.verts)
    sx, sy, dep = cv.to_screen(verts)
    zbuf = np.full((cv.h, cv.w), -np.inf)
    col = np.zeros((cv.h, cv.w, 3))
    alpha = np.zeros((cv.h, cv.w))
    part = np.zeros((cv.h, cv.w), dtype=np.int32)
    nbuf = np.zeros((cv.h, cv.w, 3))
    for a, b, c, mat, pid in mesh.tris:
        x0, y0, x1, y1, x2, y2 = sx[a], sy[a], sx[b], sy[b], sx[c], sy[c]
        area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0)
        if abs(area) < 1e-9:
            continue
        minx = max(0, int(math.floor(min(x0, x1, x2))))
        maxx = min(cv.w - 1, int(math.ceil(max(x0, x1, x2))))
        miny = max(0, int(math.floor(min(y0, y1, y2))))
        maxy = min(cv.h - 1, int(math.ceil(max(y0, y1, y2))))
        if minx > maxx or miny > maxy:
            continue
        xs, ys = np.meshgrid(np.arange(minx, maxx + 1) + 0.5, np.arange(miny, maxy + 1) + 0.5)
        w0 = ((x1 - xs) * (y2 - ys) - (x2 - xs) * (y1 - ys)) / area
        w1 = ((x2 - xs) * (y0 - ys) - (x0 - xs) * (y2 - ys)) / area
        w2 = 1 - w0 - w1
        inside = (w0 >= 0) & (w1 >= 0) & (w2 >= 0)
        if not inside.any():
            continue
        d = w0 * dep[a] + w1 * dep[b] + w2 * dep[c]
        zb = zbuf[miny : maxy + 1, minx : maxx + 1]
        vis = inside & (d > zb + 1e-6)
        if not vis.any():
            continue
        pa, pb, pc = verts[a], verts[b], verts[c]
        n = np.cross(pb - pa, pc - pa)
        ln = np.linalg.norm(n)
        if ln < 1e-12:
            continue
        n /= ln
        if np.dot(n, VIEW) < 0:
            n = -n
        P = w0[vis][:, None] * pa + w1[vis][:, None] * pb + w2[vis][:, None] * pc
        base = tex(mat, P, n)
        lam = max(0.0, float(np.dot(n, LIGHT)))
        shade = 0.5 + 0.62 * lam
        if mat in ("lamp",):
            shade = 1.05
        c_px = np.clip(base * shade, 0, 1)
        zb[vis] = d[vis]
        col[miny : maxy + 1, minx : maxx + 1][vis] = c_px
        alpha[miny : maxy + 1, minx : maxx + 1][vis] = 1.0
        part[miny : maxy + 1, minx : maxx + 1][vis] = pid
        nbuf[miny : maxy + 1, minx : maxx + 1][vis] = n
    return Frame(col, alpha, zbuf, part, nbuf)


def ink(fr: Frame, width: int, strength: float = 0.72) -> None:
    """Dark line on part boundaries and hard creases, like the hand-inked structures."""
    p = fr.part
    nb = fr.normal
    edge = np.zeros(p.shape, dtype=bool)
    for dy, dx in ((0, 1), (1, 0)):
        q = np.roll(np.roll(p, -dy, axis=0), -dx, axis=1)
        nq = np.roll(np.roll(nb, -dy, axis=0), -dx, axis=1)
        diff_part = (p != q) & ((p > 0) | (q > 0))
        crease = (p > 0) & (q == p) & ((nb * nq).sum(axis=2) < 0.8)
        e = diff_part | crease
        # Mark the nearer pixel so lines sit on the object in front.
        dq = np.roll(np.roll(fr.depth, -dy, axis=0), -dx, axis=1)
        here = e & ((fr.depth >= dq) | (q == 0))
        there = e & ~here
        edge |= here
        edge |= np.roll(np.roll(there, dy, axis=0), dx, axis=1)
    grown = edge.copy()
    for k in range(1, width):
        grown |= np.roll(edge, k, axis=0) | np.roll(edge, k, axis=1)
    grown &= fr.alpha > 0.5
    fr.color[grown] = fr.color[grown] * (1 - strength) + OUTLINE * strength * 0.6


def silhouette(fr: Frame, px: int) -> None:
    a = fr.alpha > 0.5
    grown = a.copy()
    for dy in range(-px, px + 1):
        for dx in range(-px, px + 1):
            if dx * dx + dy * dy <= px * px:
                grown |= np.roll(np.roll(a, dy, axis=0), dx, axis=1)
    ring = grown & ~a
    fr.color[ring] = OUTLINE
    fr.alpha[ring] = 1.0


def shadow_mask(mesh: Mesh, cv: Canvas) -> np.ndarray:
    """Where the mesh shades the ground, cast along the key light."""
    verts = np.array(mesh.verts)
    z = np.maximum(verts[:, 2], 0)
    flat = verts.copy()
    flat[:, 0] -= LIGHT[0] / LIGHT[2] * z
    flat[:, 1] -= LIGHT[1] / LIGHT[2] * z
    flat[:, 2] = 0
    sx, sy, _ = cv.to_screen(flat)
    img = Image.new("L", (cv.w, cv.h), 0)
    from PIL import ImageDraw

    dr = ImageDraw.Draw(img)
    for a, b, c, _mat, _pid in mesh.tris:
        dr.polygon([(sx[a], sy[a]), (sx[b], sy[b]), (sx[c], sy[c])], fill=255)
    img = img.filter(ImageFilter.GaussianBlur(SS * 1.2))
    return np.asarray(img, dtype=np.float64) / 255.0


def contact_ao(mesh: Mesh, cv: Canvas) -> np.ndarray:
    """Soft darkening of the ground right around each object's base."""
    verts = np.array(mesh.verts)
    flat = verts.copy()
    flat[:, 2] = 0
    sx, sy, _ = cv.to_screen(flat)
    img = Image.new("L", (cv.w, cv.h), 0)
    from PIL import ImageDraw

    dr = ImageDraw.Draw(img)
    for a, b, c, _mat, _pid in mesh.tris:
        dr.polygon([(sx[a], sy[a]), (sx[b], sy[b]), (sx[c], sy[c])], fill=255)
    img = img.filter(ImageFilter.GaussianBlur(SS * 4))
    return np.asarray(img, dtype=np.float64) / 255.0


def downsample(color: np.ndarray, alpha: np.ndarray, k: int) -> Image.Image:
    h, w = alpha.shape
    a = alpha.reshape(h // k, k, w // k, k).mean(axis=(1, 3))
    pre = (color * alpha[..., None]).reshape(h // k, k, w // k, k, 3).mean(axis=(1, 3))
    c = np.where(a[..., None] > 1e-6, pre / np.maximum(a[..., None], 1e-6), 0)
    rgba = np.dstack([np.clip(c, 0, 1), np.clip(a, 0, 1)])
    return Image.fromarray((rgba * 255 + 0.5).astype(np.uint8), "RGBA")


def over(dst_c, dst_a, src_c, src_a):
    out_a = src_a + dst_a * (1 - src_a)
    out_c = np.where(
        out_a[..., None] > 1e-6,
        (src_c * src_a[..., None] + dst_c * dst_a[..., None] * (1 - src_a[..., None])) / np.maximum(out_a[..., None], 1e-6),
        0,
    )
    return out_c, out_a


def render(out_dir: Path) -> None:
    cv = make_canvas()
    print("canvas", cv.w // SS, "x", cv.h // SS)

    # Ground, evaluated per supersampled pixel.
    ys, xs = np.mgrid[0 : cv.h, 0 : cv.w].astype(np.float64) + 0.5
    X, Y = cv.to_world_ground(xs, ys)
    inside = (X > -8) & (X < W + 8) & (Y > -8) & (Y < H + 8)
    g_col = np.zeros((cv.h, cv.w, 3))
    g_a = np.zeros((cv.h, cv.w))
    c, a = ground_color(X[inside], Y[inside])
    g_col[inside] = c
    g_a[inside] = a

    low = build_ground_props()
    props, meta = build_props()

    # Shadows and contact darkening from everything that stands on the ground.
    sh = np.clip(shadow_mask(low, cv) + shadow_mask(props, cv), 0, 1)
    ao = np.clip(contact_ao(low, cv) + contact_ao(props, cv), 0, 1)
    g_col *= (1 - 0.42 * sh - 0.12 * ao)[..., None]

    low_fr = rasterize(low, cv)
    ink(low_fr, SS)
    g_col, g_a = over(g_col, g_a, low_fr.color, low_fr.alpha)
    ground = downsample(g_col, g_a, SS)

    pr = rasterize(props, cv)
    ink(pr, SS)
    silhouette(pr, SS)
    props_img = downsample(pr.color, pr.alpha, SS)

    out_dir.mkdir(parents=True, exist_ok=True)
    ground.save(out_dir / "airfield-ground.png", optimize=True)
    props_img.save(out_dir / "airfield.png", optimize=True)

    south = cv.to_screen(np.array([[W, H, 0.0]]))
    stack = cv.to_screen(np.array([meta["stack"]]))
    info = {
        "padWidth": round((W + H) * ZOOM, 1),
        "padSouthX": round(float(south[0][0]) / SS, 1),
        "padSouthY": round(float(south[1][0]) / SS, 1),
        "stackX": round(float(stack[0][0]) / SS, 1),
        "stackY": round(float(stack[1][0]) / SS, 1),
        "backDepth": BACK_DEPTH,
        "size": list(ground.size),
    }
    (out_dir / "airfield.json").write_text(json.dumps(info, indent=2) + "\n")
    print("wrote", out_dir / "airfield-ground.png", out_dir / "airfield.png", info)

    both = ground.copy()
    both.alpha_composite(props_img)
    cam = Image.new("RGBA", (96, 96), (0, 0, 0, 0))
    bb = both.getbbox()
    if bb:
        crop = both.crop(bb)
        f = min(92 / crop.width, 92 / crop.height)
        crop = crop.resize((max(1, round(crop.width * f)), max(1, round(crop.height * f))), Image.Resampling.LANCZOS)
        cam.alpha_composite(crop, ((96 - crop.width) // 2, (96 - crop.height) // 2))
    cam.save(out_dir / "airfield-cameo.png")
    preview = Path(__file__).parent / "preview"
    preview.mkdir(exist_ok=True)
    both.save(preview / "airfield-composite.png")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True, help="buildings asset folder")
    args = ap.parse_args()
    render(Path(args.out))


if __name__ == "__main__":
    main()
