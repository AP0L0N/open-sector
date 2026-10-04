"""Seamless water texture for the terrain atlas.

The canvas repeats the water image edge to edge (`ctx.createPattern(img, "repeat")`),
so every part of it must wrap: noise is built in frequency space (periodic by
construction) and ripple rings use toroidal distance, so a ring that leaves one
edge comes back on the opposite one. No gradient, no vignette.

    python3 tools/sprites/render_water.py            # writes water.png and water-b.png
    python3 tools/sprites/render_water.py --preview  # also writes a 3x3 tiled check
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "gridlock/packages/client/src/assets/terrain"
SIZE = 512

# Palette locked to the old photo crop's mean (72, 84, 75): dark teal-green pond.
DEEP = np.array([58.0, 71.0, 66.0])
SHALLOW = np.array([80.0, 96.0, 90.0])
GLINT = np.array([150.0, 170.0, 165.0])


def periodic_noise(rng: np.random.Generator, n: int, lo: float, hi: float, aspect: float = 1.0) -> np.ndarray:
    """Band-limited noise that tiles exactly: white noise filtered in the FFT domain."""
    white = rng.standard_normal((n, n))
    fy = np.fft.fftfreq(n)[:, None] * n
    fx = np.fft.fftfreq(n)[None, :] * n
    f = np.sqrt((fx * aspect) ** 2 + fy**2)
    band = np.exp(-((np.log2(np.maximum(f, 1e-6)) - np.log2((lo * hi) ** 0.5)) ** 2) / (2 * (np.log2(hi / lo) / 2.5) ** 2))
    band[0, 0] = 0
    out = np.real(np.fft.ifft2(np.fft.fft2(white) * band))
    return (out - out.mean()) / (out.std() + 1e-9)


def wrap_delta(a: np.ndarray, c: float, n: int) -> np.ndarray:
    return (a - c + n / 2) % n - n / 2


def ripples(rng: np.random.Generator, n: int, count: int) -> np.ndarray:
    """Embossed concentric rings, wrapped on the torus. Returns signed shading."""
    yy, xx = np.mgrid[0:n, 0:n].astype(float)
    acc = np.zeros((n, n))
    for _ in range(count):
        cx, cy = rng.uniform(0, n, 2)
        rmax = rng.uniform(n * 0.06, n * 0.2)
        wave = rng.uniform(5.0, 8.0)
        amp = rng.uniform(0.5, 1.0)
        dx = wrap_delta(xx, cx, n)
        # Flatten the rings vertically a little: the ground is seen at 2:1 iso.
        dy = wrap_delta(yy, cy, n) * 1.6
        r = np.sqrt(dx * dx + dy * dy)
        env = np.clip(1 - r / rmax, 0, 1) ** 1.5 * np.clip(r / (wave * 1.5), 0, 1)
        # sin gives the light/dark pair that reads as a raised ring.
        acc += amp * env * np.sin(2 * np.pi * r / wave)
    return acc


def render(seed: int) -> np.ndarray:
    rng = np.random.default_rng(seed)
    n = SIZE
    depth = periodic_noise(rng, n, 1.5, 4.0)
    mottle = periodic_noise(rng, n, 6.0, 16.0)
    # Wind chop: long horizontal streaks, like the light catching low swell.
    chop = periodic_noise(rng, n, 10.0, 40.0, aspect=3.0)
    fine = periodic_noise(rng, n, 60.0, 140.0)

    t = np.clip(0.5 + 0.12 * depth + 0.1 * mottle, 0, 1)[..., None]
    col = DEEP * (1 - t) + SHALLOW * t
    col += (4.0 * chop + 1.6 * fine)[..., None]

    ring = ripples(rng, n, 16)
    col += (16.0 * ring)[..., None]

    glint = np.clip(chop * 0.7 + fine * 0.5 - 1.9, 0, None)
    col = col + (GLINT - col) * np.clip(glint * 0.35, 0, 0.45)[..., None]
    return np.clip(col, 0, 255).astype(np.uint8)


def seam_score(img: np.ndarray) -> float:
    """Mean jump across the wrap edges divided by the mean jump between neighbours inside."""
    a = img.astype(float)
    inner = (np.abs(np.diff(a, axis=0)).mean() + np.abs(np.diff(a, axis=1)).mean()) / 2
    edge = (np.abs(a[0] - a[-1]).mean() + np.abs(a[:, 0] - a[:, -1]).mean()) / 2
    return edge / inner


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--preview", type=Path, help="write a 3x3 tiled check image here")
    args = ap.parse_args()
    for name, seed in (("water.png", 7), ("water-b.png", 19)):
        img = render(seed)
        Image.fromarray(img).save(OUT / name, optimize=True)
        print(f"{name}: mean {img.reshape(-1, 3).mean(0).round(1)} seam {seam_score(img):.2f}")
        if args.preview and name == "water.png":
            Image.fromarray(np.tile(img, (3, 3, 1))).save(args.preview)


if __name__ == "__main__":
    main()
