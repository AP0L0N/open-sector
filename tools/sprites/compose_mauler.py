#!/usr/bin/env python3
"""Compose the Mauler full sheet and the cart-off sheet from aligned frames.

The hull frame is the same canvas as the full frame with the cart removed.
Both sheets use the full vehicle's bbox and one scale, so the dozer does not
jump when the cart comes off. Unique facings are E ESE SE SSE S N NNE NE ENE.
The other seven are horizontal mirrors.
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from compose_unit_sheet import (  # noqa: E402
    ENGINE_ORDER,
    MIRROR_OF,
    UNIQUE_ORDER,
    hflip,
    preview_strip,
    preview_turntable,
)

ROOT = Path(__file__).resolve().parents[2]
FULL_DIR = Path("/tmp/mauler-unique")
HULL_DIR = Path("/tmp/mauler-hull")
CELL = 128
CONTACT_Y = 0.92
PADDING = 6


def key_frame(path: Path, size: tuple[int, int] | None = None) -> Image.Image:
    im = Image.open(path).convert("RGBA")
    if size and im.size != size:
        im = im.resize(size, Image.Resampling.LANCZOS)
    px = im.load()
    w, h = im.size
    bg = px[1, 1]

    def magentaish(c: tuple[int, int, int, int]) -> bool:
        r, g, b = c[:3]
        return r > g + 25 and b > g + 20 and b > 60

    def dist(c: tuple[int, int, int, int]) -> float:
        return math.sqrt(sum((a - b) ** 2 for a, b in zip(c[:3], bg[:3])))

    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    op = out.load()
    for y in range(h):
        for x in range(w):
            c = px[x, y]
            if dist(c) < 78 and magentaish(c):
                continue
            op[x, y] = (*c[:3], 255)
    return out


def bbox(im: Image.Image) -> tuple[int, int, int, int] | None:
    px = im.load()
    w, h = im.size
    xs: list[int] = []
    ys: list[int] = []
    for y in range(h):
        for x in range(w):
            if px[x, y][3] > 40:
                xs.append(x)
                ys.append(y)
    if not xs:
        return None
    return min(xs), min(ys), max(xs) + 1, max(ys) + 1


def place(src: Image.Image, window: tuple[int, int, int, int], scale: float) -> Image.Image:
    cropped = src.crop(window)
    nw = max(1, round(cropped.size[0] * scale))
    nh = max(1, round(cropped.size[1] * scale))
    scaled = cropped.resize((nw, nh), Image.Resampling.LANCZOS)
    out = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
    x = round((CELL - nw) / 2)
    y = round(CELL * CONTACT_Y - nh)
    out.alpha_composite(scaled, (x, y))
    return out


def sheet_from(placed: dict[str, Image.Image]) -> Image.Image:
    sheet = Image.new("RGBA", (CELL, 16 * CELL), (0, 0, 0, 0))
    for i, name in enumerate(ENGINE_ORDER):
        sheet.alpha_composite(placed[name], (0, i * CELL))
    return sheet


def main() -> int:
    fulls = {name: key_frame(FULL_DIR / f"{name}.png") for name in UNIQUE_ORDER}
    size = fulls["E"].size
    hulls = {}
    for name in UNIQUE_ORDER:
        matches = list(HULL_DIR.glob(f"{name}.*"))
        if not matches:
            raise SystemExit(f"missing hull frame {name}")
        hulls[name] = key_frame(matches[0], size)

    east = bbox(fulls["E"])
    if not east:
        raise SystemExit("east frame is empty")
    bw, bh = east[2] - east[0], east[3] - east[1]
    scale = min((CELL - 2 * PADDING) / bw, (int(CELL * CONTACT_Y) - PADDING) / bh, 1.0)

    full_placed: dict[str, Image.Image] = {}
    hull_placed: dict[str, Image.Image] = {}
    for name in UNIQUE_ORDER:
        window = bbox(fulls[name])
        if not window:
            raise SystemExit(f"empty full frame {name}")
        full_placed[name] = place(fulls[name], window, scale)
        hull_placed[name] = place(hulls[name], window, scale)
    for dest, src in MIRROR_OF.items():
        full_placed[dest] = hflip(full_placed[src])
        hull_placed[dest] = hflip(hull_placed[src])

    out_dir = ROOT / "gridlock/packages/client/src/assets/units"
    full_sheet = sheet_from(full_placed)
    hull_sheet = sheet_from(hull_placed)
    full_sheet.save(out_dir / "hauler-move.png")
    hull_sheet.save(out_dir / "hauler-bare.png")

    cameo = full_placed["E"].resize((72, 72), Image.Resampling.LANCZOS)
    cameo.save(out_dir / "hauler-cameo.png")

    preview = ROOT / "tools/sprites/work"
    preview.mkdir(parents=True, exist_ok=True)
    preview_strip(full_sheet, CELL, 1, 96).save(preview / "mauler-full-strip.png")
    preview_strip(hull_sheet, CELL, 1, 96).save(preview / "mauler-bare-strip.png")
    preview_turntable(full_placed, CELL).save(preview / "mauler-full-table.png")
    preview_turntable(hull_placed, CELL).save(preview / "mauler-bare-table.png")
    print(f"scale {scale:.4f} cell {CELL}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
