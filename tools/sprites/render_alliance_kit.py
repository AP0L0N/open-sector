#!/usr/bin/env python3
"""Shared kit for the modern Alliance vehicle line (Warden, Vanguard, Breaker, Firestorm,
Hailstorm, Artillery, Supply Truck, and the ships and planes that draw on it).

One camera, one light, one palette, one outline: everything comes from
render_procedural.py (orthographic, 30° down, 2:1 ground, 0001 = nose
screen-south then clockwise 22.5°). This module only adds the materials and
the mesh helpers that give the line its look, so every script stays short and
every hull matches.

The look (not WW2 any more):
  - low flat hulls, a long shallow glacis, flat engine decks with louvres
  - side skirts that hide the road wheels; only their bottoms peek out
  - wedge-nosed turrets with flat roofs, a boxed thermal sight, a panoramic
    sight, a remote weapon station, a slat bustle rack
  - reactive-armor tiles in a grid on the big flat faces
  - smoke discharger clusters on the cheeks, a sensor mast on the roof
  - smoothbore guns: a thermal sleeve, a fume-extractor bulge, no muzzle brake
  - neutral gray team panels the game tints; no insignia

Model units are meters. +x nose, +y left, +z up, ground at z = 0.
"""

from __future__ import annotations

import math
from pathlib import Path
from typing import Callable, Sequence

import numpy as np
from PIL import Image

import render_procedural as rp
from render_procedural import Mesh, render_turntable

# --------------------------------------------------------------------------- palette

rp.MAT.update(
    {
        # Chassis: the neutral gray the game tints (same base as the Apocalypse and Breaker).
        "armor": (rp.hex_rgb("#6e6e68"), 0.12, 1.0),
        # Darker plate: lower hull, mantlets, mounts, sight boxes.
        "plate": (rp.hex_rgb("#4a4a46"), 0.08, 1.0),
        # Reactive-armor tiles: a touch lighter than the hull so the grid reads.
        "era": (rp.hex_rgb("#7c7c74"), 0.10, 1.0),
        # Rubber and running gear.
        "track": (rp.hex_rgb("#26241f"), 0.03, 1.0),
        "wheel": (rp.hex_rgb("#3c3b36"), 0.15, 1.0),
        "tire": (rp.hex_rgb("#1f1d1a"), 0.02, 1.0),
        # Guns and barrels.
        "barrel": (rp.hex_rgb("#55554f"), 0.30, 1.0),
        # Sensor glass: dark teal, a little specular.
        "sensor": (rp.hex_rgb("#1f3a40"), 0.55, 1.0),
        # Radome / optics housings.
        "radome": (rp.hex_rgb("#d8d4c4"), 0.25, 1.0),
        # Slat cage and railings.
        "slat": (rp.hex_rgb("#3a3a36"), 0.12, 1.0),
        # Team-tint panel.
        "team": (rp.hex_rgb("#7a7a74"), 0.10, 1.0),
        "hazard": (rp.hex_rgb("#d4a017"), 0.05, 1.0),
        # Soft-skin canvas and crates for trucks.
        "canvas": (rp.hex_rgb("#5a6b3d"), 0.02, 1.0),
        "crate": (rp.hex_rgb("#8a6e52"), 0.02, 1.0),
    }
)

# --------------------------------------------------------------------------- primitives


def slab(m: Mesh, bottom: Sequence[tuple[float, float]], z0: float, z1: float, top: Sequence[tuple[float, float]], mat: str, top_mat: str | None = None) -> None:
    """Prism from an x/y outline at z0 to a (possibly smaller) outline at z1: sloped armor. Outlines convex, same length."""
    b = [m.v((x, y, z0)) for x, y in bottom]
    t = [m.v((x, y, z1)) for x, y in top]
    n = len(b)
    for i in range(n):
        j = (i + 1) % n
        m.quad(b[i], b[j], t[j], t[i], mat)
    for i in range(1, n - 1):
        m.tri(t[0], t[i], t[i + 1], top_mat or mat)
        m.tri(b[0], b[i + 1], b[i], mat)


