#!/usr/bin/env python3
"""Burnt-out ruins for every civilian lot that leaves rubble.

Each house type gets its own ruin, in all four door faces (east, south, west,
north: the order `CIV_FACES` reads them), so a fallen house lies where and how
it stood:

  industry   factory, warehouse, foundry, granary, hall, works, shed, boiler are
             cut down from their own models in render_industry.py: walls broken
             off at a ragged height that changes brick course by brick course,
             the roof gone into the shell as a heap of slates, sheets and
             girders, stacks and silos snapped part way up.
  village    cottage, shack, house, barn, inn, chapel, manor are painted, with no
             model to cut, so each is modelled here as its own shell: its walls
             (half-timber over brick, stone, boards), its roof fallen in (red
             tile, slate, old shingle), chimneys and a chapel gable still
             standing, charred rafters leaning out of the heap.

Every ruin is burnt (soot up the broken wall heads, windows black), its heap
spills out through the breaches past the walls, and it lies on a ragged patch of
ash and scorched ground instead of the square lot pad.

The look is the inked structure style of render_airfield.py / render_industry.py
(same raster, ink, silhouette, key light, cast shadow, zoom), so the ruins sit
in the same world as the industrial lots.

  python3 tools/sprites/render_ruins.py                  # every ruin
  python3 tools/sprites/render_ruins.py --only cottage,factory
  python3 tools/sprites/render_ruins.py --preview        # also preview/ruins.png

Writes gridlock/packages/client/src/assets/ruins/<type>{,-s,-w,-n}.png and
ruins.json beside them: per face the pad metrics for `building()` in
render/sprites.ts, and the fire seats, lot-local world px [x, y, z, size], where
the client keeps the heap burning after the fall.
"""

from __future__ import annotations

import argparse
import json
import math
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
from PIL import Image

import render_airfield as ra
import render_industry as ri

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
OUT = ROOT / "gridlock/packages/client/src/assets/ruins"
PREVIEW = HERE / "preview"
LIVE = ROOT / "gridlock/packages/client/src/assets/buildings"

SS = ra.SS
ZOOM = ri.ZOOM_BUILDING
FACES = ri.FACES
rgb = ra.rgb
smooth = ra.smooth
mix = ra.mix


# ---------------------------------------------------------------- break heights


@dataclass
class Cut:
    """Walls inside `rect` (world, after the turn) break between `lo` and `hi`."""

    rect: tuple[float, float, float, float]
    lo: float
    hi: float
    seed: int
    # Fittings out to this far past the walls (canopies, signs, eaves) go with them.
    band: float = 9.0


@dataclass
class Cap:
    """A stack, silo, chimney or gable inside radius `r` that stands between `lo` and `hi`."""

    x: float
    y: float
    r: float
    lo: float
    hi: float
    seed: int


@dataclass
class Plan:
    cuts: list[Cut] = field(default_factory=list)
    caps: list[Cap] = field(default_factory=list)


def ragged(x: np.ndarray, y: np.ndarray, lo: float, hi: float, seed: int, scale: float = 18.0) -> np.ndarray:
    """A broken wall head: long runs knocked low or left high, stepped by the brick course."""
    run = np.clip(ra.fbm(x / scale, y / scale, seed, 3) * 1.7 - 0.35, 0, 1)
    chip = ra.cell_rand(np.floor(x / 1.7), np.floor(y / 1.7), seed + 3) - 0.5
    h = lo + (hi - lo) * run + chip * (hi - lo) * 0.16
    return np.floor(np.maximum(h, 0.6) / 0.9) * 0.9


def break_height(plan: Plan, x: np.ndarray, y: np.ndarray) -> np.ndarray:
    """World height above which a fragment of the standing model is gone (inf: untouched)."""
    h = np.full(x.shape, np.inf)
    for c in plan.cuts:
        x0, y0, x1, y1 = c.rect
        d = ra.rect_sdf(x, y, x0, y0, x1, y1)
        wall = d <= 2.0
        h = np.where(wall, np.minimum(h, ragged(x, y, c.lo, c.hi, c.seed)), h)
        near = (d > 2.0) & (d <= c.band)
        h = np.where(near, np.minimum(h, ragged(x, y, 6.0, 12.0, c.seed + 5, 6.0)), h)
    for k in plan.caps:
        inside = np.hypot(x - k.x, y - k.y) <= k.r
        h = np.where(inside, ragged(x, y, k.lo, k.hi, k.seed, 4.0), h)
    return h


# ---------------------------------------------------------------- materials

PLASTER = ["#c2b38f", "#a99a78", "#d1c5a2", "#8f8370"]
BRICK = ["#7d3a29", "#9a4c34", "#6a3426", "#8a3f2b"]
CHAR = ["#1d1915", "#3a2e24", "#2a231c"]
STONE = ["#77756d", "#918e84", "#5f5d57", "#a6a397"]
HEAPS = {
    "heap_red": PLASTER + BRICK[:2] + ["#a24a30", "#b85d3e", "#8e3b26"] + CHAR,
    "heap_slate": PLASTER + BRICK + ["#3f4448", "#525960"] + CHAR,
    "heap_shack": PLASTER[:3] + ["#4b4132", "#6a5c45", "#5b4632"] + CHAR * 2,
    "heap_barn": ["#5b4632", "#7b6248", "#6a5c45", "#8a7440", "#5a4a2a", "#a24a30", "#8e3b26"] + CHAR * 2,
    "heap_inn": PLASTER + BRICK + ["#a24a30", "#8e3b26"] + CHAR,
    "heap_chapel": STONE * 2 + ["#3f4448", "#525960"] + CHAR,
    "heap_manor": STONE + PLASTER + ["#3f4448", "#525960"] + CHAR,
    "heap_works": BRICK * 2 + ["#5a2a20", "#3f4448", "#525960", "#a99f8c", "#2f312e"] + CHAR,
    "heap_shed": BRICK + ["#5d625c", "#737a72", "#7a5134", "#2f312e", "#45443f"] + CHAR,
    "heap_conc": ["#a19b8b", "#8c8778", "#b5ae9c", "#6b675e"] + BRICK[:2] + ["#3f4448", "#c3bcaa"] + CHAR,
}

