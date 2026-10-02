#!/usr/bin/env python3
"""
Map dress props for the terrain layer — boulders, stone rubble, stumps,
signposts, and the tileable rock ground texture.

These are props and a tile, not unit sheets: one image each, no facings.
Variety in game comes from picking a variant and mirroring it. The camera is
the same high 2:1 three-quarter view as the tree and bush sheets, light from
the upper left, no outline, no ground. Shipped PNGs are keyed to alpha
(the magenta field never leaves this script).

  python tools/sprites/render_props.py            # every prop
  python tools/sprites/render_props.py --only boulder,stump
  python tools/sprites/render_props.py --preview  # contact strip on magenta

Contact points (the pixel that sits on the tile) are printed per file so
`render/sprites.ts` can register them.
"""

from __future__ import annotations

import argparse
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
OUT = ROOT / "gridlock/packages/client/src/assets/terrain"
PREVIEW = HERE / "preview"

SS = 2  # supersample
LIGHT = np.array([-0.55, -0.62, 0.56])
LIGHT = LIGHT / np.linalg.norm(LIGHT)


# --------------------------------------------------------------------------- noise


def value_noise(h: int, w: int, cell: float, rng: np.random.Generator, period: tuple[int, int] | None = None) -> np.ndarray:
    """Smooth value noise in [0, 1]. With `period` (cells), it tiles."""
    gh = int(math.ceil(h / cell)) + 2
    gw = int(math.ceil(w / cell)) + 2
    if period:
        gh, gw = period
    grid = rng.random((gh, gw))
    ys = np.arange(h) / cell
    xs = np.arange(w) / cell
    y0 = np.floor(ys).astype(int)
    x0 = np.floor(xs).astype(int)
    fy = ys - y0
    fx = xs - x0
    sy = fy * fy * (3 - 2 * fy)
    sx = fx * fx * (3 - 2 * fx)
    y1 = y0 + 1
    x1 = x0 + 1
    if period:
        y0 %= gh
        y1 %= gh
        x0 %= gw
        x1 %= gw
    a = grid[np.ix_(y0, x0)]
    b = grid[np.ix_(y0, x1)]
    c = grid[np.ix_(y1, x0)]
    d = grid[np.ix_(y1, x1)]
    top = a + (b - a) * sx[None, :]
    bot = c + (d - c) * sx[None, :]
    return top + (bot - top) * sy[:, None]


def fbm(h: int, w: int, cell: float, rng: np.random.Generator, octaves: int = 4, tile: int | None = None) -> np.ndarray:
    out = np.zeros((h, w))
    amp = 1.0
    total = 0.0
    c = cell
    for _ in range(octaves):
        period = None
        if tile:
            n = max(1, int(round(tile / c)))
            period = (n, n)
            c = tile / n
        out += amp * value_noise(h, w, c, rng, period)
        total += amp
        amp *= 0.5
        c /= 2
    return out / total


