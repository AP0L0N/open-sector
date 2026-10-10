#!/usr/bin/env python3
"""Wing-stroke previews and the body-stability check for the Xenomorph fliers.

  python3 tools/sprites/preview_xeno_strokes.py [wasp scourge gnat] [--faces 1,3,13]

Per unit: tools/sprites/preview/<id>-strokes.png (hull | wingup | wingdown for
the picked faces, raw 256 cells at 2x on a dark ground, plus the gameplay size
~ the drawSize next to it). Then the check: each stroke is rendered once more
with the wings left out (same camera, canvas, ss) and every face's body-only
image must be byte-identical across the three strokes; the union bbox of the
three strokes vs the hull alone is printed per unit (composeAligned shares it).
"""

from __future__ import annotations

import argparse
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

import render_xeno_air as xa
from render_procedural import render_turntable

PREVIEW = Path(__file__).resolve().parent / "preview"
DRAW = {"wasp": 51, "scourge": 63, "gnat": 41}


def faces(unit: str, stroke: str) -> list[Image.Image]:
    return [Image.open(xa.UNITS / unit / stroke / f"{k:04d}.png").convert("RGBA") for k in range(1, 17)]


def union(boxes):
    boxes = [b for b in boxes if b]
    return (min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes))


def board(unit: str, picks: list[int]) -> Path:
    strokes = list(xa.STROKES)
    big, lab = 2, 16
    W = len(strokes) * 256 * big
    H = len(picks) * (256 * big + lab)
    img = Image.new("RGB", (W + 3 * 80, H), (34, 46, 40))
    d = ImageDraw.Draw(img)
    sets = {s: faces(unit, s) for s in strokes}
    ub = union([im.getbbox() for s in strokes for im in sets[s]])
    for r, k in enumerate(picks):
        for c, s in enumerate(strokes):
            a = sets[s][k - 1].resize((256 * big, 256 * big), Image.NEAREST)
            x, y = c * 256 * big, r * (256 * big + lab)
            img.paste(a.convert("RGB"), (x, y + lab), a)
            d.text((x + 4, y + 2), f"{unit} {s} {k:04d}", fill=(220, 230, 220))
            # Gameplay size: crop to the shared union box, fit drawSize.
            cr = sets[s][k - 1].crop(ub)
            f = DRAW[unit] / max(cr.width, cr.height)
            sm = cr.resize((max(1, round(cr.width * f)), max(1, round(cr.height * f))), Image.LANCZOS)
            img.paste(sm.convert("RGB"), (W + c * 80 + 8, y + lab + 40), sm)
    out = PREVIEW / f"{unit}-strokes.png"
    img.save(out)
    return out


def body_check(unit: str, ss: int) -> None:
    build, z_mid, *_ = xa.UNITS_SPEC[unit]
    real_wing = xa.wing
    xa.wing = lambda *a, **k: None  # wings out: the body alone
    try:
        with tempfile.TemporaryDirectory() as tmp:
            arrs = {}
            for s, (fo, hi) in xa.FLAPPERS[unit].items():
                out = Path(tmp) / s
                render_turntable(build(fo, hi), out, "x", f"{s}.json", xa.SCALE_FRAC, z_mid, cell=256, ss=ss)
                arrs[s] = [np.asarray(Image.open(out / f"{k:04d}.png")) for k in range(1, 17)]
            same = all(np.array_equal(arrs["hull"][i], arrs[s][i]) for s in arrs for i in range(16))
            print(f"{unit}: body-only frames identical across strokes: {same}")
            body_bb = union([Image.fromarray(a).getbbox() for a in arrs["hull"]])
            print(f"  body-only union bbox {body_bb}")
            # The shipped hull still comes out of this code byte for byte (dihedral 0 = old art).
            xa.wing = real_wing
            out = Path(tmp) / "hull_full"
            render_turntable(build(), out, "x", "h.json", xa.SCALE_FRAC, z_mid, cell=256, ss=ss)
            fresh = all(np.array_equal(np.asarray(Image.open(out / f"{k:04d}.png")), np.asarray(faces(unit, "hull")[k - 1]))
                        for k in range(1, 17))
            print(f"  shipped hull/ == fresh render: {fresh}")
    finally:
        xa.wing = real_wing
    hb = union([im.getbbox() for im in faces(unit, "hull")])
    ub = union([im.getbbox() for s in xa.STROKES for im in faces(unit, s)])
    print(f"  hull union bbox {hb} ({hb[2]-hb[0]}x{hb[3]-hb[1]}), all-strokes union {ub} ({ub[2]-ub[0]}x{ub[3]-ub[1]})")
    # composeAligned (STUKA_OPTS: contactY 0.8, padding 2) on the hull alone vs all three layers.
    from render_xeno_naval import fit_for
    one = fit_for([faces(unit, "hull")], 0.8, 2)
    three = fit_for([faces(unit, s) for s in xa.STROKES], 0.8, 2)
    print(f"  fit hull only: scale {one[0]:.4f} oy {one[2]:.2f};  hull+wingup+wingdown: scale {three[0]:.4f} oy {three[2]:.2f}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("units", nargs="*", default=list(xa.FLAPPERS))
    ap.add_argument("--faces", default="1,3,13")
    ap.add_argument("--no-check", action="store_true")
    ap.add_argument("--ss", type=int, default=4)
    args = ap.parse_args()
    picks = [int(x) for x in args.faces.split(",")]
    for u in args.units:
        print("wrote", board(u, picks))
        if not args.no_check:
            body_check(u, args.ss)


if __name__ == "__main__":
    main()
