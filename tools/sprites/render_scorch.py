#!/usr/bin/env python3
"""
Plasma scorch: the mark a Xenite energy round leaves on the ground in place of a
shell crater. Nothing is dug out. The heat fuses a glassy core of slag with a
faint green sheen and fine crazing, chars a ring of soil black around it, and
throws soot fingers and grey ash out past the ring, breaking up into whatever
ground is under it, so the same decal sits on dirt and on grass.

The ground barely dishes: a heightfield shaded from the upper left like the
craters, laid flat on the 2:1 ground (one screen pixel tall per two wide).
No ground, no outline.

  python tools/sprites/render_scorch.py             # scorch-1 … scorch-4
  python tools/sprites/render_scorch.py --preview   # contact strip on dirt and grass

Prints `scorch(url, contactX, contactY, bowl)` lines for `render/sprites.ts`.
`bowl` is the width of the charred ring in pixels; the game scales it to the
scorch radius the sim sends.
"""

from __future__ import annotations

import argparse
import math
from pathlib import Path

import numpy as np
from PIL import Image

from render_props import OUT, PREVIEW, fbm, normalize

SS = 2
LIGHT = normalize(np.array([-0.58, -0.5, 0.64]))

# Width of the charred ring in shipped pixels. Soot reaches past it.
BOWL = 200
# Shipped image width as a multiple of the ring.
SPAN = 1.9

CHAR = np.array([30, 26, 23], float)
CHAR_BROWN = np.array([58, 44, 33], float)
SLAG = np.array([24, 30, 28], float)
SHEEN = np.array([110, 210, 168], float)
ASH = np.array([150, 144, 134], float)


def render_scorch(seed: int) -> Image.Image:
    rng = np.random.default_rng(seed)
    w = int(BOWL * SPAN) * SS
    h = w // 2
    rim_px = BOWL * SS / 2
    yy, xx = np.mgrid[0:h, 0:w].astype(float)
    gx = (xx - w / 2) / rim_px
    gy = (yy - h / 2) * 2 / rim_px
    ang = np.arctan2(gy, gx)

    wob = np.zeros_like(ang)
    for k, amp in ((2, 0.06), (3, 0.07), (5, 0.05), (9, 0.03), (14, 0.02)):
        wob += amp * np.sin(k * ang + rng.random() * math.tau)
    squash = 1 + 0.1 * (rng.random() - 0.5)
    r = np.hypot(gx * squash, gy / squash) / (1 + wob)
    grain = fbm(h, w, 22 * SS, rng, octaves=5)
    fine = fbm(h, w, 5 * SS, rng, octaves=3)
    r = r + (grain - 0.5) * 0.12

    # Soot fingers: angular noise stretched outward.
    rays = np.zeros_like(ang)
    for k in (6, 10, 15, 22, 31):
        rays += np.maximum(0, np.sin(k * ang + rng.random() * math.tau)) ** 4 / 5

    # A shallow dish where the ground slumped as it fused, a faint raised rim of baked crust.
    core_r = 0.36 + 0.06 * rng.random()
    dish = -0.05 * np.clip(1 - (r / (core_r * 1.4)) ** 2, 0, 1)
    crust = 0.02 * np.exp(-(((r - core_r * 1.25) / 0.08) ** 2))
    # Crazing in the glass: thin ridges along a cellular-ish noise.
    craze_n = fbm(h, w, 9 * SS, rng, octaves=2)
    craze = np.exp(-(((craze_n - 0.5) / 0.018) ** 2)) * (r < core_r * 1.1)
    height = dish + crust - craze * 0.006 + (fine - 0.5) * 0.012

    step = 1 / rim_px
    hy, hx = np.gradient(height * 1.6, step * 2, step)
    n = normalize(np.dstack([-hx, -hy, np.ones_like(hx)]))
    lam = np.clip((n * LIGHT).sum(-1), 0, 1)
    light = 0.5 + 0.7 * lam

    # Charred soil, browner toward the edge of the ring.
    brown = np.clip((r - 0.55) / 0.5, 0, 1) * (0.5 + 0.5 * grain)
    rgb = CHAR[None, None, :] * (1 - brown[..., None]) + CHAR_BROWN[None, None, :] * brown[..., None]
    # Glassy slag at the heart, with a cool green sheen where it caught the light.
    glass = np.clip((core_r - r) / 0.08, 0, 1)
    rgb = rgb * (1 - glass[..., None]) + SLAG[None, None, :] * glass[..., None]
    glint = np.clip(fine - 0.6, 0, 1) * 2.5 * np.clip(lam - 0.55, 0, 1) * 3
    sheen = glass * np.clip(glint + np.clip(1 - r / (core_r * 0.45), 0, 1) ** 2 * 0.35, 0, 1)
    rgb = rgb * (1 - sheen[..., None] * 0.28) + SHEEN[None, None, :] * sheen[..., None] * 0.28
    rgb = rgb * (1 - craze[..., None] * 0.35)
    # Grey ash flecks on the outer char and the fingers.
    ash = np.clip((fine - 0.62) / 0.1, 0, 1) * np.clip((r - core_r) / 0.4, 0, 1) * np.clip(1.25 - r, 0, 1) * (0.4 + 0.6 * rays)
    rgb = rgb * (1 - 0.35 * ash[..., None]) + ASH[None, None, :] * 0.35 * ash[..., None]
    rgb = rgb * light[..., None] * (0.9 + 0.2 * fine[..., None])

    # Alpha: solid through the ring, then soot fingers that break up into the ground.
    ring_a = np.clip((1.0 - r) / 0.45, 0, 1) ** 0.7
    finger = np.clip(rays * 2.2 - 0.15, 0, 1) * np.exp(-np.maximum(0, r - 0.7) / 0.45) * (0.6 + 0.4 * grain)
    haze = np.clip(1.0 - (r - 0.6) / 0.9, 0, 1) ** 1.5 * (0.35 + 0.4 * grain)
    alpha = np.maximum(ring_a * (0.78 + 0.22 * grain), np.maximum(finger * 0.8, haze))
    alpha = np.maximum(alpha, glass)
    edge = np.clip((SPAN - np.hypot(gx, gy)) / 0.3, 0, 1)
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
    ap.add_argument("--count", type=int, default=4)
    args = ap.parse_args()
    imgs = []
    for i in range(args.count):
        img = render_scorch(0x5C0A + i * 131)
        imgs.append(img)
        name = f"scorch-{i + 1}.png"
        if not args.preview:
            img.save(Path(OUT) / name, optimize=True)
        print(f"  scorch(scorch{i + 1}Url, {img.width // 2}, {img.height // 2}, {BOWL}),  // {name} {img.width}x{img.height}")
    if args.preview:
        PREVIEW.mkdir(exist_ok=True)
        out = PREVIEW / "scorch.png"
        preview(imgs).save(out)
        print(out)


if __name__ == "__main__":
    main()
