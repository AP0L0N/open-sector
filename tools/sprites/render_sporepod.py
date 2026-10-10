#!/usr/bin/env python3
"""Spore Pod: the Bloom's HQ on the move (mirrors the Xenomorph Seed). One 16-face hull.

A fork of render_seed.py under the same lock (the Rig's): same numpy rasterizer,
camera, light, outline, model scale, cell 192, contactY 0.9, one frame, 16 faces,
72 px cameo from the ESE face. The Bloom palette lock (bloom_beast_parts.py).

A fat ribbed seed-pod on six stubby root legs: ivory chitin ribs over wet flesh with
amber veins glowing in the grooves, a puckered vent on top, a horned nose so the front
reads, root tendrils trailing at the back, gray team-tint scutes on the back.

0001 = nose screen-south, then clockwise 22.5 deg through 0016.

  python3 tools/sprites/render_sporepod.py \\
      --out gridlock/packages/client/src/assets/units/sporepod
"""

from __future__ import annotations

import argparse
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

import bloom_beast_parts as bp
from bloom_beast_parts import V, blob, horn, knob, ribbed, sweep, team_plate, tube
from render_procedural import Mesh, render_turntable

# The Seed's (and the Rig's) scale, height and centring.
SCALE_FRAC = 0.086
Z_MID = 1.5
CY_FRAC = 0.64

CELL = 192
CONTACT_Y = 0.9
PADDING = 6
CAMEO_FACE = "0014"  # ESE, as the Rig and the Seed
CAMEO_SIZE = 72
CAMEO_GAIN = 1.45
CAMEO_LIFT = 0.04
# The Seed sheet's source-to-cell scale (its 16-face union fit): the same metres per cell px, so
# the Spore Pod drawn at SEED_SPRITE's drawSize stands at the Seed's and the Rig's scale.
SEED_SHEET_SCALE = 0.928

ENGINE_ORDER = ["S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW", "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE"]

POD = (-0.2, 0.0, 2.0)
POD_R = (2.55, 1.85, 1.45)


def root_leg(m: Mesh, side: int, hx: float, fdx: float) -> None:
    """A stubby root: thick at the body, bending out and down to a knot of root toes."""
    hip = V(hx, side * 1.25, 1.35)
    bend = V(hx + fdx * 0.4, side * 2.05, 1.05)
    foot = V(hx + fdx, side * 2.35, 0.12)
    pts = bp.curve(hip, bend + V(0, side * 0.2, 0.25), foot, 6)
    sweep(m, pts, [0.42, 0.38, 0.33, 0.28, 0.24, 0.2], lambda ri, s: "bn" if s in (2, 3, 4) else "fl_d", n=10)
    knob(m, hip + V(0, side * 0.1, 0.1), 0.42, "fl")
    knob(m, foot, 0.26, "bn_d")
    for a in (-0.7, 0.0, 0.7):
        d = V(math.cos(a) * 0.5, side * math.sin(a + math.pi / 2) * 0.35 + side * 0.15, 0)
        horn(m, foot, foot + d * 0.6 + V(0, 0, -0.02), foot + d + V(0, 0, -0.1), 0.12, "bn", steps=3, n=5)
    knob(m, bend + V(0, side * 0.15, 0.32), 0.12, "gl")


