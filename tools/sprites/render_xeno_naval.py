#!/usr/bin/env python3
"""Xenomorph boats: the Leech (plasma skiff) and the Lurker (submarine). One 16-face hull each.

The Xenomorph answer to the Attack Boat and the Submarine (render_naval.py), under
their lock: same numpy rasterizer (render_procedural), camera, light, outline,
meters -> px (NAVAL_SCALE), z mid, centring, waterline cut over a wake, 256
source cell composed to 128 at runtime with NAVAL_OPTS (contactY 0.74,
padding 2). The look is the Xenomorph walkers' (xeno_walker.py): cold grey-green
alloy plates, dark chitin, sickly green glow seams, gray team plate.

  leech   a fast plasma skiff: a low, ribbed eel hull riding on four
          water-strider legs with chitin pads on the water, a green glow in
          the water under the belly, sensor eyes and a ram at the bow, and a
          small domed plasma turret on the foredeck (baked in, like the
          gunboat's 20mm).
  lurker  a submarine running awash: a long ribbed eel hull mostly under
          the water, a row of dorsal spines, a swept dorsal sensor fin with a
          gray team band and a sensor eye, glowing gill slits down each side,
          twin glowing torpedo ports at the bow, a tail fluke.

Row 0 = bow screen-south, then clockwise 22.5 deg through row 15. No insignia.

  python3 tools/sprites/render_xeno_naval.py leech
  python3 tools/sprites/render_xeno_naval.py lurker
  python3 tools/sprites/render_xeno_naval.py all

Writes gridlock/packages/client/src/assets/units/<id>/hull/0001..0016.png,
<id>/<id>-hull.json, <id>-cameo.png (72 px), and previews in
tools/sprites/preview/<id>-*.png. Prints the fit numbers and a drawSize that
keeps the EU equivalent's px per meter.
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

import render_procedural as rp
from render_procedural import Mesh, render_turntable

import xeno_walker as bw
import render_seed as rs
from xeno_walker import dome, ellipsoid, knob, leg, shell, tube, tube_x
from render_naval import NAVAL_SCALE, NAVAL_Z_MID, build_wake, ellipse, ring, write_cameo as _unused  # noqa: F401

ROOT = Path(__file__).resolve().parents[2]
UNITS = ROOT / "gridlock/packages/client/src/assets/units"
PREVIEW = Path(__file__).resolve().parent / "preview"
NAMES = bw.NAMES

# Glow in the water under a Xenomorph hull: dimmer than the seams, lit flat.
rp.MAT.update(
    {
        "uglow": (rp.hex_rgb("#2fb57c"), 0.0, 1.0),
        "uglow_hi": (rp.hex_rgb("#5fe8a8"), 0.0, 1.0),
        "pad": (rp.hex_rgb("#2e3631"), 0.12, 1.0),
    }
)
rs.EMISSIVE.update({"uglow", "uglow_hi"})


# ---------------------------------------------------------------- shared check


def fit_for(layers: list[list[Image.Image]], contact_y: float, padding: int):
    bw.CONTACT_Y = contact_y
    bw.PADDING = padding
    return bw.fit(layers)


def check(unit: str, folder: Path, contact_y: float, padding: int, ref: str | None, ref_draw: float | None,
          ref_note: str = "", scale_mul: float = 1.0) -> dict:
    """The runtime fit (composeAligned) in Python: empty / clipped / size_pop, previews, drawSize at the ref's px per meter."""
    raw = bw.frames(folder)
    scale, ox, oy, union = fit_for([raw], contact_y, padding)
    cells = [bw.place(im, scale, ox, oy) for im in raw]
    empty, clipped, heights, bottoms = [], [], [], []
    for i, c in enumerate(cells):
        b = bw.bbox(c)
        if not b:
            empty.append(NAMES[i])
            heights.append(0)
            bottoms.append(0)
            continue
        if b[0] <= 0 or b[1] <= 0 or b[2] >= bw.CELL or b[3] >= bw.CELL:
            clipped.append(NAMES[i])
        heights.append(b[3] - b[1])
        bottoms.append(b[3])
    med = sorted(heights)[len(heights) // 2]
    pops = [NAMES[i] for i, h in enumerate(heights) if med and abs(h - med) / med > 0.12]
    rep = {"unit": unit, "fit_scale": round(scale, 4), "empty_dirs": empty, "clipped_dirs": clipped,
           "size_pop_dirs": pops, "heights": heights, "bottoms": bottoms}
    if ref:
        ref_raw = bw.frames(UNITS / ref / "hull")
        rscale, *_ = fit_for([ref_raw], contact_y, padding)
        rep["ref"] = ref
        rep["ref_fit_scale"] = round(rscale, 4)
        # Equal map px per meter: drawSize x ref_fit / (fit x this unit's meters -> px share of the ref's).
        rep["drawSize_base"] = round(ref_draw * rscale / (scale * scale_mul), 1)
        rep["ref_note"] = ref_note
    PREVIEW.mkdir(parents=True, exist_ok=True)
    big, lab = 2, 14
    board = Image.new("RGB", (4 * bw.CELL * big, 4 * (bw.CELL * big + lab)), (44, 74, 98))
    d = ImageDraw.Draw(board)
    for i in range(16):
        r, c = divmod(i, 4)
        a = cells[i].resize((bw.CELL * big, bw.CELL * big), Image.NEAREST)
        x, y = c * bw.CELL * big, r * (bw.CELL * big + lab)
        board.paste(a.convert("RGB"), (x, y), a)
        yy = y + round(contact_y * bw.CELL * big)
        d.line((x, yy, x + bw.CELL * big, yy), fill=(160, 40, 40))
        d.text((x + 4, y + bw.CELL * big + 1), f"{i} {NAMES[i]}", fill=(240, 236, 220))
    board.save(PREVIEW / f"{unit}-turntable.png")
    strip = Image.new("RGBA", (16 * bw.CELL, bw.CELL + lab), (44, 74, 98, 255))
    ds = ImageDraw.Draw(strip)
    for i in range(16):
        strip.alpha_composite(cells[i], (i * bw.CELL, 0))
        ds.text((i * bw.CELL + 4, bw.CELL + 1), f"{i} {NAMES[i]}", fill=(240, 236, 220, 255))
    strip.save(PREVIEW / f"{unit}-strip.png")
    if ref_draw:
        gsz = round(rep["drawSize_base"] * 1.25)
        gp = Image.new("RGBA", (16 * (gsz + 4), gsz + 4), (44, 74, 98, 255))
        for i in range(16):
            gp.alpha_composite(cells[i].resize((gsz, gsz), Image.LANCZOS), (i * (gsz + 4) + 2, 2))
        gp.save(PREVIEW / f"{unit}-gameplay.png")
    (PREVIEW / f"{unit}-manifest.json").write_text(json.dumps(rep, indent=2) + "\n")
    print(json.dumps({k: v for k, v in rep.items() if k not in ("heights", "bottoms")}, indent=1))
    print("heights", heights)
    print("bottoms", bottoms)
    return rep


def cameo72(faces: Path, path: Path, face: str = "0015", gain: float = 1.25, lift: float = 0.03) -> None:
    """72 px static cameo (the gunboat's size) from the south-east face, brightened like the Xenomorph cameos."""
    im = Image.open(faces / f"{face}.png").convert("RGBA")
    crop = im.crop(bw.bbox(im))
    px = np.asarray(crop).astype(np.float64) / 255
    rgb = px[..., :3]
    dark = rgb.max(axis=-1, keepdims=True) < 0.12
    px[..., :3] = np.where(dark, rgb, np.clip(rgb * gain + lift, 0, 1))
    crop = Image.fromarray((px * 255 + 0.5).astype(np.uint8), "RGBA")
    f = min(66 / crop.width, 66 / crop.height)
    small = crop.resize((max(1, round(crop.width * f)), max(1, round(crop.height * f))), Image.Resampling.LANCZOS)
    cam = Image.new("RGBA", (72, 72), (0, 0, 0, 0))
    cam.alpha_composite(small, ((72 - small.width) // 2, (72 - small.height) // 2))
    cam.save(path)
    print("wrote", path)


# ---------------------------------------------------------------- wake with a green glow under the hull


def xeno_wake(length: float, beam: float, glow_len: float, glow_beam: float, cx: float = 0.0) -> Mesh:
    m = Mesh()
    ellipse(m, 0.02, cx, 0.0, length, beam, "water")
    ellipse(m, 0.03, cx, 0.0, glow_len, glow_beam, "uglow")
    ellipse(m, 0.035, cx, 0.0, glow_len * 0.8, glow_beam * 0.7, "uglow_hi")
    ring(m, 0.05, cx, 0.0, length * 0.86, beam * 0.78, length * 0.98, beam * 0.95, "foam")
    return m


# ---------------------------------------------------------------- Leech


def build_leech() -> Mesh:
    """Plasma skiff in meters. +x bow, +y port, +z up. Waterline at z=0."""
    m = Mesh()
    # Low ribbed eel hull, mostly above the water; team plate on the third rib.
    shell(m, (-0.2, 0.0, 0.12), (5.6, 1.05, 0.78), 5, team=(2, 2))
    # Ram at the bow, sensor eyes either side of it.
    tube(m, (5.0, 0.0, 0.42), (6.45, 0.0, 0.28), 0.32, 0.04, "claw", n=7)
    for s in (-1, 1):
        knob(m, (4.55, s * 0.42, 0.7), 0.14, "eye")
        knob(m, (4.15, s * 0.6, 0.72), 0.1, "eye")
    # Spine crest aft of the turret, and a glowing drive bulb at the stern.
    for k, x in enumerate((0.6, -0.6, -1.8, -3.0)):
        tube(m, (x, 0.0, 0.82), (x - 0.55, 0.0, 1.25 - k * 0.05), 0.16, 0.03, "chitin", n=5)
    ellipsoid(m, (-5.55, 0.0, 0.35), (0.42, 0.34, 0.3), "core", rings=6, seg=10)
    tube_x(m, -5.35, -4.75, 0.0, 0.35, 0.36, "chitin", n=10)
    # Four water-strider legs: hip on the flank, knee up and out, pad flat on the water.
    for s in (-1, 1):
        for hx, fx in ((2.0, 3.3), (-2.4, -3.7)):
            leg(m, (hx, s * 0.82, 0.45), (hx + (fx - hx) * 0.35, s * 2.0, 1.35),
                (hx + (fx - hx) * 0.85, s * 2.85, 0.5), (fx, s * 3.05, 0.1), r=0.17, plate=False)
            ellipsoid(m, (fx, s * 3.1, 0.12), (0.62, 0.3, 0.14), "pad", rings=6, seg=10)
            knob(m, (fx + 0.1, s * 3.1, 0.24), 0.09, "seam")
    # Plasma turret on the foredeck: a chitin dome, a short barrel, glowing coils, a hot muzzle.
    tx, tz = 1.9, 0.74
    seg = 16
    dome(m, tx, 0.0, tz, 0.88, 0.82, 0.62, bw.banded_dome_mat(seg, (3,), team_seg=seg // 2, team_rings=(2,)), rings=5, seg=seg)
    gz = tz + 0.55
    ellipsoid(m, (tx + 0.62, 0.0, gz), (0.32, 0.3, 0.28), "chitin", rings=5, seg=10)
    tube_x(m, tx + 0.8, tx + 2.55, 0.0, gz, 0.14, "barrel", n=8)
    for x in (tx + 1.2, tx + 1.7):
        tube_x(m, x, x + 0.14, 0.0, gz, 0.21, "seam", n=8)
    for s in (-1, 1):
        tube(m, (tx + 2.45, s * 0.15, gz), (tx + 2.95, s * 0.07, gz), 0.07, 0.03, "claw", n=5)
    knob(m, (tx + 2.7, 0.0, gz), 0.2, "core")
    return m


# ---------------------------------------------------------------- Lurker


def build_lurker() -> Mesh:
    """Submarine running awash, meters. +x bow, +y port, +z up. Waterline at z=0."""
    m = Mesh()
    # Long ribbed eel hull, axis under the water: only the back clears it.
    shell(m, (0.0, 0.0, -0.45), (11.4, 1.38, 1.3), 8, team=(3, 3), seg=20)
    # Row of dorsal spines, swept back.
    for k, x in enumerate((8.2, 6.8, -1.6, -3.0, -4.4, -5.8, -7.2, -8.4)):
        h = 0.55 if abs(x) < 6 else 0.4
        tube(m, (x, 0.0, 0.72), (x - 0.6, 0.0, 0.8 + h), 0.2, 0.03, "chitin", n=5)
    # Dorsal sensor fin: a swept blade, gray team band, a sensor eye in its leading edge.
    plan = [(1.6, 0.0), (1.0, 0.42), (-1.2, 0.5), (-2.6, 0.0), (-1.2, -0.5), (1.0, -0.42)]
    levels = [(0.55, 0.0, 1.0), (1.5, -0.45, 0.82), (1.8, -0.6, 0.78), (2.15, -0.8, 0.7), (2.5, -1.05, 0.6), (3.35, -1.9, 0.3)]
    fin = [[np.array([x * k + dx, y * k, z]) for x, y in plan] for z, dx, k in levels]
    m.loft(fin, lambda r, s: "team" if r == 1 else ("seam" if r == 3 else ("alloy" if s % 2 else "alloy_hi")))
    knob(m, (0.95, 0.0, 2.2), 0.2, "eye")
    tube(m, (-1.6, 0.0, 3.2), (-3.0, 0.0, 3.75), 0.07, 0.03, "barrel", n=5)  # sensor whip
    # Gill slits down each flank, just above the water.
    for s in (-1, 1):
        for x in (5.4, 4.7, 4.0, 3.3):
            m.box((x - 0.12, s * 1.2 - 0.06, 0.12), (x + 0.12, s * 1.2 + 0.06, 0.62), "seam")
            m.box((x + 0.12, s * 1.18 - 0.05, 0.1), (x + 0.3, s * 1.18 + 0.05, 0.66), "chitin")
    # Twin glowing torpedo ports at the bow, a chitin snout.
    tube(m, (10.6, 0.0, 0.15), (12.1, 0.0, 0.05), 0.42, 0.06, "chitin", n=8)
    for s in (-1, 1):
        knob(m, (10.35, s * 0.42, 0.32), 0.17, "core")
    # Tail fluke at the stern, lying on the water.
    for s in (-1, 1):
        tube(m, (-10.6, 0.0, 0.1), (-12.0, s * 1.3, 0.08), 0.18, 0.05, "chitin", n=6)
    knob(m, (-11.2, 0.0, 0.2), 0.14, "seam")
    return m


# ---------------------------------------------------------------- render


UNITS_SPEC = {
    # id: (builder, wake, EU ref, EU ref drawSize base (before UNIT_VISUAL_SCALE), meters -> px share of NAVAL_SCALE)
    # The Lurker is drawn at 0.66 of NAVAL_SCALE so its 25 m with the wake fits the 256 source cell
    # (the EU Submarine runs off its cell at east / west); drawSize puts the px per meter back.
    "leech": (build_leech, lambda: xeno_wake(7.6, 3.6, 6.0, 1.95, -0.3), "gunboat", 48.0, 1.0),
    "lurker": (build_lurker, lambda: xeno_wake(12.8, 2.3, 11.2, 1.9), "submarine", 64.0 * 1.2, 0.66),
}


def render(unit: str, ss: int = 4, check_only: bool = False) -> None:
    build, wake, ref, ref_draw, mul = UNITS_SPEC[unit]
    out = UNITS / unit / "hull"
    if not check_only:
        render_turntable(
            build(), out, f"{unit}_hull", f"{unit}-hull.json", NAVAL_SCALE * mul, NAVAL_Z_MID,
            cy_frac=0.56, cell=256, ss=ss, clip_z=0.0, underlay=wake(),
        )
    cameo72(out, UNITS / f"{unit}-cameo.png")
    check(unit, out, 0.74, 2, ref, ref_draw, "NAVAL_OPTS", scale_mul=mul)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("what", choices=["leech", "lurker", "all"])
    ap.add_argument("--ss", type=int, default=4)
    ap.add_argument("--check-only", action="store_true")
    args = ap.parse_args()
    for u in (UNITS_SPEC if args.what == "all" else [args.what]):
        render(u, args.ss, args.check_only)


if __name__ == "__main__":
    main()
