"""Seamless water texture for the terrain atlas, made from the water photo.

The canvas repeats the water image edge to edge (`ctx.createPattern(img, "repeat")`),
so the photo has to wrap. Two things broke that in the raw crop:

1. Light falloff and bands: the top is lighter and bluer than the bottom, with
   a dark olive strip near the bottom. Every row's (and column's) mean colour
   is divided out, so tone is flat while the ripples and glints stay.
2. Edges: the left/right and top/bottom content does not continue. Each axis is
   cross-faded with a copy of the photo rolled by half its size, so the edge
   rows come from the middle of the photo (which is continuous). The blend keeps
   contrast (variance-preserving) so the joins do not go flat and grey.
3. Patches: once it wraps, broad dark/light patches are evened out with a
   wrap-around blur so a large lake does not show the tile as stripes.

    python3 tools/sprites/render_water.py            # writes water.png and water-b.png
    python3 tools/sprites/render_water.py --preview /tmp/w.png  # also a 3x3 tiled check
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "tools/sprites/src/terrain"
OUT = ROOT / "gridlock/packages/client/src/assets/terrain"

# Width of each cross-fade, as a fraction of the tile. Wider hides the join
# better; narrower keeps more of the photo untouched.
BLEND = 0.22
# Big blotches (the photo's dark olive band) repeat as stripes on a lake. Tone
# patches wider than this blur are evened out by LEVEL (1 = fully flat).
LEVEL_SIGMA = 36.0
LEVEL = 0.6
# Row/column means are smoothed this much (px) before they are divided out.
ROW_SIGMA = 3.0


def smooth1d(v: np.ndarray, sigma: float) -> np.ndarray:
    """Gaussian smoothing along axis 0 (edges clamped)."""
    r = int(3 * sigma)
    k = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma) ** 2)
    k /= k.sum()
    padded = np.concatenate([np.repeat(v[:1], r, 0), v, np.repeat(v[-1:], r, 0)])
    return np.stack([np.convolve(padded[:, c], k, mode="valid") for c in range(v.shape[1])], axis=1)


def flatten_light(a: np.ndarray) -> np.ndarray:
    """Even out every row's and column's mean colour, keep the photo's mean.

    The photo's light falloff and its olive band both run across the frame, so
    they live in the row means; ripples and glints do not and stay put.
    """
    mean = a.reshape(-1, 3).mean(0)
    rows = smooth1d(a.mean(1), ROW_SIGMA)
    a = a * (mean / rows)[:, None, :]
    cols = smooth1d(a.mean(0), ROW_SIGMA)
    return a * (mean / cols)[None, :, :]


def fade_weight(n: int) -> np.ndarray:
    """1 in the middle, 0 at both ends, smoothstep across BLEND of the tile."""
    d = np.minimum(np.arange(n) + 0.5, n - np.arange(n) - 0.5) / n  # 0 at edge, 0.5 mid
    t = np.clip(d / BLEND, 0, 1)
    return t * t * (3 - 2 * t)


def wrap_axis(a: np.ndarray, axis: int) -> np.ndarray:
    n = a.shape[axis]
    b = np.roll(a, n // 2, axis=axis)
    w = fade_weight(n)
    w = w[:, None, None] if axis == 0 else w[None, :, None]
    mean = a.reshape(-1, 3).mean(0)
    mix = w * (a - mean) + (1 - w) * (b - mean)
    return mix / np.sqrt(w * w + (1 - w) ** 2) + mean


def level_patches(a: np.ndarray) -> np.ndarray:
    """Divide out broad tone/tint patches with a wrap-around Gaussian, keep detail."""
    h, w, _ = a.shape
    fy = np.fft.fftfreq(h)[:, None]
    fx = np.fft.fftfreq(w)[None, :]
    g = np.exp(-2 * (np.pi * LEVEL_SIGMA) ** 2 * (fx * fx + fy * fy))
    mean = a.reshape(-1, 3).mean(0)
    out = np.empty_like(a)
    for c in range(3):
        low = np.real(np.fft.ifft2(np.fft.fft2(a[..., c]) * g))
        out[..., c] = a[..., c] * (mean[c] / np.maximum(low, 1)) ** LEVEL
    return out


def make_seamless(img: np.ndarray) -> np.ndarray:
    a = flatten_light(img.astype(float))
    a = wrap_axis(a, 1)
    a = wrap_axis(a, 0)
    a = level_patches(a)
    return np.clip(np.round(a), 0, 255).astype(np.uint8)


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
    for src, name in (("water-photo.png", "water.png"), ("water-photo-b.png", "water-b.png")):
        raw = np.asarray(Image.open(SRC / src).convert("RGB"))
        img = make_seamless(raw)
        Image.fromarray(img).save(OUT / name, optimize=True)
        print(
            f"{name}: mean {img.reshape(-1, 3).mean(0).round(1)} (photo {raw.reshape(-1, 3).mean(0).round(1)})"
            f" seam {seam_score(img):.2f} (photo {seam_score(raw):.2f})"
        )
        if args.preview and name == "water.png":
            Image.fromarray(np.tile(img, (3, 3, 1))).save(args.preview)


if __name__ == "__main__":
    main()