def cylinder_y(m: Mesh, x: float, z: float, r: float, y0: float, y1: float, mat: str, n: int = 12) -> None:
    """Short cylinder whose axis runs along y (a road wheel)."""
    rings = [[np.array([x + r * math.cos(2 * math.pi * k / n), yy, z + r * math.sin(2 * math.pi * k / n)]) for k in range(n)] for yy in (y0, y1)]
    m.loft(rings, mat)


def cylinder_z(m: Mesh, cx: float, cy: float, r: float, z0: float, z1: float, mat: str, n: int = 16) -> None:
    rings = [[np.array([cx + r * math.cos(2 * math.pi * k / n), cy + r * math.sin(2 * math.pi * k / n), zz]) for k in range(n)] for zz in (z0, z1)]
    m.loft(rings, mat)


def tube_x(m: Mesh, x0: float, x1: float, y: float, z: float, r: float, mat: str, n: int = 10) -> None:
    """Barrel along +x from x0 to x1."""
    rings = [[np.array([xx, y + r * math.cos(2 * math.pi * k / n), z + r * math.sin(2 * math.pi * k / n)]) for k in range(n)] for xx in (x0, x1)]
    m.loft(rings, mat)


def tube(m: Mesh, p0, p1, r: float, mat: str, n: int = 10) -> None:
    """Capped tube between two points, any direction."""
    p0 = np.asarray(p0, dtype=np.float64)
    p1 = np.asarray(p1, dtype=np.float64)
    d = p1 - p0
    ln = np.linalg.norm(d)
    if ln < 1e-9:
        return
    d /= ln
    up = np.array([0.0, 0.0, 1.0]) if abs(d[2]) < 0.9 else np.array([1.0, 0.0, 0.0])
    u = np.cross(d, up)
    u /= np.linalg.norm(u)
    w = np.cross(d, u)
    rings = [[p + r * (math.cos(2 * math.pi * k / n) * u + math.sin(2 * math.pi * k / n) * w) for k in range(n)] for p in (p0, p1)]
    m.loft(rings, mat)


def ybox(m: Mesh, x0: float, x1: float, s: int, y_in: float, y_out: float, z0: float, z1: float, mat: str) -> None:
    """A box on side `s` (+1 left, -1 right) between the inner and outer |y| faces. Saves min/max juggling."""
    ya, yb = sorted((s * y_in, s * y_out))
    m.box((x0, ya, z0), (x1, yb, z1), mat)


# --------------------------------------------------------------------------- running gear


def tracks(
    m: Mesh,
    x0: float,
    x1: float,
    y_in: float,
    y_out: float,
    wheel_r: float = 0.42,
    wheels: int = 7,
    skirt_z: tuple[float, float] | None = (0.5, 1.25),
    skirt_mat: str = "armor",
    team_rail: bool = True,
) -> None:
    """Both track runs between x0 (rear) and x1 (nose): a low stadium loft, road wheels outboard,
    a drive sprocket at the nose, and a full-length side skirt that hides the top half of the wheels.
    `skirt_z` is the skirt's bottom and top. `team_rail` puts a neutral tint strip along the skirt's top edge.
    """
    r = wheel_r + 0.08
    zc = r
    xf, xr = x1 - 0.45, x0 + 0.4
    prof: list[tuple[float, float]] = []
    for k in range(9):
        a = -math.pi / 2 + math.pi * k / 8
        prof.append((xf + r * math.cos(a), zc + r * math.sin(a) + (0.18 if a > 0 else 0) * math.sin(a)))
    for k in range(9):
        a = math.pi / 2 + math.pi * k / 8
        prof.append((xr + r * math.cos(a), zc + r * math.sin(a) + (0.18 if a < math.pi else 0) * math.sin(a)))
    for s in (-1, 1):
        rings = [[np.array([x, s * yy, z]) for x, z in prof] for yy in (y_in, y_out)]
        m.loft(rings, "track")
        out = s * (y_out + 0.02)
        for i in range(wheels):
            x = xr + 0.25 + i * (xf - xr - 0.5) / max(1, wheels - 1)
            cylinder_y(m, x, wheel_r, wheel_r - 0.04, out - 0.06 * s, out, "wheel")
        cylinder_y(m, xf + 0.08, wheel_r + 0.2, wheel_r - 0.02, out - 0.08 * s, out + 0.02 * s, "plate")
        if skirt_z:
            z0, z1 = skirt_z
            ybox(m, x0 + 0.15, x1 - 0.3, s, y_out + 0.03, y_out + 0.15, z0, z1, skirt_mat)
            if team_rail:
                ybox(m, x0 + 0.3, x1 - 0.5, s, y_out + 0.03, y_out + 0.17, z1 - 0.1, z1, "team")


