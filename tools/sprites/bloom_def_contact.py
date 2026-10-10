#!/usr/bin/env python3
"""Labeled 4x4 contact of a Bloom gun's 16 traverse rows over its pad, cropped and zoomed.

  python3 bloom_def_contact.py <assets/buildings> <id> [zoom]  -> preview/<id>-contact.png
Row 0 (S) aims at the viewer, then clockwise.
"""

import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw

ORDER = ["S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW", "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE"]


def main() -> None:
    d = Path(sys.argv[1])
    gid = sys.argv[2]
    z = int(sys.argv[3]) if len(sys.argv) > 3 else 2
    info = json.loads((d / f"{gid}.json").read_text())
    base = Image.open(d / f"{gid}.png").convert("RGBA")
    sheet = Image.open(d / f"{gid}-gun.png").convert("RGBA")
    cw, ch = info["cell"]
    cells = []
    for r in range(info["rows"]):
        c = base.copy()
        c.alpha_composite(sheet.crop((0, r * ch, cw, (r + 1) * ch)))
        cells.append(c)
    box = None
    for c in cells:
        b = c.getbbox()
        box = b if box is None else (min(box[0], b[0]), min(box[1], b[1]), max(box[2], b[2]), max(box[3], b[3]))
    w, h = (box[2] - box[0]) * z, (box[3] - box[1]) * z
    lab = 16
    out = Image.new("RGBA", (w * 4, (h + lab) * 4), (74, 107, 50, 255))
    dr = ImageDraw.Draw(out)
    for r, c in enumerate(cells):
        im = c.crop(box).resize((w, h), Image.Resampling.NEAREST)
        x, y = (r % 4) * w, (r // 4) * (h + lab)
        out.alpha_composite(im, (x, y + lab))
        dr.text((x + 4, y + 2), f"row {r} {ORDER[r]}", fill=(255, 240, 200, 255))
    p = Path(__file__).parent / "preview" / f"{gid}-contact.png"
    out.save(p)
    print("wrote", p)


if __name__ == "__main__":
    main()