def build_hull() -> Mesh:
    m = Mesh()
    ribbed(m, POD, POD_R, 6, seg=20, plate_w=2, groove=0.06)
    # Membrane belly sac under the pod.
    blob(m, (POD[0], 0, POD[2] - 0.75), (POD_R[0] * 0.8, POD_R[1] * 0.75, 0.55), "mem", rings=8, seg=14)
    # Amber veins running along the flanks.
    for s in (-1, 1):
        for zoff, yk in ((0.25, 0.97), (-0.25, 0.95)):
            pts = []
            for t in np.linspace(-0.85, 0.85, 9):
                k = math.sqrt(max(0.0, 1 - t * t))
                pts.append(V(POD[0] + POD_R[0] * t, s * POD_R[1] * k * yk * math.cos(zoff), POD[2] + POD_R[2] * k * math.sin(zoff)))
            sweep(m, pts, [0.06] * len(pts), "gl", n=5)
    # Team-tint scutes on the back, either side of the vent.
    team_plate(m, (POD[0] + 1.35, 0, POD[2] + 1.2), (0.42, 0.5, 0.12))
    team_plate(m, (POD[0] - 1.45, 0, POD[2] + 1.17), (0.42, 0.5, 0.12))
    # Puckered vent on top: fleshy lips, ivory teeth, a hot amber throat.
    top = V(POD[0], 0, POD[2] + POD_R[2] - 0.05)
    sweep(m, [top, top + V(0, 0, 0.3), top + V(0, 0, 0.48)], [0.72, 0.62, 0.38], lambda ri, s: "fl_l" if s % 2 else "fl", n=12)
    knob(m, top + V(0, 0, 0.5), 0.3, "gl")
    knob(m, top + V(0, 0, 0.58), 0.15, "gl_h")
    for a in np.linspace(0, 2 * math.pi, 9)[:-1]:
        b = top + V(0.5 * math.cos(a), 0.5 * math.sin(a), 0.38)
        horn(m, b, b + V(0.15 * math.cos(a), 0.15 * math.sin(a), 0.2), b + V(-0.05 * math.cos(a), -0.05 * math.sin(a), 0.38), 0.09, "bn_l", steps=3, n=5)
    # Horned nose so the front reads; two amber eye-pits.
    nose = POD[0] + POD_R[0]
    horn(m, (nose - 0.25, 0, POD[2] + 0.1), (nose + 0.55, 0, POD[2] + 0.05), (nose + 0.9, 0, POD[2] + 0.55), 0.42, "bn_l", steps=6, n=10)
    for s in (-1, 1):
        knob(m, (nose - 0.35, s * 0.62, POD[2] + 0.42), 0.17, "gl")
    # Root tendrils trailing at the back.
    tail = POD[0] - POD_R[0]
    for dy, dz in ((0, 0.1), (-0.35, -0.2), (0.35, -0.2)):
        horn(m, (tail + 0.3, dy, POD[2] + dz), (tail - 0.4, dy * 1.6, POD[2] + dz - 0.4), (tail - 0.8, dy * 2.2, 0.3), 0.2, "fl_d", steps=5, n=7)
    for hx, fdx in ((1.35, 0.6), (-0.1, 0.0), (-1.5, -0.6)):
        for s in (-1, 1):
            root_leg(m, s, hx, fdx)
    return m


# ---------------------------------------------------------------- compose (the Seed's / the Rig's)


def opaque_bbox(im: Image.Image, alpha_min: int = 8):
    return im.split()[-1].point(lambda v: 255 if v >= alpha_min else 0).getbbox()


