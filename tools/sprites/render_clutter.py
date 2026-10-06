#!/usr/bin/env python3
"""
Breakable map clutter — crates, oil drums, hay bales, a hand cart, a bench, a
woodpile, a tyre stack, and dustbins — each with the flattened wreck a tank
leaves after rolling over it or a shell leaves after landing on it.

Same camera, sun, and convex-solid renderer as the scrap dress in
`render_props.py`: 2:1 three-quarter view, light from the upper left, no
outline, no ground. One image per look, no facings; the client mirrors them.

Every prop is built at one world scale (a drum is 14 units tall), so a single
art-to-screen factor sizes the whole set. The contact pixel is the projected
world origin, i.e. the middle of the prop's footprint.

  python tools/sprites/render_clutter.py             # every prop
  python tools/sprites/render_clutter.py --only crates,cart
  python tools/sprites/render_clutter.py --preview   # contact strip on magenta

Prints the TypeScript registry lines for `render/sprites.ts`.
"""

from __future__ import annotations

import argparse
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import render_props as rp  # noqa: E402
from render_props import SS, Solid, ScrapCanvas, box, cylinder, rot  # noqa: E402

OUT = rp.ROOT / "gridlock/packages/client/src/assets/terrain/clutter"
PREVIEW = HERE / "preview"

# Screen pixels per source pixel in game: a 14-unit drum stands about as tall as a crouching man.
SCREEN_PER_ART = 0.16

rp.SCRAP_PAINT.update(
    {
        "plank": (166, 132, 90),
        "plank_old": (138, 120, 96),
        "plank_dark": (104, 80, 56),
        "straw": (196, 170, 98),
        "straw_dark": (150, 124, 66),
        "bark": (92, 70, 50),
        "log_end": (190, 156, 108),
        "blue": (52, 80, 112),
        "green": (64, 96, 62),
        "zinc": (138, 142, 140),
        "iron": (54, 54, 56),
    }
)


def canvas(seed: int) -> ScrapCanvas:
    return ScrapCanvas(220, 190, 3.2, seed)


def finish(cv: ScrapCanvas) -> tuple[Image.Image, tuple[float, float]]:
    """Downsampled image and the world origin's pixel in it (before crop)."""
    return cv.image(), (cv.ox / SS, cv.oy / SS)


# --------------------------------------------------------------------------- parts


def crate(c, size: float, yaw: float, paint: str) -> list[Solid]:
    """Slatted crate: a body with a darker frame band round each vertical edge and the lid rim."""
    m = rot(yaw)
    s = size
    out = [box((c[0], c[1], c[2] + s / 2), (s, s, s), m, paint, 0.0)]
    t = 1.3
    for sx in (-1, 1):
        for sy in (-1, 1):
            off = m @ np.array([sx * (s / 2 - t / 2 + 0.25), sy * (s / 2 - t / 2 + 0.25), 0])
            out.append(box((c[0] + off[0], c[1] + off[1], c[2] + s / 2), (t + 0.3, t + 0.3, s + 0.2), m, "plank_dark", 0.0))
    return out


def drum(c, paint: str, yaw: float, lying: bool = False, squash: float = 1.0, rust: float = 0.35) -> list[Solid]:
    if lying:
        m = rot(yaw) @ rot(0, math.pi / 2)
        return [cylinder((c[0], c[1], c[2] + 5 * squash), 5, 14, m @ np.diag([1, squash, 1]), paint, rust)]
    m = rot(yaw)
    out = [cylinder((c[0], c[1], c[2] + 7), 5, 14, m, paint, rust)]
    # Rolling hoops.
    for z in (4.2, 9.8):
        out.append(cylinder((c[0], c[1], c[2] + z), 5.25, 0.8, m, paint, rust + 0.2))
    return out


def tyre(c, yaw: float, pitch: float = 0.0, roll: float = 0.0) -> list[Solid]:
    m = rot(yaw, pitch, roll)
    return [cylinder((c[0], c[1], c[2] + 2.2), 8.0, 4.4, m, "rubber", 0.0, sides=18)]


