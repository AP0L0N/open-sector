#!/usr/bin/env python3
"""Rig: the tracked carrier that unpacks into a Core. One 16-face hull.

Same numpy rasterizer, camera, splinter camo, and outline as render_mammoth.py
and render_nebelwerfer.py. No gun. The packed module is the Core folded down:
a tall olive body, hazard bands on the sides, a dark stern door, and the
radar dish lying flat on a low rear step. The built Core art is not touched.

0001 = nose screen-south, then clockwise 22.5° through 0016.

The client still loads the composed sheet (frameSize 192, contactY 0.9,
one frame). This script writes the drop-in faces and rebuilds that sheet
and the 72px cameo, so deploy, draw size, and the sprite def stay put.

  python tools/sprites/render_rig.py \\
      --out gridlock/packages/client/src/assets/units/rig
"""

from __future__ import annotations

import argparse
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

from render_procedural import Mesh, render_turntable

# Meters. +x nose, +y left, +z up. Tracks on z = 0.
SCALE_FRAC = 0.086
Z_MID = 1.5
CY_FRAC = 0.64

HULL_L0, HULL_L1 = -3.55, 4.15
DECK = 1.18
TRACK_Y = 1.52
TRACK_HALF = 0.44
TRACK_R = 0.58

# The module stops short of the cab so the driver's box reads on its own.
MOD_X0, MOD_X1 = -3.35, 0.85
MOD_W = 1.18
BODY_Z = 2.55
TOWER_X0, TOWER_X1 = -3.1, -1.05
TOWER_W = 0.88
TOWER_Z = 3.05

CELL = 192
CONTACT_Y = 0.9
PADDING = 6
CAMEO_FACE = "0014"  # ESE: cab, module, and one track
CAMEO_SIZE = 72
CAMEO_GAIN = 1.55
CAMEO_LIFT = 0.04

ENGINE_ORDER = [
    "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW",
    "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
]


def slab(m: Mesh, bottom: list[tuple[float, float]], z0: float, z1: float, top: list[tuple[float, float]], mat: str, top_mat: str | None = None) -> None:
    bot = [m.v((x, y, z0)) for x, y in bottom]
    tp = [m.v((x, y, z1)) for x, y in top]
    n = len(bot)
    for i in range(n):
        j = (i + 1) % n
        m.quad(bot[i], bot[j], tp[j], tp[i], mat)
    for i in range(1, n - 1):
        m.tri(tp[0], tp[i], tp[i + 1], top_mat or mat)
        m.tri(bot[0], bot[i + 1], bot[i], mat)


def track(m: Mesh, y: float) -> None:
    """A track run as a stadium, road wheels on the outer face, skirt over the top run."""
    x0, x1 = HULL_L0 + 0.25, HULL_L1 - 0.15
    n = 10
    prof: list[np.ndarray] = []
    for k in range(n + 1):
        a = -math.pi / 2 + math.pi * k / n
        prof.append(np.array([x1 - TRACK_R + TRACK_R * math.cos(a) + 0.2 * max(0.0, math.sin(a)), 0.0, TRACK_R + TRACK_R * math.sin(a)]))
    for k in range(n + 1):
        a = math.pi / 2 + math.pi * k / n
        prof.append(np.array([x0 + TRACK_R + TRACK_R * math.cos(a), 0.0, TRACK_R + TRACK_R * math.sin(a)]))
    rings = [[p + np.array([0.0, yy, 0.0]) for p in prof] for yy in (y - TRACK_HALF, y + TRACK_HALF)]
    m.loft(rings, "tire")
    side = y + (TRACK_HALF + 0.02) * (1 if y > 0 else -1)
    span = x1 - x0 - 2.0
    for i in range(5):
        cx = x0 + 1.0 + i * span / 4
        hub = [np.array([cx + 0.32 * math.cos(2 * math.pi * k / 10), side, 0.52 + 0.32 * math.sin(2 * math.pi * k / 10)]) for k in range(10)]
        m.loft([hub, [p + np.array([0, 0.03 * (1 if y > 0 else -1), 0]) for p in hub]], "metal")
    o = 1 if y > 0 else -1
    m.box(
        (x0 + 0.15, min(y - TRACK_HALF - 0.06 * (o < 0), y + TRACK_HALF), 0.95),
        (x1 - 0.1, max(y + TRACK_HALF + 0.06 * (o > 0), y - TRACK_HALF), DECK + 0.06),
        "camo",
    )


