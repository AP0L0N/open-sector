#!/usr/bin/env python3
"""Labeled 4x4 contact of a 0001–0016 drop-in folder, rows S … SSE, for checking yaws by eye.

  python tools/sprites/contact_turntable.py --src <dir with 0001.png…> --out contact.png
"""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageDraw

NAMES = ["S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW", "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE"]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--cell", type=int, default=160)
    args = ap.parse_args()
    src = Path(args.src)
    cell = args.cell
    label = 18
    sheet = Image.new("RGB", (4 * cell, 4 * (cell + label)), (74, 107, 50))
    d = ImageDraw.Draw(sheet)
    for i, name in enumerate(NAMES):
        im = Image.open(src / f"{i + 1:04d}.png").convert("RGBA").resize((cell, cell), Image.Resampling.LANCZOS)
        r, c = divmod(i, 4)
        x, y = c * cell, r * (cell + label)
        sheet.paste(im, (x, y), im)
        d.text((x + 4, y + cell + 2), f"{i + 1:04d} {name}", fill=(240, 236, 220))
    sheet.save(args.out)
    print("wrote", args.out)


if __name__ == "__main__":
    main()
