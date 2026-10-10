#!/usr/bin/env python3
"""Bloom sea + air lineup: every unit facing east (row 12, 0013.png) at its intended map draw size,
next to the Xenite Leech and Wasp. Runtime fit (composeAligned twin), then drawSize = round(N * 1.25).

  python3 tools/sprites/bloom_seaair_lineup.py

Writes tools/sprites/preview/bloom-seaair-lineup.png (drawn 2x, nearest, so it reads on screen).
"""

from __future__ import annotations

from PIL import Image, ImageDraw

import xeno_walker as bw
from bloom_seaair_common import PREVIEW, UNITS

UNIT_VISUAL_SCALE = 1.25
# (id, drawSize base, contactY)
NAVAL = [("leech", 48, 0.74), ("driftjelly", 48, 0.74), ("spineback", 48, 0.74), ("abyssray", 98, 0.74),
         ("leviathan", 92, 0.74), ("broodbarge", 77, 0.74)]
AIR = [("wasp", 56, 0.8), ("moth", 41, 0.8), ("razorwing", 58, 0.8), ("gasbag", 48, 0.8), ("drifter", 48, 0.8),
       ("harpy", 56, 0.8)]


def east(unit: str, contact_y: float, size: int) -> Image.Image:
    bw.CONTACT_Y = contact_y
    bw.PADDING = 2
    raw = bw.frames(UNITS / unit / "hull")
    scale, ox, oy, _ = bw.fit([raw])
    cell = bw.place(raw[12], scale, ox, oy)
    return cell.resize((size, size), Image.LANCZOS)


def main() -> None:
    rows = [NAVAL, AIR]
    pad, lab = 6, 12
    widths = [sum(round(n * UNIT_VISUAL_SCALE) + pad for _, n, _ in r) + pad for r in rows]
    heights = [max(round(n * UNIT_VISUAL_SCALE) for _, n, _ in r) + lab + pad for r in rows]
    W, Hh = max(widths), sum(heights) + pad
    board = Image.new("RGBA", (W, Hh), (44, 74, 98, 255))
    d = ImageDraw.Draw(board)
    y = pad
    for r, rh in zip(rows, heights):
        x = pad
        for unit, n, cy in r:
            sz = round(n * UNIT_VISUAL_SCALE)
            im = east(unit, cy, sz)
            top = y + (rh - lab - pad) - sz
            board.alpha_composite(im, (x, top))
            d.line((x, top + round(cy * sz), x + sz, top + round(cy * sz)), fill=(160, 40, 40, 255))
            d.text((x, y + rh - lab - pad + 1), f"{unit} {n}", fill=(240, 236, 220, 255))
            x += sz + pad
        y += rh
    big = board.resize((W * 2, Hh * 2), Image.NEAREST)
    out = PREVIEW / "bloom-seaair-lineup.png"
    big.save(out)
    print("wrote", out, big.size)


if __name__ == "__main__":
    main()