def ribbon(m: Mesh, y_wall: float, outward: float, x0: float, z0: float, x1: float, z1: float, half: float, mat: str, depth: float = 0.1) -> None:
    """A diagonal bar standing proud of a side face. `outward` is +1 or -1 along y."""
    dx, dz = x1 - x0, z1 - z0
    length = math.hypot(dx, dz) or 1.0
    px, pz = -dz / length * half, dx / length * half
    y_in = y_wall + outward * 0.02
    y_out = y_in + outward * depth

    def ring(yy: float) -> list[int]:
        return [
            m.v((x0 + px, yy, z0 + pz)),
            m.v((x1 + px, yy, z1 + pz)),
            m.v((x1 - px, yy, z1 - pz)),
            m.v((x0 - px, yy, z0 - pz)),
        ]

    a, b = ring(y_in), ring(y_out)
    for i in range(4):
        j = (i + 1) % 4
        m.quad(a[i], a[j], b[j], b[i], mat)
    m.quad(b[0], b[1], b[2], b[3], mat)


def ellipse(m: Mesh, z: float, cx: float, cy: float, rx: float, ry: float, mat: str, n: int = 28) -> None:
    center = m.v((cx, cy, z))
    rim = [m.v((cx + rx * math.cos(2 * math.pi * k / n), cy + ry * math.sin(2 * math.pi * k / n), z)) for k in range(n)]
    for k in range(n):
        m.tri(center, rim[k], rim[(k + 1) % n], mat)