def log(c, length: float, r: float, yaw: float) -> list[Solid]:
    m = rot(yaw) @ rot(0, math.pi / 2)
    return [cylinder((c[0], c[1], c[2] + r), r, length, m, "bark", 0.0, sides=10)]


def shards(rng: np.random.Generator, paints: list[str], n: int, spread: float, size: tuple[float, float]) -> list[Solid]:
    """Loose splinters and plates lying flat, a little tilted."""
    out: list[Solid] = []
    for _ in range(n):
        ang = rng.random() * 2 * math.pi
        r = rng.random() ** 0.6 * spread
        c = (math.cos(ang) * r, math.sin(ang) * r * 0.9, 0.0)
        ln = size[0] + rng.random() * (size[1] - size[0])
        m = rot(rng.random() * math.pi, rng.normal(0, 0.12), rng.normal(0, 0.18))
        paint = paints[int(rng.integers(0, len(paints)))]
        out.append(box((c[0], c[1], 0.6), (ln, 1.6 + rng.random() * 1.6, 0.9), m, paint, 0.0))
    return out


# --------------------------------------------------------------------------- props


def r_crates(seed: int, broken: bool):
    rng = np.random.default_rng(seed)
    cv = canvas(seed)
    if broken:
        s = shards(rng, ["plank", "plank", "plank_old", "plank_dark"], 22, 14, (4, 11))
        s += crate((-3, 3, 0), 9, 0.4, "plank_old")[:1]
        cv.draw_all(s)
    else:
        s = crate((-4, 2, 0), 12, 0.15, "plank")
        s += crate((7, -6, 0), 10, -0.2, "plank_old")
        s += crate((-4, 2, 12), 9, 0.55, "plank")
        cv.draw_all(s)
    return finish(cv)


def r_barrels(seed: int, broken: bool):
    rng = np.random.default_rng(seed)
    cv = canvas(seed)
    if broken:
        s = drum((-2, 2, 0), "red", 0.7, lying=True, squash=0.45, rust=0.6)
        s += drum((8, -5, 0), "blue", 2.1, lying=True, squash=0.55, rust=0.5)
        s += shards(rng, ["red", "blue", "rust"], 8, 14, (3, 7))
        cv.draw_all(s)
    else:
        s = drum((-4, 3, 0), "red", 0.2)
        s += drum((6, -4, 0), "blue", 0.9)
        s += drum((6, 7, 0), "olive", 1.6, rust=0.55)
        cv.draw_all(s)
    return finish(cv)


def r_haybale(seed: int, broken: bool):
    rng = np.random.default_rng(seed)
    cv = canvas(seed)
    if broken:
        s = shards(rng, ["straw", "straw", "straw_dark"], 46, 16, (3, 8))
        cv.draw_all(s)
    else:
        m = rot(0.5) @ rot(0, math.pi / 2)
        s = [cylinder((0, 0, 8), 8, 12, m, "straw", 0.0, sides=20)]
        s += [cylinder((0, 0, 8), 8.15, 1.0, m, "straw_dark", 0.0, sides=20)]
        m2 = rot(1.9) @ rot(0, math.pi / 2)
        s += [cylinder((13, -9, 7), 7, 11, m2, "straw_dark", 0.0, sides=20)]
        cv.draw_all(s)
    return finish(cv)


