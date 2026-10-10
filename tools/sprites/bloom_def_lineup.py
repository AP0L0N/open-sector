#!/usr/bin/env python3
"""Lineup of the Bloom defences beside the Xenomorph Spine Turret / Pulse Spire, at shipped scale, on grass.

Each building is placed with its pad south corner (padSouthX/Y) on a common baseline, so heights
compare. Guns are drawn with head row 14 (SE) over the pad.

  python3 bloom_def_lineup.py <assets/buildings>  -> preview/bloom-defences-lineup.png
"""

import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw

IDS = ["spineturret", "pulsespire", "thornspitter", "bilelance", "puffcap", "eyestalk", "husk", "bunker"]


def main() -> None:
    d = Path(sys.argv[1])
    items = []
    for gid in IDS:
        info = json.loads((d / f"{gid}.json").read_text())
        im = Image.open(d / f"{gid}.png").convert("RGBA")
        gun = d / f"{gid}-gun.png"
        if gun.exists():
            cw, ch = info["cell"]
            im.alpha_composite(Image.open(gun).convert("RGBA").crop((0, 14 * ch, cw, 15 * ch)))
        b = im.getbbox()
        items.append((gid, im.crop(b), int(info["padSouthX"]) - b[0], int(info["padSouthY"]) - b[1]))
    up = max(sy for _, _, _, sy in items)
    down = max(c.height - sy for _, c, _, sy in items)
    gap = 24
    W = sum(c.width for _, c, _, _ in items) + gap * (len(items) + 1)
    H = up + down + 60
    out = Image.new("RGBA", (W, H), (74, 107, 50, 255))
    dr = ImageDraw.Draw(out)
    x = gap
    base = up + 30
    for gid, c, sx, sy in items:
        out.alpha_composite(c, (x, base - sy))
        dr.text((x, H - 22), gid, fill=(255, 240, 200, 255))
        x += c.width + gap
    p = Path(__file__).parent / "preview" / "bloom-defences-lineup.png"
    out.save(p)
    print("wrote", p, out.size)


if __name__ == "__main__":
    main()
