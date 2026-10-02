#!/usr/bin/env python3
"""Mammoth: slow armored battle platform that carries infantry. One 16-face hull sheet.

Same numpy rasterizer, camera, splinter camo, and outline as
render_procedural.py (Stuka, drone) and render_nebelwerfer.py. No turret: the
only gun is a small ball-mounted machine gun in the bow plate.

  hull      a long, wide, low hull on two broad tracks; a raised boat bow so it
            can wade; a tall stepped fighting casemate over the rear two-thirds
            with firing slits on every face, and a gray team-tint roof hatch.
  wade      the same hull sunk to the deck. Tracks and the belly are below the
            pool; the casemate is what looks out. Same camera as the dry faces
            so the client can share one scale and contact.

0001 = nose screen-south, then clockwise 22.5° through 0016. No national insignia.

  python tools/sprites/render_mammoth.py \\
      --out gridlock/packages/client/src/assets/units/mammoth
  python tools/sprites/render_mammoth.py --wade \\
      --out gridlock/packages/client/src/assets/units/mammoth
"""

from __future__ import annotations

import argparse
import math
from pathlib import Path

import numpy as np
from PIL import Image

from render_procedural import Mesh, ellipse_ring, render_turntable

# Meters. +x nose, +y left, +z up. Feet on z = 0.
SCALE_FRAC = 0.074  # px per meter / cell px
Z_MID = 2.6
CY_FRAC = 0.6

BELLY_Z = 2.45  # underside of the body
DECK_Z = 3.95  # body roof
HIP_X = 1.95  # leg hips, fore and aft of the middle
HIP_Y = 1.6
HIP_Z = 2.85
POD_Y0, POD_Y1 = 1.3, 2.45  # inner / outer face of the side pods


def slab(m: Mesh, bottom: list[tuple[float, float]], z0: float, z1: float, top: list[tuple[float, float]], mat: str, top_mat: str | None = None) -> None:
    """Prism from an x/y outline at z0 to a (smaller) outline at z1: sloped armor. Outlines are convex."""
    bot = [m.v((x, y, z0)) for x, y in bottom]
    tp = [m.v((x, y, z1)) for x, y in top]
    n = len(bot)
    for i in range(n):
        j = (i + 1) % n
        m.quad(bot[i], bot[j], tp[j], tp[i], mat)
    for i in range(1, n - 1):
        m.tri(tp[0], tp[i], tp[i + 1], top_mat or mat)
        m.tri(bot[0], bot[i + 1], bot[i], mat)


def cyl(m: Mesh, c: tuple[float, float, float], axis: int, r: float, h: float, mat: str, n: int = 12) -> None:
    """Capped cylinder centred on `c`, running `h` along model axis 0 (x), 1 (y) or 2 (z)."""
    u, w = [i for i in range(3) if i != axis]
    rings = []
    for t in (-h / 2, h / 2):
        ring_ = []
        for k in range(n):
            p = np.array(c, dtype=np.float64)
            p[axis] += t
            p[u] += r * math.cos(2 * math.pi * k / n)
            p[w] += r * math.sin(2 * math.pi * k / n)
            ring_.append(p)
        rings.append(ring_)
    m.loft(rings, mat)


