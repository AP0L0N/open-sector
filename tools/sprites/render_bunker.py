#!/usr/bin/env python3
"""Bunker building art: a low reinforced-concrete pillbox, one static image.

An octagonal board-formed casemate with a dark firing slit in every face,
a thick roof slab that overhangs the slits, sod over the roof, an earth
berm banked against the walls, and a few sandbags by the rear door.
Buildings stay one image per facing; this one is the same from every side,
so it ships a single cardinal image.

Look: the inked structure style of render_airfield.py (same mesh, raster,
ink, silhouette, key light, and cast shadow), at the 3x source zoom of the
Armory and Dynamo, so a t(2) footprint is the same 384 px pad they use.

  python tools/sprites/render_bunker.py --out gridlock/packages/client/src/assets/buildings
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image

import render_airfield as ra

# Footprint, world px: t(2) x t(2) gameplay tiles. Must match catalog.ts.
W = H = 64.0
CX, CY = W / 2, H / 2
ra.ZOOM = 3.0
SS = ra.SS
TOP_MARGIN = 24.0
SIDE_MARGIN = 10.0

WALL_TOP = 12.0
ROOF_TOP = 14.4
SLIT_Z0 = 6.2
SLIT_Z1 = 8.6
BODY_R = 20.0  # half-width across the flats
ROOF_R = 21.8
BERM_R0 = 27.0
BERM_R1 = 21.0
BERM_TOP = 3.2
SOD_TOP = 17.0


def rgb(h: str) -> np.ndarray:
    return ra.rgb(h)


_base_tex = ra.tex


def tex(mat: str, P: np.ndarray, n: np.ndarray) -> np.ndarray:
    X, Y, Z = P[:, 0], P[:, 1], P[:, 2]
    nf = ra.vnoise(X / 1.1 + Z * 0.7, Y / 1.1 - Z * 0.5, 7)
    nm = ra.fbm(X / 6 + Z * 0.2, Y / 6 + Z * 0.3, 9, 3)
    side_u = X if abs(n[1]) >= abs(n[0]) else Y

    def base(h):
        return np.broadcast_to(rgb(h), (len(X), 3)).copy()

    if mat == "casemate":
        # Poured in board forms: faint horizontal lift lines and water streaks.
        c = base("#9d9b8c") * (0.9 + 0.12 * nm[:, None]) * (0.95 + 0.07 * nf[:, None])
        c[np.mod(Z, 1.5) < 0.16] *= 0.86
        streak = ra.smooth(0.66, 0.9, ra.vnoise(side_u / 1.4, Z / 9, 23)) * 0.16
        grime = ra.smooth(3.5, 0.0, Z) * 0.22
        return c * (1 - streak - grime)[:, None]
    if mat == "slab":
        c = base("#aaa899") * (0.9 + 0.12 * nm[:, None]) * (0.96 + 0.06 * nf[:, None])
        chip = ra.smooth(0.74, 0.92, ra.fbm(X / 2.5 + Z, Y / 2.5, 29)) * 0.2
        return c * (1 - chip)[:, None]
    if mat == "sod":
        grass = ra.mix(base("#56683a"), base("#6f7f44"), nm)
        dirt = base("#6a5638") * (0.9 + 0.15 * nf[:, None])
        return ra.mix(grass, dirt, ra.smooth(0.55, 0.8, ra.fbm(X / 4, Y / 4, 31)) * 0.55) * (
            0.92 + 0.12 * nf[:, None]
        )
    if mat == "roof":
        # Concrete with windblown dirt and a few tufts in the low spots.
        c = base("#a3a193") * (0.9 + 0.12 * nm[:, None]) * (0.96 + 0.06 * nf[:, None])
        patch = ra.smooth(0.56, 0.78, ra.fbm(X / 5, Y / 5, 37))
        grass = ra.mix(base("#5e6c3c"), base("#6a5a3a"), nf)
        return ra.mix(c, grass, patch * 0.8)
    if mat == "berm":
        c = ra.mix(base("#6c5a3b"), base("#58663a"), ra.smooth(BERM_TOP * 0.3, BERM_TOP, Z) * 0.7 + nm * 0.2)
        return c * (0.9 + 0.15 * nf[:, None])
    if mat == "slit":
        return base("#12110e") * (0.85 + 0.2 * nf[:, None])
    if mat == "door":
        c = base("#44493a") * (0.9 + 0.14 * nm[:, None])
        rust = ra.smooth(0.6, 0.85, ra.fbm(side_u / 2, Z / 2, 17))
        return ra.mix(c, base("#6b4a30"), rust * 0.45)
    return _base_tex(mat, P, n)


ra.tex = tex


# ---------------------------------------------------------------- meshes


def octagon(r: float, cx: float = CX, cy: float = CY) -> list[tuple[float, float]]:
    """Flats face the axes: N, E, S, W and the four diagonals."""
    k = r / math.cos(math.pi / 8)
    return [
        (cx + k * math.cos(math.pi / 8 + i * math.pi / 4), cy + k * math.sin(math.pi / 8 + i * math.pi / 4))
        for i in range(8)
    ]


def prism(m: ra.Mesh, lo: list, hi: list, z0: float, z1: float, mat: str, top: str | None = None, part=True) -> None:
    """Ring lo at z0 to ring hi at z1 (a frustum when the rings differ), capped."""
    if part:
        m.new_part()
    a = [m.v((x, y, z0)) for x, y in lo]
    b = [m.v((x, y, z1)) for x, y in hi]
    n = len(a)
    for i in range(n):
        j = (i + 1) % n
        m.quad(a[i], a[j], b[j], b[i], mat)
    for i in range(1, n - 1):
        m.tri(b[0], b[i], b[i + 1], top or mat)


def face_slit(m: ra.Mesh, p0, p1, r_out: float, width: float) -> None:
    """A dark slit on the flat from p0 to p1, a hair proud of the wall."""
    mx, my = (p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2
    nx, ny = mx - CX, my - CY
    ln = math.hypot(nx, ny)
    nx, ny = nx / ln, ny / ln
    tx, ty = p1[0] - p0[0], p1[1] - p0[1]
    tl = math.hypot(tx, ty)
    tx, ty = tx / tl, ty / tl
    ox, oy = mx + nx * r_out, my + ny * r_out
    h = width / 2
    q = [
        (ox - tx * h, oy - ty * h, SLIT_Z0),
        (ox + tx * h, oy + ty * h, SLIT_Z0),
        (ox + tx * h, oy + ty * h, SLIT_Z1),
        (ox - tx * h, oy - ty * h, SLIT_Z1),
    ]
    m.new_part()
    ids = [m.v(p) for p in q]
    m.quad(ids[0], ids[1], ids[2], ids[3], "slit")


def bunker_mesh(ground: bool = True) -> ra.Mesh:
    m = ra.Mesh()
    body = octagon(BODY_R)
    if ground:
        # Earth banked against the walls up to just under the slits.
        prism(m, octagon(BERM_R0), octagon(BERM_R1), 0.0, BERM_TOP, "berm")
    prism(m, body, body, 0.0, WALL_TOP, "casemate")
    for i in range(8):
        # The rear (north-west) flat is the door, not a slit.
        p0, p1 = body[i], body[(i + 1) % 8]
        mid = math.atan2((p0[1] + p1[1]) / 2 - CY, (p0[0] + p1[0]) / 2 - CX)
        if abs(math.degrees(mid) - (-135)) < 5:
            continue
        face_slit(m, p0, p1, 0.08, 9.0)
    # Roof slab overhanging the slits, and the sod piled on it.
    prism(m, octagon(ROOF_R), octagon(ROOF_R), WALL_TOP, ROOF_TOP - 1.0, "slab", part=False)
    prism(m, octagon(ROOF_R), octagon(ROOF_R), ROOF_TOP - 1.0, ROOF_TOP, "slab", part=False)
    prism(m, octagon(ROOF_R - 1.0), octagon(ROOF_R - 3.4), ROOF_TOP, ROOF_TOP + 1.2, "slab", top="roof")
    prism(m, octagon(ROOF_R - 8.0), octagon(ROOF_R - 9.6), ROOF_TOP + 1.2, SOD_TOP, "slab", top="roof")
    # Periscope / vent pipe and its cowl.
    m.cyl((CX - 5.0, CY - 4.0, SOD_TOP - 0.6), (CX - 5.0, CY - 4.0, SOD_TOP + 3.0), 0.9, 0.9, "steel", n=10)
    m.box((CX - 6.4, CY - 5.4, SOD_TOP + 3.0), (CX - 3.6, CY - 2.6, SOD_TOP + 3.8), "metal", part=False)
    # Rear door in a stub wall, and a few bags stacked by it.
    m.box((CX - BODY_R - 4.0, CY - 8.0, 0.0), (CX - BODY_R + 0.5, CY - 5.6, WALL_TOP - 1.0), "casemate")
    m.box((CX - BODY_R - 1.2, CY - 5.6, 0.0), (CX - BODY_R + 0.4, CY + 2.0, WALL_TOP - 2.4), "door")
    ra.sandbag_wall(m, CX - BODY_R - 8.0, CY + 4.0, CX - BODY_R - 4.0, CY + 14.0, 3.0)
    ra.sandbag_wall(m, CX + 8.0, CY + BODY_R + 4.0, CX + 16.0, CY + BODY_R + 7.0, 2.4)
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


def render(out_dir: Path) -> None:
    cv = make_canvas()
    print("canvas", cv.w // SS, "x", cv.h // SS)
    mesh = bunker_mesh()
    props = bunker_mesh(ground=False)
    sh = ra.shadow_mask(props, cv)
    ao = ra.contact_ao(props, cv)
    fr = ra.rasterize(mesh, cv)
    ra.ink(fr, SS)
    ra.silhouette(fr, SS)
    ys, xs = np.mgrid[0 : cv.h, 0 : cv.w].astype(np.float64) + 0.5
    gx, gy = cv.to_world_ground(xs, ys)
    near = (gx > -4) & (gx < W + 4) & (gy > -4) & (gy < H + 4)
    shadow = np.clip(sh * 0.42 + ao * 0.12, 0, 0.6) * near
    solid = fr.alpha > 0.5
    # Height of each drawn pixel: to_world_ground reads X+Y-2Z, the depth buffer X+Y+Z.
    zpix = (fr.depth - (gx + gy)) / 3.0
    up = solid & (fr.normal[..., 2] > 0.7) & (zpix < BERM_TOP + 0.5)
    color = fr.color.copy()
    color[up] *= (1 - shadow[up])[:, None]
    alpha = fr.alpha.copy()
    out = ~solid & (shadow > 0.02)
    color[out] = ra.OUTLINE * 0.4
    alpha[out] = shadow[out]
    img = ra.downsample(color, alpha, SS)

    out_dir.mkdir(parents=True, exist_ok=True)
    img.save(out_dir / "bunker.png", optimize=True)

    south = cv.to_screen(np.array([[W, H, 0.0]]))
    stack = cv.to_screen(np.array([[CX, CY, SOD_TOP + 6.0]]))
    info = {
        "padWidth": round((W + H) * ra.ZOOM, 1),
        "padSouthX": round(float(south[0][0]) / SS, 1),
        "padSouthY": round(float(south[1][0]) / SS, 1),
        "stackX": round(float(stack[0][0]) / SS, 1),
        "stackY": round(float(stack[1][0]) / SS, 1),
        "cell": list(img.size),
    }
    (out_dir / "bunker.json").write_text(json.dumps(info, indent=2) + "\n")
    print("wrote", out_dir / "bunker.png", info)

    cam = Image.new("RGBA", (96, 96), (0, 0, 0, 0))
    bb = img.getbbox()
    if bb:
        crop = img.crop(bb)
        f = min(92 / crop.width, 92 / crop.height)
        crop = crop.resize((max(1, round(crop.width * f)), max(1, round(crop.height * f))), Image.Resampling.LANCZOS)
        cam.alpha_composite(crop, ((96 - crop.width) // 2, (96 - crop.height) // 2))
    cam.save(out_dir / "bunker-cameo.png")

    preview = Path(__file__).parent / "preview"
    preview.mkdir(exist_ok=True)
    bg = Image.new("RGBA", img.size, (74, 107, 50, 255))
    bg.alpha_composite(img)
    bg.save(preview / "bunker.png")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True, help="buildings asset folder")
    args = ap.parse_args()
    render(Path(args.out))


if __name__ == "__main__":
    main()
