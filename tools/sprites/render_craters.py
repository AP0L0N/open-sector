#!/usr/bin/env python3
"""
Shell craters: the decals a heavy round leaves in the dirt, and the old holes
in the map dress.

Each crater is a heightfield (pit, thrown-up lip, patchy ejecta blanket,
scattered clods) shaded from the upper left like the other props, then laid
flat on the 2:1 ground (one screen pixel tall per two wide). The pit is
fresh, dark, and scorched; the blanket is turned soil that thins out into
whatever ground is under it, so the same decal sits on dirt and on grass.
No ground, no outline.

  python tools/sprites/render_craters.py             # crater-1 … crater-6
  python tools/sprites/render_craters.py --preview   # contact strip on dirt and grass

Prints `crater(url, contactX, contactY, bowl)` lines for `render/sprites.ts`.
`bowl` is the rim-to-rim width in pixels; the game scales it to the hole radius.
"""

from __future__ import annotations

import argparse
import math
from pathlib import Path

import numpy as np
from PIL import Image

from render_props import OUT, PREVIEW, fbm, normalize

SS = 2
# Light from the upper left, in ground coordinates: x right, y toward the viewer, z up.
LIGHT = normalize(np.array([-0.58, -0.5, 0.64]))

# Rim-to-rim width of the pit in shipped pixels. The blanket reaches past it.
BOWL = 240
# Shipped image width as a multiple of the bowl. Ejecta fades out before the edge.
SPAN = 2.25

SOIL = np.array([96, 77, 59], float)
SOIL_DRY = np.array([128, 107, 83], float)
PIT = np.array([80, 64, 50], float)
SOOT = np.array([38, 33, 29], float)


