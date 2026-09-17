#!/usr/bin/env python3
"""Compose 16 unique Blender turntable frames into Gridlock hull + turret sheets.

Source frames are a locked-camera yaw: frame 1 faces the camera (screen south),
then clockwise 22.5° for 16 frames / 360°. Hull and turret are separate passes
of the same camera, so they share one scale and one offset. Do not bbox-fit
each facing (the gun would leave the ring when the turret aims independently).
Do not mirror (3D yaws are unique).

Engine row 0 is still screen-east; this script remaps south-first sources.

Example:

  python tools/sprites/compose_blender_turntable.py \\
      --src blender/tanks/tiger \\
      --hull-subdir husk --turret-subdir turret \\
      --id tiger --cell 128 --contact-y 0.92 --padding 4 \\
      --out-hull gridlock/packages/client/src/assets/units/tiger-hull.png \\
      --out-turret gridlock/packages/client/src/assets/units/tiger-turret.png \\
      --out-cameo gridlock/packages/client/src/assets/units/tiger-cameo.png
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

from PIL import Image, ImageDraw

ENGINE_ORDER = [
    "E",
    "ESE",
    "SE",
    "SSE",
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
]


def list_frames(d: Path) -> list[Path]:
    files = [p for p in d.iterdir() if p.suffix.lower() == ".png"]

    def end_num(p: Path) -> int | None:
        m = re.search(r"(\d+)$", p.stem)
        return int(m.group(1)) if m else None

    numbered = [(n, p) for p in files if (n := end_num(p)) is not None and 1 <= n <= 16]
    if len({n for n, _ in numbered}) == 16:
        return [p for _, p in sorted(numbered)]

    def key(p: Path) -> tuple[int, str]:
        n = end_num(p)
        return (n if n is not None else 0, p.name)

    ordered = sorted(files, key=key)
    if len(ordered) >= 16:
        return ordered[:16]
    raise SystemExit(f"{d}: expected 0001.png–0016.png (0017 ignored), found {len(files)}")


def opaque_bbox(im: Image.Image, alpha_min: int = 8) -> tuple[int, int, int, int] | None:
    a = im.split()[-1]
    bb = a.point(lambda v: 255 if v >= alpha_min else 0).getbbox()
    return bb


def union_bbox(boxes: list[tuple[int, int, int, int]]) -> tuple[int, int, int, int]:
    return (
        min(b[0] for b in boxes),
        min(b[1] for b in boxes),
        max(b[2] for b in boxes),
        max(b[3] for b in boxes),
    )


def place(src: Image.Image, cell: int, scale: float, ox: float, oy: float) -> Image.Image:
    out = Image.new("RGBA", (cell, cell), (0, 0, 0, 0))
    nw = max(1, round(src.size[0] * scale))
    nh = max(1, round(src.size[1] * scale))
    scaled = src.resize((nw, nh), Image.Resampling.LANCZOS)
    out.alpha_composite(scaled, (round(ox), round(oy)))
    return out


def preview_strip(cells: list[Image.Image], draw: int) -> Image.Image:
    strip = Image.new("RGBA", (16 * draw, draw), (40, 40, 44, 255))
    for i, im in enumerate(cells):
        small = im.resize((draw, draw), Image.Resampling.LANCZOS)
        strip.alpha_composite(small, (i * draw, 0))
    return strip


def preview_turntable(cells: list[Image.Image], cell: int) -> Image.Image:
    label_h = 18
    canvas = Image.new("RGB", (4 * cell, 4 * (cell + label_h)), (40, 40, 44))
    draw = ImageDraw.Draw(canvas)
    for i, name in enumerate(ENGINE_ORDER):
        r, c = divmod(i, 4)
        x, y = c * cell, r * (cell + label_h)
        canvas.paste(cells[i].convert("RGB"), (x, y), cells[i])
        draw.text((x + 4, y + cell + 2), f"{i} {name}", fill=(220, 214, 200))
    return canvas


def diagnostics(cells: list[Image.Image], cell: int) -> list[dict]:
    rows = []
    heights: list[int] = []
    for i, name in enumerate(ENGINE_ORDER):
        bb = opaque_bbox(cells[i])
        rec: dict = {"i": i, "dir": name, "empty": bb is None}
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


def write_sheet(cells: list[Image.Image], cell: int, path: Path) -> Image.Image:
    sheet = Image.new("RGBA", (cell, 16 * cell), (0, 0, 0, 0))
    for i, im in enumerate(cells):
        sheet.alpha_composite(im, (0, i * cell))
    path.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(path)
    return sheet


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--src", type=Path, required=True, help="Folder with hull and turret subdirs of 16 PNGs")
    p.add_argument("--hull-subdir", default="husk")
    p.add_argument("--turret-subdir", default="turret")
    p.add_argument("--start-facing", default="S", help="Engine dir of frame 1 (camera-facing). Default S.")
    p.add_argument("--cell", type=int, default=128)
    p.add_argument("--contact-y", type=float, default=0.92)
    p.add_argument("--padding", type=int, default=4)
    p.add_argument("--id", default="tiger")
    p.add_argument("--out-hull", type=Path, required=True)
    p.add_argument("--out-turret", type=Path, required=True)
    p.add_argument("--out-cameo", type=Path, default=None)
    p.add_argument("--cameo-dir", default="SE", help="Engine dir used for the cameo")
    p.add_argument("--cameo-size", type=int, default=128)
    p.add_argument("--preview-dir", type=Path, default=Path("tools/sprites/preview"))
    p.add_argument("--src-out", type=Path, default=None, help="Write remapped E.png…ENE.png here (hull/ and turret/)")
    p.add_argument("--draw-size", type=int, default=55)
    return p.parse_args()


def main() -> int:
    args = parse_args()
    start = args.start_facing.upper()
    if start not in ENGINE_ORDER:
        raise SystemExit(f"unknown start facing {start}")
    start_i = ENGINE_ORDER.index(start)

    hull_files = list_frames(args.src / args.hull_subdir)
    turret_files = list_frames(args.src / args.turret_subdir)

    hull_src: dict[str, Image.Image] = {}
    turret_src: dict[str, Image.Image] = {}
    boxes: list[tuple[int, int, int, int]] = []
    hull_bottoms: list[int] = []
    for i in range(16):
        name = ENGINE_ORDER[(start_i + i) % 16]
        h = Image.open(hull_files[i]).convert("RGBA")
        t = Image.open(turret_files[i]).convert("RGBA")
        hull_src[name] = h
        turret_src[name] = t
        hb = opaque_bbox(h)
        tb = opaque_bbox(t)
        if not hb:
            raise SystemExit(f"empty hull frame {hull_files[i]}")
        if not tb:
            raise SystemExit(f"empty turret frame {turret_files[i]}")
        boxes.append(hb)
        boxes.append(tb)
        hull_bottoms.append(hb[3])

    union = union_bbox(boxes)
    uw, uh = union[2] - union[0], union[3] - union[1]
    max_w = max(1, args.cell - 2 * args.padding)
    max_h = max(1, args.cell - 2 * args.padding)
    scale = min(max_w / uw, max_h / uh, 1.0)
    # Rotation pivot is the Blender canvas center (same camera for hull + turret).
    cx, cy = hull_src["E"].size[0] / 2, hull_src["E"].size[1] / 2
    med_bottom = sorted(hull_bottoms)[len(hull_bottoms) // 2]
    ox = args.cell / 2 - cx * scale
    oy = args.cell * args.contact_y - med_bottom * scale

    hull_cells = [place(hull_src[n], args.cell, scale, ox, oy) for n in ENGINE_ORDER]
    turret_cells = [place(turret_src[n], args.cell, scale, ox, oy) for n in ENGINE_ORDER]
    combo_cells = []
    for h, t in zip(hull_cells, turret_cells):
        c = h.copy()
        c.alpha_composite(t)
        combo_cells.append(c)

    preview_dir = args.preview_dir
    preview_dir.mkdir(parents=True, exist_ok=True)

    write_sheet(hull_cells, args.cell, args.out_hull)
    write_sheet(turret_cells, args.cell, args.out_turret)

    if args.src_out:
        for part, src in (("hull", hull_src), ("turret", turret_src)):
            d = args.src_out / part
            d.mkdir(parents=True, exist_ok=True)
            for name, im in src.items():
                im.save(d / f"{name}.png")

    cameo_path = args.out_cameo
    if cameo_path:
        face = args.cameo_dir.upper()
        if face not in ENGINE_ORDER:
            raise SystemExit(f"unknown cameo dir {face}")
        cameo_src = combo_cells[ENGINE_ORDER.index(face)]
        bb = opaque_bbox(cameo_src)
        if not bb:
            raise SystemExit("cameo source empty")
        cropped = cameo_src.crop(bb)
        size = args.cameo_size
        pad = 8
        fit = min((size - 2 * pad) / cropped.size[0], (size - 2 * pad) / cropped.size[1], 1.0)
        nw, nh = max(1, round(cropped.size[0] * fit)), max(1, round(cropped.size[1] * fit))
        small = cropped.resize((nw, nh), Image.Resampling.LANCZOS)
        cameo = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        cameo.alpha_composite(small, ((size - nw) // 2, (size - nh) // 2))
        cameo_path.parent.mkdir(parents=True, exist_ok=True)
        cameo.save(cameo_path)

    hull_diag = diagnostics(hull_cells, args.cell)
    turret_diag = diagnostics(turret_cells, args.cell)
    combo_diag = diagnostics(combo_cells, args.cell)
    empties = [d["dir"] for d in hull_diag + turret_diag if d.get("empty")]
    hull_pops = [d["dir"] for d in hull_diag if d.get("pop")]
    turret_pops = [d["dir"] for d in turret_diag if d.get("pop")]

    preview_turntable(combo_cells, args.cell).save(preview_dir / f"{args.id}-turntable.png")
    preview_strip(combo_cells, args.draw_size).save(preview_dir / f"{args.id}-strip.png")
    preview_strip(hull_cells, args.draw_size).save(preview_dir / f"{args.id}-hull-strip.png")
    preview_strip(turret_cells, args.draw_size).save(preview_dir / f"{args.id}-turret-strip.png")

    # Independent aim: east hull + every turret dir, same dest rect.
    mixed = []
    east_hull = hull_cells[0]
    for t in turret_cells:
        m = east_hull.copy()
        m.alpha_composite(t)
        mixed.append(m)
    preview_strip(mixed, args.draw_size).save(preview_dir / f"{args.id}-turret-aim-strip.png")

    clip = []
    for i, name in enumerate(ENGINE_ORDER):
        for label, im in (("hull", hull_cells[i]), ("turret", turret_cells[i])):
            bb = opaque_bbox(im)
            if not bb:
                continue
            if bb[0] <= 0 or bb[1] <= 0 or bb[2] >= args.cell or bb[3] >= args.cell:
                clip.append(f"{label}:{name}")

    manifest = {
        "id": args.id,
        "cell": args.cell,
        "cols": 1,
        "rows": 16,
        "facing": 16,
        "order": ENGINE_ORDER,
        "source_start": start,
        "source": "blender-sixteen",
        "contactY": args.contact_y,
        "scale": round(scale, 4),
        "offset": [round(ox, 2), round(oy, 2)],
        "union": {"x0": union[0], "y0": union[1], "x1": union[2], "y1": union[3], "w": uw, "h": uh},
        "out_hull": str(args.out_hull),
        "out_turret": str(args.out_turret),
        "out_cameo": str(cameo_path) if cameo_path else None,
        "empty_dirs": empties,
        "hull_size_pop_dirs": hull_pops,
        "turret_size_pop_dirs": turret_pops,
        "clip_dirs": clip,
        "hull_diag": hull_diag,
        "turret_diag": turret_diag,
        "combo_diag": combo_diag,
    }
    (preview_dir / f"{args.id}-manifest.json").write_text(json.dumps(manifest, indent=2))
    summary = {
        k: manifest[k]
        for k in (
            "id",
            "cell",
            "scale",
            "offset",
            "empty_dirs",
            "hull_size_pop_dirs",
            "turret_size_pop_dirs",
            "clip_dirs",
            "out_hull",
            "out_turret",
        )
    }
    print(json.dumps(summary, indent=2))
    if empties:
        print("FAIL: empty dirs", empties, file=sys.stderr)
        return 2
    if clip:
        print("WARN: opaque pixels on cell edge:", clip, file=sys.stderr)
    if hull_pops:
        print("WARN: hull size pop vs median height:", hull_pops, file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
