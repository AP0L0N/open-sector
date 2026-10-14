#!/usr/bin/env python3
"""Mothership: the Xenite flying capital ship. A vast chitin saucer and four mounts.

Same numpy rasterizer, camera, light, outline, cell (256), and px per model unit as
render_hive_ark.py, so the Mothership is drawn at the sim's hull width
(MOTHERSHIP_HULL_RADIUS = ARK_HULL_RADIUS) beside the Ark. The look is the Xenite fliers'
(render_xeno_air.py, the Overseer): cold grey-green alloy plates, dark chitin, sickly green
glow seams, the gray team plate, glowing membrane and tendrils under it.

The ship is five layers on one camera, scale, and anchor, so the client can lay them over each
other (render/mothership.ts), the Hive Ark's way:

  hull    a lens of a saucer: a plated deck domed over a chitin belly, a glow seam and a ring
          of chitin vanes round the rim, a prow with sensor eyes so the heading reads, a drive
          glow at the stern, the dome emitter in the middle (a raised crown with a hot core and
          four prongs), four raised barbettes where the mounts sit, and under the belly a
          cluster of emitters and eight tendrils hanging down. No guns.
  spine   a Spine Turret's head: a chitin bulb with a twin pulse repeater.
  pulse   a Pulse Spire's head: a long emitter with a ring of green fire round its root.
  maw     a Mawcaster's maw: a fat ribbed barrel raised for the high arc, claws round a hot core.
  flak    the same maw made smaller and raised steeply, for fliers.

Each mount has its own pivot at the model origin; the client puts it on its barbette (the
heights below, MOUNT_Z) and turns it to its own bearing.

Model units are 10 m. +x bow, +y port, +z up; z = 0 is the rim plane, the ship's middle,
where the sim's height and the dome's centre are. Mount spots are shares of HULL_R, the same
as MOTHERSHIP_MOUNT_AT in the catalog (`across` is to starboard there, -y here).

Row 0 = bow screen-south, then clockwise 22.5 deg through row 15.

  python3 tools/sprites/render_mothership.py \\
      --out gridlock/packages/client/src/assets/units/mothership
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image

import render_procedural as rp
from render_procedural import Mesh, render_turntable

import render_xeno_air  # noqa: F401  (membrane + vein materials)
import xeno_walker as bw  # noqa: F401  (Xenite materials)
from xeno_walker import banded_dome_mat, cylinder_z, dome, ellipsoid, knob, tube, tube_x

# Hull radius: MOTHERSHIP_HULL_RADIUS (40 world px) at the Hive Ark's px per meter.
HULL_R = 4.9
# Mount spots as (along the nose, across to starboard) shares of HULL_R: MOTHERSHIP_MOUNT_AT.
MOUNT_AT = {
    "spine": (0.62, 0.0),
    "pulse": (-0.55, 0.0),
    "maw": (0.0, -0.5),
    "flak": (0.0, 0.5),
}
# The deck: a dome over the rim plane. The belly: a shallower lens under it.
DECK_Z = 0.06
DECK_H = 1.05
BELLY_H = 0.8

# 384 px * 0.0325 (the Battle Ship's cell and scale) per model unit, on a 256 px cell: the Ark's.
CELL = 256
SCALE_FRAC = 0.0325 * 384 / CELL
CY_FRAC = 0.5


def deck_z(r: float) -> float:
    """Height of the deck's crown `r` model units from the middle."""
    k = min(1.0, r / HULL_R)
    return DECK_Z + 0.04 + DECK_H * math.sqrt(max(0.0, 1 - k * k))


def model_xy(m: str) -> tuple[float, float]:
    along, across = MOUNT_AT[m]
    return along * HULL_R, -across * HULL_R


def mount_z(m: str) -> float:
    """Top of mount `m`'s barbette: the pivot height the client lifts the mount to."""
    x, y = model_xy(m)
    return deck_z(math.hypot(x, y)) + 0.22