def r_cart(seed: int, broken: bool):
    rng = np.random.default_rng(seed)
    cv = canvas(seed)
    yaw = 0.35
    m = rot(yaw)
    if broken:
        s = shards(rng, ["plank", "plank_old", "plank_dark"], 18, 15, (5, 13))
        s += tyre((7, 6, -1.4), 0.3, 0.05, 0.1)[:0]
        wm = rot(1.1, 0.1, 0.0)
        s += [cylinder((-8, 5, 0.6), 6, 1.2, wm, "plank_dark", 0.0, sides=14)]
        cv.draw_all(s)
    else:
        def at(x, y, z):
            o = m @ np.array([x, y, z])
            return (o[0], o[1], o[2])

        s: list[Solid] = []
        # Two spoked wheels, axle across local y.
        wm = m @ rot(0, 0, math.pi / 2)
        for side in (-1, 1):
            s.append(cylinder(at(0, side * 9, 6), 6, 1.2, wm, "plank_dark", 0.0, sides=14))
            s.append(cylinder(at(0, side * 9.8, 6), 1.4, 1.2, wm, "iron", 0.0, sides=8))
        # Bed and low sides.
        s.append(box(at(1, 0, 8), (20, 16, 1.4), m, "plank", 0.0))
        for side in (-1, 1):
            s.append(box(at(1, side * 7.6, 10.4), (20, 0.9, 3.6), m, "plank_old", 0.0))
        s.append(box(at(11, 0, 10.4), (0.9, 16, 3.6), m, "plank_old", 0.0))
        s.append(box(at(-9, 0, 10.4), (0.9, 16, 3.6), m, "plank_old", 0.0))
        # Shafts down to the ground in front.
        hm = m @ rot(0, 0.32)
        for side in (-1, 1):
            s.append(box(at(-17, side * 5, 4.5), (16, 1.1, 1.1), hm, "plank_dark", 0.0))
        # A sack in the bed.
        s.append(box(at(3, -2, 11), (8, 6, 3.5), m @ rot(0.4), "sand", 0.0))
        cv.draw_all(s)
    return finish(cv)


def r_bench(seed: int, broken: bool):
    rng = np.random.default_rng(seed)
    cv = canvas(seed)
    m = rot(-0.45)
    if broken:
        s = shards(rng, ["green", "green", "iron"], 14, 14, (6, 14))
        cv.draw_all(s)
    else:
        def at(x, y, z):
            o = m @ np.array([x, y, z])
            return (o[0], o[1], o[2])

        s: list[Solid] = []
        for x in (-10, 10):
            s.append(box(at(x, 0, 3), (1.4, 7, 6), m, "iron", 0.0))
            s.append(box(at(x, 3.4, 8), (1.4, 1.2, 9), m, "iron", 0.0))
        for k in range(3):
            s.append(box(at(0, -2.4 + k * 2.2, 6.4), (24, 1.8, 0.8), m, "green", 0.0))
        for k in range(2):
            s.append(box(at(0, 3.6, 9.4 + k * 2.6), (24, 0.8, 1.8), m, "green", 0.0))
        cv.draw_all(s)
    return finish(cv)


def r_woodpile(seed: int, broken: bool):
    rng = np.random.default_rng(seed)
    cv = canvas(seed)
    yaw = 0.25
    m = rot(yaw)
    if broken:
        s: list[Solid] = []
        for _ in range(9):
            ang = rng.random() * 2 * math.pi
            r = rng.random() ** 0.5 * 13
            s += log((math.cos(ang) * r, math.sin(ang) * r, 0), 9 + rng.random() * 6, 1.6 + rng.random() * 0.5, rng.random() * math.pi)
        s += shards(rng, ["plank", "log_end"], 10, 14, (2, 5))
        cv.draw_all(s)
    else:
        s: list[Solid] = []
        r = 2.1
        for row, n in enumerate((5, 4, 3)):
            for k in range(n):
                y = (k - (n - 1) / 2) * r * 2
                o = m @ np.array([0, y, 0])
                s += log((o[0], o[1], row * r * 1.75), 16, r, yaw)
        cv.draw_all(s)
    return finish(cv)


