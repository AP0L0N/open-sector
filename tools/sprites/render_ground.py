"""Seamless ground textures for the terrain atlas, drawn from noise.

The ground shader (`terrain-light-gl.ts`) samples these at one texel per atlas
pixel, so every feature here is at screen scale: a rifleman stands about 20 px
tall, a fine tile is 16 x 8 px. The old photo textures had blades 10-15 px long,
which read as giant grass once a field was more than a few tiles across. Here
the grain is 1-3 px, with slow clump and moisture variation on top, and the
shader adds its own macro breakup so a 32-tile repeat never shows.

Everything wraps by construction: the noise is periodic (random-phase spectrum
through an inverse FFT) and every stroke is drawn at its position modulo the
tile. The palette is deliberately dark and desaturated: a cold, overcast front.

    python3 tools/sprites/render_ground.py                   # writes every texture
    python3 tools/sprites/render_ground.py --only grass-tall  # one texture
    python3 tools/sprites/render_ground.py --preview /tmp/g  # also 2x2 tiled checks per texture
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "gridlock/packages/client/src/assets/terrain"
SIZE = 512

# --- noise ---------------------------------------------------------------------


def fbm(rng: np.random.Generator, size: int, beta: float, aniso: float = 1.0, cutoff: float = 0.0) -> np.ndarray:
    """Periodic fractal noise in 0..1. `beta` is the spectral slope (2 = smooth
    clouds, 1 = rough grain). `aniso` > 1 stretches features horizontally, the
    way a flat plane foreshortens in the 2:1 view. `cutoff` (cycles per tile)
    removes slower variation than that, for grain without blotches."""
    fy = np.fft.fftfreq(size)[:, None] * size
    fx = np.fft.fftfreq(size)[None, :] * size / aniso
    f = np.sqrt(fx * fx + fy * fy)
    f[0, 0] = 1.0
    amp = f ** (-beta)
    if cutoff > 0:
        amp = amp * (1.0 / (1.0 + np.exp(-(f - cutoff) / max(1.0, cutoff * 0.25))))
    amp[0, 0] = 0.0
    phase = rng.uniform(0, 2 * np.pi, (size, size))
    spec = amp * np.exp(1j * phase)
    n = np.real(np.fft.ifft2(spec))
    n = (n - n.mean()) / (n.std() + 1e-9)
    return np.clip(n * 0.22 + 0.5, 0, 1)


def smoothstep(e0: float, e1: float, x: np.ndarray) -> np.ndarray:
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def rgb(h: str) -> np.ndarray:
    return np.array([int(h[i : i + 2], 16) for i in (1, 3, 5)], float)


def mix(a: np.ndarray, b: np.ndarray, t: np.ndarray | float) -> np.ndarray:
    t = np.asarray(t, float)
    if t.ndim == 2:
        t = t[..., None]
    return a + (b - a) * t


def ramp(stops: list[tuple[float, str]], t: np.ndarray) -> np.ndarray:
    """Piecewise-linear colour ramp over t in 0..1."""
    out = np.zeros(t.shape + (3,), float)
    cols = [rgb(c) for _, c in stops]
    pos = [p for p, _ in stops]
    out[...] = cols[0]
    for i in range(1, len(stops)):
        w = np.clip((t - pos[i - 1]) / max(1e-6, pos[i] - pos[i - 1]), 0, 1)
        seg = (t >= pos[i - 1]) & (t <= pos[i]) if i < len(stops) - 1 else t >= pos[i - 1]
        out = np.where(seg[..., None], mix(cols[i - 1], cols[i], w), out)
    return out


# --- strokes (wrap-around) -----------------------------------------------------


def stroke_layer(
    rng: np.random.Generator,
    size: int,
    count: int,
    length: tuple[float, float],
    angle: tuple[float, float],
    width: int = 1,
    curl: float = 0.0,
) -> np.ndarray:
    """Alpha mask (0..1) of `count` short strokes, each wrapped at the edges.
    Angles in radians from screen-right, clockwise. `curl` bends each stroke."""
    img = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(img)
    for _ in range(count):
        x = rng.uniform(0, size)
        y = rng.uniform(0, size)
        ln = rng.uniform(*length)
        a = rng.uniform(*angle)
        steps = 4 if curl else 1
        sign = rng.choice([-1.0, 1.0])
        pts = [(x, y)]
        aa = a
        for _k in range(steps):
            aa += curl / steps * sign
            px, py = pts[-1]
            pts.append((px + np.cos(aa) * ln / steps, py + np.sin(aa) * ln / steps))
        for ox in (-size, 0, size):
            for oy in (-size, 0, size):
                d.line([(px + ox, py + oy) for px, py in pts], fill=255, width=width)
    return np.asarray(img, float) / 255.0


def speck_layer(rng: np.random.Generator, size: int, count: int, radius: tuple[float, float]) -> np.ndarray:
    img = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(img)
    for _ in range(count):
        x = rng.uniform(0, size)
        y = rng.uniform(0, size)
        r = rng.uniform(*radius)
        for ox in (-size, 0, size):
            for oy in (-size, 0, size):
                d.ellipse([x + ox - r, y + oy - r * 0.6, x + ox + r, y + oy + r * 0.6], fill=255)
    return np.asarray(img, float) / 255.0


# --- surfaces ------------------------------------------------------------------


def grass(seed: int, palette: list[tuple[float, str]], dead: str, dead_amt: float, blade: tuple[float, float]) -> np.ndarray:
    rng = np.random.default_rng(seed)
    s = SIZE
    # Slow moisture and clumping decide the base tone.
    moist = fbm(rng, s, 2.2, aniso=1.8)
    clump = fbm(rng, s, 1.6, aniso=1.6)
    base = ramp(palette, np.clip(moist * 0.7 + clump * 0.3, 0, 1))
    # Worn, dead patches where the clumps thin out.
    worn = smoothstep(0.62, 0.8, 1 - clump) * dead_amt
    base = mix(base, rgb(dead), worn)
    # Fine blade grain: rough, horizontally stretched noise at screen scale.
    grain = fbm(rng, s, 0.9, aniso=2.2, cutoff=22)
    base = base * (0.74 + grain * 0.52)[..., None]
    # Individual blades catching light or shadow.
    lit = stroke_layer(rng, s, 9000, blade, (-1.95, -1.2), 1)
    dark = stroke_layer(rng, s, 7500, blade, (-1.95, -1.2), 1)
    base = mix(base, base * 1.32 + 14, lit * 0.7)
    base = mix(base, base * 0.6, dark * 0.75)
    # Dead stalks and clover heads: the odd pale or dark fleck.
    base = mix(base, rgb(dead) * 1.25, speck_layer(rng, s, 500, (0.4, 0.9)) * 0.6)
    base = mix(base, base * 0.55, speck_layer(rng, s, 700, (0.4, 0.9)) * 0.6)
    # Moss shadow in the hollows of the clump field.
    base = base * (0.9 + 0.2 * smoothstep(0.3, 0.75, clump))[..., None]
    return base


def grass_tall(seed: int) -> np.ndarray:
    rng = np.random.default_rng(seed)
    s = SIZE
    moist = fbm(rng, s, 2.0, aniso=1.8)
    clump = fbm(rng, s, 1.5, aniso=1.4)
    base = ramp([(0, "#2a3320"), (0.45, "#3d4a2a"), (0.8, "#5a6238"), (1, "#6e6f42")], np.clip(moist * 0.6 + clump * 0.4, 0, 1))
    grain = fbm(rng, s, 1.0, aniso=1.6, cutoff=14)
    base = base * (0.8 + grain * 0.4)[..., None]
    # Long stalks, bent one way by the wind, laid flat in the iso view.
    wind = -1.35
    stalks_dark = stroke_layer(rng, s, 3600, (5, 11), (wind - 0.35, wind + 0.35), 1, curl=0.25)
    stalks_lit = stroke_layer(rng, s, 2600, (4, 9), (wind - 0.3, wind + 0.3), 1, curl=0.25)
    base = mix(base, base * 0.62, stalks_dark * 0.7)
    base = mix(base, base * 1.3 + 14, stalks_lit * 0.6)
    # Pale seed heads at the stalk tips.
    heads = speck_layer(rng, s, 900, (0.7, 1.4))
    base = mix(base, rgb("#8d8a5c"), heads * 0.55)
    # Deep shade under the thickest stand.
    base = base * (1.0 - 0.22 * smoothstep(0.55, 0.85, clump))[..., None]
    return base


def dirt(seed: int) -> np.ndarray:
    rng = np.random.default_rng(seed)
    s = SIZE
    damp = fbm(rng, s, 2.1, aniso=1.6)
    base = ramp([(0, "#2f261c"), (0.4, "#4a3b2b"), (0.75, "#5c4b36"), (1, "#6a583f")], damp)
    grit = fbm(rng, s, 1.0, aniso=1.4, cutoff=18)
    base = base * (0.8 + grit * 0.4)[..., None]
    # Pebbles and clods: a lit top and a shadow under each.
    shadow = speck_layer(rng, s, 1400, (0.8, 2.2))
    pebbles = speck_layer(np.random.default_rng(seed + 1), s, 1400, (0.8, 2.2))
    base = mix(base, base * 0.6, np.roll(shadow, (1, 1), (0, 1)) * 0.7)
    base = mix(base, base * 1.22 + 8, pebbles * 0.5)
    # Faint ruts running with the ground's long axis.
    ruts = stroke_layer(rng, s, 90, (40, 120), (-0.55, -0.4), 2)
    base = mix(base, base * 0.8, ruts * 0.35)
    # Dark wet pockets.
    base = base * (1.0 - 0.25 * smoothstep(0.68, 0.9, damp))[..., None]
    return base


def sand(seed: int) -> np.ndarray:
    rng = np.random.default_rng(seed)
    s = SIZE
    dune = fbm(rng, s, 2.3, aniso=2.0)
    base = ramp([(0, "#5e5240"), (0.5, "#7a6b50"), (1, "#8d7d5c")], dune)
    grain = fbm(rng, s, 0.8, aniso=1.2, cutoff=30)
    base = base * (0.86 + grain * 0.28)[..., None]
    # Wind ripples: a sine wave bent by slow noise, lit from the north-west.
    yy, xx = np.mgrid[0:s, 0:s].astype(float)
    # Whole cycles across the tile on both axes keep the wrap exact; noise bends the crests.
    bend = (fbm(rng, s, 2.4, aniso=1.5) - 0.5) * 2.5
    phase = 2 * np.pi * ((yy * 56 + xx * 9) / s + bend)
    ripple = np.sin(phase) * (0.6 + 0.4 * np.sin(phase * 2 + 1.0))
    amp = smoothstep(0.5, 0.75, fbm(rng, s, 2.0, aniso=2.0)) * 0.09
    base = base * (1.0 + ripple * amp)[..., None]
    # Scattered dark grit and shell flecks.
    grit2 = speck_layer(rng, s, 700, (0.5, 1.1))
    base = mix(base, base * 0.6, grit2 * 0.6)
    pale = speck_layer(np.random.default_rng(seed + 2), s, 300, (0.5, 1.0))
    base = mix(base, rgb("#a39473"), pale * 0.5)
    return base


def stones(seed: int) -> np.ndarray:
    rng = np.random.default_rng(seed)
    s = SIZE
    # Dirt between the stones.
    earth = dirt(seed + 7) * 0.82
    img = Image.fromarray(np.clip(earth, 0, 255).astype(np.uint8))
    d = ImageDraw.Draw(img, "RGBA")
    n = 3200
    xs = rng.uniform(0, s, n)
    ys = rng.uniform(0, s, n)
    rs = 1.0 + rng.exponential(1.1, n).clip(0, 4.5)
    tones = rng.uniform(0, 1, n) ** 1.6
    order = np.argsort(rs)  # small first so the big ones sit on top
    for k in order:
        x, y, r, t = xs[k], ys[k], rs[k], tones[k]
        ry = r * 0.55
        g = rgb("#3a3733") * (1 - t) + rgb("#857e72") * t
        body = tuple(int(v) for v in g)
        lit = tuple(int(min(255, v * 1.28 + 10)) for v in g)
        for ox in (-s, 0, s):
            for oy in (-s, 0, s):
                cx, cy = x + ox, y + oy
                d.ellipse([cx - r + 1, cy - ry + 1.2, cx + r + 1, cy + ry + 1.2], fill=(14, 12, 10, 150))
                d.ellipse([cx - r, cy - ry, cx + r, cy + ry], fill=body + (235,))
                d.ellipse([cx - r * 0.55 - r * 0.2, cy - ry * 0.55 - ry * 0.3, cx + r * 0.55 - r * 0.2, cy + ry * 0.55 - ry * 0.3], fill=lit + (110,))
    out = np.asarray(img, float)
    # Dust the whole field with grain so the pebbles do not read as clip art.
    grain = fbm(rng, s, 1.0, aniso=1.3, cutoff=24)
    return out * (0.88 + grain * 0.24)[..., None]


def swamp(seed: int) -> np.ndarray:
    rng = np.random.default_rng(seed)
    s = SIZE
    wet = fbm(rng, s, 2.4, aniso=1.9)
    algae = fbm(rng, s, 1.8, aniso=1.5)
    mud = ramp([(0, "#1f2419"), (0.5, "#2f3324"), (1, "#3d4028")], algae)
    grain = fbm(rng, s, 1.0, aniso=1.8, cutoff=16)
    mud = mud * (0.82 + grain * 0.36)[..., None]
    # Standing water in the hollows: dark, with a faint sky sheen and scum at the rim.
    pool = smoothstep(0.5, 0.6, wet)
    rim = smoothstep(0.42, 0.51, wet) * (1 - pool)
    water = mix(rgb("#101a1a"), rgb("#2a4340"), fbm(rng, s, 2.0, aniso=3.0))
    sheen = fbm(rng, s, 1.4, aniso=4.0, cutoff=6)
    water = water * (0.85 + sheen * 0.5)[..., None]
    out = mix(mud, water, pool)
    out = mix(out, rgb("#58682f"), rim * 0.7 * (0.4 + algae))
    # Duckweed flecks on the pools, reeds along the edges.
    weed = speck_layer(rng, s, 1800, (0.4, 1.0)) * pool
    out = mix(out, rgb("#5f7334"), weed * 0.7)
    reeds = stroke_layer(rng, s, 1500, (3, 8), (-1.75, -1.4), 1) * np.clip(rim * 2 + (1 - pool) * 0.35, 0, 1)
    out = mix(out, rgb("#56552f"), reeds * 0.6)
    reeds_dark = stroke_layer(rng, s, 1100, (3, 7), (-1.75, -1.4), 1) * (1 - pool)
    out = mix(out, out * 0.6, reeds_dark * 0.6)
    return out


SURFACES = {
    # Cold, overcast meadow: the default ground.
    "grass-meadow": lambda: grass(11, [(0, "#242d1c"), (0.4, "#34422a"), (0.75, "#44522f"), (1, "#515c35")], "#4e4a30", 0.45, (1.5, 3.5)),
    # Sun-bleached, trodden: the dry channel.
    "grass-dry": lambda: grass(23, [(0, "#3b3a25"), (0.4, "#525032"), (0.75, "#66623c"), (1, "#767046")], "#5d5438", 0.5, (1.5, 3.5)),
    # Low ground near water: the damp channel.
    "grass-damp": lambda: grass(37, [(0, "#1b2619"), (0.4, "#263522"), (0.75, "#30432a"), (1, "#3a4c2f")], "#2f3a28", 0.3, (1.5, 3.0)),
    "grass-tall": lambda: grass_tall(41),
    "ground-dirt": lambda: dirt(53),
    "ground-sand": lambda: sand(67),
    "ground-stones": lambda: stones(71),
    "ground-swamp": lambda: swamp(83),
}


def seam_score(img: np.ndarray) -> float:
    a = img.astype(float)
    inner = (np.abs(np.diff(a, axis=0)).mean() + np.abs(np.diff(a, axis=1)).mean()) / 2
    edge = (np.abs(a[0] - a[-1]).mean() + np.abs(a[:, 0] - a[:, -1]).mean()) / 2
    return edge / inner


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", action="append", help="texture name(s) to write")
    ap.add_argument("--preview", type=Path, help="directory for 2x2 tiled check images")
    ap.add_argument("--out", type=Path, default=OUT)
    args = ap.parse_args()
    names = args.only or list(SURFACES)
    for name in names:
        arr = SURFACES[name]()
        img = np.clip(np.round(arr), 0, 255).astype(np.uint8)
        args.out.mkdir(parents=True, exist_ok=True)
        Image.fromarray(img).save(args.out / f"{name}.png", optimize=True)
        print(f"{name}: mean {img.reshape(-1, 3).mean(0).round(1)} seam {seam_score(img):.2f}")
        if args.preview:
            args.preview.mkdir(parents=True, exist_ok=True)
            Image.fromarray(np.tile(img, (2, 2, 1))).save(args.preview / f"{name}-tiled.png")


if __name__ == "__main__":
    main()
