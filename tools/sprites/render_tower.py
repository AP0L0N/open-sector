#!/usr/bin/env python3
"""Watch Tower building art: a fortified concrete lookout, one static image.

A square plinth banked with earth, a battered board-formed shaft, and a
slitted concrete cab on top under an overhanging roof slab, with a range
mast and a lamp. Sandbags ring the foot and the rear door. The tower is the
same from every side, so it ships a single cardinal image, like the Bunker.

Look: the Bunker's inked structure style (render_bunker.py materials on the
render_airfield.py mesh, raster, ink, silhouette, key light, and cast
shadow), at the same 3x zoom, so its t(2) footprint is the same 384 px pad.

  python tools/sprites/render_tower.py --out gridlock/packages/client/src/assets/buildings
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image

import render_bunker as rb

ra = rb.ra

# Footprint, world px: t(2) x t(2) gameplay tiles. Must match catalog.ts.
W = H = rb.W
CX, CY = rb.CX, rb.CY
SS = ra.SS
TOP_MARGIN = 78.0
SIDE_MARGIN = 36.0

BERM_R0 = 27.0
BERM_R1 = 21.0
BERM_TOP = 3.0
PLINTH_R = 19.0
PLINTH_TOP = 5.0
SHAFT_R0 = 13.0
SHAFT_R1 = 10.0
CAB_Z0 = 46.0
CAB_R = 14.5
CAB_Z1 = 57.0
SLIT_Z0 = 50.2
SLIT_Z1 = 53.2
ROOF_R = 17.0
ROOF_TOP = 59.4
MAST_TOP = 71.0


def square(r: float, cx: float = CX, cy: float = CY) -> list[tuple[float, float]]:
    """Faces N, E, S, W; the same winding as the Bunker's octagon."""
    return [(cx + r, cy + r), (cx - r, cy + r), (cx - r, cy - r), (cx + r, cy - r)]


def cab_slit(m: ra.Mesh, axis: str, sign: float, width: float) -> None:
    """A dark slit centred on one face of the cab, a hair proud of the wall."""
    o = CAB_R + 0.08
    h = width / 2
    if axis == "x":
        x = CX + sign * o
        q = [(x, CY - h, SLIT_Z0), (x, CY + h, SLIT_Z0), (x, CY + h, SLIT_Z1), (x, CY - h, SLIT_Z1)]
    else:
        y = CY + sign * o
        q = [(CX - h, y, SLIT_Z0), (CX + h, y, SLIT_Z0), (CX + h, y, SLIT_Z1), (CX - h, y, SLIT_Z1)]
    m.new_part()
    ids = [m.v(p) for p in q]
    m.quad(ids[0], ids[1], ids[2], ids[3], "slit")


