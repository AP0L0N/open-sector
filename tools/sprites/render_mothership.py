#!/usr/bin/env python3
"""Mothership: the Xenite flying capital ship. A vast plated cube with no guns.

Same numpy rasterizer, camera, light, outline, cell (256), and px per model unit as
render_hive_ark.py, so the Mothership is drawn at the sim's hull width
(MOTHERSHIP_HULL_RADIUS = ARK_HULL_RADIUS) beside the Ark. The palette is the Xenite one
(xeno_walker.py): cold grey-green alloy plates, a near-black under-structure, sickly green
light, gray team plates.

One layer, the hull, on the 16 facings:

  hull    a cube of dark under-structure, every face tiled with a grid of raised alloy panels
          at uneven depths. Some cells are left open to the dark core, a few carry gray team
          plates, and green light shows through slits between them and along conduits that run
          the grid. The bow face carries a band of green emitters so the heading reads. Under
          the belly sits the blue tractor emitter the absorbing beam leaves from (the client
          draws the beam). No mounts.

Model units are 10 m. +x bow, +y port, +z up; z = 0 is the cube's middle, where the sim's
height and the dome's centre are.

Row 0 = bow screen-south, then clockwise 22.5 deg through row 15.

  python3 tools/sprites/render_mothership.py \\
      --out gridlock/packages/client/src/assets/units/mothership
"""

from __future__ import annotations

import argparse
import math
import random
from pathlib import Path

import numpy as np
from PIL import Image

import render_procedural as rp
from render_procedural import Mesh, render_turntable

import render_seed as rs
import xeno_walker as bw  # noqa: F401  (Xenite materials)

# The tractor emitter's cold blue, lit like the green seams.
rp.MAT.update({"beam": (rp.hex_rgb("#8fd2ff"), 0.0, 1.0)})
rs.EMISSIVE.add("beam")

# Hull radius: MOTHERSHIP_HULL_RADIUS (40 world px) at the Hive Ark's px per meter.
HULL_R = 4.9
# Cube edge: its corners reach about 0.9 of the hull radius.
SIDE = 6.2
H = SIDE / 2
# Panel grid on every face, and the deepest a panel stands proud of the core.
GRID = 7
RELIEF = 0.34

CELL = 256
SCALE_FRAC = 0.0325 * 384 / CELL
CY_FRAC = 0.5

PANEL_MATS = ("alloy", "alloy", "alloy_hi", "alloy_hi", "barrel", "chitin")


def face_frame(face: str):
    """Origin of a face plane, its outward normal, and two in-plane axes (u, v)."""
    n = {
        "+x": (1, 0, 0), "-x": (-1, 0, 0),
        "+y": (0, 1, 0), "-y": (0, -1, 0),
        "+z": (0, 0, 1), "-z": (0, 0, -1),
    }[face]
    n = np.array(n, float)
    if abs(n[2]) > 0.5:
        u, v = np.array([1.0, 0, 0]), np.array([0, 1.0, 0])
    elif abs(n[0]) > 0.5:
        u, v = np.array([0, 1.0, 0]), np.array([0, 0, 1.0])
    else:
        u, v = np.array([1.0, 0, 0]), np.array([0, 0, 1.0])
    return n * H, n, u, v


def slab(m: Mesh, centre, n, u, v, hu: float, hv: float, depth: float, mat: str) -> None:
    """A box on a face: `hu` x `hv` half-size in the plane, standing `depth` out along `n`."""
    lo = np.array(centre, float) - u * hu - v * hv
    hi = np.array(centre, float) + u * hu + v * hv + n * depth
    m.box(np.minimum(lo, hi), np.maximum(lo, hi), mat)


def panel_face(m: Mesh, face: str, rnd: random.Random) -> None:
    origin, n, u, v = face_frame(face)
    step = SIDE / GRID
    for i in range(GRID):
        for j in range(GRID):
            cu = -H + step * (i + 0.5)
            cv = -H + step * (j + 0.5)
            c = origin + u * cu + v * cv
            roll = rnd.random()
            if roll < 0.12:
                # Open to the dark core, a light deep inside.
                if rnd.random() < 0.5:
                    slab(m, c, n, u, v, step * 0.12, step * 0.12, 0.02, "seam")
                continue
            mat = rnd.choice(PANEL_MATS)
            if roll > 0.95:
                mat = "team"
            depth = 0.06 + RELIEF * rnd.random() ** 1.6
            slab(m, c, n, u, v, step * 0.45, step * 0.45, depth, mat)
            # Detail on the bigger panels: a second block, or a light slit beside it.
            if depth > 0.16 and rnd.random() < 0.55:
                du = (rnd.random() - 0.5) * step * 0.4
                dv = (rnd.random() - 0.5) * step * 0.4
                slab(m, c + u * du + v * dv + n * depth, n, u, v, step * 0.16, step * 0.22, 0.05 + 0.08 * rnd.random(), rnd.choice(PANEL_MATS))
            elif rnd.random() < 0.22:
                slab(m, c + v * step * 0.47, n, u, v, step * 0.4, step * 0.03, depth * 0.6, "seam")
    # Green conduits along two grid lines each way, set just proud of the core.
    for k in rnd.sample(range(1, GRID), 2):
        a = -H + step * k
        slab(m, origin + u * a, n, u, v, step * 0.05, H * 0.98, 0.05, "seam")
        b = -H + step * rnd.randrange(1, GRID)
        slab(m, origin + v * b, n, u, v, H * 0.98, step * 0.05, 0.05, "seam")