def beam(m: Mesh, p0: tuple[float, float, float], p1: tuple[float, float, float], wy: float, wx: float, mat: str) -> None:
    """Box from p0 to p1. `wy` is the width across the body (model y), `wx` the depth fore and aft."""
    a = np.array(p1, dtype=np.float64) - np.array(p0, dtype=np.float64)
    a /= np.linalg.norm(a)
    side = np.array([0.0, 1.0, 0.0]) - a * a[1]
    side /= np.linalg.norm(side)
    fore = np.cross(side, a)
    corners = [side * sy * wy / 2 + fore * sx * wx / 2 for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    m.loft([[np.array(p0) + c for c in corners], [np.array(p1) + c for c in corners]], mat)


def leg(m: Mesh, fx: int, sy: int) -> None:
    """One leg. `fx` +1 fore, -1 aft; `sy` +1 left, -1 right. Hip housing, splayed thigh, louvred shin, broad pad."""
    hip = (fx * HIP_X, sy * HIP_Y, HIP_Z)
    knee = (fx * (HIP_X + 0.55), sy * (HIP_Y + 0.75), 1.6)
    ankle = (fx * (HIP_X + 0.35), sy * (HIP_Y + 0.75), 0.5)
    cyl(m, hip, 1, 0.48, 0.7, "metal")
    beam(m, hip, knee, 0.72, 0.95, "camo")
    # Armored knee cap over the joint, then the shin with cooling louvres down its outer face.
    cyl(m, knee, 1, 0.4, 0.95, "metal")
    beam(m, (knee[0], knee[1], knee[2] + 0.15), ankle, 0.78, 0.82, "camo")
    face = ankle[1] + sy * 0.4
    for i in range(3):
        z = 0.85 + i * 0.22
        m.box((ankle[0] - 0.25, min(face, face + sy * 0.03), z), (ankle[0] + 0.25, max(face, face + sy * 0.03), z + 0.09), "tire")
    # Foot pad with a sloped toe and heel, wider than the shin so the stance reads planted.
    ax, ay = ankle[0], ankle[1]
    slab(m, [(ax - 0.75, ay - 0.62), (ax + 0.95, ay - 0.62), (ax + 0.95, ay + 0.62), (ax - 0.75, ay + 0.62)], 0.0, 0.5,
         [(ax - 0.45, ay - 0.48), (ax + 0.55, ay - 0.48), (ax + 0.55, ay + 0.48), (ax - 0.45, ay + 0.48)], "frame")
    m.box((ax - 0.3, ay - 0.42, 0.5), (ax + 0.3, ay + 0.42, 0.62), "metal")


def pod(m: Mesh, sy: int) -> None:
    """Side pod over the hips: bevelled armor box, smoke tubes in the nose, firing slits, a periscope head aft."""
    y0, y1 = sy * POD_Y0, sy * POD_Y1
    lo, hi = min(y0, y1), max(y0, y1)
    x0, x1 = -2.7, 2.55
    m.box((x0, lo, 2.95), (x1, hi, 3.7), "camo")
    # Rounded-off top: the outer edge is bevelled down.
    yb = sy * (POD_Y1 - 0.35)
    slab(m, [(x0, y0), (x1, y0), (x1, y1), (x0, y1)], 3.7, 4.05,
         [(x0 + 0.1, y0), (x1 - 0.15, y0), (x1 - 0.15, yb), (x0 + 0.1, yb)], "camo")
    # Nose: a dark recess and a two-by-two block of smoke-discharger tubes.
    m.box((x1, lo + 0.12, 3.05), (x1 + 0.04, hi - 0.12, 3.85), "tire")
    for dy in (-0.25, 0.25):
        for dz in (-0.2, 0.2):
            cyl(m, (x1 + 0.12, sy * (POD_Y0 + POD_Y1) / 2 + dy, 3.45 + dz), 0, 0.14, 0.22, "metal", 10)
    # Garrison firing slits on the outer face, three a side.
    for i in range(3):
        x = -1.7 + i * 1.3
        m.box((x - 0.3, hi - 0.02 if sy > 0 else lo - 0.02, 3.3), (x + 0.3, hi + 0.02 if sy > 0 else lo + 0.02, 3.42), "tire")
    # Drive hub on the outer face, aft.
    cyl(m, (-2.15, sy * (POD_Y1 + 0.04), 3.35), 1, 0.24, 0.1, "metal", 10)
    # Periscope head on a short mast, two lenses forward, and a rod antenna.
    hx, hy = -2.1, sy * (POD_Y0 + POD_Y1) / 2
    m.box((hx - 0.15, hy - 0.15, 4.05), (hx + 0.15, hy + 0.15, 4.5), "metal")
    m.box((hx - 0.42, hy - 0.42, 4.5), (hx + 0.38, hy + 0.42, 4.95), "frame")
    for dy in (-0.18, 0.18):
        m.box((hx + 0.38, hy + dy - 0.1, 4.62), (hx + 0.46, hy + dy + 0.1, 4.8), "glass")
    m.box((hx - 0.3, hy - 0.04, 4.95), (hx - 0.22, hy + 0.04, 5.9), "metal")


def sink(m: Mesh, dz: float) -> None:
    m.verts = [np.asarray(v, dtype=np.float64) + np.array([0.0, 0.0, dz]) for v in m.verts]


def ellipse(m: Mesh, z: float, cx: float, cy: float, rx: float, ry: float, mat: str, n: int = 40) -> list[int]:
    """Flat disc facing up. Returns the rim vertex ids."""
    center = m.v((cx, cy, z))
    rim = [m.v((cx + rx * math.cos(2 * math.pi * k / n), cy + ry * math.sin(2 * math.pi * k / n), z)) for k in range(n)]
    for k in range(n):
        m.tri(center, rim[k], rim[(k + 1) % n], mat)
    return rim


def ring(m: Mesh, z: float, cx: float, cy: float, rx0: float, ry0: float, rx1: float, ry1: float, mat: str, n: int = 40) -> None:
    inner = [m.v((cx + rx0 * math.cos(2 * math.pi * k / n), cy + ry0 * math.sin(2 * math.pi * k / n), z)) for k in range(n)]
    outer = [m.v((cx + rx1 * math.cos(2 * math.pi * k / n), cy + ry1 * math.sin(2 * math.pi * k / n), z)) for k in range(n)]
    for k in range(n):
        j = (k + 1) % n
        m.quad(inner[k], outer[k], outer[j], inner[j], mat)


# Waist deep. The cut runs just under the side pods: the legs and the belly
# stay in the pool; the pods, the cab, and the deck are what look out.
WADE_Z = BELLY_Z + 0.55


def build_pool() -> Mesh:
    """Pool on the contact plane, a little wider than the stance, with one foam lip."""
    m = Mesh()
    cx, cy = 0.15, 0.0
    rx, ry = 4.3, 3.1
    ellipse(m, 0.03, cx, cy, rx, ry, "water")
    ring(m, 0.08, cx, cy, rx * 0.78, ry * 0.78, rx * 0.92, ry * 0.92, "foam")
    return m


def build_hull() -> Mesh:
    m = Mesh()
    # Body slung between the hips: sloped side plates, a belly plate underneath.
    slab(m, [(-2.55, -1.45), (2.3, -1.45), (2.3, 1.45), (-2.55, 1.45)], BELLY_Z, DECK_Z,
         [(-2.4, -1.35), (2.1, -1.35), (2.1, 1.35), (-2.4, 1.35)], "camo")
    m.box((-2.0, -1.0, BELLY_Z - 0.2), (1.8, 1.0, BELLY_Z), "metal")
    # Roof deck, and a raised centre plate whose top is the gray team-tint panel.
    m.box((-2.75, -1.3, DECK_Z), (1.95, 1.3, DECK_Z + 0.25), "camo")
    slab(m, [(-1.2, -0.95), (1.75, -0.95), (1.75, 0.95), (-1.2, 0.95)], DECK_Z + 0.25, DECK_Z + 0.5,
         [(-1.1, -0.85), (1.35, -0.85), (1.35, 0.85), (-1.1, 0.85)], "camo", "team")
    # Tiger-style commander's cupola: drum, vision blocks round it, gray hatch on top.
    cx, cy = -1.75, 0.45
    cyl(m, (cx, cy, DECK_Z + 0.42), 2, 0.42, 0.34, "camo", 16)
    for k in range(6):
        a = 2 * math.pi * k / 6
        m.box((cx + 0.4 * math.cos(a) - 0.07, cy + 0.4 * math.sin(a) - 0.07, DECK_Z + 0.45), (cx + 0.4 * math.cos(a) + 0.07, cy + 0.4 * math.sin(a) + 0.07, DECK_Z + 0.55), "tire")
    cyl(m, (cx, cy, DECK_Z + 0.62), 2, 0.34, 0.06, "team", 16)
    # Cab jutting out over the bow: boxy, with a sloped hood back to the deck.
    m.box((1.9, -1.0, 2.05), (3.3, 1.0, 3.3), "camo")
    slab(m, [(1.9, -1.0), (3.3, -1.0), (3.3, 1.0), (1.9, 1.0)], 3.3, 3.95,
         [(1.9, -0.9), (2.55, -0.9), (2.55, 0.9), (1.9, 0.9)], "camo")
    # Driver's visor block on the cab face: two thick-glass slits under an armored brow.
    m.box((3.3, -0.7, 2.5), (3.42, 0.7, 3.15), "frame")
    for z in (2.62, 2.9):
        m.box((3.42, -0.55, z), (3.45, 0.55, z + 0.12), "glass")
    m.box((3.3, -0.78, 3.15), (3.55, 0.78, 3.24), "frame")
    # Spare track links bolted on both cab cheeks.
    for s in (-1, 1):
        for i in range(4):
            x = 2.05 + i * 0.32
            m.box((x, s * 1.0 - 0.04, 2.3), (x + 0.26, s * 1.0 + 0.04, 3.05), "tire")
    # Blackout lamps on the cab corners so the nose reads at any yaw.
    for s in (-1, 1):
        m.box((3.3, s * 0.88 - 0.1, 2.15), (3.45, s * 0.88 + 0.1, 2.32), "hazard")
    # Chin ball mount with twin machine guns.
    ball = [ellipse_ring(3.0 + 0.3 * math.sin(math.pi * i / 6), 0.0, 1.88, 0.32 * math.cos(math.pi * (i / 6 - 0.5)) + 0.02, 0.32 * math.cos(math.pi * (i / 6 - 0.5)) + 0.02, 12) for i in range(7)]
    m.loft(ball, "metal")
    for s in (-1, 1):
        cyl(m, (3.5, s * 0.13, 1.88), 0, 0.08, 0.5, "metal", 8)
        cyl(m, (3.95, s * 0.13, 1.88), 0, 0.04, 0.6, "tire", 6)
    # Stern: engine grilles on the deck, twin exhausts with flame guards, jerry cans.
    for i in range(3):
        m.box((-2.65 + i * 0.32, -1.0, DECK_Z + 0.25), (-2.45 + i * 0.32, 1.0, DECK_Z + 0.3), "frame")
    for s in (-1, 1):
        cyl(m, (-2.75, s * 0.75, DECK_Z - 0.35), 2, 0.17, 0.9, "metal", 10)
        m.box((-2.98, s * 0.75 - 0.22, DECK_Z - 0.2), (-2.88, s * 0.75 + 0.22, DECK_Z + 0.25), "frame")
    for y in (-0.25, 0.1):
        m.box((-2.85, y, 2.75), (-2.55, y + 0.3, 3.35), "frame")
    for s in (-1, 1):
        pod(m, s)
    for fx in (-1, 1):
        for s in (-1, 1):
            leg(m, fx, s)
    return m


# A 3/4 front view reads the bow, one track, and the slitted casemate.
CAMEO_FACE = "0014"
CAMEO_GAIN = 1.55
CAMEO_LIFT = 0.04


def cameo(out: Path, face: str = CAMEO_FACE, path: Path | None = None) -> None:
    """Static cameo, brightened for the dark sidebar and filling the 128 frame, like the Nebelwerfer's."""
    hull = Image.open(out / "hull" / f"{face}.png").convert("RGBA")
    crop = hull.crop(hull.getbbox())
    px = np.asarray(crop).astype(np.float64) / 255
    rgb = px[..., :3]
    dark = rgb.max(axis=-1, keepdims=True) < 0.12
    lifted = np.clip(rgb * CAMEO_GAIN + CAMEO_LIFT, 0, 1)
    px[..., :3] = np.where(dark, rgb, lifted)
    crop = Image.fromarray((px * 255 + 0.5).astype(np.uint8), "RGBA")
    size, pad = 128, 3
    fit = (size - 2 * pad) / max(crop.width, crop.height)
    small = crop.resize((max(1, round(crop.width * fit)), max(1, round(crop.height * fit))), Image.Resampling.LANCZOS)
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    img.alpha_composite(small, ((size - small.width) // 2, size - pad - small.height))
    path = path or out.parent / "mammoth-cameo.png"
    img.save(path)
    print("wrote", path)


def render_wade(out: Path, ss: int) -> None:
    """Same camera as the dry hull. The mesh is dropped so the deck sits on the contact plane."""
    hull = build_hull()
    sink(hull, -WADE_Z)
    render_turntable(
        hull,
        out / "wade",
        "mammoth_wade",
        "mammoth-wade.json",
        scale_frac=SCALE_FRAC,
        z_mid=Z_MID,
        cy_frac=CY_FRAC,
        ss=ss,
        clip_z=0.0,
        underlay=build_pool(),
    )


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True, help="unit folder; writes hull/ inside it")
    ap.add_argument("--ss", type=int, default=4)
    ap.add_argument("--cameo-only", action="store_true")
    ap.add_argument("--wade", action="store_true", help="half-sunk water faces only (wade/)")
    args = ap.parse_args()
    out = Path(args.out)
    if args.wade:
        render_wade(out, args.ss)
        return
    if not args.cameo_only:
        render_turntable(build_hull(), out / "hull", "mammoth_hull", "mammoth-hull.json",
                         scale_frac=SCALE_FRAC, z_mid=Z_MID, cy_frac=CY_FRAC, ss=args.ss)
    cameo(out)


if __name__ == "__main__":
    main()