def render_crater(seed: int) -> Image.Image:
    rng = np.random.default_rng(seed)
    w = int(BOWL * SPAN) * SS
    h = w // 2
    rim_px = BOWL * SS / 2
    yy, xx = np.mgrid[0:h, 0:w].astype(float)
    # Ground coordinates in bowl radii. The 2:1 ground doubles screen y.
    gx = (xx - w / 2) / rim_px
    gy = (yy - h / 2) * 2 / rim_px
    r0 = np.hypot(gx, gy)
    ang = np.arctan2(gy, gx)

    # Irregular outline: low-frequency wobble around the rim, plus a squash
    # so no two holes are round the same way.
    wob = np.zeros_like(ang)
    for k, amp in ((2, 0.05), (3, 0.06), (5, 0.04), (8, 0.025), (13, 0.015)):
        wob += amp * np.sin(k * ang + rng.random() * math.tau)
    squash = 1 + 0.08 * (rng.random() - 0.5)
    r = np.hypot(gx * squash, gy / squash) / (1 + wob)
    grain = fbm(h, w, 26 * SS, rng, octaves=5)
    fine = fbm(h, w, 6 * SS, rng, octaves=3)
    r = r + (grain - 0.5) * 0.09

    # Heightfield in bowl radii.
    depth = 0.42 + 0.08 * rng.random()
    pit = np.where(r < 1, -depth * np.clip(1 - r * r, 0, 1) ** 1.15, 0.0)
    lip = 0.17 * np.exp(-(((r - 1.0) / 0.16) ** 2))
    # Rays of thrown soil: angular noise stretched outward.
    rays = np.zeros_like(ang)
    for k in (7, 11, 17, 23):
        rays += np.maximum(0, np.sin(k * ang + rng.random() * math.tau)) ** 3 / 4
    blanket_reach = np.exp(-np.maximum(0, r - 1) / 0.38)
    blanket = np.where(r > 0.9, 0.06 * blanket_reach * (0.4 + 0.9 * rays) * (0.5 + grain), 0.0)
    height = pit + lip + blanket + (fine - 0.5) * 0.025

    # Clods: small lumps of soil thrown out of the hole, mostly near the lip.
    clod_mask = np.zeros_like(r)
    for _ in range(int(70 + rng.random() * 40)):
        a = rng.random() * math.tau
        d = 1.0 + rng.exponential(0.32)
        if d > SPAN * 0.9:
            continue
        cx = math.cos(a) * d
        cy = math.sin(a) * d
        size = (0.025 + rng.random() * 0.05) * (1.3 - min(1.0, (d - 1) / 1.2) * 0.7)
        bump = np.exp(-(((gx - cx) ** 2 + (gy - cy) ** 2) / (size * size)))
        height += bump * size * 0.9
        clod_mask = np.maximum(clod_mask, bump)

    # Shade. Gradient in bowl radii per ground step.
    step = 1 / rim_px
    hy, hx = np.gradient(height * 1.6, step * 2, step)
    n = normalize(np.dstack([-hx, -hy, np.ones_like(hx)]))
    lam = np.clip((n * LIGHT).sum(-1), 0, 1)
    light = 0.36 + 0.9 * lam

    # Colour: dry soil on the outer blanket and clod tops, moist soil on the lip,
    # dark pit, soot toward the center.
    dry = np.clip((r - 1.05) / 0.9, 0, 1) * (0.5 + 0.5 * grain)
    rgb = SOIL[None, None, :] * (1 - dry[..., None]) + SOIL_DRY[None, None, :] * dry[..., None]
    pit_mix = np.clip((1.02 - r) / 0.35, 0, 1)
    rgb = rgb * (1 - pit_mix[..., None]) + PIT[None, None, :] * pit_mix[..., None]
    soot = np.clip(1 - r / 0.6, 0, 1) ** 1.6 * (0.45 + 0.55 * grain)
    rgb = rgb * (1 - soot[..., None] * 0.55) + SOOT[None, None, :] * soot[..., None] * 0.55
    # Scorch streaks out over the blanket from the blast.
    streak = np.clip(rays * 1.4 - 0.25, 0, 1) * np.exp(-np.maximum(0, r - 1.0) / 0.45) * np.clip((r - 0.95) / 0.12, 0, 1)
    rgb = rgb * (1 - 0.3 * streak[..., None]) + SOOT[None, None, :] * 0.3 * streak[..., None]
    speck = (fine > 0.68).astype(float) * np.clip(r - 1, 0, 1)
    rgb = rgb * (1 - 0.25 * speck[..., None])
    rgb = rgb * light[..., None] * (0.92 + 0.16 * fine[..., None])

    # Alpha: solid through the lip, then a patchy blanket that breaks up.
    blanket_a = np.clip(1.25 - (r - 1.0) / 0.75, 0, 1)
    patch = np.clip((grain * 0.6 + rays * 0.55 + fine * 0.35) - (r - 1.05) * 0.55, 0, 1)
    alpha = np.where(r < 1.12, 1.0, np.clip(blanket_a * (0.25 + patch * 1.2), 0, 1))
    alpha = np.maximum(alpha, np.clip(clod_mask * 2.2, 0, 1) * (r < SPAN * 0.95))
    # Soft edge so the decal never shows its rectangle.
    edge = np.clip((SPAN - np.hypot(gx, gy)) / 0.25, 0, 1)
    alpha = alpha * edge

    arr = np.dstack([np.clip(rgb, 0, 255), np.clip(alpha, 0, 1) * 255]).astype(np.uint8)
    img = Image.fromarray(arr, "RGBA")
    return img.resize((img.width // SS, img.height // SS), Image.LANCZOS)


def preview(imgs: list[Image.Image]) -> Image.Image:
    root = Path(OUT)
    dirt = Image.open(root / "ground-dirt.png").convert("RGBA")
    grass = Image.open(root / "grass-dry.png").convert("RGBA")
    cw = imgs[0].width
    ch = imgs[0].height
    sheet = Image.new("RGBA", (cw * len(imgs), ch * 2))
    for row, tex in enumerate((dirt, grass)):
        for x in range(0, sheet.width, tex.width):
            sheet.paste(tex, (x, row * ch))
    for i, img in enumerate(imgs):
        for row in range(2):
            sheet.alpha_composite(img, (i * cw, row * ch))
    return sheet


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--preview", action="store_true")
    ap.add_argument("--count", type=int, default=6)
    args = ap.parse_args()
    imgs = []
    for i in range(args.count):
        img = render_crater(0xC7A7 + i * 101)
        imgs.append(img)
        name = f"crater-{i + 1}.png"
        if not args.preview:
            img.save(Path(OUT) / name, optimize=True)
        print(f"  crater(crater{i + 1}Url, {img.width // 2}, {img.height // 2}, {BOWL}),  // {name} {img.width}x{img.height}")
    if args.preview:
        PREVIEW.mkdir(exist_ok=True)
        out = PREVIEW / "craters.png"
        preview(imgs).save(out)
        print(out)


if __name__ == "__main__":
    main()
