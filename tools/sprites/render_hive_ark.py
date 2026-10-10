#!/usr/bin/env python3
"""Hive Ark: the Xenite carrier. A round surfaced hull, two plasma cannons, two Wasp pods.

Same numpy rasterizer, camera, light, and outline as render_battleship.py, and the
Xenite sea look of render_xeno_naval.py (cold grey-green alloy plates, dark
chitin, sickly green glow seams, gray team plate, a green glow in the water).

The ship is two layers that share one camera, scale, and anchor, so the client can
lay them over each other (render/hive-ark.ts), the Battle Ship's way:

  hull    a round saucer hull cut at the waterline over its wake: a ribbed chitin
          skirt, a low banded alloy deck, a glow seam round the rim, a prow with
          sensor eyes so the bow reads, the dome emitter in the middle (a raised
          spire with a glowing core and four prongs), the two cannon barbettes on
          the keel line fore and aft, and the two landing pods abeam: flat pads
          ringed with glow lights and cradle claws. No cannons, no Wasps.
  cannon  one plasma cannon on its own pivot (the model origin): a chitin turret
          dome with the gray team plate, a thick ribbed barrel with glow coils, a
          plasma chamber glowing on its back, a muzzle of claws round a hot core.
          Both mounts use it.

The docked Wasps are the Wasp's own sheet, drawn small on the pods by the client.
The energy dome is drawn by the client (render/hive-ark.ts), not baked.

Model units are 10 m. +x bow, +y port, +z up; waterline at z = 0; the origin is the
middle of the hull. Mount positions are shares of HULL_R, the same shares as
ARK_CANNON_AT / ARK_POD_AT in the catalog; the client adds the pivot heights below.

Row 0 = bow screen-south, then clockwise 22.5 deg through row 15.

  python3 tools/sprites/render_hive_ark.py \\
      --out gridlock/packages/client/src/assets/units/hiveark
"""

from __future__ import annotations

import argparse
import math
from pathlib import Path

import numpy as np
from PIL import Image

import render_procedural as rp
from render_procedural import Mesh, render_turntable

import render_xeno_naval  # noqa: F401  (water glow + pad materials)
import xeno_walker as bw
from xeno_walker import banded_dome_mat, cylinder_z, dome, ellipsoid, knob, tube, tube_x
from render_naval import ellipse, ring

# Hull radius in model units (49 m): ARK_HULL_RADIUS world px at the Battle Ship's px per meter.
HULL_R = 4.9
CANNON_AT = (0.48, -0.48)
POD_AT = 0.56
# Hull: skirt top, deck rise over it.
SKIRT_Z = 0.62
DECK_H = 0.95
# Pivot heights the client lifts each mount to (model units): the barbette tops, and the pad tops.
CANNON_Z = 1.72
POD_Z = 1.62
# The cannon is drawn this much bigger than its plan, so it reads as the ship's main battery.
CANNON_SIZE = 1.55
# The barrel stands this far up off the deck: the balls go out on a high arc.
CANNON_ELEV_DEG = 50.0
# Barrel length and trunnion height (before CANNON_SIZE).
BARREL_LEN = 2.25
TRUNNION_Z = 0.62
# Barrel tip ahead of the cannon pivot, and bore height over it (after CANNON_SIZE).
MUZZLE_REACH = BARREL_LEN * math.cos(math.radians(CANNON_ELEV_DEG)) * CANNON_SIZE
BORE_Z = (TRUNNION_Z + BARREL_LEN * math.sin(math.radians(CANNON_ELEV_DEG))) * CANNON_SIZE


def deck_z(r: float) -> float:
    """Height of the deck's crown `r` model units from the middle."""
    k = min(1.0, r / HULL_R)
    return SKIRT_Z + 0.04 + DECK_H * math.sqrt(max(0.0, 1 - k * k))

# 384 px * 0.0325 (the Battle Ship's cell and scale) per model unit, on a 256 px cell.
CELL = 256
SCALE_FRAC = 0.0325 * 384 / CELL
CY_FRAC = 0.56


def ring_of(m: Mesh, r: float, z: float, n: int, size: float, mat: str, phase: float = 0.0) -> None:
    for k in range(n):
        a = phase + 2 * math.pi * k / n
        knob(m, (r * math.cos(a), r * math.sin(a), z), size, mat)