def voronoi(h: int, w: int, n: int, rng: np.random.Generator, tile: bool = False) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Cell id, distance to nearest seed, and edge distance (f2 - f1)."""
    pts = rng.random((n, 2)) * [w, h]
    yy, xx = np.mgrid[0:h, 0:w].astype(float)
    best = np.full((h, w), np.inf)
    second = np.full((h, w), np.inf)
    ids = np.zeros((h, w), dtype=int)
    offsets = [(0, 0)]
    if tile:
        offsets = [(ox, oy) for ox in (-w, 0, w) for oy in (-h, 0, h)]
    for i, (px, py) in enumerate(pts):
        for ox, oy in offsets:
            d = np.hypot(xx - (px + ox), yy - (py + oy))
            closer = d < best
            second = np.where(closer, best, np.minimum(second, d))
            ids = np.where(closer, i, ids)
            best = np.where(closer, d, best)
    return ids, best, second - best


# --------------------------------------------------------------------------- helpers


def shade(normal: np.ndarray, ambient: float = 0.42, diffuse: float = 0.78) -> np.ndarray:
    lam = np.clip((normal * LIGHT).sum(-1), 0, 1)
    return ambient + diffuse * lam


def normalize(v: np.ndarray) -> np.ndarray:
    return v / np.maximum(1e-6, np.linalg.norm(v, axis=-1, keepdims=True))


def to_image(rgb: np.ndarray, alpha: np.ndarray) -> Image.Image:
    a = np.clip(alpha, 0, 1)
    arr = np.dstack([np.clip(rgb, 0, 255), a * 255]).astype(np.uint8)
    img = Image.fromarray(arr, "RGBA")
    if SS > 1:
        img = img.resize((img.width // SS, img.height // SS), Image.LANCZOS)
    return img


def crop(img: Image.Image, pad: int = 4) -> tuple[Image.Image, tuple[int, int]]:
    bbox = img.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
    assert bbox, "empty prop"
    x0, y0, x1, y1 = bbox
    x0 = max(0, x0 - pad)
    y0 = max(0, y0 - pad)
    x1 = min(img.width, x1 + pad)
    y1 = min(img.height, y1 + pad)
    return img.crop((x0, y0, x1, y1)), (x0, y0)


def poly_mask(h: int, w: int, pts: list[tuple[float, float]]) -> np.ndarray:
    m = Image.new("L", (w, h), 0)
    ImageDraw.Draw(m).polygon(pts, fill=255)
    return np.asarray(m, dtype=float) / 255.0


def ellipse_mask(h: int, w: int, cx: float, cy: float, rx: float, ry: float) -> np.ndarray:
    m = Image.new("L", (w, h), 0)
    ImageDraw.Draw(m).ellipse((cx - rx, cy - ry, cx + rx, cy + ry), fill=255)
    return np.asarray(m, dtype=float) / 255.0


def over(dst_rgb: np.ndarray, dst_a: np.ndarray, rgb: np.ndarray, a: np.ndarray) -> None:
    a3 = a[..., None]
    dst_rgb[:] = rgb * a3 + dst_rgb * (1 - a3)
    dst_a[:] = a + dst_a * (1 - a)


# --------------------------------------------------------------------------- boulder


def rock_layer(
    h: int,
    w: int,
    cx: float,
    cy: float,
    rx: float,
    ry: float,
    rng: np.random.Generator,
    base: tuple[float, float, float],
    facets: int = 22,
    lichen: float = 0.25,
) -> tuple[np.ndarray, np.ndarray]:
    """One faceted rock blob in screen space. Returns rgb, alpha."""
    yy, xx = np.mgrid[0:h, 0:w].astype(float)
    dx = (xx - cx) / rx
    dy = (yy - cy) / ry
    theta = np.arctan2(dy, dx)
    # Ragged silhouette: low-frequency wobble in the radius by angle.
    k = rng.random(6) * 2 * math.pi
    wob = 1 + 0.10 * np.sin(2 * theta + k[0]) + 0.07 * np.sin(3 * theta + k[1]) + 0.05 * np.sin(5 * theta + k[2])
    # Flatten the base so the stone sits on the ground, not on a point.
    wob = np.where(dy > 0.55, wob * np.maximum(0.5, 1 - 0.35 * (dy - 0.55)), wob)
    r = np.hypot(dx, dy) / wob
    inside = np.clip((1.0 - r) * rx * 0.6, 0, 1)
    u = np.clip(r, 0, 0.999)
    nz = np.sqrt(1 - u * u)
    sphere = normalize(np.dstack([dx / wob, dy / wob * 0.9, nz * 1.15]))

    ids, _, edge = voronoi(h, w, facets, rng)
    tilt = rng.normal(0, 0.3, (facets, 3))
    tilt[:, 2] = np.abs(tilt[:, 2]) * 0.3
    seeds_n = sphere[np.clip((rng.random(facets) * h).astype(int), 0, h - 1), np.clip((rng.random(facets) * w).astype(int), 0, w - 1)]
    cell_n = normalize(seeds_n[ids] * 0.5 + tilt[ids] * 0.5)
    n = normalize(sphere * 0.72 + cell_n * 0.28)
    bump = fbm(h, w, 10 * SS, rng, 4)
    gy, gx = np.gradient(bump)
    n = normalize(n + np.dstack([-gx, -gy, np.zeros_like(gx)]) * 14)

    lit = shade(n)
    tone = 0.82 + 0.36 * fbm(h, w, 22 * SS, rng, 3)
    col = np.array(base)[None, None, :] * (lit * tone)[..., None]
    # Cracks along facet seams.
    crack = np.clip(1 - edge / (1.2 * SS), 0, 1) * (rng.random(facets)[ids] > 0.5)
    col *= (1 - 0.3 * crack)[..., None]
    # Lichen on the up-facing, lit side.
    up = np.clip(-n[..., 1] * 0.6 + n[..., 2] * 0.6, 0, 1)
    spots = (fbm(h, w, 7 * SS, rng, 3) > 0.62 - lichen * 0.2) * up * lichen * 2
    lich = np.array([118, 122, 72], float)
    col = col * (1 - spots[..., None] * 0.55) + lich * spots[..., None] * 0.55
    # Ground contact darkening on the lower rim.
    ao = np.clip((dy - 0.3) * 1.2, 0, 1) * (r > 0.55)
    col *= (1 - 0.35 * ao)[..., None]
    return col, inside


def render_boulder(seed: int) -> Image.Image:
    rng = np.random.default_rng(seed)
    w, h = 380 * SS, 300 * SS
    rgb = np.zeros((h, w, 3))
    a = np.zeros((h, w))
    base = (np.array([128, 122, 112]) * (0.92 + rng.random() * 0.14)).tolist()
    main_rx = (120 + rng.random() * 30) * SS
    main_ry = main_rx * (0.66 + rng.random() * 0.16)
    cx, cy = w * 0.5, h * 0.56
    parts = [(cx, cy, main_rx, main_ry)]
    # A smaller partner stone beside most boulders.
    if seed % 3 != 2:
        side = -1 if rng.random() < 0.5 else 1
        prx = main_rx * (0.4 + rng.random() * 0.15)
        parts.append((cx + side * main_rx * 0.95, cy + main_ry * 0.42, prx, prx * 0.7))
    parts.sort(key=lambda p: p[1])
    for px, py, prx, pry in parts:
        c, m = rock_layer(h, w, px, py, prx, pry, rng, base)
        over(rgb, a, c, m)
    return to_image(rgb, a)


def render_stones(seed: int) -> Image.Image:
    rng = np.random.default_rng(seed)
    w, h = 380 * SS, 220 * SS
    rgb = np.zeros((h, w, 3))
    a = np.zeros((h, w))
    n = 6 + int(rng.random() * 4)
    stones = []
    for _ in range(n):
        ang = rng.random() * 2 * math.pi
        rad = rng.random() ** 0.7
        sx = w * 0.5 + math.cos(ang) * rad * w * 0.34
        sy = h * 0.55 + math.sin(ang) * rad * h * 0.3
        rx = (16 + rng.random() * 30) * SS
        stones.append((sx, sy, rx, rx * (0.55 + rng.random() * 0.15)))
    stones.sort(key=lambda s: s[1])
    for sx, sy, rx, ry in stones:
        tone = 0.85 + rng.random() * 0.25
        warm = rng.random() * 14
        base = [122 * tone + warm, 116 * tone + warm * 0.6, 104 * tone]
        c, m = rock_layer(h, w, sx, sy, rx, ry, rng, base, facets=6, lichen=0.1)
        over(rgb, a, c, m)
    return to_image(rgb, a)


# --------------------------------------------------------------------------- stump


def render_stump(seed: int) -> Image.Image:
    rng = np.random.default_rng(seed)
    w, h = 300 * SS, 300 * SS
    rgb = np.zeros((h, w, 3))
    a = np.zeros((h, w))
    yy, xx = np.mgrid[0:h, 0:w].astype(float)
    cx = w * 0.5
    R = (78 + rng.random() * 16) * SS
    top_y = h * 0.42
    stem_h = (34 + rng.random() * 16) * SS
    base_y = top_y + stem_h
    bark = np.array([86, 66, 48], float)

    # Roots flare out at the base.
    for k in range(4 + int(rng.random() * 2)):
        ang = (k / 5 + rng.random() * 0.12) * 2 * math.pi
        ex = cx + math.cos(ang) * R * 1.25
        ey = base_y + math.sin(ang) * R * 0.55
        sx0 = cx + math.cos(ang + 0.6) * R * 0.85
        sy0 = base_y - stem_h * 0.25 + math.sin(ang + 0.6) * R * 0.4
        sx1 = cx + math.cos(ang - 0.6) * R * 0.85
        sy1 = base_y - stem_h * 0.25 + math.sin(ang - 0.6) * R * 0.4
        m = poly_mask(h, w, [(sx0, sy0), (ex, ey), (sx1, sy1)])
        lit = 0.62 + 0.35 * max(0.0, -math.cos(ang) * 0.6 - math.sin(ang) * 0.4)
        c = bark[None, None, :] * (lit * (0.8 + 0.3 * fbm(h, w, 5 * SS, rng, 2)))[..., None]
        over(rgb, a, c, m)

    # Side of the trunk: between the two ellipses.
    side = ((np.abs(xx - cx) <= R) & (yy >= top_y) & (yy <= base_y)).astype(float)
    side = np.maximum(side, ellipse_mask(h, w, cx, base_y, R, R * 0.5))
    across = np.clip((xx - cx) / R, -1, 1)
    nx = across
    nz = np.sqrt(1 - across * across)
    n = normalize(np.dstack([nx, np.zeros_like(nx) + 0.15, nz]))
    lit = shade(n, 0.38, 0.8)
    grain = fbm(h, w, 6 * SS, rng, 3)
    vert = value_noise(h, w, 3 * SS, rng)
    vert = np.repeat(vert[:1, :], h, axis=0)
    bark_tex = 0.7 + 0.35 * grain * 0.5 + 0.35 * vert * 0.5
    col = bark[None, None, :] * (lit * bark_tex)[..., None]
    furrow = (np.sin((xx / (7 * SS)) + grain * 6) > 0.75).astype(float)
    col *= (1 - 0.3 * furrow)[..., None]
    over(rgb, a, col, side)

    # Cut face on top.
    top = ellipse_mask(h, w, cx, top_y, R, R * 0.5)
    dx = (xx - cx) / R
    dy = (yy - top_y) / (R * 0.5)
    rr = np.hypot(dx, dy)
    wob = fbm(h, w, 14 * SS, rng, 2) * 0.12
    rings = 0.5 + 0.5 * np.sin((rr + wob) * 2 * math.pi * 9)
    wood = np.array([170, 138, 98], float)
    age = 0.62 + rng.random() * 0.2  # weathered grey cut
    grey = np.array([132, 124, 112], float)
    tone = wood * age + grey * (1 - age)
    col = tone[None, None, :] * (0.86 + 0.14 * rings)[..., None]
    col *= (0.9 + 0.2 * fbm(h, w, 5 * SS, rng, 3))[..., None]
    rim = np.clip((rr - 0.86) / 0.14, 0, 1)
    col = col * (1 - rim[..., None]) + bark * 0.75 * rim[..., None]
    # Radial check crack and a darker heart.
    ang = rng.random() * 2 * math.pi
    crack = poly_mask(
        h,
        w,
        [
            (cx, top_y),
            (cx + math.cos(ang - 0.05) * R * 0.85, top_y + math.sin(ang - 0.05) * R * 0.42),
            (cx + math.cos(ang + 0.05) * R * 0.85, top_y + math.sin(ang + 0.05) * R * 0.42),
        ],
    )
    col *= (1 - 0.45 * crack)[..., None]
    col *= (1 - 0.25 * np.clip(1 - rr / 0.18, 0, 1))[..., None]
    over(rgb, a, col, top)
    return to_image(rgb, a)


# --------------------------------------------------------------------------- signpost


def wood_fill(h: int, w: int, rng: np.random.Generator, base: np.ndarray, along: tuple[float, float]) -> np.ndarray:
    yy, xx = np.mgrid[0:h, 0:w].astype(float)
    ax, ay = along
    s = xx * ax + yy * ay
    t = -xx * ay + yy * ax
    warp = fbm(h, w, 18 * SS, rng, 2)
    grain = 0.5 + 0.5 * np.sin(t / (2.2 * SS) + warp * 9 + np.sin(s / (40 * SS)) * 1.5)
    fine = fbm(h, w, 3 * SS, rng, 2)
    tone = 0.78 + 0.16 * grain + 0.16 * fine
    stain = (fbm(h, w, 16 * SS, rng, 3) > 0.62).astype(float) * 0.18
    return base[None, None, :] * (tone - stain)[..., None]


def render_signpost(seed: int) -> Image.Image:
    rng = np.random.default_rng(seed)
    w, h = 300 * SS, 520 * SS
    rgb = np.zeros((h, w, 3))
    a = np.zeros((h, w))
    wood = np.array([150, 118, 82], float) * (0.85 + rng.random() * 0.1)
    grey = np.array([128, 120, 106], float)
    weather = 0.45 + rng.random() * 0.25
    plank = wood * (1 - weather) + grey * weather

    cx = w * 0.5
    foot = h * 0.94
    post_w = 15 * SS
    post_top = h * 0.12
    # Post: lit left face, shaded right face, a little cap.
    left = poly_mask(h, w, [(cx - post_w, post_top + post_w * 0.5), (cx, post_top + post_w), (cx, foot), (cx - post_w, foot - post_w * 0.5)])
    right = poly_mask(h, w, [(cx, post_top + post_w), (cx + post_w, post_top + post_w * 0.5), (cx + post_w, foot - post_w * 0.5), (cx, foot)])
    capm = poly_mask(h, w, [(cx - post_w, post_top + post_w * 0.5), (cx, post_top), (cx + post_w, post_top + post_w * 0.5), (cx, post_top + post_w)])
    post_wood = wood_fill(h, w, rng, plank, (0.0, 1.0))
    over(rgb, a, post_wood * 0.95, left)
    over(rgb, a, post_wood * 0.62, right)
    over(rgb, a, post_wood * 1.1, capm)
    # Earth darkening at the foot.
    yy = np.mgrid[0:h, 0:w][0].astype(float)
    rgb *= (1 - 0.35 * np.clip((yy - (foot - 40 * SS)) / (40 * SS), 0, 1) * (a > 0))[..., None]

    # Boards along the two iso axes: +x runs down-right (2,1), +y down-left (-2,1).
    # Odd seeds carry two boards (a crossing), even seeds one weathered board.
    first = 1 if rng.random() < 0.5 else -1
    boards = [(first, 0.24), (-first, 0.40)] if seed % 2 == 1 else [(first, 0.26)]
    for side, at in boards:
        ux, uy = 2 / math.sqrt(5) * side, 1 / math.sqrt(5)
        y0 = h * at
        length = (110 + rng.random() * 25) * SS
        bh = 40 * SS
        sx = cx + side * post_w * 0.6
        tip = 18 * SS
        ex = sx + ux * length
        ey = y0 + uy * length
        tilt = (rng.random() - 0.5) * 6 * SS
        pts = [
            (sx, y0),
            (ex, ey + tilt),
            (ex + ux * tip, ey + tilt + bh * 0.5 + uy * tip),
            (ex, ey + tilt + bh),
            (sx, y0 + bh),
        ]
        m = poly_mask(h, w, pts)
        face = wood_fill(h, w, rng, plank, (ux, uy))
        # Face toward the light on the left-hand board, away on the right.
        lit = 1.02 if side < 0 else 0.82
        over(rgb, a, face * lit, m)
        # Thin top edge of the board.
        edge = poly_mask(h, w, [(sx, y0), (ex, ey + tilt), (ex, ey + tilt + 4 * SS), (sx, y0 + 4 * SS)])
        over(rgb, a, face * 1.18, edge * 0.9)
        # Nail heads.
        for nx_, ny_ in [(sx + ux * 10 * SS, y0 + uy * 10 * SS + bh * 0.3), (sx + ux * 10 * SS, y0 + uy * 10 * SS + bh * 0.7)]:
            dot = ellipse_mask(h, w, nx_, ny_, 2.2 * SS, 2.2 * SS)
            over(rgb, a, np.broadcast_to(np.array([52, 46, 40], float), (h, w, 3)).copy(), dot)
    return to_image(rgb, a)


# --------------------------------------------------------------------------- rock ground


def render_rock_tex(seed: int, size: int = 384) -> Image.Image:
    rng = np.random.default_rng(seed)
    h = w = size
    ids, _, edge = voronoi(h, w, 38, rng, tile=True)
    cell_tone = 0.88 + 0.22 * rng.random(38)
    broad = fbm(h, w, 96, rng, 3, tile=size)
    mid = fbm(h, w, 24, rng, 3, tile=size)
    fine = fbm(h, w, 6, rng, 2, tile=size)
    grit = rng.random((h, w))
    base = np.array([108, 102, 92], float)
    tone = (cell_tone[ids] * 0.5 + (0.75 + 0.5 * mid) * 0.5) * (0.84 + 0.26 * broad)
    tone *= (0.86 + 0.28 * fine) * (0.9 + 0.2 * grit)
    # Cracks along some slab seams only, broken up by noise.
    broken = np.clip((fbm(h, w, 20, rng, 2, tile=size) - 0.42) * 4, 0, 1)
    crack = np.clip(1 - edge / 1.6, 0, 1) * broken
    tone *= 1 - 0.38 * crack
    # Pale grit flecks.
    tone += (grit > 0.985) * 0.25
    col = base[None, None, :] * tone[..., None]
    warm = (fbm(h, w, 48, rng, 2, tile=size) - 0.5) * 22
    col[..., 0] += warm
    col[..., 2] -= warm * 0.6
    return Image.fromarray(np.clip(col, 0, 255).astype(np.uint8), "RGB")


# --------------------------------------------------------------------------- main


def contact(img: Image.Image, kind: str) -> tuple[int, int]:
    """Source pixel that sits on the tile: bottom centre of the opaque mass."""
    alpha = np.asarray(img.getchannel("A"), dtype=float) / 255
    ys, xs = np.nonzero(alpha > 0.5)
    bottom = ys.max()
    band = ys > bottom - max(4, (bottom - ys.min()) * 0.12)
    cx = int(round(xs[band].mean()))
    if kind == "signpost":
        # The post foot, not the board overhang.
        col = alpha[:, :].sum(0)
        cx = int(np.argmax(col))
        return cx, int(bottom - 3)
    lift = {"boulder": 0.1, "stones": 0.25, "stump": 0.12}.get(kind, 0.1)
    return cx, int(bottom - (bottom - ys.min()) * lift)


JOBS = {
    "boulder": [(render_boulder, "boulder-1.png", 11), (render_boulder, "boulder-2.png", 23), (render_boulder, "boulder-3.png", 38)],
    "stones": [(render_stones, "stones-1.png", 5), (render_stones, "stones-2.png", 17)],
    "stump": [(render_stump, "stump-1.png", 7), (render_stump, "stump-2.png", 19)],
    "signpost": [(render_signpost, "signpost-1.png", 3), (render_signpost, "signpost-2.png", 8)],
}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="")
    ap.add_argument("--preview", action="store_true")
    args = ap.parse_args()
    only = {s for s in args.only.split(",") if s}
    shots: list[Image.Image] = []
    for kind, jobs in JOBS.items():
        if only and kind not in only:
            continue
        for fn, name, seed in jobs:
            img, _ = crop(fn(seed))
            img.save(OUT / name, optimize=True)
            cx, cy = contact(img, kind)
            print(f"{name}: {img.width}x{img.height} contact {cx},{cy}")
            shots.append(img)
    if not only or "rock" in only:
        tex = render_rock_tex(101)
        tex.save(OUT / "ground-rock.png", optimize=True)
        print(f"ground-rock.png: {tex.width}x{tex.height}")
    if args.preview and shots:
        PREVIEW.mkdir(exist_ok=True)
        W = sum(s.width for s in shots) + 10 * len(shots)
        H = max(s.height for s in shots)
        strip = Image.new("RGBA", (W, H), (255, 0, 255, 255))
        x = 0
        for s in shots:
            strip.alpha_composite(s, (x, H - s.height))
            x += s.width + 10
        strip.save(PREVIEW / "props.png")
        print(PREVIEW / "props.png")


if __name__ == "__main__":
    main()