def build_hull() -> Mesh:
    m = Mesh()
    hw = 1.05
    # Belly between the tracks, deck across both.
    m.box((HULL_L0 + 0.35, -hw, 0.38), (HULL_L1 - 0.55, hw, DECK - 0.06), "metal")
    m.box((HULL_L0 + 0.1, -(TRACK_Y + TRACK_HALF - 0.05), DECK - 0.08), (HULL_L1 - 0.2, TRACK_Y + TRACK_HALF - 0.05, DECK + 0.06), "camo")

    # Cab: lower and longer than the module, sloped screen, gray team roof, yellow lamps.
    slab(
        m,
        [(0.95, -hw), (2.85, -0.98), (2.85, 0.98), (0.95, hw)],
        DECK + 0.06,
        2.22,
        [(1.15, -0.88), (2.35, -0.7), (2.35, 0.7), (1.15, 0.88)],
        "camo",
        "team",
    )
    m.box((2.35, -0.9, DECK + 0.5), (3.85, 0.9, DECK + 0.98), "camo")  # hood
    m.box((3.78, -0.48, DECK + 0.58), (3.88, 0.48, DECK + 0.82), "frame")  # grille
    m.box((2.15, -0.62, 1.7), (2.32, 0.62, 1.88), "frame")  # windscreen slit
    for s in (-1, 1):
        m.box((1.35, s * 1.02 - 0.02, 1.52), (2.05, s * 1.02 + 0.02, 1.68), "frame")
        m.box((3.68, s * 0.68 - 0.14, DECK + 0.78), (3.92, s * 0.68 + 0.14, DECK + 1.02), "hazard")

    # Packed core: flat-sided body so the hazard bands sit on a real face, then the tower step.
    m.box((MOD_X0, -MOD_W, DECK + 0.06), (MOD_X1, MOD_W, BODY_Z), "camo")
    m.box((TOWER_X0, -TOWER_W, BODY_Z - 0.02), (TOWER_X1, TOWER_W, TOWER_Z), "camo", "team")
    # Dark boards on both sides, then two thick hazard bands. Same marks, both flanks.
    for s in (-1, 1):
        wall = s * MOD_W
        m.box(
            (MOD_X0 + 0.2, min(wall, wall + s * 0.05), DECK + 0.32),
            (MOD_X1 - 0.15, max(wall, wall + s * 0.05), BODY_Z - 0.18),
            "frame",
        )
        x_lo, x_hi = MOD_X0 + 0.55, MOD_X1 - 0.35
        z_lo, z_hi = DECK + 0.48, BODY_Z - 0.32
        for t in (0.34, 0.68):
            cx = x_lo + (x_hi - x_lo) * t
            cz = (z_lo + z_hi) / 2
            ribbon(m, wall + s * 0.05, float(s), cx - 0.62, cz - 0.48, cx + 0.62, cz + 0.48, 0.2, "hazard", 0.12)
    # Stern door: the Core's gate, shut.
    m.box((MOD_X0 - 0.08, -0.72, DECK + 0.28), (MOD_X0 + 0.02, 0.72, BODY_Z - 0.28), "frame")
    m.box((MOD_X0 - 0.14, -0.52, DECK + 0.48), (MOD_X0 - 0.06, 0.52, BODY_Z - 0.48), "tire")
    # Folded dish and a short mast on the tower roof.
    ellipse(m, TOWER_Z + 0.05, -2.05, 0.0, 0.7, 0.46, "metal")
    m.box((-2.2, -0.16, TOWER_Z + 0.05), (-1.9, 0.16, TOWER_Z + 0.18), "frame")
    m.box((-2.95, -0.05, TOWER_Z), (-2.82, 0.05, TOWER_Z + 0.85), "metal")
    m.box((-3.1, -0.05, TOWER_Z + 0.68), (-2.68, 0.05, TOWER_Z + 0.78), "metal")

    for s in (-1, 1):
        track(m, s * TRACK_Y)
    return m


def opaque_bbox(im: Image.Image, alpha_min: int = 8) -> tuple[int, int, int, int] | None:
    bb = im.split()[-1].point(lambda v: 255 if v >= alpha_min else 0).getbbox()
    return bb


