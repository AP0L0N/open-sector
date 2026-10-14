#!/usr/bin/env python3
"""Flak Maw: the small anti-air maw a Fusion Core grows on its roof (research "flakmaw").

It began as the Mothership's flak mount (an earlier render_mothership.py) and keeps that art: the
Mawcaster's maw made smaller and raised steeply, on the Hive Ark's camera, light, outline, cell
(256), and px per model unit, with its pivot at the model origin. The client turns it to its own
bearing on the core's roof seat (ROOF_FLAK_SEAT, render/sprites.ts).

  maw     a chitin dome with the gray team plate, a fat ribbed barrel raised 62 deg with glow
          coils, a plasma chamber glowing on its back, and claws round a hot core at the muzzle.

Row 0 = muzzle screen-south, then clockwise 22.5 deg through row 15.

  python3 tools/sprites/render_flak_maw.py \\
      --out gridlock/packages/client/src/assets/units/flakmaw
"""

from __future__ import annotations

import argparse
import math
from pathlib import Path

import numpy as np

from render_procedural import Mesh, render_turntable

import xeno_walker as bw  # noqa: F401  (Xenite materials)
from xeno_walker import banded_dome_mat, dome, ellipsoid, knob, tube, tube_x

CELL = 256
SCALE_FRAC = 0.0325 * 384 / CELL
CY_FRAC = 0.5
# Drawn this much bigger than its plan, so it reads at play zoom.
SIZE = 1.6 * 0.75
ELEV_DEG = 62.0


def raise_barrel(m: Mesh, start: int, gz: float, elev_deg: float) -> None:
    """Raise the verts from `start` on about the trunnion at (0, gz), barrel along +x."""
    ce = math.cos(math.radians(elev_deg))
    se = math.sin(math.radians(elev_deg))
    for k in range(start, len(m.verts)):
        x, y, z = m.verts[k]
        m.verts[k] = np.array([x * ce - (z - gz) * se, y, gz + x * se + (z - gz) * ce])


def build_maw() -> Mesh:
    m = Mesh()
    seg = 16
    dome(m, 0.0, 0.0, 0.0, 0.8, 0.74, 0.5, banded_dome_mat(seg, (3,), team_seg=seg // 4, team_rings=(4,)), rings=5, seg=seg)
    gz = 0.55
    reach = 1.7
    ellipsoid(m, (-0.4, 0.0, gz + 0.1), (0.48, 0.38, 0.32), "chitin", rings=6, seg=12)
    ellipsoid(m, (-0.4, 0.0, gz + 0.26), (0.3, 0.22, 0.17), "core", rings=5, seg=10)
    start = len(m.verts)
    tube_x(m, 0.15, reach - 0.2, 0.0, gz, 0.25, "barrel", n=12)
    for x in (0.5, 0.85, 1.2):
        tube_x(m, x, x + 0.12, 0.0, gz, 0.31, "seam", n=12)
    tube_x(m, reach - 0.25, reach - 0.12, 0.0, gz, 0.33, "chitin", n=12)
    for k in range(4):
        a = math.pi / 4 + k * math.pi / 2
        b = np.array([reach - 0.15, 0.27 * math.cos(a), gz + 0.27 * math.sin(a)])
        tube(m, b, b + np.array([0.36, -0.1 * math.cos(a), -0.1 * math.sin(a)]), 0.07, 0.02, "claw", n=5)
    knob(m, (reach - 0.04, 0.0, gz), 0.2, "core")
    raise_barrel(m, start, gz, ELEV_DEG)
    m.verts = [p * SIZE for p in m.verts]
    return m


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True, help="unit folder; writes maw/ inside it")
    args = ap.parse_args()
    out = Path(args.out)
    render_turntable(build_maw(), out / "maw", "flakmaw_maw", "flakmaw-maw.json", SCALE_FRAC, 0.0, cy_frac=CY_FRAC, cell=CELL, ss=4)


if __name__ == "__main__":
    main()
