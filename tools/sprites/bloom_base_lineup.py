#!/usr/bin/env python3
"""Preview: the Bloom buildings over their Xenomorph equivalents at game scale, footprints outlined.

Each sprite is scaled so its pad spans its footprint (32 screen px per tile along the pad's
half-diagonal, like the client's buildingSpriteDestRect) and drawn with its pad-south point on a
shared baseline; the footprint diamond is outlined in white so a pad that drifts off it shows.

  python3 tools/sprites/bloom_base_lineup.py
"""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
B = ROOT / "gridlock/packages/client/src/assets/buildings"
OUT = Path(__file__).resolve().parent / "preview" / "bloom-base-lineup.png"
TILE = 32.0

# (bloom, xeno, tiles W, tiles H, ground layer?)
PAIRS = [
    ("broodheart", "hivecore", 3, 3, False),
    ("lumenbulb", "fusionnode", 2, 2, False),
    ("gorger", "assimilator", 3, 3, False),
    ("broodnest", "cyborgcentral", 2.5, 2.5, False),
    ("gestator", "forge", 3, 3, False),
    ("braincoral", "nexus", 2, 2, False),
    ("tidewomb", "spawnpool", 2.5, 2.5, False),
    ("roost", "aerie", 7.5, 3.75, True),
]


def load(bid: str, ground: bool) -> tuple[Image.Image, dict]:
    img = Image.open(B / f"{bid}.png").convert("RGBA")
    if ground:
        gr = Image.open(B / f"{bid}-ground.png").convert("RGBA")
        gr.alpha_composite(img)
        img = gr
    info = json.loads((B / f"{bid}.json").read_text())
    return img, info


def place(canvas: Image.Image, dr: ImageDraw.ImageDraw, bid: str, tw: float, th: float, ground: bool, sx: float, sy: float) -> None:
    img, info = load(bid, ground)
    foot = (tw + th) * TILE
    s = foot / info["padWidth"]
    im = img.resize((max(1, round(img.width * s)), max(1, round(img.height * s))), Image.Resampling.LANCZOS)
    x0 = round(sx - info["padSouthX"] * s)
    y0 = round(sy - info["padSouthY"] * s)
    canvas.alpha_composite(im, (x0, y0))
    k = foot / (tw + th)
    pts = [(sx, sy), (sx + th * k, sy - th * k / 2), (sx + (th - tw) * k, sy - (tw + th) * k / 2), (sx - tw * k, sy - tw * k / 2)]
    dr.line(pts + [pts[0]], fill=(255, 255, 255, 200), width=1)
    dr.text((sx - 30, sy + 6), bid, fill=(255, 255, 255, 255))


def main() -> None:
    xs = []
    x = 20.0
    for _, _, tw, th, _ in PAIRS:
        x += tw * TILE + 16
        xs.append(x)
        x += th * TILE + 16
    W = int(x + 20)
    H = 560
    canvas = Image.new("RGBA", (W, H), (74, 107, 50, 255))
    dr = ImageDraw.Draw(canvas)
    for (bloom, xeno, tw, th, gnd), sx in zip(PAIRS, xs):
        if bloom == "tidewomb":
            # On water: paint a pond behind the harbour pair.
            for base_y in (250, 520):
                dr.rectangle((sx - tw * TILE - 10, base_y - 150, sx + th * TILE + 10, base_y + 4), fill=(44, 74, 98, 255))
        place(canvas, dr, bloom, tw, th, gnd, sx, 250)
        place(canvas, dr, xeno, tw, th, gnd, sx, 520)
    OUT.parent.mkdir(exist_ok=True)
    canvas.save(OUT)
    print("wrote", OUT, canvas.size)


if __name__ == "__main__":
    main()
