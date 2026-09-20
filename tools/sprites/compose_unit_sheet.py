#!/usr/bin/env python3
"""Compose a 16-dir Gridlock unit sheet from a 9-facing turntable.

The generator draws the 9 unique yaws in ONE image so scale, outline, and
palette stay locked. This script keys magenta, fits every facing with the
SAME scale (taken from east), horizontal-flips the 7 mirrors, and writes
the engine sheet: columns = frames, rows = 16 dirs.

Unique 3×3 order (row-major):

    E     ESE    SE
    SSE   S      N
    NNE   NE     ENE

Mirrors (horizontal flip, camera stays put):

    W    = flip(E)
    WSW  = flip(ESE)
    SW   = flip(SE)
    SSW  = flip(SSE)
    WNW  = flip(ENE)
    NW   = flip(NE)
    NNW  = flip(NNE)

Engine row order (0001 = south, clockwise 22.5°, 0016 last unique yaw):

    S SSW SW WSW W WNW NW NNW N NNE NE ENE E ESE SE SSE

Examples:

  python tools/sprites/compose_unit_sheet.py \\
      --input tools/sprites/src/warden-hull-9.png \\
      --cell 128 --contact-y 0.92 --padding 8 \\
      --out gridlock/packages/client/src/assets/units/warden-hull.png

  python tools/sprites/compose_unit_sheet.py \\
      --input tools/sprites/src/warden-turret-9.png \\
      --cell 128 --pivot cyan --pivot-y 0.55 --padding 6 \\
      --out gridlock/packages/client/src/assets/units/warden-turret.png

  python tools/sprites/compose_unit_sheet.py \\
      --strips-dir tools/sprites/src/trooper-walk \\
      --cell 96 --frames 8 --contact-y 0.90 \\
      --out gridlock/packages/client/src/assets/units/trooper-walk.png
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw

UNIQUE_ORDER = ["E", "ESE", "SE", "SSE", "S", "N", "NNE", "NE", "ENE"]
ENGINE_ORDER = [
    "S",
    "SSW",
    "SW",
    "WSW",
    "W",
    "WNW",
    "NW",
    "NNW",
    "N",
    "NNE",
    "NE",
    "ENE",
    "E",
    "ESE",
    "SE",
    "SSE",
]
MIRROR_OF = {
    "W": "E",
    "WSW": "ESE",
    "SW": "SE",
    "SSW": "SSE",
    "WNW": "ENE",
    "NW": "NE",
    "NNW": "NNE",
}
MAGENTA = (255, 0, 255, 255)
CYAN = (0, 255, 255)


def is_true_magenta(p: tuple[int, int, int, int], t: int = 48) -> bool:
    r, g, b, a = p
    if a < 8:
        return True
    return r >= 255 - t and b >= 255 - t and g <= t


def border_chroma(im: Image.Image, band: int = 12) -> tuple[int, int, int]:
    """Median RGB of a thin border — the studio backdrop, even when it's hot pink."""
    px = im.load()
    w, h = im.size
    rs, gs, bs = [], [], []
    for x in range(w):
        for y in list(range(band)) + list(range(h - band, h)):
            r, g, b, a = px[x, y]
            if a >= 8:
                rs.append(r)
                gs.append(g)
                bs.append(b)
    for y in range(band, h - band):
        for x in list(range(band)) + list(range(w - band, w)):
            r, g, b, a = px[x, y]
            if a >= 8:
                rs.append(r)
                gs.append(g)
                bs.append(b)
    rs.sort()
    gs.sort()
    bs.sort()
    n = len(rs) or 1
    return rs[n // 2], gs[n // 2], bs[n // 2]


def near_chroma(p: tuple[int, int, int, int], key: tuple[int, int, int], dist: int) -> bool:
    r, g, b, a = p
    if a < 8:
        return True
    return (r - key[0]) ** 2 + (g - key[1]) ** 2 + (b - key[2]) ** 2 <= dist * dist


def is_cyan(p: tuple[int, int, int, int], t: int = 70) -> bool:
    r, g, b, a = p
    return a >= 32 and g >= 180 and b >= 180 and r <= 90 and g - r >= 80 and b - r >= 80


def key_magenta(im: Image.Image, t: int = 48) -> Image.Image:
    """Flood-fill the studio backdrop from the border (true magenta or sampled pink)."""
    from collections import deque

    im = im.convert("RGBA")
    key = border_chroma(im)
    dist = max(t, 52)
    px = im.load()
    w, h = im.size
    seen = [[False] * w for _ in range(h)]
    q: deque[tuple[int, int]] = deque()

    def maybe(x: int, y: int) -> None:
        if 0 <= x < w and 0 <= y < h and not seen[y][x]:
            p = px[x, y]
            if is_true_magenta(p, t) or near_chroma(p, key, dist):
                seen[y][x] = True
                q.append((x, y))

    for x in range(w):
        maybe(x, 0)
        maybe(x, h - 1)
    for y in range(h):
        maybe(0, y)
        maybe(w - 1, y)
    while q:
        x, y = q.popleft()
        px[x, y] = (0, 0, 0, 0)
        maybe(x + 1, y)
        maybe(x - 1, y)
        maybe(x, y + 1)
        maybe(x, y - 1)
    # Video frames sometimes leave closed pink ground-ellipses. Drop remaining
    # high-sat magenta/pink islands that are not olive, rust, or hazard yellow.
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 8:
                continue
            mx, mn = max(r, g, b), min(r, g, b)
            if mx < 70 or mx == mn:
                continue
            d = mx - mn
            if mx == r:
                hue = (60 * ((g - b) / d)) % 360
            elif mx == g:
                hue = (60 * ((b - r) / d + 2)) % 360
            else:
                hue = (60 * ((r - g) / d + 4)) % 360
            sat = d / mx
            if sat >= 0.32 and g < 130 and (hue >= 290 or hue <= 8):
                px[x, y] = (0, 0, 0, 0)
    return im


def opaque_bbox(im: Image.Image, alpha_min: int = 12) -> tuple[int, int, int, int] | None:
    a = im.split()[-1]
    bb = a.point(lambda v: 255 if v >= alpha_min else 0).getbbox()
    return bb


def cyan_centroid(im: Image.Image) -> tuple[float, float] | None:
    px = im.load()
    w, h = im.size
    sx = sy = n = 0
    for y in range(h):
        for x in range(w):
            if is_cyan(px[x, y]):
                sx += x
                sy += y
                n += 1
    if n < 4:
        return None
    return sx / n, sy / n


def strip_cyan(im: Image.Image) -> Image.Image:
    """Replace cyan pivot marks with nearby non-cyan pixels, else transparent."""
    im = im.copy()
    px = im.load()
    w, h = im.size
    cyan_pts = [(x, y) for y in range(h) for x in range(w) if is_cyan(px[x, y])]
    for x, y in cyan_pts:
        repl = None
        for r in range(1, 7):
            for dy in range(-r, r + 1):
                for dx in range(-r, r + 1):
                    xx, yy = x + dx, y + dy
                    if 0 <= xx < w and 0 <= yy < h:
                        p = px[xx, yy]
                        if p[3] >= 32 and not is_cyan(p):
                            repl = p
                            break
                if repl:
                    break
            if repl:
                break
        px[x, y] = repl if repl else (0, 0, 0, 0)
    return im


def split_grid(im: Image.Image, cols: int, rows: int) -> list[Image.Image]:
    w, h = im.size
    cw, ch = w // cols, h // rows
    cells = []
    for r in range(rows):
        for c in range(cols):
            cells.append(im.crop((c * cw, r * ch, (c + 1) * cw, (r + 1) * ch)))
    return cells


def measure_fit_scale(im: Image.Image, cell: int, padding: int, contact_y: float) -> float:
    bb = opaque_bbox(im)
    if not bb:
        return 1.0
    bw, bh = bb[2] - bb[0], bb[3] - bb[1]
    max_w = max(1, cell - 2 * padding)
    max_h = max(1, int(cell * contact_y) - padding)
    return min(max_w / bw, max_h / bh, 1.0)


def place_subject(
    src: Image.Image,
    cell: int,
    scale: float,
    contact_y: float,
    pivot: tuple[float, float] | None,
    pivot_y: float,
) -> Image.Image:
    out = Image.new("RGBA", (cell, cell), (0, 0, 0, 0))
    bb = opaque_bbox(src)
    if not bb:
        return out
    cropped = src.crop(bb)
    nw = max(1, round(cropped.size[0] * scale))
    nh = max(1, round(cropped.size[1] * scale))
    scaled = cropped.resize((nw, nh), Image.Resampling.LANCZOS)
    if pivot is not None:
        px = (pivot[0] - bb[0]) * scale
        py = (pivot[1] - bb[1]) * scale
        x = round(cell / 2 - px)
        y = round(cell * pivot_y - py)
    else:
        x = round((cell - nw) / 2)
        y = round(cell * contact_y - nh)
    out.alpha_composite(scaled, (x, y))
    return out


def hflip(im: Image.Image) -> Image.Image:
    return im.transpose(Image.Transpose.FLIP_LEFT_RIGHT)


def load_unique_from_grid(path: Path, magenta_t: int) -> dict[str, Image.Image]:
    im = key_magenta(Image.open(path), magenta_t)
    cells = split_grid(im, 3, 3)
    if len(cells) != 9:
        raise SystemExit(f"{path}: expected 3×3 grid, got {len(cells)} cells")
    return dict(zip(UNIQUE_ORDER, cells, strict=True))


def load_unique_from_strips_dir(d: Path, magenta_t: int) -> tuple[dict[str, list[Image.Image]], int]:
    """Each unique facing is a horizontal strip of N frames: E.png, ESE.png, ..."""
    frames_by_dir: dict[str, list[Image.Image]] = {}
    nframes = None
    for name in UNIQUE_ORDER:
        matches = list(d.glob(f"{name}.png")) + list(d.glob(f"{name.lower()}.png"))
        if not matches:
            raise SystemExit(f"{d}: missing unique facing strip {name}.png")
        im = key_magenta(Image.open(matches[0]), magenta_t)
        bb = opaque_bbox(im)
        # Split equally along width. If the file is already one frame, n=1.
        # Detect frame count from a sibling manifest or from equal-width blobs.
        # Default: if height ~= width, 1 frame; else guess from filename stem or --frames.
        frames_by_dir[name] = [im]
        nframes = nframes or 1
    return frames_by_dir, nframes or 1


def split_hstrip(im: Image.Image, frames: int) -> list[Image.Image]:
    w, h = im.size
    cw = w // frames
    return [im.crop((i * cw, 0, (i + 1) * cw, h)) for i in range(frames)]


def build_dir_map(
    unique: dict[str, Image.Image],
    cell: int,
    scale: float,
    contact_y: float,
    pivot_y: float,
    use_pivot: bool,
) -> dict[str, Image.Image]:
    placed: dict[str, Image.Image] = {}
    for name in UNIQUE_ORDER:
        src = unique[name]
        pivot = cyan_centroid(src) if use_pivot else None
        if use_pivot:
            src = strip_cyan(src)
        placed[name] = place_subject(src, cell, scale, contact_y, pivot, pivot_y)
    for dest, src_name in MIRROR_OF.items():
        placed[dest] = hflip(placed[src_name])
    missing = [d for d in ENGINE_ORDER if d not in placed]
    if missing:
        raise SystemExit(f"missing dirs: {missing}")
    return placed


def compose_sheet(rows: list[list[Image.Image]], cell: int) -> Image.Image:
    frames = len(rows[0])
    sheet = Image.new("RGBA", (frames * cell, 16 * cell), (0, 0, 0, 0))
    for r, cols in enumerate(rows):
        for c, im in enumerate(cols):
            if im.size != (cell, cell):
                raise SystemExit(f"cell size {im.size} != {cell}")
            sheet.alpha_composite(im, (c * cell, r * cell))
    return sheet


def preview_strip(sheet: Image.Image, cell: int, frames: int, draw: int) -> Image.Image:
    """16 facings of frame 0, left to right, at gameplay draw size."""
    strip = Image.new("RGBA", (16 * draw, draw), (40, 40, 44, 255))
    for i in range(16):
        cell_im = sheet.crop((0, i * cell, cell, (i + 1) * cell))
        small = cell_im.resize((draw, draw), Image.Resampling.LANCZOS)
        strip.alpha_composite(small, (i * draw, 0))
    return strip


def preview_turntable(placed: dict[str, Image.Image], cell: int) -> Image.Image:
    """4×4 of all 16 dirs in engine order, labeled outside cells."""
    label_h = 18
    canvas = Image.new("RGB", (4 * cell, 4 * (cell + label_h)), (255, 0, 255))
    draw = ImageDraw.Draw(canvas)
    for i, name in enumerate(ENGINE_ORDER):
        r, c = divmod(i, 4)
        x, y = c * cell, r * (cell + label_h)
        canvas.paste(Image.new("RGB", (cell, cell), (255, 0, 255)), (x, y))
        canvas.paste(placed[name], (x, y), placed[name])
        draw.text((x + 4, y + cell + 2), f"{i} {name}", fill=(20, 16, 12))
    return canvas


def diagnostics(placed: dict[str, Image.Image], cell: int) -> list[dict]:
    rows = []
    heights = []
    for i, name in enumerate(ENGINE_ORDER):
        bb = opaque_bbox(placed[name])
        rec = {"i": i, "dir": name, "empty": bb is None}
        if bb:
            rec.update(
                {
                    "x0": bb[0],
                    "y0": bb[1],
                    "x1": bb[2],
                    "y1": bb[3],
                    "w": bb[2] - bb[0],
                    "h": bb[3] - bb[1],
                    "contactY": round(bb[3] / cell, 3),
                    "cx": round((bb[0] + bb[2]) / 2, 1),
                }
            )
            heights.append(bb[3] - bb[1])
        rows.append(rec)
    if heights:
        med = sorted(heights)[len(heights) // 2]
        for rec in rows:
            if "h" in rec:
                rec["pop"] = abs(rec["h"] - med) / med > 0.12
    return rows


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    src = p.add_mutually_exclusive_group(required=True)
    src.add_argument("--input", type=Path, help="3×3 unique-facing turntable PNG")
    src.add_argument(
        "--strips-dir",
        type=Path,
        help="Directory of unique facing strips named E.png … ENE.png (horizontal frames)",
    )
    src.add_argument(
        "--unique-dir",
        type=Path,
        help="Directory of one PNG per unique facing: E.png, ESE.png, … ENE.png",
    )
    src.add_argument(
        "--sixteen-dir",
        type=Path,
        help="Directory of all 16 engine facings (no mirror): E.png … ENE.png",
    )
    p.add_argument("--cell", type=int, required=True, help="Engine cell size (96 infantry, 128 medium, 48 head, 192 heavy)")
    p.add_argument("--contact-y", type=float, default=0.92)
    p.add_argument("--padding", type=int, default=8)
    p.add_argument("--frames", type=int, default=1, help="Animation frames in each strip (strips-dir mode)")
    p.add_argument("--pivot", choices=["none", "cyan"], default="none")
    p.add_argument("--pivot-y", type=float, default=0.55, help="Cell-relative Y of cyan pivot (turret ring)")
    p.add_argument("--magenta-t", type=int, default=48, help="Magenta key threshold")
    p.add_argument("--scale", type=float, default=0.0, help="Override lock scale; 0 = fit from east")
    p.add_argument("--out", type=Path, required=True)
    p.add_argument("--preview-dir", type=Path, default=Path("tools/sprites/preview"))
    p.add_argument("--draw-size", type=int, default=0, help="Gameplay draw size for the verify strip")
    p.add_argument("--id", default="", help="Asset id for the sidecar manifest")
    return p.parse_args()


def main() -> int:
    args = parse_args()
    use_pivot = args.pivot == "cyan"
    preview_dir = args.preview_dir
    preview_dir.mkdir(parents=True, exist_ok=True)
    stem = args.out.stem

    frame_uniques: list[dict[str, Image.Image]]
    if args.input:
        unique = load_unique_from_grid(args.input, args.magenta_t)
        frame_uniques = [unique]
        nframes = 1
    elif args.sixteen_dir:
        unique: dict[str, Image.Image] = {}
        placed_direct: dict[str, Image.Image] = {}
        for name in ENGINE_ORDER:
            path = args.sixteen_dir / f"{name}.png"
            if not path.exists():
                path = args.sixteen_dir / f"{name.lower()}.png"
            if not path.exists():
                raise SystemExit(f"missing {args.sixteen_dir}/{name}.png")
            unique[name] = key_magenta(Image.open(path), args.magenta_t)
        east = unique["E"]
        scale = args.scale if args.scale > 0 else measure_fit_scale(east, args.cell, args.padding, args.contact_y)
        for name in ENGINE_ORDER:
            src_im = unique[name]
            pivot = cyan_centroid(src_im) if use_pivot else None
            if use_pivot:
                src_im = strip_cyan(src_im)
            placed_direct[name] = place_subject(src_im, args.cell, scale, args.contact_y, pivot, args.pivot_y)
        sheet_rows = [[placed_direct[d]] for d in ENGINE_ORDER]
        nframes = 1
        placed0 = placed_direct
        # Skip the generic unique/mirror path below.
        sheet = compose_sheet(sheet_rows, args.cell)
        args.out.parent.mkdir(parents=True, exist_ok=True)
        sheet.save(args.out)
        diag = diagnostics(placed0, args.cell)
        pops = [d["dir"] for d in diag if d.get("pop")]
        empties = [d["dir"] for d in diag if d.get("empty")]
        preview_dir.mkdir(parents=True, exist_ok=True)
        turntable = preview_turntable(placed0, args.cell)
        turntable.save(preview_dir / f"{stem}-turntable.png")
        draw = args.draw_size or max(24, args.cell // 4)
        strip = preview_strip(sheet, args.cell, nframes, draw)
        strip.save(preview_dir / f"{stem}-strip.png")
        manifest = {
            "id": args.id or stem,
            "cell": args.cell,
            "cols": nframes,
            "rows": 16,
            "facing": 16,
            "order": ENGINE_ORDER,
            "contactY": args.contact_y,
            "scale": round(scale, 4),
            "pivot": args.pivot,
            "out": str(args.out),
            "size_pop_dirs": pops,
            "empty_dirs": empties,
            "diag": diag,
            "source": "sixteen-dir",
        }
        (preview_dir / f"{stem}-manifest.json").write_text(json.dumps(manifest, indent=2))
        print(json.dumps({k: manifest[k] for k in ("id", "cell", "cols", "scale", "size_pop_dirs", "empty_dirs", "out")}, indent=2))
        if empties:
            print("FAIL: empty dirs", empties, file=sys.stderr)
            return 2
        if pops:
            print("WARN: size pop vs median height:", pops, file=sys.stderr)
        return 0
    elif args.unique_dir:
        unique = {}
        for name in UNIQUE_ORDER:
            path = args.unique_dir / f"{name}.png"
            if not path.exists():
                path = args.unique_dir / f"{name.lower()}.png"
            if not path.exists():
                raise SystemExit(f"missing {args.unique_dir}/{name}.png")
            unique[name] = key_magenta(Image.open(path), args.magenta_t)
        frame_uniques = [unique]
        nframes = 1
    else:
        nframes = args.frames
        frame_uniques = []
        for name in UNIQUE_ORDER:
            path = args.strips_dir / f"{name}.png"
            if not path.exists():
                path = args.strips_dir / f"{name.lower()}.png"
            if not path.exists():
                raise SystemExit(f"missing {args.strips_dir}/{name}.png")
            im = key_magenta(Image.open(path), args.magenta_t)
            parts = split_hstrip(im, nframes) if nframes > 1 else [im]
            if not frame_uniques:
                frame_uniques = [{} for _ in range(nframes)]
            for fi, part in enumerate(parts):
                frame_uniques[fi][name] = part

    east = frame_uniques[0]["E"]
    scale = args.scale if args.scale > 0 else measure_fit_scale(east, args.cell, args.padding, args.contact_y)

    sheet_rows: list[list[Image.Image]] = []
    placed0: dict[str, Image.Image] | None = None
    for fi, unique in enumerate(frame_uniques):
        placed = build_dir_map(unique, args.cell, scale, args.contact_y, args.pivot_y, use_pivot)
        if fi == 0:
            placed0 = placed
        if not sheet_rows:
            sheet_rows = [[] for _ in ENGINE_ORDER]
        for ri, d in enumerate(ENGINE_ORDER):
            sheet_rows[ri].append(placed[d])

    sheet = compose_sheet(sheet_rows, args.cell)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(args.out)

    assert placed0 is not None
    diag = diagnostics(placed0, args.cell)
    pops = [d["dir"] for d in diag if d.get("pop")]
    empties = [d["dir"] for d in diag if d.get("empty")]

    turntable = preview_turntable(placed0, args.cell)
    turntable.save(preview_dir / f"{stem}-turntable.png")
    draw = args.draw_size or max(24, args.cell // 4)
    strip = preview_strip(sheet, args.cell, nframes, draw)
    strip.save(preview_dir / f"{stem}-strip.png")

    manifest = {
        "id": args.id or stem,
        "cell": args.cell,
        "cols": nframes,
        "rows": 16,
        "facing": 16,
        "order": ENGINE_ORDER,
        "unique": UNIQUE_ORDER,
        "mirror": MIRROR_OF,
        "contactY": args.contact_y,
        "scale": round(scale, 4),
        "pivot": args.pivot,
        "out": str(args.out),
        "size_pop_dirs": pops,
        "empty_dirs": empties,
        "diag": diag,
    }
    (preview_dir / f"{stem}-manifest.json").write_text(json.dumps(manifest, indent=2))
    print(json.dumps({k: manifest[k] for k in ("id", "cell", "cols", "scale", "size_pop_dirs", "empty_dirs", "out")}, indent=2))
    if empties:
        print("FAIL: empty dirs", empties, file=sys.stderr)
        return 2
    if pops:
        print("WARN: size pop vs median height:", pops, file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