def build_hull() -> Mesh:
    m = Mesh()
    R = HULL_R
    seg = 48

    # Belly: a chitin lens under the rim, banded with seams, a cluster of emitters at its keel.
    def belly_mat(ri: int, s: int) -> str:
        if ri in (3,):
            return "seam"
        return "chitin" if s % 4 else "limb"

    belly = Mesh()
    dome(belly, 0.0, 0.0, 0.0, R * 0.98, R * 0.98, BELLY_H, belly_mat, rings=6, seg=seg, skirt=0.02)
    belly.verts = [np.array([p[0], p[1], -p[2]]) for p in belly.verts]
    belly.tris = [(a, c, b, mat) for a, b, c, mat in belly.tris]
    base = len(m.verts)
    m.verts.extend(belly.verts)
    m.tris.extend((a + base, b + base, c + base, mat) for a, b, c, mat in belly.tris)
    ellipsoid(m, (0.0, 0.0, -BELLY_H - 0.05), (1.0, 1.0, 0.42), "core", rings=6, seg=12)
    for k in range(6):
        a = 2 * math.pi * (k + 0.5) / 6
        knob(m, (1.25 * math.cos(a), 1.25 * math.sin(a), -BELLY_H + 0.1), 0.24, "core")
    # Eight tendrils hanging from the belly, glowing at the tips.
    for k in range(8):
        a = 2 * math.pi * k / 8
        r0 = R * 0.55
        top = (r0 * math.cos(a), r0 * math.sin(a), -BELLY_H * 0.55)
        mid = (r0 * 0.92 * math.cos(a + 0.12), r0 * 0.92 * math.sin(a + 0.12), -BELLY_H - 0.55)
        tip = (r0 * 0.85 * math.cos(a + 0.2), r0 * 0.85 * math.sin(a + 0.2), -BELLY_H - 1.15)
        tube(m, top, mid, 0.16, 0.1, "limb", n=6)
        tube(m, mid, tip, 0.1, 0.04, "limb", n=6)
        knob(m, tip, 0.08, "vein")
    # Rim: a glow seam all round, and a ring of chitin vanes standing out of it.
    cylinder_z(m, 0.0, 0.0, R * 1.0, -0.1, DECK_Z + 0.02, "seam", n=seg)
    for k in range(24):
        a = 2 * math.pi * (k + 0.5) / 24
        c, s = math.cos(a), math.sin(a)
        tube(m, (c * R * 0.97, s * R * 0.97, 0.0), (c * R * 1.1, s * R * 1.1, -0.18), 0.17, 0.05, "claw", n=5)

    # Plated alloy deck: wedge plates in two tones, dark chitin ribs, gray team plates at four headings.
    def deck_mat(ri: int, s: int) -> str:
        if s % 6 == 0:
            return "chitin"
        if ri in (2, 3) and s % 12 in (2, 3, 4):
            return "team"
        if ri == 0:
            return "chitin"
        if ri == 4 and s % 3 == 1:
            return "seam"
        return "alloy" if (s // 6) % 2 == 0 else "alloy_hi"

    dome(m, 0.0, 0.0, DECK_Z, R * 0.97, R * 0.97, DECK_H, deck_mat, rings=7, seg=seg, skirt=0.04)
    # Prow at the bow: a chitin ram over the rim, with sensor eyes either side, so the heading reads.
    tube(m, (R * 0.78, 0.0, deck_z(R * 0.78) - 0.1), (R * 1.18, 0.0, -0.05), 0.48, 0.12, "chitin", n=8)
    for s in (-1, 1):
        knob(m, (R * 0.86, s * 0.48, deck_z(R * 0.86) + 0.04), 0.17, "eye")
        knob(m, (R * 0.78, s * 0.82, deck_z(R * 0.78) + 0.04), 0.13, "eye")
    # Stern: two glowing drive bulbs low on the rim.
    for s in (-1, 1):
        ellipsoid(m, (-R * 0.99, s * 0.85, -0.05), (0.42, 0.5, 0.3), "core", rings=6, seg=10)
    # Dome emitter in the middle: a raised crown, a glowing core, four prongs leaning in.
    top = deck_z(0.0)
    dome(m, 0.0, 0.0, top - 0.1, 1.1, 1.1, 0.75, banded_dome_mat(16, (4,)), rings=5, seg=16)
    knob(m, (0.0, 0.0, top + 0.9), 0.46, "core")
    tube(m, (0.0, 0.0, top + 0.65), (0.0, 0.0, top + 1.65), 0.17, 0.07, "barrel", n=6)
    knob(m, (0.0, 0.0, top + 1.72), 0.19, "core")
    for k in range(4):
        a = math.pi / 4 + k * math.pi / 2
        c, s = math.cos(a), math.sin(a)
        tube(m, (c * 1.25, s * 1.25, top - 0.05), (c * 0.45, s * 0.45, top + 1.5), 0.13, 0.05, "claw", n=5)
        knob(m, (c * 0.45, s * 0.45, top + 1.5), 0.1, "seam")
    # Barbettes: raised chitin rings with a glow band on top, where the mounts sit.
    for name in MOUNT_AT:
        x, y = model_xy(name)
        zt = mount_z(name)
        cylinder_z(m, x, y, 1.2, deck_z(math.hypot(x, y)) - 0.35, zt - 0.06, "chitin", n=20)
        cylinder_z(m, x, y, 1.25, zt - 0.06, zt, "seam", n=20)
    return m


def raise_barrel(m: Mesh, start: int, gz: float, elev_deg: float) -> None:
    """Raise the verts from `start` on about the trunnion at (0, gz), barrel along +x."""
    ce = math.cos(math.radians(elev_deg))
    se = math.sin(math.radians(elev_deg))
    for k in range(start, len(m.verts)):
        x, y, z = m.verts[k]
        m.verts[k] = np.array([x * ce - (z - gz) * se, y, gz + x * se + (z - gz) * ce])


def build_spine() -> Mesh:
    """Spine Turret head: a chitin bulb, a twin pulse repeater along +x."""
    m = Mesh()
    seg = 14
    dome(m, 0.0, 0.0, 0.0, 0.6, 0.55, 0.55, banded_dome_mat(seg, (3,), team_seg=seg // 4, team_rings=(4,)), rings=5, seg=seg)
    gz = 0.42
    ellipsoid(m, (-0.2, 0.0, gz + 0.05), (0.42, 0.36, 0.28), "chitin", rings=6, seg=10)
    for s in (-1, 1):
        tube_x(m, 0.1, 1.25, s * 0.17, gz, 0.085, "barrel", n=8)
        for x in (0.45, 0.8):
            tube_x(m, x, x + 0.09, s * 0.17, gz, 0.12, "seam", n=8)
        knob(m, (1.28, s * 0.17, gz), 0.1, "core")
    for s in (-1, 1):
        tube(m, (0.2, s * 0.32, gz + 0.12), (0.7, s * 0.4, gz + 0.32), 0.07, 0.02, "claw", n=5)
    return m


def build_pulse() -> Mesh:
    """Pulse Spire head: a long emitter along +x, a ring of green fire round its root."""
    m = Mesh()
    seg = 14
    dome(m, 0.0, 0.0, 0.0, 0.66, 0.6, 0.45, banded_dome_mat(seg, (2,), team_seg=seg // 4, team_rings=(4,)), rings=5, seg=seg)
    gz = 0.42
    ellipsoid(m, (-0.3, 0.0, gz + 0.08), (0.48, 0.34, 0.3), "chitin", rings=6, seg=10)
    tube_x(m, 0.15, 2.05, 0.0, gz, 0.11, "barrel", n=10)
    for x in (0.6, 1.05, 1.5):
        tube_x(m, x, x + 0.08, 0.0, gz, 0.16, "seam", n=10)
    # Ring of green fire round the root.
    for k in range(10):
        a = 2 * math.pi * k / 10
        knob(m, (0.3, 0.32 * math.cos(a), gz + 0.32 * math.sin(a)), 0.08, "vein")
    tube_x(m, 2.0, 2.15, 0.0, gz, 0.18, "chitin", n=10)
    knob(m, (2.18, 0.0, gz), 0.15, "core")
    return m


def build_maw(size: float, elev_deg: float) -> Mesh:
    """Mawcaster maw: a fat ribbed barrel raised `elev_deg` along +x, claws round a hot core."""
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
    raise_barrel(m, start, gz, elev_deg)
    m.verts = [p * size for p in m.verts]
    return m


# The mounts are drawn this much bigger than their plan, so they read on the ship at play zoom.
MOUNT_SIZE = 1.6


def scaled(mesh: Mesh) -> Mesh:
    mesh.verts = [p * MOUNT_SIZE for p in mesh.verts]
    return mesh


MOUNTS = {
    "spine": lambda: scaled(build_spine()),
    "pulse": lambda: scaled(build_pulse()),
    "maw": lambda: scaled(build_maw(1.0, 35.0)),
    "flak": lambda: scaled(build_maw(0.75, 62.0)),
}


def layer(mesh: Mesh, out: Path, name: str, **kw) -> None:
    render_turntable(mesh, out / name, f"mothership_{name}", f"mothership-{name}.json", SCALE_FRAC, 0.0, cy_frac=CY_FRAC, cell=CELL, ss=4, **kw)


def placed(mesh: Mesh, x: float, y: float, z: float) -> Mesh:
    m = Mesh()
    m.verts = [p + np.array([x, y, z]) for p in mesh.verts]
    m.tris = list(mesh.tris)
    return m


def merge(*meshes: Mesh) -> Mesh:
    m = Mesh()
    for part in meshes:
        base = len(m.verts)
        m.verts.extend(part.verts)
        m.tris.extend((a + base, b + base, c + base, mat) for a, b, c, mat in part.tris)
    return m


def whole() -> Mesh:
    return merge(build_hull(), *(placed(MOUNTS[n](), *model_xy(n), mount_z(n)) for n in MOUNT_AT))


def write_cameo(out: Path, path: Path) -> None:
    """72x72 cameo of the whole ship from the south-east face, brightened like the Xenite cameos."""
    tmp = out / "_cameo"
    render_turntable(whole(), tmp, "mothership_whole", "mothership-whole.json", SCALE_FRAC, 0.0, cy_frac=CY_FRAC, cell=CELL, ss=4)
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
    preview = Path(__file__).resolve().parent / "preview" / "mothership-whole.png"
    preview.parent.mkdir(parents=True, exist_ok=True)
    strip = Image.new("RGBA", (CELL * 8, CELL * 2), (40, 46, 42, 255))
    for k in range(16):
        im = Image.open(tmp / f"{k + 1:04d}.png").convert("RGBA")
        strip.alpha_composite(im, ((k % 8) * CELL, (k // 8) * CELL))
    strip.save(preview)
    print("wrote", preview)
    for f in tmp.iterdir():
        f.unlink()
    tmp.rmdir()
    (out / "mothership-whole.json").unlink(missing_ok=True)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True, help="unit folder; writes hull/, spine/, pulse/, maw/, flak/ inside it")
    args = ap.parse_args()
    out = Path(args.out)
    layer(build_hull(), out, "hull")
    for name, build in MOUNTS.items():
        layer(build(), out, name)
    write_cameo(out, out.parent / "mothership-cameo.png")
    # Pivot heights and muzzle reach the client lays the mounts with (render/mothership.ts).
    print(json.dumps({n: round(mount_z(n), 4) for n in MOUNT_AT}))
    # Scale check: a bounding box per face (no size pop between rows).
    for name in ("hull", *MOUNTS):
        boxes = [Image.open(out / name / f"{k + 1:04d}.png").getbbox() for k in range(16)]
        print(name, "bbox w/h per face:", [(b[2] - b[0], b[3] - b[1]) if b else None for b in boxes])


if __name__ == "__main__":
    main()