def build_hull() -> Mesh:
    m = Mesh()
    R = HULL_R
    # Ribbed chitin skirt from under the water up to the rim, cut at the waterline; a thin glow seam on the rim.
    cylinder_z(m, 0.0, 0.0, R, -0.25, SKIRT_Z, "chitin", n=48)
    cylinder_z(m, 0.0, 0.0, R * 1.005, SKIRT_Z - 0.06, SKIRT_Z + 0.02, "seam", n=48)
    for k in range(24):
        a = 2 * math.pi * (k + 0.5) / 24
        x, y = R * math.cos(a), R * math.sin(a)
        tube(m, (x * 0.99, y * 0.99, 0.02), (x * 1.04, y * 1.04, SKIRT_Z - 0.1), 0.2, 0.12, "claw", n=5)
    # Plated alloy deck: wedge plates in two tones, dark chitin ribs between, gray team plates at four headings.
    seg = 48

    def deck_mat(ri: int, s: int) -> str:
        if s % 6 == 0:
            return "chitin"
        if ri in (2, 3) and s % 12 in (2, 3, 4):
            return "team"
        if ri == 0:
            return "chitin"
        return "alloy" if (s // 6) % 2 == 0 else "alloy_hi"

    dome(m, 0.0, 0.0, SKIRT_Z, R * 0.99, R * 0.99, DECK_H, deck_mat, rings=7, seg=seg, skirt=0.04)
    # Prow at the bow: a chitin ram with sensor eyes either side, so the heading reads.
    tube(m, (R * 0.8, 0.0, SKIRT_Z + 0.35), (R * 1.16, 0.0, SKIRT_Z - 0.15), 0.5, 0.14, "chitin", n=8)
    for s in (-1, 1):
        knob(m, (R * 0.84, s * 0.5, deck_z(R * 0.84) + 0.05), 0.17, "eye")
        knob(m, (R * 0.76, s * 0.85, deck_z(R * 0.76) + 0.05), 0.13, "eye")
    # Stern: two glowing drive bulbs low on the skirt.
    for s in (-1, 1):
        ellipsoid(m, (-R * 0.99, s * 0.9, 0.3), (0.4, 0.5, 0.28), "core", rings=6, seg=10)
    # Dome emitter in the middle: a raised spire, a glowing core, four prongs leaning in.
    base = deck_z(0.0)
    dome(m, 0.0, 0.0, base - 0.1, 1.2, 1.2, 0.8, banded_dome_mat(16, (4,)), rings=5, seg=16)
    knob(m, (0.0, 0.0, base + 0.95), 0.48, "core")
    tube(m, (0.0, 0.0, base + 0.7), (0.0, 0.0, base + 1.75), 0.18, 0.08, "barrel", n=6)
    knob(m, (0.0, 0.0, base + 1.82), 0.2, "core")
    for k in range(4):
        a = math.pi / 4 + k * math.pi / 2
        c, s_ = math.cos(a), math.sin(a)
        tube(m, (c * 1.35, s_ * 1.35, base - 0.05), (c * 0.5, s_ * 0.5, base + 1.6), 0.14, 0.05, "claw", n=5)
        knob(m, (c * 0.5, s_ * 0.5, base + 1.6), 0.1, "seam")
    # Cannon barbettes on the keel line: raised chitin rings with a glow band on top.
    for at in CANNON_AT:
        x = at * R
        cylinder_z(m, x, 0.0, 1.3, deck_z(abs(x)) - 0.3, CANNON_Z - 0.07, "chitin", n=24)
        cylinder_z(m, x, 0.0, 1.34, CANNON_Z - 0.07, CANNON_Z, "seam", n=24)
    # Landing pods abeam: pads raised on the deck, ringed with glow lights, three cradle claws each.
    for s in (-1, 1):
        cy = s * POD_AT * R
        cylinder_z(m, 0.0, cy, 1.15, deck_z(abs(cy)) - 0.3, POD_Z - 0.05, "alloy_hi", n=24)
        cylinder_z(m, 0.0, cy, 0.92, POD_Z - 0.05, POD_Z, "pad", n=24)
        ring_of_pad = 1.05
        for k in range(10):
            a = 2 * math.pi * k / 10
            knob(m, (ring_of_pad * math.cos(a), cy + ring_of_pad * math.sin(a), POD_Z), 0.08, "seam")
        for k in range(3):
            a = math.pi / 2 + 2 * math.pi * k / 3
            px, py = 1.12 * math.cos(a), cy + 1.12 * math.sin(a)
            tube(m, (px, py, POD_Z - 0.05), (px * 0.8, cy + (py - cy) * 0.8, POD_Z + 0.4), 0.08, 0.03, "claw", n=5)
    return m


def build_cannon() -> Mesh:
    """Plasma cannon. Pivot at the origin, base on z = 0, barrel along +x raised CANNON_ELEV_DEG."""
    m = Mesh()
    seg = 16
    dome(m, 0.0, 0.0, 0.0, 0.95, 0.88, 0.55, banded_dome_mat(seg, (3,), team_seg=seg // 4, team_rings=(4,)), rings=5, seg=seg)
    gz = TRUNNION_Z
    reach = BARREL_LEN
    # Breech and plasma chamber riding the back of the turret.
    ellipsoid(m, (-0.45, 0.0, gz + 0.12), (0.55, 0.42, 0.36), "chitin", rings=6, seg=12)
    ellipsoid(m, (-0.45, 0.0, gz + 0.3), (0.36, 0.26, 0.2), "core", rings=5, seg=10)
    # Thick ribbed barrel with glow coils, laid along +x, then raised on the trunnion.
    barrel_from = len(m.verts)
    tube_x(m, 0.2, reach - 0.25, 0.0, gz, 0.27, "barrel", n=12)
    for x in (0.65, 1.05, 1.45):
        tube_x(m, x, x + 0.14, 0.0, gz, 0.34, "seam", n=12)
    for s in (-1, 1):
        tube_x(m, 0.3, 1.8, s * 0.3, gz - 0.06, 0.08, "chitin", n=6)
    # Muzzle: four claws round a hot core.
    tube_x(m, reach - 0.3, reach - 0.15, 0.0, gz, 0.36, "chitin", n=12)
    for k in range(4):
        a = math.pi / 4 + k * math.pi / 2
        base = np.array([reach - 0.18, 0.3 * math.cos(a), gz + 0.3 * math.sin(a)])
        tube(m, base, base + np.array([0.42, -0.12 * math.cos(a), -0.12 * math.sin(a)]), 0.08, 0.02, "claw", n=5)
    knob(m, (reach - 0.05, 0.0, gz), 0.22, "core")
    ce = math.cos(math.radians(CANNON_ELEV_DEG))
    se = math.sin(math.radians(CANNON_ELEV_DEG))
    for k in range(barrel_from, len(m.verts)):
        x, y, z = m.verts[k]
        m.verts[k] = np.array([x * ce - (z - gz) * se, y, gz + x * se + (z - gz) * ce])
    m.verts = [p * CANNON_SIZE for p in m.verts]
    return m


def build_wake() -> Mesh:
    """Dark water round the hull with the hive glow under it and a ring of white water."""
    m = Mesh()
    R = HULL_R
    ellipse(m, 0.02, 0.0, 0.0, R * 1.2, R * 1.2, "water", n=56)
    ellipse(m, 0.03, 0.0, 0.0, R * 1.1, R * 1.1, "uglow", n=56)
    ring(m, 0.05, 0.0, 0.0, R * 1.07, R * 1.07, R * 1.13, R * 1.13, "foam", n=56)
    return m


def layer(mesh: Mesh, out: Path, name: str, **kw) -> None:
    render_turntable(mesh, out / name, f"hiveark_{name}", f"hiveark-{name}.json", SCALE_FRAC, 0.0, cy_frac=CY_FRAC, cell=CELL, ss=4, **kw)


def placed(mesh: Mesh, x: float, z: float) -> Mesh:
    m = Mesh()
    m.verts = [p + np.array([x, 0.0, z]) for p in mesh.verts]
    m.tris = list(mesh.tris)
    return m


def merge(*meshes: Mesh) -> Mesh:
    m = Mesh()
    for part in meshes:
        base = len(m.verts)
        m.verts.extend(part.verts)
        m.tris.extend((a + base, b + base, c + base, mat) for a, b, c, mat in part.tris)
    return m


def write_cameo(out: Path, path: Path) -> None:
    """72x72 cameo of the whole ship from the south-east face, brightened like the Xenite cameos."""
    tmp = out / "_cameo"
    whole = merge(build_hull(), *(placed(build_cannon(), at * HULL_R, CANNON_Z) for at in CANNON_AT))
    render_turntable(whole, tmp, "hiveark_whole", "hiveark-whole.json", SCALE_FRAC, 0.0, cy_frac=CY_FRAC, cell=CELL, ss=4, clip_z=0.0)
    face = Image.open(tmp / "0015.png").convert("RGBA")
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
    for f in tmp.iterdir():
        f.unlink()
    tmp.rmdir()
    (out / "hiveark-whole.json").unlink(missing_ok=True)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True, help="unit folder; writes hull/ and cannon/ inside it")
    args = ap.parse_args()
    out = Path(args.out)
    layer(build_hull(), out, "hull", clip_z=0.0, underlay=build_wake())
    layer(build_cannon(), out, "cannon")
    write_cameo(out, out.parent / "hiveark-cameo.png")
    # Scale check: a bounding box per face (no size pop between rows).
    for name in ("hull", "cannon"):
        boxes = [Image.open(out / name / f"{k + 1:04d}.png").getbbox() for k in range(16)]
        print(name, "bbox w/h per face:", [(b[2] - b[0], b[3] - b[1]) if b else None for b in boxes])


if __name__ == "__main__":
    main()
