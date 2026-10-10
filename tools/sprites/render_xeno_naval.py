#!/usr/bin/env python3
"""Xenite sea: the Leech (plasma skiff) and the Lurker (sea beast). One 16-face hull each.

The Xenite answer to the Attack Boat and the Submarine (render_naval.py), under
their lock: same numpy rasterizer (render_procedural), camera, light, outline,
meters -> px (NAVAL_SCALE), z mid, centring, waterline cut over a wake, 256
source cell composed to 128 at runtime with NAVAL_OPTS (contactY 0.74,
padding 2). The look is the Xenite walkers' (xeno_walker.py): cold grey-green
alloy plates, dark chitin, sickly green glow seams, gray team plate.

  leech   a fast plasma skiff: a low, ribbed eel hull riding on four
          water-strider legs with chitin pads on the water, a green glow in
          the water under the belly, sensor eyes and a ram at the bow, and a
          small domed plasma turret on the foredeck (baked in, like the
          gunboat's 20mm).
  lurker  a sea beast, not a boat: a plated head reared up out of the water
          on an arched neck, jaws open on rows of pale fangs over a glowing
          throat, green eyes and a spine crest; behind it three coils of the
          body break the surface, ribbed and spined, glow gills down their
          flanks, the middle coil carrying the gray team band; two clawed
          fore-flippers paddle at the waterline and a forked tail fluke
          lifts out at the stern. Rings of white water round every coil.

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

# Glow in the water under a Xenite hull: dimmer than the seams, lit flat.
rp.MAT.update(
    {
        "uglow": (rp.hex_rgb("#2fb57c"), 0.0, 1.0),
        "uglow_hi": (rp.hex_rgb("#5fe8a8"), 0.0, 1.0),
        "pad": (rp.hex_rgb("#2e3631"), 0.12, 1.0),
        "fang": (rp.hex_rgb("#d8d4c4"), 0.06, 1.0),
        "gum": (rp.hex_rgb("#3b2a2c"), 0.08, 1.0),
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
    """72 px static cameo (the gunboat's size) from the south-east face, brightened like the Xenite cameos."""
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


def jaw(m: Mesh, root, tip, r0: float, r1: float, up: int, fangs: int = 5) -> None:
    """One jaw: a tapered chitin bone, a dark gum along its inner edge, a row of pale fangs pointing at the other jaw."""
    root = np.asarray(root, float)
    tip = np.asarray(tip, float)
    tube(m, root, tip, r0, r1, "chitin", n=9)
    for k in range(fangs):
        t = 0.18 + 0.74 * k / max(1, fangs - 1)
        p = root + (tip - root) * t
        r = r0 + (r1 - r0) * t
        for s in (-1, 1):
            base = p + np.array([0.0, s * r * 0.55, -up * r * 0.55])
            tube(m, base, base + np.array([0.05, -s * 0.04, -up * (0.38 - 0.18 * t)]), 0.09, 0.015, "fang", n=5)
        knob(m, p + np.array([0.0, 0.0, -up * r * 0.6]), r * 0.5, "gum")


def coil(m: Mesh, x: float, length: float, beam: float, rise: float, spines: int, team: bool = False) -> None:
    """One coil of the body arched out of the water: a ribbed shell cut at the waterline, a spine crest, glow gills."""
    shell(m, (x, 0.0, -rise * 0.25), (length, beam, rise), 3, team=(1, 1) if team else None, seg=18)
    for k in range(spines):
        t = (k + 0.5) / spines - 0.5
        sx = x + t * length * 1.3
        h = rise * 0.75 * math.sqrt(max(0.0, 1 - (2 * t) ** 2))
        tube(m, (sx, 0.0, h + 0.05), (sx - 0.5, 0.0, h + 0.7), 0.17, 0.02, "claw", n=5)
    for s in (-1, 1):
        for k in (-1, 0, 1):
            gx = x + k * length * 0.32
            m.box((gx - 0.1, s * beam * 0.92 - 0.06, 0.08), (gx + 0.1, s * beam * 0.92 + 0.06, rise * 0.45), "seam")


def build_lurker() -> Mesh:
    """Sea beast in meters. +x head, +y left, +z up. Waterline at z=0: only what clears it is drawn."""
    m = Mesh()
    # Neck: rises from under the water and arches up to the head.
    neck = [(4.4, 0.0, -0.4), (5.6, 0.0, 0.9), (6.7, 0.0, 1.75), (7.5, 0.0, 2.15)]
    for (a, b), r in zip(zip(neck, neck[1:]), (0.95, 0.82, 0.72)):
        tube(m, a, b, r, r * 0.88, "alloy" if r > 0.8 else "alloy_hi", n=12)
        knob(m, b, r * 0.86, "alloy_hi")
    for p in neck[1:]:
        tube(m, (p[0] - 0.1, 0.0, p[2] + 0.6), (p[0] - 0.65, 0.0, p[2] + 1.3), 0.2, 0.02, "claw", n=5)
    for s in (-1, 1):
        for p in neck[1:3]:
            knob(m, (p[0], s * 0.62, p[2] - 0.1), 0.16, "seam")
    # Head: a plated skull, a spine crest swept back, green eyes, a brow ridge.
    shell(m, (8.35, 0.0, 2.25), (1.55, 1.05, 0.9), 2, seg=16)
    for k, dx in enumerate((0.0, -0.55, -1.1)):
        tube(m, (7.9 + dx, 0.0, 2.8), (7.2 + dx, 0.0, 3.75 - k * 0.25), 0.22, 0.02, "claw", n=5)
    for s in (-1, 1):
        knob(m, (9.05, s * 0.72, 2.65), 0.28, "eye")
        knob(m, (8.65, s * 0.86, 2.6), 0.18, "eye")
        tube(m, (8.4, s * 0.7, 3.0), (9.4, s * 0.6, 2.9), 0.16, 0.06, "chitin", n=5)
    # Jaws wide open on a glowing throat.
    jaw(m, (9.3, 0.0, 2.45), (11.7, 0.0, 2.55), 0.62, 0.2, up=1, fangs=6)
    jaw(m, (9.1, 0.0, 1.85), (11.1, 0.0, 0.85), 0.52, 0.16, up=-1, fangs=5)
    knob(m, (9.6, 0.0, 2.05), 0.46, "core")
    ellipsoid(m, (10.1, 0.0, 1.9), (0.7, 0.38, 0.28), "gum", rings=5, seg=10)
    # Two clawed fore-flippers paddling at the waterline beside the neck.
    for s in (-1, 1):
        tube(m, (4.9, s * 0.7, 0.05), (5.7, s * 1.9, 0.32), 0.3, 0.2, "limb", n=7)
        knob(m, (5.7, s * 1.9, 0.32), 0.24, "alloy")
        for k in (-1, 0, 1):
            tube(m, (5.7, s * 1.9, 0.32), (6.35 + 0.1 * k, s * (2.2 + 0.25 * k), 0.12), 0.1, 0.02, "claw", n=5)
    # Three coils of the body break the surface behind it, the middle one with the team band.
    coil(m, 1.8, 2.0, 1.05, 1.35, 3)
    coil(m, -2.6, 1.8, 0.92, 1.15, 3, team=True)
    coil(m, -6.4, 1.4, 0.72, 0.85, 2)
    # Forked tail fluke lifted out of the water at the stern.
    knob(m, (-8.7, 0.0, 0.15), 0.4, "alloy")
    for s in (-1, 1):
        tube(m, (-8.8, 0.0, 0.25), (-10.1, s * 1.05, 1.15), 0.3, 0.05, "chitin", n=7)
        tube(m, (-9.4, s * 0.45, 0.6), (-10.0, s * 0.95, 0.75), 0.09, 0.03, "seam", n=5)
    return m


def lurker_wake() -> Mesh:
    """Dark water along the beast with the hive glow under it, and a ring of white water round each coil."""
    m = Mesh()
    ellipse(m, 0.02, 0.3, 0.0, 11.2, 2.0, "water")
    for cx, rx, ry in ((5.4, 2.4, 2.6), (1.8, 2.4, 1.35), (-2.6, 2.2, 1.2), (-6.4, 1.8, 1.0), (-9.3, 1.6, 1.4)):
        ellipse(m, 0.03, cx, 0.0, rx * 0.7, ry * 0.6, "uglow")
        ring(m, 0.06, cx, 0.0, rx * 0.86, ry * 0.86, rx, ry, "foam")
    return m


# ---------------------------------------------------------------- render


UNITS_SPEC = {
    # id: (builder, wake, EU ref, EU ref drawSize base (before UNIT_VISUAL_SCALE), meters -> px share of NAVAL_SCALE)
    # The Lurker is drawn at 0.66 of NAVAL_SCALE so its 25 m with the wake fits the 256 source cell
    # (the EU Submarine runs off its cell at east / west); drawSize puts the px per meter back.
    "leech": (build_leech, lambda: xeno_wake(7.6, 3.6, 6.0, 1.95, -0.3), "gunboat", 48.0, 1.0),
    "lurker": (build_lurker, lurker_wake, "submarine", 64.0 * 1.2, 0.66),
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
