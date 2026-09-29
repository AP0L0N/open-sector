#!/usr/bin/env python3
"""RAM building art: the CIWS pad, and a 16-row traversing rocket launcher.

Same canvas, camera, pad, ink, and row rule as render_ciws.py, so the RAM sits
on the CIWS's BuildingSpriteDef metrics and reads as its sibling. Only the
traversing part differs: a squat box launcher with a 7×3 face of rocket cells,
on the same turntable and yoke, with a small sensor can on the left cheek.

Rows are south-first, clockwise (engine order). Row k projects the cell face
to screen south + k·22.5°.

  python tools/sprites/render_ram.py --out gridlock/packages/client/src/assets/buildings
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

import render_airfield as ra
import render_ciws as rc

W, H, CX, CY = rc.W, rc.H, rc.CX, rc.CY
SS = ra.SS
DIRS = rc.DIRS
ENGINE_ORDER = rc.ENGINE_ORDER
PLINTH_TOP = rc.PLINTH_TOP
# Launcher trunnion height, and the cell face's reach forward of the plinth centre.
LAUNCH_Z = 9.0
FACE_X = 5.2
GUN_SCALE = rc.GUN_SCALE

_ciws_tex = ra.tex


def tex(mat: str, P: np.ndarray, n: np.ndarray) -> np.ndarray:
    X, Y, Z = P[:, 0], P[:, 1], P[:, 2]
    if mat == "launcher":
        # Navy haze gray over the pad's olive: the box reads apart from the CIWS at a glance.
        nm = ra.fbm(X / 6 + Z * 0.2, Y / 6 + Z * 0.3, 9, 3)
        nf = ra.vnoise(X / 1.1 + Z * 0.7, Y / 1.1 - Z * 0.5, 7)
        c = np.broadcast_to(rc.rgb("#8d9496"), (len(X), 3)).copy()
        c *= (0.9 + 0.12 * nm[:, None]) * (0.95 + 0.07 * nf[:, None])
        # Panel seams every 2.4 units along the box.
        seam = np.mod(Z, 2.4) < 0.18
        c[seam] *= 0.82
        return c
    if mat == "cell":
        # Frangible cell covers: pale, each one just darker at its rim.
        return np.broadcast_to(rc.rgb("#c9c2a8"), (len(X), 3)).copy()
    return _ciws_tex(mat, P, n)


ra.tex = tex


def launcher_mesh(yaw: float) -> ra.Mesh:
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

    # Turntable ring (team-tint gray) and the yoke, as on the CIWS.
    cyl((0, 0, PLINTH_TOP), (0, 0, PLINTH_TOP + 1.3), 4.4, 4.4, "team", n=12)
    box((-2.0, -4.6, PLINTH_TOP + 1.3), (1.6, -3.6, LAUNCH_Z + 0.6), "olive")
    box((-2.0, 3.6, PLINTH_TOP + 1.3), (1.6, 4.6, LAUNCH_Z + 0.6), "olive")
    # The launcher box: 21 cells, 7 across and 3 high, between the yoke arms.
    z0, z1 = LAUNCH_Z - 2.4, LAUNCH_Z + 2.8
    box((-5.2, -3.5, z0), (FACE_X, 3.5, z1), "launcher")
    # Blast shroud lip round the face.
    box((FACE_X, -3.7, z0 - 0.2), (FACE_X + 0.5, 3.7, z0 + 0.3), "olive_dark")
    box((FACE_X, -3.7, z1 - 0.3), (FACE_X + 0.5, 3.7, z1 + 0.2), "olive_dark")
    box((FACE_X, -3.7, z0), (FACE_X + 0.5, -3.3, z1), "olive_dark", part=False)
    box((FACE_X, 3.3, z0), (FACE_X + 0.5, 3.7, z1), "olive_dark", part=False)
    # Cell mouths: dark rims with pale frangible covers set just inside.
    for row in range(3):
        cz = z0 + (row + 0.5) * (z1 - z0) / 3
        for col in range(7):
            cy = -3.0 + col * 1.0
            cyl((FACE_X - 0.1, cy, cz), (FACE_X + 0.35, cy, cz), 0.46, 0.46, "muzzle", n=8)
            cyl((FACE_X + 0.2, cy, cz), (FACE_X + 0.3, cy, cz), 0.3, 0.3, "cell", n=8, part=False)
    # Sensor can on the left cheek, and the fire-control box behind the launcher.
    cyl((0.8, -4.9, LAUNCH_Z + 0.6), (0.8, -4.9, LAUNCH_Z + 3.4), 1.1, 1.0, "dome", n=10)
    cyl((0.8, -4.9, LAUNCH_Z + 3.4), (0.8, -4.9, LAUNCH_Z + 4.2), 1.0, 0.5, "dome", n=10, part=False)
    box((-6.6, -2.2, LAUNCH_Z - 1.6), (-5.2, 2.2, LAUNCH_Z + 1.6), "olive_dark")
    return m


def layer(mesh: ra.Mesh, cv: ra.Canvas) -> Image.Image:
    return rc.layer(mesh, cv)


def render(out_dir: Path) -> None:
    cv = rc.make_canvas()
    print("canvas", cv.w // SS, "x", cv.h // SS)

    bm = rc.base_mesh()
    props = rc.base_mesh(slab=False)
    sh = np.clip(ra.shadow_mask(props, cv) + 0.6 * ra.shadow_mask(launcher_mesh(rc.yaw_for_row(14)), cv), 0, 1)
    ao = ra.contact_ao(props, cv)
    fr = ra.rasterize(bm, cv)
    ra.ink(fr, SS)
    ra.silhouette(fr, SS)
    ys, xs = np.mgrid[0 : cv.h, 0 : cv.w].astype(np.float64) + 0.5
    gx, gy = cv.to_world_ground(xs, ys)
    near = (gx > -3) & (gx < W + 3) & (gy > -3) & (gy < H + 3)
    shadow = np.clip(sh * 0.42 + ao * 0.12, 0, 0.6) * near
    solid = fr.alpha > 0.5
    up = solid & (fr.normal[..., 2] > 0.7)
    color = fr.color.copy()
    color[up] *= (1 - shadow[up])[:, None]
    alpha = fr.alpha.copy()
    out = ~solid & (shadow > 0.02)
    color[out] = ra.OUTLINE * 0.4
    alpha[out] = shadow[out]
    base_img = ra.downsample(color, alpha, SS)

    rows = [layer(launcher_mesh(rc.yaw_for_row(r)), cv) for r in range(DIRS)]
    cw, ch = base_img.size
    sheet = Image.new("RGBA", (cw, ch * DIRS), (0, 0, 0, 0))
    for r, img in enumerate(rows):
        sheet.paste(img, (0, r * ch))

    out_dir.mkdir(parents=True, exist_ok=True)
    base_img.save(out_dir / "ram.png", optimize=True)
    sheet.save(out_dir / "ram-turret.png", optimize=True)

    south = cv.to_screen(np.array([[W, H, 0.0]]))
    stack = cv.to_screen(np.array([[CX, CY, rc.GUN_Z + 10.0]]))
    face = cv.to_screen(np.array([[CX, CY, PLINTH_TOP + (LAUNCH_Z - PLINTH_TOP) * GUN_SCALE]]))
    info = {
        "padWidth": round((W + H) * ra.ZOOM, 1),
        "padSouthX": round(float(south[0][0]) / SS, 1),
        "padSouthY": round(float(south[1][0]) / SS, 1),
        "stackX": round(float(stack[0][0]) / SS, 1),
        "stackY": round(float(stack[1][0]) / SS, 1),
        "launchZ": round(PLINTH_TOP + (LAUNCH_Z - PLINTH_TOP) * GUN_SCALE, 2),
        "faceReach": round(FACE_X * GUN_SCALE, 2),
        "faceY": round(float(face[1][0]) / SS, 1),
        "cell": [cw, ch],
        "rows": DIRS,
        "order": ENGINE_ORDER,
    }
    (out_dir / "ram.json").write_text(json.dumps(info, indent=2) + "\n")
    print("wrote", out_dir / "ram.png", out_dir / "ram-turret.png", info)

    # Cameo: base plus the launcher laid south-east, brightened a touch for the dark button.
    both = base_img.copy()
    both.alpha_composite(rows[14])
    cam = Image.new("RGBA", (96, 96), (0, 0, 0, 0))
    bb = both.getbbox()
    if bb:
        crop = both.crop(bb)
        f = min(92 / crop.width, 92 / crop.height)
        crop = crop.resize((max(1, round(crop.width * f)), max(1, round(crop.height * f))), Image.Resampling.LANCZOS)
        cam.alpha_composite(crop, ((96 - crop.width) // 2, (96 - crop.height) // 2))
    cam.save(out_dir / "ram-cameo.png")

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
    strip.save(preview / "ram-strip.png")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True, help="buildings asset folder")
    args = ap.parse_args()
    render(Path(args.out))


if __name__ == "__main__":
    main()