_tex = ra.tex
GROUND_Z = 0.0  # set per lot: 1.0 on a concrete yard, 0 on bare ground


def tex(mat: str, P: np.ndarray, n: np.ndarray) -> np.ndarray:
    X, Y, Z = P[:, 0], P[:, 1], P[:, 2]
    nf = ra.vnoise(X / 1.1 + Z * 0.7, Y / 1.1 - Z * 0.5, 7)
    nm = ra.fbm(X / 6 + Z * 0.2, Y / 6 + Z * 0.3, 9, 3)
    wall = abs(n[2]) < 0.3
    along = X if abs(n[1]) >= abs(n[0]) else Y

    def base(h):
        return np.broadcast_to(rgb(h), (len(X), 3)).copy()

    def chunks(cols: list[str], cell: float, seed: int) -> np.ndarray:
        """Broken pieces: each cell its own colour from `cols`, dark gaps between."""
        u = (X - Y * 0.37 + Z * 0.6) / cell
        v = (Y + X * 0.29 - Z * 0.4) / cell
        i, j = np.floor(u), np.floor(v)
        pick = (ra.cell_rand(i, j, seed) * len(cols)).astype(int).clip(0, len(cols) - 1)
        c = np.stack([rgb(h) for h in cols])[pick]
        c = c * (0.78 + 0.34 * ra.cell_rand(i, j, seed + 1))[:, None]
        fu, fv = u - i, v - j
        gap = (fu < 0.12) | (fv < 0.12)
        c[gap] *= 0.45
        return c * (0.9 + 0.12 * nf[:, None])

    if mat == "yard":
        c = ri.tex("yard", P, n)
        return c * (1 - 0.5 * scorch_at(X, Y))[:, None]
    if mat in ("window", "glazing"):
        # Burnt out: black openings, a bar or two of the frame left.
        c = base("#15120f") * (0.9 + 0.3 * nf[:, None])
        bar = (np.mod(along, 3.1) < 0.22) & (ra.vnoise(along / 2, Z / 3, 77) > 0.55)
        c[bar] = rgb("#4a4038")
        return c
    if mat == "stone":
        # Coursed rubble stone: grey blocks of uneven length.
        course = 1.6
        row = np.floor(Z / course) if wall else np.floor((X + Y) / 3.0)
        off = ra.cell_rand(row, row * 0 + 3, 5) * 3.0
        bi = np.floor((along + off) / 2.6)
        tone = ra.cell_rand(bi, row, 29)
        c = mix(base("#6f6d66"), base("#9a978c"), tone * 0.75 + nf * 0.25)
        mortar = (np.mod(Z, course) < 0.22) | (np.mod(along + off, 2.6) < 0.22) if wall else np.zeros(len(X), bool)
        c[mortar] = c[mortar] * 0.6 + rgb("#b8b2a2") * 0.25
        return c
    if mat == "plaster_timber":
        # Half-timber: lime plaster between dark oak posts, rails and braces.
        c = mix(base("#cbbd98"), base("#ddd2b2"), nm * 0.6 + nf * 0.4)
        post = np.mod(along, 4.8) < 0.75
        rail = (np.abs(np.mod(Z, 7.5) - 0.4) < 0.45) if wall else np.zeros(len(X), bool)
        brace = np.abs(np.mod(along - Z * 0.9, 9.6) - 4.8) < 0.38
        timber = (post | rail | brace) if wall else np.zeros(len(X), bool)
        c[timber] = rgb("#3b2b1d") * (0.85 + 0.25 * nf[timber][:, None])
        return c
    if mat == "planks":
        # Barn boards, weathered grey-brown, running up the wall.
        u = along if wall else X - Y
        board = np.floor(u / 1.5)
        c = mix(base("#5b4632"), base("#7b6248"), ra.cell_rand(board, board * 0, 37) * 0.7 + nf * 0.3)
        c[np.mod(u, 1.5) < 0.2] *= 0.55
        return c
    if mat == "tile_red":
        # Clay roof tiles in courses: fallen sheets keep their rows.
        row = np.floor((Z * 1.4 + X * 0.3 + Y * 0.3) / 1.1)
        c = mix(base("#8e3b26"), base("#b2563a"), ra.cell_rand(np.floor((X - Y) / 1.3), row, 43) * 0.7 + nf * 0.3)
        c[np.mod(Z * 1.4 + X * 0.3 + Y * 0.3, 1.1) < 0.2] *= 0.6
        return c
    if mat == "shingle":
        row = np.floor((Z * 1.2 + X * 0.3 + Y * 0.3) / 1.3)
        c = mix(base("#4b4132"), base("#6a5c45"), ra.cell_rand(np.floor((X - Y) / 1.6), row, 47) * 0.7 + nf * 0.3)
        moss = smooth(0.6, 0.85, ra.fbm(X / 5, Y / 5, 48))
        c = mix(c, base("#4f5a33"), moss * 0.5)
        c[np.mod(Z * 1.2 + X * 0.3 + Y * 0.3, 1.3) < 0.24] *= 0.6
        return c
    if mat == "char":
        # Burnt timber: black with the alligator cracks of charcoal and a brown edge.
        u = (X + Y) / 1.4
        v = Z / 0.9 + (X - Y) * 0.2
        crack = (np.mod(u, 1.0) < 0.12) | (np.mod(v, 1.0) < 0.1)
        c = mix(base("#1d1915"), base("#3a2e24"), nf * 0.8)
        c[crack] *= 0.45
        return c
    if mat == "hay":
        c = mix(base("#5a4a2a"), base("#8a7440"), nf)
        return mix(c, base("#1f1c18"), smooth(0.4, 0.75, nm))
    if mat == "hedge":
        c = mix(base("#2a2c1e"), base("#3d4126"), nf * 0.7 + nm * 0.3)
        return mix(c, base("#1a1714"), smooth(0.45, 0.7, ra.fbm(X / 4, Y / 4 + Z / 3, 81)) * 0.8)
    if mat == "bell":
        return base("#5d4a2a") * (0.85 + 0.3 * nf[:, None])
    if mat in HEAPS:
        # Broken masonry, shards and char in one heap: patches of each, ash in the hollows.
        pal = HEAPS[mat]
        pieces = chunks(pal, 1.05, 101 + len(mat))
        coarse = chunks(pal, 2.3, 131 + len(mat))
        c = mix(pieces, coarse, smooth(0.4, 0.7, ra.fbm(X / 7, Y / 7, 141)))
        ash = mix(base("#2b2722"), base("#5d574e"), nf)
        return mix(c, ash, smooth(0.5, 0.78, ra.fbm(X / 5 + 3, Y / 5, 143)) * 0.65)
    if mat == "plaster":
        return mix(base("#c4b592"), base("#d8cca9"), nm) * (0.92 + 0.1 * nf[:, None])
    if mat == "ash":
        c = mix(base("#3b3631"), base("#6e675d"), nm * 0.7 + nf * 0.3)
        return mix(c, base("#1c1a17"), smooth(0.45, 0.75, ra.fbm(X / 3, Y / 3, 117)) * 0.6)
    return _tex(mat, P, n)