def road_wheel(m: Mesh, x: float, y: float, r: float, w: float, mat: str = "tire", hub: bool = True) -> None:
    """A rubber wheel for a wheeled hull, axle along y, hub facing out."""
    cylinder_y(m, x, r, r, y - w / 2, y + w / 2, mat, 14)
    if hub:
        s = 1 if y > 0 else -1
        cylinder_y(m, x, r, r * 0.5, y + s * w / 2, y + s * (w / 2 + 0.03), "wheel", 10)


# --------------------------------------------------------------------------- fittings


def era_tiles(m: Mesh, axis: str, s: int, plane: float, u0: float, u1: float, v0: float, v1: float, nu: int, nv: int, depth: float = 0.08, gap: float = 0.06, mat: str = "era") -> None:
    """Grid of reactive-armor tiles proud of a flat face.

    `axis` is the face normal: "y" (hull side at y = plane, outward sign s), "x" (nose / tail
    at x = plane), or "z" (a roof at z = plane). u/v are the two in-plane extents:
    for "y" they are x/z, for "x" y/z, for "z" x/y.
    """
    du = (u1 - u0 - gap * (nu - 1)) / nu
    dv = (v1 - v0 - gap * (nv - 1)) / nv
    for i in range(nu):
        for j in range(nv):
            ua = u0 + i * (du + gap)
            va = v0 + j * (dv + gap)
            ub, vb = ua + du, va + dv
            pa, pb = sorted((plane, plane + s * depth))
            if axis == "y":
                m.box((ua, pa, va), (ub, pb, vb), mat)
            elif axis == "x":
                m.box((pa, ua, va), (pb, ub, vb), mat)
            else:
                m.box((ua, va, pa), (ub, vb, pb), mat)


def dischargers(m: Mesh, x: float, y: float, z: float, s: int, n: int = 4, r: float = 0.07) -> None:
    """A cluster of smoke-grenade tubes on a turret cheek, splayed out to side `s`."""
    for i in range(n):
        yy = y + s * i * 0.19
        a = math.radians(25 + 12 * i)
        p0 = np.array([x, yy, z])
        p1 = p0 + 0.42 * np.array([math.cos(a), s * math.sin(a) * 0.6, 0.45])
        tube(m, p0, p1, r, "plate", 6)


def sight_box(m: Mesh, x0: float, x1: float, y0: float, y1: float, z0: float, z1: float) -> None:
    """A boxed thermal sight: dark housing with a sensor-glass window on its +x face."""
    m.box((x0, y0, z0), (x1, y1, z1), "plate")
    m.box((x1, y0 + 0.08, z0 + 0.1), (x1 + 0.03, y1 - 0.08, z1 - 0.1), "sensor")


def panoramic_sight(m: Mesh, x: float, y: float, z: float, r: float = 0.22, h: float = 0.5) -> None:
    """Commander's panoramic sight: a short mast with a head that looks +x."""
    cylinder_z(m, x, y, r * 0.5, z, z + h * 0.55, "plate", 10)
    m.box((x - r, y - r, z + h * 0.55), (x + r, y + r, z + h), "plate")
    m.box((x + r, y - r * 0.6, z + h * 0.65), (x + r + 0.03, y + r * 0.6, z + h * 0.92), "sensor")