def build_hull() -> Mesh:
    m = Mesh()
    rnd = random.Random(1701)
    # The dark under-structure, a little inside the panels.
    m.box((-H, -H, -H), (H, H, H), "claw")
    for face in ("+x", "-x", "+y", "-y", "+z", "-z"):
        panel_face(m, face, rnd)
    # Bow: a band of green emitters across the +x face so the heading reads.
    origin, n, u, v = face_frame("+x")
    for k in range(5):
        a = -H * 0.6 + k * H * 0.3
        slab(m, origin + u * a + v * H * 0.15, n, u, v, 0.22, 0.32, RELIEF + 0.12, "eye")
    slab(m, origin + v * H * 0.15, n, u, v, H * 0.8, 0.06, RELIEF + 0.16, "seam")
    # Belly: the blue tractor emitter in a dark ring.
    origin, n, u, v = face_frame("-z")
    slab(m, origin, n, u, v, 1.0, 1.0, RELIEF + 0.1, "claw")
    slab(m, origin + n * (RELIEF + 0.1), n, u, v, 0.6, 0.6, 0.14, "beam")
    # Corner caps: heavier blocks on the eight corners.
    for sx in (-1, 1):
        for sy in (-1, 1):
            for sz in (-1, 1):
                c = np.array([sx, sy, sz]) * (H - 0.35)
                m.box(c - 0.55, c + 0.55, "chitin")
    return m


def layer(mesh: Mesh, out: Path, name: str, **kw) -> None:
    render_turntable(mesh, out / name, f"mothership_{name}", f"mothership-{name}.json", SCALE_FRAC, 0.0, cy_frac=CY_FRAC, cell=CELL, ss=4, **kw)


def write_cameo(out: Path, path: Path) -> None:
    """72x72 cameo of the cube from the south-east face, brightened like the Xenite cameos."""
    face = Image.open(out / "hull" / "0015.png").convert("RGBA")
    crop = face.crop(face.getbbox())
    px = np.asarray(crop).astype(np.float64) / 255
    rgb = px[..., :3]
    dark = rgb.max(axis=-1, keepdims=True) < 0.12
    px[..., :3] = np.where(dark, rgb, np.clip(rgb * 1.25 + 0.03, 0, 1))
    crop = Image.fromarray((px * 255 + 0.5).astype(np.uint8), "RGBA")
    fit = min(68 / crop.width, 68 / crop.height)
    small = crop.resize((max(1, round(crop.width * fit)), max(1, round(crop.height * fit))), Image.Resampling.LANCZOS)
    cameo = Image.new("RGBA", (72, 72), (0, 0, 0, 0))
    cameo.alpha_composite(small, ((72 - small.width) // 2, (72 - small.height) // 2))
    cameo.save(path)
    print("wrote", path)
    preview = Path(__file__).resolve().parent / "preview" / "mothership-whole.png"
    preview.parent.mkdir(parents=True, exist_ok=True)
    strip = Image.new("RGBA", (CELL * 8, CELL * 2), (40, 46, 42, 255))
    for k in range(16):
        im = Image.open(out / "hull" / f"{k + 1:04d}.png").convert("RGBA")
        strip.alpha_composite(im, ((k % 8) * CELL, (k // 8) * CELL))
    strip.save(preview)
    print("wrote", preview)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True, help="unit folder; writes hull/ inside it")
    args = ap.parse_args()
    out = Path(args.out)
    layer(build_hull(), out, "hull")
    write_cameo(out, out.parent / "mothership-cameo.png")
    # Scale check: a bounding box per face (no size pop between rows).
    boxes = [Image.open(out / "hull" / f"{k + 1:04d}.png").getbbox() for k in range(16)]
    print("hull bbox w/h per face:", [(b[2] - b[0], b[3] - b[1]) if b else None for b in boxes])


if __name__ == "__main__":
    main()