ra.tex = tex


# ---------------------------------------------------------------- scorch

SCORCH: list[tuple[float, float, float, float]] = []  # building rects, world, for the yard and ground


def scorch_at(x: np.ndarray, y: np.ndarray) -> np.ndarray:
    """0..1 burn on the ground round the fallen walls, ragged."""
    if not SCORCH:
        return np.zeros(x.shape)
    d = np.min([ra.rect_sdf(x, y, *r) for r in SCORCH], axis=0)
    d = d + (ra.fbm(x / 13, y / 13, 211) - 0.5) * 16
    return smooth(16.0, 2.0, d) * (0.75 + 0.25 * ra.fbm(x / 4, y / 4, 213))


def ground_decal(gx: np.ndarray, gy: np.ndarray, W: float, H: float, kind: str) -> tuple[np.ndarray, np.ndarray]:
    """Ash and scorched earth under a ruin: thick at the walls, ragged out into the lot, never a square."""
    burn = scorch_at(gx, gy)
    lot = ra.rect_sdf(gx, gy, 0, 0, W, H) + (ra.fbm(gx / 9, gy / 9, 221) - 0.5) * 12
    wash = smooth(3.0, -6.0, lot)
    nm = ra.fbm(gx / 5, gy / 5, 223)
    nf = ra.vnoise(gx / 1.2, gy / 1.2, 225)
    if kind == "grass":
        outer = mix(np.broadcast_to(rgb("#4d4a2c"), gx.shape + (3,)), np.broadcast_to(rgb("#625a38"), gx.shape + (3,)), nm)
    else:
        outer = mix(np.broadcast_to(rgb("#5a4b38"), gx.shape + (3,)), np.broadcast_to(rgb("#73624a"), gx.shape + (3,)), nm)
    burnt = mix(np.broadcast_to(rgb("#25211c"), gx.shape + (3,)), np.broadcast_to(rgb("#4a443c"), gx.shape + (3,)), nm * 0.6 + nf * 0.4)
    col = mix(outer, burnt, np.clip(burn * 1.2, 0, 1))
    # White ash flecks where it burned hottest.
    fleck = (ra.vnoise(gx / 0.7, gy / 0.7, 227) > 0.86) & (burn > 0.5)
    col[fleck] = col[fleck] * 0.4 + rgb("#9b958a") * 0.6
    col = col * (0.9 + 0.14 * nf[..., None])
    alpha = np.clip(np.maximum(burn * 0.97, wash * 0.55), 0, 1)
    # Feather the rim into the grass with a broken edge, not a line.
    alpha *= smooth(0.0, 0.25, alpha + (nf - 0.5) * 0.2)
    return col, alpha


# ---------------------------------------------------------------- debris


class Heap:
    """A rubble heightfield over a rect (model coords), spilling `spill` past it with a ragged edge."""

    def __init__(self, t: ri.Turned, rect, peak: float, mat: str, seed: int, spill: float, base: float, bare: float = 0.0, step: float = 1.6):
        self.t = t
        self.rect = rect
        self.base = base
        x0, y0, x1, y1 = rect
        xs = np.arange(x0 - spill, x1 + spill + step * 0.5, step)
        ys = np.arange(y0 - spill, y1 + spill + step * 0.5, step)
        gx, gy = np.meshgrid(xs, ys)
        d = ra.rect_sdf(gx, gy, x0, y0, x1, y1) + (ra.fbm(gx / 9, gy / 9, seed) - 0.5) * spill * 2.2
        half = min(x1 - x0, y1 - y0) / 2
        inner = smooth(spill * 0.85, -half * 0.55, d)
        lumps = 0.5 + 0.55 * ra.fbm(gx / 6.5, gy / 6.5, seed + 1, 3) + 0.22 * (ra.cell_rand(np.floor(gx / 2.6), np.floor(gy / 2.6), seed + 2) - 0.5)
        # Bare floor shows through where the roof did not come down.
        lumps = np.clip((lumps - bare) / (1 - bare), 0, None)
        # Walls fell outward and inward: the heap banks up along them.
        bank = 0.35 * smooth(6.0, 0.0, np.abs(ra.rect_sdf(gx, gy, x0, y0, x1, y1)))
        h = peak * inner * (lumps + bank)
        h[h < 0.15] = 0.0
        self.xs, self.ys, self.h = xs, ys, h
        m = t.m
        t.new_part()
        ids = np.empty(h.shape, dtype=np.int64)
        for j in range(len(ys)):
            for i in range(len(xs)):
                ids[j, i] = m.v(t.p(xs[i], ys[j], base + h[j, i]))
        for j in range(len(ys) - 1):
            for i in range(len(xs) - 1):
                q = h[j : j + 2, i : i + 2]
                if q.max() <= 0.0:
                    continue
                a, b, c, d_ = ids[j, i], ids[j, i + 1], ids[j + 1, i + 1], ids[j + 1, i]
                # Split along the lower diagonal so the rim slopes into the ground instead of stepping.
                if q[0, 0] + q[1, 1] <= q[0, 1] + q[1, 0]:
                    m.tri(a, b, c, mat)
                    m.tri(a, c, d_, mat)
                else:
                    m.tri(a, b, d_, mat)
                    m.tri(b, c, d_, mat)

    def at(self, x: float, y: float) -> float:
        i = int(np.clip(round((x - self.xs[0]) / (self.xs[1] - self.xs[0])), 0, len(self.xs) - 1))
        j = int(np.clip(round((y - self.ys[0]) / (self.ys[1] - self.ys[0])), 0, len(self.ys) - 1))
        return self.base + float(self.h[j, i])

    def peaks(self, n: int, sep: float) -> list[tuple[float, float, float]]:
        """Up to `n` high points inside the walls, at least `sep` apart: where the fire sits."""
        x0, y0, x1, y1 = self.rect
        order = np.argsort(-self.h, axis=None)
        out: list[tuple[float, float, float]] = []
        for k in order:
            j, i = np.unravel_index(k, self.h.shape)
            x, y = float(self.xs[i]), float(self.ys[j])
            if not (x0 + 3 < x < x1 - 3 and y0 + 3 < y < y1 - 3):
                continue
            if any(math.hypot(x - a, y - b) < sep for a, b, _ in out):
                continue
            out.append((x, y, self.base + float(self.h[j, i])))
            if len(out) >= n:
                break
        return out