def rws(m: Mesh, x: float, y: float, z: float, k: float = 1.0) -> None:
    """Remote weapon station: ring, cradle, a short machine gun looking +x, and a small sight."""
    cylinder_z(m, x, y, 0.3 * k, z, z + 0.1 * k, "wheel", 12)
    m.box((x - 0.25 * k, y - 0.2 * k, z + 0.1 * k), (x + 0.2 * k, y + 0.2 * k, z + 0.42 * k), "plate")
    tube_x(m, x + 0.2 * k, x + 0.95 * k, y, z + 0.3 * k, 0.05 * k, "barrel", 6)
    m.box((x - 0.1 * k, y + 0.2 * k, z + 0.18 * k), (x + 0.15 * k, y + 0.34 * k, z + 0.4 * k), "sensor")


def mast(m: Mesh, x: float, y: float, z0: float, z1: float, r: float = 0.05, head: float = 0.16) -> None:
    """A sensor mast with a small head block."""
    cylinder_z(m, x, y, r, z0, z1, "slat", 8)
    m.box((x - head / 2, y - head / 2, z1), (x + head / 2, y + head / 2, z1 + head), "plate")


def slat_cage(m: Mesh, x0: float, x1: float, y0: float, y1: float, z0: float, z1: float, bars: int = 6, bar: float = 0.05, faces: str = "xy") -> None:
    """A slat / stowage cage: thin vertical bars along the faces listed ('x' = the x0/x1 faces, 'y' = the y0/y1 faces),
    with a top and bottom rail. Open above."""
    rails = [((x0, y0, z0), (x1, y1, z0 + bar)), ((x0, y0, z1 - bar), (x1, y1, z1))]
    for lo, hi in rails:
        # Hollow rail: four thin boxes.
        m.box((lo[0], lo[1], lo[2]), (hi[0], lo[1] + bar, hi[2]), "slat")
        m.box((lo[0], hi[1] - bar, lo[2]), (hi[0], hi[1], hi[2]), "slat")
        m.box((lo[0], lo[1], lo[2]), (lo[0] + bar, hi[1], hi[2]), "slat")
        m.box((hi[0] - bar, lo[1], lo[2]), (hi[0], hi[1], hi[2]), "slat")
    if "y" in faces:
        for i in range(bars):
            x = x0 + bar + i * (x1 - x0 - 2 * bar - bar) / max(1, bars - 1)
            m.box((x, y0, z0), (x + bar, y0 + bar, z1), "slat")
            m.box((x, y1 - bar, z0), (x + bar, y1, z1), "slat")
    if "x" in faces:
        n = max(2, bars // 2)
        for i in range(n):
            y = y0 + bar + i * (y1 - y0 - 2 * bar - bar) / max(1, n - 1)
            m.box((x0, y, z0), (x0 + bar, y + bar, z1), "slat")
            m.box((x1 - bar, y, z0), (x1, y + bar, z1), "slat")


def louvres(m: Mesh, x0: float, x1: float, y0: float, y1: float, z: float, n: int = 4, along: str = "x", h: float = 0.05) -> None:
    """Engine-deck grille: thin raised bars."""
    if along == "x":
        for i in range(n):
            y = y0 + (i + 0.5) * (y1 - y0) / n
            m.box((x0, y - 0.03, z), (x1, y + 0.03, z + h), "plate")
    else:
        for i in range(n):
            x = x0 + (i + 0.5) * (x1 - x0) / n
            m.box((x - 0.03, y0, z), (x + 0.03, y1, z + h), "plate")


def smoothbore(m: Mesh, x0: float, x1: float, y: float, z: float, r: float = 0.13, sleeve: float = 1.0, extractor: tuple[float, float] | None = None) -> None:
    """A modern gun: thick breech/thermal sleeve, long tube, an optional fume-extractor bulge (x from, x to), a plain muzzle."""
    tube_x(m, x0, x0 + sleeve, y, z, r + 0.07, "barrel")
    tube_x(m, x0 + sleeve - 0.02, x1, y, z, r, "barrel")
    if extractor:
        tube_x(m, extractor[0], extractor[1], y, z, r + 0.05, "barrel")
    tube_x(m, x1 - 0.2, x1, y, z, r + 0.02, "plate")  # muzzle reference collar


def headlights(m: Mesh, x: float, w: float, z: float, s_list=(-1, 1), size: float = 0.14) -> None:
    for s in s_list:
        m.box((x - 0.25, s * w - size, z - 0.18), (x, s * w + size, z - 0.02), "hazard")


# --------------------------------------------------------------------------- output


def cameo(unit_dir: Path, layers: Sequence[str], path: Path, face: str = "0014", gain: float = 1.3, lift: float = 0.03) -> None:
    """Train-button cameo: the layers of one face composed, brightened, fit into 128 px bottom-aligned."""
    img = None
    for layer in layers:
        p = unit_dir / layer / f"{face}.png"
        if not p.exists():
            continue
        im = Image.open(p).convert("RGBA")
        img = im if img is None else Image.alpha_composite(img, im)
    assert img is not None, f"no layers under {unit_dir}"
    crop = img.crop(img.getbbox())
    px = np.asarray(crop).astype(np.float64) / 255
    rgb = px[..., :3]
    dark = rgb.max(axis=-1, keepdims=True) < 0.12
    px[..., :3] = np.where(dark, rgb, np.clip(rgb * gain + lift, 0, 1))
    crop = Image.fromarray((px * 255 + 0.5).astype(np.uint8), "RGBA")
    size, pad = 128, 3
    fit = (size - 2 * pad) / max(crop.width, crop.height)
    small = crop.resize((max(1, round(crop.width * fit)), max(1, round(crop.height * fit))), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    canvas.alpha_composite(small, ((size - small.width) // 2, size - pad - small.height))
    canvas.save(path)
    print("wrote", path)


def render_unit(
    unit_id: str,
    out: Path,
    layers: Sequence[tuple[str, Callable[[], Mesh]]],
    scale_frac: float,
    z_mid: float,
    cy_frac: float = 0.6,
    ss: int = 4,
    cell: int = 256,
    cameo_face: str = "0014",
    cameo_path: Path | None = None,
    cameo_gain: float = 1.3,
    cameo_lift: float = 0.03,
    **turntable_kw,
) -> None:
    """Render every layer of one unit into `out/<layer>/0001..0016.png` with its manifest, then the cameo."""
    for name, build in layers:
        render_turntable(build(), out / name, f"{unit_id}_{name}", f"{unit_id}-{name}.json", scale_frac=scale_frac, z_mid=z_mid, cy_frac=cy_frac, ss=ss, cell=cell, **turntable_kw)
    cameo(out, [n for n, _ in layers], cameo_path or out.parent / f"{unit_id}-cameo.png", cameo_face, cameo_gain, cameo_lift)


def contact_sheet(unit_dir: Path, layers: Sequence[str], path: Path, faces: Sequence[str] = ("0001", "0003", "0005", "0009", "0013", "0014")) -> None:
    """A quick preview strip of composed faces for eyeballing a design."""
    cell = 220
    sheet = Image.new("RGBA", (cell * len(faces), cell), (40, 40, 40, 255))
    for c, f in enumerate(faces):
        comp = None
        for layer in layers:
            p = unit_dir / layer / f"{f}.png"
            if not p.exists():
                continue
            im = Image.open(p).convert("RGBA")
            comp = im if comp is None else Image.alpha_composite(comp, im)
        if comp is None:
            continue
        bb = comp.getbbox()
        if bb:
            comp = comp.crop(bb)
        k = min((cell - 8) / comp.width, (cell - 8) / comp.height, 1.0)
        comp = comp.resize((max(1, int(comp.width * k)), max(1, int(comp.height * k))), Image.Resampling.LANCZOS)
        sheet.alpha_composite(comp, (c * cell + (cell - comp.width) // 2, (cell - comp.height) // 2))
    path.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(path)
    print("wrote", path)