def compose_sheet(src: Path, sheet_path: Path, cameo_path: Path, preview: Path) -> None:
    """One scale and one contact for all 16 faces, into the engine sheet."""
    frames = [Image.open(src / f"{i:04d}.png").convert("RGBA") for i in range(1, 17)]
    boxes = []
    bottoms = []
    for im in frames:
        bb = opaque_bbox(im)
        if not bb:
            raise SystemExit(f"empty rig frame in {src}")
        boxes.append(bb)
        bottoms.append(bb[3])
    union = (
        min(b[0] for b in boxes),
        min(b[1] for b in boxes),
        max(b[2] for b in boxes),
        max(b[3] for b in boxes),
    )
    uw, uh = union[2] - union[0], union[3] - union[1]
    max_w = CELL - 2 * PADDING
    max_h = CELL - 2 * PADDING
    scale = min(max_w / uw, max_h / uh)
    cx = frames[0].size[0] / 2
    med_bottom = sorted(bottoms)[len(bottoms) // 2]
    ox = CELL / 2 - cx * scale
    oy = CELL * CONTACT_Y - med_bottom * scale
    # Keep the whole union inside the cell. Tracks should still land on contactY.
    min_oy = PADDING - union[1] * scale
    max_oy = CELL - PADDING - union[3] * scale
    if max_oy < min_oy:
        oy = (min_oy + max_oy) / 2
    else:
        oy = min(max_oy, max(min_oy, oy))

    cells: list[Image.Image] = []
    for im in frames:
        cell = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
        nw, nh = max(1, round(im.size[0] * scale)), max(1, round(im.size[1] * scale))
        cell.alpha_composite(im.resize((nw, nh), Image.Resampling.LANCZOS), (round(ox), round(oy)))
        cells.append(cell)

    sheet = Image.new("RGBA", (CELL, 16 * CELL), (0, 0, 0, 0))
    for i, cell in enumerate(cells):
        sheet.alpha_composite(cell, (0, i * CELL))
    sheet_path.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(sheet_path)

    # Cameo is the 3/4 face, brightened, wheels on the bottom of the 72 frame.
    placed = cells[int(CAMEO_FACE) - 1]
    bb = opaque_bbox(placed)
    if not bb:
        raise SystemExit("cameo empty")
    crop = placed.crop(bb)
    px = np.asarray(crop).astype(np.float64) / 255
    rgb = px[..., :3]
    dark = rgb.max(axis=-1, keepdims=True) < 0.12
    px[..., :3] = np.where(dark, rgb, np.clip(rgb * CAMEO_GAIN + CAMEO_LIFT, 0, 1))
    crop = Image.fromarray((px * 255 + 0.5).astype(np.uint8), "RGBA")
    pad = 3
    fit = (CAMEO_SIZE - 2 * pad) / max(crop.width, crop.height)
    small = crop.resize((max(1, round(crop.width * fit)), max(1, round(crop.height * fit))), Image.Resampling.LANCZOS)
    cameo = Image.new("RGBA", (CAMEO_SIZE, CAMEO_SIZE), (0, 0, 0, 0))
    cameo.alpha_composite(small, ((CAMEO_SIZE - small.width) // 2, CAMEO_SIZE - pad - small.height))
    cameo.save(cameo_path)

    preview.mkdir(parents=True, exist_ok=True)
    label_h = 16
    board = Image.new("RGB", (4 * CELL, 4 * (CELL + label_h)), (28, 26, 24))
    draw = ImageDraw.Draw(board)
    for i, name in enumerate(ENGINE_ORDER):
        r, c = divmod(i, 4)
        x, y = c * CELL, r * (CELL + label_h)
        board.paste(cells[i].convert("RGB"), (x, y), cells[i])
        draw.text((x + 4, y + CELL + 2), f"{i} {name}", fill=(220, 214, 200))
    board.save(preview / "rig-turntable.png")
    draw_px = 80
    strip = Image.new("RGBA", (16 * draw_px, draw_px), (40, 36, 32, 255))
    for i, cell in enumerate(cells):
        strip.alpha_composite(cell.resize((draw_px, draw_px), Image.Resampling.LANCZOS), (i * draw_px, 0))
    strip.save(preview / "rig-strip.png")

    contacts = []
    clips = []
    for i, name in enumerate(ENGINE_ORDER):
        bb = opaque_bbox(cells[i])
        if not bb:
            continue
        contacts.append(round(bb[3] / CELL, 3))
        if bb[0] <= 1 or bb[1] <= 1 or bb[2] >= CELL - 1 or bb[3] >= CELL - 1:
            clips.append(name)
    print("sheet", sheet_path, "scale", round(scale, 3), "contact", contacts)
    print("cameo", cameo_path)
    if clips:
        print("CLIPPED", clips)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True, help="unit folder; writes hull/ inside it and the sheet beside it")
    ap.add_argument("--ss", type=int, default=4)
    ap.add_argument("--compose-only", action="store_true")
    args = ap.parse_args()
    out = Path(args.out)
    if not args.compose_only:
        render_turntable(
            build_hull(),
            out / "hull",
            "rig_hull",
            "rig-hull.json",
            scale_frac=SCALE_FRAC,
            z_mid=Z_MID,
            cy_frac=CY_FRAC,
            ss=args.ss,
        )
    root = out.parent
    preview = Path(__file__).resolve().parent / "preview"
    compose_sheet(out / "hull", root / "rig-move.png", root / "rig-cameo.png", preview)


if __name__ == "__main__":
    main()