def obox(t: ri.Turned, c, u, v, w, hu: float, hv: float, hw: float, mat: str, part: bool = True) -> None:
    """An oriented box (model coords): centre c, unit axes u, v, w, half sizes."""
    if part:
        t.new_part()
    c, u, v, w = (np.asarray(a, float) for a in (c, u, v, w))
    P = {}
    for su in (-1, 1):
        for sv in (-1, 1):
            for sw in (-1, 1):
                P[(su, sv, sw)] = tuple(c + u * hu * su + v * hv * sv + w * hw * sw)
    faces = [
        [(-1, -1, -1), (1, -1, -1), (1, 1, -1), (-1, 1, -1)],
        [(-1, -1, 1), (1, -1, 1), (1, 1, 1), (-1, 1, 1)],
        [(-1, -1, -1), (1, -1, -1), (1, -1, 1), (-1, -1, 1)],
        [(-1, 1, -1), (1, 1, -1), (1, 1, 1), (-1, 1, 1)],
        [(-1, -1, -1), (-1, 1, -1), (-1, 1, 1), (-1, -1, 1)],
        [(1, -1, -1), (1, 1, -1), (1, 1, 1), (1, -1, 1)],
    ]
    for f in faces:
        t.poly([P[k] for k in f], mat)


def tilted(t: ri.Turned, c, yaw: float, pitch: float, roll: float, length: float, width: float, thick: float, mat: str) -> None:
    """A slab or beam lying at `yaw`, its long axis pitched up by `pitch` and rolled by `roll` (radians)."""
    u = np.array([math.cos(yaw) * math.cos(pitch), math.sin(yaw) * math.cos(pitch), math.sin(pitch)])
    side = np.array([-math.sin(yaw), math.cos(yaw), 0.0])
    up = np.cross(u, side)
    v = side * math.cos(roll) + up * math.sin(roll)
    w = np.cross(u, v)
    obox(t, c, u, v, w, length / 2, width / 2, thick / 2, mat)


@dataclass
class Debris:
    """What a fallen building leaves on its heap."""

    heap: str  # a HEAPS palette
    roof: str
    chunk: list[str]
    slabs: int = 6
    beams: int = 5
    girders: int = 0
    chunks: int = 0  # 0: by area
    peak: float = 6.0
    spill: float = 8.0
    fires: int = 3
    bare: float = 0.0  # share of the floor left clear of debris


def strew(t: ri.Turned, rect, d: Debris, rnd: np.random.Generator, seed: int, base: float) -> list[tuple[float, float, float]]:
    """Heap, fallen roof, rafters, girders and loose blocks over one building rect. Returns its fire seats."""
    x0, y0, x1, y1 = rect
    heap = Heap(t, rect, d.peak, d.heap, seed, d.spill, base, d.bare)

    def inside(m: float = 2.0):
        return rnd.uniform(x0 + m, x1 - m), rnd.uniform(y0 + m, y1 - m)

    area = (x1 - x0) * (y1 - y0)
    span = min(x1 - x0, y1 - y0)
    for _ in range(d.slabs):
        x, y = inside(4.0)
        L = rnd.uniform(0.25, 0.45) * span
        tilted(t, (x, y, heap.at(x, y) + 0.2), rnd.uniform(0, math.tau), rnd.uniform(0.12, 0.6), rnd.uniform(-0.35, 0.35), L, L * rnd.uniform(0.5, 0.8), 0.55, d.roof)
    for _ in range(d.beams):
        x, y = inside(3.0)
        L = rnd.uniform(0.35, 0.7) * span
        pitch = rnd.uniform(0.2, 0.75)
        c = (x, y, heap.at(x, y) + math.sin(pitch) * L * 0.35)
        tilted(t, c, rnd.uniform(0, math.tau), pitch, 0.0, L, 0.9, 0.9, "char")
    for _ in range(d.girders):
        x, y = inside(4.0)
        L = rnd.uniform(0.3, 0.55) * span
        yaw = rnd.uniform(0, math.tau)
        z = heap.at(x, y) + 1.0
        # A roof truss buckled in two, one half lying, one reared up.
        tilted(t, (x, y, z), yaw, rnd.uniform(0.0, 0.15), rnd.uniform(-0.3, 0.3), L, 0.8, 1.6, "iron")
        bx = x + math.cos(yaw) * L * 0.5
        by = y + math.sin(yaw) * L * 0.5
        p2 = rnd.uniform(0.35, 0.8)
        y2 = yaw + rnd.uniform(-0.8, 0.8)
        tilted(t, (bx + math.cos(y2) * L * 0.25, by + math.sin(y2) * L * 0.25, z + math.sin(p2) * L * 0.25), y2, p2, 0.0, L * 0.5, 0.8, 1.6, "iron")
    n = d.chunks or int(area / 55)
    for _ in range(n):
        # Most blocks on the heap, some thrown out past the walls.
        if rnd.random() < 0.7:
            x, y = inside(1.0)
        else:
            a = rnd.uniform(0, math.tau)
            r = rnd.uniform(0.3, 1.0) * d.spill
            cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
            x = min(max(cx + math.cos(a) * ((x1 - x0) / 2 + r), x0 - d.spill), x1 + d.spill)
            y = min(max(cy + math.sin(a) * ((y1 - y0) / 2 + r), y0 - d.spill), y1 + d.spill)
        s = rnd.uniform(0.6, 1.8)
        tilted(
            t,
            (x, y, heap.at(x, y) + s * 0.3),
            rnd.uniform(0, math.tau),
            rnd.uniform(-0.4, 0.4),
            rnd.uniform(-0.4, 0.4),
            s * rnd.uniform(1.4, 2.6),
            s * rnd.uniform(1.0, 1.8),
            s * rnd.uniform(0.7, 1.2),
            d.chunk[int(rnd.integers(len(d.chunk)))],
        )
    return heap.peaks(d.fires, max(10.0, span * 0.32))