def compose_sheet(src: Path, sheet_path: Path, cameo_path: Path, preview: Path) -> None:
    frames = [Image.open(src / f"{i:04d}.png").convert("RGBA") for i in range(1, 17)]
    boxes = [opaque_bbox(im) for im in frames]
    if not all(boxes):
        raise SystemExit(f"empty sporepod frame in {src}")
    bottoms = [b[3] for b in boxes]
    union = (min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes))
    uw, uh = union[2] - union[0], union[3] - union[1]
    scale = min(SEED_SHEET_SCALE, (CELL - 2 * PADDING) / uw, (CELL - 2 * PADDING) / uh)
    cx = frames[0].size[0] / 2
    med_bottom = sorted(bottoms)[len(bottoms) // 2]
    ox = CELL / 2 - cx * scale
    oy = CELL * CONTACT_Y - med_bottom * scale
    min_oy = PADDING - union[1] * scale
    max_oy = CELL - PADDING - union[3] * scale
    oy = (min_oy + max_oy) / 2 if max_oy < min_oy else min(max_oy, max(min_oy, oy))

    cells = []
    for im in frames:
        cell = Image.new("RGBA", (CELL, CELL))
        nw, nh = max(1, round(im.size[0] * scale)), max(1, round(im.size[1] * scale))
        cell.alpha_composite(im.resize((nw, nh), Image.Resampling.LANCZOS), (round(ox), round(oy)))
        cells.append(cell)
    sheet = Image.new("RGBA", (CELL, 16 * CELL))
    for i, cell in enumerate(cells):
        sheet.alpha_composite(cell, (0, i * CELL))
    sheet.save(sheet_path)

    placed = cells[int(CAMEO_FACE) - 1]
    crop = placed.crop(opaque_bbox(placed))
    px = np.asarray(crop).astype(np.float64) / 255
    rgb = px[..., :3]
    dark = rgb.max(axis=-1, keepdims=True) < 0.12
    px[..., :3] = np.where(dark, rgb, np.clip(rgb * CAMEO_GAIN + CAMEO_LIFT, 0, 1))
    crop = Image.fromarray((px * 255 + 0.5).astype(np.uint8), "RGBA")
    pad = 3
    fit = (CAMEO_SIZE - 2 * pad) / max(crop.width, crop.height)
    small = crop.resize((max(1, round(crop.width * fit)), max(1, round(crop.height * fit))), Image.Resampling.LANCZOS)
    cameo = Image.new("RGBA", (CAMEO_SIZE, CAMEO_SIZE))
    cameo.alpha_composite(small, ((CAMEO_SIZE - small.width) // 2, CAMEO_SIZE - pad - small.height))
    cameo.save(cameo_path)

    preview.mkdir(parents=True, exist_ok=True)
    label_h = 16
    board = Image.new("RGB", (4 * CELL, 4 * (CELL + label_h)), (74, 107, 50))
    draw = ImageDraw.Draw(board)
    for i, name in enumerate(ENGINE_ORDER):
        r, c = divmod(i, 4)
        x, y = c * CELL, r * (CELL + label_h)
        board.paste(cells[i].convert("RGB"), (x, y), cells[i])
        draw.line((x, y + round(CONTACT_Y * CELL), x + CELL, y + round(CONTACT_Y * CELL)), fill=(160, 40, 40))
        draw.text((x + 4, y + CELL + 2), f"{i} {name}", fill=(220, 214, 200))
    board.save(preview / "sporepod-turntable.png")
    draw_px = 80
    strip = Image.new("RGBA", (16 * draw_px, draw_px), (40, 36, 32, 255))
    for i, cell in enumerate(cells):
        strip.alpha_composite(cell.resize((draw_px, draw_px), Image.Resampling.LANCZOS), (i * draw_px, 0))
    strip.save(preview / "sporepod-strip.png")

    contacts, heights, clips = [], [], []
    for i, name in enumerate(ENGINE_ORDER):
        bb = opaque_bbox(cells[i])
        contacts.append(round(bb[3] / CELL, 3))
        heights.append(bb[3] - bb[1])
        if bb[0] <= 1 or bb[1] <= 1 or bb[2] >= CELL - 1 or bb[3] >= CELL - 1:
            clips.append(name)
    med_h = sorted(heights)[len(heights) // 2]
    pops = [ENGINE_ORDER[i] for i, h in enumerate(heights) if abs(h - med_h) / med_h > 0.12]
    print("sheet", sheet_path, "scale", round(scale, 3), "contact", contacts)
    print("size_pop_dirs", pops, "heights", heights)
    print("cameo", cameo_path)
    print("CLIPPED", clips if clips else "none")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True, help="unit folder; writes hull/ inside it and the sheet beside it")
    ap.add_argument("--ss", type=int, default=4)
    ap.add_argument("--compose-only", action="store_true")
    args = ap.parse_args()
    out = Path(args.out)
    if not args.compose_only:
        render_turntable(build_hull(), out / "hull", "sporepod_hull", "sporepod-hull.json", scale_frac=SCALE_FRAC, z_mid=Z_MID, cy_frac=CY_FRAC, ss=args.ss)
    root = out.parent
    compose_sheet(out / "hull", root / "sporepod-move.png", root / "sporepod-cameo.png", Path(__file__).resolve().parent / "preview")


if __name__ == "__main__":
    main()
