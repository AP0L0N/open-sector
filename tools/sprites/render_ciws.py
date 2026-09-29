#!/usr/bin/env python3
"""CIWS building art: a static base and a 16-row traversing gun, one canvas.

The base (pad, plinth, ammo boxes, a sandbag lip) is an ordinary structure
image. The gun (turntable ring, gatling body, barrel cluster, radome) is a
16-row sheet. Every row is the same canvas and anchor as the base, so the
client draws the row with the base's BuildingSpriteDef metrics.

Rows are south-first, clockwise (engine order). Row k is solved so the
barrels project to screen angle south + k·22.5°, the same rule
`engineRowFromScreen` uses to pick a unit row, so a gun at world facing f
draws the row `engineRowFromProjectedFacing(f)` returns.

Look: the inked structure style of render_airfield.py (same mesh, raster,
ink, silhouette, key light, and cast shadow), at the 3× source zoom of the
Armory and Dynamo.

  python tools/sprites/render_ciws.py --out gridlock/packages/client/src/assets/buildings
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

import render_airfield as ra

# Footprint, world px: t(1) × t(1) gameplay tiles. Must match catalog.ts.
W = H = 32.0
CX, CY = W / 2, H / 2
ra.ZOOM = 3.0  # source px per world px, like the Armory / Dynamo sheets
SS = ra.SS
TOP_MARGIN = 30.0
SIDE_MARGIN = 10.0
DIRS = 16
ENGINE_ORDER = ["S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW", "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE"]

PLINTH_TOP = 4.2
GUN_Z = 8.4
# The gun is drawn a size up from the pad so it reads at game zoom. Scaled about the plinth top.
GUN_SCALE = 1.2


def rgb(h: str) -> np.ndarray:
    return ra.rgb(h)


_base_tex = ra.tex


def tex(mat: str, P: np.ndarray, n: np.ndarray) -> np.ndarray:
    X, Y, Z = P[:, 0], P[:, 1], P[:, 2]
    nf = ra.vnoise(X / 1.1 + Z * 0.7, Y / 1.1 - Z * 0.5, 7)
    nm = ra.fbm(X / 6 + Z * 0.2, Y / 6 + Z * 0.3, 9, 3)

    def base(h):
        return np.broadcast_to(rgb(h), (len(X), 3)).copy()

    if mat == "slab":
        # Poured pad in four panels, the Armory's pale concrete.
        c = base("#aeb5a6") * (0.9 + 0.12 * nm[:, None]) * (0.96 + 0.06 * nf[:, None])
        joint = (np.abs(X - CX) < 0.25) | (np.abs(Y - CY) < 0.25)
        if abs(n[2]) > 0.7:
            c[joint] *= 0.72
        return c
    if mat == "olive":
        c = base("#4d5a3a") * (0.9 + 0.14 * nm[:, None]) * (0.95 + 0.08 * nf[:, None])
        rust = ra.smooth(0.7, 0.9, ra.fbm(X / 3, Y / 3 + Z, 21))
        return ra.mix(c, base("#6b4a30"), rust * 0.35)
    if mat == "olive_dark":
        return base("#3a4430") * (0.9 + 0.14 * nm[:, None])
    if mat == "gun":
        return base("#2c2d2a") * (0.9 + 0.18 * nf[:, None])
    if mat == "muzzle":
        return base("#161512")
    if mat == "dome":
        # Radome: off-white, weathered toward the base.
        c = base("#cdc8b4") * (0.92 + 0.1 * nm[:, None])
        return c * (1 - 0.18 * ra.smooth(GUN_Z + 6, GUN_Z + 2, Z))[:, None]
    if mat == "hazard":
        stripe = np.floor((X + Y + Z) / 1.4) % 2 == 0
        c = base("#1d1a14")
        c[stripe] = rgb("#d4a017")
        return c
    if mat == "ammo":
        c = base("#5a6440") * (0.88 + 0.2 * nf[:, None])
        c[np.mod(Z, 1.5) < 0.22] *= 0.7
        return c
    return _base_tex(mat, P, n)


ra.tex = tex


# ---------------------------------------------------------------- meshes


def base_mesh(slab: bool = True) -> ra.Mesh:
    m = ra.Mesh()
    # Pad, and a thin raised curb on it.
    if slab:
        m.box((0.6, 0.6, 0), (W - 0.6, H - 0.6, 1.0), "slab")
    # Sandbag lip on the two back edges; the front stays open for the truck.
    ra.sandbag_wall(m, 1.2, 1.2, W - 1.2, 4.0, 3.2)
    ra.sandbag_wall(m, 1.2, 4.0, 4.0, H - 8.0, 3.2)
    # Plinth: octagonal steel drum with a hazard band, bolted to the pad.
    m.cyl((CX, CY, 1.0), (CX, CY, PLINTH_TOP - 0.8), 5.2, 4.8, "olive", n=8)
    m.cyl((CX, CY, PLINTH_TOP - 0.8), (CX, CY, PLINTH_TOP), 4.8, 4.8, "hazard", n=8)
    # Ready-round boxes and the feed cable run, front-right corner.
    m.box((W - 9.0, H - 7.0, 1.0), (W - 3.0, H - 3.4, 3.6), "ammo")
    m.box((W - 8.4, H - 6.6, 3.6), (W - 3.6, H - 3.8, 4.1), "olive_dark", part=False)
    m.box((W - 7.5, H - 12.0, 1.0), (W - 3.6, H - 8.2, 3.0), "ammo")
    m.box((4.5, H - 6.5, 1.0), (8.5, H - 3.0, 2.6), "crate")
    return m


def gun_mesh(yaw: float) -> ra.Mesh:
    """Traversing part in local frame (x forward), yawed about the plinth centre."""
    c, s = math.cos(yaw), math.sin(yaw)
    k = GUN_SCALE

    def w(p):
        x, y, z = p
        x, y, z = x * k, y * k, PLINTH_TOP + (z - PLINTH_TOP) * k
        return (CX + x * c - y * s, CY + x * s + y * c, z)

    m = ra.Mesh()

    def box(lo, hi, mat, part=True):
        x0, y0, z0 = lo
        x1, y1, z1 = hi
        if part:
            m.new_part()
        corners = [(x, y, z) for z in (z0, z1) for y in (y0, y1) for x in (x0, x1)]
        p = [m.v(w(q)) for q in corners]
        m.quad(p[0], p[1], p[3], p[2], mat)
        m.quad(p[4], p[5], p[7], p[6], mat)
        m.quad(p[0], p[1], p[5], p[4], mat)
        m.quad(p[2], p[3], p[7], p[6], mat)
        m.quad(p[0], p[2], p[6], p[4], mat)
        m.quad(p[1], p[3], p[7], p[5], mat)

    def cyl(a, b, r0, r1, mat, n=12, part=True):
        m.cyl(w(a), w(b), r0 * k, r1 * k, mat, n=n, part=part)

    # Turntable ring (team-tint gray) and the yoke.
    cyl((0, 0, PLINTH_TOP), (0, 0, PLINTH_TOP + 1.3), 4.4, 4.4, "team", n=12)
    box((-2.2, -3.6, PLINTH_TOP + 1.3), (2.2, -2.4, GUN_Z + 1.2), "olive")
    box((-2.2, 2.4, PLINTH_TOP + 1.3), (2.2, 3.6, GUN_Z + 1.2), "olive")
    # Gatling body between the yoke arms, drum feed at the back.
    box((-3.6, -2.4, GUN_Z - 1.6), (3.2, 2.4, GUN_Z + 1.4), "olive_dark")
    cyl((-5.6, 0, GUN_Z - 1.0), (-3.4, 0, GUN_Z - 1.0), 2.2, 2.2, "ammo", n=10)
    # Barrel cluster: a shroud, then six barrels, then the muzzle clamp.
    cyl((3.2, 0, GUN_Z), (5.4, 0, GUN_Z), 1.7, 1.6, "gun", n=10)
    for i in range(6):
        a = i * math.pi / 3
        oy, oz = 0.8 * math.cos(a), 0.8 * math.sin(a)
        cyl((5.2, oy, GUN_Z + oz), (13.2, oy, GUN_Z + oz), 0.36, 0.34, "gun", n=6)
    cyl((12.4, 0, GUN_Z), (13.4, 0, GUN_Z), 1.35, 1.35, "gun", n=10)
    cyl((13.4, 0, GUN_Z), (13.6, 0, GUN_Z), 0.9, 0.9, "muzzle", n=10)
    # Radome on top of the body, the white "R2-D2" can, and its fire-control box.
    cyl((-0.4, 0, GUN_Z + 1.4), (-0.4, 0, GUN_Z + 6.2), 3.0, 2.9, "dome", n=14)
    cyl((-0.4, 0, GUN_Z + 6.2), (-0.4, 0, GUN_Z + 8.0), 2.9, 1.4, "dome", n=14, part=False)
    box((-3.4, -1.1, GUN_Z + 2.0), (-2.4, 1.1, GUN_Z + 4.6), "olive_dark")
    return m


# ---------------------------------------------------------------- render


def make_canvas() -> ra.Canvas:
    k = ra.ZOOM * SS
    left = -(H + SIDE_MARGIN) * k
    right = (W + SIDE_MARGIN) * k
    top = -TOP_MARGIN * k
    bottom = ((W + H) * 0.5 + SIDE_MARGIN) * k
    w = int(math.ceil((right - left) / SS)) * SS
    h = int(math.ceil((bottom - top) / SS)) * SS
    return ra.Canvas(w, h, -left, -top)


def yaw_for_row(row: int) -> float:
    """World yaw whose 2:1 projection points at screen angle south + row·22.5° (y down)."""
    phi = math.radians(90.0 + row * 22.5)
    u, v = math.cos(phi), math.sin(phi)
    # Screen (u, v) = (a - b, (a + b) / 2) for world direction (a, b).
    return math.atan2(v - u / 2, v + u / 2)


def layer(mesh: ra.Mesh, cv: ra.Canvas) -> Image.Image:
    fr = ra.rasterize(mesh, cv)
    ra.ink(fr, SS)
    ra.silhouette(fr, SS)
    return ra.downsample(fr.color, fr.alpha, SS)


def render(out_dir: Path) -> None:
    cv = make_canvas()
    print("canvas", cv.w // SS, "x", cv.h // SS)

    bm = base_mesh()
    # Cast shadow of the base and of a gun pointed along the diagonal, baked on the pad and the grass.
    props = base_mesh(slab=False)
    sh = np.clip(ra.shadow_mask(props, cv) + 0.6 * ra.shadow_mask(gun_mesh(yaw_for_row(14)), cv), 0, 1)
    ao = ra.contact_ao(props, cv)
    fr = ra.rasterize(bm, cv)
    ra.ink(fr, SS)
    ra.silhouette(fr, SS)
    # Shadow only where it falls on the pad or right around it.
    ys, xs = np.mgrid[0 : cv.h, 0 : cv.w].astype(np.float64) + 0.5
    gx, gy = cv.to_world_ground(xs, ys)
    near = (gx > -3) & (gx < W + 3) & (gy > -3) & (gy < H + 3)
    shadow = np.clip(sh * 0.42 + ao * 0.12, 0, 0.6) * near
    solid = fr.alpha > 0.5
    up = solid & (fr.normal[..., 2] > 0.7)
    color = fr.color.copy()
    # Up-facing surfaces under the shadow darken; off the model it is a translucent dark on the grass.
    color[up] *= (1 - shadow[up])[:, None]
    alpha = fr.alpha.copy()
    out = ~solid & (shadow > 0.02)
    color[out] = ra.OUTLINE * 0.4
    alpha[out] = shadow[out]
    base_img = ra.downsample(color, alpha, SS)

    rows = [layer(gun_mesh(yaw_for_row(r)), cv) for r in range(DIRS)]
    cw, ch = base_img.size
    sheet = Image.new("RGBA", (cw, ch * DIRS), (0, 0, 0, 0))
    for r, img in enumerate(rows):
        sheet.paste(img, (0, r * ch))

    out_dir.mkdir(parents=True, exist_ok=True)
    base_img.save(out_dir / "ciws.png", optimize=True)
    sheet.save(out_dir / "ciws-turret.png", optimize=True)

    south = cv.to_screen(np.array([[W, H, 0.0]]))
    stack = cv.to_screen(np.array([[CX, CY, GUN_Z + 10.0]]))
    info = {
        "padWidth": round((W + H) * ra.ZOOM, 1),
        "padSouthX": round(float(south[0][0]) / SS, 1),
        "padSouthY": round(float(south[1][0]) / SS, 1),
        "stackX": round(float(stack[0][0]) / SS, 1),
        "stackY": round(float(stack[1][0]) / SS, 1),
        "cell": [cw, ch],
        "rows": DIRS,
        "order": ENGINE_ORDER,
    }
    (out_dir / "ciws.json").write_text(json.dumps(info, indent=2) + "\n")
    print("wrote", out_dir / "ciws.png", out_dir / "ciws-turret.png", info)

    # Cameo: base plus the gun laid south-east, toward the viewer's right.
    both = base_img.copy()
    both.alpha_composite(rows[14])
    cam = Image.new("RGBA", (96, 96), (0, 0, 0, 0))
    bb = both.getbbox()
    if bb:
        crop = both.crop(bb)
        f = min(92 / crop.width, 92 / crop.height)
        crop = crop.resize((max(1, round(crop.width * f)), max(1, round(crop.height * f))), Image.Resampling.LANCZOS)
        cam.alpha_composite(crop, ((96 - crop.width) // 2, (96 - crop.height) // 2))
    cam.save(out_dir / "ciws-cameo.png")

    # Preview: 16 labeled cells on grass, base + gun, in engine row order.
    preview = Path(__file__).parent / "preview"
    preview.mkdir(exist_ok=True)
    strip = Image.new("RGBA", (cw * 8, (ch + 14) * 2), (74, 107, 50, 255))
    dr = ImageDraw.Draw(strip)
    for r, img in enumerate(rows):
        cell = base_img.copy()
        cell.alpha_composite(img)
        x = (r % 8) * cw
        y = (r // 8) * (ch + 14)
        strip.alpha_composite(cell, (x, y + 14))
        dr.text((x + 4, y + 1), f"{r} {ENGINE_ORDER[r]}", fill=(240, 232, 210, 255))
    strip.save(preview / "ciws-strip.png")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True, help="buildings asset folder")
    args = ap.parse_args()
    render(Path(args.out))


if __name__ == "__main__":
    main()
