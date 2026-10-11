#!/usr/bin/env python3
"""Supply Truck: 6x6 utility truck, one 16-face hull sheet.

Modern line (render_alliance_kit.py): the Hailstorm's chassis and armored cab
(render_nebelwerfer.py), same camera, palette, scale, and outline, so the two
trucks read as one family. 0001 = nose screen-south, then clockwise 22.5°
through 0016. The client composes the sheet and cuts its own cameo.

  hull  armored cab with a gray team roof, a short sloped hood, three axles on
        big rubber wheels, an open flatbed with low drop sides stacked with
        banded crates and fuel drums, a rear tailgate and a small crane post.

  python tools/sprites/render_supply.py \\
      --out gridlock/packages/client/src/assets/units/supply-truck
"""

from __future__ import annotations

import argparse
from pathlib import Path

import render_alliance_kit as kit
from render_alliance_kit import Mesh, cylinder_z, slab
from render_nebelwerfer import CY_FRAC, FRAME_Z, HW, SCALE_FRAC, WHEEL_R, Z_MID, armored_cab, truck_chassis

BED_Z = 1.2


def build_hull() -> Mesh:
    m = Mesh()
    truck_chassis(m, -2.5, 3.4)
    # Short hood, grille slot, hazard headlight covers.
    slab(m, [(2.1, -HW), (3.6, -0.95), (3.6, 0.95), (2.1, HW)], FRAME_Z[1], 1.6,
         [(2.1, -0.98), (3.35, -0.8), (3.35, 0.8), (2.1, 0.98)], "armor")
    m.box((3.55, -0.6, 1.0), (3.64, 0.6, 1.3), "slat")
    kit.headlights(m, 3.75, 0.82, 1.5, size=0.12)
    armored_cab(m, 0.95, 2.15, 2.2)
    # Flatbed with low drop sides and a tailgate.
    m.box((-2.55, -HW, FRAME_Z[1]), (0.85, HW, BED_Z), "plate")
    for s in (-1, 1):
        kit.ybox(m, -2.55, 0.85, s, HW - 0.06, HW, BED_Z, BED_Z + 0.35, "armor")
        kit.ybox(m, -2.55, 0.85, s, 1.14, 1.22, WHEEL_R + 0.55, BED_Z - 0.05, "plate")  # skirt over the rear bogie
    m.box((-2.6, -HW, BED_Z), (-2.5, HW, BED_Z + 0.45), "armor")
    m.box((0.75, -HW, BED_Z), (0.85, HW, BED_Z + 0.5), "armor")  # headboard
    # Cargo: banded crates in two stacks and three drums.
    for x0, x1, y0, y1, h in ((-0.3, 0.6, -0.95, -0.05, 0.6), (-0.3, 0.6, 0.1, 0.95, 0.45), (-1.3, -0.45, -0.95, 0.0, 0.5), (-1.3, -0.45, -0.95, -0.35, 0.95)):
        m.box((x0, y0, BED_Z), (x1, y1, BED_Z + h), "crate")
        m.box((x0 - 0.01, y0 + 0.1, BED_Z + h * 0.45), (x1 + 0.01, y1 - 0.1, BED_Z + h * 0.6), "hazard")
    for cx, cy in ((-2.0, -0.6), (-2.0, 0.05), (-1.1, 0.55)):
        cylinder_z(m, cx, cy, 0.3, BED_Z, BED_Z + 0.85, "wheel", 12)
        cylinder_z(m, cx, cy, 0.31, BED_Z + 0.3, BED_Z + 0.4, "plate", 12)
    # Small crane post at the headboard corner, and a spare wheel on the rear wall.
    kit.mast(m, 0.6, 0.9, BED_Z, BED_Z + 1.3, r=0.06, head=0.2)
    m.box((0.6, 0.2, BED_Z + 1.3), (0.66, 0.95, BED_Z + 1.36), "slat")
    return m


LAYERS = (("hull", build_hull),)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True, help="unit folder; writes hull/ inside it")
    ap.add_argument("--ss", type=int, default=4)
    ap.add_argument("--preview", help="write a contact sheet here")
    args = ap.parse_args()
    out = Path(args.out)
    kit.render_unit("supply", out, LAYERS, SCALE_FRAC, Z_MID, CY_FRAC, ss=args.ss, cameo_path=Path("/home/apolon/.claude/jobs/d263ce2a/tmp/supply-cameo-preview.png"))
    if args.preview:
        kit.contact_sheet(out, ["hull"], Path(args.preview))


if __name__ == "__main__":
    main()