# ---------------------------------------------------------------- village shells


def wall_run(t: ri.Turned, axis: str, at: float, a0: float, a1: float, thick: float, bands, holes) -> None:
    """One wall along `axis` from a0 to a1, with door and window holes [(centre, width, z0, z1)]."""
    top = bands[-1][1]
    marks = sorted([(c - w / 2, c + w / 2, z0, z1) for c, w, z0, z1 in holes])
    spans: list[tuple[float, float, float, float]] = []  # (s0, s1, z0, z1) solid pieces
    s = a0
    for h0, h1, z0, z1 in marks:
        if h0 > s:
            spans.append((s, h0, 0.0, top))
        spans.append((h0, h1, 0.0, z0))
        spans.append((h0, h1, z1, top))
        s = h1
    if s < a1:
        spans.append((s, a1, 0.0, top))
    t.new_part()
    for s0, s1, z0, z1 in spans:
        for b0, b1, mat in bands:
            lo, hi = max(z0, b0), min(z1, b1)
            if hi - lo < 0.05:
                continue
            if axis == "x":
                t.box((s0, at - thick / 2, lo), (s1, at + thick / 2, hi), mat, part=False)
            else:
                t.box((at - thick / 2, s0, lo), (at + thick / 2, s1, hi), mat, part=False)


@dataclass
class Village:
    size: float
    rect: tuple[float, float, float, float]
    bands: list[tuple[float, float, str]]
    lo: float
    hi: float
    debris: Debris
    chimneys: list[tuple[float, float, float, float]] = field(default_factory=list)  # x, y, half, top
    ground: str = "grass"
    windows: float = 10.0  # spacing of ground-floor windows
    extra: str = ""


RED = Debris("heap_red", "tile_red", ["plaster", "brick", "tile_red", "char"], slabs=5, beams=5, peak=6.0, spill=7.0, fires=2)
SLATE = Debris("heap_slate", "slate", ["plaster", "brick", "slate", "char"], slabs=6, beams=6, peak=5.5, spill=8.0, fires=3)

VILLAGE: dict[str, Village] = {
    "cottage": Village(64.0, (17.0, 15.0, 47.0, 49.0), [(0, 2.0, "stone"), (2.0, 20.0, "plaster_timber")], 2.0, 12.0, RED, ground="dirt"),
    "shack": Village(
        64.0,
        (19.0, 17.0, 45.0, 47.0),
        [(0, 1.5, "stone"), (1.5, 18.0, "plaster_timber")],
        1.0,
        10.0,
        Debris("heap_shack", "shingle", ["plaster", "char", "shingle"], slabs=5, beams=6, peak=4.0, spill=7.0, fires=2),
        chimneys=[(22.5, 20.5, 2.2, 24.0)],
        ground="dirt",
    ),
    "house": Village(96.0, (30.0, 28.0, 68.0, 70.0), [(0, 12.0, "brick"), (12.0, 28.0, "plaster_timber")], 4.0, 17.0, SLATE),
    "barn": Village(
        96.0,
        (27.0, 24.0, 71.0, 74.0),
        [(0, 2.0, "stone"), (2.0, 26.0, "planks")],
        2.0,
        12.0,
        Debris("heap_barn", "tile_red", ["char", "tile_red", "planks"], slabs=6, beams=8, peak=5.0, spill=9.0, fires=3),
        ground="dirt",
        windows=0.0,
    ),
    "inn": Village(
        96.0,
        (28.0, 26.0, 70.0, 72.0),
        [(0, 11.0, "brick"), (11.0, 28.0, "plaster_timber")],
        4.0,
        18.0,
        Debris("heap_inn", "tile_red", ["plaster", "brick", "tile_red", "char"], slabs=6, beams=6, peak=5.5, spill=8.0, fires=3),
        chimneys=[(31.5, 30.0, 2.6, 34.0), (31.5, 68.0, 2.6, 30.0)],
    ),
    "chapel": Village(
        96.0,
        (32.0, 26.0, 66.0, 72.0),
        [(0, 30.0, "stone")],
        6.0,
        22.0,
        Debris("heap_chapel", "slate", ["stone", "slate", "char"], slabs=6, beams=5, peak=5.5, spill=8.0, fires=2),
        windows=9.0,
        extra="chapel",
    ),
    "manor": Village(
        128.0,
        (38.0, 34.0, 90.0, 94.0),
        [(0, 14.0, "stone"), (14.0, 34.0, "plaster_timber")],
        5.0,
        19.0,
        Debris("heap_manor", "slate", ["stone", "plaster", "slate", "char"], slabs=8, beams=8, peak=6.5, spill=10.0, fires=4),
        chimneys=[(42.0, 38.0, 2.8, 44.0), (42.0, 90.0, 2.8, 40.0), (64.0, 64.0, 2.8, 46.0)],
    ),
}