def r_tires(seed: int, broken: bool):
    rng = np.random.default_rng(seed)
    cv = canvas(seed)
    if broken:
        s = tyre((-5, 3, -1.2), 0.4, 0.05, 0.06)
        s += tyre((7, -3, -1.2), 1.4, -0.06, 0.04)
        s += tyre((3, 10, -1.2), 2.2, 0.04, -0.05)
        s += shards(rng, ["rubber"], 8, 14, (2, 6))
        cv.draw_all(s)
    else:
        s: list[Solid] = []
        for k in range(4):
            s += tyre((rng.normal(0, 0.5), rng.normal(0, 0.5), k * 4.4), rng.random() * math.pi)
        s += tyre((11, -8, 6), 0.9, 0.0, math.pi / 2 - 0.35)
        cv.draw_all(s)
    return finish(cv)


def r_bins(seed: int, broken: bool):
    rng = np.random.default_rng(seed)
    cv = canvas(seed)
    if broken:
        m = rot(0.8) @ rot(0, math.pi / 2)
        s = [cylinder((-2, 3, 3.6), 4.8, 11, m @ np.diag([1, 0.7, 1]), "zinc", 0.2)]
        s += [cylinder((8, -6, 0.5), 5.4, 0.8, rot(0.2, 0.25, 0.1), "zinc", 0.2)]
        s += shards(rng, ["rubber", "plank_old", "sand", "zinc"], 16, 14, (2, 5))
        cv.draw_all(s)
    else:
        s: list[Solid] = []
        for c, lid in (((-5, 3, 0), True), ((6, -4, 0), False)):
            m = rot(rng.random())
            s.append(cylinder((c[0], c[1], c[2] + 6), 4.8, 12, m, "zinc", 0.15))
            s.append(cylinder((c[0], c[1], c[2] + 3), 5.0, 0.8, m, "zinc", 0.25))
            s.append(cylinder((c[0], c[1], c[2] + 9), 5.0, 0.8, m, "zinc", 0.25))
            if lid:
                s.append(cylinder((c[0], c[1], c[2] + 12.4), 5.3, 0.8, m, "zinc", 0.1))
                s.append(cylinder((c[0], c[1], c[2] + 13.3), 1.2, 1.0, m, "iron", 0.0))
        s.append(cylinder((12, 7, 0.4), 5.3, 0.8, rot(0.3, 0.2, 0.15), "zinc", 0.1))
        cv.draw_all(s)
    return finish(cv)


JOBS = {
    "crates": (r_crates, 31),
    "barrels": (r_barrels, 32),
    "haybale": (r_haybale, 33),
    "cart": (r_cart, 34),
    "bench": (r_bench, 35),
    "woodpile": (r_woodpile, 36),
    "tires": (r_tires, 37),
    "bins": (r_bins, 38),
}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="")
    ap.add_argument("--preview", action="store_true")
    args = ap.parse_args()
    only = {s for s in args.only.split(",") if s}
    OUT.mkdir(parents=True, exist_ok=True)
    shots: list[Image.Image] = []
    lines: list[str] = []
    for kind, (fn, seed) in JOBS.items():
        if only and kind not in only:
            continue
        for broken in (False, True):
            img, (ox, oy) = fn(seed, broken)
            img, (x0, y0) = rp.crop(img)
            name = f"{kind}{'-broken' if broken else ''}.png"
            img.save(OUT / name, optimize=True)
            cx, cy = ox - x0, oy - y0
            draw_h = img.height * SCREEN_PER_ART
            print(f"{name}: {img.width}x{img.height} contact {cx:.1f},{cy:.1f} drawH {draw_h:.1f}")
            lines.append(f'  {kind}{"Broken" if broken else ""}: [{cx:.1f}, {cy:.1f}, {draw_h:.1f}],')
            shots.append(img)
    print("\n".join(lines))
    if args.preview and shots:
        PREVIEW.mkdir(exist_ok=True)
        W = sum(s.width for s in shots) + 10 * len(shots)
        H = max(s.height for s in shots)
        strip = Image.new("RGBA", (W, H), (255, 0, 255, 255))
        x = 0
        for s in shots:
            strip.alpha_composite(s, (x, H - s.height))
            x += s.width + 10
        strip.save(PREVIEW / "clutter.png")
        print(PREVIEW / "clutter.png")


if __name__ == "__main__":
    main()