def tower_mesh(ground: bool = True) -> ra.Mesh:
    m = ra.Mesh()
    if ground:
        rb.prism(m, rb.octagon(BERM_R0), rb.octagon(BERM_R1), 0.0, BERM_TOP, "berm")
    # Plinth and the battered shaft on it.
    rb.prism(m, square(PLINTH_R), square(PLINTH_R - 1.2), 0.0, PLINTH_TOP, "casemate", top="slab")
    rb.prism(m, square(SHAFT_R0), square(SHAFT_R1), PLINTH_TOP, CAB_Z0, "casemate")
    # Corbel under the cab, the cab, and its slits all round.
    rb.prism(m, square(SHAFT_R1), square(CAB_R), CAB_Z0 - 3.0, CAB_Z0, "slab")
    rb.prism(m, square(CAB_R), square(CAB_R), CAB_Z0, CAB_Z1, "casemate", part=False)
    for axis in ("x", "y"):
        for sign in (-1.0, 1.0):
            cab_slit(m, axis, sign, 17.0)
    # Roof slab overhanging the slits, and a low lip of sandbags on it.
    rb.prism(m, square(ROOF_R), square(ROOF_R), CAB_Z1, ROOF_TOP - 0.8, "slab")
    rb.prism(m, square(ROOF_R), square(ROOF_R - 0.6), ROOF_TOP - 0.8, ROOF_TOP, "slab", top="roof", part=False)
    lo, hi = CX - ROOF_R + 1.0, CX + ROOF_R - 1.0
    for x0, y0, x1, y1 in (
        (lo, lo, hi, lo + 2.2),
        (lo, lo + 2.2, lo + 2.2, hi),
    ):
        m.new_part()
        m.box((x0, y0, ROOF_TOP), (x1, y1, ROOF_TOP + 1.6), "sandbag", part=False)
    # Range mast and a lamp on a bracket.
    m.cyl((CX + 6.0, CY + 6.0, ROOF_TOP), (CX + 6.0, CY + 6.0, MAST_TOP), 0.45, 0.35, "steel", n=8)
    m.box((CX + 3.5, CY + 5.8, MAST_TOP - 3.0), (CX + 8.5, CY + 6.2, MAST_TOP - 2.5), "steel", part=False)
    m.box((CX - 7.0, CY + 5.0, ROOF_TOP), (CX - 5.4, CY + 6.6, ROOF_TOP + 2.6), "steel")
    m.cyl((CX - 6.2, CY + 5.8, ROOF_TOP + 3.4), (CX - 4.2, CY + 7.8, ROOF_TOP + 3.4), 1.3, 1.1, "metal", n=10)
    # Iron rungs up the east face.
    for k in range(12):
        z = PLINTH_TOP + 2.0 + k * 3.3
        f = (z - PLINTH_TOP) / (CAB_Z0 - PLINTH_TOP)
        x = CX + SHAFT_R0 + (SHAFT_R1 - SHAFT_R0) * f + 0.15
        m.box((x, CY - 2.2, z), (x + 0.6, CY + 2.2, z + 0.4), "steel")
    # Rear door in a stub wall, with bags by it and at the front of the plinth.
    m.box((CX - PLINTH_R - 3.5, CY - 7.0, 0.0), (CX - PLINTH_R + 0.5, CY - 4.8, 9.0), "casemate")
    m.box((CX - PLINTH_R - 1.0, CY - 4.8, 0.0), (CX - PLINTH_R + 0.4, CY + 2.0, 7.6), "door")
    ra.sandbag_wall(m, CX - PLINTH_R - 7.0, CY + 4.0, CX - PLINTH_R - 3.4, CY + 13.0, 2.8)
    ra.sandbag_wall(m, CX + 6.0, CY + PLINTH_R + 3.0, CX + 16.0, CY + PLINTH_R + 6.0, 2.4)
    ra.sandbag_wall(m, CX + PLINTH_R + 3.0, CY - 12.0, CX + PLINTH_R + 6.0, CY - 2.0, 2.4)
    return m


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
    mesh = tower_mesh()
    props = tower_mesh(ground=False)
    sh = ra.shadow_mask(props, cv)
    ao = ra.contact_ao(props, cv)
    fr = ra.rasterize(mesh, cv)
    ra.ink(fr, SS)
    ra.silhouette(fr, SS)
    ys, xs = np.mgrid[0 : cv.h, 0 : cv.w].astype(np.float64) + 0.5
    gx, gy = cv.to_world_ground(xs, ys)
    # The tall shaft throws its shadow well off the pad.
    near = (gx > -40) & (gx < W + 40) & (gy > -40) & (gy < H + 40)
    shadow = np.clip(sh * 0.42 + ao * 0.12, 0, 0.6) * near
    solid = fr.alpha > 0.5
    zpix = (fr.depth - (gx + gy)) / 3.0
    up = solid & (fr.normal[..., 2] > 0.7) & (zpix < PLINTH_TOP + 0.5)
    color = fr.color.copy()
    color[up] *= (1 - shadow[up])[:, None]
    alpha = fr.alpha.copy()
    out = ~solid & (shadow > 0.02)
    color[out] = ra.OUTLINE * 0.4
    alpha[out] = shadow[out]
    img = ra.downsample(color, alpha, SS)

    out_dir.mkdir(parents=True, exist_ok=True)
    img.save(out_dir / "tower.png", optimize=True)

    south = cv.to_screen(np.array([[W, H, 0.0]]))
    stack = cv.to_screen(np.array([[CX, CY, ROOF_TOP + 6.0]]))
    info = {
        "padWidth": round((W + H) * ra.ZOOM, 1),
        "padSouthX": round(float(south[0][0]) / SS, 1),
        "padSouthY": round(float(south[1][0]) / SS, 1),
        "stackX": round(float(stack[0][0]) / SS, 1),
        "stackY": round(float(stack[1][0]) / SS, 1),
        "cell": list(img.size),
    }
    (out_dir / "tower.json").write_text(json.dumps(info, indent=2) + "\n")
    print("wrote", out_dir / "tower.png", info)

    # The sidebar shows a wide band through the cameo's middle, so centre it on the cab:
    # a square as wide as the tower body, from the roof down, leaving the shaft's foot out.
    cam = Image.new("RGBA", (96, 96), (0, 0, 0, 0))
    body = Image.fromarray(((np.asarray(img)[..., 3] > 200) * 255).astype(np.uint8)).getbbox()
    if body:
        side = body[2] - body[0]
        cab = cv.to_screen(np.array([[CX, CY, (SLIT_Z0 + SLIT_Z1) / 2]]))
        cy = int(float(cab[1][0]) / SS)
        top = max(0, cy - side // 2)
        crop = img.crop((body[0], top, body[2], top + side))
        f = min(92 / crop.width, 92 / crop.height)
        crop = crop.resize((max(1, round(crop.width * f)), max(1, round(crop.height * f))), Image.Resampling.LANCZOS)
        cam.alpha_composite(crop, ((96 - crop.width) // 2, (96 - crop.height) // 2))
    cam.save(out_dir / "tower-cameo.png")

    preview = Path(__file__).parent / "preview"
    preview.mkdir(exist_ok=True)
    bg = Image.new("RGBA", img.size, (74, 107, 50, 255))
    bg.alpha_composite(img)
    bg.save(preview / "tower.png")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True, help="buildings asset folder")
    args = ap.parse_args()
    render(Path(args.out))


if __name__ == "__main__":
    main()