def village(name: str, t: ri.Turned, plan: Plan, rnd: np.random.Generator) -> tuple[list[tuple[float, float, float]], int]:
    v = VILLAGE[name]
    x0, y0, x1, y1 = v.rect
    th = 1.6
    door = ((y0 + y1) / 2, 6.5, 0.0, 12.0)

    def holes(a0: float, a1: float, extra=()):
        out = list(extra)
        if v.windows > 0:
            k = int((a1 - a0) // v.windows)
            for i in range(k):
                c = a0 + (i + 0.5) * (a1 - a0) / k
                if all(abs(c - e[0]) > e[1] / 2 + 2.6 for e in extra):
                    out.append((c, 3.0, 5.0, 11.0))
        return out

    tall = v.extra == "chapel"
    win = (lambda a0, a1, extra=(): [(c, 3.6, 8.0, 24.0) for c, *_ in holes(a0, a1)] + list(extra)) if tall else holes
    wall_run(t, "x", y0 + th / 2, x0, x1, th, v.bands, win(x0, x1))
    wall_run(t, "x", y1 - th / 2, x0, x1, th, v.bands, win(x0, x1))
    wall_run(t, "y", x0 + th / 2, y0 + th, y1 - th, th, v.bands, win(y0, y1))
    wall_run(t, "y", x1 - th / 2, y0 + th, y1 - th, th, v.bands, win(y0, y1, [door]))
    seed = sum(map(ord, name)) * 31
    plan.cuts.append(Cut(world_rect(t, v.rect), v.lo, v.hi, seed))
    for i, (cx, cy, half, top) in enumerate(v.chimneys):
        t.box((cx - half, cy - half, 0.0), (cx + half, cy + half, top), "brick", top="soot")
        wx, wy, _ = t.p(cx, cy, 0)
        plan.caps.append(Cap(wx, wy, half * 1.5, top * 0.42, top * 0.62, seed + 11 + i))
    if v.extra == "chapel":
        # The east gable stands to the roof line; the bell is down in the nave.
        wx, wy, _ = t.p(x1, (y0 + y1) / 2, 0)
        plan.caps.append(Cap(wx, wy, 11.0, 22.0, 30.0, seed + 21))
    SCORCH.append(world_rect(t, v.rect))
    # Everything so far stood and is broken off; the debris from here on lies where it fell.
    mark = t.m.part
    seats = strew(t, v.rect, v.debris, rnd, seed + 1, 0.0)
    if v.extra == "chapel":
        bx, by = x0 + 10, (y0 + y1) / 2 + 4
        t.cyl((bx, by, 1.5), (bx + 3.2, by + 1.2, 4.6), 2.6, 1.3, "bell", n=14)
    return seats, mark


# ---------------------------------------------------------------- industry shells


@dataclass
class Shell:
    rects: list[tuple[tuple[float, float, float, float], float, float]]  # model rect, lo, hi
    caps: list[tuple[float, float, float, float, float]]  # model x, y, r, lo, hi
    debris: Debris
    heaps: list[int] | None = None  # which rects get a heap (default all)
    extra: str = ""


def ind_debris(roof: str, fires: int, girders: int = 3, conc: float = 0.0) -> Debris:
    heap = "heap_conc" if conc else "heap_shed" if roof == "shed" else "heap_works"
    return Debris(heap, roof, ["brick", "brick_dark", roof, "char"], slabs=9, beams=4, girders=girders, peak=5.0, spill=9.0, fires=fires, bare=0.32)


SHELLS: dict[str, Shell] = {
    "factory": Shell(
        [((14.0, 22.0, 122.0, 140.0), 4.0, 22.0), ((96.0, 112.0, 146.0, 150.0), 5.0, 24.0)],
        [(30.0, 36.0, 10.5, 40.0, 60.0)],
        ind_debris("slate", 5, girders=4),
    ),
    "warehouse": Shell([((16.0, 24.0, 104.0, 82.0), 4.0, 22.0)], [], ind_debris("slate", 3, girders=2)),
    "foundry": Shell(
        [((24.0, 20.0, 128.0, 92.0), 4.0, 22.0), ((62.0, 121.0, 95.0, 127.0), 3.0, 16.0)],
        [(48.0, 70.0, 4.5, 30.0, 50.0), (78.0, 70.0, 4.5, 16.0, 30.0), (54.0, 124.0, 11.0, 16.0, 28.0)],
        ind_debris("shed", 4, girders=5),
        heaps=[0],
    ),
    "granary": Shell(
        [((70.0, 20.0, 116.0, 92.0), 4.0, 22.0), ((41.0, 45.0, 92.0, 55.0), 2.0, 8.0)],
        [(34.0, 26.0, 12.5, 30.0, 52.0), (34.0, 50.0, 15.5, 12.0, 28.0), (34.0, 74.0, 12.5, 36.0, 58.0)],
        ind_debris("slate", 3, girders=1, conc=2.0),
        heaps=[0],
        extra="granary",
    ),
    "hall": Shell(
        [((12.0, 12.0, 200.0, 80.0), 4.0, 22.0), ((30.0, 80.0, 96.0, 90.0), 4.0, 22.0)],
        [(22.0, 22.0, 9.5, 34.0, 56.0)],
        ind_debris("slate", 5, girders=6),
        heaps=[0],
    ),
    "works": Shell(
        [((10.0, 10.0, 182.0, 68.0), 4.0, 22.0), ((10.0, 68.0, 70.0, 150.0), 4.0, 22.0)],
        [(40.0, 24.0, 9.5, 40.0, 62.0), (150.0, 118.0, 10.0, 12.0, 28.0)],
        ind_debris("slate", 5, girders=4),
        extra="works",
    ),
    "shed": Shell([((6.0, 6.0, 168.0, 58.0), 4.0, 18.0)], [], ind_debris("slate", 4, girders=3)),
    "boiler": Shell(
        [((10.0, 62.0, 86.0, 182.0), 4.0, 22.0), ((14.0, 8.0, 82.0, 44.0), 3.0, 9.0), ((43.0, 38.0, 53.0, 64.0), 2.0, 6.0)],
        [(74.0, 150.0, 10.5, 52.0, 82.0)],
        ind_debris("slate", 4, girders=3),
        heaps=[0],
    ),
}


def world_rect(t: ri.Turned, r) -> tuple[float, float, float, float]:
    a = t.p(r[0], r[1], 0)
    b = t.p(r[2], r[3], 0)
    return (min(a[0], b[0]), min(a[1], b[1]), max(a[0], b[0]), max(a[1], b[1]))


def shell(name: str, t: ri.Turned, plan: Plan, rnd: np.random.Generator) -> tuple[list[tuple[float, float, float]], int]:
    s = SHELLS[name]
    size, build = ri.BUILDINGS[name]
    W, H = (size, size) if isinstance(size, (int, float)) else size
    build(t, W, H) if W != H else build(t, W)
    seed = sum(map(ord, name)) * 37
    for i, (r, lo, hi) in enumerate(s.rects):
        plan.cuts.append(Cut(world_rect(t, r), lo, hi, seed + i * 13))
    for i, (x, y, r, lo, hi) in enumerate(s.caps):
        wx, wy, _ = t.p(x, y, 0)
        plan.caps.append(Cap(wx, wy, r, lo, hi, seed + 101 + i))
    mark = t.m.part
    fires: list[tuple[float, float, float]] = []
    for i in s.heaps if s.heaps is not None else range(len(s.rects)):
        r = s.rects[i][0]
        d = s.debris
        if i > 0:
            span = min(r[2] - r[0], r[3] - r[1])
            d = Debris(d.heap, d.roof, d.chunk, slabs=3, beams=2, girders=0, peak=min(d.peak, span * 0.2), spill=6.0, fires=1, bare=d.bare)
        fires += strew(t, r, d, rnd, seed + 50 + i, 1.0)
        SCORCH.append(world_rect(t, r))
    if s.extra == "granary":
        # A silo's top ring lies in the yard where it came down.
        t.cyl((48.0, 102.0, 1.0 + 6.0), (60.0, 112.0, 1.0 + 6.0), 6.5, 6.5, "silo", n=18)
        SCORCH.append(world_rect(t, (24.0, 14.0, 46.0, 86.0)))
    if s.extra == "works":
        # The water tower's tank lies on its side by its sawn-off legs.
        t.cyl((134.0, 130.0, 1.0 + 8.0), (150.0, 140.0, 1.0 + 8.0), 8.2, 8.2, "rust", n=20)
    return fires, mark


# ---------------------------------------------------------------- raster with the break


def rasterize_cut(mesh: ra.Mesh, cv: ra.Canvas, plan: Plan, cut_parts: int) -> ra.Frame:
    """ra.rasterize, but a fragment of a part <= `cut_parts` above its break height is gone,
    and what is left is sooted up the broken wall head."""
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
        pa, pb, pc = verts[a], verts[b], verts[c]
        cut = pid <= cut_parts
        brk = None
        if cut:
            P_all = w0[inside][:, None] * pa + w1[inside][:, None] * pb + w2[inside][:, None] * pc
            brk_all = break_height(plan, P_all[:, 0], P_all[:, 1])
            keep = np.zeros(inside.shape, dtype=bool)
            keep[inside] = P_all[:, 2] <= brk_all + 1e-6
            brk_grid = np.full(inside.shape, np.inf)
            brk_grid[inside] = brk_all
            inside = keep
            if not inside.any():
                continue
        d = w0 * dep[a] + w1 * dep[b] + w2 * dep[c]
        zb = zbuf[miny : maxy + 1, minx : maxx + 1]
        vis = inside & (d > zb + 1e-6)
        if not vis.any():
            continue
        n = np.cross(pb - pa, pc - pa)
        ln = np.linalg.norm(n)
        if ln < 1e-12:
            continue
        n /= ln
        if np.dot(n, ra.VIEW) < 0:
            n = -n
        P = w0[vis][:, None] * pa + w1[vis][:, None] * pb + w2[vis][:, None] * pc
        base = tex(mat, P, n)
        lam = max(0.0, float(np.dot(n, ra.LIGHT)))
        shade = 0.5 + 0.62 * lam
        c_px = base * shade
        if cut:
            brk = brk_grid[vis]
            below = np.where(np.isfinite(brk), brk - P[:, 2], 99.0)
            # Fire licked up out of the windows and over the broken heads: soot, streaked.
            streak = ra.vnoise((P[:, 0] + P[:, 1]) / 1.3, P[:, 2] / 9.0, 91)
            soot = 0.55 * smooth(5.0, 0.0, below) * (0.45 + 0.55 * streak)
            burnt = np.where(np.isfinite(brk), 0.07, 0.0)
            grey = c_px.mean(axis=1, keepdims=True)
            c_px = mix(c_px, grey, np.where(np.isfinite(brk), 0.15, 0.0))
            c_px = c_px * (1 - np.clip(soot + burnt, 0, 0.85))[:, None]
        c_px = np.clip(c_px, 0, 1)
        zb[vis] = d[vis]
        col[miny : maxy + 1, minx : maxx + 1][vis] = c_px
        alpha[miny : maxy + 1, minx : maxx + 1][vis] = 1.0
        part[miny : maxy + 1, minx : maxx + 1][vis] = pid
        nbuf[miny : maxy + 1, minx : maxx + 1][vis] = n
    return ra.Frame(col, alpha, zbuf, part, nbuf)


def caster(mesh: ra.Mesh, plan: Plan, cut_parts: int) -> ra.Mesh:
    """The mesh as it stands after the break, for the cast shadow and the canvas bounds."""
    out = ra.Mesh()
    V = np.array(mesh.verts)
    cut_v = np.zeros(len(V), dtype=bool)
    for a, b, c, _m, pid in mesh.tris:
        if pid <= cut_parts:
            cut_v[[a, b, c]] = True
    brk = break_height(plan, V[:, 0], V[:, 1])
    Z = np.where(cut_v, np.minimum(V[:, 2], brk), V[:, 2])
    out.verts = [np.array([x, y, z]) for (x, y, _), z in zip(V, Z)]
    out.tris = [tr for tr in mesh.tris if tr[3] not in ("yard", "cobble")]
    return out


# ---------------------------------------------------------------- render


def lot_size(name: str) -> tuple[float, float]:
    if name in VILLAGE:
        s = VILLAGE[name].size
        return s, s
    size = ri.BUILDINGS[name][0]
    return (size, size) if isinstance(size, (int, float)) else size


def render_face(name: str, face: int, out_dir: Path) -> dict:
    W, H = lot_size(name)
    ra.ZOOM = ZOOM
    t = ri.Turned((W, H) if W != H else W, face)
    plan = Plan()
    SCORCH.clear()
    rnd = np.random.default_rng(sum(map(ord, name)) * 1009 + face * 7)
    if name in VILLAGE:
        seats, cut_parts = village(name, t, plan, rnd)
        kind = VILLAGE[name].ground
    else:
        seats, cut_parts = shell(name, t, plan, rnd)
        kind = "dirt"
    fires = seat_list(t, seats)
    mesh = t.m
    stands = caster(mesh, plan, cut_parts)
    cv = ri.canvas_for(stands, [(-10, -10), (W + 10, -10), (-10, H + 10), (W + 10, H + 10)])
    sh = ra.shadow_mask(stands, cv)
    ao = ra.contact_ao(stands, cv)
    fr = rasterize_cut(mesh, cv, plan, cut_parts)
    ra.ink(fr, SS)
    ra.silhouette(fr, SS)
    ys, xs = np.mgrid[0 : cv.h, 0 : cv.w].astype(np.float64) + 0.5
    gx, gy = cv.to_world_ground(xs, ys)
    shadow = np.clip(sh * 0.42 + ao * 0.12, 0, 0.6)
    solid = fr.alpha > 0.5
    zw = (fr.depth - gx - gy) / 3.0
    up = solid & (fr.normal[..., 2] > 0.7) & (zw < 2.5)
    color = fr.color.copy()
    color[up] *= (1 - shadow[up])[:, None]
    # Ground: ash and scorch under everything, the cast shadow on it.
    g_col, g_a = ground_decal(gx, gy, W, H, kind)
    g_col = g_col * (1 - shadow * 0.9)[..., None]
    g_a = np.maximum(g_a, np.where(~solid, shadow, 0))
    color, alpha = ra.over(g_col, g_a, color, fr.alpha)
    img = ra.downsample(color, alpha, SS)
    bb = img.getbbox() or (0, 0, img.width, img.height)
    img = img.crop(bb)
    file = f"{name}{FACES[face]}.png"
    img.save(out_dir / file, optimize=True)
    south = ri.screen(cv, W, H, 0.0)
    centre = ri.screen(cv, W / 2, H / 2, 0.0)
    top = max((z for *_, z in [tuple(v) for v in stands.verts]), default=10.0)
    info = {
        "file": file,
        "size": list(img.size),
        "padWidth": round((W + H) * ZOOM, 1),
        "padSouthX": round(south[0] - bb[0], 1),
        "padSouthY": round(south[1] - bb[1], 1),
        "stackX": round(centre[0] - bb[0], 1),
        "stackY": round(max(4.0, centre[1] - bb[1] - 20), 1),
        # Tallest standing remnant, world px: the occlusion rise for units behind it.
        "rise": round(float(min(top, 120.0)), 1),
        "fires": [[round(x, 1), round(y, 1), round(z, 1), round(s, 2)] for x, y, z, s in fires],
    }
    print("wrote", out_dir / file, info["size"], "fires", len(fires))
    return info


def seat_list(t: ri.Turned, seats) -> list[tuple[float, float, float, float]]:
    """Fire seats in lot-local world px (after the turn), biggest fire first."""
    out = []
    for i, (x, y, z) in enumerate(seats):
        wx, wy, wz = t.p(x, y, z)
        out.append((wx, wy, wz, 1.0 if i == 0 else 0.75))
    return out


def preview(names: list[str]) -> None:
    PREVIEW.mkdir(exist_ok=True)
    h = 220
    rows = []
    for n in names:
        tiles = []
        live = LIVE / f"{n}.png"
        if live.exists():
            tiles.append(Image.open(live).convert("RGBA"))
        for s in FACES:
            tiles.append(Image.open(OUT / f"{n}{s}.png").convert("RGBA"))
        tiles = [im.resize((max(1, int(im.width * h / im.height)), h), Image.Resampling.LANCZOS) for im in tiles]
        rows.append(tiles)
    W = max(sum(t.width for t in r) + 10 * len(r) for r in rows) + 10
    sheet = Image.new("RGBA", (W, len(rows) * (h + 10) + 10), (88, 104, 66, 255))
    for j, r in enumerate(rows):
        x = 10
        for im in r:
            sheet.alpha_composite(im, (x, 10 + j * (h + 10)))
            x += im.width + 10
    sheet.save(PREVIEW / "ruins.png")
    print("preview", PREVIEW / "ruins.png")


ALL = [*VILLAGE, *SHELLS]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="", help="comma list of house types")
    ap.add_argument("--faces", default="", help="comma list of face indexes (0 east, 1 south, 2 west, 3 north)")
    ap.add_argument("--preview", action="store_true")
    ap.add_argument("--out", default=str(OUT))
    args = ap.parse_args()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    names = [n for n in args.only.split(",") if n] or ALL
    faces = [int(f) for f in args.faces.split(",") if f] or [0, 1, 2, 3]
    manifest = out / "ruins.json"
    man = json.loads(manifest.read_text()) if manifest.exists() else {}
    for n in names:
        if n not in ALL:
            raise SystemExit(f"unknown type {n}")
        prev = man.get(n, [None] * 4)
        man[n] = [render_face(n, f, out) if f in faces else prev[f] for f in range(4)]
    man = {k: man[k] for k in ALL if k in man}
    manifest.write_text(json.dumps(man, indent=1) + "\n")
    if args.preview:
        preview(names)


if __name__ == "__main__":
    main()
